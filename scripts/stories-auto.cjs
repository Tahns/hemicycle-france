#!/usr/bin/env node
/**
 * stories-auto.cjs
 * ----------------
 * File d'attente AUTOMATIQUE de stories Instagram : au plus UN sujet d'actualité par exécution,
 * dessiné par le site lui-même (dessinerStory("actualite", indice) dans index.html — aucun dessin dupliqué),
 * enregistré dans instagram/auto/<id>.jpg et listé dans data/instagram-file.json.
 * Ce script ne publie RIEN et n'appelle pas Instagram : un autre outil lit la file et les images.
 *
 * Règles (toutes obligatoires) pour qu'un sujet de data/actualites.json soit retenu :
 *  - repris par au moins 3 médias, OU prise de parole du président de la République (data/direct.json) ;
 *  - dernière mise à jour il y a moins de 3 h ;
 *  - pas déjà en file (id = empreinte du titre central, ou lien d'article déjà utilisé) ;
 *  - aucun mot de la liste prudente (mise en cause, accusation, enquête, violence, décès, mineur,
 *    victime, fait divers…), pas de thème « justice » : mieux vaut manquer une story que publier à tort ;
 *  - un sujet de presse n'est retenu que s'il a un titre rédigé par le site (« titrePropre », scripts/titres-propres.cjs) ;
 *    un dossier a toujours le sien. Sinon on passe : mieux vaut ne rien publier qu'un titre de presse en grand titre.
 *    L'entrée de file reçoit « titrePropre » et « videos » [{ media, url }] (liens vidéo, placés en tête de « sources »).
 *  - DOSSIER (data/actualites.json, « dossiers » : un sujet dominant repris par >= 4 médias) : un dossier non encore publié
 *    (champ dossierId du journal) passe AVANT les sujets simples, avec les mêmes plafonds, horaires et fraîcheur ;
 *    ses titres sont déjà filtrés (faits divers et accusations écartés) ;
 *  - au plus 4 entrées par jour (UTC+2) ; aucune entre 23 h et 7 h, heure de Paris.
 * On garde les 30 dernières entrées ; les images de plus de 3 jours sont supprimées.
 *
 * MODÈLES D'IMAGE (direction artistique « fond bleu », js/stories-actu*.js) : le choix du modèle est automatique, avec les mêmes règles de prudence :
 *  - « À la une »      : le sujet fort retenu ci-dessus (modèle par défaut) ;
 *  - « Dossier »       : un dossier non publié (voir plus haut) ;
 *  - « En direct »     : le sujet dont un titre correspond à une prise de parole active de data/direct.json (hors séances de l'Assemblée, événement non expiré) ;
 *  - « Le chiffre »    : seulement si le chiffre du sujet figure tel quel dans les titres d'au moins 2 médias ;
 *  - « Face à face »   : seulement si les deux premières personnalités du sujet sont des candidats déclarés (data/candidats.json) et qu'aucun titre n'est conflictuel ;
 *  - « Date à retenir »: seulement si le sujet annonce une date À VENIR à 3 jours ou moins (story) ; au-delà (jusqu'à 180 jours) c'est un POST « post-date » (voir plus bas) ;
 *  - « En bref »       : une fois par jour, le matin (7 h – 11 h, Paris) : 3 ou 4 sujets forts (3 médias au moins, titre rédigé par le site, aucun mot de la liste prudente).
 *    Les liens de ses sujets sont enregistrés : aucun de ces sujets n'aura aussi sa propre image le même jour (pas de doublon).
 *  Tous comptent dans le plafond de 4 entrées par jour, respectent la nuit (23 h – 7 h), le fichier data/stories-config.json et ne sont jamais produits en monétisation.
 *
 * POSTS (fil, image 1080 × 1350, entrée { type: "post", legende }) : seulement (a) une date à retenir lointaine (> 3 jours) et (b) une loi ADOPTÉE ou REJETÉE
 * (vote final de l'Assemblée ou du Sénat, résultat officiel : choisirPostLoi). Chaque post est accompagné d'une story d'annonce (entrée { type: "story", annonceDe }),
 * dessinée en même temps (js/stories-post.js) et publiée par publier-stories.cjs au plus tôt 5 min après le post. 2 posts par jour au plus ; les posts et annonces
 * ne comptent pas dans les 4 stories par jour. Mêmes garde-fous anti-doublon que les stories (id stable, titres proches sur 36 h, registre des publications).
 *
 * DÉCLENCHEUR « NOUVEAU SONDAGE » (prioritaire sur les actualités) : si data/sondages.json contient une enquête d'intentions de vote
 * au premier tour de la présidentielle plus récente que la dernière déjà mise en file (entrée « story » avec champ sondageId,
 * « Institut|AAAA-MM-JJ »), publiée il y a moins de 48 h, on dessine la story « sondages » du site limitée à CETTE enquête
 * (institut, commanditaire s'il est connu, dates de terrain, échantillon, marge d'erreur, mention de la notice déposée à la Commission
 * des sondages, source ; chiffres tels que publiés, aucune moyenne ni « gagnant »). Hors plafond de 4 par jour (2 sondages par jour
 * au plus) ; autorisé jusqu'à 23 h 30 (heure de Paris). JAMAIS pendant la réserve électorale (loi du 19 juillet 1977, art. 11 : même
 * calcul que periodeReserveSondages() du site) : les stories de sondage encore en file y sont retirées.
 *
 * SUJETS SENSIBLES (justice, mises en cause ; scripts/sujets-sensibles.cjs, docs/PUBLICATION-AUTO.md) : les sujets que les règles ci-dessus écartent ne sont plus perdus :
 *  - niveau 1 (une juridiction ET une décision citées par au moins « minMediasSensible » médias) : story AUTOMATIQUE au texte fabriqué par règles (attribution, juridiction, date, sources,
 *    aucun nom, « présumée innocente ») ; entrée de file { sensible: 1 } ;
 *  - niveau 2 (accusation, plainte, polémique, révélation d'un seul média) : JAMAIS en file, seulement un brouillon { sensible: 2 } validé d'un geste (workflow « Valider un brouillon »).
 *  Faits divers, mineurs, violences sexuelles, décès, suicide : toujours écartés. Mêmes garde-fous (réserve, doublons, 7 h – 23 h, plafonds).
 *
 * CONFIGURATION (data/stories-config.json, lue à chaque exécution ; absente ou invalide : tout à false) :
 *  - monetisation (false par défaut) : à true, AUCUN dossier ni sujet de presse (aucun titre de média dans l'image) ; seulement
 *    des données propres : sondage (hors réserve), vote final de l'Assemblée ou du Sénat, simulation « probabilités » (hors réserve).
 *    Les entrées de presse encore en file sont retirées. À false : comportement historique, inchangé.
 *  - validationHumaine (false par défaut) : à true — ou, en monétisation, dès que l'image nomme une personne (sondage, simulation) —
 *    rien n'entre dans la file de publication : un brouillon (instagram/brouillons/<id>.jpg + .json) est écrit et une ligne
 *    est ajoutée à $GITHUB_STEP_SUMMARY ; un humain valide puis publie. Les brouillons de sondage sont supprimés pendant la réserve.
 *
 * USAGE : node scripts/stories-auto.cjs   (--a-faire : dit seulement s'il y a un sujet à traiter ; nécessite le paquet « playwright » et Chromium)
 * Variables facultatives : SITE_URL, GITHUB_REPOSITORY, CHROMIUM_PATH, STORIES_AUTO_MAINTENANT (ISO, pour essais).
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { concerneLaFrance } = require("./pertinence.cjs");
const SS = require("./sujets-sensibles.cjs");

const RACINE = path.resolve(__dirname, "..");
const FICHIER_FILE = path.join(RACINE, "data", "instagram-file.json");
const DOSSIER_IMG = path.join(RACINE, "instagram", "auto");
const FICHIER_CONFIG = path.join(RACINE, "data", "stories-config.json");
const DOSSIER_BROUILLONS = path.join(RACINE, "instagram", "brouillons");
const [PROPRIO, DEPOT] = (process.env.GITHUB_REPOSITORY || "Tahns/hemicycle-france").split("/");
const SITE = process.env.SITE_URL || `https://${PROPRIO.toLowerCase()}.github.io/${DEPOT}/`;

// Loi n° 77-808 du 19 juillet 1977, art. 11 : mêmes dates et même calcul que index.html (TOURS_PRESIDENTIELLE, calculReserveSondages)
const TOURS_PRESIDENTIELLE = ["2027-04-18", "2027-05-02"];
const MAX_SONDAGES_PAR_JOUR = 2;
const SONDAGE_FRAICHEUR_H = 48;
const SONDAGE_DERNIERE_MINUTE = 23 * 60 + 30; // un sondage qui vient de sortir peut être mis en file jusqu'à 23 h 30
const MOIS = { janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12 };

const BREF_DEBUT_H = 7, BREF_FIN_H = 11; // « En bref » : une fois par jour, le matin (heure de Paris)
const BREF_FRAICHEUR_H = 12, BREF_MIN = 3, BREF_MAX = 4, BREF_MIN_MEDIAS = 3;
const DATE_MAX_JOURS = 180;
const DATE_STORY_MAX_JOURS = 3; // date à venir à 3 jours ou moins : story « Date à retenir » ; au-delà : POST (puis story d'annonce)
const MAX_POSTS_PAR_JOUR = 2; // posts (fil Instagram) par jour ; les stories d'annonce n'entrent pas dans le plafond des stories
const POST_FENETRE_DOUBLON_H = 36; // un post proche d'un post/story publié depuis moins de 36 h est refusé
const POST_VOTE_FRAICHEUR_J = 2; // un vote final de plus de 2 jours n'est plus « récent » : pas de post
const MAX_PROPRES_PAR_JOUR = 3; // stories « données propres » (monétisation) par jour, brouillons compris
const PROPRES_FRAICHEUR_J = 2; // un vote de plus de 2 jours n'est plus « récent »
const BROUILLON_JOURS = 7;

let MIN_MEDIAS = 3; // réglable par data/stories-config.json (« minMedias »)
const FRAICHEUR_H = 3; // direct du président et sujets sensibles de niveau 1
let FRAICHEUR_SUJET_H = 12; // sujets et dossiers (data/stories-config.json, « fraicheurH ») : un sujet à 3 médias arrivé la nuit reste publiable le matin
let MAX_PAR_JOUR = 4; // réglable par data/stories-config.json (« maxParJour »)
let MIN_MEDIAS_DOSSIER = 4, EN_BREF = true; // « dossierMedias », « enBref »
const GARDER = 30;
const IMAGE_JOURS = 3;
const MAX_OCTETS = 8 * 1024 * 1024;

// Liste prudente UNIQUE (mots entiers, sans accents) : scripts/liste-prudente.cjs, partagée avec titres-propres, publier-stories, sujets-sensibles et contenus-auto.
const LP = require("./liste-prudente.cjs");
const { sourcesDistinctes } = require("./regroupement.cjs"); // « repris par N médias » : médias DISTINCTS (un groupe de presse ou une dépêche reprise à l'identique compte une fois)
const { lireRetiresSur } = require("./retires.cjs"); // contenus retirés (data/instagram-retires.json) : leur texte n'est jamais repris (audit J-23)
const { hashtags: hashtagsLegende } = require("./legendes.cjs"); // hashtags neutres des légendes (jamais de nom propre)
const SC = require("./sondage-commanditaire.cjs"); // commanditaire d'un sondage (mention obligatoire)
const { sansAccent } = LP;

// Rubriques génériques : un titre rédigé « Énergie » ou « Économie » ne dit rien (pas de story)
const RUBRIQUES_GENERIQUES = new Set(["energie", "economie", "social", "politique", "societe", "international", "monde", "france", "budget", "justice", "culture", "sante", "education", "ecologie", "environnement", "securite", "sport", "europe", "gouvernement", "vie politique", "elections", "election", "senat", "assemblee"]);
/** Un titre rédigé trop vague : un seul mot, ou une simple rubrique. */
function titreGenerique(titre) {
  const t = sansAccent(titre).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  return !t || RUBRIQUES_GENERIQUES.has(t) || t.split(" ").filter((w) => w.length > 2).length < 2;
}

// Mots du gabarit « X : l'essentiel du moment » : ils ne désignent pas un sujet (J-09)
const MOTS_VIDES = new Set(["des", "les", "une", "pour", "par", "dans", "avec", "sans", "cette", "ces", "que", "qui", "sur", "aux", "est", "sont", "essentiel", "moment", "suivi", "journee", "editorial", "actualite"]);
// Sigles (respect de la casse : « an » est aussi un nom commun) et formes longues ramenés à une même forme avant le calcul des racines (D).
// Les noms d'institutions ou de partis (« entités ») ne suffisent JAMAIS à eux seuls à dire que deux titres parlent du même sujet.
const SIGLES = [[/\bRN\b/g, "rassemblement national"], [/\bLFI\b/g, "france insoumise"], [/\bPS\b/g, "parti socialiste"], [/\bLR\b/g, "republicains"], [/\bAN\b/g, "assemblee nationale"], [/\bPLFSS\b/g, "projet loi financement securite sociale"], [/\bPLF\b/g, "projet loi finances"]];
const FORMES = [[/\bprojet de loi de finances\b/g, "projet loi finances"], [/\bprojet de loi de financement de la securite sociale\b/g, "projet loi financement securite sociale"], [/\belections? presidentielles?\b/g, "presidentielle"], [/\bla france insoumise\b/g, "france insoumise"], [/\bles republicains\b/g, "republicains"]];
const ENTITES = new Set(["rasse", "natio", "franc", "insou", "parti", "socia", "repub", "assem"]);
const normaliserSujet = (t) => {
  let x = String(t || "");
  for (const [re, par] of SIGLES) x = x.replace(re, par);
  x = sansAccent(x);
  for (const [re, par] of FORMES) x = x.replace(re, par);
  return x;
};
const racines = (t) => new Set(normaliserSujet(t).replace(/[^a-z0-9]+/g, " ").split(" ").filter((w) => w.length >= 4 && !MOTS_VIDES.has(w)).map((w) => w.slice(0, 5)));
/** Deux titres rédigés parlent-ils du même sujet (« Blocage des lycées » / « Blocus des lycées » ; « Le RN tient son congrès » / « Congrès du Rassemblement National ») ? */
function titresProches(a, b) {
  const x = racines(a), y = racines(b);
  if (!x.size || !y.size) return false;
  const communs = [...x].filter((w) => y.has(w));
  if (!communs.some((w) => !ENTITES.has(w))) return false; // un parti ou une institution en commun ne fait pas un même sujet
  return communs.length / Math.min(x.size, y.size) >= 0.5;
}
const RECENT_H = 24;
/** Titres d'une entrée pour la détection de doublons. Une entrée « sensible » a un titre-formule (« Selon … : … ») semblable d'un sujet à l'autre : on compare le titre de presse (sujets), jamais la formule. */
const titresDe = (e) => [e.sensible ? null : e.titrePropre, ...(Array.isArray(e.sujets) ? e.sujets : [])];
/** Titres rédigés des entrées (file + brouillons) des dernières 24 h : un sujet proche ne repasse pas le même jour. */
function titresRecents(entrees, now) {
  const retires = lireRetiresSur();
  return (entrees || []).filter((e) => !retires.has(e.id) && now.getTime() - Date.parse(e.cree) < RECENT_H * 36e5).flatMap(titresDe).filter((t) => typeof t === "string" && t);
}
const dejaVu = (titre, recents) => recents.some((t) => titresProches(t, titre));

