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

import { readFile, readdir } from "fs/promises";
import { existsSync, appendFileSync } from "fs";
import { completer } from "./lois-format.js";
import { verifierPortraits } from "./check-portraits.js";
import { verifierVignettes } from "./check-vignettes.js";
import { extraire, controlerDico, controlerDonnees, listerLangues } from "./extraire-i18n.js";
import { lireConfigCompte, connectSrc } from "./appliquer-compte.js";
import { controlerFichierJson } from "./controles-json.js";
import { controlerDepot } from "./controles-digest.js";

const GROUPES = ["LFI", "GDR", "ECO", "SOC", "LIOT", "EPR", "DEM", "HOR", "LR", "UDR", "RN", "NI"];
const erreurs = [];
// Contrôles « secondaires » (file des stories Instagram, traductions) : une anomalie est signalée dans le résumé de l'exécution
// mais ne bloque pas la publication des données utiles (sauf avec --strict, utilisé par l'intégration continue).
const secondaires = [];
let liste = erreurs;
const err = (m) => liste.push(m);
async function secondaire(controle) {
  liste = secondaires;
  try { await controle(); } finally { liste = erreurs; }
}
const STRICT = process.argv.includes("--strict");

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
  // Dossiers (facultatifs) : au plus 3, >= 6 articles de >= 4 médias, liens vers les médias retenus
  if (data.dossiers !== undefined) {
    if (!Array.isArray(data.dossiers) || data.dossiers.length > 3) err("actualites.json : dossiers invalides (tableau de 3 au plus)");
    for (const d of Array.isArray(data.dossiers) ? data.dossiers : []) {
      const nom = `actualites.json : dossier ${d?.id || "?"}`;
      if (!/^[a-z0-9-]+$/.test(d?.id || "") || !d.titre || !Array.isArray(d.motifs) || !Array.isArray(d.medias) || !Array.isArray(d.articles)) { err(`${nom} incomplet`); continue; }
      if (d.articles.length < 6 || d.nb < 6) err(`${nom} : moins de 6 articles`);
      if (new Set(d.articles.map((a) => a.media)).size < 4 || d.medias.length < 4) err(`${nom} : moins de 4 médias`);
      for (const a of d.articles) {
        const hote = (() => { try { return new URL(a.url).hostname.replace(/^www\./, ""); } catch { return ""; } })();
        if (!a.titre || !a.media || isNaN(Date.parse(a.date))) err(`${nom} : article incomplet (${a.url})`);
        if (!/^https:\/\//.test(a.url || "") || !sites.some((s) => hote === s || hote.endsWith("." + s))) err(`${nom} : lien hors des médias retenus (${a.url})`);
      }
    }
  }
  // Ce que le site ajoute : titre à nous (obligatoire), contexte, chiffre, date, liens vidéo
  const brefs = [...data.sujets, ...(Array.isArray(data.dossiers) ? data.dossiers : [])];
  for (const a of brefs.flatMap((s) => s.articles || [])) if (a.video !== undefined && a.video !== true) err(`actualites.json : video doit valoir true (${a.url})`);
  data.sujets.forEach((s, i) => {
    const nom = `actualites.json : sujet ${i}`;
    // Tout sujet publié porte un titre à nous (jamais celui d'un média) : court, sans copie de titre de presse, sans nom dans une procédure
    const t = s.titrePropre?.titre;
    if (typeof t !== "string" || t.trim().length < 3 || t.length > 70 || !["dossier", "recoupement", "regles"].includes(s.titrePropre.origine)) err(`${nom} : titrePropre absent ou invalide (3 à 70 caractères, origine dossier/recoupement/regles)`);
    else {
      const plat = (x) => String(x).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      const tm = plat(t).split(" ").filter(Boolean);
      for (const a of s.articles || []) {
        const pm = plat(a.titre);
        if (pm === plat(t)) err(`${nom} : titrePropre identique à un titre de presse`);
        for (let k = 0; k + 5 <= tm.length; k++) if (` ${pm} `.includes(` ${tm.slice(k, k + 5).join(" ")} `)) { err(`${nom} : titrePropre reprend un segment de 5 mots d'un titre de presse`); break; }
      }
      if (/\$content|\{\{|\$\{|%[a-z_]+%|TitleNoTags/i.test(t)) err(`${nom} : titrePropre issu d'un gabarit de flux cassé`);
      const procedure = (s.articles || []).some((a) => /mis en examen|mise en examen|garde à vue|condamn|inculp|écroué|poursuivi|procès|soupçonn|parquet|tribunal|victime|inéligib|extradition|mandat d.arrêt|détournement|\baffaire\b|plainte/i.test(a.titre || ""));
      if (procedure && (s.illustration?.personnes || []).some((p) => plat(t).includes(plat(p.nom)))) err(`${nom} : titrePropre nomme une personne dans une affaire judiciaire (présomption d'innocence)`);
      if (s.titrePropre.origine !== "regles" && (s.illustration?.personnes || []).some((p) => plat(t).includes(plat(p.nom)))) err(`${nom} : titrePropre nomme une personne`);
      if (s.titrePropre.origine === "recoupement" && new Set((s.articles || []).map((a) => a.media)).size < 2) err(`${nom} : titrePropre sans recoupement`);
    }
    if (s.contexte !== undefined && (!Array.isArray(s.contexte) || s.contexte.length === 0 || s.contexte.length > 2 || s.contexte.some((c) => !c?.texte || !c?.source || !c?.type))) err(`${nom} : contexte invalide`);
    if (s.chiffre !== undefined && (!s.chiffre?.valeur || !s.chiffre?.unite)) err(`${nom} : chiffre invalide`);
    if (s.date !== undefined && (!/^\d{4}-\d{2}-\d{2}$/.test(s.date?.iso || "") || !s.date.jour || !s.date.mois)) err(`${nom} : date invalide`);
  });
  // Illustrations : uniquement des images hébergées sur le site, qui existent
  for (const s of data.sujets) for (const p of s.illustration?.personnes || []) {
    if (p.photo && (!/^photos\/(deputes|senateurs|personnalites)\/[\w-]+\.jpg$/.test(p.photo) || !existsSync(p.photo))) err(`actualites.json : photo absente ou non hébergée (${p.photo})`);
  }
}

// Vérifications des faits : titres de rédactions, liens https vers le site de la rédaction qui les publie
async function checkVerifications() {
  const data = JSON.parse(await readFile("data/verifications.json", "utf-8").catch(() => "null"));
  if (!data) return;
  if (!Array.isArray(data.verifications) || !Array.isArray(data.medias)) return err("verifications.json : format invalide");
  const sites = data.medias.map((m) => new URL(m.site).hostname.replace(/^www\./, ""));
  for (const a of data.verifications) {
    const hote = (() => { try { return new URL(a.url).hostname.replace(/^www\./, ""); } catch { return ""; } })();
    if (!a.titre || !a.media || isNaN(Date.parse(a.date))) err(`verifications.json : entrée incomplète (${a.url})`);
    if (!/^https:\/\//.test(a.url || "") || !sites.some((d) => hote === d || hote.endsWith("." + d))) err(`verifications.json : lien hors des rédactions retenues (${a.url})`);
  }
  console.log(`[check-data] verifications.json : ${data.verifications.length} titre(s).`);
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
    } else if (isNaN(Date.parse(e.expire)) || Date.parse(e.expire) - Date.parse(d.lastUpdated) > 31 * 36e5) err(`${nom} : expiration incohérente`);
  }
  console.log(`[check-data] direct.json : ${d.evenements.length} événement(s) en direct.`);
}

// Dimensions d'un JPEG ({ l, h }) ou null
function dimensionsJpeg(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { h: buf.readUInt16BE(i + 5), l: buf.readUInt16BE(i + 7) };
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

// File de stories ET de posts Instagram automatiques (fichier optionnel, écrit par scripts/stories-auto.cjs).
// type « story » : image 1080 × 1920 ; type « post » : image de fil 1080 × 1350 + légende ; une story d'annonce porte « annonceDe » (id du post).
async function checkInstagramFile() {
  const d = JSON.parse(await readFile("data/instagram-file.json", "utf-8").catch(() => "null"));
  if (!d) return;
  if (!Array.isArray(d.entrees)) return err("instagram-file.json : entrees absentes");
  const stories = {}, posts = {}, videos = {}, ids = new Set();
  for (const e of d.entrees) {
    const nom = `instagram-file.json : entrée ${e.id || "?"}`;
    if (!/^[0-9a-f]{12}$/.test(e.id || "") || !e.titre || !["story", "post", "reel"].includes(e.type)) { err(`${nom} incomplète (type « story », « post » ou « reel » attendu)`); continue; }
    if (ids.has(e.id)) err(`${nom} en double`);
    ids.add(e.id);
    const t = Date.parse(e.cree);
    if (isNaN(t) || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/.test(e.cree)) { err(`${nom} : date « cree » invalide`); continue; }
    if (e.url_image !== `https://tahns.github.io/hemicycle-france/instagram/auto/${e.id}.jpg`) err(`${nom} : url_image doit être en https et pointer sur instagram/auto/${e.id}.jpg`);
    const jour = new Date(t + 2 * 36e5).toISOString().slice(0, 10); // jour en UTC+2
    // Vidéo (facultative sur une story, obligatoire sur un Reel) : instagram/auto/<id>.mp4, voir scripts/videos-auto.cjs
    if (e.type === "reel" && !e.url_video) err(`${nom} : un Reel exige url_video`);
    if (e.url_video !== undefined && e.url_video !== `https://tahns.github.io/hemicycle-france/instagram/auto/${e.id}.mp4`) err(`${nom} : url_video doit être en https et pointer sur instagram/auto/${e.id}.mp4`);
    if (e.type === "reel") {
      videos[jour] = (videos[jour] || 0) + 1;
      if (!/^[0-9a-f]{12}$/.test(e.reelDe || "")) err(`${nom} : reelDe invalide`);
      else if (!d.entrees.some((p) => p.id === e.reelDe && p.type === "post")) err(`${nom} : reelDe ne désigne aucun post de la file`);
      const l = e.legende;
      if (typeof l !== "string" || l.length < 20 || l.length > 2200 || !l.includes("@hemicyclefrance") || /github\.io|hemicycle-france/i.test(l)) err(`${nom} : légende de Reel absente ou invalide`);
    } else if (e.url_video) videos[jour] = (videos[jour] || 0) + 1;
    if (e.type === "post") {
      posts[jour] = (posts[jour] || 0) + 1;
      const l = e.legende;
      if (typeof l !== "string" || l.length < 20 || l.length > 2200) err(`${nom} : légende de post absente ou hors limites (20 à 2 200 caractères)`);
      else {
        if ((l.match(/#\p{L}[\p{L}\p{N}_]*/gu) || []).length > 30) err(`${nom} : plus de 30 hashtags`);
        if (/github\.io|hemicycle-france/i.test(l)) err(`${nom} : la légende ne doit pas contenir de lien du site`);
        if (!l.includes("@hemicyclefrance")) err(`${nom} : la légende doit citer @hemicyclefrance`);
      }
      if (e.annonceDe) err(`${nom} : un post n'a pas de champ annonceDe`);
    } else if (e.annonceDe) {
      if (!/^[0-9a-f]{12}$/.test(e.annonceDe)) err(`${nom} : annonceDe invalide`);
      else if (!d.entrees.some((p) => p.id === e.annonceDe && p.type === "post")) err(`${nom} : annonceDe ne désigne aucun post de la file`);
    } else if (e.type !== "reel") {
      stories[jour] = (stories[jour] || 0) + 1;
    }
    // Les images de plus de 3 jours sont supprimées par stories-auto.cjs (IMAGE_JOURS) : on n'exige que celles de moins de 2 jours
    if (e.url_video && Date.now() - t < 2 * 24 * 36e5) {
      const fv = `instagram/auto/${e.id}.mp4`;
      if (!existsSync(fv)) err(`${nom} : vidéo absente (${fv})`);
      else {
        const bv = await readFile(fv);
        if (bv.length < 12 || bv.toString("latin1", 4, 8) !== "ftyp") err(`${nom} : ${fv} n'est pas un MP4`);
        if (bv.length > 25 * 1024 * 1024) err(`${nom} : ${fv} dépasse 25 Mo`);
      }
    }
    if (Date.now() - t < 2 * 24 * 36e5) {
      const f = `instagram/auto/${e.id}.jpg`;
      if (!existsSync(f)) err(`${nom} : image absente (${f})`);
      else {
        const buf = await readFile(f);
        if (buf[0] !== 0xff || buf[1] !== 0xd8) err(`${nom} : ${f} n'est pas un JPEG`);
        else {
          const dim = dimensionsJpeg(buf), attendu = e.type === "post" ? [1080, 1350] : [1080, 1920];
          if (!dim || dim.l !== attendu[0] || dim.h !== attendu[1]) err(`${nom} : ${f} doit faire ${attendu[0]}×${attendu[1]} (${dim ? `${dim.l}×${dim.h}` : "dimensions illisibles"})`);
        }
        if (buf.length > 8 * 1024 * 1024) err(`${nom} : ${f} dépasse 8 Mo`);
      }
    }
  }
  for (const [j, n] of Object.entries(stories)) if (n > 4) err(`instagram-file.json : ${n} stories le ${j} (4 au maximum par jour, hors annonces de post)`);
  for (const [j, n] of Object.entries(posts)) if (n > 2) err(`instagram-file.json : ${n} posts le ${j} (2 au maximum par jour)`);
  const config = JSON.parse(await readFile("data/stories-config.json", "utf-8").catch(() => "{}"));
  const maxVideos = Number.isInteger(config.videosMax) ? config.videosMax : 2;
  for (const [j, n] of Object.entries(videos)) if (n > Math.max(maxVideos, 6)) err(`instagram-file.json : ${n} vidéos le ${j} (videosMax : ${maxVideos})`);
  if (d.entrees.length > 30) err("instagram-file.json : plus de 30 entrées");
  // Tous les MP4 hébergés (vidéos de la file et exemples) : vrai MP4 et poids raisonnable
  for (const dossier of ["instagram/auto", "instagram/modeles"]) {
    for (const f of (await readdir(dossier).catch(() => [])).filter((x) => x.endsWith(".mp4"))) {
      const buf = await readFile(`${dossier}/${f}`);
      if (buf.length < 12 || buf.toString("latin1", 4, 8) !== "ftyp") err(`${dossier}/${f} n'est pas un MP4`);
      else if (buf.length > 25 * 1024 * 1024) err(`${dossier}/${f} dépasse 25 Mo`);
      else if (dossier === "instagram/modeles" && buf.length > 2 * 1024 * 1024) err(`${dossier}/${f} : un exemple doit rester sous 2 Mo`);
    }
  }
  console.log(`[check-data] instagram-file.json : ${d.entrees.length} entrée(s) (stories, posts, Reels et annonces).`);
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

/**
 * Agenda (data/meetings.json) : règles communes à toutes les entrées ; pour celles relevées automatiquement
 * (« origine: "auto" », voir scripts/fetch-evenements.js) : type, clé unique, confirme, confiance, compteur d'absences.
 * Deux entrées du même type, du même parti et du même jour sont des doublons. Pure.
 */
export function controlerAgenda(liste) {
  const e = [], cles = new Set(), jours = new Map();
  for (const m of liste) {
    const nom = `meetings.json : « ${String(m.titre || "?").slice(0, 60)} »`;
    if (!m.titre || !m.desc) e.push(`${nom} : titre ou description manquant`);
    if (m.fin && (!/^\d{4}-\d{2}-\d{2}$/.test(m.fin) || m.fin < m.debut)) e.push(`${nom} : date « fin » invalide`);
    if (m.source && !/^https:\/\//.test(m.source.url || "")) e.push(`${nom} : source sans lien https`);
    if (m.origine === undefined) continue; // entrée manuelle : règles communes seulement
    if (m.origine !== "auto") { e.push(`${nom} : « origine » invalide (« auto » ou absent)`); continue; }
    if (!m.source?.url) e.push(`${nom} : source manquante`);
    if (!["congres", "primaire", "election", "examen-loi", "meeting"].includes(m.type)) e.push(`${nom} : « type » invalide`);
    if (!m.cle || cles.has(m.cle)) e.push(`${nom} : « cle » manquante ou en double`);
    cles.add(m.cle);
    const jk = `${m.type}|${m.parti || ""}|${m.debut}`;
    if (jours.has(jk)) e.push(`${nom} : doublon (même type, parti et jour que « ${jours.get(jk)} »)`);
    jours.set(jk, m.titre);
    if (typeof m.confirme !== "boolean") e.push(`${nom} : « confirme » doit être vrai ou faux`);
    if (!["haute", "moyenne", "basse"].includes(m.confiance)) e.push(`${nom} : « confiance » invalide`);
    if (!Number.isInteger(m.absences) || m.absences < 0 || m.absences > 1) e.push(`${nom} : « absences » doit valoir 0 ou 1`);
    if (m.confirme === false && m.verified) e.push(`${nom} : un événement non confirmé ne peut pas être « verified »`);
  }
  return e;
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
  controlerAgenda(meetings.meetings).forEach(err);
  console.log("[check-data] fichiers manuels contrôlés.");
}

/** Présidents de la République (saisie manuelle) : dates cohérentes et sans chevauchement, un seul président en cours, liens https, textes présents dans index.html (traductions). */
async function checkPresidents() {
  const data = JSON.parse(await readFile("data/presidents.json", "utf-8").catch(() => "null"));
  if (!data?.regimes?.length) return err("presidents.json : absent ou sans « regimes »");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.verifieLe || "")) err("presidents.json : « verifieLe » invalide");
  const html = await readFile("index.html", "utf-8");
  const dansPage = (texte) => html.includes(JSON.stringify(texte).slice(1, -1).replace(/\\"/g, '"')) || html.includes(texte);
  const portraits = JSON.parse(await readFile("data/portraits.json", "utf-8").catch(() => "null"))?.portraits || {};
  const ISO = /^(\d{4})(-(\d{2})-(\d{2}))?$/;
  const fin = (d, defaut) => { const m = ISO.exec(d || ""); return m ? (m[2] ? d : `${d}${defaut}`) : null; };
  let precedent = null, enCours = 0, total = 0;
  const noms = new Set();
  for (const r of data.regimes) {
    if (!r.nom || !r.election || !Number.isInteger(r.debut)) err(`presidents.json : régime « ${r.id} » incomplet (nom, election, debut)`);
    if (!r.sources?.length || r.sources.some((s) => !/^https:\/\//.test(s.url || "") || !s.nom)) err(`presidents.json : ${r.nom} : source https manquante`);
    if (!r.presidents?.length) err(`presidents.json : ${r.nom} sans président`);
    for (const p of r.presidents || []) {
      total++;
      if (noms.has(p.nom)) err(`presidents.json : ${p.nom} en double`);
      noms.add(p.nom);
      if (!/^https:\/\/fr\.wikipedia\.org\/wiki\//.test(p.wikipedia || "")) err(`presidents.json : ${p.nom} : lien Wikipédia https manquant`);
      if (!ISO.test(p.debut || "")) { err(`presidents.json : ${p.nom} : début invalide « ${p.debut} »`); continue; }
      if (p.fin === null) enCours++;
      else if (!ISO.test(p.fin || "")) { err(`presidents.json : ${p.nom} : fin invalide « ${p.fin} »`); continue; }
      const d = fin(p.debut, "-01-01"), f = p.fin === null ? null : fin(p.fin, "-12-31");
      if (f && f < d) err(`presidents.json : ${p.nom} : la fin précède le début`);
      // Pas de chevauchement : le début d'un président n'est jamais avant la fin du précédent (l'année seule compte comme bornes larges)
      if (precedent) {
        if (precedent.fin === null) err(`presidents.json : ${precedent.nom} est en cours mais ${p.nom} lui succède`);
        else if (d < fin(precedent.fin, "-01-01")) err(`presidents.json : ${p.nom} commence avant la fin de ${precedent.nom}`);
      }
      precedent = { nom: p.nom, fin: p.fin };
      if (p.fin_type && !dansPage(p.fin_type)) err(`presidents.json : « ${p.fin_type} » (${p.nom}) absent de index.html : il ne serait pas traduit`);
      if (p.note && !dansPage(p.note)) err(`presidents.json : la note de ${p.nom} est absente de index.html : elle ne serait pas traduite`);
      const pt = portraits[p.nom];
      if (pt?.fichier && (!pt.licence || !/^https:\/\//.test(pt.source || ""))) err(`presidents.json : portrait de ${p.nom} sans licence ou source`);
    }
  }
  if (enCours !== 1) err(`presidents.json : ${enCours} président(s) en cours (un seul attendu)`);
  for (const x of data.periodes_sans_president || []) {
    if (!/^https:\/\//.test(x.wikipedia || "") || !x.texte) err(`presidents.json : période ${x.debut} incomplète`);
    else if (!dansPage(x.texte)) err(`presidents.json : le texte de la période ${x.debut}–${x.fin} est absent de index.html`);
  }
  console.log(`[check-data] presidents.json : ${total} présidents, ${data.regimes.length} régimes.`);
}

async function checkFichiersJson() {
  const { readdir } = await import("fs/promises");
  const fichiers = (await readdir("data")).filter((n) => n.endsWith(".json"));
  for (const n of fichiers) controlerFichierJson(`data/${n}`, await readFile(`data/${n}`, "utf-8")).forEach(err);
  console.log(`[check-data] ${fichiers.length} fichiers data/*.json : JSON valide, taille et horodatage plausibles.`);
}

// Résumé hebdomadaire (data/digest/, digest/, digest.xml) et flux d'alertes (feeds/) : structure, sources, plafonds
async function checkDigestEtFlux() {
  const { erreurs: e, resume } = await controlerDepot();
  e.forEach(err);
  console.log(`[check-data] digest et flux : ${resume}.`);
}

await checkFichiersJson();
await checkLois();
await checkIndicateurs();
await checkBudget();
await checkGroupes();
await checkSondages();
await checkWorkflows();
await checkProbabilites();
await checkQuiz();
await checkActualites();
await checkVerifications();
await checkDirect();
await secondaire(checkInstagramFile);
await checkDeputes();
await checkCandidats();
await checkSenat();
await checkActivite();
await checkLobbying();
await checkNavette();
await checkDigestEtFlux();
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
await checkPresidents();
{
  // Droit à l'image : chaque photo de personnalité doit avoir sa licence dans data/portraits.json (bloquant)
  const e = await verifierPortraits();
  e.forEach(err);
  if (!e.length) console.log("[check-data] portraits : toutes les photos ont une licence.");
  // Couverture : des médaillons d'initiales subsistent = avertissement, jamais bloquant (rapport : data/portraits-couverture.json)
  const c = JSON.parse(await readFile("data/portraits-couverture.json", "utf-8").catch(() => "null"));
  if (c) {
    console.log(`[check-data] portraits : ${c.avecPhoto}/${c.personnes} personnes avec photo, ${c.placeholders} médaillon(s) d'initiales.`);
    if (c.manquants?.length) console.warn(`::warning::Portraits : ${c.manquants.length} personne(s) sans photo libre (médaillon d'initiales affiché) : ${c.manquants.slice(0, 15).join(", ")}${c.manquants.length > 15 ? "…" : ""}`);
  }
}
{
  // Vignettes d'institutions : licence, auteur et lien Commons obligatoires (bloquant) ; thème sans photo = avertissement (pictogramme)
  const v = await verifierVignettes();
  v.erreurs.forEach(err);
  v.avertissements.forEach((a) => console.warn(`::warning::${a}`));
  if (!v.erreurs.length) console.log(`[check-data] vignettes : ${v.avec}/${v.total} thèmes avec photo libre créditée.`);
}
await secondaire(checkI18n);
await checkCompte();

/** Comptes (Supabase) : config absente = fonction cachée et CSP stricte ; config présente = URL https …supabase.co, clé publique seulement. */
async function checkCompte() {
  const { presente, config, erreur } = await lireConfigCompte();
  const html = await readFile("index.html", "utf-8");
  const hotes = connectSrc(html);
  if (!hotes) return err("compte : directive connect-src introuvable dans la CSP d'index.html");
  const autres = hotes.filter((h) => h !== "'self'");
  if (presente && !config) return err(`compte : data/compte-config.json invalide (${erreur}). L'URL doit être https://<projet>.supabase.co et la clé la clé publique « anon », jamais la clé secrète.`);
  for (const h of autres) if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(h)) err(`compte : la CSP autorise « ${h} » : seule l'URL https://<projet>.supabase.co de la configuration est admise`);
  if (!config) {
    if (autres.length) err("compte : pas de configuration mais la CSP autorise encore une adresse : lancer node scripts/appliquer-compte.js");
    console.log("[check-data] compte : comptes inactifs (pas de data/compte-config.json), CSP stricte.");
    return;
  }
  if (autres.length !== 1 || autres[0] !== config.url) console.warn("[check-data] compte : la CSP d'index.html ne correspond pas à la configuration : lancer node scripts/appliquer-compte.js (le site garde les comptes cachés tant que ce n'est pas fait).");
  console.log(`[check-data] compte : comptes actifs (${config.url}), ${config.fournisseurs.length} fournisseur(s).`);
}

/** Langues du site : fr.json (généré depuis index.html) et un dictionnaire par langue dans data/i18n/. */
async function checkI18n() {
  const lire = async (f) => JSON.parse(await readFile(f, "utf-8"));
  let fr;
  try { fr = await lire("data/i18n/fr.json"); } catch (e) { return err("i18n : data/i18n/fr.json absent ou invalide (node scripts/extraire-i18n.js)"); }
  // fr.json se régénère depuis index.html : s'il est périmé, les nouvelles chaînes restent en français (avertissement)
  const html = await readFile("index.html", "utf-8");
  const frActuel = extraire(html);
  const perimees = [...frActuel].filter(([k, v]) => fr[k] !== v).length + Object.keys(fr).filter((k) => !frActuel.has(k)).length;
  if (perimees) console.warn(`[check-data] i18n : fr.json n'est plus à jour (${perimees} différence(s)) : lancer node scripts/extraire-i18n.js`);
  // Langues déclarées dans la page = fichiers présents (sauf fr), avec leur drapeau
  const declarees = [...html.matchAll(/\{\s*code:"([a-z]{2,3})"[^}]*?\}/g)].map((m) => ({ code: m[1], icone: (/icone:"([\w-]+)"/.exec(m[0]) || [])[1] }));
  const fichiers = await listerLangues();
  for (const d of declarees) {
    if (d.code !== "fr" && !fichiers.includes(d.code)) err(`i18n : langue « ${d.code} » déclarée dans index.html sans data/i18n/${d.code}.json`);
    if (d.icone && !existsSync(`icons/drapeaux/${d.icone}.svg`)) err(`i18n : drapeau icons/drapeaux/${d.icone}.svg absent`);
  }
  for (const f of fichiers) if (!declarees.some((d) => d.code === f)) err(`i18n : data/i18n/${f}.json n'est pas déclarée dans la liste LANGUES d'index.html`);
  const resume = [];
  for (const code of fichiers) {
    let dico;
    try { dico = await lire(`data/i18n/${code}.json`); } catch (e) { err(`i18n : ${code}.json n'est pas un JSON valide (${e.message})`); continue; }
    const { erreurs: e, avertissements: a, traduites } = controlerDico(code, fr, dico);
    e.forEach(err);
    a.slice(0, 3).forEach((m) => console.warn("[check-data] " + m));
    if (a.length > 3) console.warn(`[check-data] i18n : ${a.length - 3} autre(s) marque(s) omise(s) pour ${code}.json`);
    resume.push(`${code} ${traduites}`);
    // Tables de données (postes du budget, groupes, fonctions, quiz… : clé = texte français exact) ; absence = retour au français
    if (!existsSync(`data/i18n/donnees/${code}.json`)) { console.warn(`[check-data] i18n : data/i18n/donnees/${code}.json absent (libellés de données non traduits)`); continue; }
    try { controlerDonnees(code, await lire(`data/i18n/donnees/${code}.json`)).forEach(err); }
    catch (e) { err(`i18n : donnees/${code}.json n'est pas un JSON valide (${e.message})`); }
  }
  console.log(`[check-data] i18n : ${Object.keys(fr).length} chaînes françaises ; traduites : ${resume.join(", ")}.`);
}

if (secondaires.length) {
  const texte = secondaires.slice(0, 20).map((e) => "- " + e).join("\n");
  console.warn(`[check-data] ${secondaires.length} anomalie(s) secondaire(s)${STRICT ? " (bloquantes avec --strict)" : " : la mise à jour n'est pas bloquée"} :\n${texte}`);
  console.warn(`::warning::check-data : ${secondaires.length} anomalie(s) secondaire(s), voir le résumé`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    try { appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n**Contrôle des données : anomalie(s) secondaire(s) (publication des données utiles maintenue)**\n\n${texte}\n`); } catch {}
  }
  if (STRICT) erreurs.push(...secondaires);
}
if (erreurs.length) {
  console.error(`[check-data] ${erreurs.length} erreur(s) :`);
  for (const e of erreurs.slice(0, 50)) console.error("  - " + e);
  process.exit(1);
}
console.log("[check-data] OK");
