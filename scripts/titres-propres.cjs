/**
 * titres-propres.cjs
 * ------------------
 * Ce que le site ajoute aux titres de presse, pour ne pas faire du simple copier-coller :
 *  - estVideo(url)                    : le lien est une vidéo (page « vidéo » d'un média, YouTube…), pour la signaler ;
 *  - titrePropre(sujet, dossiers)     : un TITRE À NOUS, court et neutre, tiré du recoupement de plusieurs médias
 *                                       (titre du dossier s'il y en a un, sinon l'expression commune à la moitié au moins
 *                                       des titres). Jamais un titre de média : null quand rien de solide ne ressort ;
 *  - contexteSujet(sujet, donnees)    : au plus 2 faits tirés de NOS données officielles (fonction d'une personne citée,
 *                                       dernier sondage, ordre du jour de l'Assemblée) ; jamais d'avis ;
 *  - chiffreSujet(sujet)              : un chiffre repris à l'identique par au moins 2 médias ;
 *  - dateSujet(sujet, maintenant)     : une date à venir annoncée dans les titres (rendez-vous à noter).
 * Fonctions pures (aucune lecture de fichier, aucun réseau) : testées par tests/titres-propres.test.mjs.
 * Elles écrivent des FAITS repérés, pas des interprétations : en cas de doute, elles renvoient null.
 */

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const plat = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’']/g, "'");

/** Lien vidéo : domaines de vidéo, ou page « video-… », « /videos/ », « /replay/ » d'un média. */
function estVideo(url) {
  let u;
  try { u = new URL(url); } catch { return false; }
  const hote = u.hostname.replace(/^www\./, "");
  if (/^(youtube\.com|m\.youtube\.com|youtu\.be|dailymotion\.com|vimeo\.com)$/.test(hote)) return true;
  return /(^|\/)(videos?|replay)([-/]|$)/i.test(u.pathname);
}

const MOTS_VIDES = new Set(("le la les un une des de du d l et en au aux à a ce cet cette ces se sa son ses sur sous par pour dans avec sans qui que quoi dont où ne pas plus est sont " +
  "été être ont il elle ils elles on nous vous leur leurs mais ou donc car si y s qu c n j m t lundi mardi mercredi jeudi vendredi samedi dimanche après avant entre vers chez ça cela " +
  "ceci tout tous toute toutes très encore déjà aussi comme même faire fait peut doit veut voici voilà direct infos info suivez revivez ce qu il faut retenir sera seront être serait").split(" "));
// Mots trop vagues pour faire un titre à eux seuls
const TROP_GENERIQUES = new Set(["presidentielle", "gouvernement", "politique", "france", "francais", "francaise", "premier", "ministre", "president", "election", "elections", "assemblee", "senat", "debat", "journal", "projet", "macron", "loi", "proposition", "texte", "lois", "reforme", "mesures"]);

