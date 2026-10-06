// Tests de scripts/regroupement.cjs : regroupement par sujet des titres de presse, médias distincts.
// Principe : une FAUSSE FUSION (deux faits différents sous un même titre publié) est bien pire qu'un regroupement manqué.
// Chaque paire est jouée au milieu d'un « fond » de 188 vrais titres du 6 octobre (tests/fixtures/actualites-fond.json), pour que
// la pondération (IDF du lot) se comporte comme en production. USAGE : node tests/regroupement.test.mjs
import assert from "assert";
import { readFileSync } from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const R = require("../scripts/regroupement.cjs");

const fond = JSON.parse(readFileSync(new URL("./fixtures/actualites-fond.json", import.meta.url), "utf-8"));
const referentiel = R.construireReferentiel({
  gouvernement: { membres: [{ nom: "Sébastien Lecornu", qualite: "Premier ministre", fonction: "Premier ministre" }, { nom: "Laurent Nuñez", qualite: "Ministre" }, { nom: "Gérald Darmanin", qualite: "Ministre" },
    { nom: "Édouard Geffray", qualite: "Ministre" }, { nom: "Roland Lescure", qualite: "Ministre" }] },
  dirigeants: { dirigeants: [{ nom: "Jordan Bardella", parti: "RN" }, { nom: "Olivier Faure", parti: "PS" }, { nom: "Marine Tondelier", parti: "Écologistes" }] },
  candidats: { candidats: [{ nom: "Jean-Luc Mélenchon" }, { nom: "Fabien Roussel" }, { nom: "Raphaël Glucksmann" }, { nom: "Bruno Retailleau" }, { nom: "Marine Le Pen" }, { nom: "Ségolène Royal" }] },
  deputes: { deputes: [{ nom: "Mathilde Panot" }, { nom: "Prisca Thevenot" }, { nom: "Charles Alloncle" }] },
  senateurs: { senateurs: [{ nom: "Gérard Larcher" }, { nom: "Christine Lavarde" }, { nom: "Mathieu Darnaud" }, { nom: "Edwige Diaz" }] },
});

/** Les deux titres (médias a, b ; à `ecartH` heures d'écart) finissent-ils dans le même sujet, au milieu du fond ? */
function ensemble(a, b, { ma = "BFMTV", mb = "Le Monde", ecartH = 1 } = {}) {
  const base = Date.parse("2026-10-06T12:00:00Z");
  const propres = new Set([a, b].map((t) => R.nettoyer(t)));
  const lot = fond.filter((x) => !propres.has(R.nettoyer(x.titre))).map((x) => ({ ...x, url: x.titre }));
  const A = { titre: a, media: ma, date: new Date(base).toISOString(), url: "A" };
  const B = { titre: b, media: mb, date: new Date(base + ecartH * 36e5).toISOString(), url: "B" };
  const sujets = R.regrouper([...lot, A, B], { referentiel });
  return sujets.some((s) => s.articles.includes(A) && s.articles.includes(B));
}

let n = 0;
const echecs = [];
const meme = (a, b, opts) => { n++; if (!ensemble(a, b, opts)) echecs.push(`devrait être regroupé :\n  ${a}\n  ${b}`); };
const different = (a, b, opts) => { n++; if (ensemble(a, b, opts)) echecs.push(`ne doit PAS être regroupé (fausse fusion) :\n  ${a}\n  ${b}`); };

