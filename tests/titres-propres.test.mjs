// Tests de scripts/titres-propres.cjs : titres rédigés par le site, contexte, chiffre, date, vidéos. USAGE : node --test tests/titres-propres.test.mjs
import test from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const { accroche, simplifierTexteLoi, nbMots, estVideo, titrePropre, titreParRegles, titreSujet, lieuDuTitre, contexteSujet, chiffreSujet, dateSujet, enrichirSujet, simplifierJargon, siglesNonExpliques, motsParPhrase, etapeSimple, natureSimple } = createRequire(import.meta.url)("../scripts/titres-propres.cjs");

const plat = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
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
  sondages: { instituts: [{ nom: "Ifop", date: "25-29 septembre 2026", dateFin: "2026-09-29", echantillon: 1527, url: "https://www.commission-des-sondages.fr/notices/files/10284-ifop-le-figaro-30-septembre.pdf", scores: { "Jean-Luc Mélenchon": [14, 17], "Raphaël Glucksmann": [9, 9] } }] },
  agenda: { jours: [] },
  tours: ["2027-04-18", "2027-05-02"],
};
const election = (extra = {}) => sujet([["Le Monde", "Primaire à gauche : débat"], ["Libération", "Primaire de gauche : débat"]],
  { illustration: { theme: "election", personnes: [{ nom: "Jean-Luc Mélenchon" }, { nom: "Raphaël Glucksmann" }] }, ...extra });

test("contexteSujet : sondage seulement pour le thème election, hors réserve", () => {
  const c = contexteSujet(election(), donnees, maintenant);
  assert.strictEqual(c[0].type, "sondage");
  assert.match(c[0].texte, /Ifop pour Le Figaro \(terrain : 25-29 septembre 2026, 1 527 personnes, marge d.erreur ±2,5 pts\)/, "mentions légales du sondage");
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
  assert.ok(s.titrePropre?.titre, "tout sujet a désormais un titre à nous");
  for (const k of ["contexte", "chiffre", "date"]) assert.ok(!(k in s), `pas de champ ${k} vide`);
  s.articles[0].url = "https://www.lemonde.fr/x.html";
  enrichirSujet(s, [], {}, maintenant);
  assert.ok(!("video" in s.articles[0]), "video retiré si le lien n'en est pas une");
});

