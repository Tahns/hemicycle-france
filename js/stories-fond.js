/* Module chargé à la demande (dessin des stories et des posts) : voir chargerModule() dans index.html.
   FONDS GÉNÉRÉS pour les images sans photo : aucune ressource externe, tout est dessiné dans le canvas.
   Un fond = dégradé travaillé de la couleur du thème (assourdie ; bleu #1B3A8C pour la politique générale), grands arcs concentriques d'hémicycle
   (la forme du logo) en filigrane, motif discret de « sièges » (points) et léger grain. 8 compositions, choisies de façon déterministe par un hash
   du thème et de la clé (titre ou identifiant) : deux images voisines ne se ressemblent pas, la même image donne toujours le même fond.
   Lisibilité : la somme de tout ce qui éclaircit le fond (ou l'assombrit, pour un texte sombre) est plafonnée par calcul pour que le texte
   (blanc et bleu clair, ou encre) garde un contraste d'au moins 4,5:1 PARTOUT, quel que soit le thème.
   Aucun pictogramme, aucune photo, aucun Math.random() : un générateur à graine (mulberry32).

   storyFondGenere(ctx, { theme, cle, largeur, hauteur, sombre, couleur, textes, y0 })
        -> dessine le fond en (0, y0), largeur × hauteur (par défaut 1080 × hauteur du canvas) ; renvoie { variante, base }
   storyFondContexte({ theme, cle }) / storyFondContexteLire()
        -> thème et clé employés par storyFondTheme (fond de TOUS les modèles) tant qu'ils ne sont pas précisés par le modèle */

const STORY_FOND_COULEURS = { // thèmes absents de THEMES_ACTU (index.html) ; couleurs sobres, sans lien avec un parti
  economie:"#2B6E6A", education:"#9A5B2B", region:"#3C7A3E", ecologie:"#2E7D4F", sante:"#0F7C8C", travail:"#8A4B3A",
  europe:"#2F5FB0", defense:"#4A5568", culture:"#7A3E7E", logement:"#7A6A2E", transport:"#2B6E8C", agriculture:"#5E7A2E", numerique:"#4A4FB0",
};
const STORY_FOND_AUTRES = ["#2B6E6A", "#9A5B2B", "#3C7A3E", "#7A3E7E", "#2B6E8C", "#7A6A2E"];
let STORY_FOND_CTX = { theme:"politique", cle:"" };
function storyFondContexte(c){ STORY_FOND_CTX = { theme:String((c && c.theme) || "politique"), cle:String((c && c.cle) || "") }; }
function storyFondContexteLire(){ return STORY_FOND_CTX; }

