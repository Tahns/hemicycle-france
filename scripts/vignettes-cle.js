/**
 * vignettes-cle.js
 * ----------------
 * Quelle vignette (photo libre d'une institution) pour un sujet d'actualité ? Une CLÉ d'institution, ou null (pictogramme).
 * Table prudente : une photo ne sert qu'à illustrer le LIEU d'une institution, jamais une personne ni une affaire.
 *   - justice : tribunal neutre (palais de justice) seulement si AUCUNE personne n'est nommée ; sinon null ;
 *   - sécurité : bâtiment du ministère seulement hors événement grave (attentat, mort, violences…) ; sinon null ;
 *   - thème « vie politique » sans institution identifiable : null (pictogramme).
 * Les clés sont celles de data/vignettes.json (candidats Commons : scripts/fetch-vignettes.js).
 */
const plat = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, "'").toLowerCase();

const GRAVE = /attentat|terror|\bmort|\btue|meurtr|assassin|\bviol|agress|emeute|victime|fusill|deces|blesse|otage|disparu|noye|accident/;
const ELYSEE = /elysee|chef de l'etat|president de la republique/;
const MATIGNON = /matignon|premier ministre/;
const REGION = /conseil regional|regionales?\b|region (ile|auvergne|bretagne|occitanie|grand|hauts|normandie|nouvelle|pays|provence|centre|bourgogne|corse)/;
const EDUCATION = /ecole|lycee|college|education nationale|enseignant|professeur|rentree scolaire|baccalaureat|\bbac\b/;

/** Clés possibles, dans l'ordre de présentation du rapport. */
export const CLES = ["assemblee", "senat", "elysee", "gouvernement", "budget", "justice", "region", "education", "securite", "international", "election"];

/**
 * `theme` : thème de scripts/illustrations.js ; `titres` : titres du sujet ; `personnes` : personnes reconnues (tableau, même vide).
 * Fonction pure (testable).
 */
export function cleVignette(theme, titres, personnes = []) {
  const tout = plat(Array.isArray(titres) ? titres.join(" ") : titres);
  if (theme === "justice") return personnes.length ? null : "justice"; // jamais le visage ni le nom d'une personne mise en cause : tribunal neutre ou rien
  if (theme === "securite") return GRAVE.test(tout) ? null : "securite";
  if (REGION.test(tout)) return "region";
  if (EDUCATION.test(tout)) return "education";
  if (theme === "gouvernement") return ELYSEE.test(tout) && !MATIGNON.test(tout) ? "elysee" : "gouvernement";
  if (["assemblee", "senat", "budget", "international", "election"].includes(theme)) return theme;
  return null;
}

// ---------- Variantes : plusieurs photos libres par institution ----------
/**
 * Format de data/vignettes.json : une entrée par clé. Ses champs (chemin, lieu, alt, auteur, licence, source, chemin_hd…) sont ceux de la
 * PREMIÈRE photo (formats d'origine : lus tels quels par les stories et les crédits). Quand le fetch a trouvé d'autres photos libres et
 * distinctes, l'entrée porte en plus `variantes: [ {chemin, lieu, alt, auteur, licence, source, fichier, chemin_hd…}, … ]` : la liste COMPLÈTE,
 * dont le premier élément est la copie de la première photo. Sans `variantes` (état d'origine), l'entrée est sa propre unique variante.
 */
export const NB_VARIANTES = 4; // photos visées par institution (le fetch en retient 3 ou 4 : s'arrête à 4)
export const MIN_VARIANTES = 3; // en dessous, avertissement (thème pauvre en photos libres)

/** Variantes d'une entrée, première en tête (les champs de l'entrée font foi pour la première) ; lieu et texte alternatif hérités de l'entrée. Pure. */
export function variantesDe(entree) {
  if (!entree || typeof entree !== "object") return [];
  const { variantes, ...base } = entree;
  const liste = Array.isArray(variantes) ? variantes.filter((v) => v && typeof v === "object" && typeof v.chemin === "string" && v.chemin) : [];
  let toutes;
  if (!base.chemin) toutes = liste;
  else if (liste[0]?.chemin === base.chemin) toutes = [{ ...liste[0], ...base }, ...liste.slice(1)];
  else toutes = [base, ...liste.filter((v) => v.chemin !== base.chemin)];
  return toutes.map((v) => ({ ...(base.lieu ? { lieu: base.lieu } : {}), ...(base.alt ? { alt: base.alt } : {}), ...v }));
}

/** Recompose l'entrée à stocker depuis la liste des variantes : première photo à plat (compatibilité), `variantes` seulement s'il y en a plusieurs. Pure. */
export function composerEntree(variantes, extra = {}) {
  if (!variantes.length) return null;
  const [premiere, ...autres] = variantes;
  return { ...premiere, ...extra, ...(autres.length ? { variantes: variantes.map((v) => ({ ...v })) } : {}) };
}

/** Nom de fichier de la k-ième photo d'une clé (k = 1 : <clé>.jpg ; k >= 2 : <clé>-<k>.jpg), avec ou sans suffixe HD. Pure. */
export const nomFichierVariante = (cle, k = 1, hd = false) => `${cle}${k > 1 ? `-${k}` : ""}${hd ? "-hd" : ""}.jpg`;

/** Lit un nom de fichier de photos/vignettes/ : { cle, rang (1 pour la première), hd } ou null. Pure. */
export function lireNomFichier(fichier) {
  const m = String(fichier).match(/^([a-z]+)(?:-(\d+))?(-hd)?\.[^.]+$/i);
  return m ? { cle: m[1], rang: m[2] ? Number(m[2]) : 1, hd: !!m[3] } : null;
}
