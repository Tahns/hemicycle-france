#!/usr/bin/env node
/**
 * check-sources.js
 * ----------------
 * Confronte chaque lien cité par le site (data/*.json) à la base du Décodex (Les Décodeurs, Le Monde) :
 *  - aucun lien ne doit figurer parmi les contenus que le Décodex a démentis ;
 *  - aucun lien ne doit pointer vers un site épinglé à de nombreuses reprises pour de fausses informations
 *    (au moins SEUIL contenus démentis sur le même domaine, hors réseaux sociaux et plateformes d'hébergement,
 *    où chacun publie ce qu'il veut). Les grands médias comptent aussi quelques articles démentis (jusqu'à 6
 *    pour franceinfo) : en dessous de 10, le nombre seul ne distingue pas un média d'un site douteux.
 * Sort en erreur (code 1) avec un message lisible ; le workflow ouvre alors un ticket GitHub.
 * Si la base du Décodex est injoignable, le script prévient mais ne bloque rien.
 *
 * USAGE : node scripts/check-sources.js
 */

import { readFile } from "fs/promises";

const DECODEX_URL = "https://asset.lemde.fr/medias/mmpub/data/decodex/hoax/hoax_debunks.json";
const SEUIL = 10;
const FICHIERS = ["justice", "meetings", "sondages", "candidats", "dirigeants", "indicateurs", "groupes"];
// Plateformes où n'importe qui publie : un contenu démenti n'y dit rien des autres pages
const PLATEFORMES = /(^|\.)(facebook\.com|twitter\.com|x\.com|youtube\.com|youtu\.be|dailymotion\.com|redd\.it|reddit\.com|instagram\.com|tiktok\.com|jeuxvideo\.com|blogspot\.[a-z.]+|wordpress\.com|over-blog\.com|overblog\.com|google\.com|wikipedia\.org|change\.org|mesopinions\.com|telegram\.me|t\.me|vk\.com|imgur\.com|linkedin\.com)$/;

const domaine = (u) => {
  try { return new URL(u).hostname.replace(/^www\./, "").toLowerCase(); } catch { return null; }
};
const normaliser = (u) => String(u).replace(/^https?:\/\/(www\.)?/, "").replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();

let base;
try {
  const res = await fetch(DECODEX_URL, { headers: { "User-Agent": "politique-france (verification des sources)" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  base = await res.json();
} catch (e) {
  console.warn(`[check-sources] Base du Décodex injoignable (${e.message}) : vérification sautée.`);
  process.exit(0);
}

const dementis = new Set(Object.keys(base.hoaxes || {}).map(normaliser));
const parDomaine = {};
for (const u of Object.keys(base.hoaxes || {})) {
  const d = domaine(u);
  if (d && !PLATEFORMES.test(d)) parDomaine[d] = (parDomaine[d] || 0) + 1;
}

// Tous les liens des fichiers de données, avec le fichier d'où ils viennent
const liens = [];
const parcourir = (o, fichier) => {
  if (typeof o === "string") { if (/^https?:\/\//.test(o)) liens.push({ url: o, fichier }); }
  else if (o && typeof o === "object") Object.values(o).forEach((v) => parcourir(v, fichier));
};
for (const f of FICHIERS) {
  const contenu = await readFile(`data/${f}.json`, "utf-8").catch(() => null);
  if (contenu) parcourir(JSON.parse(contenu), `data/${f}.json`);
}

const alertes = [];
for (const { url, fichier } of liens) {
  const d = domaine(url);
  if (dementis.has(normaliser(url))) alertes.push(`Sources : ${url} (${fichier}) figure parmi les contenus démentis par le Décodex ; le remplacer par une source fiable.`);
  else if (d && (parDomaine[d] || 0) >= SEUIL) alertes.push(`Sources : ${d} (${fichier}) a publié ${parDomaine[d]} contenus démentis par le Décodex ; citer plutôt un média reconnu ou une source officielle.`);
}

if (alertes.length) {
  console.error([...new Set(alertes)].map((a) => "- " + a).join("\n"));
  process.exit(1);
}
console.log(`[check-sources] ${liens.length} lien(s) vérifié(s) : aucun ne figure dans la base du Décodex (${dementis.size} contenus démentis).`);
