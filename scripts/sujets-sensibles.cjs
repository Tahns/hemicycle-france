/**
 * sujets-sensibles.cjs
 * --------------------
 * Informer sur la justice et les mises en cause SANS exposer le compte (diffamation, atteinte à la présomption d'innocence :
 * loi du 29 juillet 1881, art. 9-1 du Code civil). Fonctions pures (aucune lecture de fichier sauf lireMedias, aucun réseau),
 * partagées par stories-auto.cjs (choix automatique), valider-brouillon.cjs, story-a-la-demande.cjs et publier-stories.cjs (dernier filet).
 *
 * DEUX NIVEAUX (voir docs/PUBLICATION-AUTO.md, « Sujets sensibles : niveaux 1 et 2 ») :
 *  - NIVEAU 1 : fait judiciaire ÉTABLI = un sujet dont au moins N médias (2 par défaut) citent, dans leur propre titre, une juridiction
 *    ET une décision rendue (jugement, condamnation, relaxe, arrêt, décision du Conseil constitutionnel ou du Conseil d'État,
 *    ouverture d'une enquête ANNONCÉE PAR LE PARQUET). Publication automatique, texte fabriqué par règles : attribution
 *    (« Selon Le Monde et franceinfo »), juridiction, date des articles, AUCUN nom de personne, AUCUN verbe qui accuse,
 *    mention « présumée innocente » dès qu'une procédure pénale est en jeu, sources en pied. Jamais de citation d'un titre de presse.
 *  - NIVEAU 2 : tout le reste (accusation, plainte annoncée, polémique, révélation d'un seul média, personne mise en cause sans
 *    décision) : JAMAIS d'envoi automatique, seulement un BROUILLON à valider d'un geste.
 *  - FAITS DIVERS, MINEURS, VIOLENCES SEXUELLES, DÉCÈS, SUICIDE : ni l'un ni l'autre (comportement historique inchangé).
 * Aucune formulation ici n'est un avis juridique : elles réduisent le risque, elles ne l'annulent pas.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { concerneLaFrance } = require("./pertinence.cjs");
const LP = require("./liste-prudente.cjs"); // liste prudente unique (mots entiers) : âge de mineur, lycéen(ne) nommé(e)

const RACINE = path.resolve(__dirname, "..");
const FICHIER_MEDIAS = path.join(RACINE, "data", "medias-connus.json");

const plat = (t) => String(t || "").normalize("NFC").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’']/g, "'");
const majuscule = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
/** « 6 octobre 2026 » (jour de Paris) d'une date ISO. */
function dateFr(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const p = Object.fromEntries(new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${Number(p.day) === 1 ? "1er" : Number(p.day)} ${MOIS[Number(p.month) - 1]} ${p.year}`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Médias connus (liste fermée : data/medias-connus.json) : seul un lien https vers un de ces domaines peut être cité.
// ---------------------------------------------------------------------------------------------------------------------
function lireMedias(fichier = FICHIER_MEDIAS) {
  try {
    const j = JSON.parse(fs.readFileSync(fichier, "utf-8"));
    return (j.medias || []).filter((m) => m?.nom && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(m.domaine || ""));
  } catch (e) { return []; }
}
/** Média d'un lien : { nom, domaine } si le lien est en https (sans identifiants) vers le domaine d'un média connu ou l'un de ses sous-domaines, sinon null. */
function mediaDeLien(lien, medias = lireMedias()) {
  let u;
  try { u = new URL(String(lien || "").trim()); } catch (e) { return null; }
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return null;
  const hote = u.hostname.toLowerCase().replace(/\.$/, "");
  return medias.find((m) => hote === m.domaine || hote.endsWith("." + m.domaine)) || null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Mots : ce qui sort du cadre (jamais publié), ce que nos propres textes ne doivent jamais contenir.
// ---------------------------------------------------------------------------------------------------------------------
// Jamais publié, même en brouillon ni sur demande : mineurs, violences sexuelles, suicide (protection des personnes)
const RE_INTERDITS = /\b(mineur|mineure|mineurs|enfant|enfants|fillette|garconnet|adolescent|adolescente|collegien|collegienne|bebe|viol|viole|violee|violeur|agression sexuelle|agressions sexuelles|sexuel|sexuelle|sexuels|pedo\w*|pedocriminalite|inceste|incestueux|suicide|suicidaire)\b/;
// Faits divers, violences, décès : écartés par l'automatisme (non politiques) ; une demande directe validée par un humain peut les traiter
const RE_FAITS_DIVERS = /\b(meurtre|assassinat|assassine|homicide|tue|tuee|tues|fusillade|poignard\w*|coups de couteau|attentat|terroris\w*|mort|morte|morts|meurt|decede|deces|disparition|disparu|disparue|victime|victimes|drame|tragedie|fait divers|faits divers|blesse|blessee|blesses|feminicide|prostitution|proxenet\w*|tireur|tireurs|tuerie|tueries|explosion|explosions|incendie|incendies|naufrage|cadavre|pendaison)\b/;
/** Mot interdit d'un texte (ou null). `faitsDivers` : ajoute les faits divers, violences et décès. */
function motInterdit(texte, faitsDivers = false) {
  const t = plat(texte);
  const m = RE_INTERDITS.exec(t) || (faitsDivers ? RE_FAITS_DIVERS.exec(t) : null);
  if (m) return m[0];
  return LP.mineurIdentifiable(texte);
}

// Verbes et mots qui ACCUSENT ou qualifient une personne : jamais dans un texte écrit par le site (titre, pied, légende, texte alternatif)
const RE_ACCUSE = /\b(coupable|criminel|criminelle|escroc|voleur|voleuse|menteur|menteuse|corrompu|corrompue|fraudeur|pedophile|violeur|assassin|meurtrier|a detourne|a vole|a menti|a fraude|aurait detourne|auteur presume|responsable des faits|reconnu responsable|il est prouve|c'est prouve|avoue|avoue|poursuivi|poursuivie|inculpe|inculpee|mis en examen|mise en examen|suspect|suspecte|soupconne|soupconnee|accuse|accusee|accusent|accuser|accusation|accusations|scandale|affaires?|mensonge|escroquerie|fraude|corruption|detournement|blanchiment|derapage|presume coupable|presumee coupable)\b/;
/** Un texte écrit par le site respecte-t-il les règles ? { ok, problemes[] }. `juridiction` : texte de la juridiction citée (pour « procédure en cours »). */
function formulationSure(texte, { juridiction = "" } = {}) {
  const t = plat(texte), problemes = [];
  const m = RE_ACCUSE.exec(t);
  if (m) problemes.push(`mot interdit « ${m[0]} » (verbe ou qualificatif qui accuse)`);
  if (/\bcoupable\b/.test(t)) problemes.push("jamais « coupable »");
  if (/procedure en cours|procedures en cours/.test(t) && !(juridiction || RE_JURIDICTION_TEXTE.test(t))) problemes.push("« procédure en cours » sans juridiction");
  if (/[<>{}]/.test(texte)) problemes.push("caractère interdit");
  return { ok: !problemes.length, problemes };
}
const RE_JURIDICTION_TEXTE = /tribunal|cour d'appel|cour de cassation|cour d'assises|conseil constitutionnel|conseil d'etat|parquet|cour de justice|cour europeenne/;

// ---------------------------------------------------------------------------------------------------------------------
// Juridictions et décisions citées dans UN titre.
// ---------------------------------------------------------------------------------------------------------------------
// [expression (sur le titre sans accents), nom affiché, procédure pénale en jeu ?, lieu possible ?]
const JURIDICTIONS = [
  [/conseil constitutionnel/, "le Conseil constitutionnel", false, false],
  [/conseil d'etat/, "le Conseil d'État", false, false],
  [/cour de cassation/, "la Cour de cassation", true, false],
  [/cour de justice de la republique|\bcjr\b/, "la Cour de justice de la République", true, false],
  [/cour europeenne des droits de l'homme|\bcedh\b/, "la Cour européenne des droits de l'homme", false, false],
  [/cour de justice de l'union europeenne|\bcjue\b/, "la Cour de justice de l'Union européenne", false, false],
  [/cour d'assises/, "la cour d'assises", true, true],
  [/cour d'appel/, "la cour d'appel", true, true],
  [/tribunal administratif/, "le tribunal administratif", false, true],
  [/tribunal correctionnel/, "le tribunal correctionnel", true, true],
  [/tribunal judiciaire/, "le tribunal judiciaire", true, true],
  [/tribunal de commerce/, "le tribunal de commerce", false, true],
  [/tribunal de police/, "le tribunal de police", true, true],
  [/\btribunal\b/, "le tribunal", true, true],
  [/parquet national financier|\bpnf\b/, "le parquet national financier", true, false],
  [/\bparquet\b/, "le parquet", true, true],
];
const RE_LIEU = /^\s*(de |du |d['’])(?:la |l['’])?(\p{Lu}[\p{L}'’-]*)/u;
/** Juridiction citée dans un titre : { nom (avec le lieu s'il est donné), generique (sans lieu), penal } ou null. */
function juridictionDuTitre(titre) {
  const orig = String(titre || "").normalize("NFC");
  const p = plat(orig);
  for (const [re, nom, penal, lieu] of JURIDICTIONS) {
    const m = re.exec(p);
    if (!m) continue;
    let complet = nom;
    if (lieu && p.length === orig.length) {
      const l = RE_LIEU.exec(orig.slice(m.index + m[0].length));
      if (l) complet = `${nom} ${l[1]}${l[2]}`.replace(/d' /, "d'");
    }
    return { nom: complet, generique: nom, penal };
  }
  return null;
}

// Un titre qui annonce, réclame, attend ou envisage une décision n'en cite pas une : écarté du niveau 1
const RE_PAS_UNE_DECISION = /\b(requier\w*|requis\w*|requisition\w*|pourrait|pourraient|devrait|devraient|attendu\w*|attend|sera|seront|rendra|rendront|va rendre|va juger|vont juger|saisi|saisit|saisira|reclame\w*|souhaite|veut|espere|craint|menace\w*|decidera|audience|delibere le|aurait|auraient|serait|seraient|selon une source)\b/;
/** Nature de la décision citée dans un titre : "condamnation", "relaxe", "enquete" (annoncée par le parquet), "decision", ou null. */
function natureDuTitre(titre, jur) {
  const t = plat(titre);
  if (!jur || RE_PAS_UNE_DECISION.test(t)) return null;
  if (/condamn/.test(t)) return "condamnation";
  if (/relax|acquitt/.test(t)) return "relaxe";
  if (/parquet/.test(jur.generique) && /(ouvr\w*|ouverture)[^|]{0,40}enquete|enquete[^|]{0,30}(ouverte|ouvre)/.test(t)) return "enquete";
  if (/jugement|verdict|\barret\b|decision|censur|invalid|annul|suspend|rejette|deboute|\bvalide\b|valident|tranche|ordonne|\bjuge\b/.test(t) && !/parquet/.test(jur.generique)) return "decision";
  return null;
}
const VERBE = { condamnation: "a prononcé une condamnation", relaxe: "a prononcé une relaxe", decision: "a rendu une décision" };

/** Texte de la juridiction et de la décision, par ordre de fréquence parmi les titres retenus (égalité : la version sans lieu). */
function consensus(valeurs) {
  const n = new Map();
  for (const v of valeurs) n.set(v, (n.get(v) || 0) + 1);
  const tri = [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length);
  return tri.length > 1 && tri[0][1] === tri[1][1] ? null : tri[0]?.[0] || null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Pertinence : on ne traite que la vie politique française.
// ---------------------------------------------------------------------------------------------------------------------
const RE_POLITIQUE = /\b(ministre|ministere|depute|deputee|senateur|senatrice|senat|assemblee|gouvernement|elysee|matignon|president|presidente|maire|elu|elue|elus|parti|partis|candidat|candidate|campagne|election|elections|prefet|prefete|region|departement|conseil municipal|conseil regional|conseil departemental|collectivite|rn|lfi|pcf|renaissance|republicains|insoumis|insoumise|ecologiste|ecologistes|socialiste|socialistes|horizons|modem|udr|ps|lr|eelv|premier ministre|garde des sceaux|parlementaire|parlementaires|conseil constitutionnel|conseil d'etat|loi|projet de loi|decret|budget|fonds publics|subvention)\b/;
function estPolitique(sujet) {
  const titres = (sujet?.articles || []).map((a) => a.titre || "");
  if (!titres.length || !concerneLaFrance(titres)) return false;
  if ((sujet.illustration?.personnes || []).length) return true;
  return titres.some((t) => RE_POLITIQUE.test(plat(t)) || /conseil constitutionnel|conseil d.etat/.test(plat(t)));
}

// ---------------------------------------------------------------------------------------------------------------------
// Classement d'un sujet de presse.
// ---------------------------------------------------------------------------------------------------------------------
const RE_FAITS = /ineligib|jugement|accus|mis en cause|mise en cause|mis en examen|mise en examen|garde a vue|plainte|enquete|poursuiv|poursuite|soupcon|suspect|inculp|perquisition|mandat|fraude|corruption|detourn|escroqu|blanchi|scandale|affaire|proces|tribunal|parquet|justice|judiciaire|condamn|relax|diffam|calomni|mentir|mensonge|menace|citation directe|incarcer|ecroue|emprisonn|prison|detention/;
const RE_REPONSE = /\b(dement\w*|conteste\w*|nie|nient|se defend\w*|reponse|repond\w*|reagit|reagissent|replique\w*|rejette les accusations|denonce une)\b/;

/**
 * Classe un sujet de presse déjà jugé « sensible » (mot de la liste prudente ou thème justice) par l'appelant.
 * Renvoie { refus } (rien, jamais), ou { niveau: 1, ... } (fait judiciaire établi), ou { niveau: 2, ... } (brouillon).
 * minMedias : seuil du niveau 1 (2 par défaut). Ne regarde pas la fraîcheur ni les plafonds (rôle de l'appelant).
 */
function classerSujet(sujet, { minMedias = 2, motExclu = () => null } = {}) {
  const articles = (sujet?.articles || []).filter((a) => a?.titre && a?.media);
  if (!articles.length) return { refus: "aucun article" };
  const tousTitres = articles.map((a) => a.titre);
  const medias = [...new Set(articles.map((a) => a.media))];
  const interdit = tousTitres.map((t) => motInterdit(t, true)).find(Boolean);
  if (interdit) return { refus: `fait divers, mineur, violence ou décès (« ${interdit} ») : jamais publié` };
  if (!estPolitique(sujet)) return { refus: "hors de la vie politique française" };
  const sensible = sujet.illustration?.theme === "justice" || tousTitres.some((t) => motExclu(t));
  if (!sensible) return null; // sujet ordinaire : le circuit habituel s'en charge

  // NIVEAU 1 : au moins minMedias médias citent chacun, dans leur titre, une juridiction ET une décision rendue
  const retenus = [];
  for (const a of articles) {
    const jur = juridictionDuTitre(a.titre);
    const nature = natureDuTitre(a.titre, jur);
    if (jur && nature) retenus.push({ a, jur, nature });
  }
  const mediasDecision = [...new Set(retenus.map((r) => r.a.media))];
  if (mediasDecision.length >= minMedias) {
    const natures = retenus.map((r) => r.nature);
    const nature = consensus(natures) || "decision";
    const jurNom = consensus(retenus.map((r) => r.jur.nom)) || consensus(retenus.map((r) => r.jur.generique)) || retenus[0].jur.generique;
    const penal = retenus.some((r) => r.jur.penal) || nature === "condamnation" || nature === "relaxe" || nature === "enquete";
    return { niveau: 1, juridiction: jurNom, nature, penal, medias: mediasDecision, articles: retenus.map((r) => r.a) };
  }

  // NIVEAU 2 : brouillon à valider
  const faits = tousTitres.some((t) => RE_FAITS.test(plat(t)));
  const reponse = articles.find((a) => RE_REPONSE.test(plat(a.titre)));
  return { niveau: 2, categorie: faits ? "faits" : "polemique", medias, articles, citee: reponse || articles[0], reponseCitee: Boolean(reponse) };
}

// ---------------------------------------------------------------------------------------------------------------------
// Fabrication des textes (par règles, jamais de texte libre).
// ---------------------------------------------------------------------------------------------------------------------
/** « Le Monde », « Le Monde et franceinfo », « Le Monde et 3 autres médias » (titre court). */
function listeMedias(noms) {
  const n = [...new Set(noms.filter(Boolean))];
  if (n.length <= 1) return n[0] || "la presse";
  if (n.length === 2) return `${n[0]} et ${n[1]}`;
  return `${n[0]} et ${n.length - 1} autres médias`;
}
/** Sources en pied : jusqu'à 3 médias nommés, puis « et N autres ». */
const listeSources = (noms) => { const n = [...new Set(noms.filter(Boolean))]; return n.length <= 3 ? n.join(", ") : `${n.slice(0, 3).join(", ")} et ${n.length - 3} autre${n.length - 3 > 1 ? "s" : ""}`; };
const MENTION_INNOCENCE = "Toute personne citée est présumée innocente tant qu'elle n'a pas été jugée définitivement.";
const MENTION_NON_ETABLI = "Faits non établis par la justice : toute personne citée est présumée innocente.";
const nettoyerTitre = (t) => String(t || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
const coupe = (t, n) => (t.length <= n ? t : t.slice(0, n - 1).replace(/\s+\S*$/, "") + "…");

/**
 * Fiche d'un NIVEAU 1 : { titre, pied, alt, mention, libelle } ; jamais un nom de personne, jamais une citation de titre de presse.
 * `date` : ISO de la dernière mise à jour du sujet (date des articles).
 */
function ficheNiveau1(c, date) {
  const medias = listeMedias(c.medias);
  const jour = dateFr(date);
  const verbe = c.nature === "enquete" ? "a annoncé l'ouverture d'une enquête" : VERBE[c.nature] || VERBE.decision;
  const titre = `Selon ${medias} : ${c.juridiction} ${verbe}`;
  const mention = c.penal ? MENTION_INNOCENCE : "";
  const pied = `Sources : ${listeSources(c.medias)}${jour ? ` (articles du ${jour})` : ""}. ${mention}`.trim();
  const alt = `Story Hémicycle France : selon ${medias}, ${c.juridiction} ${verbe}${jour ? ` (articles du ${jour})` : ""}. ${mention}`.trim();
  return { titre, pied, alt, mention, libelle: "Décision de justice", theme: "justice", juridiction: c.juridiction, nature: c.nature };
}

/**
 * Fiche d'un NIVEAU 2 (brouillon) ou d'une demande directe : titre neutre à nous attribué au média, titre du média cité entre guillemets
 * (si fourni), mention « présumée innocente ». `categorie` : "faits", "polemique" ou "information" ; `consulte` : la date est celle de la consultation (demande directe).
 */
function ficheNiveau2({ medias, categorie = "faits", titreCite = "", reponseCitee = false, date, consulte = false }) {
  const liste = listeMedias(medias);
  const suite = categorie === "polemique" ? "une polémique en cours" : categorie === "information" ? "une information à vérifier à la source" : "des faits non établis à ce stade";
  const titre = `Selon ${liste} : ${suite}`;
  const jour = dateFr(date);
  const mention = categorie === "faits" ? MENTION_NON_ETABLI : "Toute personne citée est présumée innocente de tout fait non jugé.";
  const reponse = reponseCitee ? " Sa réponse figure dans la citation." : "";
  const pied = `Source${medias.length > 1 ? "s" : ""} : ${listeSources(medias)}${jour ? ` (${consulte ? "consulté le " : ""}${jour})` : ""}. ${mention}${reponse}`.trim();
  const citation = nettoyerTitre(titreCite);
  const alt = `Story Hémicycle France : selon ${liste}, ${suite}.${citation ? ` Titre cité : « ${coupe(citation, 200)} », ${medias[0]}.` : ""} ${mention}${reponse}`.trim();
  return { titre, pied, alt, mention, libelle: "Selon la presse", citation: citation ? coupe(citation, 220) : "" };
}

/** Légende d'un POST sensible (niveau 2 ou demande) : attribution, citation, mention, source (lien de l'article), compte. */
function legendePost({ titre, citation = "", media = "", mention, lien = "" }) {
  return [
    `${titre}.`,
    "",
    ...(citation ? [`Titre cité : « ${citation} » (${media}).`, ""] : []),
    mention,
    ...(lien ? ["", `Source : ${media}, ${lien}`] : []),
    "",
    "Toute l'actu politique : @hemicyclefrance",
    "#Politique #Presse #Actualité",
  ].join("\n");
}

/** Sujet « synthétique » passé au dessin du site (js/stories-actu.js) : titre à nous, pied, étiquette, citation facultative, aucune personnalité. */
function sujetPourDessin(fiche, { articles, date, citee = null, theme = "politique", sansHeure = false }) {
  const a0 = citee || articles[0];
  const reste = articles.filter((a) => a !== a0 && a.media !== a0.media);
  return {
    derniere: date,
    illustration: { theme: fiche.theme || theme, personnes: [], partis: [] },
    titrePropre: { titre: fiche.titre, origine: "sensible" },
    // niveau 1 : aucun titre de presse n'est cité (les articles ne servent qu'aux pastilles des médias) ; sinon la citation vient de articles[0]
    articles: [{ titre: fiche.citation || fiche.titre, url: a0.url, media: a0.media, date: a0.date || date }, ...reste.map((a) => ({ titre: fiche.titre, url: a.url, media: a.media, date: a.date || date }))],
    sensible: { libelle: fiche.libelle, pied: fiche.pied, sansCitation: !fiche.citation, sansHeure },
  };
}

/** Identifiant (12 hexadécimaux) d'une demande directe : stable pour un même lien (pas de doublon). */
const idDemande = (lien) => crypto.createHash("sha1").update("demande|" + String(lien).trim().replace(/#.*$/, "")).digest("hex").slice(0, 12);

module.exports = { plat, dateFr, lireMedias, mediaDeLien, motInterdit, formulationSure, juridictionDuTitre, natureDuTitre, estPolitique, classerSujet, listeMedias, ficheNiveau1, ficheNiveau2, legendePost, sujetPourDessin, idDemande, nettoyerTitre, coupe, MENTION_INNOCENCE, MENTION_NON_ETABLI, RE_REPONSE };
