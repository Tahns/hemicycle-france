/**
 * LISTE PRUDENTE UNIQUE de la chaîne de publication automatique (audit J-01, J-02, J-03, J-08).
 *
 * Une seule source de vérité, importée par stories-auto.cjs (motExclu), titres-propres.cjs (JUDICIAIRE_TITRES, PROCEDURE, JURIDICTION),
 * publier-stories.cjs (risque), sujets-sensibles.cjs et contenus-auto.cjs.
 *
 * - Comparaison sans accents ni casse ; espaces insécables et apostrophes typographiques normalisés.
 * - MOTS ENTIERS : un terme fini par « * » est un préfixe de mot (« condamn* » : condamné, condamnation…) ; sans « * », le mot (ou
 *   l'expression) doit apparaître tel quel, jamais au milieu d'un autre mot (« proces » ne touche pas « processus »).
 * - Deux niveaux : « presse » (titres de médias : liste complète, un doute = on écarte) et « officiel » (agenda de l'Assemblée, titres de
 *   textes et de scrutins, notions du site : donnée officielle sans accusation ; seuls restent écartés les mots qui visent une personne,
 *   un décès, un fait divers ou une polémique). Les mots « prudents » ne bloquent donc pas l'ordre du jour officiel.
 */

const sansAccent = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[’‘`´]/g, "'").replace(/[\s  ​]+/g, " ");

// ── Groupes de termes (écrits sans accent) ──────────────────────────────────────────────────────────────────────────────────────────
// procédure formelle : enquête, juridiction, décision de justice
const PROCEDURE_TERMES = [
  "mis en examen", "mise en examen", "garde a vue", "gardes a vue", "enquete*", "enqueteur*", "poursuiv*", "poursuite", "poursuites", "condamn*", "relaxe*", "relaxer", "inculp*",
  "incarcer*", "ecroue*", "emprisonn*", "prison*", "detention*", "detenu*", "perquisition*", "mandat d'arret", "proces", "tribunal*", "parquet*", "procureur*",
  "juge", "juges", "magistrat*", "judiciaire*", "justice", "citation directe", "interpell*", "arrestation*", "police arrete", "gendarmes arretent", "ineligib*",
  "requis", "requisition*", "requisitoire*", "requiert", "assises", "cour d'appel", "en appel", "cour de cassation", "extradition*", "jugement", "jugements", "juge d'instruction",
  "soupcon*", "victime", "victimes", "mise en danger", "avocat*",
];
// accusations, imputations, soupçons : une personne visée, même attribuée à un média
const ACCUSATION_TERMES = [
  "accus*", "mis en cause", "mise en cause", "plainte", "plaintes", "suspect", "suspects", "suspecte", "suspectes", "suspecter",
  "trafic d'influence", "conflit d'interets", "immunite*", "signalement*", "suspendu", "suspendue", "suspendus", "suspendues", "mis a pied", "mise a pied",
  "fraude*", "frauduleu*", "corruption", "corrompu*", "detournement*", "escroqu*", "blanchiment*", "favoritisme", "abus de biens", "abus de confiance",
  "affaire", "scandale*", "diffam*", "calomni*", "mentir", "menti", "mensonge*", "menteur", "menteuse", "menteurs", "menteuses",
];
// juridictions et décisions de justice explicites (titres propres : sans elles, jamais de procédure affirmée)
const JURIDICTION_TERMES = ["mis en examen", "mise en examen", "garde a vue", "condamn*", "inculp*", "ecroue*", "proces", "parquet*", "tribunal*", "cour d'appel", "cour de cassation", "cour d'assises", "assises",
  "conseil d'etat", "juge", "juges", "magistrat*", "mandat d'arret", "relaxe*", "ineligib*", "extradition*", "prison*"];
// violences contre les personnes
const VIOLENCES_TERMES = [
  "viol", "viols", "violer", "viole", "violee", "violees", "violence", "violences", "violent", "violents", "violente", "violentes", "violemment",
  "agress*", "meurtre*", "assassin*", "homicide*", "harcel*", "pedo*", "inceste*", "sexuel*", "sexiste*", "sexisme", "antisemit*", "racis*", "homophob*", "discriminat*", "lynch*",
];
// morts, faits divers
const DRAME_TERMES = [
  "tue", "tues", "tuee", "tuees", "tuer", "tuent", "tuerie*", "tireur*", "fusillade*", "coups de feu", "coup de feu", "arme a feu", "poignard*", "coups de couteau", "attentat*", "terroris*",
  "mort", "morts", "morte", "mortes", "meurt", "meurent", "mourir", "mortel*", "s'eteint", "decede*", "deces", "deuil", "hommage a", "cadavre*", "pendaison", "noye*", "naufrage*",
  "suicid*", "disparition*", "disparu*", "drame*", "tragedie*", "tragique*", "fait divers", "faits divers", "blesse*", "explosion*", "incendie*", "carbonise*", "menace de mort", "menaces",
];
// mineurs
const MINEURS_TERMES = ["mineur*", "fillette*", "garconnet*", "adolescent*", "ado", "ados", "gamin*", "jeune fille", "jeunes filles", "jeune garcon", "enfant de", "bebe*", "nourrisson*"];
// polémiques, reproches et attaques entre personnalités : pas de titre de presse en grand qui vise une personne nommée
const POLEMIQUE_TERMES = [
  "polemi*", "derapage*", "clash*", "tacle*", "tacler", "fustige*", "accabl*", "recadr*", "tolle", "inelegan*", "honte", "honteu*", "insult*", "injur*", "propos choquant*",
  "s'excuse*", "desole*", "excuses", "attaq*", "desavou*", "trahi", "trahison*", "attis*", "dezingu*",
];
// formes qui ne se réduisent pas à un mot simple
const FORMES_SPECIALES = [
  // un mineur identifiable au singulier (« une lycéenne devient porte-parole », « Lola, lycéenne parisienne », « un élève de seconde »).
  // Le mouvement (« mobilisation lycéenne », « les lycéens ») n'est pas une personne : « élève » seul est aussi un verbe (« la dette s'élève à »).
  /(?:\b(?:un|une|le|la|cet|cette|ce|jeune|ancien|ancienne)\s+|\bl'|,\s*)(?:lyceen(?:ne)?|collegien(?:ne)?|ecolier|ecoliere|eleve)\b/,
];
// légitime, mais attrapé par les mots ci-dessus : retiré du texte avant le contrôle
const EXCEPTIONS = /\b(?:commissions? d'enquetes?|missions? d'enquetes?|justice (?:sociale|fiscale|climatique|environnementale|energetique|intergenerationnelle)|enquetes? (?:d'opinion|statistique|emploi))\b/g;

// ── Âge de mineur : « de 15 ans », « âgé de quinze ans », « Lola, 16 ans » (pas « dans 5 ans ») ────────────────────────────────────
const NOMBRES_LETTRES = "un|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|dix-sept|dix-huit|dix-neuf";
const RE_AGE_MINEUR = new RegExp(`(?:\\b(?:de|d'|a|age|agee|ages|agees)\\s*|[,(]\\s*)(?:\\d{1,2}|${NOMBRES_LETTRES})\\s*-?\\s*ans\\b`);

const echap = (m) => m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const motif = (termes) => new RegExp(termes.map((m) => (m.endsWith("*") ? `\\b${echap(m.slice(0, -1))}` : `\\b${echap(m)}\\b`)).join("|"));
const RE = { procedure: motif(PROCEDURE_TERMES), accusation: motif(ACCUSATION_TERMES), juridiction: motif(JURIDICTION_TERMES), violences: motif(VIOLENCES_TERMES), drame: motif(DRAME_TERMES), mineurs: motif(MINEURS_TERMES), polemique: motif(POLEMIQUE_TERMES) };

// Niveau « officiel » : textes de loi, scrutins, ordre du jour, notions du site. Une loi « contre les violences sexuelles » est un texte officiel,
// pas une accusation. Restent écartés : une personne visée par la justice, un décès, un fait divers, une polémique.
const OFFICIEL_TERMES = [
  "mis en examen", "mise en examen", "mis en cause", "mise en cause", "garde a vue", "inculp*", "condamne", "condamnee", "condamnes", "condamnees", "soupconne*", "ecroue*", "perquisition*",
  "mineur*", "victime", "victimes", "suicid*", "decede*", "deces", "deuil", "hommage a", "tireur*", "tuerie*", "fusillade*", "fait divers", "faits divers", "scandale*", "affaire", ...POLEMIQUE_TERMES,
];
const RE_OFFICIEL = motif(OFFICIEL_TERMES);

const nettoyer = (titre) => sansAccent(titre).replace(EXCEPTIONS, " ");
const valeurAge = (m) => { const n = /\d+/.exec(m); return n ? Number(n[0]) : -1; }; // -1 : nombre écrit en lettres (toujours < 20)

/** Terme prudent trouvé (chaîne) ou null. { officiel: true } pour une donnée officielle (agenda, scrutin, texte de loi, notion du site). */
function motExclu(titre, { officiel = false } = {}) {
  const t = nettoyer(titre);
  if (officiel) { const m = RE_OFFICIEL.exec(t); return m ? m[0].trim() : null; }
  for (const re of [RE.procedure, RE.accusation, RE.violences, RE.drame, RE.mineurs, RE.polemique, ...FORMES_SPECIALES]) { const m = re.exec(t); if (m) return m[0].trim(); }
  const a = RE_AGE_MINEUR.exec(t);
  if (a) { const v = valeurAge(a[0]); if (v === -1 || v < 20) return a[0].trim(); }
  return null;
}
/** Un mineur identifiable dans le texte (âge de moins de 20 ans, « une lycéenne », « un élève »…) : le terme trouvé ou null. */
function mineurIdentifiable(titre) {
  const t = nettoyer(titre);
  for (const re of FORMES_SPECIALES) { const m = re.exec(t); if (m) return m[0].trim(); }
  const a = RE_AGE_MINEUR.exec(t);
  if (a) { const v = valeurAge(a[0]); if (v === -1 || v < 20) return a[0].trim(); }
  return null;
}
/** Compatibles avec les anciennes expressions de titres-propres.cjs (méthode .test) : la même liste pour tous. */
const JUDICIAIRE_TITRES = { test: (titre) => { const t = nettoyer(titre); return RE.procedure.test(t) || RE.accusation.test(t) || RE.violences.test(t) || mineurIdentifiable(titre) !== null; } };
const PROCEDURE = { test: (titre) => RE.procedure.test(nettoyer(titre)) };
const JURIDICTION = { test: (titre) => RE.juridiction.test(nettoyer(titre)) };

module.exports = { sansAccent, motExclu, mineurIdentifiable, JUDICIAIRE_TITRES, PROCEDURE, JURIDICTION, PROCEDURE_TERMES, ACCUSATION_TERMES, VIOLENCES_TERMES, DRAME_TERMES, MINEURS_TERMES, POLEMIQUE_TERMES, OFFICIEL_TERMES, RE_AGE_MINEUR };
