/* Module chargé à la demande (dessin des stories et des posts) : voir chargerModule() dans index.html.
   Modèle « vote par groupe » : STORY_PLUS["vote-groupes"], story 1080 × 1920 ou post 1080 × 1350 (fiche.format = "story" | "post").
   « Qui a voté quoi » lisible d'un coup d'œil : un hémicycle en demi-cercle dessiné dans le canvas, un secteur par groupe, dans l'ordre des bancs
   du site (celui de l'hémicycle de la page d'accueil, de gauche à droite). La LARGEUR de chaque secteur est proportionnelle à l'effectif du groupe.
   Chaque secteur est teinté selon la position MAJORITAIRE des membres du groupe sur ce scrutin (mêmes teintes assourdies que les verdicts :
   pour = vert, contre = rouge, abstention = orange, partagé = gris rayé) ET porte un repère qui ne dépend pas de la couleur (✓ ✕ ○ ou hachures).
   TOUS les groupes sont traités de la même façon : même pastille (sigle), même taille, même ordre de lecture ; aucun n'est mis en avant.
   Les logos ne sont PAS repris (formes et proportions trop différentes d'un groupe à l'autre : un traitement identique serait illisible) ;
   une légende en bas donne, dans l'ordre, le nom court de chaque groupe. Aucune image externe.

   Fiche attendue :
     { format:"story"|"post", titre:"…en langage simple…", date:"8 octobre 2026", chambre?:"Assemblée nationale", numero?:8621,
       verdict:"adopte"|"rejete", pour:Number, contre:Number, abst:Number,
       votes:{ RN:[pour, contre, abst, membres] ou { pour, contre, abst, membres }, … },   (data/lois.json, champ « votes »)
       censure?:true (motion de censure : la position d'un groupe est « pour » s'il a voté la motion à lui seul, sinon « contre », comme sur le site),
       auteur?:"Prénom Nom (RN)"   (affiché sous « Qui a proposé ce texte ? » SEULEMENT s'il est fourni : à ne passer que pour un texte déposé, jamais pour un amendement),
       ordre?:[ids] (ordre des groupes, facultatif), sourceTxt?:"…" }
   Aucun avis, aucun qualificatif : les faits et la source. */
