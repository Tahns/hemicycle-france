// Tests du générateur de pages de référencement (scripts/generer-pages.js), du plan du site, du flux Atom et du contrôle des pages.
// USAGE : node tests/generer-pages.test.mjs
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  slugifier, attribuerSlugs, esc, couper, dateFr, enReserve, gabarit, dossiersVotes, pageLoi, pageCandidat, pageParti, pageListe,
  construireSitemaps, construireAtom, robots, appliquerBaseAccueil, donneesAccueil, generer, slugLoi, MAX_LOIS,
} from "../scripts/generer-pages.js";
import { controlerPages } from "../scripts/controler-pages.js";
import { completer } from "../scripts/lois-format.js";

const BASE = "https://exemple.test/site/";

/* ---------- Slugs : stables, sans accents, homonymes départagés ---------- */
assert.equal(slugifier("Éric Zemmour"), "eric-zemmour");
assert.equal(slugifier("Jean-Luc Mélenchon"), "jean-luc-melenchon");
assert.equal(slugifier("L'État d'urgence !"), "letat-durgence");
assert.equal(slugifier("   ---   "), "");
assert.ok(slugifier("mot ".repeat(40), 30).length <= 30);
assert.ok(!slugifier("mot ".repeat(40), 30).endsWith("-"));
{
  const elements = [{ n: "Zoé Martin" }, { n: "Zoe Martin" }, { n: "Alice" }];
  const a = attribuerSlugs(elements, (e) => e.n, (e) => slugifier(e.n));
  const b = attribuerSlugs([...elements].reverse(), (e) => e.n, (e) => slugifier(e.n));
  assert.deepEqual([...a.entries()].sort(), [...b.entries()].sort(), "l'ordre d'entrée ne change pas les adresses");
  assert.equal(new Set(a.values()).size, 3, "adresses uniques");
  assert.ok([...a.values()].includes("zoe-martin") && [...a.values()].includes("zoe-martin-2"));
}

