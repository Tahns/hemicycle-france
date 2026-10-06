// Tests de scripts/fetch-evenements.js : analyse des dates, déduplication, entrées manuelles préservées,
// disparition en 2 relevés, dates passées. Aucun réseau : réponses de l'API Wikipédia enregistrées dans tests/fixtures/evenements.
// USAGE : node tests/fetch-evenements.test.mjs
import assert from "assert";
import { readFileSync } from "fs";
import { trouverDates, resumeTexte, lireReponseWikipedia, extraireEvenementsPage, evenementsDepuisPage, evenementsDepuisAgendaAN, fusionner, comparer, typeDe, jourMois, releverTout } from "../scripts/fetch-evenements.js";

const AUJ = "2026-10-06";
const fixture = (id) => lireReponseWikipedia(JSON.parse(readFileSync(`tests/fixtures/evenements/${id}.json`, "utf-8")));
const sources = JSON.parse(readFileSync("data/evenements-sources.json", "utf-8"));
const cfg = (id) => sources.pages.find((p) => p.id === id);
const clone = (x) => JSON.parse(JSON.stringify(x));

// ---------- Dates françaises ----------
assert.deepEqual(trouverDates("du 9 au 10 octobre 2026").map((d) => [d.debut, d.fin]), [["2026-10-09", "2026-10-10"]]);
assert.deepEqual(trouverDates("les 24 et 25 octobre 2026").map((d) => [d.debut, d.fin]), [["2026-10-24", "2026-10-25"]]);
assert.deepEqual(trouverDates("les 10 et 24 avril 2022").map((d) => [d.debut, d.fin]), [["2022-04-10", undefined], ["2022-04-24", undefined]], "jours non consécutifs : deux dates");
assert.deepEqual(trouverDates("les 18 avril et 2 mai 2027").map((d) => d.debut), ["2027-04-18", "2027-05-02"]);
assert.deepEqual(trouverDates("le 1er juillet 2026").map((d) => d.debut), ["2026-07-01"]);
assert.deepEqual(trouverDates("du 30 avril au 2 mai 2027").map((d) => [d.debut, d.fin]), [["2027-04-30", "2027-05-02"]], "période à cheval sur deux mois");
assert.deepEqual(trouverDates("le 12 mars, sans année"), [], "date sans année : jamais devinée");
assert.deepEqual(trouverDates("le 31 février 2027"), [], "date inexistante refusée");
assert.deepEqual(jourMois("2026-10-24", "2026-10-25"), { jour: "24-25", mois: "OCT." });
assert.deepEqual(jourMois("2027-05-02"), { jour: "2", mois: "MAI" });

// ---------- Réponse de l'API et wikitexte ----------
assert.equal(lireReponseWikipedia({ query: { pages: [{ title: "X", missing: true }] } }), null, "page absente : null");
assert.throws(() => lireReponseWikipedia({}), /query\.pages/);
const resume = resumeTexte(fixture("presidentielle-2027"));
assert(resume.includes("premier tour est fixé au 18 avril 2027"), resume);
assert(!resume.includes("{{") && !resume.includes("[[") && !resume.includes("<ref") && !resume.includes("exemple.invalid"), "modèles, liens et notes retirés");
assert(!resume.includes("2022"), "seul le résumé (avant le premier intertitre) est lu");

