#!/usr/bin/env node
/**
 * valider-brouillon.cjs
 * ---------------------
 * Validation HUMAINE d'un geste d'un brouillon d'Instagram (instagram/brouillons/<id>.jpg + .json), écrit par stories-auto.cjs
 * (sujet sensible de niveau 2, personne nommée, validation humaine) ou par story-a-la-demande.cjs. Lancé par
 * .github/workflows/valider-brouillon.yml (workflow_dispatch : id du brouillon, action « publier » ou « rejeter »).
 *
 *  - « publier » : le brouillon entre dans la file de publication (data/instagram-file.json, image dans instagram/auto/<id>.jpg,
 *    entrée « story » ou « post » marquée valideHumain: true). La publication suit ensuite les règles habituelles de publier-stories.cjs :
 *    7 h – 23 h (Paris), 60 min entre deux publications, registre sans doublon, plafonds. Une story non publiée dans les 3 h est périmée :
 *    on ne valide donc pas une story le soir tard (refus après 21 h et avant 7 h, heure de Paris).
 *  - « rejeter » : le brouillon (image et fiche) est supprimé ; le sujet est noté dans data/instagram-rejetes.json (non reproposé 7 jours).
 * Refus (code de sortie 1, message clair) : id invalide ou inconnu, brouillon de plus de 48 h, déjà en file ou déjà publié,
 * sujet de sondage pendant la réserve électorale, presse en monétisation, image absente ou aux mauvaises dimensions.
 *
 * USAGE : node scripts/valider-brouillon.cjs <id> <publier|rejeter>
 */
const fs = require("fs");
const path = require("path");
const stories = require("./stories-auto.cjs");

const RACINE_DEFAUT = stories.RACINE;
const GARDER = stories.GARDER;
const AGE_MAX_H = 48;
const HEURE_MIN = 7, HEURE_MAX_STORY = 21;
const URL_IMAGE = (id) => `https://tahns.github.io/hemicycle-france/instagram/auto/${id}.jpg`;

class Refus extends Error {}
const lireJson = (f, defaut) => { try { return JSON.parse(fs.readFileSync(f, "utf-8")); } catch (e) { return defaut; } };
const ecrireJson = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, 1) + "\n"); };

/**
 * Valide ou rejette un brouillon. Renvoie { action, id, message } ; lève Refus (message à afficher) si l'opération est refusée.
 * racine : racine du dépôt (tests : dossier temporaire) ; now : Date.
 */
