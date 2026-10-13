// Tests de scripts/resultats-notice.js : résultats d un sondage lus dans la notice PDF (Harris / M6 et RTL, terrain du 5 au 8 octobre 2026,
// notice n° 2321). Les chaînes ci-dessous sont le TEXTE RÉEL extrait des pages du PDF par pdfjs (pas le PDF). USAGE : node tests/resultats-notice.test.mjs
import assert from "assert";
import { extraireResultats, construireEntrees, fusionnerNotices, regrouperEntrees, entreesDeNotice, dateEnLettres, periodeReserve, normaliserTexte } from "../scripts/resultats-notice.js";

const CANDIDATS = ["Nathalie Arthaud", "Jean-Luc Mélenchon", "Fabien Roussel", "Marine Tondelier", "Raphaël Glucksmann", "François Hollande", "Gabriel Attal", "Édouard Philippe",
  "Bruno Retailleau", "Nicolas Dupont-Aignan", "Marine Le Pen", "Éric Zemmour", "Olivier Faure", "Olivier Faure (homme politique)"];
const lire = (pages) => { const j = []; const r = extraireResultats(pages, { candidats: CANDIDATS, journal: (m) => j.push(m) }); return { r, j }; };

// Pages 33 (récapitulatif 1er tour), 34 (hypothèse Glucksmann/Attal/Philippe), 35 (évolutions), 36 (reports de voix), 37 (hypothèse Glucksmann/Philippe), 51 (récapitulatif 2nd tour), 52 (Mélenchon / Le Pen)
const P33 =   "Récapitulatif – Intentions de vote pour le 1 er tour de l’élection présidentielle de 2027 33 Intentions de vote pour le 1 er tour de l’élection présidentielle Base : Aux inscrits sur les listes électorales, en % des votes exprimés Nathalie Arthaud Jean - Luc Mélenchon Fabien Roussel Marine Tondelier Raphaël Glucksmann François Hollande Gabriel Attal Édouard Philippe Bruno Retailleau Nicolas Dupont - Aignan Marine Le Pen Éric Zemmour Hypothèse Raphaël Glucksmann , Gabriel Attal et Édouard Philippe Hypothèse Raphaël Glucksmann et Édouard Philippe Hypothèse Raphaël Glucksmann et Gabriel Attal Hypothèse François Hollande et Édouard Philippe Hypothèse François Hollande et Gabriel Attal Rappel : Les intentions de vote mesurent un rapport de force à un moment donné . Elles ne peuvent en aucun cas être considérées comme étant prédictives des résultats du scrutin . La marge d’erreur des résultats d’ensemble s’établit, selon le score visé, entre plus ou moins 1 , 4 et 2 , 9 points Non testé Non testé Non testé Non testé Non testé Non testé Non testé Non testé Non testé 1 18 2 2 10 5 13 7 2 35 5 1 18 2 3 10 17 7 2 36 4 1 18 2 3 11 12 10 2 36 5 1 18 3 4 7 17 8 2 36 4 1 19 2 5 7 12 10 2 37 5";
const P34 =   "34 Intention de vote au 1 er tour de l’élection présidentielle Hypothèse Raphaël Glucksmann , Gabriel Attal et Édouard Philippe Rappel : Les intentions de vote mesurent un rapport de force à un moment donné . Elles ne peuvent en aucun cas être considérées comme étant prédictives des résultats du scrutin . La marge d’erreur des résultats d’ensemble s’établit, selon le score visé, entre plus ou moins 1 , 4 et 2 , 9 points 1 18 2 2 10 5 13 7 2 35 5 Nathalie Arthaud Jean-Luc Mélenchon Fabien Roussel Marine Tondelier Raphaël Glucksmann Gabriel Attal Édouard Philippe Bruno Retailleau Nicolas Dupont-Aignan Marine Le Pen Éric Zemmour Intentions de vote pour le 1 er tour de l’élection présidentielle Base : Aux inscrits sur les listes électorales, certains d’aller voter et ayant exprimé une intention de vote, soit 1 285 personnes";
const P35 =   "35 Intention de vote au 1 er tour de l’élection présidentielle – Évolutions Hypothèse Raphaël Glucksmann , Gabriel Attal et Édouard Philippe Intentions de vote pour le 1 er tour de l’élection présidentielle Base : Aux inscrits sur les listes électorales, certains d’aller voter et ayant exprimé une intention de vote, soit 1 285 per son nes 1 1 1 1 1 16 16 16 17 18 2 2 2 2 2 2 3 3 3 2 10 10 9 10 10 8 8 8 5 5 14 14 14 13 13 7 6 7 7 7 1 2 2 2 2 35 35 33 35 35 4 3 5 5 5 7-8 juillet 2026 18-19 août 2026 8-10 septembre 2026 22-24 septembre 2026 5-8 octobre 2026 Nathalie Arthaud Jean-Luc Mélenchon Fabien Roussel Marine Tondelier Raphaël Glucksmann Gabriel Attal Édouard Philippe Bruno Retailleau Nicolas Dupont-Aignan Marine Le Pen Éric Zemmour";
const P36 =   "36 Reports de voix au 1 er tour de l’élection présidentielle Hypothèse Raphaël Glucksmann , Gabriel Attal et Édouard Philippe Intentions de vote pour le 1 er tour de l’élection présidentielle Base : Aux inscrits sur les listes électorales, certains d’aller voter et ayant exprimé une intention de vote, soit 1 285 per son nes Note de lecture : Parmi les électeurs d’Emmanuel Macron au 1 er tour de l’élection présidentielle 2022 exprimant une intention de vote pour l’élection présidentielle 2027 , 39 % auraient l’intention de voter pour Édouard Philippe au 1 er tour dans cette configuration . Vote au 1er tour de l’élection présidentielle 2022 Jean - Luc MÉLENCHON Emmanuel MACRON Marine LE PEN Jean - Luc Mélenchon 83 6 - Raphaël Glucksmann 6 15 1 Gabriel Attal 1 15 - Édouard Philippe 2 39 2 Bruno Retailleau - 11 1 Marine Le Pen 3 11 93";
const P37 =   "37 Intention de vote au 1 er tour de l’élection présidentielle Hypothèse Raphaël Glucksmann et Édouard Philippe 1 18 2 3 10 17 7 2 36 4 Nathalie Arthaud Jean-Luc Mélenchon Fabien Roussel Marine Tondelier Raphaël Glucksmann Édouard Philippe Bruno Retailleau Nicolas Dupont-Aignan Marine Le Pen Éric Zemmour Intentions de vote pour le 1 er tour de l’élection présidentielle Base : Aux inscrits sur les listes électorales, certains d’aller voter et ayant exprimé une intention de vote, soit 1 274 per son nes Rappel : Les intentions de vote mesurent un rapport de force à un moment donné . Elles ne peuvent en aucun cas être considérées comme étant prédictives des résultats du scrutin . La marge d’erreur des résultats d’ensemble s’établit, selon le score visé, entre plus ou moins 1 , 4 et 2 , 9 points";
const P51 =   "Récapitulatif – Intentions de vote pour le 2 nd tour de l’élection présidentielle de 2027 51 Intentions de vote pour le 2 nd tour de l’élection présidentielle Base : Aux inscrits sur les listes électorales, en % des votes exprimés Hypothèse Jean - Luc Mélenchon Hypothèse Édouard Philippe Jean - Luc Mélenchon 33 Édouard Philippe 44 Marine Le Pen 67 56 Rappel : Les intentions de vote mesurent un rapport de force à un moment donné . Elles ne peuvent en aucun cas être considérées comme étant prédictives des résultats du scrutin . La marge d’erreur des résultats d’ensemble s’établit, selon le score visé, entre plus ou moins 2 , 9 et 3 , 1 points";
const P52 =   "52 Intention de vote au 2 nd tour de l’élection présidentielle Hypothèse Marine Le Pen et Jean - Luc Mélenchon Intentions de vote pour le 2 nd tour de l’élection présidentielle Base : Aux inscrits sur les listes électorales, certains d’aller voter et ayant exprimé une intention de vote, soit 1 093 per son nes 33 67 Jean-Luc Mélenchon Marine Le Pen Rappel : Les intentions de vote mesurent un rapport de force à un moment donné . Elles ne peuvent en aucun cas être considérées comme étant prédictives des résultats du scrutin . La marge d’erreur des résultats d’ensemble s’établit, selon le score visé, entre plus ou moins 2 , 9 et 3 , 1 points";

