#!/usr/bin/env node
/**
 * fetch-actualites.js
 * -------------------
 * Met à jour data/actualites.json : les derniers titres de la rubrique politique de médias nationaux
 * reconnus, de sensibilités différentes, lus dans leurs flux RSS publics.
 *
 * Le site ne reprend que le titre, la date et le lien vers l'article (jamais le texte) : chaque
 * information renvoie au média qui l'a publiée. Les titres qui parlent du même sujet sont regroupés ;
 * un sujet repris par plusieurs médias indépendants est mis en avant (« recoupé »).
 *
 * GARDE-FOUS :
 *  - seuls les médias de la liste MEDIAS ci-dessous sont lus, et seuls les liens vers leur propre site
 *    sont gardés ;
 *  - un lien présent dans la base des contenus démentis du Décodex (Le Monde) est écarté ;
 *  - la veille et le jour d'un tour de la présidentielle, les titres qui citent un sondage sont écartés
 *    (loi du 19 juillet 1977, art. 11) ;
 *  - si moins de 3 médias répondent, le fichier n'est pas modifié (erreur signalée par le workflow).
 *
 * USAGE : node scripts/fetch-actualites.js [--dry-run] [--dossier=flux/]   (flux locaux <id>.xml, tests)
 */

import { readFile, writeFile } from "fs/promises";
import { construireIndex, illustrer } from "./illustrations.js";

const DATA_FILE = "data/actualites.json";
const DRY_RUN = process.argv.includes("--dry-run");
const DOSSIER = process.argv.find((a) => a.startsWith("--dossier="))?.split("=")[1];
const JOURS = 4; // titres plus anciens ignorés
const MAX = 120;
const USER_AGENT = "hemicycle-france-bot/1.0 (https://github.com/Tahns/hemicycle-france)";
const DECODEX_URL = "https://asset.lemde.fr/medias/mmpub/data/decodex/hoax/hoax_debunks.json";

const MEDIAS = [
  { id: "franceinfo", nom: "franceinfo", flux: "https://www.francetvinfo.fr/politique.rss", domaine: "francetvinfo.fr" },
  { id: "lemonde", nom: "Le Monde", flux: "https://www.lemonde.fr/politique/rss_full.xml", domaine: "lemonde.fr" },
  { id: "lefigaro", nom: "Le Figaro", flux: "https://www.lefigaro.fr/rss/figaro_politique.xml", domaine: "lefigaro.fr" },
  { id: "liberation", nom: "Libération", flux: "https://www.liberation.fr/arc/outboundfeeds/rss/category/politique/?outputType=xml", domaine: "liberation.fr" },
  { id: "20minutes", nom: "20 Minutes", flux: "https://www.20minutes.fr/feeds/rss-politique.xml", domaine: "20minutes.fr" },
  { id: "publicsenat", nom: "Public Sénat", flux: "https://www.publicsenat.fr/feed", domaine: "publicsenat.fr" },
];

const log = (...m) => console.log("[fetch-actualites]", ...m);
const warn = (...m) => console.warn("[fetch-actualites][ATTENTION]", ...m);

const ENTITES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", laquo: "«", raquo: "»",
  hellip: "…", ndash: "–", mdash: "—", eacute: "é", egrave: "è", ecirc: "ê", euml: "ë", agrave: "à", acirc: "â", ccedil: "ç",
  icirc: "î", iuml: "ï", ocirc: "ô", ucirc: "û", ugrave: "ù", Eacute: "É", Agrave: "À", oelig: "œ",
};
const entites = (t) => t
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&([a-z]+);/gi, (m, e) => ENTITES[e] ?? ENTITES[e.toLowerCase()] ?? m);
function texte(brut) {
  const t = String(brut || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  // Certains flux encodent deux fois (« &amp;eacute; ») : deux passes
  return entites(entites(t)).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}
const balise = (bloc, nom) => bloc.match(new RegExp(`<${nom}(?:\\s[^>]*)?>([\\s\\S]*?)</${nom}>`, "i"))?.[1];

/** Articles d'un flux RSS 2.0 ou Atom : [{ titre, url, date }] */
function lireFlux(xml) {
  const blocs = [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi)].map((m) => m[0]);
  return blocs.map((b) => {
    const url = texte(balise(b, "link")) || b.match(/<link[^>]*href="([^"]+)"/i)?.[1] || texte(balise(b, "guid"));
    const date = new Date(texte(balise(b, "pubDate") || balise(b, "published") || balise(b, "updated") || balise(b, "dc:date")));
    return { titre: texte(balise(b, "title")), url: url?.trim(), date };
  });
}

// ---------- Regroupement des titres par sujet ----------
const MOTS_VIDES = new Set(("les des une pour dans avec sans sur par que qui quoi est son ses leur leurs aux du de la le un et ou mais donc car ni " +
  "pas plus tres tout tous toute toutes cette ces cet elle elles ils nous vous apres avant entre contre chez depuis selon face fait faire veut va " +
  "etre avoir ont sont sera seront etait comme encore deja aussi ainsi alors quand dont lors vers ceux celle celui quel quelle quels quelles " +
  "direct video info infos politique france francais francaise gouvernement ministre premier president annonce explique dit").split(" "));
const mots = (titre) => new Set(titre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter((m) => m.length >= 4 && !MOTS_VIDES.has(m)));
function memeSujet(a, b) {
  let communs = 0;
  for (const m of a) if (b.has(m)) communs++;
  // 3 mots communs, ou 2 qui pèsent au moins la moitié du titre le plus long (un titre court n'attire pas tout)
  return communs >= 3 || (communs === 2 && communs / Math.max(a.size, b.size) >= 0.5);
}

