#!/usr/bin/env node
/**
 * contenus-auto.cjs
 * -----------------
 * CONTENUS RÉCURRENTS Instagram, 100 % automatiques, tirés de NOS données (jamais de presse tierce, jamais d'avis, sources officielles citées).
 * Ils s'ajoutent à la file data/instagram-file.json (même file, mêmes images instagram/auto/, même registre que stories-auto.cjs) ;
 * scripts/publier-stories.cjs les publie AUX HEURES UTILES (champ « pasAvant » de chaque entrée). Ce script ne publie rien et n'appelle pas Instagram.
 *
 * TYPES (champ « contenu » de l'entrée de file) :
 *  - aujourdhui       story  « Aujourd'hui à l'Assemblée » : ordre du jour de la séance du jour (data/agenda-an.json : textes, votes solennels, QAG), chaque jour de séance, vers 8 h 30 ;
 *  - vote-jour        story  « Le vote du jour » : le scrutin public le plus important de la veille (data/lois.json : motion de censure, article, amendement du Gouvernement),
 *                            résultat officiel et voix ; JAMAIS un vote final de loi (ils restent des POSTS, stories-auto.cjs), vers 12 h 30 ;
 *  - comprendre       story  « Comprendre » : une notion de la rubrique Comprendre d'index.html (10 notions), une par semaine, en rotation sans répétition avant épuisement ;
 *  - chiffre-jour     story  « Le chiffre du jour » : une donnée officielle (data/indicateurs.json, data/budget.json) ou le dernier sondage HORS réserve électorale,
 *                            avec sa source et sa date ; pas plus d'une fois par semaine pour une même donnée, vers 19 h ;
 *  - carrousel-loi    POST carrousel « une loi expliquée en 5 images » : loi adoptée ou rejetée (vote final), contexte, texte, vote, suites, sources ;
 *  - carrousel-hebdo  POST carrousel « Ce qu'il faut retenir cette semaine » : le dimanche, d'après data/digest/AAAA-Wss.json (scripts/digest-hebdo.js).
 *
 * RÈGLES (toutes obligatoires) :
 *  - un contenu = une période (jour ou semaine) = UNE seule fois : id stable (empreinte du type et de la période), registre des faits data/contenus-etat.json,
 *    file, brouillons et registre des publications data/instagram-publiees.json consultés avant toute création ;
 *  - RÉSERVE ÉLECTORALE : aucun sondage (« chiffre du jour » sondage, diapo sondage du carrousel) tant que reserveSondages() est vraie ; ces entrées portent « reserve: true »
 *    (retirées de la file par stories-auto.cjs et ignorées par le publieur pendant la réserve) ;
 *  - mots à risque (motExclu de stories-auto.cjs) : un point d'agenda, un titre de vote ou un texte à mot prudent est ÉCARTÉ (jamais publié) ;
 *  - créneaux : data/stories-config.json, « creneaux » ; toujours entre 7 h et 22 h 30 (Paris), 60 min d'écart entre deux contenus du même jour ;
 *  - configuration : validationHumaine => brouillons (instagram/brouillons/) au lieu de la file ; monétisation + personne nommée => brouillon (comme stories-auto.cjs) ;
 *    "contenusAuto": false => rien n'est produit ;
 *  - jamais plus de 2 posts (images de fil, carrousels compris) par jour.
 *
 * USAGE : node scripts/contenus-auto.cjs            produit les contenus dus (nécessite « playwright » et Chromium)
 *         node scripts/contenus-auto.cjs --a-faire  dit seulement s'il y a un contenu à produire (a_faire=true|false), sans navigateur
 *         node scripts/contenus-auto.cjs --apercus  dessine un exemple de chaque type dans instagram/modeles/ (d'après tests/fixtures/contenus.json)
 * Variables facultatives : SITE_URL, GITHUB_REPOSITORY, CHROMIUM_PATH, CONTENUS_MAINTENANT (ISO, pour essais).
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const SA = require("./stories-auto.cjs");
const SC = require("./sondage-commanditaire.cjs"); // commanditaire d'un sondage : mention obligatoire (loi du 19 juillet 1977, art. 2)
const { simplifierTexteLoi, simplifierJargon, etapeSimple, natureSimple } = require("./titres-propres.cjs"); // textes affichés en mots simples (FALC : lecteur de 12-14 ans sans culture politique)
const { OFF, motExclu, reserveStory, jourParis, dimensionsJpeg, imageValide, lireConfig, destination, fluxAtom, ficheLoi, decomposerTitreVote } = SA;

const RACINE = path.resolve(__dirname, "..");
const COMPTE = "@hemicyclefrance";
const { hashtags: hashtagsLegende } = require("./legendes.cjs");
const RE_VOTE_FINAL = /^(?:sur )?l['’]ensemble (du|de la) (projet|proposition) de loi\b/i;
const MAX_OCTETS = 8 * 1024 * 1024;
const GARDER = 30; // même plafond que stories-auto.cjs (entrées de la file)
const MAX_POSTS_PAR_JOUR = 2;
const MIN_HEURE = 7 * 60, MAX_HEURE = 22 * 60 + 30; // créneaux : jamais avant 7 h ni après 22 h 30 (Paris)
const ESPACEMENT_MIN = 60;
const IMAGE_JOURS = 3;
const FRAICHEUR_DONNEES_J = { agenda: 3, indicateurs: 20, lois: 4 };

/** Chemins du dépôt (surchargeables pour les essais). */
const chemins = (racine = RACINE) => ({
  racine,
  file: path.join(racine, "data", "instagram-file.json"),
  registre: path.join(racine, "data", "instagram-publiees.json"),
  config: path.join(racine, "data", "stories-config.json"),
  etat: path.join(racine, "data", "contenus-etat.json"),
  img: path.join(racine, "instagram", "auto"),
  brouillons: path.join(racine, "instagram", "brouillons"),
  atom: path.join(racine, "instagram", "file.atom"),
});

const [PROPRIO, DEPOT] = (process.env.GITHUB_REPOSITORY || "Tahns/hemicycle-france").split("/");
const SITE = process.env.SITE_URL || `https://${PROPRIO.toLowerCase()}.github.io/${DEPOT}/`;
const urlImage = (nom) => `https://tahns.github.io/hemicycle-france/instagram/auto/${nom}.jpg`;

const hash = (x) => crypto.createHash("sha1").update(x).digest("hex").slice(0, 12);
/** Identifiant stable d'un contenu : type + période (jour, semaine, vote…). */
const idContenu = (type, cle) => hash(`contenu|${type}|${cle}`);
const majuscule = (t) => String(t || "").charAt(0).toUpperCase() + String(t || "").slice(1);
const nbFr = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const plat = (s) => String(s || "").replace(/\s+/g, " ").trim();
const coupe = (t, n) => { t = plat(t); if (t.length <= n) return t; const c = t.slice(0, n - 1).replace(/\s+\S*$/, ""); return (c || t.slice(0, n - 1)) + "…"; };
const lireJson = (f, defaut) => { try { return JSON.parse(fs.readFileSync(f, "utf-8")); } catch (e) { return defaut; } };

// ---------------------------------------------------------------------------------------------------------------------
// HEURE DE PARIS ET CRÉNEAUX
// ---------------------------------------------------------------------------------------------------------------------