// ---------- Mêmes faits, titres différents : regroupés ----------
meme("Municipales à Wittelsheim : l’élection de la seule maire RN d’Alsace annulée par le tribunal administratif", "Haut-Rhin : l’élection de la seule maire RN d’Alsace annulée par la justice à Wittelsheim");
meme("Rima Hassan a-t-elle renversé et piétiné les drapeaux d’Israël et de l’UE lors d’un hommage aux victimes du 7 Octobre au Parlement européen ?", "Rima Hassan aurait renversé un drapeau israélien lors d’une exposition sur les victimes des attaques du 7 octobre, vives réactions au Parlement européen");
meme("En Allemagne, l’AfD accède à la présidence d’un Parlement régional, une première depuis 1945", "Allemagne. L'extrême droite décroche la présidence d'un Parlement régional, une première depuis 1945");
meme("La France a testé un nouveau missile nucléaire sans charge depuis un sous-marin", "Dissuasion nucléaire : Emmanuel Macron a assisté à un tir d’exercice d’un missile nucléaire lancé sans charge depuis un sous-marin");
meme("Présidentielle: Marine Le Pen promet \"140 milliards d'euros nets d'économies\" d'ici 2032", "Présidentielle 2027 : Marine Le Pen et le RN présentent leur contre-budget, avec « 140 milliards d’euros nets d’économies » en cinq ans");
meme("Présidentielle 2027 : l’Arcom réfléchit à de nouvelles règles pour les podcasts politiques avant l’élection", "Présidentielle 2027 : de « nouvelles règles » pour encadrer les podcasts politiques envisagées par l’Arcom");
meme("Téléphone au volant : la suspension temporaire du permis va être généralisée", "Sécurité routière : la suspension temporaire du permis pour téléphone au volant généralisée à toute la France");
meme("Budget : le gouvernement va prélever 2,1 milliards d’euros sur l’assurance-chômage en 2027", "Le gouvernement va « prélever » 2,1 milliards d’euros sur l’Unédic en 2027");
meme("Propos antisémites attribués à Jordan Bardella : Marine Le Pen lui reconfirme sa confiance", "Présidentielle 2027 : Marine Le Pen maintient « totalement » sa « confiance » en Jordan Bardella, accusé d’écrits antisémites");
meme("Laurent Nuñez promet 1 milliard d’euros d’aide supplémentaire sur cinq ans aux pompiers", "Sapeurs-pompiers : Laurent Nuñez promet un milliard d’euros supplémentaire sur cinq ans");
meme("Présidentielle 2027 : Gabriel Attal propose une « grande coalition » de la gauche à la droite pour battre Marine Le Pen", "Présidentielle 2027. Attal plaide pour une « grande coalition » de la gauche sociale-démocrate à la droite");
meme("Énergie. Prix à la pompe : le G7 va libérer « jusqu'à 100 millions de barils de pétrole et de diesel »", "Crise des carburants : les pays du G7 vont libérer « jusqu’à 100 millions de barils » de « diesel et pétrole brut »");
meme("Budget 2027: Laurent Wauquiez affirme que LR ne pratiquera pas \"le petit jeu de la censure\"", "Budget 2027 : Laurent Wauquiez affirme que LR ne pratiquera pas « le petit jeu de la censure »");
meme("Roland Lescure assure que \"tous les outils sont à disposition\" du gouvernement pour l'adoption du Budget 2027", "Budget 2027 : Roland Lescure affirme que « tous les outils sont à disposition » pour faire adopter le texte");
meme("Les socialistes appellent Sébastien Lecornu à modifier \"sans délai\" son projet de budget", "Le Parti socialiste appelle Lecornu à modifier «sans délai» son projet de budget");
meme("Fonctionnaires : Le gouvernement propose de relever l’indice minimum, les syndicats crient aux « mesurettes »", "Salaires : le gouvernement propose aux syndicats une hausse de l’indice minimum des fonctionnaires");
meme("Examen de la « loi intégrale » : les députés votent pour la création d’une instance indépendante contre les violences sexuelles et familiales", "Violences sexuelles et familiales : les députés approuvent la création d’une instance, indépendante du gouvernement");
meme("Primaire de la gauche : Glucksmann se dit « désolé » après ses propos « inélégants » sur Ségolène Royal", "Présidentielle 2027 : Raphaël Glucksmann se dit « désolé » après ses propos « inélégants » sur Ségolène Royal");
meme("Blocus des lycées : Jean-Luc Mélenchon appelle à « accompagner » la mobilisation, qu’il voit comme « un point de départ »", "Blocage des lycées : Jean-Luc Mélenchon voit dans la mobilisation un « point de départ » et appelle à accompagner « cette période de mobilisation »");
meme("Gérard Larcher réélu à la présidence du Sénat pour la sixième fois", "L’inamovible Gérard Larcher réélu à la présidence du Sénat jusqu’en 2029");
meme("Sénat : La sénatrice de Gironde Edwige Diaz désignée présidente du nouveau groupe RN", "Élue sénatrice, Edwige Diaz est désignée présidente du groupe RN");
meme("Propos antisémites : le RN « fait bloc » derrière Jordan Bardella et vise Mediapart", "Politique. Accusations d'antisémitisme : le RN « fait bloc » derrière Bardella et s'attaque à Mediapart");
// synonymes et noms propres seuls
meme("Blocage des lycées : un jeune gravement blessé à la veille d’un « acte 3 » mardi", "Blocus des lycées en France : un mineur gravement blessé à la veille de l'« acte III » du mouvement");
meme("Le Premier ministre demande que les cours reprennent dès lundi « partout » où la sécurité le permet", "Blocage des lycées : Sébastien Lecornu demande que les cours reprennent lundi partout où la sécurité le permet");
meme("Colère lycéenne: Emmanuel Macron réunit plusieurs ministres ce soir à l'Élysée", "Politique. Blocus des lycées : le gouvernement sur le gril à l’Assemblée, Macron réunit des ministres à l'Élysée");
meme("Plus de 140 000 inscrits à la primaire de la gauche : «C’est très au-delà de nos prévisions»", "Présidentielle 2027 : plus de 140 000 inscrits à la primaire de la gauche");
// chiffres arrondis (78 % / près de 80 %) : pas de blocage ; chiffres éloignés (72 % / 45 %) : blocage
{
  const e = (t) => R.empreinte(t, referentiel);
  assert.strictEqual(R.blocage(e("78 % des jeunes pensent que les politiques préparent mal leur avenir"), e("Près de 80 % des jeunes estiment que les politiques préparent mal leur avenir"), 0.5), null); n++;
  assert.strictEqual(R.blocage(e("72% des Français estiment que la primaire est jouée"), e("45% des Français estiment que la primaire est jouée"), 0.5), "chiffres différents"); n++;
}

