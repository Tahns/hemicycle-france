#!/usr/bin/env node
/**
 * appliquer-analytics.js
 * ----------------------
 * Mesure d'audience facultative et respectueuse de la vie privée (GoatCounter ou Plausible), DÉSACTIVÉE par défaut.
 * Lit « analytics » dans data/site-config.json :
 *  - fournisseur ou site vide, ou invalide : aucun script, CSP stricte (rien n'est ajouté) ;
 *  - valide : une balise <script> (entre les repères « mesure-audience » de la tête d'index.html), une balise
 *    <meta name="mesure-audience"> qui sélectionne la mention légale correspondante, et SEULEMENT les adresses utiles
 *    dans la CSP (script-src, img-src, connect-src), comme appliquer-compte.js le fait pour Supabase.
 * Idempotent ; lancé par update-data.yml après appliquer-compte.js (qui recalcule connect-src : on le complète ensuite).
 *
 * USAGE : node scripts/appliquer-analytics.js
 */
import { readFile, writeFile } from "fs/promises";
import { fileURLToPath } from "url";
import { lireSiteConfig } from "./site-config.js";

/** Les seules adresses que ce script peut ajouter à la CSP (pour les reconnaître et les retirer au besoin). */
export const HOTE_ANALYTIQUE = /^https:\/\/(gc\.zgo\.at|[a-z0-9-]+\.goatcounter\.com|plausible\.io)$/;
const DIRECTIVES = ["script-src", "img-src", "connect-src"];
const DEBUT = "<!-- mesure-audience:debut -->", FIN = "<!-- mesure-audience:fin -->";

/** Adresses à autoriser et balises à poser pour une configuration valide. */
export function preparer(config) {
  if (!config) return { hotes: {}, balises: "" };
  if (config.fournisseur === "goatcounter") {
    const hote = `https://${config.site}.goatcounter.com`;
    return {
      hotes: { "script-src": ["https://gc.zgo.at"], "img-src": [hote], "connect-src": [hote] },
      balises: `<meta name="mesure-audience" content="goatcounter">\n<script data-goatcounter="${hote}/count" async src="https://gc.zgo.at/count.js"></script>`,
    };
  }
  // Plausible : la variante « hash » compte aussi les changements de rubrique (#depute-…, #sondages…)
  return {
    hotes: { "script-src": ["https://plausible.io"], "connect-src": ["https://plausible.io"] },
    balises: `<meta name="mesure-audience" content="plausible">\n<script defer data-domain="${config.site}" src="https://plausible.io/js/script.hash.js"></script>`,
  };
}

/** Nouvelle CSP : les adresses d'analyse précédentes sont retirées, celles de la configuration ajoutées ; le reste est inchangé. */
export function csp(valeur, config) {
  const { hotes } = preparer(config);
  return valeur.split(";").map((d) => d.trim()).filter(Boolean).map((d) => {
    const jetons = d.split(/\s+/);
    if (!DIRECTIVES.includes(jetons[0])) return d;
    return [...jetons.filter((j) => !HOTE_ANALYTIQUE.test(j)), ...(hotes[jetons[0]] || [])].join(" ");
  }).join("; ");
}

export function appliquerAnalytics(html, config) {
  const { balises } = preparer(config);
  const a = html.indexOf(DEBUT), b = html.indexOf(FIN);
  let sortie = html;
  if (a >= 0 && b > a) sortie = html.slice(0, a + DEBUT.length) + (balises ? "\n" + balises + "\n" : "\n") + html.slice(b);
  return sortie.replace(/(<meta http-equiv="Content-Security-Policy" content=")([^"]*)(")/, (m, avant, valeur, apres) => avant + csp(valeur, config) + apres);
}

/** Adresses d'analyse actuellement autorisées par la CSP du HTML (pour check-data). */
export function hotesAnalytiques(html) {
  const m = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/);
  if (!m) return [];
  return [...new Set(m[1].split(/[\s;]+/).filter((j) => HOTE_ANALYTIQUE.test(j)))];
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] === fileURLToPath(import.meta.url)) {
  const { analytics, erreurs } = await lireSiteConfig();
  for (const e of erreurs) console.error(`[analytics] ${e} : mesure laissée désactivée.`);
  const html = await readFile("index.html", "utf-8");
  const maj = appliquerAnalytics(html, analytics);
  if (maj !== html) await writeFile("index.html", maj);
  console.log(`[analytics] ${analytics ? `mesure active (${analytics.fournisseur}, ${analytics.site})` : "mesure désactivée"}${maj !== html ? " : index.html mis à jour" : " : rien à changer"}.`);
  if (erreurs.length) process.exit(1);
}
