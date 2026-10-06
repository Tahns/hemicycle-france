/* Module chargé à la demande (clic sur un bouton « Story »), voir chargerModule() dans index.html. Les fonctions et constantes de la page principale y sont utilisables telles quelles. */
/* ---------- Stories (Instagram, WhatsApp…) : image verticale 1080 × 1920 dessinée dans le navigateur ---------- */
// Rien n'est envoyé à un serveur : l'image est composée ici, puis partagée par le menu du téléphone
// (Instagram, WhatsApp, Snapchat…) ou téléchargée sur ordinateur.
/* Direction artistique « fond bleu » (une seule source pour TOUTES les stories : modifier ici change tout).
   Fond bleu royal, logo et titres blancs, texte secondaire bleu clair, accent rose, étiquettes rouges ou blanches,
   cartes crème aux angles arrondis (texte encre), pied « source » puis « accroche → @compte ». */
const STORY_DA = {
  fond:"#1B3A8C", nuit:"#14161B", ciel:"#C5CEF2", rose:"#F26B8A", rouge:"#C8102E", creme:"#F5F1E8", blanc:"#FFFFFF", encre:"#1C1B18",
  vert:"#2E6E41", rougeVote:"#B8261E", ambre:"#C98A00", ambreTxt:"#8A5F00", rayon:28,
  filet:"rgba(197,206,242,0.30)", logoY:292, etiquetteY:340, haut:420,
};
// STORY : géométrie + couleurs. « encre », « doux », « pale », « filet » sont les couleurs du TEXTE SUR CARTE CRÈME ; le texte posé
// directement sur le fond bleu utilise « blanc » et « ciel ».
const STORY = { L:1080, H:1920, marge:84, fond:STORY_DA.fond, papier:STORY_DA.creme, creme:STORY_DA.creme, blanc:STORY_DA.blanc, ciel:STORY_DA.ciel, rose:STORY_DA.rose, encre:STORY_DA.encre, doux:"#47443D", pale:"#625D53", filet:"#D3CBBA", bleu:STORY_DA.fond, rouge:STORY_DA.rougeVote, vert:STORY_DA.vert, ambre:STORY_DA.ambre, ambreTxt:STORY_DA.ambreTxt, alerte:STORY_DA.rouge, alerteTxt:STORY_DA.rouge, bas:1490, haut:STORY_DA.haut, yBande:338 };
const COULEURS_2022 = { Arthaud:"#8E1B1B", Roussel:"#A32E22", Macron:"#E0B400", Lassalle:"#A67C0A", "Le Pen":"#5B4FC9", Zemmour:"#2B2B6E", "Mélenchon":"#D6284B", Hidalgo:"#D6488A", Jadot:"#1E9F58", "Pécresse":"#2F6FE0", Poutou:"#B3261E", "Dupont-Aignan":"#4B5AA8" };
const COMPTE_STORY = "@hemicyclefrance"; // les stories n'affichent que le compte Instagram, pas l'adresse du site

