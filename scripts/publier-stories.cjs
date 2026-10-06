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
 *  - jamais entre 23 h et 7 h (heure de Paris) ; au plus 4 stories et 2 posts par jour (Paris) ; au moins 60 min entre deux publications ;
 *  - POST (entrée { type: "post", legende }) : image de fil + légende (POST /media {image_url, caption}), légende contrôlée (2 200 caractères, 30 hashtags, jamais le lien du site) ;
 *    STORY D'ANNONCE (entrée { annonceDe: id du post }) : publiée seulement APRÈS son post, au plus tôt 5 min après (seule exception aux 60 min), au plus tard 3 h après ;
 *    elle ne compte pas dans les 4 stories par jour ;
 *  - une story créée il y a plus de 3 h (un post : plus de 12 h) est marquée « perimee » et n'est jamais publiée ;
 *  - jamais deux fois le même id (registre) ;
 *  - aucun sondage pendant la réserve électorale (mêmes fonctions que stories-auto.cjs) ;
 *  - data/stories-config.json : validationHumaine à true => rien n'est publié ; monétisation => seules les entrées
 *    « données propres » (sans titre de presse) sont publiables, comme dans la file de stories-auto.cjs ;
 *  - dernier filet de sécurité : une entrée de presse dont un titre contient un mot de la liste prudente (liste durcie depuis la mise en file)
 *    n'est jamais publiée, ni une entrée qui reprend un sujet proche d'une story déjà publiée dans les dernières 24 h ;
 *  - VIDÉOS (data/stories-config.json : "videos": true, "videosMax" par jour ; sinon tout reste en image) :
 *    story vidéo (entrée avec url_video : POST /media {media_type: "STORIES", video_url}) avec REPLI SUR L'IMAGE si la vidéo n'est pas en ligne
 *    (HEAD 200, video/mp4) ou si l'API la refuse AVANT media_publish ; REEL (entrée { type: "reel", reelDe: id du post, legende, url_video } :
 *    {media_type: "REELS", video_url, caption, share_to_feed: true}) publié seulement APRÈS son post (au plus 12 h après), avec l'espacement de 60 min,
 *    sans repli (abandon : le Reel n'est jamais publié en double) ; au plus videosMax Reels par jour, hors plafonds des stories et des posts ;
 *    attente du statut FINISHED jusqu'à ~5 min (délai croissant) puis media_publish. Registre inchangé en cas d'échec avant media_publish.
 *  - l'image doit être en ligne (HEAD 200 sur l'URL GitHub Pages), sinon nouvel essai au passage suivant ;
 *  - une erreur de l'API ne marque JAMAIS l'entrée comme publiée (nouvel essai au passage suivant, tant qu'elle n'est pas périmée).
 *
 * Secrets (environnement) : IG_USER_ID et IG_ACCESS_TOKEN. Absents : sortie propre, publication automatique inactive.
 * Le jeton n'est jamais affiché (masqué dans tous les messages). Sa validité est contrôlée (debug_token) à chaque passage :
 * alerte dans $GITHUB_STEP_SUMMARY s'il est invalide ou expire dans moins de 10 jours.
 *
 * USAGE : node scripts/publier-stories.cjs [--a-sec]   (--a-sec : tout vérifier, rien envoyer, rien écrire)
 * Variables facultatives (essais) : GRAPH_BASE (défaut https://graph.instagram.com/v21.0), PUBLIER_MAINTENANT (ISO),
 *   PUBLIER_FILE, PUBLIER_REGISTRE, PUBLIER_CONFIG (chemins), PUBLIER_ATTENTE_MS (intervalle de sondage du statut).
 */
const fs = require("fs");
const path = require("path");
const { reserveSondages, parleDeSondage, purgerReserve, purgerPresse, lireConfig, jourParis, heureParis, motExclu, titresProches } = require("./stories-auto.cjs");

const RACINE = path.resolve(__dirname, "..");
const FICHIER_FILE = process.env.PUBLIER_FILE || path.join(RACINE, "data", "instagram-file.json");
const FICHIER_REGISTRE = process.env.PUBLIER_REGISTRE || path.join(RACINE, "data", "instagram-publiees.json");
const FICHIER_CONFIG = process.env.PUBLIER_CONFIG || path.join(RACINE, "data", "stories-config.json");
const GRAPH = (process.env.GRAPH_BASE || "https://graph.instagram.com/v21.0").replace(/\/+$/, "");
const MAX_PAR_JOUR_DEFAUT = 4; // stories par jour (hors stories d'annonce de post) ; réglable par data/stories-config.json (« maxParJour », 1 à 8)
const MAX_POSTS_PAR_JOUR = 2; // posts (fil) par jour
const ESPACEMENT_ANNONCE_MIN = 5; // une story d'annonce sort au plus tôt 5 min après son post (seule exception à l'espacement de 60 min)
const FRAICHEUR_POST_H = 12; // un post non publié depuis plus de 12 h est périmé (une date lointaine ou un vote ne se périment pas en 3 h)
const ESPACEMENT_MIN = 60; // minutes minimum entre deux stories publiées (jamais d'enchaînement)
const FRAICHEUR_H = 3;
const ALERTE_JETON_JOURS = 10;
const ATTENTE_MS = Number(process.env.PUBLIER_ATTENTE_MS) || 3000;
const ESSAIS_STATUT = 20;
const ATTENTE_VIDEO_MAX_MS = Number(process.env.PUBLIER_VIDEO_MAX_MS) || 5 * 60 * 1000; // une vidéo met plus de temps à être traitée
const MAX_REELS_PAR_JOUR_DEFAUT = 2;
const GARDER_REGISTRE = 200;
const FENETRE_DOUBLON_H = 36; // un sujet proche d'une story publiée depuis moins de 36 h est refusé

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

/** Légende d'un post : texte non vide, 2 200 caractères au plus, 30 hashtags au plus, le compte cité, jamais l'adresse du site. */
function legendeValide(e) {
  const l = e.legende;
  if (typeof l !== "string" || l.length < 20 || l.length > 2200) return false;
  if ((l.match(/#\p{L}[\p{L}\p{N}_]*/gu) || []).length > 30) return false;
  if (/github\.io|hemicycle-france|hémicycle-france\.|https?:\/\/(www\.)?hemicycle/i.test(l)) return false;
  return l.includes("@hemicyclefrance");
}

/** Une entrée dont le contenu est à risque : mot de la liste prudente (presse ou post), légende de post invalide. */
function risque(e) {
  if (e.sondageId) return false;
  const post = e.type === "post" || e.type === "reel" || Boolean(e.annonceDe);
  if ((e.type === "post" || e.type === "reel") && !legendeValide(e)) return true;
  if (e.donneesPropres === true && !post) return false;
  const titres = e.bref === true ? (Array.isArray(e.sujets) ? e.sujets : []) : [e.titre || "", ...(post ? [e.titrePropre || ""] : [])];
  return titres.some((t) => motExclu(t));
}
const estPost = (e) => e.type === "post";
const estAnnonce = (e) => Boolean(e.annonceDe);
const estReel = (e) => e.type === "reel";

/**
 * Choisit l'entrée à publier. Pure : renvoie { entree, perimees } ou { refus, perimees } (perimees : ids à marquer).
 * Trois sortes d'entrées : story, post (fil, légende) et story d'annonce d'un post (champ annonceDe) ; voir l'en-tête du fichier.
 */
function choisir({ file, registre, config, now = new Date() }) {
  const deja = new Map((registre?.entrees || []).map((e) => [e.id, e]));
  const perimees = [];
  const candidates = [];
  const entreesFile = [...(file?.entrees || [])].filter((e) => e && (e.type === "story" || e.type === "post" || (e.type === "reel" && config.videos === true && e.url_video)) && e.id && !deja.has(e.id)).sort((a, b) => String(a.cree).localeCompare(String(b.cree)));
  // 1. posts et stories : périmées après 3 h (story) ou 12 h (post)
  for (const e of entreesFile.filter((x) => !estAnnonce(x) && !estReel(x))) {
    const t = Date.parse(e.cree);
    if (isNaN(t) || now.getTime() - t > (estPost(e) ? FRAICHEUR_POST_H : FRAICHEUR_H) * 36e5) { perimees.push(e.id); continue; }
    candidates.push(e);
  }
  // 2. stories d'annonce : liées à la publication de leur post (au plus tôt 5 min après, au plus tard 3 h après) ; en attente tant que le post n'est pas sorti
  let enAttente = 0;
  for (const e of entreesFile.filter(estAnnonce)) {
    const parent = deja.get(e.annonceDe);
    if (parent?.statut === "perimee" || perimees.includes(e.annonceDe)) { perimees.push(e.id); continue; }
    if (parent?.statut === "publiee" && parent.publieLe) {
      const age = now.getTime() - Date.parse(parent.publieLe);
      if (age > FRAICHEUR_H * 36e5) { perimees.push(e.id); continue; }
      if (age < ESPACEMENT_ANNONCE_MIN * 60000) { enAttente++; continue; }
      candidates.push(e);
      continue;
    }
    const t = Date.parse(e.cree);
    if (isNaN(t) || now.getTime() - t > (FRAICHEUR_POST_H + FRAICHEUR_H) * 36e5) perimees.push(e.id); else enAttente++; // post pas encore publié
  }
  // 2 bis. Reels : liés à la publication de leur post (jamais avant lui, au plus 12 h après), ensuite soumis à l'espacement de 60 min comme tout le reste
  for (const e of entreesFile.filter(estReel)) {
    const parent = deja.get(e.reelDe);
    if (parent?.statut === "perimee" || perimees.includes(e.reelDe)) { perimees.push(e.id); continue; }
    if (parent?.statut === "publiee" && parent.publieLe) {
      if (now.getTime() - Date.parse(parent.publieLe) > FRAICHEUR_POST_H * 36e5) perimees.push(e.id); else candidates.push(e);
      continue;
    }
    const t = Date.parse(e.cree);
    if (isNaN(t) || now.getTime() - t > 2 * FRAICHEUR_POST_H * 36e5) perimees.push(e.id); else enAttente++; // post pas encore publié
  }
  // les annonces d'abord (leur fenêtre est courte), puis l'ordre de création
  candidates.sort((a, b) => Number(estAnnonce(b)) - Number(estAnnonce(a)) || String(a.cree).localeCompare(String(b.cree)));
  const sortie = (refus) => ({ refus, perimees });
  if (config.validationHumaine) return sortie("validation humaine activée : rien n'est publié automatiquement");
  const h = heureParis(now);
  if (h >= 23 || h < 7) return sortie(`nuit (${h} h à Paris)`);
  const jour = jourParis(now);
  const publieesJour = [...deja.values()].filter((e) => e.statut === "publiee" && e.publieLe && jourParis(e.publieLe) === jour);
  const postsJour = publieesJour.filter(estPost).length;
  const reelsJour = publieesJour.filter(estReel).length;
  const maxReels = Number.isInteger(config.videosMax) ? config.videosMax : MAX_REELS_PAR_JOUR_DEFAUT;
  const storiesJour = publieesJour.filter((e) => !estPost(e) && !estReel(e) && !e.annonceDe).length; // les stories d'annonce n'entrent pas dans le plafond des stories
  const MAX_PAR_JOUR = Number.isInteger(config.maxParJour) && config.maxParJour >= 1 && config.maxParJour <= 8 ? config.maxParJour : MAX_PAR_JOUR_DEFAUT;
  const sousPlafond = (e) => (estAnnonce(e) ? true : estReel(e) ? reelsJour < maxReels : estPost(e) ? postsJour < MAX_POSTS_PAR_JOUR : storiesJour < MAX_PAR_JOUR);
  if (candidates.length && !candidates.some(sousPlafond)) return sortie(`plafond atteint : ${storiesJour} story(ies) et ${postsJour} post(s) aujourd'hui (maximum ${MAX_PAR_JOUR} et ${MAX_POSTS_PAR_JOUR})`);
  let ok = candidates.filter(sousPlafond);
  // Espacement : 60 min entre deux publications ; seule exception, la story d'annonce d'un post (≥ 5 min après CE post)
  const publiees = [...deja.values()].filter((e) => e.statut === "publiee" && e.publieLe);
  const dernier = publiees.reduce((m, e) => (Date.parse(e.publieLe) > (m ? Date.parse(m.publieLe) : 0) ? e : m), null);
  if (dernier && now.getTime() - Date.parse(dernier.publieLe) < ESPACEMENT_MIN * 60000) {
    const ok2 = ok.filter((e) => estAnnonce(e) && e.annonceDe === dernier.id);
    if (!ok2.length) return sortie(ok.length ? `dernière publication il y a moins de ${ESPACEMENT_MIN} min` : (enAttente ? `story d'annonce en attente (${ESPACEMENT_ANNONCE_MIN} min après son post)` : "rien à publier"));
    ok = ok2;
  }
  if (!ok.length) return sortie(enAttente ? `story d'annonce en attente (${ESPACEMENT_ANNONCE_MIN} min après son post)` : "rien à publier");
  const candidatesBrutes = ok.length;
  ok = purgerReserve(ok, now).filter((e) => !(reserveSondages(now) && parleDeSondage(e.titre || "")));
  if (config.monetisation) ok = purgerPresse(ok);
  const avant = ok.length;
  const recentes = publiees.filter((d) => now.getTime() - Date.parse(d.publieLe) < FENETRE_DOUBLON_H * 36e5);
  const dernieres = new Set(recentes.map((d) => d.id));
  // Titres déjà publiés : ceux du registre (conservés même quand l'entrée a quitté la file) et ceux de la file
  const titresPublies = [
    ...recentes.flatMap((d) => [d.titre, ...(Array.isArray(d.sujets) ? d.sujets : [])]),
    ...(file?.entrees || []).filter((e) => dernieres.has(e.id)).flatMap((e) => [e.titrePropre, ...(Array.isArray(e.sujets) ? e.sujets : [])]),
  ].filter(Boolean);
  const dejaTraite = (e) => !estAnnonce(e) && !estReel(e) && [e.titrePropre, e.titre].filter(Boolean).some((t) => titresPublies.some((p) => titresProches(p, t)));
  ok = ok.filter((e) => !risque(e) && !dejaTraite(e));
  if (ok.length < avant && !ok.length) return sortie("entrée(s) écartée(s) : mot de la liste prudente, légende invalide ou sujet déjà publié dans les dernières 36 h");
  if (!ok.length) return sortie(candidatesBrutes ? `${candidatesBrutes} entrée(s) écartée(s) (réserve électorale ou monétisation)` : "rien à publier");
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

/**
 * Publie un média : crée le conteneur, attend le statut FINISHED, puis media_publish. Renvoie l'identifiant du média.
 * `mode` : "story-image", "story-video", "post" ou "reel". Une erreur levée AVANT media_publish porte avantPublication = true (repli possible, rien n'est publié).
 */
async function publier(entree, mode = estPost(entree) ? "post" : estReel(entree) ? "reel" : "story-image") {
  const video = mode === "story-video" || mode === "reel";
  const params = { post: { image_url: entree.url_image, caption: entree.legende }, "story-image": { media_type: "STORIES", image_url: entree.url_image },
    "story-video": { media_type: "STORIES", video_url: entree.url_video },
    reel: { media_type: "REELS", video_url: entree.url_video, caption: entree.legende, share_to_feed: "true", thumb_offset: "4500" } }[mode];
  let creation;
  try {
    const cree = await graph("POST", `/${IG_USER_ID}/media`, params);
    creation = cree.id;
    if (!creation) throw new Error("API : pas d'identifiant de conteneur");
    let statut = "", essais = 0, delai = ATTENTE_MS;
    const limite = Date.now() + (video ? ATTENTE_VIDEO_MAX_MS : Infinity);
    for (;;) {
      statut = (await graph("GET", `/${creation}`, { fields: "status_code" })).status_code;
      if (statut === "FINISHED") break;
      if (statut === "ERROR" || statut === "EXPIRED") throw new Error(`conteneur en statut ${statut}`);
      essais++;
      if (video ? Date.now() + delai > limite : essais >= ESSAIS_STATUT) throw new Error(`conteneur pas prêt (statut ${statut || "inconnu"})`);
      await new Promise((r) => setTimeout(r, delai));
      if (video) delai = Math.min(Math.round(delai * 1.5), ATTENTE_MS * 10); // 3 s, 4,5 s, … jusqu'à 30 s
    }
  } catch (err) { err.avantPublication = true; throw err; }
  const pub = await graph("POST", `/${IG_USER_ID}/media_publish`, { creation_id: creation });
  if (!pub.id) throw new Error("API : media_publish sans identifiant");
  return pub.id;
}

/** La ressource est-elle en ligne (HEAD 200) ? `type` : préfixe de Content-Type exigé (vidéo : video/mp4). */
async function enLigne(url, type = null) {
  try {
    const r = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(20000) });
    return r.status === 200 && (!type || String(r.headers.get("content-type") || "").toLowerCase().startsWith(type));
  } catch (e) { return false; }
}
const imageEnLigne = (url) => enLigne(url);

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
    if (!A_SEC) for (const id of c.perimees) registre.entrees.push({ id, statut: "perimee", publieLe: null, mediaId: null, type: (file.entrees.find((x) => x.id === id) || {}).type || "story" });
  }
  const finir = () => { if (!A_SEC && c.perimees.length) ecrireRegistre(registre, now); };
  if (!c.entree) { log(`rien à publier : ${c.refus}`); finir(); return; }
  if (!jeton.valide) { log("jeton invalide : aucune publication."); finir(); return; }
  const e = c.entree;
  // Mode de publication : le Reel est toujours une vidéo ; une story avec url_video n'est vidéo que si "videos" est activé et la vidéo en ligne (HEAD 200, video/mp4), sinon image
  let mode = estPost(e) ? "post" : estReel(e) ? "reel" : "story-image";
  if (estReel(e) && !(await enLigne(e.url_video, "video/mp4"))) { log(`vidéo pas encore en ligne (${e.url_video}) : nouvel essai au prochain passage.`); finir(); return; }
  if (mode === "story-image" && e.url_video && config.videos === true) {
    if (await enLigne(e.url_video, "video/mp4")) mode = "story-video"; else log(`vidéo absente ou de type inattendu (${e.url_video}) : la story partira en image.`);
  }
  if (mode !== "reel" && mode !== "story-video" && !(await imageEnLigne(e.url_image))) { log(`image pas encore en ligne (${e.url_image}) : nouvel essai au prochain passage.`); finir(); return; }
  const nom = { post: "post", reel: "Reel", "story-image": "story", "story-video": "story vidéo" };
  if (A_SEC) { resume(`À sec : l'entrée ${e.id} (« ${e.titre} ») serait publiée en ${nom[mode]}.`); return; }
  finir(); // les périmées sont enregistrées même si la publication échoue
  try {
    let mediaId;
    try {
      mediaId = await publier(e, mode);
    } catch (err) {
      // Repli sur l'image : seulement pour une story vidéo, seulement si l'échec précède media_publish (rien n'a été publié, donc aucun doublon)
      if (mode !== "story-video" || !err.avantPublication) throw err;
      alerte(`la vidéo de l'entrée ${e.id} a échoué (${err.message}) : repli sur l'image.`);
      if (!(await imageEnLigne(e.url_image))) throw new Error("image pas en ligne pour le repli");
      mode = "story-image";
      mediaId = await publier(e, mode);
    }
    registre.entrees.push({ id: e.id, statut: "publiee", publieLe: now.toISOString(), mediaId, titre: e.titrePropre || e.titre || null, type: estPost(e) ? "post" : estReel(e) ? "reel" : "story", ...(mode.endsWith("video") || mode === "reel" ? { video: true } : {}), ...(e.annonceDe ? { annonceDe: e.annonceDe } : {}), ...(e.reelDe ? { reelDe: e.reelDe } : {}), ...(e.dateIso ? { dateIso: e.dateIso } : {}), sujets: Array.isArray(e.sujets) ? e.sujets.slice(0, 8) : undefined });
    ecrireRegistre(registre, now); // écrit tout de suite : un échec ultérieur du workflow ne doit pas provoquer de doublon
    resume(`${mode === "post" ? "Post publié" : mode === "reel" ? "Reel publié" : e.annonceDe ? "Story d'annonce publiée" : mode === "story-video" ? "Story vidéo publiée" : "Story publiée"} : « ${e.titre} » (média ${mediaId}).`);
  } catch (err) {
    alerte(`échec de publication de l'entrée ${e.id} : ${err.message}. Nouvel essai au prochain passage tant qu'elle n'est pas périmée.`);
  }
}

module.exports = { choisir, masquer };
if (require.main === module) main().catch((e) => { console.error("[publier-stories]", masquer(e.message)); process.exit(1); });
