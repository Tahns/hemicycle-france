// Tests de la liste prudente unique (scripts/liste-prudente.cjs, audit J-01 à J-03, J-08) et de la distinction presse / donnée officielle.
// USAGE : node tests/liste-prudente.test.mjs
import test from "node:test";
import assert from "node:assert";
import { readFileSync } from "fs";
import { createRequire } from "module";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(RACINE);
const require = createRequire(import.meta.url);
const LP = require("../scripts/liste-prudente.cjs");
const SA = require("../scripts/stories-auto.cjs");
const TP = require("../scripts/titres-propres.cjs");
const CA = require("../scripts/contenus-auto.cjs");
const { motExclu } = LP;

test("une seule liste : stories-auto.motExclu et titres-propres utilisent celle de liste-prudente", () => {
  for (const t of ["Une enquête sur les comptes du ministre", "Retrouvé mort à son domicile", "Lecornu annonce le gel des dépenses", "Justice sociale : le PS veut taxer"]) {
    assert.strictEqual(SA.motExclu(t), LP.motExclu(t), t);
  }
  // les listes de titres propres sont dérivées de la même source (J-08) : harcèlement, fraude, agression, viol, interpellation, assises…
  for (const t of ["Harcèlement : le ministre visé", "Fraude fiscale : un élu", "Agression d'un maire", "Un viol à la mairie", "Interpellation en marge du blocus", "Assises : l'ancien député attendu", "Les enquêteurs perquisitionnent"]) {
    assert.ok(LP.JUDICIAIRE_TITRES.test(t), `JUDICIAIRE_TITRES : ${t}`);
  }
  assert.ok(LP.PROCEDURE.test("Une enquête est ouverte") && LP.JURIDICTION.test("Le tribunal rend sa décision"));
  assert.match(readFileSync(join(RACINE, "scripts", "titres-propres.cjs"), "utf-8"), /require\("\.\/liste-prudente\.cjs"\)/, "titres-propres importe la liste unique");
});

test("décision du propriétaire : accusation, plainte, polémique, procédure et écrits attribués ne sont plus écartés (niveau presse) ; violences, drames, mineurs le restent", () => {
  assert.deepStrictEqual(LP.GROUPES_PRESSE_ACTIFS, ["violences", "drame", "mineurs"]);
  for (const t of ["Écrits antisémites attribués à X", "Plainte déposée contre X", "Propos racistes : le député s'explique", "Mis en examen, le maire de Nice reste en poste", "Enquête ouverte après des accusations visant X",
    "Polémique : X accusé de dérapage", "Le tribunal condamne l'ancien ministre", "Discrimination : le Défenseur des droits saisi"]) {
    assert.strictEqual(motExclu(t), null, `retenu : ${t}`);
    assert.ok(motExclu(t, { groupes: LP.GROUPES_TOUS }), `la liste complète l'écartait : ${t}`);
  }
  for (const t of ["Un viol dénoncé dans un parti", "Agression d'un maire", "Violences sexuelles : X visé", "Pédocriminalité : un élu entendu", "Meurtre d'une élue", "Décès de l'ancien ministre", "Un drame à la sortie du meeting", "Mort de l'ancien président",
    "Un adolescent de 15 ans blessé", "Une lycéenne devient porte-parole", "Lola, 16 ans, se confie"]) assert.ok(motExclu(t), `toujours écarté : ${t}`);
  // un fait de discours mêlé à une violence physique reste écarté par la violence
  assert.ok(motExclu("Agression antisémite : un élu condamne"));
  // le niveau officiel est inchangé
  assert.ok(motExclu("Débat sur l'affaire Dupont", { officiel: true }) && motExclu("Polémique sur le budget", { officiel: true }));
});

test("mots entiers : pas de faux positifs sur des sous-chaînes", () => {
  for (const t of ["Processus de paix : la France plaide pour un cessez-le-feu", "La mortalité infantile baisse", "Retraites : un déficit à 3 % dans 5 ans", "Le budget de la défense : un rapport", "Le déficit s'élève à 150 milliards d'euros",
    "Justice sociale : le PS veut taxer les hauts patrimoines", "Une commission d'enquête sur les prix de l'énergie", "Mobilisation lycéenne : Macron réunit des ministres", "Les lycéens manifestent partout en France", "Les élèves reprennent les cours",
    "Pierre Moscovici s'exprime sur la Cour des comptes", "Le Premier ministre vise un accord", "Un taux de chômage de 7,4 %"]) {
    assert.strictEqual(motExclu(t), null, `à tort : ${t} (${motExclu(t)})`);
  }
});