// ─── Titres par règles : de vrais sujets (data/actualites.json du 6 octobre 2026) ───
const gouvernement = { membres: [{ nom: "Laurent Nuñez", fonction: "Ministre de l'intérieur" }, { nom: "Sébastien Lecornu", fonction: "Premier ministre" }] };
const reel = (titre, ill = {}, plus = []) => ({ illustration: { theme: "politique", personnes: [], partis: [], ...ill }, articles: [{ media: "Le Progrès", titre, url: "https://www.leprogres.fr/a", date: "2026-10-06T04:00:00Z" }, ...plus.map(([m, t], i) => ({ media: m, titre: t, url: `https://x.fr/${i}`, date: "2026-10-06T04:00:00Z" }))] });
const pers = (nom, parti) => ({ nom, ...(parti ? { parti } : {}) });
const CAS = [
  ["Politique. « Concentré et vigilant » : face à la colère lycéenne, le gouvernement cherche la bonne réponse", {}, "Gouvernement : réponse sur la mobilisation lycéenne"],
  ["Mouvement lycéen: \"Tout est fait pour dénigrer la jeunesse et la terroriser\", estime Danielle Simonnet, députée \"L'Après\" de Paris", { personnes: [pers("Danielle Simonnet")] }, "Danielle Simonnet : déclaration sur la mobilisation lycéenne"],
  ["Colère lycéenne: Gérard Larcher, président LR du Sénat, estime “qu’il faut rétablir l’ordre”", { personnes: [pers("Gérard Larcher", "LR")], partis: ["LR"] }, "Gérard Larcher : déclaration sur la mobilisation lycéenne"],
  ["« Une réponse sécuritaire totalement disproportionnée » : le PS va déposer une proposition de loi contre les armes mutilantes lors des manifestations de mineurs", { partis: ["SOC"] }, "Parti socialiste : loi proposée sur le maintien de l'ordre"],
  ["Grenoble. Plainte, manifestation, mises au point… Le conseil municipal s’est ouvert une semaine après les incidents entre élus et agents", {}, "Grenoble : conseil municipal"],
  ["Haute-Savoie. Praz-sur-Arly : de nouvelles pistes proposées pour la ZAC des Varins", {}, "Haute-Savoie : projet d'aménagement"],
  ["Loi intégrale contre les violences sexuelles : les députés adoptent la création d’unités spécialisées au sein de la police", {}, "Assemblée nationale : vote sur la loi contre les violences sexuelles"],
  ["Pyrénées-Atlantiques : le tribunal administratif suspend l’interdiction de manifester aux abords de deux lycées", { theme: "justice" }, "Pyrénées-Atlantiques : décision du tribunal administratif"],
  ["L'ÉDITO DE GUILLAUME DARET - Colère des lycéens: Sébastien Lecornu au pied du mur", { personnes: [pers("Sébastien Lecornu")] }, "Premier ministre : opinion d'un média sur la mobilisation lycéenne"],
  ["Éditorial. Colère lycéenne : face au chaos, les syndicats à la rescousse", {}, "Syndicats : opinion d'un média sur la mobilisation lycéenne"],
  ["Le dessin du mardi 6 octobre : deux poids, deux mesures…", {}, "Dessin de presse : regard sur l'actualité du jour"],
  ["Jujurieux. Fiscalité, urbanisme : les élus ajustent les outils de gestion communale", { theme: "budget" }, "Jujurieux : finances locales"],
  ["Blocage des lycées en France: la LDH dénonce une «dérive globale par rapport à l'État de droit» de la police", {}, "Ligue des droits de l'Homme : déclaration sur la mobilisation lycéenne"],
  ["Marine Le Pen: sans \"rupture politique, la France court vers le défaut\" de paiement", { personnes: [pers("Marine Le Pen", "RN")] }, "Marine Le Pen : ce qu'il faut savoir sur les finances publiques"],
  ["Une quarantaine d’enfants incommodés après un repas à la cantine en Dordogne : c’est bien une intoxication alimentaire due à une bactérie", {}, "Santé : ce que disent les médias"],
  ["Deux scénarios pour demain — Eau en 2050 : scénario catastrophe ?", {}, "Environnement : ce que disent les médias"],
  ["Gilley. Une journée des citoyens d’honneurs du Saugeais fidèle à ses valeurs", {}, "Gilley : actualité locale"],
  ["Billet. Le mal est ailleurs", {}, "Billet d'humeur : regard sur l'actualité du jour"],
];
test("titreParRegles : 18 vrais sujets, titre à nous prévu, ≤ 70 caractères, jamais le titre du média", () => {
  for (const [titre, ill, attendu] of CAS) {
    const t = titreSujet(reel(titre, ill), [], { gouvernement });
    assert.strictEqual(t.titre, attendu, titre);
    assert.ok(t.titre.length <= 70, `${t.titre} (${t.titre.length})`);
    assert.notStrictEqual(t.titre.toLowerCase(), titre.toLowerCase());
  }
});

test("titreParRegles : présomption d'innocence, aucun nom ni verbe qui accuse dans une procédure", () => {
  const ill = { personnes: [pers("Bruno Le Maire")] };
  for (const titre of [
    "La Roche-sur-Foron. « C’est d’autant plus frustrant » : déclaré inéligible pendant six mois, le maire va faire appel",
    "« On ne lâche pas » : les larmes de la maman de Rosa, victime présumée de Jérôme Barella, mobilisée à Paris",
    "Zaïd A., antifa syrien, risque 24 ans de prison en Hongrie : la France doit refuser son extradition",
  ]) {
    const t = titreSujet(reel(titre, ill), [], {}).titre;
    assert.ok(!/Barella|Zaïd|Le Maire|coupable|accus|dénonc/i.test(t), t);
    assert.match(t, /actualité de la justice|ce que disent les médias/);
  }
});

test("titreParRegles : aucun segment de plus de 4 mots repris d'un titre de média, pour tous les cas", () => {
  const mots = (x) => plat(x).match(/[a-z0-9]+/g) || [];
  for (const [titre, ill] of CAS) {
    const t = mots(titreSujet(reel(titre, ill), [], { gouvernement }).titre), src = mots(titre).join(" ");
    for (let i = 0; i + 5 <= t.length; i++) assert.ok(!src.includes(t.slice(i, i + 5).join(" ")), `segment repris : ${t.slice(i, i + 5).join(" ")}`);
  }
});

