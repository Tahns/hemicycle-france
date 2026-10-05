// Tests de scripts/titres-propres.cjs : titres rédigés par le site, contexte, chiffre, date, vidéos. USAGE : node --test tests/titres-propres.test.mjs
import test from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const { estVideo, titrePropre, contexteSujet, chiffreSujet, dateSujet, enrichirSujet } = createRequire(import.meta.url)("../scripts/titres-propres.cjs");

const art = (media, titre, i = 0) => ({ media, titre, url: `https://example.org/${media.replace(/\W/g, "")}/${i}`, date: "2026-10-05T08:00:00.000Z" });
const sujet = (titres, extra = {}) => ({ medias: new Set(titres.map(([m]) => m)).size, derniere: "2026-10-05T08:00:00.000Z", illustration: { theme: "politique", personnes: [] }, articles: titres.map(([m, t], i) => art(m, t, i)), ...extra });
const maintenant = new Date("2026-10-05T10:00:00Z");

test("estVideo : pages vidéo des médias, YouTube, article normal", () => {
  // BFMTV : les pages vidéo ont un nom d'article qui commence par « video- »
  assert.strictEqual(estVideo("https://www.bfmtv.com/politique/video-colere-lyceenne-les-interventions-sont-proportionnees_VN-202610050123.html"), true);
  assert.strictEqual(estVideo("https://www.bfmtv.com/politique/elections/presidentielle/video-primaire-sociale-democrate-ce-que-dit-guedj_VN-202610050123.html"), true);
  assert.strictEqual(estVideo("https://www.bfmtv.com/politique/colere-lyceenne-ce-qu-il-faut-retenir_AN-202610050123.html"), false, "article normal");
  assert.strictEqual(estVideo("https://www.bfmtv.com/politique/une-video-virale-du-ministre_AN-1.html"), false, "« video » au milieu d'un titre : non");
  assert.strictEqual(estVideo("https://www.bfmtv.com/politique/video/projet-de-loi-casseurs-payeurs_VN-1.html"), true, "segment /video/");
  assert.strictEqual(estVideo("https://www.youtube.com/watch?v=abc123"), true);
  assert.strictEqual(estVideo("https://youtu.be/abc123"), true);
  assert.strictEqual(estVideo("https://www.lemonde.fr/politique/article/2026/10/05/primaire-a-gauche_6100000_823448.html"), false);
  assert.strictEqual(estVideo("pas une adresse"), false);
});

test("titrePropre : le titre du dossier prime", () => {
  const s = sujet([["Le Monde", "Primaire à gauche : débat heurté"], ["Libération", "Primaire de gauche : le dernier débat"], ["BFMTV", "Colère lycéenne"]]);
  const dossiers = [{ id: "primaire", titre: "Primaire de la gauche", articles: [s.articles[0], s.articles[1]] }];
  assert.deepStrictEqual(titrePropre(s, dossiers), { titre: "Primaire de la gauche", origine: "dossier" });
  // un seul article du sujet dans un dossier : pas assez
  assert.strictEqual(titrePropre(s, [{ id: "x", titre: "Autre dossier", articles: [s.articles[2]] }]), null);
});

test("titrePropre : recoupement de plusieurs médias", () => {
  const s = sujet([
    ["franceinfo", "Blocage des lycées en France : le gouvernement appelle à la reprise des cours"],
    ["RFI", "Blocage des lycées : la sécurité au centre des discussions"],
    ["Sud Ouest", "Blocage des lycées dans la région avant un « acte III » mardi"],
  ]);
  assert.deepStrictEqual(titrePropre(s, []), { titre: "Blocage des lycées", origine: "recoupement" });
});

test("titrePropre : le nom d'un texte de loi est gardé", () => {
  const s = sujet([
    ["BFMTV", 'Le projet de loi "casseurs-payeurs" sera examiné au Sénat le 27 octobre'],
    ["BFMTV", 'Projet de loi "casseurs-payeurs": le texte examiné au Sénat fin octobre'],
    ["Le Figaro", "Ce que contient la loi «casseurs payeurs» qui sera examinée au Sénat le 27 octobre"],
  ]);
  const t = titrePropre(s, []);
  assert.strictEqual(t.titre, "Projet de loi « casseurs-payeurs »");
  assert.strictEqual(t.origine, "recoupement");
  assert.ok(!/examin/i.test(t.titre), "pas de « Examiné au Sénat »");
});

