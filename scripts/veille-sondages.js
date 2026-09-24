#!/usr/bin/env node
/**
 * veille-sondages.js
 * ------------------
 * Veille sur les nouveaux sondages de la présidentielle 2027, à partir de la liste officielle des
 * notices déposées à la Commission des sondages (toute enquête publiée doit y être déposée).
 *
 * Pour chaque notice « Pres » récente, la notice (PDF) est lue une seule fois : on y cherche s'il
 * s'agit d'intentions de vote au premier tour, les dates de terrain et la taille de l'échantillon.
 * Chaque enquête d'intentions de vote est ensuite comparée à data/sondages.json :
 *  - « integre » : les chiffres de cet institut pour ce terrain (ou plus récent) sont affichés ;
 *  - sinon, l'enquête est « en attente » : ses chiffres ne sont pas encore publiés sous forme
 *    exploitable (la notice ne donne que la méthode). check-fraicheur.js alerte si l'attente dure.
 *
 * Résultat : data/sondages-veille.json (affiché dans la rubrique Sondages).
 *
 * USAGE : node scripts/veille-sondages.js [--dry-run]
 * Dépendance (installée par le workflow) : pdfjs-dist.
 */

import { readFile, writeFile } from "fs/promises";
import path from "path";

const DATA_FILE = path.resolve("data/sondages-veille.json");
const SONDAGES = path.resolve("data/sondages.json");
const BASE = "https://www.commission-des-sondages.fr";
const LISTE = `${BASE}/notices/`;
const USER_AGENT = "politique-france-bot/1.0 (https://github.com/Tahns/politique-france)";
const DRY_RUN = process.argv.includes("--dry-run");
const JOURS = 45; // notices plus anciennes ignorées
const MOIS = { janvier: 1, fevrier: 2, février: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, août: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12, décembre: 12 };
// Nom de l'institut dans le titre de la notice -> nom utilisé sur le site (data/sondages.json)
const INSTITUTS = [
  [/CLUSTER\s*17/i, "Cluster17"], [/OPINION\s*WAY/i, "OpinionWay"], [/(?:TOLUNA\s+)?HARRIS(?:\s+INTERACTIVE)?/i, "Harris"], [/IPSOS(?:\s+BVA)?/i, "Ipsos"],
  [/ELABE/i, "Elabe"], [/IFOP/i, "Ifop"], [/ODOXA/i, "Odoxa"], [/\bCSA\b/i, "CSA"], [/VERIAN/i, "Verian"], [/YOU\s*GOV/i, "YouGov"],
];

const log = (...m) => console.log("[veille-sondages]", ...m);
const warn = (...m) => console.warn("[veille-sondages][ATTENTION]", ...m);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const ENTITES = { amp: "&", rsquo: "’", eacute: "é", egrave: "è", agrave: "à", ecirc: "ê", ccedil: "ç", ocirc: "ô", icirc: "î", ucirc: "û", nbsp: " ", Eacute: "É" };
const texte = (h) => h.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&([a-z]+);/gi, (m, e) => ENTITES[e] ?? m).replace(/\s+/g, " ").trim();
const iso = (a, m, j) => `${a}-${String(m).padStart(2, "0")}-${String(j).padStart(2, "0")}`;

async function lirePdf(url) {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await getDocument({ data: new Uint8Array(await res.arrayBuffer()), useSystemFonts: true, verbosity: 0 }).promise;
  let t = "";
  for (let i = 1; i <= Math.min(doc.numPages, 8); i++) t += " " + (await (await doc.getPage(i)).getTextContent()).items.map((x) => x.str).join(" ");
  // Texte extrait des PDF : chiffres parfois coupés (« 20 2 6 », « 1 1 septembre »)
  return t.replace(/\s+/g, " ").replace(/ - /g, "-").replace(/1 er/g, "1er").replace(/(\d) (?=\d)/g, "$1");
}

/** Dates de terrain : « du 15 au 16 septembre 2026 », « du 29 août au 1er septembre 2026 », « les 15 et 16 … », « le 15 … ». */
export function terrain(t) {
  const m1 = t.match(/du (\d{1,2})(?:er)? (\p{L}+)?\s*(\d{4})? ?au (\d{1,2})(?:er)? (\p{L}+) (\d{4})/iu);
  if (m1 && MOIS[m1[5].toLowerCase()]) {
    const moisFin = MOIS[m1[5].toLowerCase()], moisDeb = m1[2] && MOIS[m1[2].toLowerCase()] ? MOIS[m1[2].toLowerCase()] : moisFin;
    const anFin = +m1[6], anDeb = m1[3] ? +m1[3] : (moisDeb > moisFin ? anFin - 1 : anFin);
    return { debut: iso(anDeb, moisDeb, +m1[1]), fin: iso(anFin, moisFin, +m1[4]) };
  }
  const m2 = t.match(/(?:les|du) (\d{1,2}) et (\d{1,2}) (\p{L}+) (\d{4})/iu);
  if (m2 && MOIS[m2[3].toLowerCase()]) return { debut: iso(+m2[4], MOIS[m2[3].toLowerCase()], +m2[1]), fin: iso(+m2[4], MOIS[m2[3].toLowerCase()], +m2[2]) };
  const m3 = t.match(/(?:réalisées?|interrogées?)[^.]{0,40}? le (\d{1,2})(?:er)? (\p{L}+) (\d{4})/iu);
  if (m3 && MOIS[m3[2].toLowerCase()]) { const d = iso(+m3[3], MOIS[m3[2].toLowerCase()], +m3[1]); return { debut: d, fin: d }; }
  return null;
}
// Intentions de vote : « IV » dans le titre de la notice, ou la notice elle-même s'intitule ainsi
// (« Intentions de vote – présidentielle 2027 », « … à l'élection présidentielle ») ; une phrase comme
// « ne constituent ni une intention de vote » ne suffit pas.
export const estIntentionsDeVote = (t, titre = "") => /\bIV\b|intentions? de vote|enqu[eê]te [ée]lectorale|presitrack/i.test(titre) ||
  /intentions? de vote\s*(?:[–-]\s*|(?:à|pour|de) l.\s*|au premier tour de l.\s*)?(?:élection )?présidentielle/i.test(t);
