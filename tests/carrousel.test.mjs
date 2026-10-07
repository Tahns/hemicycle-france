// Tests du carrousel et des créneaux de scripts/publier-stories.cjs avec un faux serveur HTTP local (API Graph simulée). USAGE : node tests/carrousel.test.mjs
import assert from "assert";
import http from "http";
import { spawn } from "child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createRequire } from "module";
const { publierCarrousel, validerCarrousel } = createRequire(import.meta.url)("../scripts/carrousel.cjs");

const JETON = "EAAJETONSECRET123";
const MAINTENANT = "2026-10-13T10:40:00Z"; // 12 h 40 à Paris (mardi), hors réserve
const decale = (min, base = MAINTENANT) => new Date(Date.parse(base) + min * 60000).toISOString();
const LEGENDE = "Une loi expliquée : texte adopté\n\nLe 12 octobre 2026, l'Assemblée nationale a adopté l'ensemble du texte.\nPour : 359 · Contre : 1.\n\nSource officielle : Assemblée nationale\n\nChaque jour : @hemicyclefrance\n#Politique #AssembléeNationale #Loi #Parlement";

// ---------- Faux serveur ----------
const etat = {};
const appels = [];
let n = 0;
const serveur = http.createServer((req, res) => {
  let corps = "";
  req.on("data", (c) => (corps += c));
  req.on("end", () => {
    const url = new URL(req.url, "http://x");
    const p = Object.fromEntries(new URLSearchParams(corps));
    appels.push({ methode: req.method, chemin: url.pathname, p });
    const json = (code, o) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
    if (url.pathname.startsWith("/img/")) { res.writeHead(etat.image === 404 ? 404 : 200); return res.end(); }
    if (url.pathname === "/debug_token") return json(200, { data: { is_valid: true, expires_at: 0 } });
    if (url.pathname === "/IGUSER/media" && req.method === "POST") {
      if (p.is_carousel_item && etat.refuserEnfant === Number(/c(\d+)\.jpg/.exec(p.image_url)?.[1])) return json(400, { error: { message: "Image refusée " + JETON } });
      return json(200, { id: (p.media_type === "CAROUSEL" ? "PARENT" : "ENFANT") + ++n });
    }
    if (/^\/(ENFANT|PARENT)\d+$/.test(url.pathname)) {
      const id = url.pathname.slice(1);
      if (etat.statutEnfant && id.startsWith("ENFANT")) return json(200, { status_code: etat.statutEnfant });
      if (etat.statutParent && id.startsWith("PARENT")) return json(200, { status_code: etat.statutParent });
      if (etat.enCours > 0) { etat.enCours--; return json(200, { status_code: "IN_PROGRESS" }); }
      return json(200, { status_code: "FINISHED" });
    }
    if (url.pathname === "/IGUSER/media_publish") return etat.erreurPublication ? json(500, { error: { message: "Erreur interne " + JETON } }) : json(200, { id: "MEDIA42" });
    json(404, { error: { message: "inconnu" } });
  });
});
await new Promise((r) => serveur.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${serveur.address().port}`;
const reset = (o = {}) => { Object.keys(etat).forEach((k) => delete etat[k]); Object.assign(etat, o); appels.length = 0; };

const carrousel = (id, extra = {}) => ({ id, cree: decale(-60), titre: "Une loi expliquée : texte adopté", titrePropre: "Texte adopté", type: "carousel", donneesPropres: true, contenu: "carrousel-loi", pasAvant: decale(-10), expire: decale(300), url_image: `${BASE}/img/${id}.jpg`, url_images: [1, 2, 3, 4, 5].map((i) => `${BASE}/img/c${i}.jpg`), alts: [1, 2, 3, 4, 5].map((i) => `Image ${i} sur 5`), legende: LEGENDE, sources: [], ...extra });
const story = (id, extra = {}) => ({ id, cree: decale(-30), titre: "Budget : le gouvernement présente son texte", medias: ["A", "B", "C"], url_image: `${BASE}/img/${id}.jpg`, type: "story", sources: [], ...extra });

// ---------- publierCarrousel : fonction pure, client simulé ----------
{
  const journal = [];
  let k = 0;
  const graph = async (m, chemin, params = {}) => {
    journal.push([m, chemin, params]);
    if (m === "POST" && chemin === "/U/media") return { id: params.media_type === "CAROUSEL" ? "P" : `E${++k}` };
    if (m === "GET") return { status_code: "FINISHED" };
    if (chemin === "/U/media_publish") return { id: "M1" };
  };
  const e = carrousel("aaaaaaaaaaaa", { url_images: ["https://x/a.jpg", "https://x/b.jpg", "https://x/c.jpg"], alts: ["a", "b", "c"] });
  const r = await publierCarrousel({ graph, userId: "U", entree: e, dormir: async () => {} });
  assert.strictEqual(r.mediaId, "M1");
  const posts = journal.filter(([m]) => m === "POST");
  assert.strictEqual(posts.length, 5, "3 enfants + 1 parent + media_publish");
  assert.deepStrictEqual(posts.slice(0, 3).map(([, , p]) => [p.image_url, p.is_carousel_item, p.alt_text]), [["https://x/a.jpg", "true", "a"], ["https://x/b.jpg", "true", "b"], ["https://x/c.jpg", "true", "c"]]);
  assert.deepStrictEqual([posts[3][2].media_type, posts[3][2].children, posts[3][2].caption === LEGENDE], ["CAROUSEL", "E1,E2,E3", true]);
  assert.deepStrictEqual(posts[4][2], { creation_id: "P" });
  // l'ordre : chaque enfant est FINISHED avant le suivant, le parent FINISHED avant media_publish
  assert.ok(journal.findIndex(([, c]) => c === "/E1") < journal.findIndex(([, , p]) => p.image_url === "https://x/b.jpg"));
  assert.ok(journal.findIndex(([, c]) => c === "/P") < journal.findIndex(([, c]) => c === "/U/media_publish"));
  // légende invalide : refus avant tout appel
  for (const l of ["trop court", LEGENDE.replace("#Parlement", "#Parlement #Un #Deux"), LEGENDE.replace(/#\S+/g, ""), LEGENDE.replace("@hemicyclefrance", "x"), LEGENDE + " https://tahns.github.io/hemicycle-france/"]) {
    journal.length = 0;
    await assert.rejects(publierCarrousel({ graph, userId: "U", entree: { ...e, legende: l }, dormir: async () => {} }), (err) => err.avantPublication === true);
    assert.strictEqual(journal.length, 0, "aucun appel pour un carrousel invalide");
  }
  assert.ok(!validerCarrousel({ ...e, url_images: ["https://x/a.jpg"] }).ok, "1 image : refus");
  assert.ok(!validerCarrousel({ ...e, url_images: Array.from({ length: 11 }, (_, i) => `https://x/${i}.jpg`), alts: undefined }).ok, "11 images : refus");
  assert.ok(validerCarrousel({ ...e, url_images: Array.from({ length: 10 }, (_, i) => `https://x/${i}.jpg`), alts: Array(10).fill("t") }).ok, "10 images : accepté");
  // délai dépassé : abandon avant publication
  const lent = async (m, c, p) => (m === "GET" ? { status_code: "IN_PROGRESS" } : graph(m, c, p));
  await assert.rejects(publierCarrousel({ graph: lent, userId: "U", entree: e, essais: 3, dormir: async () => {} }), (err) => err.avantPublication && /pas prêt/.test(err.message));
}

