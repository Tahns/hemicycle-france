// Tests de scripts/story-a-la-demande.cjs (demande directe -> toujours un brouillon prudent) avec de faux dessins. USAGE : node tests/story-a-la-demande.test.mjs
import assert from "assert";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { demander, Refus } = require("../scripts/story-a-la-demande.cjs");
const { valider } = require("../scripts/valider-brouillon.cjs");
const { risque } = require("../scripts/publier-stories.cjs");
const SS = require("../scripts/sujets-sensibles.cjs");

const now = new Date("2026-10-06T10:00:00Z");
function jpeg(l, h) {
  const b = Buffer.alloc(1500, 0);
  Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, l >> 8, l & 255, 0x03]).copy(b, 0);
  return b;
}
const appels = [];
const dessins = { story: async (synth) => { appels.push(synth); return jpeg(1080, 1920); }, post: async (spec) => { appels.push(spec); return jpeg(1080, 1350); } };
function depot() {
  const racine = mkdtempSync(join(tmpdir(), "demande-"));
  mkdirSync(join(racine, "data"), { recursive: true });
  writeFileSync(join(racine, "data", "instagram-file.json"), JSON.stringify({ entrees: [] }));
  writeFileSync(join(racine, "data", "instagram-publiees.json"), JSON.stringify({ entrees: [] }));
  writeFileSync(join(racine, "data", "stories-config.json"), "{}");
  return racine;
}
const brouillons = (racine) => (existsSync(join(racine, "instagram", "brouillons")) ? readdirSync(join(racine, "instagram", "brouillons")) : []);
const refus = async (opts, motif) => {
  appels.length = 0;
  await assert.rejects(() => demander({ racine: opts.racine, now, dessins, ...opts }), (e) => e instanceof Refus && (!motif || motif.test(e.message)), `refus attendu ${motif || ""}`);
  assert.strictEqual(appels.length, 0, "rien n'est dessiné pour une demande refusée");
  assert.deepStrictEqual(brouillons(opts.racine), [], "aucun brouillon créé pour une demande refusée");
};

const LIEN = "https://www.mediapart.fr/journal/france/061026/un-ministre-et-des-frais";
const TITRE = "Frais indus : Mediapart accuse un ministre, qui dément toute irrégularité";

// REFUS : lien hors des domaines de médias connus, ou mal formé
{
  const racine = depot();
  for (const lien of ["https://www.example.org/article", "http://www.mediapart.fr/x", "https://mediapart.fr.evil.example/x", "https://evil.example/?u=www.mediapart.fr", "https://user:mdp@www.mediapart.fr/x", "javascript:alert(1)", "", "https://t.me/un-canal/123", "https://twitter.com/x/status/1"]) {
    await refus({ racine, lien, titre: TITRE }, /lien refusé/);
  }
  await refus({ racine, lien: LIEN, media: "Le Monde", titre: TITRE }, /ne correspond pas au lien/);
  await refus({ racine, lien: LIEN, type: "reel" }, /type invalide/);
  await refus({ racine, lien: LIEN, titre: "court" }, /entre 15 et 220/);
  await refus({ racine, lien: LIEN, titre: "x".repeat(300) }, /entre 15 et 220/);
  await refus({ racine, lien: LIEN, titre: "Un titre avec <script>alert(1)</script> dedans" }, /caractères/);
  await refus({ racine, lien: LIEN, titre: "Un mineur de 15 ans mis en examen, selon la presse" }, /mineur/);
  await refus({ racine, lien: LIEN, titre: "Le maire condamné pour agression sexuelle, selon Mediapart" }, /sexuel|violence/);
  await refus({ racine, lien: LIEN, titre: "Sondage : intentions de vote pour la présidentielle de 2027", now: new Date("2027-04-17T10:00:00Z") }, /réserve électorale/);
}