// ---------- Lecture correcte (pages Évolutions et Reports de voix ignorées) ----------
{
  const { r, j } = lire([P34, P35, P36, P37, P52]);
  assert.ok(r, `extraction attendue : ${j.join(" | ")}`);
  assert.strictEqual(r.hypotheses1T.length, 2);
  assert.strictEqual(r.hypotheses1T[0].label, "Raphaël Glucksmann, Gabriel Attal et Édouard Philippe");
  assert.deepStrictEqual(r.hypotheses1T[0].scores, {
    "Nathalie Arthaud": 1, "Jean-Luc Mélenchon": 18, "Fabien Roussel": 2, "Marine Tondelier": 2, "Raphaël Glucksmann": 10, "Gabriel Attal": 5,
    "Édouard Philippe": 13, "Bruno Retailleau": 7, "Nicolas Dupont-Aignan": 2, "Marine Le Pen": 35, "Éric Zemmour": 5,
  });
  assert.strictEqual(Object.values(r.hypotheses1T[0].scores).reduce((a, b) => a + b, 0), 100);
  assert.strictEqual(r.hypotheses1T[1].label, "Raphaël Glucksmann et Édouard Philippe");
  assert.deepStrictEqual(Object.values(r.hypotheses1T[1].scores), [1, 18, 2, 3, 10, 17, 7, 2, 36, 4]);
  assert.ok(!("Gabriel Attal" in r.hypotheses1T[1].scores), "Attal n'est pas testé dans cette hypothèse");
  assert.strictEqual(r.hypotheses2T.length, 1);
  assert.deepStrictEqual(r.hypotheses2T[0].candidats, ["Jean-Luc Mélenchon", "Marine Le Pen"]);
  assert.deepStrictEqual(r.hypotheses2T[0].scores, { "Jean-Luc Mélenchon": 33, "Marine Le Pen": 67 });
  assert.deepStrictEqual(j, []);
}
// Les pages « Évolutions » et « Reports de voix » seules ne donnent rien
assert.strictEqual(lire([P35, P36]).r, null);

