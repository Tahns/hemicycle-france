#!/usr/bin/env node
/**
 * stories-auto.cjs
 * ----------------
 * File d'attente AUTOMATIQUE de stories Instagram : au plus UN sujet d'actualité par exécution,
 * dessiné par le site lui-même (dessinerStory("actualite", indice) dans index.html — aucun dessin dupliqué),
 * enregistré dans instagram/auto/<id>.jpg et listé dans data/instagram-file.json.
 * Ce script ne publie RIEN et n'appelle pas Instagram : un autre outil lit la file et les images.
 *
 * Règles (toutes obligatoires) pour qu'un sujet de data/actualites.json soit retenu :
 *  - repris par au moins 3 médias, OU prise de parole du président de la République (data/direct.json) ;
 *  - dernière mise à jour il y a moins de 3 h ;
 *  - pas déjà en file (id = empreinte du titre central, ou lien d'article déjà utilisé) ;
 *  - aucun mot de la liste prudente (mise en cause, accusation, enquête, violence, décès, mineur,
 *    victime, fait divers…), pas de thème « justice » : mieux vaut manquer une story que publier à tort ;
 *  - au plus 4 entrées par jour (UTC+2) ; aucune entre 23 h et 7 h, heure de Paris.
 * On garde les 30 dernières entrées ; les images de plus de 3 jours sont supprimées.
 *
 * DÉCLENCHEUR « NOUVEAU SONDAGE » (prioritaire sur les actualités) : si data/sondages.json contient une enquête d'intentions de vote
 * au premier tour de la présidentielle plus récente que la dernière déjà mise en file (entrée « story » avec champ sondageId,
 * « Institut|AAAA-MM-JJ »), publiée il y a moins de 48 h, on dessine la story « sondages » du site limitée à CETTE enquête
 * (institut, commanditaire s'il est connu, dates de terrain, échantillon, marge d'erreur, mention de la notice déposée à la Commission
 * des sondages, source ; chiffres tels que publiés, aucune moyenne ni « gagnant »). Hors plafond de 4 par jour (2 sondages par jour
 * au plus) ; autorisé jusqu'à 23 h 30 (heure de Paris). JAMAIS pendant la réserve électorale (loi du 19 juillet 1977, art. 11 : même
 * calcul que periodeReserveSondages() du site) : les stories de sondage encore en file y sont retirées.
 *
 * USAGE : node scripts/stories-auto.cjs   (--a-faire : dit seulement s'il y a un sujet à traiter ; nécessite le paquet « playwright » et Chromium)
 * Variables facultatives : SITE_URL, GITHUB_REPOSITORY, CHROMIUM_PATH, STORIES_AUTO_MAINTENANT (ISO, pour essais).
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { concerneLaFrance } = require("./pertinence.cjs");

const RACINE = path.resolve(__dirname, "..");
const FICHIER_FILE = path.join(RACINE, "data", "instagram-file.json");
const DOSSIER_IMG = path.join(RACINE, "instagram", "auto");
const [PROPRIO, DEPOT] = (process.env.GITHUB_REPOSITORY || "Tahns/hemicycle-france").split("/");
const SITE = process.env.SITE_URL || `https://${PROPRIO.toLowerCase()}.github.io/${DEPOT}/`;

// Loi n° 77-808 du 19 juillet 1977, art. 11 : mêmes dates et même calcul que index.html (TOURS_PRESIDENTIELLE, calculReserveSondages)
const TOURS_PRESIDENTIELLE = ["2027-04-18", "2027-05-02"];
const MAX_SONDAGES_PAR_JOUR = 2;
const SONDAGE_FRAICHEUR_H = 48;
const SONDAGE_DERNIERE_MINUTE = 23 * 60 + 30; // un sondage qui vient de sortir peut être mis en file jusqu'à 23 h 30
const MOIS = { janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12 };

const MIN_MEDIAS = 3;
const FRAICHEUR_H = 3;
const MAX_PAR_JOUR = 4;
const GARDER = 30;
const IMAGE_JOURS = 3;
const MAX_OCTETS = 8 * 1024 * 1024;

const sansAccent = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Mots qui écartent un sujet (comparés sans accents ni casse, dans TOUS les titres du sujet).
// Liste volontairement large : une story manquée ne coûte rien, une publication à tort si.
const MOTS_EXCLUS = [
  "accus", "mis en examen", "mise en examen", "mis en cause", "mise en cause", "garde a vue", "gardes a vue",
  "plainte", "enquete visant", "enquete ouverte", "enquete judiciaire", "enquete preliminaire", "ouvre une enquete", "enquete pour",
  "poursuiv", "poursuite", "condamn", "relaxe", "soupcon", "suspect", "inculp", "mise en danger",
  "incarcer", "ecroue", "emprisonn", "prison", "detention", "perquisition", "mandat d'arret", "mandat d’arret",
  "proces", "tribunal", "parquet", "juge ", "judiciaire", "justice", "citation directe", "interpell",
  "agress", "\\bviol", "meurtre", "assassin", "homicide", "\\btue\\b", "\\btuee?s?\\b", "fusillade", "poignard", "coups de couteau", "attentat", "terroris",
  "mort de", "mort d'", "mort d’", "la mort", "morte", "meurt", "decede", "deces", "deuil", "hommage a", "suicide", "disparition", "disparu",
  "drame", "tragedie", "fait divers", "faits divers", "blesse",
  "pedo", "inceste", "harcelement", "sexuel", "sexiste", "antisemit", "racis", "homophob", "discrimination",
  "mineur", "victime", "fillette", "garconnet", "adolescent", "collegien", "collegienne", "enfant de", "bebe",
  "menace de mort", "menaces", "diffam", "calomni", "mentir", "mensonge", "fraude", "corruption", "detournement", "escroquerie", "blanchiment",
  "scandale", "affaire ",
];
const RE_EXCLUS = new RegExp(MOTS_EXCLUS.map((m) => (m.startsWith("\\b") ? m : m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).join("|"), "i");
// Âge de moins de 20 ans cité dans un titre (« une adolescente de 15 ans ») : mineur potentiel
const RE_AGE_MINEUR = /\b(?:1\d|[2-9]|0?\d) ?(?:ans|-ans)\b/;

/** Pourquoi un titre est écarté (null s'il passe). */
function motExclu(titre) {
  const t = sansAccent(titre);
  const m = RE_EXCLUS.exec(t);
  if (m) return m[0].trim();
  const a = RE_AGE_MINEUR.exec(t);
  if (a && Number(a[0].match(/\d+/)[0]) < 20) return a[0];
  return null;
}

