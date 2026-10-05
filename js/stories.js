/* Module chargé à la demande (clic sur un bouton « Story »), voir chargerModule() dans index.html. Les fonctions et constantes de la page principale y sont utilisables telles quelles. */
/* ---------- Stories (Instagram, WhatsApp…) : image verticale 1080 × 1920 dessinée dans le navigateur ---------- */
// Rien n'est envoyé à un serveur : l'image est composée ici, puis partagée par le menu du téléphone
// (Instagram, WhatsApp, Snapchat…) ou téléchargée sur ordinateur.
const STORY = { L:1080, H:1920, marge:84, papier:"#F5F1E8", encre:"#1C1B18", doux:"#47443D", pale:"#625D53", filet:"#D3CBBA", bleu:"#1B3A8C", rouge:"#B3261E", vert:"#2E6B3F", ambre:"#C98A00", ambreTxt:"#8A5F00", alerte:"#C8102E", alerteTxt:"#C8102E", bas:1490, yBande:329 };
// Variante sombre « Nuit » (charte : docs/identite.md), utilisée pour les sujets EN DIRECT
const STORY_NUIT = { papier:"#2A2926", encre:"#F5F1E8", doux:"#DDD7C9", pale:"#BDB7A9", filet:"#57544C", bleu:"#A9B8F2", alerteTxt:"#FF8D98", ambreTxt:"#E8B84A" };
const COULEURS_2022 = { Arthaud:"#8E1B1B", Roussel:"#A32E22", Macron:"#E0B400", Lassalle:"#A67C0A", "Le Pen":"#5B4FC9", Zemmour:"#2B2B6E", "Mélenchon":"#D6284B", Hidalgo:"#D6488A", Jadot:"#1E9F58", "Pécresse":"#2F6FE0", Poutou:"#B3261E", "Dupont-Aignan":"#4B5AA8" };
const COMPTE_STORY = "@hemicyclefrance"; // les stories n'affichent que le compte Instagram, pas l'adresse du site

