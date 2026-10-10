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
 * EN PLUS, une version haute définition du même fichier (même licence, même crédit) pour le fond des stories : photos/vignettes/<clé>-hd.jpg,
 * photo entière (pas de recadrage), de 1280 px de large (taille standard de miniature Commons : une taille hors liste est refusée en HTTP 400), jamais agrandie, JPEG de 220 Ko au plus ; notée `chemin_hd`
 * dans data/vignettes.json. Une source de moins de 1280 px n'a pas de HD (`hd_indisponible`). Les anciennes entrées sans HD sont complétées au passage suivant.
 * Auteur, licence et lien Commons sont notés dans data/vignettes.json (crédités au survol et dans la page Méthode).
 *
 * PLUSIEURS PHOTOS PAR INSTITUTION : le script retient jusqu'à NB_VARIANTES (4) photos libres et DISTINCTES par clé (fichiers différents, pas le même
 * photographe le même jour ni la même série de noms), pour que deux sujets d'une même liste n'affichent pas la même image. La première reste à plat dans
 * l'entrée de data/vignettes.json (compatibilité : stories, crédits) ; la liste complète est dans `variantes: [ {chemin, lieu, alt, auteur, licence, source,
 * fichier, chemin_hd…}, … ]` (voir scripts/vignettes-cle.js). Fichiers : <clé>.jpg, <clé>-2.jpg, <clé>-3.jpg…, et leurs -hd. Une clé qui n'a qu'une photo
 * (état d'origine) est complétée au fil des passages (une tentative par clé et par jour), sans toucher aux photos déjà en place.
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
import { CLES, NB_VARIANTES, variantesDe, composerEntree, nomFichierVariante, lireNomFichier } from "./vignettes-cle.js";

const DATA_FILE = "data/vignettes.json";
const DOSSIER = "photos/vignettes";
export const LARGEUR_MIN = 640;
export const COTE = 320;
export const MAX_OCTETS = 40 * 1024;
// Version haute définition (fond de story 1080 × 1920) : photos/vignettes/<clé>-hd.jpg, jamais agrandie
// Wikimedia Commons ne sert les miniatures qu'aux largeurs standard (… 960, 1280, 1920…) : toute autre largeur répond HTTP 400, d'où 1280 px fixes
export const LARGEUR_HD_MIN = 1280;
export const LARGEUR_HD_MAX = 1280;
export const MAX_OCTETS_HD = 220 * 1024;
const QUALITES = [4, 6, 8, 11, 14, 18, 24, 31]; // qscale ffmpeg : du meilleur au plus léger
const QUALITES_HD = [3, 5, 7, 9, 12, 15, 19, 24, 31];
const MIMES_OK = /^image\/(jpeg|png|webp|tiff)$/;

/**
 * Candidats Commons par clé, du plus sûr au moins sûr : « Category:… » (fichiers de la catégorie) ou « File:… » (fichier précis).
 * `alt` : texte alternatif neutre ; `lieu` : nom affiché dans le crédit. Un candidat introuvable est simplement sauté.
 */
export const CANDIDATS = {
  assemblee: { lieu: "Palais Bourbon", alt: "Photo d'illustration : Palais Bourbon, siège de l'Assemblée nationale", candidats: ["Category:Palais Bourbon", "Category:Facade of the Palais Bourbon", "Category:Assemblée nationale (France)"] },
  senat: { lieu: "Palais du Luxembourg", alt: "Photo d'illustration : palais du Luxembourg, siège du Sénat", exige: "luxembourg|senat", candidats: ["Category:Palais du Luxembourg", "Category:Palais du Luxembourg - Façade", "Category:Sénat (France)", "Category:Palais du Luxembourg (Paris)", "Search:Palais du Luxembourg Sénat façade", "Search:Sénat palais du Luxembourg rue de Vaugirard"] },
  elysee: { lieu: "Palais de l'Élysée", alt: "Photo d'illustration : palais de l'Élysée, résidence du président de la République", candidats: ["Category:Palais de l'Élysée", "Category:Facade of the Élysée Palace", "Category:Élysée Palace"] },
  gouvernement: { lieu: "Hôtel de Matignon", alt: "Photo d'illustration : hôtel de Matignon, siège du Premier ministre", candidats: ["Category:Hôtel de Matignon", "Category:Hôtel Matignon (Paris)", "Category:Matignon Palace"] },
  budget: { lieu: "Ministère de l'Économie et des Finances (Bercy)", alt: "Photo d'illustration : ministère de l'Économie et des Finances, à Bercy", exige: "bercy|ministere de l.economie|ministry of (the )?economy|ministere des finances", candidats: ["Category:Ministère de l'Économie et des Finances (Bercy)", "Category:Ministry of the Economy and Finance (France)", "Category:Ministère de l'Économie, des Finances et de la Souveraineté industrielle et numérique", "Category:Ministère de l'Économie et des Finances (France)", "Category:Bâtiment Colbert (Paris)", "Category:Ministère de l'Économie et des Finances (Paris)", "Search:Ministère de l'Économie et des Finances Bercy", "Search:Bercy ministère Économie Finances bâtiment Paris"] },
  justice: { lieu: "Palais de justice de Paris", alt: "Photo d'illustration : palais de justice de Paris", candidats: ["Category:Palais de justice de Paris", "Category:Palais de Justice (Paris)", "Category:Tribunal de Paris"] },
  region: { lieu: "Hôtel de région", alt: "Photo d'illustration : hôtel de région, siège d'une assemblée régionale", exige: "hotel de region|conseil regional", candidats: ["Category:Hôtels de région en France", "Category:Hôtel de Région (Île-de-France)", "Category:Hôtel de région Auvergne-Rhône-Alpes", "Category:Hôtel de région Occitanie", "Category:Hôtel de région Bretagne", "Category:Hôtel de région des Pays de la Loire", "Category:Hôtel de région Nouvelle-Aquitaine", "Category:Hôtel de région Hauts-de-France", "Search:Hôtel de région siège conseil régional façade", "Search:Hôtel de région bâtiment conseil régional"] },
  education: { lieu: "Ministère de l'Éducation nationale (hôtel de Rochechouart)", alt: "Photo d'illustration : ministère de l'Éducation nationale, rue de Grenelle", exige: "rochechouart|grenelle|education nationale|ministere de l.education|ministry of (national )?education", candidats: ["Category:Hôtel de Rochechouart (Paris)", "Category:Ministère de l'Éducation nationale (France)", "Category:Hôtel de Rochechouart", "Category:Ministry of National Education (France)", "Category:110 rue de Grenelle (Paris)", "Search:Hôtel de Rochechouart ministère Éducation nationale rue de Grenelle", "Search:Ministère de l'Éducation nationale 110 rue de Grenelle"] },
  securite: { lieu: "Ministère de l'Intérieur (hôtel de Beauvau)", alt: "Photo d'illustration : hôtel de Beauvau, ministère de l'Intérieur", candidats: ["Category:Hôtel de Beauvau", "Category:Ministère de l'Intérieur (France)"] },
  international: { lieu: "Ministère des Affaires étrangères (Quai d'Orsay)", alt: "Photo d'illustration : Quai d'Orsay, ministère de l'Europe et des Affaires étrangères", exige: "quai d.orsay|affaires etrangeres|foreign affairs|ministere de l.europe", candidats: ["Category:Ministère de l'Europe et des Affaires étrangères (Quai d'Orsay)", "Category:Quai d'Orsay (ministry)", "Category:Quai d'Orsay", "Category:Ministère de l'Europe et des Affaires étrangères", "Category:Ministry of Foreign Affairs (France)", "Category:Ministère des Affaires étrangères (France)", "Category:Quai d'Orsay (Paris)", "Search:Quai d'Orsay ministère des Affaires étrangères façade", "Search:Ministère de l'Europe et des Affaires étrangères Quai d'Orsay"] },
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

/**
 * Plan de la version HD d'un fichier de largeur `largeur` : { largeur } (largeur finale : 1280 px, taille standard de miniature Commons, jamais d'agrandissement,
 * photo gardée entière sans recadrage) ou null si la source est trop étroite (moins de LARGEUR_HD_MIN px). Pure.
 */
export function planHd(largeur) {
  const l = Number(largeur) || 0;
  return l >= LARGEUR_HD_MIN ? { largeur: Math.min(LARGEUR_HD_MAX, Math.floor(l)) } : null;
}
/** Adresse de la miniature Commons de largeur `largeur` à partir de celle de 640 px (…/640px-Nom.jpg) ; null si le motif est inconnu. Pure. */
export function urlHd(thumburl, largeur) {
  const u = String(thumburl || "");
  return /\/\d+px-[^/]+$/.test(u) ? u.replace(/\/\d+px-([^/]+)$/, `/${largeur}px-$1`) : null;
}

/** Redimensionne à `largeur` px (hauteur proportionnelle), JPEG le plus fidèle qui tient en MAX_OCTETS_HD (ffmpeg). Renvoie un Buffer. */
export async function redimensionnerHd(octets, largeur = LARGEUR_HD_MAX) {
  const dossier = path.join(tmpdir(), `vignette-hd-${process.pid}-${Date.now()}`);
  await mkdir(dossier, { recursive: true });
  const entree = path.join(dossier, "entree"), sortie = path.join(dossier, "sortie.jpg");
  await writeFile(entree, octets);
  try {
    for (const q of QUALITES_HD) {
      const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-i", entree, "-vf", `scale='min(${largeur},iw)':-2:flags=lanczos`, "-frames:v", "1", "-q:v", String(q), "-pix_fmt", "yuvj420p", sortie], { encoding: "utf-8" });
      if (r.error) throw erreur(`ffmpeg indisponible (${r.error.message})`);
      if (r.status !== 0) throw erreur(`ffmpeg : ${String(r.stderr).trim().slice(0, 160)}`);
      const jpeg = await readFile(sortie);
      if (jpeg.length <= MAX_OCTETS_HD) return jpeg;
    }
    throw erreur(`image HD trop lourde même à la plus basse qualité (maximum ${MAX_OCTETS_HD / 1024} Ko)`);
  } finally {
    await unlink(entree).catch(() => {});
    await unlink(sortie).catch(() => {});
  }
}

/**
 * Version HD d'un fichier déjà évalué et retenu (`meilleur` : sortie d'evaluerFichier). Renvoie { octets, largeur } ou null si la source
 * est trop étroite ; lève une erreur (transitoire ou non) en cas d'échec de téléchargement ou de réduction. Même fichier, donc même licence et même crédit.
 */
export async function produireHd(meilleur, ctx) {
  const plan = planHd(meilleur?.largeur);
  if (!plan) return null;
  const url = urlHd(meilleur.vignette, plan.largeur);
  if (!url) return null;
  const res = await ctx.telecharger(url);
  if (!res.ok) throw erreur(`téléchargement HD impossible (HTTP ${res.status})`, res.status === 429 || res.status >= 500);
  const brut = Buffer.from(await res.arrayBuffer());
  const octets = await (ctx.redimensionnerHd || redimensionnerHd)(brut, plan.largeur);
  return { octets, largeur: plan.largeur };
}

const PANORAMA = /panorama|\bfop\b|no freedom/i;
const MAUVAIS_NOM = /portrait|avec |\bwith\b|\band\b| et |visite|visit|ceremon|manifestation|demonstration|protest|greve|strike|foule|crowd|meeting|conference|seance|session|ministre|minister|president|depute|senateur|maire|police|cordon|attentat|attack|plaque|logo|\bmap\b|carte|plan |schema|diagram|interior of|interieur de|interieur du|salle|statue|detail|fresque|dessin|painting|gravure|engraving|affiche|poster|timbre|stamp|postcard|sculpture|insigne|badge|embleme|emblem|blason|armoiries|coat of arms|drapeau|\bflags?\b|buste|\bbust\b|tableau|mosaique|vitrail|escalier|staircase|maquette|\bmodel\b|miniature|tapisserie|medaille|medal|\bcoin\b|sceau|\bseal\b|signature|document|lettre|\bbook\b|livre/;
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
  const bonNom = BON_NOM.test(nom);
  if (bonNom) note += 12;
  return { retenu: true, fichier, note, bonNom, licence, auteur: texte(m.Artist?.value).slice(0, 120) || "Auteur inconnu", source: info.descriptionurl, largeur: l, hauteur: h, vignette: info.thumburl, date: date ? new Date(date).toISOString().slice(0, 10) : undefined };
}

/** Meilleur fichier retenu d'une liste de pages (note décroissante, puis nom pour un résultat stable). */
export function choisirMeilleur(pages, options) {
  const evalues = pages.map((p) => evaluerFichier(p, options));
  const retenus = evalues.filter((e) => e.retenu).sort((a, b) => b.note - a.note || a.fichier.localeCompare(b.fichier));
  return { meilleur: retenus[0] || null, refus: evalues.filter((e) => !e.retenu) };
}

const racine = (fichier) => plat(fichier).replace(/\.[^.]+$/, "").replace(/[\d_\s.-]+/g, " ").trim();
const memeAuteur = (a, b) => !!a.auteur && a.auteur !== "Auteur inconnu" && plat(a.auteur) === plat(b.auteur);
/** Deux photos trop proches pour être des variantes : même fichier, même auteur le même jour, ou même auteur et même série de noms (« X 1.jpg », « X 2.jpg »). Pure. */
export function tropProches(a, b) {
  if (a.fichier === b.fichier) return true;
  if (!memeAuteur(a, b)) return false;
  return (!!a.date && a.date === b.date) || racine(a.fichier) === racine(b.fichier);
}
/**
 * Variantes à retenir parmi des fichiers déjà évalués (`retenus`, sortie d'evaluerFichier) : par note décroissante, distinctes entre elles et des photos
 * `deja` (déjà en place ou déjà prises), au plus `max`. Pure.
 */
export function choisirVariantes(retenus, deja = [], max = NB_VARIANTES) {
  const tries = [...retenus].sort((a, b) => b.note - a.note || a.fichier.localeCompare(b.fichier));
  const pris = [];
  for (const r of tries) {
    if (pris.length >= max) break;
    if ([...deja, ...pris].some((x) => tropProches(r, x))) continue;
    pris.push(r);
  }
  return pris;
}

const PROPS = "prop=imageinfo&iiprop=url|size|mime|timestamp|extmetadata&iiurlwidth=640";
const BASE_API = "https://commons.wikimedia.org/w/api.php?action=query&format=json&";
/** Sous-catégories à ne pas explorer (intérieurs, jardins, personnes, plans, œuvres…). */
export const SOUS_CAT_EXCLUES = /interior|interieur|salle|salon|jardin|garden|park|parc|musee|museum|people|person|politician|portrait|ceremon|demonstration|manifestation|protest|crowd|meeting|police|military|plan\b|map|diagram|drawing|painting|dessin|engraving|gravure|postcard|poster|affiche|statue|sculpture|detail|logo|stamp|timbre|event|evenement|history|histoire|by year|by date|vehicle|metro|exposition|exhibition/i;
async function pagesDuCandidat(candidat, ctx) {
  let url;
  if (/^Search:/i.test(candidat)) url = `${BASE_API}generator=search&gsrnamespace=6&gsrlimit=40&gsrsearch=${encodeURIComponent(candidat.replace(/^Search:/i, "") + " filetype:bitmap")}&${PROPS}`;
  else if (/^File:/i.test(candidat)) url = `${BASE_API}${PROPS}&titles=${encodeURIComponent(candidat)}`;
  else url = `${BASE_API}generator=categorymembers&gcmtype=file&gcmlimit=40&gcmtitle=${encodeURIComponent(candidat)}&${PROPS}`;
  const d = await ctx.api(url);
  return Object.values(d.query?.pages || {}).filter((p) => p.imageinfo);
}
/** Sous-catégories directes d'une catégorie Commons (hors exclusions), 12 au plus. */
async function sousCategories(categorie, ctx) {
  const d = await ctx.api(`${BASE_API}list=categorymembers&cmtype=subcat&cmlimit=50&cmtitle=${encodeURIComponent(categorie)}`);
  return (d.query?.categorymembers || []).map((c) => c.title).filter((t) => t && !SOUS_CAT_EXCLUES.test(t.replace(/^Category:/, ""))).slice(0, 12);
}
/** Les fichiers d'une catégorie sont souvent rangés dans ses sous-catégories (façade, vue d'ensemble…) : exploration sur deux niveaux, 10 appels au plus. */
async function pagesDesSousCategories(categorie, ctx) {
  const vues = new Set([categorie]);
  let niveau = [categorie], appels = 0;
  const pages = [];
  for (let profondeur = 0; profondeur < 2; profondeur++) {
    const suivant = [];
    for (const c of niveau) {
      if (appels >= 10) return pages;
      appels++;
      for (const sc of await sousCategories(c, ctx)) {
        if (vues.has(sc) || appels >= 10) continue;
        vues.add(sc); suivant.push(sc); appels++;
        pages.push(...await pagesDuCandidat(sc, ctx));
      }
    }
    niveau = suivant;
  }
  return pages;
}

/** Pour une recherche plein texte (candidat « Search: »), le nom du fichier doit citer le lieu (`exige`) : sinon n'importe quel bâtiment passerait. Pure. */
export function filtrerNom(pages, def, candidat) {
  if (!/^Search:/i.test(candidat)) return pages;
  const re = new RegExp(def.exige || "$^", "i");
  return pages.filter((p) => re.test(plat(String(p?.title || "").replace(/^File:/, "")).replace(/[_.-]+/g, " ")));
}

/**
 * Trouve, vérifie, télécharge et réduit les photos d'une clé. `ctx` : { api, telecharger, redimensionner, aujourdhui } (injectables :
 * essais hors ligne). `nombre` : photos voulues (1 par défaut ; le passage normal en demande NB_VARIANTES) ; `existantes` : photos déjà en place
 * (entrées de data/vignettes.json : jamais reprises, et les nouvelles doivent en être distinctes). Les candidats sont parcourus dans l'ordre et on
 * s'arrête dès que `nombre` photos distinctes sont téléchargées. Renvoie { statut:"photo", octets, octetsHd, hdErreur, entree } (= la première photo, forme
 * historique) + { variantes:[{octets, octetsHd, hdErreur, entree}], transitoire? } (transitoire : un 429 a interrompu la recherche, reprise au passage suivant),
 * ou { statut:"echec", raison, transitoire }.
 */
export async function resoudreCle(cle, ctx, { nombre = 1, existantes = [] } = {}) {
  const def = CANDIDATS[cle];
  if (!def) return { statut: "echec", raison: "clé inconnue", transitoire: false };
  const raisons = [];
  const pool = []; // fichiers retenus (évalués), tous candidats confondus
  const obtenus = [];
  const tentes = new Set(existantes.map((e) => e.fichier).filter(Boolean));
  let interrompu = false;
  const evaluer = (pages, candidat) => {
    const evalues = pages.map((p) => evaluerFichier(p, ctx));
    for (const e of evalues) if (e.retenu && !pool.some((x) => x.fichier === e.fichier)) pool.push({ ...e, candidat });
    return { retenus: evalues.filter((e) => e.retenu), refus: evalues.filter((e) => !e.retenu) };
  };
  for (const candidat of def.candidats) {
    let pages;
    try { pages = await pagesDuCandidat(candidat, ctx); } catch (e) {
      raisons.push(`${candidat} : ${e.message}`);
      if (e.transitoire) { interrompu = true; break; } // 429 : on n'insiste pas, reprise au passage suivant
      continue;
    }
    let { retenus, refus } = evaluer(filtrerNom(pages, def, candidat), candidat);
    if (!retenus.length && /^Category:/i.test(candidat)) { // rien dans la catégorie elle-même : on explore ses sous-catégories
      try { pages = pages.concat(await pagesDesSousCategories(candidat, ctx)); } catch (e) {
        raisons.push(`${candidat} (sous-catégories) : ${e.message}`);
        if (e.transitoire) { interrompu = true; break; }
      }
      ({ retenus, refus } = evaluer(filtrerNom(pages, def, candidat), candidat));
    }
    if (!retenus.length) { raisons.push(`${candidat} : aucun fichier libre exploitable (${pages.length} examiné(s)${refus[0] ? `, p. ex. « ${refus[0].fichier} » : ${refus[0].raison}` : ""})`); continue; }
    // La première photo d'une clé garde le critère historique ; les variantes suivantes doivent en plus avoir un nom de fichier de bâtiment (façade, palais, hôtel, vue…) : pas d'objet, d'insigne ni de détail
    const dispo = pool.filter((x) => !tentes.has(x.fichier)), deja = [...existantes, ...obtenus.map((o) => o.entree)], reste = nombre - obtenus.length;
    const choix = deja.length ? choisirVariantes(dispo.filter((x) => x.bonNom), deja, reste) : (() => { const p = choisirVariantes(dispo, deja, 1); return [...p, ...choisirVariantes(dispo.filter((x) => x.bonNom), p, reste - 1)]; })();
    for (const meilleur of choix) {
      tentes.add(meilleur.fichier);
      try {
        const res = await ctx.telecharger(meilleur.vignette);
        if (!res.ok) throw erreur(`téléchargement impossible (HTTP ${res.status})`, res.status === 429 || res.status >= 500);
        const brut = Buffer.from(await res.arrayBuffer());
        const octets = await (ctx.redimensionner || redimensionner)(brut);
        const { vignette: _v, note: _n, bonNom: _b, candidat: _c, ...credit } = meilleur;
        // Version HD : au mieux (un échec ne fait pas perdre la vignette carrée ; reprise au passage suivant)
        let hd = null, hdErreur = null;
        try { hd = await produireHd(meilleur, ctx); } catch (e) { hdErreur = e; }
        obtenus.push({ octets, octetsHd: hd?.octets, hdErreur, entree: { lieu: def.lieu, alt: def.alt, ...credit, candidat: meilleur.candidat, octets: octets.length, ...(hd ? { largeur_hd: hd.largeur, octets_hd: hd.octets.length } : {}), ajoutLe: ctx.aujourdhui } });
      } catch (e) {
        raisons.push(`${meilleur.fichier} : ${e.message}`);
        if (e.transitoire) { interrompu = true; break; }
      }
    }
    if (interrompu || obtenus.length >= nombre) break;
  }
  if (!obtenus.length) return { statut: "echec", raison: raisons.join(" ; ") || "aucun candidat", transitoire: interrompu };
  return { statut: "photo", ...obtenus[0], variantes: obtenus, ...(interrompu ? { transitoire: true } : {}) };
}

/**
 * Complète une entrée existante (sans `chemin_hd`) : retrouve le fichier Commons, revérifie sa licence puis produit la HD.
 * Renvoie { octets, largeur } ou null (source trop étroite / fichier introuvable) ; lève une erreur en cas de panne.
 */
export async function completerHd(entree, ctx) {
  if (!entree?.fichier) return null;
  const pages = await pagesDuCandidat(`File:${entree.fichier}`, ctx);
  const ev = evaluerFichier(pages[0], ctx);
  if (!ev.retenu) return null;
  return produireHd(ev, ctx);
}

/** Une entrée avec photo carrée mais sans HD est-elle à compléter ? Une fois par jour au plus après un échec, jamais si la source est trop étroite. Pure. */
export function hdAFaire(entree, aujourdhui) {
  if (!entree || entree.chemin_hd) return false;
  if (entree.hd_indisponible) return false;
  return entree.hd_essai !== aujourdhui;
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
  const photos = avec.reduce((n, c) => n + Math.max(1, variantesDe(data.vignettes[c]).length), 0);
  return `Vignettes d'actualité : ${avec.length}/${cles.length} institutions avec photo libre${sans.length ? ` ; pictogramme pour : ${sans.join(", ")}` : ""} ; ${photos} photo(s) au total (objectif ${NB_VARIANTES} par institution).`;
}

