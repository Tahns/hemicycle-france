// Tests d'audit de la chaîne de publication automatique (voir docs/AUDIT-PUBLICATIONS.md). USAGE : node tests/audit-publications.test.mjs
//
// Deux familles de tests :
//  - tests ordinaires : verrouillent ce qui FONCTIONNE aujourd'hui (non-régression) ; ils doivent rester verts ;
//  - tests « todo » ({ todo: "…" }) : démontrent un DÉFAUT constaté lors de l'audit. Ils échouent aujourd'hui mais n'empêchent pas
//    lancer-tous.mjs d'être vert (node:test ne compte pas un todo en échec). Quand le défaut est corrigé, le test passe : retirer alors
//    l'option todo pour qu'il devienne une vraie garde (le message du todo donne l'identifiant du constat dans le rapport).
// Aucun script de production n'est modifié par ce fichier ; rien n'est publié (faux serveur HTTP local).
import test, { after } from "node:test";
import assert from "node:assert";
import http from "http";
import { spawn } from "child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync } from "fs";
import { tmpdir } from "os";
import { join, dirname, resolve } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { createRequire } from "module";

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(RACINE);
const require = createRequire(import.meta.url);
const sa = require("../scripts/stories-auto.cjs");
const tp = require("../scripts/titres-propres.cjs");
const { construireDossiers } = require("../scripts/dossiers.cjs");
const { choisir } = require("../scripts/publier-stories.cjs");
const { motExclu, parleDeSondage, reserveSondages, choisirSondage, jourParis, jourUTC2, titresProches, ficheDate, lireConfig } = sa;

const aucun = (liste, msg) => assert.strictEqual(liste.length, 0, `${msg} :\n  - ${liste.join("\n  - ")}`);

// ─────────────────────────────────────────────────────────────────────────────
// 1. Liste prudente (motExclu) : ce qui est bien écarté aujourd'hui, et les angles morts
// ─────────────────────────────────────────────────────────────────────────────
test("motExclu (non-régression) : accusations, procédures, violences, mineurs, polémiques bien écartés", () => {
  const doivent = [
    "Jordan Bardella visé par une plainte", "Écrits antisémites attribués à un élu : Mediapart révèle ses preuves", "Le maire mis en examen pour corruption",
    "Garde à vue prolongée pour le député", "Perquisition au siège du parti", "Condamné à cinq ans, l'ancien ministre fait appel", "Ségolène Royal condamnée",
    "Un lycéen de 16 ans blessé en marge de la manifestation", "Une adolescente de 15 ans hospitalisée", "Inceste : les députés créent une infraction spécifique",
    "Violences sexuelles : un socle d'enquête obligatoire après chaque plainte", "Affaire Dupont : le préfet s'explique", "Décès de l'ancien président du Sénat",
    "Mort d'un ancien ministre : les hommages", "Un homme tue sa compagne à Lyon", "Un attentat déjoué : le ministre salue les services",
    "Mélenchon : « Nous sommes victimes »", "Bardella tacle Macron", "Glucksmann se dit désolé après ses propos inélégants", "Sébastien Chenu s'excuse après un dérapage",
    "Enquête visant un ministre", "Le ministre ouvre une enquête pour fraude", "Procès de l'ancien maire : le tribunal rend sa décision", "Interpellations en marge du blocus",
  ];
  aucun(doivent.filter((t) => !motExclu(t)), "titres qui auraient dû être écartés");
  const legitimes = [
    "Budget 2027 : le PS appelle Sébastien Lecornu à modifier « sans délai » son projet", "Lecornu annonce le gel des dépenses", "Macron réunit des ministres à l'Élysée",
    "Primaire de la gauche : le dernier débat", "Réforme des retraites : l'intersyndicale appelle à la grève", "Présidentielle 2027 : Attal plaide pour une « grande coalition »",
    "Laurent Nuñez promet aux pompiers 1 milliard d'euros d'aide supplémentaire", "Le Parlement ouvre une commission d'enquête sur les prix de l'énergie", "Cour des comptes : un rapport sévère sur la dette",
  ];
  aucun(legitimes.filter((t) => motExclu(t)), "titres légitimes écartés à tort");
});

test("motExclu : angles morts (faux négatifs) sur des titres qui devraient être écartés", () => {
  const doivent = [
    "Une enquête sur les comptes de campagne de Marine Le Pen", // « enquete » seul absent (seules 6 formes composées sont listées)
    "Haute-Savoie. « Si demain je ne suis plus maire, ce n'est pas grave » : déclaré inéligible, le maire de la Roche-sur-Foron s'est expliqué avant de faire appel", // titre réel du 2026-10-06 (data/actualites.json)
    "Inéligibilité : la décision de la cour d'appel attendue", // « ineligib » est dans JUDICIAIRE_TITRES mais pas dans MOTS_EXCLUS
    "Réquisitions : cinq ans requis contre l'ancien président",
    "L'ancien Premier ministre est mort à 85 ans", "Retrouvé mort à son domicile, l'ancien député avait 70 ans", "Naufrage au large de Calais : 12 morts", // seuls « mort de », « la mort », « morte » sont listés
    "Un tireur ouvre le feu dans une permanence", "Tuerie à la sortie d'un lycée", "Explosion dans un bâtiment du ministère", "Incendie criminel à la permanence du député",
    "Une lycéenne devient porte-parole du mouvement", "Lola Martin, lycéenne parisienne, se confie sur le blocus", "Un lycéen de Saint-Denis raconte les gaz lacrymogènes", // mineurs : « lyceen » absent
    "Les juges réclament plus de moyens", "Un magistrat entendu par la commission d'enquête", "La police arrête un élu devant son domicile", "Un policier suspendu après une vidéo",
    "Trafic d'influence : l'élu convoqué par les enquêteurs", "Financement libyen : Sarkozy fixé sur son sort en appel", "Après l'affaire", // « affaire » en fin de titre : seul « affaire␠» est listé
    "Mélenchon cherche à attiser la fureur lycéenne", "Glucksmann dézingue Mélenchon", "Le député traité de menteur par le ministre",
  ];
  aucun(doivent.filter((t) => !motExclu(t)), "titres non écartés");
});