test("mots prudents : accents, casse, espaces insécables et typographie normalisés", () => {
  const tous = (t) => motExclu(t, { groupes: LP.GROUPES_TOUS });
  for (const t of ["ENQUÊTE sur le ministre", "Mise en examen du maire de Nice", "Garde à vue prolongée", "Cour d’appel : décision attendue", "Le maire déclaré INÉLIGIBLE"]) {
    assert.ok(tous(t), `liste complète : ${t}`);
    assert.strictEqual(motExclu(t), null, `retenu depuis la décision du propriétaire : ${t}`);
  }
  for (const t of ["Le député est mort ce matin",
    "Un tireur ouvre le feu", "Une lycéenne devient porte-parole", "Un élève de quinze ans élu délégué", "Un adolescent de 15 ans blessé", "Lola, 16 ans, se confie", "Décès de l'ancien président du Sénat", "Suicide d'un élu", "Violences policières : le ministre répond"]) {
    assert.ok(motExclu(t), `devrait être écarté : ${t}`);
  }
});

test("niveau officiel : l'ordre du jour, les textes et les scrutins ne sont pas bloqués par les mots de presse ; ce qui vise une personne l'est toujours", () => {
  const off = { officiel: true };
  for (const t of ["Proposition de loi apportant une réponse intégrale au phénomène de violences sexuelles et sexistes contre les femmes et les enfants", "Proposition de loi organique visant à adapter l'autorité judiciaire à la lutte contre les violences sexuelles et intrafamiliales",
    "Projet de loi relatif à la lutte contre la fraude sociale", "Débat sur la justice des mineurs"].slice(0, 3)) {
    assert.strictEqual(motExclu(t, off), null, t);
    assert.ok(motExclu(t, { groupes: LP.GROUPES_TOUS }), `liste complète : le même texte dans un titre de presse était écarté : ${t}`);
  }
  for (const t of ["Débat sur l'affaire Dupont", "Hommage à l'ancien député décédé", "Le ministre mis en examen : débat", "Polémique sur le budget"]) assert.ok(motExclu(t, off), `officiel mais vise une personne : ${t}`);
});

test("ordre du jour réel du 13 octobre 2026 : aucun point n'est écarté par un mot prudent", () => {
  const agenda = JSON.parse(readFileSync(join(RACINE, "data", "agenda-an.json"), "utf-8"));
  const jour = agenda.jours.find((j) => j.date === "2026-10-13");
  assert.ok(jour && jour.points.length >= 4, "le jeu de données contient le 13 octobre");
  const ecartes = jour.points.filter((p) => p.type !== "qag" && motExclu(p.objet, { officiel: true }));
  assert.deepStrictEqual(ecartes.map((p) => p.objet), [], "aucun point officiel écarté");
  const r = CA.choisirAujourdhui({ agenda: { ...agenda, lastUpdated: new Date("2026-10-13T04:00:00Z").toISOString() }, jour: "2026-10-13", now: new Date("2026-10-13T05:00:00Z") });
  assert.ok(r.contenu, r.refus);
  assert.strictEqual(r.contenu.rendu.spec.points.filter((p) => p.k !== "qag").length, jour.points.filter((p) => p.type !== "qag").length, "tous les points sont présentés");
});

test("mesure : taux de faux négatifs et de faux positifs de la liste sur les titres de l'audit (voir docs/AUDIT-PUBLICATIONS.md)", () => {
  const src = readFileSync(join(RACINE, "tests", "audit-publications.test.mjs"), "utf-8");
  const liste = (debut) => { const i = src.indexOf(debut); return eval(src.slice(src.indexOf("[", i), src.indexOf("];", i) + 1)); };
  const aEcarter = [...liste('const doivent = [\n    "Jordan Bardella'), ...liste('const doivent = [\n    "Une enquête'), ...liste('const doivent = ["Mise')];
  const legitimes = [...liste('const legitimes = [\n    "Budget 2027'), ...liste('const legitimes = ["Processus')];
  const fn = aEcarter.filter((t) => !motExclu(t, { groupes: LP.GROUPES_TOUS }));
  const fp = legitimes.filter((t) => motExclu(t, { groupes: LP.GROUPES_TOUS }));
  assert.ok(aEcarter.length >= 50 && legitimes.length >= 12);
  assert.deepStrictEqual(fn, [], `faux négatifs : ${fn.length}/${aEcarter.length}`);
  assert.deepStrictEqual(fp, [], `faux positifs : ${fp.length}/${legitimes.length}`);
});

test("data/actualites.json : la liste unique n'écarte pas davantage de titres de presse qu'avant, hors lycéen nommé(e)", () => {
  const act = JSON.parse(readFileSync(join(RACINE, "data", "actualites.json"), "utf-8"));
  const titres = [...new Set(act.sujets.flatMap((s) => s.articles.map((a) => a.titre)))];
  const ecartes = titres.filter((t) => motExclu(t));
  assert.ok(titres.length > 50);
  assert.ok(ecartes.length / titres.length < 0.5, `part de titres écartés : ${ecartes.length}/${titres.length}`);
  // le mouvement lycéen n'est pas une personne : « mobilisation lycéenne » n'est pas écarté à lui seul
  assert.strictEqual(motExclu("Mobilisation lycéenne : face à la gauche, le gouvernement prend le parti de l'ordre"), null);
});
