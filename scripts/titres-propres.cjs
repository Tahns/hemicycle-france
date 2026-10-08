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


const INSTITUTIONS = new Set(["senat", "assemblee", "nationale", "etat", "elysee", "matignon", "republique", "france", "europe", "parlement", "gouvernement", "union", "conseil", "constitutionnel", "palais", "bourbon"]);
const majuscules = (t) => (String(t).match(/\p{Lu}/gu) || []).length;
/** Participe passé / forme verbale en tête : « Examiné au Sénat », « Annoncé… » ne sont pas des titres de sujet. */
const estParticipe = (m) => /(é|ée|és|ées|ant)$/i.test(m) && (!/t(é|ée|és|ées)$/i.test(m) || /^(adopt|vot|rejet|présent|dénonc|prévu|promulgu|déposé|écart|lanc|arrêt|visé|attaqu|ciblé|débattu|porté|menacé|contesté)/i.test(m)) || /^(examin|annonc|dénonc|attendu|ouvert|mis|pris|prévu|voté)/i.test(m);
/** Deux mots de suite à majuscule initiale : prénom + nom, pas un intitulé de sujet. */
const ressembleANom = (t) => { const w = t.split(" "); return w.some((x, i) => i > 0 && /^\p{Lu}/u.test(x) && /^\p{Lu}/u.test(w[i - 1]) && !estMotVide(x)); };

/** Nom d'un texte de loi cité entre guillemets dans au moins la moitié des titres : « Projet de loi « casseurs-payeurs » ». */
function titreDeTexte(articles) {
  const compte = new Map();
  for (const a of articles) {
    const vus = new Set();
    for (const m of String(a.titre).matchAll(/\b(projet de loi|proposition de loi|loi)\s+(?:organique\s+)?[«"“]\s*([^»"”]{3,40}?)\s*[»"”]/giu)) {
      const cle = plat(m[2]).replace(/-/g, " ");
      if (vus.has(cle)) continue;
      vus.add(cle);
      const e = compte.get(cle) || { n: 0, noms: new Map(), formes: new Map() };
      e.n++;
      e.noms.set(m[2], (e.noms.get(m[2]) || 0) + 1);
      const f = m[1].toLowerCase();
      e.formes.set(f, (e.formes.get(f) || 0) + 1);
      compte.set(cle, e);
    }
  }
  const e = [...compte.values()].sort((x, y) => y.n - x.n)[0];
  if (!e || e.n < Math.max(2, Math.ceil(articles.length * 0.5))) return null;
  const forme = [...e.formes].filter(([f]) => f !== "loi").sort((x, y) => y[1] - x[1])[0]?.[0] || "loi";
  const nom = [...e.noms].sort((x, y) => y[1] - x[1])[0][0];
  return `${forme.charAt(0).toUpperCase()}${forme.slice(1)} « ${nom} »`;
}

/** Titre à nous : null si rien de solide. Les dossiers (data/actualites.json) ont déjà un titre éditorial. */
function titrePropre(sujet, dossiers = []) {
  const articles = sujet?.articles || [];
  if (!articles.length) return null;
  const urls = new Set(articles.map((a) => a.url));
  // Dossier : au moins la moitié des articles du sujet y figurent (un seul article dans un dossier ne suffit pas)
  const dossier = (dossiers || []).find((d) => d?.titre && articles.filter((a) => (d.articles || []).some((x) => x.url === a.url)).length * 2 >= articles.length);
  if (dossier) return { titre: dossier.titre, origine: "dossier" };

  const medias = new Set(articles.map((a) => a.media)).size;
  if (medias < 2) return null; // un seul média : rien à recouper
  // Des médias d'un même groupe reprennent parfois le même article, titre identique : ce n'est pas un recoupement
  if (new Set(articles.map((a) => plat(nettoyer(a.titre)))).size < 2) return null;
  const loi = titreDeTexte(articles);
  if (loi) return { titre: loi, origine: "recoupement" };
  const N = articles.length, df = new Map();
  const interdits = new Set([
    ...(sujet.illustration?.personnes || []).flatMap((p) => plat(p.nom).split(/[\s-]+/)),
    ...articles.map((a) => plat(a.media)),
  ]);
  // Noms propres : mot à majuscule ailleurs qu'en début de phrase (et le mot capitalisé qui le précède : prénom)
  const propres = new Set();
  for (const a of articles) for (const c of clauses(a.titre)) {
    const w = motsDe(c);
    w.forEach((x, i) => {
      if (i > 0 && /^\p{Lu}/u.test(x) && !INSTITUTIONS.has(plat(x))) { propres.add(plat(x)); if (/^\p{Lu}/u.test(w[i - 1])) propres.add(plat(w[i - 1])); }
    });
  }
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
        const texte = g.join(" ");
        const e = df.get(cle) || { n: 0, texte, len: n, cle };
        if (majuscules(texte) < majuscules(e.texte)) e.texte = texte; // forme avec le moins de majuscules (« casse de phrase » écartée)
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
    if (m.some((x) => (interdits.has(x) && !MOTS_VIDES.has(x)) || propres.has(x))) return false; // jamais le nom d'une personne citée
    if (estParticipe(e.texte.split(" ")[0])) return false; // « Examiné au Sénat » : un verbe, pas un sujet
    if (ressembleANom(e.texte)) return false; // « Sébastien Lecornu » : deux majuscules de suite = un nom propre
    return e.texte.length >= 8 && e.texte.length <= 64;
  }).sort((a, b) => b.n - a.n || b.len - a.len);
  if (!bons.length) return null;
  const meilleur = bons[0];
  // L'expression doit vraiment résumer : elle couvre au moins 2 mots, ou un mot long repris par la moitié des titres
  if (meilleur.len < 2 && meilleur.texte.length < 9) return null;
  return { titre: meilleur.texte.charAt(0).toUpperCase() + meilleur.texte.slice(1), origine: "recoupement" };
}


