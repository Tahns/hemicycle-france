#!/usr/bin/env node
/**
 * check-vignettes.js
 * ------------------
 * Droit à l'image des vignettes d'institutions : chaque photo de photos/vignettes/ doit avoir son entrée dans data/vignettes.json
 * (ou chaque variante `variantes[]` d'une institution, fichiers <clé>-<n>.jpg) avec licence libre, auteur et lien Commons (erreur BLOQUANTE sinon). Un thème sans vignette n'est qu'un AVERTISSEMENT
 * (le pictogramme s'affiche). Appelé par check-data.js.
 *
 * USAGE : node scripts/check-vignettes.js [dossier] [vignettes.json]
 */
import { readFile, readdir, stat } from "fs/promises";
import { CLES, MIN_VARIANTES, variantesDe, lireNomFichier } from "./vignettes-cle.js";

const NON_LIBRE = /non[- ]?free|fair use|non[- ]?commercial|\bnc\b|\bnd\b|no[- ]?deriv|all rights reserved|tous droits/i;
const MAX_OCTETS = 40 * 1024;
const MAX_OCTETS_HD = 220 * 1024;
const estHd = (f) => /-hd\.[^.]+$/i.test(f);

/**
 * Renvoie { erreurs, avertissements, avec, total, photos } (listes vides si tout est conforme). `avec` = clés ayant au moins une photo ; `photos` = nombre de
 * photos (variantes comprises). Fichiers : <clé>.jpg (première photo), <clé>-<n>.jpg (variantes), avec leur <…>-hd.jpg facultatif.
 */
export async function verifierVignettes(dossier = "photos/vignettes", fichier = "data/vignettes.json") {
  const erreurs = [], avertissements = [];
  const data = JSON.parse(await readFile(fichier, "utf-8").catch(() => "null"));
  const entrees = data?.vignettes || {};
  const toutes = (await readdir(dossier).catch(() => [])).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
  const photos = toutes.filter((f) => !estHd(f));
  const nom = (f) => f.replace(/\.[^.]+$/, "");
  // Variante d'un fichier : la première photo d'une clé = <clé>.jpg ; les autres sont désignées par le nom de fichier de leur `chemin`
  const varianteDe = (cle, rang) => {
    const vs = variantesDe(entrees[cle]);
    return rang === 1 ? vs[0] : vs.find((v) => v.chemin && nom(v.chemin.split("/").pop()) === `${cle}-${rang}`);
  };
  // Versions HD (<clé>[-n]-hd.jpg, facultatives) : même entrée, donc même licence et même crédit ; le champ chemin_hd doit les désigner
  for (const f of toutes.filter(estHd)) {
    const l = lireNomFichier(f);
    const v = l && entrees[l.cle] ? varianteDe(l.cle, l.rang) : null;
    if (!l || !entrees[l.cle]) { erreurs.push(`${dossier}/${f} : aucune entrée de licence pour « ${l?.cle || nom(f)} » dans ${fichier}`); continue; }
    if (!v) { erreurs.push(`${dossier}/${f} : aucune variante correspondante pour « ${l.cle} » dans ${fichier}`); continue; }
    if (!v.chemin_hd) erreurs.push(`${dossier}/${f} : « ${l.cle} » n'a pas de chemin_hd dans ${fichier}`);
    else if (v.chemin_hd.split("/").pop() !== f) erreurs.push(`${dossier}/${f} : chemin_hd de « ${l.cle} » désigne ${v.chemin_hd}`);
    const taille = (await stat(`${dossier}/${f}`)).size;
    if (taille > MAX_OCTETS_HD * 1.5) erreurs.push(`${dossier}/${f} : ${Math.round(taille / 1024)} Ko, trop lourde (maximum ${MAX_OCTETS_HD / 1024} Ko)`);
  }
  for (const f of photos) {
    const l = lireNomFichier(f);
    if (!l || !entrees[l.cle]) { erreurs.push(`${dossier}/${f} : aucune entrée de licence dans ${fichier}`); continue; }
    const v = varianteDe(l.cle, l.rang);
    if (!v) { erreurs.push(`${dossier}/${f} : aucune variante correspondante (licence et crédit) dans ${fichier}`); continue; }
    if (!v.licence) erreurs.push(`${dossier}/${f} : licence manquante`);
    else if (NON_LIBRE.test(v.licence)) erreurs.push(`${dossier}/${f} : licence non libre (« ${v.licence} »)`);
    if (!/^https:\/\//.test(v.source || "")) erreurs.push(`${dossier}/${f} : lien Commons (source) manquant`);
    if (!String(v.auteur || "").trim()) erreurs.push(`${dossier}/${f} : auteur manquant (écrire « Auteur inconnu » si Commons n'en indique pas)`);
    if (!String(v.alt || "").trim()) erreurs.push(`${dossier}/${f} : texte alternatif manquant`);
    const taille = (await stat(`${dossier}/${f}`)).size;
    if (taille > MAX_OCTETS * 1.5) erreurs.push(`${dossier}/${f} : ${Math.round(taille / 1024)} Ko, trop lourde pour une vignette`);
  }
  // Une entrée créditée dont le fichier manque : le site retombe sur le pictogramme, mais l'incohérence est signalée
  for (const [cle, e] of Object.entries(entrees)) {
    const vs = variantesDe(e);
    if (!photos.some((f) => nom(f) === cle)) erreurs.push(`${fichier} : « ${cle} » n'a pas de fichier ${e.chemin || dossier}`);
    const vus = new Set();
    vs.forEach((v, i) => {
      const f = v.chemin.split("/").pop();
      if (i > 0 && !photos.includes(f)) erreurs.push(`${fichier} : variante ${i + 1} de « ${cle} » annonce ${v.chemin}, fichier absent`);
      if (i > 0 && lireNomFichier(f)?.cle !== cle) erreurs.push(`${fichier} : variante ${i + 1} de « ${cle} » : le fichier ${f} doit s'appeler ${cle}-<n>.jpg`);
      const identite = v.fichier || v.chemin;
      if (vus.has(identite)) erreurs.push(`${fichier} : « ${cle} » liste deux fois la même photo (${identite})`);
      vus.add(identite);
      if (v.chemin_hd && !toutes.some((x) => x === v.chemin_hd.split("/").pop())) erreurs.push(`${fichier} : « ${cle} » annonce ${v.chemin_hd}, fichier absent`);
    });
  }
  const sans = CLES.filter((c) => !photos.some((f) => nom(f) === c));
  if (sans.length) avertissements.push(`Vignettes : ${sans.length} thème(s) sans photo libre (pictogramme affiché) : ${sans.join(", ")}`);
  const nbVariantes = (c) => (entrees[c] ? variantesDe(entrees[c]).length : 0);
  const incompletes = CLES.filter((c) => nbVariantes(c) > 0 && nbVariantes(c) < MIN_VARIANTES);
  if (incompletes.length) avertissements.push(`Vignettes : ${incompletes.length} thème(s) avec moins de ${MIN_VARIANTES} photos (le workflow en ajoute au fil des passages) : ${incompletes.map((c) => `${c} ${nbVariantes(c)}`).join(", ")}`);
  return { erreurs, avertissements, avec: CLES.length - sans.length, total: CLES.length, photos: CLES.reduce((n, c) => n + nbVariantes(c), 0) };
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
