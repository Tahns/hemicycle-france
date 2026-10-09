// Tests de scripts/stories-auto.cjs (choix du sujet) sur des titres fictifs. USAGE : node tests/stories-auto.test.mjs
import assert from "assert";
import { readFileSync } from "fs";
import { createRequire } from "module";
const { destination: AUTO_destination, decrire: AUTO_decrireBrut, choisirSujet, choisirSondage, choisir, reserveSondages, jourPublication, motExclu, idSujet, jourUTC2, elaguer } = createRequire(import.meta.url)("../scripts/stories-auto.cjs");

const AUTO_decrire = (r) => AUTO_decrireBrut(r, now);
const now = new Date("2026-10-02T13:30:00Z"); // 15 h 30 à Paris
const il_y_a = (h) => new Date(now.getTime() - h * 36e5).toISOString();
const MEDIAS = ["franceinfo", "Le Monde", "Le Figaro", "Libération", "20 Minutes"];
const sujet = (titre, nb, extra = {}) => ({
  medias: nb,
  derniere: il_y_a(1),
  illustration: { theme: "budget", ...(extra.illustration || {}) },
  titrePropre: { titre: "Budget 2027", origine: "recoupement" },
  articles: Array.from({ length: Math.max(nb, 1) }, (_, i) => ({ titre: i ? `${titre} (suite ${i})` : titre, url: `https://example.org/${idSujet(titre)}/${i}`, media: MEDIAS[i], date: il_y_a(1) })),
  ...extra,
});
const actu = (...sujets) => ({ sujets });
const vide = { entrees: [] };
const choix = (sujets, opts = {}) => choisirSujet({ actualites: actu(...sujets), direct: null, file: vide, now, ...opts });

// Sujet à 3 médias : retenu
{
  const r = choix([sujet("Le gouvernement présente son projet de budget pour 2027", 3)]);
  assert.strictEqual(r.indice, 0);
  assert.strictEqual(r.id, idSujet("Le gouvernement présente son projet de budget pour 2027"));
}
// Sans titre rédigé par le site (titrePropre), un sujet de presse n'est jamais retenu : mieux vaut ne rien publier
assert.ok(choix([sujet("Le gouvernement présente son projet de budget pour 2027", 4, { titrePropre: undefined })]).refus, "sans titre propre : refusé");
assert.ok(choix([sujet("Le gouvernement présente son projet de budget pour 2027", 4, { titrePropre: null })]).refus, "titre propre null : refusé");
assert.strictEqual(choix([sujet("Le gouvernement présente son projet de budget pour 2027", 4, { titrePropre: undefined }), sujet("Autre sujet de budget présenté ce matin par le gouvernement", 3)]).indice, 1, "on passe au suivant qui en a un");
// La fiche d'entrée reçoit le titre propre et les liens vidéo (en tête des sources) ; le choix (id, indice) ne change pas
{
  const s = sujet("Le gouvernement présente son projet de budget pour 2027", 4);
  s.articles[2].video = true;
  s.articles[3].video = true;
  const c = choix([s]);
  assert.strictEqual(c.indice, 0);
  assert.strictEqual(c.id, idSujet("Le gouvernement présente son projet de budget pour 2027"));
  const d = createRequire(import.meta.url)("../scripts/stories-auto.cjs").decrire(c);
  assert.strictEqual(d.champs.titrePropre, "Budget 2027");
  assert.deepStrictEqual(d.champs.videos, [{ media: MEDIAS[2], url: s.articles[2].url }, { media: MEDIAS[3], url: s.articles[3].url }]);
  assert.deepStrictEqual(d.sources.slice(0, 2), [s.articles[2].url, s.articles[3].url], "vidéos en tête");
  assert.strictEqual(new Set(d.sources).size, d.sources.length, "sans doublon");
  assert.strictEqual(d.sources.length, 4);
  assert.deepStrictEqual(d.args, [0, s.articles[0].titre, null, null, null], "l'indice passé à dessinerStory ne change pas");
  const sans = createRequire(import.meta.url)("../scripts/stories-auto.cjs").decrire(choix([sujet("Le gouvernement présente son projet de budget pour 2027", 3)]));
  assert.ok(!("videos" in sans.champs), "pas de champ videos sans vidéo");
}
// Sujet à 2 médias : non
assert.ok(choix([sujet("Le gouvernement présente son projet de budget pour 2027", 2)]).refus, "2 médias refusé");
// 2 médias mais prise de parole du président (data/direct.json) : retenu
{
  const s = sujet("Emmanuel Macron s'exprimera ce soir à 20 h sur le budget", 1);
  const direct = { evenements: [{ type: "allocution", titre: s.articles[0].titre }] };
  assert.strictEqual(choix([s], { direct }).indice, 0, "président retenu");
  assert.ok(choix([s]).refus, "sans détection du direct : non");
}
// Fenêtre de fraîcheur des sujets : 12 h (un sujet arrivé la nuit reste publiable le matin) ; au-delà : non
assert.strictEqual(choix([sujet("Le gouvernement présente son projet de budget pour 2027", 4, { derniere: il_y_a(8) })]).indice, 0, "sujet de 8 h accepté");
assert.ok(choix([sujet("Le gouvernement présente son projet de budget pour 2027", 4, { derniere: il_y_a(13) })]).refus, "ancien refusé");
// Le refus indique le motif des écarts
assert.ok(/1 plus de 12 h/.test(choix([sujet("Le gouvernement présente son projet de budget pour 2027", 4, { derniere: il_y_a(13) })]).refus), "motif journalisé");
assert.ok(/1 moins de 3 médias/.test(choix([sujet("Le gouvernement présente son projet de budget pour 2027", 2)]).refus), "motif médias");
// DÉCISION DU PROPRIÉTAIRE : accusation, plainte, polémique, procédure, écrits attribués : circuit NORMAL des stories (retenu, brouillon à valider) ; plus de circuit sensible
for (const titre of ["Jean Dupont mis en examen pour détournement de fonds publics", "Écrits antisémites attribués à Jean Dupont", "Plainte déposée contre Jean Dupont"]) {
  const r = choix([sujet(titre, 4)]);
  assert.strictEqual(r.indice, 0, `retenu : ${titre} (${r.refus})`);
  assert.ok(!r.sensible && r.modele !== "sensible", "pas de circuit sensible");
}
for (const titre of [
  "Un ministre visé par une plainte pour diffamation", "Garde à vue d'un élu local à Lyon", "Le député soupçonné de favoritisme", "Le maire condamné pour prise illégale d'intérêts", "Nouvelle enquête visant un parlementaire",
]) assert.strictEqual(motExclu(titre), null, `retenu : ${titre}`);
// Protections légales conservées : viol, décès, drame, mineur
for (const titre of ["Un viol dénoncé dans un parti", "Une adolescente de 15 ans victime d'une agression", "Mort de l'ancien ministre Jean Martin", "Décès d'une figure de la gauche", "Drame à la sortie d'un meeting", "Un fait divers relance le débat sur la sécurité"]) {
  assert.ok(motExclu(titre), `exclu : ${titre}`);
  assert.ok(choix([sujet(titre, 4)]).refus, `sujet écarté : ${titre}`);
}
for (const titre of ["Le gouvernement présente son projet de budget pour 2027", "Le Sénat adopte la loi de programmation militaire"])
  assert.strictEqual(motExclu(titre), null, `non exclu : ${titre}`);
// Un seul titre à risque (protection légale) parmi ceux du sujet suffit à l'écarter
{
  const s = sujet("Le gouvernement présente son projet de budget pour 2027", 3);
  s.articles[2].titre = "Budget : un ministre mort dans un accident";
  assert.ok(choix([s]).refus, "un titre à risque écarte le sujet");
}
// Thème justice : plus écarté (décision du propriétaire) ; titre propre fiable conservé
{
  const r = choix([sujet("Le gouvernement présente son projet de budget pour 2027", 4, { illustration: { theme: "justice" } })]);
  assert.strictEqual(r.indice, 0, "justice retenu");
  assert.strictEqual(r.repli, false);
}
// Accusation, plainte, écrits attribués : circuit normal, titre de repli si le titre propre est vague ou absent, titre de presse conservé pour les doublons, brouillon à valider
{
  const cas = [["Écrits antisémites attribués à Jean Dupont", { titre: "Politique : l'essentiel du moment", origine: "regles", generique: true }], ["Plainte déposée contre Jean Dupont", undefined], ["Polémique sur les propos du ministre", { titre: "Polémique", origine: "recoupement" }]];
  for (const [titre, tp] of cas) {
    const sj = sujet(titre, 3, { illustration: { theme: "justice", personnes: [{ nom: "Jean Dupont" }] }, titrePropre: tp });
    const r = choix([sj]);
    assert.strictEqual(r.indice, 0, `retenu : ${titre} (${r.refus})`);
    assert.strictEqual(r.repli, true, "titre de repli");
    assert.ok(!r.sensible && r.modele === "une", "circuit normal, jamais le circuit sensible");
    const cfg = { validationHumaine: true, sensibles: false };
    assert.strictEqual(AUTO_destination(r, cfg), "brouillon", "brouillon à valider");
    const d = AUTO_decrire(r);
    assert.ok(!("titrePropre" in d.champs), "pas de titre propre : rubrique « à la une » + titre de presse cité");
    assert.strictEqual(d.titre, titre);
    // moins de 3 médias : refusé comme n'importe quel sujet
    assert.ok(choix([sujet(titre, 2, { illustration: { theme: "justice" }, titrePropre: tp })]).refus);
    // doublon sur le titre de presse
    assert.ok(choix([sj], { file: { entrees: [{ id: "x".repeat(12), cree: il_y_a(5), titre, sources: [] }] } }).refus, "doublon écarté");
  }
  // un sujet sans mot d'accusation et sans titre propre reste refusé
  assert.ok(choix([sujet("Le gouvernement présente son projet de budget pour 2027", 4, { titrePropre: { titre: "Budget", origine: "recoupement" } })]).refus);
}
// Déjà en file : exclu (par titre, ou par lien d'article déjà utilisé)
{
  const titre = "Le gouvernement présente son projet de budget pour 2027";
  const entree = { id: idSujet(titre), cree: il_y_a(2), titre, sources: [] };
  assert.ok(choix([sujet(titre, 4)], { file: { entrees: [entree] } }).refus, "déjà en file");
  const s = sujet("Budget 2027 : le gouvernement détaille ses économies", 4);
  assert.ok(choix([s], { file: { entrees: [{ id: "aaaaaaaaaaaa", cree: il_y_a(2), titre: "autre", sources: [s.articles[1].url] }] } }).refus, "lien déjà utilisé");
}
// 5e du jour : exclu (4 déjà aujourd'hui en UTC+2) ; hier ne compte pas
{
  const du_jour = (h, i) => ({ id: `${i}`.repeat(12), cree: il_y_a(h), titre: `t${i}`, sources: [] });
  const quatre = [1, 2, 3, 4].map((i) => du_jour(i * 1.5, i));
  assert.ok(choix([sujet("Le gouvernement présente son projet de budget pour 2027", 4)], { file: { entrees: quatre } }).refus, "5e exclue");
  const hier = quatre.map((e) => ({ ...e, cree: new Date(Date.parse(e.cree) - 24 * 36e5).toISOString() }));
  assert.strictEqual(choix([sujet("Le gouvernement présente son projet de budget pour 2027", 4)], { file: { entrees: hier } }).indice, 0, "hier ne compte pas");
  assert.strictEqual(jourUTC2("2026-10-02T22:30:00Z"), "2026-10-03", "jour en UTC+2");
}
// Nuit (23 h – 7 h à Paris) : exclu ; matin 7 h : accepté
{
  const s = (h) => sujet("Le gouvernement présente son projet de budget pour 2027", 4, { derniere: new Date(Date.parse(h) - 36e5).toISOString() });
  for (const nuit of ["2026-10-02T21:30:00Z", "2026-10-03T02:00:00Z", "2026-10-03T04:30:00Z"]) // 23 h 30, 4 h, 6 h 30 à Paris
    assert.ok(choisirSujet({ actualites: actu(s(nuit)), direct: null, file: vide, now: new Date(nuit) }).refus, `nuit ${nuit}`);
  const matin = "2026-10-03T05:30:00Z"; // 7 h 30 à Paris
  assert.strictEqual(choisirSujet({ actualites: actu(s(matin)), direct: null, file: vide, now: new Date(matin) }).indice, 0, "7 h 30 accepté");
}
// Au plus un sujet : celui qui a le plus de médias
{
  const r = choix([sujet("Premier sujet sur la réforme des retraites", 3), sujet("Second sujet sur le budget de la défense nationale", 5)]);
  assert.strictEqual(r.indice, 1);
}
// Élagage : 30 dernières entrées, images des 3 derniers jours seulement
{
  const entrees = Array.from({ length: 35 }, (_, i) => ({ id: i.toString(16).padStart(12, "0"), cree: new Date(now.getTime() - (35 - i) * 6 * 36e5).toISOString() }));
  const { gardees, images } = elaguer(entrees, now);
  assert.strictEqual(gardees.length, 30);
  assert.ok(images.size < 30 && images.size > 0 && images.has(entrees[34].id) && !images.has(entrees[5].id));
}

