/**
 * lois-format.js
 * --------------
 * Format compact de data/lois.json : pour les scrutins de l'Assemblée (qui ont un numéro), les champs
 * qui se déduisent du numéro ne sont pas écrits dans le fichier (−20 % de poids, −100 Ko compressés) :
 * id, sourceUrl, sourceLabel, source, reel, le thème par défaut et l'adresse du dossier législatif. Ils sont reconstitués à la lecture,
 * par ces fonctions côté scripts et par completerLoi() dans index.html (même règle).
 */

const LEGISLATURE = "17";

const urlDossier = (ref) => `https://www.assemblee-nationale.fr/dyn/${LEGISLATURE}/dossiers/${ref}`;

function deduits(numero) {
  return {
    id: `an-scrutin-${numero}`,
    sourceUrl: `https://www.assemblee-nationale.fr/dyn/${LEGISLATURE}/scrutins/${numero}`,
    sourceLabel: `Assemblée nationale — scrutin n°${numero}`,
    source: "auto-assemblee-nationale",
    reel: true,
    theme: "À catégoriser",
  };
}

/** Reconstitue les champs déduits (à la lecture du fichier). */
export function completer(l) {
  if (l.numero === undefined) return l;
  const d = deduits(l.numero);
  for (const k of Object.keys(d)) if (l[k] === undefined) l[k] = d[k];
  if (l.dossierRef && l.dossierUrl === undefined) l.dossierUrl = urlDossier(l.dossierRef);
  return l;
}

/** Retire les champs égaux à leur valeur déduite (à l'écriture du fichier). */
export function compacter(l) {
  if (l.numero === undefined) return l;
  const d = deduits(l.numero);
  const sortie = {};
  for (const [k, v] of Object.entries(l)) if (!(k in d) || v !== d[k]) sortie[k] = v;
  if (l.dossierRef && l.dossierUrl === urlDossier(l.dossierRef)) delete sortie.dossierUrl;
  return sortie;
}
