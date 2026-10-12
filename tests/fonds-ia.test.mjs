// Fonds « une-photo » générés par IA (instagram/modeles/fonds/, js/stories.js : STORY_FONDS_IA) : chaque fond cité existe, en JPEG 1080 × 1920,
// chaque thème d'institution a un fond, et le crédit affiché dit la vérité (« Illustration générée par IA », jamais « Photo : … »). Aucun accès réseau.
// USAGE : node tests/fonds-ia.test.mjs
import assert from "assert";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(path.join(RACINE, "js", "stories.js"), "utf8");

const bloc = /const STORY_FONDS_IA = (\{[\s\S]*?\});/.exec(src);
assert(bloc, "table STORY_FONDS_IA introuvable dans js/stories.js");
const table = Function(`return ${bloc[1]}`)();

const themes = Object.keys(table);
for (const t of ["assemblee", "budget", "election", "international", "securite", "justice", "gouvernement", "senat", "politique"]) assert(themes.includes(t), `thème sans fond : ${t}`);

const jpeg = (f) => { const b = readFileSync(f); assert(b[0] === 0xff && b[1] === 0xd8, `${f} n'est pas un JPEG`); // SOF : dimensions
  for (let i = 2; i < b.length - 9;) { if (b[i] !== 0xff) { i++; continue; } const m = b[i + 1]; if (m >= 0xc0 && m <= 0xc3) return { h: b.readUInt16BE(i + 5), l: b.readUInt16BE(i + 7) }; i += 2 + b.readUInt16BE(i + 2); }
  throw new Error(`dimensions introuvables : ${f}`); };
const vus = new Set();
for (const [theme, fonds] of Object.entries(table)) {
  assert(Array.isArray(fonds) && fonds.length, `${theme} : liste de fonds vide`);
  for (const nom of fonds) {
    assert(/^[\w-]+$/.test(nom), `nom de fond invalide : ${nom}`);
    const f = path.join(RACINE, "instagram", "modeles", "fonds", `${nom}.jpg`);
    assert(existsSync(f), `fond manquant : ${nom}.jpg`);
    if (!vus.has(nom)) { const { l, h } = jpeg(f); assert.strictEqual(`${l}x${h}`, "1080x1920", `${nom}.jpg doit faire 1080 × 1920`); vus.add(nom); }
  }
}
// Le Sénat n'emprunte jamais l'image de l'Assemblée
for (const nom of table.senat) assert(!/hemicycle|palais-bourbon/.test(nom), "le Sénat ne doit pas montrer l'Assemblée");
// Honnêteté du crédit
assert(/STORY_FOND_IA_CREDIT = "Illustration générée par IA"/.test(src), "crédit des fonds IA absent ou modifié");
console.log("ok fonds-ia.test.mjs");
