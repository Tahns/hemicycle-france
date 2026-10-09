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
function gras(ctx, txt, x, y, { poids = 700, taille = 30, fam = "Public Sans", couleur = "#fff", align = "left", ls = 0 } = {}){
  ctx.font = `${poids} ${taille}px "${fam}"`; ctx.fillStyle = couleur; ctx.textAlign = align; ctx.textBaseline = "alphabetic";
  ctx.letterSpacing = ls + "px"; ctx.fillText(txt, x, y); ctx.letterSpacing = "0px"; ctx.textAlign = "left";
}
function largeur(ctx, txt, poids, taille, fam = "Public Sans", ls = 0){
  ctx.font = `${poids} ${taille}px "${fam}"`; ctx.letterSpacing = ls + "px";
  const w = ctx.measureText(txt).width; ctx.letterSpacing = "0px"; return w;
}
// Pastille de contour blanc (comme les puces de la story « date à retenir »)
function puce(ctx, txt, x, y, taille = 28){
  const w = largeur(ctx, txt, 700, taille) + 40;
  ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.strokeRect(x + 1.5, y + 1.5, w - 3, 53);
  gras(ctx, txt, x + 20, y + 37, { taille });
  return x + w + 14;
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
  // le jour, géant
  const T = 350, ls = -T * 0.04;
  gras(ctx, jour, marge, y + T * 0.74, { poids: 900, taille: T, ls });
  let xDroit = marge + largeur(ctx, jour, 900, T, "Public Sans", ls);
  if(Number(s.jour) === 1){ gras(ctx, "er", xDroit + 6, y + T * 0.74 - T * 0.42, { poids: 900, taille: T * 0.26 }); xDroit += largeur(ctx, "er", 900, T * 0.26) + 10; }
  if(s.compte){
    ctx.font = '700 60px "Newsreader"';
    let tc = 64; while(tc > 34 && largeur(ctx, s.compte, 700, tc, "Newsreader") > L - marge - xDroit - 30) tc -= 2;
    gras(ctx, s.compte, L - marge, y + T * 0.74 - 14, { poids: 700, taille: tc, fam: "Newsreader", align: "right" });
    gras(ctx, "DANS", L - marge, y + T * 0.74 - tc - 22, { poids: 800, taille: 26, couleur: DA.rose, align: "right", ls: 4 });
  }
  y += T * 0.74 + 20;
  gras(ctx, mois, marge + 4, y + 70, { poids: 800, taille: 84, couleur: DA.rose, ls: 6 });
  y += 70 + 40;
  // titre rédigé par le site
  const tt = storyTailleFit(ctx, s.titre, y, y + 3 * 80, { tMax: 72, tMin: 46, police: "Newsreader", poids: 600, interligne: 1.06 });
  y = storyTexte(ctx, s.titre, marge, y, { taille: tt, poids: 600, police: "Newsreader", couleur: "#fff", max: 3, interligne: 1.06 });
  y += 14;
  // puces : jour de la semaine, année
  let x = marge;
  for(const t of [s.semaine, s.annee && String(s.annee)].filter(Boolean)) x = puce(ctx, t, x, y);
  y += 56 + 30;
  ctx.restore();
  // citation de presse, en carte crème, avec le nom du média
  if(s.citation){
    const ct = 34, hc = Math.min(bas - y, 2 * 28 + storyHauteur(ctx, `« ${s.citation} »`, { taille: ct, poids: 600, police: "Newsreader", largeur: LARG - 64, max: 4, interligne: 1.2 }) + 44);
    if(hc > 120){
      storyCarte(ctx, marge, y, LARG, hc);
      storyTexte(ctx, `« ${s.citation} »`, marge + 32, y + 22, { taille: ct, poids: 600, police: "Newsreader", couleur: STORY.encre, largeur: LARG - 64, max: 4, interligne: 1.2 });
      gras(ctx, s.media ? `— ${s.media}` : "", marge + 32, y + hc - 22, { taille: 24, couleur: STORY.pale });
    }
  }
  pied(ctx, s.agenda ? "Date relevée auprès de la source. Le programme peut changer." : "Date annoncée par la presse. L'ordre du jour peut changer.", "Ne rien rater");
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
  if(s.etape){ gras(ctx, s.etape.charAt(0).toUpperCase() + s.etape.slice(1), marge, y + 30, { poids: 600, taille: 28, couleur: DA.ciel }); y += 44; }
  y += 18;
  // voix : trois cases (pas de couleur partisane, pas de « camp »)
  y += 20; const hc = Math.max(170, Math.min(260, bas - y - 60));
  const cases = [["Pour", s.pour], ["Contre", s.contre], ["Abstentions", s.abst]];
  const gap = 18, w = (LARG - 2 * gap) / 3;
  cases.forEach(([nom, n], i) => {
    const x = marge + i * (w + gap);
    storyCarte(ctx, x, y, w, hc);
    const cv = storyVoixCouleur(["pour", "contre", "abst"][i], "creme"); // « Pour » vert, « Contre » rouge, « Abstentions » orange ; le libellé reste écrit
    gras(ctx, fr(n ?? 0), x + w / 2, y + hc * 0.58, { poids: 900, taille: 92, couleur: cv, align: "center", ls: -2 });
    gras(ctx, nom.toUpperCase(), x + w / 2, y + hc * 0.58 + 44, { poids: 800, taille: 24, couleur: STORY.pale, align: "center", ls: 3 });
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
  if(s.citation){
    const ct = 36, hc = Math.min(bas - y, 2 * 28 + storyHauteur(ctx, `« ${s.citation} »`, { taille: ct, poids: 600, police: "Newsreader", largeur: LARG - 64, max: 6, interligne: 1.2 }) + 44);
    if(hc > 120){
      storyCarte(ctx, marge, y, LARG, hc);
      storyTexte(ctx, `« ${s.citation} »`, marge + 32, y + 22, { taille: ct, poids: 600, police: "Newsreader", couleur: STORY.encre, largeur: LARG - 64, max: 6, interligne: 1.2 });
      gras(ctx, s.media ? `— ${s.media}` : "", marge + 32, y + hc - 22, { taille: 24, couleur: STORY.pale });
    }
  }
  pied(ctx, s.sourceTxt || "Titre cité de la presse. Faits non établis par la justice.", "Toute l'actu politique");
}

// Pied du post : source (bleu clair) puis « accroche → @compte », remontés d'autant que le cadre
function pied(ctx, source, accroche){
  storyTexte(ctx, source, marge, H_POST - 128, { taille: 23, couleur: STORY.ciel, max: 2, interligne: 1.2 });
  storyAccroche(ctx, accroche, H_POST - 40);
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
    if(img){
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
