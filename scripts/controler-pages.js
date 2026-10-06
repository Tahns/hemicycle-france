/**
 * controler-pages.js
 * ------------------
 * Contrôle des pages produites par generer-pages.js (loi/, candidat/, parti/), du plan du site, de robots.txt, du flux Atom
 * et de la mesure d'audience. Renvoie la liste des anomalies (vide si tout est cohérent) ; utilisé par check-data.js.
 *  - chaque page : titre, description, canonique conforme à baseUrl, JSON-LD lisible, au moins une source https, aucun script
 *    ni ressource externe (CSP), liens internes qui existent ;
 *  - titres uniques ; aucune page ne reprend de sondage ni de simulation (réserve électorale) ;
 *  - sitemap.xml : adresses sous baseUrl, sans doublon, qui correspondent toutes à un fichier, et qui couvrent toutes les pages produites ;
 *  - index.html : canonique, CSP et balise de mesure d'audience en accord avec data/site-config.json.
 */
import { readFile, readdir } from "fs/promises";
import { existsSync, statSync } from "fs";
import path from "path";
import { lireSiteConfig } from "./site-config.js";
import { preparer, hotesAnalytiques } from "./appliquer-analytics.js";

const DOSSIERS = ["loi", "candidat", "parti"];

async function sousDossiers(dossier) {
  try { return (await readdir(dossier, { withFileTypes: true })).filter((e) => e.isDirectory() && existsSync(path.join(dossier, e.name, "index.html"))).map((e) => e.name); } catch (e) { return []; }
}

