#!/usr/bin/env node
/**
 * fetch-portraits.js
 * ------------------
 * Aucune personne affichée sans visuel : pour chacune des personnes que le site montre (parlementaires, Gouvernement, présidents,
 * chefs de parti, candidats déclarés ou testés dans les sondages, personnes citées dans la page Justice et dans les sujets
 * d'actualité), on obtient un portrait AUTOMATIQUEMENT par la chaîne de repli de portraits-chaine.js :
 *   (a) photo officielle open data (Assemblée nationale, Sénat) ; (b) Wikidata (P18) puis image principale de l'article Wikipédia
 *   FR/EN ; (c) catégorie Commons de la personne ; (d) en dernier recours, médaillon d'initiales aux couleurs du parti
 *   (`placeholder: true`). Chaque photo n'est retenue qu'avec une licence libre vérifiée via l'API Commons (CC0, CC BY, CC BY-SA,
 *   domaine public…) ; auteur, licence et lien sont notés dans data/portraits.json (crédités dans les mentions légales et au survol).
 * Une personne en placeholder est retentée au plus une fois par jour (reprise immédiate après un HTTP 429 ou une panne passagère) ;
 * une bonne photo n'est jamais écrasée par un échec. Rapport : data/portraits-couverture.json et résumé de l'exécution GitHub.
 * Vignette de 120 px dans photos/personnalites/<slug>.jpg (ou, pour un parlementaire sans photo officielle, au chemin officiel
 * photos/deputes/<id>.jpg ou photos/senateurs/<id>.jpg).
 * Haute définition (stories Instagram, pour qu'elles ne soient pas floues) : la même image, sous la même licence et avec les mêmes
 * crédits, est aussi téléchargée en 640 px de large au plus (JPEG de 150 Ko au plus ; 480, 360 puis 280 px si la première est trop
 * lourde) dans photos/personnalites/hd/<slug>.jpg. Une version HD impossible à obtenir est retentée au bout de 30 jours (champ « hd »
 * de data/portraits.json), tout de suite après un HTTP 429.
 * Fichier imposé : data/portraits-choix.json (nom -> fichier Commons), licence revérifiée. Mode d'emploi : docs/portraits-a-completer.md.
 *
 * USAGE : node scripts/fetch-portraits.js [--max=60] [--max-hd=60]
 */
import { fetchPoli } from "./http.js";
import { ecrireSiChange } from "./garde.js";
import { readFile, writeFile, mkdir, access, readdir, unlink, appendFile } from "fs/promises";
import { pathToFileURL } from "url";
import { slug, licenceLibre, resoudre, doitRetenter, calculerCouverture, ligneResume, medaillonSvg, couleurMedaillon } from "./portraits-chaine.js";

