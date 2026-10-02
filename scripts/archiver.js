#!/usr/bin/env node
/**
 * archiver.js
 * -----------
 * Conserve un instantané daté, une fois par semaine, de data/sondages.json, data/probabilites.json
 * et data/actualites.json dans data/archives/AAAA-MM-JJ/, et tient à jour data/archives/index.json
 * (résumé de chaque instantané, lu par la rubrique « Archives » du site).
 * Les 52 dernières semaines sont gardées, les plus anciennes sont supprimées.
 *
 * USAGE : node scripts/archiver.js [AAAA-MM-JJ]   (la date par défaut est celle du jour, en UTC)
 */

import { readFile, writeFile, mkdir, readdir, rm, copyFile } from "fs/promises";
import { existsSync } from "fs";
import { pathToFileURL } from "url";

export const MAX_SEMAINES = 52;
export const FICHIERS = ["sondages.json", "probabilites.json", "actualites.json"];
const DOSSIER = "data/archives";

/** Numéro de semaine ISO « AAAA-Sss » d'une date AAAA-MM-JJ. */
export function semaineISO(iso) {
  const d = new Date(iso + "T00:00:00Z");
  const jour = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - jour);
  const debut = Date.UTC(d.getUTCFullYear(), 0, 1);
  return `${d.getUTCFullYear()}-S${String(Math.ceil(((d - debut) / 864e5 + 1) / 7)).padStart(2, "0")}`;
}

/** Résumé d'un instantané : de quoi tracer l'évolution sans recharger les fichiers complets. */
export function resume(date, sondages, probas, actus) {
  const candidats = (probas?.candidats || []).slice(0, 6).map((c) => ({
    nom: c.nom, parti: c.parti, intention: c.intention, secondTour: c.secondTour, victoire: c.victoire,
  }));
  return {
    date,
    semaine: semaineISO(date),
    instituts: sondages?.instituts?.length ?? 0,
    sujets: actus?.sujets?.length ?? 0,
    candidats,
  };
}

const lire = async (f) => (existsSync(f) ? JSON.parse(await readFile(f, "utf-8")) : null);

export async function archiver(date = new Date().toISOString().slice(0, 10)) {
  await mkdir(DOSSIER, { recursive: true });
  const existants = (await readdir(DOSSIER, { withFileTypes: true }))
    .filter((e) => e.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(e.name)).map((e) => e.name).sort();

  const semaine = semaineISO(date);
  if (existants.some((d) => semaineISO(d) === semaine)) {
    console.log(`[archiver] semaine ${semaine} déjà archivée : rien à faire.`);
  } else {
    const manquants = FICHIERS.filter((f) => !existsSync(`data/${f}`));
    if (manquants.length) throw new Error(`fichiers sources absents : ${manquants.join(", ")}`);
    await mkdir(`${DOSSIER}/${date}`, { recursive: true });
    for (const f of FICHIERS) await copyFile(`data/${f}`, `${DOSSIER}/${date}/${f}`);
    existants.push(date);
    existants.sort();
    console.log(`[archiver] instantané du ${date} (semaine ${semaine}) enregistré.`);
  }

  // Conserve les 52 dernières semaines
  for (const d of existants.splice(0, Math.max(0, existants.length - MAX_SEMAINES))) {
    await rm(`${DOSSIER}/${d}`, { recursive: true, force: true });
    console.log(`[archiver] instantané du ${d} supprimé (plus de ${MAX_SEMAINES} semaines).`);
  }

  const instantanes = [];
  for (const d of existants) {
      const [s, p, a] = await Promise.all(FICHIERS.map((f) => lire(`${DOSSIER}/${d}/${f}`)));
      instantanes.push(resume(d, s, p, a));
  }
  await writeFile(`${DOSSIER}/index.json`, JSON.stringify({ lastUpdated: instantanes.at(-1)?.date ?? null, max: MAX_SEMAINES, instantanes }, null, 1) + "\n");
  console.log(`[archiver] ${instantanes.length} instantané(s) dans l'index.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  archiver(process.argv[2]).catch((e) => { console.error("[archiver] " + e.message); process.exit(1); });
}
