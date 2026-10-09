/* Module chargé à la demande (dessin des stories et des posts) : voir chargerModule() dans index.html.
   Modèle « vote par groupe » : STORY_PLUS["vote-groupes"], story 1080 × 1920 ou post 1080 × 1350 (fiche.format = "story" | "post").
   « Qui a voté quoi » lisible d'un coup d'œil : un hémicycle en demi-cercle dessiné dans le canvas, un secteur par groupe, dans l'ordre des bancs
   du site (celui de l'hémicycle de la page d'accueil, de gauche à droite). La LARGEUR de chaque secteur est proportionnelle à l'effectif du groupe.
   Chaque secteur est teinté selon la position MAJORITAIRE des membres du groupe sur ce scrutin (mêmes teintes assourdies que les verdicts :
   pour = vert, contre = rouge, abstention = orange, partagé = gris rayé) ET porte un repère qui ne dépend pas de la couleur (✓ ✕ ○ ou hachures).
   TOUS les groupes sont traités de la même façon : même pastille (sigle), même taille, même ordre de lecture ; aucun n'est mis en avant.
   Hémicycle en points (un point = un député, coloré selon son vote), logos des groupes quand le site en héberge (LIOT et NI : sigle) ;
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
  const tMax = post ? 56 : 60, nMax = post ? 3 : 3;
  const tt = storyTailleFit(ctx, f.titre, y, y + nMax * tMax * 1.1, { tMax, tMin:44, police:"Newsreader", poids:600, interligne:1.06, largeur:LARG, max:99 });
  y = storyTexte(ctx, f.titre, marge, y, { taille:tt, poids:600, police:"Newsreader", couleur:"#fff", max:nMax, interligne:1.06 });
  if(f.auteur){ // une seule ligne si elle tient, sinon deux
    const wl = mesure(ctx, "QUI A PROPOSÉ CE TEXTE ?", 700, 24, "Public Sans", 3), wn = mesure(ctx, f.auteur, 700, 32);
    if(wl + 24 + wn <= LARG){
      ecrire(ctx, "QUI A PROPOSÉ CE TEXTE ?", marge, y + 36, { poids:700, taille:24, couleur:DA.ciel, ls:3 });
      ecrire(ctx, f.auteur, marge + wl + 24, y + 36, { poids:700, taille:32, couleur:"#fff" });
      y += 50;
    } else {
      ecrire(ctx, "QUI A PROPOSÉ CE TEXTE ?", marge, y + 36, { poids:700, taille:24, couleur:DA.ciel, ls:3 });
      y = storyTexte(ctx, f.auteur, marge, y + 44, { taille:32, poids:700, couleur:"#fff", max:1 }) - 2;
    }
  }
  y += 6;

  // 4. bas : les trois totaux ; entre le titre et eux, l'hémicycle
  const yVoix = (post ? H_POST - 330 : 1330);
  await Promise.all(gs.map(async g => { g.logo = await storyImage(`icons/partis/${g.id}.png`); })); // logos hébergés sur le site ; LIOT et NI : sigle
  // 5. hémicycle simple : un secteur par groupe, vert / rouge / orange selon sa position majoritaire, son logo au milieu
  const cx = L / 2, R = Math.min(LARG / 2 + 10, 450), r = R * 0.42, rm = (r + R) / 2;
  const cy = Math.round(Math.max(y + R + 30, yVoix - 70)), pas = 0.014;
  const parts = gs.map(g => 0.55 / gs.length + 0.45 * g.n / total); // largeur : un peu d'égalité pour que chaque logo tienne, le reste suit le nombre de députés
  let a = Math.PI;
  gs.forEach((g, k) => { g.a0 = a; a += Math.PI * parts[k]; g.a1 = a; g.am = (g.a0 + g.a1) / 2; });
  gs.forEach(g => {
    chemin(ctx, cx, cy, r, R, g.a0 + pas, g.a1 - pas); ctx.fillStyle = teinte(g.pos); ctx.fill();
    if(g.pos === "partage" || !g.pos){
      ctx.save(); chemin(ctx, cx, cy, r, R, g.a0 + pas, g.a1 - pas); ctx.clip(); ctx.strokeStyle = "rgba(16,24,58,0.45)"; ctx.lineWidth = 6; ctx.beginPath();
      for(let k = -R; k < 2 * R; k += 22){ ctx.moveTo(cx - R + k, cy); ctx.lineTo(cx - R + k + R, cy - R); } ctx.stroke(); ctx.restore();
    }
    const arc = rm * (g.a1 - g.a0 - 2 * pas), d = Math.max(40, Math.min(arc - 8, R - r - 40, 92)), px = cx + rm * Math.cos(g.am), py = cy + rm * Math.sin(g.am);
    ctx.fillStyle = STORY.creme; ctx.beginPath(); ctx.arc(px, py, d / 2, 0, 2 * Math.PI); ctx.fill();
    if(g.logo){ const k = Math.min((d - 10) / g.logo.width, (d - 18) / g.logo.height), lw = g.logo.width * k, lh = g.logo.height * k; ctx.drawImage(g.logo, px - lw / 2, py - lh / 2, lw, lh); }
    else ecrire(ctx, g.id, px, py + d * 0.12, { poids:800, taille:Math.round(d * 0.32), couleur:STORY.encre, align:"center" });
  });
  const hLeg = 0, yLeg = H_POST - 150, noms = [], nl = 0;

  // 7. au centre : le verdict ; dessous, les voix
  const adopte = f.verdict === "adopte";
  const mot = (adopte ? "Adopté" : "Rejeté") + (censure ? "e" : "");
  const tv = Math.round(r * 0.36);
  ctx.font = `900 ${tv}px "Public Sans"`; ctx.letterSpacing = `${-tv * 0.03}px`; const wm = ctx.measureText(mot).width; ctx.letterSpacing = "0px";
  ctx.font = `900 ${Math.round(tv * 0.55)}px "Public Sans"`; const wg = ctx.measureText(adopte ? "✓" : "✕").width;
  const wt = wm + 24 + wg;
  storyVerdict(ctx, adopte ? "adopte" : "rejete", mot, cx - wt / 2 + 4, cy - r * 0.15, tv);

  const cases = [["pour", f.pour, "POUR"], ["contre", f.contre, "CONTRE"], ["abst", f.abst, "ABSTENTIONS"]];
  const cw = LARG / 3;
  cases.forEach(([k, n, nom], i) => {
    const mx = marge + cw * i + cw / 2, c = storyVoixCouleur(k, STORY_DA.fond) || teinte(k);
    const tn = post ? 64 : 72, yb = yVoix + tn * 0.8;
    ecrire(ctx, fr(n), mx, yb + 10, { poids:900, taille:tn, couleur:c, align:"center", ls:-2 });
    const wn = mesure(ctx, nom, 800, 28, "Public Sans", 3) + 40, x0 = mx - wn / 2, yn = yb + (post ? 42 : 50);
    repere(ctx, k, x0 + 13, yn - 10, 26, c);
    ecrire(ctx, nom, x0 + 40, yn, { poids:800, taille:28, couleur:c, ls:3 });
  });

  return { yVoix, R, partage: gs.some(g => g.pos === "partage") };
}

STORY_PLUS["vote-groupes"] = async (ctx, f) => {
  if(!f || !f.titre || !f.votes || !(f.verdict === "adopte" || f.verdict === "rejete")) return null;
  await polices();
  const r = await dessiner(ctx, f);
  if(!r) return null;
  // mention + accroche (même pied que les stories ; pour le post, remonté comme dans js/stories-post.js)
  const mention = f.sourceTxt || `Position majoritaire de chaque groupe. Source : Assemblée nationale.`;
  if(f.format === "post"){
    storyTexte(ctx, mention, marge, H_POST - 128, { taille:23, couleur:STORY.ciel, max:2, interligne:1.2 });
    storyAccroche(ctx, "Toute l'actu politique", H_POST - 40);
  } else storyPied(ctx, mention, { accroche:"Toute l'actu politique" });
  return { nom: `vote-groupes-${f.numero || "x"}${f.format === "post" ? "-post" : ""}` };
};
})();
