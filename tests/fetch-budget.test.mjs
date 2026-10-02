// Tests de scripts/fetch-budget.js sur un jeu d'essai FICTIF (chiffres inventés, uniquement pour les tests).
// USAGE : node tests/fetch-budget.test.mjs            (vérifie)
//         node tests/fetch-budget.test.mjs --ecrire   (régénère tests/fixtures/budget-essai.json)
import assert from "assert";
import { writeFileSync } from "fs";
import { lireJsonStat, construire } from "../scripts/fetch-budget.js";

// Fabrique une réponse JSON-stat (format Eurostat) à partir de dimensions et d'une fonction de valeur
function jsonStat(dims, valeur) {
  const id = Object.keys(dims), size = id.map((k) => dims[k].length), value = {};
  const total = size.reduce((a, b) => a * b, 1);
  for (let flat = 0; flat < total; flat++) {
    let reste = flat; const coord = {};
    for (let k = id.length - 1; k >= 0; k--) { coord[id[k]] = dims[id[k]][reste % size[k]]; reste = Math.floor(reste / size[k]); }
    const v = valeur(coord);
    if (v !== undefined) value[flat] = v;
  }
  return { id, size, value, dimension: Object.fromEntries(id.map((k) => [k, { category: { index: Object.fromEntries(dims[k].map((c, i) => [c, i])) } }])) };
}

const ANNEES = ["2018", "2019", "2020", "2021", "2022", "2023"];
// Dépenses fictives (M€) : total 1 000 000, réparties en parts rondes
const PARTS = { GF01: 0.13, GF02: 0.03, GF03: 0.04, GF04: 0.08, GF05: 0.02, GF06: 0.02, GF07: 0.15, GF08: 0.03, GF09: 0.1, GF10: 0.4 };
const exp = lireJsonStat(jsonStat({ cofog99: ["TOTAL", ...Object.keys(PARTS), "GF0107"], time: ANNEES }, ({ cofog99, time }) => {
  const k = 1 + ANNEES.indexOf(time) / 100;
  if (cofog99 === "TOTAL") return 1e6 * k;
  if (cofog99 === "GF0107") return 20000 * k;
  return PARTS[cofog99] * 1e6 * k;
}));
const main = lireJsonStat(jsonStat({ na_item: ["TR", "TE", "B9"], unit: ["MIO_EUR", "PC_GDP"], time: ANNEES }, ({ na_item, unit, time }) => {
  const k = 1 + ANNEES.indexOf(time) / 100, pib = 2e7 * k;
  const v = { TR: 0.95e6 * k, TE: 1e6 * k, B9: -0.05e6 * k }[na_item];
  return unit === "MIO_EUR" ? v : (v / pib) * 100;
}));
const dette = lireJsonStat(jsonStat({ unit: ["MIO_EUR", "PC_GDP"], time: ANNEES }, ({ unit, time }) => {
  const k = 1 + ANNEES.indexOf(time) / 100;
  return unit === "MIO_EUR" ? 2.4e7 * k : 120 * (k / k);
}));

assert.equal(exp.length, 12 * 6, "décodage JSON-stat : toutes les cellules");
assert.equal(exp.find((l) => l.cofog99 === "GF10" && l.time === "2020").value, 0.4e6 * 1.02);

const b = construire({ exp, main, dette }, new Date("2026-10-02"));
assert.equal(b.anneeReference, 2023);
assert.equal(b.depenses.totalMd, 1050);
assert.equal(b.depenses.postes.length, 11);
assert.equal(b.depenses.postes[0].code, "GF10");
assert.ok(Math.abs(b.depenses.postes.reduce((s, p) => s + p.pct, 0) - 100) < 0.6, "les parts font 100 %");
assert.equal(b.depenses.postes.find((p) => p.code === "GF01").pct, 11, "services généraux hors dette = 13 % − 2 %");
assert.equal(b.equilibre.soldeMd, -52.5);
assert.equal(b.serie.annees.length, 6);
assert.ok(/^https:\/\//.test(b.depenses.url) && b.depenses.source);

// Réponses dégradées : refus net, jamais de chiffre approximatif
assert.throws(() => construire({ exp: [], main, dette }), /aucune année complète/);
assert.throws(() => construire({ exp, main: main.filter((l) => l.na_item !== "B9"), dette }), /aucune année complète/);
assert.throws(() => construire({ exp: exp.map((l) => (l.cofog99 === "GF02" ? { ...l, value: l.value * 2 } : l)), main, dette }), /somme des fonctions/);
assert.throws(() => construire({ exp, main: main.map((l) => (l.na_item === "B9" && l.unit === "MIO_EUR" ? { ...l, value: 1 } : l)), dette }), /solde/);
assert.throws(() => lireJsonStat({ error: "x" }), /inattendue/);

if (process.argv.includes("--ecrire")) {
  const essai = { ...b, lastUpdated: "2026-10-02T00:00:00.000Z" };
  for (const bloc of [essai.depenses, essai.equilibre, essai.dette, essai.serie]) { bloc.source = "JEU D'ESSAI fictif (chiffres inventés pour les tests, ne pas publier)"; bloc.url = "https://example.org/jeu-d-essai"; }
  writeFileSync(new URL("./fixtures/budget-essai.json", import.meta.url), JSON.stringify(essai, null, 2) + "\n");
  console.log("tests/fixtures/budget-essai.json écrit.");
}
console.log("fetch-budget : tests OK.");
