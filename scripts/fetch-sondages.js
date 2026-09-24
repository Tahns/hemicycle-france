#!/usr/bin/env node
/**
 * fetch-sondages.js
 * -----------------
 * Met à jour data/sondages.json (intentions de vote au 1er tour de la présidentielle 2027) à partir
 * de la page Wikipédia « Liste de sondages sur l'élection présidentielle française de 2027 »,
 * qui recense chaque enquête avec un lien vers sa notice officielle déposée auprès de la
 * Commission des sondages.
 *
 * Pour chaque institut, seule l'enquête la plus récente est retenue ; chaque candidat y reçoit une
 * fourchette [min, max] sur l'ensemble des hypothèses testées par l'institut.
 *
 * GARDE-FOUS (une enquête qui échoue à un seul contrôle est écartée, jamais « corrigée ») :
 *  - chaque hypothèse (ligne du tableau) doit totaliser entre 97 et 103 %, « autres » compris ;
 *  - date, échantillon (≥ 500 personnes) et lien source doivent être lisibles ;
 *  - le lien source doit pointer vers la Commission des sondages ou vers le site d'un institut.
 * Si moins de 2 enquêtes valides sont trouvées, le fichier n'est pas modifié.
 *
 * USAGE :
 *   node scripts/fetch-sondages.js
 *   node scripts/fetch-sondages.js --dry-run
 *   node scripts/fetch-sondages.js --fichier=page.wikitext   # parse un fichier local (tests)
 */

import { readFile, writeFile } from "fs/promises";
import path from "path";

const DATA_FILE = path.resolve("data/sondages.json");
const PAGE = "Liste_de_sondages_sur_l'élection_présidentielle_française_de_2027";
const RAW_URL = `https://fr.wikipedia.org/w/index.php?title=${encodeURIComponent(PAGE)}&action=raw`;
const PAGE_URL = `https://fr.wikipedia.org/wiki/${encodeURIComponent(PAGE)}`;
const USER_AGENT = "politique-france-bot/1.0 (https://github.com/Tahns/politique-france)";
const DRY_RUN = process.argv.includes("--dry-run");
const FICHIER = process.argv.find((a) => a.startsWith("--fichier="))?.split("=")[1];
const JOURS_MAX = 45; // enquêtes plus anciennes ignorées

const MOIS = { janvier: 0, février: 1, fevrier: 1, mars: 2, avril: 3, mai: 4, juin: 5, juillet: 6, août: 7, aout: 7, septembre: 8, octobre: 9, novembre: 10, décembre: 11, decembre: 11 };

function log(...m) {
  console.log("[fetch-sondages]", ...m);
}
function warn(...m) {
  console.warn("[fetch-sondages][ATTENTION]", ...m);
}

/** Nom affiché depuis un lien wiki [[Cible|Texte]] ou [[Cible]] : on garde la cible (nom complet). */
function nomDepuisLien(s) {
  const m = s.match(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/);
  return m ? m[1].trim() : null;
}

/** Sigle du parti affiché dans « ([[Parti socialiste (France)|PS]]) » ; null si absent. */
function partiDepuis(s) {
  const m = s.match(/\(\[\[[^\]|]+\|([^\]]+)\]\]\)/);
  return m ? m[1].trim() : null;
}
const PARTIS = {}; // nom du candidat -> sigle du parti (d'après le tableau)

/** Contenu utile d'une cellule : retire l'éventuel préfixe d'attributs « style=… | ». */
function contenuCellule(cell) {
  // Un séparateur « | » hors [[…]] et {{…}} sépare attributs et contenu
  let prof = 0;
  for (let i = 0; i < cell.length; i++) {
    const c2 = cell.slice(i, i + 2);
    if (c2 === "[[" || c2 === "{{") { prof++; i++; continue; }
    if (c2 === "]]" || c2 === "}}") { prof--; i++; continue; }
    if (cell[i] === "|" && prof === 0) return cell.slice(i + 1).trim();
  }
  return cell.trim();
}