const echantillon = (t) => { const m = t.match(/échantillon de ([\d  ]{3,7}) personnes/i); return m ? parseInt(m[1].replace(/\D/g, ""), 10) : null; };

async function main() {
  const ancien = JSON.parse(await readFile(DATA_FILE, "utf-8").catch(() => '{"notices":[]}'));
  const connues = new Map((ancien.notices || []).map((n) => [n.id, n]));
  const res = await fetch(LISTE, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`liste des notices : HTTP ${res.status}`);
  const html = await res.text();
  const lignes = [...html.matchAll(/<a href="(\/notices\/medias\/fichiers\/add\/(\d+))"[^>]*>([^<]+)<\/a>/g)]
    .map(([, lienRel, id, titre]) => ({ id: +id, url: BASE + lienRel, titre: texte(titre) }))
    .filter((n) => /^\d+\s+Pres\b/i.test(n.titre));
  if (lignes.length < 10) throw new Error(`seulement ${lignes.length} notice(s) « Pres » trouvée(s) : format de la page changé ?`);

  // Les notices sont listées de la plus récente à la plus ancienne ; on ne garde que les 45 derniers jours
  const limite = new Date(Date.now() - JOURS * 864e5).toISOString().slice(0, 10);
  const notices = [];
  let lues = 0, echecs = 0;
  for (const n of lignes.slice(0, 80)) {
    let info = connues.get(n.id);
    if (!info) {
      try {
        const t = await lirePdf(n.url);
        info = { id: n.id, titre: n.titre, url: n.url, iv: estIntentionsDeVote(t, n.titre), terrain: terrain(t), echantillon: echantillon(t) };
        lues++;
        await pause(300);
      } catch (e) {
        echecs++;
        warn(`notice ${n.id} (${n.titre}) illisible : ${e.message}`);
        continue;
      }
    }
    if (info.terrain && info.terrain.fin < limite) continue;
    const institut = INSTITUTS.find(([re]) => re.test(n.titre))?.[1] || null;
    const media = n.titre.replace(/^\d+\s+Pres\s+/i, "").replace(/\b\d{1,2}\s+\p{L}+\s*$/u, "")
      .replace(/\b(IV|V\d+|1er tour|Barometre|Baromètre|election|pres|Enquete electorale|Presitrack)\b/gi, "")
      .replace(INSTITUTS.find(([re]) => re.test(n.titre))?.[0] || /$^/, "").replace(/\s+/g, " ").trim();
    notices.push({ ...info, institut, media: media || null });
  }

  // Comparaison avec les chiffres affichés
  const sondages = JSON.parse(await readFile(SONDAGES, "utf-8"));
  const affiche = new Map(sondages.instituts.map((i) => [i.nom, i.dateFin]));
  const enquetes = notices.filter((n) => n.iv && n.institut && n.terrain).map((n) => ({
    institut: n.institut, media: n.media, terrain: n.terrain, echantillon: n.echantillon, notice: n.url,
    integre: (affiche.get(n.institut) || "") >= n.terrain.fin,
  })).sort((a, b) => b.terrain.fin.localeCompare(a.terrain.fin));
  // Une même enquête peut faire l'objet de deux notices (deux médias) : une seule ligne
  const vues = new Set();
  const uniques = enquetes.filter((e) => { const k = `${e.institut}|${e.terrain.fin}`; if (vues.has(k)) return false; vues.add(k); return true; });

  const attente = uniques.filter((e) => !e.integre);
  log(`${lignes.length} notices « Pres » listées, ${lues} lue(s), ${uniques.length} enquête(s) d'intentions de vote sur ${JOURS} jours, ${attente.length} en attente de chiffres.`);
  for (const e of attente) log(`  en attente : ${e.institut}${e.media ? ` (${e.media})` : ""}, terrain jusqu'au ${e.terrain.fin}`);
  if (echecs > 5) process.exitCode = 1;
  if (DRY_RUN) return;
  await writeFile(DATA_FILE, JSON.stringify({
    lastUpdated: new Date().toISOString(),
    source: "Commission des sondages — notices déposées",
    sourceUrl: LISTE,
    enquetes: uniques,
    notices, // cache : chaque notice n'est lue qu'une fois
  }, null, 1) + "\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error("[veille-sondages] ÉCHEC :", e.message); process.exitCode = 1; });
}
