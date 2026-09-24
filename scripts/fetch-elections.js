#!/usr/bin/env node
/**
 * fetch-elections.js
 * ------------------
 * Résultats officiels de l'élection présidentielle 2022 (1er et 2d tour) par commune, d'après les
 * fichiers du ministère de l'Intérieur publiés sur data.gouv.fr. Affichés sous une commune trouvée
 * dans la rubrique Députés.
 *
 * Écrit un fichier par département (chargé seulement quand on consulte une de ses communes) :
 *   data/elections/<departement-normalise>.json
 *   { "candidats": { "t1": ["Macron", …], "t2": [...] }, "communes": { "Bordeaux": { "t1": [301, …], "t2": [...] } } }
 * Les pourcentages sont en dixièmes de point des suffrages exprimés (301 = 30,1 %).
 *
 * Les ressources sont retrouvées par l'API de data.gouv.fr (titre contenant « commune »), les
 * colonnes par leur intitulé. Résultats définitifs : le fichier n'est construit qu'une fois (--force
 * pour le refaire).
 *
 * GARDE-FOUS : au moins 30 000 communes par tour, et pour chaque commune la somme des voix des
 * candidats doit égaler les suffrages exprimés ; sinon rien n'est écrit.
 *
 * USAGE : node scripts/fetch-elections.js [--force] [--t1=fichier.csv --t2=fichier.csv]
 */

import { readFile, writeFile, mkdir, access } from "fs/promises";
import path from "path";

const DOSSIER = path.resolve("data/elections");
const JEUX = {
  t1: "election-presidentielle-des-10-et-24-avril-2022-resultats-definitifs-du-1er-tour",
  t2: "election-presidentielle-des-10-et-24-avril-2022-resultats-definitifs-du-2nd-tour",
};
const FORCE = process.argv.includes("--force");
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
const log = (...m) => console.log("[fetch-elections]", ...m);
const warn = (...m) => console.warn("[fetch-elections][ATTENTION]", ...m);

export const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const normEntete = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z%/]+/g, " ").trim();
const nomAffiche = (nom) => nom.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (m, p, c) => p + c.toUpperCase());

async function urlRessource(jeu) {
  const res = await fetch(`https://www.data.gouv.fr/api/1/datasets/${jeu}/`);
  if (!res.ok) throw new Error(`data.gouv.fr : HTTP ${res.status} pour ${jeu}`);
  const d = await res.json();
  const r = d.resources.find((x) => /commune/i.test(x.title) && /csv|txt/i.test(x.format || x.url) && !/sub|arrond/i.test(x.title))
    || d.resources.find((x) => /commune/i.test(x.title) && /csv|txt/i.test(x.format || x.url));
  if (!r) throw new Error(`aucune ressource « commune » en CSV dans ${jeu} : ${d.resources.map((x) => x.title).join(" | ")}`);
  log(`${jeu} : ${r.title}`);
  return r.url;
}

async function lireTexte(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  // Les fichiers du ministère sont souvent en Windows-1252
  const utf8 = buf.toString("utf-8");
  return utf8.includes("�") ? new TextDecoder("windows-1252").decode(buf) : utf8;
}

