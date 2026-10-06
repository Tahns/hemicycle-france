/**
 * flux-atom.js
 * ------------
 * Briques communes au résumé hebdomadaire (digest-hebdo.js) et aux flux d'alertes (flux-alertes.js) :
 * adresse du site, échappement, mise en forme des dates, génération d'un flux Atom, écriture « seulement si changé ».
 * Aucune lecture réseau ; fonctions pures sauf ecrireSiChange.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import path from "path";

const [PROPRIO, DEPOT] = (process.env.GITHUB_REPOSITORY || "Tahns/hemicycle-france").split("/");
// Même règle que scripts/partage.cjs : domaine propre (CNAME) sinon adresse GitHub Pages du dépôt
function adresseSite(racine = ".") {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/?$/, "/");
  const cname = path.join(racine, "CNAME");
  if (existsSync(cname)) return `https://${readFileSync(cname, "utf-8").trim().split(/\s+/)[0]}/`;
  return `https://${PROPRIO.toLowerCase()}.github.io/${DEPOT}/`;
}
export const SITE = adresseSite();
export const NOM_SITE = "Hémicycle France";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const nombre = (n) => Number(n).toLocaleString("fr-FR").replace(/[  ]/g, " ");
export const majuscule = (t) => { const s = String(t || "").trim(); return s ? s[0].toLocaleUpperCase("fr-FR") + s.slice(1) : s; };
export const coupe = (t, n) => { const s = String(t || "").replace(/\s+/g, " ").trim(); return s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…"; };

/** « 2026-10-05 » -> « 5 octobre 2026 » */
export function dateLongue(iso) {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).replace(/^1 /, "1er ");
}
/** « 2026-10-05 » -> « lundi 5 octobre » */
export function dateCourte(iso) {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).replace(/ 1 /, " 1er ");
}

/**
 * Flux Atom 1.0.
 * @param {{titre:string, sousTitre?:string, id:string, self:string, alternate:string, updated:string, entrees:Array<{id:string,titre:string,lien:string,updated:string,resume?:string}>}} f
 */
export function atom(f) {
  const entrees = f.entrees.map((e) => `  <entry>
    <id>${esc(e.id)}</id>
    <title>${esc(e.titre)}</title>
    <link href="${esc(e.lien)}"/>
    <updated>${esc(e.updated)}</updated>${e.resume ? `\n    <summary>${esc(e.resume)}</summary>` : ""}
  </entry>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="fr">
  <id>${esc(f.id)}</id>
  <title>${esc(f.titre)}</title>${f.sousTitre ? `\n  <subtitle>${esc(f.sousTitre)}</subtitle>` : ""}
  <link rel="self" type="application/atom+xml" href="${esc(f.self)}"/>
  <link rel="alternate" type="text/html" href="${esc(f.alternate)}"/>
  <updated>${esc(f.updated)}</updated>
  <author><name>${esc(NOM_SITE)}</name></author>
${entrees}
</feed>
`;
}

/** Écrit le fichier seulement si le contenu change (pas de commit inutile) ; crée les dossiers. Renvoie true si écrit. */
export function ecrireSiChange(fichier, contenu) {
  if (existsSync(fichier) && readFileSync(fichier, "utf-8") === contenu) return false;
  mkdirSync(path.dirname(fichier), { recursive: true });
  writeFileSync(fichier, contenu);
  return true;
}