test("titrePropre : un seul média, ou un même titre repris partout, donne null", () => {
  assert.strictEqual(titrePropre(sujet([["BFMTV", "Blocage des lycées : le point"], ["BFMTV", "Blocage des lycées : la suite"]]), []), null, "un seul média");
  const t = "Social. Les plus pauvres seraient « les premières victimes » d'une annulation de la dette";
  assert.strictEqual(titrePropre(sujet([["Le Progrès", t], ["Dernières Nouvelles d'Alsace", t], ["Le Dauphiné libéré", t]]), []), null, "même article repris par un groupe de presse");
  assert.strictEqual(titrePropre({ articles: [] }, []), null);
  assert.strictEqual(titrePropre({}, []), null);
});

test("titrePropre : jamais de chiffre, de date, de nom de personne ni de verbe en tête", () => {
  const chiffres = sujet([["franceinfo", "400 lycées fermés ce lundi"], ["RFI", "400 lycées fermés dans toute la France"], ["France 24", "400 lycées fermés, le 5 octobre"]]);
  const t1 = titrePropre(chiffres, []);
  assert.ok(!t1 || !/\d/.test(t1.titre), `pas de chiffre : ${t1?.titre}`);
  const dates = sujet([["franceinfo", "Réunion le 27 octobre au Sénat"], ["RFI", "Réunion le 27 octobre pour le Sénat"]]);
  const t2 = titrePropre(dates, []);
  assert.ok(!t2 || !/\d|octobre/i.test(t2.titre), `pas de date : ${t2?.titre}`);
  const personne = sujet([["Le Monde", "Mélenchon attaque le gouvernement sur les retraites"], ["Le Figaro", "Mélenchon attaque la majorité sur les retraites"], ["franceinfo", "Mélenchon attaque ses rivaux sur les retraites"]],
    { illustration: { theme: "election", personnes: [{ nom: "Jean-Luc Mélenchon" }] } });
  const t3 = titrePropre(personne, []);
  assert.ok(!t3 || !/m[ée]lenchon/i.test(t3.titre), `pas de nom de personne : ${t3?.titre}`);
  const verbe = sujet([["Le Monde", "Texte examiné au Sénat mardi"], ["Le Figaro", "Loi examinée au Sénat mardi"], ["franceinfo", "Réforme examiné au Sénat mardi"]]);
  const t4 = titrePropre(verbe, []);
  assert.ok(!t4 || !/^examin/i.test(t4.titre), `pas de verbe : ${t4?.titre}`);
  const nomPropre = sujet([["Le Monde", "Sébastien Lecornu reçoit les syndicats"], ["Le Figaro", "Sébastien Lecornu reçoit les partenaires sociaux"]]);
  const t5 = titrePropre(nomPropre, []);
  assert.ok(!t5 || !/lecornu/i.test(t5.titre), `pas de nom propre : ${t5?.titre}`);
});

const donnees = {
  gouvernement: { membres: [{ nom: "Sébastien Lecornu", fonction: "Premier ministre" }] },
  dirigeants: { dirigeants: [{ nom: "Olivier Faure", role: "Premier secrétaire du Parti socialiste", source: { nom: "site du Parti socialiste" } }] },
  deputes: { deputes: [{ nom: "Jérôme Guedj", groupe: "SOC", dep: "Essonne" }] },
  sondages: { instituts: [{ nom: "Ifop", date: "25-29 septembre 2026", scores: { "Jean-Luc Mélenchon": [14, 17], "Raphaël Glucksmann": [9, 9] } }] },
  agenda: { jours: [] },
  tours: ["2027-04-18", "2027-05-02"],
};
const election = (extra = {}) => sujet([["Le Monde", "Primaire à gauche : débat"], ["Libération", "Primaire de gauche : débat"]],
  { illustration: { theme: "election", personnes: [{ nom: "Jean-Luc Mélenchon" }, { nom: "Raphaël Glucksmann" }] }, ...extra });

test("contexteSujet : sondage seulement pour le thème election, hors réserve", () => {
  const c = contexteSujet(election(), donnees, maintenant);
  assert.strictEqual(c[0].type, "sondage");
  assert.match(c[0].texte, /Ifop/);
  assert.match(c[0].texte, /Mélenchon 14–17 %/);
  assert.match(c[0].texte, /Glucksmann 9 %/);
  assert.ok(c[0].source);
  // autre thème : aucun sondage
  const autre = election({ illustration: { theme: "gouvernement", personnes: [{ nom: "Jean-Luc Mélenchon" }] } });
  assert.ok(!contexteSujet(autre, donnees, maintenant).some((x) => x.type === "sondage"));
  assert.ok(contexteSujet(election(), donnees, maintenant).length <= 2);
});

