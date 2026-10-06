// Tests de la chaîne de repli des portraits (scripts/portraits-chaine.js, scripts/fetch-portraits.js) avec des fixtures :
// aucun accès réseau. USAGE : node tests/portraits-chaine.test.mjs
import assert from "assert";
import { licenceLibre, resoudre, doitRetenter, calculerCouverture, medaillonSvg, noteFichier, estPolitique, couleurTexte } from "../scripts/portraits-chaine.js";
import { listerPersonnes, cheminDe } from "../scripts/fetch-portraits.js";

const JPEG = Buffer.alloc(4000, 1);
const rep = (status, type = "image/jpeg", corps = JPEG) => ({ status, ok: status >= 200 && status < 300, headers: { get: () => type }, arrayBuffer: async () => corps });
const meta = (licence, extra = {}) => ({ LicenseShortName: { value: licence }, Artist: { value: "<a>Photographe</a>" }, ...extra });
const page = (fichier, { licence = "CC BY-SA 4.0", largeur = 800, hauteur = 1000, mime = "image/jpeg" } = {}) => ({
  title: `File:${fichier}`,
  imageinfo: [{ thumburl: `https://thumb.test/${fichier}`, descriptionurl: `https://commons.wikimedia.org/wiki/File:${fichier}`, width: largeur, height: hauteur, mime, extmetadata: meta(licence) }],
});
const humain = { id: "Q5" };
const entite = (id, label, { p18, politique = true, frwiki } = {}) => ({
  id, labels: { fr: { value: label } }, descriptions: { fr: { value: politique ? "femme politique française" : "chanteur" } },
  claims: { P31: [{ rank: "normal", mainsnak: { datavalue: { value: humain } } }], ...(politique ? { P39: [{ rank: "normal", mainsnak: { datavalue: { value: { id: "Q1" } } } }] } : {}),
    ...(p18 ? { P18: [{ rank: "normal", mainsnak: { datavalue: { value: p18 } } }] } : {}) },
  sitelinks: frwiki ? { frwiki: { title: frwiki } } : {},
});

/** Faux Internet : `routes` associe une sous-chaîne d'URL à une fonction (url) -> JSON ; `bin` pour les téléchargements. */
function ctxDe({ wikidata = {}, commons = {}, bin = () => rep(200), pageimage = null, appels = [] } = {}) {
  return {
    aujourdhui: "2026-10-06",
    api: async (url) => {
      appels.push(url);
      if (url.includes("wbsearchentities")) return { search: Object.keys(wikidata).map((id) => ({ id })) };
      if (url.includes("wbgetentities")) return { entities: wikidata };
      if (url.includes("wikipedia.org")) return { query: { pages: { 1: pageimage ? { pageimage } : {} } } };
      if (url.includes("prop=pageprops")) return commons.categorie ? { query: { pages: { 1: { pageprops: { wikibase_item: commons.categorie } } } } } : { query: { pages: { "-1": { missing: "" } } } };
      if (url.includes("generator=categorymembers")) return { query: { pages: Object.fromEntries((commons.membres || []).map((m, i) => [i, m])) } };
      if (url.includes("prop=imageinfo")) {
        const f = decodeURIComponent(url.split("titles=")[1]).replace(/^File:/, "");
        const e = commons.fichiers?.[f];
        if (e instanceof Error) throw e;
        return { query: { pages: { 1: e || { missing: "" } } } };
      }
      throw new Error("URL inattendue " + url);
    },
    telecharger: async (url) => bin(url),
  };
}

// --- licences
assert.strictEqual(licenceLibre(meta("CC BY-SA 4.0")), "CC BY-SA 4.0");
assert.strictEqual(licenceLibre(meta("Public domain")), "Public domain");
assert.strictEqual(licenceLibre(meta("CC0")), "CC0");
assert.strictEqual(licenceLibre(meta("Copyrighted free use")), "Copyrighted free use");
for (const l of ["CC BY-NC 4.0", "CC BY-ND 2.0", "CC BY-NC-SA 3.0", "Non-free promotional", "Fair use", "All rights reserved", "Licence inconnue"]) assert.throws(() => licenceLibre(meta(l)), undefined, l);
assert.throws(() => licenceLibre(meta("CC BY 4.0", { NonFree: { value: "true" } })), /non libre/);
assert.throws(() => licenceLibre({}), /inconnue/);