// ---------- Faits différents : séparés ----------
// même personne, deux déclarations
different("Colère lycéenne: Gérard Larcher, président LR du Sénat, estime “qu’il faut rétablir l’ordre”", "Présidentielle 2027: Gérard Larcher, président LR du Sénat, affiche son soutien \"sans réserve\" à Bruno Retailleau");
different("Colère des lycéens: \"Aucune violence n'est justifiable, aucune violence n'est légitime\", affirme Fabien Roussel, candidat PCF à la présidentielle", "Présidentielle: \"Jamais je ne me retirerai\" au profit d'une autre force à gauche, affirme Fabien Roussel, secrétaire national du PCF");
different("Colère des lycéens: Prisca Thevenot, députée Renaissance, accuse LFI de \"souffler sur les braises\"", "Budget : la députée attaliste Prisca Thevenot est contre mais aussi pour taxer le sucre");
different("Affaire Bardella: la réaction de Pierre Moscovici, membre de la Cour des comptes européenne", "Colère lycéenne: \"Il y a des inégalités\" dans l'Éducation, observe Pierre Moscovici, membre de la Cour des comptes européenne");
different("Emmanuel Macron ferme la porte à un dialogue sur l’avenir de la Polynésie sous l’égide des Nations unies", "Finistère. Pourquoi Emmanuel Macron a assisté ce mardi à un tir d'exercice d'un missile nucléaire");
different("Présidentielle 2027 : Jean-Luc Mélenchon veut que le gouverneur de la Banque de France soit poursuivi pour « trahison »", "Devant les étudiants d’HEC, Jean-Luc Mélenchon apporte son soutien au mouvement lycéen");
different("Hervé Morin, président de la région Normandie, déplore les dégâts après la colère lycéenne", "Présidentielle 2027: \"Bien sûr qu'il faut une primaire\" à droite, déclare Hervé Morin, président de la région Normandie");
different("Jordan Bardella annonce examiner de nouvelles suites judiciaires contre Mediapart", "Le RN présente un contre-budget garanti avec trucages");
different("Rima Hassan accusée d'avoir renversé les drapeaux israélien et européen au Parlement européen", "Rima Hassan annonce qu'elle se rendra à Gaza avec une flottille");
// deux lois
different("Projet de loi « casseurs-payeurs » : le gouvernement accélère le calendrier", "Loi intégrale contre les violences sexuelles : les députés adoptent la création d’unités spécialisées au sein de la police");
different("Le Conseil constitutionnel censure plusieurs articles de la loi immigration", "Le Conseil constitutionnel censure plusieurs articles de la loi Duplomb sur l'agriculture");
different("Projet de loi de finances 2027 : le Sénat examinera le texte à partir du 20 novembre", "Projet de loi sur la fin de vie : le Sénat examinera le texte à partir du 20 novembre");
// deux personnes différentes citées
different("Bruno Retailleau propose l'interdiction de LFI après les violences dans les lycées", "Gérald Darmanin propose l'interdiction de LFI après les violences dans les lycées");
different("Marine Tondelier juge que le gouvernement est responsable des violences dans les lycées", "Fabien Roussel juge que le gouvernement est responsable des violences dans les lycées");
// démission contre maintien
different("Mathilde Panot appelle à la démission de Laurent Nuñez après les violences policières", "Laurent Nuñez maintenu au ministère de l'Intérieur après les violences policières");
different("Sébastien Lecornu démissionne de Matignon après le rejet du budget", "Sébastien Lecornu reste Premier ministre après le rejet du budget");
// contraires
different("Les députés adoptent le budget de la Sécurité sociale en première lecture", "Les députés rejettent le budget de la Sécurité sociale en première lecture");
different("Chômage : le taux est en hausse au troisième trimestre", "Chômage : le taux est en baisse au troisième trimestre");
different("François Bayrou confirme sa candidature à l'élection présidentielle de 2027", "François Bayrou dément sa candidature à l'élection présidentielle de 2027");
// même thème, objets différents
different("Budget : la culture voit ses crédits baisser de 0,6 % dans le projet de loi de finances 2027", "Grand Est. Le budget des lycées en baisse depuis trois ans");
different("SONDAGE BFMTV. 72% des Français estiment que le vainqueur de la primaire ne sera pas au second tour de la présidentielle", "SONDAGE BFMTV. 45% des sympathisants du PS et de Place publique opposés à une alliance avec LFI pour les législatives");
different("Charpey. Un exercice du droit de préemption qui fâche", "Charpey. Olivier Richard : « L’intérêt général de la commune prime »");
different("Montéléger. Le projet d’une voie verte évoqué au conseil municipal", "Chapareillan. Le conseil municipal se réunira ce jeudi 8 octobre");
// titres vides de sens (nom seul)
different("Emmanuel Macron", "Emmanuel Macron réunit plusieurs ministres ce soir à l'Élysée");
// fenêtre de temps : plus de 36 h
different("Rima Hassan accusée d'avoir renversé les drapeaux israélien et européen lors d'une exposition au Parlement européen", "Rima Hassan accusée d'avoir renversé les drapeaux israélien et européen lors d'une exposition au Parlement européen !", { ecartH: 40 });

