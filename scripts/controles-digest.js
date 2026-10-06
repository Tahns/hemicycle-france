/**
 * controles-digest.js
 * -------------------
 * Contrôles du résumé hebdomadaire (data/digest/, digest/, digest.xml) et des flux d'alertes (feeds/), utilisés par check-data.js.
 * Chaque fonction renvoie une liste d'erreurs (vide = sain). Pas de réseau ; les fonctions « controler… » sont pures (testées dans
 * tests/digest-hebdo.test.mjs et tests/flux-alertes.test.mjs), seule controlerDepot() lit les fichiers.
 */
import { readFile, readdir } from "fs/promises";
import { existsSync } from "fs";

const ESPERLUETTE_NUE = /&(?!(?:amp|lt|gt|quot|#39|#\d+);)/;
const HTTPS = /^https:\/\//;

/** Contrôle d'un flux Atom (texte). maxEntrees : plafond d'entrées. */
export function controlerAtom(nom, xml, { maxEntrees = 20 } = {}) {
  const e = [];
  if (!xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')) e.push(`${nom} : déclaration XML absente`);
  if (!/<feed xmlns="http:\/\/www\.w3\.org\/2005\/Atom"/.test(xml) || !xml.trimEnd().endsWith("</feed>")) e.push(`${nom} : élément <feed> Atom absent ou non fermé`);
  if (ESPERLUETTE_NUE.test(xml)) e.push(`${nom} : « & » non échappé`);
  const sansEntrees = xml.replace(/<entry>[\s\S]*?<\/entry>/g, "");
  for (const balise of ["id", "title", "updated"]) if (!new RegExp(`<${balise}>[^<]+</${balise}>`).test(sansEntrees)) e.push(`${nom} : <${balise}> du flux manquant`);
  if (!/<author><name>[^<]+<\/name><\/author>/.test(sansEntrees)) e.push(`${nom} : auteur manquant`);
  const ouvertes = (xml.match(/<entry>/g) || []).length, fermees = (xml.match(/<\/entry>/g) || []).length;
  if (ouvertes !== fermees) e.push(`${nom} : ${ouvertes} <entry> pour ${fermees} </entry>`);
  if (ouvertes > maxEntrees) e.push(`${nom} : ${ouvertes} entrées (plafond ${maxEntrees})`);
  const dates = [];
  for (const [, corps] of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    for (const balise of ["id", "title", "updated"]) if (!new RegExp(`<${balise}>[^<]+</${balise}>`).test(corps)) e.push(`${nom} : une entrée sans <${balise}>`);
    const lien = /<link href="([^"]*)"\/>/.exec(corps)?.[1];
    if (!lien || !HTTPS.test(lien)) e.push(`${nom} : une entrée sans lien https`);
    const maj = /<updated>([^<]+)<\/updated>/.exec(corps)?.[1];
    if (maj && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(maj)) e.push(`${nom} : date d'entrée invalide (${maj})`);
    if (maj) dates.push(maj);
  }
  if (dates.some((d, i) => i && d > dates[i - 1])) e.push(`${nom} : entrées non triées de la plus récente à la plus ancienne`);
  return e;
}

/** Contrôle d'un résumé hebdomadaire (objet JSON). */
export function controlerDigest(d, nom = "digest") {
  const e = [];
  if (!/^\d{4}-W\d{2}$/.test(d.id || "")) e.push(`${nom} : id invalide`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.debut || "") || !/^\d{4}-\d{2}-\d{2}$/.test(d.fin || "") || d.debut > d.fin) e.push(`${nom} : dates de la semaine invalides`);
  if (!d.titre) e.push(`${nom} : titre manquant`);
  const s = d.scrutins || {};
  if (![s.total, s.adoptes, s.rejetes].every((n) => Number.isInteger(n) && n >= 0) || s.adoptes + s.rejetes !== s.total) e.push(`${nom} : totaux des scrutins incohérents`);
  for (const [liste, cle] of [[d.textes, "textes"], [d.serres, "serres"]]) {
    if (!Array.isArray(liste)) { e.push(`${nom} : « ${cle} » absent`); continue; }
    for (const t of liste) {
      if (!["adopte", "rejete"].includes(t.resultat)) e.push(`${nom} : ${cle} n°${t.numero} : résultat invalide`);
      if (!HTTPS.test(t.url || "")) e.push(`${nom} : ${cle} n°${t.numero} : source officielle manquante`);
      if (![t.pour, t.contre, t.abst].every((n) => Number.isInteger(n) && n >= 0)) e.push(`${nom} : ${cle} n°${t.numero} : décompte invalide`);
      if (t.dateISO < d.debut || t.dateISO > d.fin) e.push(`${nom} : ${cle} n°${t.numero} hors de la semaine`);
    }
  }
  if (Array.isArray(d.textes) && d.textes.length > s.total) e.push(`${nom} : plus de textes votés que de scrutins`);
  for (const a of d.actualite || []) for (const x of a.articles || []) if (!HTTPS.test(x.url || "") || !x.media) e.push(`${nom} : source de presse invalide (${a.titre})`);
  if (!Array.isArray(d.sources) || !d.sources.length || d.sources.some((x) => !HTTPS.test(x.url || ""))) e.push(`${nom} : sources manquantes ou non https`);
  if (d.sondage && (!d.sondage.institut || !d.sondage.tetes?.length)) e.push(`${nom} : sondage incomplet`);
  return e;
}

