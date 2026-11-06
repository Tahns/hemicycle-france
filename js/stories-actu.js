/* Module chargé à la demande (stories d'actualité) : voir chargerModule() dans index.html. */
/* Story d'un sujet d'actualité, sur la BASE BLANCHE (js/stories-blanc.js : bandeau marque + date, filet noir, rubrique rouge, titre serif gras, chapeau, filets gris, pied de source) :
   - modèle A « À la une » (par défaut) : rubrique rouge + heure, gros titre, « L'essentiel », citation de presse attribuée, portraits (1 ou 2 personnalités) dans des cadres nets
     ou, sans portrait, photo libre de l'institution du thème avec son crédit ; pied « N médias en parlent : … » (liste complète) ;
   - modèle E « En direct » : « ● EN DIRECT », heure de mise à jour, titre, fil de citations horodatées (titre de presse + médias).
   info = indice du sujet dans ACTUALITES.sujets, éventuellement « <indice>:<modèle>:<style> » (modèle : une, direct, facea, chiffre, date ; style : bleu = « une », une-photo, question, chiffre).
   Tout est dessiné en vectoriel ; seuls les portraits et photos réels sont des images. Aucun texte n'est jamais coupé (la taille descend, puis les éléments secondaires sont retirés).
   Tout est enfermé dans une fonction : les constantes ne doivent pas entrer en collision avec les autres modules d'actualité. */
