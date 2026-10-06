/**
 * couvertures-a-la-une.cjs
 * ------------------------
 * Rend les couvertures des « stories à la une » Instagram (1080 × 1920 PNG) dans instagram/a-la-une/<rubrique>.png,
 * plus une planche d'aperçu instagram/a-la-une/planche.png (recadrage en cercle, tel qu'Instagram l'affiche).
 * Même identité que les couvertures instagram/rubrique-*.png : fond bleu #1B3A8C, disque rouge #C8102E cerclé de crème, icône crème,
 * libellé en capitales espacées Newsreader. Tout est centré : Instagram recadre un carré de 1080 px au centre puis un cercle,
 * donc icône + libellé tiennent dans le cercle (centre 540 × 960, rayon 540), avec de la marge.
 * Rubriques : scripts/a-la-une-rubriques.cjs. Polices : fonts/ (intégrées en base64, aucune ressource externe).
 * USAGE : node scripts/couvertures-a-la-une.cjs   (paquet « playwright » et Chromium ; CHROMIUM_PATH pour indiquer l'exécutable)
 */
const fs = require("fs");
const path = require("path");
const { RUBRIQUES } = require("./a-la-une-rubriques.cjs");

const RACINE = path.join(__dirname, "..");
const SORTIE = path.join(RACINE, "instagram", "a-la-une");
const DA = { fond: "#1B3A8C", rouge: "#C8102E", creme: "#F5F1E8", ciel: "#C5CEF2" };
const police = (f) => fs.readFileSync(path.join(RACINE, "fonts", f)).toString("base64");

const POLICES = () => `
@font-face{font-family:"Newsreader";font-weight:200 800;src:url(data:font/woff2;base64,${police("newsreader-normal-latin.woff2")}) format("woff2");}
@font-face{font-family:"Public Sans";font-weight:100 900;src:url(data:font/woff2;base64,${police("public-sans-normal-latin.woff2")}) format("woff2");}
*{box-sizing:border-box;margin:0;padding:0}`;

function pageCouvertures(rubriques) {
  return `<!doctype html><meta charset="utf-8"><style>${POLICES()}
body{background:${DA.fond}}
.c{width:1080px;height:1920px;background:${DA.fond};position:relative;overflow:hidden}
.d{position:absolute;left:316px;top:653px;width:448px;height:448px;border-radius:50%;background:${DA.rouge};border:14px solid ${DA.creme};display:flex;align-items:center;justify-content:center}
.d svg{width:216px;height:216px;color:${DA.creme};stroke:${DA.creme};fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.l{position:absolute;left:0;width:1080px;top:1150px;text-align:center;color:${DA.creme};font-family:Newsreader,serif;font-weight:700;text-transform:uppercase;white-space:nowrap}
</style><body>${rubriques.map((r) => `<div class="c" id="${r.id}"><div class="d"><svg viewBox="0 0 24 24">${r.icone}</svg></div><div class="l">${r.libelle}</div></div>`).join("")}`;
}

function pagePlanche(cartes) {
  return `<!doctype html><meta charset="utf-8"><style>${POLICES()}
body{width:1760px;padding:40px 40px 30px;background:${DA.fond};font-family:"Public Sans",sans-serif;color:${DA.creme}}
h1{font-family:Newsreader,serif;font-size:40px;font-weight:600;margin-bottom:6px}
p.s{font-size:18px;color:${DA.ciel};margin-bottom:28px}
.g{display:grid;grid-template-columns:repeat(7,1fr);gap:26px 20px}
.k{text-align:center;font-size:17px;letter-spacing:.04em}
.k i{display:block;width:210px;height:210px;margin:0 auto 10px;border-radius:50%;background-repeat:no-repeat;background-size:210px 373px;background-position:center center;box-shadow:0 0 0 2px rgba(197,206,242,.35)}
</style><body><h1>Stories à la une : aperçu en cercle</h1><p class="s">Instagram recadre le centre de chaque couverture 1080 × 1920 en cercle : voici ce qui reste visible.</p><div class="g">
${cartes.map((r) => `<div class="k"><i style="background-image:url(${r.url})"></i>${r.libelle}</div>`).join("")}</div>`;
}

(async () => {
  const { chromium } = require("playwright");
  fs.mkdirSync(SORTIE, { recursive: true });
  const exe = process.env.CHROMIUM_PATH || undefined;
  const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
    await page.setContent(pageCouvertures(RUBRIQUES));
    await page.evaluate(() => document.fonts.ready);
    // Libellé : une ligne, 76 px au plus, réduit pour tenir dans 780 px (largeur sûre du cercle), capitales espacées
    await page.evaluate(() => {
      for (const l of document.querySelectorAll(".l")) {
        const texte = l.textContent;
        l.textContent = "";
        const s = document.createElement("span");
        s.textContent = texte;
        l.appendChild(s);
        let t = 76;
        for (; t > 40; t -= 2) {
          l.style.fontSize = t + "px";
          l.style.letterSpacing = t * 0.14 + "px";
          if (s.getBoundingClientRect().width - t * 0.14 <= 780) break;
        }
        l.style.paddingLeft = t * 0.14 + "px"; // recentre : l'espacement final suit la dernière lettre
      }
    });
    for (const r of RUBRIQUES) {
      await page.locator("#" + r.id).screenshot({ path: path.join(SORTIE, r.id + ".png") });
      console.log("couverture", r.id + ".png");
    }
    const cartes = RUBRIQUES.map((r) => ({ ...r, url: "data:image/png;base64," + fs.readFileSync(path.join(SORTIE, r.id + ".png")).toString("base64") }));
    const p2 = await browser.newPage({ viewport: { width: 1760, height: 700 } });
    await p2.setContent(pagePlanche(cartes));
    await p2.evaluate(() => document.fonts.ready);
    await p2.screenshot({ path: path.join(SORTIE, "planche.png"), fullPage: true });
    console.log("planche.png");
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
