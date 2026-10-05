/* Module chargé à la demande (stories d'actualité) : voir chargerModule() dans index.html. */
/* Story d'un sujet d'actualité, style « bleu question / réponse » :
   - modèle A « À la une » (par défaut) : grand titre (le nôtre), citation de presse, portraits, contexte ;
   - modèle E « En direct » : fond sombre, grand titre, 2-3 citations de presse.
   info = indice du sujet dans ACTUALITES.sujets, éventuellement « <indice>:<modèle> » (une, direct, facea, chiffre, date).
   Tout est enfermé dans une fonction : les constantes ne doivent pas entrer en collision avec les autres modules d'actualité. */
(()=>{
const BLEU = "#1B3A8C", CIEL = "#C9D3FF", CREME = "#F5F1E8", ROUGE = "#C8102E", ROSE = "#FF6B7A", SOMBRE = "#12141C", POINT = "#FF4D5E";
const ENCRE = "#1C1B18", GRIS_CREME = "#625D53";
const norm = t => String(t || "").replace(/\s+/g, " ").trim();
const Y_HAUT = 392, Y_BAS = 1480; // zone de contenu (marque et étiquette au-dessus, pied en dessous)

/* ----- Outils ----- */
function parisFmt(iso, o){ return new Date(iso).toLocaleString("fr-FR", { timeZone:"Europe/Paris", ...o }); }
function heureFr(iso){ return parisFmt(iso, { hour:"2-digit", minute:"2-digit" }).replace(":", " h ").replace(/^0/, ""); }
// « 7 h 31 » le jour même, « 4 octobre · 22 h 10 » sinon
function quandFr(iso){
  const d = new Date(iso);
  if(isNaN(d)) return typeof ilYA === "function" ? ilYA(iso) : "";
  const jour = x => parisFmt(x, { day:"numeric", month:"numeric", year:"numeric" });
  return jour(d) === jour(new Date()) ? heureFr(iso) : `${parisFmt(iso, { day:"numeric", month:"long" })} · ${heureFr(iso)}`;
}
function rond(ctx, x, y, w, h, r){
  ctx.beginPath();
  if(ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
}
// Texte aligné au pixel, une ligne par entrée ; renvoie la hauteur utilisée
function lignes(ctx, ls, x, y, taille, interligne, couleur){
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ls.forEach((l, i)=>{ ctx.fillStyle = typeof couleur === "function" ? couleur(i) : couleur; ctx.fillText(l, x, y + taille * 0.82 + i * taille * interligne); });
  return (ls.length - 1) * taille * interligne + taille * 1.0;
}
// Citation « … » mise en lignes ; si elle est trop longue, on coupe aux mots et on termine par « … »
function guillemets(t){
  return String(t).replace(/«\s*/g, "\u201C").replace(/\s*»/g, "\u201D").replace(/"([^"]*)"/g, "\u201C$1\u201D").replace(/"/g, "");
}
function citation(ctx, titre, largeur, maxLignes){
  const mots = guillemets(norm(titre)).split(" ");
  let coupe = false;
  const fabrique = ()=> "« " + mots.join(" ").replace(/[\s,;:.\-–]+$/, "") + (coupe ? "…" : "") + " »";
  let ls = storyLignes(ctx, fabrique(), largeur, 99);
  while(ls.length > maxLignes && mots.length > 3){ mots.pop(); coupe = true; ls = storyLignes(ctx, fabrique(), largeur, 99); }
  return ls;
}
// Titre : le nôtre ; à défaut, la rubrique du thème sur une ligne et « à la une » (ou « en direct ») en rose dessous.
// Renvoie la plus grande taille (≤ tMax) pour laquelle il tient dans hMax, sans mot coupé.
function titreFit(ctx, d, largeur, hMax, tMax, tMin){
  const essai = t => {
    ctx.font = `700 ${t}px "Newsreader"`;
    const ls = d.propre ? storyLignes(ctx, d.texte, largeur, 99) : storyLignes(ctx, d.rub, largeur, 99).concat([d.suffixe]);
    return { t, ls, h:(ls.length - 1) * t * 1.04 + t, ok:ls.every(l=> ctx.measureText(l).width <= largeur), propre:d.propre };
  };
  let r;
  for(let t = tMax; t >= tMin; t -= 2){ r = essai(t); if(r.ok && r.h <= hMax) return r; }
  return r || essai(tMin);
}
const couleurTitre = r => i => (!r.propre && i === r.ls.length - 1) ? ROSE : "#fff";
function labelMarque(ctx, fond){
  const { marge } = STORY, cy = 260;
  ctx.fillStyle = fond; ctx.fillRect(0, 0, STORY.L, STORY.H);
  ctx.lineWidth = 7; ctx.lineCap = "round";
  ctx.strokeStyle = "#fff"; ctx.beginPath(); ctx.arc(marge + 34, cy + 6, 30, Math.PI, 0); ctx.stroke();
  ctx.strokeStyle = ROSE; ctx.beginPath(); ctx.arc(marge + 34, cy + 6, 15, Math.PI, 0); ctx.stroke();
  ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(marge + 34, cy + 6, 5, 0, 2 * Math.PI); ctx.fill();
  ctx.lineCap = "butt";
  ctx.font = `700 46px "Newsreader"`; ctx.fillStyle = "#fff"; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.fillText("Hémicycle France", marge + 86, cy + 12);
}
function etiquette(ctx, texte, x, y, fond, couleur = "#fff"){
  ctx.font = `800 26px "Public Sans"`; ctx.letterSpacing = "4px";
  const w = ctx.measureText(texte).width + 44 - 4, h = 54;
  ctx.fillStyle = fond; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = couleur; ctx.textBaseline = "middle"; ctx.textAlign = "left";
  ctx.fillText(texte, x + 22, y + h / 2 + 2);
  ctx.letterSpacing = "0px"; ctx.textBaseline = "alphabetic";
  return x + w;
}
function droite(ctx, texte, yMilieu, { taille = 26, poids = 700, couleur = CIEL, espace = "0px" } = {}){
  ctx.font = `${poids} ${taille}px "Public Sans"`; ctx.letterSpacing = espace;
  ctx.fillStyle = couleur; ctx.textAlign = "right"; ctx.textBaseline = "middle";
  ctx.fillText(texte, STORY.L - STORY.marge, yMilieu + 2);
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.letterSpacing = "0px";
}
// Pied : filet, « ▶ Vidéo : média » éventuel, source, compte
function pied(ctx, { source, video, couleurSource = CIEL, couleurCompte = "#fff", filet = "rgba(255,255,255,0.28)" }){
  const { L, marge } = STORY;
  ctx.fillStyle = filet; ctx.fillRect(marge, 1516, L - 2 * marge, 3);
  let y = 1542;
  if(video){
    ctx.font = `800 28px "Public Sans"`;
    const t = `Vidéo : ${video}`, tw = Math.min(ctx.measureText(t).width, L - 2 * marge - 50);
    ctx.fillStyle = couleurCompte;
    ctx.beginPath(); ctx.moveTo(marge, y + 6); ctx.lineTo(marge, y + 32); ctx.lineTo(marge + 24, y + 19); ctx.closePath(); ctx.fill();
    ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
    ctx.fillText(storyLignes(ctx, t, L - 2 * marge - 44, 1)[0], marge + 42, y + 29);
    y += 50;
    void tw;
  }
  const h = storyTexte(ctx, source, marge, y, { taille:23, couleur:couleurSource, max:2, interligne:1.2 });
  ctx.font = `800 34px "Public Sans"`; ctx.fillStyle = couleurCompte; ctx.textAlign = "left";
  ctx.fillText(COMPTE_STORY, marge, Math.max(h + 44, 1626));
}
function theme(s){ return THEMES_ACTU?.[s.illustration?.theme] || THEMES_ACTU?.politique || ["", "", "Vie politique"]; }
function enDirectDe(s){
  return (typeof DIRECT !== "undefined" && DIRECT?.evenements || []).some(e=> e.type !== "seance-an" && s.articles.some(a=> a.titre === e.titre));
}
function premiereVideo(s){ return s.articles.find(a=> a.video)?.media || ""; }
function titreDe(s, suffixe){
  const propre = norm(s.titrePropre?.titre);
  return { texte:propre, propre:!!propre, rub:theme(s)[2], suffixe };
}

/* ----- Portraits ----- */
async function personnes(s){
  const pers = (s.illustration?.personnes || []).slice(0, 3);
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
function carre(ctx, p, x, y, w, h){
  // portrait (ou initiales) dans le rectangle ; renvoie le rectangle réellement occupé, avec un filet rose en bas
  let z;
  if(p.img){
    const sauve = STORY.encre; STORY.encre = "#fff"; // cadre blanc si la photo est reproduite plus petite
    try { z = storyPPhoto(ctx, p.img, x, y, w, h, { centre:false }); } finally { STORY.encre = sauve; }
  } else {
    ctx.fillStyle = "#2F54B8"; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#fff"; ctx.font = `900 ${Math.round(Math.min(w, h) * 0.4)}px "Public Sans"`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(storyPInitiales(p.nom) || "?", x + w / 2, y + h / 2 + 4); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    z = { x, y, w, h };
  }
  ctx.fillStyle = ROSE; ctx.fillRect(z.x, z.y + z.h, z.w, 8);
  return { ...z, h:z.h + 8 };
}
// Mesure d'un bloc de portraits pour une hauteur de photo donnée
function mesurePortraits(ctx, pers, ph){
  const larg = STORY.L - 2 * STORY.marge, n = pers.length;
  if(n === 1) return { h: ph + 8, col: 0 };
  const gap = 28, col = (larg - gap * (n - 1)) / n, tn = n === 3 ? 34 : 40;
  ctx.font = `700 ${tn}px "Newsreader"`;
  const nl = Math.max(...pers.map(p=> storyLignes(ctx, p.nom, col, 2).length));
  const cred = pers.some(p=> p.credit && p.img) ? 56 : 0;
  const part = pers.some(p=> libelleParti(p.parti)) ? 34 : 0;
  return { h: ph + 8 + 14 + (nl - 1) * tn * 1.08 + tn + part + cred, col, gap, tn };
}
function dessinePortraits(ctx, pers, y, ph){
  const { marge, L } = STORY, larg = L - 2 * marge, n = pers.length, m = mesurePortraits(ctx, pers, ph);
  if(n === 1){
    const p = pers[0], taille = Math.min(ph, 460);
    const z = carre(ctx, p, marge, y, Math.round(taille * 0.9), taille);
    const x0 = z.x + z.w + 44, w = L - marge - x0;
    let yy = y + 6;
    ctx.font = `700 54px "Newsreader"`;
    const ls = storyLignes(ctx, p.nom, w, 3);
    yy += lignes(ctx, ls, x0, yy, 54, 1.06, "#fff") + 12;
    const part = libelleParti(p.parti);
    if(part){ ctx.font = `700 26px "Public Sans"`; ctx.fillStyle = CIEL; ctx.fillText(storyLignes(ctx, part, w, 1)[0], x0, yy + 24); yy += 40; }
    if(p.credit && p.img){ ctx.font = `600 22px "Public Sans"`; const cl = storyLignes(ctx, `Photo : ${p.credit}`, w, 3); yy += 6; lignes(ctx, cl, x0, yy, 22, 1.25, CIEL); }
    return Math.max(z.h, 0) ;
  }
  pers.forEach((p, i)=>{
    const x = marge + i * (m.col + m.gap);
    const z = carre(ctx, p, x, y, Math.min(m.col, Math.round(ph * 0.95)), ph);
    let yy = z.y + z.h + 14;
    ctx.font = `700 ${m.tn}px "Newsreader"`;
    const ls = storyLignes(ctx, p.nom, m.col, 2);
    yy += lignes(ctx, ls, x, yy, m.tn, 1.08, "#fff");
    const part = libelleParti(p.parti);
    if(part){ ctx.font = `700 24px "Public Sans"`; ctx.fillStyle = CIEL; ctx.fillText(storyLignes(ctx, part, m.col, 1)[0], x, yy + 28); }
    if(p.credit && p.img){ ctx.font = `600 22px "Public Sans"`; lignes(ctx, storyLignes(ctx, `Photo : ${p.credit}`, m.col, 2), x, yy + (part ? 44 : 14), 22, 1.25, CIEL); }
  });
  return m.h;
}

/* ----- Contexte ----- */
function mesureContexte(ctx, items, largeur){
  if(!items.length) return { h:0, ls:[] };
  const ls = items.map(c=>{
    ctx.font = `700 28px "Public Sans"`;
    const t = storyLignes(ctx, norm(c.texte), largeur - 64, 3);
    ctx.font = `600 22px "Public Sans"`;
    const s = c.source ? storyLignes(ctx, norm(c.source), largeur - 64, 1) : [];
    return { t, s };
  });
  const h = 30 + 34 + ls.reduce((a, l)=> a + l.t.length * 36 + (l.s.length ? 32 : 0) + 18, 0) + 12;
  return { h, ls };
}
function dessineContexte(ctx, m, y){
  const { marge } = STORY, larg = STORY.L - 2 * marge;
  ctx.fillStyle = CREME; rond(ctx, marge, y, larg, m.h, 22); ctx.fill();
  ctx.font = `800 22px "Public Sans"`; ctx.letterSpacing = "3px"; ctx.fillStyle = BLEU; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.fillText("LE CONTEXTE", marge + 32, y + 30 + 20); ctx.letterSpacing = "0px";
  let yy = y + 30 + 34 + 8;
  m.ls.forEach((l, i)=>{
    if(i){ ctx.fillStyle = "#D3CBBA"; ctx.fillRect(marge + 32, yy - 10, larg - 64, 2); }
    ctx.font = `700 28px "Public Sans"`;
    yy += lignes(ctx, l.t, marge + 32, yy, 28, 1.28, ENCRE) + 6;
    if(l.s.length){ ctx.font = `600 22px "Public Sans"`; ctx.fillStyle = GRIS_CREME; ctx.fillText(l.s[0], marge + 32, yy + 18); yy += 32; }
    yy += 18;
  });
}

/* ----- Modèle A : « À la une » ----- */
async function dessineUne(ctx, s){
  const { L, marge } = STORY, larg = L - 2 * marge, a0 = s.articles[0];
  const medias = [...new Set(s.articles.map(a=> a.media))], n = medias.length;
  const dT = titreDe(s, "à la une"), propre = dT.propre;
  const pers = await personnes(s);
  const video = premiereVideo(s);
  const contexte = (s.contexte || []).filter(c=> norm(c.texte));

  // en-tête
  labelMarque(ctx, BLEU);
  const xe = etiquette(ctx, "À LA UNE", marge, 310, ROUGE);
  ctx.font = `600 28px "Public Sans"`; ctx.fillStyle = CIEL; ctx.textBaseline = "middle"; ctx.textAlign = "left";
  ctx.fillText(quandFr(a0.date), xe + 22, 310 + 27 + 2); ctx.textBaseline = "alphabetic";
  droite(ctx, theme(s)[2].toUpperCase(), 310 + 27, { taille:24, poids:800, couleur:CIEL, espace:"3px" });

  // citation (grande quand le titre n'est pas le nôtre : c'est alors le seul texte du sujet)
  const tQuote = propre ? (pers.length ? 36 : 52) : (pers.length ? 46 : 52), xq = marge + 36, lq = larg - 36;
  // reprise (discrète)
  let reprise = "";
  if(n >= 2){
    ctx.font = `700 26px "Public Sans"`;
    reprise = storyLignes(ctx, `Repris par ${n} médias · ${medias.join(", ")}`, larg, 1)[0];
  }
  const mediaQuote = norm(a0.media);

  // niveaux de compacité : on réduit d'abord la citation, puis le contexte
  const niveaux = [
    { lq:pers.length ? 3 : 4, ctx:contexte.slice(0, 2) }, { lq:3, ctx:contexte.slice(0, 2) }, { lq:2, ctx:contexte.slice(0, 2) }, { lq:2, ctx:contexte.slice(0, 1) }, { lq:2, ctx:[] }
  ];
  let plan = null;
  for(const nv of niveaux){
    ctx.font = `600 ${tQuote}px "Newsreader"`;
    const ql = citation(ctx, a0.titre, lq, nv.lq);
    const hq = (ql.length - 1) * tQuote * 1.16 + tQuote + 10 + 34;       // + ligne du média
    const hr = reprise ? 26 + 12 : 0;
    const mc = mesureContexte(ctx, nv.ctx, larg);
    const blocs = 1 + (pers.length ? 1 : 0) + (mc.h ? 1 : 0) + 1;          // titre, portraits, contexte, citation
    const gap = 40, fixe = hq + hr + mc.h + gap * (blocs - 1);
    const dispo = Y_BAS - Y_HAUT;
    const tMax = propre ? (pers.length ? 112 : 190) : 96;
    const tMin = 64;
    const phMax = 420, phMin = pers.length === 1 ? 300 : 280;
    let choix = null;
    for(let t = tMax; t >= tMin && !choix; t -= 2){
      const f = titreFit(ctx, dT, larg, 9999, t, t);
      const rest = dispo - fixe - f.h;
      if(!pers.length){ if(rest >= 0) choix = { f, ph:0, mc, ql, hq, hr, gap, rest }; continue; }
      let ph = Math.min(phMax, rest);
      // retire la hauteur des légendes pour obtenir la hauteur de photo
      const m0 = mesurePortraits(ctx, pers, 0);
      ph = Math.min(phMax, rest - m0.h);
      if(ph >= phMin) choix = { f, ph, mc, ql, hq, hr, gap, rest };
    }
    if(choix){ plan = { ...choix, nv }; break; }
    if(nv === niveaux[niveaux.length - 1]){
      // dernier recours : titre minimal, photos réduites
      const f = titreFit(ctx, dT, larg, 9999, tMin, tMin);
      const m0 = mesurePortraits(ctx, pers, 0);
      plan = { f, ph: pers.length ? Math.max(160, Math.min(phMax, dispo - fixe - f.h - m0.h)) : 0, mc, ql, hq, hr, gap, rest:0, nv };
    }
  }

  // dessin de haut en bas
  let y = Y_HAUT;
  const hpers = pers.length ? mesurePortraits(ctx, pers, plan.ph).h : 0;
  const utilise = plan.f.h + (pers.length ? hpers : 0) + plan.hq + plan.hr + plan.mc.h + plan.gap * (1 + (pers.length ? 1 : 0) + (plan.mc.h ? 1 : 0));
  const extra = Math.max(0, Y_BAS - Y_HAUT - utilise);
  // sans portrait, la citation (et le contexte) descendent vers le pied : grand titre en haut, réponse en bas
  const ecart = pers.length ? Math.min(extra / 3, 50) : extra;
  const decale = pers.length ? 0 : Math.max(0, ecart - 140) * 0.45;
  y += decale;
  ctx.font = `700 ${plan.f.t}px "Newsreader"`;
  y += lignes(ctx, plan.f.ls, marge, y, plan.f.t, 1.04, couleurTitre(plan.f)) + plan.gap + (pers.length ? 0 : Math.min(ecart, 140));
  if(pers.length){
    dessinePortraits(ctx, pers, y, plan.ph);
    y += hpers + plan.gap + ecart;
  }
  // citation : filet rose à gauche, texte puis média
  ctx.font = `600 ${tQuote}px "Newsreader"`;
  const yq = y;
  const hq = lignes(ctx, plan.ql, xq, y, tQuote, 1.16, "#fff");
  ctx.font = `800 26px "Public Sans"`; ctx.fillStyle = ROSE; ctx.letterSpacing = "1px";
  ctx.fillText(storyLignes(ctx, `— ${mediaQuote}`, lq, 1)[0], xq, y + hq + 10 + 24); ctx.letterSpacing = "0px";
  const yFinQ = y + hq + 10 + 34;
  ctx.fillStyle = ROSE; ctx.fillRect(marge, yq, 8, yFinQ - yq);
  y = yFinQ;
  if(reprise){ ctx.font = `600 26px "Public Sans"`; ctx.fillStyle = CIEL; ctx.fillText(reprise, marge, y + 14 + 26); y += 12 + 26 + 2; }
  if(plan.mc.h){ y += plan.gap; dessineContexte(ctx, plan.mc, y); }

  pied(ctx, { source:"Titres relevés dans la presse. Chaque média est cité.", video });
  return { nom:`actualite-${slugDep(norm(s.titrePropre?.titre) || a0.titre).slice(0, 40)}` };
}

/* ----- Modèle E : « En direct » ----- */
async function dessineDirect(ctx, s){
  const { L, marge } = STORY, larg = L - 2 * marge;
  const dT = titreDe(s, "en direct");
  const video = premiereVideo(s);
  const maj = s.derniere || s.articles.map(a=> a.date).sort().pop();
  const GRIS = "#8A93B0", CLAIR = "#B6BEDB";

  labelMarque(ctx, SOMBRE);
  // point rouge (avec halo) + EN DIRECT + heure de mise à jour
  ctx.fillStyle = "rgba(255,77,94,0.28)"; ctx.beginPath(); ctx.arc(marge + 16, 337, 24, 0, 2 * Math.PI); ctx.fill();
  ctx.fillStyle = POINT; ctx.beginPath(); ctx.arc(marge + 16, 337, 14, 0, 2 * Math.PI); ctx.fill();
  ctx.font = `800 54px "Public Sans"`; ctx.letterSpacing = "5px"; ctx.fillStyle = ROSE; ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillText("EN DIRECT", marge + 52, 337 + 3); ctx.letterSpacing = "0px"; ctx.textBaseline = "alphabetic";
  droite(ctx, `mis à jour ${heureFr(maj)}`, 337, { taille:28, poids:700, couleur:GRIS });

  // citations : un titre par groupe de titres identiques (médias réunis), les plus récents d'abord
  const groupes = [];
  for(const a of [...s.articles].sort((x, y)=> String(y.date).localeCompare(String(x.date)))){
    const cle = norm(a.titre).toLowerCase();
    const g = groupes.find(x=> x.cle === cle);
    if(g){ if(!g.medias.includes(a.media)) g.medias.push(a.media); } else groupes.push({ cle, titre:norm(a.titre), medias:[a.media] });
  }
  const cites = groupes.slice(0, 3);

  // le titre prend le reste de la place (jusqu'à 112 px) ; les citations se resserrent si besoin
  let plan = null;
  const dispo = Y_BAS - 410;
  const options = [[42, 3], [40, 3], [38, 3], [36, 3], [34, 3], [32, 2], [30, 2]];
  for(const [tq, mq] of options){
    ctx.font = `700 ${tq}px "Public Sans"`;
    const bl = cites.map(c=>{ const ls = citation(ctx, c.titre, larg - 36, mq); return { ...c, ls, h: 26 + (ls.length - 1) * tq * 1.24 + tq + 10 + 28 + 26 }; });
    const hc = bl.reduce((a, b)=> a + b.h, 0);
    const f = titreFit(ctx, dT, larg, dispo - hc - 50, 112, 64);
    plan = { bl, f, tq };
    if(f.h + 50 + hc <= dispo && f.t >= 96) break;
  }
  let y = 410;
  ctx.font = `700 ${plan.f.t}px "Newsreader"`;
  y += lignes(ctx, plan.f.ls, marge, y, plan.f.t, 1.04, couleurTitre(plan.f)) + 46;
  for(const b of plan.bl){
    ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.fillRect(marge, y, larg, 2);
    ctx.fillStyle = ROSE; ctx.beginPath(); ctx.arc(marge + 8, y + 26 + plan.tq * 0.5, 7, 0, 2 * Math.PI); ctx.fill();
    ctx.font = `700 ${plan.tq}px "Public Sans"`;
    const h = lignes(ctx, b.ls, marge + 36, y + 26, plan.tq, 1.24, "#fff");
    ctx.font = `700 26px "Public Sans"`; ctx.fillStyle = CLAIR;
    ctx.fillText(storyLignes(ctx, b.medias.join(" · "), larg - 36, 1)[0], marge + 36, y + 26 + h + 10 + 24);
    y += b.h;
  }

  pied(ctx, { source:"Information en cours : elle peut changer. Titres relevés dans la presse.", video, couleurSource:GRIS, couleurCompte:"#A9B8F2", filet:"rgba(255,255,255,0.18)" });
  return { nom:`actualite-${slugDep(norm(s.titrePropre?.titre) || s.articles[0].titre).slice(0, 40)}` };
}

/* ----- Point d'entrée et aiguillage ----- */
STORY_PLUS.actualite = async (ctx, info)=>{
  const [ind, force] = String(info ?? "").split(":");
  const s = ACTUALITES?.sujets?.[Number(ind)];
  if(!s?.articles?.length) return null;
  const nbPers = (s.illustration?.personnes || []).length;
  let modele = force || "";
  if(!["une", "direct", "facea", "chiffre", "date"].includes(modele)){
    modele = enDirectDe(s) ? "direct"
      : nbPers >= 2 && STORY_PLUS.facea ? "facea"
      : s.chiffre && STORY_PLUS.chiffre ? "chiffre"
      : s.date && STORY_PLUS.date ? "date"
      : "une";
  }
  if(["facea", "chiffre", "date"].includes(modele) && STORY_PLUS[modele]){
    const r = await STORY_PLUS[modele](ctx, String(Number(ind)));
    if(r) return r;
  }
  return modele === "direct" ? dessineDirect(ctx, s) : dessineUne(ctx, s);
};
})();