/** Une adresse relative (depuis `courant`, un dossier du site) correspond-elle à un fichier ou à un dossier avec index.html ? */
function existe(racine, courant, relatif) {
  const sain = relatif.split(/[?#]/)[0];
  const r = path.resolve(racine), f = path.resolve(courant, sain);
  if (f !== r && !f.startsWith(r + path.sep)) return false;
  if (existsSync(f) && statSync(f).isFile()) return true;
  return existsSync(path.join(f, "index.html"));
}

export async function controlerPages(racine = ".") {
  const erreurs = [];
  const err = (m) => erreurs.push(m);
  const cfg = await lireSiteConfig(path.join(racine, "data", "site-config.json"));
  for (const e of cfg.erreurs) err(`site-config.json : ${e}`);
  const base = cfg.baseUrl;
  const generees = new Set();
  const titres = new Map();

  const controlerPage = async (rel, fichier) => {
    let html;
    try { html = await readFile(fichier, "utf-8"); } catch (e) { return err(`${rel} : illisible`); }
    const type = rel.split("/")[0];
    const titre = /<title>([^<]+)<\/title>/.exec(html)?.[1];
    if (!titre) err(`${rel} : <title> manquant`);
    else if (titres.has(titre)) err(`${rel} : <title> identique à celui de ${titres.get(titre)}`);
    else titres.set(titre, rel);
    if (!/<meta name="description" content="[^"]{20,}"/.test(html)) err(`${rel} : description absente ou trop courte`);
    const canon = /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1];
    if (canon !== `${base}${rel}`) err(`${rel} : adresse canonique « ${canon} » ≠ « ${base}${rel} » (relancer node scripts/generer-pages.js)`);
    if (!/application\/ld\+json/.test(html)) err(`${rel} : données structurées absentes`);
    for (const m of html.matchAll(/<script type="application\/ld\+json">([^<]*)<\/script>/g)) {
      try { JSON.parse(m[1]); } catch (e) { err(`${rel} : données structurées illisibles`); }
    }
    if ((html.match(/<script\b/g) || []).length !== (html.match(/<script type="application\/ld\+json">/g) || []).length) err(`${rel} : script non autorisé par la CSP des pages`);
    if (/<[^>]+\b(?:src|href)="http:\/\//.test(html)) err(`${rel} : adresse http non sécurisée`);
    if (/\sstyle="/.test(html)) err(`${rel} : style en ligne (interdit par la CSP des pages)`);
    if (!/<ul class="sources">\s*<li><a href="https:\/\//.test(html)) err(`${rel} : aucune source https`);
    if (type === "candidat" && /\d\s?%/.test(html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]*>/g, " "))) err(`${rel} : pourcentage sur une page de candidat (sondage ? réserve électorale)`);
    if (/<h[12]>[^<]*(sondage|simulation|probabilit)/i.test(html)) err(`${rel} : titre de section de sondage ou de simulation (réserve électorale)`);
    for (const m of html.matchAll(/\b(?:href|src)="([^"#]*)(?:#[^"]*)?"/g)) {
      const cible = m[1].replace(/&#39;/g, "'").replace(/&amp;/g, "&");
      if (!cible || /^[a-z][a-z0-9+.-]*:/i.test(cible)) continue;
      if (!existe(racine, path.dirname(fichier), cible)) err(`${rel} : lien interne cassé (${cible})`);
    }
  };
  for (const type of DOSSIERS) {
    const dossier = path.join(racine, type);
    if (existsSync(path.join(dossier, "index.html"))) { generees.add(`${base}${type}/`); await controlerPage(`${type}/`, path.join(dossier, "index.html")); }
    for (const nom of await sousDossiers(dossier)) {
      generees.add(`${base}${type}/${nom}/`);
      await controlerPage(`${type}/${nom}/`, path.join(dossier, nom, "index.html"));
    }
  }

  // Plan du site
  const fichiersSitemap = ["sitemap.xml"];
  const vus = new Set();
  const lire = async (nom) => { try { return await readFile(path.join(racine, nom), "utf-8"); } catch (e) { err(`${nom} : absent`); return ""; } };
  while (fichiersSitemap.length) {
    const nom = fichiersSitemap.shift();
    const xmlTexte = await lire(nom);
    if (/<sitemapindex/.test(xmlTexte)) {
      for (const m of xmlTexte.matchAll(/<loc>([^<]+)<\/loc>/g)) {
        if (!m[1].startsWith(base)) err(`${nom} : adresse hors de ${base} (${m[1]})`);
        else fichiersSitemap.push(m[1].slice(base.length));
      }
      continue;
    }
    for (const m of xmlTexte.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      const loc = m[1].replace(/&amp;/g, "&");
      if (!loc.startsWith(base)) { err(`${nom} : adresse hors de ${base} (${loc})`); continue; }
      if (vus.has(loc)) err(`${nom} : adresse en double (${loc})`);
      vus.add(loc);
      if (!existe(racine, racine, loc.slice(base.length))) err(`${nom} : l'adresse ${loc} ne correspond à aucun fichier`);
    }
  }
  for (const g of generees) if (!vus.has(g)) err(`sitemap : page produite absente du plan du site (${g})`);
  const robots = await lire("robots.txt");
  if (!robots.includes(`Sitemap: ${base}sitemap.xml`)) err(`robots.txt : ligne « Sitemap: ${base}sitemap.xml » absente`);

  // Flux Atom
  if (existsSync(path.join(racine, "actualites.atom"))) {
    const atom = await lire("actualites.atom");
    if (!atom.includes(`href="${base}actualites.atom"`)) err("actualites.atom : adresse du flux différente de baseUrl");
    for (const m of atom.matchAll(/<entry>[\s\S]*?<\/entry>/g)) {
      if (!/<link rel="alternate" type="text\/html" href="https:\/\//.test(m[0]) || !/<updated>\d{4}-/.test(m[0]) || !/<title>[^<]+<\/title>/.test(m[0])) err("actualites.atom : entrée incomplète (titre, date ou lien https)");
    }
  }

  // index.html : adresse du site et mesure d'audience
  const index = await lire("index.html");
  if (!index.includes(`<link rel="canonical" href="${base}">`)) err(`index.html : adresse canonique ≠ baseUrl (${base}) : lancer node scripts/generer-pages.js`);
  const attendus = Object.values(preparer(cfg.analytics).hotes).flat();
  const presents = hotesAnalytiques(index);
  for (const h of presents) if (!attendus.includes(h)) err(`index.html : la CSP autorise « ${h} » alors que la mesure d'audience n'est pas configurée pour ce service : lancer node scripts/appliquer-analytics.js`);
  for (const h of attendus) if (!presents.includes(h)) err(`index.html : la mesure d'audience est configurée mais la CSP n'autorise pas « ${h} » : lancer node scripts/appliquer-analytics.js`);
  const balise = /<meta name="mesure-audience" content="([a-z]+)">/.exec(index)?.[1] || null;
  if ((balise || null) !== (cfg.analytics?.fournisseur || null)) err("index.html : balise de mesure d'audience en désaccord avec data/site-config.json : lancer node scripts/appliquer-analytics.js");
  return erreurs;
}
