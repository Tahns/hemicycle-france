// Tests de scripts/valider-brouillon.cjs (publier / rejeter un brouillon) dans un dépôt temporaire. USAGE : node tests/valider-brouillon.test.mjs
import assert from "assert";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { valider, Refus } = require("../scripts/valider-brouillon.cjs");
const { risque, choisir: choisirPublication } = require("../scripts/publier-stories.cjs");
const { dimensionsJpeg } = require("../scripts/stories-auto.cjs");

const now = new Date("2026-10-06T10:00:00Z"); // 12 h à Paris
const il_y_a = (h) => new Date(now.getTime() - h * 36e5).toISOString();

/** JPEG factice (assez long, bon en-tête, dimensions lues par dimensionsJpeg). */
function jpeg(l, h) {
  const b = Buffer.alloc(1500, 0);
  Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, l >> 8, l & 255, 0x03]).copy(b, 0);
  return b;
}
assert.deepStrictEqual(dimensionsJpeg(jpeg(1080, 1920)), { l: 1080, h: 1920 });

/** Dépôt temporaire avec un brouillon (et ce qu'il faut autour). */
function depot(brouillon = {}, { image = jpeg(1080, 1920), file = [], registre = [], config = {} } = {}) {
  const racine = mkdtempSync(join(tmpdir(), "valider-"));
  mkdirSync(join(racine, "instagram", "brouillons"), { recursive: true });
  mkdirSync(join(racine, "data"), { recursive: true });
  const b = { id: "abcabcabcabc", cree: il_y_a(2), titre: "Selon Mediapart : des faits non établis à ce stade", type: "story", medias: ["Mediapart"], sources: ["https://www.mediapart.fr/journal/x"], statut: "a-valider", nommePersonne: true,
    sensible: 2, categorie: "faits", titrePropre: "Selon Mediapart : des faits non établis à ce stade", sujets: ["Mediapart accuse un ministre de frais indus"], citation: { titre: "Mediapart accuse un ministre de frais indus", media: "Mediapart", url: "https://www.mediapart.fr/journal/x" },
    pied: "Source : Mediapart. Faits non établis par la justice : toute personne citée est présumée innocente.", alt: "Story Hémicycle France.", ...brouillon };
  writeFileSync(join(racine, "instagram", "brouillons", `${b.id}.json`), JSON.stringify(b));
  if (image) writeFileSync(join(racine, "instagram", "brouillons", `${b.id}.jpg`), image);
  writeFileSync(join(racine, "data", "instagram-file.json"), JSON.stringify({ entrees: file }));
  writeFileSync(join(racine, "data", "instagram-publiees.json"), JSON.stringify({ entrees: registre }));
  writeFileSync(join(racine, "data", "stories-config.json"), JSON.stringify(config));
  return { racine, id: b.id };
}
const lire = (racine, f) => JSON.parse(readFileSync(join(racine, f), "utf-8"));
const refus = (opts, motif) => assert.throws(() => valider(opts), (e) => e instanceof Refus && (!motif || motif.test(e.message)), `refus attendu ${motif || ""}`);

// PUBLIER : le brouillon passe dans la file (entrée « story »), l'image dans instagram/auto/, le brouillon disparaît
{
  const { racine, id } = depot();
  const r = valider({ id, action: "publier", racine, now });
  assert.match(r.message, /entre dans la file/);
  const file = lire(racine, "data/instagram-file.json");
  assert.strictEqual(file.entrees.length, 1);
  const e = file.entrees[0];
  assert.strictEqual(e.id, id);
  assert.strictEqual(e.type, "story");
  assert.strictEqual(e.statut, undefined, "plus de statut de brouillon");
  assert.strictEqual(e.valideHumain, true);
  assert.strictEqual(e.valideLe, now.toISOString());
  assert.strictEqual(e.cree, now.toISOString(), "la fraîcheur de 3 h repart à la validation");
  assert.strictEqual(e.sensible, 2);
  assert.strictEqual(e.url_image, `https://tahns.github.io/hemicycle-france/instagram/auto/${id}.jpg`);
  assert.ok(existsSync(join(racine, "instagram", "auto", `${id}.jpg`)), "image dans instagram/auto");
  assert.ok(!existsSync(join(racine, "instagram", "brouillons", `${id}.jpg`)) && !existsSync(join(racine, "instagram", "brouillons", `${id}.json`)), "brouillon supprimé");
  assert.match(readFileSync(join(racine, "instagram", "file.atom"), "utf-8"), new RegExp(id), "flux Atom régénéré");
  // l'entrée validée est publiable par publier-stories (règles habituelles : 7 h – 23 h, registre, plafonds)
  assert.strictEqual(risque(e), false, "niveau 2 validé : le publieur l'accepte");
  const c = choisirPublication({ file, registre: { entrees: [] }, config: { validationHumaine: false }, now });
  assert.strictEqual(c.entree?.id, id, "publiée à la prochaine exécution");
  const nuit = choisirPublication({ file, registre: { entrees: [] }, config: {}, now: new Date("2026-10-06T22:30:00Z") });
  assert.ok(nuit.refus, "jamais la nuit");
  const deux = choisirPublication({ file, registre: { entrees: [{ id: "dddddddddddd", statut: "publiee", publieLe: new Date(now.getTime() - 20 * 60000).toISOString(), type: "story" }] }, config: {}, now });
  assert.ok(deux.refus, "60 min entre deux publications");
  const double = choisirPublication({ file, registre: { entrees: [{ id, statut: "publiee", publieLe: il_y_a(5), type: "story" }] }, config: {}, now });
  assert.ok(double.refus && !double.entree, "registre sans doublon");
  // même avec la validation humaine générale, l'entrée validée sort
  assert.strictEqual(choisirPublication({ file, registre: { entrees: [] }, config: { validationHumaine: true }, now }).entree?.id, id);
}
// Sans validation, un brouillon de niveau 2 n'est jamais publiable (si on le copiait à la main dans la file)
assert.strictEqual(risque({ id: "abcabcabcabc", type: "story", sensible: 2, titre: "Selon Mediapart : des faits non établis à ce stade", sujets: [] }), true);

