#!/usr/bin/env node
/**
 * fetch-portraits.js
 * ------------------
 * Portraits des personnalités sans photo officielle sur le site (chefs de parti, candidats déclarés,
 * membres du Gouvernement qui ne siègent ni à l'Assemblée ni au Sénat), pour illustrer les actualités.
 *
 * Pour chaque nom : image principale de son article Wikipédia, à condition que l'article décrive une
 * personnalité politique et que le fichier, sur Wikimedia Commons, soit sous licence libre (domaine
 * public, CC0, CC BY, CC BY-SA). Vignette de 120 px dans photos/personnalites/<slug>.jpg ; auteur et
 * licence notés dans data/portraits.json (crédités dans les mentions légales et au survol de la photo).
 * Un nom sans portrait libre est retenté au bout de 30 jours.
 *
 * USAGE : node scripts/fetch-portraits.js [--max=15]
 */
import { readFile, writeFile, mkdir, access } from "fs/promises";
import { pathToFileURL } from "url";

const DATA_FILE = "data/portraits.json";
const DOSSIER = "photos/personnalites";
const USER_AGENT = "hemicycle-france-bot/1.0 (https://github.com/Tahns/hemicycle-france)";
const MAX = parseInt(process.argv.find((a) => a.startsWith("--max="))?.split("=")[1] || "15", 10);
const log = (...m) => console.log("[fetch-portraits]", ...m);
const warn = (...m) => console.warn("[fetch-portraits][ATTENTION]", ...m);
const texte = (h) => String(h || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
export const slug = (nom) => nom.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const existe = (f) => access(f).then(() => true, () => false);
const lire = async (f) => JSON.parse(await readFile(f, "utf-8").catch(() => "null"));

async function api(url) {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Fichier de l'image principale de l'article, si l'article décrit une personnalité politique */
async function imageArticle(nom) {
  for (const titre of [nom, `${nom} (homme politique)`, `${nom} (femme politique)`]) {
    const d = await api(`https://fr.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=pageimages|pageprops|description&piprop=name&titles=${encodeURIComponent(titre)}`);
    const page = Object.values(d.query?.pages || {})[0];
    if (!page || page.missing !== undefined || page.pageprops?.disambiguation !== undefined) continue;
    if (page.description && !/politi|ministre|député|sénat|maire|président|syndical|homme d.état|femme d.état|haut fonctionnaire|militant|candidat|essayiste|journaliste/i.test(page.description)) continue;
    return page.pageimage ? { fichier: page.pageimage, page: `https://fr.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}` } : null;
  }
  return null;
}

async function main() {
  const [deputes, senateurs, dirigeants, candidats, gouvernement] = await Promise.all(
    ["deputes", "senateurs", "dirigeants", "candidats", "gouvernement"].map((f) => lire(`data/${f}.json`))
  );
  const data = (await lire(DATA_FILE)) || { source: "Wikimedia Commons (licences libres), via l'image principale de l'article Wikipédia", portraits: {} };
  const parlementaires = new Set([...(deputes?.deputes || []), ...(senateurs?.senateurs || [])].map((p) => p.nom));
  const noms = [...new Set([
    ...(dirigeants?.dirigeants || []).map((d) => d.nom),
    ...(candidats?.candidats || []).map((c) => c.nom),
    ...(gouvernement?.membres || []).map((m) => m.nom),
    "Emmanuel Macron",
  ])].filter((n) => n && n !== "—" && !parlementaires.has(n));

  await mkdir(DOSSIER, { recursive: true });
  const maintenant = new Date();
  let traites = 0, ajouts = 0;
  for (const nom of noms) {
    const p = data.portraits[nom];
    const fichierLocal = `${DOSSIER}/${slug(nom)}.jpg`;
    if (p?.fichier && (await existe(fichierLocal))) continue;
    // Sans article reconnu : nouvel essai le lendemain ; licence non libre : au bout de 30 jours
    if (p && !p.fichier && (maintenant - new Date(p.essai)) / 864e5 < (/pas d'article/.test(p.raison || "") ? 1 : 30)) continue;
    if (traites++ >= MAX) break;
    try {
      const img = await imageArticle(nom);
      if (!img) throw new Error("pas d'article ou pas d'image principale");
      const d = await api(`https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=120&titles=${encodeURIComponent("File:" + img.fichier)}`);
      const info = Object.values(d.query?.pages || {})[0]?.imageinfo?.[0];
      if (!info?.thumburl) throw new Error("fichier absent de Commons (image non libre hébergée sur Wikipédia ?)");
      const m = info.extmetadata || {};
      const licence = texte(m.LicenseShortName?.value);
      if (!/public domain|domaine public|^cc0|^cc by(-sa)?\b/i.test(licence)) throw new Error(`licence non libre (${licence})`);
      const res = await fetch(info.thumburl, { headers: { "User-Agent": USER_AGENT } });
      if (!res.ok || !/image\/(jpeg|png)/.test(res.headers.get("content-type") || "")) throw new Error(`téléchargement impossible (HTTP ${res.status})`);
      await writeFile(fichierLocal, Buffer.from(await res.arrayBuffer()));
      data.portraits[nom] = { fichier: img.fichier, licence, auteur: texte(m.Artist?.value).slice(0, 120) || null, source: info.descriptionurl, article: img.page };
      ajouts++;
      log(`${nom} : ${img.fichier} (${licence})`);
    } catch (e) {
      data.portraits[nom] = { fichier: null, essai: maintenant.toISOString().slice(0, 10), raison: e.message };
      log(`${nom} : aucun portrait libre (${e.message}).`);
    }
  }
  data.portraits = Object.fromEntries(Object.entries(data.portraits).sort(([a], [b]) => a.localeCompare(b, "fr")));
  await writeFile(DATA_FILE, JSON.stringify(data, null, 1) + "\n");
  log(`${ajouts} portrait(s) ajouté(s), ${Object.values(data.portraits).filter((p) => p.fichier).length} au total.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { warn("ÉCHEC :", e.message); process.exitCode = 1; });