// ---------- Refus : jamais de chiffre douteux ----------
const refus = (pages, motif) => { const { r, j } = lire(pages); assert.strictEqual(r, null, motif); assert.ok(j.length === 1 && /refusés/.test(j[0]), `raison attendue au journal : ${j}`); return j[0]; };
// somme ≠ 100 (35 -> 45 pour Marine Le Pen : total 110)
assert.match(refus([P34.replace("2 35 5 Nathalie", "2 45 5 Nathalie"), P52], "somme 110"), /somme des scores = 110/);
// somme à 98 acceptée (arrondis), 97 refusée
assert.ok(lire([P34.replace("2 35 5 Nathalie", "2 33 5 Nathalie"), P52]).r, "somme 98 acceptée");
assert.match(refus([P34.replace("2 35 5 Nathalie", "2 32 5 Nathalie"), P52], "somme 97"), /somme des scores = 97/);
// nombre de nombres ≠ nombre de noms (un nombre en moins, un nombre en plus)
assert.match(refus([P34.replace("1 18 2 2 10 5 13 7 2 35 5 Nathalie", "18 2 2 10 5 13 7 2 35 5 Nathalie"), P52], "10 nombres"), /10 nombre\(s\) pour 11 nom\(s\)/);
assert.match(refus([P34.replace("1 18 2 2 10 5 13 7 2 35 5 Nathalie", "1 18 2 2 10 5 13 7 2 35 5 4 Nathalie"), P52], "12 nombres"), /12 nombre\(s\) pour 11 nom\(s\)/);
// candidat inconnu dans la liste des noms
assert.match(refus([P34.replace("Éric Zemmour Intentions", "Jean Inconnu Intentions"), P52], "nom inconnu"), /nom de candidat inconnu|nombre\(s\)/);
// second tour : somme ≠ 100, nombre ≠ noms
assert.match(refus([P34, P52.replace("33 67 Jean", "33 68 Jean")], "2T 101"), /somme des scores = 101 \(attendu 100\)/);
assert.match(refus([P34, P52.replace("33 67 Jean", "33 Jean")], "2T un seul nombre"), /1 nombre|aucune suite/);
// intitulé d'hypothèse incohérent avec la liste (Attal annoncé mais absent des résultats)
assert.match(refus([P37.replace("Hypothèse Raphaël Glucksmann et Édouard Philippe", "Hypothèse Raphaël Glucksmann et Gabriel Attal"), P52], "intitulé"), /absent de la liste/);
// complétude : le récapitulatif annonce 5 hypothèses au 1er tour, 2 duels au 2nd : 2 hypothèses lues, 1 duel lu -> refus
assert.match(refus([P33, P34, P37, P52], "récapitulatif 1T"), /2 hypothèse\(s\) de premier tour lue\(s\) pour 5 au récapitulatif/);
assert.match(refus([P34, P37, P51, P52], "récapitulatif 2T"), /1 duel\(s\) de second tour lu\(s\) pour 2 au récapitulatif/);
// entrées inutilisables
assert.strictEqual(extraireResultats([], { candidats: CANDIDATS }), null);
assert.strictEqual(extraireResultats([P34], { candidats: [] }), null);
assert.strictEqual(extraireResultats(null, { candidats: CANDIDATS }), null);

