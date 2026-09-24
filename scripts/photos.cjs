#!/usr/bin/env node
/**
 * photos.cjs
 * ----------
 * Photos officielles des députés et des sénateurs en fonction, hébergées sur le site lui-même
 * (le site ne charge rien depuis un autre domaine) et réduites pour rester légères :
 *  - photos/deputes/<PA…>.jpg   d'après assemblee-nationale.fr (photo de l'Assemblée nationale) ;
 *  - photos/senateurs/<matricule>.jpg d'après senat.fr (photo du Sénat).
 * Chaque image est redimensionnée à 104 pixels de large (JPEG, métadonnées retirées) par Chromium.
 * Seules les photos manquantes sont téléchargées ; celles des élus qui ne sont plus en fonction
 * sont supprimées.
 *
 * USAGE : node scripts/photos.cjs [--max=1000]   (nécessite le paquet « playwright » et Chromium)
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const RACINE = path.resolve(__dirname, "..");
const USER_AGENT = "hemicycle-france-bot/1.0 (https://github.com/Tahns/hemicycle-france)";
const MAX = parseInt(process.argv.find((a) => a.startsWith("--max="))?.split("=")[1] || "1000", 10);
const LARGEUR = 104;
const log = (...m) => console.log("[photos]", ...m);
const warn = (...m) => console.warn("[photos][ATTENTION]", ...m);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const lireJson = (f) => { try { return JSON.parse(fs.readFileSync(path.join(RACINE, f), "utf-8")); } catch { return null; } };

async function main() {
  const deputes = lireJson("data/deputes.json")?.deputes || [];
  const senateurs = lireJson("data/senateurs.json")?.senateurs || [];
  const lots = [
    { dossier: "photos/deputes", elus: deputes.map((d) => [d.id, `https://www.assemblee-nationale.fr/dyn/static/tribun/17/photos/${d.id.replace(/^PA/, "")}.jpg`]) },
    { dossier: "photos/senateurs", elus: senateurs.filter((s) => s.slug).map((s) => [s.id, `https://www.senat.fr/senimg/${s.slug}_carre.jpg`]) },
  ];
  const navigateur = await chromium.launch();
  const page = await navigateur.newPage();
  await page.setContent("<canvas></canvas>");
  let ajoutees = 0, echecs = 0, retirees = 0;
  try {
    for (const { dossier, elus } of lots) {
      const dir = path.join(RACINE, dossier);
      fs.mkdirSync(dir, { recursive: true });
      const attendus = new Set(elus.map(([id]) => `${id}.jpg`));
      for (const f of fs.readdirSync(dir)) if (f.endsWith(".jpg") && !attendus.has(f)) { fs.unlinkSync(path.join(dir, f)); retirees++; }
      for (const [id, url] of elus) {
        const fichier = path.join(dir, `${id}.jpg`);
        if (fs.existsSync(fichier) || ajoutees >= MAX) continue;
        try {
          const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
          if (!res.ok || !/image\/jpe?g/.test(res.headers.get("content-type") || "")) throw new Error(`HTTP ${res.status}`);
          const b64 = Buffer.from(await res.arrayBuffer()).toString("base64");
          const reduite = await page.evaluate(async ({ b64, largeur }) => {
            const img = new Image();
            img.src = `data:image/jpeg;base64,${b64}`;
            await img.decode();
            const c = document.querySelector("canvas");
            c.width = largeur;
            c.height = Math.round(img.naturalHeight * largeur / img.naturalWidth);
            const ctx = c.getContext("2d");
            ctx.imageSmoothingQuality = "high";
            ctx.drawImage(img, 0, 0, c.width, c.height);
            return c.toDataURL("image/jpeg", 0.82).split(",")[1];
          }, { b64, largeur: LARGEUR });
          fs.writeFileSync(fichier, Buffer.from(reduite, "base64"));
          ajoutees++;
          await pause(150);
        } catch (e) {
          echecs++;
          if (echecs <= 10) warn(`${id} : ${e.message}`);
        }
      }
    }
  } finally {
    await navigateur.close();
  }
  log(`${ajoutees} photo(s) ajoutée(s), ${retirees} retirée(s), ${echecs} échec(s).`);
  if (echecs > 50) process.exitCode = 1;
}

main().catch((e) => { console.error("[photos] ÉCHEC :", e.message); process.exitCode = 1; });
