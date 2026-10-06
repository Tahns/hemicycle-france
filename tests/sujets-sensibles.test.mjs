// Tests de scripts/sujets-sensibles.cjs : classement niveau 1 / niveau 2, textes prudents, liens de médias. USAGE : node tests/sujets-sensibles.test.mjs
import assert from "assert";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const SS = require("../scripts/sujets-sensibles.cjs");
const { motExclu } = require("../scripts/stories-auto.cjs");

const art = (titre, media) => ({ titre, media, url: `https://www.example.org/${encodeURIComponent(media)}/${encodeURIComponent(titre).slice(0, 20)}`, date: "2026-10-06T09:00:00Z" });
const DUPONT = { nom: "Jean Dupont" };
const sujet = (articles, illustration = {}) => ({ derniere: "2026-10-06T09:30:00Z", illustration: { theme: "politique", personnes: [DUPONT], ...illustration }, articles });
const classer = (s, opts = {}) => SS.classerSujet(s, { motExclu, ...opts });
const texte = (f) => [f.titre, f.pied, f.alt, f.mention].join(" ");

// --- NIVEAU 1 : une juridiction ET une décision, citées par au moins 2 médias ---
{
  const s = sujet([art("Le tribunal correctionnel de Paris condamne l'ancien ministre Jean Dupont", "Le Monde"), art("Jean Dupont condamné par le tribunal correctionnel de Paris, ministre déchu", "franceinfo")], { theme: "justice" });
  const c = classer(s);
  assert.strictEqual(c.niveau, 1);
  assert.strictEqual(c.nature, "condamnation");
  assert.strictEqual(c.juridiction, "le tribunal correctionnel de Paris");
  assert.deepStrictEqual(c.medias, ["Le Monde", "franceinfo"]);
  const f = SS.ficheNiveau1(c, "2026-10-06T09:30:00Z");
  assert.match(f.titre, /^Selon Le Monde et franceinfo : le tribunal correctionnel de Paris a prononcé une condamnation$/);
  assert.match(f.pied, /6 octobre 2026/, "date des articles en pied");
  assert.match(f.pied, /Sources : Le Monde, franceinfo/, "sources en pied");
  assert.match(f.pied, /présumée innocente/, "présomption d'innocence dès qu'une procédure pénale est en jeu");
  // aucun nom de personne, aucun verbe qui accuse, jamais « coupable »
  assert.ok(!/dupont/i.test(texte(f)), "aucun nom dans le texte");
  assert.ok(!/coupable/i.test(texte(f)));
  assert.deepStrictEqual(SS.formulationSure(texte(f), { juridiction: c.juridiction }), { ok: true, problemes: [] });
  assert.ok(!f.citation, "niveau 1 : aucun titre de presse cité");
  // sujet synthétique pour le dessin : aucune personnalité, pas de citation
  const synth = SS.sujetPourDessin(f, { articles: c.articles, date: "2026-10-06T09:30:00Z", theme: "justice" });
  assert.deepStrictEqual(synth.illustration.personnes, [], "aucun portrait à côté d'un fait judiciaire");
  assert.strictEqual(synth.sensible.sansCitation, true);
  assert.ok(synth.articles.every((a) => a.titre === f.titre), "les titres de presse ne sont jamais dessinés au niveau 1");
}
// Décision d'une juridiction non pénale : pas de mention pénale, jamais un nom
{
  const s = sujet([art("Le Conseil constitutionnel censure plusieurs articles de la loi sur le budget", "Le Monde"), art("Budget : le Conseil constitutionnel censure une partie du texte", "Libération"), art("Loi de finances : le Conseil constitutionnel valide l'essentiel", "Le Figaro")], { theme: "justice", personnes: [] });
  const c = classer(s);
  assert.strictEqual(c.niveau, 1);
  assert.strictEqual(c.penal, false);
  assert.strictEqual(c.juridiction, "le Conseil constitutionnel");
  const f = SS.ficheNiveau1(c, s.derniere);
  assert.match(f.titre, /^Selon Le Monde et 2 autres médias : le Conseil constitutionnel a rendu une décision$/);
  assert.ok(!/innocente/.test(f.pied), "pas de mention pénale pour une décision de norme");
}
// Ouverture d'une enquête ANNONCÉE PAR LE PARQUET (2 médias) : niveau 1 ; sans parquet, jamais
{
  const parquet = sujet([art("Le parquet de Nanterre ouvre une enquête visant un élu des Hauts-de-Seine", "Le Monde"), art("Hauts-de-Seine : le parquet de Nanterre ouvre une enquête sur un maire", "franceinfo")]);
  const c = classer(parquet);
  assert.strictEqual(c.niveau, 1);
  assert.strictEqual(c.nature, "enquete");
  const f = SS.ficheNiveau1(c, parquet.derniere);
  assert.match(f.titre, /le parquet de Nanterre a annoncé l'ouverture d'une enquête$/);
  assert.match(f.pied, /présumée innocente/);
  const ministre = sujet([art("Le ministre annonce l'ouverture d'une enquête visant un maire", "Le Monde"), art("Un maire visé : le ministre ouvre une enquête", "franceinfo")]);
  assert.strictEqual(classer(ministre).niveau, 2, "une enquête annoncée par un ministre n'est pas un fait judiciaire établi");
}
// Un seul média qui cite la décision : niveau 2 (brouillon), jamais niveau 1
{
  const s = sujet([art("Le tribunal correctionnel de Lyon condamne le maire de la ville", "Le Monde"), art("Lyon : le maire au cœur d'une affaire", "Le Progrès")]);
  assert.strictEqual(classer(s).niveau, 2);
  assert.strictEqual(classer(s, { minMedias: 2 }).niveau, 2);
  assert.strictEqual(classer(sujet([art("Le tribunal correctionnel de Lyon condamne le maire de la ville", "Le Monde"), art("Le tribunal de Lyon rend sa décision contre le maire, jugement rendu", "Le Progrès")])).niveau, 1, "deux médias qui citent juridiction et décision : niveau 1");
}
// Annoncée, attendue, requise, conditionnelle : pas une décision
for (const t of ["Le parquet requiert deux ans de prison contre le maire", "Le tribunal correctionnel de Paris rendra sa décision en novembre sur le maire", "Le tribunal correctionnel de Paris pourrait condamner le maire", "Le tribunal correctionnel de Paris serait sur le point de condamner le maire", "Le maire sera jugé par le tribunal correctionnel de Paris en décembre"]) {
  const s = sujet([art(t, "Le Monde"), art(t + " (suite)", "franceinfo")]);
  assert.strictEqual(classer(s).niveau, 2, `pas de niveau 1 pour : ${t}`);
}
// Accusation, plainte, polémique, révélation d'un seul média : niveau 2, avec la réponse si le titre la cite
{
  const s = sujet([art("Mediapart accuse le ministre Jean Dupont de frais indus, qui dément", "Mediapart")]);
  const c = classer(s);
  assert.strictEqual(c.niveau, 2);
  assert.strictEqual(c.categorie, "faits");
  assert.strictEqual(c.reponseCitee, true);
  const f = SS.ficheNiveau2({ medias: c.medias, categorie: c.categorie, titreCite: c.citee.titre, reponseCitee: c.reponseCitee, date: s.derniere });
  assert.strictEqual(f.titre, "Selon Mediapart : des faits non établis à ce stade");
  assert.match(f.pied, /présumée innocente/);
  assert.match(f.pied, /réponse figure dans la citation/);
  assert.ok(!/dupont/i.test([f.titre, f.pied, f.mention].join(" ")), "le texte écrit par le site ne nomme personne (le nom n'apparaît que dans la citation du média)");
  assert.strictEqual(f.citation, c.citee.titre, "titre du média cité tel quel");
  assert.ok(SS.formulationSure([f.titre, f.pied, f.mention].join(" ")).ok);
  assert.ok(/présumé/.test(f.alt));
  const poly = classer(sujet([art("Polémique : le député Jean Dupont tacle le gouvernement sur le budget", "Le Figaro")]));
  assert.strictEqual(poly.niveau, 2);
  assert.strictEqual(poly.categorie, "polemique");
  assert.strictEqual(SS.ficheNiveau2({ medias: ["Le Figaro"], categorie: "polemique", titreCite: "x".repeat(20), date: s.derniere }).titre, "Selon Le Figaro : une polémique en cours");
}
// Sujet ordinaire : null (le circuit habituel s'en charge)
assert.strictEqual(classer(sujet([art("Le gouvernement présente son projet de budget pour 2027", "Le Monde")])), null);
// Hors cadre : mineurs, violences sexuelles, suicide, faits divers, décès ; hors vie politique française
for (const t of ["Un mineur mis en examen : le tribunal pour enfants du ministre", "Le maire condamné pour agression sexuelle par le tribunal correctionnel", "Mort d'un adolescent : le député demande une enquête", "Le tribunal correctionnel condamne l'auteur d'un meurtre à Marseille, le maire réagit", "Un lycéen de 15 ans accuse le ministre"]) {
  const r = classer(sujet([art(t, "Le Monde"), art(t, "franceinfo")]));
  assert.ok(r.refus, `jamais publié : ${t}`);
}
assert.ok(classer(sujet([art("Brésil : le tribunal suprême condamne l'ancien président Bolsonaro", "Le Monde"), art("Brésil : Bolsonaro condamné par la cour suprême", "RFI")], { personnes: [] })).refus, "sujet étranger écarté");