/** Une entrée compte-t-elle dans le plafond des STORIES (hors sondages, posts et stories d'annonce de post) ? */
const estStoryComptee = (e) => !e.sondageId && e.type !== "post" && e.type !== "reel" && e.type !== "carousel" && !e.annonceDe && !e.contenu && e.sensible !== 2; // niveau 2 sensible (brouillons, validations humaines) hors plafond ; ni les contenus récurrents (scripts/contenus-auto.cjs)
/** Posts du jour (UTC+2) : ceux de la file (et des brouillons) et ceux du registre des publications, sans double compte. */
function nbPostsDuJour(entrees, registre, now) {
  const jour = jourUTC2(now);
  const ids = new Set();
  for (const e of entrees || []) if ((e.type === "post" || e.type === "carousel") && jourUTC2(e.cree) === jour) ids.add(e.id);
  for (const e of registre?.entrees || []) if ((e.type === "post" || e.type === "carousel") && e.statut === "publiee" && e.publieLe && jourUTC2(e.publieLe) === jour) ids.add(e.id);
  return ids.size;
}
/** Titres (rédigés, sujets, titres du registre) des entrées de la file et du registre sur les dernières `h` heures. */
function titresRecentsH(entrees, registre, now, h) {
  const garde = (iso) => now.getTime() - Date.parse(iso) < h * 36e5;
  const retires = lireRetiresSur(); // le texte d'un contenu retiré n'est jamais repris
  return [
    ...(entrees || []).filter((e) => e.cree && garde(e.cree) && !retires.has(e.id)).flatMap(titresDe),
    ...(registre?.entrees || []).filter((e) => e.statut === "publiee" && e.publieLe && garde(e.publieLe) && !retires.has(e.id)).flatMap((e) => [e.sensible ? null : e.titre, ...(Array.isArray(e.sujets) ? e.sujets : [])]),
  ].filter((t) => typeof t === "string" && t);
}

const FENETRE_PRESSE_H = 72; // un sujet de presse déjà publié (file OU registre) ne revient pas avant 72 h
const normTitre = (t) => sansAccent(String(t || "")).replace(/[^a-z0-9]+/g, " ").trim();
const ecartJours = (a, b) => (/^\d{4}-\d{2}-\d{2}$/.test(a || "") && /^\d{4}-\d{2}-\d{2}$/.test(b || "")) ? Math.abs(Date.parse(a + "T12:00:00Z") - Date.parse(b + "T12:00:00Z")) / 864e5 : Infinity;
/**
 * Entrées de la file ET du registre des publications des dernières `h` heures, fusionnées par id : { id, t, titres, dateIso, sources, presse }.
 * `titres` = titres rédigés, titres de presse de la fiche et sujets (jamais le titre-formule d'une entrée sensible) ; `presse` = story sans date d'événement ni donnée propre.
 */
function entreesRecentes(entrees, registre, now, h) {
  const retires = lireRetiresSur();
  const garde = (iso) => iso && now.getTime() - Date.parse(iso) < h * 36e5;
  const parId = new Map();
  const ajouter = (e, iso) => {
    if (!e?.id || retires.has(e.id) || !garde(iso)) return;
    const r = parId.get(e.id) || { id: e.id, t: 0, titres: [], dateIso: null, sources: [], presse: true };
    r.t = Math.max(r.t, Date.parse(iso));
    for (const t of [e.sensible ? null : e.titrePropre, e.sensible ? null : e.titre, ...(Array.isArray(e.sujets) ? e.sujets : [])]) if (typeof t === "string" && t && !r.titres.includes(t)) r.titres.push(t);
    if (/^\d{4}-\d{2}-\d{2}$/.test(e.dateIso || "")) r.dateIso = e.dateIso;
    for (const u of Array.isArray(e.sources) ? e.sources : []) if (typeof u === "string" && !r.sources.includes(u)) r.sources.push(u);
    if (e.type === "post" || e.donneesPropres || e.sondageId || e.annonceDe || e.type === "reel") r.presse = false;
    parId.set(e.id, r);
  };
  for (const e of entrees || []) ajouter(e, e.cree);
  for (const e of registre?.entrees || []) if (e.statut === "publiee") ajouter(e, e.publieLe);
  return [...parId.values()];
}
/** Deux événements datés sont-ils le même ? Titres proches et dates à un jour près, ou titre identique à 3 jours près (C). */
function memeEvenement(rec, titre, iso) {
  if (!rec.dateIso) return false;
  const ecart = ecartJours(rec.dateIso, iso);
  if (ecart <= 1 && rec.titres.some((t) => titresProches(t, titre))) return true;
  return ecart <= 3 && rec.titres.some((t) => normTitre(t) === normTitre(titre));
}
/** Un événement daté `iso` de titre `titre` a-t-il déjà été publié (file ou registre, sauf les ids de `sauf`) ? */
const evenementDejaPublie = (entrees, registre, now, titre, iso, sauf = []) =>
  entreesRecentes(entrees, registre, now, 400 * 24).some((r) => !sauf.includes(r.id) && memeEvenement(r, titre, iso));
/** Un article de presse (lien ou titre identique) a-t-il déjà servi dans la file ou le registre des dernières 72 h ? */
function articlesDejaPublies(articles, recs) {
  const urls = new Set(recs.flatMap((r) => r.sources));
  const titres = new Set(recs.flatMap((r) => r.titres).map(normTitre).filter(Boolean));
  return (articles || []).some((a) => (a?.url && urls.has(a.url)) || (a?.titre && titres.has(normTitre(a.titre))));
}

/**
 * Nombre de médias DISTINCTS d'un sujet ou d'un dossier (audit J-21) : Le Progrès, DNA, Le Dauphiné libéré et L'Est républicain (groupe EBRA) qui publient la même dépêche
 * comptent pour un. Calculé par regroupement.cjs (sourcesDistinctes) ; une valeur « mediasDistincts » fournie par les données ne peut que RÉDUIRE le décompte.
 */
function mediasDistinctsDe(articles, fourni) {
  const calcule = sourcesDistinctes(articles || []).mediasDistincts;
  return Number.isInteger(fourni) && fourni >= 0 ? Math.min(calcule, fourni) : calcule;
}
/** Un libellé par source distincte (affiché sous « Repris par N médias »). */
const sourcesDe_ = (articles) => sourcesDistinctes(articles || []).sources;

/** Pourquoi un titre est écarté (null s'il passe). { officiel: true } : donnée officielle (ordre du jour, scrutin, texte de loi), liste réduite. */
const motExclu = (titre, opts) => LP.motExclu(titre, opts);
/** Donnée officielle (ordre du jour, scrutin, texte de loi, notion du site) : liste réduite, sans accusation possible (voir liste-prudente.cjs). */
const OFF = { officiel: true };

/** Réserve électorale : renvoie le tour concerné (« AAAA-MM-JJ ») si now tombe du samedi 0 h au dimanche 20 h (Paris), sinon null. */
function reserveSondages(now) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(now).map((x) => [x.type, x.value]));
  const paris = `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  return TOURS_PRESIDENTIELLE.find((tour) => {
    const veille = new Date(Date.parse(tour + "T12:00:00Z") - 864e5).toISOString().slice(0, 10);
    return paris >= `${veille}T00:00` && paris < `${tour}T20:00`;
  }) || null;
}

/**
 * Réserve pour une STORY (ou tout contenu qui reste visible 24 h) : la réserve elle-même, ou le début de la réserve dans les 24 h à venir.
 * Une story publiée vendredi 22 h reste visible jusqu'à samedi 22 h, donc pendant la réserve (audit J-15) : rien de ce qui cite un sondage ne part
 * dans les 24 h qui précèdent la réserve. Renvoie le tour concerné ou null.
 */
const reserveStory = (now) => reserveSondages(now) || reserveSondages(new Date(new Date(now).getTime() + 24 * 36e5));

// Réserve électorale (loi du 19 juillet 1977) : aucun résultat de sondage, pas même repris d'un titre de presse.
// Instituts (liste de data/sondages.json et de la Commission des sondages), formulations de résultat (« crédité de », « pourrait recueillir », « sondés »)
// et pourcentage accolé à un tour de scrutin (« Bardella en tête avec 36 % au premier tour »).
const RE_SONDAGE = /sondage|sonde(?:e|s|es)?\b|intentions? de (?:vote|suffrage)|estimations? de vote|enquete d'opinion|barometre|\bifop|\belabe\b|\bodoxa|\bipsos|opinion ?way|harris interactive|\btoluna|cluster ?17|\byougov|\bviavoice|\bbva\b|\bkantar|\bverian|\bcsa\b|\bcredite(?:e|s|es)? (?:de|a|d')|\brecueill|\bprojections?\b|\bcotes? de (?:popularite|confiance)|\bpopularite\b|\bpremier tour\b.*\d ?%|\d ?%.*\b(?:premier tour|second tour|1er tour|2e tour|2nd tour)\b|\bdevance\b.*\d ?%|\ben tete\b.*\d ?%|\d ?%.*\ben tete\b|selon (?:l'|le |la |les )?(?:ifop|elabe|odoxa|ipsos|opinionway|harris|toluna|cluster17|yougov|viavoice|bva|kantar)/;
const parleDeSondage = (titre) => RE_SONDAGE.test(sansAccent(titre));

/** Empreinte stable du titre central du sujet. */
function idSujet(titre) {
  const t = sansAccent(titre).replace(/[^a-z0-9]+/g, " ").trim();
  return crypto.createHash("sha1").update(t).digest("hex").slice(0, 12);
}

const heureParis = (d) => Number(new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", hourCycle: "h23" }).formatToParts(d).find((p) => p.type === "hour").value);
/** Jour (AAAA-MM-JJ) en UTC+2. */
const jourUTC2 = (d) => jourParis(d); // nom historique : c'est le jour à Paris, été comme hiver (audit J-20 ; l'ancien « +2 h » fixe se trompait en hiver)

const minutesParis = (d) => { const p = Object.fromEntries(new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value])); return Number(p.hour) * 60 + Number(p.minute); };

/** Jour de publication d'une enquête (AAAA-MM-JJ) : celui du nom du fichier de la notice (« …-30-septembre.pdf ») s'il est plausible, sinon le lendemain de la fin du terrain. */
function jourPublication(inst) {
  const lendemain = new Date(Date.parse(inst.dateFin + "T12:00:00Z") + 864e5).toISOString().slice(0, 10);
  const m = /-(\d{1,2})-(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\.pdf(?:$|\?)/i.exec(sansAccent(String(inst.url || "")));
  if (!m) return lendemain;
  const mois = MOIS[m[2].toLowerCase()];
  let an = Number(inst.dateFin.slice(0, 4));
  if (mois < Number(inst.dateFin.slice(5, 7)) - 6) an++; // terrain en décembre, publication en janvier
  const jour = `${an}-${String(mois).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;
  const ecart = (Date.parse(jour + "T12:00:00Z") - Date.parse(inst.dateFin + "T12:00:00Z")) / 864e5;
  return ecart >= 0 && ecart <= 10 ? jour : lendemain;
}

/**
 * Choisit au plus une enquête (premier tour) à mettre en story. Renvoie { sondage: {...}, id, sondageId, indice } ou { refus }.
 * Règles : pas de réserve électorale ; ni la nuit (avant 7 h, après 23 h 30) ; pas plus de 2 sondages par jour ;
 * enquête plus récente que la dernière mise en file, jamais déjà en file, publiée il y a moins de 48 h.
 */
function choisirSondage({ sondages, file, now = new Date(), veille = null }) {
  const reserve = reserveStory(now);
  if (reserve) return { refus: `réserve électorale (scrutin du ${reserve}) : aucune story de sondage dans les 24 h qui précèdent ni pendant la réserve` };
  const m = minutesParis(now);
  if (m < 7 * 60 || m > SONDAGE_DERNIERE_MINUTE) return { refus: "nuit pour un sondage (7 h – 23 h 30 à Paris)" };
  const entrees = file?.entrees || [];
  const jour = jourUTC2(now);
  if (entrees.filter((e) => e.sondageId && jourUTC2(e.cree) === jour).length >= MAX_SONDAGES_PAR_JOUR) return { refus: `déjà ${MAX_SONDAGES_PAR_JOUR} sondages aujourd'hui` };
  const enFile = new Set(entrees.map((e) => e.sondageId).filter(Boolean));
  const derniere = [...enFile].map((x) => x.split("|")[1]).sort().pop() || "";
  const candidats = [];
  let sansCommanditaire = 0;
  (sondages?.instituts || []).forEach((inst, indice) => {
    if (!inst?.nom || !/^\d{4}-\d{2}-\d{2}$/.test(inst.dateFin || "") || !inst.scores) return;
    const sondageId = `${inst.nom}|${inst.dateFin}`;
    if (enFile.has(sondageId) || inst.dateFin <= derniere) return;
    if (Object.keys(inst.scores).length < 3 || !(inst.echantillon > 0)) return; // mentions obligatoires impossibles sans échantillon
    if (!SC.commanditaire(inst, veille)) { sansCommanditaire++; return; } // loi du 19 juillet 1977, art. 2 : le commanditaire est une mention obligatoire (audit J-16)
    const age = now.getTime() - Date.parse(`${jourPublication(inst)}T00:00:00+02:00`);
    if (age > SONDAGE_FRAICHEUR_H * 36e5 || age < -36e5 * 24) return;
    candidats.push({ indice, inst, sondageId });
  });
  if (!candidats.length) return { refus: sansCommanditaire ? `aucun sondage publiable : commanditaire inconnu (${sansCommanditaire} enquête(s)), mention obligatoire` : "aucun nouveau sondage" };
  candidats.sort((a, b) => b.inst.dateFin.localeCompare(a.inst.dateFin));
  const c = candidats[0];
  return { sondage: c.inst, commanditaire: SC.commanditaire(c.inst, veille).nom, indice: c.indice, sondageId: c.sondageId, id: crypto.createHash("sha1").update("sondage|" + c.sondageId).digest("hex").slice(0, 12) };
}

/** La prise de parole du président détectée par detecter-direct.js (non expirée) concerne-t-elle ce sujet ? */
function presidentParle(sujet, direct, now = new Date()) {
  const titres = new Set((direct?.evenements || []).filter((e) => e.type !== "seance-an" && !(e.expire && Date.parse(e.expire) <= now.getTime())).map((e) => e.titre));
  return (sujet.articles || []).some((a) => titres.has(a.titre));
}

/** Jour (AAAA-MM-JJ) à Paris. */
const jourParis = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(d));

// Mots d'un titre qui opposent frontalement deux personnes : pas de « face à face » (l'image resterait neutre, le titre non)
const RE_CONFLIT = /\b(attaque|attaquent|tacle|taclent|clash|charge|descend|flingue|fustige|accable|regle ses comptes|insulte|traite de|lynch|clivage|guerre|affronte|s'oppose|se dechire|se dechirent|invective|dezingue|etrille|tire sur)\b/;

const RE_DUEL = /\b(debat|debats|duel|primaire|primaires|face a face|face-a-face|confrontation)\b/;

/** Candidats déclarés (data/candidats.json), noms sans accents. */
const nomsCandidats = (candidats) => new Set((candidats?.candidats || (Array.isArray(candidats) ? candidats : [])).map((c) => sansAccent(c?.nom || c)).filter(Boolean));

/** « Face à face » : les deux premières personnalités du sujet (celles que dessine l'image) sont des candidats déclarés, et aucun titre n'est conflictuel. */
function faceAFace(sujet, candidats) {
  const noms = nomsCandidats(candidats);
  const pers = (sujet.illustration?.personnes || []).slice(0, 2).map((p) => sansAccent(p?.nom));
  if (pers.length < 2 || pers[0] === pers[1] || !pers.every((n) => noms.has(n))) return false;
  const arts = (sujet.articles || []).map((a) => sansAccent(a.titre));
  // « Face à face » affirme une opposition : il faut un débat, un duel ou une primaire dans les titres, et aucun mot de conflit
  return arts.some((t) => RE_DUEL.test(t)) && !arts.some((t) => RE_CONFLIT.test(t));
}

/** « Le chiffre » : le chiffre du sujet (« 400 à 500 ») figure tel quel dans les titres d'au moins 2 médias différents. */
function chiffreSource(sujet) {
  const valeur = String(sujet.chiffre?.valeur || "");
  const nombres = valeur.match(/\d+(?:[.,]\d+)?/g);
  if (!nombres?.length) return false;
  return nombres.every((n) => {
    const re = new RegExp(`(^|[^0-9])${n.replace(/[.,]/g, "[.,]")}([^0-9]|$)`);
    return new Set((sujet.articles || []).filter((a) => re.test(sansAccent(a.titre))).map((a) => a.media)).size >= 2;
  });
}

/** « Date à retenir » : une date À VENIR (demain ou plus tard, au plus 180 jours) annoncée dans les titres. */
function dateAVenir(sujet, now = new Date()) {
  const iso = sujet.date?.iso;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || "") || !sujet.date.jour || !sujet.date.mois) return false;
  const jours = (Date.parse(iso + "T12:00:00Z") - Date.parse(jourParis(now) + "T12:00:00Z")) / 864e5;
  return jours >= 1 && jours <= DATE_MAX_JOURS;
}
/** Nombre de jours (Paris) avant la date annoncée du sujet. */
const joursAvantDate = (sujet, now = new Date()) => Math.round((Date.parse(sujet.date.iso + "T12:00:00Z") - Date.parse(jourParis(now) + "T12:00:00Z")) / 864e5);

