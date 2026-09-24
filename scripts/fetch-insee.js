#!/usr/bin/env node
/**
 * fetch-insee.js
 * --------------
 * Met à jour data/indicateurs.json depuis la Banque de données macroéconomiques (BDM) de l'Insee,
 * via son point d'accès SDMX PUBLIC (aucune clé d'API nécessaire) :
 *   https://bdm.insee.fr/series/sdmx/data/SERIES_BDM/<idBank>
 *
 * Chaque idBank ci-dessous a été vérifié à la main : l'intitulé officiel de la série est recopié
 * dans `titreAttendu`, et le script REFUSE la mise à jour si l'Insee renvoie une série dont
 * l'intitulé ne correspond plus (série renommée, arrêtée ou remplacée) — la valeur précédente est
 * alors conservée et l'anomalie signalée.
 *
 * Indicateurs volontairement laissés en saisie manuelle dans data/indicateurs.json :
 *  - Inflation : l'Insee publie l'indice, pas le glissement annuel ; le recalculer pourrait
 *    différer d'un dixième du chiffre officiel communiqué.
 *  - Déficit public : pas de série « en % du PIB » en base 2020 dans la BDM ; chiffre annuel
 *    publié chaque printemps, à reporter à la main.
 *
 * USAGE :
 *   node scripts/fetch-insee.js
 *   node scripts/fetch-insee.js --dry-run
 */

import { readFile, writeFile } from "fs/promises";
import path from "path";

const DATA_FILE = path.resolve("data/indicateurs.json");
const BASE_URL = "https://bdm.insee.fr/series/sdmx/data/SERIES_BDM";
const DRY_RUN = process.argv.includes("--dry-run");

function log(...m) {
  console.log("[fetch-insee]", ...m);
}
function warn(...m) {
  console.warn("[fetch-insee][ATTENTION]", ...m);
}

const nf = (v, dec) => v.toLocaleString("fr-FR", { minimumFractionDigits: dec, maximumFractionDigits: dec }).replace(/ /g, " ");
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

// "2026-Q2" -> "2ᵉ trimestre 2026", "2026-08" -> "août 2026", "2025" -> "2025"
function formatPeriode(periode) {
  if (!periode) return null;
  let m = periode.match(/^(\d{4})-Q([1-4])$/);
  if (m) return `${m[2] === "1" ? "1ᵉʳ" : m[2] + "ᵉ"} trimestre ${m[1]}`;
  m = periode.match(/^(\d{4})-(\d{2})$/);
  if (m) return `${MOIS[parseInt(m[2], 10) - 1]} ${m[1]}`;
  return periode;
}

// Sur le site, "up" = hausse (affichée en rouge pour un indicateur où la hausse est une mauvaise nouvelle)
function tendance(actuelle, precedente) {
  if (precedente === undefined || actuelle === precedente) return "neutre";
  return actuelle > precedente ? "up" : "down";
}

/**
 * Chaque indicateur : série à lire et construction de l'entrée affichée.
 * `obs` = observations de la série, de la plus récente à la plus ancienne.
 */
