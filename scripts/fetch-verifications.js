#!/usr/bin/env node
/**
 * fetch-verifications.js
 * ----------------------
 * Met à jour data/verifications.json : les derniers articles de vérification des faits publiés par
 * des rédactions françaises, lus dans leurs flux RSS publics (Les Décodeurs du Monde, franceinfo
 * « Vrai ou faux », AFP Factuel, 20 Minutes « Fake Off », Libération CheckNews).
 *
 * Le site ne reprend que le titre, la date et le lien, attribués à la rédaction qui les a publiés :
 * il ne tranche rien lui-même et n'écrit jamais d'accusation contre une personne nommée.
 *
 * GARDE-FOUS :
 *  - seuls les liens vers le site de la rédaction qui publie le flux sont gardés (https uniquement) ;
 *  - chaque média a plusieurs adresses de flux candidates, essayées dans l'ordre : un flux injoignable
 *    est signalé (« ::warning:: » en CI) mais ne bloque rien ;
 *  - la veille et le jour d'un tour de la présidentielle, les titres qui citent un sondage sont écartés ;
 *  - si aucun flux n'est lisible, le fichier n'est pas modifié (sans erreur : source temporairement absente) ;
 *  - un nouveau fichier qui perdrait plus de 60 % des titres est refusé (garde.js).
 *
 * USAGE : node scripts/fetch-verifications.js [--dry-run] [--dossier=flux/]   (flux locaux <id>.xml, tests)
 */

import { fetchPoli } from "./http.js";
import { readFile } from "fs/promises";
import { ecrireGarde } from "./garde.js";

const DATA_FILE = "data/verifications.json";
const DRY_RUN = process.argv.includes("--dry-run");
const DOSSIER = process.argv.find((a) => a.startsWith("--dossier="))?.split("=")[1];
const JOURS = 45; // les vérifications vieillissent moins vite que l'actualité
const MAX = 60;
const PAR_MEDIA = 15;
const USER_AGENT = "hemicycle-france-bot/1.0 (https://github.com/Tahns/hemicycle-france)";

// Adresses de flux : la première qui répond est retenue. Le journal de l'exécution dit lesquelles répondent.
export const MEDIAS = [
  { id: "decodeurs", nom: "Les Décodeurs (Le Monde)", flux: ["https://www.lemonde.fr/les-decodeurs/rss_full.xml", "https://www.lemonde.fr/les-decodeurs/rss.xml"], domaine: "lemonde.fr" },
  { id: "franceinfo", nom: "franceinfo, Vrai ou faux", flux: ["https://www.francetvinfo.fr/vrai-ou-fake.rss", "https://www.francetvinfo.fr/vrai-ou-fake/rss.xml"], domaine: "francetvinfo.fr" },
  { id: "afp", nom: "AFP Factuel", flux: ["https://factuel.afp.com/rss.xml", "https://factuel.afp.com/rss"], domaine: "afp.com" },
  { id: "20minutes", nom: "20 Minutes, Fake Off", flux: ["https://www.20minutes.fr/feeds/rss-fake-off.xml", "https://www.20minutes.fr/rss/fake-off.xml"], domaine: "20minutes.fr" },
  { id: "checknews", nom: "Libération, CheckNews", flux: ["https://www.liberation.fr/arc/outboundfeeds/rss/category/checknews/?outputType=xml", "https://www.liberation.fr/arc/outboundfeeds/rss/category/societe/checknews/?outputType=xml"], domaine: "liberation.fr" },
];

const log = (...m) => console.log("[fetch-verifications]", ...m);
const warn = (...m) => console.warn("[fetch-verifications][ATTENTION]", ...m);

