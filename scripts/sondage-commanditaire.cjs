/**
 * sondage-commanditaire.cjs
 * -------------------------
 * Mentions obligatoires d'un sondage (loi n° 77-808 du 19 juillet 1977, art. 2 : organisme, commanditaire, dates, échantillon, marge d'erreur,
 * notice) : le COMMANDITAIRE doit être connu avant toute publication (audit J-16). Il se lit :
 *  1. dans data/sondages-veille.json (notice déposée à la Commission des sondages : institut + fin de terrain) ;
 *  2. à défaut, dans le NOM du fichier de la notice (« …-ifop-le-figaro-30-septembre.pdf » donne « Le Figaro »).
 * Sans commanditaire connu : aucune story, aucune ligne de contexte (null). Fonctions pures, aucun réseau.
 */
const plat = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// [fragment du nom de fichier (entre tirets), nom affiché]
const COMMANDITAIRES = [
  ["le-figaro", "Le Figaro"], ["figaro", "Le Figaro"], ["rtl", "RTL"], ["politico", "Politico"], ["cnews", "CNews"], ["huffpost", "HuffPost"], ["le-monde", "Le Monde"],
  ["lci", "LCI"], ["bfmtv", "BFMTV"], ["franceinfo", "franceinfo"], ["ouest-france", "Ouest-France"], ["l-opinion", "L'Opinion"], ["la-tribune", "La Tribune"],
  ["le-parisien", "Le Parisien"], ["marianne", "Marianne"], ["le-jdd", "Le JDD"], ["jdd", "Le JDD"], ["sud-radio", "Sud Radio"], ["europe-1", "Europe 1"], ["europe1", "Europe 1"],
  ["france-24", "France 24"], ["l-humanite", "L'Humanité"], ["la-croix", "La Croix"], ["challenges", "Challenges"], ["valeurs-actuelles", "Valeurs actuelles"],
  ["le-point", "Le Point"], ["l-express", "L'Express"], ["les-echos", "Les Échos"], ["tf1", "TF1"], ["m6", "M6"], ["le-telegramme", "Le Télégramme"], ["sud-ouest", "Sud Ouest"],
  ["la-provence", "La Provence"], ["le-progres", "Le Progrès"], ["paris-match", "Paris Match"], ["l-obs", "L'Obs"], ["libération", "Libération"], ["liberation", "Libération"],
];

/** Commanditaire d'une enquête { nom, dateFin, url } : { nom, origine } ou null. `veille` : data/sondages-veille.json (ou sa liste « enquetes »). */
function commanditaire(inst, veille) {
  if (!inst) return null;
  const liste = Array.isArray(veille) ? veille : veille?.enquetes || [];
  const n = liste.find((e) => e?.media && plat(e.institut) === plat(inst.nom) && e.terrain?.fin === inst.dateFin);
  if (n) return { nom: String(n.media), origine: "notice" };
  const fichier = plat(decodeURIComponent(String(inst.url || "").split("?")[0].split("/").pop() || "")).replace(/\.pdf$/, "");
  for (const [frag, nom] of COMMANDITAIRES) {
    if (new RegExp(`(^|-)${plat(frag).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(-|$)`).test(fichier)) return { nom, origine: "fichier de la notice" };
  }
  return null;
}
/** Marge d'erreur théorique à 95 % (échantillon aléatoire simple), en points, un chiffre après la virgule (chaîne « 2,5 »). */
const margeErreur = (n) => (n > 0 ? (1.96 * Math.sqrt(0.25 / n) * 100).toFixed(1).replace(".", ",") : "");

module.exports = { commanditaire, margeErreur, COMMANDITAIRES };
