/**
 * dossiers.cjs
 * ------------
 * Regroupement « dossiers » : un sujet dominant (ex. le blocus des lycées) est souvent éclaté en une
 * quinzaine de petits sujets d'un seul média. On cherche donc les mots-clés (radicaux de 5 lettres, hors
 * mots vides et noms propres) présents dans au moins 6 articles d'au moins 4 médias sur 48 h ; les mots-clés
 * qui désignent les mêmes articles sont fusionnés en un dossier.
 *
 * Garde-fous : les titres de faits divers / accusations (liste prudente de stories-auto.cjs) sont écartés AVANT
 * le calcul ; les noms propres (personnes, partis) ne forment jamais un dossier ; un dossier qui ne parle que de
 * l'étranger est écarté (pertinence.cjs). Le titre est neutre : un thème, jamais une affirmation.
 */
const { concerneLaFrance } = require("./pertinence.cjs");
const { motExclu } = require("./stories-auto.cjs");
const { sourcesDistinctes } = require("./regroupement.cjs");

const MIN_ARTICLES = 6, MIN_MEDIAS = 4, HEURES = 48, MAX_DOSSIERS = 3, MAX_ARTICLES = 14;

const plat = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const VIDES = new Set(("depuis apres avant contre entre selon pendant alors encore toujours jamais aussi ainsi cette ceux celle celui leurs notre votre " +
  "comme dont tout toute toutes tous plus moins faire fait faits veut veulent peut peuvent doit doivent sera seront etre avoir sont ete etait " +
  "pourquoi comment voici voila quand nouveau nouvelle nouveaux nouvelles premier premiere dernier derniere grand grande autre autres meme " +
  "gouvernement ministre ministres president presidente politique politiques francais francaise france frances direct video infos info " +
  "annonce annonces explique explication demande demandent propose propositions projet projets debat debats reforme reformes assemblee nationale " +
  "senat senateur senateurs depute deputes parti partis groupe groupes election elections campagne semaine journee jours annee mois temps " +
  "rapport avis point cours quelle quelles quels vers chez sous dans sans avec pour mais donc lors tres bien deja ensuite " +
  "ministere elysee matignon commission texte textes loi lois vote votes adopte adopter reponse reponses face gauche droite centre " +
  "extreme pays monde europe europeen europeenne conseil conseils propos retour apres-midi").split(/\s+/));
const radical = (m) => m.replace(/[sx]$/, "").slice(0, 5);

