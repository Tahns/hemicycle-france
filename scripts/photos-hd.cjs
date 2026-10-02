#!/usr/bin/env node
/**
 * photos-hd.cjs
 * -------------
 * Versions plus grandes (400 px de large au plus) des photos officielles des députés et des sénateurs, pour que les stories
 * Instagram ne soient pas floues (les vignettes du site font 104 px). Uniquement pour les parlementaires cités dans les sujets
 * d'actualité récents (data/actualites.json) : le dépôt ne s'alourdit pas de 900 photos.
 *  - photos/deputes/hd/<PA…>.jpg      d'après assemblee-nationale.fr (même source officielle que photos.cjs) ;
 *  - photos/senateurs/hd/<matricule>.jpg d'après senat.fr (même source officielle).
 * Plusieurs adresses officielles sont essayées, on garde la plus grande ; une photo qui ne serait pas plus grande que la
 * vignette est ignorée (inutile). Jamais d'agrandissement : la largeur finale ne dépasse pas celle de la source.
 * Les versions HD des personnes qui ne sont plus citées depuis plus de 7 jours sont supprimées.
 * Les portraits de personnalités sans photo officielle sont traités par fetch-portraits.js (photos/personnalites/hd).
 *
 * USAGE : node scripts/photos-hd.cjs   (nécessite le paquet « playwright » et Chromium)
 */
const fs = require("fs");
const path = require("path");

const RACINE = path.resolve(__dirname, "..");
const USER_AGENT = "hemicycle-france-bot/1.0 (https://github.com/Tahns/hemicycle-france)";
const LARGEUR_MAX = 400;
const LARGEUR_MINI = 150; // en dessous, pas mieux que la vignette de 104 px
const GARDE_JOURS = 7;
const log = (...m) => console.log("[photos-hd]", ...m);
const warn = (...m) => console.warn("[photos-hd][ATTENTION]", ...m);
const lireJson = (f) => { try { return JSON.parse(fs.readFileSync(path.join(RACINE, f), "utf-8")); } catch { return null; } };

/** Parlementaires cités (avec photo officielle) dans les sujets d'actualité : { deputes: Set(id), senateurs: Set(id) }. */
function cites(actualites) {
  const r = { deputes: new Set(), senateurs: new Set() };
  for (const s of actualites?.sujets || []) {
    for (const p of s.illustration?.personnes || []) {
      const m = /^photos\/(deputes|senateurs)\/([^/]+)\.jpg$/.exec(p.photo || "");
      if (m) r[m[1]].add(m[2]);
    }
  }
  return r;
}

/** Adresses officielles à essayer, de la plus probable à la moins probable. */
function adresses(dossier, id, senateurs) {
  if (dossier === "deputes") {
    const n = id.replace(/^PA/, "");
    return [`https://www.assemblee-nationale.fr/dyn/static/tribun/17/photos/${n}.jpg`, `https://www.assemblee-nationale.fr/dyn/static/tribun/17/photos/carre/${n}.jpg`];
  }
  const slug = senateurs.find((s) => s.id === id)?.slug;
  return slug ? [`https://www.senat.fr/senimg/${slug}.jpg`, `https://www.senat.fr/senimg/${slug}_carre.jpg`] : [];
}

async function main() {
  const { chromium } = require("playwright");
  const actualites = lireJson("data/actualites.json");
  const senateurs = lireJson("data/senateurs.json")?.senateurs || [];
  const c = cites(actualites);
  const maintenant = Date.now();
  let ajoutees = 0, retirees = 0, echecs = 0;
  const navigateur = await chromium.launch();
  const page = await navigateur.newPage();
  await page.setContent("<canvas></canvas>");
  try {
    for (const dossier of ["deputes", "senateurs"]) {
      const dirHd = path.join(RACINE, "photos", dossier, "hd");
      fs.mkdirSync(dirHd, { recursive: true });
      for (const id of c[dossier]) {
        const fichier = path.join(dirHd, `${id}.jpg`);
        if (fs.existsSync(fichier) || !fs.existsSync(path.join(RACINE, "photos", dossier, `${id}.jpg`))) continue;
        let meilleure = null;
        for (const url of adresses(dossier, id, senateurs)) {
          try {
            const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(20000) });
            if (!res.ok || !/image\/jpe?g/.test(res.headers.get("content-type") || "")) continue;
            const b64 = Buffer.from(await res.arrayBuffer()).toString("base64");
            const r = await page.evaluate(async ({ b64, max }) => {
              const img = new Image();
              img.src = `data:image/jpeg;base64,${b64}`;
              await img.decode();
              const l = Math.min(max, img.naturalWidth); // jamais plus grande que la source
              const cv = document.querySelector("canvas");
              cv.width = l; cv.height = Math.round(img.naturalHeight * l / img.naturalWidth);
              const ctx = cv.getContext("2d");
              ctx.imageSmoothingQuality = "high";
              ctx.drawImage(img, 0, 0, cv.width, cv.height);
              return { source: img.naturalWidth, jpeg: cv.toDataURL("image/jpeg", 0.86).split(",")[1] };
            }, { b64, max: LARGEUR_MAX });
            if (r.source >= LARGEUR_MINI && (!meilleure || r.source > meilleure.source)) meilleure = r;
          } catch (e) { /* adresse suivante */ }
        }
        if (!meilleure) { echecs++; if (echecs <= 10) warn(`${dossier}/${id} : aucune version plus grande que la vignette`); continue; }
        fs.writeFileSync(fichier, Buffer.from(meilleure.jpeg, "base64"));
        ajoutees++;
      }
      // Ménage : plus cités depuis plus de 7 jours
      for (const f of fs.readdirSync(dirHd)) {
        const m = /^([A-Za-z0-9]+)\.jpg$/.exec(f);
        if (!m || c[dossier].has(m[1])) continue;
        const chemin = path.join(dirHd, f);
        if (maintenant - fs.statSync(chemin).mtimeMs > GARDE_JOURS * 864e5) { fs.unlinkSync(chemin); retirees++; }
      }
    }
  } finally {
    await navigateur.close();
  }
  log(`${ajoutees} version(s) HD ajoutée(s), ${retirees} retirée(s), ${echecs} sans version plus grande.`);
}

module.exports = { cites, adresses };

if (require.main === module) main().catch((e) => { console.error("[photos-hd] ÉCHEC :", e.message); process.exitCode = 1; });
