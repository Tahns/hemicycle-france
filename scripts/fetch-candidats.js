#!/usr/bin/env node
/**
 * fetch-candidats.js
 * ------------------
 * Met à jour data/candidats.json : les candidats déclarés à l'élection présidentielle de 2027,
 * d'après la page Wikipédia « Candidatures à l'élection présidentielle française de 2027 »
 * (section « Candidats déclarés », y compris les candidats déclarés dans une primaire).
 *
 * Pour chaque candidat : nom, parti, fonctions actuelles, slogan, date d'annonce, âge au premier
 * tour et la première source citée pour l'annonce.
 *
 * GARDE-FOUS : une ligne sans nom, sans parti ou sans source est écartée (signalée) ; une date
 * d'annonce imprécise (« début 2026 ») est laissée vide plutôt que devinée ;
 * si moins de 5 candidats sont lus, ou si plus d'un quart des lignes sont écartées, le fichier
 * n'est pas modifié. Pas de candidature sans source.
 *
 * USAGE :
 *   node scripts/fetch-candidats.js
 *   node scripts/fetch-candidats.js --dry-run
 *   node scripts/fetch-candidats.js --fichier=page.wikitext   # parse un fichier local (tests)
 */

import { readFile, writeFile } from "fs/promises";
import path from "path";

const DATA_FILE = path.resolve("data/candidats.json");
const PAGE = "Candidatures_à_l'élection_présidentielle_française_de_2027";
const RAW_URL = `https://fr.wikipedia.org/w/index.php?title=${encodeURIComponent(PAGE)}&action=raw`;
const PAGE_URL = `https://fr.wikipedia.org/wiki/${encodeURIComponent(PAGE)}`;
const USER_AGENT = "hemicycle-france-bot/1.0 (https://github.com/Tahns/hemicycle-france)";
const DRY_RUN = process.argv.includes("--dry-run");
const FICHIER = process.argv.find((a) => a.startsWith("--fichier="))?.split("=")[1];
const PREMIER_TOUR = "2027-04-18";

const MOIS = { janvier: 1, février: 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, août: 8, aout: 8, septembre: 9, octobre: 10, novembre: 11, décembre: 12, decembre: 12 };

const log = (...m) => console.log("[fetch-candidats]", ...m);
const warn = (...m) => console.warn("[fetch-candidats][ATTENTION]", ...m);
const iso = (j, m, a) => `${a}-${String(m).padStart(2, "0")}-${String(j).padStart(2, "0")}`;