// ---------- Normalisation du texte extrait ----------
assert.strictEqual(normaliserTexte("Intention au 1 er tour Jean - Luc  Mélenchon Dupont - Aignan 1 , 4"), "Intention au 1er tour Jean-Luc Mélenchon Dupont-Aignan 1, 4");
// « Dupont - Aignan » est ramené au nom du site
{
  const { r } = lire([P34.replace("Nicolas Dupont-Aignan", "Nicolas Dupont - Aignan"), P52]);
  assert.ok("Nicolas Dupont-Aignan" in r.hypotheses1T[0].scores);
}

// ---------- Dates en lettres ----------
assert.strictEqual(dateEnLettres("2026-10-05", "2026-10-08"), "5-8 octobre 2026");
assert.strictEqual(dateEnLettres("2026-08-29", "2026-09-01"), "29 août-1er septembre 2026");
assert.strictEqual(dateEnLettres("2026-10-08", "2026-10-08"), "8 octobre 2026");
assert.strictEqual(dateEnLettres("2026-12-30", "2027-01-02"), "30 décembre 2026-2 janvier 2027");

// ---------- Entrées au format de data/sondages.json et fusion ----------
const enquete = { institut: "Harris", terrain: { debut: "2026-10-05", fin: "2026-10-08" }, echantillon: 2004, url: "https://www.commission-des-sondages.fr/notices/files/notices/2026/octobre/10305-pres-iv-toluna-harris-interactive-12-octobre.pdf" };
const lu = lire([P34, P37, P52]).r;
const construit = construireEntrees(enquete, lu);
const entrees = regrouperEntrees([construit]);
assert.deepStrictEqual(Object.keys(construit.institut), ["nom", "date", "dateFin", "echantillon", "hypotheses", "url", "origine", "scores"]);
assert.strictEqual(construit.institut.origine, "notice");
assert.strictEqual(construit.institut.date, "5-8 octobre 2026");
assert.strictEqual(construit.institut.hypotheses, 2);
assert.deepStrictEqual(construit.institut.scores["Édouard Philippe"], [13, 17]); // fourchette min-max sur les hypothèses où il est testé
assert.deepStrictEqual(construit.institut.scores["Marine Le Pen"], [35, 36]);
assert.deepStrictEqual(construit.institut.scores["Gabriel Attal"], [5, 5]);
assert.strictEqual(construit.duels.length, 1);
assert.deepStrictEqual(construit.duels[0].entree.scores, { "Jean-Luc Mélenchon": 33, "Marine Le Pen": 67 });

