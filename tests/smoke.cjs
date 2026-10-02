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
const TYPES = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".js": "text/javascript", ".svg": "image/svg+xml" };

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
    const page = await navigateur.newPage({ viewport, locale: "fr-FR" });
    const erreurs = [];
    page.on("pageerror", (e) => erreurs.push(e.message));
    // Les polices Google peuvent être indisponibles hors ligne : on ne les compte pas comme erreurs
    page.on("console", (m) => { if (m.type() === "error" && !/fonts\.g/.test(m.text()) && !/Failed to load resource/.test(m.text())) erreurs.push(m.text()); });

    await page.goto(base, { waitUntil: "networkidle" });
    const largeur = async () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

    verifier((await page.$$(".accueil-highlight-card")).length >= 2, `${nom} : cartes « À la une » absentes`);


    verifier((await page.$$(".tab")).length === 6, `${nom} : la barre du haut doit compter 6 regroupements`);
    verifier((await page.$$(".accueil-rubrique")).length === 6, `${nom} : la grille de l'accueil doit compter 6 regroupements`);
    verifier((await page.$$(".onglet-mobile")).length <= 5, `${nom} : la barre mobile doit compter 5 entrées au plus`);
    for (const onglet of ["scrutin", "histo", "deputes", "senat", "candidats", "actualites", "dirigeants", "justice", "sondages", "meetings", "quiz", "chiffres", "budget", "comprendre", "presidents"]) {
      // Navigation à six regroupements : on ouvre la page par la barre du haut ou par le menu « Dans cette rubrique »
      await page.evaluate((t) => {
        const tab = document.querySelector(`.tab[data-tab="${t}"]`);
        if (tab) (tab.querySelector(".tab-libelle") || tab).click();
        else {
          const hub = HUBS.find((h) => h.pages.some((p) => p[0] === t));
          document.querySelector(`.tab[data-hub="${hub.id}"] .tab-libelle`).click();
          const sel = document.querySelector(".sous-nav select");
          sel.value = t;
          sel.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }, onglet);
      await page.waitForTimeout(250);
      verifier(await page.evaluate((t) => document.getElementById("view-" + t).classList.contains("active"), onglet), `${nom} : la page ${onglet} ne s'ouvre pas`);
      verifier(await page.evaluate((t) => {
        const n = HUBS.find((h) => h.pages.some((p) => p[0] === t)).pages.length;
        const sn = document.querySelector(`#view-${t} .sous-nav`);
        return n < 2 ? !sn : !!sn && sn.querySelectorAll("option").length === n && sn.querySelector("select").value === t && /Dans cette rubrique/.test(sn.textContent);
      }, onglet), `${nom} : sous-navigation incorrecte sur ${onglet}`);
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
    if (nom === "mobile") {
      // Sur téléphone, les filtres sont repliés derrière un bouton qui affiche le nombre de résultats
      verifier(!(await page.isVisible("#loi-theme")) && /scrutin/.test(await page.textContent("#view-scrutin .filtres-bouton")), `${nom} : filtres non repliés ou résumé absent`);
      await page.click("#view-scrutin .filtres-bouton");
    }
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
    verifier((await page.$$("#histo-cohesion .proximite-row")).length >= 8, `${nom} : cohésion des groupes absente`);
    await page.selectOption("#groupe-comparer", "RN");
    await page.waitForTimeout(200);
    verifier(/\d+ fois/.test(await page.textContent("#histo-comparateur .comparateur-resume").catch(() => "")), `${nom} : comparateur de deux groupes sans résultat`);
    verifier((await largeur()) <= 1, `${nom} : défilement horizontal avec le comparateur de groupes`);
    if (nom === "mobile") {
      await page.selectOption("#party-select", "RN");
      await page.waitForTimeout(200);
      verifier(/#histo-RN$/.test(page.url()), `${nom} : la liste déroulante des groupes ne change pas de groupe`);
    }

    await page.goto(base + "#sondages", { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    verifier((await page.$$(".sondage-bar-row")).length >= 4, `${nom} : sondages absents`);
    verifier(await page.isVisible("#annonce-president .compte"), `${nom} : décompte jusqu'à l'annonce du président absent`);
    verifier((await page.$$("#sondage-probas tbody tr")).length >= 2, `${nom} : probabilités absentes`);
    verifier((await page.$$("#evolution-graphe path")).length >= 3, `${nom} : courbe d'évolution des sondages absente`);
    verifier((await largeur()) <= 1, `${nom} : défilement horizontal avec la courbe des sondages`);

    await page.goto(base + "#deputes", { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    verifier((await page.$$(".depute-carte")).length >= 50, `${nom} : liste des députés vide`);
    await page.evaluate(() => { document.getElementById("stats-groupes-bloc").open = true; });
    await page.waitForTimeout(300);
    verifier((await page.$$("#stats-groupes-corps tbody tr")).length >= 10, `${nom} : statistiques par groupe absentes`);
    verifier((await largeur()) <= 1, `${nom} : défilement horizontal avec les statistiques par groupe`);
    await page.fill("#depute-search", "33");
    await page.waitForTimeout(300);
    const nbGironde = (await page.$$(".depute-carte")).length;
    verifier(nbGironde >= 5 && nbGironde <= 15, `${nom} : la recherche par département ne fonctionne pas (${nbGironde})`);
    await page.click(".depute-carte");
    await page.waitForTimeout(300);
    verifier(/#depute-PA\d+$/.test(page.url()), `${nom} : la fiche député n'a pas de lien direct`);
    verifier((await page.$$("#depute-fiche .stat-card")).length === 4, `${nom} : statistiques du député absentes`);
    verifier((await largeur()) <= 1, `${nom} : défilement horizontal sur la fiche député`);
    verifier((await page.$$("#depute-parcours li")).length >= 2, `${nom} : « Parcours » absent de la fiche député`);

    // Quiz : le résultat reste après rechargement, jusqu'à « Refaire le quiz »
    await page.goto(base + "#quiz", { waitUntil: "networkidle" });
    await page.waitForSelector(".quiz-options", { timeout: 15000 });
    const nbQuestions = await page.locator(".quiz-options").count();
    for (let i = 0; i < nbQuestions; i++) await page.locator(".quiz-options").nth(i).locator(".quiz-option").first().click();
    await page.click("#quiz-submit");
    await page.waitForSelector("#quiz-results-list .quiz-result-row", { timeout: 8000 });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    verifier((await page.locator("#quiz-results-list .quiz-result-row").count()) >= 3, `${nom} : le résultat du quiz ne reste pas après rechargement`);
    await page.click("#quiz-restart");
    verifier((await page.locator(".quiz-options").count()) === nbQuestions, `${nom} : « Refaire le quiz » ne rouvre pas les questions`);

    await page.goto(base + "#candidats", { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    verifier((await page.$$(".candidat-carte")).length >= 5, `${nom} : candidats absents`);

    await page.goto(base + "#senat", { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    verifier((await page.$$(".senat-ligne")).length >= 10, `${nom} : scrutins du Sénat absents`);
    verifier((await page.$$("#senat-hemicycle circle")).length === 348, `${nom} : hémicycle du Sénat incomplet`);

    // Comprendre : cinq fiches, lexique avec recherche, ligne « À quoi sert cette page ? », infobulle au clavier
    await page.goto(base + "#comprendre", { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    verifier((await page.$$("#view-comprendre .cp-bloc svg")).length === 5, `${nom} : les cinq fiches illustrées de « Comprendre » sont absentes`);
    verifier((await page.$$("#view-comprendre .cp-source a")).length >= 10, `${nom} : sources officielles absentes de « Comprendre »`);
    verifier((await page.$$("#lex-liste .lex-item")).length >= 40, `${nom} : lexique incomplet`);
    await page.fill("#lex-recherche", "navette");
    verifier((await page.$$("#lex-liste .lex-item")).length >= 1 && (await page.$$("#lex-liste .lex-item")).length < 6, `${nom} : la recherche du lexique ne filtre pas`);
    await page.fill("#lex-recherche", "");
    verifier((await largeur()) <= 1, `${nom} : défilement horizontal sur Comprendre`);
    // Les présidents : page dans le hub Comprendre, 25 présidents dans l'ordre chronologique, un seul président actuel, mode d'élection fidèle aux données, clair et sombre sans défilement horizontal
    await page.goto(base + "#presidents", { waitUntil: "networkidle" });
    await page.waitForSelector("#presidents-frise .pres-item");
    const donneesPres = JSON.parse(fs.readFileSync(path.join(RACINE, "data/presidents.json"), "utf-8"));
    const attendus = donneesPres.regimes.flatMap((r) => r.presidents.map((p) => p.nom));
    verifier(await page.evaluate(() => document.getElementById("view-presidents").classList.contains("active")), `${nom} : la page Les présidents ne s'ouvre pas`);
    verifier(attendus.length === 25 && (await page.$$("#presidents-frise .pres-item")).length === attendus.length, `${nom} : le nombre de présidents affichés ne correspond pas aux données`);
    verifier(JSON.stringify(await page.$$eval("#presidents-frise .pres-item", (l) => l.map((e) => e.dataset.president))) === JSON.stringify(attendus), `${nom} : présidents hors ordre chronologique`);
    verifier(new RegExp(`^${attendus.length} présidents depuis 1848`).test(await page.textContent("#presidents-bandeau .pres-gros")), `${nom} : bandeau « présidents depuis 1848 » incorrect`);
    verifier((await page.$$("#presidents-frise .pres-item.en-cours")).length === 1 && /Emmanuel Macron/.test(await page.textContent("#presidents-bandeau .pres-courant")), `${nom} : le président actuel n'est pas mis en évidence`);
    verifier((await page.$$("#presidents-frise .pres-regime")).length === 4 && (await page.$$("#presidents-frise .pres-pause")).length === 2, `${nom} : régimes ou périodes sans président manquants`);
    verifier((await page.$$eval("#presidents-frise .pres-item a", (l) => l.filter((a) => /^https:\/\/fr\.wikipedia\.org\/wiki\//.test(a.href)).length)) === attendus.length, `${nom} : un lien Wikipédia manque`);
    for (const r of donneesPres.regimes) {
      const phrase = (await page.textContent(`.pres-regime[data-regime="${r.id}"] .pres-election`)).replace(/\s+/g, " ").trim();
      verifier(phrase === r.election, `${nom} : mode d'élection de ${r.nom} différent des données : « ${phrase} »`);
    }
    verifier((await page.$$("#view-presidents .gl")).length >= 5, `${nom} : infobulles du glossaire absentes sur Les présidents`);
    verifier((await largeur()) <= 1, `${nom} : défilement horizontal sur Les présidents`);
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "sombre"));
    verifier((await largeur()) <= 1, `${nom} : défilement horizontal sur Les présidents en mode sombre`);
    verifier(await page.evaluate(() => { const c = getComputedStyle(document.querySelector("#presidents-frise .pres-nom a")).color.match(/\d+/g).map(Number); return c.reduce((a, b) => a + b, 0) > 384; }), `${nom} : texte des présidents illisible en mode sombre`);
    await page.evaluate(() => document.documentElement.removeAttribute("data-theme"));
    verifier((await largeur()) <= 1, `${nom} : défilement horizontal sur Les présidents en mode clair`);
    for (const t of ["scrutin", "histo", "deputes", "senat", "dirigeants", "chiffres", "budget", "actualites", "meetings", "justice", "sondages", "candidats", "quiz", "presidents"]) {
      verifier((await page.$$(`#view-${t} .sert`)).length === 1, `${nom} : ligne « À quoi sert cette page ? » absente sur ${t}`);
    }
    await page.goto(base + "#scrutin", { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    const terme = await page.$("#view-scrutin .gl");
    verifier(!!terme && (await terme.evaluate((b) => b.tagName)) === "BUTTON", `${nom} : terme de glossaire absent ou pas un bouton`);
    if (terme) {
      await terme.focus();
      await page.keyboard.press("Enter");
      verifier(await page.isVisible("#gl-pop") && (await terme.getAttribute("aria-expanded")) === "true" && /\S/.test(await page.textContent("#gl-pop")), `${nom} : l'infobulle ne s'ouvre pas au clavier`);
      verifier((await largeur()) <= 1, `${nom} : défilement horizontal avec l'infobulle ouverte`);
      await page.keyboard.press("Escape");
      verifier(!(await page.isVisible("#gl-pop")) && (await terme.getAttribute("aria-expanded")) === "false", `${nom} : l'infobulle ne se ferme pas avec Échap`);
    }

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
    verifier((await page.$$(".chiffre-card")).length >= 4 && (await page.$$("#budget-hero .gauge-svg")).length === 2, `${nom} : indicateurs absents`);

    await page.goto(base + "#methode", { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    verifier(await page.isVisible("#view-methode"), `${nom} : page Méthode absente`);
    verifier((await page.$$("#methode-maj tr")).length >= 5 && !/Chargement|date non indiquée/.test(await page.textContent("#methode-maj")), `${nom} : dates de mise à jour de la page Méthode non lues dans data/*.json`);
    verifier(/Méthode/.test(await page.title()), `${nom} : titre de la page Méthode`);
    verifier((await largeur()) <= 1, `${nom} : défilement horizontal sur la page Méthode`);

    await page.goto(base + "#quiz", { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    for (const g of await page.$$(".quiz-options")) await (await g.$$(".quiz-option"))[0].click();
    await page.waitForTimeout(200);
    await page.click("#quiz-submit");
    verifier((await page.$$(".quiz-result-row")).length >= 8, `${nom} : résultat du quiz absent`);

    // Boutons « Story » : présents sur chaque page concernée, et un clic affiche une image dans l'aperçu.
    // Si un type de story n'a pas encore de dessin (STORY_PLUS), un dessin minimal le remplace : on vérifie alors le branchement du bouton.
    const poserDessins = () => page.evaluate(() => {
      for (const t of ["actualite", "actualites", "probabilites", "secondtour", "decompte", "candidat", "parti", "justice", "indicateur", "groupe", "meeting"])
        if (!STORY_PLUS[t]) STORY_PLUS[t] = async (ctx) => { ctx.fillStyle = "#123"; ctx.fillRect(0, 0, 40, 40); return { nom: "test" }; };
    });
    for (const [onglet, type] of [["accueil", "actualites"], ["actualites", "actualites"], ["sondages", "probabilites"], ["sondages", "decompte"], ["histo", "groupe"],
      ["scrutin", "scrutin"], ["senat", "senat"], ["dirigeants", "gouvernement"]]) {
      await page.goto(base + (onglet === "accueil" ? "" : "#" + onglet), { waitUntil: "networkidle" });
      await poserDessins();
      await page.waitForTimeout(300);
      const bouton = page.locator(`.view.active .bouton-story[data-story="${type}"]:not([hidden])`).first();
      verifier((await bouton.count()) >= 1, `${nom} : bouton Story « ${type} » absent sur ${onglet}`);
      if (!(await bouton.count())) continue;
      await bouton.evaluate((b) => b.click());
      await page.waitForFunction(() => document.getElementById("story-apercu").getAttribute("src"), null, { timeout: 8000 }).catch(() => {});
      verifier(!!(await page.getAttribute("#story-apercu", "src")), `${nom} : la story « ${type} » (${onglet}) ne s'affiche pas`);
      await page.evaluate(() => fermerStory());
    }

    if (nom === "ordinateur") {
      // Menus déroulants de la barre du haut
      await page.goto(base, { waitUntil: "networkidle" });
      verifier((await page.$$(".tab-menu")).length === 4, "ordinateur : 4 regroupements doivent avoir un menu déroulant");
      verifier((await page.$$('.tab:not(.tab-menu)')).length === 2, "ordinateur : À la une et Actualités restent des liens directs");
      const flecheElus = '.tab[data-hub="elus"] .tab-fleche';
      verifier((await page.getAttribute(flecheElus, "aria-expanded")) === "false", "ordinateur : menu fermé au départ (aria-expanded)");
      await page.click(flecheElus);
      verifier((await page.getAttribute(flecheElus, "aria-expanded")) === "true" && await page.isVisible("#menu-elus"), "ordinateur : le clic sur la flèche n'ouvre pas le menu");
      verifier(await page.evaluate(() => { const l = document.getElementById("menu-elus"); const r = l.getBoundingClientRect(); return l.querySelectorAll("a[role=menuitem]").length === 6 && [...l.querySelectorAll("a")].every(a => a.querySelector("b") && a.querySelector("span").textContent.trim()) && r.left >= 0 && r.right <= innerWidth; }),
        "ordinateur : menu Élus incomplet ou coupé par l'écran");
      await page.keyboard.press("Escape");
      verifier((await page.getAttribute(flecheElus, "aria-expanded")) === "false" && !(await page.isVisible("#menu-elus")), "ordinateur : Échap ne ferme pas le menu");
      await page.click(flecheElus);
      await page.mouse.click(5, 600);
      verifier(!(await page.isVisible("#menu-elus")), "ordinateur : un clic extérieur ne ferme pas le menu");
      // Survol
      await page.mouse.move(5, 5);
      await page.hover('.tab[data-hub="argent"] .tab-libelle');
      await page.waitForTimeout(150);
      verifier(await page.isVisible("#menu-argent"), "ordinateur : le survol n'ouvre pas le menu");
      await page.mouse.move(5, 700);
      await page.waitForTimeout(450);
      verifier(!(await page.isVisible("#menu-argent")), "ordinateur : le menu ne se ferme pas à la sortie du survol");
      // Clavier : flèche bas ouvre, flèches déplacent, Entrée choisit
      await page.focus('.tab[data-hub="presidentielle"] .tab-fleche');
      await page.keyboard.press("ArrowDown");
      verifier(await page.evaluate(() => document.activeElement.dataset.menuPage === "sondages"), "ordinateur : ArrowDown doit focaliser le premier choix");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowDown");
      verifier(await page.evaluate(() => document.activeElement.dataset.menuPage === "sondages"), "ordinateur : la navigation clavier doit boucler");
      await page.keyboard.press("ArrowUp");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(300);
      verifier(await page.evaluate(() => document.getElementById("view-meetings").classList.contains("active") && location.hash === "#meetings" && document.querySelector('.tab[data-hub="presidentielle"]').classList.contains("active") && document.getElementById("menu-presidentielle").hidden),
        "ordinateur : Entrée dans le menu ne mène pas à la page choisie");
      // Le libellé du regroupement ouvre sa page d'ouverture
      await page.click('.tab[data-hub="elus"] .tab-libelle');
      await page.waitForTimeout(250);
      verifier(await page.evaluate(() => document.getElementById("view-scrutin").classList.contains("active")), "ordinateur : le libellé du regroupement n'ouvre pas sa première page");
      // Menus au bord droit de l'écran, à 800 px
      await page.setViewportSize({ width: 800, height: 700 });
      await page.click('.tab[data-hub="quiz"] .tab-fleche');
      verifier(await page.evaluate(() => { const r = document.getElementById("menu-quiz").getBoundingClientRect(); return r.right <= innerWidth && r.left >= 0; }), "ordinateur 800 px : menu Quiz coupé");
      verifier((await largeur()) <= 1, "ordinateur 800 px : défilement horizontal avec menu ouvert");
      await page.setViewportSize({ width: 1300, height: 900 });
    }

    if (nom === "mobile") {
      // Version téléphone : barre d'onglets et panneau « Plus »
      await page.goto(base, { waitUntil: "networkidle" });
      verifier(await page.isVisible(".barre-mobile"), "mobile : barre d'onglets absente");
      await page.click("#bouton-plus");
      verifier(await page.isVisible("#feuille-plus"), "mobile : le panneau « Plus » ne s'ouvre pas");
      verifier(await page.evaluate(() => document.querySelectorAll("#feuille-plus details.feuille-section").length >= 2 && document.querySelectorAll("#feuille-plus details[open]").length === 1),
        "mobile : le panneau « Plus » doit être un accordéon (une seule section dépliée)");
      await page.click("#feuille-plus details:not([open]) > summary");
      await page.waitForTimeout(150);
      verifier(await page.evaluate(() => document.querySelectorAll("#feuille-plus details[open]").length === 1), "mobile : l'accordéon doit replier l'autre section");
      await page.click("#feuille-plus details[data-section='actu-argent'] > summary");
      await page.waitForTimeout(100);
      await page.click('.feuille-lien[data-tab="budget"]');
      await page.waitForTimeout(250);
      verifier(await page.evaluate(() => document.getElementById("view-budget").classList.contains("active") && document.getElementById("feuille-plus").hidden),
        "mobile : le panneau « Plus » ne mène pas à la rubrique Budget");
      await page.click("#bouton-plus");
      await page.click('.feuille-lien[data-tab="chiffres"]');
      await page.waitForTimeout(250);
      verifier(await page.evaluate(() => document.getElementById("view-chiffres").classList.contains("active") && document.getElementById("feuille-plus").hidden),
        "mobile : le panneau ne mène pas à la rubrique choisie");
      verifier(await page.evaluate(() => { const s = document.querySelector("#view-chiffres .sous-nav select"); return !!s && s.getBoundingClientRect().height >= 44 && s.value === "chiffres"; }),
        "mobile : le menu « Dans cette rubrique » (select natif, 44 px) est absent");
      await page.selectOption("#view-chiffres .sous-nav select", "budget");
      await page.waitForTimeout(250);
      verifier(await page.evaluate(() => document.getElementById("view-budget").classList.contains("active")), "mobile : le choix du select ne change pas de page");
      await page.click('.onglet-mobile[data-tab="scrutin"]');
      await page.waitForTimeout(400);
      verifier(await page.evaluate(() => document.getElementById("view-scrutin").classList.contains("active")), "mobile : l'onglet Votes ne fonctionne pas");
    }

    verifier(erreurs.length === 0, `${nom} : erreurs JavaScript — ${erreurs.join(" | ")}`);
    await page.close();
  }

  // Bandeau « En direct » : data/direct.json injecté (événement de presse + séance), puis vide, puis absent (404)
  {
    const maintenant = Date.now();
    const evenements = [
      { id: "president-prise-de-parole-test", type: "prise-de-parole", titre: "Emmanuel Macron s'exprimera ce soir à 20 h (titre fictif très long pour vérifier le retour à la ligne sur mobile sans aucun débordement horizontal)", quand: "Ce soir à 20 h", publie: new Date(maintenant - 36e5).toISOString(), expire: new Date(maintenant + 5 * 36e5).toISOString(), source: { media: "Média test", url: "https://example.org/article" },
        chaines: [["franceinfo", "https://www.francetvinfo.fr/en-direct/"], ["BFMTV", "https://www.bfmtv.com/en-direct/"], ["LCI", "https://www.tf1info.fr/direct/"], ["Public Sénat", "https://www.publicsenat.fr/direct"], ["France 24", "https://www.france24.com/fr/direct"]].map(([nom, url]) => ({ nom, url })) },
      { id: "seance-an-test", type: "seance-an", titre: "Séance publique à l'Assemblée nationale : Proposition de loi fictive", quand: "Aujourd'hui", expire: new Date(maintenant + 5 * 36e5).toISOString(), source: { media: "Assemblée nationale", url: "https://www2.assemblee-nationale.fr/agendas/les-agendas" }, chaines: [{ nom: "Direct de l'Assemblée nationale", url: "https://videos.assemblee-nationale.fr/" }] },
      { id: "expire", type: "discours", titre: "Titre expiré qui ne doit pas apparaître", quand: "x", expire: new Date(maintenant - 1000).toISOString(), source: { media: "Média test", url: "https://example.org/vieux" }, chaines: [{ nom: "BFMTV", url: "https://www.bfmtv.com/en-direct/" }] },
    ];
    for (const [nom, viewport] of [["ordinateur", { width: 1300, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
      for (const cas of ["present", "vide", "absent"]) for (const theme of ["clair", "sombre"]) {
        const page = await (await navigateur.newContext({ viewport, serviceWorkers: "block", locale: "fr-FR" })).newPage();
        const erreurs = [];
        page.on("pageerror", (e) => erreurs.push(e.message));
        await page.route(/\/data\/direct\.json/, (route) => cas === "absent" ? route.fulfill({ status: 404, body: "" })
          : route.fulfill({ contentType: "application/json", body: JSON.stringify({ lastUpdated: new Date().toISOString(), evenements: cas === "present" ? evenements : [] }) }));
        for (const vue of ["", "#actualites"]) {
          const lieu = `${nom}/${theme}/${cas}/${vue || "accueil"}`;
          await page.goto(base + vue, { waitUntil: "networkidle" });
          if (theme === "sombre") await page.evaluate(() => document.documentElement.setAttribute("data-theme", "sombre"));
          await page.waitForTimeout(300);
          const bloc = page.locator(".view.active [data-direct]");
          const visible = await bloc.isVisible();
          verifier(visible === (cas === "present"), `bandeau « En direct » ${lieu} : ${visible ? "affiché" : "absent"} à tort`);
          // Sans événement : aucun espace réservé, la vue démarre comme avant
          if (cas !== "present") verifier(await bloc.evaluate((e) => e.hidden && getComputedStyle(e).display === "none" && e.innerHTML === ""), `bandeau ${lieu} : espace vide laissé dans la page`);
          else {
            const txt = await bloc.textContent();
            verifier(/En direct/.test(txt) && /Titre de Média test/.test(txt) && /Assemblée nationale/.test(txt) && !/expiré/.test(txt), `bandeau ${lieu} : contenu inattendu`);
            verifier((await bloc.locator(".direct-ev").count()) === 2, `bandeau ${lieu} : événements affichés ≠ 2 (expiré non retiré ?)`);
            const liens = await bloc.locator("a").evaluateAll((as) => as.map((a) => a.href + "|" + a.rel));
            verifier(liens.length >= 8 && liens.every((l) => /^https:\/\//.test(l) && /noopener/.test(l)), `bandeau ${lieu} : liens non https ou sans noopener`);
            verifier(liens.some((l) => l.startsWith("https://videos.assemblee-nationale.fr/")), `bandeau ${lieu} : lien du direct de l'Assemblée absent`);
            verifier((await page.$$("iframe, video, embed, object")).length === 0, `bandeau ${lieu} : contenu intégré interdit`);
            const encadre = await bloc.evaluate((e) => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth; });
            verifier(encadre, `bandeau ${lieu} : déborde de l'écran`);
          }
          verifier((await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, `bandeau ${lieu} : défilement horizontal`);
          if (process.env.CAPTURES_DIRECT && cas !== "vide") await page.screenshot({ path: path.join(process.env.CAPTURES_DIRECT, `direct-${nom}-${theme}-${cas}-${vue ? "actu" : "accueil"}.png`) });
        }
        verifier(erreurs.length === 0, `bandeau « En direct » ${nom}/${theme}/${cas} : erreurs JavaScript — ${erreurs.join(" | ")}`);
        await page.close();
      }
    }
  }

  // Âge et profession : jeu d'essai injecté (les données réelles n'ont ces champs qu'après la collecte), puis cas « champs absents »
  for (const avec of [true, false]) {
    const page = await (await navigateur.newContext({ viewport: { width: 1300, height: 900 }, serviceWorkers: "block", locale: "fr-FR" })).newPage(); // le service worker contournerait l'interception
    const erreurs = [];
    page.on("pageerror", (e) => erreurs.push(e.message));
    await page.route(/\/data\/deputes\.json/, async (route) => {
      const j = JSON.parse(fs.readFileSync(path.join(RACINE, "data/deputes.json"), "utf-8"));
      for (const d of j.deputes) { delete d.naissance; delete d.profession; }
      if (avec) j.deputes.forEach((d) => { d.naissance = "1970-01-01"; d.profession = "Avocat"; });
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(j) });
    });
    await page.goto(base + "#deputes", { waitUntil: "networkidle" });
    await page.waitForSelector(".depute-carte");
    await page.evaluate(() => { const d = DEPUTES[0]; location.hash = "depute-" + d.id; });
    await page.waitForSelector("#depute-fiche .stat-card"); await page.waitForTimeout(500);
    const identite = await page.$("#depute-identite");
    if (avec) verifier(identite && /^\d+ ans · Avocat$/.test(await identite.textContent()), `fiche député : âge et profession absents (${identite && await identite.textContent()})`);
    else verifier(!identite, "fiche député : ligne âge/profession affichée sans données");
    await page.evaluate(() => { document.getElementById("classements").open = true; renderClassements(); });
    await page.waitForTimeout(300);
    const groupes = await page.$("#groupes-chiffres .histo-row");
    verifier(avec ? !!groupes : !groupes, `« Les groupes en chiffres » : âge moyen ${avec ? "absent" : "affiché sans données"}`);
    verifier(erreurs.length === 0, `âge/profession : erreurs JavaScript — ${erreurs.join(" | ")}`);
    await page.close();
  }

  // Budget : sans fichier (jamais de chiffre inventé), puis avec un jeu d'essai fictif injecté (tests/fixtures/budget-essai.json)
  for (const [nom, viewport] of [["ordinateur", { width: 1300, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
    for (const avec of [false, true]) {
      const page = await (await navigateur.newContext({ viewport, serviceWorkers: "block", locale: "fr-FR" })).newPage();
      const erreurs = [];
      page.on("pageerror", (e) => erreurs.push(e.message));
      await page.route(/\/data\/budget\.json/, (route) => avec
        ? route.fulfill({ contentType: "application/json", body: fs.readFileSync(path.join(RACINE, "tests/fixtures/budget-essai.json"), "utf-8") })
        : route.fulfill({ status: 404, body: "" }));
      await page.goto(base + "#budget", { waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      const texte = await page.textContent("#budget-contenu");
      const etiquette = `budget ${avec ? "avec données" : "sans données"} (${nom})`;
      const decalage = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (avec) {
        verifier((await page.$$("#budget-contenu .budget-bloc")).length === 4, `${etiquette} : quatre blocs attendus`);
        verifier((await page.$$("#budget-contenu .budget-bloc:first-child .budget-barres li")).length === 11, `${etiquette} : onze fonctions de dépenses attendues`);
        verifier(/Pour 100 € dépensés/.test(texte) && /Source : /.test(texte) && /année 2023/.test(texte), `${etiquette} : phrase « Pour 100 € », source ou année absentes`);
        verifier((await page.$$("#budget-contenu .budget-source a[href^='https://']")).length >= 4, `${etiquette} : lien vers la source absent`);
        verifier(/Déficit/.test(texte), `${etiquette} : déficit absent`);
      } else {
        verifier(/Données en cours de récupération/.test(texte) && !/\d/.test(texte), `${etiquette} : message d'attente absent ou chiffres affichés sans données`);
      }
      verifier((await decalage()) <= 1, `${etiquette} : défilement horizontal`);
      await page.evaluate(() => { document.documentElement.dataset.theme = "sombre"; });
      verifier((await decalage()) <= 1, `${etiquette} : défilement horizontal en mode sombre`);
      verifier(erreurs.length === 0, `${etiquette} : erreurs JavaScript — ${erreurs.join(" | ")}`);
      await page.close();
    }
  }

  // Langues : menu déroulant, anglais, retour au français, arabe (droite à gauche), repli sur le français
  for (const [nom, viewport, hote] of [["ordinateur", { width: 1300, height: 900 }, "langue-haut"], ["mobile", { width: 390, height: 844 }, "langue-mobile"]]) {
    const ctx = await navigateur.newContext({ viewport, serviceWorkers: "block", locale: "fr-FR" });
    const page = await ctx.newPage();
    const erreurs = [];
    page.on("pageerror", (e) => erreurs.push(e.message));
    page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) erreurs.push(m.text()); });
    await page.goto(base, { waitUntil: "networkidle" });
    const etiquette = (x) => `langues (${nom}) : ${x}`;
    const decalage = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const texte = (sel) => page.evaluate((s) => (document.querySelector(s) || {}).textContent, sel);
    const bouton = `#${hote} .langue-bouton`;
    const choisir = async (code) => {
      await page.click(bouton);
      await page.click(`#${hote} .langue-liste li[lang="${code}"]`);
      await page.waitForTimeout(500);
    };

    verifier(await page.evaluate(() => document.documentElement.lang === "fr" && document.documentElement.dir !== "rtl"), etiquette("la page doit démarrer en français (lang=fr, ltr)"));
    verifier((await page.$$(`#${hote} .langue-liste li`)).length === 5, etiquette("cinq langues attendues dans le menu"));
    verifier((await page.$$(`#${hote} .langue-liste li img[src^="icons/drapeaux/"]`)).length >= 5, etiquette("drapeaux SVG absents du menu"));

    // Clavier : Entrée ouvre, Échap ferme et rend le focus au bouton
    await page.focus(bouton);
    await page.keyboard.press("Enter");
    verifier(await page.evaluate((h) => document.querySelector(`#${h} .langue-bouton`).getAttribute("aria-expanded") === "true" && !document.querySelector(`#${h} .langue-liste`).hidden, hote), etiquette("Entrée n'ouvre pas le menu"));
    await page.keyboard.press("ArrowDown");
    verifier(await page.evaluate((h) => document.querySelector(`#${h} .langue-liste`).getAttribute("aria-activedescendant") === `${document.querySelector(`#${h} .langue-liste`).id}-en`, hote), etiquette("la flèche bas ne descend pas à l'option suivante"));
    await page.keyboard.press("Escape");
    verifier(await page.evaluate((h) => document.querySelector(`#${h} .langue-liste`).hidden && document.activeElement === document.querySelector(`#${h} .langue-bouton`), hote), etiquette("Échap ne referme pas le menu en rendant le focus au bouton"));

    // Anglais
    await choisir("en");
    verifier(await page.evaluate(() => document.documentElement.lang === "en" && document.documentElement.dir === "ltr"), etiquette("html lang=en attendu"));
    verifier((await texte('.tab[data-tab="actualites"]')) === "News", etiquette(`titre de menu non traduit (${await texte('.tab[data-tab="actualites"]')})`));
    verifier(/French politics, with the evidence/.test(await texte(".devise")), etiquette("devise non traduite"));
    verifier(await page.evaluate(() => !document.getElementById("note-officiel").hidden), etiquette("note « Contenu officiel en français » absente"));
    verifier(/votes, the most recent from/.test(await texte("#footer-maj")), etiquette(`texte rendu par JavaScript non traduit (${(await texte("#footer-maj")).slice(0, 60)})`));
    verifier(await page.evaluate(() => localStorage.getItem("langue") === "en"), etiquette("choix non mémorisé"));
    verifier((await decalage()) <= 1, etiquette("défilement horizontal en anglais"));
    await page.evaluate(() => { location.hash = "#deputes"; });
    await page.waitForSelector(".depute-carte", { timeout: 15000 });
    verifier(/MPs/.test(await texte("#view-deputes h2")), etiquette("rubrique Députés non traduite"));
    await page.reload({ waitUntil: "networkidle" });
    verifier(await page.evaluate(() => document.documentElement.lang === "en"), etiquette("la langue n'est pas retrouvée après rechargement"));
    verifier((await texte('.tab[data-tab="actualites"]')) === "News", etiquette("traduction non appliquée après rechargement"));

    // Retour au français : plus aucune trace d'anglais
    await page.focus(bouton);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Home");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(500);
    verifier(await page.evaluate(() => document.documentElement.lang === "fr" && document.getElementById("note-officiel").hidden), etiquette("retour au français incomplet"));
    verifier((await texte('.tab[data-tab="actualites"]')) === "Actualités" && /scrutins, le plus récent/.test(await texte("#footer-maj")), etiquette("textes non restaurés en français"));

    await choisir("fr");
    verifier(await page.evaluate(() => document.documentElement.dir === "ltr"), etiquette("dir=ltr non rétabli"));
    verifier(erreurs.length === 0, etiquette(`erreurs JavaScript — ${erreurs.join(" | ")}`));
    await ctx.close();
  }

  // Sécurité : une traduction contenant du HTML n'est jamais insérée, et une langue détectée mais vide laisse le français
  {
    const ctx = await navigateur.newContext({ viewport: { width: 1300, height: 900 }, serviceWorkers: "block", locale: "es-ES" });
    const page = await ctx.newPage();
    const fr = JSON.parse(fs.readFileSync(path.join(RACINE, "data/i18n/fr.json"), "utf-8"));
    const cle = Object.keys(fr).find((k) => fr[k] === "Députés");
    await page.route(/\/data\/i18n\/es\.json/, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ [cle]: "<img src=x onerror=window.__pwned=1>" }) }));
    await page.goto(base, { waitUntil: "networkidle" });
    verifier(await page.evaluate(() => window.__pwned === undefined && !document.querySelector('.tab[data-tab="actualites"] img')), "langues : du HTML de dictionnaire a été injecté");
    verifier(await page.evaluate(() => document.documentElement.lang === "fr"), "langues : une langue détectée sans traduction doit laisser le site en français");
    await ctx.close();
    const ctxEn = await navigateur.newContext({ viewport: { width: 1300, height: 900 }, serviceWorkers: "block", locale: "en-GB" });
    const pageEn = await ctxEn.newPage();
    await pageEn.goto(base, { waitUntil: "networkidle" });
    await pageEn.waitForTimeout(500);
    verifier(await pageEn.evaluate(() => document.documentElement.lang === "en"), "langues : la langue du navigateur (en) n'est pas détectée");
    await ctxEn.close();
  }

  // Langues : des phrases entières (aucun mélange avec le français), dates, heures et nombres écrits à la manière de la langue
  {
    const FR_RESIDUEL = /\bMd€|\bil y a \d|\b\d{1,2} h \d{2}\b|annoncée le|Auriez-vous voté|Question \d+ sur|\. Depuis 2008|\. Données relevées toutes les heures|\. Les chiffres concernent|Candidature annoncée|Échantillon :|Marge d'erreur :/;
    const THEMES_FR = /(?:Question|Pregunta|Pergunta|Frage) \d+ (?:of|de|von) \d+ · (?:Santé|Numérique|Sécurité|Gouvernement|Institutions|Agriculture|Argent public|Environnement|Finances et budget|Commission spéciale)\b/i;
    const MOIS_FR = /\b(?:janvier|février|avril|juin|juillet|août|septembre|octobre|novembre|décembre)\b/;
    const LANGUES = {
      en: { locale: "en-GB", date: /\d{1,2} [A-Z][a-z]+ 20\d\d at \d{2}:\d{2}/,
        attendus: [["#candidats", /Candidacy announced on \d{1,2} [A-Z][a-z]+ 20\d\d/], ["#candidats", /Polls: from \d/], ["#quiz", /Question 1 of 12 · /i], ["#quiz", /Would you have voted for/], ["#budget", /€[\d,.]+bn/], ["#comprendre", /Since 2008, it can only be used/], ["#dirigeants", /chairs the group in the National Assembly/]],
        interdits: [["#candidats", /Candidacy annoncée|Polls: de /], ["#quiz", /Would you have voted for la /], ["#dirigeants", /préside le groupe/]] },
      es: { locale: "es-ES", date: /\d{1,2} de [a-záéíóú]+ de 20\d\d a las? \d{1,2}:\d{2}/, attendus: [["#quiz", /Pregunta 1 de 12 · /i], ["#comprendre", /Desde 2008/]], interdits: [] },
      pt: { locale: "pt-PT", date: /\d{1,2} de [a-zçãé]+ de 20\d\d às? \d{1,2}:\d{2}/, attendus: [["#quiz", /Pergunta 1 de 12 · /i], ["#comprendre", /Desde 2008/]], interdits: [] },
      de: { locale: "de-DE", date: /\d{1,2}\. [A-Z][a-zä]+ 20\d\d um \d{2}:\d{2}/, attendus: [["#quiz", /Frage 1 von 12 · /i], ["#comprendre", /Seit 2008/]], interdits: [] },
    };
    for (const [code, L] of Object.entries(LANGUES)) {
      const ctx = await navigateur.newContext({ viewport: { width: 1300, height: 900 }, serviceWorkers: "block", locale: L.locale });
      const page = await ctx.newPage();
      const erreurs = [];
      page.on("pageerror", (e) => erreurs.push(e.message));
      await page.goto(base, { waitUntil: "networkidle" });
      const etiquette = (x) => `langues (${code}, phrases entières) : ${x}`;
      verifier(await page.evaluate((c) => document.documentElement.lang === c, code), etiquette("la langue du navigateur n'est pas détectée"));
      const vues = {};
      for (const h of ["#candidats", "#quiz", "#comprendre", "#methode", "#mentions", "#budget", "#chiffres", "#sondages", "#dirigeants", "#justice", "#meetings"]) {
        await page.evaluate((x) => { location.hash = x; }, h);
        await page.waitForTimeout(700);
        vues[h] = await page.evaluate(() => (document.querySelector(".view.active") || document.body).innerText);
        verifier(!FR_RESIDUEL.test(vues[h]), etiquette(`${h} : phrase mêlant du français (${(FR_RESIDUEL.exec(vues[h]) || [])[0]})`));
        verifier(!THEMES_FR.test(vues[h]), etiquette(`${h} : thème de question en français`));
      }
      verifier(L.date.test(vues["#methode"]), etiquette("#methode : dates et heures non écrites à la manière de la langue"));
      verifier(!MOIS_FR.test(vues["#methode"]) && !MOIS_FR.test(vues["#budget"]), etiquette("mois en français dans les dates de la méthode ou du budget"));
      for (const [h, re] of L.attendus) verifier(re.test(vues[h]), etiquette(`${h} : texte attendu absent (${re})`));
      for (const [h, re] of L.interdits) verifier(!re.test(vues[h]), etiquette(`${h} : mélange de langues (${re})`));
      verifier(erreurs.length === 0, etiquette(`erreurs JavaScript — ${erreurs.join(" | ")}`));
      await ctx.close();
    }
  }

  await require("./compte-fumee.cjs").testerComptes({ navigateur, base, verifier });

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