assert.strictEqual(echecs.length, 0, `${echecs.length} paire(s) mal classée(s) :\n${echecs.join("\n")}`);

// ---------- Pas de dérive A → B → C ----------
{
  const base = Date.parse("2026-10-06T12:00:00Z");
  const t = [
    "Assurance-chômage : l'État va ponctionner 2 milliards d'euros en 2027",
    "Assurance-chômage et retraites : les partenaires sociaux reçus à Matignon cette semaine",
    "Retraites : l'âge de départ au cœur des discussions à Matignon",
  ];
  const lot = fond.map((x) => ({ ...x, url: x.titre }));
  const [A, B, C] = t.map((titre, i) => ({ titre, media: ["Le Monde", "Libération", "BFMTV"][i], date: new Date(base + i * 36e5).toISOString(), url: "ABC"[i] }));
  const sujets = R.regrouper([...lot, A, B, C], { referentiel });
  n++;
  assert.ok(!sujets.some((s) => s.articles.includes(A) && s.articles.includes(C)), "A et C ne doivent pas être réunis par chaînage via B");
}

// ---------- Médias distincts ----------
const art = (media, titre) => ({ media, titre, date: "2026-10-06T10:00:00Z", url: media + titre });
const T = "Politique. Inceste : les députés créent une infraction spécifique et élargissent la définition aux cousins";
const ebra = ["Le Progrès", "Dernières Nouvelles d'Alsace", "Le Dauphiné libéré", "L'Est républicain"];
{
  const s1 = R.sourcesDistinctes(ebra.map((m) => art(m, T)));
  assert.strictEqual(s1.mediasDistincts, 1, "quatre titres EBRA identiques = 1 source"); n++;
  assert.deepStrictEqual(s1.sources, ["EBRA"]);
  const s2 = R.sourcesDistinctes([...ebra.map((m) => art(m, T)), art("BFMTV", "Inceste : l'Assemblée crée une infraction spécifique")]);
  assert.strictEqual(s2.mediasDistincts, 2, "EBRA + BFMTV = 2"); n++;
  // un groupe de presse compte une fois même si ses titres diffèrent
  assert.strictEqual(R.sourcesDistinctes([art("Le Progrès", "Titre A sur la loi"), art("Le Dauphiné libéré", "Un autre titre sur la loi")]).mediasDistincts, 1); n++;
  // Sud Ouest et Nice-Matin : même dépêche (titres identiques) = 1 ; titres différents = 2
  const dep = "Le gouvernement va « prélever » 2,1 milliards d’euros sur l’Unédic en 2027";
  assert.strictEqual(R.sourcesDistinctes([art("Sud Ouest", dep), art("Nice-Matin", dep)]).mediasDistincts, 1); n++;
  assert.strictEqual(R.sourcesDistinctes([art("Sud Ouest", dep), art("Nice-Matin", "Chômage : l'État veut ponctionner l'assurance-chômage")]).mediasDistincts, 2); n++;
  // la même dépêche, avec ou sans préfixe de rubrique
  assert.strictEqual(R.sourcesDistinctes([art("Sud Ouest", "Politique. " + dep), art("Nice-Matin", dep)]).mediasDistincts, 1); n++;
  // France 24 et RFI (France Médias Monde) = 1 ; deux médias nationaux aux titres propres = 2
  assert.strictEqual(R.sourcesDistinctes([art("France 24", "Titre un"), art("RFI", "Titre deux")]).mediasDistincts, 1); n++;
  assert.strictEqual(R.sourcesDistinctes([art("Le Monde", "Titre un"), art("Le Figaro", "Titre deux"), art("BFMTV", "Titre trois")]).mediasDistincts, 3); n++;
  // un même média compte une fois
  assert.strictEqual(R.sourcesDistinctes([art("BFMTV", "Un"), art("BFMTV", "Deux")]).mediasDistincts, 1); n++;
}

