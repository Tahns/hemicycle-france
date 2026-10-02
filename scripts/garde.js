/**
 * garde.js
 * --------
 * Garde-fou partagé des scripts de collecte : on n'écrase JAMAIS un bon fichier par un fichier
 * vide ou dégradé quand une source change de format.
 *
 * Un nouveau contenu est refusé (l'ancien fichier est conservé, le script sort en erreur, ce qui
 * déclenche l'alerte GitHub) si :
 *  - il ne contient aucun élément ;
 *  - le nombre d'éléments chute de plus de `seuil` (30 % par défaut) par rapport à l'ancien ;
 *  - un champ obligatoire disparaît : sa présence recule de plus de 10 points par rapport à l'ancien
 *    fichier (ou, sans ancien fichier, il manque sur plus de 10 % des éléments).
 */

import { readFile, writeFile } from "fs/promises";

const present = (v) => v !== undefined && v !== null && v !== "" && !(typeof v === "number" && Number.isNaN(v));
const taux = (items, champ) => (items.length ? items.filter((x) => present(x?.[champ])).length / items.length : 1);

/** Compare un nouveau contenu à l'ancien. Renvoie { ok, raisons }. Fonction pure (testable). */
export function evaluer(ancien, nouveau, { liste, obligatoires = [], seuil = 0.3, videPermis = false }) {
  const raisons = [];
  const n = liste(nouveau) || [];
  const a = ancien ? liste(ancien) || [] : [];
  if (!Array.isArray(n)) raisons.push("liste absente du nouveau contenu");
  else if (n.length === 0) {
    // Un fichier d'événements ponctuels (data/direct.json) est légitimement vide quand rien n'est en cours
    if (!videPermis) raisons.push("aucun élément dans le nouveau contenu");
  } else {
    if (a.length > 0 && n.length < a.length * (1 - seuil)) {
      raisons.push(`nombre d'éléments en chute de ${Math.round((1 - n.length / a.length) * 100)} % (${a.length} → ${n.length}, seuil ${Math.round(seuil * 100)} %)`);
    }
    for (const champ of obligatoires) {
      const tn = taux(n, champ);
      const ta = a.length ? taux(a, champ) : 1;
      if (tn < ta - 0.1) raisons.push(`champ obligatoire « ${champ} » disparu (présent sur ${Math.round(tn * 100)} % des éléments, contre ${Math.round(ta * 100)} % avant)`);
    }
  }
  return { ok: raisons.length === 0, raisons };
}

/**
 * Écrit `fichier` seulement si le nouveau contenu est sain. `texte` est la sérialisation à écrire
 * (JSON.stringify par défaut). Renvoie true si le fichier a été écrit ; sinon l'ancien est conservé,
 * un message d'alerte est émis et le code de sortie du processus passe à 1.
 */
export async function ecrireGarde(fichier, nouveau, { nom = fichier, texte, ...options }) {
  const ancien = JSON.parse(await readFile(fichier, "utf-8").catch(() => "null"));
  const { ok, raisons } = evaluer(ancien, nouveau, options);
  if (!ok) {
    const msg = `${nom} : écriture REFUSÉE, ancien fichier conservé — ${raisons.join(" ; ")}. La source a probablement changé de format.`;
    console.error(`[garde] ${msg}`);
    console.error(`::warning::${msg}`);
    process.exitCode = 1;
    return false;
  }
  await writeFile(fichier, texte ?? JSON.stringify(nouveau, null, 2) + "\n");
  return true;
}