// Mots « faibles » : une coupe « … » ne doit jamais s'arrêter sur l'un d'eux (« … le vote de la… »)
const STORY_FAIBLES = new Set("de du des la le les l d un une au aux à a en et ou où que qu qui quoi pour par sur sous dans avec sans vers chez entre ni mais car donc ce cet cette ces son sa ses leur leurs près plus après avant depuis contre selon dès lors y ne pas se s n c j m t".split(" "));
function storyFaible(m){ const x = String(m).toLowerCase().replace(/[«»"“”.,;:!?…()\u00A0]/g, "").replace(/['’]$/, "").replace(/^.*['’]/, ""); return !x || STORY_FAIBLES.has(x); }
// Apostrophes droites -> typographiques (« l'État » -> « l’État ») et espaces normalisées
function storyTypo(t){ return String(t == null ? "" : t).replace(/\s+/g, " ").trim().replace(/(\p{L})'(\p{L})/gu, "$1’$2"); }
// Titre tout en capitales (plus de 60 % des lettres) : remis en minuscules, majuscule en début de phrase, sigles et noms propres usuels conservés
const STORY_PROPRES = ["UE", "OTAN", "ONU", "RN", "LFI", "PS", "LR", "PCF", "CGT", "SNCF", "EDF", "FMI", "USA", "PIB", "TVA", "CSG", "AIE", "RFI", "BFMTV", "IA", "État", "États", "Élysée", "République", "France", "Paris", "Europe", "Assemblée", "Sénat", "Macron", "Ukraine", "Russie", "Israël", "Gaza", "Français", "Française", "Françaises"];
function storyMinuscules(t){
  t = String(t);
  const L = t.match(/\p{L}/gu) || [], M = t.match(/\p{Lu}/gu) || [];
  if(L.length < 12 || M.length / L.length < 0.6) return t;
  let b = t.toLowerCase().replace(/(^|[.!?]\s+|:\s+|«\s*|“)(\p{L})/gu, (_, p, c) => p + c.toUpperCase());
  for(const n of STORY_PROPRES) b = b.replace(new RegExp("(?<![\\p{L}])" + n + "(?![\\p{L}])", "giu"), n);
  return b;
}
// Coupe propre : retire les mots faibles et la ponctuation de la fin (pas de « … de la… »)
function storyCoupePropre(mots){
  const m = [...mots];
  while(m.length > 2 && (storyFaible(m[m.length - 1]) || /[,;:\-–—(]$/.test(m[m.length - 1]))) m.pop();
  if(m.length) m[m.length - 1] = m[m.length - 1].replace(/[\s,;:.\-–—(]+$/, "");
  return m;
}
function storyLignes(ctx, texte, largeur, max){
  const brut = String(texte).trim().replace(/«[ \t]+/g, "«\u00A0").replace(/[ \t]+([»:;?!%])/g, "\u00A0$1").split(/[ \t\r\n]+/);
  // un mot plus large que la ligne est coupé après un trait d'union, puis au caractère (avec « … » en dernier recours)
  const mots = [];
  for(const m of brut){
    if(ctx.measureText(m).width <= largeur){ mots.push({ t:m, colle:false }); continue; }
    const morceaux = m.split(/(?<=-)/);
    let cur = "", premier = true;
    const pousse = t => { mots.push({ t, colle:!premier }); premier = false; };
    for(const p of morceaux){
      if(ctx.measureText(cur + p).width <= largeur || !cur){ cur += p; if(ctx.measureText(cur).width > largeur){ let c = cur; while(c.length > 2 && ctx.measureText(c + "…").width > largeur) c = c.slice(0, -1); cur = ""; pousse(c + "…"); } }
      else { pousse(cur); cur = p; }
    }
    if(cur) pousse(cur);
  }
  const lignes = [];
  let l = "";
  for(const w of mots){
    const essai = l ? l + (w.colle ? "" : " ") + w.t : w.t;
    if(ctx.measureText(essai).width > largeur && l){ lignes.push(l); l = w.t; } else l = essai;
  }
  if(l) lignes.push(l);
  if(lignes.length > max){
    lignes.length = max;
    let d = lignes[max - 1];
    let m = storyCoupePropre(d.split(" "));
    d = m.join(" ");
    while(ctx.measureText(d + "…").width > largeur && m.length > 1){ m = storyCoupePropre(m.slice(0, -1)); d = m.join(" "); }
    lignes[max - 1] = d + "…";
  }
  return lignes;
}
function storyTexte(ctx, texte, x, y, { taille=40, poids=400, police="Public Sans", couleur=STORY.blanc, largeur=STORY.L - 2*STORY.marge, max=3, interligne=1.2, align="left" } = {}){
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
// Barre empilée plate (segments [valeur, couleur]) avec un espace de 3 px entre les segments ; « piste » : couleur du fond de la barre
function storyBarre(ctx, x, y, largeur, hauteur, segments, total, piste = STORY.filet){
  ctx.fillStyle = piste; ctx.fillRect(x, y, largeur, hauteur);
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
   Direction artistique : STORY_DA (fond bleu, logo blanc, kicker ou étiquette, titres blancs Newsreader, cartes crème arrondies,
   pied « source » puis « accroche → @compte »). Zone de contenu sûre : de l'ordonnée renvoyée par storyCadre jusqu'à STORY.bas (≈ 1490) ;
   le pied (storyPied) occupe ensuite jusqu'à ≈ 1650 (l’accroche « → @compte » est posée vers 1636 : les ≈ 250 px du haut et du bas sont masqués par Instagram). Texte sur le fond : STORY.blanc / STORY.ciel ; texte sur carte crème : STORY.encre / doux / pale.
   storyAlpha(couleur, a)                      -> "rgba(...)" à partir de #rrggbb
   storyMelange(couleur, autre, t)             -> couleur mélangée (t = 0..1 vers « autre »)
   storyLisible(couleur)                       -> la couleur, assombrie si trop claire pour du texte sur carte crème
   storyClair(couleur)                         -> la couleur, éclaircie si trop sombre pour du texte sur le fond bleu
   storyFondTheme(ctx, sombre)                 -> fond bleu uni (ou « nuit » pour les sujets EN DIRECT)
   storyMarque(ctx)                            -> logo « Hémicycle France » (icône d'hémicycle + nom blanc)
   storyEtiquette(ctx, texte, x, y, style)     -> pastille plate à capitales espacées : « rouge » (À LA UNE), « blanc » (DOSSIER, À NOTER), « contour » ; renvoie le bord droit
   storyCadre(ctx, surtitre, { alerte, etiquette, sombre })
                                               -> fond + logo + kicker en capitales bleu clair (ou pastille si alerte / etiquette) ; renvoie l'ordonnée de début du contenu
   storyChiffreHeros(ctx, texte, x, y, couleur, taille=220, align="left")
                                               -> très gros chiffre (y = ligne de base, réduit pour tenir dans la page) ; renvoie y + 24
   storyCarte(ctx, x, y, w, h, fond)           -> carte crème aux angles arrondis (28 px)
   storyMedaillon(ctx, img, cx, cy, rayon, bordure)      -> portrait carré recadré sur le visage (img = Image ou null), liseré de couleur en bas
   storyInitiales(ctx, nom, cx, cy, rayon, couleur)      -> carré d'initiales
   storyHemicycle(ctx, cx, cy, rayon, segments, total, points=180)
                                               -> demi-cercle de points ; segments = [[n, couleur], ...], le reste en gris
   storyTitreSection(ctx, texte, x, y)         -> intitulé en capitales bleu clair sous filet ; renvoie y + 40
   storyPuceVote(ctx, texte, xDroite, yMilieu, fond)     -> position de vote en lettres colorées, alignée à droite (POUR, CONTRE…)
   storyPied(ctx, source, { ligne, accroche })           -> phrase de sources en bleu clair (ligne en gras facultative), puis « accroche → @compte » centré en blanc
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

// Couleur lisible sur le fond bleu : éclaircie tant que son contraste est trop faible (couleurs de partis sombres)
function storyClair(c){
  let x = /^#[0-9a-f]{6}$/i.test(String(c)) ? c : "#9AA6D6", t = 0;
  while(storyLuminance(x) < 0.34 && t < 1){ t += 0.1; x = storyMelange(c, "#FFFFFF", t); }
  return x;
}

// Fond bleu uni de la direction artistique (« sombre » : fond nuit des sujets EN DIRECT)
function storyFondTheme(ctx, sombre = false){
  ctx.fillStyle = sombre === true ? STORY_DA.nuit : STORY_DA.fond; ctx.fillRect(0, 0, STORY.L, STORY.H);
}
// Logo : icône d'hémicycle (arcs bleu clair et rose, point blanc) puis « Hémicycle France » en Public Sans gras blanc, sous la zone masquée par Instagram
function storyMarque(ctx){
  const { marge } = STORY, cx = marge + 34, cy = STORY_DA.logoY;
  ctx.lineWidth = 7; ctx.lineCap = "round";
  ctx.strokeStyle = "#8FA6F0"; ctx.beginPath(); ctx.arc(cx, cy, 30, Math.PI, 0); ctx.stroke();
  ctx.strokeStyle = STORY_DA.rose; ctx.beginPath(); ctx.arc(cx, cy, 15, Math.PI, 0); ctx.stroke();
  ctx.lineCap = "butt"; ctx.fillStyle = STORY_DA.blanc; ctx.beginPath(); ctx.arc(cx, cy, 5, 0, 2 * Math.PI); ctx.fill();
  ctx.font = `700 44px "Public Sans"`; ctx.fillStyle = STORY_DA.blanc; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.letterSpacing = "0px";
  ctx.fillText("Hémicycle France", marge + 86, cy + 14);
}
// Pastille plate à capitales espacées ; style : « rouge » (texte blanc), « blanc » (texte bleu), « contour » (filet blanc) ; renvoie le bord droit
function storyEtiquette(ctx, texte, x, y, style = "rouge", { taille = 26, h = 54 } = {}){
  const t = String(texte).toUpperCase();
  ctx.font = `800 ${taille}px "Public Sans"`; ctx.letterSpacing = "4px";
  const w = ctx.measureText(t).width + 44 - 4;
  if(style === "contour"){ ctx.strokeStyle = STORY_DA.blanc; ctx.lineWidth = 3; ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3); }
  else { ctx.fillStyle = style === "blanc" ? STORY_DA.blanc : STORY_DA.rouge; ctx.fillRect(x, y, w, h); }
  ctx.fillStyle = style === "blanc" ? STORY_DA.fond : STORY_DA.blanc; ctx.textBaseline = "middle"; ctx.textAlign = "left";
  ctx.fillText(t, x + 22, y + h / 2 + 2);
  ctx.letterSpacing = "0px"; ctx.textBaseline = "alphabetic";
  return x + w;
}
// Cadre commun : fond, logo, puis kicker en capitales bleu clair (ou, avec alerte / etiquette, pastille) ; renvoie l'ordonnée où commencer le contenu
function storyCadre(ctx, surtitre, { alerte = false, etiquette = "", sombre = false } = {}){
  const { L, marge, haut } = STORY;
  storyFondTheme(ctx, sombre);
  storyMarque(ctx);
  const style = etiquette || (alerte ? "rouge" : "");
  if(style){
    ctx.font = `800 26px "Public Sans"`; ctx.letterSpacing = "4px";
    const txt = storyLignes(ctx, String(surtitre).toUpperCase(), L - 2 * marge - 44, 1)[0]; ctx.letterSpacing = "0px";
    storyEtiquette(ctx, txt, marge, STORY_DA.etiquetteY, style);
  } else {
    ctx.font = `700 30px "Public Sans"`; ctx.letterSpacing = "4px";
    const txt = storyLignes(ctx, String(surtitre).toUpperCase(), L - 2 * marge, 1)[0];
    ctx.fillStyle = STORY_DA.ciel; ctx.textBaseline = "alphabetic"; ctx.fillText(txt, marge, 390); ctx.letterSpacing = "0px";
  }
  return haut;
}
// Pied commun : phrase de sources en bleu clair (ligne en gras blanche et « ▶ Vidéo : média » facultatives), puis « accroche → @compte » centré en blanc
function storyPied(ctx, source, { ligne = "", accroche = "Toute l'actu politique", video = "" } = {}){
  const { L, marge } = STORY;
  let yy = 1524;
  if(ligne) yy = storyTexte(ctx, ligne, marge, yy, { taille:26, poids:700, couleur:STORY.blanc, max:1 }) + 4;
  if(video){
    ctx.font = `800 26px "Public Sans"`; ctx.fillStyle = STORY.blanc; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.beginPath(); ctx.moveTo(marge, yy + 4); ctx.lineTo(marge, yy + 28); ctx.lineTo(marge + 22, yy + 16); ctx.closePath(); ctx.fill();
    ctx.fillText(storyLignes(ctx, `Vidéo : ${video}`, L - 2 * marge - 40, 1)[0], marge + 38, yy + 26);
    yy += 42;
  }
  storyTexte(ctx, source, marge, yy, { taille:23, couleur:STORY.ciel, max:(ligne ? 1 : 0) + (video ? 1 : 0) >= 2 ? 2 : 3, interligne:1.2 });
  storyAccroche(ctx, accroche);
}
// Dernière ligne de toute story : « accroche → @compte », blanche, centrée (jamais l'adresse du site)
function storyAccroche(ctx, accroche = "Toute l'actu politique", y = 1636, sombre = false){
  let t = 34; const texte = `${accroche} → ${COMPTE_STORY}`;
  ctx.font = `700 ${t}px "Public Sans"`;
  while(ctx.measureText(texte).width > STORY.L - 2 * STORY.marge && t > 24){ t -= 2; ctx.font = `700 ${t}px "Public Sans"`; }
  ctx.fillStyle = STORY.blanc; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  ctx.fillText(texte, STORY.L / 2, y); ctx.textAlign = "left";
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
// Carte crème aux angles arrondis (28 px) ; un fond teinté peut être précisé (sinon crème). Le texte posé dessus est en encre.
function storyCarte(ctx, x, y, w, h, fond = "#FFFFFF", rayon = STORY_DA.rayon){
  const blanc = ["#FFFFFF", "#FFF", "#FBF8F1", STORY_DA.creme.toUpperCase()].includes(String(fond).toUpperCase());
  ctx.fillStyle = blanc ? STORY_DA.creme : fond;
  ctx.beginPath(); if(ctx.roundRect) ctx.roundRect(x, y, w, h, STORY_DA.rayon); else ctx.rect(x, y, w, h); ctx.fill();
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
function storyTitreSection(ctx, texte, x, y, couleur = STORY.ciel){
  ctx.font = `800 24px "Public Sans"`; ctx.fillStyle = STORY.ciel; ctx.letterSpacing = "3px";
  ctx.fillText(texte.toUpperCase(), x, y + 2); ctx.letterSpacing = "0px";
  ctx.fillStyle = STORY_DA.filet; ctx.fillRect(x, y + 14, STORY.L - 2 * STORY.marge, 3);
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
  const fp = storyClair(couleur);
  storyPastille(ctx, storyLignes(ctx, soustitre, tl - 40, 1)[0], tx, ty + 4, fp, storyLuminance(fp) > 0.4 ? STORY.encre : "#fff", 26);
  y = cy + r + 34;
  y = storyTexte(ctx, ligne, marge, y, { taille:32, couleur:STORY.ciel, max:2 }) + 14;
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
  const pas = 108, n = Math.max(1, Math.min(votes.length, Math.floor((bas - y - 30) / pas)));
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
function storyPCarte(ctx, x, y, w, h, fond = "#FBF8F1", bord = STORY.filet){ storyCarte(ctx, x, y, w, h, fond); }
// Gros chiffre : simple filet épais de la couleur de la donnée (éclaircie si besoin) au-dessus, sur le fond bleu
function storyPFond(ctx, couleur, y, h){
  ctx.fillStyle = storyClair(couleur); ctx.fillRect(STORY.marge, y, STORY.L - 2 * STORY.marge, 8);
}
// Texte sur une ligne, réduit jusqu'à tenir dans la largeur ; renvoie la taille retenue
function storyPLigne(ctx, texte, x, y, { taille=60, poids=600, police="Newsreader", couleur=STORY.blanc, largeur=storyPLarg, align="left", mini=20 } = {}){
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
    ctx.fillStyle = STORY.blanc;
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
function storyPSousTitre(ctx, texte, x, y, couleur = STORY.ciel){
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

// 1-2. Les stories d'actualité (« à la une », « en direct », « face à face », « le chiffre », « date à retenir », « en bref », « dossier »)
//      sont dessinées par les modules js/stories-actu*.js (chargés avec dessinerStory ci-dessous), sur la même direction artistique (STORY_DA).

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
  y = storyTexte(ctx, "Simulation à partir des sondages, pas une prédiction.", marge, y + 2, { taille:30, poids:700, couleur:STORY.rose, max:2 }) + 18;
  ctx.font = `600 24px "Public Sans"`;
  ctx.fillStyle = storyAlpha(STORY.ciel, 0.5); ctx.fillRect(marge, y + 6, 36, 18);
  ctx.fillStyle = STORY.ciel; ctx.fillText("chance d'aller au second tour", marge + 48, y + 24);
  if(avecVictoire){ ctx.fillStyle = STORY.ciel; ctx.fillRect(marge + 480, y + 6, 36, 18); ctx.fillText("chance d'être élu", marge + 528, y + 24); }
  y += 54;
  const hLigne = avecVictoire ? 150 : 112, nb = Math.max(1, Math.min(liste.length, Math.floor((1500 - y - 24) / (hLigne + 10))));
  liste.length = nb;
  const pas = Math.min(190, (1500 - y - 24) / nb);
  storyCarte(ctx, marge, y, storyPLarg, nb * pas + 24);
  const x0 = marge + 32, xr = L - marge - 32, wl = storyPLarg - 64;
  y += 12;
  let k = 0;
  for(const c of liste){
    const coul = COULEURS_PARTIS[c.parti] || "#8A8C94";
    if(k++){ ctx.fillStyle = STORY.filet; ctx.fillRect(x0, y, wl, 2); }
    ctx.font = `600 34px "Public Sans"`; ctx.fillStyle = STORY.encre; ctx.fillText(c.nom, x0, y + 44);
    const elu = avecVictoire && c.victoire !== null && c.victoire !== undefined;
    const pri = elu ? c.victoire : c.secondTour;
    ctx.font = pri < 1 ? `700 44px "Public Sans"` : `600 64px "Newsreader"`; ctx.fillStyle = storyPLisible(coul); ctx.textAlign = "right"; ctx.fillText(storyPPct(pri), xr, y + 54); ctx.textAlign = "left";
    const hb = elu ? 20 : 26, by = y + 74, larg = wl - 200;
    ctx.font = `600 22px "Public Sans"`; ctx.fillStyle = STORY.pale;
    ctx.fillText("2d tour", x0, by + hb - 3);
    ctx.globalAlpha = 0.5; storyBarre(ctx, x0 + 120, by, larg, hb, [[c.secondTour, coul]], 100); ctx.globalAlpha = 1;
    ctx.textAlign = "right"; ctx.fillStyle = STORY.doux; ctx.fillText(storyPPct(c.secondTour), xr, by + hb - 3); ctx.textAlign = "left";
    if(elu){
      ctx.fillStyle = STORY.pale; ctx.fillText("Élu", x0, by + 38 + hb - 3);
      storyBarre(ctx, x0 + 120, by + 38, larg, hb, [[c.victoire, coul]], 100);
      ctx.textAlign = "right"; ctx.fillStyle = STORY.encre; ctx.font = `700 22px "Public Sans"`; ctx.fillText(storyPPct(c.victoire), xr, by + 38 + hb - 3); ctx.textAlign = "left";
    }
    y += pas;
  }
  const m = PROBAS.methode || {};
  storyPied(ctx, `Simulation à partir des sondages (${formatNombre(m.tirages || 0)} élections simulées), pas une prédiction : les sondages mesurent l'opinion du moment.`, { accroche:"Toute la simulation" });
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
  // Carte du duel : noms, scores, barre
  const hCarte = 74 + 30 + 200 + 44 + 56 + 36 + 20;
  storyCarte(ctx, marge, y, storyPLarg, hCarte);
  const x0 = marge + 36, xr = L - marge - 36, wl = storyPLarg - 72;
  y += 22;
  const demi = wl / 2 - 20;
  storyPLigne(ctx, a, x0, y + 56, { taille:56, couleur:STORY.encre, largeur:demi, mini:30 });
  storyPLigne(ctx, b, xr, y + 56, { taille:56, couleur:STORY.encre, largeur:demi, mini:30, align:"right" });
  y += 74;
  ctx.fillStyle = ca; ctx.fillRect(x0, y, demi, 8); ctx.fillStyle = cb; ctx.fillRect(xr - demi, y, demi, 8);
  y += 30;
  ctx.font = `700 210px "Newsreader"`; ctx.fillStyle = storyPLisible(ca); ctx.fillText(nombreFr(sa), x0, y + 170);
  ctx.fillStyle = storyPLisible(cb); ctx.textAlign = "right"; ctx.fillText(nombreFr(sb), xr, y + 170); ctx.textAlign = "left";
  ctx.font = `700 40px "Public Sans"`; ctx.fillStyle = STORY.pale; ctx.textAlign = "center"; ctx.fillText("%", L / 2, y + 150); ctx.textAlign = "left";
  y += 200;
  ctx.font = `600 26px "Public Sans"`; ctx.fillStyle = STORY.doux;
  ctx.fillText(`${premier.nom}, enquête du ${premier.date}`, x0, y + 20);
  y += 44;
  const hb = 56, wa = wl * sa / (sa + sb);
  ctx.fillStyle = ca; ctx.fillRect(x0, y, wa - 2, hb); ctx.fillStyle = cb; ctx.fillRect(x0 + wa + 2, y, wl - wa - 2, hb);
  y += hb + 36 + 20 + 28;
  if(d.instituts.length > 1){
    y = storyPSousTitre(ctx, "Chaque institut", marge, y - 8);
    const nb = Math.max(1, Math.min(6, d.instituts.length, Math.floor((1490 - y - 80) / 96) + 1));
    const pas = nb > 1 ? Math.min(110, (1490 - 80 - y) / (nb - 1)) : 110;
    storyCarte(ctx, marge, y - 4, storyPLarg, (nb - 1) * pas + 100);
    y += 10;
    for(const i of d.instituts.slice(0, nb)){
      const x = i.scores[a], z = i.scores[b];
      ctx.font = `600 28px "Public Sans"`; ctx.fillStyle = STORY.encre; ctx.fillText(i.nom, x0, y + 28);
      ctx.font = `400 24px "Public Sans"`; ctx.fillStyle = STORY.doux; ctx.textAlign = "right"; ctx.fillText(i.date, xr, y + 28); ctx.textAlign = "left";
      const by = y + 42, h = 38, w = wl * x / (x + z);
      ctx.fillStyle = ca; ctx.fillRect(x0, by, w - 2, h); ctx.fillStyle = cb; ctx.fillRect(x0 + w + 2, by, wl - w - 2, h);
      ctx.font = `700 24px "Public Sans"`; ctx.fillStyle = "#fff"; ctx.textBaseline = "middle";
      ctx.fillText(`${nombreFr(x)} %`, x0 + 18, by + h / 2 + 2); ctx.textAlign = "right"; ctx.fillText(`${nombreFr(z)} %`, xr - 18, by + h / 2 + 2); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
      y += pas;
    }
  }
  storyPied(ctx, `Sondages de second tour (${premier.nom} et autres instituts), en % des votes exprimés, notices sur commission-des-sondages.fr. Un sondage n'est pas une prévision.`, { accroche:"Tous les sondages" });
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
  storyPFond(ctx, STORY.rose, y, 440);
  storyPLigne(ctx, j2 === 0 ? "Jour J" : `J-${j2}`, L / 2, y + 330, { taille:420, poids:700, couleur:STORY.blanc, largeur:storyPLarg, align:"center", mini:120 });
  if(j2 > 0){
    ctx.font = `600 44px "Public Sans"`; ctx.fillStyle = STORY.ciel; ctx.textAlign = "center";
    ctx.fillText(j2 === 1 ? "plus qu'un jour" : `${formatNombre(j2)} jours · environ ${Math.round(j2 / 7)} semaines`, L / 2, y + 400);
    ctx.textAlign = "left";
  }
  y += 470;
  const carte = (titre, date, detail, couleur, jr)=>{
    storyPCarte(ctx, marge, y, storyPLarg, 180);
    ctx.fillStyle = couleur; ctx.fillRect(marge + 24, y + 22, 8, 136);
    storyTexte(ctx, titre, marge + 56, y + 14, { taille:26, poids:700, couleur:STORY.pale, max:1 });
    storyTexte(ctx, date, marge + 56, y + 52, { taille:38, poids:600, police:"Newsreader", couleur:STORY.encre, largeur:storyPLarg - 320, max:2, interligne:1.05 });
    storyTexte(ctx, detail, marge + 56, y + 134, { taille:24, couleur:STORY.doux, largeur:storyPLarg - 100, max:1 });
    if(jr !== null){ ctx.font = `700 76px "Newsreader"`; ctx.fillStyle = couleur; ctx.textAlign = "right"; ctx.fillText(jr > 0 ? `J-${jr}` : "Jour J", L - marge - 34, y + 118); ctx.textAlign = "left"; }
    y += 200;
  };
  if(j1 >= 0) carte("PREMIER TOUR", storyPDateLongue(iso1), "Scrutin du 18 avril", STORY.rouge, j1);
  carte("SECOND TOUR ET ANNONCE", storyPDateLongue(iso2), "Annonce à 20 h, à la fermeture des derniers bureaux", STORY.bleu, j2 > 0 ? j2 : null);
  storyPied(ctx, "Calendrier de l'élection présidentielle de 2027 : premier tour le 18 avril, second tour le 2 mai ; résultats officiels proclamés par le Conseil constitutionnel.", { accroche:"Le décompte" });
  return { nom:"decompte-presidentielle-2027" };
};

// 6. Une candidature (data-id : nom exact)
STORY_PLUS.candidat = async (ctx, info)=>{
  const c = CANDIDATURES?.find(x=>x.nom === info);
  if(!c) return null;
  const { L, marge } = STORY;
  const coul = COULEURS_PARTIS[c.code] || "#8A8C94", lisible = storyClair(coul), surLisible = storyLuminance(lisible) > 0.45 ? STORY.encre : "#fff";
  let y = storyCadre(ctx, "Présidentielle 2027 · candidat");
  const photo = await storyPortrait(`photos/personnalites/${slugDep(c.nom)}.jpg`);
  let annonceDite = false;
  const age = ()=> c.age ? (ctx.font = `700 170px "Newsreader"`, ctx.fillStyle = lisible, true) : false;
  if(photo){
    // portrait rectangulaire à gauche, nom, parti et âge à droite
    const pw = 400, ph = 540;
    const zp = storyPPhoto(ctx, photo, marge, y, pw, ph);
    const x0 = marge + zp.w + 44, w = L - marge - x0;
    ctx.fillStyle = lisible; ctx.fillRect(zp.x, zp.y + zp.h, zp.w, 8);
    const yn = storyTexte(ctx, c.nom, x0, y - 8, { taille:78, poids:700, police:"Newsreader", largeur:w, max:4, interligne:1.02 });
    let tp = 28; ctx.font = `700 ${tp}px "Public Sans"`;
    while(ctx.measureText(c.parti.toUpperCase()).width > w - tp * 1.2 && tp > 18){ tp -= 1; ctx.font = `700 ${tp}px "Public Sans"`; }
    storyPastille(ctx, c.parti.toUpperCase(), x0, yn + 30, lisible, surLisible, tp);
    if(age()){
      ctx.fillText(String(c.age), x0, y + ph - 6);
      const wa = ctx.measureText(String(c.age)).width;
      ctx.font = `600 40px "Public Sans"`; ctx.fillStyle = STORY.ciel; ctx.fillText("ans", x0 + wa + 16, y + ph - 70);
      ctx.font = `400 24px "Public Sans"`; ctx.fillText("au premier tour", x0 + wa + 16, y + ph - 34);
    }
    y += ph + 8 + 52;
  } else {
    // sans portrait libre : rien de décoratif, le nom devient le titre
    y = storyTexte(ctx, c.nom, marge, y, { taille:124, poids:700, police:"Newsreader", max:3, interligne:1.0 }) + 34;
    storyPastille(ctx, c.parti.toUpperCase(), marge, y, lisible, surLisible, 32);
    y += 90;
    // chiffres en grand : âge, date d'annonce
    const da = c.annonce ? new Date(c.annonce + "T12:00:00") : null;
    const stats = [];
    if(c.age) stats.push([String(c.age), "ans", "au premier tour"]);
    if(da && !isNaN(da)){ stats.push([String(da.getDate()), da.toLocaleDateString("fr-FR", { month:"long", year:"numeric" }), "candidature annoncée"]); annonceDite = true; }
    for(const [gros, l1, l2] of stats){
      ctx.fillStyle = STORY_DA.filet; ctx.fillRect(marge, y, STORY.L - 2 * marge, 4);
      ctx.font = `700 300px "Newsreader"`; ctx.fillStyle = lisible; ctx.fillText(gros, marge, y + 262);
      const wa = ctx.measureText(gros).width;
      ctx.font = `700 52px "Public Sans"`; ctx.fillStyle = STORY.blanc; ctx.fillText(storyLignes(ctx, l1, STORY.L - marge - (marge + wa + 24), 1)[0], marge + wa + 24, y + 185);
      ctx.font = `400 30px "Public Sans"`; ctx.fillStyle = STORY.ciel; ctx.fillText(l2, marge + wa + 24, y + 235);
      y += 330;
    }
    y += 10;
  }
  if(c.slogan) y = storyTexte(ctx, `« ${c.slogan} »`, marge, y, { taille:48, poids:600, police:"Newsreader", couleur:STORY.ciel, max:3, interligne:1.15 }) + 16;
  for(const f of (c.fonctions || []).slice(0, 4)){
    if(y > 1320) break;
    y = storyTexte(ctx, f, marge, y, { taille:34, couleur:STORY.blanc, max:3, interligne:1.2 }) + 8;
  }
  const ya = Math.min(Math.max(y + 36, 1390), 1440);
  if(!annonceDite){ ctx.fillStyle = STORY_DA.filet; ctx.fillRect(marge, ya - 26, STORY.L - 2 * marge, 3); }
  if(!annonceDite) storyTexte(ctx, c.annonce ? `Candidature annoncée le ${dateCourte(c.annonce) || c.annonce}` : "Candidature annoncée", marge, ya, { taille:34, poids:700, couleur:STORY.rose, max:1 });
  const dom = storyPDomaine(c.source) || "la source indiquée sur le site";
  const credits = photo ? await storyPCredits([c.nom]) : [];
  storyPied(ctx, `Candidature rapportée par ${dom}, d'après la liste des candidatures de Wikipédia.${credits.length ? ` Photo : ${credits.join(", ")}.` : ""}`, { accroche:"Tous les candidats" });
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
  storyPLigne(ctx, l.parti, tx, y + 130, { taille:150, poids:700, couleur:storyClair(coul), largeur:L - marge - tx, mini:60 });
  storyTexte(ctx, g?.libelle || p?.nom || l.parti, tx, y + 150, { taille:32, poids:600, couleur:STORY.ciel, largeur:L - marge - tx, max:2 });
  y += 330;
  y = storyPSousTitre(ctx, "À la tête du parti", marge, y + 20);
  y = storyTexte(ctx, sansChef ? "Pas de chef de parti unique" : l.nom, marge, y, { taille:sansChef ? 72 : 88, poids:600, police:"Newsreader", max:2, interligne:1.02 });
  y = storyTexte(ctx, l.role, marge, y + 4, { taille:42, couleur:STORY.ciel, max:4, interligne:1.25 }) + 70;
  if(g?.membres){
    storyPCarte(ctx, marge, y, storyPLarg, 320);
    ctx.fillStyle = coul; ctx.fillRect(marge + 24, y + 24, 8, 272);
    ctx.font = `700 210px "Newsreader"`; ctx.fillStyle = storyPLisible(coul); ctx.fillText(formatNombre(g.membres), marge + 64, y + 235);
    const w = ctx.measureText(formatNombre(g.membres)).width;
    storyTexte(ctx, "députés dans le groupe à l'Assemblée nationale", marge + 64 + w + 24, y + 100, { taille:34, poids:600, couleur:STORY.doux, largeur:storyPLarg - w - 120, max:3 });
    y += 360;
    if(g.president && g.president !== l.nom) storyTexte(ctx, `${g.presidente ? "Présidente" : "Président"} du groupe : ${g.president}`, marge, y, { taille:40, poids:600, couleur:STORY.blanc, max:2 });
  }
  storyPied(ctx, `Direction du parti : ${l.source?.nom || "sources publiques"}. Effectifs du groupe : Assemblée nationale (open data).`, { accroche:"Tous les partis" });
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
  y = storyTexte(ctx, `${c.role} · ${c.parti}`, marge, y, { taille:32, poids:600, couleur:STORY.ciel, max:2 }) + 22;
  // Statut, tel qu'il figure dans la source
  ctx.font = `700 34px "Public Sans"`;
  const n = storyLignes(ctx, c.statutLabel, storyPLarg - 100, 3).length, h = 56 + n * 42;
  storyPCarte(ctx, marge, y, storyPLarg, h, "#FBF8F1", coul);
  ctx.fillStyle = coul; ctx.fillRect(marge + 24, y + 24, 8, h - 48);
  ctx.font = `700 22px "Public Sans"`; ctx.fillStyle = STORY.pale; ctx.letterSpacing = "2px"; ctx.fillText("STATUT JUDICIAIRE", marge + 56, y + 38); ctx.letterSpacing = "0px";
  storyTexte(ctx, c.statutLabel, marge + 56, y + 44, { taille:34, poids:700, couleur:coul, largeur:storyPLarg - 100, max:3, interligne:1.2 });
  y += h + 34;
  y = storyTexte(ctx, c.affaire, marge, y, { taille:56, poids:600, police:"Newsreader", max:3, interligne:1.1 }) + 12;
  const td = storyTailleFit(ctx, c.detail, y, c.statut === "appel" ? 1230 : 1440, { tMax:54, tMin:36, interligne:1.3 });
  y = storyTexte(ctx, c.detail, marge, y, { taille:td, couleur:STORY.blanc, max:td > 36 ? 99 : 11, interligne:1.3 }) + 24;
  if(c.statut === "appel"){
    const t = "Décision non définitive : la présomption d'innocence s'applique pour ces faits tant que la justice n'a pas statué définitivement.";
    ctx.font = `600 28px "Public Sans"`;
    const k = storyLignes(ctx, t, storyPLarg - 80, 4).length, hh = 40 + k * 36;
    storyPCarte(ctx, marge, y, storyPLarg, hh, "#F3EBD3", STORY.ambreTxt);
    storyTexte(ctx, t, marge + 40, y + 18, { taille:28, poids:600, couleur:STORY.encre, largeur:storyPLarg - 80, max:4, interligne:1.25 });
  }
  storyPied(ctx, `Source : ${c.source}. Statut tel qu'indiqué par la source ; présomption d'innocence tant que la décision n'est pas définitive.`, { accroche:"Toutes les décisions" });
  return { nom:`justice-${slugDep(c.nom)}-${slugDep(c.affaire).slice(0, 30)}` };
};

// 9. Un chiffre clé (data-id : indice dans INDICATEURS)
STORY_PLUS.indicateur = async (ctx, info)=>{
  const i = INDICATEURS?.[Number(info)];
  if(!i) return null;
  const { L, marge } = STORY;
  const coul = i.tendance === "up" ? storyClair(STORY.rouge) : i.tendance === "down" ? "#7FD39A" : STORY.blanc;
  let y = storyCadre(ctx, "Chiffres clés · France");
  y = storyTexte(ctx, i.nom, marge, y, { taille:78, poids:600, police:"Newsreader", max:2, interligne:1.03 }) + 24;
  storyPFond(ctx, coul, y, 500);
  const mv = /^(.+?%)\s+(\S.*)$/.exec(i.valeur), valeur = mv ? mv[1] : i.valeur;
  storyPLigne(ctx, valeur, marge, y + 330, { taille:300, poids:700, couleur:coul, largeur:storyPLarg, mini:90 });
  if(mv) storyPLigne(ctx, mv[2], L - marge, y + 432, { taille:60, poids:600, couleur:STORY.ciel, largeur:storyPLarg - 360, align:"right", mini:30 });
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
  y = storyTexte(ctx, i.detail, marge, y, { taille:tdi, couleur:STORY.blanc, max:tdi > 40 ? 99 : 7, interligne:1.3 }) + 24;
  storyTexte(ctx, `${i.source}, ${i.date}`, marge, y, { taille:30, poids:700, couleur:STORY.rose, max:2 });
  storyPied(ctx, `Source : ${i.source}, ${i.date}. Série officielle consultable sur ${storyPDomaine(i.url) || "le site de la source"}.`, { accroche:"Tous les chiffres clés" });
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
  storyPLigne(ctx, p.id, tx, y + 120, { taille:130, poids:700, couleur:storyClair(coul), largeur:L - marge - tx, mini:60 });
  storyTexte(ctx, g?.libelle || p.nom, tx, y + 134, { taille:34, poids:600, couleur:STORY.ciel, largeur:L - marge - tx, max:2 });
  y += 290;
  storyPLigne(ctx, formatNombre(eff), marge, y + 290, { taille:340, poids:700, couleur:storyClair(coul), largeur:storyPLarg - 10, mini:120 });
  y += 330;
  y = storyTexte(ctx, eff > 1 ? "députés" : "député", marge, y, { taille:56, poids:600, police:"Newsreader", max:1 }) + 28;
  const total = TOTAL_SIEGES || 577;
  storyBarre(ctx, marge, y, storyPLarg, 36, [[eff, storyClair(coul)]], total, storyAlpha(STORY.ciel, 0.25));
  const maj = Math.floor(total / 2) + 1, xm = marge + storyPLarg * maj / total;
  ctx.fillStyle = STORY.blanc; ctx.fillRect(xm - 2, y - 12, 4, 60);
  y += 80;
  ctx.font = `600 28px "Public Sans"`; ctx.fillStyle = STORY.ciel;
  ctx.fillText(`${nombreFr(eff / total * 100)} % des ${formatNombre(total)} sièges`, marge, y);
  ctx.textAlign = "right"; ctx.fillText(`Majorité absolue : ${maj}`, L - marge, y); ctx.textAlign = "left";
  y += 50;
  if(g?.president){
    storyPCarte(ctx, marge, y, storyPLarg, 150);
    ctx.fillStyle = coul; ctx.fillRect(marge + 24, y + 22, 8, 106);
    storyTexte(ctx, g.presidente ? "PRÉSIDENTE DU GROUPE" : "PRÉSIDENT DU GROUPE", marge + 56, y + 12, { taille:22, poids:700, couleur:STORY.pale, max:1 });
    storyTexte(ctx, g.president, marge + 56, y + 46, { taille:48, poids:600, police:"Newsreader", couleur:STORY.encre, max:1, largeur:storyPLarg - 100 });
    if(g.presidentDepuis) storyTexte(ctx, `depuis le ${dateCourte(g.presidentDepuis)}`, marge + 56, y + 100, { taille:24, couleur:STORY.doux, max:1 });
  }
  storyPied(ctx, "Assemblée nationale, composition des groupes politiques (open data) ; effectifs relevés automatiquement.", { accroche:"Tous les groupes" });
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
  storyPLigne(ctx, m.jour, marge, y + 270, { taille:300, poids:700, couleur:storyClair(coul), largeur:storyPLarg, mini:100 });
  y += 290;
  const mois = String(m.mois).toUpperCase();
  ctx.font = `700 64px "Public Sans"`; ctx.fillStyle = STORY.rose; ctx.letterSpacing = "4px"; ctx.fillText(mois, marge, y + 56); ctx.letterSpacing = "0px";
  if(m.parti) storyPastille(ctx, m.parti, marge + ctx.measureText(mois).width + 60, y + 6, storyClair(coul), storyLuminance(storyClair(coul)) > 0.45 ? STORY.encre : "#fff", 36);
  y += 130;
  y = storyTexte(ctx, m.titre, marge, y, { taille:68, poids:600, police:"Newsreader", max:4, interligne:1.08 }) + 14;
  const ou = [m.heure && m.heure !== "—" ? m.heure : "", m.lieu].filter(Boolean).join(" · ");
  if(ou) y = storyTexte(ctx, ou, marge, y, { taille:34, poids:700, couleur:STORY.ciel, max:3, interligne:1.2 }) + 14;
  const tdm = storyTailleFit(ctx, m.desc, y, 1400, { tMax:46, tMin:32, interligne:1.3 });
  y = storyTexte(ctx, m.desc, marge, y, { taille:tdm, couleur:STORY.blanc, max:tdm > 32 ? 99 : 8, interligne:1.3 }) + 14;
  if((m.fin || m.debut) < aujourdhuiISO()) storyTexte(ctx, "Événement passé", marge, y, { taille:30, poids:700, couleur:STORY.ciel, max:1 });
  else if(!m.verified) storyTexte(ctx, "Date à confirmer", marge, y, { taille:30, poids:700, couleur:"#FFD27A", max:1 });
  storyPied(ctx, `Date annoncée par ${m.source?.nom || "l'organisateur"}. Les programmes peuvent changer : vérifiez auprès de l'organisateur.`, { accroche:"Tous les meetings" });
  return { nom:`meeting-${slugDep(m.titre).slice(0, 40)}` };
};

// Stories d'actualité : modules séparés, chargés ensemble (A « à la une » et E « en direct » : stories-actu ; B « en bref » et D « dossier » : stories-actu-liste ;
// C « le chiffre », F « face à face » et G « date à retenir » : stories-actu-fait). Chacun remplit STORY_PLUS ; les définitions ci-dessus ne servent que de secours.
const STORY_ACTU_TYPES = ["actualite", "actualites", "chiffre", "facea", "date"];
const STORY_CONTENUS_TYPES = ["aujourdhui", "vote-jour", "comprendre", "chiffre-jour", "diapo"];
async function dessinerStory(type, info){
  if(STORY_ACTU_TYPES.includes(type)) await Promise.all(["stories-actu", "stories-actu-liste", "stories-actu-fait"].map(chargerModule));
  // Publications Instagram automatiques : « post » (image de fil 1080 × 1350) et « annonce-post » (story qui l'annonce), dessinées d'après une fiche (js/stories-post.js)
  if(type === "post" || type === "annonce-post") await chargerModule("stories-post");
  // Contenus récurrents (scripts/contenus-auto.cjs) : stories « aujourd'hui à l'Assemblée », « vote du jour », « comprendre », « chiffre du jour » et images de carrousel 1080 × 1350 (« diapo »)
  if(STORY_CONTENUS_TYPES.includes(type)) await chargerModule("stories-contenus");
  await Promise.all(["600 60px Newsreader", "700 60px Newsreader", "400 30px \"Public Sans\"", "600 30px \"Public Sans\"", "700 30px \"Public Sans\""].map(f=> document.fonts.load(f).catch(()=>{})));
  const c = document.createElement("canvas");
  c.width = STORY.L; c.height = type === "post" || type === "diapo" ? 1350 : STORY.H;
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
    // Style « question / réponse » sur fond bleu : la question (le texte voté), puis la réponse en grand
    const adopte = resultat === "adopte";
    const pour = groupes.reduce((a,g)=>a+g.pour,0), contre = groupes.reduce((a,g)=>a+(g.contre||0),0), abst = groupes.reduce((a,g)=>a+(g.abst||0),0);
    const CIEL = STORY.ciel;
    storyFondTheme(ctx);
    storyMarque(ctx);
    // Question
    const chambre = type === "senat" ? "Sénat" : "Assemblée nationale";
    const etape = (titre.match(/\(([^)]*)\)\s*$/) || [])[1] || "";
    const court = titre.replace(/\s*\([^)]*\)\s*$/, "").replace(/^L['’]ensemble (du |de la |de l['’]|des )/i, "").replace(/^./, c=>c.toUpperCase());
    ctx.font = `700 30px "Public Sans"`; ctx.fillStyle = CIEL; ctx.letterSpacing = "4px";
    ctx.fillText((censure ? "Motion de censure" : type === "senat" ? "Les sénateurs ont-ils voté" : "Vos députés ont-ils voté").toUpperCase(), marge, 390);
    ctx.letterSpacing = "0px";
    const question = censure ? "La motion de censure est-elle adoptée ?" : `« ${court} » ?`;
    const tq = storyTailleFit(ctx, question, STORY_DA.haut, 760, { tMax:92, tMin:52, police:"Newsreader", poids:600, interligne:1.06 });
    y = storyTexte(ctx, question, marge, STORY_DA.haut, { taille:tq, poids:600, police:"Newsreader", couleur:"#fff", max:7, interligne:1.06 });
    y = storyTexte(ctx, [chambre, date, censure ? court : etape].filter(Boolean).join(" · "), marge, y + 20, { taille:26, poids:600, couleur:CIEL, max:2 }) + 30;
    // Carte réponse
    const lignes = [];
    if(censure){
      lignes.push(["Pour la censure", `${formatNombre(pour)} voix sur 289 requises`, adopte ? STORY.vert : STORY.rouge]);
      const ids = groupes.filter(g=>g.pour > 0 && g.pour >= (g.membres || 0) / 2).map(g=>g.id);
      lignes.push(["Groupes qui l'ont votée", ids.length ? ids.join(", ") : "aucun", STORY.encre]);
    } else {
      const parPos = { contre:[], abst:[], pour:[], partage:[] };
      for(const g of groupes){ const p = positionMajoritaire({ typeVote:"" }, g); (parPos[p] || parPos.partage).push(g.id); }
      const liste = ids => ids.length <= 4 ? ids.join(", ") : `${ids.length} groupes`;
      if(parPos.contre.length) lignes.push(["Contre", liste(parPos.contre), STORY.rouge]);
      if(parPos.abst.length) lignes.push(["Abstention", liste(parPos.abst), STORY.ambreTxt]);
      if(parPos.pour.length) lignes.push(["Pour", liste(parPos.pour), STORY.vert]);
      if(parPos.partage.length) lignes.push(["Partagés", liste(parPos.partage), STORY.doux]);
    }
    const cx = marge, cw = largeur, pad = 56, hCarte = 300 + lignes.length * 70 + (censure ? 0 : 50);
    const cyc = Math.min(Math.max(y, 780), 1500 - hCarte);
    storyCarte(ctx, cx, cyc, cw, hCarte);
    const verdict = (adopte ? "Adopté" : "Rejeté") + (censure ? "e" : "") + ".";
    let tv = 150; ctx.letterSpacing = "-4px";
    do { ctx.font = `900 ${tv}px "Public Sans"`; } while(ctx.measureText(verdict.toUpperCase()).width > cw - 2 * pad && (tv -= 6) > 80);
    ctx.fillStyle = adopte ? STORY.vert : STORY.rouge;
    ctx.fillText(verdict.toUpperCase(), cx + pad, cyc + 176); ctx.letterSpacing = "0px";
    ctx.font = `600 36px "Public Sans"`; ctx.fillStyle = STORY.doux;
    ctx.fillText(censure ? (adopte ? "Le Gouvernement est renversé." : "Le Gouvernement reste en place.") : `${formatNombre(pour)} pour · ${formatNombre(contre)} contre · ${formatNombre(abst)} abstention${abst > 1 ? "s" : ""}`, cx + pad, cyc + 236);
    let ly = cyc + 270;
    if(!censure){ storyBarre(ctx, cx + pad, ly, cw - 2 * pad, 16, [[pour, STORY.vert], [contre, STORY.rouge], [abst, STORY.ambre]], (pour + contre + abst) || 1); ly += 46; }
    for(const [lib, val, coul] of lignes){
      ctx.fillStyle = "#E4DDCE"; ctx.fillRect(cx + pad, ly, cw - 2 * pad, 2);
      ctx.font = `400 30px "Public Sans"`; ctx.fillStyle = STORY.encre; ctx.fillText(lib, cx + pad, ly + 46);
      ctx.font = `800 30px "Public Sans"`; ctx.fillStyle = coul; ctx.textAlign = "right";
      ctx.fillText(storyLignes(ctx, val, cw - 2 * pad - 300, 1)[0], cx + cw - pad, ly + 46); ctx.textAlign = "left";
      ly += 70;
    }
    // Source et appel
    storyPied(ctx, sourceTxt, { accroche:type === "senat" ? "Et vos sénateurs ?" : "Et votre député ?" });
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
    y = storyTexte(ctx, `${inst.nom}${commanditaire ? ` pour ${commanditaire}` : ""} · terrain : ${inst.date}`, marge, y, { taille:28, poids:600, couleur:STORY.blanc, max:2 });
    y = storyTexte(ctx, `${liste.length} candidats sur ${tous.length} testés, classés par milieu de fourchette`, marge, y, { taille:24, couleur:STORY.ciel, max:1 }) + 10;
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
    storyTexte(ctx, mentions, marge, yLegal + 30, { taille:23, couleur:STORY.ciel, max:9, interligne:1.2 });
    storyAccroche(ctx, "Tous les sondages", 1636);
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
    storyPied(ctx, "Votes nominatifs de l'Assemblée nationale. Un taux bas ne veut pas dire qu'un député ne travaille pas (commissions, circonscription).", { accroche:"Et votre député ?" });
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
    y = storyTexte(ctx, data.departement || "", marge, y, { taille:30, couleur:STORY.ciel, max:1 }) + 10;
    const hh = 250;
    storyCarte(ctx, marge, y, largeur, hh);
    ctx.fillStyle = coulG; ctx.beginPath(); ctx.rect(marge + 24, y + 40, 8, hh - 80); ctx.fill();
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
    storyPied(ctx, "Résultats définitifs du ministère de l'Intérieur (data.gouv.fr), en % des suffrages exprimés dans la commune.", { accroche:"Et votre commune ?" });
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
    storyPied(ctx, "Vote de chaque sénateur relevé sur les pages officielles des scrutins du Sénat, recoupé avec le total officiel.", { accroche:"Et votre sénateur ?" });
    nom = `senateur-${slugDep(s.nom)}`;
  }

  else if(type === "gouvernement"){
    const g = GOUVERNEMENT; if(!g?.membres?.length) return null;
    y = storyCadre(ctx, "Qui gouverne ?", { couleur:STORY.bleu });
    y = storyTexte(ctx, `Le ${g.nom}`, marge, y, { taille:62, poids:600, police:"Newsreader", max:2, interligne:1.05 });
    y = storyTexte(ctx, `Nommé le ${dateCourte(g.depuis)} · ${g.membres.length} membres`, marge, y, { taille:28, couleur:STORY.ciel, max:1 }) + 10;
    const delegue = m => /délégué|Secrétaire/i.test(m.qualite + " " + m.fonction.split(",")[0]);
    const pm = g.membres.find(m=>m.qualite === "Premier ministre");
    const liste = g.membres.filter(m=>!delegue(m) && m !== pm);
    if(pm){
      const hh = 170;
      storyCarte(ctx, marge, y, largeur, hh);
      ctx.fillStyle = STORY.bleu; ctx.fillRect(marge + 24, y + 30, 8, hh - 60);
      ctx.font = `800 24px "Public Sans"`; ctx.letterSpacing = "3px"; ctx.fillStyle = STORY.bleu; ctx.fillText("PREMIER MINISTRE", marge + 58, y + 68); ctx.letterSpacing = "0px";
      ctx.font = `700 64px "Newsreader"`; ctx.fillStyle = STORY.encre; ctx.fillText(storyLignes(ctx, pm.nom, largeur - 100, 1)[0], marge + 58, y + 138);
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
    storyPied(ctx, `Et ${g.membres.length - liste.length - (pm ? 1 : 0)} ministres délégués. Source : Assemblée nationale, mandats des membres du Gouvernement.`, { accroche:"Qui gouverne ?" });
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
    ctx.fillStyle = p1.couleur; ctx.beginPath(); ctx.rect(marge + 24, y + 40, 8, hh - 80); ctx.fill();
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
    storyPied(ctx, k.note, { accroche:"Et votre député ?" });
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
      ctx.font = `800 30px "Public Sans"`; ctx.fillStyle = STORY.bleu; ctx.fillText(titre.charAt(0).toUpperCase() + titre.slice(1), marge + 28, y + 43);
      ctx.fillStyle = STORY.filet; ctx.fillRect(marge + 28, y + 62, largeur - 56, 2);
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
    storyPied(ctx, "Ordre du jour des séances publiques publié par l'Assemblée nationale. Il peut encore changer.", { accroche:"Tout l'agenda" });
    nom = "agenda-assemblee";
  }

  else if(type === "quiz"){
    const sc = QUIZ_RESULTAT; if(!sc?.length) return null;
    const ex = sc.filter(x=>x.pct === sc[0].pct), seul = ex.length === 1, coul = seul ? sc[0].couleur : STORY.bleu;
    y = storyCadre(ctx, "Mon résultat au quiz", { couleur:coul });
    y = storyTexte(ctx, "Qu'aurais-je voté à la place des députés ?", marge, y, { taille:44, poids:600, police:"Newsreader", max:2, interligne:1.1 });
    y = storyChiffreHeros(ctx, `${sc[0].pct} %`, marge, y + 190, storyClair(coul), 230);
    ctx.font = `600 50px "Newsreader"`; ctx.fillStyle = STORY.blanc;
    y = storyTexte(ctx, seul ? `d'accord avec ${sc[0].nom}` : `d'accord avec ${ex.length} groupes`, marge, y - 14, { taille:50, poids:600, police:"Newsreader", max:2, interligne:1.08 });
    y = storyTexte(ctx, quizPhrase(sc, "Mes"), marge, y, { taille:27, couleur:STORY.ciel, max:3 }) + 12;
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
    storyPied(ctx, "Part des questions où ma réponse correspond à la position de la majorité du groupe, sur de vrais votes de l'Assemblée.", { accroche:"Et vous ? Faites le quiz" });
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