// ---------- Déclencheur « nouveau sondage » ----------
const jour = (h) => new Date(now.getTime() - h * 36e5).toISOString().slice(0, 10);
const scores = { "Marine Le Pen": [31, 36], "Jean-Luc Mélenchon": [14, 17], "Édouard Philippe": [15, 24] };
const inst = (nom, hFin, extra = {}) => ({ nom, date: "29 septembre 2026", dateFin: jour(hFin), echantillon: 1500, hypotheses: 3, url: "https://www.commission-des-sondages.fr/notices/files/x-sondage-le-figaro-30-septembre.pdf", scores, ...extra });
const sond = (...instituts) => ({ instituts });
const choixS = (instituts, opts = {}) => choisirSondage({ sondages: sond(...instituts), file: vide, now, ...opts });
// Nouveau sondage (terrain fini hier, publié aujourd'hui) : retenu, avec son identifiant
{
  const r = choixS([inst("Ifop", 24)]);
  assert.ok(!r.refus, r.refus);
  assert.strictEqual(r.sondageId, `Ifop|${jour(24)}`);
  assert.match(r.id, /^[0-9a-f]{12}$/);
  assert.strictEqual(r.indice, 0);
  // il est prioritaire sur un sujet d'actualité retenable
  const actus = actu(sujet("Le gouvernement présente son projet de budget pour 2027", 5));
  assert.ok(choisir({ actualites: actus, direct: null, sondages: sond(inst("Ifop", 24)), file: vide, now }).sondage, "le sondage passe avant l'actualité");
  assert.strictEqual(choisir({ actualites: actus, direct: null, sondages: sond(), file: vide, now }).indice, 0, "sans sondage : l'actualité");
}
// Le plus récent des nouveaux sondages
assert.strictEqual(choixS([inst("Harris", 40), inst("Ifop", 24)]).sondage.nom, "Ifop");
// Même sondage déjà en file : non ; un sondage plus ancien que le dernier en file : non ; un plus récent : oui
{
  const entree = (sondageId) => ({ id: "abcdefabcdef", cree: il_y_a(3), titre: "t", sources: [], type: "story", sondageId });
  assert.ok(choixS([inst("Ifop", 24)], { file: { entrees: [entree(`Ifop|${jour(24)}`)] } }).refus, "déjà en file");
  assert.ok(choixS([inst("Harris", 30)], { file: { entrees: [entree(`Ifop|${jour(24)}`)] } }).refus, "plus ancien que le dernier en file");
  assert.ok(!choixS([inst("Harris", 1)], { file: { entrees: [entree(`Ifop|${jour(24)}`)] } }).refus, "plus récent que le dernier en file");
}
// Sondage ancien (> 48 h après publication) : non ; publié hier selon le nom de la notice malgré un terrain plus ancien : oui
assert.ok(choixS([inst("Ifop", 24 * 5)]).refus, "ancien refusé");
{
  const hier = jour(24), mois = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"][Number(hier.slice(5, 7)) - 1];
  const i = inst("Ifop", 24 * 4, { url: `https://www.commission-des-sondages.fr/notices/files/10284-pres-ifop-le-figaro-${Number(hier.slice(8))}-${mois}.pdf` });
  assert.strictEqual(jourPublication(i), hier, "jour de publication lu dans le nom de la notice");
  assert.ok(!choixS([i]).refus, "publié hier selon la notice");
  assert.strictEqual(jourPublication(inst("Ifop", 24)), jour(0), "sinon lendemain de la fin du terrain");
}
// Mentions obligatoires impossibles (pas d'échantillon) ou trop peu de candidats : non
assert.ok(choixS([inst("Ifop", 24, { echantillon: 0 })]).refus, "sans échantillon");
assert.ok(choixS([inst("Ifop", 24, { scores: { "Marine Le Pen": [30, 35] } })]).refus, "trop peu de candidats");
// Réserve électorale (samedi 0 h – dimanche 20 h, Paris) : non, même pour un sondage tout frais ; mêmes dates que le site
{
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf-8");
  const tours = JSON.parse(/const TOURS_PRESIDENTIELLE = (\[[^\]]*\]);/.exec(html)[1]);
  assert.deepStrictEqual(tours, ["2027-04-18", "2027-05-02"], "dates des tours identiques à index.html");
  for (const t of ["2027-04-16T22:30:00Z" /* samedi 0 h 30 Paris */, "2027-04-17T10:00:00Z", "2027-04-18T17:30:00Z" /* dimanche 19 h 30 Paris */, "2027-05-01T08:00:00Z", "2027-05-02T17:59:00Z"]) {
    const n = new Date(t);
    assert.ok(reserveSondages(n), `réserve ${t}`);
    const fin = new Date(n.getTime() - 36e5).toISOString().slice(0, 10);
    const r = choisirSondage({ sondages: sond({ ...inst("Ifop", 24), dateFin: fin }), file: vide, now: n });
    assert.ok(r.refus && /réserve/.test(r.refus), `aucun sondage en réserve ${t}`);
  }
  for (const t of ["2027-04-16T21:30:00Z" /* vendredi 23 h 30 Paris */, "2027-04-18T18:00:00Z" /* dimanche 20 h Paris */, "2027-04-19T08:00:00Z"]) assert.strictEqual(reserveSondages(new Date(t)), null, `hors réserve ${t}`);
}
// Plafonds : 2 sondages par jour ; ils ne comptent pas dans les 4 actualités ; nuit : refus avant 7 h et après 23 h 30, accepté à 23 h 15
{
  const e = (i, h) => ({ id: `${i}`.repeat(12), cree: il_y_a(h), titre: "t", sources: [], type: "story", sondageId: `X${i}|2026-09-0${i}` });
  assert.ok(choixS([inst("Ifop", 24)], { file: { entrees: [e(1, 2), e(2, 3)] } }).refus, "3e sondage du jour refusé");
  const quatreActus = [1, 2, 3, 4].map((i) => ({ id: `${i}`.repeat(12), cree: il_y_a(i * 1.5), titre: `t${i}`, sources: [] }));
  assert.ok(!choixS([inst("Ifop", 24)], { file: { entrees: quatreActus } }).refus, "hors plafond de 4 actualités");
  assert.strictEqual(choisirSujet({ actualites: actu(sujet("Le gouvernement présente son projet de budget pour 2027", 4)), direct: null, file: { entrees: [e(1, 2), e(2, 3), ...quatreActus.slice(0, 3)] }, now }).indice, 0, "les sondages ne comptent pas dans les 4 actualités");
  const ok = (iso) => !choisirSondage({ sondages: sond(inst("Ifop", 24)), file: vide, now: new Date(iso) }).refus;
  assert.ok(ok("2026-10-02T21:15:00Z"), "23 h 15 à Paris accepté");
  assert.ok(!ok("2026-10-02T21:45:00Z"), "23 h 45 refusé");
  assert.ok(!ok("2026-10-03T04:30:00Z"), "6 h 30 refusé");
}

// Seulement des sujets qui concernent la France
{
  assert.ok(choix([sujet("Brésil. Élection présidentielle : Lula et le fils Bolsonaro au coude à coude dans un pays très polarisé", 4)]).refus, "sujet purement étranger écarté");
  assert.ok(choix([sujet("Espagne. Crise du logement : les députés rejettent les textes du gouvernement de Pedro Sánchez", 4)]).refus, "Espagne écartée");
  assert.ok(!choix([sujet("Carburants : Emmanuel Macron va présider une réunion des dirigeants du G7 en visioconférence", 4)]).refus, "étranger mais avec Macron : gardé");
  assert.ok(!choix([sujet("Le gouvernement présente son projet de budget pour 2027", 4)]).refus, "sujet français gardé");
}

// ---------- Dossiers (sujet dominant éclaté en petits sujets) ----------
{
  const { construireDossiers } = createRequire(import.meta.url)("../scripts/dossiers.cjs");
  const { choisirDossier, idDossier } = createRequire(import.meta.url)("../scripts/stories-auto.cjs");
  const titresLycees = [
    "Blocus des lycées : la mobilisation s'étend dans l'Ouest", "Lycéens mobilisés devant leur lycée à Lyon", "Lycées : nouveau blocage ce matin à Toulouse",
    "Les lycéens manifestent contre la réforme du bac", "Blocage des lycées : la ministre appelle au calme", "Un lycée bloqué à Nantes, rassemblement prévu",
    "Blocus des lycées : les syndicats reçus au ministère",
  ];
  const fond = ["Le Sénat examine le budget de la défense", "Débat sur la fin de vie à l'Assemblée", "Réforme de l'audiovisuel public en commission", "Nouvelle loi sur l'immigration en discussion",
    "Les écologistes réunis en université d'été", "Accord de libre-échange : les agriculteurs inquiets", "Transport ferroviaire : la SNCF annonce des hausses", "Le Conseil constitutionnel valide un texte",
    "Les maires réclament plus de moyens pour les communes", "Retraites : les partenaires sociaux se retrouvent à Bercy"];
  const art = (titre, i) => ({ titre, url: `https://example.org/${i}`, media: MEDIAS[i % 5], date: il_y_a(1 + (i % 10)) });
  const fond2 = [...fond, ...fond.map((t) => t + " (2)"), ...fond.map((t) => t + " (3)")];
  const base = [...titresLycees, ...fond2].map(art);
  const d = construireDossiers(base, now);
  assert.strictEqual(d.length, 1, "un dossier");
  assert.strictEqual(d[0].titre, "Blocus des lycées");
  assert.ok(d[0].nb >= 6 && d[0].medias.length >= 4);
  assert.deepStrictEqual(Object.keys(d[0].articles[0]).sort(), ["date", "media", "titre", "url"]);
  // Moins de 4 médias, ou moins de 6 articles : pas de dossier
  assert.strictEqual(construireDossiers([...titresLycees.map((t, i) => ({ ...art(t, i), media: ["A", "B", "C"][i % 3] })), ...fond2.map(art)], now).length, 0, "3 médias : non");
  assert.strictEqual(construireDossiers([...titresLycees.slice(0, 5).map(art), ...fond2.map(art)], now).length, 0, "5 articles : non");
  // Plus de 48 h : non
  assert.strictEqual(construireDossiers(base.map((a) => ({ ...a, date: il_y_a(60) })), now).length, 0, "trop ancien");
  // Faits divers et accusations écartés avant le calcul : 3 des 7 titres sont exclus, il reste 4 articles
  const risque = base.map((a, i) => (i % 2 === 0 && i < 6 ? { ...a, titre: a.titre + " : un élève mis en examen" } : a));
  assert.strictEqual(construireDossiers(risque, now).length, 0, "titres à risque écartés");
  // Un nom propre (personne) ne forme pas un dossier
  const nom = Array.from({ length: 8 }, (_, i) => art(`${fond[i]} selon Jean Dupontel`, i + 20));
  assert.strictEqual(construireDossiers([...nom, ...fond2.map(art)], now).length, 0, "nom propre : pas de dossier");
  // Sujet purement étranger : écarté
  const etr = Array.from({ length: 8 }, (_, i) => art(`Brésil. Élection présidentielle : Lula multiplie les meetings à Brasilia (${i})`, i + 40));
  assert.strictEqual(construireDossiers([...etr, ...fond2.map(art)], now).length, 0, "dossier étranger écarté");

  // Stories : un dossier non publié passe avant un sujet simple, avec les plafonds et horaires existants
  const actus = { dossiers: d.map((x) => ({ ...x, derniere: il_y_a(1) })), sujets: [sujet("Le gouvernement présente son projet de budget pour 2027", 5)] };
  const c = choisir({ actualites: actus, direct: null, sondages: sond(), file: vide, now });
  assert.ok(c.dossier && c.dossier.id === d[0].id && c.id === idDossier(d[0].id), "dossier prioritaire sur le sujet simple");
  const publie = { entrees: [{ id: idDossier(d[0].id), cree: il_y_a(2), titre: "x", sources: [], type: "story", dossierId: d[0].id }] };
  assert.strictEqual(choisir({ actualites: actus, direct: null, sondages: sond(), file: publie, now }).indice, 0, "dossier déjà publié : le sujet simple suit");
  assert.ok(choisirSujet({ actualites: actus, direct: null, file: { entrees: [1, 2, 3, 4].map((i) => ({ id: `${i}`.repeat(12), cree: il_y_a(i * 1.5), titre: `t${i}`, sources: [] })) }, now }).refus, "plafond de 4 par jour");
  assert.ok(choisirSujet({ actualites: actus, direct: null, file: vide, now: new Date("2026-10-02T21:30:00Z") }).refus, "pas de dossier la nuit");
  assert.strictEqual(choisirDossier({ actualites: { dossiers: d.map((x) => ({ ...x, derniere: il_y_a(14) })) }, file: vide, now }), null, "dossier trop ancien");
  const risqueD = d.map((x) => ({ ...x, derniere: il_y_a(1), articles: x.articles.map((a, i) => (i ? a : { ...a, titre: a.titre + " : un lycéen mis en examen" })) }));
  assert.strictEqual(choisirDossier({ actualites: { dossiers: risqueD }, file: vide, now }), null, "titre à risque dans un dossier");
  // Fiche d'un dossier : titre éditorial du dossier + liens vidéo en tête des sources
  const dv = { ...d[0], derniere: il_y_a(1), articles: d[0].articles.map((a, i) => (i === 3 ? { ...a, video: true } : a)) };
  const fiche = createRequire(import.meta.url)("../scripts/stories-auto.cjs").decrire(choisirDossier({ actualites: { dossiers: [dv] }, file: vide, now }));
  assert.strictEqual(fiche.champs.titrePropre, "Blocus des lycées");
  assert.deepStrictEqual(fiche.champs.videos, [{ media: dv.articles[3].media, url: dv.articles[3].url }]);
  assert.strictEqual(fiche.sources[0], dv.articles[3].url);
}

