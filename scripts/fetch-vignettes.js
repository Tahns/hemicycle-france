#!/usr/bin/env node
/**
 * fetch-vignettes.js
 * ------------------
 * Vignettes des sujets d'actualité : au lieu d'un simple pictogramme, une VRAIE photo libre de l'institution que concerne le sujet
 * (Palais Bourbon, palais du Luxembourg, Élysée, Matignon, palais de justice, Bercy…). Jamais de photo de presse ni de personne :
 * seulement des bâtiments d'institutions, choisis dans des catégories Wikimedia Commons (table CANDIDATS ci-dessous).
 * Quelle institution pour quel sujet : scripts/vignettes-cle.js (justice avec personne nommée = tribunal neutre ou pictogramme).
 *
 * Pour chaque clé : on liste les fichiers des candidats (catégories ou fichiers) ; chacun est noté (paysage ou carré, au moins
 * 640 px, récent, nom sans personne ni foule) ; la LICENCE est vérifiée par l'API extmetadata de Commons (CC0, CC BY, CC BY-SA,
 * domaine public ; NC, ND, non libre, fair use et panorama sans liberté refusés) ; le meilleur fichier retenu est recadré au
 * centre en carré de 320 × 320 px, JPEG de 40 Ko au plus (ffmpeg, présent sur les exécuteurs GitHub), dans photos/vignettes/<clé>.jpg.
 * Auteur, licence et lien Commons sont notés dans data/vignettes.json (crédités au survol et dans la page Méthode).
 *
 * Garde-fous : une bonne vignette n'est jamais écrasée par un échec (ni même retéléchargée) ; un thème en échec n'est retenté qu'une
 * fois par jour ; HTTP 429 ou panne passagère = reprise au passage suivant, arrêt du passage après deux refus d'affilée.
 * Rapport : ligne dans le résumé de l'exécution GitHub ; code de sortie 1 (alerte) si un thème vient d'échouer définitivement.
 * Mode d'emploi : docs/vignettes.md.
 *
 * USAGE : node scripts/fetch-vignettes.js [--max=12]
 */
import { readFile, writeFile, mkdir, access, appendFile, unlink } from "fs/promises";
import { spawnSync } from "child_process";
import { tmpdir } from "os";
import path from "path";
import { pathToFileURL } from "url";
import { fetchPoli, USER_AGENT } from "./http.js";
import { ecrireSiChange } from "./garde.js";
import { licenceLibre } from "./portraits-chaine.js";
import { CLES } from "./vignettes-cle.js";

const DATA_FILE = "data/vignettes.json";
const DOSSIER = "photos/vignettes";
export const LARGEUR_MIN = 640;
export const COTE = 320;
export const MAX_OCTETS = 40 * 1024;
const QUALITES = [4, 6, 8, 11, 14, 18, 24, 31]; // qscale ffmpeg : du meilleur au plus léger
const MIMES_OK = /^image\/(jpeg|png|webp|tiff)$/;

/**
 * Candidats Commons par clé, du plus sûr au moins sûr : « Category:… » (fichiers de la catégorie) ou « File:… » (fichier précis).
 * `alt` : texte alternatif neutre ; `lieu` : nom affiché dans le crédit. Un candidat introuvable est simplement sauté.
 */