function valider({ id, action, racine = RACINE_DEFAUT, now = new Date() }) {
  if (!/^[0-9a-f]{12}$/.test(String(id || ""))) throw new Refus("identifiant invalide : 12 caractères hexadécimaux attendus (voir le résumé de l'exécution qui a créé le brouillon).");
  if (action !== "publier" && action !== "rejeter") throw new Refus("action invalide : « publier » ou « rejeter ».");
  const dossier = path.join(racine, "instagram", "brouillons");
  const fJson = path.join(dossier, `${id}.json`), fJpg = path.join(dossier, `${id}.jpg`);
  const b = lireJson(fJson, null);
  if (!b || b.id !== id) throw new Refus(`brouillon ${id} introuvable (déjà validé, rejeté ou supprimé ?).`);
  if (b.statut !== "a-valider") throw new Refus(`brouillon ${id} : statut « ${b.statut} » (« a-valider » attendu).`);

  if (action === "rejeter") {
    for (const f of [fJson, fJpg]) { try { fs.unlinkSync(f); } catch (e) { /* déjà absent */ } }
    const fRej = path.join(racine, "data", "instagram-rejetes.json");
    const rej = lireJson(fRej, { entrees: [] });
    if (!Array.isArray(rej.entrees)) rej.entrees = [];
    rej.entrees.push({ id, rejeteLe: now.toISOString(), titre: b.titre || null, sujets: Array.isArray(b.sujets) ? b.sujets.slice(0, 8) : [], sources: Array.isArray(b.sources) ? b.sources.slice(0, 12) : [] });
    rej.lastUpdated = now.toISOString();
    rej.entrees = rej.entrees.slice(-200);
    ecrireJson(fRej, rej);
    return { action, id, message: `Brouillon ${id} rejeté et supprimé : « ${b.titre} ». Ce sujet ne sera pas reproposé pendant 7 jours.` };
  }

  // --- publier : contrôles, puis déplacement dans la file ---
  const type = b.type === "post" ? "post" : "story";
  if (now.getTime() - Date.parse(b.cree) > AGE_MAX_H * 36e5) throw new Refus(`brouillon ${id} vieux de plus de ${AGE_MAX_H} h : l'actualité a pu changer, rejetez-le (ou refaites une demande).`);
  const h = stories.heureParis(now);
  if (type === "story" && (h < HEURE_MIN || h >= HEURE_MAX_STORY)) throw new Refus(`il est ${h} h à Paris : une story validée maintenant ne pourrait pas sortir avant 7 h et serait périmée (3 h). Validez entre 7 h et 21 h.`);
  const config = stories.lireConfig(path.join(racine, "data", "stories-config.json"));
  if (config.monetisation && !(b.donneesPropres === true || b.sondageId)) throw new Refus("monétisation activée : aucune publication de presse (data/stories-config.json).");
  const textes = [b.titre, b.citation?.titre, ...(Array.isArray(b.sujets) ? b.sujets : [])].filter(Boolean);
  if (stories.reserveStory(now) && (b.sondageId || b.reserve === true || textes.some(stories.parleDeSondage))) throw new Refus("réserve électorale : aucun sondage ni simulation ne peut être publié (loi du 19 juillet 1977, art. 11).");

  if (!stories.imageValide(fJpg)) throw new Refus(`image du brouillon absente ou invalide (${fJpg}).`);
  const dim = stories.dimensionsJpeg(fs.readFileSync(fJpg)), attendu = type === "post" ? [1080, 1350] : [1080, 1920];
  if (!dim || dim.l !== attendu[0] || dim.h !== attendu[1]) throw new Refus(`image du brouillon : ${attendu[0]}×${attendu[1]} attendu (${dim ? `${dim.l}×${dim.h}` : "pas un JPEG"}).`);
  if (type === "post" && (typeof b.legende !== "string" || !b.legende.includes("@hemicyclefrance"))) throw new Refus("brouillon de post sans légende valide.");

  const fFile = path.join(racine, "data", "instagram-file.json");
  const file = lireJson(fFile, { entrees: [] });
  if (!Array.isArray(file.entrees)) file.entrees = [];
  const registre = lireJson(path.join(racine, "data", "instagram-publiees.json"), { entrees: [] });
  if (file.entrees.some((e) => e.id === id) || (registre.entrees || []).some((e) => e.id === id)) throw new Refus(`brouillon ${id} : déjà en file ou déjà publié (pas de doublon).`);

  const { statut, ...reste } = b; // eslint-disable-line no-unused-vars
  const entree = { ...reste, id, cree: now.toISOString(), brouillonCree: b.cree, titre: b.titre, medias: b.medias || [], url_image: URL_IMAGE(id), type, sources: b.sources || [], valideHumain: true, valideLe: now.toISOString() };
  const dossierImg = path.join(racine, "instagram", "auto");
  fs.mkdirSync(dossierImg, { recursive: true });
  fs.copyFileSync(fJpg, path.join(dossierImg, `${id}.jpg`));
  if (!stories.imageValide(path.join(dossierImg, `${id}.jpg`))) throw new Refus(`copie de l'image impossible vers instagram/auto/${id}.jpg.`);
  const entrees = [...file.entrees, entree].slice(-GARDER);
  ecrireJson(fFile, { lastUpdated: now.toISOString(), entrees });
  fs.writeFileSync(path.join(racine, "instagram", "file.atom"), stories.fluxAtom(entrees, now));
  for (const f of [fJson, fJpg]) { try { fs.unlinkSync(f); } catch (e) { /* déjà absent */ } }
  return { action, id, message: `Brouillon ${id} validé : « ${b.titre} » entre dans la file (${type}). Publication à la prochaine exécution de « Publier les stories » (7 h – 23 h, 60 min entre deux publications), au plus tard dans les ${type === "post" ? 12 : 3} h.` };
}

function main() {
  const [id, action] = process.argv.slice(2);
  try {
    const r = valider({ id, action });
    console.log(`[valider-brouillon] ${r.message}`);
    if (process.env.GITHUB_STEP_SUMMARY) { try { fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `- ${r.message}\n`); } catch (e) { /* résumé facultatif */ } }
  } catch (e) {
    if (!(e instanceof Refus)) throw e;
    console.error(`[valider-brouillon] REFUS : ${e.message}`);
    console.log(`::error::${e.message}`);
    if (process.env.GITHUB_STEP_SUMMARY) { try { fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `- **Refus** : ${e.message}\n`); } catch (e2) { /* résumé facultatif */ } }
    process.exit(1);
  }
}

module.exports = { valider, Refus };
if (require.main === module) main();