test("titreSujet : le titre du dossier ne s'applique qu'à un sujet qui parle du dossier", () => {
  const dossier = (articles) => [{ id: "presidentielle", titre: "Primaire de la gauche", articles }];
  const s = reel("Au Sénat, les centristes deviennent la deuxième force politique au détriment des socialistes, fragilisés", { partis: ["SOC"] });
  assert.strictEqual(titreSujet(s, dossier(s.articles), {}).origine, "regles", "rattaché par le mot « socialistes » : pas le titre du dossier");
  const s2 = reel("Plus de 140 000 inscrits à la primaire de la gauche : «C’est très au-delà de nos prévisions»");
  assert.deepStrictEqual(titreSujet(s2, dossier(s2.articles), {}), { titre: "Primaire de la gauche", origine: "dossier" });
});

test("titreSujet : toujours un titre, même sans rien de reconnu, et jamais celui d'un média", () => {
  for (const titre of ["Zzz", "François Hollande", "Pourquoi tout cela ?", "$content.TitleNoTags"]) {
    const t = titreSujet(reel(titre, { personnes: titre === "François Hollande" ? [pers("François Hollande", "SOC")] : [] }), [], {});
    assert.ok(t?.titre && t.titre.length <= 70 && t.titre !== titre, titre);
  }
  assert.strictEqual(titreParRegles({ articles: [] }, {}), null);
});

test("lieuDuTitre : lieu en tête, pas un thème", () => {
  assert.strictEqual(lieuDuTitre("Gilley. Avec l’arrivée de Ghislain Boucard"), "Gilley");
  assert.strictEqual(lieuDuTitre("Pyrénées-Atlantiques : le tribunal administratif"), "Pyrénées-Atlantiques");
  assert.strictEqual(lieuDuTitre("La Roche-sur-Foron. « C’est frustrant »"), "La Roche-sur-Foron");
  assert.strictEqual(lieuDuTitre("Politique. Le gouvernement cherche"), null);
  assert.strictEqual(lieuDuTitre("Colère lycéenne: Gérard Larcher estime"), null);
  assert.strictEqual(lieuDuTitre("Éditorial. Colère lycéenne : face au chaos"), null);
});

test("accusation ou polémique sans juridiction : jamais « procédure judiciaire en cours »", () => {
  const cas = [
    ["Politique. Accusé d'antisémitisme, Jordan Bardella nie à nouveau avec fermeté", [pers("Jordan Bardella", "RN")]],
    ["Parlement européen. Rima Hassan accusée d'avoir renversé les drapeaux d'Israël et de l'UE", [pers("Rima Hassan", "LFI")]],
    ["Loi intégrale contre les violences sexuelles : les victimes mieux prises en charge", []],
  ];
  for (const [titre, personnes] of cas) {
    const t = titreParRegles(reel(titre, { personnes }), {});
    assert.ok(t, titre);
    assert.ok(!/procédure|judiciaire|tribunal|condamn/i.test(t.titre), `${titre} → ${t.titre}`);
    assert.ok(!personnes.some((x) => t.titre.includes(x.nom)), "aucune personne nommée");
    assert.strictEqual(t.generique, true, "titre générique : ni story ni post");
  }
  // Juridiction explicitement citée : actualité judiciaire, sans nom ni « en cours »
  const j = titreParRegles(reel("Un homme condamné par le tribunal correctionnel de Lyon", {}), {});
  assert.ok(/justice|judiciaire|tribunal/i.test(j.titre) && !/en cours/i.test(j.titre), j.titre);
});

test("titreSujet : jamais un segment de 5 mots d'un titre de presse (sinon titre générique)", () => {
  const s = reel("Gouvernement : annonces sur la présidentielle de 2027, le détail", {});
  const brut = titreParRegles(s, {});
  const t = titreSujet(s, [], {});
  assert.ok(t && t.titre, "un titre existe toujours");
  const mots = (x) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ");
  const pm = ` ${mots(s.articles[0].titre).join(" ")} `;
  const m = mots(t.titre);
  for (let k = 0; k + 5 <= m.length; k++) assert.ok(!pm.includes(` ${m.slice(k, k + 5).join(" ")} `), `segment copié : ${t.titre}`);
  if (brut) assert.ok(t.titre === brut.titre || t.generique === true);
});

