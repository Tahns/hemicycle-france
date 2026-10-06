// Tests de data/site-config.json (adresse du site, mesure d'audience) et de scripts/appliquer-analytics.js.
// USAGE : node tests/analytics.test.mjs
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { normaliserBaseUrl, analyticsValide, lireSiteConfig, BASE_URL_DEFAUT } from "../scripts/site-config.js";
import { appliquerAnalytics, csp, hotesAnalytiques, preparer } from "../scripts/appliquer-analytics.js";
import { controlerPages } from "../scripts/controler-pages.js";

/* ---------- baseUrl : une seule variable, validée ---------- */
assert.equal(normaliserBaseUrl("https://tahns.github.io/hemicycle-france"), "https://tahns.github.io/hemicycle-france/");
assert.equal(normaliserBaseUrl("https://exemple.fr"), "https://exemple.fr/");
assert.equal(normaliserBaseUrl("  https://exemple.fr/  "), "https://exemple.fr/");
assert.equal(normaliserBaseUrl("http://exemple.fr/"), null, "https obligatoire");
assert.equal(normaliserBaseUrl("https://exemple.fr/?a=1"), null);
assert.equal(normaliserBaseUrl("https://u:p@exemple.fr/"), null);
assert.equal(normaliserBaseUrl("n'importe quoi"), null);
assert.equal(normaliserBaseUrl(""), null);

/* ---------- Mesure d'audience : désactivée par défaut, validée ---------- */
assert.equal(analyticsValide({ fournisseur: "", site: "" }), null);
assert.equal(analyticsValide(undefined), null);
assert.deepEqual(analyticsValide({ fournisseur: "GoatCounter", site: "Hemicycle-France" }), { fournisseur: "goatcounter", site: "hemicycle-france" });
assert.equal(analyticsValide({ fournisseur: "goatcounter", site: "a.b" }), null, "le code GoatCounter n'est pas un domaine");
assert.equal(analyticsValide({ fournisseur: "goatcounter", site: 'x" onload="y' }), null);
assert.deepEqual(analyticsValide({ fournisseur: "plausible", site: "hemicycle.fr" }), { fournisseur: "plausible", site: "hemicycle.fr" });
assert.equal(analyticsValide({ fournisseur: "plausible", site: "pas un domaine" }), null);
assert.equal(analyticsValide({ fournisseur: "google-analytics", site: "UA-1" }), null, "seuls les services prévus");

const dossier = mkdtempSync(path.join(tmpdir(), "site-config-"));
try {
  const f = path.join(dossier, "site-config.json");
  assert.equal((await lireSiteConfig(f)).baseUrl, BASE_URL_DEFAUT, "fichier absent : adresse par défaut");
  writeFileSync(f, JSON.stringify({ baseUrl: "http://pas-https", analytics: { fournisseur: "plausible", site: "?" } }));
  const c = await lireSiteConfig(f);
  assert.equal(c.baseUrl, BASE_URL_DEFAUT);
  assert.equal(c.analytics, null);
  assert.equal(c.erreurs.length, 2, "les deux réglages invalides sont signalés");
  writeFileSync(f, JSON.stringify({ baseUrl: "https://hemicycle.fr", analytics: { fournisseur: "goatcounter", site: "hemicycle" } }));
  const ok = await lireSiteConfig(f);
  assert.deepEqual([ok.baseUrl, ok.analytics.fournisseur, ok.erreurs.length], ["https://hemicycle.fr/", "goatcounter", 0]);
} finally { rmSync(dossier, { recursive: true, force: true }); }

// Le fichier du dépôt : valide et mesure désactivée
const reel = await lireSiteConfig();
assert.deepEqual(reel.erreurs, []);
assert.equal(reel.analytics, null, "mesure d'audience désactivée par défaut");

/* ---------- CSP et balise : seulement les adresses utiles, idempotent, réversible ---------- */
const PAGE = `<head><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://abc.supabase.co; object-src 'none'"><!-- mesure-audience:debut -->\n<!-- mesure-audience:fin --></head>`;
const gc = { fournisseur: "goatcounter", site: "hemicycle" }, pl = { fournisseur: "plausible", site: "hemicycle.fr" };
const avecGc = appliquerAnalytics(PAGE, gc);
assert.match(avecGc, /script-src 'self' 'unsafe-inline' https:\/\/gc\.zgo\.at;/);
assert.match(avecGc, /img-src 'self' data: https:\/\/hemicycle\.goatcounter\.com;/);
assert.match(avecGc, /connect-src 'self' https:\/\/abc\.supabase\.co https:\/\/hemicycle\.goatcounter\.com;/, "l'adresse des comptes est conservée");
assert.match(avecGc, /<script data-goatcounter="https:\/\/hemicycle\.goatcounter\.com\/count" async src="https:\/\/gc\.zgo\.at\/count\.js"><\/script>/);
assert.match(avecGc, /<meta name="mesure-audience" content="goatcounter">/);
assert.equal(appliquerAnalytics(avecGc, gc), avecGc, "idempotent");
assert.deepEqual(hotesAnalytiques(avecGc).sort(), ["https://gc.zgo.at", "https://hemicycle.goatcounter.com"]);
const avecPl = appliquerAnalytics(avecGc, pl);
assert.ok(!avecPl.includes("goatcounter") && !avecPl.includes("zgo.at"), "changer de service retire l'ancien");
assert.match(avecPl, /<script defer data-domain="hemicycle\.fr" src="https:\/\/plausible\.io\/js\/script\.hash\.js"><\/script>/);
assert.match(avecPl, /img-src 'self' data:;/, "Plausible n'a pas besoin d'img-src");
const sans = appliquerAnalytics(avecPl, null);
assert.equal(sans.replace(/\s+/g, " "), PAGE.replace(/\s+/g, " "), "désactiver ramène exactement la page d'origine");
assert.deepEqual(hotesAnalytiques(sans), []);
assert.equal(csp("default-src 'self'; connect-src 'self'", null), "default-src 'self'; connect-src 'self'");
assert.deepEqual(preparer(null), { hotes: {}, balises: "" });

/* ---------- Le dépôt : index.html est cohérent avec data/site-config.json ---------- */
const index = readFileSync("index.html", "utf-8");
assert.deepEqual(hotesAnalytiques(index), [], "aucune adresse d'analyse dans la CSP quand la mesure est désactivée");
assert.ok(!/<meta name="mesure-audience"/.test(index) && !/goatcounter|plausible\.io/.test(index.replace(/<li id="mention-mesure-[^"]*"[^>]*>[\s\S]*?<\/li>/g, "")), "aucun script d'analyse");
assert.match(index, /<!-- mesure-audience:debut -->\s*<!-- mesure-audience:fin -->/);
const problemes = await controlerPages(".");
assert.deepEqual(problemes, [], problemes.slice(0, 5).join("\n"));

console.log("analytics : tous les tests passent");