// ---------- Parsing d'un article ----------
const pres = extraireEvenementsPage(fixture("presidentielle-2027"), cfg("presidentielle-2027"), AUJ);
assert.deepEqual(pres.evenements.map((e) => [e.libelle, e.debut]), [["Élection présidentielle : premier tour", "2027-04-18"], ["Élection présidentielle : second tour", "2027-05-02"]]);
const presE = evenementsDepuisPage(fixture("presidentielle-2027"), cfg("presidentielle-2027"), AUJ).evenements;
const prim = extraireEvenementsPage(fixture("primaire-ps"), cfg("primaire-ps"), AUJ);
assert.deepEqual(prim.evenements.map((e) => [e.debut, e.fin]), [["2026-10-09", "2026-10-10"], ["2026-10-16", "2026-10-17"]]);
// Phrase au conditionnel / « selon certaines sources » : rien d'ajouté ; date passée : ignorée
const lr = extraireEvenementsPage(fixture("congres-lr"), cfg("congres-lr"), AUJ);
assert.equal(lr.evenements.length, 0);
assert(lr.ignores.some((i) => /incertaine/.test(i)) && lr.ignores.some((i) => /passée/.test(i)), lr.ignores.join(" | "));
// Deux dates contradictoires dans l'article : case ignorée
const contra = extraireEvenementsPage("Le congrès se tient le 5 décembre 2026. Le congrès a lieu le 12 décembre 2026.", cfg("congres-rn"), AUJ);
assert.equal(contra.evenements.length, 0);
assert(contra.ignores.some((i) => /contradictoires/.test(i)));
// Un seul congrès bien daté
const rn = evenementsDepuisPage("Le congrès se tiendra les 5 et 6 décembre 2026 à Perpignan.", cfg("congres-rn"), AUJ);
assert.equal(rn.evenements.length, 1);
const e = rn.evenements[0];
assert.equal(e.origine, "auto"); assert.equal(e.type, "congres"); assert.equal(e.debut, "2026-12-05"); assert.equal(e.fin, "2026-12-06");
assert.equal(e.jour, "5-6"); assert.equal(e.mois, "DÉC."); assert.equal(e.confirme, true); assert.equal(e.absences, 0);
assert.equal(e.source.url, "https://fr.wikipedia.org/wiki/Congr%C3%A8s_du_Rassemblement_national_de_2026");
assert.equal(e.confiance, "moyenne");

// ---------- Examens de projets de loi (agenda de l'Assemblée) ----------
const agenda = {
  jours: [
    { date: "2026-10-07", points: [{ type: "texte", objet: "Projet de loi proche (déjà visible sur la page)", dossier: "DLR5L17N1" }] },
    { date: "2026-10-21", points: [{ type: "qag", objet: "Questions au Gouvernement" }, { type: "texte", objet: "Projet de loi de financement de la sécurité sociale pour 2027", dossier: "DLR5L17N2" }, { type: "texte", objet: "Proposition de loi sans intérêt ici pour le test", dossier: "DLR5L17N3" }] },
    { date: "2026-10-22", points: [{ type: "texte", objet: "Projet de loi de financement de la sécurité sociale pour 2027", dossier: "DLR5L17N2" }] },
  ],
};
const ex = evenementsDepuisAgendaAN(agenda, AUJ, { horizonJours: 14 });
assert.equal(ex.length, 1, "seul le projet de loi à date lointaine");
assert.equal(ex[0].type, "examen-loi"); assert.equal(ex[0].debut, "2026-10-21"); assert.equal(ex[0].fin, "2026-10-22");
assert.equal(ex[0].cle, "examen-loi|-|DLR5L17N2"); assert.equal(ex[0].confiance, "haute");
assert(ex[0].source.url.endsWith("/DLR5L17N2"));
assert.equal(evenementsDepuisAgendaAN(null, AUJ).length, 0);