// ---------- Garde-fous de l'API ----------
{
  // résultat : tous les articles sont repris une fois et une seule, dans un sujet
  const lot = fond.map((x, i) => ({ ...x, url: "u" + i }));
  const sujets = R.regrouper(lot, { referentiel });
  assert.strictEqual(sujets.reduce((t, s) => t + s.articles.length, 0), lot.length, "aucun article perdu ni dupliqué"); n++;
  assert.strictEqual(new Set(sujets.flatMap((s) => s.articles)).size, lot.length); n++;
  // déterministe : deux exécutions, même résultat
  const sig = () => JSON.stringify(R.regrouper(lot, { referentiel }).map((s) => s.articles.map((x) => x.url)));
  assert.strictEqual(sig(), sig()); n++;
  // jamais plus de 36 h dans un sujet
  const large = lot.map((x, i) => ({ ...x, date: new Date(Date.parse(x.date) - (i % 4) * 30 * 36e5).toISOString() }));
  const trops_longs = R.regrouper(large, { referentiel }).filter((s) => { const d = s.articles.map((x) => Date.parse(x.date)); return Math.max(...d) - Math.min(...d) > 36 * 36e5; });
  assert.strictEqual(trops_longs.length, 0, "aucun sujet ne dépasse 36 h"); n++;
  // l'ancien regroupement reste disponible pour la mesure
  assert.ok(R.regrouperAncien(lot).length > 0); n++;
  // titre de tête : un titre du sujet
  const g = [art("Le Monde", "Budget : le gouvernement veut ponctionner l'assurance-chômage"), art("BFMTV", "Budget : l'assurance-chômage ponctionnée par le gouvernement"), art("Sud Ouest", "Chômage : un autre sujet")];
  assert.ok(g.includes(R.centrale(g, referentiel)[0])); n++;
}

console.log(`regroupement.test.mjs : ${n} vérifications réussies`);