test("contexteSujet : réserve électorale, aucun sondage", () => {
  for (const jour of ["2027-04-17T09:00:00Z", "2027-04-18T10:00:00Z", "2027-05-01T12:00:00Z"]) {
    const c = contexteSujet(election(), donnees, new Date(jour));
    assert.ok(!c.some((x) => x.type === "sondage"), `aucun sondage le ${jour}`);
  }
  assert.ok(contexteSujet(election(), donnees, new Date("2027-04-19T10:00:00Z")).some((x) => x.type === "sondage"), "après le 1er tour (réserve levée à 20 h)");
});

test("contexteSujet : fonction d'une personne citée, jamais pour une affaire judiciaire", () => {
  const s = sujet([["Le Monde", "Lecornu réunit les ministres"]], { illustration: { theme: "gouvernement", personnes: [{ nom: "Sébastien Lecornu" }] } });
  const c = contexteSujet(s, donnees, maintenant);
  assert.strictEqual(c[0].texte, "Sébastien Lecornu : premier ministre");
  assert.ok(c[0].source);
  const f = sujet([["Le Monde", "Faure reçoit"]], { illustration: { theme: "politique", personnes: [{ nom: "Olivier Faure" }] } });
  assert.match(contexteSujet(f, donnees, maintenant)[0].texte, /^Olivier Faure : premier secrétaire/);
  const j = sujet([["Le Monde", "Sébastien Lecornu visé par une plainte"]], { illustration: { theme: "gouvernement", personnes: [{ nom: "Sébastien Lecornu" }] } });
  assert.deepStrictEqual(contexteSujet(j, donnees, maintenant), [], "pas de qualification d'une personne mise en cause");
  assert.deepStrictEqual(contexteSujet(sujet([["Le Monde", "x"]]), {}, maintenant), []);
  assert.deepStrictEqual(contexteSujet(s, {}, maintenant), [], "fichiers absents ignorés");
});

test("chiffreSujet : un chiffre repris par au moins 2 médias", () => {
  const s = sujet([["Sud Ouest", "DIRECT. Blocage des lycées : 400 à 500 établissements fermés ce lundi"], ["France 24", "En direct : de 400 à 500 lycées fermés en France"], ["RFI", "Blocage des lycées en France"]]);
  const c = chiffreSujet(s);
  assert.strictEqual(c.valeur, "400 à 500");
  assert.match(c.unite, /établissements|lycées/);
  assert.strictEqual(chiffreSujet(sujet([["Sud Ouest", "400 lycées fermés"], ["Sud Ouest", "400 lycées fermés encore"]])), null, "un seul média");
  assert.strictEqual(chiffreSujet(sujet([["Sud Ouest", "400 lycées fermés"], ["RFI", "250 lycées fermés"]])), null, "chiffres différents");
  assert.strictEqual(chiffreSujet(sujet([["A", "Un débat"], ["B", "Un autre débat"]])), null);
});

test("dateSujet : à venir, dans les 90 jours, recoupée", () => {
  const f = (t1, t2 = t1) => dateSujet(sujet([["BFMTV", t1], ["Le Figaro", t2]]), maintenant);
  assert.deepStrictEqual(f("Le texte sera examiné au Sénat le 27 octobre"), { iso: "2026-10-27", jour: 27, mois: "octobre" });
  assert.deepStrictEqual(f("Réunion le 1er novembre", "Réunion prévue le 1er novembre"), { iso: "2026-11-01", jour: 1, mois: "novembre" });
  assert.strictEqual(f("Le texte a été examiné le 2 octobre"), null, "passé : l'année suivante est hors des 90 jours");
  assert.strictEqual(f("Rendez-vous le 20 janvier"), null, "au-delà de 90 jours");
  assert.deepStrictEqual(f("Vote le 5 octobre"), { iso: "2026-10-05", jour: 5, mois: "octobre" }, "aujourd'hui compte");
  assert.strictEqual(dateSujet(sujet([["BFMTV", "Examen le 27 octobre"]]), maintenant), null, "un seul média : pas un rendez-vous recoupé");
  assert.strictEqual(f("Un titre sans date"), null);
});

test("enrichirSujet : n'écrit que les champs qui existent, marque les vidéos", () => {
  const s = sujet([["Le Monde", "Un titre seul"]]);
  s.articles[0].url = "https://www.youtube.com/watch?v=1";
  enrichirSujet(s, [], {}, maintenant);
  assert.strictEqual(s.articles[0].video, true);
  for (const k of ["titrePropre", "contexte", "chiffre", "date"]) assert.ok(!(k in s), `pas de champ ${k} vide`);
  s.articles[0].url = "https://www.lemonde.fr/x.html";
  enrichirSujet(s, [], {}, maintenant);
  assert.ok(!("video" in s.articles[0]), "video retiré si le lien n'en est pas une");
});
