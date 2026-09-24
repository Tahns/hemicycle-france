#!/usr/bin/env node
/**
 * Test de fumée du site dans Chromium (Playwright) : ordinateur et mobile.
 * Vérifie qu'aucune erreur JavaScript ne survient, que chaque page affiche ses données,
 * que les liens directs fonctionnent et qu'il n'y a pas de défilement horizontal.
 *
 * USAGE : node tests/smoke.cjs   (nécessite le paquet « playwright » et Chromium)
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const RACINE = path.resolve(__dirname, "..");
const TYPES = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".js": "text/javascript" };

function serveur() {
  return new Promise((ok) => {
    const s = http.createServer((req, res) => {
      const url = decodeURIComponent(req.url.split("?")[0]);
      const fichier = path.join(RACINE, url === "/" ? "index.html" : url);
      if (!fichier.startsWith(RACINE) || !fs.existsSync(fichier)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "Content-Type": TYPES[path.extname(fichier)] || "application/octet-stream" });
      fs.createReadStream(fichier).pipe(res);
    });
    s.listen(0, () => ok(s));
  });
}

const echecs = [];
function verifier(cond, message) {
  if (!cond) echecs.push(message);
}

(async () => {
  const s = await serveur();
  const base = `http://localhost:${s.address().port}/`;
  const navigateur = await chromium.launch();

  for (const [nom, viewport] of [["ordinateur", { width: 1300, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
    const page = await navigateur.newPage({ viewport });
    const erreurs = [];
    page.on("pageerror", (e) => erreurs.push(e.message));
    // Les polices Google peuvent être indisponibles hors ligne : on ne les compte pas comme erreurs
    page.on("console", (m) => { if (m.type() === "error" && !/fonts\.g/.test(m.text()) && !/Failed to load resource/.test(m.text())) erreurs.push(m.text()); });

    await page.goto(base, { waitUntil: "networkidle" });
    const largeur = async () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

    verifier((await page.$$(".accueil-highlight-card")).length >= 2, `${nom} : cartes « À la une » absentes`);

    for (const onglet of ["scrutin", "histo", "deputes", "senat", "candidats", "dirigeants", "justice", "sondages", "meetings", "quiz", "chiffres"]) {
      await page.evaluate((t) => document.querySelector(`.tab[data-tab="${t}"]`).click(), onglet);
      await page.waitForTimeout(250);
      verifier((await largeur()) <= 1, `${nom} : défilement horizontal sur l'onglet ${onglet}`);
    }

    await page.goto(base + "#scrutin-3054", { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    verifier((await page.$eval("#loi-select", (s) => s.value)) === "an-scrutin-3054", `${nom} : lien direct #scrutin-3054 inopérant`);
    verifier((await page.$$("#hemicycle circle.siege")).length >= 570, `${nom} : hémicycle incomplet`);
    verifier((await page.$$("#breakdown-list .party-row")).length === 12, `${nom} : détail par groupe incomplet`);

    // Filtres : un filtre actif fait apparaître « Réinitialiser », qui rétablit l'état par défaut
    const etatFiltres = () => page.evaluate(() => ({ n: document.getElementById("loi-count").textContent, theme: document.getElementById("loi-theme").value,
      reset: document.getElementById("loi-reset").hidden, type: document.querySelector("#theme-filter-bar .selected")?.dataset.cat }));
    const avant = await etatFiltres();
    await page.selectOption("#loi-theme", "Défense");
    await page.waitForTimeout(200);
    const filtre = await etatFiltres();
    verifier(!filtre.reset && filtre.n !== avant.n, `${nom} : le filtre par thème est sans effet`);
    await page.click("#loi-reset");
    await page.waitForTimeout(200);
    const apres = await etatFiltres();
    verifier(apres.reset && apres.theme === "" && apres.type === "texte" && /\d/.test(apres.n), `${nom} : « Réinitialiser » ne rétablit pas les filtres`);

    await page.goto(base + "#histo-LFI", { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    verifier((await page.$$(".histo-row")).length > 10, `${nom} : historique vide`);
    verifier((await page.$$(".proximite-row")).length >= 5, `${nom} : proximité de vote absente`);
    if (nom === "mobile") {
      await page.selectOption("#party-select", "RN");
      await page.waitForTimeout(200);
      verifier(/#histo-RN$/.test(page.url()), `${nom} : la liste déroulante des groupes ne change pas de groupe`);
    }

    await page.goto(base + "#sondages", { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    verifier((await page.$$(".sondage-bar-row")).length >= 4, `${nom} : sondages absents`);
    verifier((await page.$$("#evolution-graphe path")).length >= 3, `${nom} : courbe d'évolution des sondages absente`);
    verifier((await largeur()) <= 1, `${nom} : défilement horizontal avec la courbe des sondages`);

    await page.goto(base + "#deputes", { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    verifier((await page.$$(".depute-carte")).length >= 50, `${nom} : liste des députés vide`);
    await page.fill("#depute-search", "33");
    await page.waitForTimeout(300);
    const nbGironde = (await page.$$(".depute-carte")).length;
    verifier(nbGironde >= 5 && nbGironde <= 15, `${nom} : la recherche par département ne fonctionne pas (${nbGironde})`);
    await page.click(".depute-carte");
    await page.waitForTimeout(300);
    verifier(/#depute-PA\d+$/.test(page.url()), `${nom} : la fiche député n'a pas de lien direct`);
    verifier((await page.$$("#depute-fiche .stat-card")).length === 4, `${nom} : statistiques du député absentes`);
    verifier((await largeur()) <= 1, `${nom} : défilement horizontal sur la fiche député`);

    await page.goto(base + "#candidats", { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    verifier((await page.$$(".candidat-carte")).length >= 5, `${nom} : candidats absents`);

    await page.goto(base + "#senat", { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    verifier((await page.$$(".senat-ligne")).length >= 10, `${nom} : scrutins du Sénat absents`);

    // Recherche sur tout le site
    await page.click(nom === "mobile" ? ".loupe-mobile" : ".masthead-top .bouton-recherche");
    await page.fill("#recherche-champ", "retraites");
    await page.waitForTimeout(400);
    verifier((await page.$$(".recherche-item")).length >= 1, `${nom} : la recherche ne trouve rien`);
    await page.keyboard.press("Escape");
    verifier(await page.evaluate(() => document.getElementById("recherche").hidden), `${nom} : la recherche ne se ferme pas`);

    await page.goto(base + "#dirigeants", { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    verifier((await page.$$(".groupe-card")).length >= 10, `${nom} : groupes de l'Assemblée absents`);

    await page.goto(base + "#chiffres", { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    verifier((await page.$$(".chiffre-card")).length >= 5, `${nom} : indicateurs absents`);

    await page.goto(base + "#quiz", { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    for (const g of await page.$$(".quiz-options")) await (await g.$$(".quiz-option"))[0].click();
    await page.waitForTimeout(200);
    await page.click("#quiz-submit");
    verifier((await page.$$(".quiz-result-row")).length >= 8, `${nom} : résultat du quiz absent`);

    if (nom === "mobile") {
      // Version téléphone : barre d'onglets et panneau « Plus »
      await page.goto(base, { waitUntil: "networkidle" });
      verifier(await page.isVisible(".barre-mobile"), "mobile : barre d'onglets absente");
      await page.click("#bouton-plus");
      verifier(await page.isVisible("#feuille-plus"), "mobile : le panneau « Plus » ne s'ouvre pas");
      await page.click('.feuille-lien[data-tab="chiffres"]');
      await page.waitForTimeout(250);
      verifier(await page.evaluate(() => document.getElementById("view-chiffres").classList.contains("active") && document.getElementById("feuille-plus").hidden),
        "mobile : le panneau ne mène pas à la rubrique choisie");
      await page.click('.onglet-mobile[data-tab="scrutin"]');
      await page.waitForTimeout(400);
      verifier(await page.evaluate(() => document.getElementById("view-scrutin").classList.contains("active")), "mobile : l'onglet Votes ne fonctionne pas");
    }

    verifier(erreurs.length === 0, `${nom} : erreurs JavaScript — ${erreurs.join(" | ")}`);
    await page.close();
  }

  await navigateur.close();
  s.close();
  if (echecs.length) {
    console.error("ÉCHEC :\n- " + echecs.join("\n- "));
    process.exit(1);
  }
  console.log("Test de fumée : OK (ordinateur et mobile).");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
