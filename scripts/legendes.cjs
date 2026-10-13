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
  assemblee: ["#AssembléeNationale", "#Parlement", "#Députés"],
  senat: ["#Sénat", "#Parlement", "#Sénateurs"],
  budget: ["#Budget", "#FinancesPubliques"],
  justice: ["#Justice"],
  election: ["#Présidentielle2027", "#Élections"],
  gouvernement: ["#Gouvernement"],
  international: ["#International"],
  securite: ["#Sécurité"],
  politique: [],
};
const PAR_GENRE = {
  loi: ["#Loi", "#Vote", "#Législation"],
  date: ["#Agenda", "#DateÀRetenir", "#Calendrier", "#Institutions"],
  "carrousel-loi": ["#Loi", "#Vote", "#Législation"],
  "carrousel-hebdo": ["#Parlement", "#SemaineParlementaire", "#Assemblée"],
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
// Hashtags génériques : jamais les deux à la fois, et pas toujours le même (Instagram déprécie des séries de hashtags identiques d'une publication à l'autre)
const GENERIQUES = ["#Politique", "#Actualité", "#France"];
// Pieds de légende : plusieurs formulations équivalentes, choisies selon la graine (identifiant du contenu), jamais le même texte à chaque publication
const PIEDS = [
  (c) => `On vous explique la suite sur ${c}`,
  (c) => `La politique sans jargon, c'est ici : ${c}`,
  (c) => `Plus de repères sur ${c}`,
  (c) => `Pour ne pas perdre le fil : ${c}`,
  (c) => `${c}, pour comprendre sans se prendre la tête`,
  (c) => `Retrouvez-nous sur ${c}`,
];
const APPELS = [
  "À garder sous la main pour y revenir.",
  "Utile ? Enregistrez-le pour plus tard.",
  "À partager si cela peut servir autour de vous.",
  "Une petite pause pour comprendre, à garder de côté.",
  "Vous pouvez l'enregistrer pour le retrouver.",
];
const graine = (x) => { let h = 2166136261; for (const c of String(x ?? "")) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; };
const tourner = (liste, g) => (liste.length ? liste.slice(g % liste.length).concat(liste.slice(0, g % liste.length)) : []);

/** Choisit une formulation parmi `liste` de façon stable (même graine = même texte) ; `tag` évite que deux phrases d'une même légende tournent ensemble. */
const variante = (seed, tag, liste) => liste[graine(tag + "|" + seed) % liste.length];

/** Pied de légende (formulation variée selon la graine). */
const pied = (compte, seed) => PIEDS[graine("pied" + seed) % PIEDS.length](compte);
/** Phrase d'appel d'un carrousel (formulation variée selon la graine). */
const appel = (seed) => APPELS[graine("appel" + seed) % APPELS.length];

/**
 * Sans `seed`, la liste est fixe (#Politique en tête, #Actualité en fin). Avec `seed` (identifiant du contenu), les hashtags génériques et
 * les hashtags de genre tournent d'une publication à l'autre, et le nombre varie (3 à `max`). `max` vaut 5 par défaut ; jamais plus de 8.
 */
function hashtags({ genre = "autre", theme = "politique", chambre = null, titre = "", max = 5, seed = null } = {}) {
  max = Math.max(1, Math.min(8, max));
  const g = seed == null ? null : graine(seed);
  const propres = [];
  if (chambre === "an") propres.push("#AssembléeNationale", "#Parlement");
  else if (chambre === "senat") propres.push("#Sénat", "#Parlement");
  const genreListe = PAR_GENRE[genre] || [];
  propres.push(...(g == null ? genreListe : tourner(genreListe, g)));
  propres.push(...(PAR_THEME[theme] || []));
  for (const [re, h] of MOTS) if (re.test(String(titre))) propres.push(...h);
  const generique = g == null ? ["#Politique", "#Actualité"] : [GENERIQUES[g % GENERIQUES.length]];
  const liste = g == null ? ["#Politique", ...propres, "#Actualité"] : [...propres, ...generique];
  const vus = new Set(), sortie = [];
  for (const h of liste) { const k = h.toLowerCase(); if (!vus.has(k)) { vus.add(k); sortie.push(h); } }
  // complète jusqu'à 3 avec les génériques restants, puis varie le nombre (3 à max) selon la graine
  for (const h of GENERIQUES) if (sortie.length < 3 && !vus.has(h.toLowerCase())) { vus.add(h.toLowerCase()); sortie.push(h); }
  const cible = g == null ? max : Math.min(max, 3 + ((g >>> 3) % Math.max(1, max - 2)));
  return sortie.slice(0, Math.max(1, Math.min(max, Math.max(cible, Math.min(3, sortie.length)))));
}

module.exports = { hashtags, pied, appel, variante, PAR_THEME, PAR_GENRE, GENERIQUES };