// --- Formulation sûre ---
for (const t of ["Jean Dupont est coupable", "Le ministre a détourné des fonds", "Selon Le Monde, Dupont serait un escroc", "Le député, mis en examen, accuse la presse", "Une procédure en cours contre le maire", "Scandale : le maire corrompu"]) {
  assert.strictEqual(SS.formulationSure(t).ok, false, `refusé : ${t}`);
}
assert.strictEqual(SS.formulationSure("Une procédure en cours devant le tribunal judiciaire de Paris").ok, true, "« procédure en cours » avec une juridiction");
assert.strictEqual(SS.formulationSure("Selon Le Monde : le tribunal administratif de Lyon a rendu une décision").ok, true);
assert.strictEqual(SS.formulationSure("Selon Mediapart : des faits non établis à ce stade. Toute personne citée est présumée innocente.").ok, true);

// --- Juridictions et lieux ---
assert.strictEqual(SS.juridictionDuTitre("La cour d'appel d'Aix-en-Provence confirme la décision").nom, "la cour d'appel d'Aix-en-Provence");
assert.strictEqual(SS.juridictionDuTitre("Le tribunal administratif de Montreuil annule l'arrêté").nom, "le tribunal administratif de Montreuil");
assert.strictEqual(SS.juridictionDuTitre("Le Conseil d'État rejette le recours").nom, "le Conseil d'État");
assert.strictEqual(SS.juridictionDuTitre("Le gouvernement annonce une réforme"), null);

