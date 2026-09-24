#!/usr/bin/env node
/**
 * fetch-senat.js
 * --------------
 * Met à jour data/senat.json : les scrutins publics du Sénat (session en cours et précédente),
 * avec le résultat et le détail par groupe politique, lus sur les pages officielles
 * senat.fr/scrutin-public/ (le Sénat ne publie pas ses scrutins en open data structuré).
 *
 * GARDE-FOUS (comme pour l'Assemblée) :
 *  - la somme des votes des groupes doit être égale au total officiel pour / contre / abstention,
 *    sinon le scrutin est écarté (jamais « corrigé ») ;
 *  - un groupe inconnu fait écarter le scrutin (table GROUPES à compléter) ;
 *  - un scrutin déjà publié n'est pas relu (un vote ne change plus) ; seuls les nouveaux sont lus,
 *    avec une pause entre deux pages pour ne pas surcharger le site du Sénat.
 *
 * USAGE : node scripts/fetch-senat.js [--dry-run] [--max=50]
 */

import { readFile, writeFile } from "fs/promises";
import path from "path";

const DATA_FILE = path.resolve("data/senat.json");
const BASE = "https://www.senat.fr/scrutin-public/";
const USER_AGENT = "politique-france-bot/1.0 (https://github.com/Tahns/politique-france)";
const DRY_RUN = process.argv.includes("--dry-run");
const MAX = parseInt(process.argv.find((a) => a.startsWith("--max="))?.split("=")[1] || "800", 10);
const PAUSE_MS = 300;

