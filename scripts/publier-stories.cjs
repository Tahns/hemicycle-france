#!/usr/bin/env node
/**
 * publier-stories.cjs
 * -------------------
 * Publie AUTOMATIQUEMENT sur Instagram (API officielle Instagram Graph) les stories de la file data/instagram-file.json,
 * sans qu'aucune session Claude ne soit ouverte : lancé par .github/workflows/publier-stories.yml toutes les 15 minutes.
 *
 * Registre : data/instagram-publiees.json  { lastUpdated, entrees: [{ id, statut: "publiee"|"perimee"|"en-cours"|"incertaine", publieLe, mediaId }] }
 *   « en-cours » : intention écrite AVANT media_publish ; « incertaine » : réponse perdue ou job tué, publication possible non confirmée (comptée dans les plafonds, JAMAIS rejouée) ;
 *   après une erreur ambiguë (timeout, 5xx), on cherche la publication côté Instagram (/stories ou /media) avant de conclure. ÉCHEC FERMÉ : registre ou configuration illisibles = rien ne part, code de sortie 1.
 *   data/instagram-retires.json : contenus retirés, jamais republiés, texte jamais repris (scripts/retires.cjs).
 *
 * Garde-fous (tous obligatoires) :
 *  - UNE seule publication par exécution ;
 *  - jamais entre 23 h et 7 h (heure de Paris) ; au plus 4 stories et 2 posts par jour (Paris) ; au moins 60 min entre deux publications ;
 *  - POST (entrée { type: "post", legende }) : image de fil + légende (POST /media {image_url, caption}), légende contrôlée (2 200 caractères, 30 hashtags, jamais le lien du site) ;
 *    STORY D'ANNONCE (entrée { annonceDe: id du post }) : publiée seulement APRÈS son post, au plus tôt 5 min après (seule exception aux 60 min), au plus tard 3 h après ;
 *    elle ne compte pas dans les 4 stories par jour ;
 *  - une story créée il y a plus de 6 h (un post : plus de 12 h) est marquée « perimee » et n'est jamais publiée ;
 *  - jamais deux fois le même id (registre) ;
 *  - aucun sondage pendant la réserve électorale (mêmes fonctions que stories-auto.cjs) ;
 *  - SUJETS SENSIBLES (scripts/sujets-sensibles.cjs) : une entrée { sensible: 1 } (fait judiciaire établi) n'est publiée que si son texte passe encore formulationSure
 *    (2 médias, juridiction, aucun nom, aucun verbe qui accuse) ; une entrée { sensible: 2 } n'est JAMAIS publiée sans valideHumain + valideLe (workflow « Valider un brouillon ») ;
 *  - data/stories-config.json : validationHumaine à true => rien n'est publié, sauf les entrées validées par un humain (valideHumain) ; monétisation => seules les entrées
 *    « données propres » (sans titre de presse) sont publiables, comme dans la file de stories-auto.cjs ;
 *  - dernier filet de sécurité : une entrée de presse dont un titre contient un mot de la liste prudente (liste durcie depuis la mise en file)
 *    n'est jamais publiée, ni une entrée qui reprend un sujet proche d'une story déjà publiée dans les dernières 24 h ;
 *  - VIDÉOS (data/stories-config.json : "videos": true, "videosMax" par jour ; sinon tout reste en image) :
 *    story vidéo (entrée avec url_video : POST /media {media_type: "STORIES", video_url}) avec REPLI SUR L'IMAGE si la vidéo n'est pas en ligne
 *    (HEAD 200, video/mp4) ou si l'API la refuse AVANT media_publish ; REEL (entrée { type: "reel", reelDe: id du post, legende, url_video } :
 *    {media_type: "REELS", video_url, caption, share_to_feed: true}) publié seulement APRÈS son post (au plus 12 h après), avec l'espacement de 60 min,
 *    sans repli (abandon : le Reel n'est jamais publié en double) ; au plus videosMax Reels par jour, hors plafonds des stories et des posts ;
 *    attente du statut FINISHED jusqu'à ~5 min (délai croissant) puis media_publish. Registre inchangé en cas d'échec avant media_publish.
 *  - CONTENUS RÉCURRENTS (scripts/contenus-auto.cjs : « Aujourd'hui à l'Assemblée », « vote du jour », « Comprendre », « chiffre du jour », carrousels) :
 *    chaque entrée porte « contenu », « pasAvant » (pas publiée avant cette heure : créneau utile) et « expire » (jamais publiée après) ; une entrée à créneau passe avant
 *    les actualités dès que son heure est venue, et ne compte pas dans le plafond des stories (maxParJour) ; mêmes garde-fous que le reste (registre, nuit, 60 min, réserve, mots à risque) ;
 *  - CARROUSEL (entrée { type: "carousel", url_images, legende, alts }) : scripts/carrousel.cjs (enfants is_carousel_item, conteneur CAROUSEL, statut FINISHED, media_publish) ;
 *    compte dans le plafond des 2 posts par jour ; échec avant media_publish = nouvel essai ; échec de media_publish lui-même = ABANDON (jamais de doublon) ;
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
const { validerCarrousel, publierCarrousel } = require("./carrousel.cjs");
const { reserveStory, parleDeSondage, purgerReserve, purgerPresse, lireConfig, jourParis, heureParis, motExclu, OFF, titresProches } = require("./stories-auto.cjs");
const SS = require("./sujets-sensibles.cjs");
const { lireRetiresSur } = require("./retires.cjs"); // contenus retirés : jamais republiés, texte jamais repris (audit J-23)

const RACINE = path.resolve(__dirname, "..");
const FICHIER_FILE = process.env.PUBLIER_FILE || path.join(RACINE, "data", "instagram-file.json");
const FICHIER_REGISTRE = process.env.PUBLIER_REGISTRE || path.join(RACINE, "data", "instagram-publiees.json");
const FICHIER_CONFIG = process.env.PUBLIER_CONFIG || path.join(RACINE, "data", "stories-config.json");
const GRAPH = (process.env.GRAPH_BASE || "https://graph.instagram.com/v21.0").replace(/\/+$/, "");
const MAX_PAR_JOUR_DEFAUT = 4; // stories par jour (hors stories d'annonce de post) ; réglable par data/stories-config.json (« maxParJour », 1 à 99 ; 99 = pas de plafond)
const MAX_POSTS_PAR_JOUR = 2; // posts (fil) par jour
const ESPACEMENT_ANNONCE_MIN = 180; // la story d'annonce peut sortir dès que son post est publié
const FRAICHEUR_POST_H = 12; // un post non publié depuis plus de 12 h est périmé (une date lointaine ou un vote ne se périment pas en 3 h)
const REELS_ACTIFS = process.env.HEMICYCLE_TEST_REELS === "1"; // décision du propriétaire : aucun Reel, jamais (les Reels déjà en file ne sont pas publiés) ; la variable ne sert qu'aux tests du code Reel
const ESPACEMENT_MIN = 0; // aucun espacement : tout ce qui est à publier sort (au plus une publication par passage, un passage toutes les 15 min environ), de 7 h à 23 h
const FRAICHEUR_H = 6; // une story non publiée depuis plus de 6 h est périmée (avec 1 publication par heure, 3 h laissait périmer trop de stories)
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
function alerte(ligne, { echec = false } = {}) {
  console.log((echec ? "::error::" : "::warning::") + masquer(ligne));
  resume("- ALERTE : " + ligne);
  if (echec) process.exitCode = 1; // visible : pastille rouge et courriel GitHub ; le workflow commite le registre malgré tout (« if: always() »)
}

const lireJson = (f, defaut) => { try { return JSON.parse(fs.readFileSync(f, "utf-8")); } catch (e) { return defaut; } };
/**
 * Lecture ÉCHEC FERMÉ d'un fichier JSON : { absent: true } si le fichier n'existe pas (première exécution), { erreur } s'il existe mais ne se lit pas
 * (JSON tronqué, conflit de fusion, type inattendu), sinon { valeur }. Un registre illisible ne vaut jamais « registre vide » : plus d'anti-doublon ni de plafond (audit A-02).
 */