// PUBLIER un post : entrée « post » avec sa légende (image 4:5)
{
  const legende = "Selon Mediapart : des faits non établis à ce stade.\n\nFaits non établis par la justice : toute personne citée est présumée innocente.\n\nToute l'actu politique : @hemicyclefrance\n#Politique";
  const { racine, id } = depot({ type: "post", legende }, { image: jpeg(1080, 1350) });
  valider({ id, action: "publier", racine, now: new Date("2026-10-06T21:30:00Z") }); // un post garde 12 h : pas de limite d'heure à la validation
  const e = lire(racine, "data/instagram-file.json").entrees[0];
  assert.strictEqual(e.type, "post");
  assert.strictEqual(e.legende, legende);
  assert.strictEqual(risque(e), false);
}

// REJETER : brouillon supprimé, rien dans la file, sujet noté (non reproposé)
{
  const { racine, id } = depot();
  const r = valider({ id, action: "rejeter", racine, now });
  assert.match(r.message, /rejeté et supprimé/);
  assert.ok(!existsSync(join(racine, "instagram", "brouillons", `${id}.jpg`)) && !existsSync(join(racine, "instagram", "brouillons", `${id}.json`)));
  assert.deepStrictEqual(lire(racine, "data/instagram-file.json").entrees, [], "rien en file");
  assert.ok(!existsSync(join(racine, "instagram", "auto", `${id}.jpg`)));
  const rej = lire(racine, "data/instagram-rejetes.json");
  assert.strictEqual(rej.entrees[0].id, id);
  assert.deepStrictEqual(rej.entrees[0].sujets, ["Mediapart accuse un ministre de frais indus"]);
  refus({ id, action: "publier", racine, now }, /introuvable/); // une fois rejeté, plus rien à valider
}

// REFUS
{
  const d = depot();
  refus({ id: "pas-un-id", action: "publier", racine: d.racine, now }, /identifiant invalide/);
  refus({ id: "../../etc/passwd", action: "rejeter", racine: d.racine, now }, /identifiant invalide/);
  refus({ id: "ffffffffffff", action: "publier", racine: d.racine, now }, /introuvable/);
  refus({ id: d.id, action: "supprimer", racine: d.racine, now }, /action invalide/);
  refus({ id: d.id, action: "publier", racine: d.racine, now: new Date(now.getTime() + 49 * 36e5) }, /plus de 48 h/);
  refus({ id: d.id, action: "publier", racine: d.racine, now: new Date("2026-10-06T21:30:00Z") }, /périmée/); // 23 h 30 à Paris
  refus({ id: d.id, action: "publier", racine: d.racine, now: new Date("2026-10-06T03:00:00Z") }, /périmée/); // 5 h à Paris
  assert.ok(existsSync(join(d.racine, "instagram", "brouillons", `${d.id}.json`)), "un refus ne supprime rien");
  assert.deepStrictEqual(lire(d.racine, "data/instagram-file.json").entrees, []);
  const dbl = depot({}, { file: [{ id: "abcabcabcabc", cree: il_y_a(1), type: "story", titre: "x" }] });
  refus({ id: dbl.id, action: "publier", racine: dbl.racine, now }, /déjà en file/);
  const pub = depot({}, { registre: [{ id: "abcabcabcabc", statut: "publiee", publieLe: il_y_a(30) }] });
  refus({ id: pub.id, action: "publier", racine: pub.racine, now }, /déjà publié/);
  const sansImage = depot({}, { image: null });
  refus({ id: sansImage.id, action: "publier", racine: sansImage.racine, now }, /image/);
  const mauvaise = depot({}, { image: jpeg(1080, 1350) });
  refus({ id: mauvaise.id, action: "publier", racine: mauvaise.racine, now }, /1080×1920 attendu/);
  const monet = depot({}, { config: { monetisation: true } });
  refus({ id: monet.id, action: "publier", racine: monet.racine, now }, /monétisation/);
  // réserve électorale : aucun sondage ni simulation (veille du 1er tour, 17 avril 2027)
  const reserve = depot({ cree: "2027-04-17T08:00:00Z", sondageId: "Ifop|2027-04-10", titre: "Sondage Ifop" });
  refus({ id: reserve.id, action: "publier", racine: reserve.racine, now: new Date("2027-04-17T10:00:00Z") }, /réserve électorale/);
  const reserve2 = depot({ cree: "2027-04-17T08:00:00Z", sujets: ["Sondage : intentions de vote pour la présidentielle"] });
  refus({ id: reserve2.id, action: "publier", racine: reserve2.racine, now: new Date("2027-04-17T10:00:00Z") }, /réserve électorale/);
  assert.strictEqual(valider({ id: reserve2.id, action: "rejeter", racine: reserve2.racine, now: new Date("2027-04-17T10:00:00Z") }).action, "rejeter", "rejeter reste possible en réserve");
}

console.log("valider-brouillon : tous les tests passent.");
