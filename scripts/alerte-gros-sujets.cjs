#!/usr/bin/env node
/**
 * alerte-gros-sujets.cjs
 * ----------------------
 * Filet de sécurité : un GROS sujet (repris par au moins « grosSujetMedias » médias distincts, data/stories-config.json) ne doit jamais passer
 * sans que le propriétaire le sache. Après chaque passage de stories-auto, ce script cherche les gros sujets récents (moins de 12 h) qui ne sont
 * couverts par aucune entrée de la file ni du registre des publications (72 h) ; pour chacun il écrit :
 *   - une ligne dans le résumé de l'exécution ($GITHUB_STEP_SUMMARY),
 *   - un ticket GitHub « Gros sujet non publié : … » (un seul par sujet : recherche d'un ticket ouvert du même titre), ce qui prévient le propriétaire par e-mail
 *     (nécessite GITHUB_TOKEN et la permission « issues: write » ; sans eux, seul le résumé est écrit).
 * Un sujet couvert par une publication, ou dont un RÉSULTAT (élu, adopté…) n'a pas encore été publié alors que seule l'avant-première l'a été, est signalé.
 * N'écrit rien dans les données du site. Aucune publication, aucune modification de la file.
 * USAGE : node scripts/alerte-gros-sujets.cjs [--seche]   (--seche : n'écrit que sur la sortie standard)
 */
const fs = require("fs");
const path = require("path");
const AUTO = require("./stories-auto.cjs");

const RACINE = path.resolve(__dirname, "..");
const lire = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(RACINE, f), "utf-8")); } catch (e) { return d; } };
const FRAICHEUR_ALERTE_H = 12;
const DELAI_MIN_ALERTE_MIN = 20; // un gros sujet n'est signalé qu'après 20 minutes sans publication : le temps que la file le traite

/** Gros sujets récents non couverts : [{ indice, titre, medias, sources, raison }]. Fonction pure (testable). */
function grosSujetsNonCouverts({ actualites, file, registre, now = new Date(), seuil = AUTO.grosSujetMedias() }) {
  const entrees = file?.entrees || [];
  const recents = AUTO.titresRecentsH(entrees, registre, now, 72);
  const urls = new Set([...entrees, ...(registre?.entrees || [])].flatMap((e) => (Array.isArray(e.sources) ? e.sources : [])));
  const out = [];
  (actualites?.sujets || []).forEach((s, indice) => {
    const arts = s.articles || [];
    if (!arts.length) return;
    const medias = AUTO.mediasDistinctsDe(arts, s.mediasDistincts);
    if (medias < seuil) return;
    const age = now.getTime() - Date.parse(s.derniere);
    if (!(age < FRAICHEUR_ALERTE_H * 36e5) || age < -36e5) return;
    const titre = s.accroche || s.fait || s.titrePropre?.titre || arts[0].titre;
    const plusAncien = Math.min(...arts.map((a) => Date.parse(a.date)).filter((t) => !Number.isNaN(t)));
    if (Number.isFinite(plusAncien) && now.getTime() - plusAncien < DELAI_MIN_ALERTE_MIN * 6e4) return; // trop frais : la file va le traiter
    if (arts.some((a) => urls.has(a.url))) return; // un de ses articles est déjà dans une publication
    const titres = [titre, ...arts.map((a) => a.titre)];
    // couvert si un titre est proche d'une publication récente, sauf un résultat (élu, adopté…) que l'avant-première ne contenait pas
    const couvert = titres.some((t) => recents.some((r) => AUTO.titresProches(r, t))) && !titres.some((t) => !AUTO.dejaVuSaufResultat(t, recents) && recents.some((r) => AUTO.titresProches(r, t)));
    if (couvert) return;
    out.push({ indice, titre, medias, sources: [...new Set(arts.map((a) => a.media))].slice(0, 8), liens: arts.slice(0, 3).map((a) => a.url) });
  });
  return out;
}

async function creerTicket(g) {
  const jeton = process.env.GITHUB_TOKEN, repo = process.env.GITHUB_REPOSITORY;
  if (!jeton || !repo) return "pas de jeton : résumé seulement";
  const titre = `Gros sujet non publié : ${g.titre}`.slice(0, 120);
  const h = { Authorization: `Bearer ${jeton}`, Accept: "application/vnd.github+json", "Content-Type": "application/json", "User-Agent": "hemicycle-france-alerte" };
  const q = encodeURIComponent(`repo:${repo} is:issue is:open in:title "${titre.slice(0, 60).replace(/"/g, "")}"`);
  const r0 = await fetch(`https://api.github.com/search/issues?q=${q}`, { headers: h });
  if (r0.ok && (await r0.json()).total_count > 0) return "ticket déjà ouvert";
  const corps = [`Ce sujet est repris par **${g.medias} médias** (${g.sources.join(", ")}) et n'a pas été publié en story ou en post depuis plus de ${DELAI_MIN_ALERTE_MIN} minutes.`, "", ...g.liens.map((l) => `- ${l}`), "", "Causes possibles : sujet écarté par une règle de prudence (accusation, mineurs, violences), plafond de publications du jour, doublon avec une publication récente. Journal : onglet Actions > « Actualités » > étape « Story automatique »."].join("\n");
  const r = await fetch(`https://api.github.com/repos/${repo}/issues`, { method: "POST", headers: h, body: JSON.stringify({ title: titre, body: corps }) });
  return r.ok ? "ticket créé" : `ticket refusé (HTTP ${r.status})`;
}

async function main() {
  const now = new Date();
  const config = AUTO.lireConfig(); AUTO.appliquerSeuils(config);
  const liste = grosSujetsNonCouverts({ actualites: lire("data/actualites.json", null), file: lire("data/instagram-file.json", { entrees: [] }), registre: lire("data/instagram-publiees.json", null), now });
  if (!liste.length) { console.log("[alerte-gros-sujets] aucun gros sujet non couvert."); return; }
  const seche = process.argv.includes("--seche");
  for (const g of liste) {
    const ligne = `- **GROS SUJET NON PUBLIÉ** (${g.medias} médias : ${g.sources.join(", ")}) : « ${g.titre} » ${g.liens[0] || ""}`;
    console.log("[alerte-gros-sujets]", ligne);
    if (process.env.GITHUB_STEP_SUMMARY && !seche) { try { fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, ligne + "\n"); } catch (e) { /* résumé facultatif */ } }
    if (!seche) console.log("[alerte-gros-sujets]", await creerTicket(g).catch((e) => "ticket : " + e.message));
  }
}

module.exports = { grosSujetsNonCouverts };
if (require.main === module) main().catch((e) => { console.error("[alerte-gros-sujets]", e.message); process.exit(0); }); // une alerte qui échoue ne casse jamais le workflow
