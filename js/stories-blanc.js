/* ---------------------------------------------------------------------------------------------------------------------------
   Base blanche des stories et posts (direction artistique « presse écrite », dans l'esprit des pages numériques de la presse
   quotidienne : fond blanc, filet noir épais en tête, rubrique en capitales rouges, titre serré en serif gras, chapeau, filets gris fins,
   ligne de source en bas).
   TOUT est dessiné en vectoriel (chemins du canvas : traits, rectangles, arcs, texte) ; les seules images placées sont des PHOTOS ou des
   LOGOS réels (portraits, institutions, logos de partis), toujours sur FOND BLANC (un logo ne se pose jamais sur un fond de couleur).
   Ce module ne contient que le kit commun ; chaque type de story/post l'utilise (storyBlanc*), aucun ne redéfinit ses couleurs.
   Zones sûres Instagram (story 1080 × 1920) : rien d'important au-dessus de y = 250 ni sous y = 1580 (le pied de source peut descendre à 1640).
--------------------------------------------------------------------------------------------------------------------------- */
const BLANC = {
  papier:"#FFFFFF", encre:"#111216", gris:"#5B5E68", filet:"#D8DAE0", fondDoux:"#F3F4F7",
  rouge:"#C8283B", bleu:"#17307A", vert:"#1E7A44", ambre:"#B26A00",
  marge:72, haut:250, bas:1640,
};

// Fond blanc plein cadre (jamais de dégradé, de grain ni de photo assombrie)
function storyBlancFond(ctx, hauteur = ctx.canvas.height){
  ctx.fillStyle = BLANC.papier; ctx.fillRect(0, 0, ctx.canvas.width, hauteur);
}

// Marque vectorielle : arcs d'hémicycle bleu et rouge + point, puis « Hémicycle France » ; renvoie le bord droit
function storyBlancMarque(ctx, x, y, { taille = 40 } = {}){
  const r = taille * 0.62, cy = y;
  ctx.lineCap = "round"; ctx.lineWidth = Math.max(5, taille * 0.15);
  ctx.strokeStyle = BLANC.bleu; ctx.beginPath(); ctx.arc(x + r, cy, r, Math.PI, 0); ctx.stroke();
  ctx.strokeStyle = BLANC.rouge; ctx.beginPath(); ctx.arc(x + r, cy, r * 0.5, Math.PI, 0); ctx.stroke();
  ctx.lineCap = "butt"; ctx.fillStyle = BLANC.encre; ctx.beginPath(); ctx.arc(x + r, cy, taille * 0.09, 0, 2 * Math.PI); ctx.fill();
  ctx.font = `800 ${taille}px "Public Sans"`; ctx.fillStyle = BLANC.encre; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.letterSpacing = "-0.5px";
  ctx.fillText("Hémicycle France", x + 2 * r + taille * 0.4, cy + taille * 0.36);
  const w = ctx.measureText("Hémicycle France").width;
  ctx.letterSpacing = "0px";
  return x + 2 * r + taille * 0.4 + w;
}

// Bandeau de tête : marque à gauche, date à droite, filet noir épais dessous ; renvoie l'ordonnée sous le filet
function storyBlancEntete(ctx, { date = "", y = BLANC.haut, largeur = ctx.canvas.width } = {}){
  const m = BLANC.marge;
  storyBlancMarque(ctx, m, y + 34);
  if(date){
    ctx.font = `600 28px "Public Sans"`; ctx.fillStyle = BLANC.gris; ctx.textAlign = "right"; ctx.textBaseline = "alphabetic";
    ctx.fillText(String(date), largeur - m, y + 44); ctx.textAlign = "left";
  }
  ctx.fillStyle = BLANC.encre; ctx.fillRect(m, y + 74, largeur - 2 * m, 10);
  return y + 84;
}

// Rubrique : capitales espacées rouges avec un petit carré plein devant (comme les « kickers » de la presse) ; renvoie l'ordonnée de la ligne de base + 1 interligne
function storyBlancRubrique(ctx, texte, x, y, { couleur = BLANC.rouge, taille = 30 } = {}){
  const t = String(texte || "").toUpperCase();
  ctx.fillStyle = couleur; ctx.fillRect(x, y - taille * 0.78, taille * 0.5, taille * 0.78);
  ctx.font = `800 ${taille}px "Public Sans"`; ctx.letterSpacing = "3px"; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.fillText(t, x + taille * 0.5 + 16, y);
  const w = ctx.measureText(t).width; ctx.letterSpacing = "0px";
  return { droite: x + taille * 0.5 + 16 + w, y: y + taille * 1.5 };
}

// Filet horizontal gris fin (séparateur de blocs)
function storyBlancFilet(ctx, y, { x = BLANC.marge, largeur = ctx.canvas.width - 2 * BLANC.marge, epais = 2, couleur = BLANC.filet } = {}){
  ctx.fillStyle = couleur; ctx.fillRect(x, y, largeur, epais);
}

// Pied : filet gris, source à gauche (jamais coupée : la ligne passe à la suivante), « @hemicyclefrance » à droite ; `y` = haut du pied
function storyBlancPied(ctx, source, { y = BLANC.bas - 60, largeur = ctx.canvas.width } = {}){
  const m = BLANC.marge;
  storyBlancFilet(ctx, y, { largeur: largeur - 2 * m });
  ctx.fillStyle = BLANC.gris; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.font = `600 26px "Public Sans"`;
  const maxW = largeur - 2 * m, mots = String(source || "").split(/\s+/).filter(Boolean), lignes = []; let l = "";
  for(const mot of mots){ const t = l ? `${l} ${mot}` : mot; if(ctx.measureText(t).width > maxW && l){ lignes.push(l); l = mot; } else l = t; }
  if(l) lignes.push(l);
  lignes.slice(0, 3).forEach((s, i) => ctx.fillText(s, m, y + 40 + i * 34));
  ctx.font = `800 26px "Public Sans"`; ctx.fillStyle = BLANC.encre; ctx.textAlign = "right";
  ctx.fillText("@hemicyclefrance", largeur - m, y + 40 + Math.min(lignes.length, 3) * 34 + 8); ctx.textAlign = "left";
  return y + 40 + Math.min(lignes.length, 3) * 34 + 20;
}

