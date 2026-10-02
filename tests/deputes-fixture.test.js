// Vérifie l'extraction de la naissance et de la profession sur un jeu d'essai (l'open data de l'Assemblée n'est pas joignable ici).
import { readFile } from "fs/promises";
import assert from "assert";
import { naissanceEtProfession } from "../scripts/deputes.js";

const { acteur } = JSON.parse(await readFile(new URL("./fixtures/acteur-extrait.json", import.meta.url), "utf-8"));
assert.deepStrictEqual(naissanceEtProfession(acteur), { naissance: "1970-05-17", profession: "Avocat" });
assert.deepStrictEqual(naissanceEtProfession({ etatCivil: { infoNaissance: { dateNais: "n'importe quoi" } }, profession: { libelleCourant: "  " } }), {});
assert.deepStrictEqual(naissanceEtProfession({}), {});
console.log("[test] deputes : naissance et profession OK");
