#!/usr/bin/env node
/**
 * mesure-regroupement.cjs : compare l'ancien et le nouveau regroupement sur les articles de data/actualites.json.
 * USAGE : node scripts/mesure-regroupement.cjs [--detail]   (lecture seule, aucun réseau)
 */
const fs = require("fs");
const { regrouper, regrouperAncien, construireReferentiel, sourcesDistinctes } = require("./regroupement.cjs");
const lire = (f) => { try { return JSON.parse(fs.readFileSync(`data/${f}.json`, "utf-8")); } catch { return null; } };
const d = lire("actualites");
const articles = [...new Map(d.sujets.flatMap((s) => s.articles).map((a) => [a.url, a])).values()].sort((a, b) => b.date.localeCompare(a.date));
const ref = construireReferentiel({ gouvernement: lire("gouvernement"), candidats: lire("candidats"), deputes: lire("deputes"), senateurs: lire("senateurs"), dirigeants: lire("dirigeants") });
const distrib = (ss, f) => { const h = {}; for (const s of ss) { const n = f(s); h[n] = (h[n] || 0) + 1; } return Object.entries(h).sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k} média(s): ${v}`).join(" | "); };
const mesure = (nom, ss) => {
  console.log(`${nom} : ${ss.length} sujets`);
  console.log("  médias (noms)    :", distrib(ss, (s) => new Set(s.articles.map((a) => a.media)).size));
  console.log("  médias distincts :", distrib(ss, (s) => sourcesDistinctes(s.articles).mediasDistincts));
};
console.log(`${articles.length} articles`);
const avant = regrouperAncien(articles), apres = regrouper(articles, { referentiel: ref });
mesure("AVANT", avant);
mesure("APRÈS", apres);
if (process.argv.includes("--detail")) for (const s of apres.filter((x) => x.articles.length > 1)) {
  const sd = sourcesDistinctes(s.articles);
  console.log(`\n[${sd.mediasDistincts} distinct(s) : ${sd.sources.join(", ")}]`);
  for (const a of s.articles) console.log(`   ${a.media} | ${a.titre}`);
}