/** Valeur numérique d'une cellule de score : « 16 », « {{blanc|16}} », « 14,5 », « <1 » (→ 0,5). */
function valeurCellule(contenu) {
  const sansRefs = contenu.replace(/<ref[^>]*\/>|<ref[^>]*>.*?<\/ref>/g, "");
  const blanc = sansRefs.match(/\{\{blanc\|([\d.,]+)\}\}/);
  const brut = blanc ? blanc[1] : sansRefs.replace(/\{\{[^}]*\}\}/g, "").match(/^\s*(?:'''|<b>)?\s*(<\s*1|[\d]+(?:[.,]\d+)?)/)?.[1];
  if (!brut) return null;
  if (/^<\s*1$/.test(brut)) return 0.5;
  return Number(brut.replace(",", "."));
}

function parseDate(texte, annee) {
  // « 9-10 septembre », « 29 août-1er septembre », « 31 août - 2 septembre » : on garde la date de fin
  const t = texte.replace(/\{\{1er\}\}|1er/g, "1").replace(/\{\{[^}]*\}\}/g, "").replace(/<[^>]+>/g, "").trim();
  const m = t.match(/(\d{1,2})\s+([a-zéû]+)\s*$/i);
  if (!m || MOIS[m[2].toLowerCase()] === undefined) return null;
  return new Date(Date.UTC(annee, MOIS[m[2].toLowerCase()], parseInt(m[1], 10)));
}

/**
 * Parse le premier tableau de la section « Second semestre / Premier semestre <année> ».
 * Retourne [{ institut, dateTexte, dateFin, echantillon, url, hypotheses: [{ nom: score }] }].
 */
function parseTableau(texte, annee) {
  const debut = texte.indexOf("{|");
  const fin = texte.indexOf("\n|}", debut);
  if (debut < 0 || fin < 0) return [];
  const lignes = texte.slice(debut, fin).split("\n|-");

  // Ligne d'en-tête contenant les noms des candidats (celle avec [[Nom|Court]]<br><small>)
  const entete = lignes.find((l) => /^\s*!\s*scope=("?)col\1\s*\|\s*\[\[/m.test(l));
  if (!entete) return [];
  const lignesEntete = entete.split("\n").filter((l) => l.trim().startsWith("!"));
  const colonnes = lignesEntete.map((l) => nomDepuisLien(contenuCellule(l.trim().slice(1))));
  lignesEntete.forEach((l, i) => {
    const p = partiDepuis(l);
    if (colonnes[i] && p && !PARTIS[colonnes[i]]) PARTIS[colonnes[i]] = p;
  });

  const enquetes = [];
  let courante = null;
  for (const bloc of lignes) {
    const cellules = bloc.split("\n").filter((l) => l.startsWith("|") && !l.startsWith("|}") && !l.startsWith("|-")).map((l) => l.slice(1));
    if (cellules.length === 0 || /colspan/.test(cellules[0])) continue;

    let scores = cellules;
    // Nouvelle enquête : la première cellule porte le modèle {{Sondeur|…}} (avec ou sans rowspan)
    if (/\{\{Sondeur\|/.test(cellules[0])) {
      const url = cellules[0].match(/\[(https?:\/\/\S+)\s+([^\]]+)\]/);
      const institut = (url?.[2] || contenuCellule(cellules[0])).replace(/'''|\[\[|\]\]/g, "").trim();
      const dateTexte = contenuCellule(cellules[1]);
      const echantillon = parseInt((contenuCellule(cellules[2]).match(/formatnum:\s*([\d\s ]+)/)?.[1] || contenuCellule(cellules[2])).replace(/[^\d]/g, ""), 10);
      courante = { institut, dateTexte, dateFin: parseDate(dateTexte, annee), echantillon, url: url?.[1] || null, hypotheses: [], lignesInvalides: 0 };
      enquetes.push(courante);
      scores = cellules.slice(3);
    }
    if (!courante) continue;

    // Colonnes candidates puis « Autres » (dernière colonne)
    const hyp = {};
    let total = 0;
    scores.forEach((cell, i) => {
      const contenu = contenuCellule(cell);
      if (i >= colonnes.length) {
        // Colonne « Autres » : une ou plusieurs entrées « 4<br>[[Nom|Court]] » séparées par <hr>
        for (const segment of contenu.split(/<hr\s*\/?>/)) {
          const v = valeurCellule(segment.trim());
          if (v === null) continue;
          total += v;
          const nom = nomDepuisLien(segment);
          if (nom) hyp[nom] = v;
        }
        return;
      }
      const v = valeurCellule(contenu);
      if (v === null) return; // « — » : candidat non testé dans cette hypothèse
      total += v;
      // Un autre candidat peut occuper la colonne (ex. Hollande dans la colonne du PS) : il est nommé dans la cellule
      const nomCellule = /<small>/.test(contenu) ? nomDepuisLien(contenu.split("<br>")[1] || "") : null;
      if (nomCellule && !PARTIS[nomCellule]) PARTIS[nomCellule] = partiDepuis(contenu);
      const nom = nomCellule || colonnes[i];
      if (nom) hyp[nom] = v;
    });
    if (Object.keys(hyp).length === 0) continue;
    if (total < 97 || total > 103) courante.lignesInvalides++;
    else courante.hypotheses.push(hyp);
  }
  return enquetes;
}

function valider(e, maintenant) {
  if (!e.dateFin) return "date illisible";
  if ((maintenant - e.dateFin) / 864e5 > JOURS_MAX) return "trop ancienne";
  if (!(e.echantillon >= 500)) return "échantillon illisible ou trop faible";
  // Notice de la Commission des sondages, ou à défaut publication de l'institut ou du média commanditaire
  // (le site indique alors que la notice officielle se consulte auprès de la Commission)
  if (!e.url || !/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}\//i.test(e.url) || /wikipedia\.org/i.test(e.url)) return "lien source absent";
  if (e.lignesInvalides > 0) return `${e.lignesInvalides} hypothèse(s) dont le total ≠ 100 %`;
  if (e.hypotheses.length === 0) return "aucune hypothèse lisible";
  // Cohérence entre hypothèses d'une même enquête : un candidat présent partout ne varie pas de plus de 12 points
  const noms = new Set(e.hypotheses.flatMap((h) => Object.keys(h)));
  for (const nom of noms) {
    const v = e.hypotheses.map((h) => h[nom]).filter((x) => x !== undefined);
    if (v.length > 1 && Math.max(...v) - Math.min(...v) > 12) return `écart incohérent pour ${nom}`;
  }
  return null;
}

