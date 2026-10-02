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
import { existsSync } from "fs";
import { completer } from "./lois-format.js";
import { verifierPortraits } from "./check-portraits.js";

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

/** Budget : fichier facultatif (absent tant que la première récupération n'a pas réussi) ; s'il existe, il doit être complet et cohérent. */
async function checkBudget() {
  const fichier = process.env.BUDGET_FILE || "data/budget.json";
  const d = JSON.parse(await readFile(fichier, "utf-8").catch(() => "null"));
  if (!d) return console.log("[check-data] budget.json : absent (la rubrique affiche « données en cours de récupération »).");
  const nb = (v) => typeof v === "number" && Number.isFinite(v);
  const annee = (a, ou) => { if (!Number.isInteger(a) || a < 2000 || a > new Date().getFullYear()) err(`budget.json : année invalide (${ou})`); };
  const source = (b, ou) => { if (!b?.source) err(`budget.json : source manquante (${ou})`); if (!/^https:\/\//.test(b?.url || "")) err(`budget.json : url manquante ou non https (${ou})`); };
  if (!d.lastUpdated || isNaN(Date.parse(d.lastUpdated))) err("budget.json : lastUpdated invalide");
  annee(d.anneeReference, "anneeReference");
  const { depenses: dep, equilibre: eq, dette, serie } = d;
  if (!dep || !Array.isArray(dep.postes) || dep.postes.length < 8) return err("budget.json : dépenses par fonction absentes ou incomplètes");
  annee(dep.annee, "dépenses"); source(dep, "dépenses");
  let somme = 0;
  for (const p of dep.postes) {
    if (!p.code || !p.libelle || !nb(p.md) || p.md < 0 || !nb(p.pct) || p.pct < 0 || p.pct > 100) err(`budget.json : poste ${p.code || "?"} invalide`);
    somme += p.md;
  }
  if (!nb(dep.totalMd) || Math.abs(somme - dep.totalMd) > Math.max(1, dep.totalMd * 0.01)) err(`budget.json : la somme des postes (${somme.toFixed(1)}) ne correspond pas au total (${dep.totalMd})`);
  if (!eq || ![eq.recettesMd, eq.depensesMd, eq.soldeMd, eq.soldePib].every(nb)) err("budget.json : recettes, dépenses ou solde manquants");
  else {
    annee(eq.annee, "équilibre"); source(eq, "équilibre");
    if (Math.abs(eq.recettesMd - eq.depensesMd - eq.soldeMd) > 1.5) err("budget.json : recettes − dépenses ≠ solde");
  }
  if (!dette || ![dette.md, dette.pib, dette.interetsMd].every(nb) || dette.pib <= 0 || dette.pib >= 300) err("budget.json : dette ou charge d'intérêts manquante ou invraisemblable");
  else { annee(dette.annee, "dette"); source(dette, "dette"); }
  if (dep.annee !== d.anneeReference || eq?.annee !== d.anneeReference || dette?.annee !== d.anneeReference) err("budget.json : les blocs ne portent pas tous l'année de référence");
  if (!Array.isArray(serie?.annees) || !serie.annees.length) err("budget.json : série annuelle absente");
  else {
    source(serie, "série");
    serie.annees.forEach((a, i) => {
      if (![a.annee, a.soldeMd, a.soldePib, a.detteMd, a.dettePib].every(nb)) err(`budget.json : série, ligne ${i + 1} incomplète`);
      if (i && a.annee <= serie.annees[i - 1].annee) err("budget.json : série non triée par année croissante");
    });
  }
  console.log(`[check-data] budget.json : année ${d.anneeReference}, ${dep.postes.length} fonctions de dépenses, ${serie?.annees?.length || 0} années de série.`);
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
  for (const d of data.secondTour || []) {
    if (!Array.isArray(d.candidats) || d.candidats.length !== 2 || !d.instituts?.length) err(`sondages.json : duel de second tour incomplet (${d.candidats})`);
    for (const nom of d.candidats || []) if (/^(fichier|file|image)\s*:/i.test(nom) || !(nom in (data.candidats || {}))) err(`sondages.json : second tour, candidat inconnu « ${nom} »`);
    for (const i of d.instituts || []) {
      const v = d.candidats.map((n) => i.scores?.[n]);
      if (!i.nom || !/^\d{4}-\d{2}-\d{2}$/.test(i.dateFin || "") || !/^https:\/\//.test(i.url || "")) err(`sondages.json : second tour ${i.nom || "?"} incomplet`);
      if (!v.every((x) => x >= 0 && x <= 100) || Math.abs(v[0] + v[1] - 100) > 3) err(`sondages.json : second tour ${i.nom} (${d.candidats.join(" / ")}), scores invalides`);
    }
  }
  console.log(`[check-data] sondages.json : ${data.instituts.length} instituts, ${(data.historique || []).length} enquêtes en historique, ${(data.secondTour || []).length} duel(s) de second tour.`);
}

async function checkActualites() {
  const data = JSON.parse(await readFile("data/actualites.json", "utf-8").catch(() => "null"));
  if (!data) return;
  if (!Array.isArray(data.sujets)) return err("actualites.json : sujets absents");
  const sites = (data.medias || []).map((m) => new URL(m.site).hostname.replace(/^www\./, ""));
  for (const s of data.sujets) for (const a of s.articles || []) {
    const hote = (() => { try { return new URL(a.url).hostname.replace(/^www\./, ""); } catch { return ""; } })();
    if (!a.titre || !a.media || isNaN(Date.parse(a.date))) err(`actualites.json : article incomplet (${a.url})`);
    if (!/^https:\/\//.test(a.url || "") || !sites.some((d) => hote === d || hote.endsWith("." + d))) err(`actualites.json : lien hors des médias retenus (${a.url})`);
  }
  // Illustrations : uniquement des images hébergées sur le site, qui existent
  for (const s of data.sujets) for (const p of s.illustration?.personnes || []) {
    if (p.photo && (!/^photos\/(deputes|senateurs|personnalites)\/[\w-]+\.jpg$/.test(p.photo) || !existsSync(p.photo))) err(`actualites.json : photo absente ou non hébergée (${p.photo})`);
  }
}

// Bandeau « En direct » (fichier optionnel, écrit par scripts/detecter-direct.js)
async function checkDirect() {
  const d = JSON.parse(await readFile("data/direct.json", "utf-8").catch(() => "null"));
  if (!d) return;
  if (isNaN(Date.parse(d.lastUpdated)) || !Array.isArray(d.evenements)) return err("direct.json : format invalide");
  const https = (u) => /^https:\/\//.test(u || "");
  const types = ["allocution", "conference", "interview", "discours", "prise-de-parole", "seance-an"];
  for (const e of d.evenements) {
    const nom = `direct.json : événement ${e.id || "?"}`;
    if (!e.id || !types.includes(e.type) || !e.titre || !e.quand) err(`${nom} incomplet`);
    if (!https(e.source?.url) || !e.source?.media) err(`${nom} : source sans média ou sans lien https`);
    if (!Array.isArray(e.chaines) || !e.chaines.length || e.chaines.some((c) => !c.nom || !https(c.url))) err(`${nom} : chaînes sans lien https`);
    if (e.type === "seance-an" && !(e.chaines || []).some((c) => c.url === "https://videos.assemblee-nationale.fr/")) err(`${nom} : lien du direct officiel de l'Assemblée absent`);
    if (e.type !== "seance-an") {
      // Fenêtre : titre publié depuis au plus 6 h, expiration = publication + 6 h
      const pub = Date.parse(e.publie), exp = Date.parse(e.expire);
      if (isNaN(pub) || isNaN(exp) || exp - pub !== 6 * 36e5) err(`${nom} : fenêtre incohérente (publication + 6 h attendue)`);
      else if (pub > Date.parse(d.lastUpdated) + 36e5) err(`${nom} : publié après la mise à jour du fichier`);
    } else if (isNaN(Date.parse(e.expire)) || Date.parse(e.expire) - Date.parse(d.lastUpdated) > 25 * 36e5) err(`${nom} : expiration incohérente`);
  }
  console.log(`[check-data] direct.json : ${d.evenements.length} événement(s) en direct.`);
}

async function checkQuiz() {
  const data = JSON.parse(await readFile("data/quiz.json", "utf-8").catch(() => "null"));
  if (!data) return;
  const lois = JSON.parse(await readFile("data/lois.json", "utf-8")).lois.map((l) => l.numero);
  for (const q of data.questions || []) {
    if (!Number.isInteger(q.numero) || !q.question || !q.aide) err(`quiz.json : question incomplète (${q.numero})`);
    else if (!lois.includes(q.numero)) err(`quiz.json : scrutin n° ${q.numero} absent de lois.json`);
  }
}


// Un workflow GitHub avec une clé en double dans une étape est refusé en bloc (plus aucune mise à jour automatique)
async function checkWorkflows() {
  const { readdir } = await import("fs/promises");
  for (const f of (await readdir(".github/workflows")).filter((n) => n.endsWith(".yml"))) {
    const texte = await readFile(`.github/workflows/${f}`, "utf-8");
    for (const bloc of texte.split(/\n {6}- /).slice(1)) {
      for (const cle of ["id:", "run:", "if:", "env:", "with:", "uses:", "continue-on-error:"]) {
        const n = bloc.split("\n").filter((l) => l.startsWith(`        ${cle}`)).length;
        if (n > 1) err(`${f} : clé « ${cle} » en double dans l'étape « ${bloc.split("\n")[0].slice(0, 60)} »`);
      }
    }
  }
  console.log("[check-data] workflows : pas de clé en double.");
}
async function checkProbabilites() {
  const data = JSON.parse(await readFile("data/probabilites.json", "utf-8").catch(() => "null"));
  if (!data) return;
  if (!Array.isArray(data.candidats) || data.candidats.length < 2) return err("probabilites.json : candidats absents");
  const somme = (cle) => data.candidats.reduce((s, c) => s + (c[cle] || 0), 0);
  if (Math.abs(somme("secondTour") - 200) > 1) err(`probabilites.json : les qualifications ne totalisent pas 200 % (${somme("secondTour")})`);
  if (data.candidats.some((c) => c.victoire !== null) && Math.abs(somme("victoire") + data.duelNonTeste - 100) > 1) err("probabilites.json : victoires + duels non testés ≠ 100 %");
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
    // Champs optionnels : date de naissance (âge plausible 18-110 ans) et profession
    if (d.naissance !== undefined) {
      const t = Date.parse(d.naissance);
      const age = (Date.now() - t) / 31557600000;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d.naissance) || Number.isNaN(t) || age < 18 || age > 110) err(`deputes.json : date de naissance invalide ou âge implausible pour ${d.nom} (${d.naissance})`);
    }
    if (d.profession !== undefined && (typeof d.profession !== "string" || !d.profession.trim() || d.profession.length > 200)) err(`deputes.json : profession invalide pour ${d.nom}`);
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

async function checkLobbying() {
  const data = JSON.parse(await readFile("data/lobbying.json", "utf-8").catch(() => "null"));
  if (!data) return console.log("[check-data] lobbying.json : absent (bloc « rencontres » masqué).");
  if (!/^https?:|HATVP|Haute Autorité/.test(data.source || "")) err("lobbying.json : source manquante");
  const e = Object.entries(data.elus || {});
  for (const [id, x] of e) {
    const ok = /^(PA\d+|[0-9A-Za-z]{5,8})$/.test(id) && Number.isInteger(x.n) && x.n >= x.derniers?.length && Array.isArray(x.derniers) && x.derniers.length > 0
      && x.derniers.every((r) => Array.isArray(r) && r[0] && /^\d{4}-\d{2}-\d{2}$/.test(r[1]));
    if (!ok) { err(`lobbying.json : entrée invalide (${id})`); break; }
  }
  console.log(`[check-data] lobbying.json : ${e.length} élus.`);
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
  const c = JSON.parse(await readFile("data/commissions.json", "utf-8").catch(() => "null"));
  if (c) {
    const e = Object.entries(c.deputes || {});
    if (e.length < 400 || e.some(([id, v]) => !/^PA\d+$/.test(id) || v.length !== 3 || !v.every(Number.isInteger))) err("commissions.json : format invalide");
    else console.log(`[check-data] commissions.json : ${e.length} députés, ${c.reunions} réunions.`);
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
await checkBudget();
await checkGroupes();
await checkSondages();
await checkWorkflows();
await checkProbabilites();
await checkQuiz();
await checkActualites();
await checkDirect();
await checkDeputes();
await checkCandidats();
await checkSenat();
await checkActivite();
await checkLobbying();
await checkNavette();
await checkSenateurs();
await checkGouvernementAgenda();
await checkCommunes();
{
  const { logos } = JSON.parse(await readFile("data/logos.json", "utf-8"));
  for (const [id, l] of Object.entries(logos)) if (!l.fichier || (l.licence && !/public domain|domaine public|^cc0|^cc by/i.test(l.licence))) err(`logos.json : ${id} invalide ou non libre`);
  console.log(`[check-data] logos.json : ${Object.keys(logos).length} logos.`);
}
{
  const a = JSON.parse(await readFile("data/alertes.json", "utf-8").catch(() => "null"));
  if (a) {
    if (!Array.isArray(a.votes) || !a.votes.length || a.votes.some((v) => !Number.isInteger(v.numero) || !v.titre || v.codes.length !== a.deputes.length)) err("alertes.json : format invalide");
    else console.log(`[check-data] alertes.json : ${a.votes.length} votes récents.`);
  }
}
await checkManuels();
{
  // Droit à l'image : chaque photo de personnalité doit avoir sa licence dans data/portraits.json (bloquant)
  const e = await verifierPortraits();
  e.forEach(err);
  if (!e.length) console.log("[check-data] portraits : toutes les photos ont une licence.");
}

if (erreurs.length) {
  console.error(`[check-data] ${erreurs.length} erreur(s) :`);
  for (const e of erreurs.slice(0, 50)) console.error("  - " + e);
  process.exit(1);
}
console.log("[check-data] OK");
