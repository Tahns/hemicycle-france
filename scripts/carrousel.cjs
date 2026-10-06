/**
 * carrousel.cjs
 * -------------
 * Publication d'un CARROUSEL Instagram (post de 2 à 10 images 1080 × 1350) par l'API officielle (Instagram Graph), sans dépendance :
 *   1. pour chaque image : POST /{IG_USER_ID}/media { image_url, is_carousel_item: true [, alt_text] } -> conteneur enfant ; attente du statut FINISHED ;
 *   2. POST /{IG_USER_ID}/media { media_type: CAROUSEL, children: "id1,id2,…", caption } -> conteneur parent ; attente du statut FINISHED ;
 *   3. POST /{IG_USER_ID}/media_publish { creation_id } -> média publié.
 * ÉCHEC = ABANDON SANS DOUBLON :
 *  - une erreur AVANT media_publish (enfant refusé, statut ERROR / EXPIRED, délai dépassé) laisse l'erreur marquée « avantPublication » : rien n'est publié,
 *    les conteneurs non publiés expirent seuls ; l'appelant peut réessayer au passage suivant (jamais d'image à moitié publiée) ;
 *  - une erreur sur media_publish lui-même est marquée « publicationIncertaine » : le carrousel a peut-être été publié, l'appelant NE RÉESSAIE PAS.
 * Fonctions pures et injectables (le client `graph` est passé en argument) : testables sans réseau.
 */

const RE_URL_IMAGE = /^https?:\/\/[^\s]+\.jpg$/; // https en production (contrôlé par check-data.js) ; http seulement pour le faux serveur des essais
const nbHashtags = (l) => (String(l).match(/#\p{L}[\p{L}\p{N}_]*/gu) || []).length;

/**
 * Contrôle d'une entrée de file { type: "carousel", url_images, legende, alts? } : renvoie { ok, erreurs }.
 * Légende : 20 à 2 200 caractères, @hemicyclefrance cité, 3 à 5 hashtags, jamais l'adresse du site.
 */
function validerCarrousel(e) {
  const erreurs = [];
  const imgs = e?.url_images;
  if (!Array.isArray(imgs) || imgs.length < 2 || imgs.length > 10) erreurs.push("un carrousel compte de 2 à 10 images");
  else if (!imgs.every((u) => RE_URL_IMAGE.test(u))) erreurs.push("adresse d'image invalide (.jpg exigé)");
  else if (new Set(imgs).size !== imgs.length) erreurs.push("images en double");
  if (e?.alts !== undefined && !(Array.isArray(e.alts) && e.alts.length === (imgs || []).length && e.alts.every((a) => typeof a === "string" && a.length > 0 && a.length <= 1000))) erreurs.push("textes alternatifs invalides (un par image, 1 000 caractères au plus)");
  const l = e?.legende;
  if (typeof l !== "string" || l.length < 20 || l.length > 2200) erreurs.push("légende absente ou hors limites");
  else {
    const h = nbHashtags(l);
    if (h < 3 || h > 5) erreurs.push(`${h} hashtag(s) : 3 à 5 attendus`);
    if (/github\.io|hemicycle-france|hémicycle-france\.|https?:\/\/(www\.)?hemicycle/i.test(l)) erreurs.push("la légende ne doit pas contenir de lien du site");
    if (!l.includes("@hemicyclefrance")) erreurs.push("la légende doit citer @hemicyclefrance");
  }
  return { ok: erreurs.length === 0, erreurs };
}

const dormirVraiment = (ms) => new Promise((r) => setTimeout(r, ms));

/** Attend le statut FINISHED d'un conteneur ; lève une erreur (avantPublication) sur ERROR, EXPIRED ou délai dépassé. */
async function attendreFini(graph, id, { attenteMs, essais, dormir }) {
  for (let i = 0; ; i++) {
    const statut = (await graph("GET", `/${id}`, { fields: "status_code" })).status_code;
    if (statut === "FINISHED") return;
    if (statut === "ERROR" || statut === "EXPIRED") throw new Error(`conteneur ${id} en statut ${statut}`);
    if (i + 1 >= essais) throw new Error(`conteneur ${id} pas prêt (statut ${statut || "inconnu"})`);
    await dormir(attendreDelai(attenteMs, i));
  }
}
const attendreDelai = (base, i) => Math.min(Math.round(base * Math.pow(1.3, i)), base * 10);

/**
 * Publie le carrousel. `graph(methode, chemin, params)` est le client de l'API (publier-stories.cjs) ; renvoie { mediaId, enfants }.
 * Erreur : err.avantPublication === true (rien de publié, nouvel essai permis) ou err.publicationIncertaine === true (ne jamais réessayer).
 */
async function publierCarrousel({ graph, userId, entree, attenteMs = 3000, essais = 20, dormir = dormirVraiment }) {
  const v = validerCarrousel(entree);
  if (!v.ok) { const err = new Error("carrousel invalide : " + v.erreurs.join(" ; ")); err.avantPublication = true; throw err; }
  let parent;
  const enfants = [];
  try {
    for (let i = 0; i < entree.url_images.length; i++) {
      const params = { image_url: entree.url_images[i], is_carousel_item: "true" };
      if (entree.alts) params.alt_text = entree.alts[i];
      const cree = await graph("POST", `/${userId}/media`, params);
      if (!cree.id) throw new Error("API : pas d'identifiant de conteneur enfant");
      enfants.push(cree.id);
      await attendreFini(graph, cree.id, { attenteMs, essais, dormir });
    }
    const p = await graph("POST", `/${userId}/media`, { media_type: "CAROUSEL", children: enfants.join(","), caption: entree.legende });
    if (!p.id) throw new Error("API : pas d'identifiant de conteneur parent");
    parent = p.id;
    await attendreFini(graph, parent, { attenteMs, essais, dormir });
  } catch (err) { err.avantPublication = true; throw err; }
  let pub;
  try {
    pub = await graph("POST", `/${userId}/media_publish`, { creation_id: parent });
    if (!pub.id) throw new Error("API : media_publish sans identifiant");
  } catch (err) { err.publicationIncertaine = true; throw err; }
  return { mediaId: pub.id, enfants };
}

module.exports = { validerCarrousel, publierCarrousel, nbHashtags };
