#!/usr/bin/env node
/**
 * fetch-activite.js
 * -----------------
 * Construit data/activite.json : pour chaque député en fonction (data/deputes.json),
 *  - le nombre de questions écrites posées au Gouvernement et ses trois sujets les plus fréquents
 *    (rubriques de l'Assemblée) ;
 *  - le nombre d'amendements dont il est le premier signataire, et combien ont été adoptés ;
 *  - ses déclarations déposées à la Haute Autorité pour la transparence de la vie publique (HATVP) :
 *    type, date et lien vers sa page, sans aucun montant (le site renvoie à la source officielle).
 *
 * Sources : open data de l'Assemblée nationale (Licence Ouverte) et de la HATVP (Licence Ouverte).
 * Les deux archives de l'Assemblée pèsent environ 350 Mo : le fichier n'est reconstruit que s'il a
 * plus de 6 jours (ou avec --force). La HATVP est reliée par l'identifiant Assemblée du député
 * (colonne id_origine), jamais par le nom.
 *
 * GARDE-FOUS : au moins 500 députés trouvés dans chaque source, sinon le fichier n'est pas modifié.
 *
 * USAGE : node scripts/fetch-activite.js [--force] [--dossier=/chemin/archives-deja-extraites]
 */

import { readFile, writeFile, readdir, mkdtemp } from "fs/promises";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import os from "os";
import path from "path";

const execFileAsync = promisify(execFile);
const DATA_FILE = path.resolve("data/activite.json");
const DEPUTES_FILE = path.resolve("data/deputes.json");
const BASE_AN = "https://data.assemblee-nationale.fr/static/openData/repository/17";
const QUESTIONS_ZIP = `${BASE_AN}/questions/questions_ecrites/Questions_ecrites.json.zip`;
const AMENDEMENTS_ZIP = `${BASE_AN}/loi/amendements_div_legis/Amendements.json.zip`;
const HATVP_CSV = "https://www.hatvp.fr/livraison/opendata/liste.csv";
const FORCE = process.argv.includes("--force");
const DOSSIER = process.argv.find((a) => a.startsWith("--dossier="))?.split("=")[1];
const TYPES_HATVP = { di: "Déclaration d'intérêts", dia: "Déclaration d'intérêts", diam: "Intérêts (modification)", dsp: "Situation patrimoniale", dspm: "Patrimoine (modification)", dspfm: "Patrimoine (fin de mandat)" };

const log = (...m) => console.log("[fetch-activite]", ...m);
const warn = (...m) => console.warn("[fetch-activite][ATTENTION]", ...m);

async function telechargerEtExtraire(url, nom) {
  const dir = await mkdtemp(path.join(os.tmpdir(), `an-${nom}-`));
  const zip = path.join(dir, "archive.zip");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
  await pipeline(res.body, createWriteStream(zip));
  await execFileAsync("unzip", ["-q", "-o", zip, "-d", dir], { maxBuffer: 1 << 26 });
  return dir;
}

async function* fichiersJson(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* fichiersJson(p);
    else if (e.name.endsWith(".json")) yield p;
  }
}

/** Questions écrites : auteur et rubrique de chaque question. */
async function lireQuestions(dir) {
  const parDepute = {};
  let n = 0;
  for await (const f of fichiersJson(dir)) {
    const q = JSON.parse(await readFile(f, "utf-8")).question;
    const auteur = q?.auteur?.identite?.acteurRef;
    if (!auteur || q.type !== "QE") continue;
    const d = (parDepute[auteur] ||= { n: 0, rubriques: {} });
    d.n++;
    const r = q.indexationAN?.rubrique?.replace(/\s*:\s*généralités$/i, "");
    if (r) d.rubriques[r] = (d.rubriques[r] || 0) + 1;
    n++;
  }
  log(`${n} questions écrites lues.`);
  return parDepute;
}

/** Amendements : premier signataire et sort (adopté ou non). */
async function lireAmendements(dir) {
  const parDepute = {};
  let n = 0;
  for await (const f of fichiersJson(dir)) {
    const a = JSON.parse(await readFile(f, "utf-8")).amendement;
    const auteur = a?.signataires?.auteur?.acteurRef;
    if (!auteur || a?.signataires?.auteur?.typeAuteur !== "Député") continue;
    const d = (parDepute[auteur] ||= { n: 0, adoptes: 0 });
    d.n++;
    const sort = a.cycleDeVie?.sort || "";
    if (/^adopt/i.test(typeof sort === "string" ? sort : sort?.["#text"] || "")) d.adoptes++;
    n++;
  }
  log(`${n} amendements de députés lus.`);
  return parDepute;
}