// Loi du 19 juillet 1977, art. 11 : même période de réserve que fetch-sondages.js
const TOURS_PRESIDENTIELLE = ["2027-04-18", "2027-05-02"];
function periodeReserve(maintenant) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(maintenant)
      .map((x) => [x.type, x.value])
  );
  const paris = `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  return TOURS_PRESIDENTIELLE.some((tour) => {
    const veille = new Date(Date.parse(tour + "T12:00:00Z") - 864e5).toISOString().slice(0, 10);
    return paris >= `${veille}T00:00` && paris < `${tour}T20:00`;
  });
}

async function telecharger(url) {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/rss+xml, application/xml, text/xml" }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function main() {
  const maintenant = new Date();
  const reserve = periodeReserve(maintenant);
  const normaliser = (u) => String(u).replace(/^https?:\/\/(www\.)?/, "").replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
  let dementis = new Set();
  if (!DOSSIER) {
    try {
      dementis = new Set(Object.keys(JSON.parse(await telecharger(DECODEX_URL)).hoaxes || {}).map(normaliser));
    } catch (e) {
      warn(`base du Décodex injoignable (${e.message}) : seule la liste des médias sert de filtre.`);
    }
  }

  const articles = [];
  const repondu = [];
  for (const m of MEDIAS) {
    let xml;
    try {
      xml = DOSSIER ? await readFile(`${DOSSIER}/${m.id}.xml`, "utf-8") : await telecharger(m.flux);
    } catch (e) {
      warn(`${m.nom} : flux illisible (${e.message}).`);
      continue;
    }
    const lus = lireFlux(xml);
    let gardes = 0;
    for (const a of lus) {
      let hote;
      try { hote = new URL(a.url).hostname.replace(/^www\./, ""); } catch { continue; }
      if (!a.titre || isNaN(a.date) || !/^https:/.test(a.url)) continue;
      if (hote !== m.domaine && !hote.endsWith("." + m.domaine)) continue;
      if ((maintenant - a.date) / 864e5 > JOURS || a.date - maintenant > 36e5) continue;
      if (dementis.has(normaliser(a.url))) continue;
      if (reserve && /sondage|intentions? de vote/i.test(a.titre)) continue;
      articles.push({ titre: a.titre, url: a.url, media: m.nom, date: a.date.toISOString() });
      gardes++;
    }
    if (lus.length) repondu.push(m.nom);
    log(`${m.nom} : ${lus.length} article(s) lu(s), ${gardes} gardé(s).`);
  }

  if (repondu.length < 3) {
    warn(`Seulement ${repondu.length} média(s) lisible(s) : ${DATA_FILE} n'est pas modifié.`);
    process.exitCode = 1;
    return;
  }

  // Un même article peut figurer deux fois dans un flux : dédoublonnage par lien
  const vus = new Set();
  const uniques = articles.filter((a) => !vus.has(a.url) && vus.add(a.url)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, MAX);

  // Sujets : chaque titre est comparé au premier titre du sujet (pas à tous : sinon les sujets s'enchaînent)
  const sujets = [];
  for (const a of uniques) {
    const m = mots(a.titre);
    const s = m.size >= 2 && sujets.find((x) => memeSujet(m, x.mots));
    if (s) s.articles.push(a);
    else sujets.push({ mots: m, articles: [a] });
  }
  // Titre de tête : le plus proche des autres titres du sujet (à égalité, le plus récent)
  const central = (articles) => {
    const ens = articles.map((a) => mots(a.titre));
    const score = (i) => ens.reduce((t, e, j) => t + (i === j ? 0 : [...ens[i]].filter((x) => e.has(x)).length), 0);
    const i = ens.map((_, k) => k).sort((x, y) => score(y) - score(x) || x - y)[0];
    return [articles[i], ...articles.filter((_, k) => k !== i)];
  };
  // Illustration : portraits et logos libres hébergés sur le site, ou pictogramme du thème
  const motifs = await construireIndex();
  const sortieSujets = sujets
    .map((s) => ({ medias: new Set(s.articles.map((a) => a.media)).size, derniere: s.articles[0].date, illustration: illustrer(s.articles.map((a) => a.titre), motifs), articles: central(s.articles) }))
    .sort((a, b) => b.medias - a.medias || b.derniere.localeCompare(a.derniere));

  const sortie = {
    source: "Flux RSS publics de la rubrique politique de médias nationaux",
    medias: MEDIAS.map((m) => ({ nom: m.nom, site: `https://www.${m.domaine}/`, lu: repondu.includes(m.nom) })),
    sujets: sortieSujets,
  };
  const ancien = JSON.parse(await readFile(DATA_FILE, "utf-8").catch(() => "{}"));
  delete ancien.lastUpdated;
  if (JSON.stringify(ancien) === JSON.stringify(sortie)) return log("Aucun changement.");
  if (DRY_RUN) return console.log(JSON.stringify(sortie, null, 2));
  await writeFile(DATA_FILE, JSON.stringify({ lastUpdated: maintenant.toISOString(), ...sortie }, null, 1) + "\n");
  log(`${DATA_FILE} mis à jour : ${uniques.length} titres, ${sortieSujets.filter((s) => s.medias >= 2).length} sujet(s) repris par plusieurs médias.`);
}

main().catch((e) => {
  console.error("[fetch-actualites] ÉCHEC :", e);
  process.exitCode = 1;
});
