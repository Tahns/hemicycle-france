// Tests de la règle « accusation ou polémique visant une PERSONNE NOMMÉE » (scripts/personne-nommee.cjs, stories-auto.cjs, publier-stories.cjs) :
// au moins 3 médias distincts, jamais le portrait, sinon refus motivé dans le journal ; la liste prudente (violences, décès, mineurs) reste inchangée.
// USAGE : node tests/personne-nommee.test.mjs
import assert from "assert";
import { readFileSync } from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const PN = require("../scripts/personne-nommee.cjs");
const A = require("../scripts/stories-auto.cjs");
const LP = require("../scripts/liste-prudente.cjs");
const PS = require("../scripts/publier-stories.cjs");

const now = new Date("2026-10-02T13:30:00Z"); // 15 h 30 à Paris
const il_y_a = (h) => new Date(now.getTime() - h * 36e5).toISOString();
const MEDIAS = ["franceinfo", "Le Monde", "Le Figaro", "Libération", "20 Minutes"];
const sujet = (titre, nb, extra = {}) => ({
  medias: nb, mediasDistincts: nb, derniere: il_y_a(1),
  illustration: { theme: "politique", personnes: [], ...(extra.illustration || {}) },
  titrePropre: { titre: "Une affaire concernant un élu", origine: "recoupement" },
  fait: "Un élu est visé par une plainte déposée cette semaine",
  articles: Array.from({ length: Math.max(nb, 1) }, (_, i) => ({ titre: i ? `${titre} (suite ${i})` : titre, url: `https://example.org/${i}/${encodeURIComponent(titre).slice(0, 20)}`, media: MEDIAS[i], date: il_y_a(1) })),
  ...extra,
});
const vide = { entrees: [] };
const choix = (sujets, opts = {}) => A.choisirSujet({ actualites: { sujets }, direct: null, file: vide, now, ...opts });
const DUPONT = { illustration: { theme: "politique", personnes: [{ nom: "Jean Dupont", parti: "XX" }] } };
const TITRE = "Plainte déposée contre le député Jean Dupont pour des propos tenus en séance";

// ---------- Détection ----------
{
  assert.deepStrictEqual(PN.visePersonneNommee(sujet(TITRE, 3, DUPONT)).vise, true, "accusation + personne reconnue par le site");
  const v = PN.visePersonneNommee(sujet("Plainte déposée contre Jean Dupont à Lyon", 3));
  assert.strictEqual(v.vise, true, "accusation + « Prénom Nom » dans le titre, même sans personne reconnue");
  assert.ok(v.noms.includes("Jean Dupont"));
  assert.strictEqual(PN.visePersonneNommee(sujet("Plainte déposée contre un élu local", 3)).vise, false, "accusation sans personne nommée");
  assert.strictEqual(PN.visePersonneNommee(sujet("Jean Dupont présente son projet de budget pour 2027", 3, DUPONT)).vise, false, "personne nommée sans accusation");
  assert.strictEqual(PN.visePersonneNommee(sujet("Le tribunal administratif annule un arrêté de la préfecture de Paris", 3)).vise, false, "une institution n'est pas une personne");
  assert.strictEqual(PN.visePersonneNommee(sujet("Plainte contre l'Assemblée nationale et le Conseil constitutionnel", 3)).vise, false, "institutions : pas de personne");
  assert.deepStrictEqual(PN.nomsDansTitre("Marine Le Pen dénonce une enquête visant Jean-Luc Mélenchon"), ["Marine Le Pen", "Jean-Luc Mélenchon"]);
  // polémique, procédure, propos attribués : même traitement
  for (const t of ["Polémique après les propos de Jean Dupont", "Jean Dupont mis en examen pour détournement de fonds", "Écrits antisémites attribués à Jean Dupont"]) assert.strictEqual(PN.visePersonneNommee(sujet(t, 3)).vise, true, t);
}