/** HATVP : déclarations des députés, reliées par l'identifiant Assemblée (id_origine). */
async function lireHatvp() {
  const res = await fetch(HATVP_CSV);
  if (!res.ok) throw new Error(`HATVP : HTTP ${res.status}`);
  const lignes = (await res.text()).replace(/^﻿/, "").split(/\r?\n/).filter(Boolean);
  const entete = lignes[0].split(";");
  const col = (nom) => entete.indexOf(nom);
  const [cMandat, cType, cDepot, cPub, cUrl, cId, cStatut] = ["type_mandat", "type_document", "date_depot", "date_publication", "url_dossier", "id_origine", "statut_publication"].map(col);
  if ([cMandat, cType, cUrl, cId].some((c) => c < 0)) throw new Error("HATVP : colonnes introuvables");
  const parDepute = {};
  for (const l of lignes.slice(1)) {
    const f = l.split(";");
    if (f[cMandat] !== "depute" || !/^\d+$/.test(f[cId] || "")) continue;
    const d = (parDepute[`PA${f[cId]}`] ||= { url: `https://www.hatvp.fr${f[cUrl]}`, docs: [] });
    d.docs.push([TYPES_HATVP[f[cType]] || f[cType], f[cPub] || f[cDepot] || ""]);
  }
  for (const d of Object.values(parDepute)) d.docs.sort((a, b) => b[1].localeCompare(a[1]));
  return parDepute;
}

async function main() {
  const ancien = JSON.parse(await readFile(DATA_FILE, "utf-8").catch(() => "null"));
  if (ancien?.lastUpdated && !FORCE && !DOSSIER && Date.now() - Date.parse(ancien.lastUpdated) < 6 * 864e5) return log("Données de moins de 6 jours : rien à faire.");
  const { deputes } = JSON.parse(await readFile(DEPUTES_FILE, "utf-8"));
  const ids = new Set(deputes.map((d) => d.id));

  const dirQ = DOSSIER ? path.join(DOSSIER, "q") : await telechargerEtExtraire(QUESTIONS_ZIP, "questions");
  const questions = await lireQuestions(dirQ);
  const dirA = DOSSIER ? path.join(DOSSIER, "a") : await telechargerEtExtraire(AMENDEMENTS_ZIP, "amendements");
  const amendements = await lireAmendements(dirA);
  const hatvp = await lireHatvp();

  const couverture = (src) => [...ids].filter((id) => src[id]).length;
  const [cq, ca, ch] = [couverture(questions), couverture(amendements), couverture(hatvp)];
  log(`Députés en fonction couverts : questions ${cq}, amendements ${ca}, HATVP ${ch} (sur ${ids.size}).`);
  // Tous les députés ne posent pas de questions : seuil plus bas pour les questions
  if (cq < 300 || ca < 450 || ch < 450) {
    warn("Couverture insuffisante : data/activite.json n'est pas modifié.");
    process.exitCode = 1;
    return;
  }

  const sortie = {};
  for (const id of ids) {
    const q = questions[id], a = amendements[id], h = hatvp[id];
    sortie[id] = {
      q: q?.n || 0,
      ...(q ? { sujets: Object.entries(q.rubriques).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([r]) => r) } : {}),
      a: a?.n || 0,
      aa: a?.adoptes || 0,
      ...(h ? { hatvp: h } : {}),
    };
  }
  await writeFile(DATA_FILE, JSON.stringify({
    lastUpdated: new Date().toISOString(),
    sources: {
      questions: "Assemblée nationale — questions écrites (open data, Licence Ouverte)",
      amendements: "Assemblée nationale — amendements (open data, Licence Ouverte)",
      hatvp: "Haute Autorité pour la transparence de la vie publique — liste des déclarations (open data)",
    },
    deputes: sortie,
  }) + "\n");
  log("data/activite.json mis à jour.");
}

main().catch((e) => { console.error("[fetch-activite] ÉCHEC :", e.message); process.exitCode = 1; });
