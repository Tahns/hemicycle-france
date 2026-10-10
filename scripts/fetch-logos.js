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
 * Contrôle de cadrage (une fois par logo) : les proportions du PNG téléchargé sont comparées à celles du fichier Commons d'origine.
 * Un écart de plus de 8 % (logo rogné ou déformé, comme les anciens téléchargements de MoDem, RN ou Écologistes) fait RETÉLÉCHARGER le logo
 * une fois ; si l'écart persiste, avertissement (« cadrage à vérifier ») sans boucle. Les bandes très allongées ou minuscules sont signalées.
 * Le résultat est noté dans data/logos.json (`cadrage`, `largeur`, `hauteur`). Un logo à refaire à la main : mettre `"cadrage": null` ou --force.
 *
 * NI (non-inscrits) n'a pas de logo (ce n'est pas un parti) et LIOT n'a pas encore de fichier Commons identifié : une entrée n'est ajoutée
 * à data/logos.json qu'avec un nom de fichier Commons vérifié (jamais deviné).
 *
 * USAGE : node scripts/fetch-logos.js [--force]
 */
import { fetchPoli } from "./http.js";
import { readFile, writeFile, mkdir, access } from "fs/promises";
import path from "path";
import { pathToFileURL } from "url";

const DATA_FILE = path.resolve("data/logos.json");
const DOSSIER = path.resolve("icons/partis");
const USER_AGENT = "hemicycle-france-bot/1.0 (https://github.com/Tahns/hemicycle-france)";
const FORCE = process.argv.includes("--force");
const log = (...m) => console.log("[fetch-logos]", ...m);
const warn = (...m) => console.warn("[fetch-logos][ATTENTION]", ...m);
const texte = (h) => String(h || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

/** Dimensions d'un PNG (en-tête IHDR) : { largeur, hauteur } ou null si ce n'est pas un PNG. Pure. */
export function dimensionsPng(octets) {
  const b = Buffer.from(octets || []);
  if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47 || b.toString("ascii", 12, 16) !== "IHDR") return null;
  return { largeur: b.readUInt32BE(16), hauteur: b.readUInt32BE(20) };
}

/**
 * Cadrage d'un logo téléchargé (`png` : { largeur, hauteur }) par rapport au fichier Commons d'origine (`source`). Renvoie
 * { statut: "ok" | "different" | "suspect", raison? } : « different » = proportions éloignées de plus de 8 % (rogné ou déformé : à retélécharger),
 * « suspect » = bande très allongée ou minuscule (à regarder). Pure.
 */
export function controlerCadrage(png, source) {
  if (!png?.largeur || !png?.hauteur) return { statut: "suspect", raison: "dimensions du PNG illisibles" };
  const rPng = png.largeur / png.hauteur;
  if (source?.largeur > 0 && source?.hauteur > 0) {
    const rSrc = source.largeur / source.hauteur;
    if (Math.abs(rPng - rSrc) / rSrc > 0.08) return { statut: "different", raison: `proportions ${rPng.toFixed(2)} contre ${rSrc.toFixed(2)} pour l'original (logo rogné ou déformé)` };
  }
  if (png.hauteur < 40 || png.largeur < 40) return { statut: "suspect", raison: `image minuscule (${png.largeur}×${png.hauteur})` };
  if (rPng > 8 || rPng < 0.4) return { statut: "suspect", raison: `bande très allongée (${png.largeur}×${png.hauteur})` };
  return { statut: "ok" };
}

async function interroger(l) {
  const api = `https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo&iiprop=url|size|extmetadata&iiurlheight=80&format=json&titles=${encodeURIComponent("File:" + l.fichier)}`;
  const info = Object.values((await (await fetchPoli(api, { headers: { "User-Agent": USER_AGENT } })).json()).query.pages)[0].imageinfo?.[0];
  if (!info?.thumburl) throw new Error("fichier introuvable sur Commons");
  const m = info.extmetadata || {};
  const licence = texte(m.LicenseShortName?.value);
  if (!/public domain|domaine public|^cc0|^cc by/i.test(licence)) throw new Error(`licence non libre (${licence})`);
  return { info, m, licence };
}
async function telechargerPng(info) {
  const res = await fetchPoli(info.thumburl, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok || !/image\/png/.test(res.headers.get("content-type") || "")) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function noterCadrage(id, l, octets, c) {
  const d = dimensionsPng(octets);
  Object.assign(l, { largeur: d?.largeur ?? null, hauteur: d?.hauteur ?? null, cadrage: c.statut === "ok" ? "ok" : "a_verifier" });
  if (c.statut !== "ok") warn(`${id} (${l.fichier}) : cadrage à vérifier : ${c.raison}.`);
}

async function main() {
  const data = JSON.parse(await readFile(DATA_FILE, "utf-8"));
  await mkdir(DOSSIER, { recursive: true });
  let echecs = 0;
  for (const [id, l] of Object.entries(data.logos)) {
    const cible = path.join(DOSSIER, `${id}.png`);
    const present = await access(cible).then(() => true, () => false);
    const aControler = present && l.telecharge === l.fichier && l.cadrage === undefined; // anciens téléchargements : cadrage jamais contrôlé
    if (present && l.telecharge === l.fichier && !FORCE && !aControler) continue;
    try {
      let { info, m, licence } = await interroger(l);
      const source = { largeur: info.width, hauteur: info.height };
      let octets;
      if (aControler && !FORCE) { // on ne retélécharge que si le PNG en place a de mauvaises proportions
        octets = await readFile(cible);
        let c = controlerCadrage(dimensionsPng(octets), source);
        if (c.statut === "different") { log(`${id} : ${c.raison} : retéléchargement.`); octets = await telechargerPng(info); await writeFile(cible, octets); c = controlerCadrage(dimensionsPng(octets), source); }
        noterCadrage(id, l, octets, c);
        Object.assign(l, { licence, auteur: texte(m.Artist?.value) || null, source: info.descriptionurl });
        continue;
      }
      octets = await telechargerPng(info);
      await writeFile(cible, octets);
      Object.assign(l, { licence, auteur: texte(m.Artist?.value) || null, source: info.descriptionurl, telecharge: l.fichier });
      noterCadrage(id, l, octets, controlerCadrage(dimensionsPng(octets), source));
      log(`${id} : ${l.fichier} (${licence})`);
    } catch (e) {
      echecs++;
      warn(`${id} (${l.fichier}) : ${e.message}`);
    }
  }
  await writeFile(DATA_FILE, JSON.stringify(data, null, 1) + "\n");
  if (echecs) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error("[fetch-logos] ÉCHEC :", e.message); process.exitCode = 1; });
