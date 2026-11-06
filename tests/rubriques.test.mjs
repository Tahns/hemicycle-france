// Tests de scripts/rubriques.cjs (rubrique de presse d'un contenu). USAGE : node tests/rubriques.test.mjs
import { createRequire } from "module";
import assert from "assert";
const { rubriqueDe, RUBRIQUES } = createRequire(import.meta.url)("../scripts/rubriques.cjs");

assert.equal(rubriqueDe(), "Politique");
assert.equal(rubriqueDe("Match de foot"), "Politique");
assert.equal(rubriqueDe("Nouveau sondage Ifop sur 2027"), "Sondage");
assert.equal(rubriqueDe({ chambre: "senat" }), "Sénat");
assert.equal(rubriqueDe({ chambre: "an", titre: "Budget de l'État" }), "Assemblée nationale");
assert.equal(rubriqueDe({ genre: "date" }), "Agenda");
assert.equal(rubriqueDe({ genre: "chiffre" }), "Chiffres");
assert.equal(rubriqueDe({ sondage: true }), "Sondage");
assert.equal(rubriqueDe({ theme: "budget" }), "Budget");
assert.equal(rubriqueDe({ illustration: { theme: "justice" }, articles: [{ titre: "Décision attendue" }] }), "Justice");
assert.equal(rubriqueDe({ illustration: { theme: "politique" }, articles: [{ titre: "Les sénateurs examinent le texte" }] }), "Sénat");
for (const x of ["", "texte", { theme: "inconnu" }, { genre: "quiz" }, { genre: "carrousel-hebdo" }]) assert.ok(RUBRIQUES.includes(rubriqueDe(x)), JSON.stringify(x));
console.log("rubriques : ok");

// Intégration : les fiches portent `rubrique`, et les légendes évitent tirets longs et formules figées
const { hashtags, pied, appel } = createRequire(import.meta.url)("../scripts/legendes.cjs");
for (const s of ["a", "b", "c", "d", "e", "f", "g"]) {
  const h = hashtags({ genre: "loi", chambre: "an", theme: "assemblee", seed: s });
  assert.ok(h.length >= 3 && h.length <= 5, h.join(" "));
  assert.equal(new Set(h.map((x) => x.toLowerCase())).size, h.length);
  assert.ok(!/[—–]/.test(pied("@hemicyclefrance", s) + appel(s)));
  assert.ok(pied("@hemicyclefrance", s).includes("@hemicyclefrance"));
}
console.log("legendes : ok");

const T = createRequire(import.meta.url)("../scripts/titres-propres.cjs");
const sujet = { illustration: { theme: "senat" }, articles: [{ titre: "Les sénateurs examinent le texte", media: "A", url: "https://a.fr/1" }, { titre: "Le Sénat se penche sur le texte", media: "B", url: "https://b.fr/2" }] };
assert.equal(T.enrichirSujet(sujet, [], {}).rubrique, "Sénat");
console.log("enrichirSujet.rubrique : ok");
