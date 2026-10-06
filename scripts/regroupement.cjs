/**
 * regroupement.cjs
 * ----------------
 * Regroupe par SUJET les titres de presse lus dans les flux RSS (appelé par scripts/fetch-actualites.js).
 * Règles déterministes, sans IA ni appel externe, pensées pour qu'une FAUSSE FUSION (deux faits différents sous un même titre
 * publié) soit bien plus improbable qu'un regroupement manqué : en cas de doute, deux sujets restent séparés.
 *
 *  1. Normalisation : accents, casse, préfixes de rubrique (« Politique. », « Info EBRA. »), pluriels, synonymes politiques
 *     (blocus/blocage, démission, lycéen/lycée, mobilisation/manifestation…), « Premier ministre » = le Premier ministre en
 *     fonction (data/gouvernement.json), « chef de l'État » = le président.
 *  2. Entités : personnes (gouvernement, candidats, députés, sénateurs, dirigeants de partis), partis, institutions, lois :
 *     elles pèsent plus que les autres mots et servent d'ancre.
 *  3. Pondération : TF-IDF, IDF calculé sur le lot du jour (un mot présent dans beaucoup de titres ne prouve rien).
 *  4. Similarité : cosinus TF-IDF. Un titre rejoint le groupe où il est le plus proche, à condition d'être proche du CENTROÏDE du
 *     groupe (pas seulement d'un voisin : pas de dérive A→B→C) ET d'au moins un titre déjà dans le groupe, et de partager une ancre.
 *  5. Fenêtre de temps : tous les titres d'un groupe tiennent dans 36 h.
 *  6. Blocages (une seule suffit) : personnes différentes citées, lois différentes citées, termes contraires (démission/maintien,
 *     adoption/rejet, hausse/baisse…), négation d'un côté seulement, thèmes disjoints (justice / budget / sécurité…), lieux
 *     différents en tête de titre (presse régionale). Les deux derniers se relâchent seulement pour une similarité très forte.
 *  7. Médias distincts : plusieurs médias d'un même groupe de presse, ou qui reprennent la même dépêche (titres identiques), ne
 *     comptent qu'une fois (voir sourcesDistinctes).
 *
 * Fonctions pures (pas de lecture de fichier, pas de réseau) : testées par tests/regroupement.test.mjs.
 */

const FENETRE_MS = 36 * 36e5;
// Seuils (calés sur data/actualites.json et tests/regroupement.test.mjs ; prudents : relever = moins de regroupements)
const SEUIL_CENTROIDE = 0.34;
const SEUIL_VOISIN = 0.45;
const SEUIL_CONTENU = 0.3; // similarité du contenu seul (sans personnes ni attribution) avec le voisin le plus proche
const SEUIL_FORT = 0.7; // au-delà, un blocage « souple » (thème, lieu, négation) est levé
const SEUIL_NE = 0.5; // la négation grammaticale ne bloque que les similarités moyennes
const SEUIL_DEPECHE = 0.88; // deux titres de presse régionale presque identiques = même dépêche

const plat = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’']/g, "'").replace(/œ/g, "oe");

// Le président en exercice (aucune donnée du dépôt ne le désigne) : à mettre à jour après 2027
const PRESIDENT = "Emmanuel Macron";

// Personnalités citées par les médias mais absentes de nos données (étrangers, ex-ministres…)
const PERSONNES_EXTRA = ["Emmanuel Macron", "Donald Trump", "Vladimir Poutine", "Volodymyr Zelensky", "Benjamin Netanyahou", "Joe Biden", "Friedrich Merz", "Keir Starmer",
  "Giorgia Meloni", "Xi Jinping", "Rima Hassan", "Gabriel Attal", "Edouard Philippe", "Francois Bayrou", "Michel Barnier", "Elisabeth Borne", "Nicolas Sarkozy", "Francois Hollande",
  "Marion Marechal", "Dominique de Villepin", "Francois Ruffin", "Raphael Glucksmann", "Marine Tondelier", "Fabien Roussel", "Olivier Faure", "Laurent Wauquiez", "Bruno Retailleau"];

// Mots vides (formes normalisées)
const VIDES = new Set(("les des une pour dans avec sans sur par que qui quoi est son ses leur leurs aux du de la le un et ou mais donc car ni pas plus tres tout tous toute toutes cette ces cet " +
  "elle elles ils nous vous apres avant entre contre chez depuis selon face fait faire veut va etre avoir ont sont sera seront etait comme encore deja aussi ainsi alors quand dont lors vers ceux " +
  "celle celui quel quelle quels quelles direct video videos info infos politique france francais francaise annonce explique dit ministre premier president gouvernement ce soir ici " +
  "jour fois comment pourquoi faut peut doit sera deux trois premiere notre nouveau nouvelle nouveaux nouvelles apres pres lundi mardi mercredi jeudi vendredi samedi dimanche " +
  "selon vers veulent veulent photos reportage images essentiel moment point situation plusieurs apres cela voici voila dernier derniere derniers premiers").split(" "));

