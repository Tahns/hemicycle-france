/**
 * personne-nommee.cjs
 * -------------------
 * Accusations, mises en cause, procédures et polémiques qui visent une PERSONNE NOMMÉE (présomption d'innocence).
 * Règle du propriétaire (data/stories-config.json, « minMediasPersonneNommee ») :
 *  - un tel sujet n'est publié que s'il est repris par au moins 3 médias DISTINCTS (seuil jamais inférieur à 3, même si la configuration dit moins) ;
 *  - jamais avec le portrait de la personne (stories-auto.cjs dessine alors le sujet sans portrait : extras.sansPortrait) ;
 *  - sinon : refus, avec la raison écrite dans le journal de l'exécution.
 * La liste prudente (violences, décès, mineurs) n'est pas touchée : ces sujets restent écartés par scripts/liste-prudente.cjs.
 *
 * Une personne est « nommée » si le relevé du site en a reconnu une (illustration.personnes) ou si un titre contient un nom propre
 * de deux mots ou plus (« Prénom Nom ») qui n'est pas un nom d'institution. Le doute joue contre la publication.
 */
const LP = require("./liste-prudente.cjs");

/** Seuil plancher : la configuration peut le relever, jamais le descendre. */
const SEUIL_MIN = 3;

// Mots qui, dans une suite de majuscules, désignent une institution, un parti, un lieu ou un média plutôt qu'une personne
const INSTITUTIONS = new Set(["assemblee", "nationale", "senat", "conseil", "constitutionnel", "etat", "cour", "comptes", "cassation", "appel", "parti", "gouvernement", "union", "europeenne", "france", "francais", "francaise",
  "rassemblement", "national", "republique", "republicains", "tribunal", "parquet", "elysee", "matignon", "commission", "ministere", "palais", "bourbon", "paris", "insoumise", "insoumis", "socialiste", "ecologiste", "ecologistes",
  "horizons", "renaissance", "modem", "communiste", "generation", "nouveau", "front", "populaire", "pays", "monde", "figaro", "liberation", "mediapart", "parisien", "express", "point", "echos", "tribune", "croix", "humanite",
  "otan", "onu", "ukraine", "russie", "etats", "unis", "chine", "israel", "gaza", "bruxelles", "strasbourg", "marseille", "lyon", "nice", "bordeaux", "lille", "toulouse", "nantes", "outre", "mer", "nouvelle", "caledonie",
  "haut", "bas", "grand", "grande", "petit", "petite", "saint", "sainte", "mont", "ile", "val", "cote", "azur", "armee", "police", "gendarmerie", "justice", "cnews", "bfmtv", "tf1", "france", "inter", "info", "culture"]);
const MAJ = "A-ZÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸ";
const MIN = "a-zàâäçéèêëîïôöùûüÿœ";
// « Prénom Nom », « Jean-Luc Mélenchon », « Marine Le Pen », « Marie-Pierre de Montchalin »
const RE_NOM = new RegExp(`\\b[${MAJ}][${MIN}]+(?:-[${MAJ}][${MIN}]+)*(?:\\s+(?:de la |de |du |d['’]|le |la |von |van |el )?[${MAJ}][${MIN}'’]+(?:-[${MAJ}][${MIN}]+)*)+`, "gu");

/** Noms propres de personnes repérés dans un titre (hors institutions) ; le premier mot de la phrase n'est pas retenu seul. */
function nomsDansTitre(titre) {
  const out = [];
  for (const m of String(titre || "").matchAll(RE_NOM)) {
    const mots = m[0].split(/[\s'’-]+/).filter(Boolean);
    if (mots.length < 2) continue;
    if (mots.some((w) => INSTITUTIONS.has(LP.sansAccent(w)))) continue;
    out.push(m[0]);
  }
  return out;
}

/** Les titres relèvent-ils d'une accusation, procédure, polémique ou propos attribués ? Le terme trouvé, ou null. */
function motVisant(titres) {
  for (const t of titres) { const m = LP.motAssoupli(t); if (m) return m; }
  return null;
}

/**
 * Le sujet (ou dossier) vise-t-il une personne nommée ? Renvoie { vise, mot, noms }.
 * sujet : { articles: [{ titre }], illustration?: { personnes: [{ nom }] } }.
 */
function visePersonneNommee(sujet) {
  const titres = (sujet?.articles || []).map((a) => a?.titre).filter((t) => typeof t === "string" && t);
  const mot = motVisant(titres);
  if (!mot) return { vise: false, mot: null, noms: [] };
  const noms = [...new Set([...(sujet?.illustration?.personnes || []).map((p) => p?.nom).filter(Boolean), ...titres.flatMap(nomsDansTitre)])];
  return { vise: noms.length > 0, mot, noms };
}

/** Seuil effectif (jamais sous SEUIL_MIN). */
const seuil = (n) => (Number.isInteger(n) && n >= SEUIL_MIN ? n : SEUIL_MIN);

/** Raison écrite dans le journal pour un sujet refusé. */
const raisonRefus = (medias, minimum, mot) => `accusation ou polémique visant une personne nommée (« ${mot} ») : ${medias} média${medias > 1 ? "s" : ""} distinct${medias > 1 ? "s" : ""} sur ${minimum} exigés (présomption d'innocence)`;

module.exports = { SEUIL_MIN, seuil, nomsDansTitre, motVisant, visePersonneNommee, raisonRefus };
