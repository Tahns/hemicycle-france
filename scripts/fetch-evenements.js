#!/usr/bin/env node
/**
 * fetch-evenements.js
 * -------------------
 * Relevé automatique des événements politiques à venir, fusionné dans data/meetings.json SANS toucher
 * aux entrées saisies à la main.
 *
 * SOURCES (publiques, stables) :
 *  - Wikipédia FR, API Action en JSON (User-Agent poli, scripts/http.js) : articles listés dans
 *    data/evenements-sources.json (présidentielle 2027, primaires, congrès de partis). Seul le résumé de l'article est lu.
 *  - Ordre du jour de l'Assemblée nationale déjà relevé (data/agenda-an.json) : projets de loi examinés en séance
 *    à une date lointaine (au-delà de l'horizon d'affichage de la page « Prochainement à l'Assemblée »).
 *  Les dates officielles des élections viennent de l'article de référence ET sont recoupées avec les entrées manuelles
 *  existantes : en cas de divergence, l'entrée manuelle fait foi et rien n'est ajouté (signalé dans le journal).
 *  Le Sénat ne publie pas de calendrier lisible par machine dans les données déjà relevées (data/dossiers-senat.json et
 *  navette.json ne portent que des liens et des votes passés) : pas d'examen au Sénat relevé tant qu'aucune source stable n'est branchée.
 *
 * RÈGLES :
 *  - une entrée « origine: "auto" » est créée, mise à jour ou retirée par ce script ; une entrée sans ce champ (manuelle)
 *    n'est jamais modifiée ni supprimée, et gagne toujours contre un doublon automatique ;
 *  - une entrée automatique absente de la source est retirée seulement après 2 relevés consécutifs (champ « absences ») ;
 *    une source injoignable ne fait rien disparaître ;
 *  - aucune invention : date incomplète, phrase au conditionnel ou date passée → rien n'est ajouté ;
 *  - titres écrits par nous (jamais recopiés d'un média), source citée (URL), niveau de confiance ;
 *  - dates seulement : aucun résultat ni sondage (réserve électorale), les événements non confirmés (« confirme: false ») ne sont pas affichés ;
 *  - écriture protégée par scripts/garde.js (refus d'un fichier vide ou dégradé).
 *
 * USAGE :
 *   node scripts/fetch-evenements.js
 *   node scripts/fetch-evenements.js --dry-run
 *   node scripts/fetch-evenements.js --fixtures=tests/fixtures/evenements --aujourdhui=2026-10-06   # sans réseau (développement, tests)
 */

import { fetchPoli } from "./http.js";
import { ecrireGarde } from "./garde.js";
import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import path from "path";

const DATA_FILE = path.resolve("data/meetings.json");
const SOURCES_FILE = path.resolve("data/evenements-sources.json");
const AGENDA_FILE = path.resolve("data/agenda-an.json");
const API = "https://fr.wikipedia.org/w/api.php";

export const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
export const MOIS_COURT = ["JANV.", "FÉVR.", "MARS", "AVR.", "MAI", "JUIN", "JUIL.", "AOÛT", "SEPT.", "OCT.", "NOV.", "DÉC."];
export const TYPES = ["congres", "primaire", "election", "examen-loi", "meeting"];
const ABSENCES_MAX = 2; // relevés consécutifs sans la source avant retrait
const CONSERVER_PASSE_JOURS = 30; // une entrée automatique passée est gardée 30 jours (« Événements récents »), puis retirée

const log = (...m) => console.log("[fetch-evenements]", ...m);
const warn = (...m) => console.warn("[fetch-evenements][ATTENTION]", ...m);