// Synonymes et familles : [motif sur le mot normalisé, concept]
const SYNONYMES = [
  [/^(blocus|blocages?|bloquer|bloques?|bloquent|bloquee?s?|bloquant)$/, "blocus"],
  [/^demission\w*$/, "demission"],
  [/^lyce(e|es|en|ens|enne|ennes)$/, "lycee"],
  [/^(mobilisations?|manifestations?|manifestants?|manifester|mouvements?|cortege|cortèges?|defile\w*)$/, "mobilis"],
  [/^budget\w*$/, "budget"],
  [/^(censur\w*)$/, "censure"],
  [/^antisemit\w*$/, "antisemit"],
  [/^retraites?$/, "retraite"],
  [/^(reconfirm\w*|reaffirm\w*|reitere\w*|renouvel\w*|maintient|maintiennent|maintenir)$/, "reaffirme"],
  [/^(plaintes?|poursuite|poursuites)$/, "plainte"],
  [/^(depute|deputes|deputee|deputees)$/, "depute"],
  [/^(senateurs?|senatrices?)$/, "senateur"],
  [/^(gaz|lacrymogenes?)$/, "lacrymogene"],
];

// Familles de thèmes : deux titres de thèmes disjoints ne parlent pas du même fait (blocage « souple »)
const THEMES = {
  justice: /\b(plainte|mis en examen|mise en examen|garde a vue|condamn\w*|inculp\w*|ecroue\w*|proces|tribunal|parquet|enquete judiciaire|perquisition\w*|inelig\w*|relax\w*|acquitt\w*|juge\w*|justice|antisemit\w*|revisionn\w*)\b/,
  finances: /\b(budget\w*|dette|deficit\w*|milliards?|impots?|economies|fiscal\w*|finances? publiques?|emprunt|taxes?)\b/,
  securite: /\b(violen\w*|police|policier\w*|gendarm\w*|attentat|terroris\w*|agression\w*|lacrymogene\w*|casseurs?|securit\w*)\b/,
  international: /\b(ukraine|gaza|israel\w*|russie|trump|otan|etats-unis|chine|iran|europe\w*|bruxelles)\b/,
};

