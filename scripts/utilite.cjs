/**
 * utilite.cjs
 * -----------
 * Le compte parle de VIE POLITIQUE : un sujet qui n'a pas de lien clair avec les institutions, les élus, les élections, les lois ou le budget
 * (prix littéraire, sport, faits divers, people, météo…) n'est ni mis en story ni en post, même s'il est repris par beaucoup de médias.
 *
 * Règle : un sujet est « utile » s'il a au moins un repère politique dans l'un de ses titres ET que moins de la moitié de ses titres
 * relèvent du hors-sujet sans repère politique. Les deux listes sont volontairement simples et lisibles : on les complète au besoin.
 */
const plat = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’']/g, "'");

// Repères politiques : institutions, fonctions, élections, textes, partis, personnalités politiques, grands sujets de politique publique
const POLITIQUE = [
  "assemblee nationale", "assemblee", "senat", "depute", "deputee", "senateur", "senatrice", "parlement", "parlementaire", "hemicycle", "gouvernement", "ministre", "premier ministre",
  "president de la republique", "chef de l'etat", "elysee", "matignon", "macron", "lecornu", "bayrou", "attal", "darmanin", "retailleau", "edouard philippe", "villepin",
  "presidentielle", "election", "elections", "municipales", "legislatives", "europeennes", "departementales", "regionales", "scrutin", "referendum", "candidat", "candidature",
  "parrainage", "primaire", "congres", "parti", "rn", "lfi", "ps", "lr", "pcf", "modem", "renaissance", "horizons", "ecologiste", "ecologistes", "les republicains", "rassemblement national",
  "france insoumise", "bardella", "le pen", "melenchon", "roussel", "ruffin", "tondelier", "zemmour", "knafo", "glucksmann", "olivier faure", "hollande", "sarkozy", "benoit mathieu", "cazeneuve",
  "projet de loi", "proposition de loi", "loi", "decret", "amendement", "reforme", "constitution", "constitutionnel", "conseil d'etat", "motion de censure", "censure", "49.3", "dissolution",
  "budget", "finances publiques", "plf", "plfss", "securite sociale", "impot", "impots", "taxe", "deficit", "dette publique", "retraite", "retraites", "assurance chomage", "smic",
  "commission d'enquete", "cour des comptes", "prefet", "collectivites", "maire", "maires", "conseil regional", "conseil departemental",
  "troupes", "militaire", "soldat", "armee", "guerre", "inflation", "immigration", "laicite", "nationalite", "union europeenne", "commission europeenne", "otan", "diplomatie", "defense", "armees",
  "greve", "blocus", "mobilisation", "mobilise", "nunez", "ministre de l'interieur", "attentat", "terrorisme", "budgetaire", "bulletin de vote", "lyceen", "etudiant", "manifestation", "syndicat", "cgt", "cfdt", "medef", "sondage", "intention de vote", "garde des sceaux", "ministere",
];
// Hors-sujet : culture, sport, faits divers, météo, people. Un seul de ces mots ne suffit pas à écarter un sujet qui a aussi un repère politique.
const HORS_SUJET = [
  "prix goncourt", "goncourt", "prix renaudot", "prix litteraire", "cesar", "oscars", "festival de cannes", "box-office", "cinema", "film", "serie tv", "album", "concert", "chanteur", "chanteuse",
  "acteur", "actrice", "roman", "livre", "exposition", "musee", "theatre", "humoriste", "telerealite", "star academy", "the voice", "koh-lanta",
  "football", "ligue 1", "ligue des champions", "psg", "rugby", "tennis", "roland-garros", "formule 1", "basket", "handball", "cyclisme", "jeux olympiques", "mercato", "match", "championnat",
  "meteo", "orages", "canicule", "neige", "tempete", "horoscope", "loto", "euromillions", "recette", "gastronomie",
  "accident", "incendie", "faits divers", "fait divers", "noyade", "collision", "carambolage", "disparition", "deces", "mort de", "hommage a", "obseques", "naissance", "mariage", "couple",
  "people", "royaute", "prince", "princesse", "influenceur", "youtubeur", "tiktok",
];
const contient = (t, liste) => liste.some((m) => new RegExp(`(^|[^a-z0-9])${m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}s?x?($|[^a-z0-9])`).test(t)); // pluriels tolérés (manifestation / manifestations)

/** Un titre a-t-il un repère politique ? */
const titrePolitique = (titre) => contient(plat(titre), POLITIQUE);
/** Un titre relève-t-il du hors-sujet, sans repère politique ? */
const titreHorsSujet = (titre) => { const t = plat(titre); return contient(t, HORS_SUJET) && !contient(t, POLITIQUE); };

/**
 * Le sujet est-il utile à un public qui s'intéresse à la vie politique ? `titres` : titres de presse du sujet (et son titre propre s'il existe).
 * Renvoie { utile, motif }.
 */
function estUtile(titres) {
  const liste = (titres || []).filter(Boolean);
  if (!liste.length) return { utile: false, motif: "aucun titre" };
  const nbPol = liste.filter(titrePolitique).length, nbHors = liste.filter(titreHorsSujet).length;
  if (nbPol === 0) return { utile: false, motif: "aucun lien avec la vie politique" };
  if (nbHors * 2 > liste.length) return { utile: false, motif: "sujet de culture, sport ou fait divers" };
  return { utile: true, motif: "" };
}

module.exports = { estUtile, titrePolitique, titreHorsSujet, POLITIQUE, HORS_SUJET };
