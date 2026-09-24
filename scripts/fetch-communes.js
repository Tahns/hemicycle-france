#!/usr/bin/env node
/**
 * fetch-communes.js
 * -----------------
 * Construit data/communes.json : pour chaque commune, la ou les circonscriptions législatives
 * dont elle fait partie (les grandes villes sont partagées entre plusieurs circonscriptions),
 * d'après les résultats officiels du 1er tour des élections législatives de 2024 publiés par le
 * ministère de l'Intérieur sur data.gouv.fr. Sert à « trouver son député » en tapant sa commune.
 *
 * Les résultats par bureau de vote ne donnent pas la circonscription, mais la liste des candidats,
 * propre à chaque circonscription : le premier candidat d'un bureau (nom + prénom, dans son
 * département) désigne donc sa circonscription, d'après le fichier des résultats par circonscription.
 *
 * Le découpage des circonscriptions ne change qu'avec une loi : le fichier n'est reconstruit que
 * s'il a plus de 90 jours (ou avec --force).
 *
 * GARDE-FOUS : colonnes repérées par leur intitulé (jamais par leur position) ; au moins 30 000
 * communes et 500 circonscriptions, sinon le fichier n'est pas modifié.
 *
 * Format produit (compact, chargé seulement quand on cherche une commune) :
 *   { "departements": { "Gironde": [["Bordeaux", [1, 2, 3]], …], … } }
 *
 * USAGE : node scripts/fetch-communes.js [--force] [--fichier=local.csv]
 */

import { readFile, writeFile } from "fs/promises";
import path from "path";

const DATA_FILE = path.resolve("data/communes.json");
const BASE = "https://static.data.gouv.fr/resources/elections-legislatives-des-30-juin-et-7-juillet-2024-resultats-definitifs-du-1er-tour/";
const SOURCE_CIRCOS = BASE + "20240710-171413/resultats-definitifs-par-circonscriptions-legislatives.csv";
const SOURCE_BUREAUX = BASE + "20240710-171445/resultats-definitifs-par-bureau-de-vote.csv";
const PAGE = "https://www.data.gouv.fr/fr/datasets/elections-legislatives-des-30-juin-et-7-juillet-2024-resultats-definitifs-du-1er-tour/";
const FORCE = process.argv.includes("--force");
const FICHIER = process.argv.find((a) => a.startsWith("--fichier="))?.split("=")[1];

const log = (...m) => console.log("[fetch-communes]", ...m);
const warn = (...m) => console.warn("[fetch-communes][ATTENTION]", ...m);
const normEntete = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]+/g, " ").trim();

/** Découpe une ligne CSV (guillemets gérés). */
function champs(ligne, sep) {
  const out = [];
  let cur = "", guil = false;
  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i];
    if (c === '"') { if (guil && ligne[i + 1] === '"') { cur += '"'; i++; } else guil = !guil; }
    else if (c === sep && !guil) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

/** Lit un CSV : { entete normalisé, lignes découpées, col(...motsClés) } */
function lireCsv(csv) {
  const lignes = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  const sep = (lignes[0].match(/;/g) || []).length >= (lignes[0].match(/,/g) || []).length ? ";" : ",";
  const entete = champs(lignes[0], sep).map(normEntete);
  return { entete, lignes: lignes.slice(1).map((l) => champs(l, sep)), col: (...m) => entete.findIndex((h) => m.every((x) => h.includes(x))) };
}
const cleCandidat = (dep, nom, prenom) => `${dep}|${normEntete(nom)}|${normEntete(prenom)}`;
function numeroCirco(code, codeDep) {
  const c = String(code).replace(/\s/g, "");
  return parseInt(codeDep && c.startsWith(codeDep) ? c.slice(codeDep.length) : c.slice(-2), 10);
}

/** Jointure résultats par circonscription × résultats par bureau de vote, sur le premier candidat. */
export function construireParCandidats(csvCircos, csvBureaux) {
  const C = lireCsv(csvCircos);
  const cDep = C.col("code", "departement"), cCirco = C.col("code", "circonscription"), cNom = C.col("nom", "candidat"), cPrenom = C.col("prenom", "candidat");
  if (cDep < 0 || cCirco < 0 || cNom < 0 || cPrenom < 0) throw new Error(`colonnes introuvables (circonscriptions) : ${C.entete.slice(0, 22).join(" | ")}`);
  const circoDe = new Map();
  for (const f of C.lignes) {
    const num = numeroCirco(f[cCirco], f[cDep]);
    if (num && f[cNom]) circoDe.set(cleCandidat(f[cDep], f[cNom], f[cPrenom]), num);
  }
  const B = lireCsv(csvBureaux);
  const bDep = B.col("code", "departement"), bLibDep = B.col("libelle", "departement"), bCom = B.col("libelle", "commune"), bNom = B.col("nom", "candidat"), bPrenom = B.col("prenom", "candidat");
  if (bDep < 0 || bLibDep < 0 || bCom < 0 || bNom < 0 || bPrenom < 0) throw new Error(`colonnes introuvables (bureaux) : ${B.entete.slice(0, 22).join(" | ")}`);
  const deps = {}, circos = new Set();
  let sansCirco = 0;
  for (const f of B.lignes) {
    const num = circoDe.get(cleCandidat(f[bDep], f[bNom], f[bPrenom]));
    if (!num) { sansCirco++; continue; }
    const dep = f[bLibDep], commune = f[bCom];
    if (!dep || !commune) continue;
    circos.add(`${dep}|${num}`);
    const liste = (deps[dep] ||= new Map());
    (liste.get(commune) || liste.set(commune, new Set()).get(commune)).add(num);
  }
  if (sansCirco) warn(`${sansCirco} bureau(x) de vote sans circonscription retrouvée.`);
  const departements = {};
  let nbCommunes = 0;
  for (const [dep, liste] of Object.entries(deps)) {
    departements[dep] = [...liste.entries()].sort((a, b) => a[0].localeCompare(b[0], "fr")).map(([c, n]) => [c, [...n].sort((a, b) => a - b)]);
    nbCommunes += liste.size;
  }
  return { departements, nbCommunes, nbCircos: circos.size };
}

