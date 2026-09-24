#!/usr/bin/env node
/**
 * fetch-agenda-an.js
 * ------------------
 * Ordre du jour des prochaines séances publiques de l'Assemblée nationale (textes discutés,
 * votes solennels, questions au Gouvernement), d'après l'agenda publié en open data par
 * l'Assemblée (Licence Ouverte). Affiché en tête de la rubrique Agenda.
 *
 * Résultat : data/agenda-an.json
 *   { lastUpdated, source, jours: [{ date: "2026-10-01", points: [{ type, objet, dossier? }] }] }
 * Seuls les jours de séance des 21 prochains jours sont gardés ; dans une journée, un même
 * texte n'apparaît qu'une fois (« Suite de la discussion » d'une séance à l'autre).
 *
 * GARDE-FOU : au moins 100 séances publiques dans l'archive, sinon le fichier n'est pas modifié
 * (un agenda vide pendant les vacances parlementaires est normal et est bien écrit).
 *
 * Le même agenda donne la feuille de présence des réunions de commission : pour chaque député,
 * présences, absences et absences excusées aux réunions des 8 commissions permanentes depuis le
 * début de la législature -> data/commissions.json (au moins 400 députés, sinon non modifié).
 *
 * USAGE : node scripts/fetch-agenda-an.js [--dossier=/chemin/archive-extraite]
 */
import { readFile, writeFile, readdir, mkdtemp } from "fs/promises";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import os from "os";
import path from "path";

const execFileAsync = promisify(execFile);
const DATA_FILE = path.resolve("data/agenda-an.json");
const AGENDA_ZIP = "https://data.assemblee-nationale.fr/static/openData/repository/17/vp/reunions/Agenda.json.zip";
const SEANCE_PUBLIQUE = "PO838901"; // organe « Séance publique » de la 17e législature
const JOURS = 21;
const COMMISSIONS_FILE = path.resolve("data/commissions.json");
// Les 8 commissions permanentes (identifiants stables d'une législature à l'autre)
const COMMISSIONS = { PO419604: "Affaires culturelles et éducation", PO419610: "Affaires économiques", PO419865: "Développement durable", PO420120: "Affaires sociales", PO59046: "Défense", PO59047: "Affaires étrangères", PO59048: "Finances", PO59051: "Lois" };
const DOSSIER = process.argv.find((a) => a.startsWith("--dossier="))?.split("=")[1];
const log = (...m) => console.log("[fetch-agenda-an]", ...m);
const liste = (x) => (Array.isArray(x) ? x : x ? [x] : []);

async function* fichiersJson(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* fichiersJson(p);
    else if (e.name.endsWith(".json")) yield p;
  }
}

