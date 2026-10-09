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

// Palette de ce modèle (fond clair, lisible d'un coup d'œil) : textes foncés ≥ 4,5:1 sur le blanc
const C = { fond:"#E9EBF1", encre:"#17307A", pour:"#1E8A4C", contre:"#C8283B", abst:"#D97A06", partage:"#6B6F80" };
const MOT_BLOC = { pour:"POUR", contre:"CONTRE", abst:"ABSTENTION", partage:"PARTAGÉ" };
const JOURS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

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
  const marque = await storyImage("icons/icon-192.png");

  // fond : gris clair, grands arcs d'hémicycle très pâles
  ctx.fillStyle = C.fond; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = 26;
  for(let k = 0; k < 7; k++){ ctx.beginPath(); ctx.arc(W / 2, H * 0.62, 260 + k * 150, Math.PI, 2 * Math.PI); ctx.stroke(); }
  const haut = post ? 0 : 150, bas = post ? 0 : 150;
  const adopte = f.verdict === "adopte";
  const hPied = 150, yPied = H - bas - hPied;

  // 1. en-tête : mention centrée, filet, titre en gros
  let y = haut + 60;
  ecrire(ctx, "VOTE À L'ASSEMBLÉE NATIONALE", W / 2, y, { poids:800, taille:25, couleur:C.encre, align:"center", ls:4 });
  ctx.fillStyle = C.encre; ctx.fillRect(W / 2 - 150, y + 18, 300, 3);
  let tt = post ? 64 : 70; let lignes;
  for(; tt >= 38; tt -= 2){ ctx.font = `900 ${tt}px "Public Sans"`; lignes = storyLignes(ctx, String(f.titre).toUpperCase(), W - 2 * 60, 4); if(lignes.length <= 3) break; }
  y += 48 + tt;
  lignes.forEach((ln, k) => ecrire(ctx, ln, W / 2, y + k * tt * 1.08, { poids:900, taille:tt, couleur:C.encre, align:"center", ls:-1 }));
  y += (lignes.length - 1) * tt * 1.08;

  // 2. secteurs : groupes voisins de même position réunis, coupés en secteurs de 4 groupes au plus
  const blocs = [];
  gs.forEach(g => { const d = blocs[blocs.length - 1]; if(d && d.pos === g.pos) d.g.push(g); else blocs.push({ pos:g.pos, g:[g] }); });
  const secteurs = blocs.map(b => ({ pos:b.pos, g:b.g })); // un seul secteur par position : jamais de coupure à l'intérieur d'un « pour » ou d'un « contre »
  const poids = sc => sc.g.reduce((t, g) => t + 0.8 + 0.2 * g.n / total * gs.length, 0), somme = secteurs.reduce((t, sc) => t + poids(sc), 0);
  let a = Math.PI; secteurs.forEach(sc => { sc.a0 = a; a += Math.PI * poids(sc) / somme; sc.a1 = a; sc.am = (sc.a0 + sc.a1) / 2; const tot = poids(sc); let u = sc.a0; sc.g.forEach(g => { const w = (sc.a1 - sc.a0) * (0.8 + 0.2 * g.n / total * gs.length) / tot; g.a0 = u; u += w; g.a1 = u; }); });
  const R = Math.min(W / 2 - 50, 480), r = R * 0.52, GAP = 16, cx = W / 2; // GAP : écart constant (en pixels) entre deux secteurs, quel que soit le rayon
  const hDessous = post ? 400 : 480;
  const cy = Math.round(Math.min(y + 50 + R, yPied - hDessous));
  const col = pos => C[pos] || C.partage;
  // secteur dont les bords latéraux sont écartés d'une distance constante (et non d'un angle constant)
  const part = (r0, r1, sc) => {
    const h = GAP / 2; ctx.beginPath();
    ctx.arc(cx, cy, r1, sc.a0 + h / r1, sc.a1 - h / r1); ctx.arc(cx, cy, r0, sc.a1 - h / r0, sc.a0 + h / r0, true); ctx.closePath();
  };
  secteurs.forEach(sc => {
    part(r, R, sc); ctx.fillStyle = "#fff"; ctx.fill(); ctx.strokeStyle = col(sc.pos); ctx.lineWidth = 5; ctx.lineJoin = "round"; ctx.stroke();
    if(sc.pos === "partage"){ ctx.save(); part(r, R, sc); ctx.clip(); ctx.strokeStyle = "rgba(107,111,128,0.22)"; ctx.lineWidth = 5; ctx.beginPath(); for(let k = -R; k < 2 * R; k += 20){ ctx.moveTo(cx - R + k, cy); ctx.lineTo(cx - R + k + R, cy - R); } ctx.stroke(); ctx.restore(); }
    part(r - 44, r - 20, sc); ctx.fillStyle = col(sc.pos); ctx.fill(); // arc de couleur sous le secteur
    // un logo par groupe, au centre de sa part, sans cadre ; deux rayons en alternance
    sc.g.forEach((g, k) => {
      const rr = r + (R - r) * (k % 2 ? 0.30 : 0.70), hMax = 44;
      let lw = 80, lh = 40; // sigle seul : LIOT, NI
      if(g.logo){ const wMax = Math.min(120, Math.max(60, rr * (g.a1 - g.a0) * 1.4)), kk = Math.min(wMax / g.logo.width, hMax / g.logo.height); lw = g.logo.width * kk; lh = g.logo.height * kk; }
      let am = (g.a0 + g.a1) / 2;
      const ext = (lw * Math.abs(Math.sin(am)) + lh * Math.abs(Math.cos(am))) / 2 + 18; // le logo ne touche jamais le bord du secteur
      const mini = sc.a0 + ext / rr, maxi = sc.a1 - ext / rr; am = mini < maxi ? Math.max(mini, Math.min(maxi, am)) : (sc.a0 + sc.a1) / 2;
      const px = cx + rr * Math.cos(am), py = cy + rr * Math.sin(am);
      if(g.logo) ctx.drawImage(g.logo, px - lw / 2, py - lh / 2, lw, lh);
      else ecrire(ctx, g.id, px, py + 12, { poids:900, taille:36, couleur:C.encre, align:"center", ls:1 });
    });
  });
  // étiquettes aux deux bouts
  const bg = secteurs[0], bd = secteurs[secteurs.length - 1];
  ecrire(ctx, MOT_BLOC[bg.pos], cx - R + 4, cy + 50, { poids:900, taille:34, couleur:col(bg.pos), ls:1 });
  ecrire(ctx, MOT_BLOC[bd.pos], cx + R - 4, cy + 50, { poids:900, taille:34, couleur:col(bd.pos), align:"right", ls:1 });

  // 3. « Ils ont voté » et le mot géant
  const mot = (censure ? (adopte ? "ADOPTÉE" : "REJETÉE") : (adopte ? "POUR" : "CONTRE"));
  const yI = cy + (post ? 110 : 130);
  ecrire(ctx, "Ils ont voté", W / 2, yI, { poids:900, taille:post ? 52 : 58, couleur:C.encre, align:"center" });
  let tg = post ? 200 : 220; while(tg > 100 && mesure(ctx, mot, 900, tg, "Public Sans", -3) > W - 120) tg -= 6;
  const yG = yI + tg * 0.92;
  ecrire(ctx, mot, W / 2, yG, { poids:900, taille:tg, couleur:col(adopte ? "pour" : "contre"), align:"center", ls:-3 });
  const bilan = [[fr(f.pour), "pour", C.pour], [fr(f.contre), "contre", C.contre], [fr(f.abst), f.abst > 1 ? "abstentions" : "abstention", C.abst]];
  const larg = bilan.map(([n, m]) => mesure(ctx, n + " " + m, 800, 30)), espace = 40, tot = larg.reduce((t, w) => t + w, 0) + espace * 2;
  let x = (W - tot) / 2;
  bilan.forEach(([n, m, c], k) => { ecrire(ctx, n + " " + m, x, yG + 56, { poids:800, taille:30, couleur:c }); x += larg[k] + espace; });

  // 4. pied blanc : marque à gauche, filet, date et source à droite
  ctx.fillStyle = "#fff"; ctx.fillRect(0, yPied, W, hPied);
  if(marque) ctx.drawImage(marque, 70, yPied + 28, 94, 94);
  ecrire(ctx, "Hémicycle", 182, yPied + 74, { poids:900, taille:32, couleur:C.encre });
  ecrire(ctx, "France", 182, yPied + 110, { poids:900, taille:32, couleur:C.encre });
  ctx.fillStyle = "#C9CCD6"; ctx.fillRect(398, yPied + 30, 3, 90);
  const d = f.dateIso ? new Date(f.dateIso + "T12:00:00") : null, dateTxt = d && !isNaN(d) ? `${JOURS[d.getDay()]} ${f.date}` : (f.date || "");
  ecrire(ctx, dateTxt, 430, yPied + 70, { poids:900, taille:36, couleur:C.encre });
  ecrire(ctx, f.auteur ? `Texte de ${f.auteur}` : "Position majoritaire de chaque groupe", 430, yPied + 104, { poids:600, taille:24, couleur:"#4A4D57" });
  ecrire(ctx, "Source : Assemblée nationale · @hemicyclefrance", 430, yPied + 134, { poids:600, taille:22, couleur:"#4A4D57" });
  return { yVoix:yG, R, partage: gs.some(g => g.pos === "partage") };
}

STORY_PLUS["vote-groupes"] = async (ctx, f) => {
  if(!f || !f.titre || !f.votes || !(f.verdict === "adopte" || f.verdict === "rejete")) return null;
  await polices();
  const r = await dessiner(ctx, f);
  if(!r) return null;
  return { nom: `vote-groupes-${f.numero || "x"}${f.format === "post" ? "-post" : ""}` };
};
})();