export const CANDIDATS = {
  assemblee: { lieu: "Palais Bourbon", alt: "Photo d'illustration : Palais Bourbon, siège de l'Assemblée nationale", candidats: ["Category:Palais Bourbon", "Category:Facade of the Palais Bourbon", "Category:Assemblée nationale (France)"] },
  senat: { lieu: "Palais du Luxembourg", alt: "Photo d'illustration : palais du Luxembourg, siège du Sénat", candidats: ["Category:Palais du Luxembourg", "Category:Palais du Luxembourg - Façade", "Category:Sénat (France)"] },
  elysee: { lieu: "Palais de l'Élysée", alt: "Photo d'illustration : palais de l'Élysée, résidence du président de la République", candidats: ["Category:Palais de l'Élysée", "Category:Facade of the Élysée Palace", "Category:Élysée Palace"] },
  gouvernement: { lieu: "Hôtel de Matignon", alt: "Photo d'illustration : hôtel de Matignon, siège du Premier ministre", candidats: ["Category:Hôtel de Matignon", "Category:Hôtel Matignon (Paris)", "Category:Matignon Palace"] },
  budget: { lieu: "Ministère de l'Économie et des Finances (Bercy)", alt: "Photo d'illustration : ministère de l'Économie et des Finances, à Bercy", candidats: ["Category:Ministère de l'Économie et des Finances (Bercy)", "Category:Ministry of the Economy and Finance (France)", "Category:Ministère de l'Économie, des Finances et de la Souveraineté industrielle et numérique"] },
  justice: { lieu: "Palais de justice de Paris", alt: "Photo d'illustration : palais de justice de Paris", candidats: ["Category:Palais de justice de Paris", "Category:Palais de Justice (Paris)", "Category:Tribunal de Paris"] },
  region: { lieu: "Hôtel de région", alt: "Photo d'illustration : hôtel de région, siège d'une assemblée régionale", candidats: ["Category:Hôtels de région en France", "Category:Hôtel de Région (Île-de-France)"] },
  education: { lieu: "Ministère de l'Éducation nationale (hôtel de Rochechouart)", alt: "Photo d'illustration : ministère de l'Éducation nationale, rue de Grenelle", candidats: ["Category:Hôtel de Rochechouart (Paris)", "Category:Ministère de l'Éducation nationale (France)"] },
  securite: { lieu: "Ministère de l'Intérieur (hôtel de Beauvau)", alt: "Photo d'illustration : hôtel de Beauvau, ministère de l'Intérieur", candidats: ["Category:Hôtel de Beauvau", "Category:Ministère de l'Intérieur (France)"] },
  international: { lieu: "Ministère des Affaires étrangères (Quai d'Orsay)", alt: "Photo d'illustration : Quai d'Orsay, ministère de l'Europe et des Affaires étrangères", candidats: ["Category:Ministère de l'Europe et des Affaires étrangères (Quai d'Orsay)", "Category:Quai d'Orsay (ministry)", "Category:Quai d'Orsay"] },
  election: { lieu: "Bureau de vote", alt: "Photo d'illustration : urne et bureau de vote", candidats: ["Category:Ballot boxes of France", "Category:Polling stations in France"] },
};

const texte = (h) => String(h || "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const plat = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const existe = (f) => access(f).then(() => true, () => false);
const lire = async (f) => JSON.parse(await readFile(f, "utf-8").catch(() => "null"));
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...m) => console.log("[fetch-vignettes]", ...m);
const warn = (...m) => console.warn("[fetch-vignettes][ATTENTION]", ...m);

function erreur(message, transitoire = false) { const e = new Error(message); e.transitoire = transitoire; return e; }

/** Appel JSON poli : 429, 5xx et pannes réseau = transitoires (reprise plus tard) ; autre échec HTTP = définitif. */
async function api(url) {
  let res;
  try { res = await fetchPoli(url, { headers: { "User-Agent": USER_AGENT } }); } catch (e) { e.transitoire = true; throw e; }
  if (!res.ok) throw erreur(`HTTP ${res.status}`, res.status === 429 || res.status >= 500);
  await pause(200);
  return res.json();
}
const telecharger = (url) => fetchPoli(url, { headers: { "User-Agent": USER_AGENT } });