test("sujets sensibles : le titre de repli ne nomme jamais la personne ni ne parle de procédure sans juridiction ; la formule sensible n'est jamais un titre de presse", () => {
  const SS = createRequire(import.meta.url)("../scripts/sujets-sensibles.cjs");
  const avecNom = sujet([["Mediapart", "Mediapart accuse le ministre Jean Dupont de frais indus"], ["Le Monde", "Frais indus : le ministre Jean Dupont accusé, il dément"]], { illustration: { theme: "politique", personnes: [{ nom: "Jean Dupont" }] } });
  const t = titreSujet(avecNom, [], {});
  assert.ok(!/dupont/i.test(t.titre), "aucun nom accusé dans le titre");
  assert.ok(!/proc[ée]dure|mis en examen|accus|coupable/i.test(t.titre), "aucune procédure ni accusation sans juridiction");
  // avec une juridiction : le titre rédigé reste sans nom (le circuit sensible fabrique son propre texte, attribué et daté)
  const juge = sujet([["Le Monde", "Le tribunal correctionnel de Paris condamne l'ancien ministre Jean Dupont"], ["franceinfo", "Jean Dupont condamné par le tribunal correctionnel de Paris"]], { illustration: { theme: "justice", personnes: [{ nom: "Jean Dupont" }] } });
  assert.ok(!/dupont/i.test(titreSujet(juge, [], {}).titre));
  // la formule du circuit sensible ne copie jamais un titre de presse et reste sans nom
  const c = SS.classerSujet(juge, { motExclu: (x) => (/condamn|tribunal/i.test(x) ? "x" : null) });
  const f = SS.ficheNiveau1(c, juge.derniere);
  assert.ok(!/dupont|coupable/i.test(f.titre));
  for (const a of juge.articles) assert.notStrictEqual(plat(f.titre), plat(a.titre));
  assert.ok(SS.formulationSure(f.titre, { juridiction: c.juridiction }).ok);
});

test("essai de missile : titre propre exploitable (pas un mot seul), jamais « annonces »", () => {
  const s = reel("Dissuasion nucléaire : Emmanuel Macron a assisté à un tir d’exercice d’un missile nucléaire sous-marin", { personnes: [pers("Emmanuel Macron")] },
    [["20 Minutes", "La France réussit un tir de missile nucléaire sous-marin au large de la Bretagne"], ["RFI", "France: Emmanuel Macron a assisté à l’essai d’un nouveau missile nucléaire"]]);
  const t = titreSujet(s, [], {});
  assert.ok(t.titre.split(" ").length >= 3 && !/annonces/i.test(t.titre) && /dissuasion nucléaire/i.test(t.titre), t.titre);
});

test("sujet d'accusation ou de plainte (circuit normal) : le titre propre ne nomme jamais la personne visée et ne copie pas un titre de presse", () => {
  const pers = [{ nom: "Jean Dupont" }];
  for (const titres of [["Plainte déposée contre Jean Dupont", "Jean Dupont visé par une plainte", "Une plainte contre Jean Dupont"], ["Écrits antisémites attribués à Jean Dupont", "Jean Dupont : des écrits antisémites qui lui sont attribués", "Écrits antisémites : Jean Dupont réagit"]]) {
    const s = sujet(titres.map((t, i) => [["Le Monde", "BFMTV", "Le Figaro"][i], t]), { illustration: { theme: "politique", personnes: pers } });
    const t = titreSujet(s, [], {});
    assert.ok(t && !/dupont/i.test(t.titre), t?.titre);
    assert.ok(!titres.some((x) => plat(x) === plat(t.titre)), "pas de copie d'un titre de presse");
  }
});

test("jamais « procédure (judiciaire) en cours » : expression commune des médias remplacée par un titre générique", () => {
  const sujet = { mediasDistincts: 3, illustration: { theme: "politique" }, articles: [
    art("Le Monde", "Procédure judiciaire en cours à Lyon", 1), art("Libération", "Procédure judiciaire en cours à Lyon pour un maire", 2), art("RFI", "Lyon : procédure judiciaire en cours", 3),
  ] };
  const t = titreSujet(sujet, [], {});
  assert.ok(!/proc[ée]dure/i.test(t.titre), `pas de procédure affirmée : ${t.titre}`);
  assert.strictEqual(t.generique, true, "titre de repli, jamais publié");
});

