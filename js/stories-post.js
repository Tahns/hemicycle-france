/* Module chargé à la demande (publications Instagram automatiques) : voir chargerModule() dans index.html.
   Deux types, dessinés d'après une fiche (objet « spec ») préparée par scripts/stories-auto.cjs :
   - « post » : image de fil 1080 × 1350 (4:5), soit une « date à retenir » lointaine (spec.genre = "date"),
     soit le résultat officiel d'un vote final sur une loi (spec.genre = "loi"),
     soit un titre de presse cité et attribué, validé par un humain (spec.genre = "presse", demande directe : scripts/story-a-la-demande.cjs) ;
   - « annonce-post » : story 1080 × 1920 qui annonce un post (« Nouveau post », titre court, miniature du post, pied de source).
   Direction artistique « base blanche » (js/stories-blanc.js : BLANC, storyBlanc*) : fond blanc, bandeau de tête, filet noir épais, rubrique rouge, titres serif,
   filets gris, pied de source ; tout est vectoriel, le texte n'est JAMAIS coupé (la taille diminue, la mise en page s'allonge).
   Rien n'est ajouté à l'espace global : tout est dans STORY_PLUS. Aucun avis, aucun qualificatif : les faits et la source. */
(() => {
const { L } = STORY, M = BLANC.marge, LARG = L - 2 * M;
const H_POST = 1350;
const fr = n => String(n ?? 0).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

async function polices(){
  await Promise.all(['800 30px "Public Sans"', '700 30px "Public Sans"', '600 30px "Public Sans"', '500 30px "Public Sans"', '400 30px "Public Sans"', '600 60px Newsreader', '400 60px Newsreader']
    .map(f => document.fonts.load(f).catch(() => {})));
}
// Cadre d'un post 4:5 : bandeau de tête en haut (aucune zone masquée sur le fil), pied ancré en bas ; renvoie { y: début du contenu, bas: limite basse du contenu }
function cadrePost(ctx, rubrique, date, source){
  const y = storyBlancCadre(ctx, rubrique, { date, haut: 56 });
  const bas = storyBlancPiedBas(ctx, source, { bas: H_POST - 30, taille: 22 }) - 26;
  return { y, bas };
}
// Citation de presse (nom du média dessous), toujours ENTIÈRE : la taille diminue pour qu'elle tienne avant `bas`
function blocCitation(ctx, s, y, bas, taille){
  const txt = `« ${String(s.citation).trim()} »`, media = s.media ? `— ${s.media}` : "";
  const o = t => ({ taille: t, poids: 600, police: "Newsreader", largeur: LARG - 72, interligne: 1.2 });
  const hM = media ? 56 : 0, pad = 30;
  let t = taille; while(t > 24 && 2 * pad + storyBlancHauteur(ctx, txt, o(t)) + hM > bas - y) t -= 2;
  const h = 2 * pad + storyBlancHauteur(ctx, txt, o(t)) + hM;
  ctx.fillStyle = BLANC.fondDoux; ctx.fillRect(M, y, LARG, h);
  ctx.fillStyle = BLANC.rouge; ctx.fillRect(M, y, 8, h);
  const yt = storyBlancTexte(ctx, txt, M + 44, y + pad, o(t));
  if(media) storyBlancLigne(ctx, media.toUpperCase(), M + 44, yt + 6, { taille: 24, poids: 800, couleur: BLANC.gris, largeur: LARG - 88, ls: 2, min: 16 });
  return y + h;
}

/* ---------- Post « date à retenir » ---------- */
async function postDate(ctx, s){
  const { y: y0, bas } = cadrePost(ctx, "Date à retenir", s.annee ? String(s.annee) : "", s.sourceTxt || "");
  let y = y0 + 6;
  // Sans citation de presse (date d'agenda), le bloc est descendu pour ne pas laisser la moitié basse vide
  const decal = s.citation ? 0 : Math.max(0, Math.round((bas - y - 760) * 0.45));
  ctx.save(); ctx.translate(0, decal);
  const jour = String(s.jour), mois = String(s.mois).toUpperCase();
  // le jour, géant (réduit si besoin : il ne touche jamais le compte à rebours ni le bord)
  const er = Number(s.jour) === 1, reserve = s.compte ? 280 : 0;
  const mesure = (txt, poids, t, fam = "Public Sans", ls = 0) => { ctx.font = `${poids} ${t}px "${fam}"`; ctx.letterSpacing = ls + "px"; const w = ctx.measureText(txt).width; ctx.letterSpacing = "0px"; return w; };
  const erL = t => er ? mesure("er", 600, t * 0.26, "Newsreader") + 16 : 0;
  let T = 340;
  while(T > 120 && mesure(jour, 600, T, "Newsreader", -T * 0.03) + erL(T) > LARG - reserve) T -= 10;
  const ls = -T * 0.03;
  ctx.font = `600 ${T}px "Newsreader"`; ctx.letterSpacing = ls + "px"; ctx.fillStyle = BLANC.encre; ctx.textBaseline = "alphabetic";
  ctx.fillText(jour, M - 4, y + T * 0.76); ctx.letterSpacing = "0px";
  let xDroit = M + mesure(jour, 600, T, "Newsreader", ls);
  if(er){ ctx.font = `600 ${T * 0.26}px "Newsreader"`; ctx.fillText("er", xDroit + 6, y + T * 0.76 - T * 0.4); xDroit += mesure("er", 600, T * 0.26, "Newsreader") + 10; }
  if(s.compte){
    const dispo = Math.max(60, L - M - xDroit - 30);
    let tc = 60; while(tc > 30 && mesure(s.compte, 600, tc, "Newsreader") > dispo) tc -= 2;
    ctx.font = `600 ${tc}px "Newsreader"`; ctx.fillStyle = BLANC.rouge; ctx.textAlign = "right"; ctx.fillText(s.compte, L - M, y + T * 0.76 - 10); ctx.textAlign = "left";
    storyBlancCaps(ctx, "Dans", L - M, y + T * 0.76 - tc - 40, { taille: 26, couleur: BLANC.gris, align: "right", ls: 4 });
  }
  y += T * 0.76 + 26;
  storyBlancFilet(ctx, y, { epais: 3, couleur: BLANC.encre }); y += 18;
  ctx.font = `800 80px "Public Sans"`; ctx.letterSpacing = "6px"; let tm = 80;
  while(tm > 40 && mesure(mois, 800, tm, "Public Sans", 6) > LARG) tm -= 4;
  ctx.font = `800 ${tm}px "Public Sans"`; ctx.fillStyle = BLANC.rouge; ctx.fillText(mois, M + 2, y + tm * 0.82); ctx.letterSpacing = "0px";
  y += tm + 30;
  // titre rédigé par le site
  y = storyBlancTitre(ctx, s.titre, M, y, y + 3 * 80, { tMax: 66, tMin: 40 }).y + 10;
  // jour de la semaine
  if(s.semaine) storyBlancEtiquette(ctx, s.semaine, M, y, { taille: 24, couleur: BLANC.encre });
  y += 24 * 1.9 + 34;
  ctx.restore();
  // citation de presse, avec le nom du média
  if(s.citation) blocCitation(ctx, s, y + decal, bas, 34);
}

/* ---------- Post « loi adoptée / rejetée » ---------- */
async function postLoi(ctx, s){
  const { y: y0, bas } = cadrePost(ctx, `${s.chambre} · ${s.date}`, "", s.sourceTxt || `Source : ${s.chambre}.`);
  let y = y0;
  storyBlancCaps(ctx, "Vote sur l'ensemble du texte", M, y, { taille: 24, couleur: BLANC.gris });
  y += 48;
  // résultat officiel, en grand : pastille ✓ / ✕ et mot
  const adopte = s.verdict === "adopte", tv = 104;
  storyBlancVerdict(ctx, adopte, M, y, tv);
  ctx.font = `800 ${tv * 0.92}px "Public Sans"`; ctx.letterSpacing = "-2px"; ctx.fillStyle = BLANC.encre; ctx.textBaseline = "alphabetic";
  ctx.fillText(adopte ? "ADOPTÉ" : "REJETÉ", M + tv + 28, y + tv * 0.8); ctx.letterSpacing = "0px";
  y += tv + 28;
  storyBlancFilet(ctx, y, { epais: 3, couleur: BLANC.encre }); y += 24;
  const hVoix = 232 + 30, etape = s.etape ? s.etape.charAt(0).toUpperCase() + s.etape.slice(1) : "";
  const hEtape = etape ? storyBlancHauteur(ctx, etape, { taille: 28, poids: 600 }) + 8 : 0;
  // texte voté : le plus grand corps qui tienne au-dessus du bloc des voix
  y = storyBlancTitre(ctx, s.titre, M, y, bas - hVoix - hEtape - 24, { tMax: 60, tMin: 34 }).y;
  if(etape) y = storyBlancTexte(ctx, etape, M, y + 2, { taille: 28, poids: 600, couleur: BLANC.gris });
  // voix : barre empilée et trois colonnes (pas de couleur partisane, pas de « camp »)
  const yV = Math.max(y + 26, bas - hVoix);
  const total = (s.pour || 0) + (s.contre || 0) + (s.abst || 0) || 1;
  storyBlancBarreEmpilee(ctx, M, yV, LARG, 22, [[s.pour || 0, BLANC_VOIX.pour], [s.contre || 0, BLANC_VOIX.contre], [s.abst || 0, BLANC_VOIX.abst]], total);
  storyBlancVoix(ctx, yV + 42, [["Pour", s.pour, "pour"], ["Contre", s.contre, "contre"], ["Abstentions", s.abst, "abst"]], { hauteur: 190, taille: 100 });
}

/* ---------- Post « selon la presse » (sujet sensible, demande directe validée par un humain) ---------- */
async function postPresse(ctx, s){
  const { y: y0, bas } = cadrePost(ctx, s.surtitre || "Selon la presse", "", s.sourceTxt || "Titre cité de la presse. Faits non établis par la justice.");
  let y = y0 + 4;
  // titre à nous, attribué au média (« Selon … : … »)
  const r = storyBlancTitre(ctx, s.titre, M, y, y + 4 * 84, { tMax: 80, tMin: 42 });
  y = r.y + 30;
  // titre du média, cité entre guillemets, avec son nom
  if(s.citation) blocCitation(ctx, s, y, bas, 46);
}

STORY_PLUS.post = async (ctx, s) => {
  if(!s || !["date", "loi", "presse"].includes(s.genre) || !s.titre) return null;
  await polices();
  if(s.genre === "date") await postDate(ctx, s); else if(s.genre === "presse") await postPresse(ctx, s); else await postLoi(ctx, s);
  return { nom: s.genre === "date" ? `post-date-${s.iso || "x"}` : s.genre === "presse" ? "post-presse" : `post-loi-${s.numero || "x"}` };
};

/* ---------- Story d'annonce d'un post ---------- */
STORY_PLUS["annonce-post"] = async (ctx, s) => {
  if(!s || !s.titre) return null;
  await polices();
  let y = storyBlancCadre(ctx, "Nouveau post");
  const bas = storyBlancPiedBas(ctx, "Le post vient d'être publié sur le fil du compte.", { bas: BLANC.bas - 10 }) - 28;
  y = storyBlancTitre(ctx, s.titre, M, y, y + 3 * 90, { tMax: 78, tMin: 46 }).y + 4;
  if(s.sous) y = storyBlancTexte(ctx, s.sous, M, y + 6, { taille: 32, poids: 600, couleur: BLANC.gris });
  y += 24;
  // miniature du post (même image que celle du fil), bordée d'un filet gris
  if(s.miniature){
    const img = await storyImage(s.miniature);
    if(img && bas - y >= 160){
      let h = bas - y - 6, w = h * 4 / 5;
      if(w > 640){ w = 640; h = w * 5 / 4; }
      const x = (L - w) / 2;
      ctx.fillStyle = BLANC.filet; ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
      ctx.drawImage(img, x, y, w, h);
    }
  }
  return { nom: `annonce-${(s.id || "post")}` };
};
})();
