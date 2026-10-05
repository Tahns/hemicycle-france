/**
 * http.js
 * -------
 * Accès poli aux sources publiques, partagé par les scripts de collecte :
 *  - User-Agent explicite (qui on est, où nous joindre) ;
 *  - délai d'attente sur CHAQUE requête (30 s par défaut) : une source qui ne répond plus ne bloque pas le job ;
 *  - 3 tentatives au plus, et seulement pour les pannes passagères (réseau, délai dépassé, 429, 500, 502, 503, 504) ;
 *    un 403 ou un 404 n'est jamais retenté (on n'insiste pas auprès d'un serveur qui refuse) ;
 *  - 429/503 : l'en-tête Retry-After est respecté (borné à 60 s), sinon attente croissante avec un peu de hasard ;
 *  - sonder() : requêtes conditionnelles (ETag / Last-Modified) pour ne pas retélécharger une grosse archive
 *    qui n'a pas changé depuis le dernier passage.
 *
 * La réponse est rendue telle quelle : l'appelant continue de vérifier `res.ok`.
 */

import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";

export const USER_AGENT = "hemicycle-france-bot/1.0 (https://github.com/Tahns/hemicycle-france)";
export const STATUTS_PASSAGERS = new Set([429, 500, 502, 503, 504]);

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** Attente avant la tentative suivante (ms). Retry-After en secondes ou en date HTTP ; borné à 60 s. Pure (testable). */
export function delaiAvantRepriser(tentative, retryAfter, hasard = Math.random) {
  if (retryAfter) {
    const s = Number(retryAfter);
    const ms = Number.isFinite(s) ? s * 1000 : Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(ms) && ms > 0) return Math.min(ms, 60000);
  }
  return Math.min(1000 * 2 ** (tentative - 1), 20000) + Math.floor(hasard() * 500);
}

/**
 * fetch avec User-Agent, délai d'attente et nouvelles tentatives. Options : celles de fetch, plus
 * { timeoutMs = 30000, tentatives = 3, fetchImpl, attendre } (les deux derniers servent aux tests).
 */
export async function fetchPoli(url, { timeoutMs = 30000, tentatives = 3, fetchImpl = globalThis.fetch, attendre = dormir, headers = {}, signal: _ignore, ...init } = {}) {
  let derniere;
  for (let n = 1; n <= tentatives; n++) {
    try {
      const res = await fetchImpl(url, { ...init, headers: { "User-Agent": USER_AGENT, ...headers }, signal: AbortSignal.timeout(timeoutMs) });
      if (!STATUTS_PASSAGERS.has(res.status) || n === tentatives) return res;
      derniere = new Error(`HTTP ${res.status}`);
      await res.body?.cancel?.().catch(() => {});
      await attendre(delaiAvantRepriser(n, res.headers?.get?.("retry-after")));
    } catch (e) {
      derniere = e;
      if (n === tentatives) break;
      await attendre(delaiAvantRepriser(n));
    }
  }
  const cause = derniere?.name === "TimeoutError" ? `délai de ${timeoutMs / 1000} s dépassé` : derniere?.message || "erreur réseau";
  throw new Error(`${url} : ${cause} (${tentatives} tentative(s))`);
}

// ---------- Requêtes conditionnelles ----------

const DOSSIER_CACHE = () => process.env.HTTP_CACHE_DIR || ".cache/http";
const FICHIER_VALIDATEURS = () => path.join(DOSSIER_CACHE(), "validateurs.json");
/** Au-delà de cet âge, on retélécharge quoi qu'en dise le serveur (reprise après une panne, source qui ment). */
export const AGE_MAX_H = 6;

async function lireCache() {
  try { return JSON.parse(await readFile(FICHIER_VALIDATEURS(), "utf-8")) || {}; } catch { return {}; }
}

/**
 * Demande aux serveurs (requête HEAD conditionnelle, quelques octets) si les sources ont changé depuis le dernier
 * traitement réussi. Renvoie { inchange, valider } :
 *  - inchange = true seulement si TOUTES les adresses répondent 304 (ou renvoient les mêmes validateurs) et que le
 *    dernier traitement complet date de moins de AGE_MAX_H heures ; au moindre doute (pas de validateur, 405, panne,
 *    première fois) : false, et le script travaille comme avant ;
 *  - valider() : à appeler À LA FIN d'un traitement réussi, pour mémoriser les validateurs. Sans cet appel (échec du
 *    script), la source sera retraitée au prochain passage.
 * La mémoire vit dans .cache/http (conservée d'un passage à l'autre par actions/cache dans les workflows).
 */
export async function sonder(urls, { fetchImpl, maintenant = Date.now() } = {}) {
  const memoire = await lireCache();
  const nouveaux = {};
  let inchange = true;
  for (const url of urls) {
    const connu = memoire[url];
    const entetes = {};
    if (connu?.etag) entetes["If-None-Match"] = connu.etag;
    if (connu?.lastModified) entetes["If-Modified-Since"] = connu.lastModified;
    let res;
    try { res = await fetchPoli(url, { method: "HEAD", headers: entetes, timeoutMs: 20000, tentatives: 2, fetchImpl }); } catch { inchange = false; continue; }
    const etag = res.headers.get("etag"), lastModified = res.headers.get("last-modified");
    const memeValidateurs = res.status === 200 && (etag || lastModified) && etag === (connu?.etag || null) && lastModified === (connu?.lastModified || null);
    if (!(connu?.etag || connu?.lastModified) || !(res.status === 304 || memeValidateurs)) inchange = false;
    if (etag || lastModified) nouveaux[url] = { etag, lastModified };
    else if (res.status === 304 && connu) nouveaux[url] = { etag: connu.etag || null, lastModified: connu.lastModified || null };
  }
  const dernier = Math.min(...urls.map((u) => Date.parse(memoire[u]?.verifieLe) || 0));
  if (maintenant - dernier > AGE_MAX_H * 36e5) inchange = false;
  return {
    inchange,
    async valider() {
      const suite = await lireCache();
      for (const [u, v] of Object.entries(nouveaux)) suite[u] = { ...v, verifieLe: new Date(inchange ? (Date.parse(memoire[u]?.verifieLe) || maintenant) : maintenant).toISOString() };
      await mkdir(DOSSIER_CACHE(), { recursive: true });
      await writeFile(FICHIER_VALIDATEURS(), JSON.stringify(suite, null, 1) + "\n");
    },
  };
}

// ---------- Relevés trop rapprochés ----------

/**
 * Vrai si `cle` a déjà été relevée il y a moins de `minutes` minutes (mémoire .cache/http/releves.json).
 * Sert à éviter qu'un déclenchement supplémentaire (workflow_run) ne double un relevé qui vient d'avoir lieu.
 */
export async function releveRecent(cle, minutes, { maintenant = Date.now() } = {}) {
  try {
    const t = Date.parse(JSON.parse(await readFile(path.join(DOSSIER_CACHE(), "releves.json"), "utf-8"))[cle]);
    return !isNaN(t) && maintenant - t < minutes * 60000;
  } catch { return false; }
}

/** Note l'heure d'un relevé réussi. */
export async function noterReleve(cle, { maintenant = Date.now() } = {}) {
  const f = path.join(DOSSIER_CACHE(), "releves.json");
  let o = {};
  try { o = JSON.parse(await readFile(f, "utf-8")) || {}; } catch {}
  o[cle] = new Date(maintenant).toISOString();
  await mkdir(DOSSIER_CACHE(), { recursive: true });
  await writeFile(f, JSON.stringify(o, null, 1) + "\n");
}