/** Fichier local déjà au format commune + circonscription (tests). */
export function construire(csv) {
  const lignes = csv.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const sep = (lignes[0].match(/;/g) || []).length >= (lignes[0].match(/,/g) || []).length ? ";" : ",";
  const entete = champs(lignes[0], sep).map(normEntete);
  const col = (...motsCles) => entete.findIndex((h) => motsCles.every((m) => h.includes(m)));
  const iDep = col("libelle", "departement"), iCirco = col("code", "circonscription"), iLibCirco = col("libelle", "circonscription");
  const iCom = col("libelle", "commune"), iCodeDep = col("code", "departement");
  if (iDep < 0 || iCom < 0 || (iCirco < 0 && iLibCirco < 0)) throw new Error(`colonnes introuvables dans l'en-tête : ${entete.slice(0, 12).join(" | ")}`);

  const deps = {};
  const circos = new Set();
  for (const l of lignes.slice(1)) {
    const f = champs(l, sep);
    const dep = f[iDep], commune = f[iCom];
    if (!dep || !commune) continue;
    // Numéro de circonscription : « 4e circonscription » dans le libellé, sinon fin du code (« 3304 » → 4)
    let num = parseInt((f[iLibCirco] || "").match(/(\d+)\s*(?:e|è|er|ère|re)/i)?.[1], 10);
    if (!num && iCirco >= 0) {
      const code = f[iCirco].replace(/\s/g, ""), codeDep = iCodeDep >= 0 ? f[iCodeDep] : "";
      num = parseInt(codeDep && code.startsWith(codeDep) ? code.slice(codeDep.length) : code.slice(-2), 10);
    }
    if (!num) continue;
    circos.add(`${dep}|${num}`);
    const liste = (deps[dep] ||= new Map());
    const n = liste.get(commune) || new Set();
    n.add(num);
    liste.set(commune, n);
  }
  const departements = {};
  let nbCommunes = 0;
  for (const [dep, liste] of Object.entries(deps)) {
    departements[dep] = [...liste.entries()].sort((a, b) => a[0].localeCompare(b[0], "fr")).map(([c, n]) => [c, [...n].sort((a, b) => a - b)]);
    nbCommunes += liste.size;
  }
  return { departements, nbCommunes, nbCircos: circos.size };
}

async function main() {
  const ancien = JSON.parse(await readFile(DATA_FILE, "utf-8").catch(() => "null"));
  if (ancien?.lastUpdated && !FORCE && !FICHIER && Date.now() - Date.parse(ancien.lastUpdated) < 90 * 864e5) return log("Table à jour (moins de 90 jours) : rien à faire.");

  let resultat = null;
  if (FICHIER) resultat = construire(await readFile(FICHIER, "utf-8"));
  else {
    const lire = async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} en téléchargeant ${url}`);
      return res.text();
    };
    resultat = construireParCandidats(await lire(SOURCE_CIRCOS), await lire(SOURCE_BUREAUX));
  }
  const { departements, nbCommunes, nbCircos } = resultat;
  log(`${nbCommunes} communes, ${nbCircos} circonscriptions, ${Object.keys(departements).length} départements ou collectivités.`);
  if (!FICHIER && (nbCommunes < 30000 || nbCircos < 500)) {
    warn("Table incomplète : data/communes.json n'est pas modifié.");
    process.exitCode = 1;
    return;
  }
  await writeFile(DATA_FILE, JSON.stringify({
    lastUpdated: new Date().toISOString(),
    source: "Ministère de l'Intérieur — résultats du 1er tour des législatives 2024 par circonscription et par bureau de vote (data.gouv.fr)",
    sourceUrl: PAGE,
    departements,
  }) + "\n");
  log("data/communes.json mis à jour.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error("[fetch-communes] ÉCHEC :", e);
    process.exitCode = 1;
  });
}