// ---------- Seuil : 3 médias distincts, jamais moins, réglable vers le haut ----------
{
  assert.strictEqual(PN.SEUIL_MIN, 3);
  assert.strictEqual(A.normaliserConfig(null).minMediasPersonneNommee, 3);
  assert.strictEqual(A.normaliserConfig({ minMediasPersonneNommee: 2 }).minMediasPersonneNommee, 3, "jamais moins de 3");
  assert.strictEqual(A.normaliserConfig({ minMediasPersonneNommee: 1 }).minMediasPersonneNommee, 3);
  assert.strictEqual(A.normaliserConfig({ minMediasPersonneNommee: 5 }).minMediasPersonneNommee, 5, "relevable");
  assert.strictEqual(A.normaliserConfig({ minMediasPersonneNommee: "4" }).minMediasPersonneNommee, 3, "valeur invalide : 3");
  const livre = JSON.parse(readFileSync("data/stories-config.json", "utf-8"));
  assert.strictEqual(livre.minMediasPersonneNommee, 3);
  assert.ok(/portrait/i.test(livre._commentaire_minMediasPersonneNommee) && /3/.test(livre._commentaire_minMediasPersonneNommee), "clé documentée");
  A.appliquerSeuils(A.normaliserConfig({ minMedias: 2 }));
}

