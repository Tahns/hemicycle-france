// Tests du contrôle de cadrage des logos (scripts/fetch-logos.js) et de la cohérence de data/logos.json : aucun accès réseau.
// USAGE : node tests/logos.test.mjs
import assert from "assert";
import { readFileSync } from "fs";
import { dimensionsPng, controlerCadrage } from "../scripts/fetch-logos.js";

// En-tête PNG minimal (signature + IHDR) de dimensions données
const png = (l, h) => { const b = Buffer.alloc(33); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b); b.writeUInt32BE(13, 8); b.write("IHDR", 12, "ascii"); b.writeUInt32BE(l, 16); b.writeUInt32BE(h, 20); return b; };
assert.deepEqual(dimensionsPng(png(330, 97)), { largeur: 330, hauteur: 97 });
assert.equal(dimensionsPng(Buffer.from("pas un png")), null);
assert.equal(dimensionsPng(null), null);
// Les PNG réellement hébergés sont lisibles
for (const id of ["RN", "DEM", "ECO", "EPR"]) assert.ok(dimensionsPng(readFileSync(`icons/partis/${id}.png`)), id);

// Proportions conformes à l'original : ok (marge 8 %)
assert.equal(controlerCadrage({ largeur: 250, hauteur: 80 }, { largeur: 1000, hauteur: 320 }).statut, "ok");
assert.equal(controlerCadrage({ largeur: 260, hauteur: 80 }, { largeur: 1000, hauteur: 320 }).statut, "ok");
// Logo rogné (plus étroit que l'original) ou déformé : à retélécharger
const r = controlerCadrage({ largeur: 200, hauteur: 80 }, { largeur: 1000, hauteur: 320 });
assert.equal(r.statut, "different"); assert.match(r.raison, /rogné ou déformé/);
assert.equal(controlerCadrage({ largeur: 330, hauteur: 97 }, { largeur: 330, hauteur: 160 }).statut, "different");
// Sans dimensions d'origine : seuls les contrôles de forme
assert.equal(controlerCadrage({ largeur: 120, hauteur: 120 }, null).statut, "ok");
assert.equal(controlerCadrage({ largeur: 500, hauteur: 33 }, null).statut, "suspect", "image minuscule en hauteur");
assert.equal(controlerCadrage({ largeur: 900, hauteur: 80 }, null).statut, "suspect", "bande très allongée");
assert.equal(controlerCadrage(null, null).statut, "suspect");

// data/logos.json : chaque entrée a un fichier Commons nommé ; NI n'a pas de logo (jamais inventé)
const { logos } = JSON.parse(readFileSync("data/logos.json", "utf-8"));
for (const [id, l] of Object.entries(logos)) assert.ok(l.fichier && !/^\s*$/.test(l.fichier), `${id} : nom de fichier Commons`);
assert.ok(!("NI" in logos), "NI (non-inscrits) : pas de logo");
console.log("logos : tous les essais passent");
