/**
 * Détecteurs généraux sur un fichier data/*.json (utilisés par check-data.js) : fichier vide, JSON invalide,
 * taille excessive (un script qui s'emballe ne doit pas gonfler le dépôt), contenu vide, horodatage « lastUpdated »
 * invalide ou dans le futur. Renvoie la liste des erreurs (vide = sain). Fonction pure, testée dans tests/http.test.mjs.
 */
export function controlerFichierJson(nom, texte, { maintenant = Date.now(), tailleMax = 12 * 1024 * 1024 } = {}) {
  const e = [];
  if (!texte.trim()) return [`${nom} : fichier vide`];
  const octets = Buffer.byteLength(texte);
  if (octets > tailleMax) e.push(`${nom} : ${Math.round(octets / 1048576)} Mo, au-delà de ${Math.round(tailleMax / 1048576)} Mo`);
  let d;
  try { d = JSON.parse(texte); } catch (x) { return [...e, `${nom} : JSON invalide (${x.message.slice(0, 80)})`]; }
  if (d === null || (typeof d === "object" && !Object.keys(d).length)) e.push(`${nom} : contenu vide`);
  const t = Date.parse(d?.lastUpdated);
  if (d?.lastUpdated !== undefined && isNaN(t)) e.push(`${nom} : « lastUpdated » invalide`);
  else if (t > maintenant + 36e5) e.push(`${nom} : « lastUpdated » dans le futur (${d.lastUpdated})`);
  return e;
}