// ─────────────────────────────────────────────────────────────────────────────
// Titres à nous, par règles (aucune IA, aucun réseau) : thème + acteur + action neutre, jamais un titre de média.
// ─────────────────────────────────────────────────────────────────────────────
const LONGUEUR_MAX = 70;
/** Sujets reconnus (le premier qui correspond gagne) : S = intitulé court, O = complément (« sur … »), local = ce qui se passe sur place. */
const THEMES_TITRES = [
  { re: /missile|dissuasion|sous.marin nucleaire|arme nucleaire|force de frappe/, S: "Dissuasion nucléaire", O: "la dissuasion nucléaire", local: "dissuasion nucléaire" },
  { re: /lyce|blocus|parcoursup|mouvement lyceen/, S: "Lycées", O: "la mobilisation lycéenne", local: "mobilisation lycéenne" },
  { re: /casseurs.payeurs/, S: "Loi « casseurs-payeurs »", O: "la loi « casseurs-payeurs »", local: "débat sur la loi" },
  { re: /violences sexuelles/, S: "Violences sexuelles", O: "la loi contre les violences sexuelles", local: "débat sur la loi" },
  { re: /plein.emploi/, S: "Plein-emploi", O: "la loi sur le plein-emploi", local: "bilan de la loi" },
  // « primaire » : « de la gauche » seulement si la majorité des titres dit « primaire » et « gauche » (jamais « droite ») ; sinon titre générique (jamais publié)
  { re: /\bprimaires?\b/, ok: (arts) => partDe(arts, /\bprimaires?\b/, /\bgauche/) >= 0.5 && partDe(arts, /\bprimaires?\b/, /\bdroite\b|\becoles?\b|\bprimates?\b/) === 0, S: "Primaire de la gauche", O: "la primaire de la gauche", local: "primaire de la gauche" },
  { re: /\bprimaires?\b/, ok: (arts) => partDe(arts, /\bprimaires?\b/, /\bcandidat|\bpresidentielle|\binvestiture|\bscrutin|\bparti\b|\bps\b|\blr\b|\bdroite\b|\bcentre\b|\bgauche/) > 0, S: "Primaire", O: "une primaire", local: "primaire", generique: true },
  { re: /\bpresidentielle|candidat a l'elysee/, S: "Présidentielle 2027", O: "la présidentielle de 2027", local: "présidentielle" },
  { re: /budget|dette|deficit|defaut|economies|milliards|impot|fiscal|taxe|carburant|indemnites|finances/, S: "Finances publiques", O: "les finances publiques", local: "finances locales" },
  { re: /conseil municipal|conseil de la metropole|conseil departemental/, S: "Conseil municipal", O: "le conseil municipal", local: "conseil municipal" },
  { re: /intelligence artificielle|\bia\b/, S: "Intelligence artificielle", O: "l'intelligence artificielle dans l'administration", local: "intelligence artificielle" },
  { re: /\beau\b|climat|ecolog|biodiversite|environnement|riviere|energie/, S: "Environnement", O: "l'environnement", local: "environnement" },
  { re: /cantine|intoxication|sante|hopital|medecin/, S: "Santé", O: "la santé publique", local: "santé publique" },
  { re: /numerique|piratee|cyber|donnees/, S: "Numérique", O: "le numérique et les données", local: "numérique" },
  { re: /extradition|hongrie|etranger|international|diplomat/, S: "International", O: "une affaire internationale", local: "affaire internationale" },
  { re: /tribunal|plainte|proces|victime|ineligib|parquet|justice|procureur|affaire /, S: "Justice", O: "une procédure judiciaire", local: "procédure en cours" },
  { re: /police|gendarm|securite(?! sociale)|armes|lance.grenade|ordre public/, S: "Sécurité", O: "le maintien de l'ordre", local: "sécurité" },
  { re: /refugie|asile|migrant|immigration|logement|\btoit\b/, S: "Logement et accueil", O: "le logement et l'accueil", local: "logement et accueil" },
  { re: /\bzac\b|urbanisme|permis de construire|amenagement|terrain|travaux|lac de/, S: "Aménagement", O: "l'aménagement du territoire", local: "projet d'aménagement" },
  { re: /alsace|metropole|grand paris|grand est|region|departement|collectivit/, S: "Collectivités locales", O: "l'organisation des collectivités", local: "organisation territoriale" },
  { re: /ecole|enfants\b|scolaire|periscolaire|etudiant|jeunesse|college|education/, S: "Éducation et jeunesse", O: "l'éducation et la jeunesse", local: "actualité scolaire" },
  { re: /emploi|chomage|association|syndicat|\bsociale?\b|pauvre|retraite/, S: "Social", O: "le social et l'emploi", local: "actualité sociale" },
  { re: /senat|senateur|centriste/, S: "Sénat", O: "le Sénat", local: "actualité du Sénat" },
  { re: /\bdeputes?\b|\bdeputees?\b|assemblee nationale|hemicycle/, S: "Assemblée nationale", O: "les débats parlementaires", local: "actualité parlementaire" },
  { re: /gouvernement|ministre|matignon|elysee/, S: "Gouvernement", O: "l'action du gouvernement", local: "action du gouvernement" },
  { re: /elu|maire|commune|mairie|municipal|election/, S: "Vie locale", O: "la vie locale", local: "vie municipale" },
];
for (const t of THEMES_TITRES) if (!t.entier) { t.re = new RegExp("\\b(?:" + t.re.source + ")"); t.entier = true; }
/** Part des titres qui contiennent `a` et, parmi eux, `b` (0 s'il n'y en a aucun). */
function partDe(arts, a, b) {
  const l = arts.map((x) => plat(x.titre || "")).filter((t) => a.test(t));
  return l.length ? l.filter((t) => b.test(t)).length / l.length : 0;
}
/** Thème d'un sujet (le premier de la liste qui correspond au titre central, puis à l'ensemble des titres) ; les thèmes à condition `ok` ne comptent que si elle est vraie. Budget l'emporte sur présidentielle s'il est cité en premier. */
function themeDe(articles, p, tous, premier) {
  const valide = (t) => !t.ok || t.ok(articles.slice(0, 6));
  const cherche = (txt) => {
    const t = THEMES_TITRES.find((x) => valide(x) && x.re.test(txt));
    if (t?.S === "Présidentielle 2027") { // « Budget 2027 : … » reste un sujet de finances publiques
      const b = THEMES_TITRES.find((x) => x.S === "Finances publiques");
      const i = b.re.exec(txt)?.index, j = t.re.exec(txt)?.index;
      if (i !== undefined && i < j) return b;
    }
    return t;
  };
  return cherche(p) || cherche(tous) || cherche(plat(premier));
}
const THEME_ILLUSTRATION = { gouvernement: "Gouvernement", budget: "Finances publiques", politique: "Politique", justice: "Justice", election: "Élections", assemblee: "Assemblée nationale", senat: "Sénat", securite: "Sécurité", international: "International" };
const PREFIXES_NON_LIEUX = /^(politique|social|editorial|edito|billet|humour|insolite|economie|societe|sport|culture|direct|en direct|video|replay|opinion|tribune|chronique|analyse|enquete|reportage|portrait|international|monde|france|actualite|colere|mouvement|mobilisation|manifestations?|blocage|blocus|contestation|budget|loi|affaire|presidentielle|primaire|gouvernement|assemblee|senat|justice|securite|dessin|le dessin|pourquoi|comment|apres|avant|pas de|un|une)\b/;
/** « Gilley. Avec… », « Voiron. Loi contre… », « Pyrénées-Atlantiques : le tribunal… » : le lieu en tête de titre, ou null. */
function lieuDuTitre(titre) {
  const m = String(titre || "").replace(/^(DIRECT|EN DIRECT|VIDÉO|Vidéo)\s*[.:-]\s*/, "").match(/^(\p{Lu}[\p{L}'’-]*(?:\s+(?:de|du|des|la|le|les|sur|sous|en|d['’]|l['’])?\s*\p{Lu}[\p{L}'’-]*){0,2})\s*[.:]\s+\S/u);
  if (!m) return null;
  const lieu = m[1].replace(/\s+/g, " ").trim();
  if (lieu.length < 3 || lieu.length > 30 || PREFIXES_NON_LIEUX.test(plat(lieu)) || THEMES_TITRES[0].re.test(plat(lieu))) return null;
  return lieu;
}
// Une action n'est affirmée que si SON mot est dans le titre : « suspend la réforme » n'est pas « décision du tribunal administratif », « rejette » n'est pas un vote,
// « dépose une motion de censure » n'est pas une proposition de loi. Les mots sont des débuts de mot (\b) ; les participes passifs (« critiqué par ») sont écartés.
const ACTIONS = [
  ["essai", /tir d.(?:essai|exercice)|assiste a un tir|essai d.un|test d.un|reussit un tir|tir de missile|a teste/, "essai lié à"],
  ["decision", /tribunal administratif/, "décision du tribunal administratif sur"],
  ["vote", /\badopt(?:e|ee|es|ees|ent|er)\b|\bvotent\b|\bvote par\b|\bvotee?s?\b|\bvote\b/, "vote sur"],
  ["depot", /proposition de loi|\bppl\b/, "proposition de loi sur"],
  ["appel", /\bappelle\b|\bappellent\b|\bappel a\b|\bmobilisent\b|\bmobilise\b/, "appel sur"],
  ["reponse", /\bcherche la|\breponse\b|\brepond|\breagit|\bface a\b/, "réponse sur"],
  ["temoignage", /\btemoign|ca fait mal|\blarmes\b|\bmaman\b/, "témoignage sur"],
  ["annonce", /\blance\s|\bannonce|\bpropose|\bpresente|\bpromet|\bdevoile|\bdetaille/, "annonces sur"],
  ["position", /\bdenonce|\bestime|\baffirme|\bdeclare|\bcritique|\bindique|\bexige|\breclame|\bmet en garde|\bsouhaite|\bdit\b|\bvent debout|\brappelle|\bevoque/, "prise de position sur"],
];
/** Première action reconnue dans le titre, avec sa position ; null si le verbe est au passif (« critiqué par … ») : alors le sujet subit l'action. */
function actionDe(p) {
  for (const a of ACTIONS) {
    const m = a[1].exec(p);
    if (!m) continue;
    const reste = p.slice(m.index + m[0].length);
    if (/^(?:e|es|s|ee|ees)? ?par\b/.test(reste) || /^[a-z]*(?:e|es|ee|ees)? par\b/.test(reste.slice(0, 12))) continue;
    return { cle: a[0], phrase: a[2], index: m.index };
  }
  return null;
}
const ABREV = { SOC: "PS", ECO: "Écologistes", EPR: "EPR", RN: "RN", LFI: "LFI", LR: "LR", UDR: "UDR", PS: "PS", MODEM: "MoDem", DEM: "MoDem", HOR: "Horizons", LIOT: "LIOT", GDR: "GDR" };
// Listes de mots prudents : UNE seule source (scripts/liste-prudente.cjs, mots entiers), la même que stories-auto.cjs (motExclu) et publier-stories.cjs.
// JUDICIAIRE_TITRES = accusation, procédure, violence contre une personne, mineur identifiable ; PROCEDURE = procédure formelle ; JURIDICTION = juridiction ou décision de justice explicite.
const { JUDICIAIRE_TITRES, PROCEDURE, JURIDICTION } = require("./liste-prudente.cjs");
const SC = require("./sondage-commanditaire.cjs"); // commanditaire et marge d'erreur d'un sondage (mentions obligatoires)
// Indice explicite d'une juridiction ou d'une décision de justice : sans lui (simple « accusé de », « plainte », « victime », « soupçonné »), le titre n'affirme JAMAIS une procédure.

