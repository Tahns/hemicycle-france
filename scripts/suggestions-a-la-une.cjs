/**
 * suggestions-a-la-une.cjs
 * ------------------------
 * Aide à l'alimentation des « stories à la une » Instagram. L'API Instagram ne permet NI de créer NI d'alimenter une une :
 * le propriétaire ajoute les stories à la main (guide : docs/A-LA-UNE.md). Ce script lui dit simplement QUOI ajouter et OÙ.
 *
 * Entrées (lecture seule) : data/instagram-publiees.json (registre des publications), data/instagram-file.json (file : type, titres),
 * data/actualites.json (thème de l'illustration de chaque sujet : illustration.theme).
 * Sorties : data/a-la-une-suggestions.json (toutes les publications avec leur rubrique recommandée et la liste « à ajouter cette
 * semaine ») et docs/a-la-une-semaine.md (le même résumé, lisible). Aucun nom de personne n'est produit par ce script :
 * seuls les titres propres déjà publiés sont repris.
 *
 * Règle de décision (la première qui s'applique), voir recommander() :
 *   1. le TYPE de la publication (post date -> Agenda, post loi -> Résultats, sondage, quiz, simulation 2027) ;
 *   2. le titre dit explicitement « sondage », « quiz », « adoptée/rejetée », « date à retenir » ;
 *   3. le THÈME du sujet d'actualité (illustration.theme : assemblee, senat -> Parlement ; budget ; justice ; election -> 2027 ; ...) ;
 *   4. des mots-clés du TITRE propre ;
 *   5. à défaut : Politique (confiance « faible »).
 *
 * USAGE : node scripts/suggestions-a-la-une.cjs [--date=2026-10-06T18:00:00Z] [--jours=7]
 */
const fs = require("fs");
const path = require("path");
const { RUBRIQUES } = require("./a-la-une-rubriques.cjs");

const RACINE = path.join(__dirname, "..");
const IDS = new Set(RUBRIQUES.map((r) => r.id));
const plat = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’']/g, "'");

/** Thème d'illustration d'un sujet (data/actualites.json, illustration.theme) -> rubrique. « politique » (thème générique) : null. */
const THEME_VERS_RUBRIQUE = {
  assemblee: "parlement",
  senat: "parlement",
  gouvernement: "gouvernement",
  budget: "budget",
  justice: "justice",
  election: "presidentielle",
  international: "europe",
  securite: "politique",
  politique: null,
};

/** Rubrique d'un thème, ou null (thème inconnu ou générique). */
function rubriqueDepuisTheme(theme) {
  const r = THEME_VERS_RUBRIQUE[String(theme || "")];
  return r && IDS.has(r) ? r : null;
}