/** Redimensionne en carré COTE × COTE recadré au centre, JPEG le plus fidèle qui tient en MAX_OCTETS (ffmpeg). Renvoie un Buffer. */
export async function redimensionner(octets) {
  const dossier = path.join(tmpdir(), `vignette-${process.pid}-${Date.now()}`);
  await mkdir(dossier, { recursive: true });
  const entree = path.join(dossier, "entree"), sortie = path.join(dossier, "sortie.jpg");
  await writeFile(entree, octets);
  try {
    for (const q of QUALITES) {
      const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-i", entree, "-vf", `crop='min(iw,ih)':'min(iw,ih)',scale=${COTE}:${COTE}:flags=lanczos`, "-frames:v", "1", "-q:v", String(q), "-pix_fmt", "yuvj420p", sortie], { encoding: "utf-8" });
      if (r.error) throw erreur(`ffmpeg indisponible (${r.error.message})`);
      if (r.status !== 0) throw erreur(`ffmpeg : ${String(r.stderr).trim().slice(0, 160)}`);
      const jpeg = await readFile(sortie);
      if (jpeg.length <= MAX_OCTETS) return jpeg;
    }
    throw erreur(`image trop lourde même à la plus basse qualité (maximum ${MAX_OCTETS / 1024} Ko)`);
  } finally {
    await unlink(entree).catch(() => {});
    await unlink(sortie).catch(() => {});
  }
}

const PANORAMA = /panorama|\bfop\b|no freedom/i;
const MAUVAIS_NOM = /portrait|avec |\bwith\b|\band\b| et |visite|visit|ceremon|manifestation|demonstration|protest|greve|strike|foule|crowd|meeting|conference|seance|session|ministre|minister|president|depute|senateur|maire|police|cordon|attentat|attack|plaque|logo|\bmap\b|carte|plan |schema|diagram|interior of|interieur de|interieur du|salle|statue|detail|fresque|dessin|painting|gravure|engraving|affiche|poster|timbre|stamp|postcard/;
const BON_NOM = /facade|exterieur|exterior|vue |view|palais|hotel|ministere|ministry|batiment|building|entree|entrance|cour |nuit|night/;
const MAUVAISES_CATEGORIES = /people|persons|politicians|portrait|demonstration|manifestation|protest|crowd|riot|ceremon|meeting|military|police|interiors? of|plan|diagram|map|drawing|painting|engraving|postcard|poster/i;

/**
 * Évalue un fichier Commons (page de l'API imageinfo). Renvoie { retenu:true, note, … } ou { retenu:false, raison }.
 * Fonction pure (testable). Licence : voir portraits-chaine.licenceLibre (NC, ND, non libre, fair use refusés).
 */
export function evaluerFichier(page, { maintenant = Date.now() } = {}) {
  const fichier = String(page?.title || "").replace(/^File:/, "");
  const info = page?.imageinfo?.[0];
  if (!info) return { retenu: false, fichier, raison: "fichier absent" };
  if (!MIMES_OK.test(info.mime || "")) return { retenu: false, fichier, raison: `format non accepté (${info.mime})` };
  const m = info.extmetadata || {};
  let licence;
  try { licence = licenceLibre(m); } catch (e) { return { retenu: false, fichier, raison: e.message }; }
  if (PANORAMA.test(`${texte(m.Restrictions?.value)} ${texte(m.Categories?.value)}`)) return { retenu: false, fichier, raison: "panorama sans liberté" };
  const l = info.width || 0, h = info.height || 0;
  if (l < LARGEUR_MIN || h < 480) return { retenu: false, fichier, raison: `trop petit (${l}×${h})` };
  const ratio = l / h;
  if (ratio < 0.8 || ratio > 2.2) return { retenu: false, fichier, raison: `format inexploitable pour un carré (${l}×${h})` };
  const nom = plat(fichier).replace(/[_.-]+/g, " ");
  if (MAUVAIS_NOM.test(nom)) return { retenu: false, fichier, raison: "nom évoquant une personne, une foule ou autre chose qu'un bâtiment" };
  if (MAUVAISES_CATEGORIES.test(texte(m.Categories?.value))) return { retenu: false, fichier, raison: "catégorie de personnes, de manifestation ou de plan" };
  if (!info.thumburl) return { retenu: false, fichier, raison: "pas de vignette Commons" };
  // Note : carré ou paysage proche du 4:3 (le recadrage central garde l'essentiel), définition, récence, nom évocateur d'une façade
  let note = 0;
  note += ratio >= 1 && ratio <= 1.6 ? 30 : ratio < 1 ? 15 : 12;
  note += Math.min(20, Math.round(Math.min(l, h) / 150));
  const date = Date.parse(texte(m.DateTimeOriginal?.value)) || Date.parse(info.timestamp || "");
  if (date) { const ans = (maintenant - date) / (365.25 * 864e5); note += ans < 5 ? 20 : ans < 10 ? 12 : ans < 15 ? 6 : 0; }
  if (BON_NOM.test(nom)) note += 12;
  return { retenu: true, fichier, note, licence, auteur: texte(m.Artist?.value).slice(0, 120) || "Auteur inconnu", source: info.descriptionurl, largeur: l, hauteur: h, vignette: info.thumburl, date: date ? new Date(date).toISOString().slice(0, 10) : undefined };
}