// --- Wikidata : politique / homonyme
assert.ok(estPolitique(entite("Q10", "A B")));
assert.ok(!estPolitique(entite("Q11", "A B", { politique: false })));

// --- (b) Wikidata P18 libre
{
  const ctx = ctxDe({ wikidata: { Q1: entite("Q1", "Alice Rufo", { p18: "Alice Rufo.jpg", frwiki: "Alice Rufo" }) }, commons: { fichiers: { "Alice_Rufo.jpg": page("Alice_Rufo.jpg") } } });
  const r = await resoudre({ nom: "Alice Rufo", type: "gouvernement", souple: true }, ctx);
  assert.strictEqual(r.statut, "photo");
  assert.strictEqual(r.entree.licence, "CC BY-SA 4.0");
  assert.strictEqual(r.entree.origine, "wikidata");
  assert.strictEqual(r.entree.wikidata, "Q1");
  assert.ok(/^https:\/\/commons/.test(r.entree.source) && r.entree.auteur === "Photographe");
}

// --- licence refusée sur P18 et sur l'article : on tombe sur le médaillon, sans photo sans licence
{
  const ctx = ctxDe({ wikidata: { Q1: entite("Q1", "Jean Dupont", { p18: "NC.jpg" }) }, commons: { fichiers: { "NC.jpg": page("NC.jpg", { licence: "CC BY-NC 4.0" }) } } });
  const r = await resoudre({ nom: "Jean Dupont", type: "candidat", parti: "RN", souple: true }, ctx);
  assert.strictEqual(r.statut, "placeholder");
  assert.strictEqual(r.entree.placeholder, true);
  assert.strictEqual(r.entree.fichier, null);
  assert.strictEqual(r.entree.initiales, "JD");
  assert.strictEqual(r.entree.couleur, "#5B4FC9", "couleur du parti");
  assert.ok(!r.transitoire);
}

// --- image trop petite : acceptée seulement en dernier recours, signalée
{
  const ctx = ctxDe({ wikidata: { Q1: entite("Q1", "Petit Format", { p18: "p.jpg" }) }, commons: { fichiers: { "p.jpg": page("p.jpg", { largeur: 300, hauteur: 400 }) } } });
  const r = await resoudre({ nom: "Petit Format", type: "candidat", souple: true }, ctx);
  assert.strictEqual(r.statut, "photo");
  assert.strictEqual(r.entree.basseDefinition, true);
}

// --- (c) catégorie Commons, rattachée au même élément ; (c') catégorie d'un homonyme refusée
{
  const membres = [page("Foule_meeting_2022.jpg", { largeur: 2000, hauteur: 900 }), page("Portrait_officiel_X.jpg", { largeur: 900, hauteur: 1200 }), page("Logo_NC.jpg", { licence: "CC BY-ND 2.0" })];
  const ok = await resoudre({ nom: "Eléonore Caroit", type: "gouvernement", souple: true }, ctxDe({ wikidata: { Q7: entite("Q7", "Éléonore Caroit") }, commons: { categorie: "Q7", membres } }));
  assert.strictEqual(ok.statut, "photo");
  assert.strictEqual(ok.entree.fichier, "Portrait_officiel_X.jpg");
  assert.strictEqual(ok.entree.origine, "commons-categorie");
  const homonyme = await resoudre({ nom: "Eléonore Caroit", type: "gouvernement", souple: true }, ctxDe({ wikidata: { Q7: entite("Q7", "Éléonore Caroit") }, commons: { categorie: "Q999", membres } }));
  assert.strictEqual(homonyme.statut, "placeholder", "catégorie d'un homonyme : jamais utilisée");
}

