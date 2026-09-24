#!/usr/bin/env node
/**
 * check-data.js
 * -------------
 * Contrôle de cohérence des fichiers publiés dans data/.
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

async function checkGroupes() {
  const data = JSON.parse(await readFile("data/groupes.json", "utf-8"));
  const groupes = Object.entries(data.groupes || {});
  if (groupes.length < 8) return err(`groupes.json : seulement ${groupes.length} groupe(s)`);
  let total = 0;
  for (const [id, g] of groupes) {
    if (!GROUPES.includes(id)) err(`groupes.json : groupe inconnu ${id}`);
    if (!g.libelle || !estEntierPositif(g.membres)) err(`groupes.json : ${id} incomplet`);
    total += g.membres || 0;
  }
  if (total > 577 || total < 540) err(`groupes.json : ${total} députés au total (attendu entre 540 et 577)`);
  console.log(`[check-data] groupes.json : ${groupes.length} groupes, ${total} députés.`);
}

async function checkSondages() {
  const data = JSON.parse(await readFile("data/sondages.json", "utf-8"));
  if (!Array.isArray(data.instituts) || data.instituts.length === 0) return err("sondages.json : aucun institut");
  for (const i of data.instituts) {
    if (!i.nom || !/^\d{4}-\d{2}-\d{2}$/.test(i.dateFin || "") || !/^https:\/\//.test(i.url || "")) err(`sondages.json : ${i.nom || "?"} incomplet`);
    for (const [nom, [min, max]] of Object.entries(i.scores || {})) {
      if (!(min >= 0 && max <= 60 && min <= max)) err(`sondages.json : ${i.nom}, score invalide pour ${nom}`);
    }
  }
  for (const e of data.historique || []) {
    if (!e.institut || !/^\d{4}-\d{2}-\d{2}$/.test(e.dateFin || "")) err(`sondages.json : entrée d'historique incomplète (${e.institut || "?"})`);
    for (const [nom, [min, max]] of Object.entries(e.scores || {})) {
      if (!(min >= 0 && max <= 60 && min <= max)) err(`sondages.json : historique ${e.institut} ${e.dateFin}, score invalide pour ${nom}`);
    }
  }
  console.log(`[check-data] sondages.json : ${data.instituts.length} instituts, ${(data.historique || []).length} enquêtes en historique.`);
}

async function checkDeputes() {
  const data = JSON.parse(await readFile("data/deputes.json", "utf-8").catch(() => "null"));
  if (!data) return err("deputes.json : fichier absent");
  if (!Array.isArray(data.deputes) || data.deputes.length < 500 || data.deputes.length > 577) err(`deputes.json : ${data.deputes?.length} députés (attendu : 500 à 577)`);
  if (!Array.isArray(data.cles)) return err("deputes.json : liste « cles » absente");
  const ids = new Set();
  for (const d of data.deputes || []) {
    if (!/^PA\d+$/.test(d.id) || ids.has(d.id)) err(`deputes.json : identifiant invalide ou en double (${d.id})`);
    ids.add(d.id);
    if (!d.nom || !GROUPES.includes(d.groupe)) err(`deputes.json : ${d.id} sans nom ou groupe inconnu (${d.groupe})`);
    if (typeof d.votes !== "string" || d.votes.length !== data.cles.length || /[^pcan.\-]/.test(d.votes)) err(`deputes.json : votes clés invalides pour ${d.nom}`);
    const s = d.stats || {};
    if (![s.scrutins, s.pour, s.contre, s.abst, s.ecarts].every(estEntierPositif) || s.pour + s.contre + s.abst > s.scrutins) err(`deputes.json : statistiques incohérentes pour ${d.nom}`);
  }
  console.log(`[check-data] deputes.json : ${data.deputes?.length} députés, ${data.cles.length} votes clés.`);
}

async function checkManuels() {
  for (const [fichier, cle] of [["data/dirigeants.json", "dirigeants"], ["data/justice.json", "condamnations"], ["data/meetings.json", "meetings"]]) {
    const data = JSON.parse(await readFile(fichier, "utf-8"));
    if (!Array.isArray(data[cle])) err(`${fichier} : tableau « ${cle} » manquant`);
  }
  const justice = JSON.parse(await readFile("data/justice.json", "utf-8"));
  for (const c of justice.condamnations) {
    if (!["definitif", "appel"].includes(c.statut)) err(`justice.json : statut invalide pour ${c.nom}`);
    if (!/^https:\/\//.test(c.url || "")) err(`justice.json : source manquante pour ${c.nom}`);
  }
  const meetings = JSON.parse(await readFile("data/meetings.json", "utf-8"));
  for (const m of meetings.meetings) if (!/^\d{4}-\d{2}-\d{2}$/.test(m.debut || "")) err(`meetings.json : date « debut » invalide pour ${m.titre}`);
  console.log("[check-data] fichiers manuels contrôlés.");
}

await checkLois();
await checkIndicateurs();
await checkGroupes();
await checkSondages();
await checkDeputes();
await checkManuels();

if (erreurs.length) {
  console.error(`[check-data] ${erreurs.length} erreur(s) :`);
  for (const e of erreurs.slice(0, 50)) console.error("  - " + e);
  process.exit(1);
}
console.log("[check-data] OK");
