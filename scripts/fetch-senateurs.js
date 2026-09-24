#!/usr/bin/env node
/**
 * fetch-senateurs.js
 * ------------------
 * Fiches des sénateurs en fonction : groupe, département, et vote individuel sur l'ensemble de
 * chaque texte (scrutins « sur l'ensemble » de data/senat.json). Affichées dans la rubrique Sénat.
 *
 * Sources :
 *  - liste des sénateurs : open data du Sénat (data.senat.fr, ODSEN_GENERAL.csv) ;
 *  - votes : « Analyse détaillée » des pages officielles senat.fr/scrutin-public/ (le Sénat ne
 *    publie pas les votes nominatifs en open data structuré).
 *
 * Résultat : data/senateurs.json
 *   { cles: [id des scrutins, du plus récent au plus ancien],
 *     senateurs: [{ id: matricule, nom, f, groupe, dep, slug, votes: "pcan." }] }
 *   votes[i] correspond à cles[i] : p pour, c contre, a abstention, n n'a pas pris part, . pas encore sénateur.
 *
 * GARDE-FOUS :
 *  - pour chaque scrutin, le nombre de pour / contre / abstentions relevés nom par nom doit égaler
 *    le total officiel (data/senat.json), sinon le scrutin est écarté (et retenté le lendemain) ;
 *  - au moins 300 sénateurs en fonction dans la liste officielle, sinon rien n'est écrit ;
 *  - un scrutin déjà relevé n'est pas relu ; pause de 300 ms entre deux pages.
 *
 * USAGE : node scripts/fetch-senateurs.js [--max=200] [--csv=/chemin/ODSEN_GENERAL.csv]
 */
import { readFile, writeFile } from "fs/promises";
import path from "path";

const DATA_FILE = path.resolve("data/senateurs.json");
const SENAT_FILE = path.resolve("data/senat.json");
const LISTE_CSV = "https://data.senat.fr/data/senateurs/ODSEN_GENERAL.csv";
const USER_AGENT = "hemicycle-france-bot/1.0 (https://github.com/Tahns/hemicycle-france)";
const MAX = parseInt(process.argv.find((a) => a.startsWith("--max="))?.split("=")[1] || "200", 10);
const CSV_LOCAL = process.argv.find((a) => a.startsWith("--csv="))?.split("=")[1];
// Libellé du groupe dans la liste officielle -> sigle utilisé dans data/senat.json
const GROUPES = { "Les Républicains": "LR", "Les Indépendants": "LIRT" };

const log = (...m) => console.log("[fetch-senateurs]", ...m);
const warn = (...m) => console.warn("[fetch-senateurs][ATTENTION]", ...m);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** CSV simple avec champs entre guillemets. */
export function lireCsv(texte) {
  const lignes = [];
  for (const l of texte.split(/\r?\n/)) {
    if (!l.trim() || l.startsWith("%")) continue;
    const champs = [];
    let cur = "", guil = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (guil) { if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') guil = false; else cur += c; }
      else if (c === '"') guil = true;
      else if (c === ",") { champs.push(cur); cur = ""; }
      else cur += c;
    }
    champs.push(cur);
    lignes.push(champs);
  }
  return lignes;
}