/** Meilleur fichier retenu d'une liste de pages (note décroissante, puis nom pour un résultat stable). */
export function choisirMeilleur(pages, options) {
  const evalues = pages.map((p) => evaluerFichier(p, options));
  const retenus = evalues.filter((e) => e.retenu).sort((a, b) => b.note - a.note || a.fichier.localeCompare(b.fichier));
  return { meilleur: retenus[0] || null, refus: evalues.filter((e) => !e.retenu) };
}

const PROPS = "prop=imageinfo&iiprop=url|size|mime|timestamp|extmetadata&iiurlwidth=640";
async function pagesDuCandidat(candidat, ctx) {
  const base = "https://commons.wikimedia.org/w/api.php?action=query&format=json&";
  const url = /^File:/i.test(candidat)
    ? `${base}${PROPS}&titles=${encodeURIComponent(candidat)}`
    : `${base}generator=categorymembers&gcmtype=file&gcmlimit=40&gcmtitle=${encodeURIComponent(candidat)}&${PROPS}`;
  const d = await ctx.api(url);
  return Object.values(d.query?.pages || {}).filter((p) => p.imageinfo);
}

/**
 * Trouve, vérifie, télécharge et réduit la photo d'une clé. `ctx` : { api, telecharger, redimensionner, aujourdhui } (injectables :
 * essais hors ligne). Renvoie { statut:"photo", octets, entree } ou { statut:"echec", raison, transitoire }.
 */
export async function resoudreCle(cle, ctx) {
  const def = CANDIDATS[cle];
  if (!def) return { statut: "echec", raison: "clé inconnue", transitoire: false };
  const raisons = [];
  for (const candidat of def.candidats) {
    let pages;
    try { pages = await pagesDuCandidat(candidat, ctx); } catch (e) {
      raisons.push(`${candidat} : ${e.message}`);
      if (e.transitoire) return { statut: "echec", raison: raisons.join(" ; "), transitoire: true }; // 429 : on n'insiste pas, reprise au passage suivant
      continue;
    }
    const { meilleur, refus } = choisirMeilleur(pages, ctx);
    if (!meilleur) { raisons.push(`${candidat} : aucun fichier libre exploitable (${pages.length} examiné(s)${refus[0] ? `, p. ex. « ${refus[0].fichier} » : ${refus[0].raison}` : ""})`); continue; }
    try {
      const res = await ctx.telecharger(meilleur.vignette);
      if (!res.ok) throw erreur(`téléchargement impossible (HTTP ${res.status})`, res.status === 429 || res.status >= 500);
      const brut = Buffer.from(await res.arrayBuffer());
      const octets = await (ctx.redimensionner || redimensionner)(brut);
      const { vignette: _v, note: _n, ...credit } = meilleur;
      return { statut: "photo", octets, entree: { lieu: def.lieu, alt: def.alt, ...credit, candidat, octets: octets.length, ajoutLe: ctx.aujourdhui } };
    } catch (e) {
      raisons.push(`${meilleur.fichier} : ${e.message}`);
      if (e.transitoire) return { statut: "echec", raison: raisons.join(" ; "), transitoire: true };
    }
  }
  return { statut: "echec", raison: raisons.join(" ; ") || "aucun candidat", transitoire: false };
}