/** Une institution qui a des photos mais moins que NB_VARIANTES est-elle à compléter ? Une tentative par jour au plus (le tri Commons ne change pas d'une heure à l'autre). Pure. */
export function variantesAFaire(nombre, essai, aujourdhui) {
  return nombre > 0 && nombre < NB_VARIANTES && essai !== aujourdhui;
}

/** Premier rang libre (>= 2) pour une nouvelle variante de `cle`, d'après les fichiers déjà pris. Pure. */
export function rangLibre(cle, variantes) {
  const pris = new Set(variantes.map((v) => lireNomFichier(String(v.chemin || "").split("/").pop() || "")?.rang));
  let k = 2;
  while (pris.has(k)) k++;
  return k;
}

async function main() {
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const MAX = parseInt(process.argv.find((a) => a.startsWith("--max="))?.split("=")[1] ?? "12", 10);
  const data = (await lire(DATA_FILE)) || { source: "Wikimedia Commons (licences libres vérifiées) ; table des candidats : scripts/fetch-vignettes.js", vignettes: {}, echecs: {} };
  data.vignettes ||= {};
  data.echecs ||= {};
  data.variantesEssais ||= {}; // clé -> date du dernier passage de complément des variantes (une tentative par jour)
  await mkdir(DOSSIER, { recursive: true });
  const ctx = { api, telecharger, aujourdhui };
  let essais = 0, ajouts = 0, definitifs = 0, limites = 0, nouvellesVariantes = 0;
  const ecrireVariante = async (cle, v, rang) => { // écrit les fichiers d'une variante et renvoie son enregistrement
    const carre = `${DOSSIER}/${nomFichierVariante(cle, rang)}`, hdChemin = `${DOSSIER}/${nomFichierVariante(cle, rang, true)}`;
    await writeFile(carre, v.octets);
    const e = { chemin: carre, ...v.entree };
    if (v.octetsHd) { await writeFile(hdChemin, v.octetsHd); e.chemin_hd = hdChemin; }
    else if (v.hdErreur) e.hd_essai = aujourdhui;
    else e.hd_indisponible = true;
    return e;
  };
  for (const cle of CLES) {
    let vs = variantesDe(data.vignettes[cle]);
    // Une variante dont le fichier manque est retirée ; si c'est la première, toute l'entrée est à refaire
    if (vs.length && !(await existe(`${DOSSIER}/${nomFichierVariante(cle, 1)}`))) {
      for (const v of vs.slice(1)) for (const f of [v.chemin, v.chemin_hd]) if (f) await unlink(f).catch(() => {});
      delete data.vignettes[cle]; vs = [];
    }
    const gardees = [];
    for (const v of vs) if (await existe(v.chemin)) gardees.push(v);
    vs = gardees;
    if (vs.length) { // une bonne vignette n'est jamais écrasée (ni retéléchargée) ; seules les HD manquantes sont complétées
      let arret = false;
      for (const e of vs) {
        if (e.chemin_hd && !(await existe(e.chemin_hd))) { delete e.chemin_hd; delete e.largeur_hd; delete e.octets_hd; }
        if (!hdAFaire(e, aujourdhui) || essais >= MAX) continue;
        essais++;
        try {
          const hd = await completerHd(e, ctx);
          if (hd) { const cheminHd = e.chemin.replace(/\.jpe?g$/i, "-hd.jpg"); await writeFile(cheminHd, hd.octets); Object.assign(e, { chemin_hd: cheminHd, largeur_hd: hd.largeur, octets_hd: hd.octets.length }); delete e.hd_essai; limites = 0; log(`${cle} : version HD de ${e.chemin} (${hd.largeur} px, ${Math.round(hd.octets.length / 1024)} Ko).`); }
          else e.hd_indisponible = true; // source trop étroite ou fichier retiré de Commons
        } catch (err) { e.hd_essai = aujourdhui; if (err.transitoire) limites++; warn(`${cle} : HD impossible (${err.message}).`); }
        if (limites >= 2) { arret = true; break; }
      }
      // Compléter les variantes (photos distinctes de la même institution) : une tentative par jour, sans toucher à l'existant
      if (!arret && essais < MAX && variantesAFaire(vs.length, data.variantesEssais[cle], aujourdhui)) {
        essais++;
        const r = await resoudreCle(cle, ctx, { nombre: NB_VARIANTES - vs.length, existantes: vs });
        if (r.statut === "photo") {
          for (const v of r.variantes) { vs.push(await ecrireVariante(cle, v, rangLibre(cle, vs))); nouvellesVariantes++; log(`${cle} : variante ${vs.length} : ${vs[vs.length - 1].fichier} (${vs[vs.length - 1].licence}).`); }
          limites = r.transitoire ? limites + 1 : 0;
          if (!r.transitoire) data.variantesEssais[cle] = aujourdhui;
        } else if (r.transitoire) { limites++; warn(`${cle} : variantes : ${r.raison} ; reprise au prochain passage.`); }
        else { data.variantesEssais[cle] = aujourdhui; warn(`${cle} : pas de variante supplémentaire (${r.raison.slice(0, 200)}).`); }
        if (limites >= 2) arret = true;
      }
      data.vignettes[cle] = composerEntree(vs);
      if (arret) { warn("limite de débit (HTTP 429) ou panne à répétition : arrêt de ce passage, reprise au suivant."); break; }
      continue;
    }
    if (!doitRetenter(data.echecs[cle], aujourdhui)) continue;
    if (essais++ >= MAX) break;
    const r = await resoudreCle(cle, ctx, { nombre: NB_VARIANTES });
    if (r.statut === "photo") {
      const nouvelles = [];
      for (const [i, v] of r.variantes.entries()) nouvelles.push(await ecrireVariante(cle, v, i + 1));
      data.vignettes[cle] = composerEntree(nouvelles);
      if (!r.transitoire) data.variantesEssais[cle] = aujourdhui;
      delete data.echecs[cle];
      ajouts++; limites = r.transitoire ? limites + 1 : 0;
      log(`${cle} : ${nouvelles.map((e) => `${e.fichier} (${e.licence}, ${Math.round(e.octets / 1024)} Ko)`).join(" ; ")}.`);
    } else {
      data.echecs[cle] = { dernierEssai: aujourdhui, raison: r.raison.slice(0, 400), ...(r.transitoire ? { transitoire: true } : {}) };
      if (r.transitoire) limites++; else { definitifs++; limites = 0; }
      warn(`${cle} : pas de photo (${r.raison})${r.transitoire ? " ; reprise au prochain passage" : ""}.`);
    }
    if (limites >= 2) { warn("limite de débit (HTTP 429) ou panne à répétition : arrêt de ce passage, reprise au suivant."); break; }
  }
  data.vignettes = Object.fromEntries(CLES.filter((c) => data.vignettes[c]).map((c) => [c, data.vignettes[c]]));
  data.echecs = Object.fromEntries(Object.entries(data.echecs).filter(([c]) => CANDIDATS[c] && !data.vignettes[c]));
  data.variantesEssais = Object.fromEntries(Object.entries(data.variantesEssais).filter(([c]) => data.vignettes[c]));
  data.lastUpdated = new Date().toISOString();
  await ecrireSiChange(DATA_FILE, JSON.stringify(data, null, 1) + "\n");
  const resume = ligneRapport(data);
  log(`${ajouts} institution(s) nouvelle(s), ${nouvellesVariantes} variante(s) ajoutée(s) ; ${resume}`);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `\n${resume}\n`).catch(() => {});
  if (definitifs) { warn(`${definitifs} institution(s) sans photo libre exploitable (pictogramme conservé).`); process.exitCode = 1; }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { warn("ÉCHEC :", e.message); process.exitCode = 1; });