export { slug, licenceLibre };
const DATA_FILE = "data/portraits.json";
const COUVERTURE_FILE = "data/portraits-couverture.json";
const CHOIX_FILE = "data/portraits-choix.json"; // fichier Commons imposé ; licence toujours revérifiée par l'API
// Personnalités citées sans être candidates ni dirigeantes, y compris parlementaires (leur portrait officiel reste prioritaire sur le site)
const CITEES = ["Raphaël Glucksmann", "François Hollande", "Emmanuel Macron"];
const DOSSIER = "photos/personnalites";
const DOSSIER_HD = `${DOSSIER}/hd`;
const DOSSIER_MEDAILLONS = `${DOSSIER}/medaillons`;
const LARGEURS_HD = [640, 480, 360, 280];
const MAX_OCTETS_HD = 150 * 1024;
const USER_AGENT = "hemicycle-france-bot/1.0 (https://github.com/Tahns/hemicycle-france)";
const arg = (nom, defaut) => parseInt(process.argv.find((a) => a.startsWith(`--${nom}=`))?.split("=")[1] ?? defaut, 10);
const log = (...m) => console.log("[fetch-portraits]", ...m);
const warn = (...m) => console.warn("[fetch-portraits][ATTENTION]", ...m);
const texte = (h) => String(h || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const existe = (f) => access(f).then(() => true, () => false);
const lire = async (f) => JSON.parse(await readFile(f, "utf-8").catch(() => "null"));
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** Appel JSON poli : HTTP 429 ou 5xx = erreur transitoire (reprise au passage suivant), autre échec HTTP = erreur définitive. */
async function api(url) {
  let res;
  try { res = await fetchPoli(url, { headers: { "User-Agent": USER_AGENT } }); } catch (e) { e.transitoire = true; throw e; } // réseau coupé, délai dépassé
  if (!res.ok) { const e = new Error(`HTTP ${res.status}`); e.transitoire = res.status === 429 || res.status >= 500; throw e; }
  await pause(150); // un peu de retenue vis-à-vis de Commons et de Wikidata
  return res.json();
}
const telecharger = (url) => fetchPoli(url, { headers: { "User-Agent": USER_AGENT } });

/**
 * Version haute définition d'un fichier de Commons : JPEG de LARGEURS_HD[0] px de large au plus et MAX_OCTETS_HD au plus.
 * `api` et `telecharger` sont injectables pour les essais hors ligne. Renvoie { octets, largeur, licence, auteur, source }.
 */
export async function recupererHd(fichierCommons, { api: appel = api, telecharger: telecharge = telecharger } = {}) {
  let derniere = "aucune largeur n'a convenu";
  for (const largeur of LARGEURS_HD) {
    const d = await appel(`https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=${largeur}&titles=${encodeURIComponent("File:" + fichierCommons)}`);
    const info = Object.values(d.query?.pages || {})[0]?.imageinfo?.[0];
    if (!info?.thumburl) throw new Error("fichier absent de Commons");
    const licence = licenceLibre(info.extmetadata); // même contrôle que la vignette
    const res = await telecharge(info.thumburl);
    if (!res.ok) { const e = new Error(`téléchargement HD impossible (HTTP ${res.status})`); e.transitoire = res.status === 429 || res.status >= 500; throw e; }
    if (!/image\/jpeg/.test(res.headers.get("content-type") || "")) throw new Error(`HD : format non JPEG (${res.headers.get("content-type")})`);
    const octets = Buffer.from(await res.arrayBuffer());
    if (octets.length <= MAX_OCTETS_HD) return { octets, largeur, licence, auteur: texte(info.extmetadata?.Artist?.value).slice(0, 120) || "Auteur inconnu", source: info.descriptionurl };
    derniere = `${Math.round(octets.length / 1024)} Ko à ${largeur} px`;
  }
  throw new Error(`HD trop lourde (${derniere}, maximum ${MAX_OCTETS_HD / 1024} Ko)`);
}

// Priorité de traitement (plus petit = d'abord) : ce qui se voit le plus passe avant les sénateurs et les députés
const PRIORITE = { president: 0, candidat: 1, dirigeant: 1, gouvernement: 2, cite: 3, justice: 3, senateur: 5, depute: 6 };

/**
 * Toutes les personnes que le site affiche, une fois chacune : { nom, type, priorite, id, slug, parti, couleur, titre, souple, choix,
 * notable, parlementaire }. Fonction pure (testable) : `d` regroupe le contenu des fichiers data/*.json.
 * `parlementaire` : { type, id, slug, chemin } pour un député ou un sénateur ; `notable` : la personne a aussi besoin de
 * photos/personnalites/ (stories candidat, sujets d'actualité, présidents…) même si elle a une photo officielle.
 */
export function listerPersonnes(d) {
  const choix = d.choix || {};
  const parNom = new Map();
  const ajouter = (nom, type, infos = {}) => {
    if (!nom || nom === "—" || typeof nom !== "string") return;
    nom = nom.trim();
    const ancien = parNom.get(nom);
    const p = ancien || { nom, type, priorite: PRIORITE[type], notable: false, souple: false, parlementaire: null };
    if (PRIORITE[type] < p.priorite) { p.type = type; p.priorite = PRIORITE[type]; }
    if (type !== "depute" && type !== "senateur") { p.notable = true; if (type !== "cite" && type !== "justice") p.souple = true; }
    for (const [k, v] of Object.entries(infos)) if (v && !p[k]) p[k] = v;
    parNom.set(nom, p);
  };
  for (const x of d.deputes?.deputes || []) ajouter(x.nom, "depute", { parlementaire: { type: "depute", id: x.id, chemin: `photos/deputes/${x.id}.jpg` }, parti: x.groupe, id: x.id });
  for (const x of d.senateurs?.senateurs || []) ajouter(x.nom, "senateur", { parlementaire: { type: "senateur", id: x.id, slug: x.slug, chemin: `photos/senateurs/${x.id}.jpg` }, parti: x.groupe, id: x.id, slug: x.slug });
  const presidents = (d.presidents?.regimes || []).flatMap((r) => r.presidents || []);
  for (const x of presidents) ajouter(x.nom, "president", { titre: decodeURIComponent(String(x.wikipedia || "").split("/wiki/")[1] || "").replace(/_/g, " "), parti: x.parti });
  for (const x of d.dirigeants?.dirigeants || []) ajouter(x.nom, "dirigeant", { parti: x.parti, couleur: x.couleur });
  for (const x of d.candidats?.candidats || []) ajouter(x.nom, "candidat", { parti: x.code });
  for (const [nom, parti] of Object.entries(d.sondages?.candidats || {})) if (!/\(/.test(nom)) ajouter(nom, "candidat", { parti });
  for (const x of d.gouvernement?.membres || []) ajouter(x.nom, "gouvernement", { id: x.id });
  for (const x of d.justice?.condamnations || []) ajouter(x.nom, "justice");
  for (const nom of [...CITEES, ...(d.extra || [])]) ajouter(nom, "cite");
  for (const nom of Object.keys(choix)) ajouter(nom, "cite");
  (function parcourir(o) { if (o && typeof o === "object") { if (typeof o.nom === "string" && "parti" in o) ajouter(o.nom, "cite", { parti: o.parti }); Object.values(o).forEach(parcourir); } })(d.actualites);
  // Un parlementaire notable (candidat, dirigeant, cité…) est traité comme une personnalité (photos/personnalites/) ; sa photo officielle sert au site
  for (const p of parNom.values()) if (choix[p.nom]) p.choix = choix[p.nom];
  return [...parNom.values()].sort((a, b) => a.priorite - b.priorite || a.nom.localeCompare(b.nom, "fr"));
}

/** Où la photo de cette personne est (ou sera) hébergée : chemin officiel pour un parlementaire non notable, sinon photos/personnalites/. */
export const cheminDe = (p) => (p.parlementaire && !p.notable ? p.parlementaire.chemin : `${DOSSIER}/${slug(p.nom)}.jpg`);

async function main() {
  const [deputes, senateurs, dirigeants, candidats, gouvernement, justice, presidents, actualites, sondages, choixBrut] = await Promise.all(
    ["deputes", "senateurs", "dirigeants", "candidats", "gouvernement", "justice", "presidents", "actualites", "sondages"].map((f) => lire(`data/${f}.json`)).concat(lire(CHOIX_FILE))
  );
  const choix = choixBrut?.choix || {};
  const personnes = listerPersonnes({ deputes, senateurs, dirigeants, candidats, gouvernement, justice, presidents, actualites, sondages, choix });
  const data = (await lire(DATA_FILE)) || { source: "Wikimedia Commons (licences libres), Assemblée nationale et Sénat (open data) ; chaîne de repli : voir scripts/portraits-chaine.js", portraits: {} };
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const MAX = arg("max", 60);
  log(`${personnes.length} personnes à illustrer ; au plus ${MAX} traitées à ce passage.`);

  await mkdir(DOSSIER, { recursive: true });
  const ctx = { api, telecharger, aujourdhui, log: (m) => log(m) };
  const aPhotoOfficielle = async (p) => !!p.parlementaire && (await existe(p.parlementaire.chemin));
  let traites = 0, ajouts = 0, defaites = 0, limites = 0;
  for (const p of personnes) {
    const entree = data.portraits[p.nom];
    const chemin = cheminDe(p);
    const officielle = await aPhotoOfficielle(p);
    // Un parlementaire dont la photo officielle est là n'a besoin de rien, sauf s'il doit aussi figurer dans photos/personnalites/
    if (officielle && !p.notable) continue;
    const fichierLa = entree?.fichier && (await existe(entree.chemin || chemin));
    if (fichierLa && (!p.choix || p.choix === entree.fichier)) continue;
    // Placeholder : une fois par jour au plus (tout de suite après un 429) ; photo notée mais fichier absent ou autre choix : une fois par jour aussi
    if (entree?.fichier ? entree.dernierEssai === aujourdhui : !doitRetenter(entree, aujourdhui)) continue;
    if (traites++ >= MAX) break;
    const pp = { ...p, type: p.parlementaire && !p.notable ? p.parlementaire.type : p.type, id: p.parlementaire?.id || p.id, slug: p.parlementaire?.slug || p.slug };
    const r = await resoudre(pp, ctx);
    if (r.statut === "photo") {
      const cible = r.chemin || chemin;
      await mkdir(cible.replace(/\/[^/]+$/, ""), { recursive: true });
      await writeFile(cible, r.octets);
      const e = { ...r.entree };
      if (cible !== `${DOSSIER}/${slug(p.nom)}.jpg`) e.chemin = cible; else delete e.chemin;
      for (const k of Object.keys(e)) if (e[k] === undefined) delete e[k];
      data.portraits[p.nom] = e; // nouveau portrait : remplace l'ancien seulement parce qu'il est meilleur (il existe et sa licence est vérifiée)
      ajouts++; limites = 0;
    } else if (entree?.fichier) {
      // Jamais de bonne photo écrasée par un échec : on garde l'entrée, on note seulement la tentative
      data.portraits[p.nom] = { ...entree, dernierEssai: aujourdhui };
      limites = r.transitoire ? limites + 1 : 0;
    } else {
      const e = { ...r.entree };
      if (officielle) { delete e.placeholder; delete e.medaillon; delete e.initiales; delete e.couleur; } // la photo officielle fait déjà le visuel
      data.portraits[p.nom] = e;
      defaites++;
      limites = r.transitoire ? limites + 1 : 0;
    }
    // Commons / Wikidata limitent le débit : après plusieurs refus d'affilée on s'arrête, la reprise se fait au passage suivant
    if (limites >= 4) { warn("limite de débit (HTTP 429) à répétition : arrêt de ce passage, reprise au suivant (les photos acquises sont conservées)."); break; }
  }

  // Versions HD des portraits Commons déjà retenus (mêmes crédits : l'entrée du portrait fait foi)
  await mkdir(DOSSIER_HD, { recursive: true });
  const MAX_HD = arg("max-hd", 60);
  let hd = 0, essais = 0, limitesHd = 0;
  for (const [nom, p] of Object.entries(data.portraits)) {
    if (!p?.fichier || p.origine === "officielle" || p.chemin || !(await existe(`${DOSSIER}/${slug(nom)}.jpg`)) || (await existe(`${DOSSIER_HD}/${slug(nom)}.jpg`))) continue;
    if (p.hd?.essai && !p.hd.transitoire && (Date.parse(aujourdhui) - Date.parse(p.hd.essai)) / 864e5 < 30) continue;
    if (limitesHd >= 3 || essais++ >= MAX_HD) break;
    try {
      const r = await recupererHd(p.fichier);
      // La licence de la version HD doit être celle déjà créditée ; sinon on laisse l'entrée telle quelle et on n'enregistre rien
      if (r.licence !== p.licence) throw new Error(`licence différente de celle créditée (${r.licence} / ${p.licence})`);
      await writeFile(`${DOSSIER_HD}/${slug(nom)}.jpg`, r.octets);
      delete p.hd;
      hd++; limitesHd = 0;
      log(`${nom} : HD ${r.largeur} px, ${Math.round(r.octets.length / 1024)} Ko.`);
    } catch (e) {
      p.hd = { essai: aujourdhui, raison: e.message, ...(e.transitoire || /429/.test(e.message) ? { transitoire: true } : {}) };
      limitesHd = p.hd.transitoire ? limitesHd + 1 : 0;
      log(`${nom} : pas de version HD (${e.message}).`);
    }
  }
  data.portraits = Object.fromEntries(Object.entries(data.portraits).sort(([a], [b]) => a.localeCompare(b, "fr")));
  await writeFile(DATA_FILE, JSON.stringify(data, null, 1) + "\n");

  // Couverture : qui a une photo (avec licence), qui n'a que le médaillon d'initiales
  const aPhoto = async (p) => {
    const e = data.portraits[p.nom];
    if (await aPhotoOfficielle(p)) return true;
    return !!e?.fichier && (await existe(e.chemin || `${DOSSIER}/${slug(p.nom)}.jpg`));
  };
  const etat = new Map();
  for (const p of personnes) etat.set(p.nom, await aPhoto(p));
  const couverture = calculerCouverture(personnes, data.portraits, (p) => etat.get(p.nom), aujourdhui);
  const ecrit = await ecrireSiChange(COUVERTURE_FILE, JSON.stringify({ lastUpdated: new Date().toISOString(), ...couverture }, null, 1) + "\n");

  // Médaillons d'initiales (SVG) pour toute personne sans photo ; ceux des personnes devenues photographiées sont retirés
  await mkdir(DOSSIER_MEDAILLONS, { recursive: true });
  const voulus = new Set();
  for (const p of personnes) {
    if (etat.get(p.nom)) continue;
    voulus.add(`${slug(p.nom)}.svg`);
    await writeFile(`${DOSSIER_MEDAILLONS}/${slug(p.nom)}.svg`, medaillonSvg(p.nom, couleurMedaillon(p)));
  }
  for (const f of await readdir(DOSSIER_MEDAILLONS).catch(() => [])) if (f.endsWith(".svg") && !voulus.has(f)) await unlink(`${DOSSIER_MEDAILLONS}/${f}`);

  const resume = ligneResume(couverture);
  log(`${hd} version(s) HD ajoutée(s) ; ${ajouts} portrait(s) ajouté(s), ${defaites} médaillon(s) d'initiales. ${resume}`);
  if (couverture.manquants.length) log(`Sans photo (médaillon affiché) : ${couverture.manquants.join(", ")}.`);
  if (ecrit) log(`${COUVERTURE_FILE} mis à jour.`);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `\n${resume}\n`).catch(() => {});
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { warn("ÉCHEC :", e.message); process.exitCode = 1; });