/* ---------------------------------------------------------------------------------------------------------------------------
   Compléments « presse » (stories d'actualité) : empilement de blocs mesurés, texte entier jamais coupé, cadres photo, pied complet.
   Principe : chaque élément de la page est un BLOC { h, avant, dessiner(ctx, x, y) } ; storyBlancPile() choisit, parmi les OPTIONS de
   chaque bloc (du plus grand au plus petit), la combinaison qui tient entre `haut` et `bas`, répartit l'air restant et dessine.
   Un bloc facultatif a une dernière option vide (storyBlancVide) : on le retire avant de couper le moindre texte.
--------------------------------------------------------------------------------------------------------------------------- */
// Titres : Newsreader en graisse 700-800. La déclaration @font-face du site s'arrête à 600 pour Newsreader ; le même fichier hébergé est donc
// déclaré ici sous un nom de famille propre au canvas (graisses 200-800). La chaîne sert de paramètre « police » (elle s'insère entre guillemets) ;
// à défaut du fichier, la police du site prend le relais.
BLANC.serif = 'Newsreader Titre", "Newsreader';
BLANC.texte = "#23252C"; // corps de texte : encre un peu adoucie
let BLANC_POLICES = null;
function storyBlancPolices(){
  if(BLANC_POLICES) return BLANC_POLICES;
  const taches = [];
  try {
    if(typeof FontFace !== "undefined" && document.fonts){
      const f = new FontFace("Newsreader Titre", "url(fonts/newsreader-normal-latin.woff2)", { weight:"200 800", style:"normal" });
      document.fonts.add(f); taches.push(f.load().catch(() => {}));
    }
  } catch(e){}
  for(const f of ['800 80px "Newsreader Titre"', '600 30px "Public Sans"', '700 30px "Public Sans"', '800 30px "Public Sans"', '600 60px Newsreader']) taches.push(document.fonts.load(f).catch(() => {}));
  return (BLANC_POLICES = Promise.all(taches));
}
storyBlancPolices();

// Date du jour en toutes lettres (« Jeudi 6 novembre 2026 ») pour le bandeau de tête
function storyBlancDateJour(){
  try {
    const t = new Date().toLocaleDateString("fr-FR", { timeZone:"Europe/Paris", weekday:"long", day:"numeric", month:"long", year:"numeric" }).replace(/ 1 /, " 1er ");
    return t.charAt(0).toUpperCase() + t.slice(1);
  } catch(e){ return ""; }
}
// Heure de Paris d'un horodatage ISO (« 17 h 10 »), précédée du jour (« 4 novembre · ») quand ce n'est pas aujourd'hui ; "" si la date est illisible
function storyBlancQuand(iso){
  const d = new Date(iso);
  if(isNaN(d)) return "";
  const f = o => d.toLocaleString("fr-FR", { timeZone:"Europe/Paris", ...o });
  const jour = x => x.toLocaleDateString("fr-FR", { timeZone:"Europe/Paris", day:"numeric", month:"numeric", year:"numeric" });
  const h = f({ hour:"2-digit", minute:"2-digit" }).replace(":", " h ").replace(/^0(?=\d)/, "");
  return jour(d) === jour(new Date()) ? h : `${f({ day:"numeric", month:"long" })} · ${h}`;
}
// Mention des médias cités (obligatoire au pied des stories de presse) : « 4 médias en parlent : Le Monde, Libération, Le JDD et 20 Minutes. » ; la liste est COMPLÈTE
function storyBlancSources(medias){
  const m = [...new Set((medias || []).map(x => String(x || "").replace(/\s+/g, " ").trim()).filter(Boolean))];
  if(!m.length) return "";
  const liste = m.length > 1 ? `${m.slice(0, -1).join(", ")} et ${m[m.length - 1]}` : m[0];
  return m.length > 1 ? `${m.length} médias en parlent : ${liste}.` : `Titre publié par ${liste}.`;
}
// Bandeau de tête d'une story de presse : marque + date, filet épais, ligne « rubrique rouge (+ heure grise à droite) » ; renvoie l'ordonnée où commence le contenu.
// `direct` : pastille ronde rouge devant la rubrique (« EN DIRECT »)
function storyBlancTete(ctx, { rubrique = "", quand = "", date, direct = false } = {}){
  const W = ctx.canvas.width, m = BLANC.marge;
  const y0 = storyBlancEntete(ctx, { date:date === undefined ? storyBlancDateJour() : date });
  const yb = y0 + 56;
  let x = m;
  let r;
  if(direct){ // pastille ronde à la place du petit carré, puis la rubrique en capitales
    ctx.fillStyle = BLANC.rouge; ctx.beginPath(); ctx.arc(m + 14, yb - 12, 13, 0, 2 * Math.PI); ctx.fill();
    ctx.font = `800 30px "Public Sans"`; ctx.letterSpacing = "3px"; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    const t = String(rubrique || "").toUpperCase(); ctx.fillText(t, m + 42, yb); r = { droite:m + 42 + ctx.measureText(t).width }; ctx.letterSpacing = "0px";
  } else r = storyBlancRubrique(ctx, rubrique, x, yb);
  if(quand){
    ctx.font = `600 28px "Public Sans"`; const w = ctx.measureText(quand).width;
    if(r.droite + 30 + w <= W - m){ ctx.fillStyle = BLANC.gris; ctx.textAlign = "right"; ctx.textBaseline = "alphabetic"; ctx.fillText(quand, W - m, yb); ctx.textAlign = "left"; }
  }
  return yb + 50;
}