/** Texte lisible depuis du wikitexte : liens, modèles courants, petites balises. */
function texte(w) {
  return String(w)
    .replace(/<ref[^>]*\/>|<ref[^>]*>[\s\S]*?<\/ref>/g, "")
    .replace(/\{\{Circonscription fr\|(\d+)\|([^}|]+)\}\}/gi, (_, n, dep) => `${n === "1" ? "1re" : n + "e"} circonscription (${dep})`)
    .replace(/\{\{(?:1er|1re|er)\}\}/g, (m) => (m.includes("re") ? "re" : "er"))
    .replace(/\{\{(\d+)e\}\}/g, "$1e")
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/g, "$1")
    .replace(/'''?/g, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Première date d'un texte : {{date|8 décembre 2025}}, {{date|25|11|2025}} ou « 24 septembre 2026 ». */
function premiereDate(w) {
  const t = w.replace(/<ref[^>]*\/>|<ref[^>]*>[\s\S]*?<\/ref>/g, "");
  let m = t.match(/\{\{date\|(\d{1,2})[|/](\d{1,2})[|/](\d{4})\}\}/i);
  if (m) return iso(m[1], m[2], m[3]);
  m = t.match(/\{\{date\|(\d{1,2}|1er)\s+([a-zéû]+)\s+(\d{4})\}\}/i) || t.match(/\b(\d{1,2}|1er)\s+([a-zéû]+)\s+(\d{4})\b/i);
  if (m && MOIS[m[2].toLowerCase()]) return iso(m[1] === "1er" ? 1 : m[1], MOIS[m[2].toLowerCase()], m[3]);
  return null;
}

function ageAu(naissance, jour) {
  const [a, m, j] = naissance.split("-").map(Number);
  const [A, M, J] = jour.split("-").map(Number);
  return A - a - (M < m || (M === m && J < j) ? 1 : 0);
}

/** Découpe une ligne de tableau en cellules (« | » ou « || » en début de ligne). */
function cellules(ligne) {
  const out = [];
  for (const l of ligne.split("\n")) {
    if (/^\|(?![-+}])/.test(l)) out.push(l.slice(1));
    else if (out.length) out[out.length - 1] += "\n" + l;
  }
  return out;
}

/** Retire le préfixe d'attributs « width="9%" | » d'une cellule. */
function contenu(cell) {
  let prof = 0;
  for (let i = 0; i < cell.length; i++) {
    const c2 = cell.slice(i, i + 2);
    if (c2 === "[[" || c2 === "{{") { prof++; i++; continue; }
    if (c2 === "]]" || c2 === "}}") { prof--; i++; continue; }
    if (cell[i] === "\n") break;
    if (cell[i] === "|" && prof === 0) return cell.slice(i + 1);
  }
  return cell;
}

/**
 * Source de l'annonce : parmi les références citées, un article qui nomme le candidat et parle de sa
 * candidature ; jamais un article consacré à une procédure judiciaire (présomption d'innocence : ce
 * n'est pas le sujet de la fiche). À défaut, la page Wikipédia des candidatures elle-même.
 */
function choisirSource(paragraphe, commentaires, nomFamille) {
  const refs = [...`${paragraphe}\n${commentaires}`.matchAll(/<ref[^>]*>([\s\S]*?)<\/ref>/g)].map((m) => {
    const url = m[1].match(/(?:\burl|lire en ligne)\s*=\s*(https?:\/\/[^\s|}]+)/)?.[1] || m[1].match(/(https?:\/\/[^\s|}\]]+)/)?.[1];
    const titre = m[1].match(/titre\s*=\s*([^|}]+)/)?.[1] || "";
    return url ? { url, texte: (titre + " " + url).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() } : null;
  }).filter(Boolean);
  const nom = String(nomFamille).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/[\s-]+/).pop();
  const judiciaire = /jug|agress|harcel|condamn|proces|enquete|mis en examen|mise en examen|garde a vue|plainte/;
  const bonne = refs.find((r) => r.texte.includes(nom) && /candidat|presidentielle|2027/.test(r.texte) && !judiciaire.test(r.texte));
  return bonne?.url || PAGE_URL;
}

function parseLigne(bloc, primaire) {
  const entete = bloc.split("\n").find((l) => l.startsWith("!"));
  const tri = entete?.match(/\{\{TriNom\|([^|}]*)\|([^|}]*)/);
  if (!tri) return null;
  const nom = `${tri[1]} ${tri[2]}`.trim();
  const liens = [...entete.matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g)];
  const parti = liens.length ? liens.map((l) => (l[2] || l[1]).trim()).join(" / ") : texte(entete.split(/<br\s*\/?>/i).pop());
  const nais = entete.match(/\{\{Âge\|(\d{1,2})\|(\d{1,2})\|(\d{4})/);
  const code = bloc.match(/\{\{Infobox Parti politique français\/couleurs\|([^}|]+)\}\}/)?.[1]?.trim() || null;

  const toutes = cellules(bloc.slice(bloc.indexOf(entete) + entete.length));
  // Cellules (certaines lignes n'ont pas de photo ou de colonne campagne) : [photo], couleur, fonctions,
  // [campagne/slogan], commentaires. On se repère sur la cellule de couleur et sur le texte d'annonce.
  const iCouleur = toutes.findIndex((x) => /Infobox Parti politique français\/couleurs/.test(x));
  const c = toutes.slice(iCouleur + 1);
  const iCom = c.findIndex((x, i) => i > 0 && /annonc|candidat|déclar/i.test(x));
  const commentaires = iCom > 0 ? c.slice(iCom).join("\n") : "";
  const fonctions = (c[0] || "").split("\n").filter((l) => /^\*/.test(l.trim())).map((l) => texte(l.replace(/^\s*\*+/, ""))).filter(Boolean).slice(0, 5);
  const slogan = c.slice(1, iCom > 0 ? iCom : undefined).map(contenu).join("\n").match(/''([^'][^']*?)''/)?.[1] || null;
  // La date d'annonce est dans le paragraphe qui parle de la candidature (pas dans la liste des anciens mandats)
  const paragraphes = commentaires.split(/-{4,}/);
  const paragraphe = paragraphes.find((x) => /candidat/i.test(x) && /annonc|confirm|déclar|officialis|présente|lance/i.test(x))
    || paragraphes.find((x) => /candidat/i.test(x) && !/^\s*\|?\s*Candidat(e)? (à|au|aux) /i.test(x)) || "";
  const annonce = premiereDate(paragraphe);
  const source = choisirSource(paragraphe, commentaires, tri[2]);

  return {
    nom,
    parti: texte(parti),
    code,
    ...(nais ? { age: ageAu(iso(nais[1], nais[2], nais[3]), PREMIER_TOUR) } : {}),
    fonctions,
    ...(slogan && !/^aucune?$/i.test(texte(slogan)) ? { slogan: texte(slogan) } : {}),
    annonce,
    source,
    ...(primaire ? { primaire: true } : {}),
  };
}

async function main() {
  const wikitexte = FICHIER
    ? await readFile(FICHIER, "utf-8")
    : await (async () => {
        const res = await fetch(RAW_URL, { headers: { "User-Agent": USER_AGENT } });
        if (!res.ok) throw new Error(`HTTP ${res.status} en lisant la page Wikipédia`);
        return res.text();
      })();

  const debut = wikitexte.search(/^== *Candidats déclarés *==/m);
  const fin = wikitexte.search(/^== *Candidats pressentis *==/m);
  if (debut < 0 || fin < debut) throw new Error("section « Candidats déclarés » introuvable : la page a changé de structure");
  const section = wikitexte.slice(debut, fin);
  const iPrimaire = section.search(/^=== *Candidats déclarés dans le cadre d'une primaire/m);

  const candidats = [];
  const ecartes = [];
  let lignes = 0;
  for (const [morceau, primaire] of [[iPrimaire > 0 ? section.slice(0, iPrimaire) : section, false], [iPrimaire > 0 ? section.slice(iPrimaire) : "", true]]) {
    for (const bloc of morceau.split(/\n\|-/)) {
      if (!/^\s*!\s*\{\{TriNom/m.test(bloc)) continue;
      lignes++;
      const c = parseLigne(bloc, primaire);
      // Une date d'annonce imprécise (« début 2026 ») est admise ; une candidature sans source ne l'est pas
      if (!c || !c.nom || !c.parti || !c.source) {
        ecartes.push(`${c?.nom || "(nom illisible)"} : ${!c?.source ? "aucune source" : "parti illisible"}`);
        continue;
      }
      if (!candidats.some((x) => x.nom === c.nom)) candidats.push(c);
    }
  }
  for (const e of ecartes) warn("écarté —", e);
  log(`${candidats.length} candidat(s) lu(s) sur ${lignes} ligne(s).`);

  if (candidats.length < 5 || ecartes.length > lignes / 4) {
    warn("Trop peu de candidats lisibles : data/candidats.json n'est pas modifié.");
    process.exitCode = 1;
    return;
  }

  candidats.sort((a, b) => (b.annonce || "").localeCompare(a.annonce || "") || a.nom.localeCompare(b.nom, "fr"));
  const sortie = { source: "Wikipédia — Candidatures à l'élection présidentielle française de 2027", sourceUrl: PAGE_URL, premierTour: PREMIER_TOUR, candidats };
  const ancien = JSON.parse(await readFile(DATA_FILE, "utf-8").catch(() => "{}"));
  delete ancien.lastUpdated;
  if (JSON.stringify(ancien) === JSON.stringify(sortie)) return log("Aucun changement.");
  if (DRY_RUN) return console.log(JSON.stringify(sortie, null, 2));
  await writeFile(DATA_FILE, JSON.stringify({ lastUpdated: new Date().toISOString(), ...sortie }, null, 2) + "\n");
  log(`data/candidats.json mis à jour (${candidats.length} candidats).`);
}

main().catch((e) => {
  console.error("[fetch-candidats] ÉCHEC :", e);
  process.exitCode = 1;
});
