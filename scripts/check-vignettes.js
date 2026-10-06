#!/usr/bin/env node
/**
 * check-vignettes.js
 * ------------------
 * Droit à l'image des vignettes d'institutions : chaque photo de photos/vignettes/ doit avoir son entrée dans data/vignettes.json
 * avec licence libre, auteur et lien Commons (erreur BLOQUANTE sinon). Un thème sans vignette n'est qu'un AVERTISSEMENT
 * (le pictogramme s'affiche). Appelé par check-data.js.
 *
 * USAGE : node scripts/check-vignettes.js [dossier] [vignettes.json]
 */
import { readFile, readdir, stat } from "fs/promises";
import { CLES } from "./vignettes-cle.js";

const NON_LIBRE = /non[- ]?free|fair use|non[- ]?commercial|\bnc\b|\bnd\b|no[- ]?deriv|all rights reserved|tous droits/i;
const MAX_OCTETS = 40 * 1024;
const cleDe = (f) => f.replace(/\.[^.]+$/, "");

/** Renvoie { erreurs, avertissements, avec, total } (listes vides si tout est conforme). */
export async function verifierVignettes(dossier = "photos/vignettes", fichier = "data/vignettes.json") {
  const erreurs = [], avertissements = [];
  const data = JSON.parse(await readFile(fichier, "utf-8").catch(() => "null"));
  const entrees = data?.vignettes || {};
  const photos = (await readdir(dossier).catch(() => [])).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
  for (const f of photos) {
    const v = entrees[cleDe(f)];
    if (!v) { erreurs.push(`${dossier}/${f} : aucune entrée de licence dans ${fichier}`); continue; }
    if (!v.licence) erreurs.push(`${dossier}/${f} : licence manquante`);
    else if (NON_LIBRE.test(v.licence)) erreurs.push(`${dossier}/${f} : licence non libre (« ${v.licence} »)`);
    if (!/^https:\/\//.test(v.source || "")) erreurs.push(`${dossier}/${f} : lien Commons (source) manquant`);
    if (!String(v.auteur || "").trim()) erreurs.push(`${dossier}/${f} : auteur manquant (écrire « Auteur inconnu » si Commons n'en indique pas)`);
    if (!String(v.alt || "").trim()) erreurs.push(`${dossier}/${f} : texte alternatif manquant`);
    const taille = (await stat(`${dossier}/${f}`)).size;
    if (taille > MAX_OCTETS * 1.5) erreurs.push(`${dossier}/${f} : ${Math.round(taille / 1024)} Ko, trop lourde pour une vignette`);
  }
  // Une entrée créditée dont le fichier manque : le site retombe sur le pictogramme, mais l'incohérence est signalée
  for (const [cle, v] of Object.entries(entrees)) if (!photos.some((f) => cleDe(f) === cle)) erreurs.push(`${fichier} : « ${cle} » n'a pas de fichier ${v.chemin || dossier}`);
  const sans = CLES.filter((c) => !photos.some((f) => cleDe(f) === c));
  if (sans.length) avertissements.push(`Vignettes : ${sans.length} thème(s) sans photo libre (pictogramme affiché) : ${sans.join(", ")}`);
  return { erreurs, avertissements, avec: CLES.length - sans.length, total: CLES.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { erreurs, avertissements } = await verifierVignettes(process.argv[2], process.argv[3]);
  avertissements.forEach((a) => console.warn(`::warning::${a}`));
  if (erreurs.length) {
    console.error(`[check-vignettes] ${erreurs.length} erreur(s) :\n` + erreurs.map((e) => "  - " + e).join("\n"));
    process.exit(1);
  }
  console.log("[check-vignettes] Toutes les vignettes ont leur licence et leur crédit.");
}