// --- homonyme : un chanteur du même nom n'est pas retenu (profession non politique, personne non « souple »)
{
  const ctx = ctxDe({ wikidata: { Q2: entite("Q2", "Marie Martin", { p18: "chanteuse.jpg", politique: false }) }, commons: { fichiers: { "chanteuse.jpg": page("chanteuse.jpg") } } });
  const r = await resoudre({ nom: "Marie Martin", type: "cite" }, ctx);
  assert.strictEqual(r.statut, "placeholder");
  // le politique passe avant l'homonyme non politique, même placé après dans la recherche
  const ctx2 = ctxDe({ wikidata: { Q2: entite("Q2", "Marie Martin", { p18: "chanteuse.jpg", politique: false }), Q3: entite("Q3", "Marie Martin", { p18: "depute.jpg" }) }, commons: { fichiers: { "chanteuse.jpg": page("chanteuse.jpg"), "depute.jpg": page("depute.jpg") } } });
  const r2 = await resoudre({ nom: "Marie Martin", type: "cite" }, ctx2);
  assert.strictEqual(r2.entree.fichier, "depute.jpg");
}

// --- HTTP 429 : médaillon provisoire, marqué transitoire (reprise au passage suivant)
{
  const e429 = Object.assign(new Error("HTTP 429"), { transitoire: true });
  const ctx = ctxDe({});
  ctx.api = async () => { throw e429; };
  const r = await resoudre({ nom: "Catherine Chabaud", type: "gouvernement", souple: true }, ctx);
  assert.strictEqual(r.statut, "placeholder");
  assert.strictEqual(r.transitoire, true);
  assert.strictEqual(r.entree.transitoire, true);
  assert.ok(doitRetenter(r.entree, "2026-10-06"), "reprise immédiate après un 429");
  // 429 au téléchargement de la vignette
  const ctx2 = ctxDe({ wikidata: { Q1: entite("Q1", "Catherine Chabaud", { p18: "c.jpg" }) }, commons: { fichiers: { "c.jpg": page("c.jpg") } }, bin: () => rep(429, "text/html") });
  const r2 = await resoudre({ nom: "Catherine Chabaud", type: "gouvernement", souple: true }, ctx2);
  assert.strictEqual(r2.statut, "placeholder");
  assert.strictEqual(r2.transitoire, true);
}

// --- (a) photo officielle : Assemblée (député sans photo), Sénat ; repli si 404
{
  const vus = [];
  const bin = (u) => { vus.push(u); return rep(200); };
  const r = await resoudre({ nom: "Élu Test", type: "depute", id: "PA123" }, ctxDe({ bin }));
  assert.strictEqual(r.statut, "photo");
  assert.strictEqual(r.chemin, "photos/deputes/PA123.jpg");
  assert.ok(vus[0].includes("assemblee-nationale.fr") && r.entree.origine === "officielle" && /Licence Ouverte/.test(r.entree.licence));
  const s = await resoudre({ nom: "Sén Test", type: "senateur", id: "1F", slug: "test_sen1f" }, ctxDe({ bin }));
  assert.strictEqual(s.chemin, "photos/senateurs/1F.jpg");
  const m = await resoudre({ nom: "Ministre Test", type: "gouvernement", id: "PA5" }, ctxDe({ bin }));
  assert.strictEqual(m.chemin, null, "ministre : photos/personnalites/");
  const non = await resoudre({ nom: "Sans Fiche", type: "depute", id: "PA9" }, ctxDe({ bin: () => rep(404, "text/html"), wikidata: {} }));
  assert.strictEqual(non.statut, "placeholder");
}

// --- fichier imposé : licence revérifiée
{
  const ctx = ctxDe({ commons: { fichiers: { "Imposé.jpg": page("Imposé.jpg", { licence: "CC BY-NC 2.0" }) } } });
  const r = await resoudre({ nom: "Quelqu'un", type: "cite", choix: "Imposé.jpg" }, ctx);
  assert.strictEqual(r.statut, "placeholder", "un fichier imposé non libre est refusé");
}