/* ---------- Échappement, dates, longueur ---------- */
assert.equal(esc(`<a href="x">'&`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;");
assert.equal(dateFr("2026-07-21"), "21 juillet 2026");
assert.equal(dateFr("2026-08-01"), "1er août 2026");
assert.ok(couper("mot ".repeat(100)).length <= 158);
assert.equal(couper("court"), "court");

/* ---------- Réserve électorale ---------- */
const tours = ["2027-04-10", "2027-04-24"];
assert.equal(enReserve(new Date("2027-04-08T20:00:00Z"), tours), false, "jeudi soir : pas de réserve");
assert.equal(enReserve(new Date("2027-04-08T22:30:00Z"), tours), true, "minuit passé à Paris (veille du vote) : réserve");
assert.equal(enReserve(new Date("2027-04-10T17:59:00Z"), tours), true, "jour du vote avant 20 h à Paris");
assert.equal(enReserve(new Date("2027-04-10T18:01:00Z"), tours), false, "après 20 h à Paris");
assert.equal(enReserve(new Date("2026-10-06T10:00:00Z"), tours), false);

/* ---------- Jeux de données de test ---------- */
const groupes = {
  RN: { libelle: "Rassemblement National", membres: 118, president: "Marine Le Pen", presidente: true, presidentDepuis: "2024-07-19" },
  LFI: { libelle: "La France insoumise", membres: 70, president: "Mathilde Panot", presidente: true },
  NI: { libelle: "Non inscrit", membres: 11 },
};
const vote = (numero, dateISO, typeVote, dossierRef, dossierTitre, extra = {}) => ({
  numero, titre: `l'ensemble de la proposition de loi ${dossierTitre}.`, date: dateFr(dateISO), dateISO, typeVote, dossierRef, dossierTitre, auteur: "A. Auteur (RN)", theme: "Santé",
  resultat: "adopte", votes: { RN: [100, 0, 2, 118], LFI: [0, 60, 3, 70] }, sourceUrl: `https://www.assemblee-nationale.fr/dyn/17/scrutins/${numero}`, dossierUrl: `https://www.assemblee-nationale.fr/dyn/17/dossiers/${dossierRef}`, ...extra,
});
const loisBrutes = [
  vote(300, "2026-07-21", "SPS", "DLR5L17N10001", "Moderniser le patrimoine & l'État <b>"),
  vote(299, "2026-07-20", "SPO", "DLR5L17N10001", "Moderniser le patrimoine & l'État <b>"),
  vote(250, "2026-06-01", "SPS", "DLR5L17N10002", "Fin de vie"),
  vote(260, "2026-06-20", "SPS", "DLR5L17N10002", "Fin de vie", { resultat: "rejete" }),
  vote(100, "2026-05-01", "MOC", "DLR5L17N10003", "Motion de censure", { titre: "la motion de censure déposée par M. X.", resultat: "rejete", votes: { LFI: [70, 0, 0, 70] } }),
  vote(90, "2026-04-01", "SPO", "DLR5L17N10004", "Amendement seulement"),
];
const lois = structuredClone(loisBrutes).map(completer); // comme à la lecture de data/lois.json : votes par groupe en objets

/* ---------- Dossiers : seulement ceux votés dans leur ensemble ou censure ---------- */
const dossiers = dossiersVotes(lois);
assert.deepEqual(dossiers.map((d) => d.ref), ["DLR5L17N10001", "DLR5L17N10002", "DLR5L17N10003"], "plus récent d'abord, sans dossier à amendements seuls");
assert.deepEqual(dossiers[1].votes.map((v) => v.numero), [250, 260], "votes d'un dossier par ordre chronologique");
assert.ok(dossiersVotes(Array.from({ length: MAX_LOIS + 20 }, (_, i) => vote(1000 + i, "2026-01-01", "SPS", `DLR5L17N${20000 + i}`, `Texte ${i}`))).length === MAX_LOIS, "plafond du nombre de pages");

const slugs = attribuerSlugs(dossiers, (d) => d.ref, slugLoi);
assert.equal(slugs.get("DLR5L17N10002"), "fin-de-vie-10002", "l'adresse d'un dossier porte son numéro : stable et unique");
const slugsPartis = new Map([["RN", "rassemblement-national"], ["LFI", "la-france-insoumise"]]);
const ctx = {
  base: BASE, groupes, senat: { DLR5L17N10001: { dossier: "https://www.senat.fr/dossier-legislatif/ppl25-001.html", votes: [{ date: "2 juillet 2026", dateISO: "2026-07-02", resultat: "adopte", pour: 300, contre: 10, url: "https://www.senat.fr/scrutin-public/2025/scr2025-1.html" }] } },
  voteExiste: (n) => n === 300, photo: () => null, logo: () => null, dirigeants: [{ parti: "RN", nom: "Jordan Bardella", role: "Président du Rassemblement national", source: { nom: "Wikipédia", url: "https://fr.wikipedia.org/wiki/Rassemblement_national" } }],
  dossiers, candidats: [{ nom: "Marine Le Pen", code: "RN" }], sourceCandidats: "https://fr.wikipedia.org/wiki/Candidatures", slugsPartis, slugsCandidats: new Map([["Marine Le Pen", "marine-le-pen"]]), slugsLois: slugs,
};

/* ---------- Page d'un dossier ---------- */
const h = pageLoi(dossiers[0], slugs.get(dossiers[0].ref), ctx);
assert.match(h, /<link rel="canonical" href="https:\/\/exemple\.test\/site\/loi\/moderniser-le-patrimoine-letat-b-10001\/">/);
assert.ok(!h.includes("État <b>") && h.includes("État &lt;b&gt;"), "le titre du dossier est échappé");
assert.match(h, /100 pour, 60 contre, 5 abstentions/);
assert.match(h, /<td>Rassemblement National<\/td><td>100<\/td>/);
assert.match(h, /Au Sénat/);
assert.match(h, /href="\.\.\/\.\.\/v\/300\.html"/, "lien vers la page de scrutin existante");
assert.match(h, /href="\.\.\/\.\.\/#scrutin-300"/, "lien vers l'application");
assert.match(h, /"@type":"Legislation"/);
assert.match(h, /"@type":"BreadcrumbList"/);
assert.match(h, /default-src 'none'/, "CSP stricte des pages");
assert.equal((h.match(/<script\b/g) || []).length, 1, "un seul script : le JSON-LD");
assert.ok(!/\sstyle="/.test(h) && !/src="http/.test(h), "ni style en ligne ni ressource externe");
const hFin = pageLoi(dossiers[1], slugs.get(dossiers[1].ref), ctx);
assert.match(hFin, /Rejeté/, "le résultat est celui du dernier vote sur l'ensemble");
assert.match(hFin, /Tous les votes sur l'ensemble du texte/);
const hMotion = pageLoi(dossiers[2], slugs.get(dossiers[2].ref), ctx);
assert.match(hMotion, /Motion rejetée/);
// aucune page sans source
assert.throws(() => pageLoi({ ref: "X", votes: [{ ...vote(1, "2026-01-01", "SPS", "X", "Texte"), sourceUrl: "http://pas-https", dossierUrl: undefined }] }, "texte-1", ctx), /sans source/);
assert.throws(() => gabarit({ base: BASE, chemin: "loi/x/", titre: "T", description: "D", corps: "", sources: [] }), /sans source/);
assert.throws(() => gabarit({ base: BASE, chemin: "loi/x/", titre: "T", description: "D", corps: "", sources: [{ nom: "n", url: "javascript:alert(1)" }] }), /sans source/);

/* ---------- Page d'un candidat : échappement, pas de sondage ---------- */
const piege = { nom: `Zoé <script>alert(1)</script> "Dupont" & Fils`, parti: "Parti <i>X</i>", code: "RN", fonctions: ["Maire de </script><b>Ville</b>"], annonce: "2026-10-02", slogan: "Un <slogan>", source: "https://exemple.org/annonce" };
const hc = pageCandidat(piege, "zoe-dupont", { ...ctx, sourceCandidats: "https://fr.wikipedia.org/wiki/Candidatures" });
assert.ok(!hc.includes("<script>alert") && !hc.includes("<b>Ville") && !hc.includes("<i>X"), "aucune balise injectée");
assert.equal((hc.match(/<script\b/g) || []).length, 1);
const ld = JSON.parse(/<script type="application\/ld\+json">([^<]*)<\/script>/.exec(hc)[1]);
assert.equal(ld["@graph"][0].name, piege.nom, "le JSON-LD reste du JSON valide et fidèle");
assert.match(hc, /loi du 19 juillet 1977/, "rappel de la réserve électorale");
assert.ok(!/\d\s?%/.test(hc.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]*>/g, " ")), "aucun pourcentage (sondage) sur une page de candidat");
assert.ok(!/intentions? de vote\s*:\s*\d/i.test(hc));
assert.match(hc, /href="\.\.\/\.\.\/parti\/rassemblement-national\/"/, "lien vers le groupe du sigle");
assert.match(hc, /<h2>Sources<\/h2>/);

/* ---------- Page d'un groupe ---------- */
const hp = pageParti("RN", groupes.RN, ctx);
assert.match(hp, /Présidente du groupe : Marine Le Pen/);
assert.match(hp, /Jordan Bardella/);
assert.match(hp, /href="\.\.\/\.\.\/loi\/fin-de-vie-10002\/"/, "lien vers la page du texte");
assert.match(hp, /"@type":"Organization"/);

/* ---------- Aucun avis : le texte produit ne contient pas de jugement ---------- */
const AVIS = /\b(scandale|scandaleux|honteux|honte|excellent|catastrophique|courageux|lamentable|mauvais|meilleur|pire|dangereux|incompétent|génial|héros|traître|menteur|extrémiste|populiste)\b/i;
const textes = [h, hFin, hMotion, hc, hp].map((x) => x.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]*>/g, " "));
for (const t of textes) assert.ok(!AVIS.test(t), `jugement de valeur : ${AVIS.exec(t)?.[0]}`);

