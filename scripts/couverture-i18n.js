#!/usr/bin/env node
/**
 * couverture-i18n.js
 * ------------------
 * Affiche, pour chaque langue de data/i18n/, le pourcentage de clés de fr.json traduites
 * (les valeurs vides et les clés inconnues ne comptent pas).
 *
 * USAGE : node scripts/couverture-i18n.js            (tableau)
 *         node scripts/couverture-i18n.js --manquantes en   (liste les textes français sans traduction en anglais)
 */
import { readFile } from "fs/promises";
import { listerLangues, DOSSIER } from "./extraire-i18n.js";

const lire = async (code) => JSON.parse(await readFile(new URL(`${code}.json`, DOSSIER), "utf-8"));
const fr = await lire("fr");
const total = Object.keys(fr).length;

const i = process.argv.indexOf("--manquantes");
if (i > 0) {
  const dico = await lire(process.argv[i + 1] || "en");
  for (const [cle, texte] of Object.entries(fr)) if (typeof dico[cle] !== "string" || !dico[cle].trim()) console.log(`${cle}\t${texte}`);
} else {
  console.log(`Chaînes françaises : ${total}`);
  console.log("langue  traduites  couverture");
  for (const code of await listerLangues()) {
    const dico = await lire(code);
    const n = Object.entries(dico).filter(([k, v]) => k in fr && typeof v === "string" && v.trim()).length;
    console.log(`${code.padEnd(6)}  ${String(n).padStart(9)}  ${(100 * n / total).toFixed(1).padStart(8)} %`);
  }
}
