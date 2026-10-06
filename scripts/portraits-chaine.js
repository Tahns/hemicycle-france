/**
 * portraits-chaine.js
 * -------------------
 * Chaîne de repli AUTOMATIQUE pour obtenir le portrait d'une personne, de la source la plus fiable à la moins :
 *   (a) photo officielle open data : Assemblée nationale (députés, membres du Gouvernement qui ont une fiche de l'Assemblée),
 *       Sénat (sénateurs). gouvernement.fr et l'Élysée ne publient pas de licence lisible par machine : leurs portraits
 *       officiels ne sont repris que via Wikimedia Commons (étape b ou c), où la licence est vérifiable ;
 *   (b) Wikidata : humain à profession politique (homonymes écartés), image P18, puis image principale de l'article
 *       Wikipédia FR/EN ; licence libre vérifiée sur Commons (extmetadata) ;
 *   (c) catégorie Commons de la personne (P373 ou « Category:<Nom> », confirmée par le même élément Wikidata) ;
 *   (d) à défaut, SEULEMENT, un médaillon d'initiales aux couleurs du parti ou de l'institution (`placeholder: true`).
 * Jamais de photo d'agence ou de média sans licence libre vérifiée : en cas de doute, le médaillon.
 *
 * Tout l'accès réseau passe par `ctx.api(url)` (JSON) et `ctx.telecharger(url)` (réponse binaire) : injectables, donc testable
 * hors ligne avec des fixtures. Une erreur HTTP 429 ou réseau est TRANSITOIRE (erreur.transitoire = true) : la personne est
 * reprise au passage suivant, sans jamais écraser une bonne photo.
 */