/* ---------- Liste ---------- */
const liste = pageListe({ base: BASE, dossier: "loi", titre: "Lois", intro: "Liste des textes votés.", elements: [{ slug: "a", nom: "A <b>", detail: "Adopté" }], sources: [{ nom: "AN", url: "https://data.assemblee-nationale.fr" }] });
assert.ok(liste.includes('href="a/"') && !liste.includes("<b>"));

/* ---------- Plan du site ---------- */
const entrees = Array.from({ length: 12 }, (_, i) => ({ type: i < 8 ? "depute" : "loi", loc: `${BASE}x/${i}/`, lastmod: "2026-01-01" }));
assert.deepEqual([...construireSitemaps(entrees, BASE, 20).keys()], ["sitemap.xml"]);
const gros = construireSitemaps(entrees, BASE, 5);
assert.deepEqual([...gros.keys()].sort(), ["sitemap-depute-1.xml", "sitemap-depute-2.xml", "sitemap-loi.xml", "sitemap.xml"]);
assert.match(gros.get("sitemap.xml"), /<sitemapindex[\s\S]*https:\/\/exemple\.test\/site\/sitemap-loi\.xml/);
assert.equal(construireSitemaps([{ type: "a", loc: `${BASE}?a=1&b=2` }], BASE).get("sitemap.xml").includes("a=1&amp;b=2"), true, "esperluette échappée");
assert.equal(robots(BASE), `User-agent: *\nAllow: /\nSitemap: ${BASE}sitemap.xml\n`);

