/**
 * legendes.cjs
 * ------------
 * Hashtags des légendes Instagram (posts, carrousels, Reels). Les stories publiées par l'API n'ont pas de légende : rien à faire pour elles.
 * Règles : uniquement des mots-clés de sujet neutres (institution, thème, scrutin), JAMAIS un nom de personne, de parti ou de candidat, jamais
 * de hashtag de polémique ; pas de doublon ; au plus `max` hashtags (5 pour un carrousel, que scripts/carrousel.cjs contrôle : 3 à 5).
 *
 * hashtags({ genre, theme, chambre, titre, max }) -> ["#Politique", ...]
 *  - genre : "loi" | "date" | "carrousel-loi" | "carrousel-hebdo" | "aujourdhui" | "chiffre" | "comprendre" | "quiz" | "reel" | "autre"
 *  - theme : clé de thème d'illustration (assemblee, senat, budget, justice, election, gouvernement, international, securite, politique)
 *  - chambre : "an" | "senat" (genres loi)
 *  - titre : texte libre, seulement pour repérer un thème (présidentielle, budget…)
 */
const PAR_THEME = {
  assemblee: ["#AssembléeNationale", "#Parlement"],
  senat: ["#Sénat", "#Parlement"],
  budget: ["#Budget", "#FinancesPubliques"],
  justice: ["#Justice"],
  election: ["#Présidentielle2027", "#Élections"],
  gouvernement: ["#Gouvernement"],
  international: ["#International"],
  securite: ["#Sécurité"],
  politique: [],
};
const PAR_GENRE = {
  loi: ["#Loi", "#Vote"],
  date: ["#Agenda", "#DateÀRetenir"],
  "carrousel-loi": ["#Loi", "#Vote"],
  "carrousel-hebdo": ["#Parlement", "#SemaineParlementaire"],
  aujourdhui: ["#Parlement", "#Agenda"],
  chiffre: ["#Chiffres", "#DonnéesOuvertes"],
  comprendre: ["#Comprendre", "#Institutions"],
  quiz: ["#Quiz", "#Citoyenneté"],
  reel: [],
  autre: [],
};
const MOTS = [
  [/pr[ée]sidentielle|primaire|candidat/i, ["#Présidentielle2027", "#Élections"]],
  [/budget|finances|s[ée]curit[ée] sociale/i, ["#Budget", "#FinancesPubliques"]],
];

function hashtags({ genre = "autre", theme = "politique", chambre = null, titre = "", max = 8 } = {}) {
  const liste = ["#Politique"];
  if (chambre === "an") liste.push("#AssembléeNationale", "#Parlement");
  else if (chambre === "senat") liste.push("#Sénat", "#Parlement");
  liste.push(...(PAR_GENRE[genre] || []));
  liste.push(...(PAR_THEME[theme] || []));
  for (const [re, h] of MOTS) if (re.test(String(titre))) liste.push(...h);
  liste.push("#Actualité");
  const vus = new Set(), sortie = [];
  for (const h of liste) { const k = h.toLowerCase(); if (!vus.has(k)) { vus.add(k); sortie.push(h); } }
  return sortie.slice(0, Math.max(1, max));
}

module.exports = { hashtags, PAR_THEME, PAR_GENRE };