// Espace insécable et « mot collé » (U+2060) : écrits par code pour qu'aucun caractère invisible n'entre dans le source
const BLANC_NBSP = String.fromCharCode(160), BLANC_WJ = String.fromCharCode(8288);
const BLANC_RE_NOMBRE = new RegExp("(\\d) (?=\\d{3}(?!\\d))", "g");
const BLANC_RE_UNITE = new RegExp("(\\d) (?=(?:millions?|milliards?|euros?|€|%|points?|jours?|mois|ans|heures?|h)(?![\\p{L}]))", "gu");
// Lignes d'un texte, équilibrées : sans mot faible en fin de ligne (storyColle), sans dernière ligne réduite à un ou deux petits mots. Contrairement à storyLignesEq, les espaces insécables
// du texte sont conservés (un nombre et son unité ne se séparent pas : « 575 000 », « 1,6 million », « 12 € »)
function storyBlancLignes(ctx, texte, largeur){
  const t = storyColle(storyTypo(texte).replace(BLANC_RE_NOMBRE, "$1" + BLANC_NBSP).replace(BLANC_RE_UNITE, "$1" + BLANC_NBSP));
  const base = storyLignes(ctx, t, largeur, 99), w = l => ctx.measureText(l).width;
  if(base.length < 2 || w(base[base.length - 1]) >= 0.3 * largeur) return base;
  for(let L = largeur - 20; L >= largeur * 0.72; L -= 20){
    const l = storyLignes(ctx, t, L, 99);
    if(l.length === base.length && w(l[l.length - 1]) >= 0.3 * largeur) return l;
    if(l.length > base.length) break;
  }
  return base;
}
// Bloc de texte mesuré : lignes équilibrées, TOUJOURS entier (ok = rien ne dépasse, aucun « … » de coupe). `fond` : "creme" colore verdicts et voix. `accent` : suite de
// caractères finale (ex. « ? ») écrite en rouge. `ls` : interlettrage en px.
function storyBlancBlocTexte(ctx, texte, { taille = 40, poids = 400, police = "Public Sans", largeur = ctx.canvas.width - 2 * BLANC.marge, interligne = 1.2, ls = 0, couleur = BLANC.encre, fond = null, accent = "" } = {}){
  ctx.letterSpacing = ls ? `${ls}px` : "0px";
  ctx.font = `${poids} ${taille}px "${police}"`;
  if(taille >= 40 && interligne < 1.2 && /[ÀÂÄÉÈÊËÎÏÔÖÙÛÜŸÇ]/.test(texte)) interligne = Math.max(interligne, 1.2); // accents sur capitales : ils ne touchent pas les jambages de la ligne précédente
  const l = storyBlancLignes(ctx, texte, largeur);
  const b = { l, taille, poids, police, interligne, h:taille + (l.length - 1) * taille * interligne, ok:l.every(x => ctx.measureText(x).width <= largeur + 1) && (/…/.test(texte) || !l.some(x => x.endsWith("…"))) };
  ctx.letterSpacing = "0px";
  return { ...b, ls, couleur, largeur, dessiner(c, x, y, coul){
    const col = coul || couleur;
    c.letterSpacing = ls ? `${ls}px` : "0px";
    const ders = b.l.length ? b.l[b.l.length - 1].split(BLANC_WJ).join("").split(BLANC_NBSP).join(" ") : "";
    if(accent && ders.endsWith(accent)){
      const reste = b.l.slice(0, -1), deb = ders.slice(0, ders.length - accent.length);
      if(reste.length) storyStyleEcrire(c, { ...b, l:reste, h:b.taille + (reste.length - 1) * b.taille * b.interligne }, x, y, col, fond);
      const yl = y + b.taille * 0.82 + reste.length * b.taille * b.interligne;
      c.font = `${b.poids} ${b.taille}px "${b.police}"`; c.textAlign = "left"; c.textBaseline = "alphabetic";
      const xa = x + c.measureText(deb).width; // la ligne est écrite deux fois en entier : à gauche de l'accent en encre, à droite en rouge
      c.save(); c.beginPath(); c.rect(x - 8, yl - b.taille, xa - x + 8, b.taille * 1.5); c.clip(); c.fillStyle = col; c.fillText(ders, x, yl); c.restore();
      c.save(); c.beginPath(); c.rect(xa, yl - b.taille, largeur, b.taille * 1.5); c.clip(); c.fillStyle = BLANC.rouge; c.fillText(ders, x, yl); c.restore();
    } else storyStyleEcrire(c, b, x, y, col, fond);
    c.letterSpacing = "0px";
  } };
}
// Options d'un texte, de la plus grande taille à la plus petite : seules celles où le texte ENTIER tient (≤ max lignes, ≤ hMax). `rang(t)` : ordre de sacrifice (voir storyBlancPile)
function storyBlancOptions(ctx, texte, { tailles, max = 99, hMax = 99999, avant, rang = () => 0, ...o }){
  const r = [], t = storyTypo(texte);
  if(!t) return r;
  for(const taille of tailles){
    const b = storyBlancBlocTexte(ctx, t, { ...o, taille, ls:typeof o.ls === "function" ? o.ls(taille) : (o.ls || 0) });
    if(b.ok && b.l.length <= max && b.h <= hMax){ b.avant = avant; b.rang = rang(taille); r.push(b); }
  }
  return r;
}
const storyBlancTailles = (max, min, pas = 2) => { const r = []; for(let t = max; t >= min; t -= pas) r.push(t); return r; };
// Bloc quelconque et bloc vide (dernière option d'un élément facultatif)
const storyBlancBloc = (h, dessiner, o = {}) => ({ h, dessiner, ...o });
const storyBlancVide = (rang = 0) => ({ h:0, avant:0, rang, vide:true, dessiner(){} });
// Petit intitulé en capitales espacées (« L'ESSENTIEL »)
function storyBlancLabel(ctx, texte, { couleur = BLANC.rouge, taille = 24, ls = 4, avant } = {}){
  return { h:taille, avant, dessiner(c, x, y){
    c.font = `800 ${taille}px "Public Sans"`; c.letterSpacing = `${ls}px`; c.fillStyle = couleur; c.textAlign = "left"; c.textBaseline = "alphabetic";
    c.fillText(String(texte).toUpperCase(), x, y + taille * 0.82); c.letterSpacing = "0px";
  } };
}
// Filet gris fin comme bloc
const storyBlancFiletBloc = (avant, epais = 2, couleur = BLANC.filet) => ({ h:epais, avant, dessiner(c, x, y){ storyBlancFilet(c, y, { x, epais, couleur }); } });
// Empile des blocs entre `haut` et `bas`. Chaque élément est un bloc ou { options:[bloc, …] } (du plus grand au plus petit ; chaque option porte un `rang` : on sacrifie d'abord
// l'option de plus petit rang). Renvoie null si rien ne tient, sinon { hauteur, reste, choix, dessiner() } ; l'air restant s'ajoute entre les blocs (au plus `ecartMax` chacun).
function storyBlancPile(ctx, items, { haut, bas, ecartMax = 80, depart = 0.2, departMax = 40, ecartDefaut = 36 } = {}){
  const E = items.filter(Boolean).map(x => ({ x, i:0 }));
  if(E.some(e => e.x.options && !e.x.options.length)) return null; // un texte qui ne tient en entier à aucune taille : pas de mise en page
  const cur = e => e.x.options ? e.x.options[e.i] : e.x;
  const avant = (e, k) => k ? (cur(e).avant ?? e.x.avant ?? ecartDefaut) : 0;
  const total = () => E.reduce((a, e, k) => a + cur(e).h + avant(e, k), 0);
  const dispo = bas - haut;
  while(total() > dispo){
    let c = null, cr = Infinity;
    for(const e of E){ const n = e.x.options && e.x.options[e.i + 1]; if(n && (n.rang ?? 0) < cr){ cr = n.rang ?? 0; c = e; } }
    if(!c) return null;
    c.i++;
  }
  const t = total(), reste = dispo - t, n = E.length - 1;
  return { hauteur:t, reste, choix:E.map(cur), dessiner(){
    const x = BLANC.marge, haut0 = Math.min(reste * depart, departMax);
    const ec = n > 0 ? Math.min(ecartMax, (reste - haut0) / n) : 0;
    let y = haut + haut0;
    E.forEach((e, k) => { const b = cur(e); if(k) y += avant(e, k) + (b.h || cur(E[k - 1]).h ? ec : 0); b.dessiner(ctx, x, y); y += b.h; });
    return y;
  } };
}
// Premier plan qui tient parmi des constructions de plus en plus pauvres : `essais` = fonctions () => liste d'éléments (ou null) ; `accepte(plan)` facultatif
function storyBlancPremier(ctx, essais, params, accepte){
  let repli = null;
  for(const f of essais){
    const items = f(); if(!items) continue;
    const p = storyBlancPile(ctx, items, params);
    if(!p) continue;
    if(!accepte || accepte(p)) return p;
    repli = repli || p;
  }
  return repli;
}

