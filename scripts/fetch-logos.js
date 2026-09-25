#!/usr/bin/env node
/**
 * fetch-logos.js
 * --------------
 * Logos des partis (rubrique Partis), hébergés sur le site : uniquement des fichiers de Wikimedia
 * Commons, qui n'accepte que des images libres (domaine public ou licence libre). La liste des
 * fichiers est dans data/logos.json (« fichier ») : pour changer un logo, remplacer le nom du fichier
 * Commons ; le script télécharge une version PNG de 80 pixels de haut dans icons/partis/<ID>.png et
 * note la licence et l'auteur (crédités dans les mentions légales).
 *
 * Un logo déjà téléchargé n'est pas repris tant que le nom du fichier ne change pas.
 *
 * USAGE : node scripts/fetch-logos.js [--force]
 */
import { readFile, writeFile, mkdir, access } from "fs/promises";
import path from "path";

const DATA_FILE = path.resolve("data/logos.json");
const DOSSIER = path.resolve("icons/partis");
const USER_AGENT = "hemicycle-france-bot/1.0 (https://github.com/Tahns/hemicycle-france)";
const FORCE = process.argv.includes("--force");
const log = (...m) => console.log("[fetch-logos]", ...m);
const warn = (...m) => console.warn("[fetch-logos][ATTENTION]", ...m);
const texte = (h) => String(h || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

async function main() {
  const data = JSON.parse(await readFile(DATA_FILE, "utf-8"));
  await mkdir(DOSSIER, { recursive: true });
  let echecs = 0;
  for (const [id, l] of Object.entries(data.logos)) {
    const cible = path.join(DOSSIER, `${id}.png`);
    const present = await access(cible).then(() => true, () => false);
    if (present && l.telecharge === l.fichier && !FORCE) continue;
    try {
      const api = `https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo&iiprop=url|extmetadata&iiurlheight=80&format=json&titles=${encodeURIComponent("File:" + l.fichier)}`;
      const info = Object.values((await (await fetch(api, { headers: { "User-Agent": USER_AGENT } })).json()).query.pages)[0].imageinfo?.[0];
      if (!info?.thumburl) throw new Error("fichier introuvable sur Commons");
      const m = info.extmetadata || {};
      const licence = texte(m.LicenseShortName?.value);
      if (!/public domain|domaine public|^cc0|^cc by/i.test(licence)) throw new Error(`licence non libre (${licence})`);
      const res = await fetch(info.thumburl, { headers: { "User-Agent": USER_AGENT } });
      if (!res.ok || !/image\/png/.test(res.headers.get("content-type") || "")) throw new Error(`HTTP ${res.status}`);
      await writeFile(cible, Buffer.from(await res.arrayBuffer()));
      Object.assign(l, { licence, auteur: texte(m.Artist?.value) || null, source: info.descriptionurl, telecharge: l.fichier });
      log(`${id} : ${l.fichier} (${licence})`);
    } catch (e) {
      echecs++;
      warn(`${id} (${l.fichier}) : ${e.message}`);
    }
  }
  await writeFile(DATA_FILE, JSON.stringify(data, null, 1) + "\n");
  if (echecs) process.exitCode = 1;
}

main().catch((e) => { console.error("[fetch-logos] ÉCHEC :", e.message); process.exitCode = 1; });