/** Modèle d'image d'un sujet retenu : direct, facea, chiffre, date ou une (par défaut). */
function modeleSujet(sujet, { direct = null, candidats = null, now = new Date() } = {}) {
  if (presidentParle(sujet, direct, now)) return "direct";
  if (faceAFace(sujet, candidats)) return "facea";
  if (chiffreSource(sujet)) return "chiffre";
  if (dateAVenir(sujet, now)) return joursAvantDate(sujet, now) > DATE_STORY_MAX_JOURS ? "post-date" : "date"; // date lointaine : un POST, pas une story
  return "une";
}

/** Identifiant d'une story de dossier. */
const idDossier = (id) => crypto.createHash("sha1").update("dossier|" + id).digest("hex").slice(0, 12);

/** Liens vidéo des articles (signalés par le site, jamais intégrés) : [{ media, url }], sans doublon. */
const liensVideo = (articles) => [...new Map((articles || []).filter((a) => a?.video === true && /^https:\/\//.test(a.url || "")).map((a) => [a.url, { media: a.media, url: a.url }])).values()];
/** Sources de la fiche : les liens vidéo en tête, puis les articles (12 au plus, sans doublon). */
const sourcesDe = (articles, videos) => [...new Set([...videos.map((v) => v.url), ...(articles || []).map((a) => a.url).filter((u) => /^https:\/\//.test(u || ""))])].slice(0, 12);

/** Un dossier (actualites.dossiers) non encore publié, frais, sans mot de la liste prudente ; renvoie { dossier, id, medias } ou null. */
function choisirDossier({ actualites, file, registre = null, now = new Date() }) {
  const entrees = file?.entrees || [];
  const enFile = new Set(entrees.map((e) => e.dossierId).filter(Boolean));
  const ids = new Set([...entrees.map((e) => e.id), ...(registre?.entrees || []).map((e) => e.id)]);
  const recs72 = entreesRecentes(entrees, registre, now, FENETRE_PRESSE_H);
  const recents = recs72.flatMap((r) => r.titres);
  const candidats = (actualites?.dossiers || []).filter((d) => {
    if (!d?.id || !/^[a-z0-9-]+$/.test(d.id) || !d.titre || !Array.isArray(d.articles) || d.articles.length < 3) return false;
    if (enFile.has(d.id) || ids.has(idDossier(d.id))) return false;
    const age = now.getTime() - Date.parse(d.derniere || d.articles[0].date);
    if (!(age < FRAICHEUR_SUJET_H * 36e5) || age < -36e5) return false;
    if (mediasDistinctsDe(d.articles, d.mediasDistincts) < MIN_MEDIAS_DOSSIER) return false;
    if (titreGenerique(d.titre) || dejaVu(d.titre, recents) || articlesDejaPublies(d.articles, recs72)) return false;
    if (new Set(d.articles.map((a) => sansAccent(a.titre).replace(/[^a-z0-9]+/g, " ").trim())).size < 3) return false; // des reprises d'une même dépêche ne font pas un dossier
    if (!concerneLaFrance(d.articles.map((a) => a.titre)) || motExclu(d.titre)) return false;
    return !d.articles.some((a) => motExclu(a.titre)) && !(reserveStory(now) && d.articles.some((a) => parleDeSondage(a.titre)));
  });
  if (!candidats.length) return null;
  candidats.sort((a, b) => b.medias.length - a.medias.length || b.nb - a.nb);
  const d = candidats[0];
  return { dossier: d, id: idDossier(d.id), medias: mediasDistinctsDe(d.articles, d.mediasDistincts) };
}

/**
 * Choisit au plus un sujet. Renvoie { indice, sujet, id } ou { refus: "raison" }.
 * file : { entrees: [...] } ; now : Date.
 */
function choisirSujet({ actualites, direct, file, now = new Date(), candidats: declares = null, registre = null }) {
  const entrees = file?.entrees || [];
  const h = heureParis(now);
  if (h >= 23 || h < 7) return { refus: `nuit (${h} h à Paris)` };
  const jour = jourUTC2(now);
  // Plafonds distincts : 4 stories par jour (les posts et leurs stories d'annonce n'y comptent pas) et 2 posts par jour
  const storiesPleines = entrees.filter((e) => estStoryComptee(e) && jourUTC2(e.cree) === jour).length >= MAX_PAR_JOUR;
  const postsPleins = nbPostsDuJour(entrees, registre, now) >= MAX_POSTS_PAR_JOUR;
  if (storiesPleines && postsPleins) return { refus: `déjà ${MAX_PAR_JOUR} entrées aujourd'hui` };
  const ids = new Set([...entrees.map((e) => e.id), ...(registre?.entrees || []).map((e) => e.id)]);
  const urls = new Set(entrees.flatMap((e) => e.sources || []));
  const recs72 = entreesRecentes(entrees, registre, now, FENETRE_PRESSE_H);
  const recents = recs72.flatMap((r) => r.titres); // file ET registre sur 72 h (et non plus la seule file sur 24 h)
  const recentsPost = titresRecentsH(entrees, registre, now, POST_FENETRE_DOUBLON_H);
  const dossier = storiesPleines ? null : choisirDossier({ actualites, file, registre, now });
  if (dossier) return dossier; // un dossier non publié passe avant les sujets simples

  const candidats = [];
  const rejets = {};
  const rej = (motif) => { rejets[motif] = (rejets[motif] || 0) + 1; };
  (actualites?.sujets || []).forEach((s, indice) => {
    const titre = s.articles?.[0]?.titre;
    if (!titre || titre.length < 25 || titre.length > 220 || /[$<>{}]/.test(titre)) return;
    if (!concerneLaFrance((s.articles || []).map((x) => x.titre))) return; // sujet purement étranger : ni site ni story
    const medias = mediasDistinctsDe(s.articles, s.mediasDistincts);
    const parole = presidentParle(s, direct, now);
    if (medias < MIN_MEDIAS && !parole) return rej(`moins de ${MIN_MEDIAS} médias`);
    const age = now.getTime() - Date.parse(s.derniere);
    if (!(age < (parole ? FRAICHEUR_H : FRAICHEUR_SUJET_H) * 36e5) || age < -36e5) return rej(`plus de ${parole ? FRAICHEUR_H : FRAICHEUR_SUJET_H} h`);
    if (ids.has(idSujet(titre)) || (s.articles || []).some((a) => urls.has(a.url))) return rej("déjà publié");
    if (s.illustration?.theme === "justice") return rej("justice");
    if ((s.articles || []).some((a) => motExclu(a.titre))) return rej("mot exclu");
    if (reserveStory(now) && (s.articles || []).some((a) => parleDeSondage(a.titre))) return; // réserve électorale : aucun sondage, même cité par la presse
    if (!s.titrePropre?.titre) return rej("sans titre propre"); // sans titre rédigé par le site, on ne publie pas : jamais un titre de presse en grand titre
    if (titreGenerique(s.titrePropre.titre)) return rej("titre trop vague"); // « Énergie » seul : trop vague
    if (s.titrePropre.generique === true && !parole) return rej("titre de repli"); // titre de repli (« Gilley : actualité locale », « Politique : l'essentiel du moment ») : jamais de story ni de post, sauf direct du président
    if (articlesDejaPublies(s.articles, recs72)) return rej("déjà publié (article)"); // l'id repose sur le premier titre, qui change : on compare aussi les liens et titres d'articles déjà publiés
    if (dejaVu(s.titrePropre.titre, recents)) return rej("doublon des 72 h"); // même sujet qu'une story ou un post des dernières 72 h (file ou registre)
    const modele = modeleSujet(s, { direct, candidats: declares, now });
    if ((modele === "post-date" || modele === "date") && s.date?.iso && evenementDejaPublie(entrees, registre, now, s.titrePropre.titre, s.date.iso)) return rej("même événement déjà publié"); // post, story ou rappel
    if (modele === "post-date") { // date lointaine : un POST (2 par jour au plus), jamais deux fois le même sujet ni la même date
      if (postsPleins || dejaVu(s.titrePropre.titre, recentsPost)) return;
    } else if (storiesPleines) return;
    candidats.push({ indice, sujet: s, id: idSujet(titre), medias, parole, modele });
  });
  if (!candidats.length) return { refus: storiesPleines ? `déjà ${MAX_PAR_JOUR} entrées aujourd'hui` : `aucun sujet ne remplit toutes les règles (${(actualites?.sujets || []).length} sujets examinés${Object.keys(rejets).length ? " ; écartés : " + Object.entries(rejets).map(([k, n]) => `${n} ${k}`).join(", ") : ""})` };
  candidats.sort((a, b) => Number(b.parole) - Number(a.parole) || b.medias - a.medias || Date.parse(b.sujet.derniere) - Date.parse(a.sujet.derniere));
  return candidats[0];
}

const FRAICHEUR_BROUILLON_H = 12; // un brouillon sensible (niveau 2) peut attendre sa validation : sujet de moins de 12 h
const REJET_JOURS = 7; // un sujet rejeté par un humain n'est pas reproposé pendant 7 jours

/**
 * SUJETS SENSIBLES (justice, mises en cause ; scripts/sujets-sensibles.cjs) : les sujets que le circuit habituel écarte ne sont plus perdus.
 *  - niveau 1 (fait judiciaire établi : juridiction ET décision citées par >= minMediasSensible médias) : { sensible, sujet, ... } publié en file, texte fabriqué par règles ;
 *  - niveau 2 (accusation, plainte, polémique, révélation d'un seul média) : brouillon à valider, jamais en file.
 * Mêmes garde-fous que les autres sujets : pas la nuit, fraîcheur, pas de doublon (id, liens, titres proches 36 h, sujets déjà rejetés),
 * pas de sondage en réserve électorale, plafond des stories (niveau 1) ; niveau 2 : au plus « brouillonsSensiblesMax » brouillons par jour.
 * niveaux : quels niveaux examiner (le niveau 1 passe avant les autres sujets, le niveau 2 seulement s'il n'y a rien d'autre).
 */
function choisirSensible({ actualites, file, registre = null, rejetes = null, now = new Date(), config = normaliserConfig(null), niveaux = [1, 2] }) {
  if (config.monetisation || config.sensibles === false) return { refus: "sujets sensibles désactivés" };
  const h = heureParis(now);
  if (h >= 23 || h < 7) return { refus: `nuit (${h} h à Paris)` };
  const entrees = file?.entrees || [];
  const jour = jourUTC2(now);
  const storiesPleines = entrees.filter((e) => estStoryComptee(e) && jourUTC2(e.cree) === jour).length >= MAX_PAR_JOUR;
  const brouillonsJour = entrees.filter((e) => e.sensible === 2 && e.statut === "a-valider" && jourUTC2(e.cree) === jour).length;
  const rejetsRecents = (rejetes?.entrees || []).filter((r) => now.getTime() - Date.parse(r.rejeteLe) < REJET_JOURS * 24 * 36e5);
  const ids = new Set([...entrees.map((e) => e.id), ...(registre?.entrees || []).map((e) => e.id), ...rejetsRecents.map((r) => r.id)]);
  const urls = new Set([...entrees.flatMap((e) => e.sources || []), ...rejetsRecents.flatMap((r) => r.sources || [])]);
  const recents = [...titresRecentsH(entrees, registre, now, POST_FENETRE_DOUBLON_H), ...rejetsRecents.flatMap((r) => r.sujets || [])];
  // Affaires des dernières 48 h (file, brouillons, registre, rejets) : une même affaire ne donne qu'un brouillon / une publication
  const dansFenetre = (iso) => now.getTime() - Date.parse(iso) < SS.AFFAIRE_FENETRE_H * 36e5;
  const retiresAff = lireRetiresSur();
  const affairesRecentes = [
    ...entrees.filter((e) => e.cree && dansFenetre(e.cree) && !retiresAff.has(e.id)),
    ...(registre?.entrees || []).filter((e) => e.statut === "publiee" && e.publieLe && dansFenetre(e.publieLe) && !retiresAff.has(e.id)),
    ...(rejetes?.entrees || []).filter((r) => r.rejeteLe && dansFenetre(r.rejeteLe)),
  ];
  const reserve = reserveStory(now);
  const candidats = [];
  (actualites?.sujets || []).forEach((s, indice) => {
    const titre = s.articles?.[0]?.titre;
    if (!titre || titre.length < 25 || titre.length > 220 || /[$<>{}]/.test(titre)) return;
    const age = now.getTime() - Date.parse(s.derniere);
    if (!(age < FRAICHEUR_BROUILLON_H * 36e5) || age < -36e5) return;
    if (ids.has(idSujet(titre)) || (s.articles || []).some((a) => urls.has(a.url))) return;
    if (reserve && (s.articles || []).some((a) => parleDeSondage(a.titre))) return; // réserve électorale : aucun sondage, même cité par la presse
    const c = SS.classerSujet(s, { minMedias: config.minMediasSensible, motExclu });
    if (!c || c.refus || !niveaux.includes(c.niveau)) return;
    if (c.niveau === 1 && (storiesPleines || !(age < FRAICHEUR_H * 36e5))) return;
    if (c.niveau === 2 && (brouillonsJour >= config.brouillonsSensiblesMax || c.medias.length < 1)) return;
    if ((s.articles || []).some((a) => dejaVu(a.titre, recents))) return; // même sujet qu'une publication ou un brouillon récent
    if (affairesRecentes.some((r) => SS.memeAffaire(r, { articles: s.articles, categorie: c.categorie, personnes: s.illustration?.personnes }))) return; // même affaire déjà traitée (48 h)
    candidats.push({ indice, sujet: s, id: idSujet(titre), medias: c.medias.length, sensible: c, niveauSensible: c.niveau, modele: "sensible" });
  });
  if (!candidats.length) return { refus: "aucun sujet sensible à traiter" };
  candidats.sort((a, b) => a.niveauSensible - b.niveauSensible || b.medias - a.medias || Date.parse(b.sujet.derniere) - Date.parse(a.sujet.derniere));
  return candidats[0];
}

/** Identifiant d'une story « En bref » : une par jour (Paris). */
const idBref = (jour) => crypto.createHash("sha1").update("bref|" + jour).digest("hex").slice(0, 12);

/**
 * « En bref » (une fois par jour, le matin) : 3 ou 4 sujets forts. Mêmes plafonds et horaires que les autres sujets
 * (4 par jour, rien de 23 h à 7 h), mêmes mots exclus, titre rédigé par le site obligatoire, sujets non déjà publiés.
 * Renvoie { bref: { indices, titres }, id, medias, sources } ou { refus }.
 */
function choisirEnBref({ actualites, file, registre = null, now = new Date() }) {
  const h = heureParis(now);
  if (!EN_BREF) return { refus: "« en bref » désactivé (data/stories-config.json)" };
  if (h < BREF_DEBUT_H || h >= BREF_FIN_H) return { refus: "« en bref » : seulement le matin" };
  const entrees = file?.entrees || [];
  const jour = jourParis(now);
  if (entrees.some((e) => e.bref === true && jourParis(e.cree) === jour)) return { refus: "« en bref » déjà publié aujourd'hui" };
  if (entrees.filter((e) => estStoryComptee(e) && jourUTC2(e.cree) === jourUTC2(now)).length >= MAX_PAR_JOUR) return { refus: `déjà ${MAX_PAR_JOUR} entrées aujourd'hui` };
  const ids = new Set([...entrees.map((e) => e.id), ...(registre?.entrees || []).map((e) => e.id)]);
  const urls = new Set(entrees.flatMap((e) => e.sources || []));
  const recs72 = entreesRecentes(entrees, registre, now, FENETRE_PRESSE_H);
  const recents = recs72.flatMap((r) => r.titres);
  const retenus = [];
  (actualites?.sujets || []).forEach((s, indice) => {
    const titre = s.articles?.[0]?.titre;
    if (!titre || titre.length < 25 || titre.length > 220 || /[$<>{}]/.test(titre)) return;
    if (!concerneLaFrance((s.articles || []).map((x) => x.titre))) return;
    const medias = mediasDistinctsDe(s.articles, s.mediasDistincts);
    if (medias < BREF_MIN_MEDIAS) return;
    const age = now.getTime() - Date.parse(s.derniere);
    if (!(age < BREF_FRAICHEUR_H * 36e5) || age < -36e5) return;
    if (ids.has(idSujet(titre)) || (s.articles || []).some((a) => urls.has(a.url))) return;
    if (s.illustration?.theme === "justice" || !s.titrePropre?.titre || motExclu(s.titrePropre.titre) || titreGenerique(s.titrePropre.titre) || s.titrePropre.generique === true || dejaVu(s.titrePropre.titre, recents) || articlesDejaPublies(s.articles, recs72)) return;
    if ((s.articles || []).some((a) => motExclu(a.titre))) return;
    if (reserveStory(now) && (s.articles || []).some((a) => parleDeSondage(a.titre))) return; // réserve électorale : aucun sondage, même cité par la presse
    retenus.push({ indice, s, medias, theme: s.illustration?.theme || "politique" });
  });
  retenus.sort((a, b) => b.medias - a.medias || Date.parse(b.s.derniere) - Date.parse(a.s.derniere));
  // un sujet par thème d'abord, puis sans doublon de titre propre
  const pris = [], titres = new Set(), themes = new Set();
  const doublon = (r) => titres.has(r.s.titrePropre.titre) || pris.some((p) => titresProches(p.s.titrePropre.titre, r.s.titrePropre.titre)); // « Blocage » et « Blocus » des lycées : un seul
  for (const r of retenus) if (pris.length < BREF_MAX && !doublon(r) && !themes.has(r.theme)) { pris.push(r); titres.add(r.s.titrePropre.titre); themes.add(r.theme); }
  for (const r of retenus) if (pris.length < BREF_MAX && !pris.includes(r) && !doublon(r)) { pris.push(r); titres.add(r.s.titrePropre.titre); }
  if (pris.length < BREF_MIN) return { refus: `« en bref » : seulement ${pris.length} sujet(s) fort(s)` };
  const medias = mediasDistinctsDe(pris.flatMap((r) => r.s.articles));
  return {
    bref: { indices: pris.map((r) => r.indice), titres: pris.map((r) => r.s.articles[0].titre), titresPropres: pris.map((r) => r.s.titrePropre.titre) },
    id: idBref(jour), medias,
    // un lien par sujet d'abord (pour qu'aucun de ces sujets ne soit repris seul), puis les autres, 12 au plus
    sources: [...new Set([...pris.map((r) => r.s.articles[0].url), ...pris.flatMap((r) => r.s.articles.map((a) => a.url))].filter((u) => /^https:\/\//.test(u || "")))].slice(0, 12),
    modele: "bref",
  };
}

/** Dimensions d'un JPEG, ou null. */
function dimensionsJpeg(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { h: buf.readUInt16BE(i + 5), l: buf.readUInt16BE(i + 7) };
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

/** Garde les 30 dernières entrées ; renvoie les id dont l'image doit rester (moins de 3 jours). */
function elaguer(entrees, now = new Date()) {
  const gardees = entrees.slice(-GARDER);
  const limite = now.getTime() - IMAGE_JOURS * 24 * 36e5;
  const images = new Set(gardees.filter((e) => Date.parse(e.cree) >= limite).map((e) => e.id));
  return { gardees, images };
}

/** Vrai si le fichier existe et commence comme un JPEG. */
function imageValide(chemin) {
  try {
    const b = fs.readFileSync(chemin);
    return b.length > 1000 && b[0] === 0xff && b[1] === 0xd8;
  } catch (e) { return false; }
}

/** Retire des entrées dont l'image doit encore exister (ids de `images`) celles dont `existe(id)` est faux. Fonction pure (testable). */
function retirerSansImage(entrees, images, existe) {
  const retirees = [];
  const gardees = entrees.filter((e) => {
    if (!images.has(e.id) || existe(e.id)) return true;
    retirees.push(e.id);
    return false;
  });
  return { gardees, retirees };
}

/** Ligne d'alerte dans le résumé de l'exécution (onglet Actions), sans ticket ni e-mail. */
function alerteResume(ligne) {
  console.warn(`[stories-auto] ${ligne}`);
  if (process.env.GITHUB_STEP_SUMMARY) { try { fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, ligne + "\n"); } catch (e) { /* sans résumé */ } }
}

/** Supprime les JPEG et MP4 de instagram/auto/ qui ne sont plus à garder (noms strictement contrôlés). */
function nettoyerImages(images, dossier = DOSSIER_IMG, retires = lireRetiresSur()) {
  if (!fs.existsSync(dossier)) return [];
  const supprimes = [];
  for (const f of fs.readdirSync(dossier)) {
    // Convention « <12 hexa>.jpg|mp4 » ; tout autre fichier de ce dossier (publication manuelle, id libre) est aussi retiré dès qu'il n'est plus dans la file (audit A-07),
    // et les images des contenus « retirés » (data/instagram-retires.json) sont supprimées d'office (audit J-23).
    const m = /^([0-9a-f]{12})\.(?:jpg|mp4)$/.exec(f);
    const base = m ? m[1] : f.replace(/\.[a-z0-9]+$/i, "");
    if (!m && !/\.(?:jpe?g|png|mp4)$/i.test(f)) continue; // ni README ni autre fichier : seules les images et vidéos sont concernées
    if (!retires.has(base) && images.has(base)) continue;
    const chemin = path.join(dossier, f);
    if (path.dirname(chemin) !== dossier) continue;
    fs.unlinkSync(chemin);
    supprimes.push(f);
  }
  return supprimes;
}

const TYPES = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".js": "text/javascript", ".mjs": "text/javascript", ".woff2": "font/woff2", ".woff": "font/woff", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".css": "text/css", ".webmanifest": "application/manifest+json" };

/** Le site est servi depuis le dossier du dépôt, sous son adresse publique (l'image affiche ainsi la bonne adresse) ; rien d'autre n'est joignable. */
async function servirSite(page) {
  await page.route("**/*", async (route) => {
    const u = new URL(route.request().url());
    if (!(u.origin + u.pathname).startsWith(SITE.replace(/\/$/, "")) && u.origin !== new URL(SITE).origin) return route.abort();
    let rel = decodeURIComponent(u.pathname.slice(new URL(SITE).pathname.length));
    if (!rel || rel.endsWith("/")) rel += "index.html";
    const fichier = path.resolve(RACINE, rel);
    if (!fichier.startsWith(RACINE + path.sep) || !fs.existsSync(fichier) || !fs.statSync(fichier).isFile()) return route.fulfill({ status: 404, body: "" });
    route.fulfill({ status: 200, contentType: TYPES[path.extname(fichier)] || "application/octet-stream", body: fs.readFileSync(fichier) });
  });
}

/** Dessine un POST (1080 × 1350) et la story qui l'annonce (1080 × 1920, avec la miniature du post) d'après une fiche (js/stories-post.js) ; renvoie { post, annonce } (Buffers JPEG). */
async function dessinerPost(fiche, idPost) {
  const { chromium } = require("playwright");
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, serviceWorkers: "block" });
    const page = await ctx.newPage();
    await servirSite(page);
    const erreurs = [];
    page.on("pageerror", (e) => erreurs.push(e.message));
    await page.goto(SITE, { waitUntil: "load" });
    await page.waitForFunction(() => typeof dessinerStory === "function", null, { timeout: 30000 });
    const [post, annonce] = await page.evaluate(async ({ spec, annonce }) => {
      const p = await dessinerStory("post", spec);
      if (!p) return [null, null];
      const a = await dessinerStory("annonce-post", { ...annonce, miniature: p.apercu });
      return [p.apercu, a ? a.apercu : null];
    }, { spec: fiche.spec, annonce: ficheAnnonce(fiche, idPost) });
    if (erreurs.length) console.warn("[stories-auto] erreurs JavaScript du site :", erreurs.join(" | "));
    const buf = (u) => { if (!u || !u.startsWith("data:image/jpeg;base64,")) throw new Error("le post n'a pas pu être dessiné"); return Buffer.from(u.slice("data:image/jpeg;base64,".length), "base64"); };
    return { post: buf(post), annonce: buf(annonce) };
  } finally {
    await browser.close();
  }
}

/** Dessine un POST seul (1080 × 1350, sans story d'annonce) d'après une fiche (js/stories-post.js, genre « presse » pour une demande directe) ; renvoie un Buffer JPEG. */
async function dessinerPostSeul(spec) {
  const { chromium } = require("playwright");
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, serviceWorkers: "block" });
    const page = await ctx.newPage();
    await servirSite(page);
    const erreurs = [];
    page.on("pageerror", (e) => erreurs.push(e.message));
    await page.goto(SITE, { waitUntil: "load" });
    await page.waitForFunction(() => typeof dessinerStory === "function", null, { timeout: 30000 });
    const url = await page.evaluate(async (s) => { const p = await dessinerStory("post", s); return p ? p.apercu : null; }, spec);
    if (erreurs.length) console.warn("[stories-auto] erreurs JavaScript du site :", erreurs.join(" | "));
    if (!url || !url.startsWith("data:image/jpeg;base64,")) throw new Error("le post n'a pas pu être dessiné");
    return Buffer.from(url.slice("data:image/jpeg;base64,".length), "base64");
  } finally {
    await browser.close();
  }
}

/** Ouvre le site (servi depuis le disque sous son adresse publique) et dessine la story ; renvoie un Buffer JPEG. */
async function dessiner(indice, titre, sondage = null, dossier = null, propre = null, modele = null, bref = null, synth = null) {
  const { chromium } = require("playwright");
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, serviceWorkers: "block" });
    const page = await ctx.newPage();
    await servirSite(page);
    const erreurs = [];
    page.on("pageerror", (e) => erreurs.push(e.message));
    await page.goto(SITE, { waitUntil: "load" });
    if (propre) {
      await page.waitForFunction(() => typeof dessinerStory === "function" && typeof LOIS !== "undefined" && LOIS.length > 0, null, { timeout: 30000 });
      if (propre.type === "senat") await page.evaluate(() => chargerSenat());
      if (propre.type === "probabilites") await page.waitForFunction(() => typeof PROBAS !== "undefined" && PROBAS?.candidats?.length > 0, null, { timeout: 30000 });
    } else if (sondage) {
      await page.waitForFunction(() => typeof INSTITUTS !== "undefined" && INSTITUTS.length > 0 && typeof CANDIDATS !== "undefined" && typeof dessinerStory === "function", null, { timeout: 30000 });
    } else if (synth) { // sujet sensible : dessiné d'après une fiche (titre à nous), pas d'après le relevé d'actualités
      await page.waitForFunction(() => typeof ACTUALITES !== "undefined" && Array.isArray(ACTUALITES?.sujets) && typeof dessinerStory === "function", null, { timeout: 30000 });
    } else if (dossier) {
      await page.waitForFunction(() => typeof ACTUALITES !== "undefined" && ACTUALITES?.dossiers?.length > 0 && typeof dessinerStory === "function", null, { timeout: 30000 });
    } else {
      await page.waitForFunction(() => typeof ACTUALITES !== "undefined" && ACTUALITES?.sujets?.length > 0 && typeof dessinerStory === "function", null, { timeout: 30000 });
    }
    const url = await page.evaluate(async ({ indice, titre, sondage, dossier, propre, modele, bref, synth }) => {
      if (synth) { // sujet synthétique ajouté le temps du dessin, puis retiré
        ACTUALITES.sujets.push(synth);
        try { const r = await dessinerStory("actualite", `${ACTUALITES.sujets.length - 1}:${synth.modeleImpose || "une"}`); return r ? r.apercu : null; } finally { ACTUALITES.sujets.pop(); }
      }
      if (propre) { // données propres : vote par groupe ou simulation, jamais de presse ; le site doit avoir la même donnée que le fichier
        let r = null;
        if (propre.type === "scrutin") {
          const loi = LOIS.find((l) => l.numero === propre.numero);
          if (!loi) return null;
          document.getElementById("loi-select").innerHTML = `<option value="${loi.id}">${loi.numero}</option>`;
          document.getElementById("loi-select").value = loi.id;
          r = await dessinerStory("scrutin");
        } else if (propre.type === "senat") {
          if (!SENAT?.some((s) => s.id === propre.idScrutin)) return null;
          r = await dessinerStory("senat", propre.idScrutin);
        } else if (propre.type === "probabilites") r = await dessinerStory("probabilites");
        return r ? r.apercu : null;
      }
      if (dossier) { // story du dossier : le site doit avoir le même dossier que le fichier
        if (!ACTUALITES.dossiers.some((d) => d.id === dossier)) return null;
        const r = await dessinerStory("actualites", dossier);
        return r ? r.apercu : null;
      }
      if (sondage) { // story « sondages » limitée à CETTE enquête ; le site doit avoir le même relevé que le fichier
        const i = INSTITUTS[indice];
        if (!i || i.nom !== sondage.nom || i.dateFin !== sondage.dateFin) return null;
        const r = await dessinerStory("sondages", i.id);
        return r ? r.apercu : null;
      }
      if (bref) { // « en bref » : les sujets choisis doivent être les mêmes sur le site
        if (!bref.indices.every((i, k) => ACTUALITES.sujets[i]?.articles?.[0]?.titre === bref.titres[k])) return null;
        const r = await dessinerStory("actualites", "bref:" + bref.indices.join(","));
        return r ? r.apercu : null;
      }
      if (ACTUALITES.sujets[indice]?.articles?.[0]?.titre !== titre) return null; // le site n'a pas le même relevé que le fichier
      const r = await dessinerStory("actualite", `${indice}:${modele || "une"}`); // modèle imposé : « une », « direct », « facea », « chiffre » ou « date »
      return r ? r.apercu : null;
    }, { indice, titre, sondage: sondage ? { nom: sondage.nom, dateFin: sondage.dateFin } : null, dossier, propre, modele, bref, synth });
    if (erreurs.length) console.warn("[stories-auto] erreurs JavaScript du site :", erreurs.join(" | "));
    if (!url || !url.startsWith("data:image/jpeg;base64,")) throw new Error("la story n'a pas pu être dessinée");
    return Buffer.from(url.slice("data:image/jpeg;base64,".length), "base64");
  } finally {
    await browser.close();
  }
}

