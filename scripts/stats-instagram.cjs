#!/usr/bin/env node
/**
 * stats-instagram.cjs
 * -------------------
 * Mesure ce qui marche sur @hemicyclefrance (API officielle Instagram, lecture seule) :
 *  - pour chaque média publié (data/instagram-publiees.json, mediaId réel ; « windsor » = ancien envoi manuel, ignoré),
 *    lit ses insights (GET /{media-id}/insights?metric=...) selon son type ;
 *  - écrit data/instagram-stats.json (une entrée par média : type, modèle, thème, nombre de médias du sujet, heure de publication,
 *    métriques, date de relevé) et docs/stats/AAAA-Wss.md (résumé hebdomadaire) + $GITHUB_STEP_SUMMARY ;
 *  - relève aussi le nombre d'abonnés (GET /{IG_USER_ID}?fields=followers_count) ;
 *  - (option « commentaires »: true dans data/stories-config.json, FAUX par défaut) lit les commentaires des posts et SIGNALE
 *    ceux qui contiennent insultes/menaces/spam. Rien n'est masqué, rien n'est répondu automatiquement ; aucun texte ni pseudo n'est conservé.
 *
 * Les insights d'une story n'existent que 24 h : on la relève à J+0 tard le soir puis dans les 24 h (deux passages par jour,
 * voir le workflow) ; les valeurs gardées sont les plus hautes jamais vues (les compteurs ne font que croître).
 * Une métrique refusée par l'API pour ce type de média est notée dans « refusees » et n'arrête rien ; un jeton invalide déclenche
 * une alerte sans faire échouer l'exécution.
 *
 * Secrets : IG_USER_ID et IG_ACCESS_TOKEN. Absents : sortie propre (INACTIF). Le jeton n'est jamais affiché (masqué).
 * USAGE : node scripts/stats-instagram.cjs
 * Variables facultatives (essais) : GRAPH_BASE, STATS_MAINTENANT (ISO), STATS_REGISTRE, STATS_FILE, STATS_CONFIG, STATS_SORTIE, STATS_DOCS.
 */
const fs = require("fs");
const path = require("path");

const RACINE = path.resolve(__dirname, "..");
const F_REGISTRE = process.env.STATS_REGISTRE || path.join(RACINE, "data", "instagram-publiees.json");
const F_FILE = process.env.STATS_FILE || path.join(RACINE, "data", "instagram-file.json");
const F_CONFIG = process.env.STATS_CONFIG || path.join(RACINE, "data", "stories-config.json");
const F_SORTIE = process.env.STATS_SORTIE || path.join(RACINE, "data", "instagram-stats.json");
const D_DOCS = process.env.STATS_DOCS || path.join(RACINE, "docs", "stats");
const GRAPH = (process.env.GRAPH_BASE || "https://graph.instagram.com/v21.0").replace(/\/+$/, "");
const IG_USER_ID = (process.env.IG_USER_ID || "").trim();
const IG_ACCESS_TOKEN = (process.env.IG_ACCESS_TOKEN || "").trim();

const FENETRE_STORY_H = 24; // au-delà, l'API ne donne plus d'insights d'une story
const SUIVI_POST_JOURS = 30; // un post/Reel est suivi 30 jours, puis figé
const GARDER_ABONNES = 120; // jours d'historique des abonnés

// Métriques demandées par type (API graph.instagram.com). Chacune peut être refusée : on essaie d'abord en bloc, puis une par une.
// `impressions`, `taps_forward`, `taps_back` et `exits` sont OBSOLÈTES : refusées par l'API au premier relevé réel (2026-10-07), elles faisaient
// échouer chaque requête en bloc (1 requête ratée + 1 par métrique). Elles ne sont plus demandées ; `views` les remplace.
// Stories : views, reach, shares, replies, total_interactions. Posts, carrousels : views, reach, likes, comments, saved, shares, total_interactions.
// Reels : idem + ig_reels_avg_watch_time.
const METRIQUES = {
  story: ["views", "reach", "shares", "replies", "total_interactions"],
  post: ["views", "reach", "likes", "comments", "saved", "shares", "total_interactions"],
  carrousel: ["views", "reach", "likes", "comments", "saved", "shares", "total_interactions"],
  reel: ["views", "reach", "likes", "comments", "saved", "shares", "total_interactions", "ig_reels_avg_watch_time"],
};

