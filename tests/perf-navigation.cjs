#!/usr/bin/env node
/**
 * Banc de mesure de la navigation (téléphone d'entrée de gamme simulé) + test de non-régression.
 * CPU ralenti ×CPU (défaut 20), réseau 3G rapide, service worker actif ou bloqué.
 * Mesure, pour chaque rubrique : délai jusqu'au premier affichage utile, tâches longues, nœuds DOM.
 * Échoue si le nombre de nœuds DOM après visite des 16 rubriques dépasse 12 000.
 *
 * USAGE : node tests/perf-navigation.cjs [--cpu=20] [--sw=allow|block] [--json]
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const RACINE = path.resolve(__dirname, "..");
const TYPES = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".js": "text/javascript", ".svg": "image/svg+xml", ".css": "text/css", ".webmanifest": "application/manifest+json", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2" };
const arg = (n, d) => { const a = process.argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.split("=")[1] : d; };
const CPU = Number(arg("cpu", 20));
const SW = arg("sw", "block") === "allow" ? "allow" : "block";
const LIMITE_NOEUDS = 12000;
const RUBRIQUES = ["accueil", "scrutin", "histo", "deputes", "senat", "dirigeants", "chiffres", "budget", "actualites", "meetings", "justice", "sondages", "candidats", "comprendre", "quiz", "methode"];

function serveur() {
  return new Promise((ok) => {
    const s = http.createServer((req, res) => {
      const url = decodeURIComponent(req.url.split("?")[0]);
      const f = path.join(RACINE, url === "/" ? "index.html" : url);
      if (!f.startsWith(RACINE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" });
      fs.createReadStream(f).pipe(res);
    });
    s.listen(0, () => ok(s));
  });
}

(async () => {
  const s = await serveur();
  const base = `http://localhost:${s.address().port}/`;
  const nav = await chromium.launch();
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, locale: "fr-FR", isMobile: true, hasTouch: true, serviceWorkers: SW });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on("pageerror", (e) => erreurs.push(e.message));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Performance.enable");
  await page.addInitScript(() => {
    window.__lt = [];
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(e.duration); }).observe({ entryTypes: ["longtask"] }); } catch (e) {}
  });
  await page.goto(base, { waitUntil: "networkidle" });
  if (SW === "allow") { await page.evaluate(() => navigator.serviceWorker.ready); await page.reload({ waitUntil: "networkidle" }); }
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 });

  const metr = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
  const lignes = [];
  for (const passe of [1, 2]) {
    for (const r of RUBRIQUES) {
      await page.evaluate(() => { window.__lt.length = 0; });
      const m0 = await metr();
      // « premier affichage utile » : la vue est active et une image a été peinte
      const t = await page.evaluate((r) => new Promise((ok) => {
        const d = performance.now();
        activateTab(r);
        requestAnimationFrame(() => requestAnimationFrame(() => ok(performance.now() - d)));
      }), r);
      // on laisse le travail différé se terminer avant de passer à la suite
      await page.waitForTimeout(400 + 40 * CPU);
      const m1 = await metr();
      const info = await page.evaluate(() => ({ lt: window.__lt.slice(), noeuds: document.getElementsByTagName("*").length }));
      lignes.push({ passe, r, ms: Math.round(t), longue: Math.round(Math.max(0, ...info.lt)), nb: info.lt.length, noeuds: info.noeuds,
        style: Math.round((m1.RecalcStyleDuration - m0.RecalcStyleDuration) * 1000), layout: Math.round((m1.LayoutDuration - m0.LayoutDuration) * 1000), script: Math.round((m1.ScriptDuration - m0.ScriptDuration) * 1000) });
    }
  }
  const noeudsMax = Math.max(...lignes.map((l) => l.noeuds));
  if (!process.argv.includes("--json")) {
    console.log(`CPU x${CPU}, SW ${SW}`);
    console.log("passe rubrique   ms  tacheMax(n)  noeuds  style layout script (ms)");
    for (const l of lignes) console.log(`${l.passe}  ${l.r.padEnd(11)} ${String(l.ms).padStart(5)}  ${String(l.longue).padStart(5)}(${l.nb})  ${String(l.noeuds).padStart(6)}  ${String(l.style).padStart(5)} ${String(l.layout).padStart(5)} ${String(l.script).padStart(5)}`);
  }
  const resume = { cpu: CPU, sw: SW, msMax: Math.max(...lignes.map((l) => l.ms)), msMoy: Math.round(lignes.reduce((a, l) => a + l.ms, 0) / lignes.length), tacheMax: Math.max(...lignes.map((l) => l.longue)), noeudsMax, erreurs: erreurs.length };
  console.log("RESUME " + JSON.stringify(resume));
  await nav.close(); s.close();
  if (erreurs.length) { console.error("Erreurs JS :", erreurs.slice(0, 3)); process.exit(1); }
  if (noeudsMax > LIMITE_NOEUDS) { console.error(`ÉCHEC : ${noeudsMax} nœuds DOM > ${LIMITE_NOEUDS}`); process.exit(1); }
})();
