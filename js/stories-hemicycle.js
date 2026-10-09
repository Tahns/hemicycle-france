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

// Palette de ce modèle (fond clair, comme un tableau de vote lisible d'un coup d'œil) : textes foncés ≥ 4,5:1 sur le blanc
const C = { fond:"#F4F5FA", encre:"#16245E", pour:"#1E8A4C", contre:"#C8283B", abst:"#D97A06", partage:"#6B6F80" };
const MOT_BLOC = { pour:"POUR", contre:"CONTRE", abst:"ABSTENTION", partage:"PARTAGÉ" };

async function dessiner(ctx, f){
  const post = f.format === "post", H = post ? H_POST : STORY.H, W = L;
  const censure = f.censure === true;
  const ids = (Array.isArray(f.ordre) && f.ordre.length ? f.ordre : ORDRE).filter(id => f.votes && f.votes[id]);
  const gs = ids.map(id => {
    const b = f.votes[id], v = Array.isArray(b) ? { pour:b[0] || 0, contre:b[1] || 0, abst:b[2] || 0, membres:b[3] || 0 } : { pour:b.pour || 0, contre:b.contre || 0, abst:b.abst || 0, membres:b.membres || 0 };
    const n = v.membres || (v.pour + v.contre + v.abst);
    return { id, v, n, pos:position({ ...v, membres:n }, censure) || "partage" };
  }).filter(g => g.n > 0);
  if(!gs.length) return null;
  const total = gs.reduce((t, g) => t + g.n, 0);
  await Promise.all(gs.map(async g => { g.logo = await storyImage(`icons/partis/${g.id}.png`); })); // logos hébergés sur le site ; LIOT et NI : sigle

  // fond clair
  ctx.fillStyle = C.fond; ctx.fillRect(0, 0, W, H);
  const haut = post ? 0 : 150, bas = post ? 0 : 150; // les stories laissent libres le haut et le bas (zones de l'application)
  const adopte = f.verdict === "adopte", motVote = adopte ? "pour" : "contre";

  // 1. en-tête et titre (centrés, en majuscules)
  let y = haut + 62;
  ecrire(ctx, `${f.chambre || "Assemblée nationale"} · ${f.date || ""}`.replace(/ · $/, "").toUpperCase(), W / 2, y, { poids:800, taille:25, couleur:C.encre, align:"center", ls:3 });
  ctx.fillStyle = C.encre; ctx.fillRect(W / 2 - 60, y + 16, 120, 4);
  let tt = post ? 56 : 60; let lignes;
  for(; tt >= 38; tt -= 2){ ctx.font = `900 ${tt}px "Public Sans"`; lignes = storyLignes(ctx, String(f.titre).toUpperCase(), W - 2 * 70, 4); if(lignes.length <= 3) break; }
  y += 40 + tt;
  lignes.forEach((ln, k) => ecrire(ctx, ln, W / 2, y + k * tt * 1.12, { poids:900, taille:tt, couleur:C.encre, align:"center" }));
  y += (lignes.length - 1) * tt * 1.12;

  // 2. blocs : groupes voisins ayant la même position = un seul secteur
  const parts = gs.map(g => 0.7 / gs.length + 0.3 * g.n / total); // largeur : surtout égale (chaque logo doit tenir), un peu proportionnelle aux sièges
  let a = Math.PI; const blocs = [];
  gs.forEach((g, k) => {
    const dernier = blocs[blocs.length - 1];
    if(!dernier || dernier.pos !== g.pos) blocs.push({ pos:g.pos, groupes:[], a0:a });
    blocs[blocs.length - 1].groupes.push(g); g.a0 = a; a += Math.PI * parts[k]; g.a1 = a; blocs[blocs.length - 1].a1 = a;
  });
  const R = Math.min(W / 2 - 50, 480), r = R * 0.5, gap = 0.012, cx = W / 2;
  const hDessous = post ? 400 : 470; // « Ils ont voté » + mot géant + totaux
  const cy = Math.round(Math.min(y + 40 + R, H - bas - hDessous)) ;
  const col = pos => C[pos] || C.partage;
  blocs.forEach(b => {
    const a0 = b.a0 + gap, a1 = b.a1 - gap;
    chemin(ctx, cx, cy, r, R, a0, a1); ctx.fillStyle = "#fff"; ctx.fill(); ctx.strokeStyle = col(b.pos); ctx.lineWidth = 6; ctx.lineJoin = "round"; ctx.stroke();
    if(b.pos === "partage"){ ctx.save(); chemin(ctx, cx, cy, r, R, a0, a1); ctx.clip(); ctx.strokeStyle = "rgba(107,111,128,0.25)"; ctx.lineWidth = 5; ctx.beginPath(); for(let k = -R; k < 2 * R; k += 20){ ctx.moveTo(cx - R + k, cy); ctx.lineTo(cx - R + k + R, cy - R); } ctx.stroke(); ctx.restore(); }
    chemin(ctx, cx, cy, r - 38, r - 18, a0, a1); ctx.fillStyle = col(b.pos); ctx.fill(); // arc de couleur sous le secteur
  });
  // logos : un par groupe, au centre de sa part, rayons alternés pour que les logos larges ne se touchent pas
  gs.forEach((g, k) => {
    const am = (g.a0 + g.a1) / 2, rr = r + (R - r) * [0.76, 0.5, 0.24][k % 3], px = cx + rr * Math.cos(am), py = cy + rr * Math.sin(am);
    const arc = rr * (g.a1 - g.a0), wMax = Math.max(50, Math.min(arc * 1.25, 118)), hMax = Math.min(58, (R - r) * 0.3);
    if(g.logo){ const kk = Math.min(wMax / g.logo.width, hMax / g.logo.height), lw = g.logo.width * kk, lh = g.logo.height * kk; ctx.drawImage(g.logo, px - lw / 2, py - lh / 2, lw, lh); }
    else ecrire(ctx, g.id, px, py + 12, { poids:900, taille:30, couleur:C.encre, align:"center", ls:1 });
  });
  // étiquettes aux deux bouts : couleur du premier et du dernier secteur
  const bg = blocs[0], bd = blocs[blocs.length - 1];
  ecrire(ctx, MOT_BLOC[bg.pos], cx - R, cy + 52, { poids:900, taille:34, couleur:col(bg.pos), ls:1 });
  ecrire(ctx, MOT_BLOC[bd.pos], cx + R, cy + 52, { poids:900, taille:34, couleur:col(bd.pos), align:"right", ls:1 });

  // 3. résultat : « Ils ont voté » et le mot géant
  const mot = (censure ? (adopte ? "ADOPTÉE" : "REJETÉE") : (adopte ? "POUR" : "CONTRE"));
  ecrire(ctx, "Ils ont voté", W / 2, cy + (post ? 130 : 150), { poids:900, taille:post ? 50 : 56, couleur:C.encre, align:"center" });
  let tg = post ? 190 : 210; while(tg > 100 && mesure(ctx, mot, 900, tg, "Public Sans", -3) > W - 140) tg -= 6;
  ecrire(ctx, mot, W / 2, cy + (post ? 130 : 150) + tg * 0.95, { poids:900, taille:tg, couleur:col(adopte ? "pour" : "contre"), align:"center", ls:-3 });
  const yt = cy + (post ? 130 : 150) + tg * 0.95 + 56;
  const bilan = [[fr(f.pour), "pour", C.pour], [fr(f.contre), "contre", C.contre], [fr(f.abst), f.abst > 1 ? "abstentions" : "abstention", C.abst]];
  const larg = bilan.map(([n, m]) => mesure(ctx, n + " " + m, 800, 32)), espace = 44, tot = larg.reduce((t, w) => t + w, 0) + espace * 2;
  let x = (W - tot) / 2;
  bilan.forEach(([n, m, c], k) => { ecrire(ctx, n + " " + m, x, yt, { poids:800, taille:32, couleur:c }); x += larg[k] + espace; });

  // 4. pied : source, marque
  const ys = H - bas - (post ? 70 : 70);
  ecrire(ctx, f.auteur ? `Texte proposé par ${f.auteur} · Source : Assemblée nationale` : "Position majoritaire de chaque groupe · Source : Assemblée nationale", W / 2, ys, { poids:600, taille:23, couleur:"#4A4D57", align:"center" });
  ecrire(ctx, "Hémicycle France  ·  @hemicyclefrance", W / 2, ys + 46, { poids:800, taille:28, couleur:C.encre, align:"center" });
  return { yVoix:yt, R, partage: gs.some(g => g.pos === "partage") };
}

STORY_PLUS["vote-groupes"] = async (ctx, f) => {
  if(!f || !f.titre || !f.votes || !(f.verdict === "adopte" || f.verdict === "rejete")) return null;
  await polices();
  const r = await dessiner(ctx, f);
  if(!r) return null;
  return { nom: `vote-groupes-${f.numero || "x"}${f.format === "post" ? "-post" : ""}` };
};
})();
