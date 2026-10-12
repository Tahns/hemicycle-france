// Tests de scripts/veille-sondages.js : lecture du commanditaire dans le texte de la notice. USAGE : node tests/veille-sondages.test.mjs
import assert from "assert";
import { commanditaireNotice } from "../scripts/veille-sondages.js";

assert.strictEqual(commanditaireNotice("Intentions de vote Etude réalisée pour M6 & RTL 12 octobre 2026 Département Politique"), "M6 et RTL");
assert.strictEqual(commanditaireNotice("mentionner le nom de l’institut et du commanditaire « Toluna Harris Interactive pour M 6 et RTL » fin"), "M6 et RTL");
assert.strictEqual(commanditaireNotice("Étude réalisée pour Le Figaro du 25 au 29 septembre"), "Le Figaro");
assert.strictEqual(commanditaireNotice("aucune mention de commanditaire ici"), null);
console.log("veille-sondages : tous les tests passent.");
