#!/usr/bin/env node
/**
 * recommandations.cjs
 * -------------------
 * Boucle d'apprentissage SIMPLE : lit data/instagram-stats.json (écrit par scripts/stats-instagram.cjs) et écrit
 * docs/stats/recommandations.md : « les stories de 12 h ont X % de vues de plus que les autres », « les sujets de type … fonctionnent mieux ».
 *
 * Ce sont des SUGGESTIONS pour le propriétaire : aucun réglage (data/stories-config.json, horaires, plafonds) n'est jamais modifié ici.
 * Pas de conclusion sans assez de données : au moins MIN_TOTAL médias mesurés pour le type étudié, et MIN_GROUPE médias dans le groupe
 * comparé comme dans le reste (voir docs/STATS.md). Une différence inférieure à SEUIL_PCT % est considérée comme du bruit.
 *
 * USAGE : node scripts/recommandations.cjs   (variables facultatives : STATS_SORTIE, STATS_DOCS)
 */
const fs = require("fs");
const path = require("path");

const RACINE = path.resolve(__dirname, "..");
const F_STATS = process.env.STATS_SORTIE || path.join(RACINE, "data", "instagram-stats.json");
const D_DOCS = process.env.STATS_DOCS || path.join(RACINE, "docs", "stats");
const MIN_TOTAL = 10; // médias mesurés d'un même type avant toute conclusion
const MIN_STYLE = 10; // stories mesurées PAR STYLE avant de désigner un style gagnant (test comparatif, docs/STATS.md)
const STYLES = ["bleu", "une-photo", "question", "chiffre"]; // même liste que scripts/stories-auto.cjs (VARIANTES)
const MIN_GROUPE = 3; // médias dans le groupe comparé ET dans le reste
const SEUIL_PCT = 15; // écart minimal pour être signalé

const vuesDe = (m) => (m.metriques || {}).views ?? (m.metriques || {}).impressions ?? (m.metriques || {}).reach ?? null;
const moyenne = (a) => a.reduce((s, x) => s + x, 0) / a.length;

const DIMENSIONS = [
  { nom: "créneau", cle: (m) => (m.heureParis == null ? null : `${m.heureParis} h`), phrase: (c, t) => `les ${t} publiés vers ${c} (heure de Paris)` },
  { nom: "thème", cle: (m) => m.theme || null, phrase: (c, t) => `les ${t} sur le thème « ${c} »` },
  { nom: "modèle", cle: (m) => m.modele || null, phrase: (c, t) => `les ${t} de type « ${c} »` },
  { nom: "nombre de médias du sujet", cle: (m) => (typeof m.nbMedias === "number" ? (m.nbMedias <= 3 ? "3 médias ou moins" : m.nbMedias <= 5 ? "4 à 5 médias" : "6 médias ou plus") : null), phrase: (c, t) => `les ${t} dont le sujet est repris par ${c}` },
];
const PLURIEL = { story: "stories", post: "posts", reel: "Reels", carrousel: "carrousels" };

/** Comparaisons d'une dimension pour un ensemble de médias de même type : [{ cle, n, moyenne, pct }] et nombre de groupes écartés faute de données. */
function comparer(medias, cle) {
  const g = new Map();
  for (const m of medias) { const k = cle(m); if (k == null) continue; if (!g.has(k)) g.set(k, []); g.get(k).push(vuesDe(m)); }
  const sorties = [];
  let trop = 0;
  for (const [k, vs] of g) {
    const reste = [...g].filter(([x]) => x !== k).flatMap(([, v]) => v);
    if (vs.length < MIN_GROUPE || reste.length < MIN_GROUPE) { trop++; continue; }
    const mg = moyenne(vs), mr = moyenne(reste);
    if (mr <= 0) continue;
    sorties.push({ cle: k, n: vs.length, nReste: reste.length, moyenne: mg, pct: ((mg - mr) / mr) * 100 });
  }
  return { sorties: sorties.sort((a, b) => b.pct - a.pct), trop };
}

/**
 * Conclusion du test comparatif des styles de story (champ « variante ») : { conclu, lignes }. Il faut au moins MIN_STYLE stories mesurées pour
 * CHAQUE style ; sinon « pas assez de données ». Suggestion seulement : le réglage « styleFixe » est à écrire par vous dans data/stories-config.json.
 */
