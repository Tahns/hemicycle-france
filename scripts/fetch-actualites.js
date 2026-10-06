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
 *  - « dossiers » (scripts/dossiers.cjs) : mots-clés communs à >= 6 articles de >= 4 médias sur 48 h ; faits divers et
 *    accusations écartés, titres neutres ;
 *  - « titrePropre », « contexte », « chiffre », « date », « video » (scripts/titres-propres.cjs) : titre rédigé par le site à
 *    partir du recoupement de plusieurs médias (jamais un titre de presse, qui n'est que cité avec son média), contexte tiré de
 *    nos données officielles, liens vidéo signalés ; en cas de doute, le champ est absent ;
 *  - si moins de 3 médias répondent, le fichier n'est pas modifié (erreur signalée par le workflow).
 *
 * USAGE : node scripts/fetch-actualites.js [--dry-run] [--dossier=flux/]   (flux locaux <id>.xml, tests)
 */

import { fetchPoli, releveRecent, noterReleve } from "./http.js";
import { readFile, writeFile } from "fs/promises";
import { appendFileSync } from "fs";
import { createRequire } from "module";
import { ecrireGarde } from "./garde.js";
import { construireIndex, illustrer } from "./illustrations.js";
const requireCjs = createRequire(import.meta.url);
const { concerneLaFrance } = requireCjs("./pertinence.cjs");
const { construireDossiers } = requireCjs("./dossiers.cjs");
const { estVideo, enrichirSujet } = requireCjs("./titres-propres.cjs");
const { regrouper, construireReferentiel, sourcesDistinctes, centrale } = requireCjs("./regroupement.cjs");

const DATA_FILE = "data/actualites.json";
const DRY_RUN = process.argv.includes("--dry-run");
const DOSSIER = process.argv.find((a) => a.startsWith("--dossier="))?.split("=")[1];
const JOURS = 4; // titres plus anciens ignorés
const MAX = 120; // sujets conservés dans le fichier
const MAX_REGROUPEMENT = 700; // titres les plus récents soumis au regroupement (le lot du jour sert à pondérer les mots rares)
const USER_AGENT = "hemicycle-france-bot/1.0 (https://github.com/Tahns/hemicycle-france)";
const DECODEX_URL = "https://asset.lemde.fr/medias/mmpub/data/decodex/hoax/hoax_debunks.json";

const MEDIAS = [
  { id: "franceinfo", nom: "franceinfo", flux: "https://www.francetvinfo.fr/politique.rss", domaine: "francetvinfo.fr" },
  { id: "lemonde", nom: "Le Monde", flux: "https://www.lemonde.fr/politique/rss_full.xml", domaine: "lemonde.fr" },
  { id: "lefigaro", nom: "Le Figaro", flux: "https://www.lefigaro.fr/rss/figaro_politique.xml", domaine: "lefigaro.fr" },
  { id: "liberation", nom: "Libération", flux: "https://www.liberation.fr/arc/outboundfeeds/rss/category/politique/?outputType=xml", domaine: "liberation.fr" },
  { id: "20minutes", nom: "20 Minutes", flux: "https://www.20minutes.fr/feeds/rss-politique.xml", domaine: "20minutes.fr" },
  { id: "hugodecrypte", nom: "Hugo Décrypte", flux: "https://www.youtube.com/feeds/videos.xml?channel_id=UCAcAnMF0OrCtUep3Y4M-ZPw", domaine: "youtube.com", filtre: /gouvernement|président|macron|assembl|sénat|député|ministre|élection|présidentielle|loi |réforme|budget|lycé|manifest|police|parti|premier ministre|politi/i },
  { id: "publicsenat", nom: "Public Sénat", flux: "https://www.publicsenat.fr/feed", domaine: "publicsenat.fr" },
  { id: "bfmtv", nom: "BFMTV", flux: "https://www.bfmtv.com/rss/politique/", domaine: "bfmtv.com" },
  { id: "france24", nom: "France 24", flux: "https://www.france24.com/fr/france/rss", domaine: "france24.com" },
  { id: "rfi", nom: "RFI", flux: "https://www.rfi.fr/fr/france/rss", domaine: "rfi.fr" },
  { id: "lexpress", nom: "L'Express", flux: "https://www.lexpress.fr/arc/outboundfeeds/rss/politique.xml", domaine: "lexpress.fr" },
  { id: "leparisien", nom: "Le Parisien", flux: "https://www.leparisien.fr/politique/rss.xml", domaine: "leparisien.fr" },
  { id: "mediapart", nom: "Mediapart", flux: "https://www.mediapart.fr/articles/feed", domaine: "mediapart.fr" },
  { id: "sudouest", nom: "Sud Ouest", flux: "https://www.sudouest.fr/politique/rss.xml", domaine: "sudouest.fr" },
  { id: "leprogres", nom: "Le Progrès", flux: "https://www.leprogres.fr/politique/rss", domaine: "leprogres.fr" },
  { id: "dna", nom: "Dernières Nouvelles d'Alsace", flux: "https://www.dna.fr/politique/rss", domaine: "dna.fr" },
  { id: "ledauphine", nom: "Le Dauphiné libéré", flux: "https://www.ledauphine.com/politique/rss", domaine: "ledauphine.com" },
  { id: "estrepublicain", nom: "L'Est républicain", flux: "https://www.estrepublicain.fr/politique/rss", domaine: "estrepublicain.fr" },
  { id: "nicematin", nom: "Nice-Matin", flux: "https://www.nicematin.com/politique/rss", domaine: "nicematin.com" },
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
  }).filter((a) => !titreCasse(a.titre));
}

