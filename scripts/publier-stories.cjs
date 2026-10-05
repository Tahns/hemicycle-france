#!/usr/bin/env node
/**
 * publier-stories.cjs
 * -------------------
 * Publie AUTOMATIQUEMENT sur Instagram (API officielle Instagram Graph) les stories de la file data/instagram-file.json,
 * sans qu'aucune session Claude ne soit ouverte : lancé par .github/workflows/publier-stories.yml toutes les 15 minutes.
 *
 * Registre : data/instagram-publiees.json  { lastUpdated, entrees: [{ id, statut: "publiee"|"perimee", publieLe, mediaId }] }
 *
 * Garde-fous (tous obligatoires) :
 *  - UNE seule publication par exécution ;
 *  - jamais entre 23 h et 7 h (heure de Paris) ; au plus 4 par jour (Paris) ; au moins 60 min entre deux stories ;
 *  - une entrée créée il y a plus de 3 h est marquée « perimee » et n'est jamais publiée ;
 *  - jamais deux fois le même id (registre) ;
 *  - aucun sondage pendant la réserve électorale (mêmes fonctions que stories-auto.cjs) ;
 *  - data/stories-config.json : validationHumaine à true => rien n'est publié ; monétisation => seules les entrées
 *    « données propres » (sans titre de presse) sont publiables, comme dans la file de stories-auto.cjs ;
 *  - dernier filet de sécurité : une entrée de presse dont un titre contient un mot de la liste prudente (liste durcie depuis la mise en file)
 *    n'est jamais publiée, ni une entrée qui reprend un sujet proche d'une story déjà publiée dans les dernières 24 h ;
 *  - l'image doit être en ligne (HEAD 200 sur l'URL GitHub Pages), sinon nouvel essai au passage suivant ;
 *  - une erreur de l'API ne marque JAMAIS l'entrée comme publiée (nouvel essai au passage suivant, tant qu'elle n'est pas périmée).
 *
 * Secrets (environnement) : IG_USER_ID et IG_ACCESS_TOKEN. Absents : sortie propre, publication automatique inactive.
 * Le jeton n'est jamais affiché (masqué dans tous les messages). Sa validité est contrôlée (debug_token) à chaque passage :
 * alerte dans $GITHUB_STEP_SUMMARY s'il est invalide ou expire dans moins de 10 jours.
 *
 * USAGE : node scripts/publier-stories.cjs [--a-sec]   (--a-sec : tout vérifier, rien envoyer, rien écrire)
 * Variables facultatives (essais) : GRAPH_BASE (défaut https://graph.facebook.com/v21.0), PUBLIER_MAINTENANT (ISO),
 *   PUBLIER_FILE, PUBLIER_REGISTRE, PUBLIER_CONFIG (chemins), PUBLIER_ATTENTE_MS (intervalle de sondage du statut).
 */
const fs = require("fs");
const path = require("path");
const { reserveSondages, parleDeSondage, purgerReserve, purgerPresse, lireConfig, jourParis, heureParis, motExclu, titresProches } = require("./stories-auto.cjs");

const RACINE = path.resolve(__dirname, "..");
const FICHIER_FILE = process.env.PUBLIER_FILE || path.join(RACINE, "data", "instagram-file.json");
const FICHIER_REGISTRE = process.env.PUBLIER_REGISTRE || path.join(RACINE, "data", "instagram-publiees.json");
const FICHIER_CONFIG = process.env.PUBLIER_CONFIG || path.join(RACINE, "data", "stories-config.json");
const GRAPH = (process.env.GRAPH_BASE || "https://graph.facebook.com/v21.0").replace(/\/+$/, "");
const MAX_PAR_JOUR = 4;
const ESPACEMENT_MIN = 60; // minutes minimum entre deux stories publiées (jamais d'enchaînement)
const FRAICHEUR_H = 3;
const ALERTE_JETON_JOURS = 10;
const ATTENTE_MS = Number(process.env.PUBLIER_ATTENTE_MS) || 3000;
const ESSAIS_STATUT = 20;
const GARDER_REGISTRE = 200;

const A_SEC = process.argv.includes("--a-sec");
const IG_USER_ID = (process.env.IG_USER_ID || "").trim();
const IG_ACCESS_TOKEN = (process.env.IG_ACCESS_TOKEN || "").trim();

