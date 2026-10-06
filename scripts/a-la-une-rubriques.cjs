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
  { id: "politique", libelle: "Politique", description: "L'actualité politique du jour, les dossiers du moment",
    icone: '<path d="M3 18a9 9 0 0 1 18 0"/><path d="M7 18a5 5 0 0 1 10 0"/><circle cx="12" cy="18" r="1.2" fill="currentColor"/>' },
  { id: "parlement", libelle: "Parlement", description: "Assemblée nationale et Sénat : textes, séances, votes",
    icone: '<path d="M3 9l9-5 9 5z"/><path d="M6 12v6M10 12v6M14 12v6M18 12v6"/><path d="M3 21h18"/>' },
  { id: "gouvernement", libelle: "Gouvernement", description: "Premier ministre, ministres, remaniements, décisions",
    icone: '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M9 8V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M3 13h18"/>' },
  { id: "elysee", libelle: "Élysée", description: "Président de la République, Conseil des ministres",
    icone: '<path d="M12 3v4"/><path d="M12 3h4v2h-4"/><path d="M4 12l8-5 8 5"/><path d="M6 12v8h12v-8"/><path d="M10 20v-4h4v4"/>' },
  { id: "presidentielle", libelle: "2027", description: "Présidentielle 2027 : candidatures, primaires, calendrier",
    icone: '<path d="M4 13h16v7H4z"/><path d="M9 16h6"/><path d="M8 13V4h8v9"/><path d="M10.5 8.5l1.2 1.2 2-2.4"/>' },
  { id: "sondages", libelle: "Sondages", description: "Sondages d'intentions de vote et de popularité",
    icone: '<circle cx="12" cy="12" r="9"/><path d="M12 3v9l6.4 6.4"/>' },
  { id: "economie", libelle: "Économie", description: "Emploi, prix, énergie, croissance, entreprises",
    icone: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.6a4.5 4.5 0 1 0 0 6.8"/><path d="M7.5 10.8h6M7.5 13.2h6"/>' },
  { id: "budget", libelle: "Budget", description: "Budget de l'État, Sécurité sociale, impôts, dette",
    icone: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v.1M18 14.5v.1"/>' },
  { id: "justice", libelle: "Justice", description: "Institutions judiciaires, décisions de justice, procès (faits seulement)",
    icone: '<path d="M12 4v16"/><path d="M7 20h10"/><path d="M4 7h16"/><path d="M6 7l-3 7h6z"/><path d="M18 7l-3 7h6z"/>' },
  { id: "europe", libelle: "Europe", description: "Union européenne, relations internationales",
    icone: '<g fill="currentColor" stroke="none"><circle cx="12" cy="3.8" r="1.1"/><circle cx="16.1" cy="4.9" r="1.1"/><circle cx="19.1" cy="7.9" r="1.1"/><circle cx="20.2" cy="12" r="1.1"/><circle cx="19.1" cy="16.1" r="1.1"/><circle cx="16.1" cy="19.1" r="1.1"/><circle cx="12" cy="20.2" r="1.1"/><circle cx="7.9" cy="19.1" r="1.1"/><circle cx="4.9" cy="16.1" r="1.1"/><circle cx="3.8" cy="12" r="1.1"/><circle cx="4.9" cy="7.9" r="1.1"/><circle cx="7.9" cy="4.9" r="1.1"/></g>' },
  { id: "comprendre", libelle: "Comprendre", description: "Explications : comment ça marche, jargon, institutions",
    icone: '<path d="M12 6C10 4.5 6 4 3 5v13c3-1 7-.5 9 1 2-1.5 6-2 9-1V5c-3-1-7-.5-9 1z"/><path d="M12 6v13"/>' },
  { id: "quiz", libelle: "Quiz", description: "Quiz et jeux de connaissances",
    icone: '<circle cx="12" cy="12" r="9"/><path d="M9.3 9.6a2.7 2.7 0 1 1 3.8 2.4c-.8.4-1.1.9-1.1 1.8"/><circle cx="12" cy="17" r=".9" fill="currentColor" stroke="none"/>' },
  { id: "resultats", libelle: "Résultats", description: "Lois adoptées ou rejetées, résultats de scrutins",
    icone: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/><path d="M9 14l2.2 2.2L15.5 12"/>' },
  { id: "agenda", libelle: "Agenda", description: "Dates à retenir : séances, élections, rendez-vous",
    icone: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M8 3v4M16 3v4"/><path d="M8 14h2M14 14h2M8 17.5h2"/>' },
];

module.exports = { RUBRIQUES };
