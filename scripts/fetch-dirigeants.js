#!/usr/bin/env node
/**
 * fetch-dirigeants.js
 * -------------------
 * Vérifie chaque jour le chef de chaque parti de data/dirigeants.json dans l'infobox de sa page
 * Wikipédia (champ « chef »), qui est la source citée sur le site.
 *  - Même personne : rien ne change, sauf la date de vérification (« verifieLe »).
 *  - Personne différente : le nom est mis à jour, la fonction est remplacée par une formule neutre
 *    (« Dirige … »), et l'entrée est marquée « aVerifier » : check-fraicheur ouvre alors une alerte
 *    pour relire l'intitulé exact de sa fonction.
 *  - Infobox illisible : l'entrée est laissée telle quelle et le script signale l'échec.
 * Les présidences de groupe à l'Assemblée viennent, elles, de l'open data (fetch-scrutins.js).
 *
 * USAGE : node scripts/fetch-dirigeants.js [--dry-run]
 */

import { readFile, writeFile } from "fs/promises";
import path from "path";

const DATA_FILE = path.resolve("data/dirigeants.json");
const USER_AGENT = "politique-france-bot/1.0 (https://github.com/Tahns/politique-france)";
const DRY_RUN = process.argv.includes("--dry-run");
const log = (...m) => console.log("[fetch-dirigeants]", ...m);
const warn = (...m) => console.warn("[fetch-dirigeants][ATTENTION]", ...m);

async function chefWikipedia(urlPage) {
  const titre = decodeURIComponent(urlPage.split("/wiki/")[1] || "");
  if (!titre) throw new Error("adresse Wikipédia illisible");
  const res = await fetch(`https://fr.wikipedia.org/w/index.php?title=${encodeURIComponent(titre)}&action=raw`, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  let texte = await res.text();
  const redirection = texte.match(/^#REDIRECT(?:ION)?\s*\[\[([^\]]+)\]\]/i);
  if (redirection) return chefWikipedia(`https://fr.wikipedia.org/wiki/${encodeURIComponent(redirection[1])}`);
  const champ = texte.match(/^\s*\|\s*chef\s*=\s*(.+)$/m)?.[1];
  const nom = champ?.match(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/)?.[1] || champ?.replace(/<[^>]+>|\{\{[^}]*\}\}/g, "").trim();
  if (!nom) throw new Error("champ « chef » absent de l'infobox");
  return nom.trim();
}

const data = JSON.parse(await readFile(DATA_FILE, "utf-8"));
let changements = 0, echecs = 0;
for (const l of data.dirigeants) {
  if (!l.source?.url?.includes("wikipedia.org") || l.nom.startsWith("—")) continue;
  try {
    const chef = await chefWikipedia(l.source.url);
    if (chef !== l.nom) {
      warn(`${l.parti} : ${l.nom} → ${chef} (fonction à relire)`);
      l.nom = chef;
      l.role = `Dirige le parti (d'après Wikipédia)`;
      l.aVerifier = true;
      changements++;
    }
  } catch (e) {
    echecs++;
    warn(`${l.parti} : ${e.message} — entrée conservée.`);
  }
}
if (!echecs) data.verifieLe = new Date().toISOString().slice(0, 10);
log(`${data.dirigeants.length} partis vérifiés, ${changements} changement(s), ${echecs} échec(s).`);
if (!DRY_RUN) await writeFile(DATA_FILE, JSON.stringify(data, null, 2) + "\n");
if (echecs) process.exitCode = 1;