test("simplifierTexteLoi : retire le jargon, thème en tête, 9 mots au plus", () => {
  const cas = [
    ["Projet de loi autorisant l'approbation de l'accord multilatéral entre autorités compétentes portant sur l'échange des informations GloBE", "Fiscalité : échange d'informations entre pays"],
    ["Projet de loi autorisant l’approbation de l’accord multilatéral entre autorités compétentes portant sur l’échange des informations GloBE", "Fiscalité : échange d'informations entre pays"],
    ["Projet de loi de finances pour 2027", "Budget de l'État 2027"],
    ["Projet de loi relatif à la résilience des infrastructures critiques et au renforcement de la cybersécurité, adopté par le Sénat", "Numérique : résilience des infrastructures critiques"],
    ["Proposition de loi visant à renforcer la protection des enfants sur les réseaux sociaux (nouvelle lecture)", "Numérique : protection des enfants sur les réseaux sociaux"],
    ["Proposition de loi organique visant à adapter l'autorité judiciaire à la lutte contre les violences sexuelles et intrafamiliales", "Justice : lutte contre les violences sexuelles et intrafamiliales"],
  ];
  for (const [entree, attendu] of cas) {
    const r = simplifierTexteLoi(entree);
    assert.strictEqual(r, attendu);
    assert.ok(nbMots(r) <= 9, r);
    assert.ok(!/projet de loi|proposition de loi|relatif|portant|visant|autorisant|adopté/i.test(r), `plus de jargon : ${r}`);
  }
  assert.strictEqual(simplifierTexteLoi("Questions au Gouvernement"), null, "pas un texte de loi : l'appelant garde l'original");
  assert.strictEqual(simplifierTexteLoi(""), null);
  const long = simplifierTexteLoi("Projet de loi relatif à la modernisation de l'organisation administrative territoriale de la République et des collectivités");
  assert.ok(long === null || (nbMots(long) <= 9 && !/(?:\bde|du|des|la|le|les|et|contre|à)$/i.test(long)), `ne finit jamais sur un mot de liaison : ${long}`);
});

test("accroche : sujet + enjeu en 6 à 18 mots, repli sur le titre propre, aucune accusation", () => {
  const lycees = sujet([["Le Monde", "Blocus des lycées : « on ne lâchera rien », disent les élèves"], ["BFMTV", "Lycées bloqués ce matin dans plusieurs villes"]]);
  const a = accroche(lycees);
  assert.strictEqual(a, "Lycées : des blocages, que demandent les élèves ?");
  assert.ok(nbMots(a) >= 6 && nbMots(a) <= 18, a);
  // jamais un titre de presse ni une citation
  assert.ok(!lycees.articles.some((x) => plat(x.titre).includes(plat(a))));
  assert.ok(!/ne lâchera/.test(a));
  // vote : l'action n'est dite que si son mot est dans le titre
  const vote = sujet([["Le Monde", "Le Sénat adopte la loi sur la dette"], ["BFMTV", "Budget : vote au Sénat"]]);
  assert.strictEqual(accroche(vote), "L'argent de l'État : un vote a lieu, qu'est-ce que cela change ?");
  const sansVote = sujet([["Le Monde", "Budget : le point sur la dette"], ["BFMTV", "Dette publique, où en est-on ?"]]);
  assert.ok(!/vote/.test(accroche(sansVote) || ""), "pas de vote affirmé sans le mot");
  // prudence : accusation ou procédure -> repli sur le titre propre, jamais de nom de personne
  const affaire = sujet([["Le Monde", "Jean Dupont mis en examen pour détournement"], ["BFMTV", "L'élu Jean Dupont accusé de fraude"]], { illustration: { theme: "justice", personnes: [{ nom: "Jean Dupont" }] }, titrePropre: { titre: "Politique : ce que disent les médias", origine: "regles", generique: true } });
  assert.strictEqual(accroche(affaire), "Politique : ce que disent les médias");
  assert.ok(!/dupont|procédure|accus/i.test(accroche(affaire)));
  // repli : thème introuvable -> titre propre existant
  const flou = sujet([["Le Monde", "Rien de précis aujourd'hui"]], { titrePropre: { titre: "Quelque chose de neutre" } });
  assert.strictEqual(accroche(flou), "Quelque chose de neutre");
  assert.strictEqual(accroche({ articles: [] }), null);
});

