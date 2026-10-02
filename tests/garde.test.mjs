// Tests de scripts/garde.js et scripts/check-portraits.js sur fixtures. USAGE : node tests/garde.test.mjs
import assert from "assert";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from "fs";
import os from "os";
import path from "path";
import { evaluer, ecrireGarde } from "../scripts/garde.js";
import { verifierPortraits } from "../scripts/check-portraits.js";

const liste = (d) => d.items;
const mk = (n, extra = {}) => ({ items: Array.from({ length: n }, (_, i) => ({ id: i, titre: "t" + i, ...extra })) });
const opt = { liste, obligatoires: ["titre"] };

assert.ok(evaluer(mk(100), mk(100), opt).ok, "identique accepté");
assert.ok(evaluer(mk(100), mk(120), opt).ok, "croissance acceptée");
assert.ok(evaluer(mk(100), mk(70), opt).ok, "chute de 30 % tolérée");
assert.ok(!evaluer(mk(100), mk(69), opt).ok, "chute > 30 % refusée");
assert.ok(!evaluer(mk(100), mk(0), opt).ok, "vide refusé");
assert.ok(!evaluer(mk(100), { items: [] }, opt).ok, "tableau vide refusé");
assert.ok(!evaluer(mk(100), mk(100, { titre: "" }), opt).ok, "champ obligatoire disparu refusé");
assert.ok(evaluer(null, mk(5), opt).ok, "premier fichier accepté");

const dir = mkdtempSync(path.join(os.tmpdir(), "garde-"));
const f = path.join(dir, "d.json");
writeFileSync(f, JSON.stringify(mk(100)));
const sortie = console.error;
console.error = () => {};
assert.strictEqual(await ecrireGarde(f, mk(10), opt), false);
console.error = sortie;
assert.strictEqual(JSON.parse(readFileSync(f, "utf-8")).items.length, 100, "ancien fichier conservé");
assert.strictEqual(process.exitCode, 1, "alerte levée");
process.exitCode = 0;
assert.strictEqual(await ecrireGarde(f, mk(90), opt), true);
assert.strictEqual(JSON.parse(readFileSync(f, "utf-8")).items.length, 90);

// Portraits : photo sans licence = erreur
const ph = path.join(dir, "photos");
mkdirSync(ph);
writeFileSync(path.join(ph, "jean-dupont.jpg"), "x");
writeFileSync(path.join(ph, "anne-orpheline.jpg"), "x");
const pj = path.join(dir, "portraits.json");
writeFileSync(pj, JSON.stringify({ portraits: { "Jean Dupont": { fichier: "J.jpg", licence: "CC BY 4.0", auteur: "X", source: "https://commons.wikimedia.org/wiki/File:J.jpg" } } }));
const e = await verifierPortraits(ph, pj);
assert.strictEqual(e.length, 1);
assert.match(e[0], /anne-orpheline\.jpg.*aucune entrée/);
console.log("[tests garde] OK");
