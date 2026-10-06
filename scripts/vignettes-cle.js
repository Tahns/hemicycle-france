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