(()=>{
const norm = t => storyTypo(t);
const LARG = STORY.L - 2 * BLANC.marge;

/* ----- Outils ----- */
function parisFmt(iso, o){ return new Date(iso).toLocaleString("fr-FR", { timeZone:"Europe/Paris", ...o }); }
function heureFr(iso){ return parisFmt(iso, { hour:"2-digit", minute:"2-digit" }).replace(":", " h ").replace(/^0/, ""); }
const quandFr = iso => storyBlancQuand(iso) || (typeof ilYA === "function" ? ilYA(iso) : "");
// Guillemets français autour d'un titre de presse, guillemets internes adoucis
function guillemets(t){
  return String(t).replace(/«\s*/g, "“").replace(/\s*»/g, "”").replace(/"([^"]*)"/g, "“$1”").replace(/"/g, "").replace(/(\p{L})'(\p{L})/gu, "$1’$2");
}
// Titre de presse prêt à être cité : sans « DIRECT. » ni rubrique en tête (« Social. »), sans point final
function titreCite(t){
  let x = norm(t);
  x = x.replace(/^(?:DIRECT|EN DIRECT|En direct)\s*[.:]\s*/, "");
  const m = /^[\p{L}0-9'’ -]{4,32}\.\s+(?=\p{Lu})/u.exec(x);
  if(m && x.length - m[0].length >= 28) x = x.slice(m[0].length);
  return storyMinuscules(x.replace(/\.$/, ""));
}
const citation = titre => "« " + guillemets(norm(titre)).replace(/[\s,;:.\-–]+$/, "") + " »";
function theme(s){ return THEMES_ACTU?.[s.illustration?.theme] || THEMES_ACTU?.politique || ["", "", "Vie politique"]; }
function enDirectDe(s){
  return (typeof DIRECT !== "undefined" && DIRECT?.evenements || []).some(e=> e.type !== "seance-an" && s.articles.some(a=> a.titre === e.titre));
}
function premiereVideo(s){ return s.articles.find(a=> a.video)?.media || ""; }
const propreDe = s => norm(s.accroche) || norm(s.titrePropre?.accroche) || norm(s.titrePropre?.titre);

/* ----- Portraits (1 ou 2 personnalités) : portrait net dans un cadre rectangulaire, nom et parti à côté ----- */
async function personnes(s, max = 3){
  const pers = (s.illustration?.personnes || []).slice(0, max);
  const imgs = await Promise.all(pers.map(p=> p.photo ? storyPortrait(p.photo, p.photoHd) : null));
  const res = pers.map((p, i)=> ({ ...p, img:imgs[i] }));
  for(const p of res) if(!p.credit && /personnalites/.test(p.photo || "") && p.img) p.credit = (await storyPCredits([p.nom]).catch(()=>[]))[0] || "";
  return res;
}
function libelleParti(code){
  if(!code) return "";
  const p = (typeof PARTIES !== "undefined" && PARTIES.find(x=> x.id === code)) || null;
  const g = (typeof GROUPES_SENAT !== "undefined" && GROUPES_SENAT[code]) || null;
  return p?.nom || g?.nom || "";
}
// Une ligne de portraits à l'échelle k : renvoie un bloc { h, dessiner } ; null si un nom ne tient pas
function blocPortraits(ctx, pers, k){
  const n = pers.length, gap = 40, col = n === 1 ? LARG : (LARG - gap) / 2;
  const w = Math.round((n === 1 ? 232 : 168) * k), h = Math.round(w * 1.26), tx = w + (n === 1 ? 30 : 20), wt = col - tx;
  const cases = [];
  for(const p of pers){
    const nom = norm(p.nom), part = n === 1 ? libelleParti(p.parti) : (p.parti ? (libelleParti(p.parti) || p.parti) : "");
    const pb = part ? storyBlancBlocTexte(ctx, part.toUpperCase(), { taille:n === 1 ? 24 : 20, poids:800, largeur:wt, interligne:1.25, ls:2, couleur:BLANC.gris }) : null;
    const hNom = h - 8 - (pb ? pb.h + 22 : 0);
    const no = storyBlancOptions(ctx, nom, { tailles:storyBlancTailles(Math.round((n === 1 ? 56 : 38) * Math.max(k, 0.8)), 24), max:4, hMax:hNom, poids:800, police:BLANC.serif, largeur:wt, interligne:1.14, ls:-0.3, couleur:BLANC.encre })[0];
    if(!no || !(pb ? pb.ok : true)) return null;
    cases.push({ p, no, pb });
  }
  return { h:h + 2, dessiner(c, x, y){
    cases.forEach((cs, i) => {
      const x0 = x + i * (col + gap);
      storyBlancCarrePortrait(c, cs.p.img, cs.p.nom, x0, y, w, h);
      c.fillStyle = BLANC.encre; c.fillRect(x0, y + h, w, 4); // liseré net sous le portrait
      cs.no.dessiner(c, x0 + tx, y + 4);
      if(cs.pb) cs.pb.dessiner(c, x0 + tx, y + 4 + cs.no.h + 22);
    });
  } };
}

/* ----- Modèle A : « À la une » ----- */
async function dessineStyle(ctx, s, style){ // styles du test comparatif (une-photo, question, chiffre) : voir storyStyleDessiner dans js/stories.js
  await storyBlancPolices();
  const d = await storySpecSujet(s);
  if(!d || !storyStyleDessiner(ctx, style, d)) return null; // le texte s'ajuste (taille, lignes) pour tenir en entier ; sinon on retombe sur la mise en page « une »
  return { nom:`actualite-${slugDep(d.accroche).slice(0, 40)}` };
}
async function dessineUne(ctx, s, style){
  await storyBlancPolices();
  if(style && style !== "bleu" && !s.sensible){ const r = await dessineStyle(ctx, s, style); if(r) return r; } // sujet sensible ou sans titre à nous : toujours la mise en page « une »
  const a0 = s.articles[0];
  const medias = [...new Set(s.articles.map(a=> a.media))].filter(Boolean), n = medias.length;
  const propre = propreDe(s);
  const pers = (await personnes(s, 2)).slice(0, 2);
  const video = premiereVideo(s);
  const mediaTitre = norm(a0.media);
  if(!medias.length || !mediaTitre) return null; // un titre de presse sans média cité ne se publie pas

  // « À la une » seulement pour un sujet très repris ; sinon un libellé qui ne survend pas
  const libelle = s.sensible?.libelle || (n >= 4 ? "À la une" : n >= 2 ? "En ce moment" : "Dans la presse"); // sujet sensible : libellé prudent imposé (scripts/sujets-sensibles.cjs)
  const rubrique = s.sensible?.libelle ? libelle : `${libelle} · ${theme(s)[2]}`;
  const quand = s.sensible?.sansHeure ? "" : quandFr(a0.date);

  // image : portraits ; sans portrait, photo libre de l'institution du thème (jamais un pictogramme), avec son crédit en légende
  const ill = s.illustration || {};
  const photo = pers.length ? null : await storyPhotoTheme("vignette" in ill ? ill.vignette : ill.theme);
  const credits = [...new Set(pers.filter(p=> p.img && p.credit).map(p=> p.credit))];
  const sourceTxt = [s.sensible?.pied || storyBlancSources(medias), credits.length ? `Photos : ${credits.join(" ; ")}.` : ""].filter(Boolean).join(" "); // sujet sensible : mentions (sources, présomption d'innocence) fabriquées par règles
  const pied = storyBlancPiedPlan(ctx, sourceTxt, { video });
  const haut = STORY_HAUT_BLANC, bas = BLANC.bas - pied.h - 30;

  // blocs : titre (le nôtre ; à défaut le titre de presse cité), « L'essentiel », citation attribuée, image
  const essentielTxt = s.sensible ? "" : norm(s.essentiel || s.titrePropre?.essentiel);
  const titreTexte = propre || citation(titreCite(a0.titre));
  const tTitre = storyBlancOptions(ctx, titreTexte, { tailles:storyBlancTailles(propre ? (pers.length ? 104 : 116) : 100, 52, 4), max:6, poids:800, police:BLANC.serif, interligne:1.13, ls:t => -t * 0.004, couleur:BLANC.encre, avant:34, rang:t => t >= 88 ? 3 : 5 });
  if(!tTitre.length) return null;
  const peutCiter = propre && !s.sensible?.sansCitation;
  const essais = [];
  for(const avecImage of [true, false]) essais.push(() => {
    const items = [{ options:tTitre }];
    if(!propre) items.push(storyBlancLabel(ctx, `— ${mediaTitre}`, { taille:26, ls:2, avant:18 }));
    if(essentielTxt){
      items.push(storyBlancChapeau(ctx, essentielTxt, { largeur:LARG, avant:40, rang:[2, 6, null], tailles:storyBlancTailles(46, 34) }));
      if(peutCiter) items.push(storyBlancCitation(ctx, titreCite(a0.titre), mediaTitre, { tailles:[36, 32], rang:[1, 1], avant:40 }));
    } else if(peutCiter) items.push(storyBlancCitation(ctx, titreCite(a0.titre), mediaTitre, { tailles:storyBlancTailles(44, 30), rang:[2, null], avant:40 }));
    if(avecImage){
      if(pers.length){ const ps = [1.3, 1.15, 1, 0.9, 0.8].map(k => blocPortraits(ctx, pers, k)).filter(Boolean).map((b, i) => ({ ...b, avant:44, rang:i ? 0 : 0 })); if(ps.length) items.push({ options:[...ps, storyBlancVide(9)] }); }
      else if(photo) items.push(storyBlancPhotoOptions(ctx, { img:photo.img, legende:photo.credit, hauteurs:[400, 360, 320, 280, 240], avant:44, rang:0, rangVide:3 }));
    }
    return items;
  });
  const plan = storyBlancPremier(ctx, essais, { haut, bas, ecartMax:70 });
  if(!plan) return null; // le texte ne tient pas en entier : pas de story plutôt qu'une phrase coupée

  storyBlancFond(ctx);
  storyBlancTete(ctx, { rubrique, quand });
  plan.dessiner();
  storyBlancPiedDessiner(ctx, pied);
  return { nom:`actualite-${slugDep(propre || a0.titre).slice(0, 40)}` };
}

/* ----- Modèle E : « En direct » ----- */
async function dessineDirect(ctx, s){
  await storyBlancPolices();
  const propre = propreDe(s), rub = theme(s)[2];
  const titreTexte = propre || `${rub}, en direct`;
  const video = premiereVideo(s);
  const maj = s.derniere || s.articles.map(a=> a.date).sort().pop();
  const medias = [...new Set(s.articles.map(a=> a.media))].filter(Boolean);
  const pied = storyBlancPiedPlan(ctx, storyBlancSources(medias), { video });
  const haut = STORY_HAUT_BLANC, bas = BLANC.bas - pied.h - 30;

  // citations : un titre par groupe de titres identiques (médias réunis), les plus récents d'abord
  const groupes = [];
  for(const a of [...s.articles].sort((x, y)=> String(y.date).localeCompare(String(x.date)))){
    const cle = titreCite(a.titre).toLowerCase();
    const g = groupes.find(x=> x.cle === cle);
    if(g){ if(!g.medias.includes(a.media)) g.medias.push(a.media); } else groupes.push({ cle, titre:titreCite(a.titre), medias:[a.media], date:a.date });
  }
  const cites = groupes.slice(0, 3);
  const bloc = (c, tq) => {
    const q = storyBlancBlocTexte(ctx, citation(c.titre), { taille:tq, poids:700, largeur:LARG - 36, interligne:1.2, couleur:BLANC.encre });
    if(!q.ok || q.l.length > 5) return null;
    const meta = storyBlancBlocTexte(ctx, c.medias.join(" · "), { taille:24, poids:700, largeur:LARG - 36, interligne:1.2, couleur:BLANC.gris });
    const h = 46 + q.h + 14 + meta.h;
    return { h, avant:26, dessiner(cx, x, y){
      storyBlancFilet(cx, y - 13, { x });
      cx.fillStyle = BLANC.rouge; cx.fillRect(x, y + 6, 8, h - 8);
      cx.font = `800 24px "Public Sans"`; cx.letterSpacing = "2px"; cx.fillStyle = BLANC.rouge; cx.textAlign = "left"; cx.textBaseline = "alphabetic";
      cx.fillText(quandFr(c.date), x + 28, y + 24); cx.letterSpacing = "0px";
      q.dessiner(cx, x + 28, y + 46); meta.dessiner(cx, x + 28, y + 46 + q.h + 14);
    } };
  };
  const titre = { options:storyBlancOptions(ctx, titreTexte, { tailles:storyBlancTailles(112, 52, 4), max:6, poids:800, police:BLANC.serif, interligne:1.13, ls:t => -t * 0.004, couleur:BLANC.encre, avant:34, rang:t => t >= 96 ? 3 : 5 }) };
  if(!titre.options.length) return null;
  const essais = [];
  for(let nb = cites.length; nb >= 0; nb--) for(const tq of [40, 38, 36, 34, 32, 30, 28]) essais.push(() => {
    const bl = cites.slice(0, nb).map(c => bloc(c, tq));
    return bl.some(b => !b) ? null : [titre, ...bl];
  });
  // on garde la première mise en page qui conserve un gros titre (≥ 96 px) ; à défaut, la meilleure qui tient (jamais de titre coupé : sinon pas de story)
  const plan = storyBlancPremier(ctx, essais, { haut, bas, ecartMax:30 }, p => p.choix[0].taille >= 96);
  if(!plan) return null;
  storyBlancFond(ctx);
  storyBlancTete(ctx, { rubrique:"En direct", quand:`mis à jour ${heureFr(maj)}`, direct:true });
  plan.dessiner();
  storyBlancPiedDessiner(ctx, pied);
  return { nom:`actualite-${slugDep(norm(s.titrePropre?.titre) || s.articles[0].titre).slice(0, 40)}` };
}

/* ----- Point d'entrée et aiguillage ----- */
STORY_PLUS.actualite = async (ctx, info)=>{
  const [ind, force, style] = String(info ?? "").split(":"); // « indice:modèle:style » (style : bleu, une-photo, question ou chiffre)
  const s = ACTUALITES?.sujets?.[Number(ind)];
  if(!s?.articles?.length) return null;
  const nbPers = (s.illustration?.personnes || []).length;
  let modele = force || "";
  if(!["une", "direct", "facea", "chiffre", "date"].includes(modele)){
    modele = enDirectDe(s) ? "direct"
      : nbPers >= 2 && STORY_PLUS.facea ? "facea"
      : s.chiffre && STORY_PLUS.chiffre ? "chiffre"
      : s.date?.iso && s.date.iso > aujourdhuiISO() && STORY_PLUS.date ? "date" // une date À VENIR seulement
      : "une";
  }
  if(["facea", "chiffre", "date"].includes(modele) && STORY_PLUS[modele]){
    const r = await STORY_PLUS[modele](ctx, String(Number(ind)) + (style ? ":" + style : ""));
    if(r) return r;
  }
  return modele === "direct" ? dessineDirect(ctx, s) : dessineUne(ctx, s, modele === "facea" ? "bleu" : style); // « en direct » et « face à face » (portraits) gardent leur dessin
};
})();
