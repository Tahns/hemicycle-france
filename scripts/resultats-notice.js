/**
 * resultats-notice.js
 * -------------------
 * Résultats d'un sondage lus dans la NOTICE PDF déposée à la Commission des sondages (le rapport complet de l'institut),
 * pour ne pas attendre que Wikipédia ait recopié l'enquête (data/sondages.json ne vient sinon que de Wikipédia).
 *
 * Contenu :
 *  - extraireResultats(textesParPage, options) : fonction PURE. Lit les pages « Intention de vote au 1er tour … Hypothèse … »
 *    et « Intention de vote au 2nd tour … Hypothèse X et Y » ; associe nombres et noms DANS L'ORDRE de la page.
 *    Rien n'est accepté sans contrôle : autant de nombres que de noms, somme entre 98 et 102 au premier tour, égale à 100 au
 *    second, chaque candidat de l'intitulé de l'hypothèse présent dans la liste, nombre d'hypothèses égal à celui du récapitulatif.
 *    Au moindre doute : null (rien n'est publié) et la raison est donnée à `journal`.
 *  - construireEntrees(), fusionnerNotices() : entrées au format exact de data/sondages.json (marquées `origine: "notice"`) et
 *    fusion avec la version Wikipédia (Wikipédia prime quand elle a la même enquête : même institut, même fin de terrain).
 *  - ouvrirPdf(), textePages() : lecture de TOUTES les pages d'un PDF (pdfjs-dist, installé par le workflow de la veille).
 *  - periodeReserve() : réserve électorale (loi n° 77-808 du 19 juillet 1977, art. 11).
 */

export const ORIGINE_NOTICE = "notice";

/** Sans accents, minuscules, espaces et tirets normalisés : clé de comparaison de deux noms. */
export const plat = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’']/g, "'").replace(/\s*-\s*/g, "-").replace(/\s+/g, " ").trim();
/** Clé d'un institut (« Harris » et « Harris Interactive » désignent le même). */
export const cleInstitut = (nom) => plat(nom).replace(/[^a-z0-9]/g, "");
const memeInstitut = (a, b) => { const x = cleInstitut(a), y = cleInstitut(b); return Boolean(x && y) && (x === y || x.startsWith(y) || y.startsWith(x)); };