/** « Suite de la discussion du projet de loi de finances » -> « Projet de loi de finances ». */
export function objetCourt(objet) {
  const t = objet.replace(/^Sous réserve de (?:son|leur) dépôt,? /i, "").replace(/^(?:Suite de la )?discussion,? (?:en \S+ lecture,? )?(?:de la |du |de l[’'] ?|des )/i, "").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function construireAgenda(reunions, depuis, jusqua) {
  const parJour = new Map();
  for (const r of reunions.sort((a, b) => a.timeStampDebut.localeCompare(b.timeStampDebut))) {
    const date = r.timeStampDebut.slice(0, 10);
    if (date < depuis || date > jusqua || r.organeReuniRef !== SEANCE_PUBLIQUE || /annul|report/i.test(r.cycleDeVie?.etat || "")) continue;
    const jour = parJour.get(date) || parJour.set(date, []).get(date);
    for (const p of liste(r.ODJ?.pointsODJ?.pointODJ)) {
      if (!p?.objet) continue;
      const type = /vote solennel/i.test(p.typePointODJ || p.objet) ? "vote"
        : /questions au gouvernement/i.test(p.objet) ? "qag"
        : /discussion|lecture|examen/i.test(p.typePointODJ || "") ? "texte" : "autre";
      const objet = type === "vote" ? objetCourt(p.objet.replace(/^Vote solennel sur (?:la |le |l[’'] ?)?/i, "")) : type === "texte" ? objetCourt(p.objet) : p.objet.trim();
      if (jour.some((x) => x.objet.toLowerCase() === objet.toLowerCase() && (x.type === type || type === "texte"))) continue;
      const dossier = liste(p.dossiersLegislatifsRefs?.dossierRef)[0];
      jour.push({ type, objet, ...(typeof dossier === "string" ? { dossier } : {}) });
    }
  }
  return [...parJour].filter(([, points]) => points.length).map(([date, points]) => ({ date, points }));
}

async function main() {
  let dir = DOSSIER;
  if (!dir) {
    dir = await mkdtemp(path.join(os.tmpdir(), "an-agenda-"));
    const res = await fetch(AGENDA_ZIP);
    if (!res.ok) throw new Error(`HTTP ${res.status} sur ${AGENDA_ZIP}`);
    await pipeline(res.body, createWriteStream(path.join(dir, "agenda.zip")));
    await execFileAsync("unzip", ["-q", "-o", path.join(dir, "agenda.zip"), "-d", dir], { maxBuffer: 1 << 26 });
  }
  const reunions = [];
  const presences = {}; // PA… -> [présent, absent, excusé]
  let reunionsCommission = 0;
  for await (const f of fichiersJson(dir)) {
    // IDS = séance publique, IDC = réunion de commission
    if (/IDC\d+\.json$/.test(f)) {
      try {
        const r = JSON.parse(await readFile(f, "utf-8")).reunion;
        const ps = liste(r?.participants?.participantsInternes?.participantInterne);
        if (!COMMISSIONS[r?.organeReuniRef] || !ps.length || /annul/i.test(r.cycleDeVie?.etat || "")) continue;
        reunionsCommission++;
        for (const p of ps) {
          const k = { "présent": 0, absent: 1, "excusé": 2 }[p.presence];
          if (k === undefined || !/^PA\d+$/.test(p.acteurRef || "")) continue;
          (presences[p.acteurRef] ||= [0, 0, 0])[k]++;
        }
      } catch {}
      continue;
    }
    if (!/IDS\d+\.json$/.test(f)) continue;
    try { const r = JSON.parse(await readFile(f, "utf-8")).reunion; if (r?.timeStampDebut) reunions.push(r); } catch {}
  }
  if (Object.keys(presences).length >= 400) {
    await writeFile(COMMISSIONS_FILE, JSON.stringify({
      lastUpdated: new Date().toISOString(),
      source: "Assemblée nationale — feuilles de présence des réunions des commissions permanentes (agenda open data)",
      reunions: reunionsCommission,
      deputes: presences,
    }) + "\n");
    log(`Présence en commission : ${reunionsCommission} réunions, ${Object.keys(presences).length} députés.`);
  } else console.warn(`[fetch-agenda-an][ATTENTION] Présence en commission : seulement ${Object.keys(presences).length} député(s), data/commissions.json n'est pas modifié.`);
  if (reunions.length < 100) {
    console.warn(`[fetch-agenda-an][ATTENTION] Seulement ${reunions.length} séance(s) lue(s) : data/agenda-an.json n'est pas modifié.`);
    process.exitCode = 1;
    return;
  }
  // Dates en heure de Paris
  const jourParis = (d) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(d);
  const depuis = jourParis(new Date()), jusqua = jourParis(new Date(Date.now() + JOURS * 864e5));
  const jours = construireAgenda(reunions, depuis, jusqua);
  await writeFile(DATA_FILE, JSON.stringify({
    lastUpdated: new Date().toISOString(),
    source: "Assemblée nationale — agenda des séances publiques (open data, Licence Ouverte)",
    sourceUrl: "https://www2.assemblee-nationale.fr/agendas/les-agendas",
    jours,
  }, null, 1) + "\n");
  log(`${reunions.length} séances lues ; ${jours.length} jour(s) de séance d'ici au ${jusqua}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error("[fetch-agenda-an] ÉCHEC :", e.message); process.exitCode = 1; });
}