// « L'ESSENTIEL » : petit intitulé rouge puis chapeau (texte entier, Public Sans 600) en options de taille décroissante. Du texte complet aux premières propositions complètes
// (storyVariantes, terminées par un point, jamais « … ») ; `rang` = [rang des tailles du texte entier, rang des variantes plus courtes, rang du retrait complet (null : jamais retiré)].
function storyBlancChapeau(ctx, texte, { label = "L'essentiel", tailles = storyBlancTailles(46, 34), largeur = ctx.canvas.width - 2 * BLANC.marge, avant = 36, fond = null, variantes = true, poids = 600, rang = [1, 5, 6], couleur = BLANC.texte } = {}){
  const t = storyTypo(texte);
  if(!t) return null;
  const vs = variantes && typeof storyVariantes === "function" ? storyVariantes(t) : [t], opts = [];
  vs.forEach((v, k) => {
    for(const b of storyBlancOptions(ctx, v, { tailles, poids, largeur, interligne:1.24, couleur, fond, rang:() => k ? rang[1] : rang[0] })){
      opts.push({ h:24 + 14 + b.h, avant, rang:b.rang, taille:b.taille, texte:v, dessiner(c, x, y){ storyBlancLabel(ctx, label, { taille:24 }).dessiner(c, x, y); b.dessiner(c, x, y + 38); } });
    }
  });
  if(!opts.length) return null;
  if(rang[2] !== null) opts.push(storyBlancVide(rang[2]));
  return { options:opts };
}
// Citation de presse attribuée : filet rouge à gauche, texte « … » entier en serif, puis « — MÉDIA » (et, facultatif, une note) ; options de taille décroissante
function storyBlancCitation(ctx, titre, media, { tailles = storyBlancTailles(44, 30), largeur = ctx.canvas.width - 2 * BLANC.marge, avant = 34, note = "", rang = [1, null] } = {}){
  const t = storyTypo(titre).replace(/«\s*([^»]*?)\s*»/g, "“$1”").replace(/"([^"]*)"/g, "“$1”").replace(/[\s,;:.\-–]+$/, ""), m = storyTypo(media);
  if(!t || !m) return null;
  const opts = [];
  for(const b of storyBlancOptions(ctx, `« ${t} »`, { tailles, poids:600, police:BLANC.serif, largeur:largeur - 32, interligne:1.2, couleur:BLANC.encre, rang:() => rang[0] })){
    const hn = note ? 40 : 0, h = b.h + 14 + 26 + hn;
    opts.push({ h, avant, rang:b.rang, taille:b.taille, dessiner(c, x, y){
      c.fillStyle = BLANC.rouge; c.fillRect(x, y + 4, 8, h - 8);
      b.dessiner(c, x + 32, y);
      c.font = `800 24px "Public Sans"`; c.letterSpacing = "2px"; c.fillStyle = BLANC.rouge; c.textBaseline = "alphabetic"; c.textAlign = "left";
      c.fillText(`— ${m.toUpperCase()}`, x + 32, y + b.h + 14 + 22); c.letterSpacing = "0px";
      if(note){ c.font = `600 24px "Public Sans"`; c.fillStyle = BLANC.gris; c.fillText(note, x + 32, y + b.h + 14 + 26 + 32); }
    } });
  }
  if(!opts.length) return null;
  if(rang[1] !== null) opts.push(storyBlancVide(rang[1]));
  return { options:opts };
}
// Cadre photo net sur le blanc : photo recadrée « cover » (jamais agrandie à plus de 1,5 fois : sinon elle est reproduite plus petite, centrée dans le cadre gris clair),
// liseré gris fin. Renvoie le rectangle occupé.
function storyBlancCadrePhoto(ctx, img, x, y, w, h, { ancre = 0.28 } = {}){
  ctx.fillStyle = BLANC.fondDoux; ctx.fillRect(x, y, w, h);
  let k = Math.max(w / img.naturalWidth, h / img.naturalHeight), rw = w, rh = h, rx = x, ry = y;
  if(k > 1.5){ const f = 1.5 / k; rw = Math.round(w * f); rh = Math.round(h * f); rx = x + Math.round((w - rw) / 2); ry = y + Math.round((h - rh) / 2); k = 1.5; }
  const iw = img.naturalWidth * k, ih = img.naturalHeight * k;
  ctx.save(); ctx.beginPath(); ctx.rect(rx, ry, rw, rh); ctx.clip();
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, rx - (iw - rw) / 2, ry - (ih - rh) * ancre, iw, ih);
  ctx.restore();
  ctx.strokeStyle = BLANC.filet; ctx.lineWidth = 2; ctx.strokeRect(rx + 1, ry + 1, rw - 2, rh - 2);
  return { x:rx, y:ry, w:rw, h:rh };
}
// Cadre « sans photo » : fond gris très clair et motif vectoriel du thème (tracé SVG 24 × 24) en gris, jamais un pictogramme sur fond coloré
function storyBlancCadreMotif(ctx, motif, x, y, w, h){
  ctx.fillStyle = BLANC.fondDoux; ctx.fillRect(x, y, w, h);
  if(motif && typeof Path2D !== "undefined"){
    const s = Math.min(w, h) * 0.62;
    ctx.save(); ctx.translate(x + (w - s) / 2, y + (h - s) / 2); ctx.scale(s / 24, s / 24);
    ctx.strokeStyle = "#C9CCD6"; ctx.lineWidth = 0.5; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.stroke(new Path2D(motif)); ctx.restore();
  }
  ctx.strokeStyle = BLANC.filet; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
}
// Bloc « photo + légende » : options de hauteur (du plus grand au plus petit) ; `rang` : ordre de sacrifice ; `legende` : crédit écrit sous le cadre, en entier
function storyBlancPhotoOptions(ctx, { img = null, motif = "", legende = "", hauteurs = [620, 560, 500, 440, 380, 320], rang = 0, rangVide = 3, avant = 30, largeur = ctx.canvas.width - 2 * BLANC.marge } = {}){
  if(!img && !motif) return null;
  const lg = legende ? storyBlancBlocTexte(ctx, legende, { taille:22, poids:600, couleur:BLANC.gris, largeur, interligne:1.25 }) : null;
  const opts = hauteurs.map(hc => ({ h:hc + (lg ? 12 + lg.h : 0), avant, rang, dessiner(c, x, y){
    if(img) storyBlancCadrePhoto(c, img, x, y, largeur, hc); else storyBlancCadreMotif(c, motif, x, y, largeur, hc);
    if(lg) lg.dessiner(c, x, y + hc + 12);
  } }));
  return { options:[...opts, storyBlancVide(rangVide)] };
}
// Pied complet : filet gris, ligne vidéo, source (en entier : la taille descend de 26 à 20 px, jamais de coupe), puis « @hemicyclefrance » à droite.
// storyBlancPiedPlan donne la hauteur ; storyBlancPiedDessiner pose le pied de sorte qu'il se termine à `bas` (1640 : limite basse des zones sûres d'Instagram).
function storyBlancPiedPlan(ctx, source, { video = "", largeur = ctx.canvas.width } = {}){
  const maxW = largeur - 2 * BLANC.marge, txt = String(source || "").replace(/\s+/g, " ").trim();
  let t = 26, lignes = [];
  for(const tt of [26, 24, 22, 20]){
    t = tt; ctx.font = `600 ${t}px "Public Sans"`; lignes = []; let l = "";
    for(const mot of txt.split(" ").filter(Boolean)){ const e = l ? `${l} ${mot}` : mot; if(ctx.measureText(e).width > maxW && l){ lignes.push(l); l = mot; } else l = e; }
    if(l) lignes.push(l);
    if(lignes.length <= 3) break;
  }
  const lh = Math.round(t * 1.45);
  ctx.font = `800 26px "Public Sans"`; const wH = ctx.measureText("@hemicyclefrance").width;
  ctx.font = `600 ${t}px "Public Sans"`;
  const memeLigne = lignes.length > 0 && ctx.measureText(lignes[lignes.length - 1]).width + wH + 40 <= maxW;
  let b = 44; if(video) b += 40;
  const bLignes = b, bFin = lignes.length ? bLignes + (lignes.length - 1) * lh + (memeLigne ? 0 : 46) : bLignes;
  return { lignes, t, lh, video, memeLigne, bLignes, bFin, h:bFin + 14, largeur };
}
function storyBlancPiedDessiner(ctx, plan, bas = BLANC.bas){
  const m = BLANC.marge, W = plan.largeur, y = bas - plan.h;
  storyBlancFilet(ctx, y, { largeur:W - 2 * m });
  ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
  if(plan.video){
    const yv = y + 44;
    ctx.fillStyle = BLANC.encre; ctx.beginPath(); ctx.moveTo(m, yv - 20); ctx.lineTo(m, yv + 2); ctx.lineTo(m + 20, yv - 9); ctx.closePath(); ctx.fill();
    ctx.font = `700 24px "Public Sans"`; ctx.fillText(`Vidéo : ${plan.video}`, m + 34, yv);
  }
  ctx.font = `600 ${plan.t}px "Public Sans"`; ctx.fillStyle = BLANC.gris;
  plan.lignes.forEach((l, i) => ctx.fillText(l, m, y + plan.bLignes + i * plan.lh));
  ctx.font = `800 26px "Public Sans"`; ctx.fillStyle = BLANC.encre; ctx.textAlign = "right";
  ctx.fillText("@hemicyclefrance", W - m, plan.memeLigne ? y + plan.bLignes + (plan.lignes.length - 1) * plan.lh : y + plan.bFin);
  ctx.textAlign = "left";
  return y;
}
// Carré de portrait net (cadre gris fin) ou, sans photo, carré gris clair portant les initiales ; renvoie le rectangle occupé
function storyBlancCarrePortrait(ctx, img, nom, x, y, w, h){
  if(img) return storyBlancCadrePhoto(ctx, img, x, y, w, h, { ancre:0.12 });
  ctx.fillStyle = BLANC.fondDoux; ctx.fillRect(x, y, w, h);
  ctx.font = `800 ${Math.round(Math.min(w, h) * 0.38)}px "${BLANC.serif}"`; ctx.fillStyle = "#9A9DA8"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(typeof storyPInitiales === "function" ? (storyPInitiales(nom) || "?") : "?", x + w / 2, y + h / 2 + 4); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.strokeStyle = BLANC.filet; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  return { x, y, w, h };
}

