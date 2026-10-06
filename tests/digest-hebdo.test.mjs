// Tests du résumé hebdomadaire (scripts/digest-hebdo.js) : semaines ISO, contenu tiré des données seules, réserve électorale, rendu. Aucun réseau.
// USAGE : node --test tests/digest-hebdo.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { semaineISO, semaineDepuisId, periodeReserve, construireDigest, pageDigest, emailDigest, fluxDigest, pageArchive } from "../scripts/digest-hebdo.js";
import { controlerDigest, controlerPageDigest, controlerAtom } from "../scripts/controles-digest.js";

const semaine = semaineISO("2026-10-07"); // semaine 41 : lundi 5 au dimanche 11 octobre 2026

const scrutin = (numero, dateISO, typeVote, resultat, g, extra = {}) => ({
  numero, titre: `l'amendement n° ${numero} de M. Test (première lecture).`, date: `${Number(dateISO.slice(8))} octobre 2026`, dateISO, typeVote, resultat,
  sourceUrl: `https://www.assemblee-nationale.fr/dyn/17/scrutins/${numero}`, votes: { RN: g, LFI: [0, 0, 0, 70] }, ...extra,
});
const lois = [
  scrutin(9005, "2026-10-12", "SPO", "adopte", [10, 0, 0, 100]), // semaine suivante : exclu
  scrutin(9004, "2026-10-09", "SPS", "adopte", [200, 50, 3, 300], { titre: "l'ensemble du projet de loi relatif à la protection de l'enfance.", dossierRef: "DLR1", dossierTitre: "Protéger l'enfance", dossierUrl: "https://www.assemblee-nationale.fr/dyn/17/dossiers/DLR1" }),
  scrutin(9003, "2026-10-08", "MOC", "rejete", [100, 180, 0, 300], { titre: "la motion de censure.", dossierRef: undefined }),
  scrutin(9002, "2026-10-07", "SPO", "rejete", [100, 101, 0, 200], { dossierRef: "DLR1", dossierTitre: "Protéger l'enfance" }), // écart 1
  scrutin(9001, "2026-10-06", "SPO", "adopte", [90, 90, 0, 200]),                                                       // écart 0
  scrutin(8999, "2026-10-06", "SPO", "adopte", [3, 1, 0, 100]),                                                          // trop peu de votants
  scrutin(8000, "2026-09-30", "SPS", "adopte", [10, 1, 0, 100]),                                                          // semaine précédente : exclu
];
lois.forEach((l) => { for (const g of Object.keys(l.votes)) { const [pour, contre, abst, membres] = l.votes[g]; l.votes[g] = { pour, contre, abst, membres }; } });
const donnees = {
  lois,
  sondages: { instituts: [
    { nom: "Odoxa", dateFin: "2026-03-26", echantillon: 1000, scores: { "A B": [10, 12] } },
    { nom: "Ifop", dateFin: "2026-09-29", echantillon: 1597, url: "https://www.commission-des-sondages.fr/notices/ifop.pdf", scores: { "Candidate X": [31, 36], "Candidat Y": [15, 24], "Candidat Z": [7, 17], "Candidat W": [14, 14], "Candidat V": [1, 2] } },
  ] },
  meetings: { meetings: [
    { debut: "2026-10-16", fin: "2026-10-17", titre: "Primaire : second tour", lieu: "En ligne", source: { nom: "LCP", url: "https://lcp.fr/x" }, verified: true },
    { debut: "2026-10-14", titre: "Rendez-vous non vérifié", lieu: "Paris", verified: false },
    { debut: "2026-12-14", titre: "Trop lointain", lieu: "Paris" },
    { debut: "2026-10-01", titre: "Passé", lieu: "Paris" },
  ] },
  agenda: { sourceUrl: "https://www2.assemblee-nationale.fr/agendas/les-agendas", jours: [
    { date: "2026-10-12", points: [{ type: "qag", objet: "Questions au Gouvernement" }, { type: "texte", objet: "Projet de loi de finances pour 2027" }] },
    { date: "2026-10-09", points: [{ type: "texte", objet: "Déjà passé" }] },
    { date: "2026-10-30", points: [{ type: "texte", objet: "Trop lointain" }] },
  ] },
  actualites: { dossiers: [
    { id: "lycees", titre: "Blocus des lycées", motifs: ["lycéenne", "mobilisation"], medias: ["A", "B", "C"], nb: 9, derniere: "2026-10-08T10:00:00.000Z", articles: [
      { media: "A", titre: "Mobilisation lycéenne : les cours suspendus", url: "https://a.example/1" },
      { media: "A", titre: "Mobilisation lycéenne : deuxième article du même média", url: "https://a.example/2" },
      { media: "B", titre: "La colère lycéenne gagne les villes", url: "https://b.example/1" },
      { media: "C", titre: "Un sujet sans rapport avec les mots-clés", url: "https://c.example/1" },
    ] },
    { id: "mardi", titre: "Mardi", motifs: ["mardi"], medias: ["A", "B"], nb: 5, derniere: "2026-10-08T10:00:00.000Z", articles: [{ media: "A", titre: "Mardi", url: "https://a.example/3" }, { media: "B", titre: "Mardi", url: "https://b.example/3" }] },
    { id: "ancien", titre: "Ancien sujet", motifs: ["ancien"], medias: ["A", "B"], nb: 5, derniere: "2026-09-20T10:00:00.000Z", articles: [{ media: "A", titre: "ancien", url: "https://a.example/4" }, { media: "B", titre: "ancien", url: "https://b.example/4" }] },
  ] },
};
const construire = (opts = {}) => construireDigest(donnees, { semaine, pageVote: (n) => n === 9004, ...opts });

