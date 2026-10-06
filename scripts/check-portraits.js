#!/usr/bin/env node
/**
 * check-portraits.js
 * ------------------
 * Droit à l'image : chaque photo de photos/personnalites/ (et de sa version haute définition photos/personnalites/hd/) doit avoir une entrée dans
 * data/portraits.json avec sa licence libre, sa source (page Commons) et son auteur. Une photo sans licence est une erreur bloquante
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
  // Les versions HD (hd/) reprennent l'entrée, donc la licence et les crédits, de la vignette du même nom
  for (const dir of [dossier, `${dossier}/hd`]) {
    const photos = (await readdir(dir).catch(() => [])).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
    for (const f of photos) {
      const p = parSlug.get(f.replace(/\.[^.]+$/, ""));
      if (!p) { erreurs.push(`${dir}/${f} : aucune entrée de licence dans ${fichierPortraits}`); continue; }
      if (!p.licence) erreurs.push(`${dir}/${f} : licence manquante (${p.nom})`);
      else if (NON_LIBRE.test(p.licence)) erreurs.push(`${dir}/${f} : licence non libre (« ${p.licence} », ${p.nom})`);
      if (!/^https:\/\//.test(p.source || "")) erreurs.push(`${dir}/${f} : source (page Commons) manquante (${p.nom})`);
      // Auteur obligatoire pour toute photo (« Auteur inconnu » si Commons n'en donne pas) : crédit affiché partout
      if (!String(p.auteur || "").trim()) erreurs.push(`${dir}/${f} : auteur manquant (${p.nom}) ; écrire « Auteur inconnu » si Commons n'en indique pas`);
    }
  }
  // Photos hébergées à leur chemin officiel (photos/deputes, photos/senateurs) mais créditées dans portraits.json (champ « chemin »)
  for (const [nom, p] of Object.entries(data.portraits)) {
    if (!p?.chemin || !p.fichier || !(await readFile(p.chemin).then(() => true, () => false))) continue;
    if (!p.licence || NON_LIBRE.test(p.licence)) erreurs.push(`${p.chemin} : licence manquante ou non libre (${nom})`);
    if (!/^https:\/\//.test(p.source || "")) erreurs.push(`${p.chemin} : source manquante (${nom})`);
    if (!String(p.auteur || "").trim()) erreurs.push(`${p.chemin} : auteur manquant (${nom})`);
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
