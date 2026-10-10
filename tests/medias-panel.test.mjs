// Panel des médias de scripts/fetch-actualites.js : chaque flux a un id unique, une adresse https, un domaine connu de data/medias-connus.json ;
// les flux généralistes portent un filtre « vie politique ». Lecture du texte du script (il se lance à l'import) : aucun accès réseau.
// USAGE : node tests/medias-panel.test.mjs
import assert from "assert";
import { readFileSync } from "fs";

const src = readFileSync("scripts/fetch-actualites.js", "utf-8");
const bloc = src.slice(src.indexOf("const MEDIAS = ["), src.indexOf("\n];", src.indexOf("const MEDIAS = [")));
const lignes = [...bloc.matchAll(/\{ id: "([^"]+)", nom: "([^"]+)", flux: "([^"]+)", domaine: "([^"]+)"([^}]*)\}/g)].map((m) => ({ id: m[1], nom: m[2], flux: m[3], domaine: m[4], filtre: /filtre/.test(m[5]) }));
assert.ok(lignes.length >= 25, `panel élargi : ${lignes.length} flux`);
assert.equal(new Set(lignes.map((l) => l.id)).size, lignes.length, "ids uniques");
assert.equal(new Set(lignes.map((l) => l.nom)).size, lignes.length, "noms uniques");
const connus = JSON.parse(readFileSync("data/medias-connus.json", "utf-8")).medias;
for (const l of lignes) {
  assert.match(l.flux, /^https:\/\//, `${l.id} : flux en https`);
  const hote = new URL(l.flux).hostname.replace(/^www\./, "");
  assert.ok(hote === l.domaine || hote.endsWith("." + l.domaine) || l.id === "hugodecrypte", `${l.id} : le flux est sur le domaine du média`);
  if (l.id !== "hugodecrypte") assert.ok(connus.some((m) => m.domaine === l.domaine), `${l.id} : domaine absent de data/medias-connus.json`);
}
// Sensibilités variées (audit de neutralité) : presse de gauche, de droite, chrétienne, régionale de l'Ouest et du Sud-Ouest
for (const id of ["humanite", "lefigaro", "lacroix", "ouestfrance", "valeursactuelles", "lejdd", "liberation", "ladepeche", "letelegramme"]) assert.ok(lignes.some((l) => l.id === id), `${id} dans le panel`);
// Flux généralistes : filtre politique obligatoire
for (const id of ["humanite", "lacroix", "ouestfrance", "ladepeche", "valeursactuelles", "lejdd", "europe1", "franceinter"]) assert.ok(lignes.find((l) => l.id === id)?.filtre, `${id} : filtre vie politique`);
// Le filtre garde la politique et écarte le reste
const FILTRE = new RegExp(src.match(/const FILTRE_POLITIQUE = \/(.*)\/i;/)[1], "i");
for (const t of ["Budget 2027 : le gouvernement recule", "Marine Le Pen à l'Assemblée nationale", "Motion de censure : le vote", "Présidentielle : Retailleau candidat"]) assert.ok(FILTRE.test(t), t);
for (const t of ["Cyclisme : victoire au Tour de Lombardie", "Météo : un week-end pluvieux", "Recette de la tarte aux pommes"]) assert.ok(!FILTRE.test(t), t);
console.log("médias : tous les essais passent");