// Libellé officiel du groupe -> sigle affiché
const GROUPES = [
  [/^Groupe Les Républicains$/i, "LR"],
  [/^Groupe Socialiste, Écologiste et Républicain$/i, "SER"],
  [/^Groupe Union Centriste$/i, "UC"],
  [/^Groupe Les Indépendants - République et Territoires$/i, "LIRT"],
  [/^Groupe Rassemblement des démocrates, progressistes et indépendants$/i, "RDPI"],
  [/^Groupe Communiste Républicain Citoyen et Écologiste( - Kanaky)?$/i, "CRCE-K"],
  [/^Groupe du Rassemblement Démocratique et Social Européen$/i, "RDSE"],
  [/^Groupe Écologiste - Solidarité et Territoires$/i, "GEST"],
  [/^Sénateurs ne figurant sur la liste d'aucun groupe$/i, "NI"],
];
const MOIS = { janvier: 1, février: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, août: 8, septembre: 9, octobre: 10, novembre: 11, décembre: 12 };

const log = (...m) => console.log("[fetch-senat]", ...m);
const warn = (...m) => console.warn("[fetch-senat][ATTENTION]", ...m);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const ENTITES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", laquo: "«", raquo: "»", eacute: "é", egrave: "è", agrave: "à", ccedil: "ç", ecirc: "ê", ocirc: "ô", icirc: "î", ucirc: "û", acirc: "â", Eacute: "É", oelig: "œ", hellip: "…", ndash: "–", mdash: "—", deg: "°" };
function texteBrut(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, e) => ENTITES[e] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

async function lire(url) {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
  return res.text();
}

function parseScrutin(html, session, numero, url) {
  const principal = html.indexOf("<main") >= 0 ? html.slice(html.indexOf("<main")) : html; // pas le <title>
  const t = texteBrut(principal);
  const entete = t.match(/Scrutin n°\s*(\d+) - séance du (\d{1,2}|1er) (\p{L}+) (\d{4}) (.+?) (Adoptée?|Rejetée?)(?=\s|$)/u);
  if (!entete || parseInt(entete[1], 10) !== numero) return { ok: false, raison: "en-tête illisible" };
  const mois = MOIS[entete[3].toLowerCase()];
  if (!mois) return { ok: false, raison: "date illisible" };
  const jour = entete[2] === "1er" ? 1 : parseInt(entete[2], 10);
  const dateISO = `${entete[4]}-${String(mois).padStart(2, "0")}-${String(jour).padStart(2, "0")}`;

  const tot = t.match(/(\d+) votants (\d+) suffrages exprimés (\d+) pour (\d+) contre Abstentions? : (\d+) N.ont pas pris part au vote : (\d+)/);
  if (!tot) return { ok: false, raison: "résultat global illisible" };
  const [pour, contre, abst, npv] = [tot[3], tot[4], tot[5], tot[6]].map(Number);

  const groupes = {};
  let sp = 0, sc = 0, sa = 0;
  for (const g of t.matchAll(/((?:Groupe |Sénateurs ne figurant)[^:]{3,140}?) : (\d+) sénateurs? Pour : (\d+) Contre : (\d+) Abstentions? : (\d+) N.(?:a|ont) pas pris part au vote : (\d+)/g)) {
    const libelle = g[1].trim();
    const sigle = GROUPES.find(([re]) => re.test(libelle))?.[1];
    if (!sigle) return { ok: false, raison: `groupe inconnu « ${libelle} » (table GROUPES à compléter)` };
    const [membres, p, c, a, n] = g.slice(2).map(Number);
    groupes[sigle] = { pour: p, contre: c, abst: a, npv: n, membres };
    sp += p; sc += c; sa += a;
  }
  if (!Object.keys(groupes).length) return { ok: false, raison: "détail par groupe absent" };
  if (sp !== pour || sc !== contre || sa !== abst) return { ok: false, raison: `somme des groupes (${sp}/${sc}/${sa}) ≠ total officiel (${pour}/${contre}/${abst})` };

  const dossier = html.match(/href="(\/dossier-legislatif\/[^"#]+\.html)"/)?.[1];
  return {
    ok: true,
    id: `senat-${session}-${numero}`,
    session,
    numero,
    titre: entete[5].replace(/\s*En savoir plus.*$/, "").trim(),
    date: `${jour === 1 ? "1er" : jour} ${entete[3].toLowerCase()} ${entete[4]}`,
    dateISO,
    resultat: /^Adopt/.test(entete[6]) ? "adopte" : "rejete",
    pour, contre, abst, npv,
    groupes,
    ...(dossier ? { dossierUrl: "https://www.senat.fr" + dossier } : {}),
    sourceUrl: url,
  };
}

async function main() {
  const existant = JSON.parse(await readFile(DATA_FILE, "utf-8").catch(() => '{"scrutins":[]}'));
  const connus = new Map(existant.scrutins.map((s) => [s.id, s]));
  const maintenant = new Date();
  const courante = maintenant.getUTCMonth() >= 9 ? maintenant.getUTCFullYear() : maintenant.getUTCFullYear() - 1; // session d'octobre à septembre

  const aLire = [];
  for (const session of [courante, courante - 1]) {
    let liste;
    try { liste = await lire(`${BASE}scr${session}.html`); } catch (e) { warn(`Liste de la session ${session} illisible (${e.message}).`); continue; }
    const numeros = [...new Set([...liste.matchAll(new RegExp(`scr${session}-(\\d+)\\.html`, "g"))].map((m) => parseInt(m[1], 10)))];
    log(`Session ${session}-${session + 1} : ${numeros.length} scrutin(s) listé(s).`);
    for (const n of numeros) if (!connus.has(`senat-${session}-${n}`)) aLire.push({ session, n });
  }

  const nouveaux = [], rejets = [];
  for (const { session, n } of aLire.slice(0, MAX)) {
    const url = `${BASE}${session}/scr${session}-${n}.html`;
    try {
      const r = parseScrutin(await lire(url), session, n, url);
      if (r.ok) { const { ok, ...s } = r; nouveaux.push(s); } else rejets.push(`${session}-${n} : ${r.raison}`);
    } catch (e) {
      rejets.push(`${session}-${n} : ${e.message}`);
    }
    await pause(PAUSE_MS);
  }
  for (const r of rejets) warn("écarté —", r);
  log(`${nouveaux.length} nouveau(x) scrutin(s), ${rejets.length} écarté(s), ${Math.max(0, aLire.length - MAX)} reporté(s) au prochain passage.`);
  if (rejets.length > 20 && rejets.length > nouveaux.length) process.exitCode = 1;
  if (!nouveaux.length || DRY_RUN) return;

  for (const s of nouveaux) connus.set(s.id, s);
  const scrutins = [...connus.values()].sort((a, b) => b.dateISO.localeCompare(a.dateISO) || b.session - a.session || b.numero - a.numero);
  const lignes = scrutins.map((s) => "    " + JSON.stringify(s)).join(",\n");
  await writeFile(DATA_FILE, `{\n  "lastUpdated": ${JSON.stringify(new Date().toISOString())},\n  "source": "Sénat — pages des scrutins publics (senat.fr)",\n  "scrutins": [\n${lignes}\n  ]\n}\n`);
  log(`data/senat.json mis à jour (${scrutins.length} scrutins).`);
}

main().catch((e) => {
  console.error("[fetch-senat] ÉCHEC :", e);
  process.exitCode = 1;
});
