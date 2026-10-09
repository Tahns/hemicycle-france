/* Module chargé à la demande (publications Instagram automatiques) : voir chargerModule() dans index.html.
   Deux types, dessinés d'après une fiche (objet « spec ») préparée par scripts/stories-auto.cjs :
   - « post » : image de fil 1080 × 1350 (4:5), soit une « date à retenir » lointaine (spec.genre = "date"),
     soit le résultat officiel d'un vote final sur une loi (spec.genre = "loi"),
     soit un titre de presse cité et attribué, validé par un humain (spec.genre = "presse", demande directe : scripts/story-a-la-demande.cjs) ;
   - « annonce-post » : story 1080 × 1920 qui annonce un post (« Nouveau post », titre court, miniature du post, « → @hemicyclefrance »).
   Même direction artistique que les stories (STORY_DA, storyMarque / storyCadre / storyPied de js/stories.js).
   Rien n'est ajouté à l'espace global : tout est dans STORY_PLUS. Aucun avis, aucun qualificatif : les faits et la source. */
(() => {
const DA = STORY_DA, { L, marge } = STORY, LARG = L - 2 * marge;
const H_POST = 1350;
const DECALAGE = 230; // le cadre des stories place le logo à 292 px (zone masquée par Instagram) : sur un post, on le remonte
const fr = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

// Cadre commun des stories (fond, logo, étiquette) décalé vers le haut pour le format 4:5 ; renvoie l'ordonnée où commence le contenu
function cadrePost(ctx, surtitre, opts){
  storyFondTheme(ctx); // fond généré à la taille du post (1080 × 1350), puis cadre décalé sans refaire le fond
  ctx.save(); ctx.translate(0, -DECALAGE);
  const y = storyCadre(ctx, surtitre, { ...opts, sansFond: true }) - DECALAGE;
  ctx.restore();
  return y;
}
async function polices(){
  await Promise.all(['900 100px "Public Sans"', '800 30px "Public Sans"', '700 30px "Public Sans"', '600 30px "Public Sans"', '400 30px "Public Sans"', '700 60px Newsreader', '600 60px Newsreader']
    .map(f => document.fonts.load(f).catch(() => {})));
}
// Ligne unique qui ne dépasse jamais `larg` : taille réduite jusqu'à `min`, puis texte coupé avec « … » ; renvoie { txt, taille }
function ajuster(ctx, txt, poids, taille, larg, fam = "Public Sans", ls = 0, min = 16){
  txt = String(txt == null ? "" : txt);
  if(!(larg > 0)) return { txt, taille };
  while(taille > min && largeur(ctx, txt, poids, taille, fam, ls) > larg) taille -= 2;
  if(largeur(ctx, txt, poids, taille, fam, ls) > larg){
    while(txt.length > 1 && largeur(ctx, txt + "…", poids, taille, fam, ls) > larg) txt = txt.slice(0, -1).trimEnd();
    txt += "…";
  }
  return { txt, taille };
}
// `larg` : largeur maximale (le texte rétrécit, puis est coupé, plutôt que de sortir du cadre ou de toucher un voisin)
function gras(ctx, txt, x, y, { poids = 700, taille = 30, fam = "Public Sans", couleur = "#fff", align = "left", ls = 0, larg = 0, min = 16 } = {}){
  const a = ajuster(ctx, txt, poids, taille, larg, fam, ls, min);
  ctx.font = `${poids} ${a.taille}px "${fam}"`; ctx.fillStyle = couleur; ctx.textAlign = align; ctx.textBaseline = "alphabetic";
  ctx.letterSpacing = ls + "px"; ctx.fillText(a.txt, x, y); ctx.letterSpacing = "0px"; ctx.textAlign = "left";
}
function largeur(ctx, txt, poids, taille, fam = "Public Sans", ls = 0){
  ctx.font = `${poids} ${taille}px "${fam}"`; ctx.letterSpacing = ls + "px";
  const w = ctx.measureText(txt).width; ctx.letterSpacing = "0px"; return w;
}
// Pastille de contour blanc (comme les puces de la story « date à retenir ») ; `maxW` : largeur disponible (le texte rétrécit, puis est coupé)
function puce(ctx, txt, x, y, maxW = LARG, taille = 28){
  const a = ajuster(ctx, txt, 700, taille, Math.max(40, maxW - 40), "Public Sans", 0, 18);
  const w = largeur(ctx, a.txt, 700, a.taille) + 40;
  ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.strokeRect(x + 1.5, y + 1.5, w - 3, 53);
  gras(ctx, a.txt, x + 20, y + 37, { taille: a.taille });
  return x + w + 14;
}
// Carte crème « citation » (nom du média dessous) : le nombre de lignes est réduit pour que la carte tienne avant `bas` (rien n'est dessiné hors de la carte)
function carteCitation(ctx, s, y, bas, taille, maxL){
  const txt = `« ${s.citation} »`, o = { taille, poids: 600, police: "Newsreader", largeur: LARG - 64, interligne: 1.2 };
  let n = maxL;
  while(n > 1 && 100 + storyHauteur(ctx, txt, { ...o, max: n }) > bas - y) n--;
  const hc = 100 + storyHauteur(ctx, txt, { ...o, max: n });
  if(hc > bas - y) return;
  storyCarte(ctx, marge, y, LARG, hc);
  storyTexte(ctx, txt, marge + 32, y + 22, { ...o, max: n, couleur: STORY.encre });
  gras(ctx, s.media ? `— ${s.media}` : "", marge + 32, y + hc - 22, { taille: 24, couleur: STORY.pale, larg: LARG - 64 });
}

/* ---------- Post « date à retenir » ---------- */
async function postDate(ctx, s){
  const bas = H_POST - 150; // limite basse du contenu (le pied commence après)
  let y = cadrePost(ctx, "Date à retenir", { etiquette: "rouge" }); // 190
  y += 6;
  // Sans citation de presse (date d'agenda), le bloc est descendu pour ne pas laisser la moitié basse vide
  const decal = s.citation ? 0 : Math.max(0, Math.round((bas - y - 760) * 0.45));
  ctx.save(); ctx.translate(0, decal);
  const jour = String(s.jour), mois = String(s.mois).toUpperCase();
  // le jour, géant (réduit si besoin : il ne touche jamais le compte à rebours ni le bord)
  const er = Number(s.jour) === 1, reserve = s.compte ? 260 : 0;
  const erL = t => er ? largeur(ctx, "er", 900, t * 0.26) + 16 : 0;
  let T = 350;
  while(T > 120 && largeur(ctx, jour, 900, T, "Public Sans", -T * 0.04) + erL(T) > LARG - reserve) T -= 10;
  const aj = ajuster(ctx, jour, 900, T, LARG - reserve - erL(T), "Public Sans", -T * 0.04, 40);
  T = aj.taille; const ls = -T * 0.04;
  gras(ctx, aj.txt, marge, y + T * 0.74, { poids: 900, taille: T, ls });
  let xDroit = marge + largeur(ctx, aj.txt, 900, T, "Public Sans", ls);
  if(er){ gras(ctx, "er", xDroit + 6, y + T * 0.74 - T * 0.42, { poids: 900, taille: T * 0.26 }); xDroit += largeur(ctx, "er", 900, T * 0.26) + 10; }
  if(s.compte){
    const dispo = Math.max(60, L - marge - xDroit - 30);
    const ac = ajuster(ctx, s.compte, 700, 64, dispo, "Newsreader", 0, 34), tc = ac.taille;
    gras(ctx, ac.txt, L - marge, y + T * 0.74 - 14, { poids: 700, taille: tc, fam: "Newsreader", align: "right" });
    gras(ctx, "DANS", L - marge, y + T * 0.74 - tc - 22, { poids: 800, taille: 26, couleur: DA.rose, align: "right", ls: 4 });
  }
  y += T * 0.74 + 20;
  gras(ctx, mois, marge + 4, y + 70, { poids: 800, taille: 84, couleur: DA.rose, ls: 6, larg: LARG - 4, min: 40 });
  y += 70 + 40;
  // titre rédigé par le site
  const tt = storyTailleFit(ctx, s.titre, y, y + 3 * 80, { tMax: 72, tMin: 46, police: "Newsreader", poids: 600, interligne: 1.06 });
  y = storyTexte(ctx, s.titre, marge, y, { taille: tt, poids: 600, police: "Newsreader", couleur: "#fff", max: 3, interligne: 1.06 });
  y += 14;
  // puces : jour de la semaine, année
  let x = marge;
  for(const t of [s.semaine, s.annee && String(s.annee)].filter(Boolean)){ if(L - marge - x < 120) break; x = puce(ctx, t, x, y, L - marge - x); }
  y += 56 + 30;
  ctx.restore();
  // citation de presse, en carte crème, avec le nom du média
  if(s.citation) carteCitation(ctx, s, y, bas, 34, 4);
  pied(ctx, "", "Ne rien rater");
}

/* ---------- Post « loi adoptée / rejetée » ---------- */
async function postLoi(ctx, s){
  const bas = H_POST - 150;
  let y = cadrePost(ctx, `${s.chambre} · ${s.date}`, { etiquette: "blanc" }); // 190
  gras(ctx, "VOTE SUR L'ENSEMBLE DU TEXTE", marge, y + 30, { poids: 700, taille: 28, couleur: DA.ciel, ls: 4 });
  y += 60;
  // résultat officiel, en grand
  const verdict = s.verdict === "adopte" ? "Adopté" : "Rejeté";
  const tv = 150;
  storyVerdict(ctx, s.verdict, verdict, marge, y + tv * 0.82, tv);
  y += tv * 0.82 + 34;
  // texte voté
  const tt = storyTailleFit(ctx, s.titre, y, y + 4 * 70, { tMax: 62, tMin: 40, police: "Newsreader", poids: 600, interligne: 1.08 });
  y = storyTexte(ctx, s.titre, marge, y, { taille: tt, poids: 600, police: "Newsreader", couleur: "#fff", max: 4, interligne: 1.08 });
  if(s.etape){ y = storyTexte(ctx, s.etape.charAt(0).toUpperCase() + s.etape.slice(1), marge, y + 2, { taille: 28, poids: 600, couleur: DA.ciel, max: 2, interligne: 1.2 }) + 2; }
  y += 18;
  // voix : trois cases (pas de couleur partisane, pas de « camp »)
  y += 20; const hc = Math.max(170, Math.min(260, bas - y - 60));
  const cases = [["Pour", s.pour], ["Contre", s.contre], ["Abstentions", s.abst]];
  const gap = 18, w = (LARG - 2 * gap) / 3;
  let tn = 92; // même taille pour les trois nombres, réduite pour qu'aucun ne déborde de sa case
  for(const [, n] of cases) while(tn > 30 && largeur(ctx, fr(n ?? 0), 900, tn, "Public Sans", -2) > w - 28) tn -= 2;
  cases.forEach(([nom, n], i) => {
    const x = marge + i * (w + gap);
    storyCarte(ctx, x, y, w, hc);
    const cv = storyVoixCouleur(["pour", "contre", "abst"][i], "creme"); // « Pour » vert, « Contre » rouge, « Abstentions » orange ; le libellé reste écrit
    gras(ctx, fr(n ?? 0), x + w / 2, y + hc * 0.58, { poids: 900, taille: tn, couleur: cv, align: "center", ls: -2, larg: w - 28, min: 20 });
    gras(ctx, nom.toUpperCase(), x + w / 2, y + hc * 0.58 + 44, { poids: 800, taille: 24, couleur: STORY.pale, align: "center", ls: 3, larg: w - 20, min: 14 });
  });
  pied(ctx, s.sourceTxt || `Source : ${s.chambre}.`, "Toute l'actu politique");
}

/* ---------- Post « selon la presse » (sujet sensible, demande directe validée par un humain) ---------- */
async function postPresse(ctx, s){
  const bas = H_POST - 150;
  let y = cadrePost(ctx, s.surtitre || "Selon la presse", { etiquette: "rouge" }); // 190
  y += 6;
  // titre à nous, attribué au média (« Selon … : … »)
  const tt = storyTailleFit(ctx, s.titre, y, y + 4 * 84, { tMax: 76, tMin: 44, police: "Newsreader", poids: 600, interligne: 1.06 });
  y = storyTexte(ctx, s.titre, marge, y, { taille: tt, poids: 600, police: "Newsreader", couleur: "#fff", max: 4, interligne: 1.06 });
  y += 34;
  // titre du média, cité entre guillemets, avec son nom
  if(s.citation) carteCitation(ctx, s, y, bas, 36, 6);
  pied(ctx, s.sourceTxt || "Titre cité de la presse. Faits non établis par la justice.", "Toute l'actu politique");
}

// Pied du post : source (bleu clair) puis « accroche → @compte », remontés d'autant que le cadre
function pied(ctx, source, accroche){
  storyTexte(ctx, source, marge, H_POST - 128, { taille: 23, couleur: STORY.ciel, max: 2, interligne: 1.2 });
  accrocheFit(ctx, accroche, H_POST - 40);
}
// « accroche → @compte » : l'accroche est coupée (« … ») si, même à la plus petite taille, la ligne dépasserait la largeur utile
function accrocheFit(ctx, accroche, y){
  const compte = typeof COMPTE_STORY === "string" ? COMPTE_STORY : "@hemicyclefrance";
  const f = t => { ctx.font = '700 24px "Public Sans"'; return ctx.measureText(`${t} → ${compte}`).width; };
  let a = String(accroche || "");
  if(f(a) > LARG){ while(a.length > 1 && f(a + "…") > LARG) a = a.slice(0, -1).trimEnd(); a += "…"; }
  storyAccroche(ctx, a, y);
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
  let y = storyCadre(ctx, "Nouveau post", { etiquette: "rouge" });
  const tt = storyTailleFit(ctx, s.titre, y, y + 3 * 84, { tMax: 78, tMin: 48, police: "Newsreader", poids: 600, interligne: 1.06 });
  y = storyTexte(ctx, s.titre, marge, y, { taille: tt, poids: 600, police: "Newsreader", couleur: "#fff", max: 3, interligne: 1.06 });
  if(s.sous){ y = storyTexte(ctx, s.sous, marge, y + 6, { taille: 32, poids: 700, couleur: DA.ciel, max: 2 }); }
  y += 24;
  // miniature du post (même image que celle du fil), bord blanc
  if(s.miniature){
    const img = await storyImage(s.miniature);
    const bas = 1490;
    if(img && bas - y >= 160){
      let h = bas - y, w = h * 4 / 5;
      if(w > 640){ w = 640; h = w * 5 / 4; }
      const x = (L - w) / 2;
      ctx.fillStyle = "#fff"; ctx.fillRect(x - 8, y - 8, w + 16, h + 16);
      ctx.drawImage(img, x, y, w, h);
    }
  }
  storyPied(ctx, "Le post vient d'être publié sur le fil du compte.", { accroche: "À voir sur le fil" });
  return { nom: `annonce-${(s.id || "post")}` };
};
})();
