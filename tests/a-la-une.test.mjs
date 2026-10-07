// Tests de scripts/suggestions-a-la-une.cjs et de la liste des rubriques « à la une ». USAGE : node --test tests/a-la-une.test.mjs
import test from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { THEME_VERS_RUBRIQUE, rubriqueDepuisTheme, rubriqueDepuisTitre, rubriqueDepuisType, recommander, construire, semaineIso } = require("../scripts/suggestions-a-la-une.cjs");
const { RUBRIQUES } = require("../scripts/a-la-une-rubriques.cjs");

const IDS = RUBRIQUES.map((r) => r.id);

test("rubriques : 8 rubriques, libellés de 13 caractères au plus, identifiants uniques, pas de nom de personne", () => {
  assert.strictEqual(RUBRIQUES.length, 8);
  assert.strictEqual(new Set(IDS).size, IDS.length);
  for (const r of RUBRIQUES) {
    assert.ok(r.libelle.length <= 13, `${r.id} : libellé trop long`);
    assert.ok(r.icone.includes("<"), `${r.id} : icône manquante`);
  }
  assert.ok(!RUBRIQUES.some((r) => /macron|bardella|le pen|m[eé]lenchon/i.test(r.libelle + r.description)));
});

test("thème d'illustration -> rubrique : tous les thèmes de actualites.json sont couverts, cibles existantes", () => {
  assert.strictEqual(rubriqueDepuisTheme("assemblee"), "elus");
  assert.strictEqual(rubriqueDepuisTheme("senat"), "elus");
  assert.strictEqual(rubriqueDepuisTheme("gouvernement"), "actu");
  assert.strictEqual(rubriqueDepuisTheme("budget"), "argent");
  assert.strictEqual(rubriqueDepuisTheme("justice"), "actu");
  assert.strictEqual(rubriqueDepuisTheme("election"), "presidentielle");
  assert.strictEqual(rubriqueDepuisTheme("international"), "actu");
  assert.strictEqual(rubriqueDepuisTheme("securite"), "actu");
  assert.strictEqual(rubriqueDepuisTheme("politique"), null, "thème générique : on regarde le titre");
  assert.strictEqual(rubriqueDepuisTheme("inconnu"), null);
  assert.strictEqual(rubriqueDepuisTheme(undefined), null);
  for (const cible of Object.values(THEME_VERS_RUBRIQUE)) if (cible) assert.ok(IDS.includes(cible));
});

test("titre -> rubrique (accents et casse ignorés)", () => {
  assert.strictEqual(rubriqueDepuisTitre("Budget 2027: le PS appelle à modifier le texte"), "argent");
  assert.strictEqual(rubriqueDepuisTitre("Sondage Ifop : intentions de vote au 1er tour"), "sondages");
  assert.strictEqual(rubriqueDepuisTitre("Présidentielle 2027. Une grande coalition ?"), "presidentielle");
  assert.strictEqual(rubriqueDepuisTitre("Énergie. Prix à la pompe : le G7 agit"), "actu");
  assert.strictEqual(rubriqueDepuisTitre("Tribunal : décision attendue"), "actu");
  assert.strictEqual(rubriqueDepuisTitre("Le chômage recule"), "actu");
  assert.strictEqual(rubriqueDepuisTitre("Quiz : savez-vous comment on vote ?"), "quiz");
  assert.strictEqual(rubriqueDepuisTitre("Un titre sans mot-clé"), null);
  assert.strictEqual(rubriqueDepuisTitre(""), null);
});

test("type -> rubrique : post date, post loi, sondage, quiz, simulation", () => {
  assert.strictEqual(rubriqueDepuisType({ id: "x1", type: "post", titre: "Élections municipales, le 15 mars" }), "agenda");
  assert.strictEqual(rubriqueDepuisType({ id: "x2", type: "post", titre: "Loi sur les retraites : adoptée" }), "elus");
  assert.strictEqual(rubriqueDepuisType({ id: "date-a-retenir-0510", type: "story" }), "agenda");
  assert.strictEqual(rubriqueDepuisType({ id: "x3", type: "story", titre: "Sondage Odoxa · intentions de vote" }), "sondages");
  assert.strictEqual(rubriqueDepuisType({ id: "probabilites-1", type: "story" }), "presidentielle");
  assert.strictEqual(rubriqueDepuisType({ id: "abc", type: "story", titre: "Blocus des lycées" }), null);
});

test("recommander : le type prime, puis un titre explicite, puis le thème, puis le titre, puis Politique", () => {
  assert.strictEqual(recommander({ id: "p", type: "post", titre: "Budget : loi rejetée" }, "argent").rubrique, "elus");
  assert.strictEqual(recommander({ id: "a", type: "story", titre: "Sondage : Attal progresse" }, "election").rubrique, "sondages");
  const t = recommander({ id: "b", type: "story", titre: "Blocus des lycées" }, "assemblee");
  assert.deepStrictEqual([t.rubrique, t.source, t.confiance], ["elus", "theme", "haute"]);
  const m = recommander({ id: "c", type: "story", titre: "Budget 2027 : le PS veut des changements" }, "politique");
  assert.deepStrictEqual([m.rubrique, m.source, m.confiance], ["argent", "titre", "moyenne"]);
  const d = recommander({ id: "d", type: "story", titre: "Blocus des lycées" }, null);
  assert.deepStrictEqual([d.rubrique, d.source, d.confiance], ["actu", "defaut", "faible"]);
  assert.strictEqual(d.libelle, "Actualité");
});

test("semaine ISO", () => {
  assert.strictEqual(semaineIso(new Date("2026-10-06T10:00:00Z")), "2026-W41");
  assert.strictEqual(semaineIso(new Date("2026-01-01T10:00:00Z")), "2026-W01");
});

test("construire : fenêtre de 7 jours, jointure avec la file et le thème, perimées ignorées", () => {
  const maintenant = new Date("2026-10-06T18:00:00Z");
  const registre = { entrees: [
    { id: "s1", statut: "publiee", publieLe: "2026-10-05T08:00:00.000Z" },
    { id: "s2", statut: "publiee", publieLe: "2026-09-20T08:00:00.000Z" },
    { id: "s3", statut: "perimee", publieLe: null },
    { id: "date-a-retenir-0510", statut: "publiee", publieLe: "2026-10-05T11:00:00.000Z" },
  ] };
  const file = { entrees: [{ id: "s1", type: "story", titre: "Titre de presse", titrePropre: "Débat à l'Assemblée", dossierId: "d1" }] };
  const actualites = {
    sujets: [{ illustration: { theme: "assemblee" }, articles: [{ titre: "Titre de presse" }] }],
    dossiers: [{ id: "d1", articles: [{ titre: "Titre de presse" }] }],
  };
  const r = construire({ registre, file, actualites }, maintenant);
  assert.strictEqual(r.entrees.length, 3, "les entrées périmées sont ignorées");
  assert.deepStrictEqual(r.aAjouterCetteSemaine.map((e) => e.id), ["s1", "date-a-retenir-0510"], "ordre chronologique, 7 derniers jours seulement");
  assert.strictEqual(r.aAjouterCetteSemaine[0].rubrique, "elus");
  assert.strictEqual(r.aAjouterCetteSemaine[1].rubrique, "agenda");
  assert.deepStrictEqual(r.parRubrique.elus, ["s1"]);
  assert.strictEqual(r.semaine, "2026-W41");
  assert.deepStrictEqual(Object.keys(r.parRubrique), IDS);
});