/** Réserve électorale : renvoie le tour concerné (« AAAA-MM-JJ ») si now tombe du samedi 0 h au dimanche 20 h (Paris), sinon null. */
function reserveSondages(now) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(now).map((x) => [x.type, x.value]));
  const paris = `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  return TOURS_PRESIDENTIELLE.find((tour) => {
    const veille = new Date(Date.parse(tour + "T12:00:00Z") - 864e5).toISOString().slice(0, 10);
    return paris >= `${veille}T00:00` && paris < `${tour}T20:00`;
  }) || null;
}

/** Empreinte stable du titre central du sujet. */
function idSujet(titre) {
  const t = sansAccent(titre).replace(/[^a-z0-9]+/g, " ").trim();
  return crypto.createHash("sha1").update(t).digest("hex").slice(0, 12);
}

const heureParis = (d) => Number(new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", hourCycle: "h23" }).formatToParts(d).find((p) => p.type === "hour").value);
/** Jour (AAAA-MM-JJ) en UTC+2. */
const jourUTC2 = (d) => new Date(new Date(d).getTime() + 2 * 36e5).toISOString().slice(0, 10);

const minutesParis = (d) => { const p = Object.fromEntries(new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value])); return Number(p.hour) * 60 + Number(p.minute); };

/** Jour de publication d'une enquête (AAAA-MM-JJ) : celui du nom du fichier de la notice (« …-30-septembre.pdf ») s'il est plausible, sinon le lendemain de la fin du terrain. */
function jourPublication(inst) {
  const lendemain = new Date(Date.parse(inst.dateFin + "T12:00:00Z") + 864e5).toISOString().slice(0, 10);
  const m = /-(\d{1,2})-(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\.pdf(?:$|\?)/i.exec(sansAccent(String(inst.url || "")));
  if (!m) return lendemain;
  const mois = MOIS[m[2].toLowerCase()];
  let an = Number(inst.dateFin.slice(0, 4));
  if (mois < Number(inst.dateFin.slice(5, 7)) - 6) an++; // terrain en décembre, publication en janvier
  const jour = `${an}-${String(mois).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;
  const ecart = (Date.parse(jour + "T12:00:00Z") - Date.parse(inst.dateFin + "T12:00:00Z")) / 864e5;
  return ecart >= 0 && ecart <= 10 ? jour : lendemain;
}

