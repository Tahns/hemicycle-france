#!/usr/bin/env node
/**
 * check-portraits.js
 * ------------------
 * Droit à l'image : chaque photo de photos/personnalites/ doit avoir une entrée dans
 * data/portraits.json avec sa licence, sa source (page Commons) et, hors domaine public / CC0,
 * son auteur (obligation d'attribution). Une photo sans licence est une erreur bloquante
 * (appelée par check-data.js).
 *
 * USAGE : node scripts/check-portraits.js [dossier] [portraits.json]
 */

import { readFile, readdir } from "fs/promises";

const slug = (nom) => nom.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const NON_LIBRE = /non[- ]?free|fair use|non commercial|\bnc\b|\bnd\b|all rights reserved|tous droits/i;

/** Renvoie la liste des erreurs (vide si tout est conforme). */
export async function verifierPortraits(dossier = "photos/personnalites", fichierPortraits = "data/portraits.json") {
  const erreurs = [];
  const data = JSON.parse(await readFile(fichierPortraits, "utf-8").catch(() => "null"));
  if (!data?.portraits) return [`${fichierPortraits} : absent ou sans « portraits »`];
  const parSlug = new Map(Object.entries(data.portraits).filter(([, p]) => p?.fichier).map(([nom, p]) => [slug(nom), { nom, ...p }]));
  const photos = (await readdir(dossier).catch(() => [])).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
  for (const f of photos) {
    const p = parSlug.get(f.replace(/\.[^.]+$/, ""));
    if (!p) { erreurs.push(`${dossier}/${f} : aucune entrée de licence dans ${fichierPortraits}`); continue; }
    if (!p.licence) erreurs.push(`${dossier}/${f} : licence manquante (${p.nom})`);
    else if (NON_LIBRE.test(p.licence)) erreurs.push(`${dossier}/${f} : licence non libre (« ${p.licence} », ${p.nom})`);
    if (!/^https:\/\//.test(p.source || "")) erreurs.push(`${dossier}/${f} : source (page Commons) manquante (${p.nom})`);
    if (p.licence && !/public domain|domaine public|^cc0|^pd\b/i.test(p.licence) && !p.auteur) erreurs.push(`${dossier}/${f} : auteur manquant, attribution impossible (${p.nom})`);
  }
  return erreurs;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const erreurs = await verifierPortraits(process.argv[2], process.argv[3]);
  if (erreurs.length) {
    console.error(`[check-portraits] ${erreurs.length} erreur(s) :\n` + erreurs.map((e) => "  - " + e).join("\n"));
    process.exit(1);
  }
  console.log("[check-portraits] Toutes les photos ont une licence.");
}