/** Flux Atom de la file (instagram/file.atom) : pour un outil sans code (Make, Zapier) qui lit un flux et publie la story. Une entrée = une story ou un post (catégorie « story » ou « post »), image en pièce jointe ; un post porte sa légende dans <content>. */
function fluxAtom(entrees, now = new Date()) {
  const x = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const liste = [...(entrees || [])].sort((a, b) => String(b.cree).localeCompare(String(a.cree)));
  const corps = liste.map((e) => `  <entry>
    <id>tag:hemicycle-france,2026:${["post", "reel", "carousel"].includes(e.type) ? e.type : "story"}:${x(e.id)}</id>
    <title>${x(e.titre)}</title>
    <updated>${x(e.cree)}</updated>
    <link rel="enclosure" type="image/jpeg" href="${x(e.url_image)}"/>${e.url_video ? `
    <link rel="enclosure" type="video/mp4" href="${x(e.url_video)}"/>` : ""}${(Array.isArray(e.url_images) ? e.url_images.slice(1) : []).map((u) => `
    <link rel="enclosure" type="image/jpeg" href="${x(u)}"/>`).join("")}
    <link rel="alternate" href="${x(e.url_image)}"/>
    <category term="${["post", "reel", "carousel"].includes(e.type) ? e.type : "story"}"/>
    <summary>${x(e.alt || e.titre)}</summary>${["post", "reel", "carousel"].includes(e.type) && e.legende ? `
    <content type="text">${x(e.legende)}</content>` : ""}
  </entry>`).join("\n");
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>tag:hemicycle-france,2026:file-stories</id>
  <title>Hémicycle France : stories et posts à publier</title>
  <updated>${now.toISOString()}</updated>
${corps}
</feed>
`;
}

/** Configuration (data/stories-config.json) : tout est désactivé par défaut. */
function normaliserConfig(c) {
  const entier = (v, defaut, min, max) => (Number.isInteger(v) && v >= min && v <= max ? v : defaut);
  return {
    monetisation: c?.monetisation === true, validationHumaine: c?.validationHumaine === true,
    // seuils « très intéressant » : valeurs par défaut = comportement historique
    minMedias: entier(c?.minMedias, 3, 2, 10), dossierMedias: entier(c?.dossierMedias, 4, 3, 12),
    maxParJour: entier(c?.maxParJour, 4, 1, 99), enBref: c?.enBref !== false,
    // vidéos animées de NOS visuels (scripts/videos-auto.cjs) : désactivées par défaut ; videosMax : vidéos par jour (stories vidéo + Reels)
    videos: c?.videos === true, videosMax: entier(c?.videosMax, 2, 0, 6),
    // sujets de justice et de mise en cause (scripts/sujets-sensibles.cjs) : activés par défaut ; niveau 1 = au moins « minMediasSensible » médias
    // citant une juridiction et une décision ; niveau 2 = brouillons à valider, « brouillonsSensiblesMax » par jour
    fraicheurH: entier(c?.fraicheurH, 12, 3, 24),
    sensibles: c?.sensibles !== false, minMediasSensible: entier(c?.minMediasSensible, 2, 2, 10), brouillonsSensiblesMax: entier(c?.brouillonsSensiblesMax, 3, 0, 10)
  };
}
/** Applique les seuils de la configuration (appelé une fois par exécution). */
function appliquerSeuils(config) {
  MIN_MEDIAS = config.minMedias; MIN_MEDIAS_DOSSIER = config.dossierMedias; MAX_PAR_JOUR = config.maxParJour; EN_BREF = config.enBref; FRAICHEUR_SUJET_H = config.fraicheurH;
}
/**
 * Lit la configuration. ÉCHEC FERMÉ (audit A-03) : fichier absent = valeurs par défaut (tout désactivé) ; fichier PRÉSENT mais illisible (JSON tronqué, conflit de
 * fusion, pas un objet) = « validationHumaine » activée (rien ne sort sans validation humaine) et « invalide: true ». Un interrupteur d'arrêt ne s'ouvre jamais par accident.
 */
function lireConfig(fichier = FICHIER_CONFIG) {
  let brut;
  try { brut = fs.readFileSync(fichier, "utf-8"); } catch (e) { return e.code === "ENOENT" ? normaliserConfig(null) : { ...normaliserConfig({ validationHumaine: true }), invalide: true }; }
  try {
    const j = JSON.parse(brut);
    if (!j || typeof j !== "object" || Array.isArray(j)) throw new Error("la configuration n'est pas un objet JSON");
    return normaliserConfig(j);
  } catch (e) { return { ...normaliserConfig({ validationHumaine: true }), invalide: true }; }
}

/** Une entrée (file ou brouillon) tombe sous la réserve électorale : sondage, ou simulation marquée « reserve ». */
const estSensibleReserve = (e) => Boolean(e && (e.sondageId || e.reserve === true));

/** Pendant la réserve électorale, retire d'une liste d'entrées (file de publication ou brouillons) tout ce qui concerne les sondages. */
function purgerReserve(entrees, now = new Date()) {
  return reserveStory(now) ? (entrees || []).filter((e) => !estSensibleReserve(e)) : (entrees || []);
}

/** En monétisation : seules restent les entrées sur données propres (sondage ou marquées donneesPropres) ; aucune entrée de presse. */
function purgerPresse(entrees) {
  return (entrees || []).filter((e) => !e.dossierId && (e.sondageId || e.donneesPropres === true));
}

/**
 * Story sur DONNÉES PROPRES (monétisation) : jamais un titre de presse. Renvoie { propre: { type, ... }, id, nommePersonne } ou { refus }.
 * Ordre : vote final de l'Assemblée, vote final du Sénat, simulation « probabilités » (hors réserve). Les votes sont montrés par groupe
 * (aucune personne nommée) ; la simulation nomme des candidats : elle passe toujours par un brouillon à valider.
 * Mêmes horaires que les actualités (pas la nuit), pas de doublon, au plus MAX_PROPRES_PAR_JOUR par jour.
 */
function choisirDonneesPropres({ lois, senat, probas, file, now = new Date() }) {
  const h = heureParis(now);
  if (h >= 23 || h < 7) return { refus: `nuit (${h} h à Paris)` };
  const entrees = file?.entrees || [];
  const jour = jourUTC2(now);
  if (entrees.filter((e) => e.donneesPropres === true && estStoryComptee(e) && jourUTC2(e.cree) === jour).length >= MAX_PROPRES_PAR_JOUR) return { refus: `déjà ${MAX_PROPRES_PAR_JOUR} stories sur données propres aujourd'hui` };
  const ids = new Set(entrees.map((e) => e.id));
  const votesPostes = new Set(entrees.map((e) => e.voteId).filter(Boolean)); // un vote déjà publié en post n'a pas aussi sa story
  const limite = new Date(now.getTime() - PROPRES_FRAICHEUR_J * 24 * 36e5).toISOString().slice(0, 10);
  const demain = new Date(now.getTime() + 24 * 36e5).toISOString().slice(0, 10);
  const recent = (iso) => /^\d{4}-\d{2}-\d{2}$/.test(iso || "") && iso >= limite && iso <= demain;
  const sobre = (t) => typeof t === "string" && t.length >= 15 && t.length <= 400 && !motExclu(t, OFF) && !/[<>{}]/.test(t);
  const hash = (x) => crypto.createHash("sha1").update(x).digest("hex").slice(0, 12);

  // 1. Vote final récent de l'Assemblée nationale (« l'ensemble du… »), titre sans mot de la liste prudente
  const an = (lois?.lois || []).filter((l) => l?.numero && l.resultat && l.votes && recent(l.dateISO) && /ensemble/i.test(l.titre || "") && sobre(l.titre) && !motExclu(l.dossierTitre || "", OFF) && !ids.has(hash("scrutin|" + l.numero)) && !votesPostes.has(`an-${l.numero}`))
    .sort((a, b) => b.dateISO.localeCompare(a.dateISO) || b.numero - a.numero);
  if (an.length) return { propre: { type: "scrutin", numero: an[0].numero, titre: an[0].titre, source: "Assemblée nationale (open data)" }, id: hash("scrutin|" + an[0].numero), nommePersonne: false };

  // 2. Vote final récent du Sénat
  const sn = (senat?.scrutins || []).filter((s) => s?.id && s.resultat && s.groupes && recent(s.dateISO) && /ensemble/i.test(s.titre || "") && sobre(s.titre) && !ids.has(hash("senat|" + s.id)) && !votesPostes.has(`senat-${s.id}`))
    .sort((a, b) => b.dateISO.localeCompare(a.dateISO) || b.numero - a.numero);
  if (sn.length) return { propre: { type: "senat", idScrutin: sn[0].id, titre: sn[0].titre, source: "Sénat (pages officielles)" }, id: hash("senat|" + sn[0].id), nommePersonne: false };

  // 3. Simulation « probabilités » : jamais pendant la réserve ; une par jour ; nomme des candidats donc à valider
  const reserve = reserveStory(now);
  if (probas?.candidats?.length && !reserve && Date.parse(probas.lastUpdated) > now.getTime() - 24 * 36e5) {
    const id = hash("probabilites|" + jour);
    if (!ids.has(id)) return { propre: { type: "probabilites", titre: "Présidentielle 2027 · simulation à partir des sondages", source: "Simulation du site à partir des sondages" }, id, nommePersonne: true, reserve: true };
  }
  return { refus: `aucune donnée propre à publier${reserve ? " (réserve électorale)" : ""}` };
}