/**
 * Choisit au plus une enquête (premier tour) à mettre en story. Renvoie { sondage: {...}, id, sondageId, indice } ou { refus }.
 * Règles : pas de réserve électorale ; ni la nuit (avant 7 h, après 23 h 30) ; pas plus de 2 sondages par jour ;
 * enquête plus récente que la dernière mise en file, jamais déjà en file, publiée il y a moins de 48 h.
 */
function choisirSondage({ sondages, file, now = new Date() }) {
  const reserve = reserveSondages(now);
  if (reserve) return { refus: `réserve électorale (scrutin du ${reserve})` };
  const m = minutesParis(now);
  if (m < 7 * 60 || m > SONDAGE_DERNIERE_MINUTE) return { refus: "nuit pour un sondage (7 h – 23 h 30 à Paris)" };
  const entrees = file?.entrees || [];
  const jour = jourUTC2(now);
  if (entrees.filter((e) => e.sondageId && jourUTC2(e.cree) === jour).length >= MAX_SONDAGES_PAR_JOUR) return { refus: `déjà ${MAX_SONDAGES_PAR_JOUR} sondages aujourd'hui` };
  const enFile = new Set(entrees.map((e) => e.sondageId).filter(Boolean));
  const derniere = [...enFile].map((x) => x.split("|")[1]).sort().pop() || "";
  const candidats = [];
  (sondages?.instituts || []).forEach((inst, indice) => {
    if (!inst?.nom || !/^\d{4}-\d{2}-\d{2}$/.test(inst.dateFin || "") || !inst.scores) return;
    const sondageId = `${inst.nom}|${inst.dateFin}`;
    if (enFile.has(sondageId) || inst.dateFin <= derniere) return;
    if (Object.keys(inst.scores).length < 3 || !(inst.echantillon > 0)) return; // mentions obligatoires impossibles sans échantillon
    const age = now.getTime() - Date.parse(`${jourPublication(inst)}T00:00:00+02:00`);
    if (age > SONDAGE_FRAICHEUR_H * 36e5 || age < -36e5 * 24) return;
    candidats.push({ indice, inst, sondageId });
  });
  if (!candidats.length) return { refus: "aucun nouveau sondage" };
  candidats.sort((a, b) => b.inst.dateFin.localeCompare(a.inst.dateFin));
  const c = candidats[0];
  return { sondage: c.inst, indice: c.indice, sondageId: c.sondageId, id: crypto.createHash("sha1").update("sondage|" + c.sondageId).digest("hex").slice(0, 12) };
}

/** La prise de parole du président détectée par detecter-direct.js concerne-t-elle ce sujet ? */
function presidentParle(sujet, direct) {
  const titres = new Set((direct?.evenements || []).filter((e) => e.type !== "seance-an").map((e) => e.titre));
  return (sujet.articles || []).some((a) => titres.has(a.titre));
}

/**
 * Choisit au plus un sujet. Renvoie { indice, sujet, id } ou { refus: "raison" }.
 * file : { entrees: [...] } ; now : Date.
 */