// Hash FNV-1a puis générateur mulberry32 : mêmes entrées, mêmes nombres
function storyFondHash(t){ let h = 2166136261; t = String(t); for(let i = 0; i < t.length; i++){ h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function storyFondAlea(graine){
  let a = graine >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// Couleur de base d'un thème : bleu de la charte pour la politique générale, sinon la couleur du thème
function storyFondCouleurTheme(theme){
  if(!theme || theme === "politique" || theme === "election") return "#1B3A8C";
  const t = typeof THEMES_ACTU !== "undefined" && THEMES_ACTU[theme];
  if(t && t[0]) return t[0];
  return STORY_FOND_COULEURS[theme] || STORY_FOND_AUTRES[storyFondHash(theme) % STORY_FOND_AUTRES.length];
}
const storyFondContraste = (a, b) => storyContraste(a, b);
// Plus forte opacité (0..0,6) à laquelle « teinte » posée sur « base » laisse à CHAQUE texte un contraste ≥ mini
function storyFondAlphaMax(base, teinte, textes, mini){
  const ok = a => { const c = storyMelange(base, teinte, a); return textes.every(t => storyContraste(t, c) >= mini); };
  if(!ok(0)) return 0;
  let lo = 0, hi = 0.6;
  if(ok(hi)) return hi;
  for(let i = 0; i < 12; i++){ const m = (lo + hi) / 2; if(ok(m)) lo = m; else hi = m; }
  return lo;
}
const STORY_FOND_GRAIN = {};
function storyFondTuileGrain(clair){
  const k = clair ? "c" : "s";
  if(STORY_FOND_GRAIN[k]) return STORY_FOND_GRAIN[k];
  const n = 192, c = document.createElement("canvas"); c.width = c.height = n;
  const x = c.getContext("2d"), im = x.createImageData(n, n), r = storyFondAlea(clair ? 20240917 : 17092024);
  for(let i = 0; i < n * n; i++){
    im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = clair ? 255 : 0;
    im.data[i * 4 + 3] = r() < 0.5 ? 0 : Math.round(r() * 255); // la moitié des points est muette ; l'opacité globale plafonne le reste
  }
  x.putImageData(im, 0, 0);
  return (STORY_FOND_GRAIN[k] = x.createPattern(c, "repeat"));
}

/* Compositions : centre des arcs (fractions de la largeur et de la hauteur), sens du dégradé, coin des sièges.
   arcs : nombre de rangées, rayon de départ et pas (en fractions de la largeur). */
const STORY_FOND_VARIANTES = [
  { nom:"arcs en haut à droite", cx:1.0,  cy:0.07, r0:0.30, pas:0.17, rangs:8, sens:[1, 0, 0, 1],     sieges:{ x:0.18, y:0.93, r:0.30, rangs:5, bas:true } },
  { nom:"arcs en bas à gauche",  cx:0.0,  cy:0.96, r0:0.30, pas:0.17, rangs:8, sens:[0, 1, 1, 0],     sieges:{ x:0.86, y:0.14, r:0.26, rangs:4, bas:false } },
  { nom:"arcs centrés en bas",   cx:0.5,  cy:0.80, r0:0.26, pas:0.19, rangs:7, sens:[0.5, 0.9, 0.5, 0], sieges:{ x:0.5,  y:0.985, r:0.34, rangs:5, bas:true } },
  { nom:"bandes diagonales",     cx:0.5,  cy:0.5,  r0:0.0,  pas:0.0,  rangs:0, sens:[0, 0, 1, 1],     sieges:{ x:0.82, y:0.97, r:0.36, rangs:6, bas:true } },
  { nom:"arcs en haut à gauche", cx:0.0,  cy:0.10, r0:0.28, pas:0.18, rangs:8, sens:[0, 0, 1, 1],     sieges:{ x:0.86, y:0.96, r:0.34, rangs:5, bas:true } },
  { nom:"hémicycle de sièges",   cx:0.5,  cy:0.90, r0:0.50, pas:0.28, rangs:3, sens:[0.5, 1, 0.5, 0.1], sieges:{ x:0.5,  y:0.90, r:0.74, rangs:9, bas:true, grand:true } },
  { nom:"arcs au bord droit",    cx:1.06, cy:0.52, r0:0.26, pas:0.17, rangs:8, sens:[1, 0.4, 0, 0.9], sieges:{ x:0.12, y:0.97, r:0.32, rangs:5, bas:true } },
  { nom:"arcs opposés",          cx:1.0,  cy:0.0,  r0:0.24, pas:0.16, rangs:6, sens:[1, 0, 0, 1],     sieges:{ x:0.0,  y:1.0,  r:0.50, rangs:6, bas:true, deuxieme:true } },
];

// Rangées de sièges (points) sur un demi-cercle ou un quart de cercle ; « bas » : ouvert vers le haut
function storySiegesRangs(ctx, W, H, p, teinte, alpha, rnd){
  const cx = p.x * W, cy = p.y * H, R = p.r * W, dr = R / (p.rangs + 1.2);
  ctx.fillStyle = storyAlpha(teinte, alpha);
  for(let i = 0; i < p.rangs; i++){
    const r = dr * (i + 1.2), n = Math.max(8, Math.floor(Math.PI * r / (dr * 0.95))), pt = Math.max(3, dr * 0.2);
    const a0 = p.bas ? Math.PI : 0, a1 = p.bas ? 2 * Math.PI : Math.PI;
    for(let k = 0; k < n; k++){
      const a = a0 + (a1 - a0) * (n === 1 ? 0.5 : k / (n - 1));
      if(rnd() < 0.06) continue; // quelques sièges vides, comme dans une salle
      ctx.beginPath(); ctx.arc(cx + r * Math.cos(a), cy + r * Math.sin(a), pt, 0, 2 * Math.PI); ctx.fill();
    }
  }
}

function storyFondGenere(ctx, o = {}){
  const W = o.largeur || STORY.L, H = o.hauteur || (ctx.canvas && ctx.canvas.height) || STORY.H, y0 = o.y0 || 0;
  const theme = o.theme || "politique", cle = o.cle == null ? "" : o.cle;
  const graine = storyFondHash(`${theme}|${cle}`), rnd = storyFondAlea(graine);
  const v = STORY_FOND_VARIANTES[graine % STORY_FOND_VARIANTES.length];
  // 1. couleurs : base du thème (ou couleur imposée), texte clair ou sombre selon le contraste
  let base = o.couleur && /^#[0-9a-f]{6}$/i.test(o.couleur) ? o.couleur : storyFondCouleurTheme(theme);
  const imposee = Boolean(o.couleur);
  let textes = (o.textes && o.textes.length) ? o.textes : ["#FFFFFF", STORY_DA.ciel];
  if(!imposee){
    // fond assourdi : mélangé à la nuit puis assombri jusqu'à ce que blanc ET bleu clair gardent plus de 5,5:1
    base = storyMelange(base, STORY_DA.nuit, o.sombre ? 0.8 : 0.34);
    for(let i = 0; i < 20 && textes.some(t => storyContraste(t, base) < 5.5); i++) base = storyMelange(base, "#000000", 0.06);
  }
  const texteClair = textes.every(t => storyLuminance(t) > 0.18) || storyContraste(textes[0], base) > storyContraste("#1C1B18", base);
  const lumiere = texteClair ? storyMelange(base, "#FFFFFF", 0.6) : "#000000";   // ce qui rapproche le fond du texte : plafonné
  const ombre = texteClair ? "#000000" : "#FFFFFF";                               // ce qui éloigne le fond du texte : libre
  const amax = storyFondAlphaMax(base, lumiere, textes, 4.7);                     // budget de lumière total
  const part = { lueur:0.32, filets:0.30, sieges:0.26, grain:0.12 };              // somme = 1 : cumul toujours dans le budget
  const fin = texteClair ? storyMelange(base, STORY_DA.nuit, 0.62) : storyMelange(base, "#000000", 0.18);
  ctx.save();
  ctx.beginPath(); ctx.rect(0, y0, W, H); ctx.clip();
  ctx.translate(0, y0);
  // 2. dégradé de fond : de la base vers une teinte plus profonde, sens propre à la composition
  const g = ctx.createLinearGradient(W * v.sens[0], H * v.sens[1], W * v.sens[2], H * v.sens[3]);
  g.addColorStop(0, base); g.addColorStop(0.55, storyMelange(base, fin, 0.45)); g.addColorStop(1, fin);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // 3. lueur douce au centre des arcs
  const cx = v.cx * W, cy = v.cy * H;
  const lueur = ctx.createRadialGradient(cx, cy, 0, cx, cy, W * 1.05);
  lueur.addColorStop(0, storyAlpha(lumiere, amax * part.lueur)); lueur.addColorStop(1, storyAlpha(lumiere, 0));
  ctx.fillStyle = lueur; ctx.fillRect(0, 0, W, H);
  // 4. composition : rangées d'arcs concentriques (bandes sombres + filets clairs) ou bandes diagonales
  const phase = rnd();
  const A0 = v.cy > 0.7 ? Math.PI : 0, A1 = v.cy > 0.7 ? 2 * Math.PI : 2 * Math.PI; // centre en bas : demi-cercles ouverts vers le haut, comme l'hémicycle du logo
  if(v.rangs){
    for(let i = 0; i < v.rangs; i++){
      const r = (v.r0 + i * v.pas) * W, e = W * (0.045 + 0.02 * ((i + Math.round(phase * 3)) % 3));
      if(i % 2 === 0){ // bande pleine, plus sombre (un rang sur deux), opacité décroissante vers l'extérieur
        ctx.beginPath(); ctx.arc(cx, cy, r + e, A0, A1); ctx.arc(cx, cy, r, A1, A0, true); ctx.closePath();
        ctx.fillStyle = storyAlpha(ombre, (texteClair ? 0.20 : 0.07) * (1 - i / (v.rangs + 2))); ctx.fill("evenodd");
      }
      ctx.lineWidth = i % 3 === 0 ? 5 : 3;
      ctx.strokeStyle = storyAlpha(lumiere, amax * part.filets * (1 - 0.6 * i / v.rangs));
      ctx.beginPath(); ctx.arc(cx, cy, r, A0, A1); ctx.stroke();
    }
    if(v.sieges.deuxieme){ // deuxième foyer d'arcs, plus petit, dans le coin opposé
      const c2x = 0, c2y = H;
      for(let i = 0; i < 5; i++){
        const r = (0.20 + i * 0.15) * W;
        ctx.lineWidth = 3; ctx.strokeStyle = storyAlpha(lumiere, amax * part.filets * 0.8 * (1 - i / 6));
        ctx.beginPath(); ctx.arc(c2x, c2y, r, 0, 2 * Math.PI); ctx.stroke();
      }
    }
  } else {
    // bandes diagonales : parallélogrammes sombres de largeurs variées + filets clairs
    const inc = -0.42 - rnd() * 0.18, pas = W * 0.34;
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(Math.atan(inc));
    const D = Math.hypot(W, H);
    for(let k = -6; k <= 6; k++){
      const x = k * pas + phase * pas, e = pas * (0.22 + 0.16 * ((k + 6) % 3) / 2);
      ctx.fillStyle = storyAlpha(ombre, (texteClair ? 0.16 : 0.06) * (k % 2 ? 1 : 0.6)); ctx.fillRect(x, -D, e, 2 * D);
      ctx.fillStyle = storyAlpha(lumiere, amax * part.filets * 0.9); ctx.fillRect(x + e, -D, 4, 2 * D);
    }
    ctx.restore();
  }
  // 5. sièges (points) en bas ou en coin
  storySiegesRangs(ctx, W, H, v.sieges, lumiere, amax * part.sieges, rnd);
  // 6. grain : points « éloignant du texte » libres, points « rapprochant du texte » plafonnés par le budget
  ctx.globalAlpha = 0.13; ctx.fillStyle = storyFondTuileGrain(!texteClair); ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = Math.min(0.13, amax * part.grain); ctx.fillStyle = storyFondTuileGrain(texteClair); ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
  ctx.restore();
  return { variante:graine % STORY_FOND_VARIANTES.length, base };
}