const wiki = () => ({
  candidats: Object.fromEntries(CANDIDATS.map((c) => [c, null])),
  instituts: [{ nom: "Ifop", date: "25-29 septembre 2026", dateFin: "2026-09-29", echantillon: 1527, hypotheses: 3, url: "https://x/ifop.pdf", scores: { "Marine Le Pen": [31, 36] } },
    { nom: "Harris", date: "22-24 septembre 2026", dateFin: "2026-09-24", echantillon: 1974, hypotheses: 5, url: "https://x/harris-sept.pdf", scores: { "Marine Le Pen": [35, 36] } }],
  historique: [{ institut: "Harris", dateFin: "2026-09-24", echantillon: 1974, scores: { "Marine Le Pen": [35, 36] } }, { institut: "Ifop", dateFin: "2026-09-29", echantillon: 1527, scores: { "Marine Le Pen": [31, 36] } }],
  secondTour: [{ candidats: ["Jean-Luc Mélenchon", "Marine Le Pen"], instituts: [{ nom: "Harris", date: "22-24 septembre 2026", dateFin: "2026-09-24", echantillon: 1974, url: "https://x/harris-sept.pdf", scores: { "Jean-Luc Mélenchon": 31, "Marine Le Pen": 69 } }] }],
});
// Wikipédia n'a pas l'enquête : l'entrée de la notice remplace la plus ancienne du même institut, en tête, avec son historique et ses duels
{
  const { sondages: s, ajoutees } = fusionnerNotices(wiki(), entrees);
  assert.strictEqual(ajoutees.length, 2);
  assert.deepStrictEqual(s.instituts.map((i) => `${i.nom} ${i.dateFin}`), ["Harris 2026-10-08", "Ifop 2026-09-29"]);
  assert.strictEqual(s.instituts[0].origine, "notice");
  assert.deepStrictEqual(s.historique.map((h) => `${h.institut} ${h.dateFin}`), ["Harris 2026-09-24", "Ifop 2026-09-29", "Harris 2026-10-08"]);
  assert.deepStrictEqual(s.secondTour[0].instituts.map((i) => i.dateFin), ["2026-10-08"]); // une enquête par institut et par duel : la plus récente
  // candidats du duel triés comme dans fetch-sondages.js
  assert.deepStrictEqual(s.secondTour.map((d) => d.candidats.join(" / ")).sort(), ["Jean-Luc Mélenchon / Marine Le Pen"]);
  // idempotent : une seconde fusion ne change rien ; la base d'origine n'est pas modifiée
  assert.deepStrictEqual(fusionnerNotices(s, entrees).sondages, s);
  assert.strictEqual(wiki().instituts[1].dateFin, "2026-09-24");
  // fetch-sondages.js reconstruit le fichier depuis Wikipédia puis réinjecte les entrées « notice » : même résultat
  const conservees = entreesDeNotice(s);
  assert.strictEqual(conservees.instituts.length, 1);
  assert.deepStrictEqual(fusionnerNotices(wiki(), conservees).sondages.instituts, s.instituts);
}
// Wikipédia a la même enquête (même institut, même fin de terrain) : Wikipédia prime, la notice est ignorée
{
  const base = wiki();
  base.instituts[1] = { nom: "Harris", date: "5-8 octobre", dateFin: "2026-10-08", echantillon: 2004, hypotheses: 5, url: "https://x/harris-oct.pdf", scores: { "Marine Le Pen": [35, 37] } };
  base.secondTour[0].instituts[0].dateFin = "2026-10-08";
  const { sondages: s } = fusionnerNotices(base, entrees);
  assert.ok(s.instituts.every((i) => !i.origine), "aucune entrée de notice quand Wikipédia a l'enquête");
  assert.strictEqual(s.instituts.find((i) => i.nom === "Harris").url, "https://x/harris-oct.pdf");
  assert.ok(s.secondTour.every((d) => d.instituts.every((i) => !i.origine)));
}
// Wikipédia a une enquête plus récente du même institut : la notice plus ancienne n'est pas mise en avant
{
  const base = wiki();
  base.instituts[1].dateFin = "2026-10-20";
  const { sondages: s } = fusionnerNotices(base, entrees);
  assert.ok(!s.instituts.some((i) => i.origine === "notice"));
}

// ---------- Réserve électorale (1er tour : 18 avril 2027) ----------
assert.strictEqual(periodeReserve(new Date("2027-04-17T10:00:00Z")), "2027-04-18");
assert.strictEqual(periodeReserve(new Date("2027-04-18T17:00:00Z")), "2027-04-18"); // dimanche 19 h Paris
assert.strictEqual(periodeReserve(new Date("2027-04-18T19:00:00Z")), null); // dimanche 21 h Paris
assert.strictEqual(periodeReserve(new Date("2026-10-12T10:00:00Z")), null);

console.log("resultats-notice : tous les tests passent.");