const ENTITES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", laquo: "«", raquo: "»", hellip: "…", ndash: "–", mdash: "—", eacute: "é", egrave: "è", ecirc: "ê", agrave: "à", ccedil: "ç" };
const entites = (t) => t
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&([a-z]+);/gi, (m, e) => ENTITES[e] ?? ENTITES[e.toLowerCase()] ?? m);
const texte = (brut) => entites(entites(String(brut || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"))).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const balise = (bloc, nom) => bloc.match(new RegExp(`<${nom}(?:\\s[^>]*)?>([\\s\\S]*?)</${nom}>`, "i"))?.[1];

/** Articles d'un flux RSS 2.0 ou Atom : [{ titre, url, date }] */
export function lireFlux(xml) {
  const blocs = [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi)].map((m) => m[0]);
  return blocs.map((b) => {
    const url = texte(balise(b, "link")) || b.match(/<link[^>]*href="([^"]+)"/i)?.[1] || texte(balise(b, "guid"));
    const date = new Date(texte(balise(b, "pubDate") || balise(b, "published") || balise(b, "updated") || balise(b, "dc:date")));
    return { titre: texte(balise(b, "title")), url: url?.trim(), date };
  });
}

// Loi du 19 juillet 1977, art. 11 : même période de réserve que fetch-actualites.js
const TOURS_PRESIDENTIELLE = ["2027-04-18", "2027-05-02"];
export function periodeReserve(maintenant) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(maintenant).map((x) => [x.type, x.value])
  );
  const paris = `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  return TOURS_PRESIDENTIELLE.some((tour) => {
    const veille = new Date(Date.parse(tour + "T12:00:00Z") - 864e5).toISOString().slice(0, 10);
    return paris >= `${veille}T00:00` && paris < `${tour}T20:00`;
  });
}

/** Articles retenus d'un flux : liens https vers le site du média, titres datés, récents. Fonction pure. */
export function retenir(lus, media, maintenant, reserve = false) {
  const sortie = [];
  for (const a of lus) {
    let hote;
    try { hote = new URL(a.url).hostname.replace(/^www\./, ""); } catch { continue; }
    if (!a.titre || a.titre.length > 300 || isNaN(a.date) || !/^https:/.test(a.url)) continue;
    if (hote !== media.domaine && !hote.endsWith("." + media.domaine)) continue;
    if ((maintenant - a.date) / 864e5 > JOURS || a.date - maintenant > 36e5) continue;
    if (reserve && /sondage|intentions? de vote/i.test(a.titre)) continue;
    sortie.push({ titre: a.titre, media: media.nom, date: a.date.toISOString(), url: a.url });
  }
  return sortie.sort((x, y) => y.date.localeCompare(x.date)).slice(0, PAR_MEDIA);
}

async function telecharger(url) {
  const res = await fetchPoli(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/rss+xml, application/xml, text/xml" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function main() {
  const maintenant = new Date();
  const reserve = periodeReserve(maintenant);
  const articles = [];
  const medias = [];
  for (const m of MEDIAS) {
    let lus = null;
    for (const url of DOSSIER ? [null] : m.flux) {
      try {
        const xml = DOSSIER ? await readFile(`${DOSSIER}/${m.id}.xml`, "utf-8") : await telecharger(url);
        const l = lireFlux(xml);
        if (!l.length) throw new Error("aucun article dans le flux");
        lus = l;
        log(`${m.nom} : flux ${url || "local"} lisible.`);
        break;
      } catch (e) {
        warn(`${m.nom} : flux ${url || "local"} illisible (${e.message}).`);
      }
    }
    if (!lus) {
      console.log(`::warning::Vérifications : aucun flux lisible pour ${m.nom} (adresse à revoir dans scripts/fetch-verifications.js).`);
    } else {
      const gardes = retenir(lus, m, maintenant, reserve);
      articles.push(...gardes);
      log(`${m.nom} : ${lus.length} article(s) lu(s), ${gardes.length} gardé(s).`);
    }
    medias.push({ nom: m.nom, site: `https://www.${m.domaine}/`, lu: !!lus });
  }

  if (!medias.some((m) => m.lu)) {
    // Source temporairement inaccessible : on garde le fichier existant, sans faire échouer la mise à jour
    warn(`Aucun flux lisible : ${DATA_FILE} n'est pas modifié.`);
    return;
  }
  const vus = new Set();
  const verifications = articles.filter((a) => !vus.has(a.url) && vus.add(a.url)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, MAX);
  const sortie = { source: "Flux RSS publics de rédactions françaises de vérification des faits", medias, verifications };
  const ancien = JSON.parse(await readFile(DATA_FILE, "utf-8").catch(() => "{}"));
  delete ancien.lastUpdated;
  if (JSON.stringify(ancien) === JSON.stringify(sortie)) return log("Aucun changement.");
  if (DRY_RUN) return console.log(JSON.stringify(sortie, null, 2));
  const contenu = { lastUpdated: maintenant.toISOString(), ...sortie };
  if (await ecrireGarde(DATA_FILE, contenu, { nom: DATA_FILE, texte: JSON.stringify(contenu, null, 1) + "\n", liste: (d) => d.verifications, obligatoires: ["titre", "url", "date"], seuil: 0.6, videPermis: true })) {
    log(`${DATA_FILE} mis à jour : ${verifications.length} titre(s).`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error("[fetch-verifications] ÉCHEC :", e);
    process.exitCode = 1;
  });
}