/** Une clé en échec est-elle à retenter ? Jamais deux fois le même jour, sauf après une panne passagère (429…). Pure. */
export function doitRetenter(echec, aujourdhui) {
  if (!echec) return true;
  if (echec.transitoire) return true;
  return echec.dernierEssai !== aujourdhui;
}

/** Ligne de rapport pour le résumé de l'exécution. Pure. */
export function ligneRapport(data, cles = CLES) {
  const avec = cles.filter((c) => data.vignettes?.[c]);
  const sans = cles.filter((c) => !data.vignettes?.[c]);
  return `Vignettes d'actualité : ${avec.length}/${cles.length} institutions avec photo libre${sans.length ? ` ; pictogramme pour : ${sans.join(", ")}` : ""}.`;
}

async function main() {
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const MAX = parseInt(process.argv.find((a) => a.startsWith("--max="))?.split("=")[1] ?? "12", 10);
  const data = (await lire(DATA_FILE)) || { source: "Wikimedia Commons (licences libres vérifiées) ; table des candidats : scripts/fetch-vignettes.js", vignettes: {}, echecs: {} };
  data.vignettes ||= {};
  data.echecs ||= {};
  await mkdir(DOSSIER, { recursive: true });
  const ctx = { api, telecharger, aujourdhui };
  let essais = 0, ajouts = 0, definitifs = 0, limites = 0;
  for (const cle of CLES) {
    const fichierLa = data.vignettes[cle] && (await existe(`${DOSSIER}/${cle}.jpg`));
    if (fichierLa) continue; // une bonne vignette n'est jamais écrasée (ni retéléchargée)
    if (data.vignettes[cle]) delete data.vignettes[cle]; // entrée sans fichier : à refaire
    if (!doitRetenter(data.echecs[cle], aujourdhui)) continue;
    if (essais++ >= MAX) break;
    const r = await resoudreCle(cle, ctx);
    if (r.statut === "photo") {
      await writeFile(`${DOSSIER}/${cle}.jpg`, r.octets);
      data.vignettes[cle] = { chemin: `${DOSSIER}/${cle}.jpg`, ...r.entree };
      delete data.echecs[cle];
      ajouts++; limites = 0;
      log(`${cle} : ${r.entree.fichier} (${r.entree.licence}, ${Math.round(r.octets.length / 1024)} Ko).`);
    } else {
      data.echecs[cle] = { dernierEssai: aujourdhui, raison: r.raison.slice(0, 400), ...(r.transitoire ? { transitoire: true } : {}) };
      if (r.transitoire) limites++; else { definitifs++; limites = 0; }
      warn(`${cle} : pas de photo (${r.raison})${r.transitoire ? " ; reprise au prochain passage" : ""}.`);
    }
    if (limites >= 2) { warn("limite de débit (HTTP 429) ou panne à répétition : arrêt de ce passage, reprise au suivant."); break; }
  }
  data.vignettes = Object.fromEntries(CLES.filter((c) => data.vignettes[c]).map((c) => [c, data.vignettes[c]]));
  data.echecs = Object.fromEntries(Object.entries(data.echecs).filter(([c]) => CANDIDATS[c] && !data.vignettes[c]));
  data.lastUpdated = new Date().toISOString();
  await ecrireSiChange(DATA_FILE, JSON.stringify(data, null, 1) + "\n");
  const resume = ligneRapport(data);
  log(`${ajouts} vignette(s) ajoutée(s) ; ${resume}`);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `\n${resume}\n`).catch(() => {});
  if (definitifs) { warn(`${definitifs} institution(s) sans photo libre exploitable (pictogramme conservé).`); process.exitCode = 1; }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { warn("ÉCHEC :", e.message); process.exitCode = 1; });