/** Mots d'un titre : { rad, forme, propre }. Un mot en capitale hors début de phrase est un nom propre. */
function motsDuTitre(titre) {
  const t = String(titre);
  const res = [];
  for (const m of t.matchAll(/[\p{L}][\p{L}'’-]*/gu)) {
    const j = m[0].replace(/^[lLdD][’']/, "");
    const p = plat(j).replace(/[^a-z]/g, "");
    if (p.length < 5 || VIDES.has(p) || VIDES.has(p.replace(/[sx]$/, ""))) continue;
    const tousMaj = /^\p{Lu}+$/u.test(j) && j.length > 1;
    const majuscule = /^\p{Lu}/u.test(j);
    const debut = !t.slice(0, m.index).replace(/[\s«»"“”(]+$/, "") || /[.:!?]$/.test(t.slice(0, m.index).replace(/[\s«»"“”(]+$/, ""));
    res.push({ rad: radical(p), forme: j.toLowerCase(), propre: tousMaj || (majuscule && !debut) });
  }
  return res;
}

const MAJ = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// Titres neutres connus (thèmes récurrents) : MOT ENTIER (jamais un radical de 5 lettres : « prima » donne primate, « retra » donne retrait) présent dans
// au moins les 2/3 des titres du dossier ; sinon le titre est celui du mot-clé lui-même, à condition qu'il couvre aussi 2/3 des articles (voir construireDossiers).
const COUVERTURE_MIN = 2 / 3;
const part = (titres, re) => (titres.length ? titres.filter((t) => re.test(plat(t))).length / titres.length : 0);
const TITRES_CONNUS = [
  [(t) => part(t, /\blycees?\b/) >= COUVERTURE_MIN && t.filter((x) => /\bbloc(?:us|age|ages|que|quent|ques)\b/.test(plat(x))).length >= 3, "Blocus des lycées"],
  [(t) => part(t, /\bgreves?\b/) >= COUVERTURE_MIN, "Grève"],
  [(t) => part(t, /\bprimaires?\b/) >= COUVERTURE_MIN && part(t, /\bgauche\b/) >= COUVERTURE_MIN && part(t, /\bdroite\b/) === 0, "Primaire de la gauche"],
  [(t) => part(t, /\bprimaires?\b/) >= COUVERTURE_MIN && part(t, /\bdroite\b/) >= COUVERTURE_MIN && part(t, /\bgauche\b/) === 0, "Primaire de la droite"],
  [(t) => part(t, /\bretraites?\b/) >= COUVERTURE_MIN, "Retraites"],
  [(t) => part(t, /\bbudgets?\b/) >= COUVERTURE_MIN, "Budget"],
  [(t) => part(t, /\bmanifest\w*/) >= COUVERTURE_MIN, "Manifestations"],
  [(t) => part(t, /\blyce\w*/) >= COUVERTURE_MIN, "Lycées"],
];
// Mots-clés trop ambigus pour titrer seuls (école primaire, primaire de la droite, retrait des troupes) : pas de dossier plutôt qu'un titre faux
const AMBIGUS = /^(primaire|prime)$/;

/**
 * articles : [{ titre, url, media, date }] ; renvoie jusqu'à 3 dossiers
 * { id, titre, motifs, medias, nb, derniere, articles: [{ media, titre, url, date }] }.
 */
function construireDossiers(articles, now = new Date()) {
  const frais = (articles || []).filter((a) => a?.titre && a.url && a.media && now - Date.parse(a.date) <= HEURES * 36e5 && Date.parse(a.date) - now <= 36e5)
    .filter((a) => !motExclu(a.titre));
  if (frais.length < MIN_ARTICLES) return [];
  const parMot = new Map(); // radical -> { arts:Set(index), formes:Map, propres:int }
  frais.forEach((a, i) => {
    for (const w of new Map(motsDuTitre(a.titre).map((x) => [x.rad, x])).values()) {
      let e = parMot.get(w.rad);
      if (!e) parMot.set(w.rad, (e = { arts: new Set(), formes: new Map(), propres: 0 }));
      e.arts.add(i);
      e.propres += w.propre ? 1 : 0;
      e.formes.set(w.forme, (e.formes.get(w.forme) || 0) + 1);
    }
  });
  const qualifies = [...parMot.entries()].filter(([, e]) => {
    if (e.arts.size < MIN_ARTICLES || e.arts.size > frais.length * 0.4) return false; // trop rare, ou trop générique
    if (e.propres * 2 > e.arts.size) return false; // nom de personne ou de parti : pas un dossier
    return new Set([...e.arts].map((i) => frais[i].media)).size >= MIN_MEDIAS;
  }).sort((a, b) => b[1].arts.size - a[1].arts.size);

  // Fusion des mots-clés qui désignent (en grande partie) les mêmes articles
  const groupes = [];
  for (const [rad, e] of qualifies) {
    const g = groupes.find((x) => { let c = 0; for (const i of e.arts) if (x.graine.has(i)) c++; return c / Math.min(e.arts.size, x.graine.size) >= 0.5; });
    if (g) { g.mots.push([rad, e]); e.arts.forEach((i) => g.arts.add(i)); }
    else groupes.push({ mots: [[rad, e]], graine: e.arts, arts: new Set(e.arts) });
  }

  for (const g of groupes) {
    const arts = [...g.arts].map((i) => frais[i]).sort((a, b) => b.date.localeCompare(a.date));
    const medias = [...new Set(arts.map((a) => a.media))];
    if (arts.length < MIN_ARTICLES || medias.length < MIN_MEDIAS || sourcesDistinctes(arts).mediasDistincts < MIN_MEDIAS || !concerneLaFrance(arts.map((a) => a.titre))) continue;
    g.liste = arts;
    g.medias = medias;
    g.score = medias.length * 100 + arts.length;
  }
  const sortie = [];
  const pris = new Set();
  for (const g of groupes.filter((x) => x.liste).sort((a, b) => b.score - a.score)) {
    if (sortie.length >= MAX_DOSSIERS) break;
    const urls = g.liste.map((a) => a.url);
    if (urls.filter((u) => pris.has(u)).length * 2 > urls.length) continue; // recouvre un dossier déjà retenu
    const motifs = g.mots.slice(0, 4).map(([, e]) => [...e.formes.entries()].sort((a, b) => b[1] - a[1])[0][0]);
    const affiches = articlesAffiches(g.liste);
    const titresAffiches = affiches.map((a) => a.titre);
    const connu = TITRES_CONNUS.find(([t]) => t(titresAffiches));
    const titre = connu ? connu[1] : MAJ(motifs[0]);
    // Le titre doit être couvert par au moins 2/3 des articles affichés et ne pas être ambigu : sinon pas de dossier (en cas de doute, rien)
    if (!connu && (AMBIGUS.test(plat(titre)) || part(titresAffiches, new RegExp("\\b" + plat(motifs[0]).replace(/[^a-z]/g, "").slice(0, 5))) < COUVERTURE_MIN)) continue;
    urls.forEach((u) => pris.add(u));
    sortie.push({
      id: plat(motifs[0]).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      titre,
      motifs,
      medias: g.medias,
      mediasDistincts: sourcesDistinctes(affiches).mediasDistincts, // un groupe de presse ou une dépêche reprise compte une fois
      sources: sourcesDistinctes(affiches).sources,
      nb: g.liste.length,
      derniere: g.liste[0].date,
      articles: affiches.map((a) => ({ media: a.media, titre: a.titre, url: a.url, date: a.date })),
    });
  }
  return sortie;
}

/** Les articles affichés d'un dossier : le plus récent de chaque média d'abord (le dossier garde tous ses médias), puis les plus récents, MAX_ARTICLES au plus, par date décroissante. */
function articlesAffiches(liste) {
  const retenus = new Set();
  const vus = new Set();
  for (const a of liste) if (!vus.has(a.media)) { vus.add(a.media); retenus.add(a); }
  for (const a of liste) { if (retenus.size >= MAX_ARTICLES) break; retenus.add(a); }
  return liste.filter((a) => retenus.has(a));
}

module.exports = { articlesAffiches, construireDossiers, motsDuTitre, MIN_ARTICLES, MIN_MEDIAS, HEURES, MAX_DOSSIERS };