function styleGagnant(medias) {
  const stories = medias.filter((m) => m.type === "story" && STYLES.includes(m.variante) && vuesDe(m) !== null);
  if (!stories.length) return null;
  const stats = STYLES.map((v) => { const vs = stories.filter((m) => m.variante === v).map(vuesDe); return { v, n: vs.length, m: vs.length ? moyenne(vs) : 0 }; });
  const detail = stats.map((x) => `${x.v} : ${x.n} stories` + (x.n ? `, ${Math.round(x.m)} vues en moyenne` : "")).join(" ; ");
  const manque = stats.filter((x) => x.n < MIN_STYLE);
  if (manque.length) return { conclu: false, lignes: [`Style gagnant : pas assez de données (il faut ${MIN_STYLE} stories mesurées par style ; il en manque pour ${manque.map((x) => `${x.v} (${x.n})`).join(", ")}). ${detail}.`] };
  const tri = [...stats].sort((a, b) => b.m - a.m);
  const [premier, second] = tri;
  const ecart = second.m > 0 ? ((premier.m - second.m) / second.m) * 100 : 100;
  if (ecart < SEUIL_PCT) return { conclu: false, lignes: [`Style gagnant : aucun net. « ${premier.v} » est en tête (${Math.round(premier.m)} vues) mais l'écart avec « ${second.v} » (${Math.round(second.m)} vues) est inférieur à ${SEUIL_PCT} %. ${detail}.`] };
  return { conclu: true, lignes: [
    `Style gagnant : « ${premier.v} », ${Math.round(premier.m)} vues en moyenne sur ${premier.n} stories, soit ${Math.round(ecart)} % de plus que « ${second.v} » (${Math.round(second.m)} vues). ${detail}.`,
    `Piste : pour l'adopter, écrire "styleFixe": "${premier.v}" dans data/stories-config.json (null remet le test comparatif). Rien n'est modifié automatiquement.`,
  ] };
}

function construire(stats, now = new Date()) {
  const medias = Object.values(stats?.medias || {}).filter((m) => m.type && vuesDe(m) !== null);
  const L = ["# Recommandations (suggestions, rien n'est modifié automatiquement)", "", `Calculées le ${now.toISOString().slice(0, 10)} à partir de ${medias.length} média(s) mesuré(s) (data/instagram-stats.json). Ce sont des pistes à valider par vous ; voir docs/STATS.md.`, ""];
  let conclusions = 0;
  const parType = {};
  for (const m of medias) (parType[m.type] = parType[m.type] || []).push(m);
  for (const [type, liste] of Object.entries(parType)) {
    const nom = PLURIEL[type] || type;
    L.push(`## ${nom[0].toUpperCase() + nom.slice(1)} (${liste.length} mesuré(s))`, "");
    if (liste.length < MIN_TOTAL) { L.push(`Données insuffisantes : ${liste.length} sur ${MIN_TOTAL} nécessaires avant de tirer des conclusions. Aucune recommandation.`, ""); continue; }
    let ecrit = 0;
    for (const d of DIMENSIONS) {
      const { sorties } = comparer(liste, d.cle);
      const tete = sorties[0], queue = sorties[sorties.length - 1];
      if (tete && tete.pct >= SEUIL_PCT) {
        L.push(`- ${d.phrase(tete.cle, nom)} ont ${Math.round(tete.pct)} % de vues de plus que les autres (${tete.n} contre ${tete.nReste} médias, moyenne ${Math.round(tete.moyenne)} vues). Piste : en publier davantage.`);
        ecrit++; conclusions++;
      }
      if (queue && sorties.length > 1 && queue.pct <= -SEUIL_PCT) {
        L.push(`- ${d.phrase(queue.cle, nom)} ont ${Math.round(-queue.pct)} % de vues de moins que les autres (${queue.n} contre ${queue.nReste} médias). Piste : en publier moins ou les repenser.`);
        ecrit++; conclusions++;
      }
    }
    if (!ecrit) L.push("Aucun écart net (moins de " + SEUIL_PCT + " %) ou groupes trop petits (moins de " + MIN_GROUPE + " médias) : rien à recommander pour l'instant.");
    L.push("");
  }
  if (Object.keys(parType).length > 1) {
    const f = Object.entries(parType).filter(([, l]) => l.length >= MIN_GROUPE).map(([t, l]) => ({ t, n: l.length, m: moyenne(l.map(vuesDe)) })).sort((a, b) => b.m - a.m);
    if (f.length > 1) L.push("## Formats (indicatif)", "", `Vues moyennes : ${f.map((x) => `${PLURIEL[x.t] || x.t} ${Math.round(x.m)} (${x.n})`).join(" ; ")}. Attention : une vue de story et une vue de Reel ne se comptent pas pareil, ne comparez les formats qu'avec prudence.`, "");
  }
  const sg = styleGagnant(medias);
  if (sg) { L.push("## Test comparatif des styles de story", "", ...sg.lignes.map((l) => "- " + l), ""); if (sg.conclu) conclusions++; }
  if (!medias.length) L.push("Aucune donnée mesurée pour l'instant.", "");
  return { texte: L.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n", conclusions };
}

function principal() {
  let stats;
  try { stats = JSON.parse(fs.readFileSync(F_STATS, "utf-8")); } catch (e) { console.log("[recommandations] data/instagram-stats.json absent : rien à faire."); return; }
  const { texte, conclusions } = construire(stats);
  fs.mkdirSync(D_DOCS, { recursive: true });
  fs.writeFileSync(path.join(D_DOCS, "recommandations.md"), texte);
  console.log(`[recommandations] docs/stats/recommandations.md écrit (${conclusions} suggestion(s)).`);
  if (process.env.GITHUB_STEP_SUMMARY) try { fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, "\n" + texte); } catch (e) { /* sans résumé */ }
}

module.exports = { construire, comparer, styleGagnant };
if (require.main === module) principal();
