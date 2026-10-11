// Tests de scripts/alerte-gros-sujets.cjs : un gros sujet non couvert est signalé ; couvert, trop frais ou trop petit : non. USAGE : node tests/alerte-gros-sujets.test.mjs
import assert from "assert";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { grosSujetsNonCouverts } = require("../scripts/alerte-gros-sujets.cjs");
const AUTO = require("../scripts/stories-auto.cjs");

const now = new Date("2026-10-11T18:00:00Z");
const il_y_a = (min) => new Date(now.getTime() - min * 6e4).toISOString();
const MEDIAS = ["Le Monde", "BFMTV", "Libération", "Le Figaro", "France 24"];
const sujet = (titre, nb, age = 60) => ({ derniere: il_y_a(age), titrePropre: { titre: "Primaire : ce que disent les médias", generique: true }, articles: Array.from({ length: nb }, (_, i) => ({ titre: i ? `${titre} (suite ${i})` : titre, media: MEDIAS[i % 5], url: `https://ex.org/${encodeURIComponent(titre)}/${i}`, date: il_y_a(age) })) });
const vide = { entrees: [] };
const seuil = 4;

assert.strictEqual(grosSujetsNonCouverts({ actualites: { sujets: [sujet("Raphaël Glucksmann élu dès le premier tour", 4)] }, file: vide, registre: null, now, seuil }).length, 1, "gros sujet non publié : signalé");
assert.strictEqual(grosSujetsNonCouverts({ actualites: { sujets: [sujet("Raphaël Glucksmann élu dès le premier tour", 3)] }, file: vide, registre: null, now, seuil }).length, 0, "sous le seuil : pas de signalement");
assert.strictEqual(grosSujetsNonCouverts({ actualites: { sujets: [sujet("Raphaël Glucksmann élu dès le premier tour", 4, 5)] }, file: vide, registre: null, now, seuil }).length, 0, "trop frais : la file va le traiter");
assert.strictEqual(grosSujetsNonCouverts({ actualites: { sujets: [sujet("Raphaël Glucksmann élu dès le premier tour", 4, 13 * 60)] }, file: vide, registre: null, now, seuil }).length, 0, "trop ancien : plus d'alerte");

// couvert par une entrée de la file (même lien d'article)
const s = sujet("Raphaël Glucksmann élu dès le premier tour", 4);
const publie = { entrees: [{ id: "a".repeat(12), cree: il_y_a(30), type: "story", titre: "x", sources: [s.articles[1].url] }] };
assert.strictEqual(grosSujetsNonCouverts({ actualites: { sujets: [s] }, file: publie, registre: null, now, seuil }).length, 0, "couvert par un lien d'article");

// couvert par une publication de même sujet (résultat déjà publié)
const memeResultat = { entrees: [{ id: "b".repeat(12), cree: il_y_a(30), type: "story", titre: "Raphaël Glucksmann élu dès le premier tour", sujets: ["Primaire de la gauche : Raphaël Glucksmann élu dès le premier tour avec 66 % des voix"] }] };
assert.strictEqual(grosSujetsNonCouverts({ actualites: { sujets: [s] }, file: memeResultat, registre: null, now, seuil }).length, 0, "résultat déjà publié : couvert");

// seule l'avant-première est publiée : le résultat n'est pas couvert
const avant = { entrees: [{ id: "c".repeat(12), cree: il_y_a(300), type: "story", titre: "Glucksmann espère l’emporter dès le premier tour", sujets: ["Primaire sociale-démocrate : Raphaël Glucksmann espère l’emporter dès le premier tour ce soir"] }] };
assert.strictEqual(grosSujetsNonCouverts({ actualites: { sujets: [s] }, file: avant, registre: null, now, seuil }).length, 1, "avant-première seule publiée : le résultat est signalé");

// le seuil vient de la config livrée
assert.ok(AUTO.grosSujetMedias() >= 3);
console.log("alerte-gros-sujets : tous les tests passent.");