(() => {
const DA = STORY_DA, { L, marge } = STORY, LARG = L - 2 * marge;
const DECALAGE = 230, H_POST = 1350;
const ORDRE = ["LFI", "GDR", "ECO", "SOC", "LIOT", "EPR", "DEM", "HOR", "LR", "UDR", "RN", "NI"];
const NOMS = { LFI:"La France insoumise", GDR:"Gauche démocrate et républicaine", ECO:"Écologiste et Social", SOC:"Socialistes et apparentés",
  LIOT:"Libertés, Indépendants, Outre-mer et Territoires", EPR:"Ensemble pour la République", DEM:"Les Démocrates", HOR:"Horizons et Indépendants",
  LR:"Droite Républicaine", UDR:"Union des droites pour la République", RN:"Rassemblement National", NI:"Non-inscrits" };
const MOTS = { pour:"POUR", contre:"CONTRE", abst:"ABSTENTION", partage:"PARTAGÉ" };
const ENCRE = "#10183A";
const GRIS = "#C9CCD6", GRIS_TXT = "#4A4D57"; // « partagé » : gris neutre (jamais une couleur de parti)
const fr = n => String(n ?? 0).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

async function polices(){
  await Promise.all(['900 100px "Public Sans"', '800 30px "Public Sans"', '700 30px "Public Sans"', '600 30px "Public Sans"', '400 30px "Public Sans"', '600 60px Newsreader']
    .map(f => document.fonts.load(f).catch(() => {})));
}
function ecrire(ctx, txt, x, y, { poids = 700, taille = 30, fam = "Public Sans", couleur = "#fff", align = "left", ls = 0 } = {}){
  ctx.font = `${poids} ${taille}px "${fam}"`; ctx.fillStyle = couleur; ctx.textAlign = align; ctx.textBaseline = "alphabetic";
  ctx.letterSpacing = ls + "px"; ctx.fillText(txt, x, y); ctx.letterSpacing = "0px"; ctx.textAlign = "left";
}
function mesure(ctx, txt, poids, taille, fam = "Public Sans", ls = 0){
  ctx.font = `${poids} ${taille}px "${fam}"`; ctx.letterSpacing = ls + "px";
  const w = ctx.measureText(txt).width; ctx.letterSpacing = "0px"; return w;
}

// Position majoritaire d'un groupe : « pour », « contre », « abst », « partage » (aucune position à plus de la moitié des voix exprimées) ou null (aucune voix)
function position(v, censure){
  const exprimes = v.pour + v.contre + v.abst;
  if(censure){ if(!v.membres) return null; return v.pour * 2 > v.membres ? "pour" : "contre"; }
  if(!exprimes) return null;
  const tri = [["pour", v.pour], ["contre", v.contre], ["abst", v.abst]].sort((a, b) => b[1] - a[1]);
  return tri[0][1] * 2 > exprimes ? tri[0][0] : "partage";
}
// Couleur d'une position sur le fond bleu (teinte « clair » des verdicts) et sur la pastille crème
function teinte(pos){ return pos === "partage" || !pos ? GRIS : STORY_VOIX.clair[pos]; }
function teinteTexte(pos){ return pos === "partage" || !pos ? GRIS_TXT : STORY_VOIX.creme[pos]; }

// Repères vectoriels (indépendants de la police) : ✓ ✕ ○ et carré hachuré, centrés en (cx, cy), côté t
function repere(ctx, pos, cx, cy, t, couleur){
  ctx.save(); ctx.strokeStyle = couleur; ctx.fillStyle = couleur; ctx.lineWidth = Math.max(4, t * 0.17); ctx.lineCap = "round"; ctx.lineJoin = "round";
  const h = t / 2;
  if(pos === "pour"){ ctx.beginPath(); ctx.moveTo(cx - h * 0.8, cy + h * 0.05); ctx.lineTo(cx - h * 0.2, cy + h * 0.65); ctx.lineTo(cx + h * 0.85, cy - h * 0.65); ctx.stroke(); }
  else if(pos === "contre"){ ctx.beginPath(); ctx.moveTo(cx - h * 0.65, cy - h * 0.65); ctx.lineTo(cx + h * 0.65, cy + h * 0.65); ctx.moveTo(cx + h * 0.65, cy - h * 0.65); ctx.lineTo(cx - h * 0.65, cy + h * 0.65); ctx.stroke(); }
  else if(pos === "abst"){ ctx.beginPath(); ctx.arc(cx, cy, h * 0.7, 0, 2 * Math.PI); ctx.stroke(); }
  else { // partagé : carré rayé
    ctx.lineWidth = Math.max(3, t * 0.1); ctx.strokeRect(cx - h * 0.7, cy - h * 0.7, h * 1.4, h * 1.4);
    ctx.beginPath(); ctx.rect(cx - h * 0.7, cy - h * 0.7, h * 1.4, h * 1.4); ctx.clip();
    ctx.beginPath(); for(let k = -2; k <= 2; k++){ ctx.moveTo(cx - h + k * h * 0.7, cy + h); ctx.lineTo(cx + h + k * h * 0.7, cy - h); } ctx.stroke();
  }
  ctx.restore();
}

// Secteur d'anneau (angles canvas, de π à 2π par le haut)
function chemin(ctx, cx, cy, r0, r1, a0, a1){
  ctx.beginPath(); ctx.arc(cx, cy, r1, a0, a1); ctx.arc(cx, cy, r0, a1, a0, true); ctx.closePath();
}

async function dessiner(ctx, f){
  const post = f.format === "post", Hc = post ? H_POST : STORY.H;
  const censure = f.censure === true;
  // 1. groupes : effectif réel, position majoritaire
  const ids = (Array.isArray(f.ordre) && f.ordre.length ? f.ordre : ORDRE).filter(id => f.votes && f.votes[id]);
  const gs = ids.map(id => {
    const b = f.votes[id], v = Array.isArray(b) ? { pour:b[0] || 0, contre:b[1] || 0, abst:b[2] || 0, membres:b[3] || 0 } : { pour:b.pour || 0, contre:b.contre || 0, abst:b.abst || 0, membres:b.membres || 0 };
    const n = v.membres || (v.pour + v.contre + v.abst);
    return { id, v, n, pos:position({ ...v, membres:n }, censure) };
  }).filter(g => g.n > 0);
  if(!gs.length) return null;
  const total = gs.reduce((s, g) => s + g.n, 0);

  // 2. cadre : fond généré, logo, étiquette (le post remonte le cadre des stories, comme js/stories-post.js)
  storyFondTheme(ctx);
  ctx.save(); if(post) ctx.translate(0, -DECALAGE);
  const y0 = storyCadre(ctx, `${f.chambre || "Assemblée nationale"} · ${f.date || ""}`.replace(/ · $/, ""), { etiquette: "blanc", sansFond: true }) - (post ? DECALAGE : 0);
  ctx.restore();
  const bas = post ? H_POST - 150 : 1500;

  // 3. titre du texte en langage simple, puis l'auteur s'il est connu
  let y = y0 + 6;
  const tMax = post ? 56 : 66, nMax = post ? 3 : 3;
  const tt = storyTailleFit(ctx, f.titre, y, y + nMax * tMax * 1.1, { tMax, tMin:44, police:"Newsreader", poids:600, interligne:1.06, largeur:LARG, max:99 });
  y = storyTexte(ctx, f.titre, marge, y, { taille:tt, poids:600, police:"Newsreader", couleur:"#fff", max:nMax, interligne:1.06 });
  if(f.auteur){
    ecrire(ctx, "QUI A PROPOSÉ CE TEXTE ?", marge, y + 40, { poids:700, taille:26, couleur:DA.ciel, ls:3 });
    y = storyTexte(ctx, f.auteur, marge, y + 50, { taille:post ? 32 : 36, poids:700, couleur:"#fff", max:1 }) - 2;
  }
  y += 6;

  // 4. légende (bas) : sigle + nom court, dans l'ordre, deux colonnes
  const nl = Math.ceil(gs.length / 2), hl = post ? 32 : 38, tl = post ? 24 : 25;
  const cl = LARG / 2, wi = mesure(ctx, "LIOT", 800, tl, "Public Sans", 1) + 14;
  ctx.font = `400 ${tl}px "Public Sans"`;
  const noms = gs.map(g => storyLignes(ctx, NOMS[g.id] || g.id, cl - wi - 6, 2)); // noms longs : deux lignes
  const hRang = Array.from({ length: nl }, (_, k) => Math.max(...[noms[k], noms[k + nl]].filter(Boolean).map(l => l.length)) > 1 ? hl + tl * 1.05 : hl);
  const hLeg = hRang.reduce((s, h) => s + h, 0);
  const yLeg = bas - hLeg + 6;
  // 5. voix (rangée sous l'hémicycle)
  const hVoix = post ? 118 : 134;
  const yVoix = yLeg - hVoix - (post ? 8 : 12);
  // 6. hémicycle : la place restante fixe le rayon
  const hPastille = 56, ecart = 16;
  const dispo = yVoix - y - 6;
  const R = Math.max(210, Math.min(310, dispo - hPastille - ecart - 8)), r = R * 0.6;
  const reste = Math.max(0, dispo - (R + hPastille + ecart + 8)); // place en trop : répartie au-dessus et au-dessous de l'hémicycle
  const cx = L / 2, cy = Math.round(yVoix - 8 - reste * 0.5);

  // secteurs
  let a = Math.PI; const pas = 0.012; // demi-espace entre deux secteurs
  gs.forEach(g => { const w = Math.PI * g.n / total; g.a0 = a; g.a1 = a + w; g.am = a + w / 2; a += w; });
  gs.forEach(g => {
    const a0 = g.a0 + pas, a1 = g.a1 - pas;
    chemin(ctx, cx, cy, r, R, a0, a1);
    ctx.fillStyle = teinte(g.pos); ctx.fill();
    if(g.pos === "partage" || !g.pos){ // hachures sombres : repère non coloré du « partagé »
      ctx.save(); chemin(ctx, cx, cy, r, R, a0, a1); ctx.clip();
      ctx.strokeStyle = "rgba(16,24,58,0.55)"; ctx.lineWidth = 6; ctx.beginPath();
      for(let k = -R; k < 2 * R; k += 22){ ctx.moveTo(cx - R + k, cy); ctx.lineTo(cx - R + k + R, cy - R); }
      ctx.stroke(); ctx.restore();
    }
    // repère dans le secteur quand il y a la place (les secteurs fins n'ont que le repère de la pastille)
    const rm = (r + R) / 2, arc = rm * (a1 - a0);
    if(arc >= 44 && g.pos) repere(ctx, g.pos, cx + rm * Math.cos(g.am), cy + rm * Math.sin(g.am), Math.min(40, arc * 0.6), ENCRE);
  });

  // pastilles : sigle + repère, posées autour de l'anneau ; écartées si elles se chevauchent
  ctx.font = `800 30px "Public Sans"`;
  gs.forEach(g => { g.w = mesure(ctx, g.id, 800, 30, "Public Sans", 1) + 34 + 20 + 14; g.h = hPastille; g.ang = g.am; });
  const centre = g => { // support du rectangle : la pastille reste hors de l'anneau quel que soit l'angle
    const c = Math.cos(g.ang), s = Math.sin(g.ang), rp = R + ecart + (g.off || 0) + Math.abs(c) * g.w / 2 + Math.abs(s) * g.h / 2;
    return { x: cx + rp * c, y: cy + rp * s };
  };
  const bornes = [Math.PI + 0.05, 2 * Math.PI - 0.05];
  for(let it = 0; it < 400; it++){
    let bouge = false;
    for(let i = 0; i < gs.length - 1; i++){
      const p = gs[i], q = gs[i + 1], cp = centre(p), cq = centre(q);
      const rx = (p.w + q.w) / 2 + 12 - Math.abs(cp.x - cq.x), ry = (p.h + q.h) / 2 + 10 - Math.abs(cp.y - cq.y);
      if(rx > 0 && ry > 0){ p.ang -= 0.004; q.ang += 0.004; bouge = true; }
    }
    gs.forEach(g => { g.ang = Math.max(bornes[0], Math.min(bornes[1], g.ang)); });
    for(let i = 1; i < gs.length; i++) if(gs[i].ang < gs[i - 1].ang) gs[i].ang = gs[i - 1].ang;
    if(!bouge) break;
  }
  // si des pastilles se chevauchent encore (anneau étroit), les voisines sont décalées vers l'extérieur
  const choc = (p, q) => { const cp = centre(p), cq = centre(q); return (p.w + q.w) / 2 + 8 - Math.abs(cp.x - cq.x) > 0 && (p.h + q.h) / 2 + 6 - Math.abs(cp.y - cq.y) > 0; };
  for(let it = 0; it < 6; it++){
    let bouge = false;
    for(let i = 1; i < gs.length; i++) for(let j = Math.max(0, i - 3); j < i; j++) if(choc(gs[j], gs[i])){ gs[i].off = (gs[i].off || 0) + 34; bouge = true; break; }
    if(!bouge) break;
  }
  // traits de liaison puis pastilles
  gs.forEach(g => {
    const c = centre(g), rb = R + 4;
    ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.lineWidth = 3; ctx.beginPath();
    ctx.moveTo(cx + rb * Math.cos(g.am), cy + rb * Math.sin(g.am)); ctx.lineTo(c.x, c.y); ctx.stroke();
  });
  gs.forEach(g => {
    const c = centre(g), x = c.x - g.w / 2, yy = c.y - g.h / 2;
    ctx.fillStyle = STORY.creme; ctx.beginPath(); ctx.roundRect(x, yy, g.w, g.h, 14); ctx.fill();
    ctx.strokeStyle = teinte(g.pos); ctx.lineWidth = 5; ctx.beginPath(); ctx.roundRect(x + 2.5, yy + 2.5, g.w - 5, g.h - 5, 12); ctx.stroke();
    repere(ctx, g.pos || "partage", x + 14 + 17, c.y, 30, teinteTexte(g.pos));
    ecrire(ctx, g.id, x + 14 + 34 + 12, c.y + 11, { poids:800, taille:30, couleur:STORY.encre, ls:1 });
  });

  // 7. au centre : le verdict ; dessous, les voix
  const adopte = f.verdict === "adopte";
  const mot = (adopte ? "Adopté" : "Rejeté") + (censure ? "e" : "");
  const tv = Math.round(r * 0.34);
  ctx.font = `900 ${tv}px "Public Sans"`; ctx.letterSpacing = `${-tv * 0.03}px`; const wm = ctx.measureText(mot).width; ctx.letterSpacing = "0px";
  ctx.font = `900 ${Math.round(tv * 0.55)}px "Public Sans"`; const wg = ctx.measureText(adopte ? "✓" : "✕").width;
  const wt = wm + 24 + wg;
  storyVerdict(ctx, adopte ? "adopte" : "rejete", mot, cx - wt / 2 + 4, cy - r * 0.2, tv);

  const cases = [["pour", f.pour, "POUR"], ["contre", f.contre, "CONTRE"], ["abst", f.abst, "ABSTENTIONS"]];
  const cw = LARG / 3;
  cases.forEach(([k, n, nom], i) => {
    const mx = marge + cw * i + cw / 2, c = storyVoixCouleur(k, STORY_DA.fond) || teinte(k);
    const tn = post ? 64 : 76, yb = yVoix + tn * 0.8;
    ecrire(ctx, fr(n), mx, yb + 10, { poids:900, taille:tn, couleur:c, align:"center", ls:-2 });
    const wn = mesure(ctx, nom, 800, 28, "Public Sans", 3) + 40, x0 = mx - wn / 2, yn = yb + (post ? 42 : 50);
    repere(ctx, k, x0 + 13, yn - 10, 26, c);
    ecrire(ctx, nom, x0 + 40, yn, { poids:800, taille:28, couleur:c, ls:3 });
  });

  // 8. légende : sigle + nom court
  let yy = yLeg;
  for(let k = 0; k < nl; k++){
    [k, k + nl].forEach((i, col) => {
      const g = gs[i]; if(!g) return;
      const x = marge + col * cl;
      ecrire(ctx, g.id, x, yy + tl, { poids:800, taille:tl, couleur:"#fff", ls:1 });
      noms[i].forEach((ln, j) => ecrire(ctx, ln, x + wi, yy + tl + j * tl * 1.05, { poids:400, taille:tl, couleur:DA.ciel }));
    });
    yy += hRang[k];
  }
  return { yVoix, R };
}

STORY_PLUS["vote-groupes"] = async (ctx, f) => {
  if(!f || !f.titre || !f.votes || !(f.verdict === "adopte" || f.verdict === "rejete")) return null;
  await polices();
  const r = await dessiner(ctx, f);
  if(!r) return null;
  // mention + accroche (même pied que les stories ; pour le post, remonté comme dans js/stories-post.js)
  const mention = f.sourceTxt || "Position majoritaire de chaque groupe d'après les votes de ses membres. Largeur d'un secteur : nombre de députés du groupe. Source : Assemblée nationale.";
  if(f.format === "post"){
    storyTexte(ctx, mention, marge, H_POST - 128, { taille:23, couleur:STORY.ciel, max:2, interligne:1.2 });
    storyAccroche(ctx, "Toute l'actu politique", H_POST - 40);
  } else storyPied(ctx, mention, { accroche:"Toute l'actu politique" });
  return { nom: `vote-groupes-${f.numero || "x"}${f.format === "post" ? "-post" : ""}` };
};
})();