test("motExclu : robustesse typographique (espace insécable) et âge écrit en lettres", () => {
  const doivent = ["Mise en examen du maire de Nice", "Garde à vue prolongée pour le député", "Un élève de quinze ans élu délégué du mouvement", "Une jeune fille de seize ans prend la parole"];
  aucun(doivent.filter((t) => !motExclu(t)), "titres non écartés");
});

test("motExclu : faux positifs (titres sans risque écartés)", () => {
  const legitimes = ["Processus de paix : la France plaide pour un cessez-le-feu", "Retraites : le gouvernement vise un déficit à 3 % dans 5 ans", "Justice sociale : le PS veut taxer les hauts patrimoines"];
  aucun(legitimes.filter((t) => motExclu(t)), "titres légitimes écartés");
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Titres « à nous » produits par règles : affirmations fausses ou trompeuses
// ─────────────────────────────────────────────────────────────────────────────
const art = (media, titre, i = 0) => ({ media, titre, url: `https://example.org/${i}/${Math.abs(titre.length * 31 + i)}`, date: "2026-10-05T08:00:00.000Z" });
const sujet = (titres, personnes = []) => ({ derniere: "2026-10-05T08:00:00.000Z", illustration: { theme: "politique", personnes, partis: [] }, articles: titres.map((t, i) => art(["Le Monde", "BFMTV", "Libération", "Le Figaro"][i % 4], t, i)) });
const donneesGouv = { gouvernement: { membres: [{ nom: "Sébastien Lecornu", fonction: "Premier ministre" }] } };
const lecornu = [{ nom: "Sébastien Lecornu" }];
const titreDe = (t, p = []) => tp.titreParRegles(sujet([t], p), donneesGouv)?.titre || "";

test("titreParRegles (non-régression) : titres neutres et accusation sans juridiction non affirmée", () => {
  assert.match(titreDe("Lecornu annonce le gel des dépenses", lecornu), /^Premier ministre : /);
  assert.strictEqual(tp.titreParRegles(sujet(["Jordan Bardella soupçonné d'avoir menti"], [{ nom: "Jordan Bardella" }]), donneesGouv).generique, true, "accusation : titre de repli, jamais le nom de la personne");
  assert.doesNotMatch(titreDe("Jordan Bardella visé par une plainte", [{ nom: "Jordan Bardella" }]), /Bardella/);
  assert.match(titreDe("Le tribunal administratif suspend l'arrêté du maire de Gilley"), /tribunal administratif/);
});

test("titreParRegles : le thème « 2027 » l'emporte sur « budget » (Budget 2027 devient « présidentielle »)", () => {
  assert.doesNotMatch(titreDe("Budget 2027 : le PS appelle Sébastien Lecornu à modifier « sans délai » son projet", lecornu), /présidentielle/i);
  assert.doesNotMatch(titreDe("Vénissieux. Un conseil municipal des jeunes verra le jour en 2027"), /présidentielle/i);
});

test("titreParRegles : « primaire » est toujours « de la gauche » (école primaire, primaire de la droite)", () => {
  assert.doesNotMatch(titreDe("École primaire : la commune ferme une classe"), /Primaire de la gauche/);
  assert.doesNotMatch(titreDe("Primaire de la droite : Retailleau et Wauquiez se rencontrent"), /Primaire de la gauche/);
});

test("titreParRegles : ACTIONS affirme une décision du tribunal administratif ou une loi sans fondement", () => {
  assert.doesNotMatch(titreDe("Le Premier ministre suspend la réforme des retraites", lecornu), /tribunal administratif/);
  assert.doesNotMatch(titreDe("Sébastien Lecornu annule son déplacement à Lyon", lecornu), /tribunal administratif/);
  assert.doesNotMatch(titreDe("Le RN dépose une motion de censure contre Sébastien Lecornu", lecornu), /proposition de loi/);
  assert.doesNotMatch(titreDe("Le PS rejette le budget de Sébastien Lecornu", lecornu), /vote sur/);
  assert.doesNotMatch(titreDe("Sécurité sociale : les députés examinent le financement"), /maintien de l'ordre/);
});

test("titreParRegles : un « acteur » est nommé alors qu'il subit l'action (interrogé, critiqué)", () => {
  assert.doesNotMatch(titreDe("Les sénateurs interrogent Sébastien Lecornu sur le budget", lecornu), /prise de position/);
  assert.doesNotMatch(titreDe("Sébastien Lecornu critiqué par la gauche pour son budget", lecornu), /prise de position/);
});

test("dossiers.cjs : un mot-clé « prima » ou « retra » donne un titre faux (Primaire de la gauche, Retraites)", () => {
  const base = new Date("2026-10-05T10:00:00Z");
  const medias = ["Le Monde", "BFMTV", "Libération", "Le Figaro", "Sud Ouest", "RFI", "France 24", "20 Minutes"];
  const fill = ["météo pluie Bretagne", "football Marseille victoire", "festival Cannes cinéma", "inflation recule Insee", "grippe épidémie hôpitaux", "tennis Roland-Garros finale", "salon automobile Paris", "météo canicule Provence", "rugby Toulouse victoire", "séisme Japon bilan", "bourse Paris clôture", "SNCF grève trafic perturbé", "agriculture récolte blé", "immobilier prix baisse", "tourisme saison record"];
  const mk = (titres) => titres.map((t, i) => ({ titre: t, url: `https://ex.org/${i}-${t.length}`, media: medias[i % medias.length], date: new Date(base - i * 36e5).toISOString() }));
  const droite = ["Primaire de la droite : Retailleau prend la tête", "Primaire de la droite : débat entre candidats ce soir", "Primaire de la droite : le calendrier est fixé", "Primaire de la droite : Wauquiez hésite encore", "Primaire de la droite : les inscrits en hausse", "Primaire de la droite : le règlement est adopté", "Primaire de la droite : premiers parrainages annoncés"];
  const retrait = ["Retrait des troupes françaises : Paris plaide", "Retrait des troupes : la Russie annonce", "Retrait du Sahel : calendrier précisé", "Retrait militaire : les États-Unis confirment", "Retrait des soldats : les réactions", "Retrait de l'armée : le bilan", "Retrait des forces : nouvelle étape"];
  const t1 = construireDossiers(mk([...droite, ...fill]), base).map((d) => d.titre);
  const t2 = construireDossiers(mk([...retrait, ...fill]), base).map((d) => d.titre);
  assert.ok(t1.length && t2.length, "le jeu d'essai doit produire un dossier");
  assert.ok(!t1.includes("Primaire de la gauche"), `primaire de la droite : titre de dossier « ${t1} »`);
  assert.ok(!t2.includes("Retraites"), `retrait des troupes : titre de dossier « ${t2} »`);
});

test("titresProches : deux titres de repli « X : l'essentiel du moment » sont vus comme le même sujet", () => {
  assert.strictEqual(titresProches("Sénat : l'essentiel du moment", "Gouvernement : l'essentiel du moment"), false);
  assert.strictEqual(titresProches("Finances publiques : l'essentiel du moment", "Environnement : l'essentiel du moment"), false);
});

test("« repris par N médias » : quatre titres du groupe EBRA avec le même titre comptent pour quatre médias", () => {
  const now = new Date("2026-10-05T10:00:00Z");
  const titre = "Social. Blocus des lycées : Laurent Nuñez réfute toute intervention « disproportionnée » des forces de l'ordre";
  const s = { derniere: "2026-10-05T09:30:00.000Z", illustration: { theme: "politique", personnes: [], partis: [] }, titrePropre: { titre: "Blocus des lycées : position du ministre", origine: "regles" },
    articles: ["Le Progrès", "Dernières Nouvelles d'Alsace", "Le Dauphiné libéré", "L'Est républicain"].map((m, i) => ({ titre, url: `https://example.org/ebra/${i}`, media: m, date: "2026-10-05T09:30:00.000Z" })) };
  const r = sa.choisirSujet({ actualites: { sujets: [s] }, direct: null, file: { entrees: [] }, now });
  assert.ok(r.refus, "une seule dépêche reprise par 4 titres d'un même groupe n'est pas un sujet « repris par 4 médias »");
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Identification des personnes et crédits photo
// ─────────────────────────────────────────────────────────────────────────────
const { construireIndex, illustrer } = await import(pathToFileURL(join(RACINE, "scripts", "illustrations.js")).href);
const motifs = await construireIndex();

test("illustrer (non-régression) : nom complet et nom de famille accolé à un autre prénom", () => {
  assert.deepStrictEqual(illustrer(["Jordan Bardella présente le contre-budget du RN"], motifs).personnes.map((p) => p.nom), ["Jordan Bardella"]);
  assert.ok(!illustrer(["Philippe Martinez quitte la direction du syndicat"], motifs).personnes.some((p) => p.nom === "Édouard Philippe"), "Philippe Martinez n'est pas Édouard Philippe");
});

test("illustrer : « le maire » est pris pour Bruno Le Maire (portrait et nom d'un ministre sur un titre local)", () => {
  const titres = [
    "Haute-Savoie. « Si demain je ne suis plus maire » : déclaré inéligible, le maire de la Roche-sur-Foron s'est expliqué avant de faire appel", // titre réel (data/actualites.json, sujet n° 62 le 2026-10-06)
    "Le maire de Lyon dépose une plainte", "Le maire sortant de Perpignan réélu",
  ];
  const faux = titres.filter((t) => illustrer([t], motifs).personnes.some((p) => p.nom === "Bruno Le Maire"));
  aucun(faux, "titres illustrés par le portrait de Bruno Le Maire");
});

test("illustrer : « vote blanc » est traité comme une personne (« blanc de poulet »)", () => {
  assert.ok(!illustrer(["Le prix du blanc de poulet flambe"], motifs).personnes.some((p) => /blanc/i.test(p.nom)));
});

test("illustrations : le crédit affiché correspond à la photo affichée (portrait officiel AN/Sénat + crédit Commons)", () => {
  const tous = [...new Set(motifs.map((m) => m.p))].filter((p) => p.photo);
  const faux = tous.filter((p) => (/^photos\/(deputes|senateurs)\//.test(p.photo) && !/^(Assemblée nationale|Sénat)$/.test(p.credit || "")) || (/^photos\/personnalites\//.test(p.photo) && p.credit && !/Wikimedia Commons/.test(p.credit))).map((p) => `${p.nom} : ${p.photo} / ${p.credit}`);
  aucun(faux, "crédit d'une autre photo que celle affichée (photo officielle : Assemblée nationale ou Sénat ; photo Commons : auteur, licence, Wikimedia Commons)");
  assert.ok(!tous.some((p) => /^photos\/(deputes|senateurs)\//.test(p.photo) && /Commons|CC /.test(p.credit || "")), "jamais le crédit d'un fichier Commons sur une photo officielle");
});

test("noms accentués : data/gouvernement.json et le dessin des stories doivent écrire « Nuñez » comme la presse", { todo: "J-13 (mineur) : « Laurent Nunez » sous le portrait, « Nuñez » dans le titre (story 09300bde3322)" }, () => {
  const noms = JSON.parse(readFileSync(join(RACINE, "data", "gouvernement.json"), "utf-8")).membres.map((m) => m.nom);
  assert.ok(!noms.includes("Laurent Nunez"), "écrire Laurent Nuñez (nom officiel) et rapprocher sans accent seulement pour la recherche");
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Sondages et réserve électorale
// ─────────────────────────────────────────────────────────────────────────────
test("réserve électorale (non-régression) : du samedi 0 h au dimanche 20 h (Paris) pour les deux tours de 2027", () => {
  assert.strictEqual(reserveSondages(new Date("2027-04-16T21:59:00Z")), null, "vendredi 23 h 59 Paris");
  assert.strictEqual(reserveSondages(new Date("2027-04-16T22:00:00Z")), "2027-04-18", "samedi 0 h 00 Paris (UTC+2)");
  assert.strictEqual(reserveSondages(new Date("2027-04-18T17:59:00Z")), "2027-04-18", "dimanche 19 h 59 Paris");
  assert.strictEqual(reserveSondages(new Date("2027-04-18T18:00:00Z")), null, "dimanche 20 h 00 Paris");
  assert.strictEqual(reserveSondages(new Date("2027-04-30T21:59:00Z")), null, "vendredi 23 h 59 Paris (2e tour)");
  assert.strictEqual(reserveSondages(new Date("2027-04-30T22:00:00Z")), "2027-05-02", "samedi 0 h Paris (2e tour)");
});

test("parleDeSondage : un résultat de sondage cité sans le mot « sondage » passe", () => {
  const doivent = ["Présidentielle : Bardella en tête avec 36 % selon l'Ifop", "Selon Elabe, Le Pen progresse", "Bardella crédité de 33 % au premier tour", "Les sondés jugent Macron sévèrement", "Odoxa : 54 % des Français",
    "Bardella pourrait recueillir 35 %", "Projection : le RN aurait 300 sièges", "Harris Interactive pour RTL : Mélenchon 15 %", "Cote de popularité : Lecornu perd 3 points"];
  aucun(doivent.filter((t) => !parleDeSondage(t)), "titres non reconnus comme sondage");
});

test("réserve électorale : un sondage mis en story la veille au soir reste visible (24 h) pendant la réserve", () => {
  const sondages = { instituts: [{ nom: "Ifop", date: "10-14 avril 2027", dateFin: "2027-04-15", echantillon: 1500, url: "https://x/y.pdf", scores: { a: [1, 2], b: [1, 2], c: [1, 2] } }] };
  const r = choisirSondage({ sondages, file: { entrees: [] }, now: new Date("2027-04-16T20:00:00Z") }); // vendredi 22 h à Paris
  assert.ok(r.refus, "aucune story de sondage ne devrait partir moins de 24 h avant la réserve");
});

test("story de sondage : la mention du commanditaire est obligatoire (loi du 19 juillet 1977, art. 2), jamais « non relevé »", () => {
  const src = readFileSync(join(RACINE, "js", "stories.js"), "utf-8");
  assert.ok(!/commanditaire non relevé/.test(src), "une story sans commanditaire doit être refusée (ou le commanditaire déduit de la notice), pas publiée avec « non relevé »");
  // côté sélection : le commanditaire se lit dans la notice (veille) ou dans le nom du fichier de la notice ; sinon le sondage est refusé
  const inst = (url) => ({ nom: "Ifop", date: "25-29 septembre 2026", dateFin: "2026-09-29", echantillon: 1527, url, scores: { a: [1, 2], b: [1, 2], c: [1, 2] } });
  const now = new Date("2026-09-30T08:00:00Z");
  const sans = choisirSondage({ sondages: { instituts: [inst("https://x/notice.pdf")] }, file: { entrees: [] }, now });
  assert.ok(sans.refus && /commanditaire/.test(sans.refus), "commanditaire inconnu : refus");
  const deduit = choisirSondage({ sondages: { instituts: [inst("https://x/10284-pres-barometre-ifop-le-figaro-30-septembre.pdf")] }, file: { entrees: [] }, now });
  assert.strictEqual(deduit.commanditaire, "Le Figaro", "déduit du nom du fichier de la notice");
  const veille = [{ institut: "Ifop", media: "Le Parisien", terrain: { fin: "2026-09-29" } }];
  assert.strictEqual(choisirSondage({ sondages: { instituts: [inst("https://x/notice.pdf")] }, file: { entrees: [] }, now, veille }).commanditaire, "Le Parisien", "relevé dans la notice déposée");
});

test("contexteSujet : un résultat de sondage affiché hors story « sondage » doit porter les mentions légales", () => {
  const s = { illustration: { theme: "election", personnes: [{ nom: "Jean-Luc Mélenchon" }] }, articles: [art("A", "Débat à gauche", 0)] };
  const inst = (url) => ({ nom: "Ifop", date: "25-29 septembre 2026", dateFin: "2026-09-29", echantillon: 1527, url, scores: { "Jean-Luc Mélenchon": [14, 17] } });
  const donnees = (url) => ({ sondages: { instituts: [inst(url)] }, tours: ["2027-04-18", "2027-05-02"] });
  const c = tp.contexteSujet(s, donnees("https://x/10284-ifop-le-figaro-30-septembre.pdf"), new Date("2026-10-06T10:00:00Z")).find((x) => x.type === "sondage");
  assert.ok(c, "le jeu d'essai doit produire une ligne de sondage");
  assert.match(c.texte, /pour Le Figaro/, "commanditaire");
  assert.match(c.texte, /1\s527 personnes/, "échantillon");
  assert.match(c.texte, /marge d'erreur ±2,5 pts/, "marge d'erreur");
  assert.match(c.texte, /terrain : 25-29 septembre 2026/, "dates du terrain");
  assert.ok(!tp.contexteSujet(s, donnees("https://x/notice.pdf"), new Date("2026-10-06T10:00:00Z")).some((x) => x.type === "sondage"), "commanditaire inconnu : aucune ligne de sondage");
  assert.ok(!tp.contexteSujet(s, donnees("https://x/ifop-le-figaro.pdf"), new Date("2027-04-16T20:00:00Z")).some((x) => x.type === "sondage"), "à moins de 24 h de la réserve : aucune ligne de sondage");
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Dates à retenir et posts
// ─────────────────────────────────────────────────────────────────────────────
test("dateSujet (non-régression) : une date future recoupée par deux médias est retenue ; une seule source ne suffit pas", () => {
  const now = new Date("2026-10-02T10:00:00Z");
  const s = (t) => ({ articles: t.map((x, i) => ({ media: ["A", "B", "C"][i], titre: x })) });
  assert.strictEqual(tp.dateSujet(s(["Le projet de loi sera examiné au Sénat le 27 octobre", "Casseurs-payeurs : examen le 27 octobre au Sénat"]), now)?.iso, "2026-10-27");
  assert.strictEqual(tp.dateSujet(s(["Le projet de loi sera examiné au Sénat le 27 octobre"]), now), null);
});

test("dateSujet : une date de loi ancienne (« loi du 9 décembre 1905 ») devient une « date à retenir » à venir", { todo: "J-18 : l'année écrite après le jour/mois est ignorée ; « du 9 décembre 1905 » → 2026-12-09, puis post permanent « Date à retenir »" }, () => {
  const now = new Date("2026-10-06T10:00:00Z");
  const r = tp.dateSujet({ articles: [{ media: "A", titre: "Laïcité : la loi du 9 décembre 1905 en débat à l'Assemblée" }, { media: "B", titre: "Loi de 1905 : le débat sur la laïcité, retour sur la loi du 9 décembre 1905" }] }, now);
  assert.strictEqual(r, null);
});

test("ficheDate (non-régression) : la citation de presse du post garde le nom du média", () => {
  const s = { titrePropre: { titre: "Loi casseurs-payeurs : examen au Sénat" }, date: { iso: "2026-10-27", jour: 27, mois: "octobre" }, articles: [{ media: "franceinfo", titre: "Le projet de loi « casseurs-payeurs » sera examiné au Sénat le 27 octobre" }, { media: "Le Monde", titre: "Casseurs-payeurs : examen le 27 octobre au Sénat" }] };
  const f = ficheDate(s, new Date("2026-10-02T10:00:00Z"));
  assert.strictEqual(f.spec.media, "franceinfo");
  assert.match(f.legende, /Date annoncée par la presse \(franceinfo, Le Monde\)/);
});

test("ficheDate : un post reste au fil, mais sa légende et son image affirment « dans 25 jours »", { todo: "J-19 : le décompte est figé à la date de publication ; le lendemain il est faux. Écrire la date seule (ou « le mardi 27 octobre »), garder le compte à rebours pour la story" }, () => {
  const s = { titrePropre: { titre: "Loi casseurs-payeurs : examen au Sénat" }, date: { iso: "2026-10-27", jour: 27, mois: "octobre" }, articles: [{ media: "franceinfo", titre: "Examen au Sénat le 27 octobre" }, { media: "Le Monde", titre: "Examen le 27 octobre" }] };
  const f = ficheDate(s, new Date("2026-10-02T10:00:00Z"));
  assert.doesNotMatch(f.legende, /dans \d+ jours?/);
  assert.strictEqual(f.spec.compte, undefined, "le compteur est dessiné dans l'image du post");
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Fuseau horaire, créneaux et minuit
// ─────────────────────────────────────────────────────────────────────────────
const entreeFile = (id, cree, extra = {}) => ({ id, cree, titre: "Budget : le gouvernement présente son texte", medias: ["A", "B", "C"], url_image: `https://example.org/img/${id}.jpg`, type: "story", sources: [], ...extra });
const config = { monetisation: false, validationHumaine: false };
const choir = ({ file, retires }) => choisir({ file, registre: { entrees: [] }, config, now: new Date("2026-10-05T10:00:00Z"), retires });
const peutPublier = (now, extra = {}) => !choisir({ file: { entrees: [entreeFile("aaaaaaaaaaaa", new Date(Date.parse(now) - 36e5).toISOString())] }, registre: { entrees: [] }, config, now: new Date(now), ...extra }).refus;

test("publier-stories (non-régression) : plage 7 h – 23 h à Paris, heure d'été comme heure d'hiver", () => {
  assert.strictEqual(peutPublier("2026-07-01T20:59:00Z"), true, "22 h 59 Paris (été)");
  assert.strictEqual(peutPublier("2026-07-01T21:00:00Z"), false, "23 h 00 Paris (été)");
  assert.strictEqual(peutPublier("2026-07-02T04:59:00Z"), false, "6 h 59 Paris (été)");
  assert.strictEqual(peutPublier("2026-07-02T05:00:00Z"), true, "7 h 00 Paris (été)");
  assert.strictEqual(peutPublier("2026-12-01T21:59:00Z"), true, "22 h 59 Paris (hiver)");
  assert.strictEqual(peutPublier("2026-12-01T22:00:00Z"), false, "23 h 00 Paris (hiver)");
  assert.strictEqual(peutPublier("2026-12-02T05:59:00Z"), false, "6 h 59 Paris (hiver)");
  assert.strictEqual(peutPublier("2026-12-02T06:00:00Z"), true, "7 h 00 Paris (hiver)");
  // changement d'heure d'automne (dimanche 25 octobre 2026) : 7 h Paris = 6 h UTC
  assert.strictEqual(peutPublier("2026-10-25T05:59:00Z"), false, "6 h 59 Paris (le jour du passage à l'heure d'hiver)");
  assert.strictEqual(peutPublier("2026-10-25T06:00:00Z"), true, "7 h 00 Paris (le jour du passage à l'heure d'hiver)");
});

test("publier-stories (non-régression) : plafond par jour calculé sur le jour de Paris (minuit local, pas minuit UTC)", () => {
  const publiee = (id, iso) => ({ id, statut: "publiee", publieLe: iso, mediaId: "1", type: "story" });
  // 4 stories publiées « hier » à 22 h – 23 h Paris (20 h – 21 h UTC), nouvelle journée à 8 h Paris : le plafond est remis à zéro
  const registre = { entrees: [publiee("a1a1a1a1a1a1", "2026-07-01T17:00:00Z"), publiee("a2a2a2a2a2a2", "2026-07-01T18:00:00Z"), publiee("a3a3a3a3a3a3", "2026-07-01T19:00:00Z"), publiee("a4a4a4a4a4a4", "2026-07-01T20:00:00Z")] };
  const now = new Date("2026-07-02T06:00:00Z"); // 8 h Paris
  const r = choisir({ file: { entrees: [entreeFile("bbbbbbbbbbbb", "2026-07-02T05:30:00Z", { titre: "Retraites : le gouvernement relance la concertation" })] }, registre, config: { ...config, maxParJour: 4 }, now });
  assert.ok(r.entree, r.refus);
});

test("jourUTC2 vs jourParis : en hiver, 23 h 30 à Paris tombe déjà le « lendemain » pour le plafond de stories-auto", { todo: "J-20 (mineur) : jourUTC2 fixe +2 h toute l'année ; en hiver le jour change à 23 h Paris. Sans effet la nuit (rien n'est produit), mais un sondage (autorisé jusqu'à 23 h 30) est compté sur le mauvais jour" }, () => {
  const d = new Date("2026-12-10T22:30:00Z"); // 23 h 30 à Paris (UTC+1)
  assert.strictEqual(jourUTC2(d), jourParis(d));
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. publier-stories.cjs de bout en bout (faux serveur Graph API local) : doublons, reprise, jeton, configuration
// ─────────────────────────────────────────────────────────────────────────────
const JETON = "EAAJETONAUDIT123";
const MAINTENANT = "2026-10-05T10:00:00Z"; // 12 h à Paris
const il_y_a = (h) => new Date(Date.parse(MAINTENANT) - h * 36e5).toISOString();
const etat = {};
let vraies = 0; // publications réellement reçues par le faux Instagram (même si la réponse a été « perdue »)
const appels = [];
const serveur = http.createServer((req, res) => {
  let corps = "";
  req.on("data", (c) => (corps += c));
  req.on("end", () => {
    const url = new URL(req.url, "http://x");
    appels.push({ methode: req.method, chemin: url.pathname, corps });
    const json = (code, o) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
    if (url.pathname.startsWith("/img/")) { res.writeHead(200); return res.end(); }
    if (url.pathname === "/debug_token") return json(200, { data: { is_valid: etat.valide !== false, expires_at: 0 } });
    if (url.pathname === "/IGUSER/media" && req.method === "POST") {
      if (etat.refuser && corps.includes(etat.refuser)) return json(400, { error: { message: "Invalid image" } });
      return json(200, { id: "CONT1" });
    }
    if (url.pathname === "/IGUSER/stories" || url.pathname === "/IGUSER/media") { // vérification côté Instagram après une réponse perdue
      if (!etat.stories) return json(404, { error: { message: "inconnu" } });
      return json(200, { data: [{ id: "MEDIATROUVE", timestamp: new Date(Date.parse(MAINTENANT) + 2000).toISOString().replace(/\.\d+Z$/, "+0000") }] });
    }
    if (url.pathname === "/CONT1") return json(200, { status_code: "FINISHED", id: "CONT1" });
    if (url.pathname === "/IGUSER/media_publish") {
      etat.surPublication?.(etat.dossierEssai); // espion : état du registre au moment de media_publish
      vraies++; // la publication a bien eu lieu côté Instagram
      return etat.reponsePerdue ? json(500, { error: { message: "Internal error (réponse perdue)" } }) : json(200, { id: "MEDIA" + vraies });
    }
    json(404, { error: { message: "inconnu" } });
  });
});
await new Promise((r) => serveur.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${serveur.address().port}`;
const entreeHttp = (id, cree, titre) => ({ id, cree, titre, medias: ["A", "B", "C"], url_image: `${BASE}/img/${id}.jpg`, type: "story", sources: [] });

async function lancer({ entrees = [], registre = null, registreBrut = null, cfg = config, cfgBrute = null, now = MAINTENANT, reglages = {} }) {
  Object.keys(etat).forEach((k) => delete etat[k]);
  Object.assign(etat, reglages);
  appels.length = 0;
  const d = mkdtempSync(join(tmpdir(), "audit-"));
  etat.dossierEssai = d;
  writeFileSync(join(d, "file.json"), JSON.stringify({ entrees }));
  writeFileSync(join(d, "config.json"), cfgBrute ?? JSON.stringify(cfg));
  if (registre || registreBrut) writeFileSync(join(d, "reg.json"), registreBrut ?? JSON.stringify(registre));
  writeFileSync(join(d, "resume.md"), "");
  const env = { ...process.env, GRAPH_BASE: BASE, PUBLIER_MAINTENANT: now, PUBLIER_FILE: join(d, "file.json"), PUBLIER_REGISTRE: join(d, "reg.json"), PUBLIER_CONFIG: join(d, "config.json"), PUBLIER_ATTENTE_MS: "10", GITHUB_STEP_SUMMARY: join(d, "resume.md"), IG_USER_ID: "IGUSER", IG_ACCESS_TOKEN: JETON };
  const p = spawn(process.execPath, ["scripts/publier-stories.cjs"], { env, cwd: RACINE });
  let sortie = "";
  p.stdout.on("data", (c) => (sortie += c));
  p.stderr.on("data", (c) => (sortie += c));
  const code = await new Promise((r) => p.on("close", r));
  const lire = (f) => (existsSync(join(d, f)) ? readFileSync(join(d, f), "utf-8") : "");
  const reg = lire("reg.json");
  return { code, sortie, registre: reg ? (() => { try { return JSON.parse(reg); } catch (e) { return null; } })() : null, publications: appels.filter((a) => a.chemin === "/IGUSER/media_publish").length };
}

test("publier-stories (non-régression) : une publication réussie est inscrite au registre et n'est jamais rejouée", async () => {
  const e = entreeHttp("aaaaaaaaaaaa", il_y_a(1), "Retraites : le gouvernement relance la concertation");
  const r1 = await lancer({ entrees: [e] });
  assert.strictEqual(r1.publications, 1, r1.sortie);
  assert.strictEqual(r1.registre.entrees.find((x) => x.id === e.id)?.statut, "publiee");
  const r2 = await lancer({ entrees: [e], registre: r1.registre, now: new Date(Date.parse(MAINTENANT) + 2 * 36e5).toISOString() });
  assert.strictEqual(r2.publications, 0, "même id : jamais deux fois");
});

test("publier-stories : réponse perdue de media_publish (timeout, 5xx) → la même story est republiée au passage suivant", async () => {
  const e = entreeHttp("aaaaaaaaaaaa", il_y_a(1), "Retraites : le gouvernement relance la concertation");
  const avant = vraies;
  const r1 = await lancer({ entrees: [e], reglages: { reponsePerdue: true } });
  await lancer({ entrees: [e], registre: r1.registre, now: new Date(Date.parse(MAINTENANT) + 15 * 60000).toISOString() });
  assert.strictEqual(vraies - avant, 1, `publications réelles côté Instagram : ${vraies - avant} pour une seule entrée`);
});

test("publier-stories : un registre illisible est traité comme vide (tout ce qui est frais est republié)", async () => {
  const e = entreeHttp("aaaaaaaaaaaa", il_y_a(1), "Retraites : le gouvernement relance la concertation");
  const r = await lancer({ entrees: [e], registreBrut: '{"entrees": [{"id": "aaaaaaaaaaaa", "statut": "publiee"' }); // JSON tronqué
  assert.strictEqual(r.publications, 0, "registre illisible : aucune publication");
});

test("publier-stories : une configuration illisible désactive « validationHumaine » (le verrou s'ouvre)", async () => {
  const r = await lancer({ entrees: [entreeHttp("aaaaaaaaaaaa", il_y_a(1), "Retraites : le gouvernement relance la concertation")], cfgBrute: '{ "validationHumaine": true, ' });
  assert.strictEqual(r.publications, 0, "configuration illisible : aucune publication");
  const dir = mkdtempSync(join(tmpdir(), "cfg-"));
  writeFileSync(join(dir, "c.json"), "{ pas du json");
  assert.strictEqual(lireConfig(join(dir, "c.json")).validationHumaine, true);
});

test("publier-stories : une entrée qui échoue en boucle bloque toutes les suivantes (tête de file)", { todo: "A-04 : choisir() prend toujours la plus ancienne ; si l'API refuse son image, elle est retentée à chaque passage jusqu'à péremption (3 h story, 12 h post) et rien d'autre ne sort. Compter les échecs dans le registre et passer à la suivante après 2 essais" }, async () => {
  const entrees = [entreeHttp("aaaaaaaaaaaa", il_y_a(2.5), "Retraites : le gouvernement relance la concertation"), entreeHttp("bbbbbbbbbbbb", il_y_a(1), "Logement : le gouvernement présente son plan")];
  let registre = null, publieesB = 0;
  for (let i = 0; i < 3; i++) {
    const now = new Date(Date.parse(MAINTENANT) + i * 15 * 60000).toISOString();
    const r = await lancer({ entrees, registre, now, reglages: { refuser: "aaaaaaaaaaaa" } });
    registre = r.registre || registre;
    if (registre?.entrees?.some((x) => x.id === "bbbbbbbbbbbb" && x.statut === "publiee")) publieesB++;
  }
  assert.ok(publieesB > 0, "la 2e entrée n'est jamais tentée tant que la 1re échoue");
});

test("publier-stories : jeton invalide → l'exécution GitHub reste verte, l'alerte n'est visible que dans le résumé", async () => {
  const r = await lancer({ entrees: [entreeHttp("aaaaaaaaaaaa", il_y_a(1), "Retraites : le gouvernement relance la concertation")], reglages: { valide: false } });
  assert.notStrictEqual(r.code, 0, "code de sortie 0 malgré un jeton invalide");
});

test("publier-stories : réponse perdue, publication retrouvée côté Instagram : inscrite « publiee », jamais rejouée (A-01)", async () => {
  const e = entreeHttp("aaaaaaaaaaaa", il_y_a(1), "Retraites : le gouvernement relance la concertation");
  const avant = vraies;
  const r1 = await lancer({ entrees: [e], reglages: { reponsePerdue: true, stories: true } });
  const ligne = r1.registre.entrees.find((x) => x.id === e.id);
  assert.strictEqual(ligne.statut, "publiee");
  assert.strictEqual(ligne.mediaId, "MEDIATROUVE");
  assert.strictEqual(r1.code, 0);
  await lancer({ entrees: [e], registre: r1.registre, now: new Date(Date.parse(MAINTENANT) + 2 * 36e5).toISOString() });
  assert.strictEqual(vraies - avant, 1);
});

test("publier-stories : réponse perdue et vérification impossible : « incertaine », code 1, comptée dans les plafonds, jamais rejouée (A-01)", async () => {
  const e = entreeHttp("aaaaaaaaaaaa", il_y_a(1), "Retraites : le gouvernement relance la concertation");
  const r1 = await lancer({ entrees: [e], reglages: { reponsePerdue: true } });
  const ligne = r1.registre.entrees.find((x) => x.id === e.id);
  assert.strictEqual(ligne.statut, "incertaine");
  assert.ok(ligne.publieLe, "datée : elle compte dans l'espacement et les plafonds");
  assert.notStrictEqual(r1.code, 0, "alerte visible");
  assert.ok(!r1.sortie.includes(JETON));
});

test("publier-stories : intention « en-cours » restée au registre (job tué avant l'écriture) : jamais rejouée, marquée « incertaine » (A-01)", async () => {
  const e = entreeHttp("aaaaaaaaaaaa", il_y_a(1), "Retraites : le gouvernement relance la concertation");
  const avant = vraies;
  const registre = { entrees: [{ id: e.id, statut: "en-cours", publieLe: il_y_a(0.5), mediaId: null, type: "story" }] };
  const r = await lancer({ entrees: [e], registre });
  assert.strictEqual(vraies - avant, 0, "pas de nouvelle publication");
  assert.strictEqual(r.registre.entrees.find((x) => x.id === e.id).statut, "incertaine");
  assert.notStrictEqual(r.code, 0);
  const r2 = await lancer({ entrees: [e], registre, reglages: { stories: true } });
  assert.strictEqual(r2.registre.entrees.find((x) => x.id === e.id).statut, "publiee", "retrouvée côté Instagram : inscrite sans republier");
});

test("publier-stories : l'intention « en-cours » est écrite AVANT media_publish (A-01)", async () => {
  const e = entreeHttp("aaaaaaaaaaaa", il_y_a(1), "Retraites : le gouvernement relance la concertation");
  let vu = null;
  const r = await lancer({ entrees: [e], reglages: { surPublication: (d) => { vu = JSON.parse(readFileSync(join(d, "reg.json"), "utf-8")); } } });
  assert.ok(vu?.entrees.some((x) => x.id === e.id && x.statut === "en-cours"), "au moment de media_publish, le registre contient déjà l'intention « en-cours »");
  assert.strictEqual(r.registre.entrees.find((x) => x.id === e.id).statut, "publiee", "puis elle devient « publiee »");
  assert.strictEqual(r.registre.entrees.filter((x) => x.id === e.id).length, 1, "une seule ligne");
});

test("publier-stories : registre ou configuration illisibles : rien ne part, alerte visible (code 1) (A-02, A-03)", async () => {
  const e = entreeHttp("aaaaaaaaaaaa", il_y_a(1), "Retraites : le gouvernement relance la concertation");
  const r1 = await lancer({ entrees: [e], registreBrut: "<<<<<<< HEAD\n{ conflit de fusion" });
  assert.strictEqual(r1.publications, 0);
  assert.notStrictEqual(r1.code, 0);
  const r2 = await lancer({ entrees: [e], cfgBrute: "{ \"validationHumaine\": true, " });
  assert.strictEqual(r2.publications, 0);
  assert.notStrictEqual(r2.code, 0);
  // la configuration absente garde les valeurs par défaut (comportement historique) ; valide, validationHumaine à true : rien ne part, code 0
  const r3 = await lancer({ entrees: [e], cfg: { ...config, validationHumaine: true } });
  assert.strictEqual(r3.publications, 0);
  assert.strictEqual(r3.code, 0);
});

test("contenus retirés (J-23) : jamais republiés, texte jamais repris, images supprimées", async () => {
  const { lireRetires } = require("../scripts/retires.cjs");
  const retires = lireRetires();
  for (const id of ["bardella-0210", "jour-0310", "lyceens-0310", "lyceens-0410", "post-primaire-0510"]) assert.ok(retires.has(id), id);
  // le registre n'est pas modifié (trace d'historique)
  const reg = JSON.parse(readFileSync(join(RACINE, "data", "instagram-publiees.json"), "utf-8"));
  assert.ok(reg.entrees.some((x) => x.id === "bardella-0210"), "le registre garde la trace");
  // une entrée de la file qui porte un id retiré n'est jamais publiée
  const e = entreeFile("bardella-0210", new Date(Date.parse("2026-10-05T10:00:00Z") - 36e5).toISOString());
  assert.ok(choir({ file: { entrees: [e] }, retires: new Set(["bardella-0210"]) }).refus, "id retiré : refus");
  assert.ok(!choir({ file: { entrees: [e] } }).refus, "même entrée non retirée : publiable");
  // le texte d'une publication retirée n'entre pas dans la détection de sujets proches
  const autre = entreeFile("cccccccccccc", "2026-10-05T09:30:00.000Z", { titre: "Retraites : le gouvernement relance la concertation" });
  const registre = { entrees: [{ id: "bardella-0210", statut: "publiee", publieLe: "2026-10-05T07:00:00.000Z", mediaId: "windsor", type: "story", titre: "Retraites : le gouvernement relance la concertation", sujets: [] }] };
  assert.ok(choisir({ file: { entrees: [autre] }, registre, config, now: new Date("2026-10-05T10:00:00Z") }).refus, "sans la liste : sujet proche d'une publication récente");
  assert.ok(!choisir({ file: { entrees: [autre] }, registre, config, now: new Date("2026-10-05T10:00:00Z"), retires: new Set(["bardella-0210"]) }).refus, "texte retiré ignoré");
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Hygiène du dépôt : contenus publiés hors chaîne
// ─────────────────────────────────────────────────────────────────────────────
test("registre : chaque publication « publiee » a un vrai identifiant de média Instagram", { todo: "A-06 : 8 entrées ont mediaId « windsor » (publication manuelle ou simulée). Elles comptent dans les plafonds et la fenêtre anti-doublon sans pouvoir être vérifiées" }, () => {
  const reg = JSON.parse(readFileSync(join(RACINE, "data", "instagram-publiees.json"), "utf-8"));
  const faux = reg.entrees.filter((e) => e.statut === "publiee" && !/^\d{10,}$/.test(String(e.mediaId))).map((e) => `${e.id} (${e.mediaId})`);
  aucun(faux, "entrées sans identifiant Instagram valide");
});

test("instagram/auto : aucune image hors chaîne (nom non standard) ne reste servie publiquement", () => {
  const hors = readdirSync(join(RACINE, "instagram", "auto")).filter((f) => !/^[0-9a-f]{12}\.(jpg|mp4)$/.test(f));
  aucun(hors, "fichiers hors convention");
});

after(() => serveur.close());
