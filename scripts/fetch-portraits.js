#!/usr/bin/env node
/**
 * fetch-portraits.js
 * ------------------
 * Portraits des personnalités sans photo officielle sur le site (chefs de parti, candidats déclarés,
 * personnes citées dans la page Justice, membres du Gouvernement qui ne siègent ni à l'Assemblée ni au Sénat), pour illustrer les actualités.
 *
 * Pour chaque nom : image principale de son article Wikipédia, à condition que l'article décrive une
 * personnalité politique et que le fichier, sur Wikimedia Commons, soit sous licence libre (domaine
 * public, CC0, CC BY, CC BY-SA, ou autre licence libre acceptée par Commons). Vignette de 120 px dans photos/personnalites/<slug>.jpg ; auteur et
 * licence notés dans data/portraits.json (crédités dans les mentions légales et au survol de la photo).
 * Un nom sans portrait libre est retenté au bout de 30 jours.
 * Haute définition (stories Instagram, pour qu'elles ne soient pas floues) : la même image, sous la même licence et avec les mêmes
 * crédits, est aussi téléchargée en 640 px de large au plus (JPEG de 150 Ko au plus ; 480, 360 puis 280 px si la première est trop
 * lourde) dans photos/personnalites/hd/<slug>.jpg. La vignette du site n'est pas remplacée. Une version HD impossible à obtenir
 * est retentée au bout de 30 jours (champ « hd » de data/portraits.json).
 *
 * USAGE : node scripts/fetch-portraits.js [--max=40]
 */
import { readFile, writeFile, mkdir, access } from "fs/promises";
import { pathToFileURL } from "url";

const DATA_FILE = "data/portraits.json";
const DOSSIER = "photos/personnalites";
const DOSSIER_HD = `${DOSSIER}/hd`;
const LARGEURS_HD = [640, 480, 360, 280];
const MAX_OCTETS_HD = 150 * 1024;
const USER_AGENT = "hemicycle-france-bot/1.0 (https://github.com/Tahns/hemicycle-france)";
const MAX = parseInt(process.argv.find((a) => a.startsWith("--max="))?.split("=")[1] || "40", 10);
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
async function imageArticle(nom, titreArticle) {
  for (const titre of [titreArticle || nom, `${nom} (homme politique)`, `${nom} (femme politique)`]) {
    const d = await api(`https://fr.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=pageimages|pageprops|description&piprop=name&titles=${encodeURIComponent(titre)}`);
    const page = Object.values(d.query?.pages || {})[0];
    if (!page || page.missing !== undefined || page.pageprops?.disambiguation !== undefined) continue;
    if (page.description && !/politi|ministre|député|sénat|maire|président|syndical|homme d.état|femme d.état|empereur|chef de l.état|haut fonctionnaire|militant|candidat|essayiste|journaliste/i.test(page.description)) continue;
    return page.pageimage ? { fichier: page.pageimage, page: `https://fr.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}` } : null;
  }
  return null;
}

/** Contrôle de licence commun aux vignettes et aux versions HD : renvoie la licence ou lève une erreur. */
export function licenceLibre(m) {
  const licence = texte(m?.LicenseShortName?.value);
  // Commons n'héberge que des fichiers libres ; on écarte quand même toute mention de restriction
  if (!licence || /non[- ]?free|fair use|non commercial|\bnc\b|\bnd\b|all rights reserved|tous droits/i.test(licence)) throw new Error(`licence non libre (${licence || "inconnue"})`);
  return licence;
}

/**
 * Version haute définition d'un fichier de Commons : JPEG de LARGEURS_HD[0] px de large au plus et MAX_OCTETS_HD au plus.
 * `api` et `telecharger` sont injectables pour les essais hors ligne. Renvoie { octets, largeur, licence, auteur, source }.
 */
export async function recupererHd(fichierCommons, { api: appel = api, telecharger = (u) => fetch(u, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(30000) }) } = {}) {
  let derniere = "aucune largeur n'a convenu";
  for (const largeur of LARGEURS_HD) {
    const d = await appel(`https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=${largeur}&titles=${encodeURIComponent("File:" + fichierCommons)}`);
    const info = Object.values(d.query?.pages || {})[0]?.imageinfo?.[0];
    if (!info?.thumburl) throw new Error("fichier absent de Commons");
    const licence = licenceLibre(info.extmetadata); // même contrôle que la vignette
    const res = await telecharger(info.thumburl);
    if (!res.ok) throw new Error(`téléchargement HD impossible (HTTP ${res.status})`);
    if (!/image\/jpeg/.test(res.headers.get("content-type") || "")) throw new Error(`HD : format non JPEG (${res.headers.get("content-type")})`);
    const octets = Buffer.from(await res.arrayBuffer());
    if (octets.length <= MAX_OCTETS_HD) return { octets, largeur, licence, auteur: texte(info.extmetadata?.Artist?.value).slice(0, 120) || null, source: info.descriptionurl };
    derniere = `${Math.round(octets.length / 1024)} Ko à ${largeur} px`;
  }
  throw new Error(`HD trop lourde (${derniere}, maximum ${MAX_OCTETS_HD / 1024} Ko)`);
}