function lireStrict(f, attendu = "objet") {
  let brut;
  try { brut = fs.readFileSync(f, "utf-8"); } catch (e) { return e.code === "ENOENT" ? { absent: true } : { erreur: e.message }; }
  try {
    const v = JSON.parse(brut);
    if (!v || typeof v !== "object" || Array.isArray(v)) return { erreur: "le contenu n'est pas un objet JSON" };
    return { valeur: v };
  } catch (e) { return { erreur: e.message }; }
}
// Statuts du registre : « publiee », « perimee », « en-cours » (intention écrite AVANT media_publish), « incertaine » (publication possible mais non confirmée : jamais rejouée)
const STATUTS_COMPTES = new Set(["publiee", "incertaine", "en-cours"]);
const enregistree = (e) => STATUTS_COMPTES.has(e.statut) && e.publieLe; // compte dans les plafonds, l'espacement et la détection de sujets proches
const typeDe = (e) => (e.type === "post" ? "post" : e.type === "carousel" ? "carousel" : e.type === "reel" ? "reel" : "story");

/** Légende d'un post : texte non vide, 2 200 caractères au plus, 30 hashtags au plus, le compte cité, jamais l'adresse du site. */
function legendeValide(e) {
  const l = e.legende;
  if (typeof l !== "string" || l.length < 20 || l.length > 2200) return false;
  if ((l.match(/#\p{L}[\p{L}\p{N}_]*/gu) || []).length > 30) return false;
  if (/github\.io|hemicycle-france|hémicycle-france\.|https?:\/\/(www\.)?hemicycle/i.test(l)) return false;
  return l.includes("@hemicyclefrance");
}

/** Niveau 1 : au moins 2 médias, une juridiction, aucun nom de personne, formulation sûre (aucun verbe qui accuse), aucun mineur ni fait divers dans les titres de presse. */
function niveau1Sur(e) {
  if (e.type !== "story" || !Array.isArray(e.medias) || e.medias.length < 2 || typeof e.juridiction !== "string" || !e.juridiction || e.nommePersonne === true) return false;
  const texte = [e.titre, e.titrePropre, e.pied, e.alt].filter(Boolean).join(" ");
  return SS.formulationSure(texte, { juridiction: e.juridiction }).ok && !(Array.isArray(e.sujets) ? e.sujets : []).some((t) => SS.motInterdit(t, true));
}
/** Titres d'une entrée pour la détection de doublons (sensible : le titre de presse, jamais notre formule « Selon … »). */
const titresDeEntree = (e) => (e.sensible ? (Array.isArray(e.sujets) ? e.sujets : []) : [e.titrePropre, e.titre]).filter(Boolean);

/** Une entrée dont le contenu est à risque : mot de la liste prudente (presse ou post), légende de post invalide. */
function risque(e) {
  if (e.sondageId) return false;
  const post = e.type === "post" || e.type === "reel" || e.type === "carousel" || Boolean(e.annonceDe);
  if ((e.type === "post" || e.type === "reel") && !legendeValide(e)) return true;
  // SUJETS SENSIBLES (scripts/sujets-sensibles.cjs) : le titre de l'entrée est le nôtre, le titre de presse est dans « sujets » (jamais publié tel quel)
  if (e.sensible === 1) return !niveau1Sur(e); // fait judiciaire établi : texte fabriqué par règles, recontrôlé ici
  if (e.sensible === 2) return !(e.valideHumain === true && e.valideLe); // niveau 2 : JAMAIS sans validation humaine (workflow « Valider un brouillon »)
  if (e.type === "carousel" && !validerCarrousel(e).ok) return true;
  if (e.contenu && (Array.isArray(e.sujets) ? e.sujets : []).some((t) => motExclu(t, OFF))) return true; // contenus récurrents : chaque sujet affiché est contrôlé une dernière fois
  if (e.donneesPropres === true && !post) return false;
  const titres = e.bref === true ? (Array.isArray(e.sujets) ? e.sujets : []) : [e.titre || "", ...(post ? [e.titrePropre || ""] : [])];
  return titres.some((t) => motExclu(t, e.donneesPropres === true ? OFF : undefined));
}
const estPost = (e) => e.type === "post";
const estCarrousel = (e) => e.type === "carousel";
const estPostFil = (e) => estPost(e) || estCarrousel(e); // images de fil : plafond commun (2 par jour)
const estCreneau = (e) => Boolean(e.contenu); // contenu récurrent à créneau (pasAvant / expire)
const instant = (iso) => { const t = Date.parse(iso); return Number.isNaN(t) ? null : t; };
const estAnnonce = (e) => Boolean(e.annonceDe);
const estReel = (e) => e.type === "reel";

/**
 * Choisit l'entrée à publier. Pure : renvoie { entree, perimees } ou { refus, perimees } (perimees : ids à marquer).
 * Trois sortes d'entrées : story, post (fil, légende) et story d'annonce d'un post (champ annonceDe) ; voir l'en-tête du fichier.
 */
function choisir({ file, registre, config, now = new Date(), retires = new Set() }) {
  const deja = new Map((registre?.entrees || []).map((e) => [e.id, e]));
  const perimees = [];
  const candidates = [];
  const entreesFile = [...(file?.entrees || [])].filter((e) => e && (e.type === "story" || e.type === "post" || e.type === "carousel" || (e.type === "reel" && REELS_ACTIFS && config.videos === true && e.url_video)) && e.id && !deja.has(e.id) && !retires.has(e.id)).sort((a, b) => String(a.cree).localeCompare(String(b.cree)));
  // 1. posts et stories : périmées après 3 h (story) ou 12 h (post)
  let enAttente = 0, enCreneau = 0;
  for (const e of entreesFile.filter((x) => !estAnnonce(x) && !estReel(x))) {
    const t = Date.parse(e.cree);
    if (estCreneau(e)) { // créneau : périmée après « expire », en attente avant « pasAvant » (dates absentes ou invalides : périmée, jamais publiée au hasard)
      const exp = instant(e.expire), pas = instant(e.pasAvant);
      if (isNaN(t) || exp === null || pas === null || now.getTime() >= exp) { perimees.push(e.id); continue; }
      if (now.getTime() < pas) { enCreneau++; continue; }
      candidates.push(e);
      continue;
    }
    if (isNaN(t) || now.getTime() - t > (estPostFil(e) ? FRAICHEUR_POST_H : FRAICHEUR_H) * 36e5) { perimees.push(e.id); continue; }
    candidates.push(e);
  }
  // 2. stories d'annonce : liées à la publication de leur post (au plus tôt 5 min après, au plus tard 3 h après) ; en attente tant que le post n'est pas sorti
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
  // les annonces d'abord, puis les contenus à créneau (par heure de créneau : « tenir l'heure »), puis l'actualité au fil de l'eau
  candidates.sort((a, b) => Number(estAnnonce(b)) - Number(estAnnonce(a)) || Number(estCreneau(b)) - Number(estCreneau(a)) || (estCreneau(a) && estCreneau(b) ? String(a.pasAvant).localeCompare(String(b.pasAvant)) : 0) || String(a.cree).localeCompare(String(b.cree)));
  const sortie = (refus) => ({ refus, perimees });
  if (config.validationHumaine) { // seules les entrées validées par un humain (workflow « Valider un brouillon ») sortent
    const validees = candidates.filter((e) => e.valideHumain === true);
    if (!validees.length) return sortie("validation humaine activée : rien n'est publié automatiquement");
    candidates.splice(0, candidates.length, ...validees);
  }
  const h = heureParis(now);
  if (h >= 23 || h < 7) return sortie(`nuit (${h} h à Paris)`);
  const jour = jourParis(now);
  const publieesJour = [...deja.values()].filter((e) => enregistree(e) && jourParis(e.publieLe) === jour);
  const postsJour = publieesJour.filter(estPostFil).length;
  const reelsJour = publieesJour.filter(estReel).length;
  const maxReels = Number.isInteger(config.videosMax) ? config.videosMax : MAX_REELS_PAR_JOUR_DEFAUT;
  const storiesJour = publieesJour.filter((e) => !estPostFil(e) && !estReel(e) && !e.annonceDe && !e.contenu).length; // ni les stories d'annonce, ni les contenus récurrents à créneau, n'entrent dans le plafond des stories
  const MAX_PAR_JOUR = Number.isInteger(config.maxParJour) && config.maxParJour >= 1 && config.maxParJour <= 99 ? config.maxParJour : MAX_PAR_JOUR_DEFAUT;
  const sousPlafond = (e) => (estAnnonce(e) ? true : estReel(e) ? reelsJour < maxReels : estPostFil(e) ? postsJour < MAX_POSTS_PAR_JOUR : estCreneau(e) ? true : storiesJour < MAX_PAR_JOUR);
  if (candidates.length && !candidates.some(sousPlafond)) return sortie(`plafond atteint : ${storiesJour} story(ies) et ${postsJour} post(s) aujourd'hui (maximum ${MAX_PAR_JOUR} et ${MAX_POSTS_PAR_JOUR})`);
  let ok = candidates.filter(sousPlafond);
  // Espacement : 60 min entre deux publications ; seule exception, la story d'annonce d'un post (≥ 5 min après CE post)
  const publiees = [...deja.values()].filter(enregistree);
  const dernier = publiees.reduce((m, e) => (Date.parse(e.publieLe) > (m ? Date.parse(m.publieLe) : 0) ? e : m), null);
  if (dernier && now.getTime() - Date.parse(dernier.publieLe) < ESPACEMENT_MIN * 60000) {
    const ok2 = ok.filter((e) => estAnnonce(e) && e.annonceDe === dernier.id);
    if (!ok2.length) return sortie(ok.length ? `dernière publication il y a moins de ${ESPACEMENT_MIN} min` : (enAttente ? `story d'annonce en attente (${ESPACEMENT_ANNONCE_MIN} min après son post)` : (enCreneau ? "contenu à créneau : l'heure n'est pas encore venue" : "rien à publier")));
    ok = ok2;
  }
  if (!ok.length) return sortie(enAttente ? `story d'annonce en attente (${ESPACEMENT_ANNONCE_MIN} min après son post)` : (enCreneau ? "contenu à créneau : l'heure n'est pas encore venue" : "rien à publier"));
  const candidatesBrutes = ok.length;
  ok = purgerReserve(ok, now).filter((e) => !(reserveStory(now) && [e.titre || "", e.citation?.titre || "", ...(Array.isArray(e.sujets) ? e.sujets : [])].some(parleDeSondage)));
  if (config.monetisation) ok = purgerPresse(ok);
  const avant = ok.length;
  const recentes = publiees.filter((d) => now.getTime() - Date.parse(d.publieLe) < FENETRE_DOUBLON_H * 36e5);
  const dernieres = new Set(recentes.map((d) => d.id));
  // Titres déjà publiés : ceux du registre (conservés même quand l'entrée a quitté la file) et ceux de la file
  const titresPublies = [
    ...recentes.filter((d) => !retires.has(d.id)).flatMap((d) => [d.sensible ? null : d.titre, ...(Array.isArray(d.sujets) ? d.sujets : [])]),
    ...(file?.entrees || []).filter((e) => dernieres.has(e.id) && !retires.has(e.id)).flatMap((e) => [e.sensible ? null : e.titrePropre, ...(Array.isArray(e.sujets) ? e.sujets : [])]),
  ].filter(Boolean);
  const dejaTraite = (e) => !estAnnonce(e) && !estReel(e) && !estCreneau(e) && titresDeEntree(e).some((t) => titresPublies.some((p) => titresProches(p, t)));
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
  if (!r.ok || json.error) { const err = new Error(`API ${r.status} : ${masquer(json.error?.message || texte.slice(0, 200))}`); err.status = r.status; throw err; }
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
    catch (e2) { alerte(`le jeton Instagram est invalide ou inutilisable (${e2.message}). Générez-en un nouveau (docs/PUBLICATION-AUTO.md).`, { echec: true }); return { valide: false, expireLe: null, jours: null }; }
  }
  if (!d || d.is_valid === false) { alerte("le jeton Instagram est invalide ou expiré. Générez-en un nouveau (docs/PUBLICATION-AUTO.md).", { echec: true }); return { valide: false, expireLe: null, jours: null }; }
  const exp = d.expires_at ? new Date(d.expires_at * 1000) : null; // 0 ou absent : n'expire pas
  const jours = exp ? (exp.getTime() - now.getTime()) / 864e5 : null;
  if (jours !== null && jours < 0) { alerte("le jeton Instagram a expiré. Générez-en un nouveau (docs/PUBLICATION-AUTO.md).", { echec: true }); return { valide: false, expireLe: exp, jours }; }
  if (jours !== null && jours < ALERTE_JETON_JOURS) alerte(`le jeton Instagram expire dans ${Math.ceil(jours)} jour(s) (le ${exp.toISOString().slice(0, 10)}). Renouvelez-le (docs/PUBLICATION-AUTO.md).`);
  return { valide: true, expireLe: exp, jours };
}

/**
 * Publie un média : crée le conteneur, attend le statut FINISHED, puis media_publish. Renvoie l'identifiant du média.
 * `mode` : "story-image", "story-video", "post" ou "reel". Une erreur levée AVANT media_publish porte avantPublication = true (repli possible, rien n'est publié).
 */
async function publier(entree, mode = estPost(entree) ? "post" : estCarrousel(entree) ? "carrousel" : estReel(entree) ? "reel" : "story-image", avantMediaPublish = null) {
  if (mode === "carrousel") return (await publierCarrousel({ graph, userId: IG_USER_ID, entree, attenteMs: ATTENTE_MS, essais: ESSAIS_STATUT, avantMediaPublish })).mediaId;
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
  // L'intention « en cours » est écrite au registre AVANT media_publish : si la réponse est perdue (timeout, 5xx, coupure) ou si le job est tué, l'entrée n'est jamais rejouée (audit A-01)
  if (avantMediaPublish) avantMediaPublish(creation);
  let pub;
  try {
    pub = await graph("POST", `/${IG_USER_ID}/media_publish`, { creation_id: creation });
    if (!pub.id) throw new Error("API : media_publish sans identifiant");
  } catch (err) { err.publicationIncertaine = !(err.status >= 400 && err.status < 500); throw err; } // refus net (4xx) : rien n'est publié ; sinon : peut-être publié
  return pub.id;
}

/**
 * Une publication de cette entrée existe-t-elle côté Instagram depuis `debutLe` (réponse de media_publish perdue, job tué) ?
 * Lit les stories en cours (/stories) ou les médias récents (/media) ; ignore les médias déjà inscrits au registre. Renvoie le média trouvé, null, ou LÈVE si l'API ne répond pas.
 */
async function trouverPubliee(entree, debutLe, registre) {
  const chemin = typeDe(entree) === "story" ? `/${IG_USER_ID}/stories` : `/${IG_USER_ID}/media`;
  const r = await graph("GET", chemin, { fields: "id,timestamp", limit: "10" });
  const connus = new Set((registre.entrees || []).map((x) => x.mediaId).filter(Boolean));
  const seuil = Date.parse(debutLe) - 120000;
  return (Array.isArray(r.data) ? r.data : []).find((m) => m?.id && !connus.has(String(m.id)) && Date.parse(m.timestamp) >= seuil) || null;
}
/** Intentions « en-cours » restées au registre (job tué entre media_publish et l'écriture) : retrouvées côté API, sinon « incertaine » (jamais rejouées). */
async function reprendreEnCours(registre, now) {
  for (const e of registre.entrees.filter((x) => x.statut === "en-cours")) {
    let trouve = null, erreur = null;
    try { trouve = await trouverPubliee(e, e.publieLe, registre); } catch (err) { erreur = err; }
    if (trouve) { Object.assign(e, { statut: "publiee", mediaId: String(trouve.id), repris: true }); resume(`Publication de l'entrée ${e.id} retrouvée côté Instagram (média ${trouve.id}) : inscrite au registre.`); continue; }
    Object.assign(e, { statut: "incertaine", echec: erreur ? "verification-impossible" : "non-retrouvee" });
    alerte(`publication de l'entrée ${e.id} interrompue : ${erreur ? "vérification côté Instagram impossible (" + erreur.message + ")" : "aucun média retrouvé"}. Elle ne sera JAMAIS rejouée (pas de doublon) ; vérifier le compte Instagram.`);
    process.exitCode = 1;
  }
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
  // ÉCHEC FERMÉ : un registre, une configuration ou une file illisibles = rien ne se publie, alerte visible, code de sortie 1 (audit A-02, A-03)
  const lReg = lireStrict(FICHIER_REGISTRE), lFile = lireStrict(FICHIER_FILE), lCfg = lireStrict(FICHIER_CONFIG);
  for (const [nom, l, fichier] of [["registre des publications", lReg, FICHIER_REGISTRE], ["file de publication", lFile, FICHIER_FILE]]) {
    if (l.erreur || (l.valeur && "entrees" in l.valeur && !Array.isArray(l.valeur.entrees))) {
      alerte(`${nom} illisible (${path.basename(fichier)} : ${l.erreur || "« entrees » n'est pas une liste"}). RIEN n'est publié tant qu'il n'est pas réparé.`);
      process.exitCode = 1;
      return;
    }
  }
  const config = lireConfig(FICHIER_CONFIG);
  if (lCfg.erreur) {
    alerte(`configuration illisible (${path.basename(FICHIER_CONFIG)} : ${lCfg.erreur}). Validation humaine activée par défaut : seules les entrées validées à la main sortent.`);
    process.exitCode = 1;
  }
  const jeton = await controlerJeton(now);
  const registre = lReg.valeur || { entrees: [] };
  if (!Array.isArray(registre.entrees)) registre.entrees = [];
  const file = lFile.valeur || { entrees: [] };
  if (!Array.isArray(file.entrees)) file.entrees = [];
  if (jeton.valide && !A_SEC && registre.entrees.some((x) => x.statut === "en-cours")) { await reprendreEnCours(registre, now); ecrireRegistre(registre, now); }
  const c = choisir({ file, registre, config, now, retires: lireRetiresSur() });

  if (c.perimees.length) {
    log(`entrée(s) périmée(s) (plus de ${FRAICHEUR_H} h), jamais publiées : ${c.perimees.join(", ")}`);
    if (!A_SEC) for (const id of c.perimees) registre.entrees.push({ id, statut: "perimee", publieLe: null, mediaId: null, type: (file.entrees.find((x) => x.id === id) || {}).type || "story" });
  }
  const finir = () => { if (!A_SEC && c.perimees.length) ecrireRegistre(registre, now); };
  if (!c.entree) { log(`rien à publier : ${c.refus}`); finir(); return; }
  if (!jeton.valide) { log("jeton invalide : aucune publication."); finir(); return; }
  const e = c.entree;
  // Mode de publication : le Reel est toujours une vidéo ; une story avec url_video n'est vidéo que si "videos" est activé et la vidéo en ligne (HEAD 200, video/mp4), sinon image
  let mode = estPost(e) ? "post" : estCarrousel(e) ? "carrousel" : estReel(e) ? "reel" : "story-image";
  if (estReel(e) && !(await enLigne(e.url_video, "video/mp4"))) { log(`vidéo pas encore en ligne (${e.url_video}) : nouvel essai au prochain passage.`); finir(); return; }
  if (mode === "story-image" && e.url_video && config.videos === true) {
    if (await enLigne(e.url_video, "video/mp4")) mode = "story-video"; else log(`vidéo absente ou de type inattendu (${e.url_video}) : la story partira en image.`);
  }
  if (mode === "carrousel") {
    for (const u of e.url_images) if (!(await imageEnLigne(u))) { log(`image du carrousel pas encore en ligne (${u}) : nouvel essai au prochain passage.`); finir(); return; }
  } else if (mode !== "reel" && mode !== "story-video" && !(await imageEnLigne(e.url_image))) { log(`image pas encore en ligne (${e.url_image}) : nouvel essai au prochain passage.`); finir(); return; }
  const nom = { post: "post", carrousel: "carrousel", reel: "Reel", "story-image": "story", "story-video": "story vidéo" };
  if (A_SEC) { resume(`À sec : l'entrée ${e.id} (« ${e.titre} ») serait publiée en ${nom[mode]}.`); return; }
  finir(); // les périmées sont enregistrées même si la publication échoue
  let enCours = null;
  const avantMediaPublish = () => { // intention écrite AVANT media_publish (audit A-01)
    enCours = { id: e.id, statut: "en-cours", publieLe: now.toISOString(), mediaId: null, type: typeDe(e) };
    registre.entrees.push(enCours);
    ecrireRegistre(registre, now);
  };
  const nomPub = () => (mode === "post" ? "Post publié" : mode === "carrousel" ? "Carrousel publié" : mode === "reel" ? "Reel publié" : e.annonceDe ? "Story d'annonce publiée" : mode === "story-video" ? "Story vidéo publiée" : "Story publiée");
  const inscrire = (mediaId) => {
    const ligne = { id: e.id, statut: "publiee", publieLe: now.toISOString(), mediaId, titre: e.titrePropre || e.titre || null, type: typeDe(e), ...(e.contenu ? { contenu: e.contenu } : {}), ...(mode.endsWith("video") || mode === "reel" ? { video: true } : {}), ...(e.sensible ? { sensible: true } : {}), ...(e.annonceDe ? { annonceDe: e.annonceDe } : {}), ...(e.reelDe ? { reelDe: e.reelDe } : {}), ...(e.dateIso ? { dateIso: e.dateIso } : {}), sujets: Array.isArray(e.sujets) ? e.sujets.slice(0, 8) : undefined };
    if (enCours) { delete enCours.echec; Object.assign(enCours, ligne); } else registre.entrees.push(ligne);
    ecrireRegistre(registre, now); // écrit tout de suite : un échec ultérieur du workflow ne doit pas provoquer de doublon
  };
  try {
    let mediaId;
    try {
      mediaId = await publier(e, mode, avantMediaPublish);
    } catch (err) {
      // Repli sur l'image : seulement pour une story vidéo, seulement si l'échec précède media_publish (rien n'a été publié, donc aucun doublon)
      if (mode !== "story-video" || !err.avantPublication) throw err;
      alerte(`la vidéo de l'entrée ${e.id} a échoué (${err.message}) : repli sur l'image.`);
      if (!(await imageEnLigne(e.url_image))) throw new Error("image pas en ligne pour le repli");
      mode = "story-image";
      mediaId = await publier(e, mode, avantMediaPublish);
    }
    inscrire(mediaId);
    resume(`${nomPub()} : « ${e.titre} » (média ${mediaId}).`);
  } catch (err) {
    if (enCours && err.publicationIncertaine) {
      // media_publish a échoué sans réponse nette (timeout, 5xx, coupure) : la publication a peut-être eu lieu. On regarde côté Instagram ; dans le doute, « incertaine » : JAMAIS rejouée.
      let trouve = null;
      try { trouve = await trouverPubliee(e, enCours.publieLe, registre); } catch (e2) { /* vérification impossible */ }
      if (trouve) {
        inscrire(String(trouve.id));
        resume(`${nomPub()} : « ${e.titre} » (média ${trouve.id}, retrouvé côté Instagram après une réponse perdue).`);
        return;
      }
      Object.assign(enCours, { statut: "incertaine", echec: "publication-incertaine" });
      ecrireRegistre(registre, now);
      alerte(`publication incertaine de l'entrée ${e.id} (${err.message}) : non rejouée (pas de doublon). Vérifier le compte Instagram.`, { echec: true });
      return;
    }
    if (enCours) { // refus net de l'API (4xx) après l'intention : rien n'a été publié, l'intention est retirée
      registre.entrees = registre.entrees.filter((x) => x !== enCours);
      ecrireRegistre(registre, now);
    }
    alerte(`échec de publication de l'entrée ${e.id} : ${err.message}. Nouvel essai au prochain passage tant qu'elle n'est pas périmée.`);
  }
}

module.exports = { choisir, masquer, legendeValide, risque };
if (require.main === module) main().catch((e) => { console.error("[publier-stories]", masquer(e.message)); process.exit(1); });