function choisirSujet({ actualites, direct, file, now = new Date() }) {
  const entrees = file?.entrees || [];
  const h = heureParis(now);
  if (h >= 23 || h < 7) return { refus: `nuit (${h} h à Paris)` };
  const jour = jourUTC2(now);
  if (entrees.filter((e) => !e.sondageId && jourUTC2(e.cree) === jour).length >= MAX_PAR_JOUR) return { refus: `déjà ${MAX_PAR_JOUR} entrées aujourd'hui` };
  const ids = new Set(entrees.map((e) => e.id));
  const urls = new Set(entrees.flatMap((e) => e.sources || []));

  const candidats = [];
  (actualites?.sujets || []).forEach((s, indice) => {
    const titre = s.articles?.[0]?.titre;
    if (!titre || titre.length < 25 || titre.length > 220 || /[$<>{}]/.test(titre)) return;
    if (!concerneLaFrance((s.articles || []).map((x) => x.titre))) return; // sujet purement étranger : ni site ni story
    const medias = new Set((s.articles || []).map((a) => a.media)).size;
    const parole = presidentParle(s, direct);
    if (medias < MIN_MEDIAS && !parole) return;
    const age = now.getTime() - Date.parse(s.derniere);
    if (!(age < FRAICHEUR_H * 36e5) || age < -36e5) return;
    if (ids.has(idSujet(titre)) || (s.articles || []).some((a) => urls.has(a.url))) return;
    if (s.illustration?.theme === "justice") return;
    if ((s.articles || []).some((a) => motExclu(a.titre))) return;
    candidats.push({ indice, sujet: s, id: idSujet(titre), medias, parole });
  });
  if (!candidats.length) return { refus: "aucun sujet ne remplit toutes les règles" };
  candidats.sort((a, b) => Number(b.parole) - Number(a.parole) || b.medias - a.medias || Date.parse(b.sujet.derniere) - Date.parse(a.sujet.derniere));
  return candidats[0];
}

/** Dimensions d'un JPEG, ou null. */
function dimensionsJpeg(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { h: buf.readUInt16BE(i + 5), l: buf.readUInt16BE(i + 7) };
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

/** Garde les 30 dernières entrées ; renvoie les id dont l'image doit rester (moins de 3 jours). */
function elaguer(entrees, now = new Date()) {
  const gardees = entrees.slice(-GARDER);
  const limite = now.getTime() - IMAGE_JOURS * 24 * 36e5;
  const images = new Set(gardees.filter((e) => Date.parse(e.cree) >= limite).map((e) => e.id));
  return { gardees, images };
}

/** Supprime les JPEG de instagram/auto/ qui ne sont plus à garder (noms strictement contrôlés). */
function nettoyerImages(images, dossier = DOSSIER_IMG) {
  if (!fs.existsSync(dossier)) return [];
  const supprimes = [];
  for (const f of fs.readdirSync(dossier)) {
    const m = /^([0-9a-f]{12})\.jpg$/.exec(f);
    if (!m || images.has(m[1])) continue;
    const chemin = path.join(dossier, f);
    if (path.dirname(chemin) !== dossier) continue;
    fs.unlinkSync(chemin);
    supprimes.push(f);
  }
  return supprimes;
}

const TYPES = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".js": "text/javascript", ".mjs": "text/javascript", ".woff2": "font/woff2", ".woff": "font/woff", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".css": "text/css", ".webmanifest": "application/manifest+json" };