const INDICATEURS = [
  {
    nom: "Population",
    idBank: "001641586",
    titreAttendu: /^Population totale au 1er janvier - France \(inclus Mayotte/,
    construire: (obs) => ({
      valeur: `${nf(obs[0].valeur / 1e6, 2)} M`,
      tendance: "neutre",
      date: `1ᵉʳ janvier ${obs[0].periode}`,
      detail: `Population totale au 1ᵉʳ janvier, Mayotte incluse (estimation Insee) — ${nf(obs[0].valeur, 0)} habitants`,
    }),
  },
  {
    nom: "Chômage",
    idBank: "001688527",
    titreAttendu: /^Taux de chômage au sens du BIT - Ensemble - France hors Mayotte - Données CVS$/,
    construire: (obs) => ({
      valeur: `${nf(obs[0].valeur, 1)} %`,
      tendance: tendance(obs[0].valeur, obs[1]?.valeur),
      date: formatPeriode(obs[0].periode),
      detail:
        "Taux de chômage au sens du BIT, France hors Mayotte, données corrigées des variations saisonnières" +
        (obs[1] ? ` (trimestre précédent : ${nf(obs[1].valeur, 1)} %)` : ""),
    }),
  },
  {
    nom: "Croissance du PIB",
    idBank: "011794860",
    titreAttendu: /^Produit intérieur brut total - Volume aux prix de l'année précédente chaînés - Série CVS-CJO$/,
    construire: (obs) => {
      // Évolution trimestrielle du PIB en volume, calculée comme l'Insee à partir de la série officielle
      const arrondi = Math.round((obs[0].valeur / obs[1].valeur - 1) * 1000) / 10;
      return {
        valeur: arrondi === 0 ? "0,0 %" : `${arrondi > 0 ? "+" : "−"}${nf(Math.abs(arrondi), 1)} %`,
        tendance: arrondi < 0 ? "up" : "neutre", // un recul du PIB est signalé en rouge
        date: formatPeriode(obs[0].periode),
        detail: "Évolution du PIB en volume par rapport au trimestre précédent (données corrigées des variations saisonnières et des jours ouvrables)",
      };
    },
  },
  {
    nom: "Dette publique",
    idBank: "010777608",
    titreAttendu: /^Dette trimestrielle des administrations publiques au sens de Maastricht - Ensemble - En point de PIB - Base 2020$/,
    complement: { idBank: "010777616", titreAttendu: /^Dette trimestrielle des administrations publiques au sens de Maastricht - Ensemble - Base 2020$/ },
    construire: (obs, montant) => ({
      valeur: `${nf(obs[0].valeur, 1)} % du PIB`,
      tendance: tendance(obs[0].valeur, obs[1]?.valeur),
      date: `fin du ${formatPeriode(obs[0].periode)}`,
      detail:
        (montant ? `${nf(montant[0].valeur, 1)} milliards d'euros — ` : "") +
        "dette des administrations publiques au sens de Maastricht (seuil européen : 60 % du PIB)",
    }),
  },
];

/** Lit les `n` dernières observations d'une série (réponse SDMX-ML). */
async function lireSerie(idBank, titreAttendu, n = 2) {
  const res = await fetch(`${BASE_URL}/${idBank}?lastNObservations=${n}`, { headers: { Accept: "application/xml" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} pour la série ${idBank}`);
  const xml = await res.text();
  const titre = xml.match(/TITLE_FR="([^"]*)"/)?.[1]?.replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  if (!titre || !titreAttendu.test(titre)) {
    throw new Error(`intitulé inattendu pour ${idBank} : « ${titre} » — série modifiée ou arrêtée, à vérifier à la main`);
  }
  const obs = [...xml.matchAll(/TIME_PERIOD="([^"]+)"\s+OBS_VALUE="([^"]+)"/g)]
    .map((m) => ({ periode: m[1], valeur: Number(m[2]) }))
    .filter((o) => Number.isFinite(o.valeur))
    .sort((a, b) => b.periode.localeCompare(a.periode));
  if (obs.length === 0) throw new Error(`aucune observation pour ${idBank}`);
  return obs;
}

async function main() {
  const existing = JSON.parse(await readFile(DATA_FILE, "utf-8").catch(() => '{"indicateurs":[]}'));
  const ordre = existing.indicateurs.map((i) => i.nom);
  const parNom = new Map(existing.indicateurs.map((i) => [i.nom, i]));
  let echecs = 0;

  for (const ind of INDICATEURS) {
    try {
      const obs = await lireSerie(ind.idBank, ind.titreAttendu);
      const montant = ind.complement ? await lireSerie(ind.complement.idBank, ind.complement.titreAttendu, 1) : null;
      const construit = ind.construire(obs, montant);
      const precedent = parNom.get(ind.nom) || {};
      parNom.set(ind.nom, {
        ...precedent, // conserve motsCles
        nom: ind.nom,
        ...construit,
        source: "INSEE",
        url: `https://www.insee.fr/fr/statistiques/serie/${ind.idBank}`,
        idBank: ind.idBank,
        misAJourLe: "automatique",
      });
      if (!ordre.includes(ind.nom)) ordre.push(ind.nom);
      log(`${ind.nom} : ${construit.valeur} (${construit.date})`);
    } catch (e) {
      echecs++;
      warn(`${ind.nom} : ${e.message} — valeur précédente conservée.`);
    }
  }

  const indicateurs = ordre.map((nom) => parNom.get(nom));
  if (JSON.stringify(indicateurs) === JSON.stringify(existing.indicateurs)) {
    log("Aucun changement.");
  } else if (DRY_RUN) {
    log("Dry-run — résultat qui aurait été écrit :");
    console.log(JSON.stringify(indicateurs, null, 2));
  } else {
    await writeFile(DATA_FILE, JSON.stringify({ lastUpdated: new Date().toISOString(), indicateurs }, null, 2) + "\n");
    log("data/indicateurs.json mis à jour.");
  }
  if (echecs) process.exitCode = 1; // signalé par le workflow, sans bloquer la publication des votes
}

main().catch((e) => {
  console.error("[fetch-insee] ÉCHEC :", e);
  process.exitCode = 1;
});