// Mots-clés du titre (texte sans accents ni casse), dans l'ordre de priorité.
const MOTS_TITRE = [
  ["sondages", /sondage|intentions? de vote|barometre|popularite/],
  ["quiz", /\bquiz\b/],
  ["resultats", /\b(adopte[es]?|rejete[es]?|adoption definitive|vote final)\b/],
  ["agenda", /date a retenir|a retenir|a noter|agenda|ordre du jour|rendez-vous/],
  ["presidentielle", /presidentielle|primaire|candidat/],
  ["budget", /budget|deficit|\bdette\b|impot|fiscal|taxe|finances publiques|retraite|securite sociale|\bplf\b/],
  ["justice", /justice|proces|tribunal|parquet|condamn|mis en examen|cour de cassation|conseil constitutionnel|\bjuge|\bplainte/],
  ["europe", /europe|\bue\b|bruxelles|otan|ukraine|\bg7\b|diplomat|etats-unis|trump|russie|chine|israel|gaza|bresil|international/],
  ["economie", /economi|emploi|chomage|inflation|\bprix\b|carburant|gazole|energie|croissance|entreprise|salaire|pouvoir d'achat|industrie|pompe/],
  ["elysee", /elysee|president de la republique|conseil des ministres/],
  ["gouvernement", /gouvernement|ministre|matignon|remaniement/],
  ["parlement", /assemblee|senat|depute|senateur|hemicycle|motion de censure|49\.3|amendement|proposition de loi|projet de loi|commission d'enquete|\bloi\b/],
  ["presidentielle", /\b2027\b/],
  ["comprendre", /^comprendre|c'est quoi|ce qu'il faut savoir|explique[rz]?\b/],
];

/** Rubrique d'après le seul texte d'un titre : { rubrique, motif } ou null. */
function rubriqueDepuisTitre(titre) {
  const t = plat(titre);
  if (!t) return null;
  for (const [id, re] of MOTS_TITRE) if (re.test(t)) return id;
  return null;
}

/** Rubrique d'après le type de la publication (identifiant, type de file, titre) : id de rubrique ou null. */
function rubriqueDepuisType({ id, type, titre, dossierId }) {
  const i = plat(id), t = plat(titre);
  if (type === "post") return /adopte|rejete/.test(t) || /^loi/.test(i) ? "resultats" : "agenda";
  if (/^date-a-retenir/.test(i)) return "agenda";
  if (/^sondage/.test(i) || /^sondage\b/.test(t)) return "sondages";
  if (/^quiz/.test(i)) return "quiz";
  if (/^(probabilites|simulation)/.test(i) || /simulation/.test(t)) return "presidentielle";
  if (/^(scrutin|senat-)/.test(i) && /adopte|rejete/.test(t)) return "resultats";
  return null;
}

/**
 * Rubrique recommandée pour une publication.
 * pub : { id, type ("story"|"post"|"reel"), titre, dossierId } ; theme : thème d'illustration du sujet lié (ou null).
 * Renvoie { rubrique, libelle, source: "type"|"titre"|"theme"|"defaut", confiance: "haute"|"moyenne"|"faible" }.
 */
function recommander(pub, theme) {
  const fin = (rubrique, source, confiance) => ({ rubrique, libelle: RUBRIQUES.find((r) => r.id === rubrique).libelle, source, confiance });
  const parType = rubriqueDepuisType(pub);
  if (parType) return fin(parType, "type", "haute");
  const parTitre = rubriqueDepuisTitre(pub.titre);
  // Un titre qui dit explicitement sondage / quiz / résultat / date l'emporte sur le thème du sujet
  if (parTitre && ["sondages", "quiz", "resultats", "agenda"].includes(parTitre)) return fin(parTitre, "titre", "haute");
  const parTheme = rubriqueDepuisTheme(theme);
  if (parTheme) return fin(parTheme, "theme", "haute");
  if (parTitre) return fin(parTitre, "titre", "moyenne");
  return fin("politique", "defaut", "faible");
}

/** Index « titre normalisé -> thème » depuis data/actualites.json (articles des sujets) et « id de dossier -> thème » (le plus fréquent). */
function indexThemes(actualites) {
  const parTitre = new Map();
  for (const s of actualites?.sujets || []) {
    const th = s.illustration?.theme;
    if (!th) continue;
    for (const a of s.articles || []) parTitre.set(plat(a.titre), th);
  }
  const parDossier = new Map();
  for (const d of actualites?.dossiers || []) {
    const n = {};
    for (const a of d.articles || []) {
      const th = parTitre.get(plat(a.titre));
      if (th) n[th] = (n[th] || 0) + 1;
    }
    const meilleur = Object.entries(n).sort((a, b) => b[1] - a[1])[0];
    if (meilleur) parDossier.set(d.id, meilleur[0]);
  }
  return { parTitre, parDossier };
}

const JOURS_MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
function dateFr(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "date inconnue";
  const p = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "numeric", year: "numeric" }).formatToParts(d);
  const g = (k) => Number(p.find((x) => x.type === k).value);
  return `${g("day") === 1 ? "1er" : g("day")} ${JOURS_MOIS[g("month") - 1]} ${g("year")}`;
}