export const LARGEUR_MIN = 400; // largeur minimale de l'original sur Commons
export const LARGEUR_VIGNETTE = 120;
const MIMES_OK = /^image\/(jpeg|png|webp|tiff)$/;
const NON_LIBRE = /non[- ]?free|fair use|non[- ]?commercial|\bnc\b|\bnd\b|no[- ]?deriv|all rights reserved|tous droits/i;
const LIBRE = /public domain|domaine public|^pd\b|^cc0|^cc[ -]by|^attribution|^gfdl|^gnu|^fal\b|free art|licence ouverte|open licence|etalab|^ogl|open government|copyrighted free use|^no restrictions/i;
const texte = (h) => String(h || "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const plat = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’'-]/g, " ").replace(/\s+/g, " ").trim();
export const slug = (nom) => nom.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const initiales = (nom) => nom.split(/[\s-]+/).filter(Boolean).map((x) => x[0]).filter((c) => /\p{Lu}/u.test(c)).slice(0, 2).join("") || "?";

export function erreur(message, transitoire = false) {
  const e = new Error(message);
  e.transitoire = transitoire;
  return e;
}

/** Licence libre (domaine public, CC0, CC BY, CC BY-SA, licences ouvertes) ou erreur. `m` : extmetadata de Commons. */
export function licenceLibre(m) {
  const licence = texte(m?.LicenseShortName?.value);
  const termes = `${licence} ${texte(m?.UsageTerms?.value)}`;
  if (!licence) throw erreur("licence inconnue");
  if (texte(m?.NonFree?.value).toLowerCase() === "true" || NON_LIBRE.test(termes)) throw erreur(`licence non libre (${licence})`);
  if (!LIBRE.test(licence)) throw erreur(`licence non reconnue comme libre (${licence})`);
  return licence;
}

/**
 * Informations d'un fichier Commons, licence libre exigée. Renvoie
 * { fichier, licence, auteur, source, largeur, hauteur, mime, vignette } ; lève une erreur sinon.
 */
export async function verifierFichier(fichier, ctx) {
  const d = await ctx.api(`https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=${LARGEUR_VIGNETTE}&titles=${encodeURIComponent("File:" + fichier)}`);
  return infoDepuisPage(Object.values(d.query?.pages || {})[0], fichier);
}

function infoDepuisPage(page, fichier) {
  const info = page?.imageinfo?.[0];
  if (!info?.thumburl) throw erreur("fichier absent de Commons (image non libre hébergée sur Wikipédia ?)");
  if (!MIMES_OK.test(info.mime || "")) throw erreur(`format d'image non accepté (${info.mime})`);
  const m = info.extmetadata || {};
  return {
    fichier: fichier || String(page.title || "").replace(/^File:/, "").replace(/ /g, "_"),
    licence: licenceLibre(m),
    auteur: texte(m.Artist?.value).slice(0, 120) || "Auteur inconnu",
    source: info.descriptionurl,
    largeur: info.width || 0,
    hauteur: info.height || 0,
    mime: info.mime,
    vignette: info.thumburl,
  };
}

/** Note d'un fichier Commons pour un portrait : de face (format portrait), assez large, nom évocateur ; plus haut = mieux. */
export function noteFichier(f) {
  const nom = plat(f.fichier);
  let n = 0;
  if (f.largeur >= LARGEUR_MIN) n += 40;
  const r = f.largeur ? f.hauteur / f.largeur : 0;
  n += r >= 1 ? 30 : r >= 0.75 ? 20 : r >= 0.6 ? 5 : -30; // paysage large = foule, tribune, groupe
  if (/portrait|officiel|official|cropped|recadre|headshot/.test(nom)) n += 25;
  if (/signature|logo|affiche|poster|caricature|dessin|statue|tombe|timbre|stamp|plaque|map|carte|crowd|foule|meeting|manifestation|conference|avec | with | et | and /.test(nom)) n -= 40;
  return n;
}

// ---------- Wikidata ----------

// Professions (P106) politiques : Q82955 homme/femme politique, Q372436 homme/femme d'État, Q15627169 syndicaliste.
// À défaut, une fonction (P39), un parti (P102) ou une candidature (P3602) suffisent.
const POLITIQUE_P106 = new Set(["Q82955", "Q372436", "Q15627169"]);
const REGEX_POLITIQUE = /politi|ministre|d[ée]put|s[ée]nat|maire|pr[ée]sident|syndica|homme d.[ée]tat|femme d.[ée]tat|militant|candidat|statesman|lawmaker|activist|minister|mayor|trade union/i;

const valeurs = (e, p) => (e?.claims?.[p] || []).filter((c) => c.rank !== "deprecated").sort((a, b) => (b.rank === "preferred") - (a.rank === "preferred"))
  .map((c) => c.mainsnak?.datavalue?.value).filter((v) => v !== undefined && v !== null);
const idsDe = (e, p) => valeurs(e, p).map((v) => v?.id).filter(Boolean);

/** Vrai pour un élément Wikidata qui est un humain à profession politique. */
export function estPolitique(e) {
  if (!idsDe(e, "P31").includes("Q5")) return false;
  if (idsDe(e, "P106").some((q) => POLITIQUE_P106.has(q))) return true;
  if (valeurs(e, "P39").length || valeurs(e, "P102").length || valeurs(e, "P3602").length) return true;
  const desc = [e.descriptions?.fr?.value, e.descriptions?.en?.value].filter(Boolean).join(" ");
  return REGEX_POLITIQUE.test(desc);
}
const estHumain = (e) => idsDe(e, "P31").includes("Q5");

const noms = (e) => [e.labels?.fr?.value, e.labels?.en?.value, ...(e.aliases?.fr || []).map((a) => a.value), ...(e.aliases?.en || []).map((a) => a.value)].filter(Boolean).map(plat);
// « Eléonore Caroit » / « Éléonore Caroit », « Jean-Luc » / « Jean Luc » : comparaison sans accents ni tirets ni casse
const memeNom = (e, nom) => noms(e).includes(plat(nom));

const PROPS = "claims|sitelinks|descriptions|labels|aliases";

/**
 * Élément Wikidata de la personne, ou null. Homonymes : le nom doit correspondre exactement et l'élément doit être un humain à
 * profession politique (`souple` : faute de profession politique, un unique humain de ce nom est accepté, pour les personnes que le
 * site présente lui-même comme politiques : candidats, dirigeants, Gouvernement). `titre` : titre exact de l'article Wikipédia FR.
 */
export async function trouverEntite(nom, ctx, { titre, souple = false } = {}) {
  let entites = [];
  if (titre) {
    const d = await ctx.api(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&sites=frwiki&titles=${encodeURIComponent(titre)}&props=${PROPS}&languages=fr|en&normalize=1`);
    entites = Object.values(d.entities || {}).filter((e) => e.id && e.missing === undefined && e.claims);
    const e = entites.find((x) => estHumain(x));
    if (e) return e;
  }
  const rech = await ctx.api(`https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&search=${encodeURIComponent(nom)}&language=fr&uselang=fr&type=item&limit=8`);
  const ids = (rech.search || []).map((r) => r.id);
  if (!ids.length) return null;
  const d = await ctx.api(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&ids=${ids.join("|")}&props=${PROPS}&languages=fr|en`);
  entites = ids.map((id) => d.entities?.[id]).filter((e) => e && e.claims && memeNom(e, nom));
  const humains = entites.filter(estHumain);
  const politiques = humains.filter(estPolitique);
  if (politiques.length) return politiques[0];
  if (souple && humains.length === 1) return humains[0];
  return null;
}

/** Fichiers Commons candidats d'un élément : P18 (image), puis image principale des articles Wikipédia FR et EN. */
export async function fichiersCandidats(entite, ctx) {
  const vus = new Set(), liste = [];
  const ajouter = (f, origine) => { const n = String(f || "").replace(/^File:/, "").replace(/ /g, "_"); if (n && !vus.has(n)) { vus.add(n); liste.push({ fichier: n, origine }); } };
  for (const f of valeurs(entite, "P18")) ajouter(f, "wikidata");
  for (const [site, hote, origine] of [["frwiki", "fr", "wikipedia-fr"], ["enwiki", "en", "wikipedia-en"]]) {
    const titre = entite.sitelinks?.[site]?.title;
    if (!titre) continue;
    const d = await ctx.api(`https://${hote}.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=pageimages&piprop=name&titles=${encodeURIComponent(titre)}`);
    ajouter(Object.values(d.query?.pages || {})[0]?.pageimage, origine);
  }
  return liste;
}

/** Étape b : meilleur fichier libre parmi les candidats. Renvoie { choix, reserve, refus[] } (reserve : libre mais < 400 px). */
export async function etapeWikidata(entite, ctx) {
  const refus = [];
  let reserve = null;
  for (const c of await fichiersCandidats(entite, ctx)) {
    try {
      const f = await verifierFichier(c.fichier, ctx);
      if (f.largeur >= LARGEUR_MIN) return { choix: { ...f, origine: c.origine }, reserve, refus };
      reserve = reserve || { ...f, origine: c.origine, basseDefinition: true };
      refus.push(`${c.fichier} : ${f.largeur} px (< ${LARGEUR_MIN})`);
    } catch (e) {
      if (e.transitoire) throw e;
      refus.push(`${c.fichier} : ${e.message}`);
    }
  }
  return { choix: null, reserve, refus };
}

/** Étape c : catégorie Commons de la personne, uniquement si elle est rattachée au même élément Wikidata (homonymes). */
export async function etapeCategorie(entite, nom, ctx) {
  const refus = [];
  const categories = [...new Set([...valeurs(entite, "P373"), nom].map((c) => String(c).replace(/^Category:/, "")))];
  for (const cat of categories) {
    const titre = `Category:${cat}`;
    const p = await ctx.api(`https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=pageprops&ppprop=wikibase_item&titles=${encodeURIComponent(titre)}`);
    const page = Object.values(p.query?.pages || {})[0];
    if (!page || page.missing !== undefined) { refus.push(`${titre} : absente`); continue; }
    if (page.pageprops?.wikibase_item !== entite.id) { refus.push(`${titre} : non rattachée à ${entite.id} (homonyme ?)`); continue; }
    const d = await ctx.api(`https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=categorymembers&gcmtitle=${encodeURIComponent(titre)}&gcmtype=file&gcmlimit=40&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=${LARGEUR_VIGNETTE}`);
    const trouves = [];
    for (const pg of Object.values(d.query?.pages || {})) {
      try {
        const f = infoDepuisPage(pg, String(pg.title || "").replace(/^File:/, "").replace(/ /g, "_"));
        if (f.largeur >= LARGEUR_MIN) trouves.push(f); else refus.push(`${f.fichier} : ${f.largeur} px`);
      } catch (e) { refus.push(`${pg.title} : ${e.message}`); }
    }
    trouves.sort((a, b) => noteFichier(b) - noteFichier(a));
    if (trouves[0] && noteFichier(trouves[0]) > 0) return { choix: { ...trouves[0], origine: "commons-categorie" }, refus };
    refus.push(`${titre} : aucun portrait de face utilisable`);
  }
  return { choix: null, refus };
}

// ---------- Étape a : photo officielle ----------

/** Photo officielle open data : { url, chemin, credit } ou null si la personne n'en a pas (ou si la fiche est inconnue). */
export function sourceOfficielle(p) {
  if (/^PA\d+$/.test(p.id || "") && (p.type === "depute" || p.type === "gouvernement")) {
    return {
      url: `https://www.assemblee-nationale.fr/dyn/static/tribun/17/photos/${p.id.replace(/^PA/, "")}.jpg`,
      chemin: p.type === "depute" ? `photos/deputes/${p.id}.jpg` : null,
      credit: { licence: "Licence Ouverte (open data de l'Assemblée nationale)", auteur: "Assemblée nationale", source: `https://www.assemblee-nationale.fr/dyn/deputes/${p.id}` },
    };
  }
  if (p.type === "senateur" && p.slug) {
    return {
      url: `https://www.senat.fr/senimg/${p.slug}_carre.jpg`,
      chemin: `photos/senateurs/${p.id}.jpg`,
      credit: { licence: "Licence Ouverte (open data du Sénat)", auteur: "Sénat", source: `https://www.senat.fr/senateur/${p.slug}.html` },
    };
  }
  return null;
}

async function telechargerImage(url, ctx, types = /image\/(jpeg|png)/) {
  const res = await ctx.telecharger(url);
  if (res.status === 429 || res.status >= 500) throw erreur(`HTTP ${res.status}`, true);
  if (!res.ok) throw erreur(`HTTP ${res.status}`);
  if (!types.test(res.headers.get("content-type") || "")) throw erreur(`type de contenu inattendu (${res.headers.get("content-type")})`);
  const octets = Buffer.from(await res.arrayBuffer());
  if (octets.length < 1500) throw erreur("image vide ou trop petite");
  return octets;
}

// ---------- Médaillon d'initiales ----------

const PALETTE = {
  LFI: "#D6284B", GDR: "#A32E22", PCF: "#A32E22", ECO: "#1E9F58", LE: "#1E9F58", SOC: "#D6488A", PS: "#D6488A", PP: "#D6488A", LIOT: "#A67C0A",
  EPR: "#E0B400", RE: "#E0B400", DEM: "#E08800", MoDem: "#E08800", HOR: "#0FA89C", LR: "#2F6FE0", UDR: "#1E44B0", RN: "#5B4FC9", NI: "#6B6E78",
  LO: "#8E1B1B", DLF: "#4B5AA8", REC: "#2B2B6E", NPA: "#B3261E", UPR: "#4A6B8A", LP: "#3D4F8A", DVD: "#5B7FC4", DVG: "#E07AA8",
  "CRCE-K": "#A32E22", GEST: "#1E9F58", SER: "#D6488A", RDSE: "#E08800", RDPI: "#E0B400", UC: "#0FA89C", LIRT: "#5B7FC4",
};
export const COULEUR_INSTITUTION = "#1B3A8C"; // bleu République du site
export const couleurMedaillon = (p) => (/^#[0-9a-f]{6}$/i.test(p.couleur || "") ? p.couleur : PALETTE[p.parti]) || COULEUR_INSTITUTION;
function luminance(hex) {
  const v = [1, 3, 5].map((i) => { const c = parseInt(hex.slice(i, i + 2), 16) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}
export const couleurTexte = (fond) => (1.05 / (luminance(fond) + 0.05) >= 4.5 ? "#FFFFFF" : "#1A1A1A"); // contraste WCAG AA, comme le site

const echapXml = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
/** Médaillon d'initiales (SVG carré, identité du site : aplat de la couleur du parti, initiales en serif). */
export function medaillonSvg(nom, couleur) {
  const fond = /^#[0-9a-f]{6}$/i.test(couleur || "") ? couleur : COULEUR_INSTITUTION;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200" role="img" aria-label="${echapXml(nom)}">`
    + `<rect width="200" height="200" fill="${fond}"/>`
    + `<text x="100" y="100" text-anchor="middle" dominant-baseline="central" font-family="Newsreader, Georgia, 'Times New Roman', serif" font-weight="700" font-size="84" fill="${couleurTexte(fond)}">${echapXml(initiales(nom))}</text></svg>\n`;
}

// ---------- Orchestration pour une personne ----------

/**
 * Parcourt la chaîne pour une personne. `p` : { nom, type, id, slug, parti, couleur, titre, souple, choix }.
 * Renvoie { statut: "photo", entree, octets, chemin } | { statut: "placeholder", entree, transitoire }.
 * Ne lève jamais d'erreur : tout est consigné dans `journal` (tableau de lignes) pour un journal lisible en CI.
 */
export async function resoudre(p, ctx, journal = []) {
  const note = (m) => { journal.push(m); ctx.log?.(`${p.nom} : ${m}`); };
  let transitoire = false;
  const aujourdhui = ctx.aujourdhui || new Date().toISOString().slice(0, 10);
  const succes = async (f, origine, extra = {}) => {
    const octets = await telechargerImage(f.vignette, ctx);
    return {
      statut: "photo", octets,
      entree: { fichier: f.fichier, licence: f.licence, auteur: f.auteur, source: f.source, article: extra.article, origine, wikidata: extra.wikidata, largeur: f.largeur, ...(f.basseDefinition ? { basseDefinition: true } : {}) },
    };
  };
  let entite = null;
  try {
    // (a) photo officielle
    const off = sourceOfficielle(p);
    if (off) {
      try {
        const octets = await telechargerImage(off.url, ctx, /image\/jpe?g/);
        note(`photo officielle (${off.credit.auteur})`);
        return { statut: "photo", octets, chemin: off.chemin, entree: { fichier: off.url.split("/").pop(), ...off.credit, origine: "officielle", ...(off.chemin ? { chemin: off.chemin } : {}) } };
      } catch (e) {
        if (e.transitoire) transitoire = true;
        note(`pas de photo officielle (${e.message})`);
      }
    }
    // Portrait imposé (data/portraits-choix.json) : licence toujours revérifiée
    if (p.choix) {
      try {
        const f = await verifierFichier(p.choix, ctx);
        note(`fichier imposé ${f.fichier} (${f.licence})`);
        return await succes(f, "choix", { article: `https://fr.wikipedia.org/wiki/${encodeURIComponent(p.nom.replace(/ /g, "_"))}` });
      } catch (e) { if (e.transitoire) transitoire = true; note(`fichier imposé refusé (${e.message})`); }
    }
    // (b) Wikidata, puis articles Wikipédia
    let reserve = null;
    try {
      entite = await trouverEntite(p.nom, ctx, { titre: p.titre, souple: p.souple });
      if (!entite) note("aucun élément Wikidata de personnalité politique pour ce nom (homonymes écartés)");
    } catch (e) { if (e.transitoire) transitoire = true; note(`Wikidata : ${e.message}`); }
    if (entite) {
      const extra = { wikidata: entite.id, article: entite.sitelinks?.frwiki ? `https://fr.wikipedia.org/wiki/${encodeURIComponent(entite.sitelinks.frwiki.title.replace(/ /g, "_"))}` : undefined };
      try {
        const r = await etapeWikidata(entite, ctx);
        r.refus.forEach((x) => note(`écarté : ${x}`));
        if (r.choix) { note(`${r.choix.fichier} (${r.choix.licence}, via ${r.choix.origine})`); return await succes(r.choix, r.choix.origine, extra); }
        reserve = r.reserve;
      } catch (e) { if (e.transitoire) transitoire = true; note(`étape Wikidata/Wikipédia : ${e.message}`); }
      // (c) catégorie Commons
      try {
        const r = await etapeCategorie(entite, p.nom, ctx);
        r.refus.forEach((x) => note(`écarté : ${x}`));
        if (r.choix) { note(`${r.choix.fichier} (${r.choix.licence}, catégorie Commons)`); return await succes(r.choix, "commons-categorie", extra); }
      } catch (e) { if (e.transitoire) transitoire = true; note(`étape catégorie Commons : ${e.message}`); }
      // Libre mais en dessous de 400 px : mieux qu'un médaillon, signalé comme tel
      if (reserve) { try { note(`${reserve.fichier} en basse définition (${reserve.largeur} px) faute de mieux`); return await succes(reserve, reserve.origine, extra); } catch (e) { if (e.transitoire) transitoire = true; } }
    }
  } catch (e) {
    if (e.transitoire) transitoire = true;
    note(`erreur inattendue : ${e.message}`);
  }
  // (d) médaillon d'initiales
  const couleur = couleurMedaillon(p);
  note(transitoire ? "limite de débit ou panne passagère : médaillon d'initiales en attendant, nouvel essai au prochain passage" : "aucune image libre vérifiable : médaillon d'initiales");
  return {
    statut: "placeholder", transitoire,
    entree: { fichier: null, placeholder: true, essai: aujourdhui, raison: transitoire ? "limite de débit ou panne passagère (429/réseau)" : "aucune image libre vérifiable", ...(transitoire ? { transitoire: true } : {}), initiales: initiales(p.nom), couleur, medaillon: `photos/personnalites/medaillons/${slug(p.nom)}.svg`, ...(entite ? { wikidata: entite.id } : {}) },
  };
}

/** Faut-il (re)tenter cette personne maintenant ? Une personne en placeholder est retentée au plus une fois par jour (reprise immédiate si transitoire). */
export function doitRetenter(entree, aujourdhui = new Date().toISOString().slice(0, 10)) {
  if (!entree) return true;
  if (entree.fichier) return false;
  if (entree.transitoire) return true;
  return String(entree.essai || "").slice(0, 10) < aujourdhui;
}

// ---------- Couverture ----------

/**
 * Rapport de couverture. `personnes` : liste de { nom, ... } ; `aPhoto(p, entree)` : vrai si la photo existe sur le disque.
 * Renvoie l'objet de data/portraits-couverture.json.
 */
export function calculerCouverture(personnes, portraits, aPhoto, date = new Date().toISOString().slice(0, 10)) {
  let avecPhoto = 0, placeholders = 0;
  const manquants = [], nonTraites = [], origines = {};
  for (const p of personnes) {
    const e = portraits[p.nom];
    if (aPhoto(p, e)) { avecPhoto++; const o = e?.origine || "officielle"; origines[o] = (origines[o] || 0) + 1; continue; }
    if (e?.placeholder || (e && !e.fichier)) { placeholders++; manquants.push(p.nom); } else { nonTraites.push(p.nom); manquants.push(p.nom); }
  }
  manquants.sort((a, b) => a.localeCompare(b, "fr")); nonTraites.sort((a, b) => a.localeCompare(b, "fr"));
  return { date, personnes: personnes.length, avecPhoto, placeholders, nonTraites: nonTraites.length, parOrigine: Object.fromEntries(Object.entries(origines).sort()), manquants, enAttente: nonTraites };
}

export const ligneResume = (c) =>
  `Portraits : ${c.avecPhoto}/${c.personnes} personnes avec photo sous licence, ${c.placeholders} médaillon(s) d'initiales, ${c.nonTraites} pas encore traitée(s) (médaillon affiché en attendant).`;
