#!/usr/bin/env node
/**
 * partage.cjs
 * -----------
 * Pages statiques pour le partage et les moteurs de recherche. Les réseaux (WhatsApp, X…) et une
 * partie des moteurs n'exécutent pas le JavaScript du site et ignorent la partie « #… » des liens :
 *  - v/<numéro>.html : un vote clé (vote final d'un texte, censure, confiance) — titre, résultat,
 *    détail par groupe, lien vers le scrutin officiel — et son image v/<numéro>.jpg
 *    (titre, résultat, hémicycle en miniature) ;
 *  - d/<PA…>.html    : un député en fonction — circonscription, statistiques, vote sur chaque texte ;
 *  - icons/partage.jpg : image d'aperçu générale du site ;
 *  - sitemap.xml et robots.txt : plan du site pour les moteurs de recherche.
 * Chaque page est lisible sans JavaScript et renvoie vers la version interactive du site.
 * Images en JPEG 800 × 420 (format « grande image » des réseaux, ~45 Ko chacune).
 *
 * Titres et chiffres viennent du site lui-même (index.html?carte), pour être identiques à
 * ce qu'affiche le site. Les images existantes ne sont pas recalculées (un vote ne change plus).
 *
 * Nom de domaine : si un fichier CNAME est présent (créé par GitHub Pages quand on y déclare un
 * domaine), toutes les adresses absolues — y compris les balises og: d'index.html — l'utilisent.
 *
 * USAGE : node scripts/partage.cjs   (nécessite le paquet « playwright » et Chromium)
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const RACINE = path.resolve(__dirname, "..");
const CNAME = fs.existsSync(path.join(RACINE, "CNAME")) ? fs.readFileSync(path.join(RACINE, "CNAME"), "utf-8").trim().split(/\s+/)[0] : null;
// Sans domaine propre : adresse GitHub Pages déduite du dépôt (suit un renommage du dépôt)
const [PROPRIO, DEPOT] = (process.env.GITHUB_REPOSITORY || "Tahns/hemicycle-france").split("/");
const SITE = process.env.SITE_URL || (CNAME ? `https://${CNAME}/` : `https://${PROPRIO.toLowerCase()}.github.io/${DEPOT}/`);
const NOM_SITE = "Hémicycle France";
const TYPES = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".js": "text/javascript", ".woff2": "font/woff2", ".png": "image/png", ".css": "text/css" };

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nombre = (n) => n.toLocaleString("fr-FR").replace(/ /g, " ");
const pct = (n, d) => (d ? `${Math.round((n / d) * 100)} %` : "—");
const ordinal = (n) => (n === 1 ? "1re" : `${n}e`);
const LIB_VOTE = { p: ["Pour", "vote-p"], c: ["Contre", "vote-c"], a: ["Abstention", "vote-a"], n: ["Non-votant", "vote-x"], "-": ["N'a pas pris part au vote", "vote-x"] };

function gabarit({ titre, description, chemin, image, cible, libelleCible, corps }) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(titre)} · ${esc(NOM_SITE)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${SITE}${chemin}">
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
<meta name="theme-color" content="#F5F1E8">
<link rel="icon" href="../icons/icon-192.png">
<link rel="stylesheet" href="../pages.css">
</head>
<body>
<div class="lisere" aria-hidden="true"><span></span><span></span><span></span></div>
<header><a href="../">${esc(NOM_SITE)}</a></header>
<main>
${corps}
<a class="bouton" href="${esc(cible)}">${esc(libelleCible)}</a>
</main>
<footer>Données publiques de l'Assemblée nationale, relevées chaque jour. <a href="../#mentions">Mentions légales et sources</a>.</footer>
</body>
</html>
`;
}

function pageVote(v) {
  const resultat = v.resultat === "adopte" ? "Adopté" : "Rejeté";
  const description = `${resultat} le ${v.date} par l'Assemblée nationale : ${nombre(v.pour)} pour, ${nombre(v.contre)} contre, ${nombre(v.abst)} abstention${v.abst > 1 ? "s" : ""}. Le vote de chaque groupe politique.`;
  const lignes = v.groupes.map((g) => `<tr><td><span class="pastille" style="background:${esc(g.couleur)}"></span>${esc(g.nom)}</td><td>${g.pour}</td><td>${g.contre}</td><td>${g.abst}</td><td>${g.membres ?? ""}</td></tr>`).join("\n");
  const corps = `<div class="surtitre">Assemblée nationale · scrutin n°${v.numero} · ${esc(v.date)}</div>
<h1>${esc(v.titre)}</h1>
<p class="resultat ${v.resultat}">${resultat}</p>
<div class="chiffres"><div><b>${nombre(v.pour)}</b><span>pour</span></div><div><b>${nombre(v.contre)}</b><span>contre</span></div><div><b>${nombre(v.abst)}</b><span>abstention${v.abst > 1 ? "s" : ""}</span></div></div>
${v.auteur ? `<p class="meta">Texte déposé par ${esc(v.auteur)}.</p>` : ""}
<p class="meta">Intitulé officiel : ${esc(v.intitule)}</p>
<img class="apercu" src="${v.numero}.jpg" alt="Hémicycle : répartition des votes siège par siège" width="800" height="420" loading="lazy">
<h2>Le vote de chaque groupe</h2>
<table><thead><tr><th>Groupe</th><th>Pour</th><th>Contre</th><th>Abst.</th><th>Membres</th></tr></thead><tbody>
${lignes}
</tbody></table>
<p class="meta">Source : <a href="${esc(v.sourceUrl)}">fiche officielle du scrutin</a>${v.dossierUrl ? ` · <a href="${esc(v.dossierUrl)}">dossier législatif</a>` : ""}.</p>`;
  return gabarit({ titre: v.titre, description, chemin: `v/${v.numero}.html`, image: `v/${v.numero}.jpg`, cible: `../#scrutin-${v.numero}`, libelleCible: "Voir l'hémicycle interactif", corps });
}

function pageDepute(d, cles, votesParNumero) {
  const role = d.f ? "Députée" : "Député";
  const titre = `${d.nom}, ${role.toLowerCase()} de ${d.dep}${d.circo ? ` (${ordinal(d.circo)} circonscription)` : ""}`;
  const s = d.stats;
  const exprimes = s.pour + s.contre + s.abst;
  const possibles = [...d.votes].filter((c) => c !== ".").length;
  const presents = [...d.votes].filter((c) => "pca".includes(c)).length;
  const description = `${role} ${d.groupe} de ${d.dep}. A voté sur ${presents} des ${possibles} textes et motions de censure depuis sa prise de fonction ; ${nombre(exprimes)} votes sur ${nombre(s.scrutins)} scrutins publics. Son vote sur chaque texte.`;
  const lignes = cles.map((n, i) => ({ n, code: d.votes[i], v: votesParNumero.get(n) }))
    .filter((x) => x.code !== "." && x.v)
    .map(({ n, code, v }) => { const [lib, cl] = LIB_VOTE[code] || LIB_VOTE["-"]; return `<tr><td><a href="../v/${n}.html">${esc(v.titre)}</a><br><small class="meta">${esc(v.date)} · ${v.resultat === "adopte" ? "adopté" : "rejeté"}</small></td><td class="${cl}">${lib}</td></tr>`; })
    .join("\n");
  const corps = `<div class="surtitre">${role} · ${esc(d.groupe)}</div>
<h1>${esc(d.nom)}</h1>
<p class="meta">${role} de ${esc(d.dep)}${d.circo ? `, ${ordinal(d.circo)} circonscription` : ""} (${esc(d.numDep)}), en fonction depuis le ${esc(new Date(d.depuis + "T12:00:00Z").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }))}.</p>
<div class="chiffres">
<div><b>${presents} / ${possibles}</b><span>textes et censures où ${d.f ? "elle" : "il"} a voté</span></div>
<div><b>${pct(exprimes, s.scrutins)}</b><span>des ${nombre(s.scrutins)} scrutins publics</span></div>
<div><b>${nombre(s.ecarts)}</b><span>votes contre la position de son groupe</span></div>
</div>
<p class="meta">La participation ne compte que les scrutins publics en séance : ni le travail en commission, ni les votes à main levée.</p>
<h2>Son vote sur chaque texte et chaque motion de censure</h2>
<table><thead><tr><th>Texte</th><th>Vote</th></tr></thead><tbody>
${lignes}
</tbody></table>
<p class="meta"><a href="https://www.assemblee-nationale.fr/dyn/deputes/${esc(d.id)}">Fiche officielle à l'Assemblée nationale</a></p>`;
  return gabarit({ titre, description, chemin: `d/${d.id}.html`, image: "icons/partage.jpg", cible: `../#depute-${d.id}`, libelleCible: "Voir la fiche interactive", corps });
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
    if (ecrireSiChange(path.join(RACINE, "v", `${v.numero}.html`), pageVote(v))) pages++;
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
    await onglet.evaluate((adresse) => {
      modeHemicycle = "groupes";
      buildSeats(null);
      renderHemicycle();
      document.getElementById("carte-partage").innerHTML = `<div>
          <div class="carte-site">${adresse}</div>
          <h1 class="carte-titre" style="font-size:60px">Hémicycle France</h1><div class="carte-date" style="font-size:24px">La politique française, preuves à l'appui</div>
          <div class="carte-chiffres">Ce que votent les députés, les sondages de 2027 et les grands chiffres du pays. Chaque information renvoie à sa source.</div>
        </div>
        <div class="carte-hemi">${document.getElementById("hemicycle").outerHTML.replace(' id="hemicycle"', "")}</div>`;
    }, SITE.replace(/^https:\/\//, "").replace(/\/$/, ""));
    await (await onglet.$("#carte-partage")).screenshot({ path: imageSite, type: "jpeg", quality: 82 });
    images++;
  }
  await navigateur.close();
  srv.close();

  // 3. Députés en fonction ; les pages des anciens députés sont retirées
  const { deputes = [], cles = [] } = JSON.parse(fs.readFileSync(path.join(RACINE, "data", "deputes.json"), "utf-8"));
  const votesParNumero = new Map(votes.map((v) => [v.numero, v]));
  const actuels = new Set();
  for (const d of deputes) {
    actuels.add(`${d.id}.html`);
    if (ecrireSiChange(path.join(RACINE, "d", `${d.id}.html`), pageDepute(d, cles, votesParNumero))) pages++;
  }
  if (deputes.length >= 500 && fs.existsSync(path.join(RACINE, "d"))) {
    for (const f of fs.readdirSync(path.join(RACINE, "d"))) if (f.endsWith(".html") && !actuels.has(f)) fs.unlinkSync(path.join(RACINE, "d", f));
  }

  // 4. Plan du site et robots.txt
  const urls = [
    `<url><loc>${SITE}</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
    ...votes.map((v) => `<url><loc>${SITE}v/${v.numero}.html</loc>${v.dateISO ? `<lastmod>${v.dateISO}</lastmod>` : ""}</url>`),
    ...deputes.map((d) => `<url><loc>${SITE}d/${d.id}.html</loc><changefreq>weekly</changefreq></url>`),
  ];
  ecrireSiChange(path.join(RACINE, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`);
  ecrireSiChange(path.join(RACINE, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${SITE}sitemap.xml\n`);

  // 4 bis. Flux RSS des derniers votes clés (textes et motions de censure), à suivre dans un lecteur de flux
  const xml = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const items = [...votes].sort((a, b) => b.numero - a.numero).slice(0, 40).map((v) => `  <item>
    <title>${xml(`${v.resultat === "adopte" ? "Adopté" : "Rejeté"} : ${v.titre}`)}</title>
    <link>${SITE}v/${v.numero}.html</link>
    <guid isPermaLink="true">${SITE}v/${v.numero}.html</guid>
    ${v.dateISO ? `<pubDate>${new Date(v.dateISO + "T18:00:00Z").toUTCString()}</pubDate>` : ""}
    <description>${xml(`Assemblée nationale, ${v.date} : ${nombre(v.pour)} pour, ${nombre(v.contre)} contre, ${nombre(v.abst)} abstention${v.abst > 1 ? "s" : ""}. Intitulé officiel : ${v.intitule}`)}</description>
  </item>`).join("\n");
  ecrireSiChange(path.join(RACINE, "feed.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${xml(NOM_SITE)} · Votes de l'Assemblée nationale</title>
  <link>${SITE}</link>
  <atom:link href="${SITE}feed.xml" rel="self" type="application/rss+xml"/>
  <description>Les derniers textes et motions de censure votés à l'Assemblée nationale, avec le décompte officiel.</description>
  <language>fr</language>
${items}
</channel>
</rss>
`);

  // 5. Adresse du site dans les balises og: d'index.html (utile après un changement de domaine)
  const indexFichier = path.join(RACINE, "index.html");
  const index = fs.readFileSync(indexFichier, "utf-8");
  const maj = index
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${SITE}$2`)
    .replace(/(<meta property="og:image" content=")[^"]*(icons\/partage\.jpg")/, `$1${SITE}$2`)
    .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${SITE}$2`);
  if (maj !== index) fs.writeFileSync(indexFichier, maj);

  console.log(`[partage] ${votes.length} votes clés, ${deputes.length} députés : ${pages} page(s) écrite(s), ${images} image(s) créée(s). Adresse : ${SITE}`);
})().catch((e) => {
  console.error("[partage] ÉCHEC :", e);
  process.exit(1);
});