/** Titre d'un flux mal généré (gabarit non rempli du type « $content.TitleNoTags », « {{title}} », « %title% ») : l'article est écarté. */
const titreCasse = (t) => /\$content\.|\$\{|\{\{|\}\}|%[a-z_]+%|TitleNoTags/i.test(String(t || ""));

// ---------- Regroupement des titres par sujet ----------
// Le regroupement par sujet (normalisation, entités, TF-IDF, blocages) est dans scripts/regroupement.cjs

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
  const res = await fetchPoli(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/rss+xml, application/xml, text/xml" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function main() {
  // Déclenchement supplémentaire (workflow_run) juste après un relevé : on ne redemande pas tous les flux
  const GATE = Number(process.env.GATE_MINUTES) || 0;
  if (GATE && !DOSSIER && !DRY_RUN && (await releveRecent("actualites", GATE))) return log(`Relevé de moins de ${GATE} min : les flux ne sont pas redemandés.`);
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
  const illisibles = [];
  for (const m of MEDIAS) {
    let xml;
    try {
      xml = DOSSIER ? await readFile(`${DOSSIER}/${m.id}.xml`, "utf-8") : await telecharger(m.flux);
    } catch (e) {
      warn(`${m.nom} : flux illisible (${e.message}).`);
      illisibles.push(`${m.nom} (${e.message})`);
      continue;
    }
    const lus = lireFlux(xml);
    let gardes = 0;
    for (const a of lus) {
      let hote;
      try { hote = new URL(a.url).hostname.replace(/^www\./, ""); } catch { continue; }
      if (!a.titre || isNaN(a.date) || !/^https:/.test(a.url)) continue;
      if (hote !== m.domaine && !hote.endsWith("." + m.domaine)) continue;
      if (m.filtre && !m.filtre.test(a.titre)) continue;
      if ((maintenant - a.date) / 864e5 > JOURS || a.date - maintenant > 36e5) continue;
      if (dementis.has(normaliser(a.url))) continue;
      if (reserve && /sondage|intentions? de vote/i.test(a.titre)) continue;
      articles.push({ titre: a.titre, url: a.url, media: m.nom, date: a.date.toISOString() });
      gardes++;
    }
    if (lus.length) repondu.push(m.nom);
    log(`${m.nom} : ${lus.length} article(s) lu(s), ${gardes} gardé(s).`);
  }

  if (illisibles.length && process.env.GITHUB_STEP_SUMMARY) {
    try { appendFileSync(process.env.GITHUB_STEP_SUMMARY, `- **Actualités** : flux illisible(s) ce quart d'heure : ${illisibles.join(", ")}.\n`); } catch {}
  }
  if (!DOSSIER && repondu.length >= 3) await noterReleve("actualites").catch(() => {});
  if (repondu.length < 3) {
    warn(`Seulement ${repondu.length} média(s) lisible(s) : ${DATA_FILE} n'est pas modifié.`);
    process.exitCode = 1;
    return;
  }

  // Un même article peut figurer deux fois dans un flux : dédoublonnage par lien
  const vus = new Set();
  const tous = articles.filter((a) => !vus.has(a.url) && vus.add(a.url)).sort((a, b) => b.date.localeCompare(a.date));
  const uniques = tous.slice(0, MAX_REGROUPEMENT);
  // Dossiers : un sujet dominant éclaté en petits sujets d'un seul média (>= 6 articles, >= 4 médias sur 48 h)
  const dossiers = construireDossiers(tous, maintenant);

  // Données du site : personnes à reconnaître dans les titres, contexte des sujets (fichiers absents ignorés)
  const lire = (f) => readFile(`data/${f}.json`, "utf-8").then(JSON.parse).catch(() => null);
  const donnees = { gouvernement: await lire("gouvernement"), dirigeants: await lire("dirigeants"), deputes: await lire("deputes"), sondages: await lire("sondages"), agenda: await lire("agenda-an"), tours: TOURS_PRESIDENTIELLE };
  const referentiel = construireReferentiel({ ...donnees, candidats: await lire("candidats"), senateurs: await lire("senateurs") });

  // Sujets : scripts/regroupement.cjs (entités, TF-IDF du lot, centroïde, fenêtre de 36 h, blocages des fusions risquées)
  const sujets = regrouper(uniques, { referentiel });
  // Illustration : portraits et logos libres hébergés sur le site, ou pictogramme du thème
  const motifs = await construireIndex();
  // Le site suit la vie politique française : un sujet qui ne parle que de l'étranger est écarté.
  // « medias » : nombre de médias cités (inchangé, lu partout) ; « mediasDistincts » / « sources » : même décompte, mais un groupe
  // de presse (EBRA, France Médias Monde) ou une dépêche reprise à l'identique ne compte qu'une fois.
  const sortieSujets = sujets
    .filter((s) => concerneLaFrance(s.articles.map((a) => a.titre)))
    .map((s) => {
      const { mediasDistincts, sources } = sourcesDistinctes(s.articles);
      return {
        medias: new Set(s.articles.map((a) => a.media)).size, mediasDistincts, sources,
        derniere: s.articles.reduce((d, a) => (a.date > d ? a.date : d), ""),
        illustration: illustrer(s.articles.map((a) => a.titre), motifs), articles: centrale(s.articles, referentiel),
      };
    })
    .sort((a, b) => b.mediasDistincts - a.mediasDistincts || b.medias - a.medias || b.derniere.localeCompare(a.derniere))
    .slice(0, MAX);

  // Ce que le site ajoute : titre à nous, contexte tiré de nos données, chiffre, date, liens vidéo
  for (const d of dossiers) for (const a of d.articles || []) if (estVideo(a.url)) a.video = true;
  for (const s of sortieSujets) enrichirSujet(s, dossiers, donnees, maintenant);

  const sortie = {
    source: "Flux RSS publics de la rubrique politique de médias nationaux",
    medias: MEDIAS.map((m) => ({ nom: m.nom, site: `https://www.${m.domaine}/`, lu: repondu.includes(m.nom) })),
    dossiers,
    sujets: sortieSujets,
  };
  const ancien = JSON.parse(await readFile(DATA_FILE, "utf-8").catch(() => "{}"));
  delete ancien.lastUpdated;
  if (JSON.stringify(ancien) === JSON.stringify(sortie)) return log("Aucun changement.");
  if (DRY_RUN) return console.log(JSON.stringify(sortie, null, 2));
  // Le volume de l'actualité varie fortement d'une heure à l'autre : seuil de chute plus large (50 %) que les données stables
  const contenu = { lastUpdated: maintenant.toISOString(), ...sortie };
  if (await ecrireGarde(DATA_FILE, contenu, { nom: DATA_FILE, texte: JSON.stringify(contenu, null, 1) + "\n", liste: (d) => d.sujets, obligatoires: ["articles", "derniere"], seuil: 0.5 })) log(`${DATA_FILE} mis à jour : ${uniques.length} titres, ${sortieSujets.length} sujet(s), ${sortieSujets.filter((s) => s.mediasDistincts >= 2).length} repris par plusieurs médias distincts, ${dossiers.length} dossier(s).`);
}

main().catch((e) => {
  console.error("[fetch-actualites] ÉCHEC :", e);
  process.exitCode = 1;
});
