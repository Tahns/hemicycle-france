// Tests de scripts/stories-auto.cjs (choix du sujet) sur des titres fictifs. USAGE : node tests/stories-auto.test.mjs
import assert from "assert";
import { readFileSync } from "fs";
import { createRequire } from "module";
const { choisirSujet, choisirSondage, choisir, reserveSondages, jourPublication, motExclu, idSujet, jourUTC2, elaguer } = createRequire(import.meta.url)("../scripts/stories-auto.cjs");

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
// Trop ancien (> 3 h) : non
assert.ok(choix([sujet("Le gouvernement présente son projet de budget pour 2027", 4, { derniere: il_y_a(3.5) })]).refus, "ancien refusé");
// Mis en examen et autres mots à risque : exclus
assert.ok(choix([sujet("Jean Dupont mis en examen pour détournement de fonds publics", 4)]).refus, "mis en examen exclu");
for (const titre of [
  "Un ministre visé par une plainte pour diffamation", "Garde à vue d'un élu local à Lyon", "Le député soupçonné de favoritisme",
  "Mort de l'ancien ministre Jean Martin", "Décès d'une figure de la gauche", "Drame à la sortie d'un meeting", "Une adolescente de 15 ans victime d'une agression",
  "Le maire condamné pour prise illégale d'intérêts", "Un fait divers relance le débat sur la sécurité", "Nouvelle enquête visant un parlementaire",
]) assert.ok(motExclu(titre), `exclu : ${titre}`);
for (const titre of ["Le gouvernement présente son projet de budget pour 2027", "Le Sénat adopte la loi de programmation militaire"])
  assert.strictEqual(motExclu(titre), null, `non exclu : ${titre}`);
// Un seul titre à risque parmi ceux du sujet suffit à l'écarter
{
  const s = sujet("Le gouvernement présente son projet de budget pour 2027", 3);
  s.articles[2].titre = "Budget : un ministre mis en cause par une plainte";
  assert.ok(choix([s]).refus, "un titre à risque écarte le sujet");
}
// Thème justice : exclu
assert.ok(choix([sujet("Le gouvernement présente son projet de budget pour 2027", 4, { illustration: { theme: "justice" } })]).refus, "justice exclu");
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
const inst = (nom, hFin, extra = {}) => ({ nom, date: "29 septembre 2026", dateFin: jour(hFin), echantillon: 1500, hypotheses: 3, url: "https://www.commission-des-sondages.fr/notices/files/x.pdf", scores, ...extra });
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
  assert.strictEqual(choisirDossier({ actualites: { dossiers: d.map((x) => ({ ...x, derniere: il_y_a(5) })) }, file: vide, now }), null, "dossier trop ancien");
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
  assert.deepStrictEqual(A.normaliserConfig(null), { monetisation: false, validationHumaine: false });
  assert.deepStrictEqual(A.normaliserConfig({ monetisation: "oui", validationHumaine: 1 }), { monetisation: false, validationHumaine: false }, "seul true (booléen) active");
  assert.deepStrictEqual(A.lireConfig(join(tmpdir(), "inexistant-stories-config.json")), { monetisation: false, validationHumaine: false });
  assert.deepStrictEqual(JSON.parse(readFileSync(new URL("../data/stories-config.json", import.meta.url), "utf-8")), { monetisation: false, validationHumaine: false }, "valeurs livrées : false/false");

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

console.log("stories-auto : tous les tests passent.");