/* ---------- Flux Atom ---------- */
const atom = construireAtom({
  dossiers: [{ articles: [{ media: "Le Monde & Co", titre: "Titre <1>", url: "https://m.test/a", date: "2026-10-06T10:00:00.000Z" }, { media: "RFI", titre: "Ancien", url: "https://m.test/b", date: "2026-10-05T10:00:00.000Z" }] }],
  sujets: [{ articles: [{ media: "RFI", titre: "Doublon", url: "https://m.test/a", date: "2026-10-06T10:00:00.000Z" }, { media: "X", titre: "Sans date", url: "https://m.test/c" }, { media: "Y", titre: "http", url: "http://m.test/d", date: "2026-10-06T09:00:00.000Z" }] }],
}, BASE);
assert.equal((atom.match(/<entry>/g) || []).length, 2, "doublons, entrées sans date et liens non https écartés");
assert.ok(atom.includes("Titre &lt;1&gt;") && atom.includes("Le Monde &amp; Co"));
assert.ok(atom.indexOf("m.test/a") < atom.indexOf("m.test/b"), "le plus récent d'abord");
assert.match(atom, /<updated>2026-10-06T10:00:00.000Z<\/updated>\n  <link rel="self"[^>]*href="https:\/\/exemple\.test\/site\/actualites\.atom"/);

/* ---------- Tête d'index.html : adresse du site (idempotent) ---------- */
const accueil = `<head><link rel="canonical" href="https://ancien.test/"><meta property="og:url" content="https://ancien.test/"><meta property="og:image" content="https://ancien.test/icons/partage.jpg"><meta name="twitter:image" content="https://ancien.test/icons/partage.jpg"><script type="application/ld+json">{"x":1}</script></head>`;
const maj = appliquerBaseAccueil(accueil, BASE);
assert.ok(!maj.includes("ancien.test"));
assert.equal(appliquerBaseAccueil(maj, BASE), maj);
assert.equal(donneesAccueil(BASE)["@graph"][0].potentialAction["@type"], "SearchAction");
assert.equal(donneesAccueil(BASE)["@graph"][0].potentialAction.target.urlTemplate, `${BASE}?q={search_term_string}`);
assert.deepEqual(donneesAccueil(BASE)["@graph"].map((x) => x["@type"]), ["WebSite", "Organization"]);

