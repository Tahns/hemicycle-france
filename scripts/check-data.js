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
import { completer } from "./lois-format.js";

const GROUPES = ["LFI", "GDR", "ECO", "SOC", "LIOT", "EPR", "DEM", "HOR", "LR", "UDR", "RN", "NI"];
const erreurs = [];
const err = (m) => erreurs.push(m);

function estEntierPositif(n) {
  return Number.isInteger(n) && n >= 0;
}

async function checkLois() {
  const data = JSON.parse(await readFile("data/lois.json", "utf-8"));
  if (!Array.isArray(data.lois) || data.lois.length === 0) return err("lois.json : tableau 'lois' absent ou vide");
  data.lois.forEach(completer);

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

async function checkCandidats() {
  const data = JSON.parse(await readFile("data/candidats.json", "utf-8").catch(() => "null"));
  if (!data) return err("candidats.json : fichier absent");
  if (!Array.isArray(data.candidats) || data.candidats.length < 5) return err("candidats.json : moins de 5 candidats");
  for (const c of data.candidats) {
    if (!c.nom || !c.parti) err(`candidats.json : candidat sans nom ou sans parti (${c.nom || "?"})`);
    if (c.annonce !== null && !/^\d{4}-\d{2}-\d{2}$/.test(c.annonce || "")) err(`candidats.json : date d'annonce invalide pour ${c.nom}`);
    if (!/^https?:\/\//.test(c.source || "")) err(`candidats.json : source manquante pour ${c.nom}`);
  }
  console.log(`[check-data] candidats.json : ${data.candidats.length} candidats.`);
}

async function checkSenat() {
  const data = JSON.parse(await readFile("data/senat.json", "utf-8").catch(() => "null"));
  if (!data) return err("senat.json : fichier absent");
  const ids = new Set();
  for (const x of data.scrutins || []) {
    if (!x.id || ids.has(x.id)) err(`senat.json : identifiant invalide ou en double (${x.id})`);
    ids.add(x.id);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(x.dateISO || "") || !["adopte", "rejete"].includes(x.resultat)) err(`senat.json : ${x.id} date ou résultat invalide`);
    const g = Object.values(x.groupes || {});
    const somme = (k) => g.reduce((t, v) => t + v[k], 0);
    if (somme("pour") !== x.pour || somme("contre") !== x.contre || somme("abst") !== x.abst) err(`senat.json : ${x.id} somme des groupes ≠ total officiel`);
  }
  console.log(`[check-data] senat.json : ${(data.scrutins || []).length} scrutins.`);
}

async function checkCommunes() {
  const data = JSON.parse(await readFile("data/communes.json", "utf-8").catch(() => "null"));
  if (!data) return console.log("[check-data] communes.json : absent (recherche par commune désactivée).");
  const deps = Object.values(data.departements || {});
  const n = deps.reduce((t, l) => t + l.length, 0);
  if (n < 30000) err(`communes.json : seulement ${n} communes`);
  for (const l of deps) for (const [c, circos] of l) if (!c || !Array.isArray(circos) || !circos.length || !circos.every((x) => Number.isInteger(x) && x > 0 && x < 30)) { err(`communes.json : entrée invalide (${c})`); break; }
  console.log(`[check-data] communes.json : ${n} communes.`);
}

async function checkActivite() {
  const data = JSON.parse(await readFile("data/activite.json", "utf-8").catch(() => "null"));
  if (!data) return console.log("[check-data] activite.json : absent (bloc d'activité masqué).");
  const e = Object.entries(data.deputes || {});
  if (e.length < 500) err(`activite.json : seulement ${e.length} députés`);
  for (const [id, a] of e) {
    if (!/^PA\d+$/.test(id) || !Number.isInteger(a.q) || !Number.isInteger(a.a) || !Number.isInteger(a.aa) || a.aa > a.a) { err(`activite.json : entrée invalide (${id})`); break; }
    if (a.hatvp && !/^https:\/\/www\.hatvp\.fr\//.test(a.hatvp.url)) { err(`activite.json : lien HATVP invalide (${id})`); break; }
  }
  console.log(`[check-data] activite.json : ${e.length} députés.`);
}

async function checkNavette() {
  const data = JSON.parse(await readFile("data/navette.json", "utf-8").catch(() => "null"));
  if (!data) return console.log("[check-data] navette.json : absent.");
  for (const [ref, t] of Object.entries(data.textes || {})) {
    if (!/^https:\/\/www\.senat\.fr\//.test(t.dossier) || !t.votes?.length || t.votes.some((v) => !["adopte", "rejete"].includes(v.resultat))) { err(`navette.json : entrée invalide (${ref})`); break; }
  }
  console.log(`[check-data] navette.json : ${Object.keys(data.textes || {}).length} textes.`);
}

async function checkSenateurs() {
  const data = JSON.parse(await readFile("data/senateurs.json", "utf-8").catch(() => "null"));
  if (!data) return console.log("[check-data] senateurs.json : absent (recherche de sénateurs masquée).");
  if (data.senateurs.length < 300) err(`senateurs.json : seulement ${data.senateurs.length} sénateurs`);
  for (const s of data.senateurs) {
    if (!/^\d{5}[A-Z]$/.test(s.id) || !s.nom || !s.dep || s.votes.length !== data.cles.length || /[^pcan.]/.test(s.votes)) { err(`senateurs.json : entrée invalide (${s.id})`); break; }
  }
  console.log(`[check-data] senateurs.json : ${data.senateurs.length} sénateurs, ${data.cles.length} votes.`);
}

async function checkGouvernementAgenda() {
  const g = JSON.parse(await readFile("data/gouvernement.json", "utf-8").catch(() => "null"));
  if (g) {
    if (!g.membres?.some((m) => m.qualite === "Premier ministre") || g.membres.length < 15 || g.membres.some((m) => !m.nom || !m.fonction)) err("gouvernement.json : composition invalide");
    else console.log(`[check-data] gouvernement.json : ${g.membres.length} membres.`);
  }
  const a = JSON.parse(await readFile("data/agenda-an.json", "utf-8").catch(() => "null"));
  if (a) {
    if (!Array.isArray(a.jours) || a.jours.some((j) => !/^\d{4}-\d{2}-\d{2}$/.test(j.date) || !j.points?.every((p) => p.objet && ["texte", "vote", "qag", "autre"].includes(p.type)))) err("agenda-an.json : format invalide");
    else console.log(`[check-data] agenda-an.json : ${a.jours.length} jour(s) de séance.`);
  }
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
await checkCandidats();
await checkSenat();
await checkActivite();
await checkNavette();
await checkSenateurs();
await checkGouvernementAgenda();
await checkCommunes();
await checkManuels();

if (erreurs.length) {
  console.error(`[check-data] ${erreurs.length} erreur(s) :`);
  for (const e of erreurs.slice(0, 50)) console.error("  - " + e);
  process.exit(1);
}
console.log("[check-data] OK");