// ---------- Publieur complet ----------
async function lancer({ entrees = [], registre = { entrees: [] }, config = { maxParJour: 99 }, now = MAINTENANT, reglages = {} }) {
  reset(reglages);
  const d = mkdtempSync(join(tmpdir(), "car-"));
  writeFileSync(join(d, "file.json"), JSON.stringify({ entrees }));
  writeFileSync(join(d, "config.json"), JSON.stringify(config));
  writeFileSync(join(d, "reg.json"), JSON.stringify(registre));
  const env = { ...process.env, GRAPH_BASE: BASE, PUBLIER_MAINTENANT: now, PUBLIER_FILE: join(d, "file.json"), PUBLIER_REGISTRE: join(d, "reg.json"), PUBLIER_CONFIG: join(d, "config.json"), PUBLIER_ATTENTE_MS: "10", IG_USER_ID: "IGUSER", IG_ACCESS_TOKEN: JETON };
  delete env.GITHUB_STEP_SUMMARY;
  const proc = spawn(process.execPath, ["scripts/publier-stories.cjs"], { env });
  let sortie = "";
  proc.stdout.on("data", (c) => (sortie += c)); proc.stderr.on("data", (c) => (sortie += c));
  await new Promise((r) => proc.on("close", r));
  const registreFinal = JSON.parse(readFileSync(join(d, "reg.json"), "utf-8"));
  return { sortie, registre: registreFinal, appels: [...appels], publies: appels.filter((a) => a.chemin === "/IGUSER/media_publish").length };
}