test("semaine ISO : lundi-dimanche, passage d'année, identifiant", () => {
  assert.deepEqual(semaineISO("2026-10-11"), { id: "2026-W41", annee: 2026, semaine: 41, debut: "2026-10-05", fin: "2026-10-11" });
  assert.equal(semaineISO("2026-10-12").id, "2026-W42");
  assert.equal(semaineISO("2027-01-01").id, "2026-W53"); // vendredi : appartient à la dernière semaine de 2026
  assert.equal(semaineISO("2026-12-31").id, "2026-W53");
  assert.equal(semaineISO("2025-12-29").id, "2026-W01");
  assert.deepEqual(semaineDepuisId("2026-W41"), semaine);
  assert.equal(semaineDepuisId("2026-W54"), null);
  assert.equal(semaineDepuisId("n'importe quoi"), null);
});

test("digest : seuls les scrutins de la semaine, totaux et textes votés", () => {
  const d = construire();
  assert.equal(d.id, "2026-W41");
  assert.deepEqual(d.scrutins, { total: 5, adoptes: 3, rejetes: 2 });
  assert.deepEqual(d.textes.map((t) => t.numero), [9004, 9003], "ensemble de texte et censure, du plus récent au plus ancien");
  const t = d.textes[0];
  assert.equal(t.titre, "Protéger l'enfance", "titre du dossier plutôt que l'intitulé du scrutin");
  assert.deepEqual([t.pour, t.contre, t.abst], [200, 50, 3], "décompte = somme des groupes");
  assert.ok(t.pageUrl.endsWith("/v/9004.html"));
  assert.equal(d.textes[1].pageUrl, null);
  assert.equal(d.textes[1].type, "censure");
});

test("digest : votes les plus serrés (au moins 150 votants), dossiers les plus discutés", () => {
  const d = construire();
  assert.deepEqual(d.serres.map((s) => s.numero), [9001, 9002], "écart 0 puis 1 ; le scrutin à 4 votants est écarté");
  assert.deepEqual(d.dossiers.map((x) => [x.titre, x.scrutins]), [["Protéger l'enfance", 2]]);
});

test("digest : dossiers de presse (mots-clés, un média une fois, jours écartés), dates à venir", () => {
  const d = construire();
  assert.deepEqual(d.actualite.map((a) => a.titre), ["Blocus des lycées"], "« Mardi » (artefact) et les dossiers hors semaine sont écartés");
  assert.deepEqual(d.actualite[0].articles.map((a) => a.media), ["A", "B"], "article hors mots-clés écarté, média cité une seule fois");
  assert.deepEqual(d.aVenir.seances.map((j) => j.date), ["2026-10-12"]);
  assert.deepEqual(d.aVenir.rendezVous.map((r) => r.titre), ["Primaire : second tour"], "non vérifié, passé et trop lointain écartés");
});