async function main() {
  const [deputes, senateurs, dirigeants, candidats, gouvernement, justice, presidents] = await Promise.all(
    ["deputes", "senateurs", "dirigeants", "candidats", "gouvernement", "justice", "presidents"].map((f) => lire(`data/${f}.json`))
  );
  // Présidents de la République (data/presidents.json) : le titre de l'article Wikipédia vient de leur lien
  const presidentsListe = (presidents?.regimes || []).flatMap((r) => r.presidents || []);
  const titres = Object.fromEntries(presidentsListe.map((p) => [p.nom, decodeURIComponent(String(p.wikipedia || "").split("/wiki/")[1] || "").replace(/_/g, " ")]));
  const data = (await lire(DATA_FILE)) || { source: "Wikimedia Commons (licences libres), via l'image principale de l'article Wikipédia", portraits: {} };
  const parlementaires = new Set([...(deputes?.deputes || []), ...(senateurs?.senateurs || [])].map((p) => p.nom));
  const noms = [...new Set([
    ...(dirigeants?.dirigeants || []).map((d) => d.nom),
    ...(candidats?.candidats || []).map((c) => c.nom),
    ...(gouvernement?.membres || []).map((m) => m.nom),
    ...(justice?.condamnations || []).map((c) => c.nom),
    ...presidentsListe.map((p) => p.nom),
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
      const img = await imageArticle(nom, titres[nom]);
      if (!img) throw new Error("pas d'article ou pas d'image principale");
      const d = await api(`https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=120&titles=${encodeURIComponent("File:" + img.fichier)}`);
      const info = Object.values(d.query?.pages || {})[0]?.imageinfo?.[0];
      if (!info?.thumburl) throw new Error("fichier absent de Commons (image non libre hébergée sur Wikipédia ?)");
      const m = info.extmetadata || {};
      const licence = licenceLibre(m);
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

  // Versions HD des portraits déjà retenus (mêmes crédits : l'entrée du portrait fait foi)
  await mkdir(DOSSIER_HD, { recursive: true });
  const MAX_HD = parseInt(process.argv.find((a) => a.startsWith("--max-hd="))?.split("=")[1] || "60", 10);
  let hd = 0, essais = 0;
  for (const [nom, p] of Object.entries(data.portraits)) {
    if (!p?.fichier || !(await existe(`${DOSSIER}/${slug(nom)}.jpg`)) || (await existe(`${DOSSIER_HD}/${slug(nom)}.jpg`))) continue;
    if (p.hd?.essai && (maintenant - new Date(p.hd.essai)) / 864e5 < 30) continue;
    if (essais++ >= MAX_HD) break;
    try {
      const r = await recupererHd(p.fichier);
      // La licence de la version HD doit être celle déjà créditée ; sinon on laisse l'entrée telle quelle et on n'enregistre rien
      if (r.licence !== p.licence) throw new Error(`licence différente de celle créditée (${r.licence} / ${p.licence})`);
      await writeFile(`${DOSSIER_HD}/${slug(nom)}.jpg`, r.octets);
      delete p.hd;
      hd++;
      log(`${nom} : HD ${r.largeur} px, ${Math.round(r.octets.length / 1024)} Ko.`);
    } catch (e) {
      p.hd = { essai: maintenant.toISOString().slice(0, 10), raison: e.message };
      log(`${nom} : pas de version HD (${e.message}).`);
    }
  }
  data.portraits = Object.fromEntries(Object.entries(data.portraits).sort(([a], [b]) => a.localeCompare(b, "fr")));
  await writeFile(DATA_FILE, JSON.stringify(data, null, 1) + "\n");
  log(`${hd} version(s) HD ajoutée(s) ; ${ajouts} portrait(s) ajouté(s), ${Object.values(data.portraits).filter((p) => p.fichier).length} au total.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { warn("ÉCHEC :", e.message); process.exitCode = 1; });
