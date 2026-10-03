/**
 * pertinence.cjs
 * --------------
 * Le site suit la vie politique FRANCAISE : un sujet d'actualité qui ne parle que de l'étranger
 * (« Brésil. Élection présidentielle… », « Espagne. Crise du logement… ») n'est ni affiché ni mis en story.
 * Un sujet étranger qui concerne la France (Emmanuel Macron, la France, Paris, l'Élysée…) reste.
 *
 * Règle : un titre est « étranger » s'il nomme un pays ou un dirigeant étranger et aucun repère français.
 * Un sujet est écarté si la majorité de ses titres sont étrangers.
 */
const plat = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’']/g, "'");

// Pays, régions et villes étrangères (noms seuls : les adjectifs, trop ambigus, ne comptent pas)
const ETRANGER = [
  "allemagne", "espagne", "italie", "portugal", "royaume-uni", "angleterre", "ecosse", "irlande", "belgique", "pays-bas", "luxembourg",
  "suisse", "autriche", "pologne", "hongrie", "roumanie", "bulgarie", "grece", "chypre", "turquie", "ukraine", "russie", "bielorussie",
  "moldavie", "georgie", "armenie", "azerbaidjan", "kazakhstan", "suede", "norvege", "finlande", "danemark", "islande", "estonie",
  "lettonie", "lituanie", "serbie", "croatie", "slovenie", "slovaquie", "tchequie", "republique tcheque", "bosnie", "kosovo", "albanie",
  "etats-unis", "usa", "canada", "mexique", "bresil", "argentine", "chili", "perou", "colombie", "venezuela", "bolivie", "equateur",
  "uruguay", "paraguay", "cuba", "haiti", "panama", "nicaragua", "honduras", "salvador",
  "chine", "japon", "coree", "inde", "pakistan", "bangladesh", "indonesie", "philippines", "vietnam", "thailande", "birmanie", "taiwan",
  "afghanistan", "iran", "irak", "syrie", "liban", "israel", "gaza", "palestine", "cisjordanie", "jordanie", "arabie saoudite", "yemen",
  "qatar", "emirats", "egypte", "libye", "soudan", "ethiopie", "somalie", "kenya", "nigeria", "niger", "mali", "burkina", "tchad",
  "cameroun", "congo", "rdc", "angola", "afrique du sud", "zimbabwe", "mozambique", "madagascar", "ghana", "senegal", "cote d'ivoire",
  "guinee", "benin", "togo", "gabon", "australie", "nouvelle-zelande", "moscou", "kiev", "kyiv", "washington", "pekin", "londres", "berlin",
  "madrid", "rome", "tel-aviv", "jerusalem", "teheran", "ankara", "bagdad", "damas", "kaboul", "new york",
  "trump", "poutine", "zelensky", "zelenski", "netanyahou", "xi jinping", "erdogan", "lula", "bolsonaro", "milei", "sanchez", "meloni", "merz",
  "starmer", "orban", "modi", "kim jong", "biden", "harris", "vance", "musk",
];
// Repères français : si un titre en contient, il concerne la France même s'il cite l'étranger
const FRANCE = [
  "france", "francais", "francaise", "macron", "paris", "elysee", "matignon", "quai d'orsay", "lecornu", "bayrou", "attal", "hexagone",
  "assemblee nationale", "senat", "depute", "senateur", "rn ", "lfi", "bardella", "le pen", "melenchon", "ps ", "lr ", "ecologiste",
  "sncf", "edf", "tricolore", "bleus", "tour de france", "ministre de l'interieur", "ministre des armees", "otan", "g7", "union europeenne", "bruxelles",
];

const contient = (t, liste) => liste.some((m) => {
  const r = new RegExp(`(^|[^a-z])${m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").trim()}($|[^a-z])`);
  return r.test(t);
});

/** Un titre parle-t-il d'abord de l'étranger ? */
function titreEtranger(titre) {
  const t = plat(titre);
  // Format de la presse régionale : « Pays. Sujet… » en tête de titre
  const prefixe = t.match(/^([a-z' -]{3,30})\s*[.:]\s/);
  const pays = prefixe && contient(prefixe[1], ETRANGER);
  const nommeEtranger = pays || contient(t, ETRANGER);
  if (!nommeEtranger) return false;
  return !contient(t, FRANCE);
}

/** Le sujet concerne-t-il la France ? (faux seulement si la majorité des titres sont étrangers) */
function concerneLaFrance(titres) {
  const liste = (titres || []).filter(Boolean);
  if (!liste.length) return true;
  const etrangers = liste.filter(titreEtranger).length;
  return etrangers * 2 <= liste.length;
}

module.exports = { concerneLaFrance, titreEtranger };