// --- retentative : une fois par jour
assert.ok(doitRetenter(undefined, "2026-10-06"));
assert.ok(!doitRetenter({ fichier: "x.jpg" }, "2026-10-06"));
assert.ok(!doitRetenter({ fichier: null, placeholder: true, essai: "2026-10-06" }, "2026-10-06"));
assert.ok(doitRetenter({ fichier: null, placeholder: true, essai: "2026-10-05" }, "2026-10-06"));
assert.ok(doitRetenter({ fichier: null, essai: "2026-10-05" }, "2026-10-06"), "ancienne entrée sans drapeau");

// --- qualité, médaillon, couverture
assert.ok(noteFichier({ fichier: "Portrait_officiel.jpg", largeur: 800, hauteur: 1000 }) > noteFichier({ fichier: "Meeting_foule.jpg", largeur: 2000, hauteur: 900 }));
const svg = medaillonSvg("Marine Le Pen", "#5B4FC9");
assert.ok(svg.startsWith("<svg") && svg.includes(">ML<") && svg.includes("#5B4FC9"));
assert.strictEqual(couleurTexte("#E0B400"), "#1A1A1A");
{
  const personnes = [{ nom: "A" }, { nom: "B" }, { nom: "C" }, { nom: "D" }];
  const portraits = { A: { fichier: "a.jpg", origine: "wikidata" }, B: { fichier: null, placeholder: true } };
  const c = calculerCouverture(personnes, portraits, (p) => p.nom === "A" || p.nom === "D", "2026-10-06");
  assert.deepStrictEqual([c.personnes, c.avecPhoto, c.placeholders, c.nonTraites], [4, 2, 1, 1]);
  assert.deepStrictEqual(c.manquants, ["B", "C"]);
  assert.strictEqual(c.parOrigine.officielle, 1);
}

// --- liste des personnes : chacune une fois, parlementaire notable dans photos/personnalites/
{
  const l = listerPersonnes({
    deputes: { deputes: [{ id: "PA1", nom: "Marine Le Pen", groupe: "RN" }, { id: "PA2", nom: "Simple Député", groupe: "LR" }] },
    senateurs: { senateurs: [{ id: "9S", nom: "Sans Slug", groupe: "UC" }] },
    candidats: { candidats: [{ nom: "Marine Le Pen", code: "RN" }, { nom: "Francis Lalanne", code: "DVG" }] },
    gouvernement: { membres: [{ nom: "Alice Rufo", id: "PA873629" }] },
    actualites: { sujets: [{ illustration: { personnes: [{ nom: "Cité Dans Actu", parti: "PS" }] } }] },
    presidents: { regimes: [{ presidents: [{ nom: "François Hollande", wikipedia: "https://fr.wikipedia.org/wiki/Fran%C3%A7ois_Hollande" }] }] },
    choix: { "Raphaël Glucksmann": "R.jpg" },
  });
  const noms = l.map((p) => p.nom);
  assert.strictEqual(new Set(noms).size, noms.length);
  for (const n of ["Marine Le Pen", "Simple Député", "Sans Slug", "Francis Lalanne", "Alice Rufo", "Cité Dans Actu", "François Hollande", "Raphaël Glucksmann", "Emmanuel Macron"]) assert.ok(noms.includes(n), n);
  const get = (n) => l.find((p) => p.nom === n);
  assert.strictEqual(cheminDe(get("Marine Le Pen")), "photos/personnalites/marine-le-pen.jpg");
  assert.strictEqual(cheminDe(get("Simple Député")), "photos/deputes/PA2.jpg");
  assert.strictEqual(cheminDe(get("Sans Slug")), "photos/senateurs/9S.jpg");
  assert.strictEqual(get("François Hollande").titre, "François Hollande");
  assert.strictEqual(get("Raphaël Glucksmann").choix, "R.jpg");
  assert.ok(l.indexOf(get("François Hollande")) < l.indexOf(get("Simple Député")), "présidents avant députés");
}

console.log("portraits-chaine : tous les tests passent.");
