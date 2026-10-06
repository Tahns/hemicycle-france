/**
 * site-config.js
 * --------------
 * Lecture et validation de data/site-config.json : l'adresse publique du site (« baseUrl », une seule variable pour les
 * adresses canoniques, le plan du site, les flux et les balises de partage) et la mesure d'audience facultative.
 * Une valeur invalide ne casse rien : on revient à l'adresse GitHub Pages par défaut et la mesure reste désactivée.
 */
import { readFile } from "fs/promises";

export const BASE_URL_DEFAUT = "https://tahns.github.io/hemicycle-france/";
export const FOURNISSEURS = ["goatcounter", "plausible"];

/** Adresse https avec « / » final, sans paramètres ni ancre ; null si elle n'est pas utilisable. */
export function normaliserBaseUrl(v) {
  if (typeof v !== "string" || !v.trim()) return null;
  let u;
  try { u = new URL(v.trim()); } catch (e) { return null; }
  if (u.protocol !== "https:" || u.username || u.password || u.search || u.hash) return null;
  return `${u.origin}${u.pathname.replace(/\/*$/, "/")}`;
}

/** Réglage de mesure d'audience valide, ou null (désactivée). */
export function analyticsValide(a) {
  if (!a || typeof a !== "object") return null;
  const fournisseur = String(a.fournisseur || "").trim().toLowerCase();
  const site = String(a.site || "").trim().toLowerCase();
  if (!fournisseur || !site) return null;
  if (fournisseur === "goatcounter" && /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(site)) return { fournisseur, site };
  if (fournisseur === "plausible" && /^([a-z0-9-]+\.)+[a-z]{2,}$/.test(site)) return { fournisseur, site };
  return null;
}

/** Lit data/site-config.json. `erreurs` liste ce qui a été ignoré (pour le journal et check-data). */
export async function lireSiteConfig(chemin = "data/site-config.json") {
  const erreurs = [];
  let json = {};
  try { json = JSON.parse(await readFile(chemin, "utf-8")); } catch (e) { if (e.code !== "ENOENT") erreurs.push("site-config.json illisible"); }
  const base = normaliserBaseUrl(json.baseUrl);
  if (json.baseUrl && !base) erreurs.push(`baseUrl invalide (« ${json.baseUrl} » : adresse https attendue)`);
  const analytics = analyticsValide(json.analytics);
  if (json.analytics?.fournisseur && !analytics) erreurs.push(`analytics invalide (fournisseur « ${json.analytics.fournisseur} », site « ${json.analytics.site} »)`);
  return { baseUrl: base || BASE_URL_DEFAUT, analytics, erreurs };
}
