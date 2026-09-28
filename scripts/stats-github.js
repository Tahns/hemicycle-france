#!/usr/bin/env node
/**
 * Archive le trafic du dépôt GitHub (limité à 14 jours par GitHub) dans <dossier>/trafic.json
 * et écrit le tableau de bord <dossier>/README.md.
 * Jeton requis : secret TRAFIC_TOKEN (permission « Administration : Read-only »).
 */

import { readFile, writeFile, appendFile, mkdir } from "fs/promises";
import { join } from "path";

const DOSSIER = process.argv[2] || "stats";
const DEPOT = process.env.GITHUB_REPOSITORY || "Tahns/hemicycle-france";
const JETON = process.env.TRAFIC_TOKEN;
const FICHIER = join(DOSSIER, "trafic.json");
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

if (!JETON) {
  console.error("Secret TRAFIC_TOKEN absent.");
  process.exit(1);
}

async function api(chemin) {
  const rep = await fetch(`https://api.github.com/repos/${DEPOT}${chemin}`, {
    headers: {
      Authorization: `Bearer ${JETON}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "hemicycle-france-stats",
    },
  });
  if (rep.status === 401 || rep.status === 403) {
    throw new Error(`${chemin} : accès refusé (${rep.status}), vérifier TRAFIC_TOKEN.`);
  }
  if (!rep.ok) throw new Error(`${chemin} : réponse ${rep.status}`);
  return rep.json();
}

const [vues, clones, referents, pages, depot] = await Promise.all([
  api("/traffic/views?per=day"),
  api("/traffic/clones?per=day"),
  api("/traffic/popular/referrers"),
  api("/traffic/popular/paths"),
  api(""),
]);

let hist = { vues: {}, clones: {}, depot: {}, referents: {}, pages: {} };
try {
  hist = { ...hist, ...JSON.parse(await readFile(FICHIER, "utf8")) };
} catch {
}

const jour = (ts) => ts.slice(0, 10);
const aujourdhui = new Date().toISOString().slice(0, 10);

// Un jour récent peut encore être incomplet : on garde la valeur la plus haute vue pour ce jour.
function fusionner(cible, liste) {
  for (const { timestamp, count, uniques } of liste) {
    const d = jour(timestamp);
    const avant = cible[d] || { total: 0, uniques: 0 };
    cible[d] = { total: Math.max(avant.total, count), uniques: Math.max(avant.uniques, uniques) };
  }
}
fusionner(hist.vues, vues.views);
fusionner(hist.clones, clones.clones);

hist.depot[aujourdhui] = { etoiles: depot.stargazers_count, forks: depot.forks_count, abonnes: depot.subscribers_count };
// Référents et pages : GitHub ne donne que le cumul des 14 derniers jours → un relevé par jour
hist.referents[aujourdhui] = referents.map(({ referrer, count, uniques }) => ({ source: referrer, total: count, uniques }));
hist.pages[aujourdhui] = pages.map(({ path, title, count, uniques }) => ({ chemin: path, titre: title, total: count, uniques }));

const trier = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
for (const cle of Object.keys(hist)) hist[cle] = trier(hist[cle]);

await mkdir(DOSSIER, { recursive: true });
await writeFile(FICHIER, JSON.stringify(hist, null, 1) + "\n");

// ---------- Tableau de bord ----------
const nb = (n) => n.toLocaleString("fr-FR");
const dateFr = (iso) => {
  const [a, m, j] = iso.split("-").map(Number);
  return `${j} ${MOIS[m - 1]} ${a}`;
};
const barre = (n, max) => "█".repeat(max ? Math.round((n / max) * 20) : 0) || (n ? "▏" : "");
const somme = (o, cle) => Object.values(o).reduce((s, v) => s + v[cle], 0);

const jours = Object.keys(hist.vues);
const debut = jours[0] || aujourdhui;
const dernier = hist.depot[aujourdhui];

// 30 derniers jours, jours sans visite compris
const trente = [];
for (let i = 29; i >= 0; i--) {
  const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
  trente.push([d, hist.vues[d] || { total: 0, uniques: 0 }, hist.clones[d] || { total: 0, uniques: 0 }]);
}
const max30 = Math.max(...trente.map(([, v]) => v.total));
const vues30 = trente.reduce((s, [, v]) => s + v.total, 0);

const parMois = {};
for (const [d, v] of Object.entries(hist.vues)) {
  const m = d.slice(0, 7);
  parMois[m] = parMois[m] || { total: 0, uniques: 0, clones: 0 };
  parMois[m].total += v.total;
  parMois[m].uniques += v.uniques;
}
for (const [d, v] of Object.entries(hist.clones)) {
  const m = d.slice(0, 7);
  parMois[m] = parMois[m] || { total: 0, uniques: 0, clones: 0 };
  parMois[m].clones += v.total;
}
const maxMois = Math.max(0, ...Object.values(parMois).map((v) => v.total));

const lignes = [
  "# Statistiques du dépôt",
  "",
  `Mis à jour le ${dateFr(aujourdhui)}. Historique depuis le ${dateFr(debut)}.`,
  "",
  "| | |",
  "|---|---|",
  `| Vues (30 derniers jours) | **${nb(vues30)}** |`,
  `| Vues depuis le début de l'archive | **${nb(somme(hist.vues, "total"))}** |`,
  `| Clones depuis le début de l'archive | ${nb(somme(hist.clones, "total"))} |`,
  `| Étoiles | ${nb(dernier.etoiles)} |`,
  `| Forks | ${nb(dernier.forks)} |`,
  `| Abonnés (watchers) | ${nb(dernier.abonnes)} |`,
  "",
  "## 30 derniers jours",
  "",
  "| Jour | Vues | Visiteurs uniques | Clones | |",
  "|---|--:|--:|--:|---|",
  ...trente.reverse().map(([d, v, c]) => `| ${dateFr(d)} | ${nb(v.total)} | ${nb(v.uniques)} | ${nb(c.total)} | ${barre(v.total, max30)} |`),
  "",
  "## Par mois",
  "",
  "| Mois | Vues | Visiteurs uniques* | Clones | |",
  "|---|--:|--:|--:|---|",
  ...Object.entries(parMois)
    .reverse()
    .map(([m, v]) => {
      const [a, mm] = m.split("-").map(Number);
      return `| ${MOIS[mm - 1]} ${a} | ${nb(v.total)} | ${nb(v.uniques)} | ${nb(v.clones)} | ${barre(v.total, maxMois)} |`;
    }),
  "",
  "\\* somme des visiteurs uniques de chaque jour.",
  "",
  "## D'où viennent les visiteurs (14 derniers jours)",
  "",
  hist.referents[aujourdhui].length
    ? ["| Source | Vues | Visiteurs uniques |", "|---|--:|--:|", ...hist.referents[aujourdhui].map((r) => `| ${r.source} | ${nb(r.total)} | ${nb(r.uniques)} |`)].join("\n")
    : "_Aucun site référent sur la période._",
  "",
  "## Pages les plus vues (14 derniers jours)",
  "",
  hist.pages[aujourdhui].length
    ? ["| Page | Vues | Visiteurs uniques |", "|---|--:|--:|", ...hist.pages[aujourdhui].map((p) => `| \`${p.chemin}\` | ${nb(p.total)} | ${nb(p.uniques)} |`)].join("\n")
    : "_Aucune page vue sur la période._",
  "",
];
const md = lignes.join("\n");
await writeFile(join(DOSSIER, "README.md"), md);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, md);
console.log(`Statistiques archivées : ${jours.length} jours de vues, ${nb(vues30)} vues sur 30 jours.`);
