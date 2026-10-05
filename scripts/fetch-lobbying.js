#!/usr/bin/env node
/**
 * fetch-lobbying.js
 * -----------------
 * Construit data/lobbying.json : rencontres déclarées par des représentants d'intérêts avec un élu,
 * d'après le répertoire de la HATVP (open data « Agora », Licence Ouverte).
 *
 * RÈGLE : une action n'est rattachée à un élu que si la source le désigne par son identifiant
 * officiel (idAssemblee « PA… » ou idSenat). Jamais par le nom ; les actions qui ne visent qu'une
 * catégorie (« Député ») sans identifiant sont ignorées. Si la source ne publie aucune rencontre
 * nominative, le fichier n'est pas écrit et le bloc reste masqué sur le site.
 *
 * ATTENTION : les noms de champs lus ci-dessous n'ont pas pu être vérifiés sur la vraie source
 * (accès bloqué dans l'environnement de développement) ; le script a été testé sur
 * tests/fixtures/agora-extrait.json, qui reprend ce format supposé. À confirmer au premier
 * passage réel : le journal indique combien d'actions nominatives ont été trouvées.
 *
 * USAGE : node scripts/fetch-lobbying.js [--fixture=chemin.json] [--sortie=chemin.json]
 */
import { fetchPoli } from "./http.js";
import { readFile, writeFile } from "fs/promises";
import path from "path";

const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
const FIXTURE = arg("fixture");
const SORTIE = path.resolve(arg("sortie") || "data/lobbying.json");
const URL_AGORA = "https://www.hatvp.fr/agora/opendata/agora_repertoire_opendata.json";
const MAX_PAR_ELU = 20;
const log = (...m) => console.log("[fetch-lobbying]", ...m);

export function extraire(source) {
  const elus = {};
  let nominatives = 0;
  for (const org of source?.publications || []) {
    const actions = (org.exercices || []).flatMap((e) => (e.publicationCourante?.activites || []).flatMap((a) => a.publicationCourante?.actionsRepresentationInteret || []));
    for (const act of actions) {
      for (const r of act.responsablesPublics || []) {
        const id = /^PA\d+$/.test(r.idAssemblee || "") ? r.idAssemblee : /^[0-9A-Za-z]{5,8}$/.test(r.idSenat || "") ? r.idSenat : null;
        if (!id || !org.denomination || !/^\d{4}-\d{2}-\d{2}/.test(act.dateAction || "")) continue;
        nominatives++;
        (elus[id] ||= []).push([org.denomination, act.dateAction.slice(0, 10), act.objet || "", org.identifiantNational || ""]);
      }
    }
  }
  const sortie = {};
  for (const [id, l] of Object.entries(elus)) {
    l.sort((a, b) => b[1].localeCompare(a[1]));
    sortie[id] = { n: l.length, derniers: l.slice(0, MAX_PAR_ELU) };
  }
  return { elus: sortie, nominatives };
}

async function main() {
  let source;
  if (FIXTURE) source = JSON.parse(await readFile(FIXTURE, "utf-8"));
  else {
    const res = await fetchPoli(URL_AGORA, { timeoutMs: 180000 });
    if (!res.ok) throw new Error(`HATVP : HTTP ${res.status}`);
    source = await res.json();
  }
  const { elus, nominatives } = extraire(source);
  log(`${nominatives} actions nominatives, ${Object.keys(elus).length} élus concernés.`);
  if (!nominatives) return log("Aucune rencontre nominative dans la source : data/lobbying.json n'est pas modifié.");
  await writeFile(SORTIE, JSON.stringify({
    lastUpdated: new Date().toISOString(),
    source: "Haute Autorité pour la transparence de la vie publique — répertoire des représentants d'intérêts (open data, Licence Ouverte)",
    elus,
  }) + "\n");
  log(`${path.relative(process.cwd(), SORTIE)} écrit.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error("[fetch-lobbying] ÉCHEC :", e.message); process.exitCode = 1; });