// Mots signalés dans les commentaires (liste volontairement simple, à compléter ; la casse et les accents sont ignorés)
const MOTS_INSULTES = ["connard", "connasse", "salaud", "salope", "enculé", "pute", "fdp", "ta gueule", "débile", "crétin", "abruti", "merde", "ordure", "pourriture", "nazi", "facho", "bougnoule", "youpin", "sale arabe", "sale noir", "sale juif"];
const MOTS_MENACES = ["je vais te tuer", "on va te tuer", "crève", "à mort", "on va vous retrouver", "je vais te retrouver", "je te retrouve", "pendre", "fusiller", "brûler vif", "attentat"];
const MOTS_SPAM = ["http://", "https://", "www.", "t.me/", "wa.me/", "whatsapp", "telegram", "gagne de l'argent", "gagner de l'argent", "crypto", "bitcoin", "investis", "followers", "abonnés gratuits", "dm me", "écris-moi en privé", "click link", "cliquez ici", "promo", "casino", "onlyfans"];

/** Masque le jeton (et tout ce qui y ressemble) dans un texte destiné aux journaux. */
function masquer(t) {
  let s = String(t);
  if (IG_ACCESS_TOKEN) s = s.split(IG_ACCESS_TOKEN).join("***");
  return s.replace(/(access_token=)[^&\s"']+/gi, "$1***").replace(/(Bearer )[A-Za-z0-9_\-.]+/g, "$1***");
}
const log = (m) => console.log("[stats-instagram] " + masquer(m));
const resumeLignes = [];
function resume(ligne) {
  log(ligne);
  resumeLignes.push(masquer(ligne));
}
function alerte(ligne) {
  console.log("::warning::" + masquer(ligne));
  resumeLignes.push("- ALERTE : " + masquer(ligne));
}

const lireJson = (f, defaut) => { try { return JSON.parse(fs.readFileSync(f, "utf-8")); } catch (e) { return defaut; } };
const sansAccent = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Erreur de l'API : code conservé ; le message ne contient jamais le jeton. */
class ErreurApi extends Error {
  constructor(message, http, code) { super(message); this.http = http; this.code = code; }
  get jetonInvalide() { return this.code === 190 || this.http === 401; }
}
async function graph(chemin, params = {}) {
  const url = new URL(GRAPH + chemin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  let r, texte;
  try { r = await fetch(url, { headers: { Authorization: "Bearer " + IG_ACCESS_TOKEN }, signal: AbortSignal.timeout(30000) }); texte = await r.text(); }
  catch (e) { throw new ErreurApi(`réseau : ${masquer(e.message)}`, 0, 0); }
  let json = {};
  try { json = JSON.parse(texte); } catch (e) { /* réponse non JSON */ }
  if (!r.ok || json.error) throw new ErreurApi(`API ${r.status} : ${masquer(json.error?.message || texte.slice(0, 200))}`, r.status, json.error?.code || 0);
  return json;
}

/** Valeurs d'une réponse /insights : { nom: nombre } (valeur simple ou « total_value »). */
function lireInsights(rep) {
  const o = {};
  for (const m of rep.data || []) {
    const v = m.values?.[0]?.value ?? m.total_value?.value;
    if (typeof v === "number" && Number.isFinite(v)) o[m.name] = v;
  }
  return o;
}

/** Insights d'un média : essai en bloc puis métrique par métrique. Renvoie { metriques, refusees, sansInsights }. Ne lève que si le jeton est invalide. */
async function insights(mediaId, type) {
  const liste = METRIQUES[type] || METRIQUES.post;
  try {
    const metriques = lireInsights(await graph(`/${mediaId}/insights`, { metric: liste.join(",") }));
    if (Object.keys(metriques).length) return { metriques, refusees: [], sansInsights: false };
  } catch (e) {
    if (e.jetonInvalide) throw e;
  }
  const metriques = {}, refusees = [];
  let premiereErreur = null;
  for (const m of liste) {
    try { Object.assign(metriques, lireInsights(await graph(`/${mediaId}/insights`, { metric: m }))); }
    catch (e) {
      if (e.jetonInvalide) throw e;
      refusees.push(m);
      premiereErreur = premiereErreur || e.message;
    }
  }
  if (!Object.keys(metriques).length) return { metriques: {}, refusees: [], sansInsights: true, erreur: premiereErreur };
  return { metriques, refusees, sansInsights: false };
}

/** Type et date du média : { type: story|post|carrousel|reel, publieLe }. */
async function infoMedia(mediaId) {
  const m = await graph(`/${mediaId}`, { fields: "media_product_type,media_type,timestamp" });
  const produit = String(m.media_product_type || "").toUpperCase();
  let type = "post";
  if (produit === "STORY") type = "story";
  else if (produit === "REELS") type = "reel";
  else if (String(m.media_type || "").toUpperCase() === "CAROUSEL_ALBUM") type = "carrousel";
  return { type, publieLe: m.timestamp ? new Date(m.timestamp).toISOString() : null };
}

// --- Métadonnées (modèle / rubrique, thème, nombre de médias du sujet) -------------------------------------------------
const THEMES = [
  ["justice", /\b(proces|tribunal|justice|condamn|mis en examen|parquet|juge|prison|garde a vue)/],
  ["elections", /\b(election|primaire|presidentielle|municipales|legislatives|candidat|sondage|scrutin|vote)/],
  ["gouvernement", /\b(gouvernement|ministre|premier ministre|matignon|remaniement|elysee|macron|decret)/],
  ["budget", /\b(budget|impot|taxe|deficit|dette|retraite|salaire|pouvoir d'achat|fiscal)/],
  ["education", /\b(lycee|lyceen|ecole|etudiant|universite|bac|blocus|enseignant|professeur)/],
  ["international", /\b(europe|ue|bruxelles|otan|g7|ukraine|russie|etats-unis|trump|gaza|israel|chine|onu)\b/],
  ["securite", /\b(police|securite|attentat|delinquance|immigration|frontiere|terroris)/],
  ["energie-ecologie", /\b(energie|gazole|carburant|climat|ecolog|nucleaire|electricite|prix du gaz)/],
  ["parlement", /\b(assemblee|senat|depute|senateur|motion|loi|amendement|hemicycle)/],
];
function themeDe(titre) {
  const t = sansAccent(titre);
  for (const [nom, re] of THEMES) if (re.test(t)) return nom;
  return "autre";
}
function modeleDe(id, entree) {
  if (entree?.modele) return String(entree.modele);
  if (entree?.dossierId) return "dossier";
  const i = String(id || "");
  if (/^direct-/.test(i)) return "direct";
  if (/^dossier-/.test(i)) return "dossier";
  if (/^alaune-/.test(i)) return "a-la-une";
  if (/^date-a-retenir/.test(i)) return "date";
  if (/^jour-/.test(i)) return "jour";
  if (/^[0-9a-f]{12}$/.test(i)) return "actualite";
  return "autre";
}
function heureParis(date) {
  const h = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", hourCycle: "h23" }).format(date);
  return Number(h) % 24;
}
function semaineIso(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const n = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - n);
  const debut = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return { annee: d.getUTCFullYear(), semaine: Math.ceil(((d - debut) / 864e5 + 1) / 7) };
}
const etiquetteSemaine = (date) => { const { annee, semaine } = semaineIso(date); return `${annee}-W${String(semaine).padStart(2, "0")}`; };

/** Valeur de comparaison d'un média : vues (ou impressions), à défaut la portée. */
function vuesDe(m) {
  const x = m.metriques || {};
  return x.views ?? x.impressions ?? x.reach ?? null;
}

// --- Commentaires ----------------------------------------------------------------------------------------------------
function classerCommentaire(texte) {
  const t = sansAccent(texte);
  const cherche = (mots) => mots.some((w) => t.includes(sansAccent(w)));
  if (cherche(MOTS_MENACES)) return "menace";
  if (cherche(MOTS_INSULTES)) return "insulte";
  if (cherche(MOTS_SPAM) || /(.)\1{9,}/.test(t)) return "spam";
  return null;
}
/** Lit les commentaires d'un média ; renvoie { total, signales: [{ id, categorie }] } sans conserver ni texte ni pseudo. */
async function commentairesDe(mediaId) {
  const signales = [];
  let total = 0;
  let rep = await graph(`/${mediaId}/comments`, { fields: "id,text", limit: "50" });
  for (let page = 0; page < 5; page++) {
    for (const c of rep.data || []) {
      total++;
      const cat = classerCommentaire(c.text);
      if (cat) signales.push({ id: String(c.id), categorie: cat });
    }
    const suite = rep.paging?.next;
    if (!suite) break;
    try { // l'URL « next » : on ne garde que son chemin et sa requête (sans jeton), appelés sur notre base
      const u = new URL(suite);
      rep = await graph(u.pathname.replace(/^\/v[\d.]+/, ""), Object.fromEntries([...u.searchParams].filter(([k]) => k !== "access_token")));
    } catch (e) { break; }
  }
  return { total, signales };
}

// --- Fusion et synthèses ---------------------------------------------------------------------------------------------
/** Les compteurs ne font que croître : on garde le maximum de chaque métrique (les valeurs d'une story à J+0 ne sont pas perdues à J+1). */
function fusionner(anciennes = {}, nouvelles = {}) {
  const r = { ...anciennes };
  for (const [k, v] of Object.entries(nouvelles)) r[k] = typeof r[k] === "number" ? Math.max(r[k], v) : v;
  return r;
}
const moyenne = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);

/** Groupes triés par moyenne de vues décroissante : [{ cle, n, moyenne }]. */
function groupes(medias, cle) {
  const g = new Map();
  for (const m of medias) {
    const v = vuesDe(m), k = cle(m);
    if (v === null || k === null || k === undefined) continue;
    if (!g.has(k)) g.set(k, []);
    g.get(k).push(v);
  }
  return [...g].map(([k, vs]) => ({ cle: k, n: vs.length, moyenne: moyenne(vs) })).sort((a, b) => b.moyenne - a.moyenne);
}

function rapportHebdo(stats, etiquette, now, alertes, signalements) {
  const medias = Object.values(stats.medias).filter((m) => m.publieLe && etiquetteSemaine(new Date(m.publieLe)) === etiquette && vuesDe(m) !== null);
  const L = [];
  L.push(`# Statistiques Instagram — semaine ${etiquette}`, "");
  L.push(`Relevé du ${now.toISOString().slice(0, 16).replace("T", " ")} UTC. Lecture : voir docs/STATS.md (limites, nombre minimal de données).`, "");
  const ab = stats.abonnes;
  if (ab?.historique?.length) {
    const dernier = ab.historique[ab.historique.length - 1];
    const ref = ab.historique.find((h) => Date.parse(h.date) >= now.getTime() - 7 * 864e5) || ab.historique[0];
    const diff = dernier.nombre - ref.nombre;
    L.push(`**Abonnés** : ${dernier.nombre}${ab.historique.length > 1 ? ` (${diff >= 0 ? "+" : ""}${diff} depuis le ${ref.date})` : ""}`, "");
  } else L.push("**Abonnés** : non relevés.", "");
  if (!medias.length) {
    L.push("Aucun média publié cette semaine avec des chiffres relevés : rien à comparer pour l'instant.", "");
  } else {
    const parType = medias.reduce((o, m) => ((o[m.type] = (o[m.type] || 0) + 1), o), {});
    L.push(`**Médias mesurés cette semaine** : ${medias.length} (${Object.entries(parType).map(([t, n]) => `${n} ${t}`).join(", ")})`, "");
    const tri = [...medias].sort((a, b) => vuesDe(b) - vuesDe(a));
    const ligne = (m) => `${m.type} « ${m.titre || m.id} » (${m.modele}, ${m.theme}) : ${vuesDe(m)} vues, portée ${m.metriques.reach ?? "n/d"}, partages ${m.metriques.shares ?? "n/d"}, enregistrements ${m.metriques.saved ?? "n/d"}`;
    L.push("## Meilleurs contenus", "", ...tri.slice(0, 3).map((m) => "- " + ligne(m)), "");
    if (tri.length > 3) L.push("## Moins bons contenus", "", ...tri.slice(-3).reverse().map((m) => "- " + ligne(m)), "");
    const meilleur = (g) => (g.find((x) => x.n >= 2) || g[0]);
    const dire = (g) => (g.length ? `${meilleur(g).cle} (moyenne ${Math.round(meilleur(g).moyenne)} vues sur ${meilleur(g).n} média(s))` : "n/d");
    L.push("## Ce qui marche (cette semaine)", "");
    L.push(`- **Meilleur créneau horaire (Paris)** : ${dire(groupes(medias, (m) => (m.heureParis == null ? null : `${m.heureParis} h`)))}`);
    L.push(`- **Meilleur format** : ${dire(groupes(medias, (m) => m.type))}`);
    L.push(`- **Meilleur thème** : ${dire(groupes(medias, (m) => m.theme))}`, "");
    if (medias.length < 10) L.push(`Attention : seulement ${medias.length} média(s) cette semaine ; ces classements sont indicatifs (voir docs/STATS.md, minimum conseillé : 10 médias, 3 par groupe).`, "");
  }
  if (signalements) {
    L.push("## Commentaires signalés (aucune action automatique)", "");
    if (!signalements.length) L.push("Aucun commentaire signalé par la liste de mots.");
    else {
      L.push(`${signalements.length} commentaire(s) à examiner ; masquez-les vous-même dans l'application Instagram (ou POST /{id-commentaire}?hide=true) si vous le jugez utile :`, "");
      for (const s of signalements.slice(0, 30)) L.push(`- ${s.categorie} — commentaire ${s.id} sous le média ${s.mediaId}`);
    }
    L.push("");
  }
  if (alertes.length) L.push("## Alertes", "", ...alertes.map((a) => "- " + a), "");
  return L.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

function ecrireJson(f, o) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(o, null, 1) + "\n");
}

async function principal() {
  const now = process.env.STATS_MAINTENANT ? new Date(process.env.STATS_MAINTENANT) : new Date();
  if (!IG_USER_ID || !IG_ACCESS_TOKEN) {
    resume("Statistiques Instagram INACTIVES : IG_USER_ID et IG_ACCESS_TOKEN absents (voir docs/STATS.md).");
    return fin();
  }
  const config = lireJson(F_CONFIG, {});
  const registre = lireJson(F_REGISTRE, { entrees: [] });
  const file = lireJson(F_FILE, { entrees: [] });
  const stats = lireJson(F_SORTIE, null) || {};
  stats.medias = stats.medias && typeof stats.medias === "object" ? stats.medias : {};
  const alertes = [];
  const parId = new Map((file.entrees || []).map((e) => [e.id, e]));
  const cibles = (registre.entrees || []).filter((e) => e.statut === "publiee" && e.mediaId && e.mediaId !== "windsor");
  let jetonInvalide = false, releves = 0, figes = 0, sans = 0;
  const jeton = () => { if (!jetonInvalide) { jetonInvalide = true; alertes.push("le jeton Instagram est invalide ou expiré : relevé interrompu (générez-en un nouveau, docs/PUBLICATION-AUTO.md)."); alerte(alertes[alertes.length - 1]); } };

  for (const e of cibles) {
    if (jetonInvalide) break;
    const ancien = stats.medias[e.mediaId];
    if (ancien?.fige) { figes++; continue; }
    try {
      const info = ancien?.type ? { type: ancien.type, publieLe: ancien.publieLe } : await infoMedia(e.mediaId);
      const publieLe = info.publieLe || e.publieLe || null;
      const ageH = publieLe ? (now - new Date(publieLe)) / 36e5 : 0;
      // Une story de plus de 24 h n'a plus d'insights ; un post de plus de 30 jours est figé : on garde ce qui a été relevé
      if (ancien && ((info.type === "story" && ageH > FENETRE_STORY_H) || (info.type !== "story" && ageH > SUIVI_POST_JOURS * 24))) { ancien.fige = true; figes++; continue; }
      const r = await insights(e.mediaId, info.type);
      const entreeFile = parId.get(e.id);
      const titre = e.titre || entreeFile?.titrePropre?.titre || entreeFile?.titre || ancien?.titre || null;
      const cur = {
        id: e.id,
        titre,
        type: info.type,
        modele: ancien?.modele || modeleDe(e.id, entreeFile || e),
        theme: ancien?.theme || e.theme || entreeFile?.theme || themeDe(titre),
        nbMedias: ancien?.nbMedias ?? e.nbMedias ?? (Array.isArray(entreeFile?.medias) ? entreeFile.medias.length : null),
        publieLe,
        heureParis: publieLe ? heureParis(new Date(publieLe)) : null,
        metriques: fusionner(ancien?.metriques, r.metriques),
        refusees: r.refusees.length ? r.refusees : ancien?.refusees || [],
        sansInsights: r.sansInsights && !Object.keys(ancien?.metriques || {}).length,
        releveLe: now.toISOString(),
        nbReleves: (ancien?.nbReleves || 0) + 1,
      };
      stats.medias[e.mediaId] = cur;
      if (cur.sansInsights) { sans++; log(`média ${e.mediaId} : aucun insight disponible (${r.erreur || "réponse vide"})`); } else releves++;
    } catch (err) {
      if (err.jetonInvalide) jeton();
      else log(`média ${e.mediaId} ignoré : ${err.message}`);
    }
  }

  // Abonnés
  if (!jetonInvalide) {
    try {
      const u = await graph(`/${IG_USER_ID}`, { fields: "followers_count" });
      if (typeof u.followers_count === "number") {
        const jour = now.toISOString().slice(0, 10);
        const hist = (stats.abonnes?.historique || []).filter((h) => h.date !== jour);
        hist.push({ date: jour, nombre: u.followers_count });
        stats.abonnes = { nombre: u.followers_count, releveLe: now.toISOString(), historique: hist.slice(-GARDER_ABONNES) };
      }
    } catch (e) {
      if (e.jetonInvalide) jeton(); else log(`abonnés non relevés : ${e.message}`);
    }
  }

  // Commentaires (INACTIF par défaut) : lecture seule, signalement seulement
  let signalements = null;
  if (config.commentaires === true && !jetonInvalide) {
    signalements = [];
    for (const [mediaId, m] of Object.entries(stats.medias)) {
      if (!m.type || m.type === "story") continue;
      if (m.publieLe && now - new Date(m.publieLe) > SUIVI_POST_JOURS * 864e5) continue;
      try {
        const c = await commentairesDe(mediaId);
        m.commentairesSignales = c.signales.length;
        for (const s of c.signales) signalements.push({ ...s, mediaId });
      } catch (e) {
        if (e.jetonInvalide) { jeton(); break; }
        log(`commentaires de ${mediaId} non lus : ${e.message}`);
      }
    }
  } else if (config.commentaires !== true) log("lecture des commentaires inactive (data/stories-config.json : commentaires: false).");

  const etiquette = etiquetteSemaine(now);
  if (Object.keys(stats.medias).length || stats.abonnes) {
    ecrireJson(F_SORTIE, { lastUpdated: now.toISOString(), version: 1, abonnes: stats.abonnes || null, medias: stats.medias });
    fs.mkdirSync(D_DOCS, { recursive: true });
    const rapport = rapportHebdo(stats, etiquette, now, alertes, signalements);
    fs.writeFileSync(path.join(D_DOCS, `${etiquette}.md`), rapport);
    resume(`Relevé : ${releves} média(s) mesuré(s), ${sans} sans insights, ${figes} déjà figé(s) ; rapport docs/stats/${etiquette}.md`);
    resumeLignes.push("", rapport);
  } else resume("Relevé : aucun média publié à mesurer pour l'instant.");
  return fin();
}

function fin() {
  if (process.env.GITHUB_STEP_SUMMARY) try { fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, resumeLignes.join("\n") + "\n"); } catch (e) { /* sans résumé */ }
}

module.exports = { classerCommentaire, themeDe, modeleDe, groupes, vuesDe, fusionner, etiquetteSemaine, heureParis, masquer, METRIQUES };

if (require.main === module) principal().catch((e) => { alerte(`statistiques Instagram interrompues : ${e.message}`); fin(); process.exit(0); });
