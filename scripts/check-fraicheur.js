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
 * Données saisies à la main (rappel à mettre à jour) :
 *  - Inflation : le chiffre du mois M est remplacé par l'estimation provisoire du mois M+1, publiée
 *    à la fin du mois M+1 ; alerte 10 jours après.
 *  - Déficit public de l'année N : remplacé par celui de N+1 publié fin mars N+2 (alerte au 15 avril).
 *  - Justice : relecture au moins tous les 60 jours, et après chaque échéance de data/justice.json.
 *  - Chefs de parti : vérifiés chaque jour sur Wikipédia (fetch-dirigeants.js) ; alerte si l'un a changé.
 *  - Agenda : au moins un rendez-vous à venir, relecture au moins tous les 30 jours.
 *
 * USAGE : node scripts/check-fraicheur.js [--date=AAAA-MM-JJ]   (la date sert aux tests)
 */

import { readFile } from "fs/promises";

const DATE_ARG = process.argv.find((a) => a.startsWith("--date="))?.split("=")[1];
const aujourdhui = DATE_ARG ? new Date(DATE_ARG + "T12:00:00Z") : new Date();
const isoAujourdhui = aujourdhui.toISOString().slice(0, 10);
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
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

// Veille : une enquête déposée à la Commission des sondages dont les chiffres ne sont toujours pas relevés
const veille = await lire("data/sondages-veille.json");
for (const e of veille?.enquetes || []) {
  if (!e.integre && joursDepuis(e.terrain.fin) > 4) alertes.push(`Sondages : l'enquête ${e.institut}${e.media ? ` (${e.media})` : ""}, terrain terminé le ${e.terrain.fin}, est déposée à la Commission des sondages (${e.notice}) mais ses chiffres ne sont toujours pas relevés sur la liste Wikipédia.`);
}
if (veille?.lastUpdated && joursDepuis(veille.lastUpdated.slice(0, 10)) > 3) alertes.push(`Sondages : la veille de la Commission des sondages n'a pas tourné depuis le ${veille.lastUpdated.slice(0, 10)} (voir veille-sondages.js).`);

const indic = await lire("data/indicateurs.json");
const chomage = indic?.indicateurs?.find((i) => i.nom === "Chômage");
const trimestre = chomage?.date?.match(/(\d)(?:ᵉʳ|ᵉ) trimestre (\d{4})/);
if (trimestre) {
  const finTrimestre = new Date(Date.UTC(parseInt(trimestre[2], 10), parseInt(trimestre[1], 10) * 3, 0));
  if (joursDepuis(finTrimestre) > 215) alertes.push(`Indicateurs : le chômage affiché date du ${chomage.date} — la mise à jour Insee semble bloquée.`);
}

const inflationAuto = indic?.indicateurs?.find((i) => i.nom === "Inflation" && i.misAJourLe === "automatique");
const moisAuto = inflationAuto?.date?.toLowerCase().match(/([a-zéû]+) (\d{4})/);
if (moisAuto && MOIS.includes(moisAuto[1])) {
  // L'Insee publie le mois M vers la mi-M+1 : alerte si le chiffre a plus de deux mois de retard
  const limite = new Date(Date.UTC(parseInt(moisAuto[2], 10), MOIS.indexOf(moisAuto[1]) + 3, 1));
  if (aujourdhui > limite) alertes.push(`Inflation : le chiffre affiché date de ${inflationAuto.date} — la série Insee ne semble plus mise à jour (changement de base ?).`);
}
const deficitAuto = indic?.indicateurs?.find((i) => i.nom === "Déficit public" && i.misAJourLe === "automatique");
if (deficitAuto && isoAujourdhui > `${parseInt(deficitAuto.date, 10) + 2}-05-15`) {
  alertes.push(`Déficit public : le chiffre affiché porte sur ${deficitAuto.date} ; celui de ${parseInt(deficitAuto.date, 10) + 1} aurait dû être publié par Eurostat fin avril.`);
}

// ---------- Données manuelles ----------
const inflation = indic?.indicateurs?.find((i) => i.nom === "Inflation" && i.misAJourLe === "manuel");
const moisInfl = inflation?.date?.toLowerCase().match(/([a-zéû]+) (\d{4})/);
if (moisInfl && MOIS.includes(moisInfl[1])) {
  // fin du mois suivant + 10 jours
  const limite = new Date(Date.UTC(parseInt(moisInfl[2], 10), MOIS.indexOf(moisInfl[1]) + 2, 0) + 10 * 864e5);
  if (aujourdhui > limite) alertes.push(`Inflation (saisie manuelle) : le chiffre affiché date de ${inflation.date} ; reporter le dernier chiffre publié par l'Insee dans data/indicateurs.json.`);
}
const deficit = indic?.indicateurs?.find((i) => i.nom === "Déficit public" && i.misAJourLe === "manuel");
const anneeDef = parseInt(deficit?.date?.match(/\d{4}/)?.[0], 10);
if (anneeDef && isoAujourdhui > `${anneeDef + 2}-04-15`) {
  alertes.push(`Déficit public (saisie manuelle) : le chiffre affiché porte sur ${anneeDef} ; l'Insee a publié celui de ${anneeDef + 1} fin mars, à reporter dans data/indicateurs.json (déficit et jauge).`);
}

const justice = await lire("data/justice.json");
if (justice?.verifieLe) {
  if (joursDepuis(justice.verifieLe) > 60) alertes.push(`Justice : liste relue pour la dernière fois le ${justice.verifieLe} ; vérifier l'état de chaque procédure puis mettre à jour « verifieLe » dans data/justice.json.`);
  for (const e of justice.echeances || []) {
    if (e.date <= isoAujourdhui && justice.verifieLe < e.date) {
      alertes.push(`Justice : échéance du ${e.date} passée (${e.objet}) ; mettre la fiche à jour, puis « verifieLe » dans data/justice.json.`);
    }
  }
}

const dirigeants = await lire("data/dirigeants.json");
for (const l of dirigeants?.dirigeants || []) {
  if (l.aVerifier) alertes.push(`Chefs de parti : ${l.parti} est désormais dirigé par ${l.nom} d'après Wikipédia ; préciser l'intitulé de sa fonction (« role ») dans data/dirigeants.json, puis retirer « aVerifier ».`);
}
if (dirigeants?.verifieLe && joursDepuis(dirigeants.verifieLe) > 90) {
  alertes.push(`Chefs de parti : liste relue pour la dernière fois le ${dirigeants.verifieLe} ; la vérifier puis mettre à jour « verifieLe » dans data/dirigeants.json.`);
}

const meetings = await lire("data/meetings.json");
if (meetings?.verifieLe && joursDepuis(meetings.verifieLe) > 30) {
  alertes.push(`Agenda : relu pour la dernière fois le ${meetings.verifieLe} ; ajouter les rendez-vous annoncés depuis (congrès, meetings, primaires), puis mettre à jour « verifieLe » dans data/meetings.json.`);
}
if (meetings?.meetings && !meetings.meetings.some((m) => (m.fin || m.debut) >= isoAujourdhui)) {
  alertes.push("Agenda : aucun rendez-vous à venir dans data/meetings.json (la page Agenda affiche une liste vide).");
}

if (alertes.length) {
  console.error(alertes.map((a) => "- " + a).join("\n"));
  process.exit(1);
}
console.log("[check-fraicheur] Données à jour.");