/* ---------- De bout en bout dans un dossier temporaire : génération, puis contrôle ---------- */
const racine = mkdtempSync(path.join(tmpdir(), "pages-"));
try {
  const ecrire = (f, c) => { mkdirSync(path.dirname(path.join(racine, f)), { recursive: true }); writeFileSync(path.join(racine, f), typeof c === "string" ? c : JSON.stringify(c)); };
  ecrire("data/site-config.json", { baseUrl: BASE, analytics: { fournisseur: "", site: "" } });
  ecrire("data/lois.json", { lois: loisBrutes });
  ecrire("data/groupes.json", { lastUpdated: "2026-10-01T00:00:00Z", groupes });
  ecrire("data/candidats.json", { lastUpdated: "2026-10-02T00:00:00Z", candidats: [{ nom: "Marine Le Pen", code: "RN", parti: "Rassemblement national", fonctions: ["Députée"], annonce: "2026-09-01", source: "https://exemple.org/a" }, { nom: "Sans Source", code: "DIV", source: "pas une adresse" }] });
  ecrire("data/dirigeants.json", { dirigeants: ctx.dirigeants });
  ecrire("data/actualites.json", { lastUpdated: "2026-10-06T10:00:00Z", sujets: [{ articles: [{ media: "RFI", titre: "Un titre", url: "https://m.test/z", date: "2026-10-06T10:00:00.000Z" }] }] });
  ecrire("index.html", `<!DOCTYPE html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'"><link rel="canonical" href="https://ancien.test/"><meta property="og:url" content="x"><script type="application/ld+json">{}</script><!-- mesure-audience:debut -->\n<!-- mesure-audience:fin --></head></html>`);
  ecrire("pages.css", "body{}");
  ecrire("icons/icon-192.png", "x");
  ecrire("v/300.html", "<html></html>");
  ecrire("d/PA1.html", "<html></html>");
  ecrire("s/01058X.html", "<html></html>");
  const r = await generer(racine);
  assert.equal(r.ignorees, 1, "le candidat sans source est ignoré, pas publié");
  assert.ok(!existsSync(path.join(racine, "candidat", "sans-source", "index.html")));
  assert.ok(existsSync(path.join(racine, "candidat", "marine-le-pen", "index.html")));
  assert.ok(existsSync(path.join(racine, "loi", "fin-de-vie-10002", "index.html")));
  assert.ok(existsSync(path.join(racine, "parti", "rassemblement-national", "index.html")));
  assert.ok(!existsSync(path.join(racine, "parti", "non-inscrit")), "le groupe des non-inscrits n'a pas de page");
  const sitemap = readFileSync(path.join(racine, "sitemap.xml"), "utf-8");
  for (const attendu of [`${BASE}</loc>`, `${BASE}v/300.html`, `${BASE}d/PA1.html`, `${BASE}s/01058X.html`, `${BASE}loi/fin-de-vie-10002/`, `${BASE}parti/rassemblement-national/`, `${BASE}candidat/marine-le-pen/`, `${BASE}loi/</loc>`]) assert.ok(sitemap.includes(attendu), `sitemap : ${attendu}`);
  assert.ok(!sitemap.includes("sans-source"));
  assert.ok(readFileSync(path.join(racine, "robots.txt"), "utf-8").includes(`Sitemap: ${BASE}sitemap.xml`));
  assert.ok(readFileSync(path.join(racine, "actualites.atom"), "utf-8").includes("m.test/z"));
  assert.ok(readFileSync(path.join(racine, "index.html"), "utf-8").includes(`<link rel="canonical" href="${BASE}">`));
  assert.deepEqual(await controlerPages(racine), [], "les pages produites passent le contrôle");
  // Idempotent : une seconde passe n'écrit rien de plus
  assert.equal((await generer(racine)).ecrites, 0);
  // Le contrôle détecte une page tronquée, un lien cassé et une page absente du plan
  writeFileSync(path.join(racine, "loi", "fin-de-vie-10002", "index.html"), readFileSync(path.join(racine, "loi", "fin-de-vie-10002", "index.html"), "utf-8").replace('href="../../loi/"', 'href="../../loi/inconnu/"').replace(/<ul class="sources">[\s\S]*?<\/ul>/, ""));
  mkdirSync(path.join(racine, "loi", "orpheline"), { recursive: true });
  writeFileSync(path.join(racine, "loi", "orpheline", "index.html"), "<html><title>x</title></html>");
  const problemes = (await controlerPages(racine)).join("\n");
  assert.match(problemes, /fin-de-vie-10002\/ : lien interne cassé \(\.\.\/\.\.\/loi\/inconnu\/\)/);
  assert.match(problemes, /fin-de-vie-10002\/ : aucune source https/);
  assert.match(problemes, /orpheline\/ : adresse canonique/);
  assert.match(problemes, /page produite absente du plan du site \(https:\/\/exemple\.test\/site\/loi\/orpheline\/\)/);
  // Une adresse de base changée met toutes les pages à jour
  ecrire("data/site-config.json", { baseUrl: "https://nouveau.test/", analytics: {} });
  const rem = readFileSync(path.join(racine, "sitemap.xml"), "utf-8");
  await generer(racine);
  assert.ok(readFileSync(path.join(racine, "sitemap.xml"), "utf-8").includes("https://nouveau.test/loi/fin-de-vie-10002/") && rem !== readFileSync(path.join(racine, "sitemap.xml"), "utf-8"));
  assert.ok(readFileSync(path.join(racine, "candidat", "marine-le-pen", "index.html"), "utf-8").includes('href="https://nouveau.test/candidat/marine-le-pen/"'));
} finally {
  rmSync(racine, { recursive: true, force: true });
}

console.log("generer-pages : tous les tests passent");