/** Acteur nommé dans le titre : personne (sa fonction officielle si elle est au Gouvernement), parti, ou institution ; null sinon. */
function acteurDe(sujet, donnees, judiciaire, action) {
  const titre = sujet.articles[0].titre, p = plat(titre);
  const tous = plat(sujet.articles.map((a) => a.titre).join(" | "));
  if (!judiciaire) {
    const rang = (x) => {
      const n = plat(x.nom), famille = n.split(" ").slice(-1)[0];
      if (p.includes(n)) return p.indexOf(n);
      const m = famille.length >= 5 ? new RegExp("\\b" + famille + "\\b").exec(p) : null; // le nom de famille seul (« Lecornu annonce… »)
      return m ? m.index : 9999;
    };
    const nommes = (sujet.illustration?.personnes || []).filter((x) => tous.includes(plat(x.nom)) || (plat(x.nom).split(" ").slice(-1)[0].length >= 5 && new RegExp("\\b" + plat(x.nom).split(" ").slice(-1)[0] + "\\b").test(tous) && !/\bmaire\b/.test(plat(x.nom)))).sort((a, b) => rang(a) - rang(b));
    // Seule la personne placée avant le verbe fait l'action : « Les sénateurs interrogent Lecornu » n'est pas une prise de position de Lecornu
    const apresCitation = action && /["»”]\s*,?\s*$/.test(p.slice(0, action.index)); // « … », estime Danielle Simonnet : le verbe de parole suit la citation, la personne parle
    const pers = nommes.find((x) => !action || apresCitation || rang(x) < action.index);
    if (pers) {
      const m = (donnees.gouvernement?.membres || []).find((x) => plat(x.nom) === plat(pers.nom));
      if (m) {
        const f = m.fonction.replace(/’/g, "'");
        return { type: "fonction", label: f.length <= 32 ? f : "Gouvernement" };
      }
      const parti = ABREV[String(pers.parti || "").toUpperCase()] || null;
      return { type: "personne", label: parti ? `${pers.nom} (${parti})` : pers.nom, court: pers.nom };
    }
  }
  const partis = (sujet.illustration?.partis || []).map((x) => ABREV[String(x).toUpperCase()]).filter(Boolean)
    .filter((x) => new RegExp(`\\b(le |la |les |l')?${x}\\b`, "i").test(titre) || (x === "Écologistes" && /[ée]cologistes/i.test(titre)));
  if (partis.length) return { type: "parti", label: [...new Set(partis)].slice(0, 2).join(" et ") };
  const inst = [[/tribunal administratif/, "Tribunal administratif"], [/\bsenat|senateur|centristes/, "Sénat"], [/\bldh\b/, "LDH"], [/syndicats?/, "Syndicats"], [/gouvernement/, "Gouvernement"],
    [/departement/, "Département"], [/\bregion\b/, "Région"], [/deputes?|assemblee nationale/, "Assemblée nationale"], [/sapeurs.pompiers/, "Sapeurs-pompiers"]];
  for (const [re, label] of inst) if (re.test(p)) return { type: "institution", label };
  return null;
}

/**
 * Titre à nous construit par règles à partir du thème, de l'acteur (fonction officielle depuis nos données) et d'une action neutre.
 * Toujours un titre : { titre, origine: "regles", generique? }. Jamais le titre ni un segment cité d'un média ; aucun verbe qui accuse ;
 * pas de nom de personne dès que les titres relèvent d'une procédure judiciaire (présomption d'innocence).
 */
function titreParRegles(sujet, donnees = {}) {
  const articles = sujet?.articles || [];
  if (!articles.length) return null;
  const premier = articles[0].titre || "", p = plat(nettoyer(premier));
  const brut = articles.slice(0, 6).map((a) => nettoyer(a.titre)).join(" | ");
  const tous = plat(brut.replace(/\bIA\b/g, "intelligence artificielle"));
  const judiciaire = articles.some((a) => JUDICIAIRE_TITRES.test(a.titre || ""));
  const procedure = articles.some((a) => PROCEDURE.test(a.titre || ""));
  const theme = themeDe(articles, p, tous, premier);
  const lieu = lieuDuTitre(premier);
  const acteur = acteurDe(sujet, donnees, judiciaire, actionDe(p));
  const action = actionDe(p);
  const pb = plat(premier);
  const genre = /edito|editorial|\bbillet\b|chronique|tribune|\bdessin\b|\bhumour\b/.test(pb) ? (/\bdessin\b|\bhumour\b/.test(pb) ? "dessin" : /\bbillet\b/.test(pb) ? "billet" : "edito") : null;
  const direct = /^(en )?direct\b/i.test(premier.trim());
  const lim = (cands, generique = false) => {
    const c = cands.filter(Boolean).map((x) => x.replace(/\s+/g, " ").trim()).find((x) => x.length <= LONGUEUR_MAX);
    return c ? { titre: c.charAt(0).toUpperCase() + c.slice(1), origine: "regles", ...(generique ? { generique: true } : {}) } : null;
  };
  const S = theme?.S, O = theme?.O;

  if (genre === "dessin") return lim(["Dessin de presse : regard sur l'actualité du jour"]);
  if (genre === "billet" && !theme) return lim(["Billet d'humeur : regard sur l'actualité du jour"]);
  if (procedure) {
    const ou = lieu ? `${lieu} : ` : theme && theme.S !== "Justice" ? `${theme.S} : ` : "Justice : ";
    if (/tribunal administratif|suspend/.test(p)) return lim([`${ou}décision du tribunal administratif sur ${O || "un arrêté"}`, `${ou}décision du tribunal administratif`, "Justice : décision du tribunal administratif"]);
    // Aucune juridiction citée : on ne parle pas de procédure (présomption d'innocence), titre générique de thème
    if (!articles.some((a) => JURIDICTION.test(a.titre || ""))) return lim([theme && theme.S !== "Justice" ? `${theme.S} : l'essentiel du moment` : null, "Politique : l'essentiel du moment"], true);
    return lim([`${ou}actualité judiciaire`, "Justice : actualité judiciaire"], true);
  }
  // Accusation ou affaire sans juridiction citée : titre générique de thème, jamais un nom de personne ni une procédure affirmée
  if (judiciaire && !procedure && (sujet.illustration?.personnes || []).length) return lim([theme && theme.S !== "Justice" ? `${theme.S} : l'essentiel du moment` : null, "Politique : l'essentiel du moment"], true);
  // Thème douteux (ex. une primaire dont le camp n'est pas établi) : titre générique, jamais publié
  if (theme?.generique) return lim([`${S} : l'essentiel du moment`], true);
  if (acteur && theme) {
    const verbe = action ? action.phrase : "actualité sur";
    const l = acteur.label;
    if (plat(l) === plat(S)) return lim([`${S} : l'essentiel du moment`]);
    // Thème institutionnel seulement : sans verbe clair, on n'invente pas de lien entre la personne et le sujet
    if (/^(Assemblée nationale|Sénat|Gouvernement|Vie locale)$/.test(S) && !(action && ["vote", "depot", "position"].includes(action.cle))) return lim([`${l} : l'essentiel du moment`, `${acteur.court || l} : l'essentiel du moment`], true);
    if (genre) return lim([`${l} : point de vue éditorial sur ${O}`, `${l} : point de vue éditorial`, `${S} : point de vue éditorial`]);
    return lim([`${l} : ${verbe} ${O}`, acteur.court ? `${acteur.court} : ${verbe} ${O}` : null, `${S} : ${verbe} ${O}`, `${l} : ${verbe} ${S.toLowerCase()}`, `${S} : ${l}`]);
  }
  if (acteur) return lim([`${acteur.label} : l'essentiel du moment`, `${acteur.court || acteur.label} : l'essentiel du moment`], true);
  if (genre) return lim([lieu && S ? `${lieu} : point de vue éditorial` : null, S ? `${S} : point de vue éditorial` : null, "Politique : point de vue éditorial"]);
  if (direct && S) return lim([`${S} : suivi de la journée`]);
  if (lieu && theme) return lim([`${lieu} : ${theme.local}`, `${lieu} : ${S.toLowerCase()}`]);
  if (lieu) return lim([`${lieu} : actualité locale`], true);
  if (theme && action) return lim([`${S} : ${action.phrase} ${O}`, `${S} : l'essentiel du moment`]);
  if (theme) return lim([`${S} : l'essentiel du moment`], !/^(Lycées|Primaire|Présidentielle|Finances|Santé|Justice|Numérique|Intelligence|Environnement|Logement|Aménagement|Sécurité|Éducation|Loi|Violences)/.test(S));
  return lim([`${THEME_ILLUSTRATION[sujet.illustration?.theme] || "Politique"} : l'essentiel du moment`], true);
}

/** Titre à nous pour tout sujet : dossier, nom d'une loi, règles (thème + acteur + action), puis expression commune des médias si les règles restent génériques. */
/** Le titre copie-t-il un titre de presse (identique, ou un segment de 5 mots) ? Même règle que le contrôle de data/check-data.js. */
function copieUnTitre(titre, articles) {
  const tm = plat(titre).replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  return (articles || []).some((a) => {
    const pm = plat(a.titre || "").replace(/[^a-z0-9]+/g, " ").trim();
    if (pm === tm.join(" ")) return true;
    for (let k = 0; k + 5 <= tm.length; k++) if (` ${pm} `.includes(` ${tm.slice(k, k + 5).join(" ")} `)) return true;
    return false;
  });
}

/** Titre à nous : le meilleur choix, sans jamais copier un titre de presse (sinon titre générique de thème, qui n'ira jamais en story). */
function titreSujet(sujet, dossiers = [], donnees = {}) {
  const t = titreSujetBrut(sujet, dossiers, donnees);
  // Filet final : un titre à nous n'affirme jamais « procédure (judiciaire) en cours » (présomption d'innocence ; check-data le refuse et bloquerait tout le relevé)
  const affirmeProcedure = t && /procedures? (judiciaires? )?en cours/.test(plat(t.titre || ""));
  if (!t || !(affirmeProcedure || copieUnTitre(t.titre, sujet?.articles))) return t;
  const th = themeDe(sujet.articles || [], plat(sujet.articles[0]?.titre || ""), "", "");
  const repli = th && th.S !== "Justice" ? `${th.S} : l'essentiel du moment` : "Politique : l'essentiel du moment";
  return { titre: repli, origine: "regles", generique: true };
}

function titreSujetBrut(sujet, dossiers = [], donnees = {}) {
  const avecDossier = titrePropre(sujet, dossiers);
  let recoupe = avecDossier;
  if (avecDossier?.origine === "dossier") {
    // Le sujet doit vraiment parler du dossier (début d'un mot-clé du titre du dossier dans ses titres) : un article rattaché par un mot banal ne prend pas son titre
    const t = plat(sujet.articles.map((a) => a.titre).join(" | "));
    const ancres = plat(avecDossier.titre).split(/[^a-z0-9]+/).filter((m) => m.length >= 5 && !MOTS_VIDES.has(m) && !TROP_GENERIQUES.has(m)).map((m) => m.slice(0, 5));
    if (ancres.some((m) => t.includes(m))) return avecDossier;
    recoupe = titrePropre(sujet, []);
  }
  if (recoupe && /^(Projet de loi|Proposition de loi|Loi) «/.test(recoupe.titre)) return recoupe;
  const regles = titreParRegles(sujet, donnees);
  if (regles && !regles.generique) return regles;
  if (recoupe && recoupe.titre.length <= LONGUEUR_MAX && !estParticipe(recoupe.titre.split(" ")[0])) return recoupe;
  return regles;
}

/** Tous les champs « média » d'un sujet, prêts à écrire (seulement ceux qui existent). Marque aussi les vidéos. */
function enrichirSujet(sujet, dossiers, donnees, maintenant = new Date()) {
  for (const a of sujet.articles || []) if (estVideo(a.url)) a.video = true; else delete a.video;
  for (const k of ["titrePropre", "contexte", "chiffre", "date"]) delete sujet[k];
  const tp = titreSujet(sujet, dossiers, donnees); if (tp) sujet.titrePropre = tp;
  const c = contexteSujet(sujet, donnees, maintenant); if (c.length) sujet.contexte = c;
  const ch = chiffreSujet(sujet); if (ch) sujet.chiffre = ch;
  const da = dateSujet(sujet, maintenant); if (da) sujet.date = da;
  return sujet;
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

  // 1. Dernier sondage : seulement hors réserve ET à plus de 24 h de la réserve (une story reste visible 24 h), pour une personne citée qui y figure, avec les mentions
  // obligatoires de la loi du 19 juillet 1977 (art. 2) : institut, commanditaire, dates, échantillon, marge d'erreur. Commanditaire inconnu : aucune ligne (audit J-16, J-17).
  const inst = donnees.sondages?.instituts?.[0];
  const cmd = inst ? SC.commanditaire(inst, donnees.veille) : null;
  if (inst && cmd && inst.echantillon > 0 && personnes.length && sujet.illustration?.theme === "election" && !enReserve(maintenant, donnees.tours) && !enReserve(new Date(maintenant.getTime() + 24 * 36e5), donnees.tours)) {
    const fr = (n) => String(n).replace(".", ",");
    const l = personnes.map((p) => [p.nom, inst.scores?.[p.nom]]).filter(([, r]) => Array.isArray(r))
      .map(([nom, r]) => `${nom.split(" ").slice(-1)[0]} ${r[0] === r[1] ? fr(r[0]) : `${fr(r[0])}–${fr(r[1])}`} %`);
    if (l.length) sortie.push({ type: "sondage", texte: `Dernier sondage ${inst.nom} pour ${cmd.nom} (terrain : ${inst.date}, ${String(inst.echantillon).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} personnes, marge d'erreur ±${SC.margeErreur(inst.echantillon)} pts) : ${l.join(", ")}`, source: `Commission des sondages (notice ${inst.nom})` });
  }
  // 2. Fonction des personnes citées
  // (jamais quand les titres relèvent d'une affaire judiciaire : on ne qualifie pas une personne mise en cause)
  const judiciaire = (sujet.articles || []).some((a) => JUDICIAIRE_TITRES.test(a.titre || ""));
  const fonctions = judiciaire ? [] : personnes.map((p) => fonctionDe(p.nom, donnees)).filter(Boolean);
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
    for (const m of t.matchAll(/\b(?:le|dès le|jusqu['’]au|du|au)\s+(1er|\d{1,2})\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\b(?:\s+((?:19|20)\d{2})\b)?/giu)) {
      const mois = MOIS.map(plat).indexOf(plat(m[2])) + 1;
      const jour = m[1] === "1er" ? 1 : Number(m[1]);
      // Une date suivie d'une année passée (« loi du 9 décembre 1905 »), ou précédée de « depuis », « loi », « décret » n'est pas un rendez-vous à venir (audit J-18)
      const avant = plat(t.slice(Math.max(0, m.index - 24), m.index));
      if (/\bdepuis\s*$/.test(avant) || (/^du\b/i.test(m[0]) && /\b(?:loi|decret|ordonnance|arrete|traite)\s*(?:n°\s*\S+\s*)?$/.test(avant))) continue;
      let an = maintenant.getUTCFullYear();
      if (m[3] && Number(m[3]) !== an && Number(m[3]) !== an + 1) continue;
      if (m[3]) an = Number(m[3]);
      let iso = `${an}-${String(mois).padStart(2, "0")}-${String(jour).padStart(2, "0")}`;
      if (iso < aujourdhui && !m[3]) { an++; iso = `${an}-${String(mois).padStart(2, "0")}-${String(jour).padStart(2, "0")}`; }
      if (iso < aujourdhui || iso > limite) continue;
      const e = trouvees.get(iso) || { iso, jour, mois: MOIS[mois - 1], medias: new Set() };
      e.medias.add(a.media);
      trouvees.set(iso, e);
    }
  }
  // Une date reprise par un seul média (fête locale, annonce isolée) n'est pas un rendez-vous recoupé
  const e = [...trouvees.values()].filter((x) => x.medias.size >= 2).sort((a, b) => b.medias.size - a.medias.size || a.iso.localeCompare(b.iso))[0];
  return e ? { iso: e.iso, jour: e.jour, mois: e.mois } : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Accroche : phrase simple, 6 à 10 mots, « sujet + enjeu », compréhensible en 2 secondes. Champ d'AFFICHAGE : n'entre jamais dans les registres anti-doublon.
// ─────────────────────────────────────────────────────────────────────────────
/** Nombre de mots d'une phrase (« l'État » = 1 mot, « tout-petit » = 1 mot). */
const nbMots = (t) => (String(t || "").match(/[\p{L}0-9]+(?:['’-][\p{L}0-9]+)*/gu) || []).length;
/** Enjeu en une question, par thème (clé = THEMES_TITRES[].S). Aucun nom de personne, aucune accusation, aucune procédure. */
const ENJEUX = {
  "Dissuasion nucléaire": "ce qu'il faut savoir sur la dissuasion",
  "Lycées": "la mobilisation, que veulent les élèves ?",
  "Finances publiques": "quels enjeux pour les finances de l'État ?",
  "Présidentielle 2027": "où en est la course à l'Élysée ?",
  "Conseil municipal": "quelles décisions pour la commune ?",
  "Intelligence artificielle": "quels usages et quelles règles ?",
  "Environnement": "quels enjeux pour le climat et l'eau ?",
  "Santé": "quels enjeux pour la santé publique ?",
  "Numérique": "quels enjeux pour nos données ?",
  "International": "quels enjeux pour la France ?",
  "Sécurité": "quels enjeux pour l'ordre public ?",
  "Logement et accueil": "quels enjeux pour le logement ?",
  "Aménagement": "quel projet pour le territoire ?",
  "Collectivités locales": "ce que change l'organisation locale",
  "Éducation et jeunesse": "quels enjeux pour les jeunes ?",
  "Social": "quels enjeux pour l'emploi et le social ?",
  "Sénat": "ce qui se joue au Sénat",
  "Assemblée nationale": "ce qui se joue à l'Assemblée",
  "Gouvernement": "quelles décisions pour le pays ?",
  "Vie locale": "ce qui change près de chez vous",
};
/** Phrase d'enjeu quand l'action est reconnue dans le titre (une action n'est dite que si son mot y est). */
const ENJEU_ACTION = {
  vote: "un vote, que change-t-il ?",
  depot: "une proposition de loi, que prévoit-elle ?",
  appel: "un appel lancé, quel est l'enjeu ?",
  annonce: "de nouvelles annonces, que retenir ?",
  essai: "un essai, que faut-il savoir ?",
};

/**
 * Accroche d'un sujet : « Lycées : des blocages, que veulent les élèves ? ». Dérivée du thème (THEMES_TITRES) et de l'action reconnue (ACTIONS) ;
 * ne nomme jamais une personne ni un parti, n'affirme ni accusation ni procédure, ne recopie jamais un titre de presse.
 * Repli : le titrePropre actuel (sujet.titrePropre.titre, sinon titreParRegles), ou null s'il n'y en a pas.
 */
function accroche(sujet, donnees = {}) {
  const articles = sujet?.articles || [];
  const repli = sujet?.titrePropre?.titre || titreParRegles(sujet, donnees)?.titre || null;
  if (!articles.length) return repli;
  if (sujet?.titrePropre?.generique === true) return repli;
  // Prudence : accusation, procédure, violence, mineur → on garde le titre prudent déjà rédigé
  if (articles.some((a) => JUDICIAIRE_TITRES.test(a.titre || "") || PROCEDURE.test(a.titre || ""))) return repli;
  const premier = articles[0].titre || "", p = plat(nettoyer(premier));
  const tous = plat(articles.slice(0, 6).map((a) => nettoyer(a.titre)).join(" | ").replace(/\bIA\b/g, "intelligence artificielle"));
  const theme = themeDe(articles, p, tous, premier);
  if (!theme || theme.generique || theme.S === "Justice" || !ENJEUX[theme.S]) return repli;
  const action = actionDe(p);
  let enjeu = ENJEUX[theme.S];
  if (theme.S === "Lycées") enjeu = /\bblocus|\bblocage/.test(tous) ? "des blocages, que veulent les élèves ?" : "la mobilisation, que veulent les élèves ?";
  else if (action && ENJEU_ACTION[action.cle]) enjeu = ENJEU_ACTION[action.cle];
  const phrase = `${theme.S} : ${enjeu}`;
  const n = nbMots(phrase);
  if (n < 6 || n > 10 || phrase.length > 80) return repli;
  if (copieUnTitre(phrase, articles) || /proc[ée]dure|accus|mis en cause|poursuiv|condamn/i.test(phrase)) return repli;
  return phrase;
}

// ─────────────────────────────────────────────────────────────────────────────
// Intitulés de textes de loi, sans jargon.
// ─────────────────────────────────────────────────────────────────────────────
/** Thèmes d'un intitulé de loi, du plus précis au plus large (premier qui correspond). */
const THEMES_LOIS = [
  [/globe|fiscal|impot|taxe|imposition|douane|\btva\b/, "Fiscalité"],
  [/budget|financ|securite sociale/, "Finances publiques"],
  [/sante|medic|hopita|soins|maladie|handicap|dependance|bioethique|fin de vie|aide a mourir/, "Santé"],
  [/justice|penal|judiciaire|magistrat|tribunal|prison|detention|casier/, "Justice"],
  [/violences? sexuelles|sexistes/, "Violences sexuelles"],
  [/ecole|enseignement|education|etudiant|universit|scolaire|jeunesse/, "Éducation"],
  [/environnement|climat|energie|nucleaire|\beau\b|biodiversite|dechets|ecolog|renouvelable|pollution/, "Environnement"],
  [/agricult|agricole|elevage|paysan|alimentation|peche|\bforets?\b/, "Agriculture"],
  [/defense|armee|militaire|\barmes?\b/, "Défense"],
  [/numerique|donnees|internet|intelligence artificielle|cyber|reseaux sociaux|audiovisuel|presse|\bmedias?\b/, "Numérique"],
  [/police|gendarm|securite|terroris|ordre public|delinquance|violences?/, "Sécurité"],
  [/logement|loyer|habitat|urbanisme|construction/, "Logement"],
  [/travail|emploi|chomage|retraite|salari|syndicat|entreprise|apprentissage/, "Travail"],
  [/immigration|etranger|asile|nationalite|titre de sejour/, "Immigration"],
  [/collectivit|commune|departement|region|outre.mer|territoire|decentralisation|elus? locaux/, "Collectivités"],
  [/transport|ferroviaire|route|aerien|mobilite|\bsncf\b/, "Transports"],
  [/election|electoral|referendum|constitution|institution|parlement/, "Institutions"],
  [/famille|enfant|parent|egalite|femmes/, "Famille et société"],
  [/culture|patrimoine|sport|cinema|langue/, "Culture et sport"],
  [/accord|convention|traite|cooperation|ratification|approbation|international|etat membre|union europeenne/, "International"],
];
/** Mots à ne pas laisser en fin de phrase après une coupe. */
const FIN_INTERDITE = new Set(["de", "du", "des", "la", "le", "les", "l", "d", "et", "ou", "en", "au", "aux", "à", "a", "pour", "par", "sur", "dans", "entre", "avec", "sans", "un", "une", "qui", "que", "relatif", "relative", "portant", "contre", "lutte", "vers", "selon", "afin"]);
const ART = "(?:l['’]|la\\s+|le\\s+|les\\s+|une?\\s+)?";

/**
 * Simplifie un intitulé officiel : retire « Projet de loi autorisant l'approbation de… », « relatif à… », « portant sur… », « adopté par le Sénat »…
 * Rend « Thème : objet » (9 mots au plus, thème compris), ou null si rien de clair n'en ressort (l'appelant garde alors l'intitulé d'origine).
 */
function simplifierTexteLoi(titre) {
  let t = String(titre || "").replace(/\s+/g, " ").trim().replace(/\s*\.\s*$/, "");
  if (!t) return null;
  if (/^questions?\s+(?:orales?\s+)?au\s+gouvernement/i.test(t)) return null;
  const bud = /^(?:projet de loi de (finances|financement de la sécurité sociale)( rectificative)?)\s+pour\s+(\d{4})\b/i.exec(t);
  if (bud) return `${/finances/i.test(bud[1]) ? "Finances publiques" : "Sécurité sociale"} : budget${bud[2] ? " rectificatif" : ""} ${bud[3]}`;
  // Compléments de procédure en fin d'intitulé
  t = t.replace(/\s*\([^()]*(?:lecture|adopt|nouvelle|commission|procédure accélérée|CMP|urgence)[^()]*\)\s*$/i, "")
    .replace(/[,;]?\s*(?:adopté|adoptée|modifié|modifiée|rejeté|rejetée|transmis|transmise)\s+(?:par|en)\s+(?:le|la|l['’])\s*[\p{L}' -]{2,40}$/iu, "")
    .replace(/[,;]?\s*après\s+(?:engagement\s+de\s+)?(?:la\s+)?procédure\s+accélérée\s*$/i, "")
    .replace(/\s*[-–—]\s*(?:première|deuxième|nouvelle|lecture définitive|CMP).*$/i, "").trim();
  // Débuts de point d'ordre du jour
  t = t.replace(/^(?:suite\s+de\s+la\s+|reprise\s+de\s+la\s+)?(?:discussion|lecture|vote\s+solennel|explications?\s+de\s+vote)\s+(?:générale\s+|définitive\s+)?(?:(?:du|de la|de l['’]|des|sur)\s+)(?:l['’]ensemble\s+(?:du|de la)\s+)?/i, "")
    .replace(/^(?:nouvelle|deuxième|troisième|première)\s+lecture\s+(?:du|de la)\s+/i, "")
    .replace(/^(?:l['’]ensemble\s+)?(?:du|de la)\s+(?=(?:projet|proposition)\s+de\s+loi)/i, "");
  // Nature du texte
  t = t.replace(/^(?:projet|proposition)\s+de\s+(?:loi|résolution)(?:\s+(?:organique|constitutionnelle|de finances(?: rectificative)?|de financement de la sécurité sociale))?\s*/i, "")
    .replace(/^loi\s+(?:organique\s+)?/i, "");
  // Forme fréquente des accords : « accord multilatéral entre autorités compétentes portant sur l'échange des informations GloBE »
  const echange = /(?:accord|convention)[^,;]*?(?:portant sur|relatif à|concernant)\s+l['’]échange\s+(?:automatique\s+)?(?:des|de|d['’])\s*(?:informations?|renseignements?)\s*(.*)$/i.exec(t);
  let objet;
  if (echange) {
    const sigle = echange[1].replace(/^\s*(?:relatives?\s+(?:à|aux?)\s+)?(?:de\s+|du\s+|des\s+)?/i, "").replace(/[()]/g, "").trim();
    objet = `échange d'informations entre pays${sigle && nbMots(sigle) <= 3 ? ` (accord ${sigle})` : ""}`;
  } else {
    objet = t
      .replace(new RegExp(`^(?:autorisant|portant|relatifs?|relatives?|visant|tendant|habilitant|instituant|créant|garantissant|renforçant)\\s+(?:l['’]approbation de\\s+|la ratification de\\s+|sur\\s+|à\\s+|aux?\\s+)?${ART}`, "i"), "")
      .replace(new RegExp(`^(?:pour|en faveur de|concernant|sur)\\s+${ART}`, "i"), "")
      .replace(/\b(?:entre autorités compétentes|multilatérale?s?)\b/gi, "").replace(/\s+/g, " ")
      .replace(/\s+(?:portant sur|portant|relatif à|relative à|tendant à|visant à)\s+/gi, " : ")
      .replace(/^[\s:,;-]+|[\s:,;-]+$/g, "");
  }
  if (!objet || nbMots(objet) < 1) return null;
  const txt = plat(String(titre));
  const lo = THEMES_LOIS.find(([re]) => re.test(txt));
  const theme = lo ? lo[1] : (THEMES_TITRES.find((x) => !x.generique && !x.ok && x.re.test(txt)) || {}).S || null;
  objet = objet.charAt(0).toLowerCase() + objet.slice(1);
  // Formules creuses, verbe à l'infinitif en tête (« renforcer la protection de… ») et article d'ouverture : inutiles dans un titre
  objet = objet.replace(/^(?:apportant\s+)?(?:une\s+)?réponse\s+(?:intégrale\s+|globale\s+)?(?:au|à)\s+(?:phénomène|problème)\s+(?:de la\s+|du\s+|des\s+|de l['’]|de\s+)?/i, "")
    .replace(/^(?:apportant|adapter|moderniser|renforcer|améliorer|garantir|assurer|permettre|instaurer|créer|encadrer|faciliter|simplifier)\s+/i, "")
    .replace(/^(?:l['’]|la\s+|le\s+|les\s+|une?\s+)/i, "");
  if (!objet) return null;
  // Pas de doublon « Fiscalité : fiscalité … » : si l'objet commence par le thème, le thème n'est pas répété
  const tete = theme && !plat(objet).startsWith(plat(theme)) ? `${theme} : ` : "";
  const budget = 9 - nbMots(tete);
  if (nbMots(objet) > budget) {
    // Trop long : on part de l'idée centrale (« lutte contre… »), puis on coupe à la plus longue proposition qui tient (avant « et », virgule…)
    const centre = /\b(?:lutte contre|protection d[eu]s?|prévention d[eu]s?)\b/i.exec(objet);
    if (centre && centre.index > 0) objet = objet.slice(centre.index);
    if (nbMots(objet) > budget) {
      const coupes = [...objet.matchAll(/,?\s+(?:et|ainsi que)\s+|,\s+/gi)].map((m) => objet.slice(0, m.index)).filter((c) => nbMots(c) >= 2 && nbMots(c) <= budget);
      if (coupes.length) objet = coupes[coupes.length - 1];
    }
  }
  if (nbMots(objet) > budget) {
    // Coupe aux mots entiers, sans finir sur un mot de liaison ni dans une parenthèse ouverte
    const mots = []; let n = 0;
    for (const m of objet.split(" ")) { const k = nbMots(m); if (n + k > budget) break; mots.push(m); n += k; }
    while (mots.length && (FIN_INTERDITE.has(plat(mots[mots.length - 1]).replace(/^.*['’]/, "")) || /[,;:]$/.test(mots[mots.length - 1]))) mots.pop();
    let r = mots.join(" ");
    if ((r.match(/\(/g) || []).length > (r.match(/\)/g) || []).length) r = r.replace(/\s*\([^)]*$/, "");
    objet = r;
  }
  objet = objet.replace(/[\s,;:]+$/, "");
  if (nbMots(objet) < 2) return null;
  const sortie = (tete + objet).replace(/\s+/g, " ").trim();
  return sortie.charAt(0).toUpperCase() + sortie.slice(1);
}

module.exports = { accroche, simplifierTexteLoi, nbMots, estVideo, titrePropre, titreParRegles, titreSujet, lieuDuTitre, contexteSujet, chiffreSujet, dateSujet, fonctionDe, enReserve, nettoyer, enrichirSujet };