// ---------- Configuration, monétisation, brouillons, réserve (data/stories-config.json) ----------
{
  const A = createRequire(import.meta.url)("../scripts/stories-auto.cjs");
  const { mkdtempSync, readdirSync, writeFileSync } = await import("fs");
  const { tmpdir } = await import("os");
  const { join } = await import("path");

  // Configuration : tout à false par défaut ; le fichier du dépôt est à false/false (comportement actuel)
  const DEF = { monetisation: false, validationHumaine: false, minMedias: 3, dossierMedias: 4, maxParJour: 4, enBref: true, fraicheurH: 12, videos: false, videosMax: 2, sensibles: true, minMediasSensible: 2, brouillonsSensiblesMax: 3, styleFixe: null };
  assert.deepStrictEqual(A.normaliserConfig(null), DEF);
  assert.deepStrictEqual(A.normaliserConfig({ monetisation: "oui", validationHumaine: 1 }), DEF, "seul true (booléen) active");
  assert.deepStrictEqual(A.lireConfig(join(tmpdir(), "inexistant-stories-config.json")), DEF);
  assert.deepStrictEqual((({ contenusAuto, creneaux, styleFixe, ...reste }) => reste)(JSON.parse(readFileSync(new URL("../data/stories-config.json", import.meta.url), "utf-8"))), { monetisation: false, validationHumaine: false, sensibles: false, minMedias: 2, dossierMedias: 3, maxParJour: 20, fraicheurH: 72, enBref: false, videos: true, videosMax: 2 }, "valeurs livrées : seuil à 2 médias, 20 stories par jour, publication directe, sujets sensibles sans circuit à part");

  // Seuils « très intéressant » : avec 3 médias, un sujet passe par défaut mais pas avec minMedias = 5 ; « en bref » se coupe
  {
    const trois = { sujets: [sujet("Le gouvernement présente son projet de budget pour 2027", 3)] };
    const base = { actualites: trois, direct: null, file: vide, now };
    A.appliquerSeuils(A.normaliserConfig(null));
    assert.ok(!A.choisirSujet(base).refus, "seuil par défaut : 3 médias suffisent");
    A.appliquerSeuils(A.normaliserConfig({ minMedias: 5, enBref: false }));
    assert.ok(A.choisirSujet(base).refus, "minMedias = 5 : 3 médias ne suffisent plus");
    assert.ok(A.choisirEnBref({ actualites: trois, file: vide, now }).refus, "enBref = false : refusé");
    A.appliquerSeuils(A.normaliserConfig(null));
  }

  // Données de test : un sujet de presse et un dossier parfaitement retenables, des votes finals récents (Assemblée, Sénat)
  const titrePresse = "Le gouvernement présente son projet de budget pour 2027";
  const dossierPresse = { id: "blocus-des-lycees", titre: "Blocus des lycées", nb: 7, medias: MEDIAS, derniere: il_y_a(1), articles: Array.from({ length: 7 }, (_, i) => ({ titre: `Blocus des lycées : épisode ${i}`, url: `https://example.org/d/${i}`, media: MEDIAS[i % 5], date: il_y_a(1) })) };
  const presse = { sujets: [sujet(titrePresse, 5)], dossiers: [dossierPresse] };
  assert.ok(choisir({ actualites: presse, direct: null, sondages: sond(), file: vide, now }).dossier, "sans monétisation : la presse reste retenue (dossier d'abord)");
  const loi = (numero, dateISO, titre = "l'ensemble du projet de loi de finances pour 2027 (première lecture).") => ({ numero, titre, dateISO, resultat: "adopte", votes: { RN: [10, 0, 0, 12] }, dossierTitre: "Loi de finances pour 2027" });
  const senatVote = (id, dateISO) => ({ id, numero: 1, session: 2026, titre: "sur l'ensemble du projet de loi relatif à l'énergie", dateISO, resultat: "adopte", groupes: { LR: { pour: 5, contre: 0, abst: 0 } } });
  const loisEcartees = { lois: [loi(9001, jour(24 * 30)), loi(9002, jour(0), "l'amendement n° 12 à l'article 3"), loi(9003, jour(1), "l'ensemble du texte visant les mineurs victimes de violences")] };
  const lois = { lois: [...loisEcartees.lois, loi(9004, jour(1))] };
  const senat = { scrutins: [senatVote("senat-2026-1", jour(0))] };
  const probas = { candidats: [{ nom: "X", secondTour: 20 }], lastUpdated: il_y_a(2) };
  const mon = { monetisation: true, validationHumaine: false };
  const choixM = (extra = {}) => choisir({ actualites: presse, direct: null, sondages: sond(), lois, senat, probas, file: vide, now, config: mon, ...extra });

  // 1. Monétisation : aucun titre externe n'est retenu, même si presse et dossier sont parfaits
  {
    const titresExternes = new Set([...presse.sujets.flatMap((s) => s.articles.map((a) => a.titre)), ...dossierPresse.articles.map((a) => a.titre), dossierPresse.titre]);
    assert.ok(choixM({ lois: null, senat: null, probas: null }).refus, "aucune donnée propre : rien, et surtout pas de presse");
    for (const extra of [{}, { lois: loisEcartees }, { lois: null }, { lois: null, senat: null }, { sondages: sond(inst("Ifop", 24)) }]) {
      const c = choixM(extra);
      assert.ok(!c.refus, c.refus);
      assert.ok(!c.sujet && !c.dossier && c.indice === undefined === !c.sondage, "ni sujet ni dossier de presse en monétisation");
      const d = A.decrire(c);
      assert.ok(!titresExternes.has(d.titre), `aucun titre externe : ${d.titre}`);
      assert.ok(!d.champs.dossierId, "pas de dossier");
      if (!c.sondage) assert.deepStrictEqual([d.medias, d.sources], [[], []], "aucun média ni lien de presse");
    }
    assert.strictEqual(choixM({ sondages: sond(inst("Ifop", 24)) }).sondage.nom, "Ifop", "le sondage garde la priorité");
    const c = choixM();
    assert.strictEqual(c.propre.type, "scrutin", "vote final de l'Assemblée d'abord");
    assert.strictEqual(c.propre.numero, 9004, "vote récent, sobre, vote final");
    // vote ancien (30 j), amendement, titre à risque (« mineurs », « victimes ») : jamais retenus ; le Sénat suit
    assert.strictEqual(choixM({ lois: loisEcartees }).propre.type, "senat");
    assert.strictEqual(choixM({ lois: loisEcartees, senat: null }).propre.type, "probabilites", "puis la simulation");
    assert.strictEqual(choixM({ lois: loisEcartees, senat: null, probas: null }).refus !== undefined, true);
    // déjà publié (file ou brouillon) : pas de doublon
    const deja = { entrees: [{ id: c.id, cree: il_y_a(1), titre: "t", sources: [], donneesPropres: true }] };
    assert.notStrictEqual(choixM({ file: deja }).id, c.id, "pas de doublon");
    // la presse encore en file est retirée ; sondages et données propres restent
    const file = [{ id: "a".repeat(12), cree: il_y_a(1), titre: "presse", dossierId: "x" }, { id: "b".repeat(12), cree: il_y_a(1), titre: "presse simple" }, { id: "c".repeat(12), cree: il_y_a(1), titre: "sondage", sondageId: "Ifop|2026-10-01" }, { id: "d".repeat(12), cree: il_y_a(1), titre: "vote", donneesPropres: true }];
    assert.deepStrictEqual(A.purgerPresse(file).map((e) => e.id[0]), ["c", "d"]);
    // nuit : rien, même en monétisation
    assert.ok(choixM({ now: new Date("2026-10-02T21:30:00Z") }).refus, "pas de nuit");
  }

  // 2. Validation humaine : brouillon obligatoire, jamais la file de publication
  {
    const voteSeul = { id: "1".repeat(12), propre: { type: "scrutin" }, nommePersonne: false };
    const sondageChoisi = { sondage: { nom: "Ifop" }, sondageId: "Ifop|2026-10-01", id: "2".repeat(12) };
    const simulation = { propre: { type: "probabilites" }, nommePersonne: true, id: "3".repeat(12) };
    const presseChoisie = { sujet: presse.sujets[0], id: "4".repeat(12) };
    const off = { monetisation: false, validationHumaine: false };
    assert.strictEqual(A.destination(voteSeul, mon), "file", "vote par groupe, sans validation : file");
    assert.strictEqual(A.destination(voteSeul, { monetisation: true, validationHumaine: true }), "brouillon", "validation humaine : brouillon");
    assert.strictEqual(A.destination(voteSeul, { monetisation: false, validationHumaine: true }), "brouillon", "validation humaine seule : brouillon");
    assert.strictEqual(A.destination(sondageChoisi, mon), "brouillon", "sondage (nomme des candidats) : brouillon obligatoire");
    assert.strictEqual(A.destination(simulation, mon), "brouillon", "simulation (nomme des candidats) : brouillon obligatoire");
    assert.strictEqual(A.destination(sondageChoisi, off), "file", "comportement actuel inchangé sans monétisation");
    assert.strictEqual(A.destination(presseChoisie, off), "file", "presse : inchangé sans monétisation");
    assert.strictEqual(A.destination(presseChoisie, { monetisation: false, validationHumaine: true }), "brouillon");
    // Écriture : brouillon (image + fiche) et une ligne de résumé ; aucune file de publication n'est touchée
    const dir = join(mkdtempSync(join(tmpdir(), "brouillons-")), "instagram", "brouillons");
    const resume = join(mkdtempSync(join(tmpdir(), "resume-")), "summary.md");
    writeFileSync(resume, "");
    process.env.GITHUB_STEP_SUMMARY = resume;
    const fiche = { id: "2".repeat(12), cree: now.toISOString(), titre: "Sondage Ifop", type: "sondage", sondageId: `Ifop|${jour(24)}`, nommePersonne: true, statut: "a-valider" };
    A.ecrireBrouillon(fiche, Buffer.from([0xff, 0xd8, 0xff, 0xd9]), dir);
    delete process.env.GITHUB_STEP_SUMMARY;
    assert.deepStrictEqual(readdirSync(dir).sort(), [`${fiche.id}.jpg`, `${fiche.id}.json`]);
    assert.strictEqual(JSON.parse(readFileSync(join(dir, `${fiche.id}.json`), "utf-8")).statut, "a-valider");
    const lignes = readFileSync(resume, "utf-8").trim().split("\n");
    assert.strictEqual(lignes.length, 1, "une ligne dans $GITHUB_STEP_SUMMARY");
    assert.match(lignes[0], /Brouillon à valider/);
    assert.match(lignes[0], /nomme une personne/);
    // Les brouillons comptent comme « déjà fait » : le même sondage n'est pas refait
    const lus = A.lireBrouillons(dir);
    assert.strictEqual(lus.length, 1);
    assert.ok(choixS([inst("Ifop", 24)], { file: { entrees: lus } }).refus, "sondage déjà en brouillon : pas refait");
  }

  // 3. Réserve électorale : aucune sortie de sondage (ni simulation), du samedi 0 h au dimanche 20 h, file de publication et brouillons compris
  {
    const instants = ["2027-04-16T22:00:00Z" /* samedi 0 h 00 Paris */, "2027-04-17T10:00:00Z" /* samedi midi */, "2027-04-18T16:30:00Z" /* dimanche 18 h 30 */, "2027-04-18T17:59:00Z" /* dimanche 19 h 59 */];
    const hors = ["2027-04-16T21:59:00Z" /* vendredi 23 h 59 */, "2027-04-18T18:00:00Z" /* dimanche 20 h 00 */];
    for (const t of hors) assert.strictEqual(A.reserveSondages(new Date(t)), null, `hors réserve ${t}`);
    for (const t of instants) {
      const n = new Date(t);
      assert.ok(A.reserveSondages(n), `réserve ${t}`);
      const enFile = [{ id: "a".repeat(12), cree: n.toISOString(), titre: "sondage", type: "story", sondageId: "Ifop|2027-04-15" }, { id: "b".repeat(12), cree: n.toISOString(), titre: "simulation", reserve: true, donneesPropres: true }, { id: "c".repeat(12), cree: n.toISOString(), titre: "vote", donneesPropres: true }];
      // aucun sondage ni simulation sélectionné, même tout frais, quelle que soit la configuration
      const frais = { ...inst("Ifop", 24), dateFin: new Date(n.getTime() - 3 * 36e5).toISOString().slice(0, 10) };
      const probasFrais = { candidats: [{ nom: "X", secondTour: 20 }], lastUpdated: n.toISOString() };
      for (const config of [mon, { monetisation: false, validationHumaine: false }, { monetisation: true, validationHumaine: true }]) {
        const c = choisir({ actualites: null, direct: null, sondages: sond(frais), lois: null, senat: null, probas: probasFrais, file: vide, now: n, config });
        assert.ok(!c.sondage && !c.propre, `aucune sortie de sondage ni de simulation en réserve ${t}`);
      }
      assert.match(choisirSondage({ sondages: sond(frais), file: vide, now: n }).refus, /réserve/);
      // file de publication et brouillons : les sorties de sondage sont retirées, le vote par groupe demeure
      assert.deepStrictEqual(A.purgerReserve(enFile, n).map((e) => e.id[0]), ["c"], `file purgée en réserve ${t}`);
      assert.deepStrictEqual(A.brouillonsASupprimer(enFile, n).sort(), ["a".repeat(12), "b".repeat(12)], `brouillons de sondage supprimés ${t}`);
    }
    // la simulation est refusée pour cause de réserve en pleine journée de samedi, et acceptée le dimanche à 20 h
    const sam = new Date("2027-04-17T10:00:00Z"), dim20 = new Date("2027-04-18T18:00:00Z");
    const pr = (n) => ({ candidats: [{ nom: "X", secondTour: 20 }], lastUpdated: n.toISOString() });
    assert.match(A.choisirDonneesPropres({ lois: null, senat: null, probas: pr(sam), file: vide, now: sam }).refus, /réserve/);
    assert.strictEqual(A.choisirDonneesPropres({ lois: null, senat: null, probas: pr(dim20), file: vide, now: dim20 }).propre.type, "probabilites", "dimanche 20 h : la réserve est levée");
    // hors réserve : rien n'est retiré ; un brouillon de plus de 7 jours l'est quoi qu'il arrive
    const garde = [{ id: "a".repeat(12), cree: dim20.toISOString(), titre: "sondage", sondageId: "Ifop|2027-04-15" }];
    assert.strictEqual(A.purgerReserve(garde, dim20).length, 1, "hors réserve : conservé");
    assert.deepStrictEqual(A.brouillonsASupprimer(garde, dim20), []);
    assert.deepStrictEqual(A.brouillonsASupprimer([{ id: "e".repeat(12), cree: "2027-04-01T10:00:00Z" }], dim20), ["e".repeat(12)]);
  }
}

