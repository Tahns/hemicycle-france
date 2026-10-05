#!/usr/bin/env node
/**
 * fetch-budget.js
 * ---------------
 * Construit data/budget.json (rubrique « Budget ») : où va l'argent public, d'où il vient, le solde
 * (déficit) et la dette des administrations publiques (APU = État, collectivités, Sécurité sociale).
 *
 * Sources OFFICIELLES et OUVERTES uniquement : l'API publique d'Eurostat (sans clé), qui reprend les
 * comptes des administrations publiques notifiés par la France (établis par l'Insee) :
 *  - gov_10a_exp   : dépenses par grande fonction (COFOG), en millions d'euros ;
 *  - gov_10a_main  : recettes totales (TR), dépenses totales (TE), solde (B9), en millions d'euros et en % du PIB ;
 *  - gov_10dd_edpt1: dette brute au sens de Maastricht (GD), en millions d'euros et en % du PIB.
 *
 * Aucun chiffre n'est écrit à la main : si une réponse est vide, incomplète ou incohérente (somme des
 * fonctions ≠ total, recettes − dépenses ≠ solde…), RIEN n'est écrit et l'ancien fichier est conservé
 * (garde-fou scripts/garde.js). Si aucun fichier n'existe, le site affiche « données en cours de récupération ».
 *
 * USAGE :
 *   node scripts/fetch-budget.js
 *   node scripts/fetch-budget.js --dry-run
 */

import { fetchPoli } from "./http.js";
import { mkdir } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { ecrireGarde } from "./garde.js";

const DATA_FILE = path.resolve("data/budget.json");
const BASE_URL = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data";
const DATABROWSER = "https://ec.europa.eu/eurostat/databrowser/view";
const DRY_RUN = process.argv.includes("--dry-run");
const NB_ANNEES = 6;

const log = (...m) => console.log("[fetch-budget]", ...m);

/** Grandes fonctions COFOG (niveau 1) ; la charge de la dette (01.7) est isolée de « services généraux ». */
export const FONCTIONS = [
  ["GF10", "Protection sociale"], ["GF07", "Santé"], ["GF09", "Éducation"], ["GF04", "Affaires économiques"],
  ["GF03", "Ordre et sécurité publics"], ["GF02", "Défense"], ["GF0107", "Charge de la dette"],
  ["GF01", "Services publics généraux (hors charge de la dette)"], ["GF06", "Logement et équipements collectifs"],
  ["GF08", "Loisirs, culture et culte"], ["GF05", "Protection de l'environnement"],
];

/** Décode une réponse JSON-stat d'Eurostat en lignes { <dimension>: code, …, value }. Fonction pure (testable). */
export function lireJsonStat(d) {
  if (!d || !Array.isArray(d.id) || !Array.isArray(d.size) || !d.value) throw new Error("réponse Eurostat inattendue (JSON-stat attendu)");
  const codes = d.id.map((dim) => {
    const idx = d.dimension?.[dim]?.category?.index;
    if (!idx) throw new Error(`dimension ${dim} absente`);
    return Array.isArray(idx) ? idx : Object.keys(idx).sort((a, b) => idx[a] - idx[b]);
  });
  const entrees = Array.isArray(d.value) ? d.value.map((v, i) => [i, v]) : Object.entries(d.value).map(([i, v]) => [Number(i), v]);
  const lignes = [];
  for (const [flat, value] of entrees) {
    if (!Number.isFinite(value)) continue;
    const ligne = { value };
    let reste = flat;
    for (let k = d.id.length - 1; k >= 0; k--) {
      ligne[d.id[k]] = codes[k][reste % d.size[k]];
      reste = Math.floor(reste / d.size[k]);
    }
    lignes.push(ligne);
  }
  return lignes;
}