/** Votes nominatifs d'une page de scrutin : { matricule: "p" | "c" | "a" | "n" } et slug de chaque sénateur. */
export function votesNominatifs(html) {
  const i = html.search(/Analyse d(?:é|&eacute;)taill(?:é|&eacute;)e/);
  if (i < 0) return null;
  const votes = {}, slugs = {};
  // S'arrête à la section suivante (« Ont délégué leur droit de vote » répète des noms)
  const suite = html.slice(i), fin = suite.indexOf("<h2", 10);
  for (const bloc of (fin > 0 ? suite.slice(0, fin) : suite).split(/<h3 class="accordion-header/).slice(1)) {
    const titre = bloc.slice(0, bloc.indexOf("</button>")).replace(/<[^>]+>/g, " ").replace(/&eacute;/g, "é").replace(/\s+/g, " ");
    const v = /pour/i.test(titre) ? "p" : /contre/i.test(titre) ? "c" : /abstention/i.test(titre) ? "a" : /pas pris part/i.test(titre) ? "n" : null;
    if (!v) continue;
    for (const [, slug, mat] of bloc.matchAll(/href="\/senateur\/([a-z0-9_-]+?(\d{5}[a-z]))\.html"/g)) {
      votes[mat.toUpperCase()] = v;
      slugs[mat.toUpperCase()] = slug;
    }
  }
  return { votes, slugs };
}

async function lire(url, latin1 = false) {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
  return latin1 ? new TextDecoder("latin1").decode(await res.arrayBuffer()) : res.text();
}

async function main() {
  const brut = CSV_LOCAL ? new TextDecoder("latin1").decode(await readFile(CSV_LOCAL)) : await lire(LISTE_CSV, true);
  const [entete, ...lignes] = lireCsv(brut);
  const col = (n) => entete.indexOf(n);
  const [cMat, cQual, cNom, cPrenom, cEtat, cGroupe, cCirco] = ["Matricule", "Qualité", "Nom usuel", "Prénom usuel", "État", "Groupe politique", "Circonscription"].map(col);
  if ([cMat, cNom, cEtat, cGroupe, cCirco].some((c) => c < 0)) throw new Error(`colonnes introuvables dans la liste des sénateurs : ${entete.join(" | ")}`);
  const actifs = lignes.filter((l) => l[cEtat] === "ACTIF");
  if (actifs.length < 300) throw new Error(`seulement ${actifs.length} sénateurs en fonction dans la liste officielle`);

  const ancien = JSON.parse(await readFile(DATA_FILE, "utf-8").catch(() => '{"cles":[],"senateurs":[]}'));
  const anciensVotes = new Map(ancien.senateurs.map((s) => [s.id, s]));
  const { scrutins } = JSON.parse(await readFile(SENAT_FILE, "utf-8"));
  const ensembles = scrutins.filter((s) => /^sur l.ensemble/i.test(s.titre)).sort((a, b) => b.dateISO.localeCompare(a.dateISO) || b.numero - a.numero);

  // Votes déjà relevés : id scrutin -> { matricule: vote }
  const parScrutin = new Map(ancien.cles.map((id, k) => [id, Object.fromEntries(ancien.senateurs.map((s) => [s.id, s.votes[k]]).filter(([, v]) => v && v !== "."))]));
  const slugs = Object.fromEntries(ancien.senateurs.filter((s) => s.slug).map((s) => [s.id, s.slug]));
  let lus = 0, ecartes = 0;
  for (const s of ensembles) {
    if (parScrutin.has(s.id)) continue;
    if (lus >= MAX) break;
    try {
      const r = votesNominatifs(await lire(s.sourceUrl));
      lus++;
      await pause(300);
      const compte = (v) => Object.values(r?.votes || {}).filter((x) => x === v).length;
      if (!r || compte("p") !== s.pour || compte("c") !== s.contre || compte("a") !== s.abst) {
        ecartes++;
        warn(`${s.id} écarté : totaux nom par nom (${compte("p")}/${compte("c")}/${compte("a")}) ≠ officiels (${s.pour}/${s.contre}/${s.abst}).`);
        continue;
      }
      parScrutin.set(s.id, r.votes);
      Object.assign(slugs, r.slugs);
    } catch (e) {
      ecartes++;
      warn(`${s.id} illisible : ${e.message}`);
    }
  }

  const cles = ensembles.map((s) => s.id).filter((id) => parScrutin.has(id));
  const senateurs = actifs.map((l) => {
    const id = l[cMat].toUpperCase();
    return {
      id,
      nom: `${l[cPrenom]} ${l[cNom]}`.trim(),
      ...(l[cQual] === "Mme" ? { f: 1 } : {}),
      groupe: GROUPES[l[cGroupe]] || l[cGroupe],
      dep: l[cCirco],
      ...(slugs[id] ? { slug: slugs[id] } : {}),
      votes: cles.map((c) => parScrutin.get(c)[id] || ".").join(""),
    };
  }).sort((a, b) => a.nom.split(" ").slice(-1)[0].localeCompare(b.nom.split(" ").slice(-1)[0], "fr"));
  log(`${senateurs.length} sénateurs en fonction, ${cles.length} votes sur l'ensemble d'un texte (${lus} page(s) lue(s), ${ecartes} écartée(s)).`);
  if (ecartes > 10) process.exitCode = 1;
  if (!anciensVotes.size || JSON.stringify(ancien.senateurs) !== JSON.stringify(senateurs) || JSON.stringify(ancien.cles) !== JSON.stringify(cles)) {
    await writeFile(DATA_FILE, JSON.stringify({
      lastUpdated: new Date().toISOString(),
      source: "Sénat — liste des sénateurs (data.senat.fr) et pages des scrutins publics (senat.fr)",
      cles,
      senateurs,
    }) + "\n");
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error("[fetch-senateurs] ÉCHEC :", e.message); process.exitCode = 1; });
}