// Termes contraires : un titre de chaque côté, aucun des deux des deux côtés = faits opposés
const CONTRAIRES = [
  [/\b(demission\w*|demissionn\w*|quitte|claque la porte)\b/, /\b(maintien|maintenu\w*|maintient|reste|restera|conserve|s'accroche)\b/],
  [/\b(adopt\w*|vote pour|approuv\w*|valid\w*|ratifi\w*)\b/, /\b(rejet\w*|rejette\w*|repouss\w*|retir\w*|enterre\w*|invalid\w*|censur\w*)\b/],
  [/\b(hausse\w*|augment\w*|grimpe\w*|monte\w*|bondit|flambe\w*|progress\w*)\b/, /\b(baisse\w*|diminu\w*|recul\w*|chute\w*|reduc\w*|reduit\w*|recule\w*|s'effondre\w*)\b/],
  [/\b(accepte\w*|accord)\b/, /\b(refus\w*|rompt\w*|rupture)\b/],
  [/\b(confirm\w*)\b/, /\b(dement\w*|dementi\w*|dement)\b/],
  [/\b(nomme\w*|nomination)\b/, /\b(limog\w*|revoque\w*|destitu\w*)\b/],
  [/\b(condamn\w*)\b/, /\b(relax\w*|acquitt\w*|non-lieu|classe\w* sans suite)\b/],
  [/\b(ouvre\w*|ouverture|rouvre\w*)\b/, /\b(ferme\w*|fermeture|abandon\w*|renonce\w*)\b/],
  [/\b(favorable\w*|soutient|soutien|soutiennent)\b/, /\b(hostile\w*|oppos\w*|s'oppose\w*)\b/],
];
// Négation « lexicale » (dément, refuse, exclut…) et négation grammaticale (ne… pas) : la seconde est trop courante dans les citations pour bloquer fort
const NEGATION = /\b(?:refus\w*|dement\w*|nie|nient|exclu\w*|ecarte\w*|renonc\w*|rejette\w*)\b/;
const NEGATION_NE = /\bn(?:e|')\s?\w+\s+(?:pas|jamais|plus)\b|\bpas d[e']|\b(?:aucun\w*|jamais)\b/;

// Groupes de presse : un seul compte pour tous leurs titres
const GROUPES = {
  "Le Progrès": "EBRA", "Dernières Nouvelles d'Alsace": "EBRA", "Le Dauphiné libéré": "EBRA", "L'Est républicain": "EBRA",
  "France 24": "France Médias Monde", RFI: "France Médias Monde",
};
// Médias régionaux (hors EBRA) dont les titres identiques à ceux d'un autre média sont une même dépêche
const REGIONAUX = new Set(["Sud Ouest", "Nice-Matin", "Le Progrès", "Dernières Nouvelles d'Alsace", "Le Dauphiné libéré", "L'Est républicain"]);
const groupeDe = (media) => GROUPES[media] || media;

// Institutions et acronymes qui servent d'ancre (mot normalisé → jeton)
const INSTITUTIONS = [
  [/\bconseil constitutionnel\b/, "i:conseilconstit"], [/\bcour des comptes\b/, "i:courcomptes"], [/\bconseil d'etat\b/, "i:conseiletat"],
  [/\bmatignon\b/, "i:matignon"], [/\belysee\b/, "i:elysee"], [/\bbercy\b/, "i:bercy"], [/\bquai d'orsay\b/, "i:quaiorsay"], [/\bcour de cassation\b/, "i:cassation"],
  [/\bbanque de france\b/, "i:banquefrance"], [/\bparlement europeen\b/, "i:parleuro"], [/\bcommission europeenne\b/, "i:commeuro"],
  [/\bparcoursup\b/, "i:parcoursup"], [/\bsenat\b/, "i:senat"], [/\bassemblee nationale\b/, "i:assemblee"], [/\b49[.,]?3\b/, "i:article493"],
  [/\bmotion de censure\b/, "i:motioncensure"], [/\bdissolution\b/, "i:dissolution"], [/\bnouvelle-caledonie\b|\bnouvelle caledonie\b/, "i:nc"],
];
const PARTIS = new Set(["RN", "LFI", "PS", "UDR", "LR", "EPR", "MODEM", "PCF", "EELV", "UDI", "RE", "LIOT", "DR", "NFP", "CGT", "CFDT", "FO", "SNCF", "RATP", "ONU", "OTAN", "UE", "AFP"]);

const mot = (m) => m.replace(/(?<=\w{4})(s|x)$/, "").replace(/(?<=\w{4})aux$/, "al");

/**
 * Référentiel de personnes : { cles: Map(surnomPlat → [{ cle, prenom, nom }]) }.
 * Sources : gouvernement.membres, candidats.candidats, deputes.deputes, senateurs.senateurs, dirigeants.dirigeants, + PERSONNES_EXTRA.
 */
function construireReferentiel(donnees = {}) {
  const noms = [...PERSONNES_EXTRA];
  for (const m of donnees.gouvernement?.membres || []) noms.push(m.nom);
  for (const c of donnees.candidats?.candidats || []) noms.push(c.nom);
  for (const d of donnees.deputes?.deputes || []) noms.push(d.nom);
  for (const s of donnees.senateurs?.senateurs || []) noms.push(s.nom);
  for (const d of donnees.dirigeants?.dirigeants || []) noms.push(d.nom);
  const premier = (donnees.gouvernement?.membres || []).find((m) => /^Premier ministre$/i.test(m.qualite || m.fonction || ""))?.nom || null;
  const parNom = new Map(); // nom de famille normalisé → Map(clé, personne)
  for (const brut of noms) {
    if (!brut || typeof brut !== "string") continue;
    const parts = plat(brut).replace(/-/g, " ").split(/\s+/).filter(Boolean);
    if (parts.length < 2) continue;
    // Prénom : tout jusqu'au premier mot qui commence une particule ou le nom ; heuristique : un seul prénom (le premier mot) ;
    // un prénom composé (Jean-Luc) est déjà un seul mot dans l'original
    const prenomBrut = String(brut).trim().split(/\s+/)[0];
    const prenom = plat(prenomBrut).replace(/-/g, " ");
    const nom = parts.slice(prenom.split(" ").length).join(" ");
    if (!nom) continue;
    const cle = `${prenom}|${nom}`;
    if (!parNom.has(nom)) parNom.set(nom, new Map());
    parNom.get(nom).set(cle, { cle, prenom, nom });
  }
  return { parNom, premier: premier ? plat(premier).replace(/-/g, " ") : null, president: plat(PRESIDENT).replace(/-/g, " ") };
}

let REF_VIDE = null;
const referentielVide = () => (REF_VIDE = REF_VIDE || construireReferentiel({}));

/** Normalise un titre : retire les préfixes de rubrique et les mentions de média. */
function nettoyer(titre) {
  return String(titre || "")
    .replace(/\s+[|–—]\s+[^|–—]{2,40}$/, "")
    .replace(/^((politique|info ebra|info bfmtv|info|photos?|vid[ée]os?|reportage|en images|direct|en direct|replay|exclusif|analyse|d[ée]cryptage|portrait)\s*[.:|]\s*)+/i, "")
    .replace(/\s+/g, " ").trim();
}

/** Préfixe de lieu des quotidiens régionaux (« Charpey. Un exercice… ») : null s'il n'y en a pas. */
function lieuTete(titre) {
  const m = nettoyer(titre).match(/^([A-ZÉÈÀ][\p{L}'’ -]{2,40})\.\s+\S/u);
  return m ? plat(m[1]).trim() : null;
}

/**
 * Empreinte d'un titre : jetons pondérés + indices de blocage.
 * { jetons: Set<string>, boost: Map, personnes: [{cle,prenom,nom}], lois: Set, themes: Set, negation: bool, plat: string }
 */
function empreinte(titre, ref) {
  ref = ref || referentielVide();
  const brut = nettoyer(titre);
  let t = plat(brut).replace(/-/g, " ");
  const original = brut;
  const entites = new Set(); // jetons d'entités (boostés)
  const personnes = [];
  const consommer = (re, fn) => { t = t.replace(re, (m, ...r) => { fn(m, ...r); return " ".repeat(m.length); }); };

  // « ancien Premier ministre » : ne désigne pas le Premier ministre en fonction
  t = t.replace(/\b(ancien|ex|anciens|ancienne) premier(s)? ministre(s)?\b/g, (m) => " ".repeat(m.length));

  // Personnes : nom complet (« jordan bardella »), puis nom de famille seul (≥ 5 lettres, majuscule dans l'original, non ambigu)
  if (ref) {
    const couvert = new Array(t.length).fill(false);
    const trouves = []; // { nom, idx, pers }
    for (const [nom, pers] of ref.parNom) {
      const re = new RegExp(`\\b${nom.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
      let m;
      while ((m = re.exec(t))) trouves.push({ nom, idx: m.index, pers });
    }
    const ROLES = /^\s*,\s*((?:president|vice president|membre|candidat|depute|senat|ministre|maire|porte parole|secretaire|premier secretaire|ancien|ex|chef|leader|patron|numero|responsable|elu)[^,:"«»]{0,70}?)(?=,|:|$)/;
    const marquer = (de, a) => {
      for (let k = de; k < a; k++) couvert[k] = true;
      // Descriptif du locuteur (« Gérard Larcher, président LR du Sénat, ») : il ne dit rien du fait
      const d = t.slice(a).match(ROLES);
      if (d) for (let k = a; k < a + d[0].length; k++) couvert[k] = true;
    };
    // Passe 1 : prénom + nom (« jordan bardella ») ; passe 2 : nom seul (≥ 5 lettres, majuscule dans l'original, hors d'un nom déjà reconnu)
    for (const f of trouves) {
      const avant = t.slice(0, f.idx).trimEnd();
      const choisi = [...f.pers.values()].find((p) => avant.endsWith(p.prenom));
      if (!choisi || couvert.slice(f.idx, f.idx + f.nom.length).some(Boolean)) continue;
      personnes.push(choisi);
      entites.add("p:" + f.nom);
      marquer(avant.length - choisi.prenom.length, f.idx + f.nom.length);
    }
    for (const f of trouves) {
      if (f.nom.length < 5 || couvert.slice(f.idx, f.idx + f.nom.length).some(Boolean)) continue;
      const c = original[f.idx];
      if (!c || c === c.toLowerCase()) continue;
      // « Hervé Morin » : un « nom » suivi d'un mot à majuscule est un prénom, pas la personne de ce nom
      if (/^\s+[A-ZÉÈ]/.test(original.slice(f.idx + f.nom.length))) continue;
      personnes.push({ cle: `|${f.nom}`, prenom: "", nom: f.nom }); // nom seul : compatible avec toute personne de ce nom
      entites.add("p:" + f.nom);
      marquer(f.idx, f.idx + f.nom.length);
    }
    // Passe 3 : personnes absentes de nos données, repérées à leur forme (« Hervé Morin, président de la région… », « déclare Pierre Moscovici »)
    const NOM = "[A-ZÉÈÀÂÎÔÛ][\\p{L}'’]+(?:-[A-ZÉÈÀÂÎÔÛ][\\p{L}'’]+)?";
    const PAS_UNE_PERSONNE = /^(assemblee|senat|gouvernement|elysee|etat|france|mediapart|paris|union|parti|conseil|cour|ministere|republique|parlement|commission)\b/;
    const reSpk = [
      new RegExp(`(${NOM}(?:\\s+(?:de |du |d'|d’|le |la |de la )?${NOM}){1,2})\\s*,\\s*(?:président|vice-président|membre|candidat|député|sénateur|sénatrice|ministre|maire|porte-parole|secrétaire|premier secrétaire|ancien|chef|leader|patron|responsable|élu)`, "gu"),
      new RegExp(`(?:déclare|affirme|estime|assure|juge|lance|réclame|souligne|observe|analyse|explique|dénonce|répond|réagit|regrette|promet|dit|dément|accuse|annonce|indique|précise|rappelle|détaille|raconte|fustige|condamne)\\s+(${NOM}(?:\\s+(?:de |du |d'|d’|le |la |de la )?${NOM}){1,2})`, "gu"),
    ];
    for (const re of reSpk) for (const m of original.matchAll(re)) {
      const nomComplet = m[1];
      const idx = m.index + m[0].indexOf(nomComplet);
      const fin = idx + nomComplet.length;
      const f = plat(nomComplet).replace(/-/g, " ").split(/\s+/);
      if (couvert.slice(idx, fin).every(Boolean) || PAS_UNE_PERSONNE.test(f.join(" "))) continue;
      const prenom = plat(nomComplet.split(/\s+/)[0]).replace(/-/g, " ");
      const nom = f.slice(prenom.split(" ").length).join(" ");
      if (!nom || couvert.slice(idx, fin).some(Boolean)) continue;
      personnes.push({ cle: `${prenom}|${nom}`, prenom, nom });
      entites.add("p:" + nom);
      marquer(idx, fin);
    }
    t = [...t].map((ch, k) => (couvert[k] ? " " : ch)).join("");
    // « Premier ministre » = le Premier ministre en fonction ; « chef de l'État » = le président
    if (ref.premier) consommer(/\b(premier ministre|chef du gouvernement)\b/g, () => {
      const nom = ref.premier.split(" ").slice(1).join(" ");
      personnes.push({ cle: `${ref.premier.split(" ")[0]}|${nom}`, prenom: ref.premier.split(" ")[0], nom }); entites.add("p:" + nom);
    });
    consommer(/\b(chef de l'etat|president de la republique|locataire de l'elysee)\b/g, () => {
      const [pre, ...nom] = ref.president.split(" ");
      personnes.push({ cle: `${pre}|${nom.join(" ")}`, prenom: pre, nom: nom.join(" ") }); entites.add("p:" + nom.join(" "));
    });
  }
  for (const [re, jeton] of INSTITUTIONS) consommer(re, () => entites.add(jeton));
  // Acronymes de partis/organisations (en majuscules dans l'original)
  for (const m of original.matchAll(/\b[A-Z]{2,6}\b/g)) if (PARTIS.has(m[0])) entites.add("a:" + m[0].toLowerCase());

  // Lois : « projet/proposition de loi … X », « loi X », « casseurs-payeurs » entre guillemets quand le titre parle d'une loi/d'un texte
  const lois = new Set();
  const stemsApres = (s) => s.split(/\s+/).map((x) => SYNONYMES.reduce((r, [re, c]) => (re.test(r) ? c : r), mot(x))).map((x) => (/^finances?$/.test(x) ? "budget" : x)).filter((x) => x.length >= 3 && !VIDES.has(x) && !/^(relati\w*|visant|tendant|portant|organique|nationale|loi|lois|les|des|aux)$/.test(x));
  const reLoi = /\b(?:projet|proposition) de loi(?: organique| constitutionnelle)?\s+((?:(?:relati\w+|visant|tendant|portant|sur|de|du|des|d'|l'|la|le|les|pour|contre|au|aux|a|en|et)\s+)*[\p{L}0-9]+(?:\s+[\p{L}0-9]+){0,2})/gu;
  for (const m of t.matchAll(reLoi)) for (const s of stemsApres(m[1]).slice(0, 3)) lois.add(s);
  for (const m of t.matchAll(/\bloi\s+([a-z]{4,})/g)) if (!VIDES.has(m[1]) && !/^(relative|visant|portant|organique|contre|pour|sur|du|des)$/.test(m[1])) lois.add(mot(m[1]));
  if (/\b(loi|texte|projet|proposition)\b/.test(t)) for (const m of original.matchAll(/[«"“]\s*([^»"”]{4,40}?)\s*[»"”]/g)) for (const s of stemsApres(plat(m[1]).replace(/-/g, " ")).slice(0, 2)) lois.add(s);

  // Thèmes (sur le titre complet normalisé)
  const themes = new Set(Object.entries(THEMES).filter(([, re]) => re.test(plat(brut).replace(/-/g, " "))).map(([k]) => k));
  const negation = NEGATION.test(plat(brut));
  const negationNe = NEGATION_NE.test(plat(brut));
  // Chiffres rapportés (« 72 % », « 140 milliards », « 735 établissements ») : deux titres aux chiffres différents rapportent deux faits
  const chiffres = new Set();
  for (const m of plat(brut).matchAll(/(\d{1,3}(?:[\s.]\d{3})+|\d+(?:,\d+)?)\s*(?:%|pour cent|milliards?|millions?|euros?|morts?|blesses?|manifestants?|etablissements?|lycees|inscrits|interpellations?|personnes|eleves)/g)) chiffres.add(m[1].replace(/[\s.]/g, "").replace(",", "."));

  // Jetons : mots restants normalisés
  const jetons = new Set();
  for (const w of t.split(/[^a-z0-9.]+/)) {
    const x = w.replace(/^\.+|\.+$/g, "");
    if (!x) continue;
    if (/^\d+$/.test(x)) { if (x.length >= 3) jetons.add("n:" + x); continue; }
    if (x === "49.3") continue;
    if (x.length < 4 || VIDES.has(x)) continue;
    const c = SYNONYMES.find(([re]) => re.test(x));
    const j = c ? c[1] : mot(x);
    if (!VIDES.has(j) && j.length >= 3) jetons.add(j);
  }
  // Noms propres hors référentiel : majuscule en milieu de titre (poids un peu plus fort)
  const propres = new Set();
  const mots = original.split(/\s+/);
  mots.forEach((w, i) => {
    const m = w.match(/^[«"“(]?([A-ZÉÈÀ][\p{L}'’-]{3,})[»"”,.:;)!?]*$/u);
    if (!m || i === 0 || /[.:!?]$/.test(mots[i - 1] || "")) return;
    const j = plat(m[1]).replace(/-/g, " ");
    if (VIDES.has(j) || /^(assemblee|senat|elysee|matignon|bercy|etat|nationale)$/.test(j)) return;
    const jj = (SYNONYMES.find(([re]) => re.test(j)) || [null, mot(j)])[1];
    if (jetons.has(jj)) propres.add(jj);
  });
  for (const e of entites) jetons.add(e);
  return { jetons, entites, propres, personnes, lois, themes, negation, negationNe, chiffres, plat: plat(brut).replace(/-/g, " "), lieu: lieuTete(titre) };
}

// ---------- Vecteurs TF-IDF ----------
function construireIdf(empreintes) {
  const df = new Map();
  for (const e of empreintes) for (const j of e.jetons) df.set(j, (df.get(j) || 0) + 1);
  const N = empreintes.length;
  const f = (j) => Math.log((N + 1) / ((df.get(j) || 0) + 1)) + 1;
  // Mot « rare » : présent dans très peu de titres du lot (au plus 6, ou 1 % du lot) : un mot partagé de ce genre pèse vraiment
  f.ln = Math.log(N + 1);
  f.rare = (j) => (df.get(j) || 0) <= Math.max(6, N * 0.01);
  return f;
}
const BOOST_PERSONNE = 1.8, BOOST_ENTITE = 1.5, BOOST_PROPRE = 1.25;
function vecteur(e, idf) {
  const v = new Map();
  for (const j of e.jetons) {
    const b = j.startsWith("p:") ? BOOST_PERSONNE : j.startsWith("i:") || j.startsWith("a:") ? BOOST_ENTITE : e.propres.has(j) ? BOOST_PROPRE : j.startsWith("n:") ? 0.7 : 1;
    v.set(j, idf(j) * b);
  }
  return v;
}
// Mots d'attribution (qui dit quoi, avec quel titre) et mots-cadres de l'actualité du jour : ils ne disent rien du fait précis rapporté
const ATTRIBUTION = new Set(("declare affirme estime assure juge lance reclame souligne observe analyse explique denonce revele precise indique repond reagit " +
  "candidat candidate porte parole secretaire national premier ancien vice general region maire adjoint depute senateur ministre delegue membre " +
  "colere lycee lyceen mobilis blocus presidentielle reaction fustige condamne regrette remarque rappelle detaille raconte dit disent").split(" "));
/** Vecteur « contenu » : sans les personnes ni les mots d'attribution (deux citations d'un même élu sur des sujets différents ne se ressemblent plus). */
function vecteurContenu(e, idf) {
  const v = new Map();
  for (const j of e.jetons) if (!j.startsWith("p:") && !ATTRIBUTION.has(j) && j !== "n:2027") v.set(j, idf(j) * (j.startsWith("n:") ? 0.7 : 1));
  return v;
}
const POIDS_PAR_LN = 1.7; // somme des IDF des mots de contenu partagés, en multiples de ln(taille du lot) : un « budget » + un « baisse » ne font pas un même fait
/** Le contenu (hors personnes et attribution) de deux titres se recoupe-t-il assez pour parler du même fait ? */
function contenuCommun(u, m, idf) {
  if (cosinus(u.vc, m.vc) < SEUIL_CONTENU) return false;
  const communs = [...u.vc.keys()].filter((j) => m.vc.has(j));
  return communs.length >= 2 && communs.some((j) => idf.rare(j)) && communs.reduce((s, j) => s + idf(j), 0) >= POIDS_PAR_LN * idf.ln;
}
const norme = (v) => Math.sqrt([...v.values()].reduce((s, x) => s + x * x, 0));
function cosinus(a, b) {
  const [p, q] = a.size <= b.size ? [a, b] : [b, a];
  let d = 0;
  for (const [j, x] of p) { const y = q.get(j); if (y) d += x * y; }
  const n = norme(a) * norme(b);
  return n ? d / n : 0;
}

// ---------- Blocages ----------
const memeNom = (a, b) => a.nom === b.nom && (!a.prenom || !b.prenom || a.prenom === b.prenom);
const personnesCompatibles = (A, B) => !A.length || !B.length || A.some((a) => B.some((b) => memeNom(a, b)));
const loisCompatibles = (A, B) => !A.size || !B.size || [...A].some((x) => B.has(x));
const themesCompatibles = (A, B) => !A.size || !B.size || [...A].some((x) => B.has(x));
// Un chiffre commun, ou deux chiffres à 3 % près (« 78 % » / « près de 80 % ») : même fait chiffré
const chiffresProches = (A, B) => [...A].some((x) => [...B].some((y) => x === y || Math.abs(x - y) / Math.max(+x, +y) <= 0.03));
function contraires(pa, pb) {
  return CONTRAIRES.some(([x, y]) => {
    const ax = x.test(pa), ay = y.test(pa), bx = x.test(pb), by = y.test(pb);
    return ((ax && !ay && by && !bx) || (ay && !ax && bx && !by));
  });
}

/** Raison pour laquelle deux empreintes ne doivent PAS être fusionnées, ou null. `sim` : similarité entre elles. */
function blocage(a, b, sim = 0) {
  if (!personnesCompatibles(a.personnes, b.personnes)) return "personnes différentes";
  if (!loisCompatibles(a.lois, b.lois)) return "lois différentes";
  if (contraires(a.plat, b.plat)) return "termes contraires";
  if (sim < SEUIL_NE && a.negationNe !== b.negationNe) return "négation (ne… pas) d'un seul côté";
  if (sim < SEUIL_FORT) {
    if (a.negation !== b.negation) return "négation d'un seul côté";
    if (!themesCompatibles(a.themes, b.themes)) return "thèmes différents";
    if (a.chiffres.size && b.chiffres.size && !chiffresProches(a.chiffres, b.chiffres)) return "chiffres différents";
    if (a.lieu && b.lieu && a.lieu !== b.lieu && !b.plat.includes(a.lieu) && !a.plat.includes(b.lieu)) return "lieux différents";
  }
  return null;
}

/**
 * Regroupe des articles { titre, media, date, url } en sujets.
 * @param {Array} articles
 * @param {{referentiel?: object, fenetreMs?: number}} options
 * @returns {Array<{articles: Array}>} sujets, articles dans l'ordre d'entrée
 */
function regrouper(articles, options = {}) {
  const ref = options.referentiel || null;
  const fenetre = options.fenetreMs || FENETRE_MS;
  // Titres identiques une fois nettoyés (même dépêche) = une seule unité de regroupement
  const unites = [];
  const parCle = new Map();
  articles.forEach((a, i) => {
    const cle = plat(nettoyer(a.titre)).replace(/[^a-z0-9]+/g, " ").trim();
    const d = Date.parse(a.date) || 0;
    // Même titre à plus de 36 h d'écart : deux faits (« Journal du 5 octobre » / « du 6 octobre » ont déjà des titres distincts, mais pas toujours)
    let u = (parCle.get(cle) || []).find((x) => d - x.min <= fenetre && x.max - d <= fenetre);
    if (!u) { u = { cle, articles: [], i, date: d, min: d, max: d }; parCle.set(cle, [...(parCle.get(cle) || []), u]); unites.push(u); }
    u.articles.push({ a, i });
    u.min = Math.min(u.min, d);
    u.max = Math.max(u.max, d);
    u.date = u.max;
  });
  for (const u of unites) u.e = empreinte(u.articles[0].a.titre, ref);
  const idf = construireIdf(unites.map((u) => u.e));
  for (const u of unites) { u.v = vecteur(u.e, idf); u.vc = vecteurContenu(u.e, idf); }

  const groupes = [];
  // Les titres les plus riches d'abord (ils fixent le centroïde), puis les plus récents : ordre déterministe
  const ordre = unites.slice().sort((x, y) => y.e.jetons.size - x.e.jetons.size || y.date - x.date || x.i - y.i);
  for (const u of ordre) {
    let meilleur = null;
    if (u.e.jetons.size >= 3) for (const g of groupes) {
      if (g.unites.some((m) => Math.abs(m.date - u.date) > fenetre)) continue;
      const centre = cosinus(u.v, g.centre);
      if (centre < SEUIL_CENTROIDE) continue;
      let voisin = 0, voisinU = null;
      for (const m of g.unites) { const s = cosinus(u.v, m.v); if (s > voisin) { voisin = s; voisinU = m; } }
      if (voisin < SEUIL_VOISIN) continue;
      // Le contenu seul doit aussi se ressembler (sinon : même personne, deux déclarations différentes)
      if (!g.unites.some((m) => cosinus(u.v, m.v) >= SEUIL_VOISIN && contenuCommun(u, m, idf))) continue;
      // Ancre : une entité commune, ou deux jetons communs dont un rare (pas deux mots banals)
      const communs = [...u.e.jetons].filter((j) => g.unites.some((m) => m.e.jetons.has(j)));
      const ancre = communs.some((j) => /^(p|i|a):/.test(j)) || communs.length >= 3 || (communs.length === 2 && communs.some((j) => idf(j) >= 3));
      if (!ancre) continue;
      // Blocages : contre chaque titre du groupe (un seul désaccord suffit)
      if (g.unites.some((m) => blocage(u.e, m.e, cosinus(u.v, m.v)))) continue;
      const score = centre + voisin;
      if (!meilleur || score > meilleur.score) meilleur = { g, score };
    }
    if (meilleur) {
      meilleur.g.unites.push(u);
      meilleur.g.centre = sommer(meilleur.g.centre, u.v);
    } else groupes.push({ unites: [u], centre: new Map(u.v) });
  }
  return groupes
    .map((g) => ({ articles: g.unites.flatMap((u) => u.articles).sort((x, y) => x.i - y.i).map((x) => x.a) }))
    .sort((x, y) => articles.indexOf(x.articles[0]) - articles.indexOf(y.articles[0]));
}
function sommer(c, v) {
  const r = new Map(c);
  for (const [j, x] of v) r.set(j, (r.get(j) || 0) + x);
  return r;
}

/**
 * Médias distincts d'un sujet : un groupe de presse = 1 ; deux médias qui publient le même titre (dépêche reprise),
 * ou, entre médias régionaux, des titres presque identiques = 1.
 * @returns {{ mediasDistincts: number, sources: string[] }} sources : un libellé par source distincte
 */
function sourcesDistinctes(articlesSujet) {
  const medias = [...new Set(articlesSujet.map((a) => a.media))];
  const parent = new Map(medias.map((m) => [m, m]));
  const racine = (m) => { while (parent.get(m) !== m) m = parent.get(m); return m; };
  const union = (a, b) => { const ra = racine(a), rb = racine(b); if (ra !== rb) parent.set(rb, ra); };
  for (const m of medias) union(m, medias.find((x) => groupeDe(x) === groupeDe(m)));
  const fiches = articlesSujet.map((a) => ({ media: a.media, cle: plat(nettoyer(a.titre)).replace(/[^a-z0-9]+/g, " ").trim() }));
  for (let i = 0; i < fiches.length; i++) for (let j = i + 1; j < fiches.length; j++) {
    const x = fiches[i], y = fiches[j];
    if (x.media === y.media) continue;
    if (x.cle === y.cle) { union(x.media, y.media); continue; }
    if ((REGIONAUX.has(x.media) || REGIONAUX.has(y.media)) && ressemblance(x.cle, y.cle) >= SEUIL_DEPECHE) union(x.media, y.media);
  }
  const comp = new Map();
  for (const m of medias) { const r = racine(m); comp.set(r, [...(comp.get(r) || []), m]); }
  const sources = [...comp.values()].map((ms) => (ms.length === 1 ? ms[0] : groupeDe(ms[0]) === groupeDe(ms[ms.length - 1]) && ms.every((x) => groupeDe(x) === groupeDe(ms[0])) ? groupeDe(ms[0]) : ms.join(" / ")));
  return { mediasDistincts: comp.size, sources };
}
/** Ressemblance de deux titres normalisés (Jaccard sur les mots) : sert seulement à reconnaître une même dépêche. */
function ressemblance(a, b) {
  const A = new Set(a.split(" ")), B = new Set(b.split(" "));
  let c = 0;
  for (const x of A) if (B.has(x)) c++;
  return c / (A.size + B.size - c || 1);
}

/** Titre de tête : le plus proche des autres titres du sujet (à égalité, le premier). */
function centrale(articlesSujet, ref) {
  if (articlesSujet.length < 3) return articlesSujet.slice();
  const es = articlesSujet.map((a) => empreinte(a.titre, ref));
  const idf = construireIdf(es);
  const vs = es.map((e) => vecteur(e, idf));
  const score = (i) => vs.reduce((t, v, j) => t + (i === j ? 0 : cosinus(vs[i], v)), 0);
  const i = vs.map((_, k) => k).sort((x, y) => score(y) - score(x) || x - y)[0];
  return [articlesSujet[i], ...articlesSujet.filter((_, k) => k !== i)];
}

// ---------- Ancien algorithme (conservé pour mesurer le gain : tests/regroupement.test.mjs, scripts/mesure-regroupement.cjs) ----------
const ANCIENS_VIDES = new Set(("les des une pour dans avec sans sur par que qui quoi est son ses leur leurs aux du de la le un et ou mais donc car ni " +
  "pas plus tres tout tous toute toutes cette ces cet elle elles ils nous vous apres avant entre contre chez depuis selon face fait faire veut va " +
  "etre avoir ont sont sera seront etait comme encore deja aussi ainsi alors quand dont lors vers ceux celle celui quel quelle quels quelles " +
  "direct video info infos politique france francais francaise gouvernement ministre premier president annonce explique dit").split(" "));
const anciensMots = (titre) => new Set(plat(titre).split(/[^a-z0-9]+/).filter((m) => m.length >= 4 && !ANCIENS_VIDES.has(m)));
function regrouperAncien(articles) {
  const sujets = [];
  for (const a of articles) {
    const m = anciensMots(a.titre);
    const s = m.size >= 2 && sujets.find((x) => {
      let c = 0;
      for (const w of m) if (x.mots.has(w)) c++;
      return c >= 3 || (c === 2 && c / Math.max(m.size, x.mots.size) >= 0.5);
    });
    if (s) s.articles.push(a);
    else sujets.push({ mots: m, articles: [a] });
  }
  return sujets.map((s) => ({ articles: s.articles }));
}

module.exports = { regrouper, regrouperAncien, construireReferentiel, empreinte, blocage, sourcesDistinctes, centrale, cosinus, vecteur, construireIdf, nettoyer, GROUPES };
