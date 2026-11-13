import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { estUtile } = createRequire(import.meta.url)("../scripts/utilite.cjs");
const u = (...t) => estUtile(t).utile;
// utile : vie politique nationale
assert(u("Projet de loi de finances : les députés rejettent l'article 3"));
assert(u("Présidentielle 2027 : Gérald Darmanin dénonce la dérive de Jean-Luc Mélenchon"));
assert(u("Manifestations du 31 octobre : les cortèges se sont bien déroulés selon Nuñez"));
assert(u("Mobilisations sociales : la grève du 5 novembre", "Grève : ce que dit le gouvernement"));
// pas utile : culture, sport, local, fait divers
assert(!u("Le prix Goncourt 2026 est attribué à Philippe Jaenada pour son roman"));
assert(!u("Football : le PSG s'impose en Ligue des champions"));
assert(!u("Siltzheim. La végétalisation de l'aire de jeux actée en conseil municipal"));
assert(!u("La croisière de rêve tourne au cauchemar : 2000 passagers débarqués"));
// un repère politique sauve un sujet qui cite aussi du hors-sujet
assert(u("Le ministre de la Culture réagit à l'attribution du prix Goncourt"));
// majorité de titres hors-sujet : écarté
assert(!estUtile(["Match de rugby : le gouvernement félicite les Bleus", "Rugby : la victoire du XV de France", "Rugby : les réactions après le match"]).utile);
assert(!estUtile([]).utile);
console.log("utilite : tous les tests passent.");