// ─── Langage simple (FALC) : sigles dits en toutes lettres, jargon remplacé, phrases de 20 mots au plus ───
test("simplifierJargon : le jargon parlementaire devient des mots courants", () => {
  const cas = [
    ["scrutin public n° 12", /vote des députés n° 12/],
    ["la motion de censure", /le vote pour renverser le Gouvernement/],
    ["recours à l'article 49.3", /le Gouvernement fait passer un texte sans vote/],
    ["en séance publique", /dans l'hémicycle/],
    ["adopté en première lecture", /premier examen du texte/],
    ["la commission mixte paritaire", /réunion de députés et sénateurs pour s'accorder sur un texte/],
    ["le dossier législatif", /parcours de la loi/],
    ["un amendement du Gouvernement", /modification proposée/],
    ["le projet de loi de finances pour 2027", /loi de finances \(le budget de l'État\)/],
    ["Projet de loi relatif à la santé", /^Loi proposée par le Gouvernement sur la santé$/],
    ["une proposition de loi", /loi proposée par des parlementaires/],
    ["Le PS et le RN, la LFI et LR", /Parti socialiste.*Rassemblement national.*La France insoumise.*Les Républicains/],
    ["l'AN a voté", /Assemblée nationale a voté/],
    ["PLFSS", /loi de financement de la Sécurité sociale/],
  ];
  for (const [entree, attendu] of cas) assert.match(simplifierJargon(entree), attendu, entree);
  // « abstention » : expliquée une seule fois ; le taux d'abstention d'une élection n'est pas touché
  assert.strictEqual(simplifierJargon("10 abstentions, puis 2 abstentions"), "10 abstentions (ni pour ni contre), puis 2 abstentions");
  assert.strictEqual(simplifierJargon("le taux d'abstention"), "le taux d'abstention");
  // un texte déjà simple ne change pas ; les titres officiels entre guillemets sont gardés
  assert.strictEqual(simplifierJargon("Les députés ont voté ce texte."), "Les députés ont voté ce texte.");
  assert.strictEqual(simplifierJargon("Projet de loi « casseurs-payeurs »"), "Projet de loi « casseurs-payeurs »");
  assert.strictEqual(etapeSimple("première lecture"), "premier examen du texte");
  assert.strictEqual(natureSimple("projet de loi"), "loi proposée par le Gouvernement");
});

test("sigles : aucun sigle non expliqué dans les textes fabriqués", () => {
  assert.deepStrictEqual(siglesNonExpliques("Le texte de l'Assemblée nationale et du Sénat, vote n°3"), []);
  assert.deepStrictEqual(siglesNonExpliques("La TVA a changé"), [], "TVA : sigle d'usage courant");
  assert.deepStrictEqual(siglesNonExpliques("Le PLF et la CMP de l'AN"), ["PLF", "CMP", "AN"]);
  assert.deepStrictEqual(siglesNonExpliques("5,1 % du PIB"), ["PIB"]);
  assert.deepStrictEqual(siglesNonExpliques("5,1 % de la richesse produite en un an (PIB)"), []);
  // tout ce que les fonctions fabriquent sur nos exemples : titres par règles, accroches, intitulés de loi
  const textes = [];
  for (const [titre, ill] of CAS) { const t = titreSujet(reel(titre, ill), [], { gouvernement }); textes.push(t.titre); textes.push(accroche({ ...reel(titre, ill), titrePropre: t }) || ""); }
  for (const t of ["Projet de loi de finances pour 2027", "Projet de loi de financement de la sécurité sociale pour 2027", "Proposition de loi visant à renforcer la protection des enfants sur les réseaux sociaux (nouvelle lecture)", "Projet de loi autorisant l'approbation de l'accord entre autorités compétentes portant sur l'échange des informations GloBE"]) textes.push(simplifierTexteLoi(t));
  for (const t of textes) assert.deepStrictEqual(siglesNonExpliques(t), [], `sigle dans « ${t} »`);
});

test("phrases : 20 mots au plus, sur les accroches et intitulés fabriqués", () => {
  const textes = [];
  const lycees = sujet([["Le Monde", "Blocus des lycées : « on ne lâchera rien », disent les élèves"], ["BFMTV", "Lycées bloqués ce matin dans plusieurs villes"]]);
  textes.push(accroche(lycees), accroche(sujet([["Le Monde", "Le Sénat adopte la loi sur la dette"], ["BFMTV", "Budget : vote au Sénat"]])));
  for (const [titre, ill] of CAS) textes.push(titreSujet(reel(titre, ill), [], { gouvernement }).titre);
  for (const t of textes) for (const { phrase, mots } of motsParPhrase(t)) assert.ok(mots <= 20, `${mots} mots : « ${phrase} »`);
  assert.deepStrictEqual(motsParPhrase("Une phrase. Une autre, plus longue ! Et la fin ?").map((x) => x.mots), [2, 4, 3]);
});