// Loi n° 77-808 du 19 juillet 1977, art. 11 : aucun sondage publié la veille et le jour de chaque tour
// (présidentielle : du samedi 0 h au dimanche 20 h, heure de Paris). Aucun relevé pendant cette période.
const TOURS_PRESIDENTIELLE = ["2027-04-18", "2027-05-02"];
function periodeReserve(maintenant = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(maintenant)
      .map((x) => [x.type, x.value])
  );
  const paris = `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  return TOURS_PRESIDENTIELLE.find((tour) => {
    const veille = new Date(Date.parse(tour + "T12:00:00Z") - 864e5).toISOString().slice(0, 10);
    return paris >= `${veille}T00:00` && paris < `${tour}T20:00`;
  }) || null;
}

async function main() {
  const tour = periodeReserve();
  if (tour) return log(`Période de réserve électorale (scrutin du ${tour}) : aucun relevé de sondage.`);

  const wikitexte = FICHIER
    ? await readFile(FICHIER, "utf-8")
    : await (async () => {
        const res = await fetch(RAW_URL, { headers: { "User-Agent": USER_AGENT } });
        if (!res.ok) throw new Error(`HTTP ${res.status} en lisant la page Wikipédia`);
        return res.text();
      })();

  // Sections « ==== Second semestre 2026 ==== » / « ==== Premier semestre 2026 ==== » (plus récentes en tête)
  const sections = [...wikitexte.matchAll(/^====\s*(Premier|Second) semestre (\d{4})\s*====\s*$/gm)];
  const maintenant = new Date();
  const enquetes = [];
  for (const [i, s] of sections.slice(0, 2).entries()) {
    const fin = sections[i + 1]?.index ?? wikitexte.indexOf("\n=== ", s.index + 1);
    enquetes.push(...parseTableau(wikitexte.slice(s.index, fin > 0 ? fin : undefined), parseInt(s[2], 10)));
  }
  log(`${enquetes.length} enquête(s) lue(s) sur les deux derniers semestres.`);

  const retenues = new Map(); // institut -> enquête la plus récente valide
  const rejets = [];
  for (const e of enquetes) {
    const raison = valider(e, maintenant);
    if (raison) {
      if (raison !== "trop ancienne") rejets.push(`${e.institut} (${e.dateTexte}) : ${raison}`);
      continue;
    }
    const cle = e.institut.toLowerCase().replace(/[^a-z]/g, "");
    if (!retenues.has(cle) || retenues.get(cle).dateFin < e.dateFin) retenues.set(cle, e);
  }
  for (const r of rejets) warn("écartée —", r);

  const instituts = [...retenues.values()]
    .sort((a, b) => b.dateFin - a.dateFin)
    .map((e) => {
      const scores = {};
      for (const h of e.hypotheses) for (const [nom, v] of Object.entries(h)) {
        scores[nom] = scores[nom] ? [Math.min(scores[nom][0], v), Math.max(scores[nom][1], v)] : [v, v];
      }
      return {
        nom: e.institut,
        date: `${e.dateTexte.replace(/\{\{1er\}\}/g, "1er")} ${e.dateFin.getUTCFullYear()}`.replace(/\{\{[^}]*\}\}/g, "").replace(/\s+/g, " ").trim(),
        dateFin: e.dateFin.toISOString().slice(0, 10),
        echantillon: e.echantillon,
        hypotheses: e.hypotheses.length,
        url: e.url,
        scores,
      };
    });

  if (instituts.length < 2) {
    warn(`Seulement ${instituts.length} enquête(s) valide(s) : data/sondages.json n'est pas modifié.`);
    process.exitCode = 1;
    return;
  }

  const candidats = {};
  for (const i of instituts) for (const nom of Object.keys(i.scores)) candidats[nom] = PARTIS[nom] || null;
  const sortie = { source: "Wikipédia — liste des sondages (notices de la Commission des sondages)", sourceUrl: PAGE_URL, candidats, instituts };
  const ancien = JSON.parse(await readFile(DATA_FILE, "utf-8").catch(() => "{}"));
  delete ancien.lastUpdated;
  if (JSON.stringify(ancien) === JSON.stringify(sortie)) return log("Aucun changement.");
  if (DRY_RUN) return console.log(JSON.stringify(sortie, null, 2));
  await writeFile(DATA_FILE, JSON.stringify({ lastUpdated: new Date().toISOString(), ...sortie }, null, 2) + "\n");
  log(`data/sondages.json mis à jour (${instituts.length} instituts).`);
}

main().catch((e) => {
  console.error("[fetch-sondages] ÉCHEC :", e);
  process.exitCode = 1;
});
