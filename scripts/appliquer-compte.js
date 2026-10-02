#!/usr/bin/env node
/**
 * appliquer-compte.js
 * -------------------
 * Met à jour la politique de sécurité (CSP) de index.html d'après data/compte-config.json :
 *  - config absente, vide ou invalide : connect-src 'self' (le site ne contacte que lui-même) ;
 *  - config valide : connect-src 'self' https://<projet>.supabase.co (la seule adresse ajoutée).
 * Seule la directive connect-src est touchée. La redirection vers Google ou Microsoft est une navigation de page,
 * pas une requête fetch : aucun autre domaine n'est à autoriser. Script idempotent, lancé par update-data.yml.
 *
 * USAGE : node scripts/appliquer-compte.js
 */
import { readFile, writeFile } from "fs/promises";
import { configValide } from "../compte-client.js";

export async function lireConfigCompte(chemin = "data/compte-config.json") {
  let brut;
  try { brut = await readFile(chemin, "utf-8"); } catch (e) { return { presente: false, config: null }; }
  if (!brut.trim()) return { presente: false, config: null };
  let json;
  try { json = JSON.parse(brut); } catch (e) { return { presente: true, config: null, erreur: "JSON illisible" }; }
  if (!json || typeof json !== "object" || !Object.keys(json).length) return { presente: false, config: null };
  const config = configValide(json);
  return { presente: true, config, erreur: config ? null : "url (https://<projet>.supabase.co) ou cle_publique invalide" };
}

/** Nouvelle valeur de la balise CSP : connect-src recalculée, le reste inchangé. */
export function appliquerCsp(html, url) {
  return html.replace(/(<meta http-equiv="Content-Security-Policy" content=")([^"]*)(")/, (m, avant, csp, apres) => {
    const nouveau = csp.replace(/connect-src [^;]*/, `connect-src 'self'${url ? " " + url : ""}`);
    return avant + nouveau + apres;
  });
}

export function connectSrc(html) {
  const m = html.match(/<meta http-equiv="Content-Security-Policy" content="[^"]*?connect-src ([^;"]*)/);
  return m ? m[1].trim().split(/\s+/) : null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { presente, config, erreur } = await lireConfigCompte();
  if (presente && !config) { console.error(`[compte] data/compte-config.json invalide (${erreur}) : CSP laissée à 'self'.`); }
  const html = await readFile("index.html", "utf-8");
  const maj = appliquerCsp(html, config?.url);
  if (maj !== html) { await writeFile("index.html", maj); console.log(`[compte] CSP mise à jour : connect-src 'self'${config ? " " + config.url : ""}`); }
  else console.log(`[compte] CSP déjà à jour (${config ? "comptes actifs" : "comptes inactifs"}).`);
  if (presente && !config) process.exit(1);
}