const sansAccent = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const iso = (a, m, j) => `${a}-${String(m).padStart(2, "0")}-${String(j).padStart(2, "0")}`;
const ajouterJours = (isoDate, n) => new Date(Date.parse(isoDate + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const joursEntre = (a, b) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 864e5);
const dateValide = (a, m, j) => { const d = new Date(Date.UTC(a, m - 1, j)); return d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === j; };

// ---------------------------------------------------------------------------------------------
// Wikitexte -> texte lisible, résumé de l'article
// ---------------------------------------------------------------------------------------------

/** Texte lisible du résumé d'un article (avant le premier intertitre) : modèles, liens, notes retirés ; {{date|…}} conservé. Pure. */
export function resumeTexte(wikitexte) {
  let t = String(wikitexte).replace(/<!--[\s\S]*?-->/g, "");
  const fin = t.search(/^==[^=]/m);
  if (fin > 0) t = t.slice(0, fin);
  t = t.replace(/<ref[^>]*\/>|<ref[^>]*>[\s\S]*?<\/ref>/g, "");
  // Modèles, du plus intérieur au plus extérieur : on ne garde que {{date|…}} et {{1er}}
  for (let i = 0; i < 12 && /\{\{[^{}]*\}\}/.test(t); i++) {
    t = t.replace(/\{\{([^{}]*)\}\}/g, (_, corps) => {
      const [nom, ...args] = corps.split("|").map((x) => x.trim());
      const n = sansAccent(nom);
      if (n === "date" || n === "dateh") return args.filter((a) => a && !a.includes("=")).join(" ");
      if (/^1(er|re)$/.test(n) || n === "premier") return "1er";
      return "";
    });
  }
  return t
    .replace(/\[\[(?:Fichier|File|Image|Catégorie)[^\]]*\]\]/gi, "")
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/g, "$1")
    .replace(/'''?/g, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;| | /g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------------------------
// Dates françaises
// ---------------------------------------------------------------------------------------------

const J = "(1er|1re|\\d{1,2})";
const M = "(janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre)";
const A = "(?:\\s+(\\d{4}))?";
// Du plus spécifique au plus général : « du 9 au 10 octobre 2026 », « les 24 et 25 octobre 2026 », « 18 avril et 2 mai 2027 », « 18 avril 2027 »
const RE_DATES = new RegExp(
  `du\\s+${J}(?:\\s+${M})?\\s+au\\s+${J}\\s+${M}${A}` +
  `|\\bles?\\s+${J}\\s+et\\s+${J}\\s+${M}${A}` +
  `|${J}\\s+${M}${A}\\s+et\\s+(?:le\\s+)?${J}\\s+${M}${A}` +
  `|${J}\\s+${M}${A}`, "gi");
const num = (j) => parseInt(String(j).replace(/\D/g, "") || "0", 10);
const indexMois = (m) => MOIS.findIndex((x) => sansAccent(x) === sansAccent(m)) + 1;

/**
 * Dates d'une phrase : [{ debut, fin?, texte }] dans l'ordre de lecture. Une date sans année est ignorée (jamais devinée).
 * « les 10 et 24 avril 2022 » (jours non consécutifs) donne deux dates distinctes ; « les 24 et 25 octobre » une période.
 */
export function trouverDates(phrase) {
  const sortie = [];
  const ajout = (a, m, j, texte) => { if (a && m && dateValide(a, m, j)) sortie.push({ debut: iso(a, m, j), texte }); };
  for (const x of String(phrase).matchAll(RE_DATES)) {
    // Groupes : 1-5 « du J1 [M1] au J2 M2 [A] » ; 6-9 « les J1 et J2 M [A] » ; 10-15 « J1 M1 [A1] et J2 M2 [A2] » ; 16-18 « J M [A] »
    if (x[1] !== undefined) {
      const [, j1, m1, j2, m2, a] = x;
      const mois2 = indexMois(m2), mois1 = m1 ? indexMois(m1) : mois2, an = a && +a;
      if (!an || !dateValide(an, mois2, num(j2)) || !dateValide(an, mois1, num(j1))) continue;
      const debut = iso(an, mois1, num(j1)), fin = iso(an, mois2, num(j2));
      if (fin > debut && joursEntre(debut, fin) <= 14) sortie.push({ debut, fin, texte: x[0] });
    } else if (x[6] !== undefined) {
      const [, , , , , , j1, j2, m, a] = x;
      const mois = indexMois(m), an = a && +a;
      if (!an || !dateValide(an, mois, num(j1)) || !dateValide(an, mois, num(j2))) continue;
      const d1 = iso(an, mois, num(j1)), d2 = iso(an, mois, num(j2));
      if (joursEntre(d1, d2) === 1) sortie.push({ debut: d1, fin: d2, texte: x[0] });
      else { sortie.push({ debut: d1, texte: `${j1} ${m} ${an}` }); sortie.push({ debut: d2, texte: `${j2} ${m} ${an}` }); }
    } else if (x[10] !== undefined) {
      const [, , , , , , , , , , j1, m1, a1, j2, m2, a2] = x;
      const an2 = a2 && +a2, an1 = a1 ? +a1 : an2;
      ajout(an1, indexMois(m1), num(j1), `${j1} ${m1}`);
      ajout(an2, indexMois(m2), num(j2), `${j2} ${m2}`);
    } else {
      const [, , , , , , , , , , , , , , , , j, m, a] = x;
      ajout(a && +a, indexMois(m), num(j), x[0]);
    }
  }
  return sortie;
}

const INCERTAIN = /\b(pourrai(?:t|ent)|envisag\w*|probabl\w*|serai(?:t|ent)|devrai(?:t|ent)|rumeurs?|hypoth\w*|[ée]ventuel\w*|vraisemblabl\w*|au plus t[oô]t|[àa] confirmer|non (?:confirm|fix|d[ée]fini)\w*|pas (?:encore )?(?:confirm|fix|d[ée]fini)\w*|incertain\w*|reste [àa] d[ée]terminer|selon (?:certaines|des) sources)\b/i;

/**
 * Événements d'une page : lit le résumé, repère « premier tour », « second tour » ou un événement unique.
 * Une phrase incertaine est ignorée ; deux dates différentes pour la même case → case ignorée (ambiguë).
 * Renvoie { evenements: [{ libelle, cle, debut, fin?, phrase }], ignores: [raison] }. Pure.
 */
export function extraireEvenementsPage(wikitexte, cfg, aujourdhui) {
  const texte = resumeTexte(wikitexte);
  const phrases = texte.split(/(?<=[.!?])\s+(?=[A-ZÉÈÀÂÎÔÛ«"'(])/);
  const cases = { premier: [], second: [], unique: [] };
  const ignores = [];
  const mots = (cfg.mots || []).map(sansAccent);
  for (const p of phrases) {
    const dates = trouverDates(p);
    if (!dates.length) continue;
    const bas = sansAccent(p);
    if (!mots.some((m) => bas.includes(m))) continue;
    if (INCERTAIN.test(p)) { ignores.push(`phrase incertaine ignorée : « ${p.slice(0, 100)} »`); continue; }
    const aPremier = /premier tour/.test(bas), aSecond = /(second|deuxieme|2e|2nd) tour/.test(bas);
    if (aPremier && aSecond) {
      if (dates.length === 2 && (dates[0].fin || dates[0].debut) < dates[1].debut) { cases.premier.push(dates[0]); cases.second.push(dates[1]); }
      else ignores.push(`dates ambiguës pour les deux tours : « ${p.slice(0, 100)} »`);
    } else if (aPremier) {
      if (dates.length === 1) cases.premier.push(dates[0]); else ignores.push(`plusieurs dates pour le premier tour : « ${p.slice(0, 100)} »`);
    } else if (aSecond) {
      if (dates.length === 1) cases.second.push(dates[0]); else ignores.push(`plusieurs dates pour le second tour : « ${p.slice(0, 100)} »`);
    } else if (cfg.libelles?.unique) {
      if (dates.length === 1) cases.unique.push(dates[0]); else ignores.push(`plusieurs dates pour un événement unique : « ${p.slice(0, 100)} »`);
    }
  }
  const evenements = [];
  for (const [k, liste] of Object.entries(cases)) {
    if (!liste.length || !cfg.libelles?.[k]) continue;
    const distinctes = new Set(liste.map((d) => `${d.debut}|${d.fin || ""}`));
    if (distinctes.size > 1) { ignores.push(`dates contradictoires dans l'article pour « ${cfg.libelles[k]} » : ${[...distinctes].join(" ; ")}`); continue; }
    const d = liste[0];
    if ((d.fin || d.debut) < aujourdhui) { ignores.push(`date passée ignorée : ${cfg.libelles[k]} (${d.debut})`); continue; }
    if (d.debut > ajouterJours(aujourdhui, 800)) { ignores.push(`date trop lointaine ignorée : ${cfg.libelles[k]} (${d.debut})`); continue; }
    evenements.push({ libelle: cfg.libelles[k], cle: `${cfg.type}|${cfg.parti || "-"}|${k}|${d.debut.slice(0, 4)}`, debut: d.debut, ...(d.fin ? { fin: d.fin } : {}) });
  }
  return { evenements, ignores };
}

// ---------------------------------------------------------------------------------------------
// Fabrication des entrées au format de data/meetings.json
// ---------------------------------------------------------------------------------------------

/** Champs d'affichage jour / mois (« 24-25 », « OCT. ») d'après debut/fin. */
export function jourMois(debut, fin) {
  const [, m, j] = debut.split("-").map(Number);
  let jour = String(j);
  if (fin && fin !== debut) { const [, m2, j2] = fin.split("-").map(Number); if (m2 === m) jour = `${j}-${j2}`; }
  return { jour, mois: MOIS_COURT[m - 1] };
}

function entree({ type, cle, sourceId, debut, fin, titre, desc, lieu, parti, partyColor, source, confiance, aujourdhui }) {
  return {
    debut, ...(fin && fin !== debut ? { fin } : {}), ...jourMois(debut, fin), heure: "—", ...(lieu ? { lieu } : {}),
    parti: parti || "", partyColor: partyColor || "#6B7280", titre, desc, source,
    verified: true, confirme: true, origine: "auto", type, cle, sourceId, confiance, vuLe: aujourdhui, absences: 0,
  };
}

/** Entrées issues d'un article Wikipédia (voir extraireEvenementsPage). */
export function evenementsDepuisPage(wikitexte, cfg, aujourdhui) {
  const { evenements, ignores } = extraireEvenementsPage(wikitexte, cfg, aujourdhui);
  const url = `https://fr.wikipedia.org/wiki/${encodeURIComponent(cfg.page.replace(/ /g, "_"))}`;
  return {
    ignores,
    evenements: evenements.map((e) => entree({
      type: cfg.type, cle: e.cle, sourceId: cfg.id, debut: e.debut, fin: e.fin, titre: e.libelle, desc: cfg.desc || "Date relevée dans l'article de référence.",
      lieu: cfg.lieu, parti: cfg.parti, partyColor: cfg.partyColor, source: { nom: "Wikipédia", url }, confiance: "moyenne", aujourdhui,
    })),
  };
}

/** Projets de loi examinés en séance à l'Assemblée à une date lointaine, d'après data/agenda-an.json. Pure. */
export function evenementsDepuisAgendaAN(agenda, aujourdhui, { horizonJours = 14, maximum = 10, partyColor = "#6B7280", lieu = "Assemblée nationale, Paris" } = {}) {
  const parDossier = new Map();
  for (const j of agenda?.jours || []) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(j.date || "")) continue;
    for (const p of j.points || []) {
      if (p.type !== "texte" || !p.dossier || !/^projet de loi/i.test(p.objet || "")) continue;
      const d = parDossier.get(p.dossier) || { dossier: p.dossier, objet: p.objet.trim(), dates: [] };
      d.dates.push(j.date);
      parDossier.set(p.dossier, d);
    }
  }
  const limite = ajouterJours(aujourdhui, horizonJours);
  return [...parDossier.values()]
    .map((d) => ({ ...d, dates: [...new Set(d.dates)].sort() }))
    .filter((d) => d.dates[0] >= limite && d.objet.length >= 15) // les examens plus proches sont déjà listés au jour le jour sur la page
    .sort((a, b) => a.dates[0].localeCompare(b.dates[0]))
    .slice(0, maximum)
    .map((d) => entree({
      type: "examen-loi", cle: `examen-loi|-|${d.dossier}`, sourceId: "agenda-an", debut: d.dates[0], fin: d.dates.length > 1 ? d.dates[d.dates.length - 1] : undefined,
      titre: `Examen à l'Assemblée nationale : ${d.objet.charAt(0).toLowerCase() + d.objet.slice(1)}`,
      desc: "Examen en séance publique d'après l'ordre du jour publié par l'Assemblée nationale ; il peut encore changer.",
      lieu, parti: "", partyColor, source: { nom: "Assemblée nationale (ordre du jour)", url: `https://www.assemblee-nationale.fr/dyn/17/dossiers/${encodeURIComponent(d.dossier)}` },
      confiance: "haute", aujourdhui,
    }));
}

// ---------------------------------------------------------------------------------------------
// Fusion avec data/meetings.json
// ---------------------------------------------------------------------------------------------

export const estAuto = (m) => m?.origine === "auto";

/** Type d'une entrée manuelle, déduit de son titre (sans jamais l'écrire dans le fichier). */
export function typeDe(m) {
  if (m.type) return m.type;
  const t = sansAccent(m.titre || "");
  if (/^election|presidentielle|legislatives|municipales|senatoriales|europeennes|referendum/.test(t)) return "election";
  if (/primaire/.test(t)) return "primaire";
  if (/congres|convention d'investiture|assises/.test(t)) return "congres";
  if (/^(examen|projet de loi|proposition de loi)/.test(t)) return "examen-loi";
  return "meeting";
}

const MOTS_VIDES = new Set(["election", "elections", "francaise", "francais", "parti", "congres", "primaire", "tour", "avec", "pour", "dans", "des", "les", "une", "du", "de", "la", "le", "et", "au", "aux", "en", "d"]);
const mots = (s) => new Set(sansAccent(s).split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !MOTS_VIDES.has(w)));
const rang = (t) => { const b = sansAccent(t); return /premier tour/.test(b) ? 1 : /(second|deuxieme) tour/.test(b) ? 2 : 0; };

/**
 * Deux entrées désignent-elles le même événement ? « doublon » (même type, même parti, mêmes jours ou même tour au même jour),
 * « divergence » (même événement, autre date : à signaler, jamais à ajouter), sinon null. Pure.
 */
export function comparer(a, b) {
  if (typeDe(a) !== typeDe(b) || (a.parti || "") !== (b.parti || "")) return null;
  const memeJour = a.debut === b.debut;
  const fa = a.fin || a.debut, fb = b.fin || b.debut;
  const chevauche = a.debut <= fb && b.debut <= fa;
  if (memeJour || (chevauche && typeDe(a) !== "examen-loi")) {
    if (typeDe(a) === "examen-loi" && a.cle !== b.cle && sansAccent(a.titre) !== sansAccent(b.titre)) return null;
    return "doublon";
  }
  const ra = rang(a.titre), rb = rang(b.titre);
  if (ra !== rb) return null;
  if (typeDe(a) === "examen-loi") return a.cle && a.cle === b.cle ? "divergence" : null;
  const wa = mots(a.titre), wb = mots(b.titre);
  const commun = [...wa].filter((w) => wb.has(w)).length;
  const base = Math.min(wa.size, wb.size);
  if (ra && (typeDe(a) === "election" || typeDe(a) === "primaire") && Math.abs(joursEntre(a.debut, b.debut)) <= 400) return "divergence";
  if (base && commun / base >= 0.6 && Math.abs(joursEntre(a.debut, b.debut)) <= 60) return "divergence";
  return null;
}

/**
 * Fusionne les événements relevés dans la liste existante. Pure (testable).
 *  - `existants` : tableau « meetings » actuel ; les entrées manuelles sont renvoyées telles quelles (mêmes objets) ;
 *  - `releves` : événements candidats (entrées complètes) ; `sourcesLues` : ids des sources effectivement lues avec succès.
 * Renvoie { meetings, ajoutes, mis_a_jour, retires, doublons, divergences, absents }.
 */
export function fusionner(existants, releves, { aujourdhui, sourcesLues = new Set() }) {
  const bilan = { ajoutes: [], misAJour: [], retires: [], doublons: [], divergences: [], absents: [] };
  const manuelles = existants.filter((m) => !estAuto(m));
  const parCle = new Map();
  for (const r of releves) {
    if (r.confirme === false) { bilan.doublons.push(`${r.titre} : non confirmé, ignoré`); continue; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.debut || "") || !r.titre || !r.source?.url) continue;
    const homonyme = [...parCle.values()].find((x) => x.cle !== r.cle && comparer(x, r) === "doublon");
    if (homonyme) { bilan.doublons.push(`${r.titre} (${r.debut}) : déjà relevé sous « ${homonyme.titre} »`); continue; }
    if (!parCle.has(r.cle)) parCle.set(r.cle, r);
  }
  // Une entrée manuelle gagne toujours : doublon -> rien ; autre date pour le même événement -> signalé, rien d'ajouté
  const candidats = new Map();
  for (const [cle, r] of parCle) {
    let refuse = null;
    for (const m of manuelles) {
      const c = comparer(r, m);
      if (c === "doublon") { refuse = `doublon de l'entrée manuelle « ${m.titre} »`; break; }
      if (c === "divergence") { refuse = null; bilan.divergences.push(`${r.titre} : ${r.debut} dans la source, ${m.debut} dans l'entrée manuelle « ${m.titre} » (entrée manuelle conservée, rien ajouté)`); refuse = "divergence"; break; }
    }
    if (refuse) { if (refuse !== "divergence") bilan.doublons.push(`${r.titre} (${r.debut}) : ${refuse}`); continue; }
    candidats.set(cle, r);
  }

  const limitePasse = ajouterJours(aujourdhui, -CONSERVER_PASSE_JOURS);
  const gardees = new Set();
  const meetings = [];
  for (const m of existants) {
    if (!estAuto(m)) { meetings.push(m); continue; }
    const doublonManuel = manuelles.find((x) => comparer(m, x) === "doublon");
    if (doublonManuel) { bilan.retires.push(`${m.titre} : une entrée manuelle équivalente existe désormais`); continue; }
    if ((m.fin || m.debut) < limitePasse) { bilan.retires.push(`${m.titre} : événement passé depuis plus de ${CONSERVER_PASSE_JOURS} jours`); continue; }
    const frais = candidats.get(m.cle);
    if (frais && (m.fin || m.debut) >= aujourdhui) {
      gardees.add(m.cle);
      const maj = { ...frais };
      if (JSON.stringify({ ...m, vuLe: 0 }) !== JSON.stringify({ ...maj, vuLe: 0 })) bilan.misAJour.push(`${m.titre} (${m.debut} → ${maj.debut})`);
      meetings.push(maj);
      continue;
    }
    if (frais) gardees.add(m.cle); // passé : on ne le réécrit pas
    if (frais || !sourcesLues.has(m.sourceId) || m.debut <= aujourdhui) { meetings.push(m); continue; } // vu, source injoignable, ou déjà commencé : inchangé
    const absences = (m.absences || 0) + 1;
    if (absences >= ABSENCES_MAX) { bilan.retires.push(`${m.titre} : absent de la source à ${absences} relevés consécutifs`); continue; }
    bilan.absents.push(`${m.titre} : absent de la source (${absences}/${ABSENCES_MAX})`);
    meetings.push({ ...m, absences });
  }
  const nouveaux = [...candidats.values()].filter((r) => !gardees.has(r.cle) && (r.fin || r.debut) >= aujourdhui)
    .sort((a, b) => a.debut.localeCompare(b.debut) || a.cle.localeCompare(b.cle));
  for (const r of nouveaux) { meetings.push(r); bilan.ajoutes.push(`${r.titre} (${r.debut})`); }
  return { meetings, ...bilan };
}

// ---------------------------------------------------------------------------------------------
// Réseau (ou fixtures)
// ---------------------------------------------------------------------------------------------

/** Contenu wikitexte d'une réponse de l'API Action (prop=revisions, formatversion=2). null si la page n'existe pas. Pure. */
export function lireReponseWikipedia(json) {
  const p = json?.query?.pages?.[0];
  if (!p) throw new Error("réponse de l'API sans « query.pages »");
  if (p.missing) return null;
  const c = p.revisions?.[0]?.slots?.main?.content ?? p.revisions?.[0]?.content;
  if (typeof c !== "string" || !c.trim()) throw new Error(`page « ${p.title} » sans contenu`);
  return c;
}

/** Titre le plus proche parmi les résultats d'une recherche Wikipédia (list=search, formatversion=2) : même année et au moins un mot distinctif du titre cherché. Pure. */
export function choisirTitre(json, titreCherche) {
  const voulu = sansAccent(titreCherche);
  const annee = voulu.match(/\b(19|20)\d{2}\b/)?.[0];
  const mots = voulu.split(/[^a-z0-9]+/).filter((m) => m.length >= 5 && !/^(election|francaise|francais)$/.test(m));
  for (const r of json?.query?.search || []) {
    const t = sansAccent(r.title);
    if (/\b(liste|categorie|portail|modele)\b/.test(t)) continue;
    if (annee && !t.includes(annee)) continue;
    if (mots.length && !mots.some((m) => t.includes(m))) continue;
    return r.title;
  }
  return null;
}

async function lirePage(cfg, dossierFixtures) {
  if (dossierFixtures) {
    const f = path.join(dossierFixtures, `${cfg.id}.json`);
    return lireReponseWikipedia(JSON.parse(await readFile(f, "utf-8").catch(() => { throw new Error(`fixture absente : ${f}`); })));
  }
  const url = `${API}?action=query&prop=revisions&rvprop=content&rvslots=main&redirects=1&format=json&formatversion=2&titles=${encodeURIComponent(cfg.page)}`;
  const res = await fetchPoli(url);
  if (!res.ok) throw new Error(`Wikipédia : HTTP ${res.status} pour « ${cfg.page} »`);
  const contenu = lireReponseWikipedia(await res.json());
  if (contenu !== null) return contenu;
  // Titre exact introuvable : recherche du titre le plus proche (même année, mot distinctif commun)
  const rech = await fetchPoli(`${API}?action=query&list=search&srlimit=6&format=json&formatversion=2&srsearch=${encodeURIComponent(cfg.page)}`);
  if (!rech.ok) return null;
  const titre = choisirTitre(await rech.json(), cfg.page);
  if (!titre) return null;
  log(`${cfg.id} : « ${cfg.page} » introuvable, page voisine retenue : « ${titre} » (à reporter dans data/evenements-sources.json).`);
  const res2 = await fetchPoli(`${API}?action=query&prop=revisions&rvprop=content&rvslots=main&redirects=1&format=json&formatversion=2&titles=${encodeURIComponent(titre)}`);
  if (!res2.ok) throw new Error(`Wikipédia : HTTP ${res2.status} pour « ${titre} »`);
  return lireReponseWikipedia(await res2.json());
}

export async function releverTout({ sources, agenda, aujourdhui, dossierFixtures }) {
  const releves = [], sourcesLues = new Set();
  let echecs = 0;
  for (const cfg of sources.pages || []) {
    try {
      const wiki = await lirePage(cfg, dossierFixtures);
      if (wiki === null) { warn(`« ${cfg.page} » : page introuvable sur Wikipédia (titre à corriger dans data/evenements-sources.json ?) ; rien retiré.`); continue; }
      if (!dossierFixtures && process.env.GITHUB_ACTIONS) log(`${cfg.id} : ${wiki.length} caractères lus ; début du résumé : « ${resumeTexte(wiki).slice(0, 200).replace(/\s+/g, " ")} »`);
      const { evenements, ignores } = evenementsDepuisPage(wiki, cfg, aujourdhui);
      ignores.forEach((i) => log(`${cfg.id} : ${i}`));
      log(`${cfg.id} : ${evenements.length} événement(s) à venir lu(s).`);
      releves.push(...evenements);
      sourcesLues.add(cfg.id);
    } catch (e) {
      echecs++;
      warn(`${cfg.id} : lecture impossible (${e.message}) ; ses entrées sont conservées telles quelles.`);
    }
  }
  if (agenda) {
    const ev = evenementsDepuisAgendaAN(agenda, aujourdhui, sources.examensLoi || {});
    log(`agenda-an : ${ev.length} examen(s) de projet de loi à date lointaine.`);
    releves.push(...ev);
    sourcesLues.add("agenda-an");
  } else warn("data/agenda-an.json absent : examens de projets de loi non relevés ; entrées conservées.");
  return { releves, sourcesLues, echecs };
}

const ARG = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");

async function main() {
  const DRY = process.argv.includes("--dry-run");
  const aujourdhui = ARG("aujourdhui") || new Date().toISOString().slice(0, 10);
  const sources = JSON.parse(await readFile(SOURCES_FILE, "utf-8"));
  const fichier = JSON.parse(await readFile(DATA_FILE, "utf-8"));
  const agenda = JSON.parse(await readFile(AGENDA_FILE, "utf-8").catch(() => "null"));
  const { releves, sourcesLues, echecs } = await releverTout({ sources, agenda, aujourdhui, dossierFixtures: ARG("fixtures") });
  const r = fusionner(fichier.meetings, releves, { aujourdhui, sourcesLues });
  for (const [nom, l] of [["ajouté", r.ajoutes], ["mis à jour", r.misAJour], ["absent", r.absents], ["retiré", r.retires], ["doublon écarté", r.doublons], ["DIVERGENCE", r.divergences]]) l.forEach((x) => (nom === "DIVERGENCE" ? warn : log)(`${nom} : ${x}`));
  const nouveau = { ...fichier, lastUpdated: new Date().toISOString(), meetings: r.meetings };
  const nbAuto = r.meetings.filter(estAuto).length;
  log(`${r.meetings.length - nbAuto} entrée(s) manuelle(s) intacte(s), ${nbAuto} automatique(s).`);
  if (DRY) return log("--dry-run : rien n'est écrit.");
  if (await ecrireGarde(DATA_FILE, nouveau, { nom: "data/meetings.json", liste: (d) => d.meetings, obligatoires: ["debut", "titre", "source"], texte: JSON.stringify(nouveau, null, 2) + "\n" })) log("data/meetings.json à jour.");
  if (echecs) process.exitCode = 1; // une source illisible (réseau, format) : signalé par le workflow, rien n'a été retiré à cause d'elle
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error("[fetch-evenements] ÉCHEC :", e.message); process.exitCode = 1; });
}
