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
const { L } = STORY, M = BLANC.marge;
const H_POST = 1350;
const ORDRE = ["LFI", "GDR", "ECO", "SOC", "LIOT", "EPR", "DEM", "HOR", "LR", "UDR", "RN", "NI"];
const NOMS = { LFI:"La France insoumise", GDR:"Gauche démocrate et républicaine", ECO:"Écologiste et Social", SOC:"Socialistes et apparentés",
  LIOT:"Libertés, Indépendants, Outre-mer et Territoires", EPR:"Ensemble pour la République", DEM:"Les Démocrates", HOR:"Horizons et Indépendants",
  LR:"Droite Républicaine", UDR:"Union des droites pour la République", RN:"Rassemblement National", NI:"Non-inscrits" };
const MOTS = { pour:"POUR", contre:"CONTRE", abst:"ABSTENTION", partage:"PARTAGÉ" };
const fr = n => String(n ?? 0).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

async function polices(){
  await Promise.all(['800 100px "Public Sans"', '700 30px "Public Sans"', '600 30px "Public Sans"', '400 30px "Public Sans"', '600 60px Newsreader']
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
// Secteur d'anneau (angles canvas, de π à 2π par le haut)
function chemin(ctx, cx, cy, r0, r1, a0, a1){
  ctx.beginPath(); ctx.arc(cx, cy, r1, a0, a1); ctx.arc(cx, cy, r0, a1, a0, true); ctx.closePath();
}

// Palette de ce modèle (base blanche du kit js/stories-blanc.js) : textes foncés ≥ 4,5:1 sur le blanc
const C = { encre:BLANC.encre, pour:BLANC_VOIX.pour, contre:BLANC_VOIX.contre, abst:BLANC_VOIX.abst, partage:BLANC_VOIX.partage };
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
  const ni = gs.find(g => g.id === "NI"); // les non-inscrits n'ont pas de place sur l'échelle gauche-droite : ils sont indiqués à part, au centre
  if(ni && gs.length > 1) gs.splice(gs.indexOf(ni), 1);
  const total = gs.reduce((t, g) => t + g.n, 0);
  await Promise.all(gs.map(async g => { g.logo = await storyImage(`icons/partis/${g.id}.png`); })); // logos hébergés sur le site ; LIOT et NI : sigle

  // base blanche : bandeau de tête, rubrique rouge, grand titre serif, puis l'hémicycle ; le pied (source) est ancré en bas
  const adopte = f.verdict === "adopte";
  const dj = f.dateIso ? new Date(f.dateIso + "T12:00:00") : null, dateTxt = dj && !isNaN(dj) ? `${JOURS[dj.getDay()]} ${f.date}` : (f.date || "");
  const y0 = storyBlancCadre(ctx, censure ? "Motion de censure · Assemblée nationale" : "Vote à l'Assemblée nationale", { date: dateTxt, haut: post ? 56 : BLANC.haut });
  const source = [f.sourceTxt || "Source : Assemblée nationale.", f.auteur ? `Texte de ${f.auteur}.` : "", "Chaque secteur : position majoritaire du groupe sur ce scrutin."].filter(Boolean).join(" ");
  const yPied = storyBlancPiedBas(ctx, source, { bas: post ? H - 30 : BLANC.bas - 10, taille: 22 });
  const GAP = 16, cx = W / 2; // GAP : écart constant (en pixels) entre deux secteurs, quel que soit le rayon
  const mot = (censure ? (adopte ? "ADOPTÉE" : "REJETÉE") : (adopte ? "POUR" : "CONTRE"));
  const HBAS = 300; // du centre de l'hémicycle au bas du verdict et de la ligne des voix
  // titre : le plus grand corps qui tienne en 3 lignes (4 en story), sans coupure, en laissant assez de place à l'hémicycle
  const R0 = Math.min(W / 2 - 50, 480), lMax = post ? 3 : 4;
  let tt = post ? 60 : 68, lignes, bT, R = R0;
  for(; tt >= 26; tt -= 2){
    ctx.font = `600 ${tt}px "Newsreader"`; ctx.letterSpacing = "-0.5px"; lignes = storyLignes(ctx, String(f.titre), W - 2 * M, 99); ctx.letterSpacing = "0px";
    bT = y0 + (lignes.length - 1) * tt * 1.08 + tt * 1.2;
    R = Math.min(R0, yPied - 24 - HBAS - (bT + 30));
    if(lignes.length <= lMax && R >= (post ? 300 : 350)) break;
  }
  R = Math.max(R, 240);
  const r = R * 0.52;
  storyBlancTexte(ctx, String(f.titre), M, y0, { taille: tt, poids: 600, police: "Newsreader", interligne: 1.08, ls: -0.5 });
  let y = bT - tt * 0.3;
  const cyMax = yPied - 24 - HBAS, bas0 = bT;

  // 2. secteurs : groupes voisins de même position réunis, coupés en secteurs de 4 groupes au plus
  const blocs = [];
  gs.forEach(g => { const d = blocs[blocs.length - 1]; if(d && d.pos === g.pos) d.g.push(g); else blocs.push({ pos:g.pos, g:[g] }); });
  const secteurs = blocs.map(b => ({ pos:b.pos, g:b.g })); // un seul secteur par position : jamais de coupure à l'intérieur d'un « pour » ou d'un « contre »
  const poids = sc => sc.g.reduce((t, g) => t + 0.8 + 0.2 * g.n / total * gs.length, 0), somme = secteurs.reduce((t, sc) => t + poids(sc), 0);
  let a = Math.PI; secteurs.forEach(sc => { sc.a0 = a; a += Math.PI * poids(sc) / somme; sc.a1 = a; sc.am = (sc.a0 + sc.a1) / 2; const tot = poids(sc); let u = sc.a0; sc.g.forEach(g => { const w = (sc.a1 - sc.a0) * (0.8 + 0.2 * g.n / total * gs.length) / tot; g.a0 = u; u += w; g.a1 = u; }); });
  const cy = Math.round(Math.min(cyMax, y + 30 + R + Math.max(0, cyMax - (y + 30 + R)) / 2)); // centré dans la place libre
  const col = pos => C[pos] || C.partage;
  // secteur dont les bords latéraux sont écartés d'une distance constante (et non d'un angle constant)
  const part = (r0, r1, sc) => {
    const h = GAP / 2; ctx.beginPath();
    ctx.arc(cx, cy, r1, sc.a0 + h / r1, sc.a1 - h / r1); ctx.arc(cx, cy, r0, sc.a1 - h / r0, sc.a0 + h / r0, true); ctx.closePath();
  };
  // logos : un par groupe, sans cadre, posés dans le secteur de leur position, jamais sur un bord, jamais l'un sur l'autre.
  // Même échelle pour tous les groupes : on réduit l'échelle commune jusqu'à ce que tout tienne.
  const MB = 16, PAD = 18; // marge au bord du secteur, espace minimal entre deux logos
  const dim = (g, s) => {
    if(g.logo){ const wMax = 120 * s, hMax = 44 * s, kk = Math.min(wMax / g.logo.width, hMax / g.logo.height); return { w:g.logo.width * kk, h:g.logo.height * kk }; }
    const t = Math.max(12, Math.round(36 * s)); ctx.font = `900 ${t}px "Public Sans"`; ctx.letterSpacing = "1px"; const m = ctx.measureText(g.id); ctx.letterSpacing = "0px";
    return { w:m.width, h:m.actualBoundingBoxAscent + m.actualBoundingBoxDescent, t, asc:m.actualBoundingBoxAscent };
  };
  const dedans = (px, py, w, h, sc) => { // les 4 côtés du rectangle, échantillonnés, restent à MB du secteur
    const N = 8, ex = GAP / 2 + MB;
    for(let i = 0; i <= N; i++) for(let j = 0; j <= N; j++){
      if(i && i < N && j && j < N) continue;
      const x = px - w / 2 + w * i / N - cx, yy = py - h / 2 + h * j / N - cy, d = Math.hypot(x, yy), an = Math.atan2(yy, x) + (yy < 0 ? 2 * Math.PI : 0);
      if(d < r + MB || d > R - MB || yy > -MB) return false;
      if(d * Math.sin(an - sc.a0) < ex || d * Math.sin(sc.a1 - an) < ex) return false;
      if(an - sc.a0 < 0 || sc.a1 - an < 0) return false;
    }
    return true;
  };
  const poser = (sc, s) => {
    {
      const places = [];
      for(let k = 0; k < sc.g.length; k++){
        const g = sc.g[k], dm = dim(g, s), pref = { rr:r + (R - r) * (k % 2 ? 0.34 : 0.68), am:(g.a0 + g.a1) / 2 };
        let best = null;
        for(let rr = r + MB; rr <= R - MB; rr += 6){
          const pas = 6 / rr;
          for(let am = sc.a0; am <= sc.a1; am += pas){
            const px = cx + rr * Math.cos(am), py = cy + rr * Math.sin(am);
            if(!dedans(px, py, dm.w, dm.h, sc)) continue;
            if(places.some(q => Math.abs(q.px - px) < (q.w + dm.w) / 2 + PAD && Math.abs(q.py - py) < (q.h + dm.h) / 2 + PAD)) continue;
            const sco = (rr - pref.rr) ** 2 + (rr * (am - pref.am)) ** 2 * 1.5;
            if(!best || sco < best.sco) best = { px, py, sco };
          }
        }
        if(!best) return null;
        places.push({ g, ...dm, px:best.px, py:best.py });
      }
      return places;
    }
  };
  const pose = []; // échelle propre à chaque secteur (les plus étroits ont des logos plus petits), jamais au-delà de la taille nominale
  secteurs.forEach(sc => { let q = null; for(let s = 1.15; s >= 0.15 && !q; s -= 0.05) q = poser(sc, s); if(q) pose.push(...q); });
  secteurs.forEach(sc => {
    part(r, R, sc); ctx.fillStyle = "#fff"; ctx.fill(); ctx.strokeStyle = col(sc.pos); ctx.lineWidth = 5; ctx.lineJoin = "round"; ctx.stroke();
    if(sc.pos === "partage"){ ctx.save(); part(r, R, sc); ctx.clip(); ctx.strokeStyle = "rgba(107,111,128,0.22)"; ctx.lineWidth = 5; ctx.beginPath(); for(let k = -R; k < 2 * R; k += 20){ ctx.moveTo(cx - R + k, cy); ctx.lineTo(cx - R + k + R, cy - R); } ctx.stroke(); ctx.restore(); }
    part(r - 44, r - 20, sc); ctx.fillStyle = col(sc.pos); ctx.fill(); // arc de couleur sous le secteur
  });
  pose.forEach(q => {
    if(q.g.logo) ctx.drawImage(q.g.logo, q.px - q.w / 2, q.py - q.h / 2, q.w, q.h);
    else ecrire(ctx, q.g.id, q.px, q.py + q.asc / 2, { poids:900, taille:q.t, couleur:C.encre, align:"center", ls:1 });
  });
  // au centre de l'hémicycle : l'échelle gauche - droite (ordre des bancs de l'Assemblée) et, à part, les non-inscrits
  const k = Math.min(1, (r - 52) / 200), yE = cy - 56 * k - 4; // l'échelle se réduit avec l'hémicycle : elle reste à l'intérieur de l'arc de couleur
  ecrire(ctx, "GAUCHE", cx - 68 * k, yE, { poids:800, taille:Math.round(20 * k), couleur:C.encre, align:"right", ls:3 * k });
  ecrire(ctx, "DROITE", cx + 68 * k, yE, { poids:800, taille:Math.round(20 * k), couleur:C.encre, ls:3 * k });
  ctx.strokeStyle = C.encre; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx - 54 * k, yE - 8 * k); ctx.lineTo(cx + 54 * k, yE - 8 * k);
  ctx.moveTo(cx - 54 * k, yE - 8 * k); ctx.lineTo(cx - 44 * k, yE - 16 * k); ctx.moveTo(cx - 54 * k, yE - 8 * k); ctx.lineTo(cx - 44 * k, yE); ctx.moveTo(cx + 54 * k, yE - 8 * k); ctx.lineTo(cx + 44 * k, yE - 16 * k); ctx.moveTo(cx + 54 * k, yE - 8 * k); ctx.lineTo(cx + 44 * k, yE); ctx.stroke();
  if(ni){ const t = `Non-inscrits : ${ {pour:"pour", contre:"contre", abst:"abstention", partage:"partagés"}[ni.pos] }`; ecrire(ctx, t, cx, yE + 40 * k + 2, { poids:800, taille:Math.round(22 * Math.max(k, 0.8)), couleur:col(ni.pos), align:"center" }); }
  // étiquettes aux deux bouts
  const bg = secteurs[0], bd = secteurs[secteurs.length - 1];
  if(bg === bd) ecrire(ctx, MOT_BLOC[bg.pos], cx, cy + 50, { poids:900, taille:34, couleur:col(bg.pos), align:"center", ls:1 }); // un seul secteur : une seule étiquette
  else {
    ecrire(ctx, MOT_BLOC[bg.pos], cx - R + 4, cy + 50, { poids:900, taille:34, couleur:col(bg.pos), ls:1 });
    ecrire(ctx, MOT_BLOC[bd.pos], cx + R - 4, cy + 50, { poids:900, taille:34, couleur:col(bd.pos), align:"right", ls:1 });
  }

  // 3. « Ils ont voté » : verdict (pastille ✓ / ✕ et mot, jamais la couleur seule), puis le bilan chiffré
  const yI = cy + 96;
  ecrire(ctx, "ILS ONT VOTÉ", W / 2, yI, { poids:800, taille:24, couleur:BLANC.gris, align:"center", ls:4 });
  const tv = 96; let tg = 100;
  while(tg > 50 && mesure(ctx, mot, 800, tg, "Public Sans", -2) + tv + 30 > W - 2 * M) tg -= 4;
  const wMot = mesure(ctx, mot, 800, tg, "Public Sans", -2), x0 = (W - (tv + 30 + wMot)) / 2, yG = yI + 28 + tv * 0.84;
  storyBlancVerdict(ctx, adopte, x0, yI + 28, tv);
  ecrire(ctx, mot, x0 + tv + 30, yG, { poids:800, taille:tg, couleur:C.encre, ls:-2 });
  const bilan = [[fr(f.pour), "pour", C.pour], [fr(f.contre), "contre", C.contre], [fr(f.abst), f.abst > 1 ? "abstentions" : "abstention", C.abst]];
  let tb = 30; const larg = () => bilan.map(([n, m]) => mesure(ctx, n + " " + m, 700, tb)), espace = 34;
  while(tb > 18 && larg().reduce((t, w) => t + w, 0) + espace * 2 > W - 2 * M) tb -= 1;
  const lw = larg(); let x = (W - (lw.reduce((t, w) => t + w, 0) + espace * 2)) / 2;
  bilan.forEach(([n, m, c], k) => { ecrire(ctx, n, x, yI + 28 + tv + 44, { poids:800, taille:tb, couleur:c }); ecrire(ctx, " " + m, x + mesure(ctx, n, 800, tb), yI + 28 + tv + 44, { poids:600, taille:tb, couleur:BLANC.encre }); x += lw[k] + espace; });
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