const nettoyer = (t) => String(t || "")
  .replace(/^(DIRECT|EN DIRECT|Direct|VIDÉO|Vidéo|REPLAY)\s*[.:]\s*/, "")
  .replace(/^[A-ZÉÈ][\p{L}0-9 ’'-]{2,28}\.\s+/u, "") // « Présidentielle 2027. », « Social. »
  .replace(/\s[|–—]\s[^|–—]{2,40}$/, "") // « … — Le Monde »
  .replace(/\s+/g, " ").trim();
const clauses = (t) => nettoyer(t).split(/[,;:.!?…«»"“”()—–]+| - /).map((c) => c.trim()).filter(Boolean);
const motsDe = (c) => c.match(/[\p{L}0-9]+(?:-[\p{L}0-9]+)*/gu) || [];
const estMotVide = (m) => MOTS_VIDES.has(plat(m));

/** Titre à nous : null si rien de solide. Les dossiers (data/actualites.json) ont déjà un titre éditorial. */
function titrePropre(sujet, dossiers = []) {
  const articles = sujet?.articles || [];
  if (!articles.length) return null;
  const urls = new Set(articles.map((a) => a.url));
  const dossier = (dossiers || []).find((d) => d?.titre && (d.articles || []).some((a) => urls.has(a.url)));
  if (dossier) return { titre: dossier.titre, origine: "dossier" };

  const medias = new Set(articles.map((a) => a.media)).size;
  if (medias < 2) return null; // un seul média : rien à recouper
  const N = articles.length, df = new Map();
  const interdits = new Set([
    ...(sujet.illustration?.personnes || []).flatMap((p) => plat(p.nom).split(/[\s-]+/)),
    ...articles.map((a) => plat(a.media)),
  ]);
  for (const a of articles) {
    const vus = new Set();
    for (const c of clauses(a.titre)) {
      const w = motsDe(c);
      for (let n = 1; n <= 5; n++) for (let i = 0; i + n <= w.length; i++) {
        const g = w.slice(i, i + n);
        if (estMotVide(g[0]) || estMotVide(g[n - 1])) continue;
        const cle = g.map(plat).join(" ");
        if (vus.has(cle)) continue;
        vus.add(cle);
        const e = df.get(cle) || { n: 0, texte: g.join(" "), len: n, cle };
        e.n++;
        df.set(cle, e);
      }
    }
  }
  const seuil = Math.max(2, Math.ceil(N * 0.5));
  const bons = [...df.values()].filter((e) => {
    if (e.n < seuil) return false;
    const m = e.cle.split(" ");
    if (m.every((x) => TROP_GENERIQUES.has(x) || interdits.has(x) || MOTS_VIDES.has(x))) return false;
    if (/\d/.test(e.cle) || m.some((x) => MOIS.map(plat).includes(x))) return false; // pas de chiffre ni de date dans un titre
    if (e.len === 1 && e.texte.length < 8) return false;
    return e.texte.length >= 8 && e.texte.length <= 64;
  }).sort((a, b) => b.n - a.n || b.len - a.len);
  if (!bons.length) return null;
  const meilleur = bons[0];
  // L'expression doit vraiment résumer : elle couvre au moins 2 mots, ou un mot long repris par la moitié des titres
  if (meilleur.len < 2 && meilleur.texte.length < 9) return null;
  return { titre: meilleur.texte.charAt(0).toUpperCase() + meilleur.texte.slice(1), origine: "recoupement" };
}

const dateFr = (iso) => { const [y, m, j] = iso.split("-").map(Number); return `${j === 1 ? "1er" : j} ${MOIS[m - 1]}${y ? "" : ""}`; };

/** Fonction publique d'une personne nommée : gouvernement, dirigeant de parti, député (données du site). */
function fonctionDe(nom, donnees) {
  const n = plat(nom);
  const m = (donnees.gouvernement?.membres || []).find((x) => plat(x.nom) === n);
  if (m) return { texte: `${nom} : ${m.fonction.charAt(0).toLowerCase()}${m.fonction.slice(1)}`, source: "Assemblée nationale (mandats du Gouvernement)" };
  const d = (donnees.dirigeants?.dirigeants || []).find((x) => plat(x.nom) === n);
  if (d) return { texte: `${nom} : ${d.role.charAt(0).toLowerCase()}${d.role.slice(1)}`.replace(/ \(.*$/, ""), source: d.source?.nom || "site du parti" };
  const dep = (donnees.deputes?.deputes || []).find((x) => plat(x.nom) === n);
  if (dep) return { texte: `${nom} : ${dep.f ? "députée" : "député"} ${dep.groupe} (${dep.dep})`, source: "Assemblée nationale (open data)" };
  return null;
}

function enReserve(maintenant, tours) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(maintenant).map((x) => [x.type, x.value]));
  const paris = `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  return (tours || []).some((tour) => {
    const veille = new Date(Date.parse(tour + "T12:00:00Z") - 864e5).toISOString().slice(0, 10);
    return paris >= `${veille}T00:00` && paris < `${tour}T20:00`;
  });
}

/** Au plus 2 faits tirés de nos données. donnees : { gouvernement, dirigeants, deputes, sondages, agenda, tours } ; jamais d'avis. */
function contexteSujet(sujet, donnees = {}, maintenant = new Date()) {
  const sortie = [];
  const personnes = (sujet.illustration?.personnes || []).slice(0, 3);

  // 1. Dernier sondage : seulement hors réserve, pour une personne citée qui y figure
  const inst = donnees.sondages?.instituts?.[0];
  if (inst && personnes.length && sujet.illustration?.theme === "election" && !enReserve(maintenant, donnees.tours)) {
    const fr = (n) => String(n).replace(".", ",");
    const l = personnes.map((p) => [p.nom, inst.scores?.[p.nom]]).filter(([, r]) => Array.isArray(r))
      .map(([nom, r]) => `${nom.split(" ").slice(-1)[0]} ${r[0] === r[1] ? fr(r[0]) : `${fr(r[0])}–${fr(r[1])}`} %`);
    if (l.length) sortie.push({ type: "sondage", texte: `Dernier sondage ${inst.nom} (${inst.date}) : ${l.join(", ")}`, source: `Commission des sondages (notice ${inst.nom})` });
  }
  // 2. Fonction des personnes citées
  const fonctions = personnes.map((p) => fonctionDe(p.nom, donnees)).filter(Boolean);
  if (fonctions.length) sortie.push({ type: "personnes", texte: fonctions.slice(0, 2).map((f) => f.texte).join(" · "), source: fonctions[0].source });
  // 3. Ordre du jour de l'Assemblée : au moins 2 mots rares en commun avec le titre propre
  const titre = sujet.titrePropre?.titre || sujet.titrePropre;
  if (titre && donnees.agenda?.jours) {
    const mots = new Set(motsDe(plat(titre)).filter((m) => m.length >= 6 && !MOTS_VIDES.has(m) && !TROP_GENERIQUES.has(m)));
    if (mots.size >= 2) {
      for (const j of donnees.agenda.jours) {
        if (j.date < maintenant.toISOString().slice(0, 10)) continue;
        const p = (j.points || []).find((pt) => { const o = new Set(motsDe(plat(pt.objet))); return [...mots].filter((m) => o.has(m)).length >= Math.min(2, mots.size); });
        if (p) { sortie.push({ type: "agenda", texte: `À l'ordre du jour de l'Assemblée le ${dateFr(j.date)}`, source: "Assemblée nationale (agenda officiel)" }); break; }
      }
    }
  }
  return sortie.slice(0, 2);
}

const UNITES = /^(établissements?|lycées?|lycéens|écoles?|communes?|villes?|départements?|députés?|sénateurs?|élus?|voix|manifestants?|personnes|habitants|emplois|postes|salariés|fonctionnaires|policiers|gendarmes|enseignants|candidats?|médias|jours?|mois|ans|%|pour cent|milliards?|millions?|euros|€|points?)$/i;
/** Un chiffre repris à l'identique par au moins 2 médias : { valeur: "400 à 500", unite: "lycées" } ou null. */
function chiffreSujet(sujet) {
  const compte = new Map();
  for (const a of sujet.articles || []) {
    const t = nettoyer(a.titre).replace(/ /g, " ");
    const vus = new Set();
    for (const m of t.matchAll(/(\d{1,3}(?:[  .]\d{3})*(?:,\d+)?|\d+(?:,\d+)?)(?:\s*(?:à|-|–)\s*(\d{1,3}(?:[  .]\d{3})*(?:,\d+)?|\d+(?:,\d+)?))?\s*(%|€|[\p{L}'’-]+(?:\s+d[’']euros)?)/gu)) {
      const unite = m[3];
      if (!UNITES.test(unite.replace(/\s+d['’]euros/i, "")) && !/^(milliards?|millions?)/i.test(unite)) continue;
      const valeur = m[2] ? `${m[1]} à ${m[2]}` : m[1];
      const cle = plat(valeur);
      if (vus.has(cle)) continue;
      vus.add(cle);
      const e = compte.get(cle) || { valeur, unites: new Map(), medias: new Set() };
      e.unites.set(unite.toLowerCase(), (e.unites.get(unite.toLowerCase()) || 0) + 1);
      e.medias.add(a.media);
      compte.set(cle, e);
    }
  }
  const bons = [...compte.values()].filter((e) => e.medias.size >= 2).sort((a, b) => b.medias.size - a.medias.size);
  return bons[0] ? { valeur: bons[0].valeur, unite: [...bons[0].unites].sort((x, y) => y[1] - x[1])[0][0] } : null;
}

/** Date à venir annoncée dans les titres (dans les 90 jours) : { iso, texte } ou null. */
function dateSujet(sujet, maintenant = new Date()) {
  const aujourdhui = maintenant.toISOString().slice(0, 10);
  const limite = new Date(maintenant.getTime() + 90 * 864e5).toISOString().slice(0, 10);
  const trouvees = new Map();
  for (const a of sujet.articles || []) {
    const t = nettoyer(a.titre);
    for (const m of t.matchAll(/\b(?:le|dès le|jusqu['’]au|du|au)\s+(1er|\d{1,2})\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\b/giu)) {
      const mois = MOIS.map(plat).indexOf(plat(m[2])) + 1;
      const jour = m[1] === "1er" ? 1 : Number(m[1]);
      let an = maintenant.getUTCFullYear();
      let iso = `${an}-${String(mois).padStart(2, "0")}-${String(jour).padStart(2, "0")}`;
      if (iso < aujourdhui) { an++; iso = `${an}-${String(mois).padStart(2, "0")}-${String(jour).padStart(2, "0")}`; }
      if (iso < aujourdhui || iso > limite) continue;
      const e = trouvees.get(iso) || { iso, jour, mois: MOIS[mois - 1], medias: new Set() };
      e.medias.add(a.media);
      trouvees.set(iso, e);
    }
  }
  const e = [...trouvees.values()].sort((a, b) => b.medias.size - a.medias.size || a.iso.localeCompare(b.iso))[0];
  return e ? { iso: e.iso, jour: e.jour, mois: e.mois } : null;
}

module.exports = { estVideo, titrePropre, contexteSujet, chiffreSujet, dateSujet, fonctionDe, enReserve, nettoyer };
