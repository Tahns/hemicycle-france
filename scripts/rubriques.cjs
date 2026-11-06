/**
 * rubriques.cjs
 * -------------
 * Rubrique de presse (« Politique », « Assemblée nationale », « Sondage »…) d'un contenu : le petit mot en tête d'un titre,
 * comme dans la presse quotidienne. Lue par le dessin sous le nom `info.rubrique` (stories) ou `champs.rubrique` (fiches).
 *
 * rubriqueDe(x) -> une des RUBRIQUES, jamais vide ("Politique" par défaut).
 *  x peut être : une chaîne (titre libre), ou un objet { genre, chambre, theme, titre, sujet, sondage } ;
 *  un sujet de presse (avec illustration.theme et articles) est aussi accepté.
 * Une rubrique est un mot d'organisation : elle n'affirme rien, ne nomme personne et n'est jamais un titre de média.
 */
const RUBRIQUES = ["Politique", "Assemblée nationale", "Sénat", "Gouvernement", "Sondage", "Justice", "Budget", "Élysée 2027", "International", "Sécurité", "Agenda", "Chiffres", "Décryptage", "Parlement"];

const plat = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’']/g, "'");
const PAR_THEME = { assemblee: "Assemblée nationale", senat: "Sénat", budget: "Budget", justice: "Justice", election: "Élysée 2027", gouvernement: "Gouvernement", international: "International", securite: "Sécurité", politique: "Politique" };
const PAR_GENRE = { date: "Agenda", chiffre: "Chiffres", comprendre: "Décryptage", quiz: "Décryptage", "carrousel-hebdo": "Parlement", aujourdhui: "Assemblée nationale", sondage: "Sondage" };
// Mots-clés, du plus précis au plus large (le premier qui correspond gagne)
const MOTS = [
  [/sondage|intentions? de vote|\bifop\b|\bodoxa\b|\bipsos\b|\belabe\b|\bharris interactive\b/, "Sondage"],
  [/presidentielle|primaire|candidat|elysee 2027|2027/, "Élysée 2027"],
  [/budget|finances publiques|securite sociale|\bdette\b|deficit|impot|fiscal/, "Budget"],
  [/tribunal|justice|magistrat|parquet|proces|cour d'appel|conseil constitutionnel/, "Justice"],
  [/\bsenat\b|senateur|senatrice/, "Sénat"],
  [/assemblee nationale|\bdeputes?\b|\bdeputees?\b|hemicycle|palais bourbon/, "Assemblée nationale"],
  [/gouvernement|ministre|matignon|premier ministre/, "Gouvernement"],
  [/police|gendarm|securite|terroris|ordre public/, "Sécurité"],
  [/international|diplomat|\bue\b|union europeenne|otan|guerre|ukraine/, "International"],
];

function rubriqueDe(x) {
  if (x == null) return "Politique";
  if (typeof x === "string") return parMots(x) || "Politique";
  const o = x.sujet || x;
  const genre = x.genre || o.genre;
  if (x.sondage || o.sondage) return "Sondage";
  if (PAR_GENRE[genre] && genre !== "aujourdhui") return PAR_GENRE[genre];
  const chambre = x.chambre || o.chambre;
  if (chambre === "an" || chambre === "Assemblée nationale") return "Assemblée nationale";
  if (chambre === "senat" || chambre === "Sénat") return "Sénat";
  const textes = [x.titre, o.titrePropre?.titre, typeof o.titrePropre === "string" ? o.titrePropre : "", ...(o.articles || []).slice(0, 4).map((a) => a.titre)].filter(Boolean).join(" | ");
  const parTexte = parMots(textes);
  // Le mot-clé du texte est plus précis que le thème d'illustration, sauf pour un thème déjà net
  const theme = x.theme || o.theme || o.illustration?.theme;
  if (parTexte && parTexte !== "Politique" && (!PAR_THEME[theme] || theme === "politique")) return parTexte;
  return PAR_THEME[theme] || PAR_GENRE[genre] || parTexte || "Politique";
}
function parMots(t) {
  const p = plat(t);
  const m = MOTS.find(([re]) => re.test(p));
  return m ? m[1] : null;
}

module.exports = { rubriqueDe, RUBRIQUES };