// ---------- Sujet de presse : refus motivé sous 3 médias, portrait jamais ----------
{
  // 2 médias : refusé, raison explicite dans le journal
  const journal = [];
  const r2 = choix([sujet(TITRE, 2, DUPONT)], { journal });
  assert.ok(r2.refus, "2 médias : refusé");
  assert.match(r2.refus, /accusation visant une personne nommée : moins de 3 médias \(présomption d'innocence\)/);
  assert.strictEqual(journal.length, 1);
  assert.match(journal[0], /Plainte déposée contre le député Jean Dupont/);
  assert.match(journal[0], /2 médias distincts sur 3 exigés \(présomption d'innocence\)/, "raison explicite : " + journal[0]);
  assert.match(journal[0], /plainte/, "le terme déclencheur est cité");
  // 3 médias distincts : publiable, mais SANS portrait et en modèle « une » (jamais « direct » ni « face à face »)
  const r3 = choix([sujet(TITRE, 3, DUPONT)]);
  assert.strictEqual(r3.indice, 0, r3.refus);
  assert.strictEqual(r3.sansPortrait, true);
  assert.strictEqual(r3.modele, "une");
  const d = A.decrire(r3, now);
  assert.strictEqual(d.champs.personneNommee, true);
  assert.strictEqual(d.champs.sansPortrait, true);
  assert.strictEqual(d.champs.medias, undefined);
  assert.strictEqual(d.medias.length, 3, "3 médias distincts enregistrés dans l'entrée");
  // l'ordre de dessin reçoit l'instruction « sans portrait » (extras.sansPortrait lu par dessiner())
  const args = A.argsAvecVariante(d.args, null, null, false, r3.sansPortrait);
  assert.deepStrictEqual(args[9], { sansPortrait: true });
  assert.strictEqual(A.argsAvecVariante(d.args, null, null, false, false), d.args, "sujet ordinaire : arguments inchangés");
  assert.ok(/extras\?\.sansPortrait/.test(readFileSync("scripts/stories-auto.cjs", "utf-8")) && /personnes:\s*\[\]/.test(readFileSync("scripts/stories-auto.cjs", "utf-8")), "dessiner() vide les personnes du sujet avant le dessin");
  // un sujet ordinaire (sans accusation) garde ses portraits et le seuil de la configuration (2)
  const ok = choix([sujet("Jean Dupont présente son projet de budget pour 2027 devant les députés", 2, DUPONT)]);
  assert.strictEqual(ok.indice, 0);
  assert.ok(!ok.sansPortrait, "pas d'accusation : portrait autorisé");
  // accusation sans personne nommée : seuil ordinaire (2)
  assert.strictEqual(choix([sujet("Plainte déposée contre un élu local pour des propos tenus en séance", 2)]).indice, 0);
  // une prise de parole du président n'en dispense pas
  const s1 = sujet(TITRE, 1, DUPONT);
  const direct = { evenements: [{ type: "allocution", titre: s1.articles[0].titre }] };
  assert.ok(choix([s1], { direct }).refus, "direct du président, 1 média : refusé (accusation visant une personne)");
  // le seuil se relève par la configuration
  A.appliquerSeuils(A.normaliserConfig({ minMedias: 2, minMediasPersonneNommee: 4 }));
  assert.ok(choix([sujet(TITRE, 3, DUPONT)]).refus, "seuil relevé à 4");
  assert.strictEqual(choix([sujet(TITRE, 4, DUPONT)]).indice, 0);
  A.appliquerSeuils(A.normaliserConfig({ minMedias: 2 }));
  // médias DISTINCTS : trois reprises d'un même média ne comptent qu'une fois
  const memeMedia = sujet(TITRE, 3, { ...DUPONT, mediasDistincts: 1, sources: ["franceinfo"] });
  assert.ok(choix([memeMedia]).refus, "3 articles d'un seul média : pas 3 médias");
}

// ---------- Dossier et « en bref » : mêmes seuils ----------
{
  const dossier = (nb, titre = "Plainte contre Jean Dupont : l'élu répond aux accusations") => ({ id: "affaire-dupont", titre: "Affaire Dupont", nb: 8, medias: MEDIAS.slice(0, nb), mediasDistincts: nb, derniere: il_y_a(1), articles: Array.from({ length: 8 }, (_, i) => ({ titre: `${titre} (épisode ${i})`, url: `https://example.org/d/${i}`, media: MEDIAS[i % nb], date: il_y_a(1) })) });
  A.appliquerSeuils(A.normaliserConfig({ minMedias: 2, dossierMedias: 3 }));
  assert.ok(A.choisirDossier({ actualites: { dossiers: [dossier(3)] }, file: vide, now }), "3 médias distincts : dossier retenu");
  A.appliquerSeuils(A.normaliserConfig({ minMedias: 2, dossierMedias: 3, minMediasPersonneNommee: 5 }));
  const journal = [];
  assert.strictEqual(A.choisirDossier({ actualites: { dossiers: [dossier(4)] }, file: vide, now, journal }), null, "seuil relevé à 5 : refusé");
  assert.match(journal[0] || "", /4 médias distincts sur 5 exigés/);
  A.appliquerSeuils(A.normaliserConfig({ minMedias: 2 }));
}

// ---------- Publieur : dernier filet ----------
{
  const base = { id: "aaaaaaaaaaaa", type: "story", titre: "Plainte déposée contre le député Jean Dupont", titrePropre: "Une affaire concernant un élu" };
  assert.strictEqual(PS.risque({ ...base, personneNommee: true, sansPortrait: true, medias: ["franceinfo", "Le Monde", "Le Figaro"] }), false, "3 médias, sans portrait : publiable");
  assert.strictEqual(PS.risque({ ...base, personneNommee: true, sansPortrait: true, medias: ["franceinfo", "Le Monde"] }), true, "2 médias : jamais");
  assert.strictEqual(PS.risque({ ...base, personneNommee: true, sansPortrait: true, medias: ["Le Monde", "Le Monde", "Le Monde"] }), true, "médias non distincts : jamais");
  assert.strictEqual(PS.risque({ ...base, personneNommee: true, medias: ["franceinfo", "Le Monde", "Le Figaro"] }), true, "dessinée avec portrait : jamais");
  assert.strictEqual(PS.risque({ ...base, medias: ["franceinfo", "Le Monde"] }), false, "entrée ordinaire : règles inchangées");
  const file = { entrees: [{ ...base, personneNommee: true, sansPortrait: true, medias: ["franceinfo", "Le Monde"], cree: "2026-10-02T13:00:00Z", url_image: "https://tahns.github.io/hemicycle-france/instagram/auto/aaaaaaaaaaaa.jpg" }] };
  const r = PS.choisir({ file, registre: vide, config: { maxParJour: 8 }, now });
  assert.ok(!r.entree, "le publieur n'envoie pas une accusation reprise par 2 médias");
}

// ---------- La liste prudente n'a pas changé : violences, décès, mineurs restent écartés ----------
{
  assert.deepStrictEqual(LP.GROUPES_PRESSE_ACTIFS, ["violences", "drame", "mineurs"]);
  for (const t of ["Jean Dupont accusé d'agression sexuelle", "Mort de Jean Dupont à 80 ans", "Un mineur de 16 ans mis en cause dans l'affaire Dupont", "Jean Dupont, lycéenne de 17 ans, victime d'un viol"]) {
    assert.ok(LP.motExclu(t), `toujours écarté : ${t}`);
    assert.ok(choix([sujet(t, 5, DUPONT)]).refus, `jamais publié : ${t}`);
  }
}

console.log("[tests personne-nommee] OK");