/** Ouvre le site (servi depuis le disque sous son adresse publique) et dessine la story ; renvoie un Buffer JPEG. */
async function dessiner(indice, titre, sondage = null) {
  const { chromium } = require("playwright");
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, serviceWorkers: "block" });
    const page = await ctx.newPage();
    // Le site est servi depuis le dossier du dépôt, sous son adresse publique (l'image affiche ainsi la bonne adresse)
    await page.route("**/*", async (route) => {
      const u = new URL(route.request().url());
      if (!(u.origin + u.pathname).startsWith(SITE.replace(/\/$/, "")) && u.origin !== new URL(SITE).origin) return route.abort();
      let rel = decodeURIComponent(u.pathname.slice(new URL(SITE).pathname.length));
      if (!rel || rel.endsWith("/")) rel += "index.html";
      const fichier = path.resolve(RACINE, rel);
      if (!fichier.startsWith(RACINE + path.sep) || !fs.existsSync(fichier) || !fs.statSync(fichier).isFile()) return route.fulfill({ status: 404, body: "" });
      route.fulfill({ status: 200, contentType: TYPES[path.extname(fichier)] || "application/octet-stream", body: fs.readFileSync(fichier) });
    });
    const erreurs = [];
    page.on("pageerror", (e) => erreurs.push(e.message));
    await page.goto(SITE, { waitUntil: "load" });
    if (sondage) {
      await page.waitForFunction(() => typeof INSTITUTS !== "undefined" && INSTITUTS.length > 0 && typeof CANDIDATS !== "undefined" && typeof dessinerStory === "function", null, { timeout: 30000 });
    } else {
      await page.waitForFunction(() => typeof ACTUALITES !== "undefined" && ACTUALITES?.sujets?.length > 0 && typeof dessinerStory === "function", null, { timeout: 30000 });
    }
    const url = await page.evaluate(async ({ indice, titre, sondage }) => {
      if (sondage) { // story « sondages » limitée à CETTE enquête ; le site doit avoir le même relevé que le fichier
        const i = INSTITUTS[indice];
        if (!i || i.nom !== sondage.nom || i.dateFin !== sondage.dateFin) return null;
        const r = await dessinerStory("sondages", i.id);
        return r ? r.apercu : null;
      }
      if (ACTUALITES.sujets[indice]?.articles?.[0]?.titre !== titre) return null; // le site n'a pas le même relevé que le fichier
      const r = await dessinerStory("actualite", indice);
      return r ? r.apercu : null;
    }, { indice, titre, sondage: sondage ? { nom: sondage.nom, dateFin: sondage.dateFin } : null });
    if (erreurs.length) console.warn("[stories-auto] erreurs JavaScript du site :", erreurs.join(" | "));
    if (!url || !url.startsWith("data:image/jpeg;base64,")) throw new Error("la story n'a pas pu être dessinée");
    return Buffer.from(url.slice("data:image/jpeg;base64,".length), "base64");
  } finally {
    await browser.close();
  }
}

/** Sondage d'abord (déclencheur prioritaire), sinon un sujet d'actualité. */
function choisir({ actualites, direct, sondages, file, now = new Date() }) {
  const s = choisirSondage({ sondages, file, now });
  if (!s.refus) return s;
  const a = choisirSujet({ actualites, direct, file, now });
  return a.refus ? { refus: `${a.refus} ; sondage : ${s.refus}` } : a;
}

/** Mode --a-faire : écrit « a_faire=true|false » (pour GITHUB_OUTPUT) sans lancer le navigateur, pour n'installer Chromium que si utile. */
function aFaire() {
  const lire = (f, defaut) => { try { return JSON.parse(fs.readFileSync(path.join(RACINE, f), "utf-8")); } catch (e) { return defaut; } };
  const now = process.env.STORIES_AUTO_MAINTENANT ? new Date(process.env.STORIES_AUTO_MAINTENANT) : new Date();
  const file = lire("data/instagram-file.json", { entrees: [] });
  const c = choisir({ actualites: lire("data/actualites.json", null), direct: lire("data/direct.json", null), sondages: lire("data/sondages.json", null), file, now });
  // Pendant la réserve électorale, des stories de sondage restées en file doivent être retirées (main() s'en charge)
  const aRetirer = reserveSondages(now) && (file.entrees || []).some((e) => e.sondageId);
  console.log(`a_faire=${c.refus && !aRetirer ? "false" : "true"}`);
}