/** Semaine ISO « 2026-W41 » d'une date UTC. */
function semaineIso(d) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const j = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - j);
  const debut = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${String(Math.ceil(((t - debut) / 864e5 + 1) / 7)).padStart(2, "0")}`;
}

/**
 * Construit le rapport. registre = data/instagram-publiees.json, file = data/instagram-file.json, actualites = data/actualites.json.
 * maintenant : Date de référence ; jours : taille de la fenêtre « cette semaine ».
 */
function construire({ registre, file, actualites }, maintenant, jours = 7) {
  const parId = new Map((file?.entrees || []).map((e) => [e.id, e]));
  const idx = indexThemes(actualites);
  const publiees = (registre?.entrees || []).filter((e) => e.statut === "publiee" && e.publieLe);
  const debut = new Date(maintenant.getTime() - jours * 864e5);
  const entrees = publiees.map((r) => {
    const f = parId.get(r.id) || {};
    // Sans titre (anciennes entrées du registre) : les mots de l'identifiant (« alaune-primaire-0510 ») servent d'indice
    const titre = f.titrePropre || r.titre || f.titre || "";
    const indice = titre || String(r.id).replace(/-/g, " ").replace(/\b\d+\b/g, "").trim();
    const theme = (f.dossierId && idx.parDossier.get(f.dossierId)) || idx.parTitre.get(plat(f.titre)) || idx.parTitre.get(plat(r.titre)) || null;
    const type = f.type || "story";
    const reco = recommander({ id: r.id, type, titre: indice, dossierId: f.dossierId }, theme);
    return { id: r.id, titre: titre || null, type, publieLe: r.publieLe, theme: theme || null, ...reco, cetteSemaine: new Date(r.publieLe) > debut && new Date(r.publieLe) <= maintenant };
  }).sort((a, b) => (a.publieLe < b.publieLe ? 1 : a.publieLe > b.publieLe ? -1 : a.id.localeCompare(b.id)));
  const parRubrique = {};
  for (const r of RUBRIQUES) parRubrique[r.id] = entrees.filter((e) => e.rubrique === r.id).map((e) => e.id);
  const aAjouter = entrees.filter((e) => e.cetteSemaine).sort((a, b) => (a.publieLe < b.publieLe ? -1 : 1));
  return {
    semaine: semaineIso(maintenant),
    du: debut.toISOString(), au: maintenant.toISOString(),
    aJourAu: entrees.length ? entrees[0].publieLe : null,
    rubriques: RUBRIQUES.map((r, i) => ({ id: r.id, libelle: r.libelle, ordre: i + 1 })),
    aAjouterCetteSemaine: aAjouter.map((e) => ({ id: e.id, titre: e.titre, type: e.type, publieLe: e.publieLe, rubrique: e.rubrique, libelle: e.libelle, confiance: e.confiance })),
    parRubrique,
    entrees,
  };
}

/** Résumé lisible (docs/a-la-une-semaine.md). */
function markdown(rapport) {
  const L = [];
  L.push("# À la une : à ajouter cette semaine", "");
  L.push(`Semaine ${rapport.semaine} (du ${dateFr(rapport.du)} au ${dateFr(rapport.au)}). Fichier généré par \`scripts/suggestions-a-la-une.cjs\` ; ne pas modifier à la main.`);
  L.push("Instagram ne permet pas d'ajouter une story à une une automatiquement : à faire dans l'appli, voir [A-LA-UNE.md](A-LA-UNE.md).", "");
  L.push("## À ajouter cette semaine", "");
  if (!rapport.aAjouterCetteSemaine.length) L.push("Rien de nouveau : aucune story ni aucun post publié sur les 7 derniers jours.", "");
  else {
    L.push("| Publiée le | À ajouter à la une | Type | Story ou post | Confiance |", "|---|---|---|---|---|");
    for (const e of rapport.aAjouterCetteSemaine) L.push(`| ${dateFr(e.publieLe)} | **${e.libelle}** | ${e.type} | ${(e.titre || `(sans titre, identifiant ${e.id})`).replace(/\|/g, "/")} | ${e.confiance} |`);
    L.push("", "Confiance « faible » : aucun indice net, la rubrique par défaut (Politique) est proposée ; à vérifier d'un coup d'œil.", "");
  }
  L.push("## Par rubrique (toutes les publications suivies)", "");
  for (const r of RUBRIQUES) {
    const items = rapport.entrees.filter((e) => e.rubrique === r.id);
    L.push(`- **${r.libelle}** : ${items.length ? items.length + " publication(s), la plus récente le " + dateFr(items[0].publieLe) : "aucune pour l'instant"}`);
  }
  L.push("");
  return L.join("\n");
}

function lire(f, secours) {
  try { return JSON.parse(fs.readFileSync(path.join(RACINE, f), "utf-8")); } catch { return secours; }
}
function ecrireSiChange(f, contenu) {
  const p = path.join(RACINE, f);
  let avant = null;
  try { avant = fs.readFileSync(p, "utf-8"); } catch { /* absent */ }
  if (avant === contenu) return false;
  fs.writeFileSync(p, contenu);
  return true;
}

function principal() {
  const arg = (n) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || "").split("=")[1];
  const maintenant = arg("date") ? new Date(arg("date")) : new Date();
  const jours = Number(arg("jours")) || 7;
  if (isNaN(maintenant)) { console.error("Date invalide."); process.exit(1); }
  const rapport = construire({
    registre: lire("data/instagram-publiees.json", { entrees: [] }),
    file: lire("data/instagram-file.json", { entrees: [] }),
    actualites: lire("data/actualites.json", { sujets: [], dossiers: [] }),
  }, maintenant, jours);
  const a = ecrireSiChange("data/a-la-une-suggestions.json", JSON.stringify(rapport, null, 1) + "\n");
  const b = ecrireSiChange("docs/a-la-une-semaine.md", markdown(rapport));
  console.log(`À la une : ${rapport.entrees.length} publication(s) suivie(s), ${rapport.aAjouterCetteSemaine.length} à ajouter cette semaine (${a || b ? "fichiers mis à jour" : "inchangé"}).`);
}

if (require.main === module) principal();

module.exports = { THEME_VERS_RUBRIQUE, rubriqueDepuisTheme, rubriqueDepuisTitre, rubriqueDepuisType, recommander, indexThemes, construire, markdown, semaineIso, dateFr };