// ---------- Modèles d'image (À la une, En direct, Le chiffre, Face à face, Date à retenir, En bref) ----------
{
  const AUTO = createRequire(import.meta.url)("../scripts/stories-auto.cjs");
  const candidats = { candidats: [{ nom: "Jean-Luc Mélenchon" }, { nom: "Raphaël Glucksmann" }, { nom: "Édouard Philippe" }] };
  const T1 = "Le gouvernement présente son projet de budget pour 2027";
  const modele = (s, opts = {}) => choix([s], { candidats, ...opts }).modele;
  // par défaut : « À la une » ; l'entrée de file garde le même format qu'avant (aucun champ « modele », args inchangés)
  assert.strictEqual(modele(sujet(T1, 3)), "une");
  assert.ok(!("modele" in AUTO.decrire(choix([sujet(T1, 3)])).champs));
  // En direct : seulement si la prise de parole est active (non expirée)
  {
    const s = sujet("Emmanuel Macron s'exprimera ce soir à 20 h sur le budget", 1);
    const ev = (expire) => ({ evenements: [{ type: "allocution", titre: s.articles[0].titre, ...(expire ? { expire } : {}) }] });
    assert.strictEqual(modele(s, { direct: ev() }), "direct");
    assert.strictEqual(modele(s, { direct: ev(new Date(now.getTime() + 36e5).toISOString()) }), "direct");
    assert.ok(choix([s], { direct: ev(new Date(now.getTime() - 36e5).toISOString()) }).refus, "prise de parole expirée : pas de sujet à 1 média");
    assert.strictEqual(modele(sujet(T1, 4), { direct: ev(new Date(now.getTime() - 36e5).toISOString()) }), "une", "événement expiré : pas de direct");
    // les séances de l'Assemblée (type « seance-an ») ne font pas un « direct » de sujet
    assert.strictEqual(modele(sujet(T1, 4), { direct: { evenements: [{ type: "seance-an", titre: T1 }] } }), "une");
  }
  // Face à face : les deux premières personnalités doivent être des candidats déclarés, sans titre conflictuel
  {
    const pers = (...noms) => ({ illustration: { theme: "election", personnes: noms.map((nom) => ({ nom })) } });
    const TD = "Primaire de la gauche : le débat entre les candidats";
    assert.strictEqual(modele(sujet(TD, 4, pers("Jean-Luc Mélenchon", "Raphaël Glucksmann"))), "facea");
    assert.strictEqual(modele(sujet(TD, 4, pers("Jean-Luc Mélenchon", "Un Ministre"))), "une", "un seul candidat : pas de face à face");
    assert.strictEqual(modele(sujet(TD, 4, pers("Jean-Luc Mélenchon"))), "une");
    assert.strictEqual(modele(sujet(TD, 4, pers("Jean-Luc Mélenchon", "Raphaël Glucksmann")), { candidats: null }), "une", "sans liste de candidats : pas de face à face");
    const s = sujet(TD, 4, pers("Jean-Luc Mélenchon", "Raphaël Glucksmann"));
    s.articles[1].titre = "Primaire : Mélenchon s'oppose à Glucksmann sur la fiscalité";
    assert.strictEqual(modele(s), "une", "titre conflictuel : pas de face à face");
  }
  // Le chiffre : le chiffre doit figurer dans les titres d'au moins 2 médias
  {
    const ch = { chiffre: { valeur: "400 à 500", unite: "établissements" } };
    const s = sujet("Blocage des lycées : 400 à 500 établissements fermés ce lundi", 3, ch);
    s.articles[1].titre = "Lycées : de 400 à 500 établissements bloqués en France";
    assert.strictEqual(modele(s), "chiffre");
    const un = sujet("Blocage des lycées : 400 à 500 établissements fermés ce lundi", 3, ch);
    un.articles[1].titre = "Lycées : la mobilisation se poursuit dans plusieurs académies"; un.articles[2].titre = "Blocage des lycées : le gouvernement réclame un retour au calme";
    assert.strictEqual(modele(un), "une", "chiffre présent dans un seul titre : non sourcé");
    assert.strictEqual(modele(sujet(T1, 3, { chiffre: { valeur: "12 %", unite: "" } })), "une", "chiffre absent des titres");
  }
  // Date à retenir : seulement une date À VENIR
  {
    const d = (iso) => ({ date: { iso, jour: Number(iso.slice(8)), mois: "octobre" } });
    assert.strictEqual(modele(sujet(T1, 3, d("2026-10-27"))), "post-date", "date lointaine (> 3 jours) : un POST, plus une story");
    assert.strictEqual(modele(sujet(T1, 3, d("2026-10-06"))), "post-date", "dans 4 jours : post");
    assert.strictEqual(modele(sujet(T1, 3, d("2026-10-05"))), "date", "dans 3 jours : toujours une story");
    assert.strictEqual(modele(sujet(T1, 3, d("2026-10-03"))), "date", "demain");
    assert.strictEqual(modele(sujet(T1, 3, d("2026-10-02"))), "une", "aujourd'hui : pas à venir");
    assert.strictEqual(modele(sujet(T1, 3, d("2026-09-20"))), "une", "passée");
    assert.strictEqual(modele(sujet(T1, 3, d("2028-01-01"))), "une", "trop lointaine");
  }
  // Un modèle spécial s'ajoute à l'entrée ; le dessin reçoit le modèle en 6e argument
  {
    const s = sujet("Le projet de loi « casseurs-payeurs » sera examiné au Sénat le 3 octobre", 3, { date: { iso: "2026-10-03", jour: 3, mois: "octobre" } });
    const d = AUTO.decrire(choix([s], { candidats }));
    assert.strictEqual(d.champs.modele, "date");
    assert.strictEqual(d.type, "date");
    assert.deepStrictEqual(d.args, [0, s.articles[0].titre, null, null, null, "date"]);
  }
  // En bref : une fois par jour, le matin, 3 ou 4 sujets forts, sans doublon, dans les plafonds
  {
    const matin = new Date("2026-10-02T06:30:00Z"); // 8 h 30 à Paris
    const il = (h) => new Date(matin.getTime() - h * 36e5).toISOString();
    const fort = (titre, theme, nb = 3) => ({ medias: nb, derniere: il(2), illustration: { theme }, titrePropre: { titre: titre.split(":")[0].slice(0, 45), origine: "recoupement" }, articles: Array.from({ length: nb }, (_, i) => ({ titre: i ? `${titre} (suite ${i})` : titre, url: `https://example.org/${idSujet(titre)}/${i}`, media: MEDIAS[i], date: il(2) })) });
    const sujets = [fort("Le gouvernement présente son projet de budget pour 2027", "budget"), fort("Le Sénat examine la loi de programmation militaire", "senat", 4), fort("Réforme des retraites : les partenaires sociaux reçus à Matignon", "gouvernement"), fort("Élections municipales : la date du scrutin est fixée", "election", 5)];
    const bref = (opts = {}) => AUTO.choisirEnBref({ actualites: actu(...sujets), file: vide, now: matin, ...opts });
    const b = bref();
    assert.ok(!b.refus, b.refus);
    assert.strictEqual(b.bref.indices.length, 4);
    assert.strictEqual(b.id, AUTO.idBref("2026-10-02"));
    assert.ok(b.sources.length > 0 && b.sources.length <= 12);
    // le choix global : un « en bref » le matin quand aucun dossier n'attend
    assert.strictEqual(choisir({ actualites: actu(...sujets), direct: null, sondages: sond(), file: vide, now: matin }).modele, "bref");
    // un direct en cours (prise de parole non expirée) passe avant l'« en bref »
    const enDirect = { evenements: [{ type: "allocution", titre: sujets[1].articles[0].titre, expire: new Date(matin.getTime() + 36e5).toISOString() }] };
    assert.strictEqual(choisir({ actualites: actu(...sujets), direct: enDirect, sondages: sond(), file: vide, now: matin }).modele, "direct", "direct avant « en bref »");
    // pas le reste de la journée, ni la nuit
    for (const t of ["2026-10-02T09:00:00Z" /* 11 h */, "2026-10-02T13:30:00Z", "2026-10-02T04:30:00Z" /* 6 h 30 */]) assert.ok(AUTO.choisirEnBref({ actualites: actu(...sujets), file: vide, now: new Date(t) }).refus, `pas d'« en bref » à ${t}`);
    // une seule fois par jour (Paris) ; le lendemain, oui
    const entree = { id: b.id, cree: matin.toISOString(), titre: "En bref", sources: [], bref: true };
    assert.ok(bref({ file: { entrees: [entree] } }).refus, "déjà publié aujourd'hui");
    assert.ok(!AUTO.choisirEnBref({ actualites: actu(...sujets), file: { entrees: [{ ...entree, cree: new Date(matin.getTime() - 24 * 36e5).toISOString() }] }, now: matin }).refus, "hier ne compte pas");
    // plafond de 4 entrées par jour
    const quatre = [1, 2, 3, 4].map((i) => ({ id: `${i}`.repeat(12), cree: new Date(matin.getTime() - i * 36e5 / 2).toISOString(), titre: `t${i}`, sources: [] }));
    assert.ok(bref({ file: { entrees: quatre } }).refus, "plafond du jour");
    // au moins 3 sujets forts
    assert.ok(AUTO.choisirEnBref({ actualites: actu(...sujets.slice(0, 2)), file: vide, now: matin }).refus, "2 sujets : pas assez");
    // sujets à 2 médias, sans titre rédigé par le site, justice : écartés
    const faibles = [fort("Le gouvernement présente son projet de budget pour 2027", "budget", 2), { ...sujets[1], titrePropre: undefined }, { ...sujets[2], illustration: { theme: "justice" } }];
    assert.ok(AUTO.choisirEnBref({ actualites: actu(...faibles, sujets[3]), file: vide, now: matin }).refus, "sujets faibles écartés");
    const risque = fort("Réforme : un ministre mis en cause par une plainte", "gouvernement");
    assert.strictEqual(AUTO.choisirEnBref({ actualites: actu(...sujets, risque), file: vide, now: matin }).bref.indices.includes(4), false, "titre à risque écarté");
    // un sujet déjà publié n'entre pas dans l'« en bref » ; les sujets de l'« en bref » ne sont plus repris seuls (liens enregistrés)
    const deja = { id: idSujet(sujets[0].articles[0].titre), cree: il(1), titre: "x", sources: [] };
    assert.strictEqual(bref({ file: { entrees: [deja] } }).bref.indices.includes(0), false, "déjà publié : écarté");
    const apres = { ...entree, sources: b.sources };
    assert.ok(choisirSujet({ actualites: actu(sujets[0]), direct: null, file: { entrees: [apres] }, now: matin }).refus, "pas de doublon avec l'« en bref »");
    // un dossier non publié passe avant l'« en bref »
    const dossier = { id: "primaire", titre: "Primaire de la gauche", nb: 6, derniere: il(1), medias: MEDIAS.slice(0, 4), articles: Array.from({ length: 6 }, (_, i) => ({ titre: `Primaire de la gauche : débat numéro ${i}`, url: `https://example.org/d/${i}`, media: MEDIAS[i % 4], date: il(1) })) };
    const cd = choisir({ actualites: { sujets, dossiers: [dossier] }, direct: null, sondages: sond(), file: vide, now: matin });
    assert.strictEqual(cd.dossier?.id, "primaire", "dossier d'abord");
    // l'entrée décrite
    const d = AUTO.decrire(b);
    assert.strictEqual(d.type, "en-bref");
    assert.strictEqual(d.champs.bref, true);
    assert.deepStrictEqual(d.args.slice(0, 6), [0, "", null, null, null, "bref"]);
    assert.deepStrictEqual(d.args[6].indices, b.bref.indices);
  }
  // Réserve électorale : aucun titre qui rapporte un sondage (même cité par la presse), tous modèles confondus
  {
    const sam = new Date("2027-04-17T10:00:00Z"); // samedi midi avant le premier tour
    const frais = (titre, nb = 4) => ({ ...sujet(titre, nb), derniere: new Date(sam.getTime() - 36e5).toISOString(), articles: Array.from({ length: nb }, (_, i) => ({ titre: i ? `${titre} (suite ${i})` : titre, url: `https://example.org/${idSujet(titre)}/${i}`, media: MEDIAS[i], date: new Date(sam.getTime() - 36e5).toISOString() })) });
    const avecSondage = frais("Présidentielle : un nouveau sondage donne dix points d'avance au candidat sortant");
    assert.ok(AUTO.parleDeSondage(avecSondage.articles[0].titre) && !AUTO.parleDeSondage("Le gouvernement présente son projet de budget pour 2027"));
    assert.ok(choisirSujet({ actualites: actu(avecSondage), direct: null, file: vide, now: sam }).refus, "réserve : sujet qui rapporte un sondage refusé");
    assert.strictEqual(choisirSujet({ actualites: actu(frais("Le gouvernement présente son projet de budget pour 2027")), direct: null, file: vide, now: sam }).indice, 0, "réserve : un sujet sans sondage reste possible");
    const doss = { id: "sond", titre: "Présidentielle 2027", nb: 6, derniere: new Date(sam.getTime() - 36e5).toISOString(), medias: MEDIAS.slice(0, 4), articles: Array.from({ length: 6 }, (_, i) => ({ titre: i === 2 ? "Présidentielle : le dernier sondage Ifop" : `Présidentielle 2027 : la campagne s'organise (${i})`, url: `https://example.org/s/${i}`, media: MEDIAS[i % 4], date: new Date(sam.getTime() - 36e5).toISOString() })) };
    assert.strictEqual(AUTO.choisirDossier({ actualites: { dossiers: [doss] }, file: vide, now: sam }), null, "réserve : dossier avec un sondage refusé");
  }
  // Monétisation : jamais de modèle de presse (ni « en bref »)
  {
    const matin = new Date("2026-10-02T06:30:00Z");
    const sujets = [1, 2, 3].map((i) => sujet(`Sujet de presse numéro ${i} sur le budget de la défense`, 4, { derniere: new Date(matin.getTime() - 36e5).toISOString() }));
    const c = choisir({ actualites: actu(...sujets), direct: null, sondages: sond(), lois: null, senat: null, probas: null, file: vide, now: matin, config: { monetisation: true, validationHumaine: false } });
    assert.ok(c.refus || c.propre, "monétisation : ni presse ni « en bref »");
  }
}