async function eurostat(jeu, params) {
  const q = new URLSearchParams({ format: "JSON", lang: "fr", freq: "A", geo: "FR", sector: "S13" });
  for (const [k, v] of Object.entries(params)) for (const x of [].concat(v)) q.append(k, x);
  const res = await fetchPoli(`${BASE_URL}/${jeu}?${q}`, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} pour Eurostat ${jeu}`);
  return lireJsonStat(await res.json());
}

const arrondi = (v, dec = 1) => Math.round(v * 10 ** dec) / 10 ** dec;
const md = (mio) => arrondi(mio / 1000, 1);

/**
 * Assemble data/budget.json à partir des lignes déjà lues. Fonction pure : lève une erreur au moindre
 * trou ou à la moindre incohérence (rien n'est alors écrit).
 *  - exp  : lignes de gov_10a_exp    (cofog99, time, value) en M€
 *  - main : lignes de gov_10a_main   (na_item, unit, time, value)
 *  - dette: lignes de gov_10dd_edpt1 (unit, time, value), dette brute (GD)
 */
export function construire({ exp, main, dette }, maintenant = new Date()) {
  const E = (code, t) => exp.find((l) => l.cofog99 === code && l.time === t)?.value;
  const M = (item, unit, t) => main.find((l) => l.na_item === item && l.unit === unit && l.time === t)?.value;
  const D = (unit, t) => dette.find((l) => l.unit === unit && l.time === t)?.value;
  const ok = Number.isFinite;

  const codes = ["TOTAL", "GF01", "GF02", "GF03", "GF04", "GF05", "GF06", "GF07", "GF08", "GF09", "GF10", "GF0107"];
  const annees = [...new Set(exp.map((l) => l.time))].sort().reverse();
  const annee = annees.find((t) => codes.every((c) => ok(E(c, t)))
    && ["TR", "TE", "B9"].every((i) => ok(M(i, "MIO_EUR", t)) && ok(M(i, "PC_GDP", t)))
    && ok(D("MIO_EUR", t)) && ok(D("PC_GDP", t)));
  if (!annee) throw new Error("aucune année complète (dépenses par fonction, recettes, solde, dette) dans les réponses d'Eurostat");
  if (Number(annee) > maintenant.getFullYear() || Number(annee) < 2000) throw new Error(`année de référence invraisemblable : ${annee}`);

  // Dépenses par fonction
  const total = E("TOTAL", annee);
  const somme = codes.filter((c) => /^GF\d\d$/.test(c)).reduce((s, c) => s + E(c, annee), 0);
  if (!(total > 0) || Math.abs(somme - total) / total > 0.01) throw new Error(`la somme des fonctions (${somme}) ne correspond pas au total (${total})`);
  if (Math.abs(total - M("TE", "MIO_EUR", annee)) / total > 0.01) throw new Error("total des dépenses par fonction ≠ total des dépenses des comptes");
  if (E("GF0107", annee) < 0 || E("GF0107", annee) > E("GF01", annee)) throw new Error("charge de la dette incohérente avec les services généraux");
  const postes = FONCTIONS.map(([code, libelle]) => {
    const v = code === "GF01" ? E("GF01", annee) - E("GF0107", annee) : E(code, annee);
    return { code, libelle, md: md(v), pct: arrondi((v / total) * 100, 1) };
  }).sort((a, b) => b.md - a.md);

  // Recettes, dépenses, solde
  const rec = M("TR", "MIO_EUR", annee), dep = M("TE", "MIO_EUR", annee), solde = M("B9", "MIO_EUR", annee);
  if (Math.abs(rec - dep - solde) > 1500) throw new Error(`recettes − dépenses (${rec - dep}) ≠ solde (${solde})`);
  const pib = (dep / M("TE", "PC_GDP", annee)) * 100; // PIB déduit des dépenses, pour recouper le solde en % du PIB
  if (Math.abs((solde / pib) * 100 - M("B9", "PC_GDP", annee)) > 0.2) throw new Error("solde en % du PIB incohérent avec le solde en euros");
  const dettePib = D("PC_GDP", annee);
  if (!(dettePib > 0 && dettePib < 300)) throw new Error(`dette en % du PIB invraisemblable : ${dettePib}`);

  const url = (jeu) => `${DATABROWSER}/${jeu}/default/table?lang=fr`;
  const src = (t) => `Eurostat, ${t} (comptes des administrations publiques de la France, établis par l'Insee)`;

  // Petite série annuelle (déficit et dette), seulement les années complètes
  const serie = [...new Set([...annees, ...dette.map((l) => l.time)])].sort().reverse()
    .filter((t) => Number(t) <= Number(annee) && ok(M("B9", "MIO_EUR", t)) && ok(M("B9", "PC_GDP", t)) && ok(D("MIO_EUR", t)) && ok(D("PC_GDP", t)))
    .slice(0, NB_ANNEES).reverse()
    .map((t) => ({ annee: Number(t), soldeMd: md(M("B9", "MIO_EUR", t)), soldePib: arrondi(M("B9", "PC_GDP", t), 1), detteMd: md(D("MIO_EUR", t)), dettePib: arrondi(D("PC_GDP", t), 1) }));
  if (!serie.length) throw new Error("série annuelle vide");

  return {
    lastUpdated: maintenant.toISOString(),
    anneeReference: Number(annee),
    depenses: { annee: Number(annee), totalMd: md(total), postes, source: src("tableau gov_10a_exp, dépenses par fonction (COFOG)"), url: url("gov_10a_exp") },
    equilibre: {
      annee: Number(annee), recettesMd: md(rec), recettesPib: arrondi(M("TR", "PC_GDP", annee), 1),
      depensesMd: md(dep), depensesPib: arrondi(M("TE", "PC_GDP", annee), 1),
      soldeMd: md(solde), soldePib: arrondi(M("B9", "PC_GDP", annee), 1),
      source: src("tableau gov_10a_main, recettes, dépenses et solde"), url: url("gov_10a_main"),
    },
    dette: {
      annee: Number(annee), md: md(D("MIO_EUR", annee)), pib: arrondi(dettePib, 1),
      interetsMd: md(E("GF0107", annee)), interetsPctDepenses: arrondi((E("GF0107", annee) / total) * 100, 1),
      source: src("tableaux gov_10dd_edpt1, dette au sens de Maastricht, et gov_10a_exp, charge de la dette (COFOG 01.7)"), url: url("gov_10dd_edpt1"),
    },
    serie: { source: src("tableaux gov_10a_main et gov_10dd_edpt1"), url: url("gov_10a_main"), annees: serie },
  };
}

async function main() {
  const depuis = String(new Date().getFullYear() - NB_ANNEES - 1);
  const [exp, main, dette] = await Promise.all([
    eurostat("gov_10a_exp", { unit: "MIO_EUR", na_item: "TE", sinceTimePeriod: depuis, cofog99: ["TOTAL", "GF01", "GF02", "GF03", "GF04", "GF05", "GF06", "GF07", "GF08", "GF09", "GF10", "GF0107"] }),
    eurostat("gov_10a_main", { unit: ["MIO_EUR", "PC_GDP"], na_item: ["TR", "TE", "B9"], sinceTimePeriod: depuis }),
    eurostat("gov_10dd_edpt1", { unit: ["MIO_EUR", "PC_GDP"], na_item: "GD", sinceTimePeriod: depuis }),
  ]);
  const budget = construire({ exp, main, dette });
  log(`année ${budget.anneeReference} : dépenses ${budget.depenses.totalMd} Md€, solde ${budget.equilibre.soldeMd} Md€ (${budget.equilibre.soldePib} % du PIB), dette ${budget.dette.md} Md€ (${budget.dette.pib} % du PIB)`);
  if (DRY_RUN) return console.log(JSON.stringify(budget, null, 2));
  await mkdir(path.dirname(DATA_FILE), { recursive: true });
  // Garde-fou : jamais d'écrasement par un contenu vide ou dégradé (fonctions de dépenses manquantes…)
  if (await ecrireGarde(DATA_FILE, budget, { nom: "data/budget.json", liste: (d) => d.depenses?.postes, obligatoires: ["code", "libelle", "md", "pct"] })) log("data/budget.json mis à jour.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error("[fetch-budget] ÉCHEC :", e.message);
    process.exitCode = 1; // l'ancien fichier est conservé ; signalé par le workflow
  });
}
