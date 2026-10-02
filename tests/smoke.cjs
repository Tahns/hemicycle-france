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
    const page = await navigateur.newPage({ viewport, locale: "fr-FR" });
    const erreurs = [];
    page.on("pageerror", (e) => erreurs.push(e.message));
    // Les polices Google peuvent être indisponibles hors ligne : on ne les compte pas comme erreurs
    page.on("console", (m) => { if (m.type() === "error" && !/fonts\.g/.test(m.text()) && !/Failed to load resource/.test(m.text())) erreurs.push(m.text()); });

    await page.goto(base, { waitUntil: "networkidle" });
    const largeur = async () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

    verifier((await page.$$(".accueil-highlight-card")).length >= 2, `${nom} : cartes « À la une » absentes`);

    verifier((await page.$$("#en-bref .accueil-hero-stat")).length >= 1, `${nom} : bloc « En bref » incomplet`);

    for (const onglet of ["scrutin", "histo", "deputes", "senat", "candidats", "actualites", "dirigeants", "justice", "sondages", "meetings", "quiz", "chiffres", "budget"]) {
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

    await page.goto(base + "#candidats", { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    verifier((await page.$$(".candidat-carte")).length >= 5, `${nom} : candidats absents`);

    await page.goto(base + "#senat", { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    verifier((await page.$$(".senat-ligne")).length >= 10, `${nom} : scrutins du Sénat absents`);
    verifier((await page.$$("#senat-hemicycle circle")).length === 348, `${nom} : hémicycle du Sénat incomplet`);

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

    if (nom === "mobile") {
      // Version téléphone : barre d'onglets et panneau « Plus »
      await page.goto(base, { waitUntil: "networkidle" });
      verifier(await page.isVisible(".barre-mobile"), "mobile : barre d'onglets absente");
      await page.click("#bouton-plus");
      verifier(await page.isVisible("#feuille-plus"), "mobile : le panneau « Plus » ne s'ouvre pas");
      await page.click('.feuille-lien[data-tab="budget"]');
      await page.waitForTimeout(250);
      verifier(await page.evaluate(() => document.getElementById("view-budget").classList.contains("active") && document.getElementById("feuille-plus").hidden),
        "mobile : le panneau « Plus » ne mène pas à la rubrique Budget");
      await page.click("#bouton-plus");
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
    verifier((await page.$$(`#${hote} .langue-liste li`)).length === 10, etiquette("dix langues attendues dans le menu"));
    verifier((await page.$$(`#${hote} .langue-liste li img[src^="icons/drapeaux/"]`)).length >= 6, etiquette("drapeaux SVG absents du menu"));

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
    verifier((await texte('.tab[data-tab="deputes"]')) === "MPs", etiquette(`titre de menu non traduit (${await texte('.tab[data-tab="deputes"]')})`));
    verifier(/French politics, with the evidence/.test(await texte(".devise")), etiquette("devise non traduite"));
    verifier(await page.evaluate(() => !document.getElementById("note-officiel").hidden), etiquette("note « Contenu officiel en français » absente"));
    verifier(/votes, the most recent from/.test(await texte("#footer-maj")), etiquette(`texte rendu par JavaScript non traduit (${(await texte("#footer-maj")).slice(0, 60)})`));
    verifier(await page.evaluate(() => localStorage.getItem("langue") === "en"), etiquette("choix non mémorisé"));
    verifier((await decalage()) <= 1, etiquette("défilement horizontal en anglais"));
    await page.evaluate(() => document.querySelector('.tab[data-tab="deputes"]').click());
    await page.waitForSelector(".depute-carte", { timeout: 15000 });
    verifier(/Enter the name of your town/.test(await texte("#view-deputes")), etiquette("rubrique Députés non traduite"));
    await page.reload({ waitUntil: "networkidle" });
    verifier(await page.evaluate(() => document.documentElement.lang === "en"), etiquette("la langue n'est pas retrouvée après rechargement"));
    verifier((await texte('.tab[data-tab="histo"]')) === "Groups", etiquette("traduction non appliquée après rechargement"));

    // Retour au français : plus aucune trace d'anglais
    await page.focus(bouton);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Home");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(500);
    verifier(await page.evaluate(() => document.documentElement.lang === "fr" && document.getElementById("note-officiel").hidden), etiquette("retour au français incomplet"));
    verifier((await texte('.tab[data-tab="deputes"]')) === "Députés" && /scrutins, le plus récent/.test(await texte("#footer-maj")), etiquette("textes non restaurés en français"));

    // Arabe : droite à gauche, sans défilement horizontal ; dictionnaire vide → le français reste affiché
    await choisir("ar");
    verifier(await page.evaluate(() => document.documentElement.lang === "ar" && document.documentElement.dir === "rtl"), etiquette("dir=rtl attendu en arabe"));
    verifier((await texte('.tab[data-tab="deputes"]')) === "Députés", etiquette("le français doit rester quand la clé manque"));
    verifier(await page.evaluate(() => !document.getElementById("note-traduction").hidden), etiquette("note « traduction en préparation » absente"));
    for (const onglet of ["accueil", "scrutin", "deputes", "sondages", "mentions"]) {
      await page.evaluate((t) => { location.hash = t; }, onglet);
      await page.waitForTimeout(300);
      verifier((await decalage()) <= 1, etiquette(`défilement horizontal en arabe sur ${onglet}`));
    }
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
    verifier(await page.evaluate(() => window.__pwned === undefined && !document.querySelector('.tab[data-tab="deputes"] img')), "langues : du HTML de dictionnaire a été injecté");
    verifier(await page.evaluate(() => document.documentElement.lang === "fr"), "langues : une langue détectée sans traduction doit laisser le site en français");
    await ctx.close();
    const ctxEn = await navigateur.newContext({ viewport: { width: 1300, height: 900 }, serviceWorkers: "block", locale: "en-GB" });
    const pageEn = await ctxEn.newPage();
    await pageEn.goto(base, { waitUntil: "networkidle" });
    await pageEn.waitForTimeout(500);
    verifier(await pageEn.evaluate(() => document.documentElement.lang === "en"), "langues : la langue du navigateur (en) n'est pas détectée");
    await ctxEn.close();
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