// ---------------------------------------------------------------------------------------------------------------------
// POSTS (fil Instagram, image 4:5 de 1080 × 1350) : deux cas seulement, chacun suivi d'une story d'annonce
//  - une « date à retenir » lointaine (plus de 3 jours) tirée de data/actualites.json ;
//  - une loi ADOPTÉE ou REJETÉE : vote final (« l'ensemble » d'un projet ou d'une proposition de loi) de l'Assemblée (data/lois.json)
//    ou du Sénat (data/senat.json), avec le résultat officiel, la date, le nombre de voix et le lien du scrutin.
// Tout le reste de l'actualité reste directement en story. Formulation neutre : jamais d'avis ni de qualificatif politique.
// ---------------------------------------------------------------------------------------------------------------------
const COMPTE = "@hemicyclefrance";
const SITE_HOTE = "tahns.github.io";
const RE_VOTE_FINAL = /^(?:sur )?l['’]ensemble (du|de la) (projet|proposition) de loi\b/i;
const hashStable = (x) => crypto.createHash("sha1").update(x).digest("hex").slice(0, 12);
/** Identifiant de la story qui annonce le post `idPost`. */
const idAnnonce = (idPost) => hashStable("annonce|" + idPost);
const majuscule = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const nbFr = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? "s" : ""}`;

/** Décompose le titre officiel d'un vote final : { nature, court, etape } (« Projet de loi relatif à… », « première lecture »). */
function decomposerTitreVote(titre) {
  let t = String(titre || "").trim().replace(/\s+/g, " ");
  const m = RE_VOTE_FINAL.exec(t);
  if (!m) return null;
  t = t.replace(/^(?:sur )?l['’]ensemble (?:du|de la) /i, "").replace(/\s*\.\s*$/, "");
  let etape = "";
  const e = /\s*\(([^()]*)\)\s*$/.exec(t);
  if (e) { etape = e[1].trim(); t = t.slice(0, e.index).trim(); }
  return { nature: m[2].toLowerCase() === "projet" ? "projet de loi" : "proposition de loi", court: majuscule(t), etape };
}

/** Fiche d'un post « loi » : null si le vote n'est pas un vote final net (résultat incohérent, voix absentes, titre trop long ou à mot prudent). */
function ficheLoi({ chambre, id, numero, titre, dossierTitre, date, dateISO, resultat, pour, contre, abst, url }) {
  if (resultat !== "adopte" && resultat !== "rejete") return null;
  const d = decomposerTitreVote(titre);
  if (!d || d.court.length < 15 || d.court.length > 230 || /[<>{}]/.test(d.court)) return null;
  if (motExclu(titre, OFF) || motExclu(dossierTitre || "", OFF) || motExclu(d.court, OFF)) return null;
  if (![pour, contre, abst].every((n) => Number.isInteger(n) && n >= 0) || pour + contre === 0) return null;
  if (resultat === "adopte" ? !(pour > contre) : !(contre >= pour)) return null; // résultat incohérent avec les voix : on ne publie pas
  const an = chambre === "an";
  const nomChambre = an ? "Assemblée nationale" : "Sénat";
  const verbe = resultat === "adopte" ? "adopté" : "rejeté";
  const sourceTxt = `Source : ${nomChambre}, scrutin public n°${numero}${an ? "" : ` (session ${id.split("-")[1]}-${Number(id.split("-")[1]) + 1})`} (${an ? "assemblee-nationale.fr" : "senat.fr"}). Résultat officiel.`;
  const spec = { genre: "loi", chambre: nomChambre, date, dateISO, nature: d.nature, titre: d.court, etape: d.etape, verdict: resultat, pour, contre, abst, numero, sourceTxt };
  const voix = `Pour : ${nbFr(pour)} · Contre : ${nbFr(contre)} · Abstentions : ${nbFr(abst)}`;
  const legende = [
    `${nomChambre} : ${d.nature} ${d.nature === "projet de loi" ? verbe : verbe + "e"} le ${date}`,
    "",
    `${an ? "L'Assemblée nationale" : "Le Sénat"} a ${resultat === "adopte" ? "adopté" : "rejeté"}, le ${date}, l'ensemble du texte « ${d.court} »${d.etape ? ` (${d.etape})` : ""}.`,
    voix + ".",
    "",
    `Source officielle : ${nomChambre}, scrutin public n°${numero} — ${url}`,
    "",
    `Pour suivre l'actualité politique et parlementaire : ${COMPTE}`,
    hashtagsLegende({ genre: "loi", chambre, theme: an ? "assemblee" : "senat", titre: d.court, max: 8 }).join(" "),
  ].join("\n");
  return {
    spec,
    titreCourt: d.court,
    sous: `${an ? "Assemblée nationale" : "Sénat"} · texte ${verbe} · ${date}`,
    legende,
    alt: `Post Hémicycle France : ${d.court}, ${verbe} par ${an ? "l'Assemblée nationale" : "le Sénat"} le ${date}. ${voix}.`,
    source: url,
    voteId: `${an ? "an" : "senat"}-${an ? numero : id}`,
  };
}

/**
 * Choisit au plus UN vote final récent (Assemblée puis Sénat, du plus récent au plus ancien) à publier en post.
 * Renvoie { post: { fiche, id, ... }, id, modele: "post-loi" } ou { refus }. Un seul post par vote (id stable) ; jamais deux fois la même loi à
 * moins de 36 h d'écart (titres proches) ; 2 posts par jour au plus ; rien la nuit ; vote de moins de 2 jours.
 */
