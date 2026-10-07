// Tests de scripts/stats-instagram.cjs et scripts/recommandations.cjs avec un faux serveur Graph local. USAGE : node tests/stats-instagram.test.mjs
import assert from "assert";
import http from "http";
import { spawn, spawnSync } from "child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const STATS = require("../scripts/stats-instagram.cjs");
const JETON = "EAAJETONSECRET123";
const MAINTENANT = "2026-10-06T19:00:00Z"; // 21 h à Paris, semaine 2026-W41

const etat = {};
const appels = [];
const serveur = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  appels.push({ chemin: url.pathname, metric: url.searchParams.get("metric"), auth: req.headers.authorization, requete: url.search });
  const json = (code, o) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
  if (etat.jetonInvalide) return json(400, { error: { message: "Invalid OAuth access token " + JETON, code: 190 } });
  const m = url.pathname.match(/^\/(\w+)\/insights$/);
  if (m) {
    const id = m[1];
    if (id === "SANS") return json(400, { error: { message: "Media posted before business account conversion", code: 100 } });
    const demandees = url.searchParams.get("metric").split(",");
    const refusees = etat.refus?.[id] || [];
    if (demandees.some((x) => refusees.includes(x))) return json(400, { error: { message: `(#100) metric[0] must be one of the following values: reach (${x_(demandees, refusees)})`, code: 100 } });
    const valeurs = etat.valeurs?.[id] || {};
    return json(200, { data: demandees.filter((x) => x in valeurs).map((x) => ({ name: x, period: "lifetime", values: [{ value: valeurs[x] }] })) });
  }
  if (url.pathname.endsWith("/comments")) return json(200, { data: (etat.commentaires || []).map((c, i) => ({ id: "C" + i, text: c })) });
  if (url.pathname === "/IGUSER") return json(200, { followers_count: etat.abonnes ?? 120, id: "IGUSER" });
  const info = etat.infos?.[url.pathname.slice(1)];
  if (info) return json(200, info);
  json(404, { error: { message: "inconnu", code: 100 } });
});
const x_ = (a, r) => a.find((y) => r.includes(y));
await new Promise((r) => serveur.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${serveur.address().port}`;

// Métriques obsolètes (refusées par l'API, constatées sur le premier relevé réel) : jamais demandées
for (const [type, liste] of Object.entries(STATS.METRIQUES)) for (const m of ["impressions", "taps_forward", "taps_back", "exits"]) assert.ok(!liste.includes(m), `${type} : ${m} obsolète`);
assert.ok(STATS.METRIQUES.story.includes("views") && STATS.METRIQUES.story.includes("reach"));

const reg = (id, mediaId, publieLe, extra = {}) => ({ id, statut: "publiee", publieLe, mediaId, ...extra });
const STORY = (ts) => ({ media_product_type: "STORY", media_type: "IMAGE", timestamp: ts });
const REEL = (ts) => ({ media_product_type: "REELS", media_type: "VIDEO", timestamp: ts });
const FEED = (ts) => ({ media_product_type: "FEED", media_type: "IMAGE", timestamp: ts });
const CARR = (ts) => ({ media_product_type: "FEED", media_type: "CAROUSEL_ALBUM", timestamp: ts });

async function lancer({ entrees = [], stats = null, config = { commentaires: false }, secrets = true, reglages = {}, now = MAINTENANT } = {}) {
  Object.keys(etat).forEach((k) => delete etat[k]);
  Object.assign(etat, reglages);
  appels.length = 0;
  const d = mkdtempSync(join(tmpdir(), "stats-"));
  writeFileSync(join(d, "reg.json"), JSON.stringify({ entrees }));
  writeFileSync(join(d, "file.json"), JSON.stringify({ entrees: [] }));
  writeFileSync(join(d, "config.json"), JSON.stringify(config));
  if (stats) writeFileSync(join(d, "stats.json"), JSON.stringify(stats));
  writeFileSync(join(d, "resume.md"), "");
  const env = { ...process.env, GRAPH_BASE: BASE, STATS_MAINTENANT: now, STATS_REGISTRE: join(d, "reg.json"), STATS_FILE: join(d, "file.json"), STATS_CONFIG: join(d, "config.json"), STATS_SORTIE: join(d, "stats.json"), STATS_DOCS: join(d, "docs"), GITHUB_STEP_SUMMARY: join(d, "resume.md") };
  delete env.IG_USER_ID; delete env.IG_ACCESS_TOKEN;
  if (secrets) Object.assign(env, { IG_USER_ID: "IGUSER", IG_ACCESS_TOKEN: JETON });
  const p = spawn(process.execPath, ["scripts/stats-instagram.cjs"], { env });
  let sortie = "";
  p.stdout.on("data", (c) => (sortie += c));
  p.stderr.on("data", (c) => (sortie += c));
  const code = await new Promise((r) => p.on("close", r));
  const lire = (f) => (existsSync(join(d, f)) ? readFileSync(join(d, f), "utf-8") : "");
  const s = lire("stats.json");
  const rapports = existsSync(join(d, "docs")) ? readdirSync(join(d, "docs")) : [];
  return { code, sortie, resume: lire("resume.md"), stats: s ? JSON.parse(s) : null, rapports, rapport: rapports.length ? lire("docs/" + rapports[0]) : "", brut: s };
}
const jamaisLeJeton = (r) => assert.ok(!r.sortie.includes(JETON) && !r.resume.includes(JETON) && !(r.brut || "").includes(JETON) && !r.rapport.includes(JETON), "le jeton ne doit jamais apparaître");

try {
  // Secrets absents : sortie propre, aucun appel, aucun fichier
  {
    const r = await lancer({ entrees: [reg("a", "M1", "2026-10-06T10:00:00Z")], secrets: false });
    assert.equal(r.code, 0);
    assert.match(r.resume, /INACTIVES/);
    assert.equal(appels.length, 0);
    assert.equal(r.stats, null);
  }

  // Métriques valides par type, registre « windsor » et entrées non publiées ignorés, abonnés relevés
  {
    const r = await lancer({
      entrees: [
        reg("aaaaaaaaaaaa", "S1", "2026-10-06T10:30:00Z", { titre: "Blocus des lycées" }),
        reg("dossier-primaire-0510", "R1", "2026-10-06T07:00:00Z", { titre: "Primaire" }),
        reg("p1", "P1", "2026-10-05T11:00:00Z"),
        reg("c1", "K1", "2026-10-05T12:00:00Z"),
        reg("vieux", "windsor", "2026-10-02T12:00:00Z"),
        { id: "x", statut: "perimee", publieLe: null, mediaId: null },
      ],
      reglages: {
        infos: { S1: STORY("2026-10-06T10:30:00Z"), R1: REEL("2026-10-06T07:00:00Z"), P1: FEED("2026-10-05T11:00:00Z"), K1: CARR("2026-10-05T12:00:00Z") },
        valeurs: {
          S1: { views: 200, reach: 150, shares: 3, replies: 1, total_interactions: 4 },
          R1: { views: 500, reach: 400, likes: 30, comments: 2, saved: 5, shares: 4, ig_reels_avg_watch_time: 3200 },
          P1: { views: 80, reach: 60, likes: 9, comments: 1, saved: 2, shares: 0 },
          K1: { views: 120, reach: 100, likes: 11, comments: 0, saved: 3, shares: 1 },
        },
        abonnes: 321,
      },
    });
    assert.equal(r.code, 0, r.sortie);
    jamaisLeJeton(r);
    assert.deepEqual(Object.keys(r.stats.medias).sort(), ["K1", "P1", "R1", "S1"]);
    const s = r.stats.medias.S1;
    assert.equal(s.type, "story"); assert.equal(s.metriques.views, 200); assert.equal(s.metriques.total_interactions, 4);
    assert.equal(appels.filter((a) => a.chemin === "/S1/insights").length, 1, "story : une seule requête d'insights (aucune métrique obsolète demandée)");
    assert.equal(s.theme, "education"); assert.equal(s.heureParis, 12); assert.equal(s.modele, "actualite");
    assert.equal(r.stats.medias.R1.type, "reel"); assert.equal(r.stats.medias.R1.modele, "dossier");
    assert.equal(r.stats.medias.K1.type, "carrousel"); assert.equal(r.stats.medias.P1.type, "post");
    assert.equal(r.stats.abonnes.nombre, 321);
    assert.ok(r.stats.medias.S1.releveLe);
    // le jeton passe en en-tête Authorization, jamais dans l'URL
    assert.ok(appels.every((a) => a.auth === "Bearer " + JETON && !a.requete.includes(JETON)));
    assert.deepEqual(r.rapports, ["2026-W41.md"]);
    assert.match(r.rapport, /Abonnés\*\* : 321/);
    assert.match(r.rapport, /Meilleurs contenus/); assert.match(r.rapport, /Meilleur format\*\* : reel/);
    assert.match(r.resume, /Meilleur créneau/);
    // les commentaires ne sont pas lus par défaut
    assert.ok(!appels.some((a) => a.chemin.endsWith("/comments")));
  }

  // Métriques refusées : relevé métrique par métrique, la refusée est notée, le reste est gardé
  {
    const r = await lancer({
      entrees: [reg("aaaaaaaaaaaa", "S2", "2026-10-06T10:30:00Z")],
      reglages: { infos: { S2: STORY("2026-10-06T10:30:00Z") }, valeurs: { S2: { reach: 100, views: 120, exits: 5 } }, refus: { S2: ["replies", "shares"] } },
    });
    assert.equal(r.code, 0);
    const m = r.stats.medias.S2;
    assert.deepEqual(m.refusees.sort(), ["replies", "shares"]);
    assert.equal(m.metriques.reach, 100); assert.equal(m.metriques.views, 120);
    assert.equal(m.sansInsights, false);
    jamaisLeJeton(r);
  }

  // Média sans insights : noté, sans bloquer les autres
  {
    const r = await lancer({
      entrees: [reg("a", "SANS", "2026-10-06T10:00:00Z"), reg("b", "P2", "2026-10-06T11:00:00Z")],
      reglages: { infos: { SANS: STORY("2026-10-06T10:00:00Z"), P2: FEED("2026-10-06T11:00:00Z") }, valeurs: { P2: { reach: 10, likes: 2 } } },
    });
    assert.equal(r.code, 0);
    assert.equal(r.stats.medias.SANS.sansInsights, true);
    assert.deepEqual(r.stats.medias.SANS.metriques, {});
    assert.equal(r.stats.medias.P2.metriques.likes, 2);
  }

  // Jeton invalide : alerte sans bloquer (code 0), jeton masqué, aucun fichier de stats inventé
  {
    const r = await lancer({ entrees: [reg("a", "S1", "2026-10-06T10:00:00Z")], reglages: { jetonInvalide: true } });
    assert.equal(r.code, 0);
    assert.match(r.sortie, /::warning::.*jeton/);
    assert.match(r.resume, /ALERTE/);
    jamaisLeJeton(r);
    assert.equal(r.stats, null);
  }

  // Story relevée le soir puis le lendemain : on garde le maximum de chaque compteur ; au-delà de 24 h : figée, plus d'appel
  {
    const base = { entrees: [reg("aaaaaaaaaaaa", "S3", "2026-10-06T10:00:00Z")], reglages: { infos: { S3: STORY("2026-10-06T10:00:00Z") }, valeurs: { S3: { views: 100, reach: 80 } } } };
    const r1 = await lancer(base);
    assert.equal(r1.stats.medias.S3.metriques.views, 100);
    const r2 = await lancer({ ...base, stats: r1.stats, now: "2026-10-07T06:00:00Z", reglages: { valeurs: { S3: { views: 140, reach: 70 } } } });
    assert.equal(r2.stats.medias.S3.metriques.views, 140);
    assert.equal(r2.stats.medias.S3.metriques.reach, 80, "le maximum est conservé");
    assert.equal(r2.stats.medias.S3.nbReleves, 2);
    const r3 = await lancer({ ...base, stats: r2.stats, now: "2026-10-07T20:00:00Z", reglages: { valeurs: { S3: { views: 0 } } } });
    assert.equal(r3.stats.medias.S3.fige, true);
    assert.equal(r3.stats.medias.S3.metriques.views, 140);
    assert.ok(!appels.some((a) => a.chemin.endsWith("/insights")), "aucun appel pour une story figée");
  }

  // Commentaires : inactifs par défaut ; actifs, ils sont SIGNALÉS (jamais masqués ni répondus), sans texte ni pseudo conservés
  {
    const entrees = [reg("p1", "P3", "2026-10-06T09:00:00Z")];
    const reglages = { infos: { P3: FEED("2026-10-06T09:00:00Z") }, valeurs: { P3: { reach: 10 } }, commentaires: ["Bravo pour ce sujet", "Espèce de connard", "je vais te tuer", "gagne de l'argent sur https://exemple.test"] };
    const r = await lancer({ entrees, config: { commentaires: true }, reglages });
    assert.equal(r.code, 0);
    assert.match(r.rapport, /3 commentaire\(s\) à examiner/);
    assert.match(r.rapport, /menace/); assert.match(r.rapport, /insulte/); assert.match(r.rapport, /spam/);
    assert.ok(!r.rapport.includes("connard") && !r.brut.includes("connard"), "aucun texte de commentaire conservé");
    assert.ok(appels.every((a) => !a.chemin.includes("hide") && !a.chemin.includes("replies")));
    const r2 = await lancer({ entrees, config: { commentaires: false }, reglages });
    assert.ok(!appels.some((a) => a.chemin.endsWith("/comments")));
    assert.ok(!/commentaire/i.test(r2.rapport.replace(/Lecture/g, "")) || !r2.rapport.includes("à examiner"));
  }

  // Fonctions pures du script
  {
    const s = require("../scripts/stats-instagram.cjs");
    assert.equal(s.classerCommentaire("Très bien"), null);
    assert.equal(s.classerCommentaire("TU ES UN CRÉTIN"), "insulte");
    assert.equal(s.etiquetteSemaine(new Date("2026-01-01T12:00:00Z")), "2026-W01");
    assert.equal(s.heureParis(new Date("2026-10-06T10:30:00Z")), 12);
    assert.equal(s.masquer("x access_token=ABC&y=1 Bearer DEF.ghi"), "x access_token=***&y=1 Bearer ***");
  }

  // Recommandations : pas de conclusion sans données ; avec assez de données, un écart net est suggéré ; aucun réglage touché
  {
    const rec = require("../scripts/recommandations.cjs");
    const m = (heure, vues, theme = "autre") => ({ type: "story", heureParis: heure, theme, modele: "actualite", nbMedias: 3, metriques: { views: vues } });
    const peu = rec.construire({ medias: { a: m(12, 100), b: m(18, 50) } });
    assert.match(peu.texte, /Données insuffisantes/); assert.equal(peu.conclusions, 0);
    const medias = {};
    for (let i = 0; i < 5; i++) { medias["m" + i] = m(12, 150); medias["n" + i] = m(18, 100); }
    const bon = rec.construire({ medias });
    assert.match(bon.texte, /vers 12 h .* 50 % de vues de plus/);
    assert.match(bon.texte, /suggestions|rien n'est modifié/);
    assert.ok(bon.conclusions >= 1);
    // fichier : lancé en processus
    const d = mkdtempSync(join(tmpdir(), "rec-"));
    writeFileSync(join(d, "stats.json"), JSON.stringify({ medias }));
    const p = spawnSync(process.execPath, ["scripts/recommandations.cjs"], { env: { ...process.env, STATS_SORTIE: join(d, "stats.json"), STATS_DOCS: join(d, "docs") }, encoding: "utf-8" });
    assert.equal(p.status, 0, p.stderr);
    assert.ok(existsSync(join(d, "docs", "recommandations.md")));
    const absent = spawnSync(process.execPath, ["scripts/recommandations.cjs"], { env: { ...process.env, STATS_SORTIE: join(d, "nexiste.pas"), STATS_DOCS: join(d, "docs2") }, encoding: "utf-8" });
    assert.equal(absent.status, 0);
  }

  // check-data.js : un fichier de stats bien formé passe, un fichier mal formé ou avec jeton / donnée personnelle échoue
  {
    const controle = (contenu) => {
      const d = mkdtempSync(join(tmpdir(), "chk-"));
      writeFileSync(join(d, "stats.json"), contenu);
      return spawnSync(process.execPath, ["scripts/check-data.js"], { env: { ...process.env, CHECK_STATS_FILE: join(d, "stats.json") }, encoding: "utf-8" });
    };
    const bon = { lastUpdated: MAINTENANT, medias: { S1: { type: "story", releveLe: MAINTENANT, publieLe: MAINTENANT, heureParis: 12, metriques: { views: 10 } } }, abonnes: { nombre: 5 } };
    const ok = controle(JSON.stringify(bon));
    assert.ok(/instagram-stats\.json : 1 média/.test(ok.stdout + ok.stderr), ok.stdout + ok.stderr);
    assert.ok(!/instagram-stats\.json[^\n]*(invalide|inconnu|interdite|jeton)/.test(ok.stdout + ok.stderr));
    const mauvais = controle(JSON.stringify({ ...bon, medias: { S1: { ...bon.medias.S1, type: "autre", metriques: { views: -3 } } } }));
    assert.match(mauvais.stdout + mauvais.stderr, /type « autre » inconnu/);
    assert.match(mauvais.stdout + mauvais.stderr, /métrique views invalide/);
    const fuite = controle(JSON.stringify({ ...bon, jeton: "access_token=EAAxxxx" }));
    assert.match(fuite.stdout + fuite.stderr, /ressemble à un jeton/);
    const perso = controle(JSON.stringify({ ...bon, medias: { S1: { ...bon.medias.S1, username: "quelquun" } } }));
    assert.match(perso.stdout + perso.stderr, /donnée personnelle/);
  }

  console.log("stats-instagram : tous les tests passent");
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  serveur.close();
}