/** Masque le jeton (et tout ce qui y ressemble) dans un texte destiné aux journaux. */
function masquer(t) {
  let s = String(t);
  if (IG_ACCESS_TOKEN) s = s.split(IG_ACCESS_TOKEN).join("***");
  return s.replace(/(access_token=)[^&\s"']+/gi, "$1***").replace(/(Bearer )[A-Za-z0-9_\-.]+/g, "$1***");
}
const log = (m) => console.log("[publier-stories] " + masquer(m));
function resume(ligne) {
  log(ligne);
  if (process.env.GITHUB_STEP_SUMMARY) try { fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, masquer(ligne) + "\n"); } catch (e) { /* sans résumé */ }
}
function alerte(ligne) {
  console.log("::warning::" + masquer(ligne));
  resume("- ALERTE : " + ligne);
}

const lireJson = (f, defaut) => { try { return JSON.parse(fs.readFileSync(f, "utf-8")); } catch (e) { return defaut; } };

/** Une entrée de presse (ni sondage, ni donnée propre) dont un titre contient un mot de la liste prudente. */
function risque(e) {
  if (e.sondageId || e.donneesPropres === true) return false;
  const titres = e.bref === true ? (Array.isArray(e.sujets) ? e.sujets : []) : [e.titre || ""];
  return titres.some((t) => motExclu(t));
}

/** Choisit l'entrée à publier. Pure : renvoie { entree, perimees } ou { refus, perimees } (perimees : ids à marquer). */
function choisir({ file, registre, config, now = new Date() }) {
  const deja = new Map((registre?.entrees || []).map((e) => [e.id, e]));
  const perimees = [];
  const candidates = [];
  for (const e of [...(file?.entrees || [])].sort((a, b) => String(a.cree).localeCompare(String(b.cree)))) {
    if (!e || e.type !== "story" || !e.id || deja.has(e.id)) continue;
    const t = Date.parse(e.cree);
    if (isNaN(t) || now.getTime() - t > FRAICHEUR_H * 36e5) { perimees.push(e.id); continue; }
    candidates.push(e);
  }
  const sortie = (refus) => ({ refus, perimees });
  if (config.validationHumaine) return sortie("validation humaine activée : rien n'est publié automatiquement");
  const h = heureParis(now);
  if (h >= 23 || h < 7) return sortie(`nuit (${h} h à Paris)`);
  const jour = jourParis(now);
  const publieesJour = [...deja.values()].filter((e) => e.statut === "publiee" && e.publieLe && jourParis(e.publieLe) === jour).length;
  if (publieesJour >= MAX_PAR_JOUR) return sortie(`plafond atteint : ${publieesJour} publication(s) aujourd'hui (maximum ${MAX_PAR_JOUR})`);
  const dernier = Math.max(0, ...[...deja.values()].filter((e) => e.statut === "publiee" && e.publieLe).map((e) => Date.parse(e.publieLe)));
  if (dernier && now.getTime() - dernier < ESPACEMENT_MIN * 60000) return sortie(`dernière publication il y a moins de ${ESPACEMENT_MIN} min`);
  let ok = purgerReserve(candidates, now).filter((e) => !(reserveSondages(now) && parleDeSondage(e.titre || "")));
  if (config.monetisation) ok = purgerPresse(ok);
  const avant = ok.length;
  const dernieres = new Set([...deja.values()].filter((d) => d.statut === "publiee" && d.publieLe && now.getTime() - Date.parse(d.publieLe) < 24 * 36e5).map((d) => d.id));
  const titresPublies = (file?.entrees || []).filter((e) => dernieres.has(e.id)).flatMap((e) => [e.titrePropre, ...(Array.isArray(e.sujets) ? e.sujets : [])]).filter(Boolean);
  ok = ok.filter((e) => !risque(e) && !(e.titrePropre && titresPublies.some((t) => titresProches(t, e.titrePropre))));
  if (ok.length < avant && !ok.length) return sortie("entrée(s) écartée(s) : mot de la liste prudente ou sujet déjà publié dans les dernières 24 h");
  if (!ok.length) return sortie(candidates.length ? `${candidates.length} entrée(s) écartée(s) (réserve électorale ou monétisation)` : "rien à publier");
  return { entree: ok[0], perimees };
}

/** Appel à l'API Graph ; l'erreur levée ne contient jamais le jeton. */
async function graph(methode, chemin, params = {}) {
  const url = new URL(GRAPH + chemin);
  const opts = { method: methode, headers: { Authorization: "Bearer " + IG_ACCESS_TOKEN }, signal: AbortSignal.timeout(60000) };
  if (methode === "POST") opts.body = new URLSearchParams({ ...params, access_token: IG_ACCESS_TOKEN });
  else for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  let r, texte;
  try { r = await fetch(url, opts); texte = await r.text(); } catch (e) { throw new Error(`réseau : ${masquer(e.message)}`); }
  let json = {};
  try { json = JSON.parse(texte); } catch (e) { /* réponse non JSON */ }
  if (!r.ok || json.error) throw new Error(`API ${r.status} : ${masquer(json.error?.message || texte.slice(0, 200))}`);
  return json;
}

/** Contrôle du jeton : { valide, expireLe, jours } ; alerte dans le résumé s'il est invalide ou proche de l'expiration. */
async function controlerJeton(now) {
  let d;
  try {
    d = (await graph("GET", "/debug_token", { input_token: IG_ACCESS_TOKEN })).data;
  } catch (e) {
    // debug_token peut être refusé selon le type de jeton : repli sur /me (validité seule)
    try { await graph("GET", "/me", { fields: "id" }); return { valide: true, expireLe: null, jours: null }; }
    catch (e2) { alerte(`le jeton Instagram est invalide ou inutilisable (${e2.message}). Générez-en un nouveau (docs/PUBLICATION-AUTO.md).`); return { valide: false, expireLe: null, jours: null }; }
  }
  if (!d || d.is_valid === false) { alerte("le jeton Instagram est invalide ou expiré. Générez-en un nouveau (docs/PUBLICATION-AUTO.md)."); return { valide: false, expireLe: null, jours: null }; }
  const exp = d.expires_at ? new Date(d.expires_at * 1000) : null; // 0 ou absent : n'expire pas
  const jours = exp ? (exp.getTime() - now.getTime()) / 864e5 : null;
  if (jours !== null && jours < 0) { alerte("le jeton Instagram a expiré. Générez-en un nouveau (docs/PUBLICATION-AUTO.md)."); return { valide: false, expireLe: exp, jours }; }
  if (jours !== null && jours < ALERTE_JETON_JOURS) alerte(`le jeton Instagram expire dans ${Math.ceil(jours)} jour(s) (le ${exp.toISOString().slice(0, 10)}). Renouvelez-le (docs/PUBLICATION-AUTO.md).`);
  return { valide: true, expireLe: exp, jours };
}

/** Publie une story : conteneur STORIES, attente du statut FINISHED, puis media_publish. Renvoie l'identifiant du média. */
async function publier(entree) {
  const cree = await graph("POST", `/${IG_USER_ID}/media`, { media_type: "STORIES", image_url: entree.url_image });
  const creation = cree.id;
  if (!creation) throw new Error("API : pas d'identifiant de conteneur");
  let statut = "";
  for (let i = 0; i < ESSAIS_STATUT; i++) {
    statut = (await graph("GET", `/${creation}`, { fields: "status_code" })).status_code;
    if (statut === "FINISHED") break;
    if (statut === "ERROR" || statut === "EXPIRED") throw new Error(`conteneur en statut ${statut}`);
    await new Promise((r) => setTimeout(r, ATTENTE_MS));
  }
  if (statut !== "FINISHED") throw new Error(`conteneur pas prêt (statut ${statut || "inconnu"})`);
  const pub = await graph("POST", `/${IG_USER_ID}/media_publish`, { creation_id: creation });
  if (!pub.id) throw new Error("API : media_publish sans identifiant");
  return pub.id;
}

async function imageEnLigne(url) {
  try { const r = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(20000) }); return r.status === 200; } catch (e) { return false; }
}

