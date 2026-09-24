#!/usr/bin/env node
/**
 * check-data.js
 * -------------
 * Contrôle de cohérence des fichiers publiés (data/lois.json, data/indicateurs.json).
 * Lancé par le workflow GitHub Actions AVANT de committer : si une donnée est incohérente,
 * le workflow échoue et rien n'est publié.
 *
 * USAGE : node scripts/check-data.js
 */

import { readFile } from "fs/promises";

const GROUPES = ["LFI", "GDR", "ECO", "SOC", "LIOT", "EPR", "DEM", "HOR", "LR", "UDR", "RN", "NI"];
const erreurs = [];
const err = (m) => erreurs.push(m);

function estEntierPositif(n) {
  return Number.isInteger(n) && n >= 0;
}

async function checkLois() {
  const data = JSON.parse(await readFile("data/lois.json", "utf-8"));
  if (!Array.isArray(data.lois) || data.lois.length === 0) return err("lois.json : tableau 'lois' absent ou vide");

  const ids = new Set();
  let precedent = Infinity;
  for (const l of data.lois) {
    const ref = l.id || "(sans id)";
    if (!l.id) err(`${ref} : id manquant`);
    if (ids.has(l.id)) err(`${ref} : id en double`);
    ids.add(l.id);
    if (!l.titre) err(`${ref} : titre manquant`);
    if (!l.date) err(`${ref} : date manquante`);
    if (l.dateISO && !/^\d{4}-\d{2}-\d{2}$/.test(l.dateISO)) err(`${ref} : dateISO invalide (${l.dateISO})`);
    if (!["adopte", "rejete"].includes(l.resultat)) err(`${ref} : résultat invalide (${l.resultat})`);
    if (!/^https:\/\//.test(l.sourceUrl || "")) err(`${ref} : sourceUrl manquante ou non https`);
    if (l.numero !== undefined) {
      if (l.numero >= precedent) err(`${ref} : scrutins non triés du plus récent au plus ancien`);
      precedent = l.numero;
    }
    if (!l.votes || typeof l.votes !== "object") {
      err(`${ref} : votes manquants`);
      continue;
    }
    for (const [g, v] of Object.entries(l.votes)) {
      if (!GROUPES.includes(g)) err(`${ref} : groupe inconnu ${g}`);
      if (v === null) continue; // vote non communiqué
      for (const k of ["pour", "contre", "abst"]) if (!estEntierPositif(v[k])) err(`${ref} : ${g}.${k} invalide`);
      if (v.membres !== undefined && v.pour + v.contre + v.abst > v.membres) err(`${ref} : ${g} a plus de votants que de membres`);
    }
  }
  console.log(`[check-data] lois.json : ${data.lois.length} scrutins contrôlés.`);
}

async function checkIndicateurs() {
  const data = JSON.parse(await readFile("data/indicateurs.json", "utf-8"));
  if (!Array.isArray(data.indicateurs) || data.indicateurs.length === 0) return err("indicateurs.json : tableau vide");
  for (const i of data.indicateurs) {
    for (const k of ["nom", "valeur", "date", "source"]) if (!i[k]) err(`indicateur ${i.nom || "?"} : champ ${k} manquant`);
    if (i.url && !/^https:\/\//.test(i.url)) err(`indicateur ${i.nom} : url non https`);
  }
  console.log(`[check-data] indicateurs.json : ${data.indicateurs.length} indicateurs contrôlés.`);
}

await checkLois();
await checkIndicateurs();

if (erreurs.length) {
  console.error(`[check-data] ${erreurs.length} erreur(s) :`);
  for (const e of erreurs.slice(0, 50)) console.error("  - " + e);
  process.exit(1);
}
console.log("[check-data] OK");