async function main() {
  const lire = (f, defaut) => { try { return JSON.parse(fs.readFileSync(path.join(RACINE, f), "utf-8")); } catch (e) { return defaut; } };
  const now = process.env.STORIES_AUTO_MAINTENANT ? new Date(process.env.STORIES_AUTO_MAINTENANT) : new Date();
  const file = lire("data/instagram-file.json", { entrees: [] });
  if (!Array.isArray(file.entrees)) file.entrees = [];
  // Réserve électorale : aucun sondage ne reste en file (le publieur lit la file plus tard)
  const enReserve = reserveSondages(now);
  let purge = false;
  if (enReserve) {
    const avant = file.entrees.length;
    file.entrees = file.entrees.filter((e) => !e.sondageId);
    purge = file.entrees.length !== avant;
    if (file.entrees.length !== avant) console.log(`[stories-auto] réserve électorale (${enReserve}) : ${avant - file.entrees.length} story(s) de sondage retirée(s) de la file.`);
  }
  const choix = choisir({ actualites: lire("data/actualites.json", null), direct: lire("data/direct.json", null), sondages: lire("data/sondages.json", null), file, now });
  const { gardees, images } = elaguer(file.entrees, now);
  let entrees = gardees;

  if (choix.refus) {
    console.log(`[stories-auto] rien à mettre en file : ${choix.refus}.`);
  } else if (choix.sondage) {
    const i = choix.sondage;
    const titre = `Sondage ${i.nom} · intentions de vote au 1er tour (terrain : ${i.date})`;
    console.log(`[stories-auto] nouveau sondage : ${titre}`);
    const jpeg = await dessiner(choix.indice, titre, i);
    const dim = dimensionsJpeg(jpeg);
    if (!dim || dim.l !== 1080 || dim.h !== 1920) throw new Error(`image inattendue (${dim ? `${dim.l}×${dim.h}` : "pas un JPEG"})`);
    if (jpeg.length > MAX_OCTETS) throw new Error(`image trop lourde (${jpeg.length} octets)`);
    fs.mkdirSync(DOSSIER_IMG, { recursive: true });
    fs.writeFileSync(path.join(DOSSIER_IMG, `${choix.id}.jpg`), jpeg);
    entrees = [...entrees, {
      id: choix.id,
      cree: now.toISOString(),
      titre,
      medias: [i.nom],
      url_image: `https://tahns.github.io/hemicycle-france/instagram/auto/${choix.id}.jpg`,
      type: "story",
      sondageId: choix.sondageId,
      sources: [i.url].filter((u) => /^https:\/\//.test(u || "")),
    }].slice(-GARDER);
    images.add(choix.id);
    console.log(`[stories-auto] instagram/auto/${choix.id}.jpg (${Math.round(jpeg.length / 1024)} Ko).`);
  } else {
    const titre = choix.sujet.articles[0].titre;
    console.log(`[stories-auto] sujet retenu (${choix.medias} média(s)) : ${titre}`);
    const jpeg = await dessiner(choix.indice, titre);
    const dim = dimensionsJpeg(jpeg);
    if (!dim || dim.l !== 1080 || dim.h !== 1920) throw new Error(`image inattendue (${dim ? `${dim.l}×${dim.h}` : "pas un JPEG"})`);
    if (jpeg.length > MAX_OCTETS) throw new Error(`image trop lourde (${jpeg.length} octets)`);
    fs.mkdirSync(DOSSIER_IMG, { recursive: true });
    fs.writeFileSync(path.join(DOSSIER_IMG, `${choix.id}.jpg`), jpeg);
    const medias = [...new Set(choix.sujet.articles.map((a) => a.media))];
    entrees = [...entrees, {
      id: choix.id,
      cree: now.toISOString(),
      titre,
      medias,
      url_image: `https://tahns.github.io/hemicycle-france/instagram/auto/${choix.id}.jpg`,
      type: "story",
      sources: choix.sujet.articles.map((a) => a.url).filter((u) => /^https:\/\//.test(u || "")).slice(0, 12),
    }].slice(-GARDER);
    images.add(choix.id);
    console.log(`[stories-auto] instagram/auto/${choix.id}.jpg (${Math.round(jpeg.length / 1024)} Ko).`);
  }

  const supprimes = nettoyerImages(new Set(entrees.filter((e) => images.has(e.id)).map((e) => e.id)));
  if (supprimes.length) console.log(`[stories-auto] images anciennes supprimées : ${supprimes.join(", ")}`);
  if (!choix.refus || purge || entrees.length !== file.entrees.length) {
    fs.mkdirSync(path.dirname(FICHIER_FILE), { recursive: true });
    fs.writeFileSync(FICHIER_FILE, JSON.stringify({ lastUpdated: now.toISOString(), entrees }, null, 1) + "\n");
  }
}

module.exports = { choisirSondage, choisir, reserveSondages, jourPublication, choisirSujet, motExclu, idSujet, jourUTC2, heureParis, elaguer, nettoyerImages, dimensionsJpeg, MAX_PAR_JOUR, GARDER };

if (require.main === module) (process.argv.includes("--a-faire") ? Promise.resolve(aFaire()) : main()).catch((e) => { console.error("[stories-auto]", e.message); process.exit(1); });
