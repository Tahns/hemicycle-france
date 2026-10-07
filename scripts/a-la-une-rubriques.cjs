/**
 * a-la-une-rubriques.cjs
 * ----------------------
 * Les rubriques des « stories à la une » (Highlights) du compte @hemicyclefrance : identifiant (= nom du fichier de couverture),
 * libellé court (12 caractères au plus, affiché sur la couverture ET à saisir comme nom de la une), ordre conseillé et icône.
 * Les icônes sont des tracés 24 × 24 (trait uniquement) ; elles sont dessinées en crème dans le disque rouge par
 * scripts/couvertures-a-la-une.cjs. Aucun nom de personne, aucun texte accusateur : un symbole et un mot neutre.
 * Module partagé par le script de rendu et par scripts/suggestions-a-la-une.cjs.
 */
const RUBRIQUES = [
  { id: "actu", libelle: "Actualité", description: "L'actualité politique du jour : gouvernement, Élysée, justice, international (faits seulement)",
    icone: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 8.5h8"/><path d="M8 12h8M8 15.5h5"/>' },
  { id: "presidentielle", libelle: "2027", description: "Présidentielle 2027 : candidatures, primaires, calendrier",
    icone: '<path d="M4 13h16v7H4z"/><path d="M9 16h6"/><path d="M8 13V4h8v9"/><path d="M10.5 8.5l1.2 1.2 2-2.4"/>' },
  { id: "sondages", libelle: "Sondages", description: "Sondages d'intentions de vote et de popularité",
    icone: '<circle cx="12" cy="12" r="9"/><path d="M12 3v9l6.4 6.4"/>' },
  { id: "elus", libelle: "Élus et votes", description: "Députés, sénateurs, lois votées : qui a voté quoi, adoptée ou rejetée",
    icone: '<circle cx="12" cy="8" r="3.4"/><path d="M5 20a7 7 0 0 1 14 0"/><path d="M9.6 8l1.7 1.7 3.2-3.4"/>' },
  { id: "argent", libelle: "Argent public", description: "Budget de l'État, impôts, dette, Sécurité sociale, dépenses publiques",
    icone: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v.1M18 14.5v.1"/>' },
  { id: "comprendre", libelle: "Comprendre", description: "Explications : comment ça marche, jargon, institutions",
    icone: '<path d="M12 6C10 4.5 6 4 3 5v13c3-1 7-.5 9 1 2-1.5 6-2 9-1V5c-3-1-7-.5-9 1z"/><path d="M12 6v13"/>' },
  { id: "quiz", libelle: "Quiz", description: "Quiz et jeux de connaissances",
    icone: '<circle cx="12" cy="12" r="9"/><path d="M9.3 9.6a2.7 2.7 0 1 1 3.8 2.4c-.8.4-1.1.9-1.1 1.8"/><circle cx="12" cy="17" r=".9" fill="currentColor" stroke="none"/>' },
  { id: "agenda", libelle: "Agenda", description: "Dates à retenir : séances, élections, rendez-vous",
    icone: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M8 3v4M16 3v4"/><path d="M8 14h2M14 14h2M8 17.5h2"/>' },
];

module.exports = { RUBRIQUES };
