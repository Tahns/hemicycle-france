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
  const ni = gs.find(g => g.id === "NI"); // les non-inscrits n'ont pas de place sur l'échelle gauche-droite : ils sont indiqués à part, au centre
  if(ni && gs.length > 1) gs.splice(gs.indexOf(ni), 1);
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
  const R = Math.min(W / 2 - 50, 480), r = R * 0.52, GAP = 16, cx = W / 2; // GAP : écart constant (en pixels) entre deux secteurs, quel que soit le rayon
  const mot = (censure ? (adopte ? "ADOPTÉE" : "REJETÉE") : (adopte ? "POUR" : "CONTRE"));
  const yIoff = post ? 110 : 130;
  let tg = post ? 200 : 220; while(tg > 100 && mesure(ctx, mot, 900, tg, "Public Sans", -3) > W - 120) tg -= 6;
  ctx.font = `900 ${tg}px "Public Sans"`; ctx.letterSpacing = "-3px"; const ascMot = ctx.measureText(mot).actualBoundingBoxAscent; ctx.letterSpacing = "0px";
  const hDessous = yIoff + 36 + ascMot + 56 + 26; // du centre de l'hémicycle au bas de la ligne « pour / contre / abstention »
  const cyMax = yPied - hDessous;
  // titre : le plus grand corps qui tienne en 3 lignes (4 ou 5 en dernier recours), sans coupure et sans toucher l'hémicycle
  let tt = post ? 64 : 70, lignes, bas0;
  for(; tt >= 24; tt -= 2){
    ctx.font = `900 ${tt}px "Public Sans"`; lignes = storyLignes(ctx, String(f.titre).toUpperCase(), W - 2 * 60, 5);
    bas0 = y + 48 + tt + (lignes.length - 1) * tt * 1.08 + tt * 0.25;
    if((lignes.length <= 3 || tt < 34) && !lignes.some(l => l.endsWith("…")) && bas0 + 44 <= cyMax - R) break;
  }
  y += 48 + tt;
  lignes.forEach((ln, k) => ecrire(ctx, ln, W / 2, y + k * tt * 1.08, { poids:900, taille:tt, couleur:C.encre, align:"center", ls:-1 }));
  y += (lignes.length - 1) * tt * 1.08;

  // 2. secteurs : groupes voisins de même position réunis, coupés en secteurs de 4 groupes au plus
  const blocs = [];
  gs.forEach(g => { const d = blocs[blocs.length - 1]; if(d && d.pos === g.pos) d.g.push(g); else blocs.push({ pos:g.pos, g:[g] }); });
  const secteurs = blocs.map(b => ({ pos:b.pos, g:b.g })); // un seul secteur par position : jamais de coupure à l'intérieur d'un « pour » ou d'un « contre »
  const poids = sc => sc.g.reduce((t, g) => t + 0.8 + 0.2 * g.n / total * gs.length, 0), somme = secteurs.reduce((t, sc) => t + poids(sc), 0);
  let a = Math.PI; secteurs.forEach(sc => { sc.a0 = a; a += Math.PI * poids(sc) / somme; sc.a1 = a; sc.am = (sc.a0 + sc.a1) / 2; const tot = poids(sc); let u = sc.a0; sc.g.forEach(g => { const w = (sc.a1 - sc.a0) * (0.8 + 0.2 * g.n / total * gs.length) / tot; g.a0 = u; u += w; g.a1 = u; }); });
  const cy = Math.round(Math.min(Math.max(y + 50 + R, bas0 + 44 + R), cyMax));
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
  const yE = cy - 60;
  ecrire(ctx, "GAUCHE", cx - 68, yE, { poids:800, taille:20, couleur:C.encre, align:"right", ls:3 });
  ecrire(ctx, "DROITE", cx + 68, yE, { poids:800, taille:20, couleur:C.encre, ls:3 });
  ctx.strokeStyle = C.encre; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx - 54, yE - 8); ctx.lineTo(cx + 54, yE - 8);
  ctx.moveTo(cx - 54, yE - 8); ctx.lineTo(cx - 44, yE - 16); ctx.moveTo(cx - 54, yE - 8); ctx.lineTo(cx - 44, yE); ctx.moveTo(cx + 54, yE - 8); ctx.lineTo(cx + 44, yE - 16); ctx.moveTo(cx + 54, yE - 8); ctx.lineTo(cx + 44, yE); ctx.stroke();
  if(ni){ const t = `Non-inscrits : ${ {pour:"pour", contre:"contre", abst:"abstention", partage:"partagés"}[ni.pos] }`; ecrire(ctx, t, cx, yE + 40, { poids:800, taille:22, couleur:col(ni.pos), align:"center" }); }
  // étiquettes aux deux bouts
  const bg = secteurs[0], bd = secteurs[secteurs.length - 1];
  if(bg === bd) ecrire(ctx, MOT_BLOC[bg.pos], cx, cy + 50, { poids:900, taille:34, couleur:col(bg.pos), align:"center", ls:1 }); // un seul secteur : une seule étiquette
  else {
    ecrire(ctx, MOT_BLOC[bg.pos], cx - R + 4, cy + 50, { poids:900, taille:34, couleur:col(bg.pos), ls:1 });
    ecrire(ctx, MOT_BLOC[bd.pos], cx + R - 4, cy + 50, { poids:900, taille:34, couleur:col(bd.pos), align:"right", ls:1 });
  }

  // 3. « Ils ont voté » et le mot géant
  const yI = cy + yIoff;
  ecrire(ctx, "Ils ont voté", W / 2, yI, { poids:900, taille:post ? 52 : 58, couleur:C.encre, align:"center" });
  const yG = yI + 36 + ascMot;
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
  const wPied = W - 430 - 40; // largeur disponible à droite du filet
  const ajuste = (txt, poids, t0, tMin) => { let t = t0; while(t > tMin && mesure(ctx, txt, poids, t) > wPied) t -= 1; if(mesure(ctx, txt, poids, t) > wPied){ while(txt.length > 3 && mesure(ctx, txt + "…", poids, t) > wPied) txt = txt.slice(0, -1); txt = txt.trimEnd() + "…"; } return { txt, t }; };
  const ligneDate = ajuste(dateTxt, 900, 36, 24);
  ecrire(ctx, ligneDate.txt, 430, yPied + 70, { poids:900, taille:ligneDate.t, couleur:C.encre });
  const ligneAuteur = ajuste(f.auteur ? `Texte de ${f.auteur}` : "Position majoritaire de chaque groupe", 600, 24, 16);
  ecrire(ctx, ligneAuteur.txt, 430, yPied + 104, { poids:600, taille:ligneAuteur.t, couleur:"#4A4D57" });
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
