// Tests de scripts/http.js (accès poli, requêtes conditionnelles), de l'écriture sans horodatage seul (garde.js),
// des détecteurs généraux (controles-json.js) et du retrait des entrées de file sans image (stories-auto.cjs).
// USAGE : node tests/http.test.mjs
import assert from "assert";
import { mkdtempSync, readFileSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { createRequire } from "module";
import { fetchPoli, delaiAvantRepriser, sonder, releveRecent, noterReleve, USER_AGENT } from "../scripts/http.js";
import { doitEcrire, ecrireSiChange, sansHorodatage } from "../scripts/garde.js";
import { controlerFichierJson } from "../scripts/controles-json.js";

const require = createRequire(import.meta.url);
const reponse = (status, entetes = {}) => ({ status, ok: status >= 200 && status < 300, headers: { get: (k) => entetes[k.toLowerCase()] ?? null }, body: null });
const sansAttente = () => Promise.resolve();

// --- fetchPoli : User-Agent, tentatives, pas d'insistance sur 403/404
{
  let appels = 0, vu;
  const f = async (u, o) => { appels++; vu = o; return appels < 3 ? reponse(503) : reponse(200); };
  const r = await fetchPoli("https://x.test/", { fetchImpl: f, attendre: sansAttente });
  assert.strictEqual(r.status, 200); assert.strictEqual(appels, 3, "2 pannes passagères puis succès");
  assert.strictEqual(vu.headers["User-Agent"], USER_AGENT); assert.ok(vu.signal, "délai d'attente présent");
  appels = 0;
  assert.strictEqual((await fetchPoli("https://x.test/", { fetchImpl: async () => { appels++; return reponse(403); }, attendre: sansAttente })).status, 403);
  assert.strictEqual(appels, 1, "403 : une seule requête");
  appels = 0;
  assert.strictEqual((await fetchPoli("https://x.test/", { fetchImpl: async () => { appels++; return reponse(429); }, attendre: sansAttente })).status, 429);
  assert.strictEqual(appels, 3, "429 : 3 tentatives au plus, puis la réponse est rendue");
  appels = 0;
  await assert.rejects(fetchPoli("https://x.test/", { fetchImpl: async () => { appels++; throw new Error("ECONNRESET"); }, attendre: sansAttente }), /ECONNRESET/);
  assert.strictEqual(appels, 3);
  const attentes = [];
  await fetchPoli("https://x.test/", { fetchImpl: (() => { let n = 0; return async () => (++n < 2 ? reponse(429, { "retry-after": "7" }) : reponse(200)); })(), attendre: (ms) => { attentes.push(ms); return Promise.resolve(); } });
  assert.deepStrictEqual(attentes, [7000], "Retry-After respecté");
  assert.strictEqual(delaiAvantRepriser(1, "9999"), 60000, "Retry-After borné à 60 s");
  assert.ok(delaiAvantRepriser(2, null, () => 0) === 2000);
}

// --- sonder : requêtes conditionnelles et mémoire
{
  process.env.HTTP_CACHE_DIR = mkdtempSync(path.join(os.tmpdir(), "http-"));
  const url = "https://x.test/a.zip";
  let version = "v1", entetesVus;
  const f = async (u, o) => {
    entetesVus = o.headers;
    if (o.headers["If-None-Match"] === `"${version}"`) return reponse(304, { etag: `"${version}"` });
    return reponse(200, { etag: `"${version}"` });
  };
  let s = await sonder([url], { fetchImpl: f });
  assert.strictEqual(s.inchange, false, "première fois : on télécharge");
  await s.valider();
  s = await sonder([url], { fetchImpl: f });
  assert.strictEqual(entetesVus["If-None-Match"], '"v1"');
  assert.strictEqual(s.inchange, true, "304 : rien à télécharger");
  version = "v2";
  s = await sonder([url], { fetchImpl: f });
  assert.strictEqual(s.inchange, false, "source modifiée");
  // sans valider() (échec du traitement), la source reste à retraiter
  version = "v1";
  s = await sonder([url], { fetchImpl: f });
  assert.strictEqual(s.inchange, true, "l'ancien validateur reste mémorisé tant qu'on n'a pas validé");
  s = await sonder([url], { fetchImpl: f, maintenant: Date.now() + 7 * 36e5 });
  assert.strictEqual(s.inchange, false, "passage complet forcé au-delà de 6 h");
  // serveur sans validateur : on travaille comme avant
  const s2 = await sonder(["https://y.test/"], { fetchImpl: async () => reponse(200) });
  assert.strictEqual(s2.inchange, false);
  const s3 = await sonder(["https://y.test/"], { fetchImpl: async () => { throw new Error("réseau"); } });
  assert.strictEqual(s3.inchange, false, "panne du HEAD : relevé normal");
  // relevés rapprochés
  assert.strictEqual(await releveRecent("actualites", 10), false);
  await noterReleve("actualites");
  assert.strictEqual(await releveRecent("actualites", 10), true);
  assert.strictEqual(await releveRecent("actualites", 10, { maintenant: Date.now() + 11 * 60000 }), false);
}

// --- écriture sans horodatage seul
{
  const a = JSON.stringify({ lastUpdated: "2026-10-05T00:00:00.000Z", x: 1 }) + "\n";
  const memeContenu = JSON.stringify({ lastUpdated: "2026-10-05T00:15:00.000Z", x: 1 }) + "\n";
  const t0 = Date.parse("2026-10-05T00:15:00.000Z");
  assert.strictEqual(sansHorodatage(a), sansHorodatage(memeContenu));
  assert.strictEqual(doitEcrire(a, memeContenu, { maintenant: t0 }), false, "horodatage seul : pas de commit");
  assert.strictEqual(doitEcrire(a, JSON.stringify({ lastUpdated: "z", x: 2 }), { maintenant: t0 }), true, "contenu changé");
  assert.strictEqual(doitEcrire(a, memeContenu, { maintenant: t0 + 24 * 36e5 }), true, "battement de 24 h");
  assert.strictEqual(doitEcrire(a, memeContenu, { maintenant: t0 + 5 * 36e5, battementH: 6 }), false);
  assert.strictEqual(doitEcrire(a, memeContenu, { maintenant: t0 + 7 * 36e5, battementH: 6 }), true);
  assert.strictEqual(doitEcrire(null, a), true, "premier fichier");
  const f = path.join(mkdtempSync(path.join(os.tmpdir(), "ecr-")), "d.json");
  assert.strictEqual(await ecrireSiChange(f, JSON.stringify({ lastUpdated: new Date().toISOString(), x: 1 })), true);
  const avant = readFileSync(f, "utf-8");
  assert.strictEqual(await ecrireSiChange(f, JSON.stringify({ lastUpdated: new Date(Date.now() + 60000).toISOString(), x: 1 })), false);
  assert.strictEqual(readFileSync(f, "utf-8"), avant, "fichier intact");
}

// --- détecteurs généraux
{
  const now = Date.parse("2026-10-05T12:00:00Z");
  assert.deepStrictEqual(controlerFichierJson("a", '{"lastUpdated":"2026-10-05T11:00:00Z","x":[1]}', { maintenant: now }), []);
  assert.match(controlerFichierJson("a", "", { maintenant: now })[0], /vide/);
  assert.match(controlerFichierJson("a", "{oups", { maintenant: now })[0], /JSON invalide/);
  assert.match(controlerFichierJson("a", "{}", { maintenant: now })[0], /contenu vide/);
  assert.match(controlerFichierJson("a", '{"lastUpdated":"2027-01-01T00:00:00Z"}', { maintenant: now })[0], /futur/);
  assert.match(controlerFichierJson("a", '{"lastUpdated":"hier"}', { maintenant: now })[0], /invalide/);
  assert.match(controlerFichierJson("a", '{"x":"' + "y".repeat(2000) + '"}', { maintenant: now, tailleMax: 1000 })[0], /Mo|au-delà/);
}

// --- file des stories : jamais d'entrée sans image
{
  const { retirerSansImage, imageValide } = require("../scripts/stories-auto.cjs");
  const entrees = [{ id: "aaaaaaaaaaaa" }, { id: "bbbbbbbbbbbb" }, { id: "cccccccccccc" }];
  const images = new Set(["aaaaaaaaaaaa", "bbbbbbbbbbbb"]); // « c » est ancienne : son image a été supprimée normalement
  const { gardees, retirees } = retirerSansImage(entrees, images, (id) => id === "aaaaaaaaaaaa");
  assert.deepStrictEqual(retirees, ["bbbbbbbbbbbb"]);
  assert.deepStrictEqual(gardees.map((e) => e.id), ["aaaaaaaaaaaa", "cccccccccccc"]);
  const d = mkdtempSync(path.join(os.tmpdir(), "img-"));
  writeFileSync(path.join(d, "ok.jpg"), Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(2000)]));
  writeFileSync(path.join(d, "pasjpeg.jpg"), Buffer.alloc(2000));
  assert.strictEqual(imageValide(path.join(d, "ok.jpg")), true);
  assert.strictEqual(imageValide(path.join(d, "pasjpeg.jpg")), false);
  assert.strictEqual(imageValide(path.join(d, "absente.jpg")), false);
}

console.log("[tests http] OK");