function choisirPostLoi({ lois, senat, file, registre = null, now = new Date() }) {
  const h = heureParis(now);
  if (h >= 23 || h < 7) return { refus: `nuit (${h} h à Paris)` };
  const entrees = file?.entrees || [];
  if (nbPostsDuJour(entrees, registre, now) >= MAX_POSTS_PAR_JOUR) return { refus: `déjà ${MAX_POSTS_PAR_JOUR} posts aujourd'hui` };
  const ids = new Set([...entrees.map((e) => e.id), ...(registre?.entrees || []).map((e) => e.id)]);
  const votes = new Set(entrees.map((e) => e.voteId).filter(Boolean));
  const recents = titresRecentsH(entrees, registre, now, POST_FENETRE_DOUBLON_H);
  const limite = new Date(now.getTime() - POST_VOTE_FRAICHEUR_J * 24 * 36e5).toISOString().slice(0, 10);
  const demain = new Date(now.getTime() + 24 * 36e5).toISOString().slice(0, 10);
  const recent = (iso) => /^\d{4}-\d{2}-\d{2}$/.test(iso || "") && iso >= limite && iso <= demain;
  const somme = (v, i) => (Array.isArray(v) ? v[i] : [v.pour, v.contre, v.abst][i]) || 0;
  const candidats = [];
  for (const l of lois?.lois || []) {
    if (!l?.numero || !recent(l.dateISO) || !RE_VOTE_FINAL.test(l.titre || "") || !l.votes || !["SPO", "SPS"].includes(l.typeVote)) continue;
    const g = Object.values(l.votes);
    const f = ficheLoi({ chambre: "an", id: `an-${l.numero}`, numero: l.numero, titre: l.titre, dossierTitre: l.dossierTitre, date: l.date, dateISO: l.dateISO, resultat: l.resultat, pour: g.reduce((a, v) => a + somme(v, 0), 0), contre: g.reduce((a, v) => a + somme(v, 1), 0), abst: g.reduce((a, v) => a + somme(v, 2), 0), url: `https://www.assemblee-nationale.fr/dyn/17/scrutins/${l.numero}` });
    if (f) candidats.push({ f, dateISO: l.dateISO, ordre: l.numero, id: hashStable("post-loi|an|" + l.numero) });
  }
  for (const s of senat?.scrutins || []) {
    if (!s?.id || !recent(s.dateISO) || !RE_VOTE_FINAL.test(s.titre || "")) continue;
    if (!/^https:\/\/www\.senat\.fr\//.test(s.sourceUrl || s.dossierUrl || "")) continue;
    const f = ficheLoi({ chambre: "senat", id: s.id, numero: s.numero, titre: s.titre, date: s.date, dateISO: s.dateISO, resultat: s.resultat, pour: s.pour, contre: s.contre, abst: s.abst, url: s.sourceUrl || s.dossierUrl });
    if (f) candidats.push({ f, dateISO: s.dateISO, ordre: s.numero, id: hashStable("post-loi|senat|" + s.id) });
  }
  candidats.sort((a, b) => b.dateISO.localeCompare(a.dateISO) || b.ordre - a.ordre);
  const reserve = reserveStory(now);
  for (const c of candidats) {
    if (ids.has(c.id) || ids.has(idAnnonce(c.id)) || votes.has(c.f.voteId)) continue;
    if (dejaVu(c.f.titreCourt, recents)) continue; // même loi qu'un post ou une story des dernières 36 h
    if (reserve && parleDeSondage(c.f.titreCourt)) continue;
    return { post: { genre: "loi", ...c.f, dateISO: c.dateISO }, id: c.id, modele: "post-loi", nommePersonne: false };
  }
  return { refus: "aucun vote final récent à publier en post" };
}

/** Jours (Paris) entre lesquels un événement de l'agenda devient un post « Date à retenir » : ni trop proche (une story suffit), ni trop lointain. */
const AGENDA_MIN_JOURS = 4, AGENDA_MAX_JOURS = 400; // tout ce qui est prévu : du plus proche au plus lointain (la présidentielle comprise)
const MOIS_FR = (iso) => new Date(iso + "T12:00:00Z").toLocaleDateString("fr-FR", { month: "long", timeZone: "UTC" });

/**
 * Les événements à venir annoncés par le site : l'agenda vérifié (data/meetings.json : congrès, primaires, élections) ET les votes solennels de
 * l'Assemblée nationale (data/agenda-an.json, open data). Même forme que meetings.json : { verified, debut, titre, source: { nom, url } }.
 */
function evenementsAgenda(meetings, agendaAn = null) {
  const liste = [...(meetings?.meetings || [])];
  const url = /^https:\/\//.test(agendaAn?.sourceUrl || "") ? agendaAn.sourceUrl : null;
  const bas = (t) => `${t.charAt(0).toLowerCase()}${t.slice(1)}`.replace(/\s*\.\s*$/, "");
  const debuts = new Map(); // projet de loi (finances, financement de la Sécurité sociale, autre texte du Gouvernement) : premier jour de chaque bloc d'examen en séance
  if (url) for (const j of agendaAn.jours || []) for (const p of j.points || []) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(j?.date || "") || !p?.objet || p.objet.length > 140) continue;
    if (p.type === "vote") liste.push({ verified: true, debut: j.date, titre: `Vote solennel à l'Assemblée : ${bas(p.objet)}`, source: { nom: "Assemblée nationale (ordre du jour)", url } });
    else if (p.type === "texte" && /^Projet de loi(?! autorisant)/.test(p.objet)) {
      const jours = debuts.get(p.objet) || [];
      jours.push(j.date);
      debuts.set(p.objet, jours);
    }
  }
  for (const [objet, jours] of debuts) {
    jours.sort();
    jours.forEach((d, i) => {
      if (i > 0 && (Date.parse(d + "T12:00:00Z") - Date.parse(jours[i - 1] + "T12:00:00Z")) / 864e5 <= 3) return; // même bloc (week-end compris)
      liste.push({ verified: true, debut: d, titre: `Début de l'examen en séance à l'Assemblée : ${bas(objet)}`, source: { nom: "Assemblée nationale (ordre du jour)", url } });
    });
  }
  return liste;
}

/**
 * Un événement de l'agenda (data/meetings.json : congrès, primaires, grands rendez-vous) à 4–60 jours, vérifié, avec source en https, jamais encore publié,
 * devient un POST « Date à retenir » (puis story d'annonce). Titre écrit par le site (celui de l'agenda) ; aucune citation de presse ; aucun sondage ni résultat.
 * Renvoie { indice: -1, sujet, id, medias: 1, parole: false, modele: "post-date" } (même forme qu'un sujet « post-date ») ou { refus }.
 */