// Pastille « verdict » vectorielle : carré plein vert (adopté) ou rouge (rejeté) avec ✓ / ✕ tracés, jamais la couleur seule
function storyBlancVerdict(ctx, adopte, x, y, taille = 64){
  ctx.fillStyle = adopte ? BLANC.vert : BLANC.rouge; ctx.fillRect(x, y, taille, taille);
  ctx.strokeStyle = BLANC.papier; ctx.lineWidth = taille * 0.1; ctx.lineCap = "square"; ctx.beginPath();
  if(adopte){ ctx.moveTo(x + taille * 0.24, y + taille * 0.54); ctx.lineTo(x + taille * 0.43, y + taille * 0.72); ctx.lineTo(x + taille * 0.77, y + taille * 0.30); }
  else { ctx.moveTo(x + taille * 0.28, y + taille * 0.28); ctx.lineTo(x + taille * 0.72, y + taille * 0.72); ctx.moveTo(x + taille * 0.72, y + taille * 0.28); ctx.lineTo(x + taille * 0.28, y + taille * 0.72); }
  ctx.stroke(); ctx.lineCap = "butt";
}

/* ---------------------------------------------------------------------------------------------------------------------------
   Extensions du kit pour les contenus hors presse (vote, sondages, fiches, posts, carrousels…).
   Règles tenues par ces helpers : le texte n'est JAMAIS coupé (la taille diminue, la mise en page s'allonge), tout est dessiné en
   chemins du canvas, les logos ne sont posés que sur le blanc. Convention : `y` = HAUT du bloc de texte ; la valeur renvoyée est le bas du bloc.
--------------------------------------------------------------------------------------------------------------------------- */
// Texte entier, passé à la ligne par mots, aucun « … » ; Public Sans par défaut, encre sur blanc
function storyBlancTexte(ctx, texte, x, y, { taille = 36, poids = 500, police = "Public Sans", couleur = BLANC.encre, largeur = ctx.canvas.width - 2 * BLANC.marge, interligne = 1.25, align = "left", ls = 0 } = {}){
  ctx.font = `${poids} ${taille}px "${police}"`; ctx.letterSpacing = ls + "px";
  const lignes = storyLignes(ctx, String(texte == null ? "" : texte), largeur, 99);
  ctx.fillStyle = couleur; ctx.textAlign = align; ctx.textBaseline = "alphabetic";
  lignes.forEach((l, i) => ctx.fillText(l, x, y + taille * 0.86 + i * taille * interligne));
  ctx.letterSpacing = "0px"; ctx.textAlign = "left";
  return y + (lignes.length - 1) * taille * interligne + taille * 1.2;
}
function storyBlancHauteur(ctx, texte, { taille = 36, poids = 500, police = "Public Sans", largeur = ctx.canvas.width - 2 * BLANC.marge, interligne = 1.25, ls = 0 } = {}){
  ctx.font = `${poids} ${taille}px "${police}"`; ctx.letterSpacing = ls + "px";
  const n = storyLignes(ctx, String(texte == null ? "" : texte), largeur, 99).length;
  ctx.letterSpacing = "0px";
  return (n - 1) * taille * interligne + taille * 1.2;
}
// Plus grande taille (tMin..tMax) pour laquelle le texte tient en `hauteur` pixels ; tMin si rien ne tient
function storyBlancTailleFit(ctx, texte, hauteur, { tMax = 56, tMin = 24, pas = 2, ...o } = {}){
  for(let t = tMax; t > tMin; t -= pas) if(storyBlancHauteur(ctx, texte, { ...o, taille: t }) <= hauteur) return t;
  return tMin;
}
// Texte dessiné à la plus grande taille qui tient entre y et yFin ; renvoie { y: bas du bloc, taille, depasse }
function storyBlancFit(ctx, texte, x, y, yFin, { tMax = 56, tMin = 24, pas = 2, ...o } = {}){
  const t = storyBlancTailleFit(ctx, texte, yFin - y, { ...o, tMax, tMin, pas });
  const bas = storyBlancTexte(ctx, texte, x, y, { ...o, taille: t });
  return { y: bas, taille: t, depasse: bas > yFin + 1 };
}
// Grand titre serif (Newsreader gras) à la plus grande taille qui tient ; renvoie { y, taille }
function storyBlancTitre(ctx, texte, x, y, yFin, { tMax = 88, tMin = 44, couleur = BLANC.encre, largeur = ctx.canvas.width - 2 * BLANC.marge, interligne = 1.06 } = {}){
  return storyBlancFit(ctx, texte, x, y, yFin, { tMax, tMin, police: "Newsreader", poids: 600, couleur, largeur, interligne, ls: -0.5 });
}
// Texte d'une seule ligne, réduit (jusqu'à `min`) pour tenir en `largeur` ; si cela ne suffit pas, passe à la ligne (jamais coupé). Renvoie le bas du bloc
function storyBlancLigne(ctx, texte, x, y, { taille = 32, poids = 600, police = "Public Sans", couleur = BLANC.encre, largeur = 400, align = "left", min = 18, ls = 0, interligne = 1.18 } = {}){
  let t = taille; texte = String(texte == null ? "" : texte);
  const w = tt => { ctx.font = `${poids} ${tt}px "${police}"`; ctx.letterSpacing = ls + "px"; const r = ctx.measureText(texte).width; ctx.letterSpacing = "0px"; return r; };
  while(t > min && w(t) > largeur) t -= 1;
  return storyBlancTexte(ctx, texte, x, y, { taille: t, poids, police, couleur, largeur, align, ls, interligne });
}
// Capitales espacées (légendes, sur-titres de blocs) ; renvoie le bord droit
function storyBlancCaps(ctx, texte, x, y, { taille = 22, couleur = BLANC.gris, ls = 3, align = "left", poids = 800 } = {}){
  const t = String(texte || "").toUpperCase();
  ctx.font = `${poids} ${taille}px "Public Sans"`; ctx.letterSpacing = ls + "px"; ctx.fillStyle = couleur; ctx.textAlign = align; ctx.textBaseline = "alphabetic";
  ctx.fillText(t, x, y + taille * 0.86); const w = ctx.measureText(t).width; ctx.letterSpacing = "0px"; ctx.textAlign = "left";
  return align === "right" ? x : x + w;
}
// Cadre commun : fond blanc, bandeau (marque, date), filet noir épais, rubrique rouge ; renvoie l'ordonnée où commence le contenu
function storyBlancCadre(ctx, rubrique, { date = "", haut = BLANC.haut, largeur = ctx.canvas.width } = {}){
  storyBlancFond(ctx);
  const y = storyBlancEntete(ctx, { date, y: haut, largeur });
  let t = 30; const maxW = largeur - 2 * BLANC.marge - 40;
  const mesure = tt => { ctx.font = `800 ${tt}px "Public Sans"`; ctx.letterSpacing = "3px"; const w = ctx.measureText(String(rubrique || "").toUpperCase()).width; ctx.letterSpacing = "0px"; return w; };
  while(t > 18 && mesure(t) > maxW) t -= 1;
  const r = storyBlancRubrique(ctx, rubrique, BLANC.marge, y + 52, { taille: t });
  return r.y + 14;
}
// Pied ancré en bas : filet, source en entier (taille réduite si longue), « @hemicyclefrance » ; dessine et renvoie l'ordonnée du HAUT du pied (le contenu doit finir au-dessus)
function storyBlancPiedBas(ctx, source, { bas = BLANC.bas - 10, largeur = ctx.canvas.width, taille = 24, handle = true, maxLignes = 4, min = 17, dessiner = true } = {}){
  const m = BLANC.marge, maxW = largeur - 2 * m, texte = String(source || "").replace(/\s+/g, " ").trim();
  let t = taille, lignes = [];
  const decoupe = () => { ctx.font = `600 ${t}px "Public Sans"`; lignes = texte ? storyLignes(ctx, texte, maxW, 99) : []; };
  decoupe(); while(lignes.length > maxLignes && t > min){ t -= 1; decoupe(); }
  const pas = Math.round(t * 1.36), hauteur = 20 + lignes.length * pas + (handle ? 40 : 6), haut = bas - hauteur;
  if(!dessiner) return haut; // mesure seule (aucun dessin)
  storyBlancFilet(ctx, haut, { largeur: maxW });
  ctx.fillStyle = BLANC.gris; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.font = `600 ${t}px "Public Sans"`;
  lignes.forEach((s, i) => ctx.fillText(s, m, haut + 20 + t + i * pas));
  if(handle){ ctx.font = `800 24px "Public Sans"`; ctx.fillStyle = BLANC.encre; ctx.textAlign = "right"; ctx.fillText("@hemicyclefrance", largeur - m, bas - 8); ctx.textAlign = "left"; }
  return haut;
}
// Repères de vote vectoriels (jamais la couleur seule) : ✓ pour, ✕ contre, ○ abstention, carré rayé partagé ; centrés en (cx, cy), côté t
function storyBlancRepere(ctx, type, cx, cy, t, couleur){
  ctx.save(); ctx.strokeStyle = couleur; ctx.fillStyle = couleur; ctx.lineWidth = Math.max(3, t * 0.17); ctx.lineCap = "round"; ctx.lineJoin = "round";
  const h = t / 2; ctx.beginPath();
  if(type === "pour"){ ctx.moveTo(cx - h * 0.8, cy + h * 0.05); ctx.lineTo(cx - h * 0.2, cy + h * 0.65); ctx.lineTo(cx + h * 0.85, cy - h * 0.65); ctx.stroke(); }
  else if(type === "contre"){ ctx.moveTo(cx - h * 0.65, cy - h * 0.65); ctx.lineTo(cx + h * 0.65, cy + h * 0.65); ctx.moveTo(cx + h * 0.65, cy - h * 0.65); ctx.lineTo(cx - h * 0.65, cy + h * 0.65); ctx.stroke(); }
  else if(type === "abst"){ ctx.arc(cx, cy, h * 0.7, 0, 2 * Math.PI); ctx.stroke(); }
  else {
    ctx.lineWidth = Math.max(2.5, t * 0.1); ctx.strokeRect(cx - h * 0.7, cy - h * 0.7, h * 1.4, h * 1.4);
    ctx.rect(cx - h * 0.7, cy - h * 0.7, h * 1.4, h * 1.4); ctx.clip(); ctx.beginPath();
    for(let k = -2; k <= 2; k++){ ctx.moveTo(cx - h + k * h * 0.7, cy + h); ctx.lineTo(cx + h + k * h * 0.7, cy - h); } ctx.stroke();
  }
  ctx.restore();
}
// Couleurs de vote sur blanc (contraste ≥ 4,5:1)
const BLANC_VOIX = { pour: "#1E7A44", contre: "#C8283B", abst: "#B26A00", partage: "#5B5E68", adopte: "#1E7A44", rejete: "#C8283B" };
// Trois colonnes « pour / contre / abstentions » : grands chiffres séparés par des filets verticaux, repère vectoriel + mot ; renvoie le bas
function storyBlancVoix(ctx, y, liste, { x = BLANC.marge, largeur = ctx.canvas.width - 2 * BLANC.marge, hauteur = 230, taille = 120 } = {}){
  const n = liste.length, w = largeur / n, fr = v => String(v ?? 0).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  let tn = taille; for(const [, v] of liste){ ctx.font = `600 ${tn}px "Newsreader"`; while(tn > 36 && ctx.measureText(fr(v)).width > w - 40){ tn -= 2; ctx.font = `600 ${tn}px "Newsreader"`; } }
  storyBlancFilet(ctx, y, { x, largeur, epais: 4, couleur: BLANC.encre });
  liste.forEach(([nom, v, type], i) => {
    const cx = x + i * w + w / 2, c = BLANC_VOIX[type] || BLANC.encre;
    if(i) storyBlancFilet(ctx, y + 24, { x: x + i * w - 1, largeur: 2, epais: hauteur - 48 });
    ctx.font = `600 ${tn}px "Newsreader"`; ctx.fillStyle = c; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"; ctx.fillText(fr(v), cx, y + 28 + tn * 0.82);
    ctx.font = `800 22px "Public Sans"`; ctx.letterSpacing = "2px"; const lw = ctx.measureText(nom.toUpperCase()).width; ctx.letterSpacing = "0px";
    const yl = y + 28 + tn * 0.82 + 46, gx = cx - (lw + 34) / 2;
    storyBlancRepere(ctx, type, gx + 11, yl - 8, 22, c);
    storyBlancCaps(ctx, nom, gx + 34, yl - 19, { taille: 22, couleur: BLANC.encre, ls: 2 });
    ctx.textAlign = "left";
  });
  return y + hauteur;
}
// Barre pleine sur piste grise (aucun arrondi) ; `part` entre 0 et 1
function storyBlancBarre(ctx, x, y, largeur, hauteur, part, couleur, { piste = BLANC.fondDoux, debut = 0 } = {}){
  ctx.fillStyle = piste; ctx.fillRect(x, y, largeur, hauteur);
  const p0 = Math.max(0, Math.min(1, debut)), p1 = Math.max(p0, Math.min(1, part));
  ctx.fillStyle = couleur; ctx.fillRect(x + largeur * p0, y, Math.max(2, largeur * (p1 - p0)), hauteur);
}
// Barre empilée [valeur, couleur] sur toute la largeur, séparée par 3 px de blanc
function storyBlancBarreEmpilee(ctx, x, y, largeur, hauteur, segments, total){
  ctx.fillStyle = BLANC.fondDoux; ctx.fillRect(x, y, largeur, hauteur); let cx = x;
  for(const [v, c] of segments){ if(!v) continue; const w = v / total * largeur; ctx.fillStyle = c; ctx.fillRect(cx, y, Math.max(1, w - 3), hauteur); cx += w; }
}
// Image (logo, portrait) contenue dans un cadre sur FOND BLANC ; renvoie le rectangle dessiné
function storyBlancLogo(ctx, img, x, y, w, h, { align = "center" } = {}){
  const k = Math.min(w / img.naturalWidth, h / img.naturalHeight), iw = img.naturalWidth * k, ih = img.naturalHeight * k;
  const dx = align === "left" ? x : align === "right" ? x + w - iw : x + (w - iw) / 2;
  ctx.drawImage(img, dx, y + (h - ih) / 2, iw, ih);
  return { x: dx, y: y + (h - ih) / 2, w: iw, h: ih };
}
// Portrait carré sur blanc (photo recadrée sur le visage, liseré de la couleur du parti dessous) ; sans photo, initiales sur la couleur du parti
function storyBlancPortrait(ctx, img, x, y, t, couleur, nom){
  const e = Math.max(4, Math.round(t * 0.06));
  if(img){ const z = storyPPhoto(ctx, img, x, y, t, t, { centre: false }); ctx.fillStyle = couleur; ctx.fillRect(z.x, z.y + z.h, z.w, e); return { x: z.x, y: z.y, w: z.w, h: z.h + e }; } // renvoie le rectangle occupé (la photo n'est jamais agrandie au-delà de sa définition)
  ctx.fillStyle = couleur; ctx.fillRect(x, y, t, t);
  ctx.font = `700 ${Math.round(t * 0.4)}px "Public Sans"`; ctx.fillStyle = storyLuminance(couleur) > 0.45 ? BLANC.encre : "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(storyPInitiales(nom), x + t / 2, y + t / 2 + 2); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  return { x, y, w: t, h: t };
}
// Coche carrée pleine (puce de liste)
function storyBlancPuce(ctx, x, y, t = 14, couleur = BLANC.rouge){ ctx.fillStyle = couleur; ctx.fillRect(x, y, t, t); }
// Contour rectangulaire fin autour d'un texte court (« étiquette ») ; renvoie le bord droit
function storyBlancEtiquette(ctx, texte, x, y, { taille = 24, couleur = BLANC.encre, ls = 2, pad = 16, plein = false } = {}){
  const t = String(texte || "").toUpperCase(); ctx.font = `800 ${taille}px "Public Sans"`; ctx.letterSpacing = ls + "px";
  const w = ctx.measureText(t).width + 2 * pad - ls, h = taille * 1.9;
  if(plein){ ctx.fillStyle = couleur; ctx.fillRect(x, y, w, h); } else { ctx.strokeStyle = couleur; ctx.lineWidth = 3; ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3); }
  ctx.fillStyle = plein ? BLANC.papier : couleur; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(t, x + pad, y + h / 2 + 1);
  ctx.letterSpacing = "0px"; ctx.textBaseline = "alphabetic";
  return x + w;
}
// Triangle de tendance (hausse / baisse)
function storyBlancTendance(ctx, hausse, cx, cy, t, couleur){
  ctx.fillStyle = couleur; ctx.beginPath();
  if(hausse){ ctx.moveTo(cx - t / 2, cy + t * 0.4); ctx.lineTo(cx + t / 2, cy + t * 0.4); ctx.lineTo(cx, cy - t * 0.5); }
  else { ctx.moveTo(cx - t / 2, cy - t * 0.4); ctx.lineTo(cx + t / 2, cy - t * 0.4); ctx.lineTo(cx, cy + t * 0.5); }
  ctx.closePath(); ctx.fill();
}
// Couleur de parti lisible sur blanc (assombrie si besoin)
function storyBlancLisible(couleur){ return storyLisible(couleur); }
