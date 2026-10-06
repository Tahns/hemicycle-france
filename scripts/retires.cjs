/**
 * retires.cjs
 * -----------
 * Contenus « retirés » (audit J-23) : publications faites HORS de la chaîne automatique (registre, mediaId « windsor ») dont le texte viole la liste prudente
 * (imputation à une personne nommée, mineurs, violences…). Le registre data/instagram-publiees.json n'est PAS modifié (la trace d'historique et l'anti-doublon restent) ;
 * leurs identifiants sont listés dans data/instagram-retires.json et :
 *  - le publieur (publier-stories.cjs) ne les publie jamais, même si une entrée de la file reprend leur id ;
 *  - ni le publieur ni les stories (stories-auto.cjs) ne reprennent leur texte : titres, sujets et légendes de ces entrées sont ignorés
 *    pour la détection de sujets proches et pour tout contenu produit ;
 *  - leurs images (instagram/auto/<id>.jpg) sont supprimées du site à la prochaine exécution (nettoyerImages).
 * Le propriétaire du compte retire lui-même la story concernée sur Instagram (aucune API de suppression de story).
 */
const fs = require("fs");
const path = require("path");

const FICHIER = process.env.RETIRES_FICHIER || path.resolve(__dirname, "..", "data", "instagram-retires.json");

/** Ensemble des identifiants retirés (vide si le fichier est absent ; illisible : on lève, l'appelant échoue fermé). */
function lireRetires(fichier = FICHIER) {
  let brut;
  try { brut = fs.readFileSync(fichier, "utf-8"); } catch (e) { if (e.code === "ENOENT") return new Set(); throw e; }
  const j = JSON.parse(brut);
  return new Set((Array.isArray(j?.ids) ? j.ids : []).filter((x) => typeof x === "string" && x));
}
/** Version qui ne lève jamais : liste vide si illisible (les appelants qui filtrent des textes n'ont pas de raison de s'arrêter). */
function lireRetiresSur(fichier = FICHIER) { try { return lireRetires(fichier); } catch (e) { return new Set(); } }
/** Entrées sans les contenus retirés. */
const sansRetires = (entrees, retires) => (entrees || []).filter((e) => !(retires && retires.has(e?.id)));

module.exports = { lireRetires, lireRetiresSur, sansRetires, FICHIER };