// ---------- Fusion : entrée manuelle jamais touchée ----------
const manuelle = { debut: "2026-10-24", fin: "2026-10-25", jour: "24-25", mois: "OCT.", heure: "—", lieu: "Orléans", parti: "RN", partyColor: "#5B4FC9", titre: "XIXᵉ congrès du Rassemblement National", desc: "d", source: { nom: "franceinfo", url: "https://exemple.invalid/x" }, verified: true };
const avant = clone(manuelle);
const f1 = fusionner([manuelle], [...rn.evenements, ...presE], { aujourdhui: AUJ, sourcesLues: new Set(["congres-rn", "presidentielle-2027"]) });
assert.strictEqual(f1.meetings[0], manuelle, "même objet");
assert.deepEqual(manuelle, avant, "entrée manuelle strictement inchangée");
assert.equal(f1.ajoutes.length, 2, "les deux tours ; le congrès du 5 décembre contredit celui du 24 octobre saisi à la main : écarté");
assert.equal(f1.divergences.length, 1);
assert(f1.meetings.every((m, i) => i === 0 || m.origine === "auto"));
// Doublon d'une manuelle (même type, parti et jour) : rien d'ajouté
const dbl = fusionner([manuelle], [{ ...e, type: "congres", parti: "RN", debut: "2026-10-24", fin: "2026-10-25", cle: "congres|RN|unique|2026", titre: "Congrès du Rassemblement national" }], { aujourdhui: AUJ, sourcesLues: new Set(["congres-rn"]) });
assert.equal(dbl.meetings.length, 1); assert.equal(dbl.doublons.length, 1);
// Même événement, autre date que l'entrée manuelle : signalé, rien d'ajouté, manuelle intacte
const div = fusionner([manuelle], [{ ...e, debut: "2026-12-05", fin: "2026-12-06", parti: "RN", titre: "Congrès du Rassemblement national" }], { aujourdhui: AUJ, sourcesLues: new Set(["congres-rn"]) });
assert.equal(div.meetings.length, 1); assert.equal(div.divergences.length, 1, "divergence signalée");
// Les élections déjà saisies à la main ne sont pas dupliquées ; une autre date pour le même tour est une divergence
const election1 = { ...clone(manuelle), debut: "2027-04-18", fin: undefined, parti: "", titre: "Élection présidentielle : premier tour" }; delete election1.fin;
const f2 = fusionner([election1], presE, { aujourdhui: AUJ, sourcesLues: new Set(["presidentielle-2027"]) });
assert.equal(f2.ajoutes.length, 1, "second tour seul ajouté"); assert.equal(f2.doublons.length, 1);
const f3 = fusionner([{ ...election1, debut: "2027-04-11" }], presE, { aujourdhui: AUJ, sourcesLues: new Set(["presidentielle-2027"]) });
assert(f3.divergences.length >= 1 && !f3.meetings.some((m) => m.origine === "auto" && /premier/.test(m.titre)), "divergence : l'entrée manuelle fait foi");
assert.equal(typeDe(manuelle), "congres"); assert.equal(typeDe(election1), "election"); assert.equal(comparer(manuelle, election1), null);

// ---------- Déduplication des relevés ----------
const double = fusionner([], [rn.evenements[0], clone(rn.evenements[0]), { ...clone(rn.evenements[0]), cle: "congres|RN|premier|2026", titre: "Congrès du RN" }], { aujourdhui: AUJ, sourcesLues: new Set(["congres-rn"]) });
assert.equal(double.meetings.length, 1, "même clé, ou même jour/type/parti : une seule entrée");
// Événement non confirmé : jamais ajouté
assert.equal(fusionner([], [{ ...rn.evenements[0], confirme: false }], { aujourdhui: AUJ }).meetings.length, 0);