// --- Liens de médias : liste fermée ---
const medias = SS.lireMedias();
assert.ok(medias.length >= 20 && medias.some((m) => m.nom === "Mediapart"));
assert.strictEqual(SS.mediaDeLien("https://www.mediapart.fr/journal/france/061026/un-article", medias).nom, "Mediapart");
assert.strictEqual(SS.mediaDeLien("https://abonnes.mediapart.fr/x", medias).nom, "Mediapart", "sous-domaine d'un média connu");
for (const mauvais of ["http://www.mediapart.fr/x", "https://mediapart.fr.evil.example/x", "https://evil.example/www.mediapart.fr", "https://www.example.org/article", "https://user:mdp@www.lemonde.fr/x", "https://www.lemonde.fr:8443/x", "javascript:alert(1)", "", "pas un lien", "https://notmediapart.fr/x"]) {
  assert.strictEqual(SS.mediaDeLien(mauvais, medias), null, `refusé : ${mauvais}`);
}
// identifiant de demande : stable, 12 hexadécimaux
assert.match(SS.idDemande("https://www.lemonde.fr/x"), /^[0-9a-f]{12}$/);
assert.strictEqual(SS.idDemande("https://www.lemonde.fr/x#a"), SS.idDemande("https://www.lemonde.fr/x"));

console.log("sujets-sensibles : tous les tests passent.");