// SUCCÈS (story) : toujours un BROUILLON, jamais une entrée de file
{
  const racine = depot();
  appels.length = 0;
  const r = await demander({ racine, now, dessins, lien: LIEN, media: "Mediapart", titre: TITRE, type: "story" });
  assert.match(r.id, /^[0-9a-f]{12}$/);
  assert.deepStrictEqual(brouillons(racine).sort(), [`${r.id}.jpg`, `${r.id}.json`]);
  assert.deepStrictEqual(JSON.parse(readFileSync(join(racine, "data", "instagram-file.json"), "utf-8")).entrees, [], "jamais dans data/instagram-file.json");
  assert.ok(!existsSync(join(racine, "instagram", "auto")), "pas d'image dans la file");
  const b = JSON.parse(readFileSync(join(racine, "instagram", "brouillons", `${r.id}.json`), "utf-8"));
  assert.strictEqual(b.statut, "a-valider");
  assert.strictEqual(b.sensible, 2);
  assert.strictEqual(b.demande, true);
  assert.strictEqual(b.type, "story");
  assert.deepStrictEqual(b.medias, ["Mediapart"]);
  assert.deepStrictEqual(b.sources, [LIEN]);
  assert.strictEqual(b.titre, "Selon Mediapart : des faits non établis à ce stade", "titre à nous, attribué au média");
  assert.deepStrictEqual(b.citation, { titre: TITRE, media: "Mediapart", url: LIEN }, "titre du média cité entre guillemets, avec son nom et son lien");
  assert.strictEqual(b.reponseCitee, true, "le titre cite la réponse de la personne");
  assert.match(b.pied, /Source : Mediapart \(consulté le 6 octobre 2026\)/);
  assert.match(b.pied, /présumée innocente/);
  assert.ok(SS.formulationSure([b.titre, b.pied].join(" ")).ok, "aucun verbe qui accuse dans nos textes");
  // le dessin reçoit un sujet synthétique : aucune personnalité, titre du média en citation, sans heure trompeuse
  assert.strictEqual(appels.length, 1);
  assert.deepStrictEqual(appels[0].illustration.personnes, []);
  assert.strictEqual(appels[0].articles[0].titre, TITRE);
  assert.strictEqual(appels[0].articles[0].media, "Mediapart");
  assert.strictEqual(appels[0].sensible.sansHeure, true);
  assert.strictEqual(appels[0].titrePropre.titre, b.titre);
  // même lien : pas de doublon tant que le brouillon existe
  await assert.rejects(() => demander({ racine, now, dessins, lien: LIEN + "#autre", type: "story" }), (e) => e instanceof Refus && /existe déjà/.test(e.message));
  // PUIS validation d'un geste : le brouillon entre dans la file, publiable par le publieur
  const v = valider({ id: r.id, action: "publier", racine, now });
  assert.match(v.message, /entre dans la file/);
  const e = JSON.parse(readFileSync(join(racine, "data", "instagram-file.json"), "utf-8")).entrees[0];
  assert.strictEqual(e.id, r.id);
  assert.strictEqual(e.valideHumain, true);
  assert.strictEqual(risque(e), false);
  assert.deepStrictEqual(brouillons(racine), []);
  // déjà en file : une nouvelle demande du même lien est refusée
  await assert.rejects(() => demander({ racine, now, dessins, lien: LIEN, type: "story" }), (e2) => e2 instanceof Refus && /déjà été mis en file ou publié/.test(e2.message));
}

// SUCCÈS sans titre cité : titre neutre à nous seulement (aucune citation), média déduit du lien
{
  const racine = depot();
  appels.length = 0;
  const r = await demander({ racine, now, dessins, lien: "https://www.lemonde.fr/politique/article/2026/10/06/x_1.html", type: "story" });
  const b = JSON.parse(readFileSync(join(racine, "instagram", "brouillons", `${r.id}.json`), "utf-8"));
  assert.deepStrictEqual(b.medias, ["Le Monde"]);
  assert.strictEqual(b.citation, undefined);
  assert.strictEqual(b.titre, "Selon Le Monde : une information à vérifier à la source");
  assert.strictEqual(appels[0].sensible.sansCitation, true);
  assert.match(b.pied, /présumée innocente/);
}

// SUCCÈS (post) : brouillon de post avec légende valide (@compte, aucun lien du site), image 4:5
{
  const racine = depot();
  appels.length = 0;
  const r = await demander({ racine, now, dessins, lien: LIEN, titre: TITRE, type: "post" });
  const b = JSON.parse(readFileSync(join(racine, "instagram", "brouillons", `${r.id}.json`), "utf-8"));
  assert.strictEqual(b.type, "post");
  assert.match(b.legende, /@hemicyclefrance/);
  assert.match(b.legende, /Titre cité : « Frais indus/);
  assert.match(b.legende, /présumée innocente/);
  assert.ok(!/github\.io|hemicycle-france/i.test(b.legende));
  assert.deepStrictEqual(appels[0], { genre: "presse", surtitre: "Selon la presse", titre: b.titre, citation: TITRE, media: "Mediapart", sourceTxt: b.pied });
  const v = valider({ id: r.id, action: "publier", racine, now });
  assert.match(v.message, /post/);
  const e = JSON.parse(readFileSync(join(racine, "data", "instagram-file.json"), "utf-8")).entrees[0];
  assert.strictEqual(e.type, "post");
  assert.strictEqual(risque(e), false);
}

// Rejet d'un brouillon de demande : supprimé, jamais en file
{
  const racine = depot();
  const r = await demander({ racine, now, dessins, lien: LIEN, titre: TITRE, type: "story" });
  valider({ id: r.id, action: "rejeter", racine, now });
  assert.deepStrictEqual(brouillons(racine), []);
  assert.deepStrictEqual(JSON.parse(readFileSync(join(racine, "data", "instagram-file.json"), "utf-8")).entrees, []);
}

console.log("story-a-la-demande : tous les tests passent.");
