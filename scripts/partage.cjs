#!/usr/bin/env node
/**
 * partage.cjs
 * -----------
 * Pages d'aperçu pour le partage sur les réseaux (WhatsApp, X, Facebook…), qui n'exécutent pas
 * le JavaScript du site et ignorent la partie « #… » des liens :
 *  - v/<numéro>.html : un vote clé (vote final d'un texte, censure, confiance), avec son titre,
 *    son résultat et une image v/<numéro>.jpg (titre, résultat, hémicycle en miniature) ;
 *  - d/<PA…>.html    : un député en fonction ;
 *  - icons/partage.jpg : image d'aperçu générale du site.
 * Images en JPEG 800 × 420 (format « grande image » des réseaux, ~45 Ko chacune).
 * Chaque page renvoie aussitôt vers la page correspondante du site.
 *
 * Titres et chiffres viennent du site lui-même (index.html?carte), pour être identiques à
 * ce qu'affiche le site. Les images existantes ne sont pas recalculées (un vote ne change plus).
 *
 * USAGE : node scripts/partage.cjs   (nécessite le paquet « playwright » et Chromium)
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const RACINE = path.resolve(__dirname, "..");
// Adresse publique du site : à changer ici en cas de nom de domaine propre
const SITE = process.env.SITE_URL || "https://tahns.github.io/politique-france/";
const NOM_SITE = "Décrypter la politique française";
const TYPES = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".js": "text/javascript", ".woff2": "font/woff2", ".png": "image/png", ".css": "text/css" };

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nombre = (n) => n.toLocaleString("fr-FR").replace(/ /g, " ");

function page({ titre, description, chemin, image, cible }) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(titre)} · ${esc(NOM_SITE)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="${esc(NOM_SITE)}">
<meta property="og:locale" content="fr_FR">
<meta property="og:title" content="${esc(titre)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${SITE}${chemin}">
<meta property="og:image" content="${SITE}${image}">
<meta property="og:image:width" content="800">
<meta property="og:image:height" content="420">
<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0; url=${esc(cible)}">
<link rel="icon" href="../icons/icon-192.png">
</head>
<body>
<p><a href="${esc(cible)}">${esc(titre)}</a> — ${esc(NOM_SITE)}</p>
</body>
</html>
`;
}

function ecrireSiChange(fichier, contenu) {
  if (fs.existsSync(fichier) && fs.readFileSync(fichier, "utf-8") === contenu) return false;
  fs.mkdirSync(path.dirname(fichier), { recursive: true });
  fs.writeFileSync(fichier, contenu);
  return true;
}

function serveur() {
  return new Promise((ok) => {
    const s = http.createServer((req, res) => {
      const url = decodeURIComponent(req.url.split("?")[0]);
      const fichier = path.join(RACINE, url === "/" ? "index.html" : url);
      if (!fichier.startsWith(RACINE) || !fs.existsSync(fichier) || fs.statSync(fichier).isDirectory()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "Content-Type": TYPES[path.extname(fichier)] || "application/octet-stream" });
      fs.createReadStream(fichier).pipe(res);
    });
    s.listen(0, () => ok(s));
  });
}

(async () => {
  const srv = await serveur();
  const navigateur = await chromium.launch();
  const onglet = await navigateur.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 / 3 });
  await onglet.goto(`http://localhost:${srv.address().port}/index.html?carte`);
  await onglet.waitForSelector("body[data-carte-prete]", { timeout: 60000 });
  await onglet.evaluate(() => document.fonts.ready);

  // 1. Votes clés
  const votes = await onglet.evaluate(() => donneesPartage());
  let pages = 0, images = 0;
  for (const v of votes) {
    const resultat = v.resultat === "adopte" ? "Adopté" : "Rejeté";
    const description = `${resultat} le ${v.date} : ${nombre(v.pour)} pour, ${nombre(v.contre)} contre, ${nombre(v.abst)} abstention${v.abst > 1 ? "s" : ""}. Le détail groupe par groupe et siège par siège.`;
    if (ecrireSiChange(path.join(RACINE, "v", `${v.numero}.html`), page({
      titre: v.titre, description, chemin: `v/${v.numero}.html`, image: `v/${v.numero}.jpg`, cible: `../#scrutin-${v.numero}`,
    }))) pages++;
    const jpg = path.join(RACINE, "v", `${v.numero}.jpg`);
    if (!fs.existsSync(jpg)) {
      await onglet.evaluate((n) => afficherCarte(n), v.numero);
      await (await onglet.$("#carte-partage")).screenshot({ path: jpg, type: "jpeg", quality: 82 });
      images++;
    }
  }

  // 2. Image générale du site
  const imageSite = path.join(RACINE, "icons", "partage.jpg");
  if (!fs.existsSync(imageSite)) {
    await onglet.evaluate(() => {
      modeHemicycle = "groupes";
      buildSeats(null);
      renderHemicycle();
      document.getElementById("carte-partage").innerHTML = `<div>
          <div class="carte-site">tahns.github.io/politique-france</div>
          <h1 class="carte-titre" style="font-size:58px">Décrypter la politique française</h1>
          <div class="carte-chiffres">Ce que votent les députés, les sondages de 2027 et les grands chiffres du pays. Chaque information renvoie à sa source.</div>
        </div>
        <div class="carte-hemi">${document.getElementById("hemicycle").outerHTML.replace(' id="hemicycle"', "")}</div>`;
    });
    await (await onglet.$("#carte-partage")).screenshot({ path: imageSite, type: "jpeg", quality: 82 });
    images++;
  }
  await navigateur.close();
  srv.close();

  // 3. Députés en fonction (image générale) ; les pages des anciens députés sont retirées
  const { deputes = [] } = JSON.parse(fs.readFileSync(path.join(RACINE, "data", "deputes.json"), "utf-8"));
  const ordinal = (n) => (n === 1 ? "1re" : `${n}e`);
  const actuels = new Set();
  for (const d of deputes) {
    actuels.add(`${d.id}.html`);
    const role = d.f ? "Députée" : "Député";
    const titre = `${d.nom}, ${role.toLowerCase()} de ${d.dep}${d.circo ? ` (${ordinal(d.circo)} circonscription)` : ""}`;
    const exprimes = d.stats.pour + d.stats.contre + d.stats.abst;
    const description = `${role} ${d.groupe}. Ses votes sur chaque texte et chaque motion de censure, sa participation aux ${nombre(d.stats.scrutins)} scrutins publics depuis sa prise de fonction (${nombre(exprimes)} votes).`;
    if (ecrireSiChange(path.join(RACINE, "d", `${d.id}.html`), page({
      titre, description, chemin: `d/${d.id}.html`, image: "icons/partage.jpg", cible: `../#depute-${d.id}`,
    }))) pages++;
  }
  if (deputes.length >= 500 && fs.existsSync(path.join(RACINE, "d"))) {
    for (const f of fs.readdirSync(path.join(RACINE, "d"))) if (f.endsWith(".html") && !actuels.has(f)) fs.unlinkSync(path.join(RACINE, "d", f));
  }

  console.log(`[partage] ${votes.length} votes clés, ${deputes.length} députés : ${pages} page(s) écrite(s), ${images} image(s) créée(s).`);
})().catch((e) => {
  console.error("[partage] ÉCHEC :", e);
  process.exit(1);
});
