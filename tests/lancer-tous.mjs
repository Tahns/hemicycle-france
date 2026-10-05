// Lance tous les tests unitaires (tests/*.test.mjs et tests/*.test.js), un processus chacun ; code 1 si l'un échoue.
// USAGE : node tests/lancer-tous.mjs
import { readdirSync } from "fs";
import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const dossier = path.dirname(fileURLToPath(import.meta.url));
const tests = readdirSync(dossier).filter((f) => /\.test\.(mjs|js)$/.test(f)).sort();
let echecs = 0;
for (const t of tests) {
  const r = spawnSync(process.execPath, [path.join(dossier, t)], { encoding: "utf-8", cwd: path.dirname(dossier) });
  if (r.status !== 0) {
    echecs++;
    console.error(`ÉCHEC ${t}\n${(r.stdout || "") + (r.stderr || "")}`);
  } else console.log(`ok ${t}`);
}
if (!tests.length) { console.error("Aucun test trouvé."); process.exit(1); }
console.log(echecs ? `${echecs} test(s) en échec sur ${tests.length}` : `${tests.length} fichier(s) de tests réussis`);
process.exit(echecs ? 1 : 0);
