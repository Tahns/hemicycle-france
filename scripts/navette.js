#!/usr/bin/env node
/**
 * navette.js
 * ----------
 * Relie les votes des deux chambres sur un même texte : pour chaque dossier législatif de
 * l'Assemblée qui a un dossier au Sénat (data/dossiers-senat.json, écrit par fetch-scrutins.js),
 * liste les votes du Sénat sur l'ensemble du texte (data/senat.json). Résultat : data/navette.json,
 * petit fichier lu par le site pour afficher « Au Sénat » sous un vote de l'Assemblée.
 *
 * USAGE : node scripts/navette.js
 */
import { readFile, writeFile } from "fs/promises";

const log = (...m) => console.log("[navette]", ...m);
const versSenat = JSON.parse(await readFile("data/dossiers-senat.json", "utf-8").catch(() => "{}"));
const senat = JSON.parse(await readFile("data/senat.json", "utf-8").catch(() => '{"scrutins":[]}')).scrutins || [];

// Votes du Sénat sur l'ensemble d'un texte, par chemin de dossier (/dossier-legislatif/….html)
const ensemble = (s) => /^sur l.ensemble|^sur le texte élaboré/i.test(s.titre.replace(/’/g, "'"));
const parDossier = {};
for (const s of senat) {
  const chemin = s.dossierUrl?.match(/\/dossier-legislatif\/[^/?#]+\.html/)?.[0];
  if (!chemin || !ensemble(s)) continue;
  (parDossier[chemin] ||= []).push({ date: s.date, dateISO: s.dateISO, resultat: s.resultat, pour: s.pour, contre: s.contre, url: s.sourceUrl });
}

// Seulement les dossiers dont un vote figure sur le site (fichier plus léger)
const refsSite = new Set((JSON.parse(await readFile("data/lois.json", "utf-8")).lois || []).map((l) => l.dossierRef).filter(Boolean));
const navette = {};
for (const [ref, chemin] of Object.entries(versSenat)) {
  if (!refsSite.has(ref)) continue;
  const votes = parDossier[chemin];
  if (votes) navette[ref] = { dossier: "https://www.senat.fr" + chemin, votes: votes.sort((a, b) => a.dateISO.localeCompare(b.dateISO)) };
}
log(`${Object.keys(navette).length} texte(s) avec un vote du Sénat sur l'ensemble.`);
await writeFile("data/navette.json", JSON.stringify({ lastUpdated: new Date().toISOString(), textes: navette }) + "\n");
