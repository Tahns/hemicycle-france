#!/usr/bin/env node
/**
 * probabilites.js
 * ---------------
 * Calcule data/probabilites.json à partir de data/sondages.json : chance de chaque candidat
 * d'accéder au second tour, puis d'être élu, par simulation (méthode de Monte-Carlo).
 *
 * MÉTHODE (affichée telle quelle sur le site) :
 *  - premier tour : pour chaque candidat testé par au moins la moitié des instituts, moyenne des
 *    milieux de fourchette de la dernière enquête de chaque institut ;
 *  - chaque tirage ajoute à chaque score une erreur aléatoire (loi normale) dont l'écart-type grandit
 *    avec l'éloignement du scrutin (1,5 point la veille, 9,5 points à un an, pour un candidat à 20 %) ;
 *  - les deux premiers du tirage s'affrontent au second tour : score moyen du duel dans les sondages
 *    de second tour, avec une erreur de 2 points la veille à 9 points à un an ;
 *  - un duel jamais testé par les sondeurs n'attribue la victoire à personne (part « duel non testé »).
 * Le tirage est déterminé par les données : mêmes sondages, mêmes probabilités.
 *
 * USAGE : node scripts/probabilites.js [--date=AAAA-MM-JJ]
 */

import { readFile, writeFile } from "fs/promises";

const TOUR1 = "2027-04-18";
const TOUR2 = "2027-05-02";
const TIRAGES = 20000;
const DATE_ARG = process.argv.find((a) => a.startsWith("--date="))?.split("=")[1];
const maintenant = DATE_ARG ? new Date(DATE_ARG + "T12:00:00Z") : new Date();
const joursAvant = (iso) => Math.max(0, (Date.parse(iso + "T18:00:00Z") - maintenant) / 864e5);
const log = (...m) => console.log("[probabilites]", ...m);

const data = JSON.parse(await readFile("data/sondages.json", "utf-8"));
const instituts = data.instituts || [];
if (instituts.length < 2) {
  console.error("[probabilites] Moins de 2 instituts : calcul impossible.");
  process.exit(1);
}
if (joursAvant(TOUR2) === 0) {
  log("Élection passée : probabilités figées.");
  process.exit(0);
}

// ---------- Premier tour : moyenne des instituts ----------
const milieu = (r) => (r[0] + r[1]) / 2;
const tests = {};
for (const i of instituts) for (const [nom, r] of Object.entries(i.scores)) (tests[nom] ||= []).push(milieu(r));
const seuil = Math.ceil(instituts.length / 2);
const candidats = Object.entries(tests)
  .filter(([, v]) => v.length >= seuil)
  .map(([nom, v]) => ({ nom, moyenne: v.reduce((s, x) => s + x, 0) / v.length }))
  .sort((a, b) => b.moyenne - a.moyenne);

const echelle = (jours) => Math.min(jours, 365) / 365;
const ecart1 = 1.5 + 8 * echelle(joursAvant(TOUR1)); // points, pour un candidat à 20 %
const ecart2 = 2 + 7 * echelle(joursAvant(TOUR2));

// ---------- Second tour : moyenne de chaque duel testé ----------
const duels = new Map(); // "A|B" (ordre alphabétique) -> part moyenne de A
const enLice = new Set(candidats.map((c) => c.nom));
for (const d of data.secondTour || []) {
  const [a, b] = [...d.candidats].sort();
  if (!enLice.has(a) || !enLice.has(b)) continue; // duel entre candidats absents du premier tour : inutilisable
  const parts = d.instituts.map((i) => (100 * i.scores[a]) / (i.scores[a] + i.scores[b])).filter(Number.isFinite);
  if (parts.length) duels.set(`${a}|${b}`, parts.reduce((s, x) => s + x, 0) / parts.length);
}

// ---------- Simulation (générateur pseudo-aléatoire à graine fixe) ----------
let graine = [...JSON.stringify([instituts.map((i) => i.dateFin), [...duels.entries()], ecart1.toFixed(2)])].reduce((h, c) => (Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0), 2166136261);
function aleatoire() {
  graine = (graine + 0x6d2b79f5) >>> 0;
  let t = graine;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const normale = () => Math.sqrt(-2 * Math.log(1 - aleatoire())) * Math.cos(2 * Math.PI * aleatoire());

const qualif = Object.fromEntries(candidats.map((c) => [c.nom, 0]));
const victoire = Object.fromEntries(candidats.map((c) => [c.nom, 0]));
const finales = new Map();
let nonTeste = 0;
for (let t = 0; t < TIRAGES; t++) {
  const tirage = candidats
    .map((c) => ({ nom: c.nom, score: c.moyenne + normale() * ecart1 * Math.sqrt(Math.max(c.moyenne, 5) / 20) }))
    .sort((a, b) => b.score - a.score);
  const [a, b] = [tirage[0].nom, tirage[1].nom].sort();
  qualif[a]++;
  qualif[b]++;
  const cle = `${a}|${b}`;
  const f = finales.get(cle) || { n: 0, a: 0 };
  f.n++;
  if (duels.has(cle)) {
    const gagnant = duels.get(cle) + normale() * ecart2 > 50 ? a : b;
    victoire[gagnant]++;
    if (gagnant === a) f.a++;
  } else nonTeste++;
  finales.set(cle, f);
}

const pct = (n) => Math.round((1000 * n) / TIRAGES) / 10;
const sortie = {
  methode: {
    instituts: instituts.length,
    duels: duels.size,
    tirages: TIRAGES,
    ecartPremierTour: Math.round(ecart1 * 10) / 10,
    ecartSecondTour: Math.round(ecart2 * 10) / 10,
    tours: [TOUR1, TOUR2],
  },
  candidats: candidats.map((c) => ({
    nom: c.nom,
    parti: data.candidats?.[c.nom] || null,
    intention: Math.round(c.moyenne * 10) / 10,
    secondTour: pct(qualif[c.nom]),
    victoire: duels.size ? pct(victoire[c.nom]) : null,
  })),
  duelNonTeste: duels.size ? pct(nonTeste) : 100,
  finales: [...finales.entries()]
    .sort((x, y) => y[1].n - x[1].n)
    .slice(0, 6)
    .map(([cle, f]) => {
      const [a, b] = cle.split("|");
      return { candidats: [a, b], probabilite: pct(f.n), victoire: duels.has(cle) ? { [a]: Math.round((1000 * f.a) / f.n) / 10, [b]: Math.round((1000 * (f.n - f.a)) / f.n) / 10 } : null };
    }),
};

const ancien = JSON.parse(await readFile("data/probabilites.json", "utf-8").catch(() => "{}"));
delete ancien.lastUpdated;
if (JSON.stringify(ancien) === JSON.stringify(sortie)) {
  log("Aucun changement.");
} else {
  await writeFile("data/probabilites.json", JSON.stringify({ lastUpdated: new Date().toISOString(), ...sortie }, null, 2) + "\n");
  log(`data/probabilites.json mis à jour : ${candidats.length} candidats, ${duels.size} duel(s) de second tour.`);
}
