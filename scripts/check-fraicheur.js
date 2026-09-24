#!/usr/bin/env node
/**
 * check-fraicheur.js
 * ------------------
 * Signale les données qui ne se mettent plus à jour alors qu'elles le devraient.
 * Sort en erreur (code 1) avec un message lisible ; le workflow ouvre alors un ticket GitHub.
 *
 *  - Scrutins : pendant la session parlementaire (octobre → juin, hors fêtes de fin d'année),
 *    un vote au moins tous les 21 jours.
 *  - Sondages : dernière enquête retenue datant de moins de 30 jours.
 *  - Indicateurs Insee automatiques : chômage du trimestre publié il y a moins de 7 mois.
 *
 * USAGE : node scripts/check-fraicheur.js
 */

import { readFile } from "fs/promises";

const aujourdhui = new Date();
const joursDepuis = (iso) => Math.floor((aujourdhui - new Date(iso)) / 864e5);
const alertes = [];

const lire = async (f) => JSON.parse(await readFile(f, "utf-8").catch(() => "null"));

const lois = await lire("data/lois.json");
const dernier = lois?.lois?.find((l) => l.dateISO);
const mois = aujourdhui.getUTCMonth() + 1;
const jour = aujourdhui.getUTCDate();
const enSession = (mois >= 10 || mois <= 6) && !(mois === 12 && jour >= 20) && !(mois === 1 && jour <= 10);
if (!dernier) alertes.push("Scrutins : aucun scrutin daté dans data/lois.json.");
else if (enSession && joursDepuis(dernier.dateISO) > 21) {
  alertes.push(`Scrutins : aucun nouveau vote depuis le ${dernier.date} (${joursDepuis(dernier.dateISO)} jours) alors que l'Assemblée est en session — vérifier le rapport data/fetch-scrutins-report.json et l'URL de l'archive.`);
}

const sondages = await lire("data/sondages.json");
const plusRecent = sondages?.instituts?.[0]?.dateFin;
if (!plusRecent) alertes.push("Sondages : aucune enquête dans data/sondages.json.");
else if (joursDepuis(plusRecent) > 30) alertes.push(`Sondages : la dernière enquête retenue date du ${plusRecent} — la page Wikipédia a peut-être changé de format (voir les avertissements de fetch-sondages.js).`);

const indic = await lire("data/indicateurs.json");
const chomage = indic?.indicateurs?.find((i) => i.nom === "Chômage");
const trimestre = chomage?.date?.match(/(\d)(?:ᵉʳ|ᵉ) trimestre (\d{4})/);
if (trimestre) {
  const finTrimestre = new Date(Date.UTC(parseInt(trimestre[2], 10), parseInt(trimestre[1], 10) * 3, 0));
  if (joursDepuis(finTrimestre) > 215) alertes.push(`Indicateurs : le chômage affiché date du ${chomage.date} — la mise à jour Insee semble bloquée.`);
}

if (alertes.length) {
  console.error(alertes.map((a) => "- " + a).join("\n"));
  process.exit(1);
}
console.log("[check-fraicheur] Données à jour.");