// ---- Audit des stories : garde-fous ajoutés ----
{
  const AUTO = createRequire(import.meta.url)("../scripts/stories-auto.cjs");
  const T = "Le gouvernement présente son projet de budget pour 2027";
  // Titre rédigé trop vague (« Énergie » seul, une rubrique) : pas de story
  assert.ok(AUTO.titreGenerique("Énergie") && AUTO.titreGenerique("Vie politique") && AUTO.titreGenerique("Économie") && AUTO.titreGenerique(""));
  assert.ok(!AUTO.titreGenerique("Primaire de la gauche") && !AUTO.titreGenerique("Blocage des lycées"));
  assert.ok(choix([sujet(T, 4, { titrePropre: { titre: "Énergie", origine: "dossier" } })]).refus, "titre générique : refusé");
  // Sujets proches (« Blocage » / « Blocus » des lycées) reconnus ; sujets différents non
  assert.ok(AUTO.titresProches("Blocage des lycées", "Blocus des lycées"));
  assert.ok(AUTO.titresProches("Primaire de la gauche", "Primaire de la gauche"));
  assert.ok(!AUTO.titresProches("Primaire de la gauche", "Budget de la Défense"));
  // Un sujet proche d'une story des dernières 72 h ne repasse pas (même avec un titre de presse différent) ; au-delà de 72 h, oui
  {
    const s = sujet(T, 4, { titrePropre: { titre: "Blocus des lycées", origine: "recoupement" } });
    const recente = { id: "a".repeat(12), cree: il_y_a(5), titre: "autre titre de presse", titrePropre: "Blocage des lycées", sources: [] };
    assert.ok(choix([s], { file: { entrees: [recente] } }).refus, "doublon proche : refusé");
    assert.ok(choix([s], { file: { entrees: [{ ...recente, cree: il_y_a(30) }] } }).refus, "30 h : toujours refusé (fenêtre de 72 h)");
    assert.strictEqual(choix([s], { file: { entrees: [{ ...recente, cree: il_y_a(80) }] } }).indice, 0, "plus de 72 h : de nouveau possible");
  }
  // « En bref » : un seul des deux sujets proches
  {
    const matin = new Date("2026-10-02T06:30:00Z");
    const il = (h) => new Date(matin.getTime() - h * 36e5).toISOString();
    const f = (titre, propre, theme) => ({ medias: 3, derniere: il(2), illustration: { theme }, titrePropre: { titre: propre, origine: "recoupement" }, articles: Array.from({ length: 3 }, (_, i) => ({ titre: i ? `${titre} (suite ${i})` : titre, url: `https://example.org/${idSujet(titre)}/${i}`, media: MEDIAS[i], date: il(2) })) });
    const sujets = [f("Blocage des lycées : les syndicats appellent à la grève", "Blocage des lycées", "gouvernement"), f("Blocus des lycées : le ministre reçoit les syndicats ce matin", "Blocus des lycées", "politique"), f("Le Sénat examine la loi de programmation militaire", "Loi de programmation militaire", "senat"), f("Élections municipales : la date du scrutin est fixée", "Municipales : la date fixée", "election")];
    const b = AUTO.choisirEnBref({ actualites: actu(...sujets), file: vide, now: matin });
    assert.ok(!b.refus, b.refus);
    assert.strictEqual(b.bref.indices.length, 3, "un seul des deux sujets « lycées »");
    assert.ok(!(b.bref.indices.includes(0) && b.bref.indices.includes(1)));
  }
  // Mots de reproche ou de polémique visant une personne nommée : plus écartés (décision du propriétaire) ; la liste complète les écarte toujours
  for (const t of ["Primaire de la gauche : Glucksmann se dit désolé après ses propos inélégants", "Polémique autour des déclarations du ministre sur la réforme", "Retraites : le président du groupe fustige la méthode du gouvernement", "Budget : la députée s'excuse après un dérapage en séance"]) {
    assert.strictEqual(AUTO.motExclu(t), null, `retenu : ${t}`);
  }
  assert.ok(!AUTO.motExclu("Le gouvernement présente son projet de budget pour 2027"));
  // Face à face : il faut un débat, un duel ou une primaire dans les titres (deux candidats cités ensemble ne suffisent pas)
  {
    const candidats = { candidats: [{ nom: "Jean-Luc Mélenchon" }, { nom: "Raphaël Glucksmann" }] };
    const pers = { illustration: { theme: "election", personnes: [{ nom: "Jean-Luc Mélenchon" }, { nom: "Raphaël Glucksmann" }] } };
    assert.strictEqual(AUTO.faceAFace(sujet("Mélenchon et Glucksmann saluent la future loi sur le budget", 4, pers), candidats), false, "pas d'opposition annoncée : pas de face à face");
    assert.strictEqual(AUTO.faceAFace(sujet("Primaire de la gauche : Mélenchon et Glucksmann au débat de ce soir", 4, pers), candidats), true);
  }
  // Dossier : au moins 3 titres distincts (reprises d'une même dépêche) et titre non générique
  {
    const art = (titre, i) => ({ titre, url: `https://example.org/d/${i}`, media: ["A", "B", "C", "D", "E"][i % 5], date: il_y_a(1) });
    const dossier = (titres, titre = "Blocage des lycées") => ({ dossiers: [{ id: "lycees", titre, derniere: il_y_a(1), medias: ["A", "B", "C", "D", "E"], nb: titres.length, articles: titres.map(art) }], sujets: [] });
    const meme = Array(5).fill("Le projet de loi de finances est présenté ce matin en conseil des ministres");
    assert.strictEqual(AUTO.choisirDossier({ actualites: dossier(meme), file: vide, now }), null, "une seule dépêche reprise 5 fois : pas de dossier");
    const divers = ["Le projet de loi de finances est présenté ce matin", "Budget 2027 : ce que contient le texte du gouvernement", "Loi de finances : les premières réactions des oppositions", "Budget : les syndicats demandent des garanties", "Finances publiques : le calendrier de l'examen au Parlement"];
    assert.ok(AUTO.choisirDossier({ actualites: dossier(divers), file: vide, now }));
    assert.strictEqual(AUTO.choisirDossier({ actualites: dossier(divers, "Énergie"), file: vide, now }), null, "titre de dossier générique");
    assert.strictEqual(AUTO.choisirDossier({ actualites: dossier(divers), file: { entrees: [{ id: "b".repeat(12), cree: il_y_a(2), titrePropre: "Blocus des lycées", sources: [] }] }, now }), null, "dossier proche d'une story récente");
  }
  // Texte alternatif : dans la fiche (champ « alt »), sans rien ajouter au contenu
  {
    const d = AUTO.decrire(choix([sujet(T, 4)]));
    assert.match(d.champs.alt, /Budget 2027/);
    assert.match(d.champs.alt, /Repris par 4 médias/);
    assert.match(d.champs.alt, /avec le nom de chaque média/);
    const flux = AUTO.fluxAtom([{ id: "c".repeat(12), cree: now.toISOString(), titre: "t", alt: "Texte <alt> & plus", url_image: "https://x/y.jpg" }], now);
    assert.match(flux, /<summary>Texte &lt;alt&gt; &amp; plus<\/summary>/);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// POSTS : date lointaine et loi adoptée/rejetée, puis story d'annonce
{
  const AUTO = createRequire(import.meta.url)("../scripts/stories-auto.cjs");
  const TITRE_DATE = "Le projet de loi « casseurs-payeurs » sera examiné au Sénat le 27 octobre";
  const dateSujet = (extra = {}) => sujet(TITRE_DATE, 3, { date: { iso: "2026-10-27", jour: 27, mois: "octobre" }, titrePropre: { titre: "Loi casseurs-payeurs au Sénat", origine: "recoupement" }, ...extra });
  const post = (id, extra = {}) => ({ id, cree: il_y_a(2), titre: "t", type: "post", titrePropre: "Autre sujet", sources: [], ...extra });

  // 1. Date lointaine : un POST (modèle « post-date »), avec légende, fiche de dessin et texte alternatif
  {
    const c = choix([dateSujet()]);
    assert.strictEqual(c.modele, "post-date");
    assert.strictEqual(c.id, idSujet(TITRE_DATE));
    const d = AUTO.decrire(c, now);
    assert.strictEqual(d.type, "post");
    assert.strictEqual(d.post.fiche.spec.genre, "date");
    assert.strictEqual(d.post.fiche.spec.compte, undefined, "pas de compte à rebours figé dans un post (J-19)");
    assert.strictEqual(d.post.fiche.spec.semaine, "Mardi");
    assert.strictEqual(d.champs.postGenre, "date");
    assert.strictEqual(d.champs.dateIso, "2026-10-27");
    assert.strictEqual(d.champs.titrePropre, "Loi casseurs-payeurs au Sénat");
    assert.match(d.champs.legende, /Date à retenir : 27 octobre 2026/);
    assert.match(d.champs.legende, /Date annoncée par la presse \(franceinfo, Le Monde, Le Figaro\)/);
    assert.match(d.champs.legende, /@hemicyclefrance/);
    assert.ok(!/github\.io|hemicycle-france|https?:\/\//.test(d.champs.legende), "pas de lien du site dans la légende");
    assert.ok(d.champs.legende.length < 2200 && (d.champs.legende.match(/#/g) || []).length >= 6 && (d.champs.legende.match(/#/g) || []).length <= 8, "légende courte, 6 à 8 hashtags");
    assert.match(d.champs.legende, /#Agenda/);
    assert.ok(!/Toute l'actu/.test(d.champs.legende));
    assert.match(d.champs.alt, /date à retenir/);
    // à 3 jours ou moins : toujours une story « Date à retenir »
    const proche = dateSujet({ date: { iso: "2026-10-05", jour: 5, mois: "octobre" } });
    assert.strictEqual(choix([proche]).modele, "date");
    assert.strictEqual(AUTO.decrire(choix([proche]), now).type, "date");
  }
  // 2. Plafonds distincts : 2 posts par jour ; les stories (4 par jour) et les annonces n'y comptent pas
  {
    const deuxPosts = { entrees: [post("1".repeat(12)), post("2".repeat(12))] };
    assert.ok(choix([dateSujet()], { file: deuxPosts }).refus, "3e post du jour refusé");
    assert.strictEqual(choix([dateSujet()], { file: { entrees: [post("1".repeat(12))] } }).modele, "post-date", "2e post du jour : possible");
    assert.ok(!choix([dateSujet()], { file: { entrees: [post("1".repeat(12), { cree: il_y_a(30) }), post("2".repeat(12), { cree: il_y_a(31) })] } }).refus, "les posts d'hier ne comptent pas");
    // 4 stories déjà faites : un post reste possible, une story non
    const quatre = { entrees: [1, 2, 3, 4].map((i) => ({ id: `${i}`.repeat(12), cree: il_y_a(i / 2), titre: `t${i}`, type: "story", sources: [] })) };
    assert.strictEqual(choix([dateSujet()], { file: quatre }).modele, "post-date", "plafond des stories atteint : le post passe");
    assert.ok(choix([sujet("Le gouvernement présente son projet de budget pour 2027", 3)], { file: quatre }).refus, "mais pas une story");
    // posts et annonces ne comptent pas dans les 4 stories
    const posts = { entrees: [post("1".repeat(12)), { id: "2".repeat(12), cree: il_y_a(2), titre: "Nouveau post", type: "story", annonceDe: "1".repeat(12), sources: [] }, ...[3, 4, 5].map((i) => ({ id: `${i}`.repeat(12), cree: il_y_a(i / 2), titre: `t${i}`, type: "story", sources: [] }))] };
    assert.ok(!choix([sujet("Le gouvernement présente son projet de budget pour 2027", 3)], { file: posts }).refus, "3 stories + 1 post + 1 annonce : la 4e story passe");
    // les posts du registre (file élaguée) comptent aussi
    const registre = { entrees: [{ id: "a".repeat(12), statut: "publiee", publieLe: il_y_a(3), type: "post", titre: "x" }, { id: "b".repeat(12), statut: "publiee", publieLe: il_y_a(5), type: "post", titre: "y" }] };
    assert.ok(choix([dateSujet()], { registre }).refus, "2 posts publiés aujourd'hui (registre) : plus de post");
    assert.strictEqual(AUTO.nbPostsDuJour(deuxPosts.entrees, registre, now), 4);
  }
  // 3. Jamais de doublon : id, titre proche (36 h), même date + même sujet
  {
    const id = idSujet(TITRE_DATE);
    assert.ok(choix([dateSujet()], { file: { entrees: [post(id)] } }).refus, "id déjà en file");
    assert.ok(choix([dateSujet()], { registre: { entrees: [{ id, statut: "publiee", publieLe: il_y_a(40), type: "post", titre: "x" }] } }).refus, "id déjà au registre");
    assert.ok(choix([dateSujet()], { registre: { entrees: [{ id: "c".repeat(12), statut: "publiee", publieLe: il_y_a(30), type: "post", titre: "Loi casseurs-payeurs au Sénat" }] } }).refus, "titre proche publié il y a 30 h");
    assert.ok(!choix([dateSujet()], { registre: { entrees: [{ id: "c".repeat(12), statut: "publiee", publieLe: il_y_a(100), type: "post", titre: "Loi casseurs-payeurs au Sénat", dateIso: "2026-11-20" }] } }).refus, "plus de 72 h et autre date (> 3 jours) : possible");
    assert.ok(choix([dateSujet()], { registre: { entrees: [{ id: "c".repeat(12), statut: "publiee", publieLe: il_y_a(40), type: "post", titre: "Loi casseurs-payeurs au Sénat", dateIso: "2026-10-30" }] } }).refus, "même titre à 3 jours près : même événement");
    assert.ok(choix([dateSujet()], { registre: { entrees: [{ id: "c".repeat(12), statut: "publiee", publieLe: il_y_a(40), type: "post", titre: "Loi casseurs-payeurs au Sénat", dateIso: "2026-10-27" }] } }).refus, "même date et même sujet, quel que soit le délai");
    assert.ok(choix([dateSujet()], { file: { entrees: [post("d".repeat(12), { cree: il_y_a(40), titrePropre: "Loi casseurs-payeurs au Sénat", dateIso: "2026-10-27" })] } }).refus, "même date et même sujet en file");
  }
  // 4. Nuit, réserve électorale, mots à risque : jamais de post
  {
    assert.ok(AUTO.choisirSujet({ actualites: actu(dateSujet()), direct: null, file: vide, now: new Date("2026-10-02T22:00:00Z") }).refus, "nuit (0 h à Paris)");
    const risque = sujet("Mort du rapporteur : le projet de loi casseurs-payeurs sera examiné au Sénat le 27 octobre", 3, { date: { iso: "2026-10-27", jour: 27, mois: "octobre" }, titrePropre: { titre: "Loi casseurs-payeurs au Sénat", origine: "recoupement" } });
    assert.ok(choix([risque]).refus, "mot à risque : rien");
    const nuitReserve = new Date("2027-04-17T10:00:00Z");
    const sond = sujet("Sondage : le projet de loi casseurs-payeurs sera examiné au Sénat le 27 avril", 3, { date: { iso: "2027-04-27", jour: 27, mois: "avril" }, derniere: new Date(nuitReserve.getTime() - 36e5).toISOString(), titrePropre: { titre: "Loi casseurs-payeurs au Sénat", origine: "recoupement" } });
    sond.articles.forEach((a, i) => { a.date = sond.derniere; a.url += "/r" + i; });
    assert.ok(AUTO.choisirSujet({ actualites: actu(sond), direct: null, file: vide, now: nuitReserve }).refus, "réserve électorale : aucun sondage, même en post");
  }

  // 5. Lois adoptées ou rejetées : posts
  const AN = (numero, titre, resultat, votes, extra = {}) => ({ numero, titre, date: "1 octobre 2026", dateISO: "2026-10-01", typeVote: "SPS", dossierRef: "DLR5L17N1", dossierTitre: "Dossier", resultat, votes, ...extra });
  const V = (p, c, a) => ({ RN: [p, 0, 0, 100], LFI: [0, c, a, 70] });
  const lois = { lois: [
    AN(100, "l'ensemble du projet de loi relatif à la simplification de la vie économique (première lecture).", "adopte", V(300, 100, 10)),
    AN(101, "l'amendement n° 12 de M. Dupont après l'article 3 du projet de loi relatif à la simplification de la vie économique.", "adopte", V(300, 100, 10)),
    AN(102, "l'ensemble de la proposition de loi visant à renforcer le contrôle des prix de l'énergie.", "rejete", V(80, 200, 5), { dateISO: "2026-09-30", date: "30 septembre 2026" }),
    AN(103, "l'ensemble du projet de loi ancien sur les marchés publics.", "adopte", V(300, 100, 10), { dateISO: "2026-08-01" }),
    AN(104, "l'ensemble de la proposition de loi incohérente.", "adopte", V(80, 200, 5)),
    AN(105, "l'ensemble de la proposition de loi visant à protéger les mineurs en ligne.", "adopte", V(300, 100, 10)),
    AN(106, "la motion de censure déposée par M. Untel.", "rejete", V(80, 200, 5), { typeVote: "MOC" }),
  ] };
  const senat = { scrutins: [
    { id: "senat-2026-77", session: 2026, numero: 77, titre: "sur l'ensemble du projet de loi de programmation militaire", date: "1 octobre 2026", dateISO: "2026-10-01", resultat: "adopte", pour: 214, contre: 111, abst: 20, npv: 3, groupes: {}, dossierUrl: "https://www.senat.fr/dossier-legislatif/pjl26-1.html", sourceUrl: "https://www.senat.fr/scrutin-public/2026/scr2026-77.html" },
  ] };
  const loi = (opts = {}) => AUTO.choisirPostLoi({ lois, senat, file: vide, now, ...opts });
  {
    const r = loi();
    assert.ok(!r.refus, r.refus);
    assert.strictEqual(r.modele, "post-loi");
    assert.strictEqual(r.post.spec.numero, 100, "le plus récent (puis le plus grand numéro) d'abord, vote final seulement");
    assert.strictEqual(r.post.spec.verdict, "adopte");
    assert.deepStrictEqual([r.post.spec.pour, r.post.spec.contre, r.post.spec.abst], [300, 100, 10]);
    assert.strictEqual(r.post.spec.titre, "Projet de loi relatif à la simplification de la vie économique");
    assert.strictEqual(r.post.spec.etape, "première lecture");
    assert.strictEqual(r.id, AUTO.choisirPostLoi({ lois, senat, file: vide, now }).id, "id stable");
    const d = AUTO.decrire(r, now);
    assert.strictEqual(d.type, "post");
    assert.strictEqual(d.champs.donneesPropres, true);
    assert.strictEqual(d.champs.voteId, "an-100");
    assert.match(d.champs.legende, /Assemblée nationale a adopté, le 1 octobre 2026, le texte en entier\.\nÉtape du texte : premier examen du texte/);
    assert.match(d.champs.legende, /Pour : 300 · Contre : 100 · Abstentions \(ni pour ni contre\) : 10/);
    assert.match(d.champs.legende, /Source officielle : Assemblée nationale, vote n°100 — https:\/\/www\.assemblee-nationale\.fr\/dyn\/17\/scrutins\/100/);
    assert.match(d.champs.legende, /@hemicyclefrance/);
    assert.ok(!/github\.io|hemicycle-france/.test(d.champs.legende));
    assert.match(d.champs.legende.split("\n")[0], /^Assemblée nationale : texte adopté le 1 octobre 2026$/);
    const nbH = (d.champs.legende.match(/#\S+/g) || []).length;
    assert.ok(nbH >= 6 && nbH <= 8, "6 à 8 hashtags");
    assert.match(d.champs.legende, /#AssembléeNationale/);
    assert.deepStrictEqual(d.sources, ["https://www.assemblee-nationale.fr/dyn/17/scrutins/100"]);
    assert.deepStrictEqual(AUTO.ficheAnnonce(d.post.fiche, r.id), { id: r.id, titre: "Simplification de la vie économique (loi proposée par le Gouvernement)", sous: "Assemblée nationale · texte adopté · 1 octobre 2026" });
  }
  // rejetée : formulation neutre, résultat officiel
  {
    const r = loi({ lois: { lois: [lois.lois[2]] }, senat: null });
    assert.strictEqual(r.post.spec.verdict, "rejete");
    const l = AUTO.decrire(r, now).champs.legende;
    assert.match(l, /a rejeté, le 30 septembre 2026/);
    assert.match(l, /texte rejeté le 30 septembre 2026/);
    assert.ok(!/(enfin|scandale|victoire|défaite|honte|bravo|malheureusement|heureusement)/i.test(l), "aucun qualificatif politique");
  }
  // le Sénat aussi ; vote ancien, non final, incohérent, à mot prudent (mineurs) ou motion : jamais
  {
    const r = loi({ lois: { lois: [] } });
    assert.strictEqual(r.post.spec.chambre, "Sénat");
    assert.deepStrictEqual([r.post.spec.pour, r.post.spec.contre, r.post.spec.abst], [214, 111, 20]);
    assert.match(AUTO.decrire(r, now).champs.legende, /Le Sénat a adopté/);
    assert.match(r.post.source, /^https:\/\/www\.senat\.fr\//);
    for (const n of [101, 103, 104, 105, 106]) assert.ok(loi({ lois: { lois: [lois.lois.find((x) => x.numero === n)] }, senat: null }).refus, `vote ${n} : jamais en post`);
    assert.ok(loi({ senat: { scrutins: [{ ...senat.scrutins[0], dateISO: "2026-07-01" }] }, lois: { lois: [] } }).refus, "vote de plus de 2 jours");
    assert.ok(loi({ senat: { scrutins: [{ ...senat.scrutins[0], pour: 10, contre: 100 }] }, lois: { lois: [] } }).refus, "adopté avec plus de contre que de pour : incohérent");
  }
  // jamais deux fois : id en file, au registre, même vote, titre proche (36 h), plafond de 2 posts par jour, nuit
  {
    const r = loi();
    assert.ok(loi({ file: { entrees: [post(r.id)] } }).post.spec.numero !== 100, "id déjà en file : on passe au vote suivant");
    assert.ok(loi({ lois: { lois: [lois.lois[0]] }, senat: null, file: { entrees: [post(r.id)] } }).refus);
    assert.ok(loi({ lois: { lois: [lois.lois[0]] }, senat: null, registre: { entrees: [{ id: r.id, statut: "publiee", publieLe: il_y_a(50), type: "post", titre: "x" }] } }).refus, "id au registre");
    assert.ok(loi({ lois: { lois: [lois.lois[0]] }, senat: null, file: { entrees: [post("e".repeat(12), { voteId: "an-100" })] } }).refus, "même vote");
    // Carrousel de loi déjà sorti pour ce vote : pas de post (état des contenus, registre ou file)
    const seul = { lois: { lois: [lois.lois[0]] }, senat: null };
    assert.ok(!loi({ ...seul, faits: {} }).refus, "témoin : pas de carrousel, post possible");
    assert.ok(loi({ ...seul, faits: { "carrousel-loi|an-100": { id: "x", le: il_y_a(30) } } }).refus, "contenus-etat : carrousel-loi|voteId");
    assert.ok(!loi({ ...seul, faits: { "carrousel-loi|an-999": { id: "x" } } }).refus, "autre vote : post possible");
    assert.ok(loi({ ...seul, faits: {}, registre: { entrees: [{ id: "f".repeat(12), statut: "publiee", publieLe: il_y_a(30), type: "carrousel", voteId: "an-100" }] } }).refus, "carrousel du même vote au registre");
    assert.ok(loi({ ...seul, faits: {}, registre: { entrees: [{ id: "f".repeat(12), statut: "publiee", publieLe: il_y_a(30), type: "carrousel-loi", cle: "an-100" }] } }).refus, "carrousel (clé) au registre");
    assert.ok(loi({ lois: { lois: [lois.lois[0]] }, senat: null, registre: { entrees: [{ id: "f".repeat(12), statut: "publiee", publieLe: il_y_a(20), type: "post", titre: "Projet de loi relatif à la simplification de la vie économique" }] } }).refus, "même loi publiée il y a 20 h");
    assert.ok(loi({ lois: { lois: [lois.lois[0]] }, senat: null, file: { entrees: [{ id: "9".repeat(12), cree: il_y_a(5), titre: "t", type: "story", titrePropre: "Simplification de la vie économique", sources: [] }] } }).refus, "même sujet déjà en story");
    assert.ok(loi({ file: { entrees: [post("1".repeat(12)), post("2".repeat(12))] } }).refus, "plafond de 2 posts");
    assert.ok(loi({ now: new Date("2026-10-02T22:30:00Z") }).refus, "nuit");
  }
  // choisir() : un vote final récent devient un post, après sondage / dossier / direct ; en monétisation aussi
  {
    const g = choisir({ actualites: actu(), direct: null, sondages: { instituts: [] }, lois, senat, file: vide, now });
    assert.strictEqual(g.modele, "post-loi");
    const enDirect = sujet("Emmanuel Macron s'exprimera ce soir à 20 h sur le budget", 1);
    const direct = { evenements: [{ type: "allocution", titre: enDirect.articles[0].titre }] };
    assert.strictEqual(choisir({ actualites: actu(enDirect), direct, sondages: { instituts: [] }, lois, senat, file: vide, now }).modele, "direct", "un direct passe avant le post");
    const m = choisir({ actualites: actu(), direct: null, sondages: { instituts: [] }, lois, senat, file: vide, now, config: AUTO.normaliserConfig({ monetisation: true }) });
    assert.strictEqual(m.modele, "post-loi", "monétisation : le post sur données officielles reste possible");
    // un vote déjà publié en post n'a pas aussi sa story « données propres »
    const sc = AUTO.choisirDonneesPropres({ lois: { lois: [{ ...lois.lois[0], votes: { RN: { pour: 300, contre: 0, abst: 0, membres: 100 } } }] }, senat: null, probas: null, file: { entrees: [post("e".repeat(12), { voteId: "an-100" })] }, now });
    assert.ok(sc.refus, "pas de story pour un vote déjà en post");
  }
  // Monétisation : le post « date » (presse) et son annonce sont retirés ; le post « loi » (données officielles) et son annonce restent
  {
    const entrees = [
      post("1".repeat(12), { donneesPropres: true }), { id: "2".repeat(12), cree: il_y_a(2), titre: "a", type: "story", annonceDe: "1".repeat(12), donneesPropres: true, sources: [] },
      post("3".repeat(12)), { id: "4".repeat(12), cree: il_y_a(2), titre: "a", type: "story", annonceDe: "3".repeat(12), sources: [] },
    ];
    assert.deepStrictEqual(AUTO.purgerPresse(entrees).map((e) => e.id), ["1".repeat(12), "2".repeat(12)]);
  }
  // Flux Atom : catégorie « post » / « story », légende du post dans <content>
  {
    const flux = AUTO.fluxAtom([post("5".repeat(12), { cree: now.toISOString(), titre: "Un <post>", url_image: "https://x/p.jpg", legende: "Légende & @hemicyclefrance" }), { id: "6".repeat(12), cree: now.toISOString(), titre: "Annonce", type: "story", annonceDe: "5".repeat(12), url_image: "https://x/a.jpg" }], now);
    assert.match(flux, /tag:hemicycle-france,2026:post:5{12}/);
    assert.match(flux, /<category term="post"\/>/);
    assert.match(flux, /<category term="story"\/>/);
    assert.match(flux, /<content type="text">Légende &amp; @hemicyclefrance<\/content>/);
    assert.strictEqual((flux.match(/<content/g) || []).length, 1, "seul le post porte une légende");
  }
  // Annonce : identifiant stable et distinct du post
  assert.strictEqual(AUTO.idAnnonce("a".repeat(12)), AUTO.idAnnonce("a".repeat(12)));
  assert.notStrictEqual(AUTO.idAnnonce("a".repeat(12)), "a".repeat(12));
  assert.match(AUTO.idAnnonce("a".repeat(12)), /^[0-9a-f]{12}$/);
  assert.deepStrictEqual(AUTO.decomposerTitreVote("sur l'ensemble de la proposition de loi pour une montagne vivante et souveraine"), { nature: "proposition de loi", court: "Proposition de loi pour une montagne vivante et souveraine", etape: "" });
  assert.strictEqual(AUTO.decomposerTitreVote("l'amendement n° 12 du projet de loi"), null);
}

// Titre propre GÉNÉRIQUE (« Gilley : actualité locale », « Politique : l'essentiel du moment ») : jamais de story ni de post, sauf direct du président
{
  const AUTO = createRequire(import.meta.url)("../scripts/stories-auto.cjs");
  const gen = (titre) => sujet("Le gouvernement présente son projet de budget pour 2027", 4, { titrePropre: { titre, origine: "regles", generique: true } });
  for (const t of ["Gilley : actualité locale", "Politique : l'essentiel du moment"]) assert.ok(AUTO.choisirSujet({ actualites: actu(gen(t)), direct: null, file: vide, now }).refus, `générique refusé : ${t}`);
  assert.strictEqual(AUTO.choisirSujet({ actualites: actu(sujet("Le gouvernement présente son projet de budget pour 2027", 4, { titrePropre: { titre: "Budget 2027 : le gouvernement présente son texte", origine: "regles" } })), direct: null, file: vide, now }).indice, 0, "titre propre non générique : retenu");
  const g = gen("Politique : l'essentiel du moment");
  const direct = { evenements: [{ type: "allocution", titre: g.articles[0].titre }] };
  assert.strictEqual(AUTO.choisirSujet({ actualites: actu(g), direct, file: vide, now }).indice, 0, "direct du président : le filtre ne s'applique pas");
  // « en bref » : un sujet générique n'y entre pas
  const trois = [0, 1, 2].map((i) => sujet(`Sujet ${i} du jour présenté par le gouvernement ce matin ${i}`, 3, { titrePropre: { titre: `Thème ${["Budget", "Santé", "Énergie"][i]} : annonce nouvelle ${i}`, origine: "regles", ...(i === 2 ? { generique: true } : {}) }, illustration: { theme: ["budget", "sante", "energie"][i] } }));
  assert.ok(AUTO.choisirEnBref({ actualites: actu(...trois), file: vide, now: new Date("2026-10-02T07:30:00Z") }).refus, "en bref : 2 sujets seulement (le générique est écarté)");
}

// Vidéos : configuration, plafond du jour, animation des posts, flux Atom, nettoyage des .mp4
{
  const AUTO = createRequire(import.meta.url)("../scripts/stories-auto.cjs");
  assert.strictEqual(AUTO.normaliserConfig({ videos: "oui" }).videos, false, "seul true active les vidéos");
  assert.strictEqual(AUTO.normaliserConfig({ videos: true }).videos, true);
  assert.strictEqual(AUTO.normaliserConfig({ videosMax: 3 }).videosMax, 3);
  assert.strictEqual(AUTO.normaliserConfig({ videosMax: 99 }).videosMax, 2, "hors limites : valeur par défaut");
  assert.strictEqual(AUTO.videosDuJour([{ cree: il_y_a(1), url_video: "x" }, { cree: il_y_a(2) }, { cree: il_y_a(60), url_video: "y" }], now), 1);
  assert.deepStrictEqual(AUTO.animationPost({ spec: { genre: "loi", pour: 276, contre: 86 } }), { type: "barre", pour: 276, contre: 86 });
  assert.deepStrictEqual(AUTO.animationPost({ spec: { genre: "date", compte: "25 jours" } }), { type: "compteur", valeur: 25, avant: "dans ", apres: " jours" });
  assert.strictEqual(AUTO.animationPost({ spec: { genre: "loi", pour: 0, contre: 0 } }), null);
  assert.match(AUTO.idReel("a".repeat(12)), /^[0-9a-f]{12}$/);
  assert.notStrictEqual(AUTO.idReel("a".repeat(12)), AUTO.idAnnonce("a".repeat(12)));
  const atom = AUTO.fluxAtom([{ id: "b".repeat(12), type: "reel", titre: "Reel : X", cree: il_y_a(1), url_image: "https://x/i.jpg", url_video: "https://x/v.mp4", legende: "Légende" }], now);
  assert.match(atom, /type="video\/mp4" href="https:\/\/x\/v\.mp4"/);
  assert.match(atom, /<category term="reel"\/>/);
  assert.strictEqual(AUTO.estStoryComptee({ type: "reel" }), false, "un Reel ne compte pas dans les 4 stories");
  const { mkdtempSync: mk, writeFileSync: wf, readdirSync: rd } = await import("fs");
  const { tmpdir: td } = await import("os");
  const { join: jn } = await import("path");
  const dossier = mk(jn(td(), "auto-"));
  for (const f of ["aaaaaaaaaaaa.jpg", "aaaaaaaaaaaa.mp4", "bbbbbbbbbbbb.jpg", "bbbbbbbbbbbb.mp4", "autre.txt"]) wf(jn(dossier, f), "x");
  AUTO.nettoyerImages(new Set(["aaaaaaaaaaaa"]), dossier);
  assert.deepStrictEqual(rd(dossier).sort(), ["aaaaaaaaaaaa.jpg", "aaaaaaaaaaaa.mp4", "autre.txt"]);
}

// --- SUJETS SENSIBLES (justice, mises en cause) : niveau 1 = publication prudente, niveau 2 = brouillon, jamais en file ---
{
  const AUTO = createRequire(import.meta.url)("../scripts/stories-auto.cjs");
  const SS = createRequire(import.meta.url)("../scripts/sujets-sensibles.cjs");
  const cfg = AUTO.normaliserConfig(null);
  const art = (titre, media) => ({ titre, media, url: `https://www.example.org/${encodeURIComponent(media)}/${idSujet(titre)}`, date: il_y_a(1) });
  const sens = (articles, extra = {}) => ({ medias: new Set(articles.map((a) => a.media)).size, derniere: il_y_a(1), illustration: { theme: "politique", personnes: [{ nom: "Jean Dupont" }] }, articles, ...extra });
  const dec = sens([art("Le tribunal correctionnel de Paris condamne l'ancien ministre Jean Dupont", "Le Monde"), art("Jean Dupont condamné par le tribunal correctionnel de Paris, ministre déchu", "franceinfo")], { illustration: { theme: "justice", personnes: [{ nom: "Jean Dupont" }] } });
  const accus = sens([art("Mediapart accuse le ministre Jean Dupont de frais indus, qui dément", "Mediapart")]);
  const vo = (sujets, extra = {}) => choisir({ actualites: { sujets }, direct: null, sondages: null, file: vide, now, config: cfg, ...extra });
  const nom = (d) => /dupont/i.test([d.titre, d.champs.pied, d.champs.alt].join(" "));

  // NIVEAU 1 : décision de justice citée par 2 médias -> entrée de file (texte prudent)
  {
    const c = vo([dec]);
    assert.strictEqual(c.niveauSensible, 1);
    assert.strictEqual(AUTO.destination(c, cfg), "file", "niveau 1 : publication automatique");
    const d = AUTO.decrire(c, now);
    assert.strictEqual(d.champs.sensible, 1);
    assert.match(d.titre, /^Selon Le Monde et franceinfo : le tribunal correctionnel de Paris a prononcé une condamnation$/, "attribution aux médias, juridiction, aucun nom");
    assert.ok(!nom(d), "aucun nom dans le titre, le pied ni le texte alternatif");
    assert.match(d.champs.pied, /présumée innocente/);
    assert.match(d.champs.pied, /Sources : Le Monde, franceinfo/);
    assert.ok(!/coupable/i.test(JSON.stringify(d.champs)));
    assert.deepStrictEqual(d.champs.sujets, [dec.articles[0].titre], "le titre de presse sert seulement à repérer les doublons");
    assert.deepStrictEqual(d.args[7].illustration.personnes, [], "aucun portrait");
    assert.strictEqual(d.args[7].sensible.sansCitation, true);
    assert.strictEqual(d.sources.length, 2, "liens des articles pour les sources");
    // la validation humaine générale transforme le niveau 1 en brouillon
    assert.strictEqual(AUTO.destination(c, { ...cfg, validationHumaine: true }), "brouillon");
    // le sujet n'est pas repris par le circuit habituel (mots de la liste prudente) mais est retenu ici
    assert.ok(choisirSujet({ actualites: { sujets: [dec] }, direct: null, file: vide, now }).refus, "le circuit habituel écarte toujours ce sujet");
  }
  // Un seul média qui cite la décision : jamais niveau 1 (brouillon)
  {
    const c = vo([sens([art("Le tribunal correctionnel de Lyon condamne le maire de la ville", "Le Monde")], { illustration: { theme: "justice", personnes: [] } })]);
    assert.strictEqual(c.niveauSensible, 2);
    assert.strictEqual(AUTO.destination(c, cfg), "brouillon");
  }
  // NIVEAU 2 : accusation d'un seul média -> brouillon, JAMAIS en file, même sans validation humaine générale
  {
    const c = vo([accus]);
    assert.strictEqual(c.niveauSensible, 2);
    for (const conf of [cfg, { ...cfg, validationHumaine: false }, { ...cfg, minMediasSensible: 2 }]) assert.strictEqual(AUTO.destination(c, conf), "brouillon", "niveau 2 : jamais d'envoi automatique");
    const d = AUTO.decrire(c, now);
    assert.strictEqual(d.champs.sensible, 2);
    assert.strictEqual(d.titre, "Selon Mediapart : des faits non établis à ce stade");
    assert.match(d.champs.pied, /présumée innocente/, "aucun nom accusé sans « présumée innocente »");
    assert.strictEqual(d.champs.reponseCitee, true, "la réponse de la personne est citée par le titre : signalée");
    assert.strictEqual(d.champs.citation.media, "Mediapart");
    assert.strictEqual(d.champs.nommePersonne, true, "personne nommée dans le titre cité : signalé dans le résumé");
    assert.ok(!/dupont/i.test([d.titre, d.champs.pied].join(" ")), "le texte du site ne nomme personne ; le nom ne figure que dans la citation attribuée");
    assert.strictEqual(d.args[7].articles[0].titre, accus.articles[0].titre, "titre du média cité tel quel, attribué");
    const ligne = AUTO.ligneResume({ id: "abcabcabcabc", titre: d.titre, type: "story", sensible: 2, nommePersonne: true, sources: d.sources });
    assert.match(ligne, /Valider un brouillon/);
    assert.match(ligne, /abcabcabcabc/);
    assert.match(ligne, /publier/);
    assert.strictEqual(AUTO.estStoryComptee({ type: "story", sensible: 2 }), false, "un brouillon sensible ne consomme pas le plafond des stories");
  }
  // Priorité : niveau 1 avant un sujet ordinaire ; niveau 2 seulement s'il n'y a rien d'autre
  {
    const ordinaire = sujet("Le gouvernement présente son projet de budget pour 2027", 4);
    assert.strictEqual(vo([accus, ordinaire]).indice, 1, "le sujet ordinaire passe avant un brouillon de niveau 2");
    assert.strictEqual(vo([ordinaire, dec]).niveauSensible, 1, "le fait judiciaire établi passe avant");
  }
  // Garde-fous conservés : pas de doublon, rejets, réserve électorale, nuit, plafonds, fraîcheur, configuration
  {
    const c = vo([accus]);
    assert.ok(vo([accus], { file: { entrees: [{ id: c.id, cree: il_y_a(2), sensible: 2, statut: "a-valider", titre: "x", sources: [] }] } }).refus, "déjà en brouillon : pas de doublon");
    assert.ok(vo([accus], { file: { entrees: [{ id: "aaaaaaaaaaaa", cree: il_y_a(2), sensible: 2, statut: "a-valider", titre: "x", sources: accus.articles.map((a) => a.url) }] } }).refus, "lien d'article déjà utilisé");
    assert.ok(vo([accus], { file: { entrees: [{ id: "aaaaaaaaaaaa", cree: il_y_a(2), sensible: 2, statut: "a-valider", titre: "Selon Mediapart : des faits non établis à ce stade", sujets: [accus.articles[0].titre], sources: [] }] } }).refus, "même sujet de presse récent (titresProches 36 h)");
    assert.ok(vo([accus], { rejetes: { entrees: [{ id: c.id, rejeteLe: il_y_a(30), sources: [], sujets: [] }] } }).refus, "sujet rejeté par un humain : pas reproposé");
    assert.ok(!vo([accus], { rejetes: { entrees: [{ id: c.id, rejeteLe: new Date(now.getTime() - 8 * 24 * 36e5).toISOString(), sources: [], sujets: [] }] } }).refus, "rejet de plus de 7 jours : de nouveau possible");
    assert.ok(vo([accus], { now: new Date("2026-10-02T21:30:00Z") }).refus, "nuit (23 h 30 à Paris)");
    assert.ok(vo([{ ...accus, derniere: il_y_a(13) }]).refus, "plus de 12 h : plus d'actualité");
    assert.ok(vo([{ ...dec, derniere: il_y_a(4) }]).niveauSensible !== 1, "niveau 1 : plus de 3 h, plus de publication automatique");
    assert.ok(vo([accus], { config: { ...cfg, sensibles: false } }).refus, "désactivé par la configuration");
    assert.ok(vo([accus], { config: { ...cfg, monetisation: true } }).refus, "monétisation : aucune presse, donc aucun sujet sensible");
    assert.ok(vo([accus], { config: { ...cfg, brouillonsSensiblesMax: 0 } }).refus, "plafond de brouillons");
    const un = { entrees: [{ id: "bbbbbbbbbbbb", cree: il_y_a(1), sensible: 2, statut: "a-valider", titre: "y", sources: [] }] };
    assert.ok(vo([accus], { file: un, config: { ...cfg, brouillonsSensiblesMax: 1 } }).refus, "1 brouillon sensible par jour au plus quand le plafond est à 1");
    const pleines = { entrees: Array.from({ length: 4 }, (_, i) => ({ id: `cccccccccc0${i}`, cree: il_y_a(1), titre: `s${i}`, sources: [], type: "story" })) };
    assert.notStrictEqual(vo([dec], { file: pleines }).niveauSensible, 1, "plafond de stories atteint : pas de niveau 1");
    // réserve électorale : un sondage, même cité dans un titre sensible, n'est jamais retenu
    const sondage = sens([art("Sondage Ifop : le maire Jean Dupont accusé par ses adversaires, intentions de vote", "Le Monde")]);
    assert.ok(vo([sondage], { now: new Date("2027-04-17T10:00:00Z") }).refus, "réserve électorale");
  }
  // Une affaire = un seul brouillon sur 48 h (3 titres de l'affaire Bardella) ; deux affaires distinctes = deux brouillons
  {
    const pers = { theme: "politique", personnes: [{ nom: "Jordan Bardella" }] };
    const b1 = sens([art("Ecrits antisémites : l’affaire Jordan Bardella plombe la séquence budgétaire du RN", "Le Monde")], { illustration: pers });
    const b2 = sens([art("La campagne de Marine Le Pen lestée par l’affaire Bardella : «A côté, Jordan a l’air d’être un poids»", "Libération")], { illustration: pers });
    const b3 = sens([art("Info EBRA. Riposte de Jordan Bardella contre Mediapart : une plainte déposée contre le président du RN", "Le Progrès")], { illustration: pers });
    const autre = sens([art("Rima Hassan accusée d'avoir renversé des drapeaux au Parlement européen, qui dément", "BFMTV")], { illustration: { theme: "politique", personnes: [{ nom: "Rima Hassan" }] } });
    const tous = [b1, b2, b3];
    const c1 = vo(tous);
    assert.strictEqual(c1.niveauSensible, 2);
    const d1 = AUTO.decrire(c1, now);
    const brouillon = { id: c1.id, cree: il_y_a(1), statut: "a-valider", sources: d1.sources, ...d1.champs, titre: d1.titre };
    assert.ok(vo(tous, { file: { entrees: [brouillon] } }).refus, "3 titres de la même affaire : un seul brouillon, les autres sont écartés");
    assert.ok(vo(tous, { file: { entrees: [{ ...brouillon, cree: il_y_a(47) }] } }).refus, "toujours la même affaire 47 h plus tard");
    assert.ok(!vo(tous, { file: { entrees: [{ ...brouillon, cree: il_y_a(50) }] } }).refus, "plus de 48 h : de nouveau possible");
    const reg = { entrees: [{ id: "dddddddddddd", statut: "publiee", publieLe: il_y_a(20), titre: "Selon Le Monde : des faits non établis à ce stade", sensible: 2, sujets: [b1.articles[0].titre] }] };
    assert.ok(vo([b3], { registre: reg }).refus, "affaire déjà publiée dans le registre");
    const rej = { entrees: [{ id: "eeeeeeeeeeee", rejeteLe: il_y_a(10), sources: [], sujets: [b2.articles[0].titre] }] };
    assert.ok(vo([b3], { rejetes: rej }).refus, "affaire rejetée par un humain : pas reproposée");
    // deux affaires distinctes : deux brouillons
    const c2 = vo([autre, ...tous], { file: { entrees: [brouillon] } });
    assert.ok(!c2.refus, "une affaire différente reste proposée");
    assert.strictEqual(c2.sujet, autre);
    // règles de prudence inchangées : niveau 2 jamais en file, présomption d'innocence
    assert.strictEqual(AUTO.destination(c2, { ...cfg, validationHumaine: false }), "brouillon");
    assert.match(AUTO.decrire(c2, now).champs.pied, /présumée innocente/);
  }
  // Fait divers, mineur, violence sexuelle, décès : jamais, ni en brouillon
  for (const t of ["Un mineur de 16 ans mis en examen : le ministre réagit après la décision du tribunal", "Le maire condamné pour agression sexuelle par le tribunal correctionnel, selon la presse", "Mort d'un ancien ministre : le tribunal rend hommage"]) {
    assert.ok(vo([sens([art(t, "Le Monde"), art(t + " ", "franceinfo")])]).refus, `jamais publié : ${t}`);
  }
  // Aucun nom accusé sans « présumée innocente » : tout texte produit passe formulationSure et mentionne la présomption quand une procédure est en jeu
  for (const s of [dec, accus]) {
    const d = AUTO.decrire(vo([s]), now);
    assert.ok(SS.formulationSure([d.titre, d.champs.pied].join(" "), { juridiction: d.champs.juridiction || "" }).ok);
    assert.match(d.champs.pied, /présumée innocente/);
  }
}

// Seuil livré à 2 médias : un sujet à 2 médias passe, un seul média non
{
  const A = createRequire(import.meta.url)("../scripts/stories-auto.cjs");
  A.appliquerSeuils(A.normaliserConfig({ minMedias: 2 }));
  assert.strictEqual(choix([sujet("Le gouvernement présente son projet de budget pour 2027", 2)]).indice, 0, "2 médias retenu au seuil 2");
  assert.ok(choix([sujet("Le gouvernement présente son projet de budget pour 2027", 1)]).refus, "1 média refusé");
  A.appliquerSeuils(A.normaliserConfig(null));
}

// Posts « Date à retenir » tirés de l'agenda (data/meetings.json)
{
  const A = createRequire(import.meta.url)("../scripts/stories-auto.cjs");
  const matin = new Date("2026-10-07T08:30:00Z"); // 10 h 30 à Paris
  const ev = (extra = {}) => ({ debut: "2026-10-24", fin: "2026-10-25", jour: "24-25", mois: "OCT.", lieu: "Orléans (Loiret)", titre: "XIXᵉ congrès du Rassemblement National", source: { nom: "franceinfo", url: "https://www.franceinfo.fr/x" }, verified: true, ...extra });
  const pa = (m, o = {}) => A.choisirPostAgenda({ meetings: { meetings: m }, file: vide, now: matin, ...o });
  const r = pa([ev()]);
  assert.strictEqual(r.modele, "post-date", "événement à 17 jours : un post");
  const f = A.ficheDate(r.sujet, matin);
  assert.match(f.legende, /24-25 octobre 2026/, "durée affichée");
  assert.match(f.legende, /Orléans/, "lieu");
  assert.match(f.legende, /vérifiez auprès de l'organisateur/, "mention de vérification");
  assert.ok(!f.spec.citation, "aucune citation de presse");
  assert.ok(A.decrire(r).titre.trim(), "titre de l'entrée de file jamais vide (check-data l'exige)");
  assert.ok(pa([ev({ verified: false })]).refus, "non vérifié : rien");
  assert.ok(pa([ev({ debut: "2026-10-09", fin: "2026-10-09" })]).refus, "trop proche : une story suffit, pas un post");
  assert.ok(pa([ev({ debut: "2026-10-01", fin: "2026-10-02" })]).refus, "passé : rien");
  assert.strictEqual(pa([ev({ debut: "2027-04-18", fin: "2027-04-18", titre: "Élection présidentielle : premier tour" })]).modele, "post-date", "tout ce qui est prévu : même à plus de 60 jours");
  assert.ok(pa([ev({ debut: "2028-06-01", fin: "2028-06-01" })]).refus, "au-delà d'un an : rien");
  const an = { sourceUrl: "https://www2.assemblee-nationale.fr/agendas/les-agendas", jours: [{ date: "2026-10-14", points: [{ type: "texte", objet: "Projet de loi sans vote" }, { type: "vote", objet: "Projet de loi de finances pour 2027" }] }] };
  const ra2 = A.choisirPostAgenda({ meetings: { meetings: [] }, agendaAn: an, file: vide, now: matin });
  assert.strictEqual(ra2.modele, "post-date", "vote solennel de l'Assemblée à 7 jours : un post");
  assert.match(ra2.sujet.titrePropre.titre, /^Vote solennel à l'Assemblée : projet de loi de finances pour 2027$/);
  assert.strictEqual(ra2.sujet.articles[0].url, an.sourceUrl);
  const an2 = { sourceUrl: an.sourceUrl, jours: [
    { date: "2026-10-13", points: [{ type: "texte", objet: "Projet de loi de finances pour 2027 (première partie)" }, { type: "texte", objet: "Proposition de loi sans lien" }, { type: "texte", objet: "Projet de loi autorisant l'approbation d'une convention" }] },
    { date: "2026-10-14", points: [{ type: "texte", objet: "Projet de loi de finances pour 2027 (première partie)" }] },
    { date: "2026-10-16", points: [{ type: "texte", objet: "Projet de loi de finances pour 2027 (première partie)" }] },
    { date: "2026-10-19", points: [{ type: "texte", objet: "Projet de loi de finances pour 2027 (première partie)" }] },
    { date: "2026-10-20", points: [{ type: "vote", objet: "Projet de loi de finances pour 2027 (première partie)." }] },
  ] };
  const ev2 = A.evenementsAgenda({ meetings: [] }, an2);
  assert.deepStrictEqual(ev2.map((e) => e.debut + " " + e.titre), [
    "2026-10-20 Vote solennel à l'Assemblée : projet de loi de finances pour 2027 (première partie)",
    "2026-10-13 Début de l'examen en séance à l'Assemblée : projet de loi de finances pour 2027 (première partie)",
  ], "début d'examen d'un projet de loi (premier jour du bloc seulement), ni proposition de loi ni convention, point final retiré");
  assert.ok(ev2.every((e) => e.verified === true && e.source.url === an.sourceUrl), "source officielle https");
  const pb = A.choisirPostAgenda({ meetings: { meetings: [] }, agendaAn: an2, file: vide, now: matin });
  assert.match(pb.sujet.titrePropre.titre, /^Début de l'examen en séance/, "début d'examen à 6 jours : un post");
  assert.ok(A.evenementsAgenda({ meetings: [] }, { ...an2, sourceUrl: "http://x" }).length === 0, "source non https : aucun événement");
  assert.ok(A.choisirPostAgenda({ meetings: { meetings: [] }, agendaAn: { ...an, sourceUrl: "http://x" }, file: vide, now: matin }).refus, "source non https : rien");
  assert.ok(pa([ev({ source: { nom: "x", url: "http://x" } })]).refus, "source non https : rien");
  assert.ok(pa([ev()], { file: { entrees: [{ id: r.id, type: "post", cree: matin.toISOString() }] } }).refus, "déjà publié : rien");
  assert.ok(A.choisirPostAgenda({ meetings: { meetings: [ev()] }, file: vide, now: new Date("2026-10-07T22:30:00Z") }).refus, "nuit : rien");
}

// Rappel J-3 : story « Date à retenir » pour un événement de l'agenda déjà annoncé par un post
{
  const A = createRequire(import.meta.url)("../scripts/stories-auto.cjs");
  const matin = new Date("2026-10-21T08:30:00Z"); // 10 h 30 à Paris, 3 jours avant le 24
  const ev = (extra = {}) => ({ debut: "2026-10-24", fin: "2026-10-25", jour: "24-25", mois: "OCT.", lieu: "Orléans (Loiret)", titre: "XIXᵉ congrès du Rassemblement National", source: { nom: "franceinfo", url: "https://www.franceinfo.fr/x" }, verified: true, ...extra });
  const hs = (x) => createRequire(import.meta.url)("crypto").createHash("sha1").update(x).digest("hex").slice(0, 12);
  const postId = hs("post-agenda|2026-10-24|XIXᵉ congrès du Rassemblement National");
  const annonce = [{ id: postId, type: "post", cree: "2026-10-07T08:00:00Z" }];
  const ra = (m, o = {}) => A.choisirRappelAgenda({ meetings: { meetings: m }, file: { entrees: annonce }, now: matin, ...o });
  const r = ra([ev()]);
  assert.strictEqual(r.modele, "rappel-agenda", "J-3 d'un événement annoncé : un rappel");
  assert.strictEqual(r.id, hs("rappel-agenda|2026-10-24|XIXᵉ congrès du Rassemblement National"), "id stable rappel-agenda|debut|titre");
  assert.strictEqual(r.postId, postId);
  const d = A.decrire(r, matin);
  assert.strictEqual(d.type, "story");
  assert.strictEqual(d.args[5], "date", "modèle « date » existant");
  assert.strictEqual(d.args[7].modeleImpose, "date");
  assert.strictEqual(d.champs.rappelDe, postId);
  assert.match(d.champs.alt, /dans 3 jours/, "compteur dans N jours");
  assert.ok(ra([ev()], { now: new Date("2026-10-22T08:30:00Z") }).modele, "J-2 : rattrapage d'un J-3 manqué");
  assert.ok(ra([ev()], { now: new Date("2026-10-20T08:30:00Z") }).refus, "J-4 : trop tôt");
  assert.ok(ra([ev()], { now: new Date("2026-10-23T08:30:00Z") }).refus, "J-1 : trop tard");
  assert.ok(A.choisirRappelAgenda({ meetings: { meetings: [ev()] }, file: vide, now: matin }).refus, "jamais annoncé par un post : pas de rappel");
  assert.ok(ra([ev()], { file: { entrees: [...annonce, { id: r.id, type: "story", cree: matin.toISOString() }] } }).refus, "déjà fait : jamais deux fois");
  assert.ok(ra([ev()], { file: vide, registre: { entrees: [{ id: postId, type: "post", statut: "publiee", publieLe: "2026-10-07T08:00:00Z" }, { id: r.id, type: "story", statut: "publiee", publieLe: "2026-10-21T06:00:00Z" }] } }).refus, "déjà publié (registre) : jamais deux fois");
  assert.ok(ra([ev()], { file: vide, registre: { entrees: [{ id: postId, type: "post", statut: "publiee", publieLe: "2026-10-07T08:00:00Z" }] } }).modele, "post connu par le registre : rappel");
  assert.ok(ra([ev({ verified: false })]).refus, "non vérifié : rien");
  assert.ok(ra([ev({ confirme: false })]).refus, "non confirmé : rien");
  assert.ok(ra([ev({ source: { nom: "x", url: "http://x" } })]).refus, "source non https : rien");
  assert.ok(ra([ev()], { now: new Date("2026-10-21T22:30:00Z") }).refus, "nuit : rien");
  assert.strictEqual(choisir({ actualites: null, direct: null, sondages: sond(), meetings: { meetings: [ev()] }, file: { entrees: annonce }, now: matin }).modele, "rappel-agenda", "choisir() retient le rappel");
}

// ---- Doublons : fenêtre de 72 h (file ET registre), liens d'articles, synonymes, événements datés ----
{
  const A = createRequire(import.meta.url)("../scripts/stories-auto.cjs");
  const hs = (x) => createRequire(import.meta.url)("crypto").createHash("sha1").update(x).digest("hex").slice(0, 12);
  // (D) synonymes et sigles : même sujet reconnu
  assert.ok(A.titresProches("Le RN tient son congrès à Perpignan le 24 octobre", "XIXᵉ congrès du Rassemblement National"));
  assert.ok(A.titresProches("Présidentielle : la primaire de la gauche se précise", "Élection présidentielle : primaire à gauche"));
  assert.ok(A.titresProches("Le PLF 2027 présenté en Conseil des ministres", "Projet de loi de finances 2027 : le gouvernement dévoile son texte"));
  assert.ok(A.titresProches("LFI organise ses journées d'été à Valence", "La France insoumise : journées d'été à Valence"));
  // (D) sujets différents non confondus (le sigle, le parti ou l'institution seuls ne suffisent pas)
  assert.ok(!A.titresProches("Le RN tient son congrès à Perpignan", "Le RN critique le budget du gouvernement"));
  assert.ok(!A.titresProches("Le PS vote le budget de la Sécurité sociale", "Le PS choisit son candidat à la présidentielle"));
  assert.ok(!A.titresProches("LFI dépose une motion de censure", "La France insoumise présente son programme agricole"));
  assert.ok(!A.titresProches("Vote du budget à l'AN cette semaine", "Réforme des retraites : l'Assemblée nationale divisée"));
  assert.ok(!A.titresProches("Congrès du Rassemblement National à Perpignan", "Congrès des maires de France à Paris"));
  assert.ok(!A.titresProches("Il y a un an, la dissolution", "Le budget de l'État pour un an"), "« an » minuscule n'est pas « Assemblée nationale »");
  // (A) registre : un sujet de presse publié il y a 40 h (registre seul) ne revient pas ; 80 h : oui
  const T = "Le Rassemblement National tient son congrès à Perpignan en octobre";
  const s = sujet(T, 4, { titrePropre: { titre: "Congrès du RN à Perpignan", origine: "recoupement" } });
  const reg = (h, extra = {}) => ({ entrees: [{ id: "b".repeat(12), statut: "publiee", publieLe: il_y_a(h), titre: "XIXᵉ congrès du Rassemblement National", ...extra }] });
  assert.ok(choix([s], { registre: reg(40) }).refus, "registre 40 h : refusé");
  assert.strictEqual(choix([s], { registre: reg(80) }).indice, 0, "registre 80 h : possible");
  // (A) mêmes liens d'articles (premier titre changé) : refusé, dans la file comme dans le registre
  const memeLien = { sources: [s.articles[1].url] };
  assert.ok(choix([s], { file: { entrees: [{ id: "c".repeat(12), cree: il_y_a(60), titre: "Tout autre titre", ...memeLien }] } }).refus, "lien déjà publié (file)");
  assert.ok(choix([s], { registre: reg(60, { titre: "Tout autre titre", ...memeLien }) }).refus, "lien déjà publié (registre)");
  // (C) événement daté : post-date refusé si le même événement, daté à un jour près, est déjà publié (story « date », rappel ou post)
  const sd = (iso) => sujet("Le Rassemblement National tient son congrès à Perpignan", 4, { date: { iso, jour: "24", mois: "octobre" }, titrePropre: { titre: "Congrès du RN à Perpignan", origine: "recoupement" } });
  const dejaDate = (type, dateIso, h = 200) => ({ entrees: [{ id: "d".repeat(12), statut: "publiee", publieLe: il_y_a(h), type, titre: "XIXᵉ congrès du Rassemblement National", dateIso }] });
  assert.strictEqual(choix([sd("2026-12-10")]).modele, "post-date", "témoin : post-date");
  assert.ok(choix([sd("2026-12-10")], { registre: dejaDate("post", "2026-12-10") }).refus, "même date : refusé");
  assert.ok(choix([sd("2026-12-10")], { registre: dejaDate("post", "2026-12-11") }).refus, "date à un jour près : refusé");
  assert.ok(choix([sd("2026-12-10")], { registre: dejaDate("story", "2026-12-09") }).refus, "story/rappel daté : refusé aussi");
  assert.ok(choix([sd("2026-12-10")], { registre: dejaDate("post", "2027-02-20") }).modele, "autre date, autre événement : possible");
  // (C) même titre exact à +/- 3 jours = même événement ; titres différents à 3 jours : pas confondus
  const exact = { entrees: [{ id: "e".repeat(12), statut: "publiee", publieLe: il_y_a(200), type: "post", titre: "Congrès du RN à Perpignan", dateIso: "2026-12-13" }] };
  assert.ok(choix([sd("2026-12-10")], { registre: exact }).refus, "même titre à 3 jours : refusé");
  const autre = { entrees: [{ id: "f".repeat(12), statut: "publiee", publieLe: il_y_a(200), type: "post", titre: "Journées parlementaires des écologistes", dateIso: "2026-12-11" }] };
  assert.ok(choix([sd("2026-12-10")], { registre: autre }).modele, "autre événement proche en date : possible");
  // Posts agenda : même contrôle (registre, date à un jour près)
  const matinA = new Date("2026-10-07T08:30:00Z");
  const evt = { debut: "2026-10-24", jour: "24", mois: "OCT.", titre: "XIXᵉ congrès du Rassemblement National", source: { nom: "franceinfo", url: "https://www.franceinfo.fr/x" }, verified: true };
  const pa = (registre) => A.choisirPostAgenda({ meetings: { meetings: [evt] }, file: vide, registre, now: matinA });
  assert.ok(!pa(null).refus, "témoin : post agenda");
  assert.ok(pa({ entrees: [{ id: "a1".repeat(6), statut: "publiee", publieLe: "2026-09-20T08:00:00Z", type: "story", titre: "Le RN tient son congrès à Perpignan", dateIso: "2026-10-25" }] }).refus, "événement déjà publié (autre titre, J+1) : pas de post agenda");
  // (B) rappel J-3 : refus si le même événement a déjà été publié (hors son propre post), ou si une story de presse proche existe sur 72 h
  const matin = new Date("2026-10-21T08:30:00Z");
  const ev = { debut: "2026-10-24", fin: "2026-10-25", jour: "24-25", mois: "OCT.", lieu: "Perpignan", titre: "XIXᵉ congrès du Rassemblement National", source: { nom: "franceinfo", url: "https://www.franceinfo.fr/x" }, verified: true };
  const postId = hs("post-agenda|2026-10-24|XIXᵉ congrès du Rassemblement National");
  const post = { id: postId, type: "post", cree: "2026-10-19T08:00:00Z", titre: ev.titre, titrePropre: ev.titre, dateIso: "2026-10-24" }; // post à J-5, dans la fenêtre de 72 h : ne bloque pas son propre rappel
  const rap = (entrees, registre = null) => A.choisirRappelAgenda({ meetings: { meetings: [ev] }, file: { entrees }, registre, now: matin });
  assert.ok(!rap([post]).refus, "témoin : rappel normal");
  assert.ok(rap([post, { id: "9".repeat(12), type: "story", cree: "2026-10-20T08:00:00Z", titre: "x", titrePropre: "Le RN tient son congrès à Perpignan", dateIso: "2026-10-24", modele: "date" }]).refus, "story date déjà publiée (même dateIso, titre proche) : refusé");
  assert.ok(rap([post], { entrees: [{ id: "8".repeat(12), statut: "publiee", publieLe: "2026-10-18T08:00:00Z", type: "post", titre: "Congrès du RN", dateIso: "2026-10-25" }] }).refus, "post du registre à un jour près : refusé");
  assert.ok(rap([post, { id: "7".repeat(12), type: "story", cree: "2026-10-20T10:00:00Z", titre: "Le RN tient son congrès à Perpignan ce week-end", titrePropre: "Congrès du RN : ce qu'il faut savoir", sources: [] }]).refus, "story de presse proche des 72 h : refusé");
  assert.ok(!rap([post, { id: "6".repeat(12), type: "story", cree: "2026-10-20T10:00:00Z", titre: "Le RN critique le budget", titrePropre: "Le RN critique le budget", sources: [] }]).refus, "story de presse sur un autre sujet du même parti : rappel possible");
  assert.ok(!rap([post, { id: "5".repeat(12), type: "story", cree: "2026-10-10T10:00:00Z", titre: "Le RN tient son congrès", titrePropre: "Congrès du RN", sources: [] }]).refus, "story de presse de plus de 72 h : rappel possible");
}

// Test comparatif des styles de story : attribution déterministe (hash de l'id % 4), « bleu » garde sa part, variante absente pour les contenus à dessin unique
{
  const A = createRequire(import.meta.url)("../scripts/stories-auto.cjs");
  assert.deepStrictEqual(A.VARIANTES, ["bleu", "une-photo", "question", "chiffre"]);
  assert.strictEqual(A.varianteDe("abc123"), A.varianteDe("abc123"), "déterministe");
  const ids = Array.from({ length: 400 }, (_, i) => `id-${i}`);
  const parts = Object.fromEntries(A.VARIANTES.map((v) => [v, ids.filter((i) => A.varianteDe(i) === v).length]));
  for (const v of A.VARIANTES) assert.ok(parts[v] > 60 && parts[v] < 140, `part du style ${v} : ${parts[v]} sur 400 (environ un quart)`);
  assert.ok(ids.every((i) => A.VARIANTES.includes(A.varianteDe(i))));
  assert.ok(ids.every((i) => A.varianteDe(i, ["bleu", "une-photo", "question"]) !== "chiffre"), "liste réduite : jamais le style exclu");
  // « styleFixe » (data/stories-config.json) : null par défaut (test comparatif inchangé), sinon ce style partout
  assert.strictEqual(A.normaliserConfig(null).styleFixe, null, "défaut : test comparatif");
  assert.strictEqual(A.normaliserConfig({ styleFixe: "inconnu" }).styleFixe, null, "valeur invalide ignorée");
  assert.strictEqual(A.normaliserConfig({ styleFixe: 3 }).styleFixe, null);
  for (const v of A.VARIANTES) {
    assert.strictEqual(A.normaliserConfig({ styleFixe: v }).styleFixe, v, `valeur valide : ${v}`);
    assert.ok(ids.every((i) => A.varianteDe(i, A.VARIANTES, v) === v), `styleFixe ${v} imposé`);
  }
  assert.ok(ids.every((i) => A.varianteDe(i, ["bleu", "une-photo", "question"], "chiffre") === "bleu"), "style inapplicable : dessin historique");
  assert.strictEqual(JSON.parse(readFileSync(new URL("../data/stories-config.json", import.meta.url), "utf-8")).styleFixe, null, "la valeur livrée reste null (test comparatif)");
  A.appliquerSeuils(A.normaliserConfig({ styleFixe: "chiffre" }));
  assert.strictEqual(A.varianteDe("abc123"), "chiffre", "appliquerSeuils active le style imposé");
  A.appliquerSeuils(A.normaliserConfig(null));
  assert.strictEqual(A.varianteDe("abc123"), A.varianteDe("abc123", A.VARIANTES, null), "puis retour au test comparatif");
  const sj = sujet("Le gouvernement présente son projet de budget pour 2027", 4);
  const c = choix([sj]);
  const d = AUTO_decrire(c);
  assert.strictEqual(A.varianteChoix(c, d), A.varianteDe(c.id), "un sujet avec titre à nous reçoit sa variante");
  assert.strictEqual(A.varianteChoix({ ...c, sensible: { niveau: 1 } }, d), null, "sujet sensible : dessin unique");
  assert.strictEqual(A.varianteChoix({ ...c, modele: "direct" }, d), null, "direct : dessin unique");
  assert.strictEqual(A.varianteChoix({ ...c, modele: "facea" }, d), null, "face à face (portraits) : dessin unique");
  assert.strictEqual(A.varianteChoix({ ...c, repli: true }, d), null, "sans titre à nous : dessin unique");
  assert.strictEqual(A.varianteChoix({ ...c, post: {} }, d), null, "post : dessin unique");
  assert.strictEqual(A.varianteChoix({ ...c, bref: {} }, { ...d, type: "en-bref" }), null, "en bref : dessin unique");
  // arguments de dessiner() : inchangés pour « bleu », complétés (9e argument) sinon
  assert.deepStrictEqual(A.argsAvecVariante([0, "t", null, null, null], "bleu"), [0, "t", null, null, null]);
  assert.deepStrictEqual(A.argsAvecVariante([0, "t", null, null, null], null), [0, "t", null, null, null]);
  assert.deepStrictEqual(A.argsAvecVariante([0, "t", null, null, null], "question"), [0, "t", null, null, null, null, null, null, "question"]);
  assert.deepStrictEqual(A.argsAvecVariante([0, "t", null, null, null, "chiffre"], "chiffre").slice(5), ["chiffre", null, null, "chiffre"]);
  assert.deepStrictEqual(A.argsAvecVariante([0, "t", null, null, null], "question", "Qui paie la facture ?").slice(8), ["question", { accroche: "Qui paie la facture ?" }], "l'accroche de l'entrée est transmise au dessin");
  assert.deepStrictEqual(A.argsAvecVariante([0, "t", null, null, null], "bleu", "x"), [0, "t", null, null, null], "style bleu : rien à transmettre");
  // le dessin des styles vit dans js/stories.js : mêmes règles que le cahier des charges (taille de texte, nombre de mots, zones de sécurité)
  const src = readFileSync(new URL("../js/stories.js", import.meta.url), "utf-8");
  for (const mot of ["une-photo", "question", "chiffre", "storyStyleDessiner", "L'ESSENTIEL"]) assert.ok(src.includes(mot), `js/stories.js : ${mot}`);
  assert.match(src, /storyStylePied\(ctx, d, \{ doux:"#D9DEF2", texte:"#FFFFFF", credit:true \}\)/, "le crédit de la photo est affiché avec la photo");
  assert.ok(!/https?:\/\/[^"'`\s]*\.(?:jpe?g|png|woff2?)/.test(src.slice(src.indexOf("Styles de story du test comparatif"), src.indexOf("Stories d'actualité : modules séparés"))), "aucune ressource externe dans les styles (CSP)");
}

console.log("stories-auto : tous les tests passent.");