function choisirPostAgenda({ meetings, agendaAn = null, file, registre = null, now = new Date() }) {
  const h = heureParis(now);
  if (h >= 23 || h < 7) return { refus: `nuit (${h} h à Paris)` };
  const entrees = file?.entrees || [];
  if (nbPostsDuJour(entrees, registre, now) >= MAX_POSTS_PAR_JOUR) return { refus: `déjà ${MAX_POSTS_PAR_JOUR} posts aujourd'hui` };
  const ids = new Set([...entrees.map((e) => e.id), ...(registre?.entrees || []).map((e) => e.id)]);
  const recents = titresRecentsH(entrees, registre, now, POST_FENETRE_DOUBLON_H);
  const aujourdhui = jourParis(now), reserve = reserveStory(now);
  const candidats = [];
  for (const m of evenementsAgenda(meetings, agendaAn)) {
    if (!m || m.verified !== true || m.confirme === false || !/^\d{4}-\d{2}-\d{2}$/.test(m.debut || "") || !m.titre || !/^https:\/\//.test(m.source?.url || "") || !m.source?.nom) continue;
    const jours = Math.round((Date.parse(m.debut + "T12:00:00Z") - Date.parse(aujourdhui + "T12:00:00Z")) / 864e5);
    if (jours < AGENDA_MIN_JOURS || jours > AGENDA_MAX_JOURS) continue;
    if (motExclu(m.titre) || titreGenerique(m.titre) || (reserve && parleDeSondage(m.titre + " " + (m.desc || "")))) continue;
    const id = hashStable("post-agenda|" + m.debut + "|" + m.titre);
    if (ids.has(id) || ids.has(idAnnonce(id)) || dejaVu(m.titre, recents)) continue;
    if (evenementDejaPublie(entrees, registre, now, m.titre, m.debut)) continue; // même événement (date à un jour près) déjà publié : post, story, rappel
    candidats.push({ m, jours, id });
  }
  if (!candidats.length) return { refus: "aucun événement de l'agenda à annoncer" };
  candidats.sort((a, b) => a.jours - b.jours);
  const { m, id } = candidats[0];
  const d = new Date(m.debut + "T12:00:00Z");
  const sujet = {
    date: { iso: m.debut, jour: String(d.getUTCDate()), mois: MOIS_FR(m.debut) },
    titrePropre: { titre: m.titre },
    articles: [{ media: m.source.nom, titre: "", url: m.source.url, date: m.debut }],
    derniere: new Date(now).toISOString(),
    agenda: { fin: /^\d{4}-\d{2}-\d{2}$/.test(m.fin || "") ? m.fin : null, lieu: m.lieu && m.lieu !== "—" ? m.lieu : "" },
  };
  return { indice: -1, sujet, id, medias: 1, parole: false, modele: "post-date" };
}

/** Rappel d'un événement de l'agenda déjà annoncé par un post : story « Date à retenir » (« dans N jours ») à J-3 (J-2 si le J-3 a été manqué). */
const RAPPEL_AGENDA_JOURS = [2, 3];

/**
 * Story de rappel (modèle « date ») pour un événement vérifié de l'agenda (data/meetings.json) dont le POST « Date à retenir » a déjà été annoncé
 * (id du post dans la file, le registre ou les brouillons) et qui commence dans 2 à 3 jours. Id stable « rappel-agenda|debut|titre » : jamais deux fois.
 * Mêmes garde-fous que le post (vérifié, source https, mot exclu, réserve électorale, nuit) ; plafond de 4 stories par jour.
 * Renvoie { indice: -1, sujet, id, postId, medias: 1, parole: false, modele: "rappel-agenda" } ou { refus }.
 */
function choisirRappelAgenda({ meetings, agendaAn = null, file, registre = null, now = new Date() }) {
  const h = heureParis(now);
  if (h >= 23 || h < 7) return { refus: `nuit (${h} h à Paris)` };
  const entrees = file?.entrees || [];
  if (entrees.filter((e) => estStoryComptee(e) && jourUTC2(e.cree) === jourUTC2(now)).length >= MAX_PAR_JOUR) return { refus: `déjà ${MAX_PAR_JOUR} entrées aujourd'hui` };
  const ids = new Set([...entrees.map((e) => e.id), ...(registre?.entrees || []).map((e) => e.id)]);
  const recs72 = entreesRecentes(entrees, registre, now, FENETRE_PRESSE_H);
  const aujourdhui = jourParis(now), reserve = reserveStory(now);
  const candidats = [];
  for (const m of evenementsAgenda(meetings, agendaAn)) {
    if (!m || m.verified !== true || m.confirme === false || !/^\d{4}-\d{2}-\d{2}$/.test(m.debut || "") || !m.titre || !/^https:\/\//.test(m.source?.url || "") || !m.source?.nom) continue;
    const jours = Math.round((Date.parse(m.debut + "T12:00:00Z") - Date.parse(aujourdhui + "T12:00:00Z")) / 864e5);
    if (!RAPPEL_AGENDA_JOURS.includes(jours)) continue;
    if (motExclu(m.titre) || titreGenerique(m.titre) || (reserve && parleDeSondage(m.titre + " " + (m.desc || "")))) continue;
    const postId = hashStable("post-agenda|" + m.debut + "|" + m.titre);
    if (!ids.has(postId)) continue; // jamais de rappel pour un événement que le site n'a pas annoncé lui-même
    const id = hashStable("rappel-agenda|" + m.debut + "|" + m.titre);
    if (ids.has(id)) continue;
    // Le post d'origine et son annonce ne comptent pas ; tout autre contenu du même événement (date à un jour près) ou story de presse proche des 72 h : pas de rappel
    const sauf = [postId, idAnnonce(postId), idReel(postId)];
    if (evenementDejaPublie(entrees, registre, now, m.titre, m.debut, sauf)) continue;
    if (recs72.some((r) => !sauf.includes(r.id) && r.presse && r.titres.some((t) => titresProches(t, m.titre)))) continue;
    candidats.push({ m, jours, id, postId });
  }
  if (!candidats.length) return { refus: "aucun rappel d'agenda à publier" };
  candidats.sort((a, b) => a.jours - b.jours);
  const { m, id, postId } = candidats[0];
  const d = new Date(m.debut + "T12:00:00Z");
  const sujet = {
    date: { iso: m.debut, jour: String(d.getUTCDate()), mois: MOIS_FR(m.debut) },
    titrePropre: { titre: m.titre },
    articles: [{ media: m.source.nom, titre: "", url: m.source.url, date: m.debut }],
    derniere: new Date(now).toISOString(),
    agenda: { fin: /^\d{4}-\d{2}-\d{2}$/.test(m.fin || "") ? m.fin : null, lieu: m.lieu && m.lieu !== "—" ? m.lieu : "" },
  };
  return { indice: -1, sujet, id, postId, medias: 1, parole: false, modele: "rappel-agenda" };
}

/** Fiche d'un post « date à retenir » : tirée d'un sujet de data/actualites.json (modèle « post-date »). */
function ficheDate(s, now = new Date()) {
  const dt = s.date, jours = joursAvantDate(s, now);
  const titre = s.titrePropre.titre;
  const medias = [...new Set((s.articles || []).map((a) => a.media).filter(Boolean))];
  const motsDate = [`${dt.jour} ${dt.mois}`, String(dt.jour), dt.mois].map(sansAccent);
  const art = (s.articles || []).find((a) => motsDate.some((m) => sansAccent(a.titre).includes(m))) || s.articles[0];
  const citation = String(art.titre || "").replace(/\s+/g, " ").trim().replace(/^[«"“]\s*|\s*[»"”]$/g, "").slice(0, 220);
  const d = new Date(dt.iso + "T12:00:00Z");
  const semaine = majuscule(d.toLocaleDateString("fr-FR", { weekday: "long", timeZone: "UTC" }));
  const annee = Number(dt.iso.slice(0, 4));
  const jourTxt = `${Number(dt.jour) === 1 ? "1er" : dt.jour} ${dt.mois}`;
  const quand = `${semaine.toLowerCase()} ${jourTxt} ${annee}`;
  const listeMedias = medias.slice(0, 4).join(", ");
  const ag = s.agenda || null; // entrée de l'agenda (data/meetings.json) : date relevée auprès d'une source, pas dans la presse ; peut durer plusieurs jours
  let quandTxt = quand, jourAff = jourTxt;
  if (ag?.fin && ag.fin > dt.iso) {
    const f = new Date(ag.fin + "T12:00:00Z"), jf = f.getUTCDate();
    const moisF = f.toLocaleDateString("fr-FR", { month: "long", timeZone: "UTC" });
    jourAff = moisF === dt.mois ? `${dt.jour}-${jf} ${dt.mois}` : `${jourTxt} - ${jf} ${moisF}`;
    quandTxt = `du ${semaine.toLowerCase()} ${jourTxt} au ${majuscule(f.toLocaleDateString("fr-FR", { weekday: "long", timeZone: "UTC" })).toLowerCase()} ${jf} ${moisF} ${annee}`;
  }
  const legende = [
    `Date à retenir : ${jourAff} ${annee}${titre.length <= 80 ? ` — ${titre}` : ""}`,
    "",
    `${titre}.`,
    ag ? `Rendez-vous ${ag.fin && ag.fin > dt.iso ? quandTxt : "le " + quandTxt}${ag.lieu ? ` (${ag.lieu})` : ""}.` : `Rendez-vous le ${quand}.`, // date absolue : un post reste au fil, « dans N jours » serait faux dès le lendemain (audit J-19)
    "",
    ag ? `Date relevée auprès de ${listeMedias} ; le programme peut changer, à vérifier auprès de l'organisateur.` : `Date annoncée par la presse (${listeMedias}${medias.length > 4 ? "…" : ""}) ; l'ordre du jour peut changer, à vérifier auprès de l'institution concernée.`,
    "",
    `Pour suivre l'actualité politique : ${COMPTE}`,
    hashtagsLegende({ genre: "date", theme: /s[ée]nat/i.test(titre) ? "senat" : /assembl[ée]e nationale|d[ée]put[ée]s/i.test(titre) ? "assemblee" : "politique", titre, max: 8 }).join(" "),
  ].join("\n");
  return {
    spec: { genre: "date", iso: dt.iso, jour: dt.jour, mois: dt.mois, annee, semaine, titre, citation, media: art.media || "", ...(ag ? { agenda: true } : {}) },
    titreCourt: titre,
    sous: `Date à retenir · ${jourAff}`,
    legende,
    alt: `Post Hémicycle France, date à retenir : ${titre}, ${ag?.fin && ag.fin > dt.iso ? quandTxt : "le " + quandTxt}. ${ag ? `Date relevée auprès de ${listeMedias}.` : `Date annoncée par la presse (${listeMedias}).`}`,
    dateIso: dt.iso,
  };
}

/** Story d'annonce d'un post : fiche pour le dessin (« annonce-post ») ; la miniature du post est ajoutée au moment du dessin. */
const ficheAnnonce = (fiche, idPost) => ({ id: idPost, titre: fiche.titreCourt, sous: fiche.sous });

/** Où va la story : « brouillon » (validation humaine) ou « file » (file de publication). */
function destination(choix, config) {
  if (choix.sensible) return choix.sensible.niveau === 2 || config.validationHumaine ? "brouillon" : "file"; // niveau 2 : JAMAIS en file ; niveau 1 : en file, sauf validation humaine générale
  const nomme = Boolean(choix.sondage || choix.nommePersonne);
  return config.validationHumaine || (config.monetisation && nomme) ? "brouillon" : "file";
}

/** Brouillons déjà écrits (instagram/brouillons/*.json), vus comme des entrées pour éviter les doublons et respecter les plafonds. */
function lireBrouillons(dossier = DOSSIER_BROUILLONS) {
  if (!fs.existsSync(dossier)) return [];
  const out = [];
  for (const f of fs.readdirSync(dossier)) {
    if (!/^[0-9a-f]{12}\.json$/.test(f)) continue;
    try { const b = JSON.parse(fs.readFileSync(path.join(dossier, f), "utf-8")); if (b?.id && b.cree) out.push(b); } catch (e) { /* brouillon illisible : ignoré */ }
  }
  return out;
}

/** Brouillons à supprimer : sensibles à la réserve pendant celle-ci, ou de plus de BROUILLON_JOURS jours. */
function brouillonsASupprimer(brouillons, now = new Date()) {
  const limite = now.getTime() - BROUILLON_JOURS * 24 * 36e5;
  const reste = new Set(purgerReserve(brouillons, now).map((b) => b.id));
  return brouillons.filter((b) => !reste.has(b.id) || Date.parse(b.cree) < limite).map((b) => b.id);
}

/** Sondage d'abord (déclencheur prioritaire), sinon un sujet d'actualité ; en monétisation, sinon une donnée propre (jamais de presse). */
function choisir({ actualites, direct, sondages, veille = null, lois, senat, probas, meetings = null, agendaAn = null, candidats = null, file, registre = null, rejetes = null, now = new Date(), config = normaliserConfig(null) }) {
  const s = choisirSondage({ sondages, file, now, veille });
  if (!s.refus) return s;
  if (config.monetisation) {
    const pl = choisirPostLoi({ lois, senat, file, registre, now }); // une loi adoptée ou rejetée : un post (données officielles, sans presse)
    if (!pl.refus) return pl;
    const p = choisirDonneesPropres({ lois, senat, probas, file, now });
    return p.refus ? { refus: `${p.refus} ; sondage : ${s.refus}` } : p;
  }
  const a = choisirSujet({ actualites, direct, file, now, candidats, registre });
  if (a.dossier || a.modele === "direct") return a; // un dossier non publié et un direct en cours passent avant tout
  const s1 = choisirSensible({ actualites, file, registre, rejetes, now, config, niveaux: [1] }); // fait judiciaire établi : publication prudente
  if (!s1.refus) return s1;
  const pl = choisirPostLoi({ lois, senat, file, registre, now }); // une loi adoptée ou rejetée : un post, suivi d'une story d'annonce
  if (!pl.refus) return pl;
  const ra = choisirRappelAgenda({ meetings, agendaAn, file, registre, now }); // J-3 d'un événement déjà annoncé par un post : story « Date à retenir »
  if (!ra.refus) return ra;
  const pa = choisirPostAgenda({ meetings, agendaAn, file, registre, now }); // un grand rendez-vous de l'agenda (congrès, primaire) : un post « Date à retenir »
  if (!pa.refus) return pa;
  const b = choisirEnBref({ actualites, file, registre, now }); // « en bref » : une fois par jour, le matin
  if (!b.refus) return b;
  if (!a.refus) return a;
  const s2 = choisirSensible({ actualites, file, registre, rejetes, now, config, niveaux: [2] }); // accusation, plainte, polémique : brouillon à valider (jamais en file)
  if (!s2.refus) return s2;
  return { refus: `${a.refus} ; sondage : ${s.refus} ; sensibles : ${s2.refus}` };
}

/** Lit toutes les données utiles au choix (file + brouillons vus comme une seule liste d'entrées). */
function lireEtat(now) {
  const lire = (f, defaut) => { try { return JSON.parse(fs.readFileSync(path.join(RACINE, f), "utf-8")); } catch (e) { return defaut; } };
  const config = lireConfig();
  appliquerSeuils(config);
  const file = lire("data/instagram-file.json", { entrees: [] });
  if (!Array.isArray(file.entrees)) file.entrees = [];
  const brouillons = lireBrouillons();
  const donnees = { actualites: lire("data/actualites.json", null), direct: lire("data/direct.json", null), sondages: lire("data/sondages.json", null), veille: lire("data/sondages-veille.json", null), candidats: lire("data/candidats.json", null),
    lois: lire("data/lois.json", null), senat: lire("data/senat.json", null), registre: lire("data/instagram-publiees.json", null), rejetes: lire("data/instagram-rejetes.json", null), meetings: lire("data/meetings.json", null), agendaAn: lire("data/agenda-an.json", null) };
  if (config.monetisation) donnees.probas = lire("data/probabilites.json", null);
  return { config, file, brouillons, donnees };
}

/** Entrées de la file après nettoyage obligatoire : réserve électorale (sondages) et, en monétisation, presse. */
function nettoyerFile(entrees, config, now) {
  let e = purgerReserve(entrees, now);
  if (config.monetisation) e = purgerPresse(e);
  return e;
}

/** Mode --a-faire : écrit « a_faire=true|false » (pour GITHUB_OUTPUT) sans lancer le navigateur, pour n'installer Chromium que si utile. */
function aFaire() {
  const now = process.env.STORIES_AUTO_MAINTENANT ? new Date(process.env.STORIES_AUTO_MAINTENANT) : new Date();
  const { config, file, brouillons, donnees } = lireEtat(now);
  const vue = { entrees: [...nettoyerFile(file.entrees, config, now), ...purgerReserve(brouillons, now)] };
  const c = choisir({ ...donnees, file: vue, now, config });
  // Des entrées à retirer (réserve électorale, presse en monétisation) ou des brouillons périmés : main() s'en charge
  const aRetirer = nettoyerFile(file.entrees, config, now).length !== file.entrees.length || brouillonsASupprimer(brouillons, now).length > 0;
  console.log(`a_faire=${c.refus && !aRetirer ? "false" : "true"}`);
}

/** Écrit un brouillon (image + fiche JSON) dans instagram/brouillons/ et une ligne dans $GITHUB_STEP_SUMMARY. Rien n'entre dans la file de publication. */
function ecrireBrouillon(fiche, jpeg, dossier = DOSSIER_BROUILLONS) {
  fs.mkdirSync(dossier, { recursive: true });
  fs.writeFileSync(path.join(dossier, `${fiche.id}.jpg`), jpeg);
  fs.writeFileSync(path.join(dossier, `${fiche.id}.json`), JSON.stringify(fiche, null, 1) + "\n");
  if (process.env.GITHUB_STEP_SUMMARY) {
    try { fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, ligneResume(fiche) + "\n"); } catch (e) { /* résumé facultatif */ }
  }
}

/** Ligne du résumé d'exécution GitHub pour un brouillon à valider. */
const ligneResume = (b) => b.sensible
  ? `- **Brouillon SENSIBLE à valider (niveau ${b.sensible})** : « ${b.titre} » (${b.type}${b.nommePersonne ? ", une personne est nommée dans le titre cité" : ""}), image instagram/brouillons/${b.id}.jpg. `
    + `Pour le publier ou le rejeter : onglet Actions > « Valider un brouillon » > Run workflow > id « ${b.id} » > action « publier » ou « rejeter ». Relire d'abord l'image et les sources (${(b.sources || []).slice(0, 2).join(" ; ") || "aucune"}).`
  : `- Brouillon à valider avant publication : « ${b.titre} » (${b.type}${b.nommePersonne ? ", nomme une personne" : ""}), fichier instagram/brouillons/${b.id}.jpg`;

/** Texte alternatif de l'image (accessibilité, fiche de publication) : ce que dit la story, sans rien ajouter. */
function texteAlternatif(type, titre, medias, sujets) {
  const m = (medias || []).length ? ` Repris par ${medias.length} média${medias.length > 1 ? "s" : ""} : ${medias.slice(0, 5).join(", ")}${medias.length > 5 ? "…" : ""}.` : "";
  if (type === "en-bref") return `Story Hémicycle France, En bref : ${(sujets || []).join(" ; ")}. Titres de presse cités, chaque média nommé dans l'image.`;
  return `Story Hémicycle France (${type}) : ${titre}.${m} Titres de presse cités, chaque média nommé dans l'image.`;
}

const MODELES_TYPE = { direct: "direct", facea: "face-a-face", chiffre: "chiffre", date: "date" };

/** Prépare le dessin et la fiche pour un choix : { titre, medias, sources, champs, dessin: [indice, titre, sondage, dossier, propre] }. */
function decrire(choix, now = new Date()) {
  const d = decrireBase(choix, now);
  if (d.type === "post" || d.champs.sensible || choix.modele === "rappel-agenda") return d; // le texte alternatif d'un post, ou d'un sujet sensible, est dans sa fiche (« alt », fabriqué par règles)
  const titre = d.champs.titrePropre || d.titre;
  return { ...d, champs: { ...d.champs, alt: texteAlternatif(d.type, titre, d.medias, d.champs.sujets) } };
}
/** Décrit un POST (loi adoptée ou rejetée, ou date lointaine) : entrée de file { type: "post" } + fiche de dessin du post et de sa story d'annonce. */
function decrirePost(choix, now) {
  if (choix.post) { // loi
    const f = choix.post;
    return { titre: f.titreCourt, medias: [], sources: [f.source], type: "post", post: { fiche: f, id: choix.id },
      champs: { donneesPropres: true, postGenre: "loi", voteId: f.voteId, titrePropre: f.titreCourt, legende: f.legende, alt: f.alt } };
  }
  const s = choix.sujet, f = ficheDate(s, now), videos = liensVideo(s.articles);
  return { titre: s.articles[0].titre || f.titreCourt, medias: sourcesDe_(s.articles), sources: sourcesDe(s.articles, videos), type: "post", post: { fiche: f, id: choix.id },
    champs: { titrePropre: f.titreCourt, postGenre: "date", dateIso: f.dateIso, legende: f.legende, alt: f.alt } };
}
/**
 * Décrit un sujet SENSIBLE : fiche fabriquée par règles (scripts/sujets-sensibles.cjs), contrôlée par formulationSure (une règle violée = erreur,
 * rien n'est écrit), sujet « synthétique » dessiné par le site (titre à nous, aucune personnalité, citation attribuée au niveau 2 seulement).
 * Le titre de presse reste dans « sujets » (détection de doublons) ; le titre de l'entrée est le nôtre.
 */
function decrireSensible(choix) {
  const c = choix.sensible, s = choix.sujet, date = s.derniere;
  const fiche = c.niveau === 1
    ? SS.ficheNiveau1(c, date)
    : SS.ficheNiveau2({ medias: c.medias, categorie: c.categorie, titreCite: c.citee.titre, reponseCitee: c.reponseCitee, date });
  const verif = SS.formulationSure([fiche.titre, fiche.pied, fiche.mention].join(" "), { juridiction: c.juridiction || "" });
  if (!verif.ok) throw new Error(`formulation refusée pour un sujet sensible : ${verif.problemes.join(" ; ")}`);
  const synth = SS.sujetPourDessin(fiche, { articles: c.articles, date, citee: c.niveau === 2 ? c.citee : null, theme: s.illustration?.theme === "justice" ? "justice" : "politique" });
  const sources = [...new Set(c.articles.map((a) => a.url).filter((u) => /^https:\/\//.test(u || "")))].slice(0, 12);
  const nommes = c.niveau === 2 ? (s.illustration?.personnes || []).map((p) => p.nom).filter((n) => { const nom = SS.plat(n).split(" ").slice(-1)[0], t = SS.plat(c.citee.titre); return nom.length >= 4 && new RegExp(`\\b${nom}\\b`).test(t); }) : [];
  return {
    titre: fiche.titre, medias: c.medias, sources, type: "story", args: [choix.indice, s.articles[0].titre, null, null, null, "une", null, synth],
    champs: {
      sensible: c.niveau, titrePropre: fiche.titre, sujets: [s.articles[0].titre], pied: fiche.pied, alt: fiche.alt, nommePersonne: nommes.length > 0,
      ...(c.niveau === 1 ? { juridiction: c.juridiction, nature: c.nature, penal: c.penal } : { categorie: c.categorie, reponseCitee: c.reponseCitee, citation: { titre: fiche.citation, media: c.citee.media, url: c.citee.url } }),
    },
  };
}
/** Story de rappel d'un événement de l'agenda : modèle « date », dessinée d'après un sujet synthétique (notre titre, source de l'agenda, aucune citation). */
function decrireRappelAgenda(choix, now) {
  const s = choix.sujet, n = joursAvantDate(s, now);
  const synth = { ...s, modeleImpose: "date" };
  return {
    titre: s.titrePropre.titre, medias: [s.articles[0].media], sources: [s.articles[0].url], type: "story", args: [-1, s.articles[0].titre, null, null, null, "date", null, synth],
    champs: { titrePropre: s.titrePropre.titre, modele: "date", rappelDe: choix.postId, dateIso: s.date.iso, alt: `Story Hémicycle France, date à retenir : ${s.titrePropre.titre}, dans ${n} jours (${s.date.jour} ${s.date.mois}). Date relevée auprès de ${s.articles[0].media}.` },
  };
}
function decrireBase(choix, now = new Date()) {
  if (choix.sensible) return decrireSensible(choix);
  if (choix.post || choix.modele === "post-date") return decrirePost(choix, now);
  if (choix.modele === "rappel-agenda") return decrireRappelAgenda(choix, now);
  if (choix.sondage) {
    const i = choix.sondage;
    return { titre: `Sondage ${i.nom} · intentions de vote au 1er tour (terrain : ${i.date})`, medias: [i.nom], sources: [i.url].filter((u) => /^https:\/\//.test(u || "")), champs: { sondageId: choix.sondageId }, args: [choix.indice, null, i, null, null], type: "sondage" };
  }
  if (choix.propre) {
    const p = choix.propre;
    return { titre: p.titre, medias: [], sources: [], champs: { donneesPropres: true, nommePersonne: Boolean(choix.nommePersonne), ...(choix.reserve ? { reserve: true } : {}), source: p.source }, args: [0, p.titre, null, null, p], type: p.type };
  }
  if (choix.dossier) {
    const d = choix.dossier;
    const videos = liensVideo(d.articles);
    return { titre: d.titre, medias: sourcesDe_(d.articles), sources: sourcesDe(d.articles, videos), champs: { dossierId: d.id, titrePropre: d.titre, ...(videos.length ? { videos } : {}) }, args: [0, d.titre, null, d.id, null], type: "dossier" };
  }
  if (choix.bref) {
    return { titre: "En bref : ce qu'il faut retenir aujourd'hui", medias: [], sources: choix.sources, champs: { bref: true, sujets: choix.bref.titresPropres, modele: "bref" }, args: [0, "", null, null, null, "bref", choix.bref], type: "en-bref" };
  }
  const titre = choix.sujet.articles[0].titre;
  const videos = liensVideo(choix.sujet.articles);
  const modele = choix.modele && choix.modele !== "une" ? choix.modele : null; // « une » : modèle par défaut, rien à ajouter
  return { titre, medias: sourcesDe_(choix.sujet.articles), sources: sourcesDe(choix.sujet.articles, videos), champs: { ...(choix.sujet.titrePropre?.titre ? { titrePropre: choix.sujet.titrePropre.titre } : {}), ...(videos.length ? { videos } : {}), ...(modele ? { modele } : {}), ...(modele === "date" && choix.sujet.date?.iso ? { dateIso: choix.sujet.date.iso } : {}) }, args: modele ? [choix.indice, titre, null, null, null, modele] : [choix.indice, titre, null, null, null], type: modele ? MODELES_TYPE[modele] || "actualite" : "actualite" };
}

// ---------------------------------------------------------------------------------------------------------------------
// VIDÉOS (data/stories-config.json : "videos": true, "videosMax" par jour) : animation de NOS visuels par scripts/videos-auto.cjs (ffmpeg).
//  - story vidéo : seulement pour un dossier ou un « direct » (l'entrée garde url_image ET reçoit url_video) ;
//  - Reel : pour chaque POST (entrée { type: "reel", reelDe }), publié par publier-stories.cjs après le post.
// Sans ffmpeg, ou si la génération échoue : aucune vidéo, l'image et le post partent seuls (jamais d'échec de la file).
// ---------------------------------------------------------------------------------------------------------------------
const REELS_ACTIFS = false; // décision du propriétaire : aucun Reel, jamais (un post ne se répète pas en vidéo)
const idReel = (idPost) => hashStable("reel|" + idPost);
const urlVideo = (id) => `https://tahns.github.io/hemicycle-france/instagram/auto/${id}.mp4`;
/** Vidéos de la file créées aujourd'hui (UTC+2) : stories vidéo et Reels. */
const videosDuJour = (entrees, now) => (entrees || []).filter((e) => e.url_video && e.cree && jourUTC2(e.cree) === jourUTC2(now)).length;
/** Animation propre au post : barre des voix (loi) ou compteur de jours (date) ; null si la fiche n'a pas de donnée chiffrée. */
function animationPost(fiche) {
  const sp = fiche?.spec || {};
  if (sp.genre === "loi" && Number.isInteger(sp.pour) && Number.isInteger(sp.contre) && sp.pour + sp.contre > 0) return { type: "barre", pour: sp.pour, contre: sp.contre };
  const j = /^(\d+) jours?$/.exec(sp.compte || "");
  if (sp.genre === "date" && j) return { type: "compteur", valeur: Number(j[1]), avant: "dans ", apres: " jours" };
  return null;
}
/** Génère instagram/auto/<id>.mp4 d'après instagram/auto/<source>.jpg ; renvoie { octets, duree } ou null (avertissement dans le résumé, la file continue sans vidéo). */
function produireVideo({ id, source = id, type, anim = null }) {
  try {
    const v = require("./videos-auto.cjs");
    const bin = v.trouverFfmpeg();
    if (!bin) { alerteResume("- **Vidéos** : ffmpeg absent, vidéo non générée (image seule)."); return null; }
    const r = v.genererVideo({ image: path.join(DOSSIER_IMG, `${source}.jpg`), sortie: path.join(DOSSIER_IMG, `${id}.mp4`), type, anim, bin });
    console.log(`[stories-auto] vidéo instagram/auto/${id}.mp4 (${(r.octets / 1048576).toFixed(2)} Mo, ${r.duree.toFixed(1)} s, ${r.blocs} blocs${r.anime ? ", barre ou compteur" : ""}).`);
    return r;
  } catch (e) {
    alerteResume(`- **Vidéos** : génération impossible pour ${id} (${e.message}) ; image seule.`);
    try { fs.unlinkSync(path.join(DOSSIER_IMG, `${id}.mp4`)); } catch (e2) { /* absent */ }
    return null;
  }
}

async function main() {
  const now = process.env.STORIES_AUTO_MAINTENANT ? new Date(process.env.STORIES_AUTO_MAINTENANT) : new Date();
  const { config, file, brouillons, donnees } = lireEtat(now);
  if (config.monetisation || config.validationHumaine) console.log(`[stories-auto] configuration : monétisation=${config.monetisation}, validation humaine=${config.validationHumaine}.`);
  // Réserve électorale : aucun sondage ne reste en file ni en brouillon (le publieur lit la file plus tard). Monétisation : aucune presse en file.
  const enReserve = reserveStory(now);
  const avant = file.entrees.length;
  file.entrees = purgerReserve(file.entrees, now);
  if (enReserve && file.entrees.length !== avant) console.log(`[stories-auto] réserve électorale (${enReserve}) : ${avant - file.entrees.length} story(s) de sondage retirée(s) de la file.`);
  const apresReserve = file.entrees.length;
  if (config.monetisation) file.entrees = purgerPresse(file.entrees);
  if (file.entrees.length !== apresReserve) console.log(`[stories-auto] monétisation : ${apresReserve - file.entrees.length} entrée(s) de presse retirée(s) de la file.`);
  const purge = file.entrees.length !== avant;
  const aSupprimer = brouillonsASupprimer(brouillons, now);
  for (const id of aSupprimer) for (const ext of ["jpg", "json"]) { try { fs.unlinkSync(path.join(DOSSIER_BROUILLONS, `${id}.${ext}`)); } catch (e) { /* déjà absent */ } }
  if (aSupprimer.length) console.log(`[stories-auto] brouillons supprimés (réserve électorale ou ancienneté) : ${aSupprimer.join(", ")}`);
  const restants = brouillons.filter((b) => !aSupprimer.includes(b.id));

  const choix = choisir({ ...donnees, file: { entrees: [...file.entrees, ...restants] }, now, config });
  const { gardees, images } = elaguer(file.entrees, now);
  // Une entrée récente dont l'image manque (ou n'est pas un JPEG) est retirée de la file, avec alerte : elle ne bloque rien
  const { gardees: saines, retirees } = retirerSansImage(gardees, images, (id) => imageValide(path.join(DOSSIER_IMG, `${id}.jpg`)));
  if (retirees.length) alerteResume(`- **File des stories** : entrée(s) retirée(s) faute d'image valide : ${retirees.join(", ")}.`);
  let entrees = saines;

  if (choix.refus) {
    console.log(`[stories-auto] rien à mettre en file : ${choix.refus}.`);
  } else {
    const d = decrire(choix, now);
    const vers = destination(choix, config);
    console.log(`[stories-auto] ${d.type} retenu${choix.medias ? ` (${choix.medias} média(s))` : ""} : ${d.titre} — destination : ${vers}`);
    const urlImage = (id) => `https://tahns.github.io/hemicycle-france/instagram/auto/${id}.jpg`;
    const ecrireImage = (id, jpeg) => {
      fs.mkdirSync(DOSSIER_IMG, { recursive: true });
      fs.writeFileSync(path.join(DOSSIER_IMG, `${id}.jpg`), jpeg);
      // Jamais d'entrée sans image : l'image écrite doit être relisible, sinon rien n'entre dans la file
      if (!imageValide(path.join(DOSSIER_IMG, `${id}.jpg`))) throw new Error(`l'image instagram/auto/${id}.jpg n'a pas été écrite correctement : aucune entrée ajoutée`);
    };
    if (d.type === "post") {
      // POST (1080 × 1350) puis, dans la file, sa story d'annonce (1080 × 1920) : publiée par publier-stories.cjs au plus tôt 5 min après le post
      const { post, annonce } = await dessinerPost(d.post.fiche, choix.id);
      const dp = dimensionsJpeg(post), da = dimensionsJpeg(annonce);
      if (!dp || dp.l !== 1080 || dp.h !== 1350) throw new Error(`image de post inattendue (${dp ? `${dp.l}×${dp.h}` : "pas un JPEG"})`);
      if (!da || da.l !== 1080 || da.h !== 1920) throw new Error(`image d'annonce inattendue (${da ? `${da.l}×${da.h}` : "pas un JPEG"})`);
      if (post.length > MAX_OCTETS || annonce.length > MAX_OCTETS) throw new Error("image de post ou d'annonce trop lourde");
      if (vers === "brouillon") {
        ecrireBrouillon({ id: choix.id, cree: now.toISOString(), titre: d.titre, type: "post", medias: d.medias, sources: d.sources, statut: "a-valider", nommePersonne: false, ...d.champs }, post);
        console.log(`[stories-auto] brouillon de post instagram/brouillons/${choix.id}.jpg (${Math.round(post.length / 1024)} Ko), à valider par un humain ; ni post ni annonce en file de publication.`);
      } else {
        const idA = idAnnonce(choix.id);
        ecrireImage(choix.id, post);
        ecrireImage(idA, annonce);
        const commun = { cree: now.toISOString(), medias: [], ...(d.champs.donneesPropres ? { donneesPropres: true } : {}) };
        entrees = [...entrees,
          { id: choix.id, ...commun, titre: d.titre, medias: d.medias, url_image: urlImage(choix.id), type: "post", sources: d.sources, ...d.champs },
          { id: idA, ...commun, titre: `Nouveau post : ${d.post.fiche.titreCourt}`, titrePropre: d.champs.titrePropre, url_image: urlImage(idA), type: "story", annonceDe: choix.id, sources: [], alt: `Story Hémicycle France qui annonce le nouveau post « ${d.post.fiche.titreCourt} ».` },
        ].slice(-GARDER);
        images.add(choix.id); images.add(idA);
        if (REELS_ACTIFS && config.videos && config.videosMax > 0 && videosDuJour(entrees, now) < config.videosMax) { // Reel : version animée du post, publiée après lui (JAMAIS : voir REELS_ACTIFS)
          const idR = idReel(choix.id), r = produireVideo({ id: idR, source: choix.id, type: "reel", anim: animationPost(d.post.fiche) });
          if (r) {
            try {
              require("./videos-auto.cjs").extraireVignette(path.join(DOSSIER_IMG, `${idR}.mp4`), path.join(DOSSIER_IMG, `${idR}.jpg`), 4.5);
              if (!imageValide(path.join(DOSSIER_IMG, `${idR}.jpg`))) throw new Error("vignette invalide");
              entrees = [...entrees, { id: idR, ...commun, titre: `Reel : ${d.post.fiche.titreCourt}`, titrePropre: d.champs.titrePropre, url_image: urlImage(idR), url_video: urlVideo(idR), type: "reel", reelDe: choix.id, sources: [], legende: d.champs.legende, alt: `Reel Hémicycle France, version animée du post « ${d.post.fiche.titreCourt} ».` }].slice(-GARDER);
              images.add(idR);
            } catch (e) {
              alerteResume(`- **Vidéos** : vignette du Reel ${idR} impossible (${e.message}) ; pas de Reel.`);
              for (const ext of ["mp4", "jpg"]) { try { fs.unlinkSync(path.join(DOSSIER_IMG, `${idR}.${ext}`)); } catch (e2) { /* absent */ } }
            }
          }
        }
        console.log(`[stories-auto] post instagram/auto/${choix.id}.jpg (${Math.round(post.length / 1024)} Ko) et story d'annonce instagram/auto/${idA}.jpg (${Math.round(annonce.length / 1024)} Ko).`);
      }
    } else {
      const jpeg = await dessiner(...d.args);
      const dim = dimensionsJpeg(jpeg);
      if (!dim || dim.l !== 1080 || dim.h !== 1920) throw new Error(`image inattendue (${dim ? `${dim.l}×${dim.h}` : "pas un JPEG"})`);
      if (jpeg.length > MAX_OCTETS) throw new Error(`image trop lourde (${jpeg.length} octets)`);
      if (vers === "brouillon") {
        ecrireBrouillon({ id: choix.id, cree: now.toISOString(), titre: d.titre, type: d.type, medias: d.medias, sources: d.sources, statut: "a-valider", nommePersonne: Boolean(choix.sondage || choix.nommePersonne), ...d.champs }, jpeg);
        console.log(`[stories-auto] brouillon instagram/brouillons/${choix.id}.jpg (${Math.round(jpeg.length / 1024)} Ko), à valider par un humain ; rien n'est mis en file de publication.`);
      } else {
        ecrireImage(choix.id, jpeg);
        // Story vidéo : seulement pour un dossier ou un « direct » (modèles à fort enjeu), si les vidéos sont activées et le plafond du jour non atteint
        const video = config.videos && (d.type === "dossier" || choix.modele === "direct") && videosDuJour(entrees, now) < config.videosMax
          ? produireVideo({ id: choix.id, type: "story" }) : null;
        entrees = [...entrees, { id: choix.id, cree: now.toISOString(), titre: d.titre, medias: d.medias, url_image: urlImage(choix.id), ...(video ? { url_video: urlVideo(choix.id) } : {}), type: "story", sources: d.sources, ...d.champs }].slice(-GARDER);
        images.add(choix.id);
        console.log(`[stories-auto] instagram/auto/${choix.id}.jpg (${Math.round(jpeg.length / 1024)} Ko).`);
      }
    }
  }

  const supprimes = nettoyerImages(new Set(entrees.filter((e) => images.has(e.id)).map((e) => e.id)));
  if (supprimes.length) console.log(`[stories-auto] images anciennes supprimées : ${supprimes.join(", ")}`);
  if ((!choix.refus && destination(choix, config) === "file") || purge || entrees.length !== file.entrees.length) {
    fs.mkdirSync(path.dirname(FICHIER_FILE), { recursive: true });
    fs.writeFileSync(FICHIER_FILE, JSON.stringify({ lastUpdated: now.toISOString(), entrees }, null, 1) + "\n");
    fs.writeFileSync(path.join(RACINE, "instagram", "file.atom"), fluxAtom(entrees, now));
  }
}

module.exports = { evenementsAgenda, choisirRappelAgenda, mediasDistinctsDe, OFF, titreGenerique, titresProches, titresRecents, texteAlternatif, appliquerSeuils, fluxAtom, dessiner, parleDeSondage, choisirSondage, choisir, reserveSondages, reserveStory, jourPublication, choisirSujet, choisirDossier, choisirEnBref, modeleSujet, faceAFace, chiffreSource, dateAVenir, jourParis, idBref, choisirDonneesPropres, idDossier, motExclu, idSujet, jourUTC2, heureParis, elaguer, nettoyerImages, dimensionsJpeg, normaliserConfig, lireConfig, purgerReserve, purgerPresse, destination, decrire, ecrireBrouillon, lireBrouillons, brouillonsASupprimer, ligneResume, MAX_PAR_JOUR, GARDER, retirerSansImage, imageValide, choisirPostLoi, choisirPostAgenda, ficheLoi, ficheDate, ficheAnnonce, decomposerTitreVote, idAnnonce, dessinerPost, nbPostsDuJour, joursAvantDate, estStoryComptee, titresRecentsH, MAX_POSTS_PAR_JOUR, idReel, videosDuJour, animationPost, produireVideo, choisirSensible, decrireSensible, dessinerPostSeul, titresDe, RACINE, DOSSIER_IMG, DOSSIER_BROUILLONS, FICHIER_FILE };

if (require.main === module) (process.argv.includes("--a-faire") ? Promise.resolve(aFaire()) : main()).catch((e) => { console.error("[stories-auto]", e.message); process.exit(1); });