/** Texte brut d'une page PDF -> texte régulier (« 1 er » -> « 1er », « Jean - Luc » -> « Jean-Luc », « , » collées). */
export function normaliserTexte(t) {
  return String(t ?? "").replace(/\s+/g, " ")
    .replace(/(\d) (er|nd|e)\b/g, "$1$2")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+,/g, ",")
    .replace(/,(?=\S)/g, ", ")
    .replace(/ ([’'])/g, "$1")
    .trim();
}

/** Dictionnaire { clé plate -> nom canonique } des candidats connus (les mentions « (homme politique) » sont ignorées). */
function dictionnaire(candidats) {
  const dico = new Map();
  for (const nom of candidats || []) {
    const propre = String(nom).replace(/\s*\([^)]*\)\s*$/, "").trim();
    const k = plat(propre);
    if (!k) continue;
    if (!dico.has(k) || propre === nom) dico.set(k, propre);
  }
  return dico;
}

/**
 * Lit, dans la partie « noms » d'une page, la suite de candidats connus. Renvoie { noms, reste } (reste = texte plat après la liste).
 */
function lireNoms(texte, dico) {
  const cles = [...dico.keys()].sort((a, b) => b.length - a.length);
  let reste = plat(texte);
  const noms = [];
  for (;;) {
    const k = cles.find((c) => reste.startsWith(c) && (reste.length === c.length || reste[c.length] === " "));
    if (!k) break;
    noms.push(dico.get(k));
    reste = reste.slice(k.length).trimStart();
  }
  return { noms, reste };
}

const RE_PAGE = /Intention de vote au (1er|2nd) tour de l[’']élection présidentielle Hypoth[èe]se (.*)$/;
// Suite d'au moins 2 nombres entiers, suivie d'un mot qui commence par une majuscule (le premier nom de la liste)
const RE_NOMBRES = /(?:^|[^\d,.])((?:\d{1,3} ){1,}\d{1,3}) (?=\p{Lu})/gu;

/**
 * Nombres et noms d'une page de résultats. Renvoie { nombres, noms, intitule } ou { erreur }.
 */
function lirePage(texte, dico, attendu) {
  const m = RE_PAGE.exec(texte);
  const apres = m[2];
  // Intitulé de l'hypothèse : jusqu'au « Rappel », aux « Intentions de vote » ou au premier nombre de la suite de résultats
  const finIntitule = apres.search(/ Rappel\b| Intentions de vote\b| Base\b| \d{1,3} \d{1,3} /);
  const intitule = (finIntitule >= 0 ? apres.slice(0, finIntitule) : apres).trim();
  const essais = [];
  for (const r of apres.matchAll(RE_NOMBRES)) {
    const nombres = r[1].split(" ").map(Number);
    const debutNoms = r.index + r[0].length;
    const { noms, reste } = lireNoms(apres.slice(debutNoms), dico);
    if (noms.length >= 2) essais.push({ nombres, noms, reste });
  }
  if (!essais.length) return { erreur: "aucune suite « nombres puis noms de candidats connus » trouvée (candidat inconnu ou page autrement mise en forme)" };
  // La bonne suite est celle dont le nombre de nombres égale le nombre de noms
  const bon = essais.find((e) => e.nombres.length === e.noms.length) || essais[0];
  if (bon.nombres.length !== bon.noms.length) return { erreur: `${bon.nombres.length} nombre(s) pour ${bon.noms.length} nom(s)` };
  if (!/^(intentions de vote|base|rappel|$)/.test(bon.reste)) return { erreur: `texte inattendu après la liste des noms (« ${bon.reste.slice(0, 40)} ») : nom de candidat inconnu ?` };
  if (new Set(bon.noms).size !== bon.noms.length) return { erreur: "nom en double dans la liste" };
  return { nombres: bon.nombres, noms: bon.noms, intitule };
}

const somme = (a) => a.reduce((s, x) => s + x, 0);

/** Candidats nommés dans l'intitulé d'une hypothèse (« A, B et C »), dans le dictionnaire ; null si l'un est inconnu. */
function candidatsDeLIntitule(intitule, dico) {
  const parts = intitule.split(/,| et /).map((x) => plat(x)).filter(Boolean);
  const noms = parts.map((p) => dico.get(p));
  return noms.length && noms.every(Boolean) ? noms : null;
}

const libelleDe = (noms) => (noms.length > 1 ? `${noms.slice(0, -1).join(", ")} et ${noms.at(-1)}` : noms[0]);

/**
 * Résultats d'une notice. `textesParPage` : tableau des textes de page (tel que sorti de pdfjs, un élément par page).
 * options : { candidats: [noms connus, ex. clés de data/sondages.json « candidats »], journal: (message) => void }.
 * Renvoie { hypotheses1T: [{ label, scores: { nom: pct } }], hypotheses2T: [{ candidats: [a, b], scores: { a: pct, b: pct } }] }
 * ou null (aucun chiffre douteux n'est jamais renvoyé : une seule page refusée suffit à tout refuser).
 */
export function extraireResultats(textesParPage, { candidats = [], journal = () => {} } = {}) {
  const dico = dictionnaire(candidats);
  const refus = (msg) => { journal(`résultats de la notice refusés : ${msg}`); return null; };
  if (!Array.isArray(textesParPage) || !textesParPage.length) return refus("aucune page");
  if (!dico.size) return refus("liste des candidats connus vide");
  const pages = textesParPage.map(normaliserTexte);
  const hypotheses1T = [], hypotheses2T = [];
  let recap1 = null, recap2 = null;

  for (const [i, t] of pages.entries()) {
    const n = i + 1;
    const r = /Récapitulatif\s*[–-]\s*Intentions de vote pour le (1er|2nd) tour/.exec(t);
    if (r) { const nb = (t.match(/Hypoth[èe]se /g) || []).length; if (r[1] === "1er") recap1 = nb; else recap2 = nb; }

    const m = RE_PAGE.exec(t);
    if (!m) continue;
    const tour = m[1];
    const lu = lirePage(t, dico, tour);
    if (lu.erreur) return refus(`page ${n} (${tour} tour) : ${lu.erreur}`);
    const total = somme(lu.nombres);
    const citees = candidatsDeLIntitule(lu.intitule, dico);
    if (!citees) return refus(`page ${n} : intitulé d'hypothèse non reconnu (« ${lu.intitule.slice(0, 60)} »)`);
    if (!citees.every((c) => lu.noms.includes(c))) return refus(`page ${n} : un candidat de l'intitulé est absent de la liste des résultats`);
    if (lu.nombres.some((x) => x > 80)) return refus(`page ${n} : score supérieur à 80 %`);
    const scores = Object.fromEntries(lu.noms.map((nom, k) => [nom, lu.nombres[k]]));
    if (tour === "1er") {
      if (total < 98 || total > 102) return refus(`page ${n} : somme des scores = ${total} (attendu 98 à 102)`);
      if (lu.noms.length < 5) return refus(`page ${n} : seulement ${lu.noms.length} candidats lus au premier tour`);
      const label = libelleDe(citees);
      if (hypotheses1T.some((h) => h.label === label)) return refus(`page ${n} : hypothèse « ${label} » lue deux fois`);
      hypotheses1T.push({ label, scores });
    } else {
      if (lu.noms.length !== 2) return refus(`page ${n} : ${lu.noms.length} candidats au second tour (attendu 2)`);
      if (total !== 100) return refus(`page ${n} : somme des scores = ${total} (attendu 100)`);
      if (citees.length !== 2 || !citees.every((c) => lu.noms.includes(c))) return refus(`page ${n} : l'intitulé ne désigne pas les deux candidats lus`);
      const noms = [...lu.noms].sort();
      if (hypotheses2T.some((h) => h.candidats.join("|") === noms.join("|"))) return refus(`page ${n} : duel lu deux fois`);
      hypotheses2T.push({ candidats: noms, scores: Object.fromEntries(noms.map((x) => [x, scores[x]])) });
    }
  }

  if (!hypotheses1T.length) return refus("aucune page d'intentions de vote au premier tour reconnue");
  // Complétude : autant d'hypothèses lues que le récapitulatif de l'institut en annonce (sinon une fourchette min-max serait fausse)
  if (recap1 !== null && recap1 !== hypotheses1T.length) return refus(`${hypotheses1T.length} hypothèse(s) de premier tour lue(s) pour ${recap1} au récapitulatif`);
  if (recap2 !== null && recap2 !== hypotheses2T.length) return refus(`${hypotheses2T.length} duel(s) de second tour lu(s) pour ${recap2} au récapitulatif`);
  return { hypotheses1T, hypotheses2T };
}

// ---------- Dates ----------

const MOIS_NOMS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const jourTxt = (j) => (j === 1 ? "1er" : String(j));
/** Date de terrain en lettres, comme sur Wikipédia : « 5-8 octobre 2026 », « 29 août-1er septembre 2026 », « 8 octobre 2026 ». */
export function dateEnLettres(debut, fin) {
  const [ad, md, jd] = String(debut || fin).split("-").map(Number), [af, mf, jf] = String(fin).split("-").map(Number);
  if (debut === fin || !debut) return `${jourTxt(jf)} ${MOIS_NOMS[mf - 1]} ${af}`;
  if (ad === af && md === mf) return `${jd}-${jourTxt(jf)} ${MOIS_NOMS[mf - 1]} ${af}`;
  if (ad === af) return `${jourTxt(jd)} ${MOIS_NOMS[md - 1]}-${jourTxt(jf)} ${MOIS_NOMS[mf - 1]} ${af}`;
  return `${jourTxt(jd)} ${MOIS_NOMS[md - 1]} ${ad}-${jourTxt(jf)} ${MOIS_NOMS[mf - 1]} ${af}`;
}

// ---------- Entrées au format de data/sondages.json ----------

/**
 * Entrées (premier tour, historique, duels) d'une enquête de la veille.
 * enquete : { institut, terrain: { debut, fin }, echantillon, url } ; resultats : sortie de extraireResultats().
 */
export function construireEntrees(enquete, resultats) {
  const fourchettes = {};
  for (const h of resultats.hypotheses1T) for (const [nom, v] of Object.entries(h.scores)) {
    fourchettes[nom] = fourchettes[nom] ? [Math.min(fourchettes[nom][0], v), Math.max(fourchettes[nom][1], v)] : [v, v];
  }
  const dateFin = enquete.terrain.fin;
  return {
    institut: {
      nom: enquete.institut, date: dateEnLettres(enquete.terrain.debut, dateFin), dateFin, echantillon: enquete.echantillon,
      hypotheses: resultats.hypotheses1T.length, url: enquete.url, origine: ORIGINE_NOTICE, scores: fourchettes,
    },
    historique: { institut: enquete.institut, dateFin, echantillon: enquete.echantillon, origine: ORIGINE_NOTICE, scores: fourchettes },
    duels: resultats.hypotheses2T.map((h) => ({
      candidats: h.candidats,
      entree: { nom: enquete.institut, date: dateEnLettres(enquete.terrain.debut, dateFin), dateFin, echantillon: enquete.echantillon, url: enquete.url, origine: ORIGINE_NOTICE, scores: h.scores },
    })),
  };
}

/** Regroupe plusieurs sorties de construireEntrees() dans la forme attendue par fusionnerNotices(). */
export function regrouperEntrees(construites) {
  return { instituts: construites.map((c) => c.institut), historique: construites.map((c) => c.historique), duels: construites.flatMap((c) => c.duels) };
}

/** Entrées d'origine « notice » déjà présentes dans un data/sondages.json (à conserver quand le fichier est reconstruit depuis Wikipédia). */
export function entreesDeNotice(sondages, { depuis = null } = {}) {
  const garde = (e) => e?.origine === ORIGINE_NOTICE && (!depuis || e.dateFin >= depuis);
  return {
    instituts: (sondages?.instituts || []).filter(garde),
    historique: (sondages?.historique || []).filter(garde),
    duels: (sondages?.secondTour || []).flatMap((d) => (d.instituts || []).filter(garde).map((entree) => ({ candidats: d.candidats, entree }))),
  };
}

const cle2T = (c) => [...c].sort().join(" / ");

/**
 * Fusionne des entrées « notice » dans un data/sondages.json (objet, non modifié : une copie est renvoyée).
 * `entrees` : { instituts: [entrée], historique: [entrée], duels: [{ candidats, entree }] }.
 * Règle : si `base` contient la même enquête issue d'ailleurs (même institut, fin de terrain égale ou plus récente, entrée sans
 * origine « notice », donc Wikipédia), Wikipédia prime et l'entrée de la notice est ignorée ; sinon l'entrée de la notice est ajoutée
 * (elle remplace, pour cet institut, une enquête plus ancienne ou la même déjà issue d'une notice). Idempotent.
 * Renvoie { sondages, ajoutees: [libellés] }.
 */
export function fusionnerNotices(base, entrees) {
  const s = JSON.parse(JSON.stringify(base));
  s.instituts = s.instituts || [];
  s.historique = s.historique || [];
  s.candidats = s.candidats || {};
  const ajoutees = [];
  const parDate = (a, b) => a.dateFin.localeCompare(b.dateFin);
  const wikiPrime = (liste, e) => liste.some((x) => x.origine !== ORIGINE_NOTICE && memeInstitut(x.nom ?? x.institut, e.nom ?? e.institut) && x.dateFin >= e.dateFin);
  const noter = (scores) => { for (const nom of Object.keys(scores)) if (!(nom in s.candidats)) s.candidats[nom] = null; };

  for (const e of [...(entrees.instituts || [])].sort(parDate)) {
    if (wikiPrime(s.instituts, e)) continue;
    // Une enquête de notice plus récente déjà présente pour cet institut reste
    if (s.instituts.some((x) => x.origine === ORIGINE_NOTICE && memeInstitut(x.nom, e.nom) && x.dateFin > e.dateFin)) continue;
    s.instituts = s.instituts.filter((x) => !(memeInstitut(x.nom, e.nom) && x.dateFin <= e.dateFin));
    s.instituts.push(e);
    noter(e.scores);
    ajoutees.push(`${e.nom} ${e.dateFin}`);
  }
  s.instituts.sort((a, b) => b.dateFin.localeCompare(a.dateFin));

  for (const h of [...(entrees.historique || [])].sort(parDate)) {
    if (s.historique.some((x) => x.origine !== ORIGINE_NOTICE && memeInstitut(x.institut, h.institut) && x.dateFin === h.dateFin)) continue;
    s.historique = s.historique.filter((x) => !(x.origine === ORIGINE_NOTICE && memeInstitut(x.institut, h.institut) && x.dateFin === h.dateFin));
    s.historique.push(h);
    noter(h.scores);
  }
  s.historique = s.historique.map((x, i) => [x, i]).sort(([a, i], [b, j]) => a.dateFin.localeCompare(b.dateFin) || i - j).map(([x]) => x);

  if (entrees.duels?.length) {
    s.secondTour = s.secondTour || [];
    for (const { candidats, entree: e } of [...entrees.duels].sort((a, b) => parDate(a.entree, b.entree))) {
      const noms = [...candidats].sort();
      let duel = s.secondTour.find((d) => cle2T(d.candidats) === cle2T(noms));
      if (!duel) { duel = { candidats: noms, instituts: [] }; s.secondTour.push(duel); }
      if (wikiPrime(duel.instituts, e)) continue;
      if (duel.instituts.some((x) => x.origine === ORIGINE_NOTICE && memeInstitut(x.nom, e.nom) && x.dateFin > e.dateFin)) continue;
      duel.instituts = duel.instituts.filter((x) => !(memeInstitut(x.nom, e.nom) && x.dateFin <= e.dateFin));
      duel.instituts.push(e);
      noter(e.scores);
      ajoutees.push(`${e.nom} ${e.dateFin} (${noms.join(" / ")})`);
    }
    for (const d of s.secondTour) d.instituts.sort((a, b) => b.dateFin.localeCompare(a.dateFin));
    s.secondTour = s.secondTour.filter((d) => d.instituts.length)
      .sort((a, b) => b.instituts.length - a.instituts.length || b.instituts[0].dateFin.localeCompare(a.instituts[0].dateFin));
  }
  return { sondages: s, ajoutees };
}

// ---------- Réserve électorale ----------

// Loi n° 77-808 du 19 juillet 1977, art. 11 : aucun sondage publié la veille et le jour de chaque tour
// (présidentielle : du samedi 0 h au dimanche 20 h, heure de Paris).
export const TOURS_PRESIDENTIELLE = ["2027-04-18", "2027-05-02"];
/** Tour concerné (« AAAA-MM-JJ ») si `maintenant` tombe dans la réserve électorale, sinon null. */
export function periodeReserve(maintenant = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(maintenant)
      .map((x) => [x.type, x.value])
  );
  const paris = `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  return TOURS_PRESIDENTIELLE.find((tour) => {
    const veille = new Date(Date.parse(tour + "T12:00:00Z") - 864e5).toISOString().slice(0, 10);
    return paris >= `${veille}T00:00` && paris < `${tour}T20:00`;
  }) || null;
}

// ---------- Lecture du PDF (pdfjs-dist, installé par le workflow) ----------

/** Télécharge un PDF (redirections suivies) et l'ouvre. Renvoie { doc, urlFinale }. */
export async function ouvrirPdf(url, fetchPoli, headers = {}) {
  const res = await fetchPoli(url, { headers, redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await getDocument({ data: new Uint8Array(await res.arrayBuffer()), useSystemFonts: true, verbosity: 0 }).promise;
  return { doc, urlFinale: res.url || url };
}
/** Textes bruts des pages `de` à `a` (incluses, 1 = première page), un élément par page. */
export async function textePages(doc, de = 1, a = doc.numPages) {
  const out = [];
  for (let i = de; i <= Math.min(a, doc.numPages); i++) out.push((await (await doc.getPage(i)).getTextContent()).items.map((x) => x.str).join(" "));
  return out;
}