{ // carrousel publié : enfants, parent, FINISHED, publication ; registre
  const r = await lancer({ entrees: [carrousel("aaaaaaaaaaaa")], reglages: { enCours: 2 } });
  assert.strictEqual(r.publies, 1);
  const crea = r.appels.filter((a) => a.chemin === "/IGUSER/media");
  assert.strictEqual(crea.length, 6, "5 enfants + 1 parent");
  assert.ok(crea.slice(0, 5).every((a) => a.p.is_carousel_item === "true" && a.p.alt_text));
  assert.strictEqual(crea[5].p.media_type, "CAROUSEL");
  assert.strictEqual(crea[5].p.children.split(",").length, 5);
  const e = r.registre.entrees.find((x) => x.id === "aaaaaaaaaaaa");
  assert.deepStrictEqual([e.statut, e.type, e.contenu, e.mediaId], ["publiee", "carousel", "carrousel-loi", "MEDIA42"]);
  assert.ok(!r.sortie.includes(JETON), "le jeton n'est jamais affiché");
}
{ // enfant refusé : rien publié, rien au registre, nouvel essai possible
  const r = await lancer({ entrees: [carrousel("aaaaaaaaaaaa")], reglages: { refuserEnfant: 3 } });
  assert.strictEqual(r.publies, 0);
  assert.ok(!r.registre.entrees.some((x) => x.id === "aaaaaaaaaaaa"), "aucune trace : nouvel essai au passage suivant");
  assert.ok(!r.sortie.includes(JETON));
}
{ // conteneur en erreur : idem
  const r = await lancer({ entrees: [carrousel("aaaaaaaaaaaa")], reglages: { statutParent: "ERROR" } });
  assert.strictEqual(r.publies, 0);
  assert.ok(!r.registre.entrees.some((x) => x.id === "aaaaaaaaaaaa"));
}
{ // media_publish en échec : ABANDON, jamais de doublon
  const r = await lancer({ entrees: [carrousel("aaaaaaaaaaaa")], reglages: { erreurPublication: true } });
  const e = r.registre.entrees.find((x) => x.id === "aaaaaaaaaaaa");
  assert.strictEqual(e.statut, "incertaine");
  const r2 = await lancer({ entrees: [carrousel("aaaaaaaaaaaa")], registre: r.registre });
  assert.strictEqual(r2.appels.filter((a) => a.chemin === "/IGUSER/media").length, 0, "jamais republié");
}
{ // image absente en ligne : attente
  const r = await lancer({ entrees: [carrousel("aaaaaaaaaaaa")], reglages: { image: 404 } });
  assert.strictEqual(r.publies, 0);
  assert.match(r.sortie, /pas encore en ligne/);
}
{ // créneaux : pas avant l'heure ; périmée après « expire » ; dates absentes : jamais publiée
  let r = await lancer({ entrees: [carrousel("aaaaaaaaaaaa", { pasAvant: decale(30), expire: decale(300) })] });
  assert.strictEqual(r.publies, 0);
  assert.match(r.sortie, /l'heure n'est pas encore venue/);
  assert.ok(!r.registre.entrees.some((x) => x.id === "aaaaaaaaaaaa"), "en attente, pas périmée");
  r = await lancer({ entrees: [carrousel("aaaaaaaaaaaa", { pasAvant: decale(-300), expire: decale(-1) })] });
  assert.strictEqual(r.publies, 0);
  assert.strictEqual(r.registre.entrees.find((x) => x.id === "aaaaaaaaaaaa").statut, "perimee");
  r = await lancer({ entrees: [carrousel("aaaaaaaaaaaa", { pasAvant: undefined })] });
  assert.strictEqual(r.publies, 0, "sans pasAvant : jamais publié au hasard");
}
{ // une story à créneau passe avant l'actualité au fil de l'eau ; elle n'entre pas dans le plafond des stories
  const s = story("bbbbbbbbbbbb", { contenu: "aujourdhui", donneesPropres: true, pasAvant: decale(-5), expire: decale(200), cree: decale(-20), titre: "Aujourd'hui à l'Assemblée : mardi 13 octobre 2026", titrePropre: "Aujourd'hui à l'Assemblée", sujets: ["Débat sur la dette"] });
  const presse = story("cccccccccccc", { cree: decale(-90), titre: "Budget : autre sujet de presse totalement différent", titrePropre: "Autre sujet totalement différent" });
  let r = await lancer({ entrees: [presse, s] });
  assert.strictEqual(r.registre.entrees.at(-1).id, "bbbbbbbbbbbb", "le créneau d'abord");
  // plafond de stories atteint (maxParJour 1, une story déjà publiée il y a 2 h) : la story à créneau sort quand même, pas la presse
  const reg = { entrees: [{ id: "dddddddddddd", statut: "publiee", publieLe: decale(-120), type: "story", mediaId: "x" }] };
  r = await lancer({ entrees: [presse, s], registre: reg, config: { maxParJour: 1 } });
  assert.strictEqual(r.registre.entrees.at(-1).id, "bbbbbbbbbbbb");
  r = await lancer({ entrees: [presse], registre: reg, config: { maxParJour: 1 } });
  assert.strictEqual(r.publies, 0, "la presse reste sous le plafond");
  // un sujet à mot prudent dans un contenu à créneau : jamais publié
  r = await lancer({ entrees: [{ ...s, sujets: ["Mise en examen d'un élu"] }] });
  assert.strictEqual(r.publies, 0);
  // aucun espacement entre deux publications
  r = await lancer({ entrees: [s], registre: { entrees: [{ id: "eeeeeeeeeeee", statut: "publiee", publieLe: decale(-30), type: "story", mediaId: "x" }] } });
  assert.strictEqual(r.publies, 1, "aucun espacement : le carrousel sort");
  // jamais la nuit
  r = await lancer({ entrees: [s], now: "2026-10-13T21:30:00Z" });
  assert.strictEqual(r.publies, 0);
}
{ // plafond de 2 posts par jour, carrousels compris
  const reg = { entrees: [{ id: "111111111111", statut: "publiee", publieLe: decale(-300), type: "post", mediaId: "x" }, { id: "222222222222", statut: "publiee", publieLe: decale(-200), type: "carousel", mediaId: "y" }] };
  const r = await lancer({ entrees: [carrousel("aaaaaaaaaaaa")], registre: reg });
  assert.strictEqual(r.publies, 0);
  assert.match(r.sortie, /plafond/);
}
{ // réserve électorale : une entrée « reserve » (sondage) n'est jamais publiée (samedi 17 avril 2027, 12 h Paris)
  const now = "2027-04-17T10:00:00Z";
  const c = carrousel("aaaaaaaaaaaa", { reserve: true, pasAvant: decale(-10, now), expire: decale(300, now), cree: decale(-60, now) });
  const r = await lancer({ entrees: [c], now });
  assert.strictEqual(r.publies, 0);
}

serveur.close();
console.log("[tests carrousel] OK");