const autreManuelle = { ...clone(manuelle), parti: "LFI", titre: "Discours de Jean-Luc Mélenchon", debut: "2026-11-02", fin: undefined }; delete autreManuelle.fin;
// ---------- Disparition : retirée après 2 relevés consécutifs seulement ----------
const lues = new Set(["congres-rn"]);
let etat = fusionner([autreManuelle], rn.evenements, { aujourdhui: AUJ, sourcesLues: lues }).meetings;
assert.equal(etat.length, 2);
let r = fusionner(etat, [], { aujourdhui: AUJ, sourcesLues: lues });
assert.equal(r.meetings.length, 2, "1er relevé sans elle : conservée"); assert.equal(r.meetings[1].absences, 1); assert.equal(r.absents.length, 1);
r = fusionner(r.meetings, rn.evenements, { aujourdhui: AUJ, sourcesLues: lues });
assert.equal(r.meetings[1].absences, 0, "réapparue : compteur remis à zéro");
r = fusionner(r.meetings, [], { aujourdhui: AUJ, sourcesLues: lues });
r = fusionner(r.meetings, [], { aujourdhui: AUJ, sourcesLues: lues });
assert.equal(r.meetings.length, 1, "2e relevé consécutif sans elle : retirée"); assert.strictEqual(r.meetings[0], autreManuelle, "la autreManuelle reste");
assert.equal(r.retires.length, 1);
// Source injoignable : rien ne disparaît, rien ne compte comme absence
let s = etat;
for (let i = 0; i < 5; i++) s = fusionner(s, [], { aujourdhui: AUJ, sourcesLues: new Set() }).meetings;
assert.equal(s.length, 2); assert.equal(s[1].absences, 0);
// Une entrée automatique n'est jamais retirée pour une absence si elle a déjà commencé
const encours = { ...etat[1], debut: "2026-10-05", fin: "2026-10-08" };
assert.equal(fusionner([encours], [], { aujourdhui: AUJ, sourcesLues: lues }).meetings.length, 1);
assert.equal(fusionner([{ ...encours, absences: 1 }], [], { aujourdhui: AUJ, sourcesLues: lues }).meetings[0].absences, 1);

// ---------- Mise à jour d'une date qui change à la source ----------
const decale = rn.evenements.map((x) => ({ ...x, debut: "2026-12-12", fin: "2026-12-13", jour: "12-13" }));
r = fusionner(etat, decale, { aujourdhui: AUJ, sourcesLues: lues });
assert.equal(r.meetings[1].debut, "2026-12-12"); assert.equal(r.misAJour.length, 1);

// ---------- Dates passées ----------
const passe = { ...clone(rn.evenements[0]), debut: "2026-09-25", fin: "2026-09-26", cle: "congres|RN|unique|2026p" };
assert.equal(fusionner([], [passe], { aujourdhui: AUJ }).meetings.length, 0, "un événement déjà passé n'est pas ajouté");
assert.equal(fusionner([passe], [], { aujourdhui: AUJ, sourcesLues: lues }).meetings.length, 1, "passé récent : gardé (« Événements récents »)");
assert.equal(fusionner([{ ...passe, debut: "2026-08-01", fin: "2026-08-02" }], [], { aujourdhui: AUJ, sourcesLues: lues }).meetings.length, 0, "passé depuis plus de 30 jours : retiré");
assert.equal(fusionner([autreManuelle], [], { aujourdhui: "2030-01-01", sourcesLues: lues }).meetings.length, 1, "une entrée autreManuelle passée n'est jamais supprimée");

// ---------- Chaîne complète sur les fixtures (sans réseau) ----------
const reel = JSON.parse(readFileSync("data/meetings.json", "utf-8"));
const rel = await releverTout({ sources, agenda, aujourdhui: AUJ, dossierFixtures: "tests/fixtures/evenements" });
assert(rel.sourcesLues.has("presidentielle-2027") && !rel.sourcesLues.has("congres-rn") && rel.echecs === 0, "page introuvable : pas lue, pas un échec");
const fin = fusionner(reel.meetings, rel.releves, { aujourdhui: AUJ, sourcesLues: rel.sourcesLues });
assert.deepEqual(fin.meetings.filter((m) => m.origine !== "auto"), reel.meetings.filter((m) => m.origine !== "auto"), "toutes les entrées manuelles du vrai fichier intactes");
assert.deepEqual(fin.meetings.filter((m) => m.origine === "auto").map((m) => m.type), ["examen-loi"], "présidentielle et primaire déjà saisies à la main : aucun doublon ; seul l'examen de loi (agenda) est nouveau");
const relSansFixture = await releverTout({ sources: { pages: [cfg("primaire-ps")] }, agenda: null, aujourdhui: AUJ, dossierFixtures: "tests/fixtures/absent" });
assert.equal(relSansFixture.echecs, 1, "lecture impossible : comptée comme échec");

console.log("fetch-evenements : tous les tests passent.");