test("digest : dernier sondage par date de fin, tête de liste par fourchette haute", () => {
  const d = construire();
  assert.equal(d.sondage.institut, "Ifop");
  assert.equal(d.sondage.tetes.length, 4);
  assert.equal(d.sondage.tetes[0].nom, "Candidate X");
  assert.ok(d.sources.some((s) => /commission-des-sondages/.test(s.url)), "la notice du sondage est citée");
});

test("réserve électorale : aucun sondage la veille et le jour du tour", () => {
  assert.equal(periodeReserve(new Date("2027-04-17T10:00:00Z")), "2027-04-18");
  assert.equal(periodeReserve(new Date("2027-04-18T17:00:00Z")), "2027-04-18"); // 19 h à Paris : encore sous réserve
  assert.equal(periodeReserve(new Date("2027-04-18T19:00:00Z")), null, "21 h à Paris : la réserve est levée à 20 h");
  assert.equal(periodeReserve(new Date("2027-04-16T10:00:00Z")), null);
  const d = construire({ semaine: semaineISO("2027-04-14"), maintenant: new Date("2027-04-17T10:00:00Z") });
  assert.equal(d.sondage, null);
  const apres = construire({ semaine: semaineISO("2027-04-14"), maintenant: new Date("2027-04-19T10:00:00Z") });
  assert.ok(apres.sondage);
});

test("semaine sans scrutin (intersession) : résumé valide, texte clair", () => {
  const d = construireDigest({ ...donnees, lois: [] }, { semaine, pageVote: () => false });
  assert.deepEqual(d.scrutins, { total: 0, adoptes: 0, rejetes: 0 });
  assert.deepEqual(controlerDigest(d), []);
  assert.match(pageDigest(d), /Aucun scrutin public/);
});

test("déterminisme : mêmes données, mêmes fichiers (pas de commit inutile)", () => {
  assert.equal(JSON.stringify(construire()), JSON.stringify(construire()));
  assert.equal(pageDigest(construire()), pageDigest(construire()));
});

test("page : sans JavaScript, CSP, Open Graph, sources, échappement HTML, ton sans avis", () => {
  const d = construire();
  d.textes[0].titre = "Texte <script>alert(1)</script> & co";
  const html = pageDigest(d);
  assert.deepEqual(controlerPageDigest("page", html), []);
  assert.ok(!/<script>alert/.test(html) && html.includes("&lt;script&gt;"));
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /default-src 'none'/);
  assert.match(html, /href="\.\.\/\.\.\/pages\.css"/);
  assert.match(html, /assemblee-nationale\.fr\/dyn\/17\/scrutins\/9004/, "fiche officielle citée");
  assert.match(html, /Notice de la Commission des sondages/);
  assert.ok(!/\b(heureusement|malheureusement|scandale|catastrophe|victoire|défaite)\b/i.test(html), "aucun mot d'opinion");
});

test("e-mail : autonome (styles en ligne, ni feuille ni image), liens absolus https", () => {
  const html = emailDigest(construire());
  assert.deepEqual(controlerPageDigest("email", html, { email: true }), []);
  assert.ok(!/href="(?!https:\/\/|mailto:)/.test(html), "tous les liens sont absolus");
  assert.match(html, /style="/);
});

test("flux Atom du résumé et page d'archive : valides, plus récent d'abord", () => {
  const a = construire(), b = construireDigest(donnees, { semaine: semaineISO("2026-09-30") });
  const xml = fluxDigest([b, a]);
  assert.deepEqual(controlerAtom("digest.xml", xml), []);
  assert.ok(xml.indexOf("2026-W41") < xml.indexOf("2026-W40"));
  assert.match(xml, /<updated>2026-10-11T18:00:00Z<\/updated>/);
  assert.match(pageArchive([a, b]), /2026-W41\/"/);
});

test("contrôles : un résumé incohérent est refusé", () => {
  const d = construire();
  assert.deepEqual(controlerDigest(d), []);
  assert.ok(controlerDigest({ ...d, scrutins: { total: 5, adoptes: 1, rejetes: 1 } }).some((m) => /totaux/.test(m)));
  assert.ok(controlerDigest({ ...d, textes: [{ ...d.textes[0], url: "http://x" }] }).some((m) => /source officielle/.test(m)));
  assert.ok(controlerDigest({ ...d, sources: [] }).some((m) => /sources/.test(m)));
  assert.ok(controlerPageDigest("p", "<html><script>x()</script></html>").some((m) => /JavaScript/.test(m)));
});