function ecrireRegistre(registre, now) {
  registre.lastUpdated = now.toISOString();
  registre.entrees = registre.entrees.slice(-GARDER_REGISTRE);
  fs.writeFileSync(FICHIER_REGISTRE, JSON.stringify(registre, null, 1) + "\n");
}

async function main() {
  const now = process.env.PUBLIER_MAINTENANT ? new Date(process.env.PUBLIER_MAINTENANT) : new Date();
  if (!IG_USER_ID || !IG_ACCESS_TOKEN) return resume("Publication automatique inactive : secrets absents (IG_USER_ID, IG_ACCESS_TOKEN). Voir docs/PUBLICATION-AUTO.md.");
  if (A_SEC) log("mode --a-sec : rien ne sera envoyé ni écrit.");
  const jeton = await controlerJeton(now);
  const registre = lireJson(FICHIER_REGISTRE, null) || { entrees: [] };
  if (!Array.isArray(registre.entrees)) registre.entrees = [];
  const config = lireConfig(FICHIER_CONFIG);
  const file = lireJson(FICHIER_FILE, { entrees: [] });
  const c = choisir({ file, registre, config, now });

  if (c.perimees.length) {
    log(`entrée(s) périmée(s) (plus de ${FRAICHEUR_H} h), jamais publiées : ${c.perimees.join(", ")}`);
    if (!A_SEC) for (const id of c.perimees) registre.entrees.push({ id, statut: "perimee", publieLe: null, mediaId: null });
  }
  const finir = () => { if (!A_SEC && c.perimees.length) ecrireRegistre(registre, now); };
  if (!c.entree) { log(`rien à publier : ${c.refus}`); finir(); return; }
  if (!jeton.valide) { log("jeton invalide : aucune publication."); finir(); return; }
  const e = c.entree;
  if (!(await imageEnLigne(e.url_image))) { log(`image pas encore en ligne (${e.url_image}) : nouvel essai au prochain passage.`); finir(); return; }
  if (A_SEC) { resume(`À sec : l'entrée ${e.id} (« ${e.titre} ») serait publiée en story.`); return; }
  finir(); // les périmées sont enregistrées même si la publication échoue
  try {
    const mediaId = await publier(e);
    registre.entrees.push({ id: e.id, statut: "publiee", publieLe: now.toISOString(), mediaId });
    ecrireRegistre(registre, now); // écrit tout de suite : un échec ultérieur du workflow ne doit pas provoquer de doublon
    resume(`Story publiée : « ${e.titre} » (média ${mediaId}).`);
  } catch (err) {
    alerte(`échec de publication de l'entrée ${e.id} : ${err.message}. Nouvel essai au prochain passage tant qu'elle n'est pas périmée.`);
  }
}

module.exports = { choisir, masquer };
if (require.main === module) main().catch((e) => { console.error("[publier-stories]", masquer(e.message)); process.exit(1); });