function storyLignes(ctx, texte, largeur, max){
  const mots = String(texte).trim().replace(/«[ \t]+/g, "«\u00A0").replace(/[ \t]+([»:;?!%])/g, "\u00A0$1").split(/[ \t\r\n]+/), lignes = [];
  let l = "";
  for(const m of mots){
    const essai = l ? l + " " + m : m;
    if(ctx.measureText(essai).width > largeur && l){ lignes.push(l); l = m; } else l = essai;
  }
  if(l) lignes.push(l);
  if(lignes.length > max){
    lignes.length = max;
    let d = lignes[max - 1];
    while(ctx.measureText(d + "…").width > largeur && d.includes(" ")) d = d.slice(0, d.lastIndexOf(" "));
    lignes[max - 1] = d + "…";
  }
  return lignes;
}
function storyTexte(ctx, texte, x, y, { taille=40, poids=400, police="Public Sans", couleur=STORY.encre, largeur=STORY.L - 2*STORY.marge, max=3, interligne=1.2, align="left" } = {}){
  ctx.font = `${poids} ${taille}px "${police}"`;
  ctx.fillStyle = couleur;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  const lignes = storyLignes(ctx, texte, largeur, max);
  lignes.forEach((l, i)=> ctx.fillText(l, x, y + taille + i * taille * interligne));
  ctx.textAlign = "left";
  return y + taille + (lignes.length - 1) * taille * interligne + taille * (interligne - 1) + 8;
}
// Pastille arrondie pleine ; renvoie l'abscisse de son bord droit
// Hauteur qu'occuperait storyTexte (sans rien dessiner)
function storyHauteur(ctx, texte, { taille=40, poids=400, police="Public Sans", largeur=STORY.L - 2*STORY.marge, max=3, interligne=1.2 } = {}){
  ctx.font = `${poids} ${taille}px "${police}"`;
  const n = storyLignes(ctx, texte, largeur, max).length;
  return taille + (n - 1) * taille * interligne + taille * (interligne - 1) + 8;
}
// Plus grande taille (entre tMin et tMax) pour laquelle le texte tient entre yDebut et yFin
function storyTailleFit(ctx, texte, yDebut, yFin, { tMax=56, tMin=30, ...o } = {}){
  for(let t = tMax; t > tMin; t -= 2) if(yDebut + storyHauteur(ctx, texte, { ...o, taille:t, max:99 }) <= yFin) return t;
  return tMin;
}
// Étiquette pleine à angles droits (aucune pastille arrondie) ; renvoie l'abscisse de son bord droit
function storyPastille(ctx, texte, x, y, fond, couleur="#fff", taille=34){
  ctx.font = `700 ${taille}px "Public Sans"`;
  const w = ctx.measureText(texte).width + taille * 1.2, h = taille * 1.6;
  ctx.fillStyle = fond; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = couleur; ctx.textBaseline = "middle";
  ctx.fillText(texte, x + taille * 0.6, y + h / 2 + 2);
  ctx.textBaseline = "alphabetic";
  return x + w;
}
// Barre empilée (segments [valeur, couleur]) avec un espace de 3 px entre les segments
// Barre empilée plate (segments [valeur, couleur]) avec un espace de 3 px entre les segments
function storyBarre(ctx, x, y, largeur, hauteur, segments, total){
  ctx.fillStyle = STORY.filet; ctx.fillRect(x, y, largeur, hauteur);
  let cx = x;
  for(const [v, c] of segments){
    if(!v) continue;
    const w = v / total * largeur;
    ctx.fillStyle = c; ctx.fillRect(cx, y, Math.max(0, w - 3), hauteur);
    cx += w;
  }
}
async function storyImage(src){
  const img = new Image();
  img.src = src;
  try { await img.decode(); return img; } catch(e){ return null; }
}
// Portrait de la meilleure définition disponible : photos/<dossier>/hd/<fichier> s'il existe (voir scripts/fetch-portraits.js et
// scripts/photos-hd.cjs), sinon la vignette du site. « hd » : chemin HD connu (champ photoHd des illustrations), facultatif.
async function storyPortrait(src, hd){
  if(!src) return null;
  const candidat = hd || src.replace(/^(photos\/(?:deputes|senateurs|personnalites))\//, "$1/hd/");
  if(candidat !== src){ const img = await storyImage(candidat); if(img) return img; }
  return storyImage(src);
}

/* ----- Helpers de dessin réutilisables (ne pas renommer, ne pas changer les signatures) -----
   Charte (docs/identite.md) : fond papier uni (variante « Nuit » STORY_NUIT pour les EN DIRECT), filet tricolore en haut,
   logo + nom en serif, filets épais en encre, étiquette plate, aucun dégradé / halo / ombre / pastille arrondie / pictogramme.
   Zone de contenu sûre : de l'ordonnée renvoyée par storyCadre jusqu'à STORY.bas (≈ 1490) ;
   le pied (storyPied) occupe ensuite jusqu'à ≈ 1710.
   storyAlpha(couleur, a)                      -> "rgba(...)" à partir de #rrggbb
   storyMelange(couleur, autre, t)             -> couleur mélangée (t = 0..1 vers « autre »)
   storyLisible(couleur)                       -> la couleur, assombrie si trop claire pour du texte sur papier
   storyFondTheme(ctx, couleur)                -> fond papier uni + filet tricolore
   storyCadre(ctx, surtitre, { alerte })       -> fond + en-tête (logo, nom, filet, étiquette rouge si alerte, bleue sinon) ; renvoie l'ordonnée de début du contenu
   storyChiffreHeros(ctx, texte, x, y, couleur, taille=220, align="left")
                                               -> très gros chiffre (y = ligne de base, réduit pour tenir dans la page) ; renvoie y + 24
   storyCarte(ctx, x, y, w, h, fond="#FFFFFF") -> bloc éditorial : filet épais dessus, filet fin dessous (pas de cadre ni d'ombre)
   storyMedaillon(ctx, img, cx, cy, rayon, bordure)      -> portrait carré recadré sur le visage (img = Image ou null), liseré de couleur en bas
   storyInitiales(ctx, nom, cx, cy, rayon, couleur)      -> carré d'initiales
   storyHemicycle(ctx, cx, cy, rayon, segments, total, points=180)
                                               -> demi-cercle de points ; segments = [[n, couleur], ...], le reste en gris
   storyTitreSection(ctx, texte, x, y, couleur)          -> intitulé en capitales sous filet ; renvoie y + 40
   storyPuceVote(ctx, texte, xDroite, yMilieu, fond)     -> position de vote en lettres colorées, alignée à droite (POUR, CONTRE…)
   storyPied(ctx, source, { ligne })                     -> filet épais, ligne de source en gras facultative, note, adresse du site
   storyHauteur / storyTailleFit                         -> mesure d'un bloc de texte et plus grande taille qui tient dans la hauteur voulue
*/
function storyRVB(c){
  const m = /^#?([0-9a-f]{6})$/i.exec(String(c).trim());
  if(!m) return [138, 140, 148];
  const n = parseInt(m[1], 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}
function storyAlpha(c, a){ const [r, g, b] = storyRVB(c); return `rgba(${r},${g},${b},${a})`; }
function storyMelange(c, autre, t){
  const x = storyRVB(c), y = storyRVB(autre);
  return "#" + x.map((v, i)=> Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("");
}
function storyLuminance(c){
  const [r, g, b] = storyRVB(c).map(v=> { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function storyLisible(c){ const m = /^#(\w\w)(\w\w)(\w\w)$/.exec(c); if(m){ const v = m.slice(1).map(h=>parseInt(h, 16)); if(Math.max(...v) - Math.min(...v) < 16 && Math.max(...v) > 100) return STORY.doux; } return storyLuminance(c) > 0.28 ? storyMelange(c, STORY.encre, 0.45) : c; }

// Fond « papier » uni, avec le filet tricolore de la charte tout en haut
function storyFondTheme(ctx, couleur = STORY.bleu){
  const { L, H } = STORY;
  ctx.fillStyle = STORY.papier; ctx.fillRect(0, 0, L, H);
  [["#1B3A8C",0],["#FFFFFF",L/3],["#C8102E",2*L/3]].forEach(([c,x])=>{ ctx.fillStyle = c; ctx.fillRect(x, 0, L/3 + 1, 16); });
}

// Cadre commun : fond teinté, marque, surtitre ; renvoie l'ordonnée où commencer le contenu
// Cadre commun (charte) : filet tricolore, logo + nom en serif, filet épais, étiquette plate ; renvoie l'ordonnée où commencer le contenu
function storyCadre(ctx, surtitre, { couleur = STORY.bleu, alerte = false } = {}){
  const { L, marge } = STORY;
  storyFondTheme(ctx, couleur);
  // Sous la zone masquée par Instagram (≈ 220 px)
  const y0 = 214, cy = y0 + 46;
  ctx.lineWidth = 7; ctx.lineCap = "round";
  ctx.strokeStyle = STORY.bleu; ctx.beginPath(); ctx.arc(marge + 34, cy, 30, Math.PI, 0); ctx.stroke();
  ctx.strokeStyle = "#C8102E"; ctx.beginPath(); ctx.arc(marge + 34, cy, 15, Math.PI, 0); ctx.stroke();
  ctx.fillStyle = STORY.encre; ctx.beginPath(); ctx.arc(marge + 34, cy, 5, 0, 2 * Math.PI); ctx.fill();
  ctx.lineCap = "butt";
  ctx.font = `700 46px "Newsreader"`; ctx.fillStyle = STORY.encre; ctx.fillText("Hémicycle France", marge + 86, cy + 4);
  ctx.fillStyle = STORY.encre; ctx.fillRect(marge, y0 + 82, L - 2 * marge, 6);
  // étiquette plate sous le filet : rouge pour « à la une » / « en direct », bleu sinon
  ctx.font = `800 24px "Public Sans"`; ctx.letterSpacing = "3px";
  const txt = storyLignes(ctx, surtitre.toUpperCase(), L - 2 * marge - 44, 1)[0], h = 50, w = ctx.measureText(txt).width + 44;
  ctx.fillStyle = alerte ? STORY.alerte : STORY.bleu; ctx.fillRect(marge, y0 + 88, w, h);
  ctx.fillStyle = alerte ? "#fff" : (STORY.papier === "#2A2926" ? "#1C1B18" : "#fff"); ctx.textBaseline = "middle"; ctx.fillText(txt, marge + 22, y0 + 88 + h / 2 + 1); ctx.textBaseline = "alphabetic";
  ctx.letterSpacing = "0px";
  return y0 + 88 + h + 40;
}
// Pied commun : filet épais, source (ligne en gras facultative), adresse du site lisible
function storyPied(ctx, source, { ligne = "" } = {}){
  const { L, marge } = STORY, y = 1520;
  ctx.fillStyle = STORY.encre; ctx.fillRect(marge, y, L - 2 * marge, 5);
  let yy = y + 20;
  if(ligne) yy = storyTexte(ctx, ligne, marge, yy, { taille:28, poids:700, couleur:STORY.encre, max:1 }) + 2;
  storyTexte(ctx, source, marge, yy, { taille:23, couleur:STORY.pale, max:3, interligne:1.22 });
  ctx.font = `800 34px "Public Sans"`; ctx.fillStyle = STORY.bleu;
  ctx.fillText(COMPTE_STORY, marge, y + 180);
}

function storyChiffreHeros(ctx, texte, x, y, couleur, taille = 220, align = "left"){
  const dispo = align === "center" ? STORY.L - 2 * STORY.marge : align === "right" ? x - STORY.marge : STORY.L - STORY.marge - x;
  ctx.font = `700 ${taille}px "Newsreader"`;
  const w = ctx.measureText(texte).width;
  if(w > dispo) taille = Math.floor(taille * dispo / w);
  ctx.font = `700 ${taille}px "Newsreader"`;
  ctx.textAlign = align; ctx.textBaseline = "alphabetic";
  ctx.fillStyle = couleur; ctx.fillText(texte, x, y);
  ctx.textAlign = "left";
  return y + 24;
}
// Bloc éditorial : filet épais dessus, filet fin dessous, aucun cadre ni ombre (fond teinté seulement s'il est précisé)
function storyCarte(ctx, x, y, w, h, fond = "#FFFFFF", rayon = 28){
  if(!["#FFFFFF", "#FFF", "#FBF8F1"].includes(String(fond).toUpperCase())){ ctx.fillStyle = fond; ctx.fillRect(x, y, w, h); }
  ctx.fillStyle = STORY.encre; ctx.fillRect(x, y, w, 4);
  ctx.fillStyle = STORY.filet; ctx.fillRect(x, y + h - 2, w, 2);
}
// Portrait carré recadré sur le haut (visage), sans cercle ni ombre ; liseré de la couleur du parti en bas
function storyMedaillon(ctx, img, cx, cy, rayon, bordure = STORY.bleu){
  const x = cx - rayon, y = cy - rayon, c = 2 * rayon;
  let zone = { x, y, w:c, h:c };
  if(img){ zone = storyPPhoto(ctx, img, x, y, c, c, { centre:true }); }
  else { ctx.fillStyle = storyAlpha(bordure, 0.2); ctx.fillRect(x, y, c, c); }
  ctx.fillStyle = bordure; ctx.fillRect(zone.x, zone.y + zone.h - Math.max(4, rayon * 0.07), zone.w, Math.max(4, rayon * 0.07));
}
function storyInitiales(ctx, nom, cx, cy, rayon, couleur = STORY.bleu){
  const mots = String(nom).replace(/\(.*?\)/g, "").split(/[\s-]+/).filter(m=> /^\p{L}/u.test(m) && !/^(de|du|des|la|le|d['’])$/i.test(m));
  const ini = ((mots[0]?.[0] || "") + (mots.length > 1 ? mots[mots.length - 1][0] : "")).toUpperCase();
  ctx.fillStyle = couleur; ctx.fillRect(cx - rayon, cy - rayon, 2 * rayon, 2 * rayon);
  ctx.fillStyle = storyLuminance(couleur) > 0.4 ? STORY.encre : "#fff";
  ctx.font = `700 ${Math.round(rayon * 0.8)}px "Public Sans"`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(ini, cx, cy + rayon * 0.04);
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
}
function storyHemicycle(ctx, cx, cy, rayon, segments, total, points = 180){
  const rangs = Math.max(3, Math.round(Math.sqrt(points) / 1.7)), rMin = 0.46;
  const rayons = Array.from({ length: rangs }, (_, i)=> rayon * (rMin + (1 - rMin) * i / (rangs - 1)));
  const somme = rayons.reduce((a, r)=>a + r, 0), sieges = [];
  rayons.forEach(r=>{
    const n = Math.max(2, Math.round(points * r / somme));
    for(let i = 0; i < n; i++) sieges.push({ a: Math.PI + Math.PI * i / (n - 1), r });
  });
  sieges.sort((p, q)=> p.a - q.a || p.r - q.r);
  const dot = rayon * (1 - rMin) / (rangs - 1) * 0.36;
  const cumul = []; let s = 0;
  for(const [v, c] of segments){ s += v; cumul.push([s, c]); }
  sieges.forEach((p, i)=>{
    const t = (i + 0.5) / sieges.length * total;
    ctx.fillStyle = (cumul.find(([lim])=> t <= lim) || [0, "#D9D2C2"])[1];
    ctx.beginPath(); ctx.arc(cx + p.r * Math.cos(p.a), cy + p.r * Math.sin(p.a), dot, 0, 2 * Math.PI); ctx.fill();
  });
}
function storyTitreSection(ctx, texte, x, y, couleur = STORY.bleu){
  ctx.font = `800 24px "Public Sans"`; ctx.fillStyle = STORY.encre; ctx.letterSpacing = "3px";
  ctx.fillText(texte.toUpperCase(), x, y + 2); ctx.letterSpacing = "0px";
  ctx.fillStyle = STORY.encre; ctx.fillRect(x, y + 14, STORY.L - 2 * STORY.marge, 3);
  return y + 40;
}
// Position de vote en lettres colorées, alignée à droite (pas de pastille)
function storyPuceVote(ctx, texte, xDroite, yMilieu, fond, couleurTexte = "#fff"){
  ctx.font = `800 24px "Public Sans"`; ctx.letterSpacing = "1px";
  ctx.fillStyle = fond === STORY.ambre ? STORY.ambreTxt : fond; ctx.textBaseline = "middle"; ctx.textAlign = "right";
  ctx.fillText(texte, xDroite, yMilieu + 2); ctx.textBaseline = "alphabetic"; ctx.textAlign = "left"; ctx.letterSpacing = "0px";
}
// Fiche d'élu (député, sénateur) : médaillon, nom, trois cartes de chiffres [valeur, légende, couleur], derniers votes [{code, titre}]
function storyFicheElu(ctx, y, { photo, couleur, nom, soustitre, ligne, cartes, titreVotes, votes }){
  const { L, marge, bas } = STORY, largeur = L - 2 * marge, r = 124, cx = marge + r + 8, cy = y + r + 10;
  storyMedaillon(ctx, photo, cx, cy, r, couleur);
  const tx = marge + 2 * r + 52, tl = largeur - 2 * r - 52;
  const ty = storyTexte(ctx, nom, tx, y + 8, { taille:60, poids:600, police:"Newsreader", largeur:tl, max:3, interligne:1.05 });
  ctx.font = `700 26px "Public Sans"`;
  storyPastille(ctx, storyLignes(ctx, soustitre, tl - 40, 1)[0], tx, ty + 4, storyLisible(couleur) === STORY.doux ? STORY.doux : couleur, storyLuminance(couleur) > 0.4 && storyLisible(couleur) !== STORY.doux ? STORY.encre : "#fff", 26);
  y = cy + r + 34;
  y = storyTexte(ctx, ligne, marge, y, { taille:32, couleur:STORY.doux, max:2 }) + 14;
  const cw = (largeur - 40) / 3, ch = 176;
  cartes.forEach(([v, lib, coul], i)=>{
    const x = marge + i * (cw + 20);
    storyCarte(ctx, x, y, cw, ch, "#fff", 24);
    ctx.fillStyle = coul; ctx.beginPath(); ctx.rect(x + 22, y + 20, 44, 7, 4); ctx.fill();
    let t = 64; ctx.font = `700 ${t}px "Newsreader"`;
    while(ctx.measureText(v).width > cw - 36 && t > 30){ t -= 2; ctx.font = `700 ${t}px "Newsreader"`; }
    ctx.fillStyle = coul; ctx.fillText(v, x + 22, y + 92);
    storyTexte(ctx, lib, x + 22, y + 104, { taille:21, couleur:STORY.doux, largeur:cw - 40, max:2, interligne:1.15 });
  });
  y += ch + 40;
  y = storyTitreSection(ctx, titreVotes, marge, y + 10, couleur) - 4;
  const LIB = { p:["POUR", STORY.vert], c:["CONTRE", STORY.rouge], a:["ABST.", STORY.ambre], n:["PAS VOTÉ", STORY.pale], "-":["PAS VOTÉ", STORY.pale] };
  const pas = 100, n = Math.max(1, Math.min(votes.length, Math.floor((bas - y - 30) / pas)));
  storyCarte(ctx, marge, y, largeur, n * pas + 24, "#fff", 24);
  if(!votes.length){ ctx.font = `400 26px "Public Sans"`; ctx.fillStyle = STORY.doux; ctx.fillText("Aucun vote relevé pour l'instant.", marge + 26, y + 12 + 48); }
  votes.slice(0, n).forEach(({ code, titre }, i)=>{
    const yy = y + 12 + i * pas, [lib, coul] = LIB[code] || LIB.n;
    if(i){ ctx.fillStyle = STORY.filet; ctx.fillRect(marge + 26, yy, largeur - 52, 2); }
    ctx.font = `400 25px "Public Sans"`;
    const l = storyLignes(ctx, titre, largeur - 250, 3);
    l.forEach((t, k)=>{ ctx.fillStyle = STORY.encre; ctx.fillText(t, marge + 26, yy + pas / 2 - (l.length - 1) * 15 + 9 + k * 30); });
    storyPuceVote(ctx, lib, L - marge - 24, yy + pas / 2, coul);
  });
}

/* ---------- Stories : types supplémentaires (actualités, sondages, fiches…) ----------
   Chaque entrée dessine sur le canevas déjà créé et renvoie { nom }, ou null si les données manquent. */

// Petits outils de dessin propres à ces types
const storyPLarg = STORY.L - 2 * STORY.marge;
function storyPCarte(ctx, x, y, w, h, fond = "#FBF8F1", bord = STORY.filet){
  if(!["#FFFFFF", "#FFF", "#FBF8F1"].includes(String(fond).toUpperCase())){ ctx.fillStyle = fond; ctx.fillRect(x, y, w, h); }
  ctx.fillStyle = bord === STORY.filet ? STORY.encre : bord; ctx.fillRect(x, y, w, 5);
  ctx.fillStyle = STORY.filet; ctx.fillRect(x, y + h - 2, w, 2);
}
// Gros chiffre : simple filet épais de la couleur de la donnée au-dessus, pas d'aplat teinté
function storyPFond(ctx, couleur, y, h){
  ctx.fillStyle = couleur; ctx.fillRect(STORY.marge, y, STORY.L - 2 * STORY.marge, 8);
}
// Texte sur une ligne, réduit jusqu'à tenir dans la largeur ; renvoie la taille retenue
function storyPLigne(ctx, texte, x, y, { taille=60, poids=600, police="Newsreader", couleur=STORY.encre, largeur=storyPLarg, align="left", mini=20 } = {}){
  let t = taille;
  ctx.font = `${poids} ${t}px "${police}"`;
  while(ctx.measureText(texte).width > largeur && t > mini){ t -= 2; ctx.font = `${poids} ${t}px "${police}"`; }
  ctx.fillStyle = couleur; ctx.textAlign = align; ctx.textBaseline = "alphabetic";
  ctx.fillText(texte, x, y); ctx.textAlign = "left";
  return t;
}
const storyPInitiales = nom => String(nom || "").split(/[\s-]+/).filter(Boolean).map(m=>m[0]).filter(c=>/\p{Lu}/u.test(c)).slice(0, 2).join("");
const storyPLisible = c => c === "#E0B400" ? STORY.ambreTxt : c === "#8A8C94" ? STORY.doux : c; // le jaune du parti est illisible en texte sur papier crème
// Médaillon : photo (recadrée sur le haut), sinon initiales sur la couleur du parti
// Portrait carré (recadré sur le haut), sinon initiales sur la couleur du parti ; sans cercle
function storyPMedaillon(ctx, img, cx, cy, r, couleur, nom){
  let zone = { x:cx - r, y:cy - r, w:2 * r, h:2 * r };
  if(img) zone = storyPPhoto(ctx, img, cx - r, cy - r, 2 * r, 2 * r, { centre:true });
  else {
    ctx.fillStyle = couleur; ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    ctx.font = `700 ${Math.round(r * 0.8)}px "Newsreader"`; ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(storyPInitiales(nom), cx, cy + r * 0.05); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  }
  const e = Math.max(4, r * 0.07);
  ctx.fillStyle = couleur; ctx.fillRect(zone.x, zone.y + zone.h - e, zone.w, e);
}
// Photo recadrée « cover » dans le rectangle, ancrée vers le haut pour garder le visage ; légère désaturation.
// Netteté : jamais agrandie à plus de STORY_AGRANDISSEMENT_MAX fois sa taille naturelle (un portrait de 104 px ne devient pas
// un flou de 450 px) : au-delà, la photo est reproduite plus petite, avec un cadre net, et seule la place utile est occupée.
// Dessin au pixel entier, lissage de haute qualité, aucun flou. Renvoie le rectangle réellement occupé.
const STORY_AGRANDISSEMENT_MAX = 1.4;
function storyPPhoto(ctx, img, x, y, w, h, { centre = false } = {}){
  let k = Math.max(w / img.naturalWidth, h / img.naturalHeight), reduite = false;
  if(k > STORY_AGRANDISSEMENT_MAX){
    const f = STORY_AGRANDISSEMENT_MAX / k;
    const w2 = Math.round(w * f), h2 = Math.round(h * f);
    if(centre){ x += Math.round((w - w2) / 2); y += Math.round((h - h2) / 2); }
    w = w2; h = h2; k = STORY_AGRANDISSEMENT_MAX; reduite = true;
  }
  x = Math.round(x); y = Math.round(y);
  const iw = Math.round(img.naturalWidth * k), ih = Math.round(img.naturalHeight * k);
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  ctx.filter = "grayscale(0.2) contrast(1.03)";
  ctx.drawImage(img, Math.round(x - (iw - w) / 2), Math.round(y - (ih - h) * 0.1), iw, ih);
  ctx.restore();
  if(reduite){ // cadre net autour d'une photo reproduite plus petite
    ctx.fillStyle = STORY.encre;
    ctx.fillRect(x - 3, y - 3, w + 6, 3); ctx.fillRect(x - 3, y + h, w + 6, 3);
    ctx.fillRect(x - 3, y, 3, h); ctx.fillRect(x + w, y, 3, h);
  }
  return { x, y, w, h };
}

function storyPLogo(ctx, img, x, y, taille){
  ctx.fillStyle = "#FFFFFF"; ctx.fillRect(x, y, taille, taille);
  ctx.fillStyle = STORY.filet; ctx.fillRect(x, y + taille - 2, taille, 2);
  const k = Math.min((taille - 36) / img.naturalWidth, (taille - 36) / img.naturalHeight);
  ctx.drawImage(img, x + taille / 2 - img.naturalWidth * k / 2, y + taille / 2 - img.naturalHeight * k / 2, img.naturalWidth * k, img.naturalHeight * k);
}

// Crédit des portraits libres de Wikimedia Commons (personnalités), à rappeler dans le pied
async function storyPCredits(noms){
  const liste = (await lireJSON("data/portraits.json"))?.portraits || {};
  return noms.map(n=> liste[n]).filter(p=>p?.fichier).map(p=> `${p.auteur || "auteur inconnu"} (${p.licence})`);
}
const storyPDateLongue = iso => new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long", year:"numeric" }).replace(/ 1 /, " 1er ");
const storyPPct = v => v === null || v === undefined ? "—" : v < 1 ? (v > 0 ? "< 1 %" : "< 0,1 %") : v > 99 ? "> 99 %" : `${nombreFr(Math.round(v))} %`;
const storyPCouleurCandidat = nom => CANDIDATS.find(c=>c.id === nom)?.couleur || "#8A8C94";
function storyPPastilleCentre(ctx, texte, cx, y, fond, taille = 32){
  ctx.font = `700 ${taille}px "Public Sans"`;
  const w = ctx.measureText(texte).width + taille * 1.2;
  return storyPastille(ctx, texte, cx - w / 2, y, fond, "#fff", taille);
}
function storyPSousTitre(ctx, texte, x, y, couleur = STORY.pale){
  ctx.font = `700 24px "Public Sans"`; ctx.fillStyle = couleur; ctx.letterSpacing = "2px";
  ctx.fillText(texte.toUpperCase(), x, y + 20); ctx.letterSpacing = "0px";
  return y + 44;
}
const storyPDomaine = u => (String(u).match(/^https?:\/\/(?:www\.)?([^/]+)/) || [])[1] || "";

// Noms séparés par « · » sur au plus « maxi » lignes ; ce qui ne tient pas devient « +N »
function storyPListe(ctx, noms, largeur, maxi){
  const sep = " · ", lignes = [[]], mesure = t => ctx.measureText(t).width;
  let i = 0;
  for(; i < noms.length; i++){
    const cur = lignes[lignes.length - 1];
    if(!cur.length || mesure([...cur, noms[i]].join(sep)) <= largeur) cur.push(noms[i]);
    else if(lignes.length < maxi) lignes.push([noms[i]]);
    else break;
  }
  if(i < noms.length){
    let reste = noms.length - i; const cur = lignes[lignes.length - 1];
    while(cur.length > 1 && mesure([...cur, `+${reste}`].join(sep)) > largeur){ cur.pop(); reste++; }
    cur.push(`+${reste}`);
  }
  return lignes.map(l=> l.join(sep));
}

// 1. Un sujet d'actualité (data-id : indice du sujet dans ACTUALITES.sujets)
//    Mise en page de « une » de presse, sur papier (ou « Nuit » en direct) : étiquette plate, titre énorme,
//    portraits rectangulaires avec nom (sans cercle), bloc « Repris par N médias » en texte, source et heure en pied.
STORY_PLUS.actualite = async (ctx, info)=>{
  const s = ACTUALITES?.sujets?.[Number(info)];
  if(!s?.articles?.length) return null;
  const { L, marge } = STORY, larg = L - 2 * marge, a0 = s.articles[0];
  const medias = [...new Set(s.articles.map(a=>a.media))], n = medias.length;
  const ill = s.illustration || {}, theme = THEMES_ACTU[ill.theme] || THEMES_ACTU.politique;
  const enDirect = (DIRECT?.evenements || []).some(e=> e.type !== "seance-an" && s.articles.some(a=> a.titre === e.titre));
  const pers = (ill.personnes || []).slice(0, 3);
  const imgs = await Promise.all(pers.map(p=> p.photo ? storyPortrait(p.photo, p.photoHd) : null));
  const vus = pers.map((p, i)=>({ ...p, img:imgs[i] })).filter(p=>p.img);
  for(const p of vus) if(!p.credit && /personnalites/.test(p.photo || "")) p.credit = (await storyPCredits([p.nom]))[0] || "";
  const d = new Date(a0.date), fmt = o => d.toLocaleString("fr-FR", { timeZone:"Europe/Paris", ...o });
  let quand = ilYA(a0.date);
  if(!isNaN(d)){
    const heure = fmt({ hour:"2-digit", minute:"2-digit" }).replace(":", " h ").replace(/^0/, "");
    const jour = o => (x=>x.toLocaleDateString("fr-FR", { timeZone:"Europe/Paris", day:"numeric", month:"numeric", year:"numeric" }))(o);
    quand = jour(d) === jour(new Date()) ? heure : `${fmt({ day:"numeric", month:"long" })} · ${heure}`;
  }
  const sauve = { ...STORY };
  if(enDirect) Object.assign(STORY, STORY_NUIT);
  try {
    const y0 = storyCadre(ctx, enDirect ? "En direct" : "À la une", { alerte:true });
    ctx.font = `700 24px "Public Sans"`; ctx.letterSpacing = "3px"; ctx.fillStyle = STORY.pale; ctx.textAlign = "right"; ctx.textBaseline = "middle";
    ctx.fillText(theme[2].toUpperCase(), L - marge, STORY.yBande + 2); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.letterSpacing = "0px";
    const rouge = STORY.alerteTxt, mode = vus.length === 0 ? 0 : vus.length === 1 ? 1 : 2;

    // Bloc « Repris par N médias » pleine largeur (pas avec un seul portrait : il passe dans la colonne de droite)
    let hc = 0, lignesNoms = [];
    const xt = marge + 200;
    if(n >= 2 && mode !== 1){
      ctx.font = `700 34px "Public Sans"`;
      lignesNoms = storyPListe(ctx, medias, L - marge - xt, 3);
      hc = Math.max(190, 96 + (lignesNoms.length - 1) * 46 + 26);
    }
    const yc = STORY.bas - hc, haut = y0 + 4, bas = hc ? yc - 44 : STORY.bas, zone = bas - haut, gap = 40;

    // Titre : le plus grand possible, jamais coupé (sauf titre démesuré)
    const titre = a0.titre.replace(/\s+/g, " ").trim();
    const ajuster = (hMax, tMax)=>{
      for(let t = tMax; t >= 50; t -= 2){
        ctx.font = `700 ${t}px "Newsreader"`;
        const l = storyLignes(ctx, titre, larg, 99);
        if(l.length * t * 1.06 <= hMax && l.every(x=> ctx.measureText(x).width <= larg)) return { t, l };
      }
      ctx.font = `700 50px "Newsreader"`;
      return { t:50, l:storyLignes(ctx, titre, larg, Math.max(1, Math.floor(hMax / (50 * 1.06)))) };
    };
    const colW = mode === 2 ? (larg - 16 * (vus.length - 1)) / vus.length : 456;
    const tailleNom = vus.length === 3 ? 32 : 38;
    let capH = 0;
    if(mode === 2){
      ctx.font = `700 ${tailleNom}px "Newsreader"`;
      capH = 20 + Math.max(...vus.map(p=> storyLignes(ctx, p.nom, colW, 2).length)) * tailleNom * 1.1;
    }
    const phMin = mode === 1 ? 600 : mode === 2 ? Math.min(Math.round(colW * 1.2), 400) : 0;
    const f = ajuster(mode ? zone - phMin - capH - gap : zone, mode ? 124 : 150);
    const hT = f.l.length * f.t * 1.06;
    ctx.fillStyle = STORY.encre; ctx.textAlign = "left"; ctx.font = `700 ${f.t}px "Newsreader"`;
    f.l.forEach((l, i)=> ctx.fillText(l, marge, haut + f.t * 0.8 + i * f.t * 1.06));
    const yP = haut + hT + gap;

    if(mode === 1){
      const p = vus[0], ph = Math.min(720, Math.max(phMin, bas - yP));
      const zp = storyPPhoto(ctx, p.img, marge, yP, colW, ph);
      const x0 = marge + zp.w + 40, w = L - marge - x0;
      let yy = storyTexte(ctx, p.nom, x0, yP - 4, { taille:50, poids:700, police:"Newsreader", largeur:w, max:3, interligne:1.08 });
      if(p.credit) storyTexte(ctx, `Photo : ${p.credit}`, x0, yy + 2, { taille:22, couleur:STORY.pale, largeur:w, max:3, interligne:1.2 });
      // bas de colonne, aligné sur le bas de la photo
      const yb = yP + ph;
      if(n >= 2){
        ctx.font = `700 32px "Public Sans"`;
        const noms = medias.length > 4 ? [...medias.slice(0, 3), `+${medias.length - 3} autres`] : medias;
        const H = 5 + 20 + 40 + 112 + 14 + noms.length * 42, Rt = yb - H;
        ctx.fillStyle = STORY.encre; ctx.fillRect(x0, Rt, w, 5);
        ctx.font = `800 22px "Public Sans"`; ctx.letterSpacing = "3px"; ctx.fillStyle = rouge; ctx.fillText("REPRIS PAR", x0, Rt + 5 + 20 + 22); ctx.letterSpacing = "0px";
        ctx.font = `700 130px "Newsreader"`; ctx.fillText(String(n), x0, Rt + 5 + 20 + 40 + 100);
        const wn = ctx.measureText(String(n)).width;
        ctx.font = `800 30px "Public Sans"`; ctx.letterSpacing = "3px"; ctx.fillText("MÉDIAS", x0 + wn + 22, Rt + 5 + 20 + 40 + 100); ctx.letterSpacing = "0px";
        ctx.font = `700 32px "Public Sans"`; ctx.fillStyle = STORY.encre;
        let tn = 32; while(tn > 22 && noms.some(m=> ctx.measureText(m).width > w)){ tn--; ctx.font = `700 ${tn}px "Public Sans"`; }
        noms.forEach((m, i)=> ctx.fillText(storyLignes(ctx, m, w, 1)[0], x0, Rt + 5 + 20 + 40 + 112 + 14 + 30 + i * 42));
      } else {
        ctx.fillStyle = STORY.encre; ctx.fillRect(x0, yb - 120, w, 5);
        ctx.font = `800 22px "Public Sans"`; ctx.letterSpacing = "3px"; ctx.fillStyle = rouge; ctx.fillText("TITRE PUBLIÉ PAR", x0, yb - 120 + 44); ctx.letterSpacing = "0px";
        ctx.font = `700 48px "Newsreader"`; ctx.fillStyle = STORY.encre; ctx.fillText(storyLignes(ctx, a0.media, w, 1)[0], x0, yb - 120 + 100);
      }
    } else if(mode === 2){
      const ph = Math.min(Math.round(colW * 1.45), 560, Math.max(phMin, bas - yP - capH));
      vus.forEach((p, i)=>{
        const x = marge + i * (colW + 16);
        const zp = storyPPhoto(ctx, p.img, x, yP, colW, ph);
        ctx.fillStyle = couleurPartiActu(p.parti); ctx.fillRect(zp.x, zp.y + zp.h, zp.w, 6);
        storyTexte(ctx, p.nom, x, zp.y + zp.h + 14, { taille:tailleNom, poids:700, police:"Newsreader", largeur:colW, max:2, interligne:1.05 });
      });
    }

    if(hc){
      ctx.fillStyle = STORY.encre; ctx.fillRect(marge, yc, larg, 6);
      ctx.font = `700 150px "Newsreader"`; ctx.fillStyle = rouge; ctx.fillText(String(n), marge, yc + 6 + 30 + 104);
      ctx.font = `800 24px "Public Sans"`; ctx.letterSpacing = "3px"; ctx.fillText(`REPRIS PAR ${n} MÉDIAS`, xt, yc + 6 + 40); ctx.letterSpacing = "0px";
      ctx.font = `700 34px "Public Sans"`; ctx.fillStyle = STORY.encre;
      lignesNoms.forEach((l, i)=> ctx.fillText(l, xt, yc + 6 + 40 + 44 + i * 46));
    }

    const credits = mode === 2 ? vus.map(p=> p.credit).filter(Boolean) : [];
    storyPied(ctx, `Seuls les titres sont repris.${credits.length ? ` Photos : ${[...new Set(credits)].join(" ; ")}.` : ""}`, { ligne:`Titre : ${a0.media} · ${quand}` });
  } finally { Object.assign(STORY, sauve); }
  return { nom:`actualite-${slugDep(a0.titre).slice(0, 40)}` };
};

// 2. Les sujets du moment (data-id vide)
STORY_PLUS.actualites = async (ctx, info)=>{
  // info = id d'un dossier de ACTUALITES.dossiers (calculé par scripts/dossiers.cjs) ; vide : les sujets du moment
  const dossier = info ? (ACTUALITES?.dossiers || []).find(d=> d.id === info) : null;
  if(dossier){
    const vus = new Set(), arts = [];
    for(const a of dossier.articles || []) if(!vus.has(a.media)){ vus.add(a.media); arts.push(a); }
    arts.sort((x, y)=> y.date.localeCompare(x.date));
    const l = arts.slice(0, 5);
    if(l.length < 3) return null;
    const { L, marge } = STORY;
    let y = storyCadre(ctx, "Actualité · à la une", { alerte:true });
    y = storyTexte(ctx, dossier.titre, marge, y, { taille:84, poids:600, police:"Newsreader", max:2, interligne:1.05 });
    y = storyTexte(ctx, `${arts.length} médias en parlent en ce moment`, marge, y, { taille:30, couleur:STORY.doux, max:1 }) + 24;
    const pas = Math.min(300, (1495 - y) / l.length);
    for(let i = 0; i < l.length; i++){
      ctx.fillStyle = STORY.filet; ctx.fillRect(marge, y, storyPLarg, 2);
      ctx.font = `700 24px "Public Sans"`; ctx.fillStyle = STORY.alerteTxt; ctx.fillText(l[i].media.toUpperCase(), marge, y + 44);
      storyTexte(ctx, l[i].titre, marge, y + 62, { taille:34, poids:600, police:"Newsreader", largeur:L - 2 * marge, max:4, interligne:1.12 });
      y += pas;
    }
    storyPied(ctx, "Titres relevés dans la presse. Seuls les titres sont repris.");
    return { nom:`dossier-${info}` };
  }
  const top = (ACTUALITES?.sujets || []).filter(s=>s.medias >= 2).slice(0, 4);
  if(!top.length) return null;
  const { L, marge } = STORY;
  let y = storyCadre(ctx, "Actualité · à la une", { alerte:true });
  y = storyTexte(ctx, "Les sujets du moment", marge, y, { taille:72, poids:600, police:"Newsreader", max:2, interligne:1.05 });
  y = storyTexte(ctx, "Les plus repris par plusieurs médias", marge, y, { taille:30, couleur:STORY.doux, max:1 }) + 20;
  const pas = Math.min(300, (1495 - y) / top.length), r = 62;
  for(let i = 0; i < top.length; i++){
    const s = top[i], cy = y + pas / 2;
    ctx.fillStyle = STORY.filet; ctx.fillRect(marge, y, storyPLarg, 2);
    const ill = s.illustration || {}, p0 = ill.personnes?.[0];
    const coul = p0 ? couleurPartiActu(p0.parti) : (ill.partis?.[0] ? couleurPartiActu(ill.partis[0]) : (THEMES_ACTU[ill.theme] || THEMES_ACTU.politique)[0]);
    const img = p0?.photo ? await storyPortrait(p0.photo, p0.photoHd) : null;
    const logo = !p0 && ill.partis?.[0] ? await storyImage(`icons/partis/${ill.partis[0]}.png`) : null;
    let vis = true;
    if(p0 && img) storyPMedaillon(ctx, img, marge + r, cy, r, coul, p0.nom);
    else if(logo) storyPLogo(ctx, logo, marge, cy - r, 2 * r);
    else vis = false;
    const tx = vis ? marge + 2 * r + 30 : marge, tl = L - marge - 150 - tx;
    storyTexte(ctx, s.articles[0].titre, tx, cy - 70, { taille:32, poids:600, police:"Newsreader", largeur:tl, max:5, interligne:1.12 });
    ctx.font = `600 120px "Newsreader"`; ctx.fillStyle = STORY.alerteTxt; ctx.textAlign = "right"; ctx.fillText(String(s.medias), L - marge, cy + 20);
    ctx.font = `700 24px "Public Sans"`; ctx.fillText("MÉDIAS", L - marge, cy + 58); ctx.textAlign = "left";
    y += pas;
  }
  storyPied(ctx, "Titres relevés dans la presse. Un sujet est « repris » quand au moins deux médias le traitent. Seuls les titres sont repris.");
  return { nom:"sujets-du-moment" };
};

// 3. Qui a le plus de chances ? (data-id vide)
STORY_PLUS.probabilites = async (ctx)=>{
  if(!PROBAS?.candidats?.length || periodeReserveSondages()) return null;
  const { L, marge } = STORY;
  const avecVictoire = PROBAS.candidats.some(c=>c.victoire !== null && c.victoire !== undefined);
  const liste = PROBAS.candidats.filter(c=>c.secondTour >= 0.1 || (c.victoire || 0) >= 0.1)
    .sort((a, b)=> ((b.victoire || 0) - (a.victoire || 0)) || (b.secondTour - a.secondTour)).slice(0, 6);
  if(!liste.length) return null;
  let y = storyCadre(ctx, "Présidentielle 2027 · simulation");
  y = storyTexte(ctx, "Qui a le plus de chances ?", marge, y, { taille:72, poids:600, police:"Newsreader", max:2, interligne:1.05 });
  y = storyTexte(ctx, "Simulation à partir des sondages, pas une prédiction.", marge, y + 2, { taille:30, poids:700, couleur:STORY.ambreTxt, max:2 }) + 18;
  ctx.font = `600 24px "Public Sans"`;
  ctx.fillStyle = "#8A8C94"; ctx.globalAlpha = 0.5; ctx.fillRect(marge, y + 6, 36, 18); ctx.globalAlpha = 1;
  ctx.fillStyle = STORY.doux; ctx.fillText("chance d'aller au second tour", marge + 48, y + 24);
  if(avecVictoire){ ctx.fillStyle = "#6B6E78"; ctx.fillRect(marge + 480, y + 6, 36, 18); ctx.fillStyle = STORY.doux; ctx.fillText("chance d'être élu", marge + 528, y + 24); }
  y += 54;
  const hLigne = avecVictoire ? 150 : 112, nb = Math.max(1, Math.min(liste.length, Math.floor((1500 - y) / (hLigne + 10))));
  liste.length = nb;
  const pas = Math.min(190, (1500 - y) / nb);
  for(const c of liste){
    const coul = COULEURS_PARTIS[c.parti] || "#8A8C94";
    ctx.fillStyle = STORY.filet; ctx.fillRect(marge, y, storyPLarg, 2);
    ctx.font = `600 34px "Public Sans"`; ctx.fillStyle = STORY.encre; ctx.fillText(c.nom, marge, y + 44);
    const elu = avecVictoire && c.victoire !== null && c.victoire !== undefined;
    const pri = elu ? c.victoire : c.secondTour;
    ctx.font = pri < 1 ? `700 44px "Public Sans"` : `600 64px "Newsreader"`; ctx.fillStyle = storyPLisible(coul); ctx.textAlign = "right"; ctx.fillText(storyPPct(pri), L - marge, y + 54); ctx.textAlign = "left";
    const hb = elu ? 20 : 26, by = y + 74, larg = storyPLarg - 200;
    ctx.font = `600 22px "Public Sans"`; ctx.fillStyle = STORY.pale;
    ctx.fillText("2d tour", marge, by + hb - 3);
    ctx.globalAlpha = 0.5; storyBarre(ctx, marge + 120, by, larg, hb, [[c.secondTour, coul]], 100); ctx.globalAlpha = 1;
    ctx.textAlign = "right"; ctx.fillStyle = STORY.doux; ctx.fillText(storyPPct(c.secondTour), L - marge, by + hb - 3); ctx.textAlign = "left";
    if(elu){
      ctx.fillStyle = STORY.pale; ctx.fillText("Élu", marge, by + 38 + hb - 3);
      storyBarre(ctx, marge + 120, by + 38, larg, hb, [[c.victoire, coul]], 100);
      ctx.textAlign = "right"; ctx.fillStyle = STORY.encre; ctx.font = `700 22px "Public Sans"`; ctx.fillText(storyPPct(c.victoire), L - marge, by + 38 + hb - 3); ctx.textAlign = "left";
    }
    y += pas;
  }
  const m = PROBAS.methode || {};
  storyPied(ctx, `Simulation à partir des sondages (${formatNombre(m.tirages || 0)} élections simulées), pas une prédiction : les sondages mesurent l'opinion du moment.`);
  return { nom:"probabilites-presidentielle" };
};

// 4. Un duel de second tour (data-id : indice dans SECOND_TOUR)
STORY_PLUS.secondtour = async (ctx, info)=>{
  const d = SECOND_TOUR?.[Number(info)];
  if(!d?.instituts?.length || periodeReserveSondages()) return null;
  const { L, marge } = STORY;
  const [a, b] = [...d.candidats].sort((x, z)=> (d.instituts[0].scores[z] ?? 0) - (d.instituts[0].scores[x] ?? 0));
  const ca = storyPCouleurCandidat(a);
  let cb = storyPCouleurCandidat(b); if(cb === ca) cb = "#6B6E78";
  const premier = d.instituts[0], sa = premier.scores[a], sb = premier.scores[b];
  let y = storyCadre(ctx, "Présidentielle 2027 · second tour");
  y = storyTexte(ctx, "Le duel testé par les sondages", marge, y, { taille:60, poids:600, police:"Newsreader", max:2, interligne:1.08 }) + 14;
  const demi = storyPLarg / 2 - 20;
  storyPLigne(ctx, a, marge, y + 56, { taille:56, largeur:demi, mini:30 });
  storyPLigne(ctx, b, L - marge, y + 56, { taille:56, largeur:demi, mini:30, align:"right" });
  y += 74;
  ctx.fillStyle = ca; ctx.fillRect(marge, y, demi, 8); ctx.fillStyle = cb; ctx.fillRect(L - marge - demi, y, demi, 8);
  y += 30;
  ctx.font = `700 210px "Newsreader"`; ctx.fillStyle = storyPLisible(ca); ctx.fillText(nombreFr(sa), marge, y + 170);
  ctx.fillStyle = storyPLisible(cb); ctx.textAlign = "right"; ctx.fillText(nombreFr(sb), L - marge, y + 170); ctx.textAlign = "left";
  ctx.font = `700 40px "Public Sans"`; ctx.fillStyle = STORY.pale; ctx.textAlign = "center"; ctx.fillText("%", L / 2, y + 150); ctx.textAlign = "left";
  y += 200;
  ctx.font = `600 26px "Public Sans"`; ctx.fillStyle = STORY.doux;
  ctx.fillText(`${premier.nom}, enquête du ${premier.date}`, marge, y + 20);
  y += 44;
  const hb = 56, wa = storyPLarg * sa / (sa + sb);
  ctx.save(); ctx.beginPath(); ctx.rect(marge, y, storyPLarg, hb, hb / 2); ctx.clip();
  ctx.fillStyle = ca; ctx.fillRect(marge, y, wa - 2, hb); ctx.fillStyle = cb; ctx.fillRect(marge + wa + 2, y, storyPLarg - wa - 2, hb);
  ctx.restore();
  y += hb + 40;
  if(d.instituts.length > 1){
    y = storyPSousTitre(ctx, "Chaque institut", marge, y);
    const nb = Math.max(1, Math.min(6, d.instituts.length, Math.floor((1500 - y - 80) / 96) + 1));
    const pas = nb > 1 ? Math.min(110, (1500 - 80 - y) / (nb - 1)) : 110;
    for(const i of d.instituts.slice(0, nb)){
      const x = i.scores[a], z = i.scores[b];
      ctx.font = `600 28px "Public Sans"`; ctx.fillStyle = STORY.encre; ctx.fillText(i.nom, marge, y + 28);
      ctx.font = `400 24px "Public Sans"`; ctx.fillStyle = STORY.doux; ctx.textAlign = "right"; ctx.fillText(i.date, L - marge, y + 28); ctx.textAlign = "left";
      const by = y + 42, h = 38, w = storyPLarg * x / (x + z);
      ctx.save(); ctx.beginPath(); ctx.rect(marge, by, storyPLarg, h, h / 2); ctx.clip();
      ctx.fillStyle = ca; ctx.fillRect(marge, by, w - 2, h); ctx.fillStyle = cb; ctx.fillRect(marge + w + 2, by, storyPLarg - w - 2, h);
      ctx.restore();
      ctx.font = `700 24px "Public Sans"`; ctx.fillStyle = "#fff"; ctx.textBaseline = "middle";
      ctx.fillText(`${nombreFr(x)} %`, marge + 18, by + h / 2 + 2); ctx.textAlign = "right"; ctx.fillText(`${nombreFr(z)} %`, L - marge - 18, by + h / 2 + 2); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
      y += pas;
    }
  }
  storyPied(ctx, `Sondages de second tour (${premier.nom} et autres instituts), en % des votes exprimés, notices sur commission-des-sondages.fr. Un sondage n'est pas une prévision.`);
  return { nom:`second-tour-${slugDep(a)}-${slugDep(b)}` };
};

// 5. Décompte avant l'annonce du président (data-id vide)
STORY_PLUS.decompte = async (ctx)=>{
  const { L, marge } = STORY;
  const [iso1, iso2] = TOURS_PRESIDENTIELLE;
  const jours = iso => Math.round((Date.parse(iso) - Date.parse(aujourdhuiISO())) / 864e5);
  const j2 = jours(iso2), j1 = jours(iso1);
  if(j2 < 0) return null;
  let y = storyCadre(ctx, "Présidentielle 2027 · décompte");
  y = storyTexte(ctx, "Avant l'annonce du président de la République", marge, y, { taille:62, poids:600, police:"Newsreader", max:3, interligne:1.1 }) + 40;
  storyPFond(ctx, STORY.bleu, y, 440);
  storyPLigne(ctx, j2 === 0 ? "Jour J" : `J-${j2}`, L / 2, y + 330, { taille:420, poids:700, couleur:STORY.bleu, largeur:storyPLarg, align:"center", mini:120 });
  if(j2 > 0){
    ctx.font = `600 44px "Public Sans"`; ctx.fillStyle = STORY.doux; ctx.textAlign = "center";
    ctx.fillText(j2 === 1 ? "plus qu'un jour" : `${formatNombre(j2)} jours · environ ${Math.round(j2 / 7)} semaines`, L / 2, y + 400);
    ctx.textAlign = "left";
  }
  y += 470;
  const carte = (titre, date, detail, couleur, jr)=>{
    storyPCarte(ctx, marge, y, storyPLarg, 180);
    ctx.fillStyle = couleur; ctx.fillRect(marge, y + 18, 10, 144);
    storyTexte(ctx, titre, marge + 40, y + 14, { taille:26, poids:700, couleur:STORY.pale, max:1 });
    storyTexte(ctx, date, marge + 40, y + 52, { taille:38, poids:600, police:"Newsreader", largeur:storyPLarg - 300, max:2, interligne:1.05 });
    storyTexte(ctx, detail, marge + 40, y + 134, { taille:24, couleur:STORY.doux, largeur:storyPLarg - 100, max:1 });
    if(jr !== null){ ctx.font = `700 76px "Newsreader"`; ctx.fillStyle = couleur; ctx.textAlign = "right"; ctx.fillText(jr > 0 ? `J-${jr}` : "Jour J", L - marge - 30, y + 118); ctx.textAlign = "left"; }
    y += 200;
  };
  if(j1 >= 0) carte("PREMIER TOUR", storyPDateLongue(iso1), "Scrutin du 18 avril", STORY.rouge, j1);
  carte("SECOND TOUR ET ANNONCE", storyPDateLongue(iso2), "Annonce à 20 h, à la fermeture des derniers bureaux", STORY.bleu, j2 > 0 ? j2 : null);
  storyPied(ctx, "Calendrier de l'élection présidentielle de 2027 : premier tour le 18 avril, second tour le 2 mai ; résultats officiels proclamés par le Conseil constitutionnel.");
  return { nom:"decompte-presidentielle-2027" };
};

// 6. Une candidature (data-id : nom exact)
STORY_PLUS.candidat = async (ctx, info)=>{
  const c = CANDIDATURES?.find(x=>x.nom === info);
  if(!c) return null;
  const { L, marge } = STORY;
  const coul = COULEURS_PARTIS[c.code] || "#8A8C94", lisible = storyPLisible(coul);
  let y = storyCadre(ctx, "Présidentielle 2027 · candidat");
  const photo = await storyPortrait(`photos/personnalites/${slugDep(c.nom)}.jpg`);
  let annonceDite = false;
  const age = ()=> c.age ? (ctx.font = `700 170px "Newsreader"`, ctx.fillStyle = lisible, true) : false;
  if(photo){
    // portrait rectangulaire à gauche, nom, parti et âge à droite
    const pw = 400, ph = 540;
    const zp = storyPPhoto(ctx, photo, marge, y, pw, ph);
    const x0 = marge + zp.w + 44, w = L - marge - x0;
    ctx.fillStyle = coul; ctx.fillRect(zp.x, zp.y + zp.h, zp.w, 8);
    const yn = storyTexte(ctx, c.nom, x0, y - 8, { taille:78, poids:700, police:"Newsreader", largeur:w, max:4, interligne:1.02 });
    ctx.font = `700 28px "Public Sans"`;
    storyPastille(ctx, storyLignes(ctx, c.parti.toUpperCase(), w - 40, 1)[0], x0, yn + 30, lisible, "#fff", 28);
    if(age()){
      ctx.fillText(String(c.age), x0, y + ph - 6);
      const wa = ctx.measureText(String(c.age)).width;
      ctx.font = `600 40px "Public Sans"`; ctx.fillStyle = STORY.doux; ctx.fillText("ans", x0 + wa + 16, y + ph - 70);
      ctx.font = `400 24px "Public Sans"`; ctx.fillText("au premier tour", x0 + wa + 16, y + ph - 34);
    }
    y += ph + 8 + 52;
  } else {
    // sans portrait libre : rien de décoratif, le nom devient le titre
    y = storyTexte(ctx, c.nom, marge, y, { taille:124, poids:700, police:"Newsreader", max:3, interligne:1.0 }) + 34;
    storyPastille(ctx, c.parti.toUpperCase(), marge, y, lisible, "#fff", 32);
    y += 90;
    // chiffres en grand : âge, date d'annonce
    const da = c.annonce ? new Date(c.annonce + "T12:00:00") : null;
    const stats = [];
    if(c.age) stats.push([String(c.age), "ans", "au premier tour"]);
    if(da && !isNaN(da)){ stats.push([String(da.getDate()), da.toLocaleDateString("fr-FR", { month:"long", year:"numeric" }), "candidature annoncée"]); annonceDite = true; }
    for(const [gros, l1, l2] of stats){
      ctx.fillStyle = STORY.encre; ctx.fillRect(marge, y, STORY.L - 2 * marge, 4);
      ctx.font = `700 300px "Newsreader"`; ctx.fillStyle = lisible; ctx.fillText(gros, marge, y + 262);
      const wa = ctx.measureText(gros).width;
      ctx.font = `700 52px "Public Sans"`; ctx.fillStyle = STORY.encre; ctx.fillText(storyLignes(ctx, l1, STORY.L - marge - (marge + wa + 24), 1)[0], marge + wa + 24, y + 185);
      ctx.font = `400 30px "Public Sans"`; ctx.fillStyle = STORY.doux; ctx.fillText(l2, marge + wa + 24, y + 235);
      y += 330;
    }
    y += 10;
  }
  if(c.slogan) y = storyTexte(ctx, `« ${c.slogan} »`, marge, y, { taille:48, poids:600, police:"Newsreader", couleur:STORY.doux, max:3, interligne:1.15 }) + 16;
  for(const f of (c.fonctions || []).slice(0, 4)){
    if(y > 1320) break;
    y = storyTexte(ctx, f, marge, y, { taille:34, couleur:STORY.encre, max:3, interligne:1.2 }) + 8;
  }
  const ya = Math.min(Math.max(y + 36, 1390), 1440);
  if(!annonceDite){ ctx.fillStyle = STORY.encre; ctx.fillRect(marge, ya - 26, STORY.L - 2 * marge, 3); }
  if(!annonceDite) storyTexte(ctx, c.annonce ? `Candidature annoncée le ${dateCourte(c.annonce) || c.annonce}` : "Candidature annoncée", marge, ya, { taille:34, poids:700, couleur:STORY.bleu, max:1 });
  const dom = storyPDomaine(c.source) || "la source indiquée sur le site";
  const credits = photo ? await storyPCredits([c.nom]) : [];
  storyPied(ctx, `Candidature rapportée par ${dom}, d'après la liste des candidatures de Wikipédia.${credits.length ? ` Photo : ${credits.join(", ")}.` : ""}`);
  return { nom:`candidat-${slugDep(c.nom)}` };
};

// 7. Un parti (data-id : code du parti)
STORY_PLUS.parti = async (ctx, info)=>{
  const l = LEADERS?.find(x=>x.parti === info);
  if(!l) return null;
  const { L, marge } = STORY;
  const p = PARTIES.find(x=>x.id === l.parti), g = GROUPES?.[l.parti];
  const coul = l.couleur || p?.couleur || "#6B6E78", sansChef = l.nom.startsWith("—");
  let y = storyCadre(ctx, "Les partis");
  storyPFond(ctx, coul, y - 6, 330);
  y += 20;
  const logo = await storyImage(`icons/partis/${l.parti}.png`);
  let tx = marge;
  if(logo){ storyPLogo(ctx, logo, marge, y, 260); tx = marge + 300; }
  storyPLigne(ctx, l.parti, tx, y + 130, { taille:150, poids:700, couleur:storyPLisible(coul), largeur:L - marge - tx, mini:60 });
  storyTexte(ctx, g?.libelle || p?.nom || l.parti, tx, y + 150, { taille:32, poids:600, couleur:STORY.doux, largeur:L - marge - tx, max:2 });
  y += 330;
  y = storyPSousTitre(ctx, "À la tête du parti", marge, y + 20);
  y = storyTexte(ctx, sansChef ? "Pas de chef de parti unique" : l.nom, marge, y, { taille:sansChef ? 72 : 88, poids:600, police:"Newsreader", max:2, interligne:1.02 });
  y = storyTexte(ctx, l.role, marge, y + 4, { taille:42, couleur:STORY.doux, max:4, interligne:1.25 }) + 70;
  if(g?.membres){
    storyPCarte(ctx, marge, y, storyPLarg, 320);
    ctx.fillStyle = coul; ctx.fillRect(marge, y + 20, 10, 280);
    ctx.font = `700 210px "Newsreader"`; ctx.fillStyle = storyPLisible(coul); ctx.fillText(formatNombre(g.membres), marge + 44, y + 235);
    const w = ctx.measureText(formatNombre(g.membres)).width;
    storyTexte(ctx, "députés dans le groupe à l'Assemblée nationale", marge + 44 + w + 24, y + 100, { taille:34, poids:600, couleur:STORY.doux, largeur:storyPLarg - w - 90, max:3 });
    y += 360;
    if(g.president && g.president !== l.nom) storyTexte(ctx, `${g.presidente ? "Présidente" : "Président"} du groupe : ${g.president}`, marge, y, { taille:40, poids:600, couleur:STORY.encre, max:2 });
  }
  storyPied(ctx, `Direction du parti : ${l.source?.nom || "sources publiques"}. Effectifs du groupe : Assemblée nationale (open data).`);
  return { nom:`parti-${slugDep(l.parti)}` };
};

// 8. Une décision de justice (data-id : indice dans CONDAMNATIONS)
STORY_PLUS.justice = async (ctx, info)=>{
  const c = CONDAMNATIONS?.[Number(info)];
  if(!c) return null;
  const { marge } = STORY;
  const coul = c.statut === "definitif" ? STORY.rouge : STORY.ambreTxt;
  let y = storyCadre(ctx, "Justice · décisions rendues");
  y = storyTexte(ctx, c.nom, marge, y, { taille:84, poids:600, police:"Newsreader", max:2, interligne:1.03 });
  y = storyTexte(ctx, `${c.role} · ${c.parti}`, marge, y, { taille:32, poids:600, couleur:STORY.doux, max:2 }) + 22;
  // Statut, tel qu'il figure dans la source
  ctx.font = `700 34px "Public Sans"`;
  const n = storyLignes(ctx, c.statutLabel, storyPLarg - 70, 3).length, h = 56 + n * 42;
  storyPCarte(ctx, marge, y, storyPLarg, h, "#FBF8F1", coul);
  ctx.fillStyle = coul; ctx.fillRect(marge, y + 16, 10, h - 32);
  ctx.font = `700 22px "Public Sans"`; ctx.fillStyle = STORY.pale; ctx.letterSpacing = "2px"; ctx.fillText("STATUT JUDICIAIRE", marge + 40, y + 38); ctx.letterSpacing = "0px";
  storyTexte(ctx, c.statutLabel, marge + 40, y + 44, { taille:34, poids:700, couleur:coul, largeur:storyPLarg - 70, max:3, interligne:1.2 });
  y += h + 34;
  y = storyTexte(ctx, c.affaire, marge, y, { taille:56, poids:600, police:"Newsreader", max:3, interligne:1.1 }) + 12;
  const td = storyTailleFit(ctx, c.detail, y, c.statut === "appel" ? 1230 : 1440, { tMax:54, tMin:36, interligne:1.3 });
  y = storyTexte(ctx, c.detail, marge, y, { taille:td, couleur:STORY.encre, max:td > 36 ? 99 : 11, interligne:1.3 }) + 24;
  if(c.statut === "appel"){
    const t = "Décision non définitive : la présomption d'innocence s'applique pour ces faits tant que la justice n'a pas statué définitivement.";
    ctx.font = `600 28px "Public Sans"`;
    const k = storyLignes(ctx, t, storyPLarg - 50, 4).length, hh = 30 + k * 36;
    storyPCarte(ctx, marge, y, storyPLarg, hh, "#F3EBD3", STORY.ambreTxt);
    storyTexte(ctx, t, marge + 25, y + 14, { taille:28, poids:600, couleur:STORY.encre, largeur:storyPLarg - 50, max:4, interligne:1.25 });
  }
  storyPied(ctx, `Source : ${c.source}. Statut tel qu'indiqué par la source ; présomption d'innocence tant que la décision n'est pas définitive.`);
  return { nom:`justice-${slugDep(c.nom)}-${slugDep(c.affaire).slice(0, 30)}` };
};

// 9. Un chiffre clé (data-id : indice dans INDICATEURS)
STORY_PLUS.indicateur = async (ctx, info)=>{
  const i = INDICATEURS?.[Number(info)];
  if(!i) return null;
  const { L, marge } = STORY;
  const coul = i.tendance === "up" ? STORY.rouge : i.tendance === "down" ? STORY.vert : STORY.bleu;
  let y = storyCadre(ctx, "Chiffres clés · France");
  y = storyTexte(ctx, i.nom, marge, y, { taille:78, poids:600, police:"Newsreader", max:2, interligne:1.03 }) + 24;
  storyPFond(ctx, coul, y, 500);
  const mv = /^(.+?%)\s+(\S.*)$/.exec(i.valeur), valeur = mv ? mv[1] : i.valeur;
  storyPLigne(ctx, valeur, marge, y + 330, { taille:300, poids:700, couleur:coul, largeur:storyPLarg, mini:90 });
  if(mv) storyPLigne(ctx, mv[2], L - marge, y + 432, { taille:60, poids:600, couleur:STORY.doux, largeur:storyPLarg - 360, align:"right", mini:30 });
  if(i.tendance === "up" || i.tendance === "down"){
    const hx = marge + 22, hy = y + 420;
    ctx.fillStyle = coul; ctx.beginPath();
    if(i.tendance === "up"){ ctx.moveTo(hx - 22, hy + 14); ctx.lineTo(hx + 22, hy + 14); ctx.lineTo(hx, hy - 24); }
    else { ctx.moveTo(hx - 22, hy - 14); ctx.lineTo(hx + 22, hy - 14); ctx.lineTo(hx, hy + 24); }
    ctx.closePath(); ctx.fill();
    ctx.font = `700 38px "Public Sans"`; ctx.fillText(i.tendance === "up" ? "En hausse" : "En baisse", marge + 64, hy + 12);
  }
  y += 560;
  const tdi = storyTailleFit(ctx, i.detail, y, 1380, { tMax:54, tMin:40, interligne:1.3 });
  y = storyTexte(ctx, i.detail, marge, y, { taille:tdi, couleur:STORY.encre, max:tdi > 40 ? 99 : 7, interligne:1.3 }) + 24;
  storyTexte(ctx, `${i.source}, ${i.date}`, marge, y, { taille:30, poids:700, couleur:STORY.bleu, max:2 });
  storyPied(ctx, `Source : ${i.source}, ${i.date}. Série officielle consultable sur ${storyPDomaine(i.url) || "le site de la source"}.`);
  return { nom:`chiffre-${slugDep(i.nom)}` };
};

// 10. Un groupe de l'Assemblée (data-id : id de groupe, ex. « RN »)
STORY_PLUS.groupe = async (ctx, info)=>{
  const p = PARTIES.find(x=>x.id === info);
  if(!p) return null;
  const { L, marge } = STORY;
  const g = GROUPES?.[p.id], eff = g?.membres ?? p.sieges, coul = p.couleur;
  let y = storyCadre(ctx, "Assemblée nationale · groupe");
  storyPFond(ctx, coul, y - 6, 300);
  y += 20;
  const logo = await storyImage(`icons/partis/${p.id}.png`);
  let tx = marge;
  if(logo){ storyPLogo(ctx, logo, marge, y, 220); tx = marge + 256; }
  storyPLigne(ctx, p.id, tx, y + 120, { taille:130, poids:700, couleur:storyPLisible(coul), largeur:L - marge - tx, mini:60 });
  storyTexte(ctx, g?.libelle || p.nom, tx, y + 134, { taille:34, poids:600, couleur:STORY.doux, largeur:L - marge - tx, max:2 });
  y += 290;
  storyPLigne(ctx, formatNombre(eff), marge, y + 290, { taille:340, poids:700, couleur:storyPLisible(coul), largeur:storyPLarg - 10, mini:120 });
  y += 330;
  y = storyTexte(ctx, eff > 1 ? "députés" : "député", marge, y, { taille:56, poids:600, police:"Newsreader", max:1 }) + 28;
  const total = TOTAL_SIEGES || 577;
  storyBarre(ctx, marge, y, storyPLarg, 36, [[eff, coul]], total);
  const maj = Math.floor(total / 2) + 1, xm = marge + storyPLarg * maj / total;
  ctx.fillStyle = STORY.encre; ctx.fillRect(xm - 2, y - 12, 4, 60);
  y += 80;
  ctx.font = `600 28px "Public Sans"`; ctx.fillStyle = STORY.doux;
  ctx.fillText(`${nombreFr(eff / total * 100)} % des ${formatNombre(total)} sièges`, marge, y);
  ctx.textAlign = "right"; ctx.fillText(`Majorité absolue : ${maj}`, L - marge, y); ctx.textAlign = "left";
  y += 50;
  if(g?.president){
    storyPCarte(ctx, marge, y, storyPLarg, 150);
    ctx.fillStyle = coul; ctx.fillRect(marge, y + 16, 10, 118);
    storyTexte(ctx, g.presidente ? "PRÉSIDENTE DU GROUPE" : "PRÉSIDENT DU GROUPE", marge + 40, y + 12, { taille:22, poids:700, couleur:STORY.pale, max:1 });
    storyTexte(ctx, g.president, marge + 40, y + 46, { taille:48, poids:600, police:"Newsreader", max:1, largeur:storyPLarg - 80 });
    if(g.presidentDepuis) storyTexte(ctx, `depuis le ${dateCourte(g.presidentDepuis)}`, marge + 40, y + 100, { taille:24, couleur:STORY.doux, max:1 });
  }
  storyPied(ctx, "Assemblée nationale, composition des groupes politiques (open data) ; effectifs relevés automatiquement.");
  return { nom:`groupe-${slugDep(p.id)}` };
};

// 11. Un meeting (data-id : indice dans MEETINGS)
STORY_PLUS.meeting = async (ctx, info)=>{
  const m = MEETINGS?.[Number(info)];
  if(!m) return null;
  const { L, marge } = STORY;
  const coul = m.partyColor || "#6B6E78";
  let y = storyCadre(ctx, "Agenda · meetings");
  storyPFond(ctx, coul, y - 6, 400);
  y += 10;
  storyPLigne(ctx, m.jour, marge, y + 270, { taille:300, poids:700, couleur:storyPLisible(coul), largeur:storyPLarg, mini:100 });
  y += 290;
  const mois = String(m.mois).toUpperCase();
  ctx.font = `700 64px "Public Sans"`; ctx.fillStyle = STORY.encre; ctx.letterSpacing = "4px"; ctx.fillText(mois, marge, y + 56); ctx.letterSpacing = "0px";
  if(m.parti) storyPastille(ctx, m.parti, marge + ctx.measureText(mois).width + 60, y + 6, storyPLisible(coul), "#fff", 36);
  y += 130;
  y = storyTexte(ctx, m.titre, marge, y, { taille:68, poids:600, police:"Newsreader", max:4, interligne:1.08 }) + 14;
  const ou = [m.heure && m.heure !== "—" ? m.heure : "", m.lieu].filter(Boolean).join(" · ");
  if(ou) y = storyTexte(ctx, ou, marge, y, { taille:34, poids:700, couleur:STORY.bleu, max:3, interligne:1.2 }) + 14;
  const tdm = storyTailleFit(ctx, m.desc, y, 1400, { tMax:46, tMin:32, interligne:1.3 });
  y = storyTexte(ctx, m.desc, marge, y, { taille:tdm, couleur:STORY.doux, max:tdm > 32 ? 99 : 8, interligne:1.3 }) + 14;
  if((m.fin || m.debut) < aujourdhuiISO()) storyTexte(ctx, "Événement passé", marge, y, { taille:30, poids:700, couleur:STORY.pale, max:1 });
  else if(!m.verified) storyTexte(ctx, "Date à confirmer", marge, y, { taille:30, poids:700, couleur:STORY.ambreTxt, max:1 });
  storyPied(ctx, `Date annoncée par ${m.source?.nom || "l'organisateur"}. Les programmes peuvent changer : vérifiez auprès de l'organisateur.`);
  return { nom:`meeting-${slugDep(m.titre).slice(0, 40)}` };
};

// Stories d'actualité : modules séparés, chargés ensemble (A « à la une » et E « en direct » : stories-actu ; B « en bref » et D « dossier » : stories-actu-liste ;
// C « le chiffre », F « face à face » et G « date à retenir » : stories-actu-fait). Chacun remplit STORY_PLUS ; les définitions ci-dessus ne servent que de secours.
const STORY_ACTU_TYPES = ["actualite", "actualites", "chiffre", "facea", "date"];
async function dessinerStory(type, info){
  if(STORY_ACTU_TYPES.includes(type)) await Promise.all(["stories-actu", "stories-actu-liste", "stories-actu-fait"].map(chargerModule));
  await Promise.all(["600 60px Newsreader", "700 60px Newsreader", "400 30px \"Public Sans\"", "600 30px \"Public Sans\"", "700 30px \"Public Sans\""].map(f=> document.fonts.load(f).catch(()=>{})));
  const c = document.createElement("canvas");
  c.width = STORY.L; c.height = STORY.H;
  const ctx = c.getContext("2d");
  const { L, marge, bas } = STORY, largeur = L - 2 * marge;
  let y, nom = "hemicycle-france";
  const fr1 = n => String(n).replace(".", ",");

  if(type === "scrutin" || type === "senat"){
    let titre, date, resultat, groupes, sourceTxt, surtitre, censure = false;
    if(type === "scrutin"){
      const loi = currentLoi(); if(!loi) return null;
      censure = loi.typeVote === "MOC";
      titre = titreLoi(loi); date = loi.date; resultat = loi.resultat;
      groupes = PARTIES.filter(p=>loi.votes?.[p.id]).map(p=>({ id:p.id, nom:p.nom, couleur:p.couleur, ...loi.votes[p.id] }));
      surtitre = `Assemblée nationale · ${date}`;
      sourceTxt = `Scrutin public n°${loi.numero} de l'Assemblée nationale. Votes nominatifs officiels, détail par groupe.`;
      nom = `vote-${loi.numero}`;
    } else {
      const s = SENAT?.find(x=>x.id === info); if(!s) return null;
      titre = titreSenat(s); date = s.date; resultat = s.resultat;
      groupes = Object.keys(GROUPES_SENAT).filter(g=>s.groupes[g]).map(g=>({ id:g, nom:GROUPES_SENAT[g].nom, couleur:GROUPES_SENAT[g].couleur, ...s.groupes[g] }));
      surtitre = `Sénat · ${date}`;
      sourceTxt = `Scrutin public n°${s.numero} du Sénat (session ${s.session}-${s.session + 1}), page officielle senat.fr.`;
      nom = `senat-${s.session}-${s.numero}`;
    }
    const adopte = resultat === "adopte", theme = adopte ? STORY.vert : STORY.rouge;
    y = storyCadre(ctx, surtitre, { couleur:theme });
    const mot = adopte ? (censure ? "Censure adoptée" : "Adopté") : (censure ? "Censure rejetée" : "Rejeté");
    y = storyChiffreHeros(ctx, mot, marge, y + 112, theme, 150);
    y = storyTexte(ctx, titre, marge, y + 6, { taille:48, poids:600, police:"Newsreader", max:3, interligne:1.12 }) + 14;
    const pour = groupes.reduce((a,g)=>a+g.pour,0), contre = groupes.reduce((a,g)=>a+(g.contre||0),0), abst = groupes.reduce((a,g)=>a+(g.abst||0),0);
    const total = pour + contre + abst;
    const colonnes = censure ? [["Pour la censure", pour, STORY.vert], ["Voix requises", 289, STORY.encre]] : [["Pour", pour, STORY.vert], ["Contre", contre, STORY.rouge], ["Abstention", abst, STORY.ambre]];
    const hc = 330;
    storyCarte(ctx, marge, y, largeur, hc);
    if(censure) storyHemicycle(ctx, marge + 300, y + hc - 34, 262, [[pour, STORY.vert]], 577, 190);
    else storyHemicycle(ctx, marge + 300, y + hc - 34, 262, [[pour, STORY.vert], [contre, STORY.rouge], [abst, STORY.ambre]], total || 1, 190);
    colonnes.forEach(([lib, n, coul], i)=>{
      const yy = y + 36 + i * (colonnes.length === 3 ? 96 : 120), x = marge + 620;
      ctx.fillStyle = coul; ctx.fillRect(x, yy + 11, 18, 18);
      ctx.font = `600 24px "Public Sans"`; ctx.fillStyle = STORY.doux; ctx.fillText(lib, x + 28, yy + 28);
      ctx.font = `700 64px "Newsreader"`; ctx.fillStyle = coul === STORY.ambre ? STORY.ambreTxt : coul; ctx.fillText(formatNombre(n), x, yy + 88);
    });
    y += hc + 26;
    if(!censure){ storyBarre(ctx, marge, y, largeur, 26, [[pour, STORY.vert], [contre, STORY.rouge], [abst, STORY.ambre]], total || 1); y += 56; }
    y = storyTitreSection(ctx, "Par groupe", marge, y + 14, theme) + 8;
    const rangs = Math.ceil(groupes.length / 2), pas = Math.min(58, (bas - y - 30) / Math.max(1, rangs));
    storyCarte(ctx, marge, y, largeur, rangs * pas + 24, "#fff", 24);
    const cw = (largeur - 60) / 2, taille = Math.min(26, pas * 0.5);
    groupes.forEach((g, i)=>{
      const x = marge + 24 + (i % 2) * (cw + 12), yy = y + 12 + Math.floor(i / 2) * pas, ym = yy + pas / 2;
      ctx.fillStyle = g.couleur; ctx.fillRect(x, ym - 9, 18, 18);
      ctx.font = `600 ${taille}px "Public Sans"`; ctx.fillStyle = STORY.encre;
      ctx.fillText(storyLignes(ctx, g.id, 100, 1)[0], x + 28, ym + taille * 0.36);
      const m = g.membres || (g.pour + (g.contre||0) + (g.abst||0) + (g.npv||0)) || 1;
      storyBarre(ctx, x + 138, ym - 8, 150, 16, [[g.pour, STORY.vert], [g.contre||0, STORY.rouge], [g.abst||0, STORY.ambre]], m);
      const pos = censure ? (g.pour ? `${g.pour} pour` : "—") : positionMajoritaire({ typeVote:"" }, g);
      ctx.font = `700 ${taille * 0.85}px "Public Sans"`; ctx.textAlign = "right";
      ctx.fillStyle = pos === "pour" ? STORY.vert : pos === "contre" ? STORY.rouge : pos === "abst" ? STORY.ambreTxt : STORY.doux;
      ctx.fillText(censure ? pos : ({ pour:"Pour", contre:"Contre", abst:"Abst." }[pos] || "Partagé"), x + cw - 6, ym + taille * 0.34);
      ctx.textAlign = "left";
    });
    storyPied(ctx, sourceTxt + (censure ? " Barre : part des députés du groupe ayant voté la censure." : " Barre : pour · contre · abstention, sur les membres du groupe."));
  }

  else if(type === "sondages"){
    // info : identifiant de l'enquête (« inst0 »…), sinon l'enquête choisie sur la page. Une seule enquête, premier tour.
    const inst = INSTITUTS.find(i=>i.id === (info || selectedInstitut)); if(!inst || periodeReserveSondages()) return null;
    const tous = CANDIDATS.map(c=>({ ...c, r:inst.scores[c.id] })).filter(c=>c.r).sort((a,b)=>(b.r[0]+b.r[1])-(a.r[0]+a.r[1]));
    const liste = tous.slice(0, 10);
    if(!liste.length) return null;
    // Commanditaire : relevé sur la notice déposée à la Commission des sondages, quand il est connu
    const veille = (await lireJSON("data/sondages-veille.json"))?.enquetes || [];
    const notice = veille.find(e=> e.institut === inst.nom && e.terrain?.fin === inst.dateFin);
    const commanditaire = notice?.media || "";
    y = storyCadre(ctx, "Présidentielle 2027 · sondage", { couleur:STORY.bleu });
    y = storyTexte(ctx, "Intentions de vote au 1er tour", marge, y, { taille:56, poids:600, police:"Newsreader", max:2, interligne:1.08 });
    y = storyTexte(ctx, `${inst.nom}${commanditaire ? ` pour ${commanditaire}` : ""} · terrain : ${inst.date}`, marge, y, { taille:28, poids:600, couleur:STORY.doux, max:2 });
    y = storyTexte(ctx, `${liste.length} candidats sur ${tous.length} testés, classés par milieu de fourchette`, marge, y, { taille:24, couleur:STORY.pale, max:1 }) + 10;
    const score = c => c.r[0] === c.r[1] ? `${fr1(c.r[0])} %` : `${fr1(c.r[0])}–${fr1(c.r[1])} %`;
    const photos = await Promise.all(liste.map(c=> storyPortrait(`photos/personnalites/${slugDep(c.nom)}.jpg`)));
    const yLegal = 1368, pas = Math.min(80, (yLegal - 24 - y) / liste.length), maxi = Math.max(...liste.map(c=>c.r[1]));
    storyCarte(ctx, marge, y, largeur, liste.length * pas + 24, "#fff", 24);
    liste.forEach((cd, i)=>{
      const yy = y + 12 + i * pas, r = Math.min(34, pas * 0.42), cx = marge + 26 + r, cy = yy + pas / 2;
      if(photos[i]) storyMedaillon(ctx, photos[i], cx, cy, r, cd.couleur); else storyInitiales(ctx, cd.nom, cx, cy, r, cd.couleur);
      const x = cx + r + 20;
      ctx.font = `600 ${Math.min(30, pas * 0.4)}px "Public Sans"`; ctx.fillStyle = STORY.encre; ctx.fillText(storyLignes(ctx, cd.nom, 420, 1)[0], x, yy + pas * 0.44);
      ctx.font = `700 ${Math.min(38, pas * 0.5)}px "Newsreader"`; ctx.fillStyle = storyLisible(cd.couleur); ctx.textAlign = "right"; ctx.fillText(score(cd), L - marge - 26, yy + pas * 0.46); ctx.textAlign = "left";
      storyBarre(ctx, x, yy + pas * 0.6, L - marge - 26 - x, 12, cd.r[0] === cd.r[1] ? [[cd.r[0], cd.couleur]] : [[cd.r[0], cd.couleur], [cd.r[1] - cd.r[0], storyAlpha(cd.couleur, 0.35)]], maxi); // plein : bas de la fourchette ; clair : jusqu'au haut
    });
    // Mentions obligatoires (loi n° 77-808 du 19 juillet 1977) : institut, commanditaire, dates, échantillon, marge d'erreur, notice, source
    const erreur = inst.n ? `±${(1.96 * Math.sqrt(0.25 / inst.n) * 100).toFixed(1).replace(".", ",")} pts` : "";
    const mentions = `Sondage ${inst.nom}${commanditaire ? ` pour ${commanditaire}` : " (commanditaire non relevé)"}, terrain : ${inst.date}, auprès de ${inst.echantillon}. `
      + (erreur ? `Marge d'erreur théorique : ${erreur} à 95 %. ` : "")
      + `Chiffres tels que publiés${inst.nbHyp > 1 ? ` : fourchette selon les ${inst.nbHyp} hypothèses de candidatures testées` : " (hypothèse unique testée)"}. `
      + `Une notice détaillée est déposée à la Commission des sondages (commission-des-sondages.fr), qui précise la méthode. `
      + `Source : ${inst.source}, via la liste Wikipédia des sondages. Un sondage n'est pas une prévision.`;
    ctx.fillStyle = STORY.encre; ctx.fillRect(marge, yLegal, largeur, 5);
    storyTexte(ctx, mentions, marge, yLegal + 16, { taille:23, couleur:STORY.doux, max:9, interligne:1.2 });
    ctx.font = `800 34px "Public Sans"`; ctx.fillStyle = STORY.bleu; ctx.fillText(COMPTE_STORY, marge, 1700);
    nom = `sondage-${slugDep(inst.nom)}`;
  }

  else if(type === "depute"){
    const d = DEPUTES?.find(x=>x.id===deputeOuvert); if(!d) return null;
    const p = partiDepute(d), s = d.stats, exprimes = s.pour + s.contre + s.abst;
    y = storyCadre(ctx, "Votre député", { couleur:p.couleur });
    const photo = await storyPortrait(`photos/deputes/${d.id}.jpg`);
    const possibles = [...d.votes].filter(c=>c !== ".").length, presents = [...d.votes].filter(c=>"pca".includes(c)).length;
    const derniers = DEPUTES_CLES.map((numero, i)=>({ code:d.votes[i], loi:LOIS.find(l=>l.numero===numero) })).filter(x=>x.code !== "." && x.loi).slice(0, 8);
    storyFicheElu(ctx, y, {
      photo, couleur:p.couleur, nom:d.nom, soustitre:p.nom,
      ligne:`${d.f ? "Députée" : "Député"} de ${circoDepute(d)} (${d.numDep})`,
      cartes:[[`${presents}/${possibles}`, d.f ? "votes clés où elle a voté" : "votes clés où il a voté", storyLisible(p.couleur)], [pctFr(exprimes, s.scrutins), "de tous les scrutins", STORY.bleu], [formatNombre(s.ecarts), "votes contre son groupe", STORY.rouge]],
      titreVotes:"Ses derniers votes clés",
      votes:derniers.map(({ code, loi })=>({ code, titre:titreLoi(loi) })),
    });
    storyPied(ctx, "Votes nominatifs de l'Assemblée nationale. Un taux bas ne veut pas dire qu'un député ne travaille pas (commissions, circonscription).");
    nom = `depute-${slugDep(d.nom)}`;
  }

  else if(type === "commune"){
    const dep = info.dep, commune = info.commune;
    if(!ELECTIONS.has(dep)) ELECTIONS.set(dep, lireJSON(`data/elections/${dep}.json`));
    const data = await ELECTIONS.get(dep), r = data?.communes?.[commune];
    if(!r) return null;
    const classer = t => (r[t] || []).map((v, i)=>[data.candidats[t][i], v]).sort((a, b)=>b[1] - a[1]);
    const tours = [["t1", "1er tour · 10 avril 2022", r.t2 ? 5 : 8, classer("t1")]];
    if(r.t2) tours.push(["t2", "2d tour · 24 avril 2022", 2, classer("t2")]);
    const final = tours[tours.length - 1][3], [gagnant, vg] = final[0];
    const coulG = COULEURS_2022[gagnant] || "#8A8C94";
    const pct = v => (v / 10).toLocaleString("fr-FR", { minimumFractionDigits:1, maximumFractionDigits:1 }) + " %";
    y = storyCadre(ctx, "Présidentielle 2022 · résultats", { couleur:coulG });
    y = storyTexte(ctx, commune, marge, y, { taille:72, poids:600, police:"Newsreader", max:2, interligne:1.05 });
    y = storyTexte(ctx, data.departement || "", marge, y, { taille:30, couleur:STORY.doux, max:1 }) + 10;
    const hh = 250;
    storyCarte(ctx, marge, y, largeur, hh);
    ctx.fillStyle = coulG; ctx.beginPath(); ctx.rect(marge, y + 40, 12, hh - 80, 6); ctx.fill();
    ctx.font = `700 22px "Public Sans"`; ctx.letterSpacing = "2px"; ctx.fillStyle = storyLisible(coulG);
    ctx.fillText(r.t2 ? "EN TÊTE AU 2D TOUR" : "EN TÊTE AU 1ER TOUR", marge + 44, y + 56); ctx.letterSpacing = "0px";
    ctx.font = `600 46px "Newsreader"`; ctx.fillStyle = STORY.encre; ctx.fillText(gagnant, marge + 44, y + 108);
    storyChiffreHeros(ctx, pct(vg), marge + 44, y + 224, storyLisible(coulG), 130);
    y += hh + 24;
    const nbL = tours.reduce((a, t)=>a + t[2], 0), entetes = tours.length * 54;
    const pas = Math.min(74, (bas - y - entetes - 40) / nbL);
    storyCarte(ctx, marge, y, largeur, entetes + nbL * pas + 30, "#fff", 24);
    y += 14;
    for(const [t, titre, n, lignes] of tours){
      ctx.font = `700 22px "Public Sans"`; ctx.fillStyle = STORY.doux; ctx.letterSpacing = "2px"; ctx.fillText(titre.toUpperCase(), marge + 28, y + 36); ctx.letterSpacing = "0px";
      const autres = lignes.slice(n).reduce((a, [, v])=>a + v, 0);
      if(autres){ ctx.font = `400 22px "Public Sans"`; ctx.textAlign = "right"; ctx.fillText(`Autres : ${pct(autres)}`, L - marge - 28, y + 36); ctx.textAlign = "left"; }
      y += 54;
      const maxi = lignes[0]?.[1] || 1;
      for(const [nomC, v] of lignes.slice(0, n)){
        const coul = COULEURS_2022[nomC] || "#8A8C94";
        ctx.fillStyle = coul; ctx.fillRect(marge + 31, y + pas * 0.3 - 9, 18, 18);
        ctx.font = `600 ${Math.min(30, pas * 0.42)}px "Public Sans"`; ctx.fillStyle = STORY.encre; ctx.fillText(nomC, marge + 62, y + pas * 0.4);
        ctx.font = `700 ${Math.min(34, pas * 0.48)}px "Newsreader"`; ctx.fillStyle = storyLisible(coul); ctx.textAlign = "right"; ctx.fillText(pct(v), L - marge - 28, y + pas * 0.42); ctx.textAlign = "left";
        storyBarre(ctx, marge + 62, y + pas * 0.56, largeur - 90, 14, [[v, coul]], t === "t2" ? 1000 : maxi);
        y += pas;
      }
    }
    storyPied(ctx, "Résultats définitifs du ministère de l'Intérieur (data.gouv.fr), en % des suffrages exprimés dans la commune.");
    nom = `presidentielle-2022-${slugDep(commune)}`;
  }

  else if(type === "senateur"){
    const s = SENATEURS?.find(x=>x.id===senateurOuvert); if(!s) return null;
    const g = groupeSenateur(s), { lignes, presents, ecarts } = statsSenateur(s);
    y = storyCadre(ctx, s.f ? "Votre sénatrice" : "Votre sénateur", { couleur:g.couleur });
    const photo = await storyPortrait(`photos/senateurs/${s.id}.jpg`);
    storyFicheElu(ctx, y, {
      photo, couleur:g.couleur, nom:s.nom, soustitre:g.nom,
      ligne:`${s.f ? "Sénatrice" : "Sénateur"} ${/^Français/.test(s.dep) ? "des Français de l'étranger" : `de ${s.dep}`}`,
      cartes:[[`${presents.length}/${lignes.length}`, s.f ? "textes où elle s'est prononcée" : "textes où il s'est prononcé", storyLisible(g.couleur)], [["p","c","a"].map(k=>presents.filter(x=>x.code===k).length).join(" · "), "pour · contre · abst.", STORY.bleu], [formatNombre(ecarts), "votes contre son groupe", STORY.rouge]],
      titreVotes:"Ses derniers votes sur un texte",
      votes:lignes.slice(0, 8).map(({ code, scr })=>({ code, titre:titreSenat(scr) })),
    });
    storyPied(ctx, "Vote de chaque sénateur relevé sur les pages officielles des scrutins du Sénat, recoupé avec le total officiel.");
    nom = `senateur-${slugDep(s.nom)}`;
  }

  else if(type === "gouvernement"){
    const g = GOUVERNEMENT; if(!g?.membres?.length) return null;
    y = storyCadre(ctx, "Qui gouverne ?", { couleur:STORY.bleu });
    y = storyTexte(ctx, `Le ${g.nom}`, marge, y, { taille:62, poids:600, police:"Newsreader", max:2, interligne:1.05 });
    y = storyTexte(ctx, `Nommé le ${dateCourte(g.depuis)} · ${g.membres.length} membres`, marge, y, { taille:28, couleur:STORY.doux, max:1 }) + 10;
    const delegue = m => /délégué|Secrétaire/i.test(m.qualite + " " + m.fonction.split(",")[0]);
    const pm = g.membres.find(m=>m.qualite === "Premier ministre");
    const liste = g.membres.filter(m=>!delegue(m) && m !== pm);
    if(pm){
      const hh = 170;
      storyCarte(ctx, marge, y, largeur, hh);
      ctx.fillStyle = STORY.bleu; ctx.fillRect(marge, y + 30, 12, hh - 60);
      ctx.font = `800 24px "Public Sans"`; ctx.letterSpacing = "3px"; ctx.fillStyle = STORY.bleu; ctx.fillText("PREMIER MINISTRE", marge + 44, y + 68); ctx.letterSpacing = "0px";
      ctx.font = `700 64px "Newsreader"`; ctx.fillStyle = STORY.encre; ctx.fillText(storyLignes(ctx, pm.nom, largeur - 70, 1)[0], marge + 44, y + 138);
      y += hh + 22;
    }
    const rangs = Math.ceil(liste.length / 2), pas = Math.min(72, (bas - y - 30) / rangs);
    storyCarte(ctx, marge, y, largeur, rangs * pas + 24, "#fff", 24);
    const cw = (largeur - 56) / 2, r = Math.min(24, pas * 0.34);
    liste.forEach((m, i)=>{
      const x = marge + 22 + (i % 2) * (cw + 12), yy = y + 12 + Math.floor(i / 2) * pas, cy = yy + pas / 2;
      const tx = x, tl = cw - 8;
      ctx.font = `700 ${Math.min(30, pas * 0.42)}px "Public Sans"`; ctx.fillStyle = STORY.encre; ctx.fillText(storyLignes(ctx, m.nom, tl, 1)[0], tx, cy - pas * 0.04);
      let ft = Math.min(23, pas * 0.33), fct = m.fonction;
      ctx.font = `400 ${ft}px "Public Sans"`; ctx.fillStyle = STORY.doux;
      if(ctx.measureText(fct).width > tl && fct.includes(",")) fct = fct.slice(0, fct.indexOf(","));
      while(ctx.measureText(fct).width > tl && ft > 19){ ft -= 1; ctx.font = `400 ${ft}px "Public Sans"`; }
      while(ctx.measureText(fct).width > tl && fct.includes(" et ")) fct = fct.slice(0, fct.lastIndexOf(" et "));
      ctx.fillText(storyLignes(ctx, fct, tl, 1)[0], tx, cy + pas * 0.33);
    });
    storyPied(ctx, `Et ${g.membres.length - liste.length - (pm ? 1 : 0)} ministres délégués. Source : Assemblée nationale, mandats des membres du Gouvernement.`);
    nom = "gouvernement";
  }

  else if(type === "classement"){
    const k = CLASSEMENTS[classementChoisi];
    const [a, cm] = await Promise.all([ACTIVITE, COMMISSIONS]);
    const top = DEPUTES.map(d => [d, k.val(d, a?.deputes, cm?.deputes)]).filter(([, v]) => v != null).sort((x, z) => z[1] - x[1]).slice(0, 10);
    if(!top.length) return null;
    const p1 = partiDepute(top[0][0]);
    y = storyCadre(ctx, "Classement des députés", { couleur:p1.couleur });
    y = storyTexte(ctx, k.titre, marge, y, { taille:56, poids:600, police:"Newsreader", max:2, interligne:1.08 }) + 10;
    const photos = await Promise.all(top.map(([d]) => storyPortrait(`photos/deputes/${d.id}.jpg`)));
    const hh = 290;
    storyCarte(ctx, marge, y, largeur, hh);
    ctx.fillStyle = p1.couleur; ctx.beginPath(); ctx.rect(marge, y + 40, 12, hh - 80, 6); ctx.fill();
    storyMedaillon(ctx, photos[0], marge + 138, y + hh / 2, 92, p1.couleur);
    ctx.font = `700 22px "Public Sans"`; ctx.letterSpacing = "2px"; ctx.fillStyle = storyLisible(p1.couleur); ctx.fillText("N° 1", marge + 268, y + 56); ctx.letterSpacing = "0px";
    ctx.font = `600 44px "Newsreader"`; ctx.fillStyle = STORY.encre; ctx.fillText(storyLignes(ctx, top[0][0].nom, largeur - 290, 1)[0], marge + 268, y + 104);
    ctx.font = `400 24px "Public Sans"`; ctx.fillStyle = STORY.doux; ctx.fillText(storyLignes(ctx, `${top[0][0].groupe} · ${top[0][0].dep}`, largeur - 290, 1)[0], marge + 268, y + 142);
    storyChiffreHeros(ctx, k.fmt(top[0][1]), marge + 268, y + 254, storyLisible(p1.couleur), 120);
    y += hh + 24;
    const reste = top.slice(1), pas = Math.min(80, (bas - y - 40) / reste.length);
    storyCarte(ctx, marge, y, largeur, reste.length * pas + 24, "#fff", 24);
    reste.forEach(([d, v], j)=>{
      const i = j + 1, p = partiDepute(d), r = Math.min(26, pas * 0.36), yy = y + 12 + j * pas, cy = yy + pas / 2;
      if(j){ ctx.fillStyle = STORY.filet; ctx.fillRect(marge + 26, yy, largeur - 52, 2); }
      ctx.font = `700 26px "Public Sans"`; ctx.fillStyle = STORY.pale; ctx.fillText(String(i + 1), marge + 30, cy + 9);
      const cx = marge + 96 + r;
      storyMedaillon(ctx, photos[i], cx, cy, r, p.couleur);
      ctx.font = `600 ${Math.min(29, pas * 0.38)}px "Public Sans"`; ctx.fillStyle = STORY.encre; ctx.fillText(storyLignes(ctx, d.nom, 400, 1)[0], cx + r + 20, cy - 2);
      ctx.font = `400 ${Math.min(21, pas * 0.28)}px "Public Sans"`; ctx.fillStyle = STORY.doux; ctx.fillText(storyLignes(ctx, `${d.groupe} · ${d.dep}`, 400, 1)[0], cx + r + 20, cy + pas * 0.28);
      ctx.font = `700 ${Math.min(40, pas * 0.5)}px "Newsreader"`; ctx.fillStyle = storyLisible(p.couleur); ctx.textAlign = "right"; ctx.fillText(k.fmt(v), L - marge - 28, cy + 12); ctx.textAlign = "left";
    });
    storyPied(ctx, k.note);
    nom = `classement-${classementChoisi}`;
  }

  else if(type === "agenda"){
    const jours = (AGENDA_AN?.jours || []).filter(j=> j.date >= aujourdhuiISO());
    if(!jours.length) return null;
    y = storyCadre(ctx, "Assemblée nationale · agenda", { couleur:STORY.bleu });
    y = storyTexte(ctx, "Ce que les députés examinent ces prochains jours", marge, y, { taille:58, poids:600, police:"Newsreader", max:3, interligne:1.1 }) + 24;
    const tl = largeur - 52 - 34;
    for(const j of jours){
      const titre = new Date(j.date + "T12:00:00").toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long" });
      const points = [...(j.points.some(p=>p.type==="qag") ? [{ type:"qag", objet:"Questions au Gouvernement" }] : []), ...j.points.filter(p=>p.type !== "qag")].slice(0, 4);
      const blocs = [];
      let h = 84;
      for(const p of points){
        const vote = p.type === "vote";
        ctx.font = `${vote ? 700 : 400} 26px "Public Sans"`;
        const l = storyLignes(ctx, (vote ? "Vote solennel : " : "") + p.objet, tl, 2), bh = l.length * 32 + 10;
        if(y + h + bh + 24 > bas) break;
        blocs.push({ p, vote, l }); h += bh;
      }
      if(!blocs.length) break;
      storyCarte(ctx, marge, y, largeur, h + 8, "#fff", 24);
      ctx.fillStyle = STORY.bleu; ctx.beginPath(); ctx.rect(marge, y, largeur, 62, [24, 24, 0, 0]); ctx.fill();
      ctx.font = `700 28px "Public Sans"`; ctx.fillStyle = "#fff"; ctx.fillText(titre.charAt(0).toUpperCase() + titre.slice(1), marge + 26, y + 41);
      let yy = y + 86;
      for(const { p, vote, l } of blocs){
        ctx.fillStyle = vote ? STORY.rouge : p.type === "qag" ? STORY.bleu : STORY.pale;
        ctx.fillRect(marge + 27, yy + 1, 14, 14);
        ctx.font = `${vote ? 700 : 400} 26px "Public Sans"`; ctx.fillStyle = p.type === "qag" ? STORY.doux : STORY.encre;
        l.forEach((t, i)=> ctx.fillText(t, marge + 56, yy + 16 + i * 32));
        yy += l.length * 32 + 10;
      }
      y += h + 28;
    }
    storyPied(ctx, "Ordre du jour des séances publiques publié par l'Assemblée nationale. Il peut encore changer.");
    nom = "agenda-assemblee";
  }

  else if(type === "quiz"){
    const sc = QUIZ_RESULTAT; if(!sc?.length) return null;
    const ex = sc.filter(x=>x.pct === sc[0].pct), seul = ex.length === 1, coul = seul ? sc[0].couleur : STORY.bleu;
    y = storyCadre(ctx, "Mon résultat au quiz", { couleur:coul });
    y = storyTexte(ctx, "Qu'aurais-je voté à la place des députés ?", marge, y, { taille:44, poids:600, police:"Newsreader", max:2, interligne:1.1 });
    y = storyChiffreHeros(ctx, `${sc[0].pct} %`, marge, y + 190, storyLisible(coul), 230);
    ctx.font = `600 50px "Newsreader"`; ctx.fillStyle = STORY.encre;
    y = storyTexte(ctx, seul ? `d'accord avec ${sc[0].nom}` : `d'accord avec ${ex.length} groupes`, marge, y - 14, { taille:50, poids:600, police:"Newsreader", max:2, interligne:1.08 });
    y = storyTexte(ctx, quizPhrase(sc, "Mes"), marge, y, { taille:27, couleur:STORY.doux, max:3 }) + 12;
    const lignes = sc.slice(0, 8), fin = bas - 110;
    const logos = await Promise.all(lignes.map(x=>{ const p = PARTIES.find(q=>q.nom === x.nom); return p ? storyImage(`icons/partis/${p.id}.png`) : null; }));
    const pas = Math.min(84, (fin - y - 20) / lignes.length);
    storyCarte(ctx, marge, y, largeur, lignes.length * pas + 24, "#fff", 24);
    lignes.forEach((x, i)=>{
      const yy = y + 12 + i * pas, r = Math.min(24, pas * 0.32), cx = marge + 28 + r, cy = yy + pas * 0.4;
      ctx.fillStyle = x.couleur; ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
      if(logos[i]){
        ctx.fillStyle = "#fff"; ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r - 5);
        const k = Math.min((2 * r - 10) / logos[i].naturalWidth, (2 * r - 15) / logos[i].naturalHeight);
        ctx.drawImage(logos[i], cx - logos[i].naturalWidth * k / 2, cy - 2 - logos[i].naturalHeight * k / 2, logos[i].naturalWidth * k, logos[i].naturalHeight * k);
      }
      const tx = cx + r + 18;
      ctx.font = `600 ${Math.min(27, pas * 0.36)}px "Public Sans"`; ctx.fillStyle = STORY.encre; ctx.fillText(storyLignes(ctx, x.nom, largeur - 220, 1)[0], tx, cy + 4);
      ctx.font = `700 ${Math.min(36, pas * 0.48)}px "Newsreader"`; ctx.fillStyle = storyLisible(x.couleur); ctx.textAlign = "right"; ctx.fillText(`${x.pct} %`, L - marge - 28, cy + 8); ctx.textAlign = "left";
      storyBarre(ctx, tx, yy + pas * 0.66, L - marge - 28 - tx, 14, [[x.pct, x.couleur]], 100);
    });
    y += lignes.length * pas + 40;
    ctx.font = `700 34px "Public Sans"`;
    const t = "Et vous ? Faites le quiz", w = ctx.measureText(t).width + 80;
    ctx.fillStyle = STORY.bleu; ctx.beginPath(); ctx.rect(marge, y, w, 70, 35); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.textBaseline = "middle"; ctx.fillText(t, marge + 40, y + 37); ctx.textBaseline = "alphabetic";
    storyPied(ctx, "Part des questions où ma réponse correspond à la position de la majorité du groupe, sur de vrais votes de l'Assemblée.");
    nom = "quiz-hemicycle-france";
  }
  else if(STORY_PLUS[type]){
    const r = await STORY_PLUS[type](ctx, info);
    if(!r) return null;
    nom = r.nom || nom;
  }
  else return null;

  const blob = await new Promise(res=> c.toBlob(res, "image/png"));
  return { blob, apercu: c.toDataURL("image/jpeg", 0.85), nom: nom + ".png" };
}