/** Contrôle d'une page HTML du résumé : pas de script exécutable, CSP présente. */
export function controlerPageDigest(nom, html, { email = false } = {}) {
  const e = [];
  if (/<script(?![^>]*type="application\/ld\+json")/i.test(html)) e.push(`${nom} : contient du JavaScript`);
  if (/\son[a-z]+\s*=/i.test(html)) e.push(`${nom} : attribut d'événement en ligne`);
  if (!email) {
    if (!/<meta http-equiv="Content-Security-Policy" content="[^"]*default-src 'none'/.test(html)) e.push(`${nom} : CSP absente`);
    if (!/<meta property="og:title"/.test(html) || !/<link rel="canonical"/.test(html)) e.push(`${nom} : Open Graph ou adresse canonique manquants`);
  } else if (/<link |<img |<style/i.test(html)) e.push(`${nom} : ressource externe ou feuille de style (l'e-mail doit être autonome)`);
  return e;
}

/** Lit le dépôt : data/digest/*.json, digest/<id>/{index,email}.html, digest.xml, feeds/. */
export async function controlerDepot({ maxDeputes = 600, maxLois = 150 } = {}) {
  const e = [];
  const resume = [];
  const ids = existsSync("data/digest") ? (await readdir("data/digest")).filter((f) => f.endsWith(".json")) : [];
  for (const f of ids) {
    let d;
    try { d = JSON.parse(await readFile(`data/digest/${f}`, "utf-8")); } catch (x) { e.push(`data/digest/${f} : JSON invalide`); continue; }
    if (f !== `${d.id}.json`) e.push(`data/digest/${f} : nom différent de l'id ${d.id}`);
    e.push(...controlerDigest(d, `data/digest/${f}`));
    for (const [page, email] of [["index.html", false], ["email.html", true]]) {
      const chemin = `digest/${d.id}/${page}`;
      if (!existsSync(chemin)) e.push(`${chemin} : page manquante`);
      else e.push(...controlerPageDigest(chemin, await readFile(chemin, "utf-8"), { email }));
    }
  }
  if (ids.length) {
    if (!existsSync("digest.xml")) e.push("digest.xml : absent");
    else {
      const xml = await readFile("digest.xml", "utf-8");
      e.push(...controlerAtom("digest.xml", xml));
      if (!xml.includes(`digest/${ids.sort().at(-1).replace(".json", "")}/`)) e.push("digest.xml : ne cite pas le dernier résumé");
    }
  }
  resume.push(`${ids.length} résumé(s) hebdomadaire(s)`);
  for (const [dossier, plafond, entrees] of [["feeds/depute", maxDeputes, 10], ["feeds/loi", maxLois, 20]]) {
    if (!existsSync(dossier)) continue;
    const fichiers = await readdir(dossier);
    if (fichiers.length > plafond) e.push(`${dossier} : ${fichiers.length} flux (plafond ${plafond})`);
    for (const f of fichiers) {
      if (!/^[A-Za-z0-9]+\.xml$/.test(f)) { e.push(`${dossier}/${f} : nom inattendu`); continue; }
      e.push(...controlerAtom(`${dossier}/${f}`, await readFile(`${dossier}/${f}`, "utf-8"), { maxEntrees: entrees }));
    }
    resume.push(`${fichiers.length} flux ${dossier.split("/")[1]}`);
  }
  return { erreurs: e, resume: resume.join(", ") };
}