/** Un tour : { candidats: [noms], communes: Map(cle -> { dep, commune, pct: [...] }) } */
export function lireTour(texte) {
  const lignes = texte.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const sep = (lignes[0].match(/;/g) || []).length >= (lignes[0].match(/,/g) || []).length ? ";" : ",";
  const entete = lignes[0].split(sep).map(normEntete);
  const col = (...m) => entete.findIndex((h) => m.every((x) => h.includes(x)));
  const iDep = col("libelle", "departement"), iCom = col("libelle", "commune"), iExp = entete.findIndex((h) => h === "exprimes");
  const iNom = entete.indexOf("nom"), iVoix = entete.indexOf("voix");
  if ([iDep, iCom, iExp, iNom, iVoix].some((i) => i < 0)) throw new Error(`colonnes introuvables : ${entete.slice(0, 30).join(" | ")}`);
  // Un bloc par candidat (N°Panneau, Sexe, Nom, Prénom, Voix, % Voix/Ins, % Voix/Exp) : longueur du bloc
  const debutBloc = Math.min(...["n panneau", "npanneau", "sexe"].map((n) => entete.indexOf(n)).filter((i) => i >= 0), iNom);
  const finBloc = entete.findIndex((h, i) => i > iVoix && h.includes("exp"));
  const L = (finBloc > 0 ? finBloc : iVoix + 2) - debutBloc + 1;
  const candidats = [];
  const communes = new Map();
  let incoherentes = 0;
  for (const l of lignes.slice(1)) {
    const f = l.split(sep);
    const exp = parseInt(f[iExp], 10);
    if (!f[iCom] || !exp) continue;
    const voix = [];
    for (let k = 0; iNom + k * L < f.length; k++) {
      const nom = f[iNom + k * L]?.trim();
      if (!nom) break;
      if (!candidats.includes(nom)) candidats.push(nom);
      voix[candidats.indexOf(nom)] = parseInt(f[iVoix + k * L], 10) || 0;
    }
    const total = voix.reduce((a, v) => a + (v || 0), 0);
    if (total !== exp) { incoherentes++; continue; }
    communes.set(`${f[iDep]}|${f[iCom]}`, { dep: f[iDep], commune: f[iCom], pct: voix.map((v) => Math.round((v || 0) / exp * 1000)) });
  }
  if (incoherentes) warn(`${incoherentes} commune(s) écartée(s) : somme des voix ≠ exprimés.`);
  return { candidats, communes };
}

async function main() {
  const t1Fichier = arg("t1"), t2Fichier = arg("t2");
  if (!FORCE && !t1Fichier) {
    try { await access(path.join(DOSSIER, "paris.json")); return log("Résultats déjà construits (définitifs) : rien à faire."); } catch {}
  }
  const tours = {};
  for (const t of ["t1", "t2"]) {
    const fichier = t === "t1" ? t1Fichier : t2Fichier;
    const texte = fichier ? await readFile(fichier, "utf-8") : await lireTexte(await urlRessource(JEUX[t]));
    tours[t] = lireTour(texte);
    log(`${t} : ${tours[t].communes.size} communes, ${tours[t].candidats.length} candidats.`);
  }
  if (!t1Fichier && (tours.t1.communes.size < 30000 || tours.t2.communes.size < 30000)) {
    warn("Moins de 30 000 communes lues : rien n'est écrit.");
    process.exitCode = 1;
    return;
  }
  const parDep = {};
  for (const [cle, c] of tours.t1.communes) {
    const d = (parDep[slug(c.dep)] ||= {
      departement: c.dep,
      candidats: { t1: tours.t1.candidats.map(nomAffiche), t2: tours.t2.candidats.map(nomAffiche) },
      communes: {},
    });
    const t2 = tours.t2.communes.get(cle);
    d.communes[c.commune] = { t1: c.pct, ...(t2 ? { t2: t2.pct } : {}) };
  }
  await mkdir(DOSSIER, { recursive: true });
  for (const [s, d] of Object.entries(parDep)) await writeFile(path.join(DOSSIER, `${s}.json`), JSON.stringify(d) + "\n");
  await writeFile(path.join(DOSSIER, "source.json"), JSON.stringify({
    lastUpdated: new Date().toISOString(),
    source: "Ministère de l'Intérieur — résultats définitifs de l'élection présidentielle 2022 par commune (data.gouv.fr)",
    sourceUrl: `https://www.data.gouv.fr/fr/datasets/${JEUX.t1}/`,
    departements: Object.keys(parDep).length,
  }, null, 1) + "\n");
  log(`${Object.keys(parDep).length} fichiers départementaux écrits dans data/elections/.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error("[fetch-elections] ÉCHEC :", e.message); process.exitCode = 1; });
}