/** { jour: "AAAA-MM-JJ", minutes (depuis minuit), isoWeekday (1 = lundi … 7 = dimanche) } à Paris. */
function parisInfos(now) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now).map((x) => [x.type, x.value]));
  const jour = `${p.year}-${p.month}-${p.day}`;
  const wd = new Date(jour + "T12:00:00Z").getUTCDay();
  return { jour, minutes: Number(p.hour) * 60 + Number(p.minute), isoWeekday: wd === 0 ? 7 : wd };
}
/** Instant (ISO UTC) d'une heure de Paris : jour « AAAA-MM-JJ », minutes depuis minuit. */
function parisVersIso(jour, minutes) {
  const base = Date.parse(jour + "T00:00:00Z") + minutes * 60000;
  let t = base;
  for (let i = 0; i < 3; i++) {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    const local = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
    t += base - local;
  }
  return new Date(t).toISOString();
}
const jourPlus = (jour, n) => new Date(Date.parse(jour + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
/** « mardi 6 octobre 2026 » (jour ISO). */
const dateLongue = (jour) => new Date(jour + "T12:00:00Z").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const dateSansJour = (jour) => new Date(jour + "T12:00:00Z").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** Semaine ISO d'un jour « AAAA-MM-JJ » : { id: "2026-W41", debut, fin }. */
function semaineISO(jour) {
  const d = Date.parse(jour + "T12:00:00Z");
  const lundi = d - ((new Date(d).getUTCDay() + 6) % 7) * 864e5;
  const jeudi = lundi + 3 * 864e5;
  const annee = new Date(jeudi).getUTCFullYear();
  const n = Math.ceil(((jeudi - Date.UTC(annee, 0, 1)) / 864e5 + 1) / 7);
  return { id: `${annee}-W${String(n).padStart(2, "0")}`, debut: new Date(lundi).toISOString().slice(0, 10), fin: new Date(lundi + 6 * 864e5).toISOString().slice(0, 10) };
}

/**
 * Types de contenus : avance (minutes avant le créneau à partir desquelles on prépare le contenu : image en ligne sur GitHub Pages avant l'heure)
 * et validité (minutes après le créneau pendant lesquelles il reste publiable ; ensuite il est « périmé » et jamais publié).
 */
const TYPES = {
  aujourdhui: { avance: 120, validite: 240, story: true },
  "vote-jour": { avance: 120, validite: 300, story: true },
  comprendre: { avance: 120, validite: 600, story: true },
  "chiffre-jour": { avance: 120, validite: 180, story: true },
  "carrousel-loi": { avance: 120, validite: 360, story: false },
  "carrousel-hebdo": { avance: 20, validite: 300, story: false }, // le résumé hebdomadaire est écrit le dimanche à 18 h 05 : on attend qu'il existe
};
const SUJET_UNIQUE_24H = new Set(["aujourdhui", "vote-jour"]); // contenus qui portent un texte de loi : jamais le même texte deux fois en 24 h, tous formats confondus
const PERIODE_SEMAINE = new Set(["comprendre", "carrousel-hebdo"]); // les autres types : une fois par jour
/** Créneaux par défaut (heure de Paris ; jours : 1 = lundi … 7 = dimanche, absent = tous les jours). */
const CRENEAUX_DEFAUT = {
  aujourdhui: { heure: "08:30" },
  "vote-jour": { heure: "12:30" },
  comprendre: { heure: "10:00", jours: [6] },
  "chiffre-jour": { heure: "19:00" },
  "carrousel-loi": { heure: "17:30" },
  "carrousel-hebdo": { heure: "18:30", jours: [7] },
};

/** « 08:30 » -> minutes ; valeur invalide : null. */
function heureEnMinutes(h) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(h || "").trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}
/** Créneaux de la configuration (« creneaux » : { type: { heure: "HH:MM", jours?: [1..7] } }) ; toute valeur invalide retombe sur le défaut ; heures bornées à 7 h – 22 h 30. */
function normaliserCreneaux(brut) {
  const out = {};
  for (const [nom, defaut] of Object.entries(CRENEAUX_DEFAUT)) {
    const c = brut && typeof brut === "object" ? brut[nom] : null;
    if (c === false || c?.actif === false) continue; // un créneau peut être coupé : { "chiffre-jour": false }
    let m = heureEnMinutes(c?.heure);
    if (m === null) m = heureEnMinutes(defaut.heure);
    m = Math.min(MAX_HEURE, Math.max(MIN_HEURE, m));
    const jours = Array.isArray(c?.jours) && c.jours.length && c.jours.every((j) => Number.isInteger(j) && j >= 1 && j <= 7) ? [...new Set(c.jours)] : defaut.jours || null;
    out[nom] = { minutes: m, jours };
  }
  return out;
}
/** Créneaux d'un jour de la semaine, triés, avec 60 min d'écart au moins entre deux (le suivant est repoussé) ; un créneau repoussé après 22 h 30 est abandonné pour ce jour. */
function creneauxDuJour(creneaux, isoWeekday) {
  const liste = Object.entries(creneaux).filter(([, c]) => !c.jours || c.jours.includes(isoWeekday)).map(([nom, c]) => ({ nom, minutes: c.minutes })).sort((a, b) => a.minutes - b.minutes);
  const out = [];
  let precedent = -Infinity;
  for (const c of liste) {
    const m = Math.max(c.minutes, precedent + ESPACEMENT_MIN);
    if (m > MAX_HEURE) continue;
    out.push({ nom: c.nom, minutes: m });
    precedent = m;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// ÉTAT : ce qui a déjà été fait (aucun doublon, rotation Comprendre, fréquence des chiffres)
// ---------------------------------------------------------------------------------------------------------------------
const etatVide = () => ({ faits: {}, comprendre: [], chiffres: {} });
function normaliserEtat(e) {
  const o = etatVide();
  if (e && typeof e === "object") {
    if (e.faits && typeof e.faits === "object") o.faits = e.faits;
    if (Array.isArray(e.comprendre)) o.comprendre = e.comprendre.filter((x) => x && x.cle);
    if (e.chiffres && typeof e.chiffres === "object") o.chiffres = e.chiffres;
  }
  return o;
}
/** Un contenu jamais publié (périmé) ne compte pas : sa notion Comprendre et son chiffre redeviennent disponibles. Les faits vieux de plus de 60 jours sont oubliés. */
function reconcilierEtat(etat, registre, now) {
  const perimes = new Set((registre?.entrees || []).filter((e) => e.statut === "perimee").map((e) => e.id));
  const e = normaliserEtat(etat);
  e.comprendre = e.comprendre.filter((x) => !perimes.has(x.id));
  for (const [c, v] of Object.entries(e.chiffres)) if (perimes.has(v.id)) delete e.chiffres[c];
  const limite = now.getTime() - 60 * 864e5;
  for (const [k, v] of Object.entries(e.faits)) if (!v?.le || Date.parse(v.le) < limite) delete e.faits[k];
  return e;
}
/** L'identifiant existe-t-il déjà (file, brouillons, registre des publications) ? */
function dejaCree(id, { file, registre, brouillons }) {
  return (file?.entrees || []).some((e) => e.id === id) || (registre?.entrees || []).some((e) => e.id === id) || (brouillons || []).some((b) => b.id === id);
}

/** Titre d'entrée de gabarit (« Le vote du jour : … », « Nouveau post : … ») : il ne désigne pas un sujet, on ne le compare jamais. */
const RE_TITRE_GABARIT = /^(Le vote du jour|Aujourd['’]hui à l['’]Assemblée|Nouveau post|Une loi expliquée|Ce qu['’]il faut retenir|Le chiffre du jour|Comprendre)\b/i;
/**
 * Sujets (titres rédigés) déjà présents, dans la file, les brouillons, le registre des publications et la mémoire des faits, depuis `heures` heures :
 * [{ id, titre, contenu }]. `contenu` = type de contenu à créneau de l'entrée (aucun pour une story ou un post de presse).
 * Registre : pas de titrePropre ; on y lit `sujets` et, pour un post, son titre (les autres titres de registre sont des gabarits ou des formules).
 */
function sujetsRecents({ file, registre, brouillons, etat }, now, heures) {
  const limite = now.getTime() - heures * 36e5;
  const recent = (iso) => !iso || !Number.isFinite(Date.parse(iso)) || Date.parse(iso) >= limite;
  const out = [];
  const ajoute = (e, titres) => { for (const t of titres) if (typeof t === "string" && t && !RE_TITRE_GABARIT.test(t)) out.push({ id: e.id, titre: t, contenu: e.contenu || null }); };
  for (const e of [...(file?.entrees || []), ...(brouillons || [])]) if (recent(e.cree)) ajoute(e, [e.sensible ? null : e.titrePropre, ...(Array.isArray(e.sujets) ? e.sujets : [])]);
  for (const e of registre?.entrees || []) if (e.statut === "publiee" && e.publieLe && recent(e.publieLe)) ajoute(e, [e.type === "post" && !e.sensible ? e.titre : null, ...(Array.isArray(e.sujets) ? e.sujets : [])]);
  for (const [k, v] of Object.entries(etat?.faits || {})) if (Array.isArray(v?.sujets) && recent(v.le)) ajoute({ id: v.id, contenu: k.split("|")[0] }, v.sujets);
  return out;
}
/** Identifiant du post « loi » (scripts/stories-auto.cjs choisirPostLoi) pour un voteId « an-<numéro> » ou « senat-<id> ». */
const idPostLoi = (voteId) => { const m = /^(an|senat)-(.+)$/.exec(String(voteId || "")); return m ? hash(`post-loi|${m[1]}|${m[2]}`) : null; };

// ---------------------------------------------------------------------------------------------------------------------
// SÉLECTEURS (fonctions pures : { refus } ou { contenu })
// ---------------------------------------------------------------------------------------------------------------------
const jourDonnees = (iso) => (/^\d{4}-\d{2}-\d{2}/.test(iso || "") ? String(iso).slice(0, 10) : null);
const donneesFraiches = (lastUpdated, maxJours, now) => Number.isFinite(Date.parse(lastUpdated)) && now.getTime() - Date.parse(lastUpdated) <= maxJours * 864e5;

/** 1. « Aujourd'hui à l'Assemblée » : points de la séance du jour ; les points à mot prudent sont écartés. */
function choisirAujourdhui({ agenda, jour, now }) {
  if (!donneesFraiches(agenda?.lastUpdated, FRAICHEUR_DONNEES_J.agenda, now)) return { refus: "agenda de l'Assemblée absent ou trop ancien" };
  const j = (agenda.jours || []).find((x) => x.date === jour);
  if (!j || !Array.isArray(j.points) || !j.points.length) return { refus: "pas de séance publique au programme aujourd'hui" };
  const vus = new Set();
  const points = [];
  for (const p of j.points) {
    const objet = plat(p?.objet).replace(/\s*\.\s*$/, "");
    if (!objet) continue;
    const k = p.type === "qag" ? "qag" : p.type === "vote" ? "vote" : "texte";
    if (k !== "qag" && motExclu(objet, OFF)) continue; // mieux vaut manquer un point qu'en publier un à tort
    const brut = k === "qag" ? "Questions au Gouvernement" : coupe(majuscule(objet), 230);
    if (vus.has(k + brut)) continue;
    vus.add(k + brut);
    // Affichage : intitulé sans jargon (simplifierTexteLoi) ; `brut` garde l'intitulé officiel pour sujets, alt et anti-doublon
    const t = k === "qag" ? "Questions des députés au Gouvernement" : (simplifierTexteLoi(brut) || simplifierJargon(brut));
    points.push({ k, t, brut });
  }
  if (!points.some((p) => p.k !== "qag")) return { refus: "aucun point à présenter (tous écartés ou questions au Gouvernement seules)" };
  const ordre = { qag: 0, vote: 1, texte: 2 };
  points.sort((a, b) => ordre[a.k] - ordre[b.k]);
  const sourceUrl = /^https:\/\//.test(agenda.sourceUrl || "") ? agenda.sourceUrl : "https://www2.assemblee-nationale.fr/agendas/les-agendas";
  const jourTxt = dateLongue(jour);
  const sujets = points.filter((p) => p.k !== "qag").map((p) => p.brut);
  const nTextes = sujets.length;
  return { contenu: {
    type: "aujourdhui", cle: jour, rendu: { kind: "story", type: "aujourdhui", spec: { iso: jour, jour: jourTxt, points: points.slice(0, 7), autres: Math.max(0, points.length - 7), source: "Source : Assemblée nationale, programme des débats dans l'hémicycle (assemblee-nationale.fr). Il peut encore changer." } },
    entree: { titre: `Aujourd'hui à l'Assemblée : ${jourTxt}`, titrePropre: "Aujourd'hui à l'Assemblée", accroche: `Aujourd'hui, les députés se réunissent : ${nTextes} ${nTextes > 1 ? "textes" : "texte"} au programme`, sujets, sources: [sourceUrl], alt: `Story Hémicycle France : le programme du débat dans l'hémicycle de l'Assemblée nationale, ${jourTxt}. ${points.map((p) => (p.k === "vote" ? "Vote des députés : " : "") + p.t).join(" ; ")}. Source : Assemblée nationale.` },
  } };
}

const somme = (v, i) => (Array.isArray(v) ? v[i] : [v?.pour, v?.contre, v?.abst][i]) || 0;
const totaux = (l) => { const g = Object.values(l.votes || {}); return { pour: g.reduce((a, v) => a + somme(v, 0), 0), contre: g.reduce((a, v) => a + somme(v, 1), 0), abst: g.reduce((a, v) => a + somme(v, 2), 0) }; };

/** Nature et importance d'un scrutin de l'Assemblée (null = pas un candidat « vote du jour » : vote final, amendement ordinaire, etc.). */
function classerScrutin(l) {
  const titre = plat(l.titre);
  if (RE_VOTE_FINAL.test(titre)) return null; // un vote final de loi reste un POST (stories-auto.cjs)
  if (l.typeVote === "MOC") return { type: "Motion de censure", base: 100 };
  if (/^l['’]article\b/i.test(titre)) return { type: "Article", base: 50 };
  if (/^l['’]amendement\b.*\bdu Gouvernement\b/i.test(titre) && !/^le sous-amendement/i.test(titre)) return { type: "Amendement du Gouvernement", base: 40 };
  return null;
}
/** 2. « Le vote du jour » : le scrutin public le plus important du dernier jour de vote (veille, ou jusqu'à 3 jours avant un week-end). */
function choisirVoteDuJour({ lois, jour, now }) {
  if (!donneesFraiches(lois?.lastUpdated, FRAICHEUR_DONNEES_J.lois, now)) return { refus: "data/lois.json absent ou trop ancien" };
  const limite = jourPlus(jour, -3);
  const jours = [...new Set((lois.lois || []).map((l) => l.dateISO).filter((d) => d && d >= limite && d < jour))].sort().reverse();
  for (const d of jours) {
    const candidats = [];
    for (const l of lois.lois.filter((x) => x.dateISO === d)) {
      const cl = classerScrutin(l);
      if (!cl || !l.numero) continue;
      if (motExclu(l.titre, OFF) || motExclu(l.dossierTitre || "", OFF)) continue;
      if (l.resultat !== "adopte" && l.resultat !== "rejete") continue;
      const t = totaux(l);
      const censure = cl.type === "Motion de censure"; // seules les voix favorables comptent : adoptée si 289 au moins (majorité absolue)
      const votants = censure ? t.pour : t.pour + t.contre;
      if (votants < 50) continue;
      if (censure ? (l.resultat === "adopte") !== (t.pour >= 289) : l.resultat === "adopte" ? !(t.pour > t.contre) : !(t.contre >= t.pour)) continue; // résultat incohérent avec les voix : on ne publie pas
      const serre = censure ? 1 : 1 - Math.abs(t.pour - t.contre) / votants;
      candidats.push({ l, cl, t, score: cl.base + Math.min(30, votants / 20) + 20 * serre });
    }
    if (!candidats.length) continue;
    candidats.sort((a, b) => b.score - a.score || b.l.numero - a.l.numero);
    const { l, cl, t } = candidats[0];
    // « l'article 3 … » -> « Article 3 … » ; une motion de censure : sans les noms de ses signataires (l'intitulé officiel les cite)
    let brut = plat(l.titre).replace(/\s*\.\s*$/, "").replace(/^l['’]/i, "");
    if (cl.type === "Motion de censure") brut = brut.replace(/\s*,?\s+par\s+(?:Mmes?|MM?\.)\s.*$/i, "").replace(/\s*,?\s*$/, "");
    const objetOfficiel = coupe(majuscule(brut), 330);
    // Affichage en mots simples : le texte officiel reste dans `sujets` (anti-doublon) et le titre officiel du dossier est expliqué
    const apres49 = /alin[ée]a 3|49[.\-]3/i.test(brut);
    const objet = cl.type === "Motion de censure"
      ? `Les députés votent pour renverser le Gouvernement${apres49 ? " : il a fait passer un texte sans vote (article 49.3)" : ""}.`
      : coupe(majuscule(simplifierJargon(brut)), 330);
    const typeAff = { "Motion de censure": "Vote pour renverser le Gouvernement", Article: "Vote sur un article du texte", "Amendement du Gouvernement": "Modification proposée (Gouvernement)" }[cl.type] || cl.type;
    const typeCourt = { "Motion de censure": "vote pour renverser le Gouvernement", Article: "vote sur un article", "Amendement du Gouvernement": "modification proposée par le Gouvernement" }[cl.type] || cl.type.toLowerCase();
    const verbe = l.resultat === "adopte" ? "adopté" : "rejeté";
    const url = `https://www.assemblee-nationale.fr/dyn/17/scrutins/${l.numero}`;
    return { contenu: {
      type: "vote-jour", cle: String(l.numero), rendu: { kind: "story", type: "vote-jour", spec: { date: l.date, type: typeAff, objet, dossier: l.dossierTitre ? coupe(simplifierJargon(l.dossierTitre), 150) : "", verdict: l.resultat, pour: t.pour, contre: t.contre, abst: t.abst, numero: l.numero, sourceTxt: `Source : Assemblée nationale, vote n°${l.numero} (assemblee-nationale.fr). Résultat officiel.` } },
      entree: { titre: `Le vote du jour : ${typeCourt} ${verbe} le ${l.date}`, titrePropre: l.dossierTitre ? coupe(l.dossierTitre, 150) : coupe(objetOfficiel, 150), sujets: [objetOfficiel, l.dossierTitre].filter(Boolean), voteId: `an-${l.numero}`, sources: [url],
        alt: `Story Hémicycle France, le vote du jour : ${typeCourt} ${verbe} par l'Assemblée nationale le ${l.date} (vote n°${l.numero}). Pour : ${nbFr(t.pour)}, contre : ${nbFr(t.contre)}, abstentions (ni pour ni contre) : ${nbFr(t.abst)}. ${objet}` },
    } };
  }
  return { refus: "aucun scrutin de la veille à présenter (ni motion de censure, ni article, ni amendement du Gouvernement)" };
}

// ----- Comprendre ------------------------------------------------------------------------------------------------------
const decoderHtml = (s) => String(s).replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#0?39;|&rsquo;/g, "’").replace(/&laquo;/g, "«").replace(/&raquo;/g, "»").replace(/\s+/g, " ").trim();
const slug = (t) => String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
/** Notions de la rubrique Comprendre d'index.html (bloc « Dix notions clés ») : [{ cle, titre, texte, sourceTxt }]. Une seule source de vérité : le site. */
function notionsComprendre(html) {
  const bloc = /<article class="cp-bloc" id="cp-notions">([\s\S]*?)<\/article>/.exec(html || "");
  if (!bloc) return [];
  const out = [];
  const re = /<div class="cp-fiche">([\s\S]*?)<\/div>/g;
  let m;
  while ((m = re.exec(bloc[1]))) {
    const titre = decoderHtml((/<h4>([\s\S]*?)<\/h4>/.exec(m[1]) || [])[1] || "");
    const paras = [...m[1].matchAll(/<p>([\s\S]*?)<\/p>/g)].map((x) => decoderHtml(x[1]));
    const src = /<p class="cp-source">([\s\S]*?)<\/p>/.exec(m[1]);
    const href = src ? (/href="https?:\/\/(?:www\.)?([^\/"]+)/.exec(src[1]) || [])[1] : null;
    const srcTxt = src ? decoderHtml(src[1]).replace(/^Texte\s*:\s*/i, "") : "";
    if (!titre || !paras.length || !srcTxt) continue;
    out.push({ cle: slug(titre), titre, texte: paras.join(" "), sourceTxt: `Source : ${srcTxt}${href && !srcTxt.includes(href) ? ` (${href})` : ""}. Règle en vigueur, sans avis.` });
  }
  return out;
}
/** Prochaine notion : la première (dans l'ordre du site) pas encore vue dans le cycle courant ; le cycle repart de zéro quand toutes ont été vues. */
function prochaineNotion(notions, etat) {
  const sures = notions.filter((n) => !motExclu(n.titre, OFF) && !motExclu(n.texte, OFF));
  if (!sures.length) return null;
  const connues = new Set(sures.map((n) => n.cle));
  let cycle = etat.comprendre.map((x) => x.cle).filter((c) => connues.has(c));
  if (new Set(cycle).size >= sures.length) cycle = [];
  return sures.find((n) => !cycle.includes(n.cle)) || null;
}
/** 3. « Comprendre » : une notion par semaine (rotation sans répétition avant épuisement). */
function choisirComprendre({ notions, etat, jour }) {
  const n = prochaineNotion(notions, etat);
  if (!n) return { refus: "aucune notion exploitable dans la rubrique Comprendre" };
  const semaine = semaineISO(jour).id;
  const sures = notions.filter((x) => !motExclu(x.titre, OFF) && !motExclu(x.texte, OFF));
  return { contenu: {
    type: "comprendre", cle: semaine, notion: n.cle,
    rendu: { kind: "story", type: "comprendre", spec: { n: sures.indexOf(n) + 1, total: sures.length, cle: n.cle, titre: n.titre, texte: n.texte, sourceTxt: n.sourceTxt } },
    entree: { titre: `Comprendre : ${n.titre}`, titrePropre: n.titre, sujets: [n.titre], sources: [], cle: n.cle, alt: `Story Hémicycle France, rubrique Comprendre (notion ${sures.indexOf(n) + 1} sur ${sures.length}) : ${n.titre}. ${n.texte} ${n.sourceTxt}` },
  } };
}

// ----- Chiffre du jour --------------------------------------------------------------------------------------------------
/** Sépare « 119,0 % du PIB » en { hero: "119,0 %", suite: "du PIB" } ; « +3,0 % » -> hero seul. */
function separerValeur(v) {
  const m = /^([+\-−]?\d[\d\s  ,.]*\s?(?:%|Md€|M€|Md|M|k)?)\s*(.*)$/.exec(plat(v));
  return m ? { hero: m[1].trim(), suite: m[2].trim() } : { hero: plat(v), suite: "" };
}
const hote = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch (e) { return ""; } };
const marge95 = (n) => Math.round(196 * Math.sqrt(0.25 / n) * 10) / 10; // marge d'erreur maximale (points) d'un échantillon aléatoire simple

/** Ce que mesure chaque indicateur, en une phrase simple (définition, aucun avis). */
const DEFINITIONS = {
  inflation: "L'inflation, c'est la hausse générale des prix.",
  chomage: "Le chômage, c'est le fait de chercher un emploi sans en avoir.",
  "croissance-du-pib": "Le PIB est la richesse produite en France. La croissance dit si elle augmente ou diminue.",
  "deficit-public": "Le déficit, c'est quand l'État dépense plus d'argent qu'il n'en reçoit.",
  "dette-publique": "La dette, c'est l'argent que l'État a emprunté et doit rembourser.",
  population: "La population, c'est le nombre de personnes qui vivent en France.",
};
const LIBELLES_SIMPLES = { "Croissance du PIB": "Croissance de la richesse produite (PIB)", "Déficit public": "Déficit public (dépenses en trop)", "Dette publique": "Dette publique (argent à rembourser)" };
/** Détail officiel d'un indicateur sans jargon statistique (les chiffres ne changent pas). */
function detailSimple(d) {
  return plat(String(d || "")
    .replace(/Évolution du PIB en volume par rapport au trimestre précédent/i, "Évolution de la richesse produite (le PIB) par rapport aux 3 mois précédents")
    .replace(/Évolution des prix à la consommation sur un an, ensemble des ménages, France/i, "Hausse des prix en un an pour l'ensemble des ménages, en France")
    .replace(/Taux de chômage(?: au sens du BIT)?/i, "Part des personnes sans emploi qui en cherchent un")
    .replace(/\s*\((?:données|données) corrigées[^)]*\)/gi, "").replace(/,\s*données corrigées[^;—()]*/gi, "")
    .replace(/\s*au sens (?:du BIT|de Maastricht)/gi, "")
    .replace(/estimation Insee/i, "estimation de l'Insee, l'institut de statistiques")
    .replace(/administrations publiques/gi, "l'État, la Sécurité sociale et les collectivités")
    .replace(/\bdu PIB\b/g, "de la richesse produite en un an (PIB)"));
}
/** Candidats « chiffre du jour » dans l'ordre de préférence : indicateurs officiels, budget (Eurostat), puis dernier sondage (hors réserve). */
function candidatsChiffres({ indicateurs, budget, sondages, veille = null, now }) {
  const out = [];
  const ordre = ["Inflation", "Déficit public", "Dette publique", "Chômage", "Croissance du PIB"];
  const inds = (indicateurs?.indicateurs || []).filter((i) => i?.nom && i.valeur && i.source && i.date && /^https:\/\//.test(i.url || ""));
  inds.sort((a, b) => (ordre.indexOf(a.nom) + 1 || 99) - (ordre.indexOf(b.nom) + 1 || 99));
  for (const i of inds) {
    const v = separerValeur(i.valeur);
    out.push({ cle: slug(i.nom), spec: { cle: slug(i.nom), libelle: LIBELLES_SIMPLES[i.nom] || i.nom, valeur: v.hero, soustitre: v.suite.replace(/\bdu PIB\b/, "de la richesse produite en un an (PIB)"), periode: i.date, lignes: [DEFINITIONS[slug(i.nom)], detailSimple(i.detail)].filter(Boolean), sourceTxt: `Source : ${i.source} (${hote(i.url)}). Donnée officielle, ${i.date}.` }, titre: `Le chiffre du jour : ${i.nom} ${i.valeur} (${i.date})`, sources: [i.url], texte: `${i.nom} : ${i.valeur}, ${i.date}. ${i.detail || ""}` });
  }
  const dette = budget?.dette, dep = budget?.depenses;
  if (dette?.interetsMd > 0 && dette.annee && /^https:\/\//.test(dette.url || "")) {
    out.push({ cle: "charge-de-la-dette", spec: { cle: "charge-de-la-dette", libelle: "Intérêts payés sur la dette publique", valeur: `${String(dette.interetsMd).replace(".", ",")} Md€`, soustitre: `${String(dette.interetsPctDepenses).replace(".", ",")} % des dépenses publiques`, periode: String(dette.annee), lignes: ["La dette, c'est l'argent que l'État a emprunté. Ce chiffre est ce qu'il paie chaque année pour cela (intérêts).", "Il couvre l'État, la Sécurité sociale et les collectivités locales. Md€ veut dire milliards d'euros."], sourceTxt: `Source : Eurostat (${hote(dette.url)}), comptes publics de la France établis par l'Insee (institut de statistiques), ${dette.annee}.` }, titre: `Le chiffre du jour : charge de la dette publique ${String(dette.interetsMd).replace(".", ",")} Md€ (${dette.annee})`, sources: [dette.url], texte: `Charge de la dette publique : ${dette.interetsMd} milliards d'euros en ${dette.annee}.` });
  }
  if (dep?.totalMd > 0 && dep.annee && /^https:\/\//.test(dep.url || "")) {
    out.push({ cle: "depenses-publiques", spec: { cle: "depenses-publiques", libelle: "Dépenses de l'État, de la Sécurité sociale et des collectivités", valeur: `${nbFr(String(dep.totalMd).replace(".", ","))} Md€`, soustitre: "", periode: String(dep.annee), lignes: [dep.postes?.[0]?.libelle && dep.postes[0].pct ? `${dep.postes[0].libelle} : ${String(dep.postes[0].pct).replace(".", ",")} % du total, premier poste de dépenses.` : null, "Md€ veut dire milliards d'euros."].filter(Boolean), sourceTxt: `Source : Eurostat (${hote(dep.url)}), dépenses classées par fonction, comptes établis par l'Insee (institut de statistiques), ${dep.annee}.` }, titre: `Le chiffre du jour : dépenses publiques ${nbFr(dep.totalMd)} Md€ (${dep.annee})`, sources: [dep.url], texte: `Dépenses des administrations publiques : ${dep.totalMd} milliards d'euros en ${dep.annee}.` });
  }
  // Dernier sondage : jamais pendant la réserve électorale ; terrain de moins de 10 jours ; au moins 3 candidats et un échantillon connu
  if (!reserveStory(now)) {
    const dernier = [...(sondages?.instituts || [])].filter((i) => i?.nom && /^\d{4}-\d{2}-\d{2}$/.test(i.dateFin || "") && i.scores && Object.keys(i.scores).length >= 3 && i.echantillon > 0 && /^https:\/\//.test(i.url || "") && SC.commanditaire(i, veille)).sort((a, b) => b.dateFin.localeCompare(a.dateFin))[0];
    if (dernier && now.getTime() - Date.parse(dernier.dateFin + "T12:00:00Z") <= 10 * 864e5) {
      const tetes = Object.entries(dernier.scores).filter(([, v]) => Array.isArray(v) && v.length === 2).sort((a, b) => b[1][1] - a[1][1] || a[0].localeCompare(b[0], "fr")).slice(0, 3);
      if (tetes.length >= 2) {
        const f = ([mn, mx]) => (mn === mx ? `${String(mx).replace(".", ",")} %` : `${String(mn).replace(".", ",")} à ${String(mx).replace(".", ",")} %`);
        out.push({ cle: `sondage-${slug(dernier.nom)}-${dernier.dateFin}`, sondage: true, spec: { cle: `sondage-${slug(dernier.nom)}`, libelle: `Pour qui voteraient les personnes interrogées au 1er tour (${dernier.nom} pour ${SC.commanditaire(dernier, veille).nom})`, valeur: f(tetes[0][1]), soustitre: tetes[0][0], periode: `Enquête menée : ${dernier.date}`, lignes: [...tetes.slice(1).map(([n, v]) => `${n} : ${f(v)}`), `Les chiffres varient selon les candidats proposés aux personnes interrogées.`, `${nbFr(dernier.echantillon)} personnes interrogées. Marge d'erreur maximale : environ ±${String(marge95(dernier.echantillon)).replace(".", ",")} point${marge95(dernier.echantillon) >= 2 ? "s" : ""}. Un sondage n'est pas une prévision.`], sourceTxt: `Source : notice de la Commission des sondages (commission-des-sondages.fr), enquête ${dernier.nom}, terrain du ${dernier.date}.` }, titre: `Le chiffre du jour : sondage ${dernier.nom}, pour qui voteraient les personnes interrogées au 1er tour (enquête : ${dernier.date})`, sources: [dernier.url], texte: `Sondage ${dernier.nom} (${dernier.date}).` });
      }
    }
  }
  return out;
}
/** 4. « Le chiffre du jour » : la donnée jamais montrée, sinon la plus anciennement montrée, à condition qu'elle l'ait été il y a 7 jours au moins. */
function choisirChiffre({ indicateurs, budget, sondages, veille = null, etat, jour, now }) {
  if (!donneesFraiches(indicateurs?.lastUpdated, FRAICHEUR_DONNEES_J.indicateurs, now)) return { refus: "indicateurs absents ou trop anciens" };
  const cands = candidatsChiffres({ indicateurs, budget, sondages, veille, now })
    .filter((c) => !motExclu(c.titre, OFF) && !(c.sondage && reserveStory(now)));
  const eligibles = cands.filter((c) => {
    const v = etat.chiffres[c.cle];
    return !v || (Date.parse(jour + "T12:00:00Z") - Date.parse(v.date + "T12:00:00Z")) / 864e5 >= 7;
  });
  if (!eligibles.length) return { refus: "chaque chiffre a été montré il y a moins de 7 jours" };
  const rang = (c) => { const v = etat.chiffres[c.cle]; return v ? Date.parse(v.date) : -Infinity; };
  const c = [...eligibles].sort((a, b) => rang(a) - rang(b))[0]; // tri stable : à égalité, l'ordre de préférence
  return { contenu: {
    type: "chiffre-jour", cle: jour, chiffre: c.cle,
    rendu: { kind: "story", type: "chiffre-jour", spec: c.spec },
    entree: { titre: c.titre, titrePropre: c.spec.libelle, sujets: [c.spec.libelle], sources: c.sources, ...(c.sondage ? { reserve: true, nommePersonne: true } : {}), alt: `Story Hémicycle France, le chiffre du jour : ${c.texte} ${c.spec.sourceTxt}` },
  } };
}

// ----- Carrousels --------------------------------------------------------------------------------------------------------
const legendeCarrousel = ({ titre, lignes, source, hashtags, appel = "À enregistrer pour y revenir, à partager pour en parler autour de vous." }) => [titre, "", ...lignes, "", source, "", appel, `Chaque jour : ${COMPTE}`, "", hashtags.join(" ")].join("\n");

const etapeSuivante = ({ chambre, resultat, etape, navetteSenat }) => {
  const an = chambre === "an", autre = an ? "au Sénat" : "à l'Assemblée nationale";
  const e = String(etape || "").toLowerCase();
  const lignes = [];
  if (resultat === "rejete") {
    lignes.push("Un texte rejeté en entier n'avance généralement pas à ce stade.");
    lignes.push("Pour connaître la situation exacte, voir le site de l'Assemblée nationale ou du Sénat.");
  } else if (/commission mixte paritaire|cmp/.test(e)) {
    lignes.push("Un texte a été écrit lors d'une réunion de députés et de sénateurs.");
    lignes.push("L'Assemblée nationale et le Sénat doivent maintenant l'approuver tel quel.");
    lignes.push("Ensuite, le président de la République a 15 jours pour signer la loi. Avant, on peut demander au Conseil constitutionnel de vérifier que la loi respecte la Constitution.");
  } else if (/lecture définitive/.test(e)) {
    lignes.push("L'Assemblée nationale a le dernier mot : le texte est adopté pour de bon.");
    lignes.push("Le président de la République a 15 jours pour signer la loi. Avant, on peut demander au Conseil constitutionnel de vérifier que la loi respecte la Constitution.");
  } else if (/première lecture/.test(e) && !navetteSenat) {
    lignes.push(`Le texte est envoyé ${autre}, qui doit à son tour l'examiner.`);
    lignes.push("Pour devenir une loi, il doit être adopté, mot pour mot, par les deux assemblées.");
  } else {
    lignes.push("Pour devenir une loi, le texte doit être adopté, mot pour mot, par l'Assemblée nationale et par le Sénat.");
    lignes.push("S'ils ne sont pas d'accord, 7 députés et 7 sénateurs peuvent se réunir pour chercher un accord.");
  }
  if (navetteSenat) lignes.push(`Le Sénat a déjà voté sur ce texte le ${navetteSenat.date} : ${navetteSenat.resultat === "adopte" ? "adopté" : "rejeté"} (${nbFr(navetteSenat.pour)} pour, ${nbFr(navetteSenat.contre)} contre).`);
  return lignes;
};

/** Votes finals (adoptés ou rejetés) des `jours` derniers jours, du plus récent au plus ancien : [{ f: fiche, dateISO, l (AN) ou s (Sénat), voteId }]. */
function votesFinaux({ lois, senat, jour, jours = 3 }) {
  const limite = jourPlus(jour, -jours);
  const out = [];
  for (const l of lois?.lois || []) {
    if (!l?.numero || !l.dateISO || l.dateISO < limite || l.dateISO > jour || !RE_VOTE_FINAL.test(l.titre || "") || !l.votes || !["SPO", "SPS"].includes(l.typeVote)) continue;
    const t = totaux(l);
    const f = ficheLoi({ chambre: "an", id: `an-${l.numero}`, numero: l.numero, titre: l.titre, dossierTitre: l.dossierTitre, date: l.date, dateISO: l.dateISO, resultat: l.resultat, ...t, url: `https://www.assemblee-nationale.fr/dyn/17/scrutins/${l.numero}` });
    if (f) out.push({ f, dateISO: l.dateISO, l, voteId: f.voteId, ordre: l.numero });
  }
  for (const s of senat?.scrutins || []) {
    if (!s?.id || !s.dateISO || s.dateISO < limite || s.dateISO > jour || !RE_VOTE_FINAL.test(s.titre || "")) continue;
    if (!/^https:\/\/www\.senat\.fr\//.test(s.sourceUrl || s.dossierUrl || "")) continue;
    const f = ficheLoi({ chambre: "senat", id: s.id, numero: s.numero, titre: s.titre, date: s.date, dateISO: s.dateISO, resultat: s.resultat, pour: s.pour, contre: s.contre, abst: s.abst, url: s.sourceUrl || s.dossierUrl });
    if (f) out.push({ f, dateISO: s.dateISO, s, voteId: f.voteId, ordre: s.numero });
  }
  return out.sort((a, b) => b.dateISO.localeCompare(a.dateISO) || b.ordre - a.ordre);
}

/** Le vote final `v` a-t-il déjà un post, une annonce, un carrousel ou un titre proche (file, brouillons, registre, faits) ? Renvoie la raison, ou null. */
function loiDejaTraitee(v, { etat, file, registre, brouillons }, now) {
  const postId = idPostLoi(v.voteId);
  const annonceId = postId ? SA.idAnnonce(postId) : null;
  const idCarrousel = idContenu("carrousel-loi", v.voteId);
  const toutes = [...(file?.entrees || []), ...(brouillons || []), ...(registre?.entrees || [])];
  for (const e of toutes) {
    if (!e) continue;
    if (e.statut === "perimee") continue; // jamais publiée : ne compte pas
    if (postId && (e.id === postId || e.id === annonceId || e.annonceDe === postId || e.reelDe === postId)) return "post ou annonce du même vote";
    if (e.id === idCarrousel) return "carrousel du même vote";
    if (e.voteId && e.voteId === v.voteId) return "même vote";
  }
  const faits = Object.values(etat?.faits || {}).some((x) => x && (x.id === postId || x.id === annonceId));
  if (faits) return "post du même vote (mémoire)";
  const titre = v.f.titreCourt;
  const proche = sujetsRecents({ file, registre, brouillons, etat }, now, 96).find((x) => x.contenu !== "carrousel-hebdo" && SA.titresProches(x.titre, titre));
  return proche ? `titre proche : « ${proche.titre.slice(0, 80)} »` : null;
}

/** 5a. Carrousel « une loi expliquée en 5 images » : un vote final (adopté ou rejeté) récent, pas déjà expliqué. */
function choisirCarrouselLoi({ lois, senat, navette, etat, jour, now, file, registre, brouillons }) {
  if (!donneesFraiches(lois?.lastUpdated, FRAICHEUR_DONNEES_J.lois, now)) return { refus: "data/lois.json absent ou trop ancien" };
  let refusLoi = "aucun vote final récent à expliquer";
  for (const v of votesFinaux({ lois, senat, jour })) {
    if (etat.faits[`carrousel-loi|${v.voteId}`]) continue;
    // Un sujet de loi = UN seul format : post (+ son annonce) OU carrousel, jamais les deux (ni deux fois le même texte).
    const raison = loiDejaTraitee(v, { etat, file, registre, brouillons }, now);
    if (raison) { refusLoi = `loi déjà traitée (${raison})`; continue; }
    const f = v.f, an = f.spec.chambre === "Assemblée nationale", sp = f.spec;
    const verbe = sp.verdict === "adopte" ? "adopté" : "rejeté";
    const d = decomposerTitreVote(v.l ? v.l.titre : v.s.titre);
    const dossierRef = v.l?.dossierRef || null;
    const nav = dossierRef ? navette?.textes?.[dossierRef] : null;
    const navetteSenat = an && nav?.votes?.length ? [...nav.votes].filter((x) => x.dateISO && x.dateISO <= v.dateISO).sort((a, b) => b.dateISO.localeCompare(a.dateISO))[0] || null : null;
    const urlDossier = dossierRef ? `https://www.assemblee-nationale.fr/dyn/17/dossiers/${dossierRef}` : (v.s?.dossierUrl || null);
    const auteur = v.l?.auteur ? (/^gouvernement$/i.test(v.l.auteur) ? "Loi proposée par le Gouvernement." : `Loi proposée par ${v.l.auteur}.`) : null;
    const natureTxt = natureSimple(sp.nature), etapeTxt = d.etape ? etapeSimple(d.etape) : "";
    const contexte = [
      `Ce texte est une ${natureTxt}. Il est examiné par ${an ? "l'Assemblée nationale" : "le Sénat"}${etapeTxt ? ` (${etapeTxt})` : ""}.`,
      auteur,
      v.l?.theme ? `Thème : ${v.l.theme}.` : null,
      `Vote sur le texte en entier le ${sp.date}.`,
    ].filter(Boolean);
    const sources = [
      `${an ? "Assemblée nationale" : "Sénat"}, vote n°${sp.numero} : ${f.source.replace(/^https?:\/\/(www\.)?/, "")}`,
      urlDossier ? `Le parcours de la loi : ${urlDossier.replace(/^https?:\/\/(www\.)?/, "")}` : null,
      navetteSenat?.url ? `Sénat, vote : ${navetteSenat.url.replace(/^https?:\/\/(www\.)?/, "")}` : null,
    ].filter(Boolean);
    const total = 5;
    const base = { total, accroche: undefined };
    const specs = [
      { ...base, n: 1, couverture: true, kicker: "Une loi expliquée", titre: f.accroche || simplifierJargon(sp.titre), corps: [{ p: `Texte ${verbe} · ${sp.chambre} · ${sp.date}`, couleur: "ciel", taille: 32, poids: 700 }, { li: contexte }], source: "Source : données officielles de l'Assemblée nationale et du Sénat." },
      { ...base, n: 2, kicker: "Ce que dit le texte", titre: "Le titre officiel du texte", corps: [{ carte: `« ${sp.titre} »` }, { p: `En mots simples : ${f.accroche || simplifierJargon(sp.titre)}.`, taille: 32, poids: 600 }, { p: "Hémicycle France ne résume pas les articles. Le texte complet est à lire sur le site officiel.", couleur: "ciel", taille: 30 }, ...(v.l?.dossierTitre ? [{ p: `Le parcours de la loi : ${coupe(v.l.dossierTitre, 200)}`, taille: 32, poids: 600 }] : [])], source: `Source : ${an ? "Assemblée nationale (assemblee-nationale.fr)" : "Sénat (senat.fr)"}, titre officiel.` },
      { ...base, n: 3, kicker: "Le résultat du vote", titre: `Vote sur le texte en entier · ${sp.date}`, corps: [{ gros: sp.verdict === "adopte" ? "Adopté" : "Rejeté" }, { cases: [["Pour", sp.pour], ["Contre", sp.contre], ["Ni pour ni contre", sp.abst]] }], source: sp.sourceTxt },
      { ...base, n: 4, kicker: "Ce qui suit", titre: "Et ensuite ?", corps: [{ li: etapeSuivante({ chambre: an ? "an" : "senat", resultat: sp.verdict, etape: sp.etape, navetteSenat }) }], source: "Règles : Constitution du 4 octobre 1958 (article 45) ; vie-publique.fr." },
      { ...base, n: 5, kicker: "Sources", titre: "Pour vérifier", corps: [{ li: sources }, { p: "Résultat officiel, sans avis ni commentaire.", couleur: "ciel", taille: 30 }], source: "Hémicycle France : données officielles uniquement.", accroche: "Toute l'actu politique" },
    ];
    const sourceLegende = `Source officielle : ${an ? "Assemblée nationale" : "Sénat"}, vote n°${sp.numero} — ${f.source}`;
    const legende = legendeCarrousel({
      titre: `5 images pour comprendre : ${f.accroche || coupe(simplifierJargon(sp.titre), 150)} (texte ${verbe})`,
      lignes: [`Le ${sp.date}, ${an ? "l'Assemblée nationale" : "le Sénat"} a ${verbe} le texte en entier${etapeTxt ? ` (${etapeTxt})` : ""}.`, `Titre officiel : « ${coupe(sp.titre, 150)} ».`, `Pour : ${nbFr(sp.pour)} · Contre : ${nbFr(sp.contre)} · Abstentions (ni pour ni contre) : ${nbFr(sp.abst)}.`, "En 5 images : le contexte, le titre officiel, le résultat du vote, la suite, les sources."],
      source: sourceLegende, hashtags: hashtagsLegende({ genre: "carrousel-loi", chambre: an ? "an" : "senat", theme: an ? "assemblee" : "senat", titre: sp.titre, max: 5 }),
    });
    const alts = [
      `Image 1 sur 5. ${f.accroche || simplifierJargon(sp.titre)}, texte ${verbe} par ${an ? "l'Assemblée nationale" : "le Sénat"} le ${sp.date}. ${contexte.join(" ")}`,
      `Image 2 sur 5. Titre officiel du texte : ${sp.titre}. En mots simples : ${f.accroche || simplifierJargon(sp.titre)}.`,
      `Image 3 sur 5. Résultat du vote sur le texte en entier : ${verbe}. Pour : ${nbFr(sp.pour)}, contre : ${nbFr(sp.contre)}, abstentions (ni pour ni contre) : ${nbFr(sp.abst)}.`,
      `Image 4 sur 5. Ce qui suit : ${etapeSuivante({ chambre: an ? "an" : "senat", resultat: sp.verdict, etape: sp.etape, navetteSenat }).join(" ")}`,
      `Image 5 sur 5. Sources officielles : ${sources.join(" ; ")}.`,
    ];
    return { contenu: {
      type: "carrousel-loi", cle: v.voteId, rendu: { kind: "carrousel", specs, alts },
      entree: { titre: `Une loi expliquée : ${f.titreCourt} (${verbe})`, titrePropre: f.titreCourt, sujets: [f.titreCourt], voteId: v.voteId, sources: [f.source, urlDossier].filter(Boolean), legende, alt: alts[0] },
    } };
  }
  return { refus: refusLoi };
}

/** 5b. Carrousel hebdomadaire d'après data/digest/AAAA-Wss.json (le résumé existant) : le dimanche. */
function choisirCarrouselHebdo({ digest, jour, now }) {
  if (!digest || typeof digest !== "object" || !digest.id) return { refus: "pas de résumé hebdomadaire pour cette semaine" };
  const sem = semaineISO(jour);
  if (digest.id !== sem.id) return { refus: `le résumé hebdomadaire (${digest.id}) n'est pas celui de la semaine en cours (${sem.id})` };
  const reserve = Boolean(reserveStory(now));
  const sc = digest.scrutins || {};
  const sain = (t) => !motExclu(t, OFF);
  const textes = (digest.textes || []).filter((t) => t?.titre && sain(t.titre) && (t.resultat === "adopte" || t.resultat === "rejete")).slice(0, 5);
  const dossiers = (digest.dossiers || []).filter((d) => d?.titre && sain(d.titre) && d.scrutins > 0).slice(0, 5);
  const seances = (digest.aVenir?.seances || []).map((s) => ({ date: s.date, points: (s.points || []).filter((p) => p?.objet && (p.type === "qag" || sain(p.objet))) })).filter((s) => s.points.some((p) => p.type !== "qag")).slice(0, 5);
  const sondage = !reserve && digest.sondage?.tetes?.length >= 2 && digest.sondage.institut && digest.sondage.url ? digest.sondage : null;
  const periode = `du ${dateSansJour(digest.debut).replace(/ \d{4}$/, "")} au ${dateSansJour(digest.fin)}`;
  const fmt = ([mn, mx]) => (mn === mx ? `${String(mx).replace(".", ",")} %` : `${String(mn).replace(".", ",")} à ${String(mx).replace(".", ",")} %`);
  const corps = [];
  corps.push({ kicker: "Les chiffres", titre: "Les votes de la semaine", corps: [{ kv: [["Votes des députés", nbFr(sc.total || 0)], ["Adoptés", nbFr(sc.adoptes || 0)], ["Rejetés", nbFr(sc.rejetes || 0)], ["Textes votés en entier", nbFr((digest.textes || []).length)]] }, { p: "Les députés votent sur des modifications proposées, des articles et des textes en entier.", couleur: "ciel", taille: 30 }], source: "Source : Assemblée nationale, votes des députés (data.assemblee-nationale.fr)." });
  if (textes.length) corps.push({ kicker: "Textes votés", titre: "Les textes votés dans la semaine", corps: [{ li: textes.map((t) => `${coupe(simplifierTexteLoi(t.titre) || simplifierJargon(t.titre), 150)} : ${t.resultat === "adopte" ? "adopté" : "rejeté"} (${nbFr(t.pour)} pour, ${nbFr(t.contre)} contre)`) }], source: "Source : Assemblée nationale, votes sur des textes en entier (assemblee-nationale.fr)." });
  if (dossiers.length) corps.push({ kicker: "Les plus discutés", titre: "Les textes les plus discutés", corps: [{ li: dossiers.map((d) => `${coupe(simplifierTexteLoi(d.titre) || simplifierJargon(d.titre), 150)} : ${nbFr(d.scrutins)} vote${d.scrutins > 1 ? "s" : ""}`) }, { p: "Nombre de votes par texte cette semaine.", couleur: "ciel", taille: 30 }], source: "Source : Assemblée nationale, votes des députés (data.assemblee-nationale.fr)." });
  if (seances.length) corps.push({ kicker: "La semaine prochaine", titre: "Au programme de l'Assemblée nationale", corps: [{ li: seances.map((s) => `${majuscule(new Date(s.date + "T12:00:00Z").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }))} : ${coupe(s.points.filter((p) => p.type !== "qag").map((p) => simplifierTexteLoi(p.objet) || simplifierJargon(p.objet)).join(" ; "), 150)}`) }], source: "Source : Assemblée nationale, programme des débats dans l'hémicycle (assemblee-nationale.fr). Il peut changer." });
  if (sondage) corps.push({ kicker: "Dernier sondage", titre: `Élection du président 2027 : sondage ${sondage.institut}`, corps: [{ li: sondage.tetes.slice(0, 4).map((t) => `${t.nom} : ${fmt([t.min, t.max])}`) }, { p: `Les chiffres varient selon les candidats proposés. Enquête menée jusqu'au ${dateSansJour(sondage.dateFin)}${sondage.echantillon ? ` auprès de ${nbFr(sondage.echantillon)} personnes interrogées. Marge d'erreur maximale : environ ±${String(marge95(sondage.echantillon)).replace(".", ",")} point${marge95(sondage.echantillon) >= 2 ? "s" : ""}` : ""}. Un sondage n'est pas une prévision.`, couleur: "ciel", taille: 28 }], source: `Source : notice de la Commission des sondages (commission-des-sondages.fr), enquête ${sondage.institut}.` });
  if (corps.length < 2) return { refus: "résumé hebdomadaire trop pauvre pour un carrousel" };
  const sourcesLi = [
    "Assemblée nationale, votes des députés : data.assemblee-nationale.fr/travaux-parlementaires/votes",
    `Assemblée nationale, programme des débats : ${(digest.sources?.find((s) => /ordre du jour/i.test(s.nom))?.url || "https://www2.assemblee-nationale.fr/agendas/les-agendas").replace(/^https?:\/\/(www2?\.)?/, "")}`,
    ...(sondage ? [`Commission des sondages : ${sondage.url.replace(/^https?:\/\/(www\.)?/, "").replace(/(.{60}).*(\.pdf)$/, "$1…$2")}`] : []),
  ];
  corps.push({ kicker: "Sources", titre: "Pour vérifier", corps: [{ li: sourcesLi }, { p: "Chaque chiffre vient de données officielles, sans avis ni commentaire.", couleur: "ciel", taille: 30 }], source: "Hémicycle France : données officielles uniquement.", accroche: "Toute l'actu politique" });
  const total = corps.length + 1;
  const couverture = { n: 1, total, couverture: true, kicker: "Ce qu'il faut retenir", titre: "Ce qu'il faut retenir cette semaine", corps: [{ p: `Au Parlement, semaine ${periode}`, couleur: "ciel", taille: 36, poids: 700 }, { p: sc.total ? `${nbFr(sc.total)} vote${sc.total > 1 ? "s" : ""} des députés : ${nbFr(sc.adoptes || 0)} adopté${(sc.adoptes || 0) > 1 ? "s" : ""}, ${nbFr(sc.rejetes || 0)} rejeté${(sc.rejetes || 0) > 1 ? "s" : ""}.` : "Aucun vote des députés cette semaine.", taille: 34 }], source: "Source : données officielles de l'Assemblée nationale.", accroche: "Faites défiler" };
  const specs = [couverture, ...corps.map((c, i) => ({ ...c, n: i + 2, total }))];
  const lignes = [sc.total ? `${nbFr(sc.total)} vote${sc.total > 1 ? "s" : ""} des députés à l'Assemblée nationale : ${nbFr(sc.adoptes || 0)} adopté${(sc.adoptes || 0) > 1 ? "s" : ""}, ${nbFr(sc.rejetes || 0)} rejeté${(sc.rejetes || 0) > 1 ? "s" : ""}.` : "Aucun vote des députés à l'Assemblée nationale cette semaine.", `${total} images : ${[textes.length ? "textes votés" : null, dossiers.length ? "textes les plus discutés" : null, seances.length ? "programme de la semaine prochaine" : null, sondage ? "dernier sondage" : null].filter(Boolean).join(", ") || "les chiffres de la semaine"}, sources.`];
  const legende = legendeCarrousel({ titre: `${total} images pour comprendre la semaine à l'Assemblée nationale (${periode})`, lignes, source: "Sources officielles : Assemblée nationale, votes des députés (data.assemblee-nationale.fr) et programme des débats (assemblee-nationale.fr).", hashtags: hashtagsLegende({ genre: "carrousel-hebdo", chambre: "an", theme: "assemblee", max: 5 }) });
  const alts = specs.map((s, i) => `Image ${i + 1} sur ${total}. ${s.titre}. ${s.corps.map((b) => b.p || (b.li || []).join(" ; ") || (b.kv || []).map(([k, v]) => `${k} : ${v}`).join(", ") || b.carte || (b.cases ? b.cases.map(([k, v]) => `${k} : ${v}`).join(", ") : "")).filter(Boolean).join(" ")}`.slice(0, 990));
  return { contenu: {
    type: "carrousel-hebdo", cle: digest.id, rendu: { kind: "carrousel", specs, alts },
    entree: { titre: `Ce qu'il faut retenir cette semaine (${digest.id})`, titrePropre: "Résumé de la semaine au Parlement", sujets: [...textes.map((t) => t.titre), ...dossiers.map((d) => d.titre)], sources: ["https://data.assemblee-nationale.fr/travaux-parlementaires/votes", ...(sondage ? [sondage.url] : [])], legende, alt: alts[0], ...(sondage ? { reserve: true, nommePersonne: true } : {}) },
  } };
}

// ---------------------------------------------------------------------------------------------------------------------
// PLANIFICATION : quels contenus produire maintenant ?
// ---------------------------------------------------------------------------------------------------------------------
/** Posts (fil) du jour de Paris : file, brouillons et registre. */
function postsDuJour({ file, registre }, jour) {
  const ids = new Set();
  const post = (e) => e.type === "post" || e.type === "carousel";
  for (const e of file?.entrees || []) if (post(e) && e.cree && jourParis(e.cree) === jour) ids.add(e.id);
  for (const e of registre?.entrees || []) if (post(e) && e.statut === "publiee" && e.publieLe && jourParis(e.publieLe) === jour) ids.add(e.id);
  return ids.size;
}

/**
 * Contenus à produire à `now`. Fonction pure : toutes les données sont passées en argument.
 * donnees : { agenda, lois, senat, navette, indicateurs, budget, sondages, digest, notions } ; etat déjà réconcilié.
 * Renvoie { plan: [{ type, cle, id, pasAvant, expire, rendu, entree, notion?, chiffre? }], refus: { type: raison } }.
 */
function planifier({ now = new Date(), donnees, file, registre, brouillons = [], etat, creneaux, config }) {
  const plan = [], refus = {};
  if (config?.contenusAuto === false) return { plan, refus: { tous: "contenus automatiques désactivés (contenusAuto: false)" } };
  const { jour, isoWeekday } = parisInfos(now);
  const etatLocal = normaliserEtat(etat);
  const nowMs = now.getTime();
  let posts = postsDuJour({ file, registre }, jour);
  for (const c of creneauxDuJour(creneaux, isoWeekday)) {
    const t = TYPES[c.nom];
    if (!t) continue;
    const pasAvantIso = parisVersIso(jour, c.minutes);
    const pasAvant = Date.parse(pasAvantIso);
    if (nowMs < pasAvant - t.avance * 60000) { refus[c.nom] = "pas encore l'heure de préparer ce contenu"; continue; }
    const expireIso = new Date(pasAvant + t.validite * 60000).toISOString();
    if (nowMs >= Date.parse(expireIso)) { refus[c.nom] = "créneau dépassé"; continue; }
    if (!t.story && posts >= MAX_POSTS_PAR_JOUR) { refus[c.nom] = `déjà ${MAX_POSTS_PAR_JOUR} posts aujourd'hui`; continue; }
    let r;
    if (c.nom === "aujourdhui") r = choisirAujourdhui({ agenda: donnees.agenda, jour, now });
    else if (c.nom === "vote-jour") r = choisirVoteDuJour({ lois: donnees.lois, jour, now });
    else if (c.nom === "comprendre") r = choisirComprendre({ notions: donnees.notions || [], etat: etatLocal, jour });
    else if (c.nom === "chiffre-jour") r = choisirChiffre({ indicateurs: donnees.indicateurs, budget: donnees.budget, sondages: donnees.sondages, veille: donnees.veille, etat: etatLocal, jour, now });
    else if (c.nom === "carrousel-loi") r = choisirCarrouselLoi({ lois: donnees.lois, senat: donnees.senat, navette: donnees.navette, etat: etatLocal, jour, now, file, registre, brouillons });
    else if (c.nom === "carrousel-hebdo") r = choisirCarrouselHebdo({ digest: donnees.digest, jour, now });
    if (!r || r.refus) { refus[c.nom] = r?.refus || "inconnu"; continue; }
    const k = r.contenu;
    // Une seule fois par période : le contenu précis (vote, notion, chiffre…) ET la période (jour, ou semaine pour Comprendre et le résumé hebdomadaire)
    const faitCle = `${c.nom}|${k.cle}`;
    const periodeCle = `${c.nom}|${PERIODE_SEMAINE.has(c.nom) ? "semaine:" + semaineISO(jour).id : "jour:" + jour}`;
    const id = idContenu(c.nom, k.cle);
    if (etatLocal.faits[faitCle] || etatLocal.faits[periodeCle] || dejaCree(id, { file, registre, brouillons }) || plan.some((x) => x.id === id || x.periodeCle === periodeCle)) { refus[c.nom] = "déjà produit pour cette période"; continue; }
    // Filet si la mémoire des faits est perdue : une entrée de la file ou un brouillon du même type, pour la même période ou le même contenu
    const periodeDe = (iso) => (PERIODE_SEMAINE.has(c.nom) ? semaineISO(parisInfos(new Date(iso)).jour).id : parisInfos(new Date(iso)).jour);
    const memePeriode = (e) => e.contenu === c.nom && (String(e.periode) === String(k.cle) || (Number.isFinite(Date.parse(e.cree)) && periodeDe(e.cree) === periodeDe(now.toISOString())));
    if ([...(file?.entrees || []), ...(brouillons || [])].some(memePeriode)) { refus[c.nom] = "déjà produit pour cette période"; continue; }
    // Un même texte (dossier, titre officiel) ne ressort pas dans les 24 h sous un autre format (« Aujourd'hui à l'Assemblée » puis « Le vote du jour »)
    if (SUJET_UNIQUE_24H.has(c.nom)) {
      const siens = [k.entree.titrePropre, ...(k.entree.sujets || [])].filter(Boolean);
      const autre = sujetsRecents({ file, registre, brouillons, etat: etatLocal }, now, 24).concat(plan.flatMap((x) => [x.entree.titrePropre, ...(x.entree.sujets || [])].filter(Boolean).map((t) => ({ id: x.id, titre: t, contenu: x.nom }))))
        .find((x) => x.contenu !== c.nom && x.id !== id && siens.some((t) => SA.titresProches(x.titre, t)));
      if (autre) { refus[c.nom] = `sujet déjà publié ou en file depuis moins de 24 h (« ${autre.titre.slice(0, 80)} »)`; continue; }
    }
    if (!t.story) posts++;
    plan.push({ ...k, nom: c.nom, id, faitCle, periodeCle, pasAvant: pasAvantIso, expire: expireIso });
    etatLocal.faits[faitCle] = etatLocal.faits[periodeCle] = { id, le: now.toISOString() }; // deux créneaux du même type le même jour : un seul sort
  }
  return { plan, refus };
}

// ---------------------------------------------------------------------------------------------------------------------
// DESSIN (navigateur) ET ÉCRITURE
// ---------------------------------------------------------------------------------------------------------------------
const TYPES_MIME = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".js": "text/javascript", ".mjs": "text/javascript", ".woff2": "font/woff2", ".woff": "font/woff", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".css": "text/css", ".webmanifest": "application/manifest+json" };
async function servirSite(page, racine) {
  await page.route("**/*", async (route) => {
    const u = new URL(route.request().url());
    if (!(u.origin + u.pathname).startsWith(SITE.replace(/\/$/, "")) && u.origin !== new URL(SITE).origin) return route.abort();
    let rel = decodeURIComponent(u.pathname.slice(new URL(SITE).pathname.length));
    if (!rel || rel.endsWith("/")) rel += "index.html";
    const fichier = path.resolve(racine, rel);
    if (!fichier.startsWith(racine + path.sep) || !fs.existsSync(fichier) || !fs.statSync(fichier).isFile()) return route.fulfill({ status: 404, body: "" });
    route.fulfill({ status: 200, contentType: TYPES_MIME[path.extname(fichier)] || "application/octet-stream", body: fs.readFileSync(fichier) });
  });
}
/** Dessine des fiches avec le site lui-même (dessinerStory) : `jobs` = [{ type, spec }] ; renvoie des Buffers JPEG dans le même ordre. */
async function dessinerFiches(jobs, racine = RACINE) {
  const { chromium } = require("playwright");
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, serviceWorkers: "block" });
    const page = await ctx.newPage();
    await servirSite(page, racine);
    const erreurs = [];
    page.on("pageerror", (e) => erreurs.push(e.message));
    await page.goto(SITE, { waitUntil: "load" });
    await page.waitForFunction(() => typeof dessinerStory === "function", null, { timeout: 30000 });
    const urls = await page.evaluate(async (jobs) => {
      const out = [];
      for (const j of jobs) { const r = await dessinerStory(j.type, j.spec); out.push(r ? r.apercu : null); }
      return out;
    }, jobs);
    if (erreurs.length) console.warn("[contenus-auto] erreurs JavaScript du site :", erreurs.join(" | "));
    return urls.map((u, i) => {
      if (!u || !u.startsWith("data:image/jpeg;base64,")) throw new Error(`l'image ${jobs[i].type} n'a pas pu être dessinée`);
      return Buffer.from(u.slice("data:image/jpeg;base64,".length), "base64");
    });
  } finally {
    await browser.close();
  }
}

/** Contrôle d'une image : JPEG, dimensions exactes, poids. */
function controlerImage(buf, l, h, nom) {
  const dim = dimensionsJpeg(buf);
  if (!dim || dim.l !== l || dim.h !== h) throw new Error(`${nom} : image inattendue (${dim ? `${dim.l}×${dim.h}` : "pas un JPEG"}), ${l}×${h} attendu`);
  if (buf.length > MAX_OCTETS) throw new Error(`${nom} : image trop lourde (${buf.length} octets)`);
}
/** Noms des fichiers d'un contenu : story ou 1re image « <id>.jpg », suivantes « <id>-2.jpg »… */
const nomImage = (id, i) => (i === 0 ? id : `${id}-${i + 1}`);

/** Tâches de dessin d'un élément du plan. */
const tachesDessin = (p) => (p.rendu.kind === "story" ? [{ type: p.rendu.type, spec: p.rendu.spec }] : p.rendu.specs.map((spec) => ({ type: "diapo", spec })));

/**
 * Écrit un contenu (images + entrée de file ou brouillon). `images` : Buffers dans l'ordre. Renvoie l'entrée créée (ou la fiche de brouillon).
 * Jamais d'entrée sans image : toute image est relue après écriture.
 */
function ecrireContenu(p, images, { now, config, ch }) {
  const story = p.rendu.kind === "story";
  const [l, h] = story ? [1080, 1920] : [1080, 1350];
  images.forEach((b, i) => controlerImage(b, l, h, `${p.nom} (image ${i + 1})`));
  const vers = destination({ nommePersonne: Boolean(p.entree.nommePersonne) }, config);
  const dossier = vers === "brouillon" ? ch.brouillons : ch.img;
  fs.mkdirSync(dossier, { recursive: true });
  images.forEach((b, i) => {
    const f = path.join(dossier, `${nomImage(p.id, i)}.jpg`);
    fs.writeFileSync(f, b);
    if (!imageValide(f)) throw new Error(`l'image ${path.basename(f)} n'a pas été écrite correctement : aucune entrée ajoutée`);
  });
  const { nommePersonne, ...champs } = p.entree;
  const commun = { id: p.id, cree: now.toISOString(), medias: [], donneesPropres: true, contenu: p.nom, periode: p.cle, pasAvant: p.pasAvant, expire: p.expire, ...champs };
  const entree = story
    ? { ...commun, url_image: urlImage(p.id), type: "story" }
    : { ...commun, url_image: urlImage(p.id), url_images: images.map((_, i) => urlImage(nomImage(p.id, i))), type: "carousel", alts: p.rendu.alts };
  if (vers === "brouillon") {
    fs.writeFileSync(path.join(ch.brouillons, `${p.id}.json`), JSON.stringify({ ...entree, statut: "a-valider", nommePersonne: Boolean(nommePersonne) }, null, 1) + "\n");
  }
  return { entree, vers };
}

/** Supprime les images d'enfants de carrousel (« <id>-N.jpg ») qui ne servent plus (entrée absente de la file ou de plus de 3 jours). */
function nettoyerEnfants(entrees, ch, now) {
  if (!fs.existsSync(ch.img)) return [];
  const limite = now.getTime() - IMAGE_JOURS * 864e5;
  const gardes = new Set((entrees || []).filter((e) => Date.parse(e.cree) >= limite).map((e) => e.id));
  const supprimes = [];
  for (const f of fs.readdirSync(ch.img)) {
    const m = /^([0-9a-f]{12})-\d{1,2}\.jpg$/.exec(f);
    if (!m || gardes.has(m[1])) continue;
    fs.unlinkSync(path.join(ch.img, f));
    supprimes.push(f);
  }
  return supprimes;
}

function lireBrouillons(dossier) {
  if (!fs.existsSync(dossier)) return [];
  const out = [];
  for (const f of fs.readdirSync(dossier)) {
    if (!/^[0-9a-f]{12}\.json$/.test(f)) continue;
    const b = lireJson(path.join(dossier, f), null);
    if (b?.id) out.push(b);
  }
  return out;
}

/** Lit toutes les données utiles. */
function lireDonnees(ch, maintenant) {
  const lire = (f, d = null) => lireJson(path.join(ch.racine, f), d);
  const { jour } = parisInfos(maintenant);
  let html = "";
  try { html = fs.readFileSync(path.join(ch.racine, "index.html"), "utf-8"); } catch (e) { /* sans notions */ }
  return {
    agenda: lire("data/agenda-an.json"), lois: lire("data/lois.json"), senat: lire("data/senat.json"), navette: lire("data/navette.json"),
    indicateurs: lire("data/indicateurs.json"), budget: lire("data/budget.json"), sondages: lire("data/sondages.json"), veille: lire("data/sondages-veille.json"),
    digest: lire(`data/digest/${semaineISO(jour).id}.json`), notions: notionsComprendre(html),
  };
}

function resumeLigne(ligne) {
  console.log(`[contenus-auto] ${ligne}`);
  if (process.env.GITHUB_STEP_SUMMARY) { try { fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, "- " + ligne + "\n"); } catch (e) { /* sans résumé */ } }
}

/** Prépare l'état complet (config, créneaux, file…) à partir du disque. */
function lireEtat(ch, now) {
  const configBrute = lireJson(ch.config, {});
  const config = { ...lireConfig(ch.config), contenusAuto: configBrute?.contenusAuto !== false };
  const file = lireJson(ch.file, { entrees: [] });
  if (!Array.isArray(file.entrees)) file.entrees = [];
  const registre = lireJson(ch.registre, { entrees: [] });
  const etat = reconcilierEtat(lireJson(ch.etat, null), registre, now);
  return { config, creneaux: normaliserCreneaux(configBrute?.creneaux), file, registre, brouillons: lireBrouillons(ch.brouillons), etat, donnees: lireDonnees(ch, now) };
}

/** Mode --a-faire : « a_faire=true|false » (pour GITHUB_OUTPUT), sans navigateur. */
function aFaire(ch = chemins(), now = maintenant()) {
  const s = lireEtat(ch, now);
  const { plan } = planifier({ now, ...s });
  console.log(`a_faire=${plan.length ? "true" : "false"}`);
}
const maintenant = () => (process.env.CONTENUS_MAINTENANT ? new Date(process.env.CONTENUS_MAINTENANT) : new Date());

/** Produit les contenus dus. `dessiner(jobs)` est injectable (essais sans navigateur). Renvoie les entrées créées. */
async function main({ ch = chemins(), now = maintenant(), dessiner = (jobs) => dessinerFiches(jobs, ch.racine) } = {}) {
  const s = lireEtat(ch, now);
  const { plan, refus } = planifier({ now, ...s });
  for (const [k, v] of Object.entries(refus)) if (!/pas encore l'heure|créneau dépassé|déjà produit/.test(v)) console.log(`[contenus-auto] ${k} : ${v}.`);
  const crees = [];
  let { file, etat } = s;
  for (const p of plan) {
    try {
      // Test comparatif de styles (js/stories.js) : une story reçoit sa variante (hash de l'id % 4, scripts/stories-auto.cjs) ; « comprendre » n'a pas de nombre à mettre en avant, donc 3 styles
      const variante = p.rendu.kind === "story" ? SA.varianteDe(p.id, p.nom === "comprendre" ? SA.VARIANTES.filter((v) => v !== "chiffre") : SA.VARIANTES, s.config?.styleFixe) : null; // styleFixe (data/stories-config.json) : style imposé, sinon test comparatif
      if (variante) p.entree = { ...p.entree, variante };
      const jobs = tachesDessin(p).map((j) => (variante && variante !== "bleu" ? { ...j, spec: { ...j.spec, style: variante } } : j));
      const images = await dessiner(jobs);
      if (images.length !== jobs.length) throw new Error("nombre d'images inattendu");
      const { entree, vers } = ecrireContenu(p, images, { now, config: s.config, ch });
      if (vers === "file") file = { ...file, entrees: [...file.entrees, entree].slice(-GARDER) };
      const sujets = [p.entree.titrePropre, ...(p.entree.sujets || [])].filter((t) => typeof t === "string" && t).slice(0, 12);
      etat.faits[p.faitCle] = { id: p.id, le: now.toISOString(), sujets };
      etat.faits[p.periodeCle] = { id: p.id, le: now.toISOString() };
      if (p.nom === "comprendre") etat.comprendre.push({ cle: p.notion, id: p.id, date: parisInfos(now).jour });
      if (p.nom === "chiffre-jour") etat.chiffres[p.chiffre] = { id: p.id, date: parisInfos(now).jour };
      if (p.nom === "comprendre" && new Set(etat.comprendre.map((x) => x.cle)).size >= (s.donnees.notions || []).filter((n) => !motExclu(n.titre, OFF) && !motExclu(n.texte, OFF)).length) etat.comprendre = []; // cycle terminé : on repart de zéro
      crees.push({ ...entree, vers });
      resumeLigne(`${p.nom} : « ${entree.titre} » (${vers === "file" ? "file de publication" : "brouillon à valider"}, publiable à partir de ${p.pasAvant}).`);
    } catch (e) {
      resumeLigne(`ALERTE ${p.nom} : ${e.message} ; rien n'a été ajouté à la file.`);
    }
  }
  const nettoyes = nettoyerEnfants(file.entrees, ch, now);
  if (nettoyes.length) console.log(`[contenus-auto] images de carrousel anciennes supprimées : ${nettoyes.join(", ")}`);
  if (crees.some((c) => c.vers === "file")) {
    fs.mkdirSync(path.dirname(ch.file), { recursive: true });
    fs.writeFileSync(ch.file, JSON.stringify({ lastUpdated: now.toISOString(), entrees: file.entrees }, null, 1) + "\n");
    fs.writeFileSync(ch.atom, fluxAtom(file.entrees, now));
  }
  if (crees.length || JSON.stringify(etat) !== JSON.stringify(normaliserEtat(lireJson(ch.etat, null)))) {
    fs.writeFileSync(ch.etat, JSON.stringify({ lastUpdated: now.toISOString(), ...etat }, null, 1) + "\n");
  }
  return crees;
}

// ---------------------------------------------------------------------------------------------------------------------
// APERÇUS (instagram/modeles/) d'après tests/fixtures/contenus.json
// ---------------------------------------------------------------------------------------------------------------------
async function apercus(ch = chemins()) {
  const fx = lireJson(path.join(ch.racine, "tests", "fixtures", "contenus.json"), null);
  if (!fx) throw new Error("tests/fixtures/contenus.json introuvable");
  const now = new Date(fx.maintenant);
  const html = fs.readFileSync(path.join(ch.racine, "index.html"), "utf-8");
  const donnees = { ...fx.donnees, notions: notionsComprendre(html) };
  const creneaux = normaliserCreneaux(null);
  const sortie = path.join(ch.racine, "instagram", "modeles");
  fs.mkdirSync(sortie, { recursive: true });
  const faire = [];
  for (const [nom, instant] of Object.entries(fx.instants)) {
    const t = new Date(instant);
    const { plan } = planifier({ now: t, donnees, file: { entrees: [] }, registre: { entrees: [] }, etat: etatVide(), creneaux, config: { contenusAuto: true } });
    const p = plan.find((x) => x.nom === nom);
    if (!p) throw new Error(`aperçu ${nom} : aucun contenu planifié (${JSON.stringify(planifier({ now: t, donnees, file: { entrees: [] }, registre: { entrees: [] }, etat: etatVide(), creneaux, config: { contenusAuto: true } }).refus)})`);
    faire.push(p);
  }
  const jobs = faire.flatMap(tachesDessin);
  const imgs = await dessinerFiches(jobs, ch.racine);
  let k = 0;
  for (const p of faire) {
    const n = tachesDessin(p).length;
    for (let i = 0; i < n; i++) {
      const b = imgs[k++];
      controlerImage(b, 1080, p.rendu.kind === "story" ? 1920 : 1350, p.nom);
      const f = p.rendu.kind === "story" ? `contenu-${p.nom}.jpg` : `${p.nom}-${i + 1}.jpg`;
      fs.writeFileSync(path.join(sortie, f), b);
      console.log(`[contenus-auto] instagram/modeles/${f} (${Math.round(b.length / 1024)} Ko)`);
    }
  }
}

module.exports = {
  chemins, parisInfos, parisVersIso, semaineISO, dateLongue, TYPES, CRENEAUX_DEFAUT, heureEnMinutes, normaliserCreneaux, creneauxDuJour,
  etatVide, normaliserEtat, reconcilierEtat, dejaCree, idContenu, choisirAujourdhui, classerScrutin, choisirVoteDuJour, notionsComprendre, prochaineNotion, choisirComprendre,
  separerValeur, candidatsChiffres, choisirChiffre, etapeSuivante, votesFinaux, choisirCarrouselLoi, loiDejaTraitee, idPostLoi, sujetsRecents, choisirCarrouselHebdo, planifier, postsDuJour,
  controlerImage, ecrireContenu, nettoyerEnfants, main, aFaire, apercus, tachesDessin, dessinerFiches,
};

if (require.main === module) {
  const a = process.argv.includes("--a-faire") ? Promise.resolve(aFaire()) : process.argv.includes("--apercus") ? apercus() : main();
  a.catch((e) => { console.error("[contenus-auto]", e.message); process.exit(1); });
}
