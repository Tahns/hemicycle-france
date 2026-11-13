/* Module chargé à la demande (voir la fin de js/stories.js) : images Instagram 100 % VECTORIELLES.
   Chaque image est d'abord écrite en SVG (formes, textes, police Public Sans embarquée : rien n'est un « dessin de pixels »),
   puis exportée en JPEG 1080 px pour Instagram. Le SVG lui-même est renvoyé (champ `svg`) : net à toute taille, léger, imprimable.
   UNE SEULE charte, volontairement simple : fond clair, gros texte noir très lisible, une couleur par rubrique, un mot par idée.
   Aucun avis : les faits et la source. */
(() => {
const FAM = "Public Sans";
const L = 1080;
const MARGE = 80, LARG = L - 2 * MARGE;
const ENCRE = "#10192E", DOUX = "#3B4559", PALE = "#5A6478", FOND = "#FBF9F4", FILET = "#D9D4C7", BLANC = "#FFFFFF";
const BLEU = "#1D3F9A", ROUGE = "#C8102E";
// Couleur d'accent par rubrique (toutes ≥ 4,5:1 sur le fond clair comme texte, ou utilisées avec du texte blanc)
const ACCENTS = { politique:"#1D3F9A", assemblee:"#1D3F9A", senat:"#8A1538", budget:"#1F6B45", economie:"#1F6B45", justice:"#6B3FA0", international:"#0B6578", europe:"#0B4FA0", social:"#B24A00", ecologie:"#1F6B45", securite:"#8A1538", direct:"#C8102E", sondage:"#6B3FA0", defaut:"#1D3F9A" };
const accent = c => ACCENTS[c] || (/^#[0-9a-f]{6}$/i.test(c || "") ? c : ACCENTS.defaut);

const esc = t => String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const typo = t => String(t == null ? "" : t).replace(/\s+/g, " ").trim().replace(/(\p{L})'(\p{L})/gu, "$1’$2");
const nf = n => String(n == null ? 0 : n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const maj = t => { t = String(t || ""); return t.charAt(0).toUpperCase() + t.slice(1); };

/* ---------- Mesure du texte (même police que le rendu final) ---------- */
let _m = null;
function mesure(txt, poids, taille){
  if(!_m) _m = document.createElement("canvas").getContext("2d");
  _m.font = `${poids} ${taille}px "${FAM}"`;
  return _m.measureText(txt).width;
}
// Retour à la ligne : renvoie au plus `max` lignes ; si le texte est trop long, la dernière finit par « … » (jamais sur un mot faible)
function lignes(txt, poids, taille, larg, max = 99, equilibre = false){
  const r = lignesBrut(txt, poids, taille, larg, max);
  if(!equilibre || r.coupe || r.l.length < 2) return r;
  // rag équilibré : la plus petite largeur qui garde le même nombre de lignes (plus de mot orphelin sur la dernière)
  let lo = larg * 0.55, hi = larg, best = r;
  for(let i = 0; i < 9; i++){
    const mid = (lo + hi) / 2, t = lignesBrut(txt, poids, taille, mid, max);
    if(!t.coupe && t.l.length === r.l.length){ best = t; hi = mid; } else lo = mid;
  }
  return best;
}
function lignesBrut(txt, poids, taille, larg, max = 99){
  const mots = typo(txt).split(" ").filter(Boolean), out = [];
  let cur = "";
  for(const m of mots){
    const t = cur ? cur + " " + m : m;
    if(!cur || mesure(t, poids, taille) <= larg) cur = t; else { out.push(cur); cur = m; }
  }
  if(cur) out.push(cur);
  if(out.length <= max) return { l: out, coupe: false };
  let dern = out.slice(max - 1).join(" ");
  while(dern.length > 1 && mesure(dern + "…", poids, taille) > larg) dern = dern.slice(0, -1).trimEnd();
  dern = dern.replace(/\s+(?:de|du|des|la|le|les|l’|d’|un|une|au|aux|à|en|et|ou|que|qui|pour|par|sur|dans|avec)$/i, "");
  return { l: [...out.slice(0, max - 1), dern + "…"], coupe: true };
}

/* ---------- Briques SVG ---------- */
const txtSvg = (t, x, y, { taille = 40, poids = 500, couleur = ENCRE, ancre = "start", ls = 0 } = {}) =>
  `<text x="${x}" y="${y}" font-family="${FAM}" font-size="${taille}" font-weight="${poids}" fill="${couleur}" text-anchor="${ancre}"${ls ? ` letter-spacing="${ls}"` : ""}>${esc(t)}</text>`;
// Paragraphe : renvoie { svg, h }. `y` = haut du bloc
function para(txt, x, y, { taille = 40, poids = 500, couleur = ENCRE, larg = LARG, max = 99, inter = 1.28, ls = 0, eq = false, entier = false, min = 30, phrases = false } = {}){
  if(phrases && lignes(txt, poids, taille, larg, max).coupe){ // trop long : on garde les phrases entières qui tiennent plutôt qu'une coupe au milieu
    const ph = typo(txt).match(/[^.!?]+[.!?]+(?:\s|$)/g) || [];
    let ok = "";
    for(const f of ph){ const t = (ok + f).trim(); if(lignes(t, poids, taille, larg, max).coupe) break; ok = t + " "; }
    if(ok.trim()) txt = ok.trim();
  }
  if(entier) while(taille > min && lignes(txt, poids, taille, larg, max).coupe) taille -= 2; // un titre n'est jamais coupé : on réduit d'abord la taille
  const r = lignes(txt, poids, taille, larg, max, eq), pas = Math.round(taille * inter);
  const svg = r.l.map((s, i) => txtSvg(s, x, y + Math.round(taille * 0.92) + i * pas, { taille, poids, couleur, ls })).join("");
  return { svg, h: r.l.length * pas, n: r.l.length };
}
// Logo : trois arcs concentriques (hémicycle) et un point
function logo(x, y, s = 64, couleur = BLEU){
  const c = s / 2, arc = (r, e) => `<path d="M ${c - r} ${s * 0.78} A ${r} ${r} 0 0 1 ${c + r} ${s * 0.78}" fill="none" stroke="${couleur}" stroke-width="${e}" stroke-linecap="round" opacity="${r > c * 0.8 ? 0.35 : r > c * 0.45 ? 0.65 : 1}"/>`;
  return `<g transform="translate(${x} ${y})">${arc(s * 0.46, s * 0.1)}${arc(s * 0.3, s * 0.1)}<circle cx="${c}" cy="${s * 0.74}" r="${s * 0.09}" fill="${couleur}"/></g>`;
}
// Grand hémicycle stylisé, très pâle, en bas à droite : remplit le vide sans gêner la lecture (forme vectorielle pure)
const decor = (col, H) => { const cx = L - 40, cy = H - 120; return [620, 500, 380, 260].map((r, i) => `<path d="M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}" fill="none" stroke="${col}" stroke-width="${i % 2 ? 26 : 44}" opacity="${0.045 + i * 0.01}"/>`).join(""); };
const bandeauTricolore = () => `<rect x="0" y="0" width="${L / 3}" height="14" fill="#1D3F9A"/><rect x="${L / 3}" y="0" width="${L / 3}" height="14" fill="#FFFFFF"/><rect x="${2 * L / 3}" y="0" width="${L / 3}" height="14" fill="#C8102E"/><rect x="0" y="14" width="${L}" height="2" fill="${FILET}"/>`;
// Pastille (étiquette) : renvoie { svg, w }
function pastille(txt, x, y, { fond = BLEU, texte = BLANC, taille = 30 } = {}){
  const t = typo(txt).toUpperCase(), w = Math.ceil(mesure(t, 800, taille) + t.length * 3 + 44), h = taille + 28;
  return { svg: `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${fond}"/>${txtSvg(t, x + 22, y + h / 2 + taille * 0.35, { taille, poids: 800, couleur: texte, ls: 3 })}`, w, h };
}
const coche = (x, y, c, r = 22) => `<path d="M ${x - r * 0.45} ${y} l ${r * 0.35} ${r * 0.4} l ${r * 0.65} ${-r * 0.8}" fill="none" stroke="${c}" stroke-width="${r * 0.28}" stroke-linecap="round" stroke-linejoin="round"/>`;
const croix = (x, y, c, r = 22) => `<path d="M ${x - r * 0.4} ${y - r * 0.4} L ${x + r * 0.4} ${y + r * 0.4} M ${x + r * 0.4} ${y - r * 0.4} L ${x - r * 0.4} ${y + r * 0.4}" fill="none" stroke="${c}" stroke-width="${r * 0.28}" stroke-linecap="round"/>`;

/* ---------- Mise en page : une colonne, du haut vers le bas ----------
   `blocs` : liste de blocs dessinés dans l'ordre. La taille du texte est la plus grande pour laquelle tout tient (`k` de 1,3 à 0,6). */
const VERT = "#1F6B45", ROUGEV = "#B8261E", AMBRE = "#8A5F00";
function bloc(b, x, y, k){ // renvoie { svg, h } ; y = haut
  const S = n => Math.round(n * k);
  switch(b.t){
    case "titre": { const o = { taille: S(b.taille || 84), poids: 800, couleur: ENCRE, max: (b.max || 5) + 2, inter: 1.08, ls: -1, eq: true, entier: true, min: 34 }; const p = para(b.txt, x, y, o); return { svg: p.svg, h: p.h + S(22) }; }
    case "p": { const p = para(b.txt, x, y, { taille: S(b.taille || 42), poids: b.poids || 500, couleur: b.couleur || DOUX, max: b.max || 6, larg: b.larg || LARG, phrases: Boolean(b.phrases) }); return { svg: p.svg, h: p.h + S(b.espace == null ? 22 : b.espace) }; }
    case "hero": { // grand nombre + légende
      let t = S(b.taille || 230); while(t > 70 && mesure(b.txt, 900, t) > LARG) t -= 6;
      const svg = txtSvg(b.txt, x - 6, y + Math.round(t * 0.82), { taille: t, poids: 900, couleur: b.couleur || BLEU, ls: -t * 0.03 });
      let h = Math.round(t * 1.02) + S(10), s2 = "";
      if(b.sous){ const p = para(b.sous, x, y + h, { taille: S(44), poids: 700, couleur: ENCRE, max: 3 }); s2 = p.svg; h += p.h + S(12); }
      return { svg: svg + s2, h };
    }
    case "li": { // liste à puces rondes
      let yy = y, svg = "";
      for(const it of b.items){
        const o = { taille: S(b.taille || 40), poids: 500, couleur: ENCRE, larg: LARG - 56, max: b.max || 4, inter: 1.25 };
        const p = para(it, x + 56, yy, o);
        svg += `<circle cx="${x + 16}" cy="${yy + Math.round(o.taille * 0.62)}" r="${S(10)}" fill="${b.couleur || BLEU}"/>` + p.svg; yy += p.h + S(24);
      }
      return { svg, h: yy - y };
    }
    case "carte": { // citation sur carte blanche avec filet coloré
      const o = { taille: S(b.taille || 40), poids: 600, couleur: ENCRE, larg: LARG - 70, max: b.max || 6, inter: 1.3 };
      const p = para(b.txt, x + 46, y + S(30), o), h = p.h + S(60);
      return { svg: `<rect x="${x}" y="${y}" width="${LARG}" height="${h}" rx="22" fill="${BLANC}" stroke="${FILET}" stroke-width="2"/><rect x="${x}" y="${y}" width="12" height="${h}" rx="6" fill="${b.couleur || BLEU}"/>` + p.svg, h: h + S(24) };
    }
    case "ligne": return { svg: `<rect x="${x}" y="${y + 6}" width="120" height="8" rx="4" fill="${b.couleur || BLEU}"/>`, h: 40 };
    case "kv": { // tableau libellé / valeur
      let yy = y, svg = "";
      for(const [kk, v] of b.rows){
        const t = S(40), tv = S(46);
        svg += `<rect x="${x}" y="${yy}" width="${LARG}" height="2" fill="${FILET}"/>`;
        svg += txtSvg(v, x + LARG, yy + t + S(24), { taille: tv, poids: 900, couleur: b.couleur || ENCRE, ancre: "end" });
        const p = para(kk, x, yy + S(16), { taille: t, poids: 500, couleur: DOUX, larg: LARG - mesure(String(v), 900, tv) - 30, max: 2, inter: 1.15 });
        svg += p.svg; yy += Math.max(p.h, t) + S(44);
      }
      return { svg, h: yy - y + S(6) };
    }
    case "voix": { // Pour / Contre / Abstentions : une barre proportionnelle + trois lignes lisibles
      const tot = Math.max(1, b.pour + b.contre + b.abst), S2 = S(1);
      const parts = [["Ont voté pour", b.pour, VERT], ["Ont voté contre", b.contre, ROUGEV], ["Se sont abstenus", b.abst, AMBRE]];
      let svg = "", xx = x; const hb = S(44);
      svg += `<clipPath id="cb"><rect x="${x}" y="${y}" width="${LARG}" height="${hb}" rx="${hb / 2}"/></clipPath><g clip-path="url(#cb)">`;
      for(const [, n, c] of parts){ const w = LARG * n / tot; if(w > 0) svg += `<rect x="${xx}" y="${y}" width="${w}" height="${hb}" fill="${c}"/>`; xx += w; }
      svg += `</g>`;
      let yy = y + hb + S(34);
      for(const [nom, n, c] of parts){
        svg += `<rect x="${x}" y="${yy}" width="${S(28)}" height="${S(28)}" rx="6" fill="${c}"/>`;
        svg += txtSvg(nom, x + S(48), yy + S(26), { taille: S(34), poids: 600, couleur: DOUX });
        svg += txtSvg(nf(n), x + LARG, yy + S(30), { taille: S(46), poids: 900, couleur: c, ancre: "end" });
        yy += S(66);
      }
      return { svg, h: yy - y + S(6) };
    }
    case "espace": return { svg: "", h: S(b.h || 20) };
    default: return { svg: "", h: 0 };
  }
}

// Assemble une image complète. `o` : { H, kicker, couleur, n, total, blocs, source, cta, pastilleFond }
function image(o){
  const H = o.H, post = H < 1500, haut = post ? 70 : 250, basFooter = post ? H - 70 : H - 250;
  const col = accent(o.couleur);
  const yLogo = haut, yKick = yLogo + 108;
  let svg = `<rect width="${L}" height="${H}" fill="${FOND}"/>${bandeauTricolore()}`;
  svg += decor(col, H) + logo(MARGE, yLogo, 64, col) + txtSvg("Hémicycle France", MARGE + 82, yLogo + 44, { taille: 38, poids: 800, couleur: ENCRE });
  if(o.total > 1) svg += txtSvg(`${o.n}/${o.total}`, L - MARGE, yLogo + 44, { taille: 36, poids: 800, couleur: PALE, ancre: "end" });
  const p = pastille(o.kicker || "Actualité", MARGE, yKick, { fond: col });
  svg += p.svg;
  const yDebut = yKick + p.h + 44;
  // pied : source (petit, mais lisible) + appel
  const src = o.source ? lignes(o.source, 500, 26, LARG, 2) : { l: [] };
  const cta = typo(o.cta || "Toute l'actu politique") + " → @hemicyclefrance";
  const yCta = basFooter, yFiletPied = yCta - 74 - src.l.length * 34;
  const dispo = yFiletPied - 30 - yDebut;
  // le texte prend la plus grande taille qui tient
  let choix = null;
  for(let k = post ? 1.3 : 1.6; k >= 0.55; k -= 0.05){
    let y = 0, s = "";
    for(const b of o.blocs){ const r = bloc(b, MARGE, yDebut + y, k); s += r.svg; y += r.h; }
    if(y <= dispo || k < 0.56){ choix = { s, y, k }; break; }
  }
  // contenu court : on le descend un peu pour ne pas laisser un grand vide en bas
  const decal = Math.max(0, Math.min(post ? 80 : 220, Math.round((dispo - choix.y) / (post ? 4 : 2.5))));
  svg += `<g transform="translate(0 ${decal})">${choix.s}</g>`;
  svg += `<rect x="${MARGE}" y="${yFiletPied}" width="${LARG}" height="2" fill="${FILET}"/>`;
  src.l.forEach((t, i) => { svg += txtSvg(t, MARGE, yFiletPied + 44 + i * 34, { taille: 26, poids: 500, couleur: PALE }); });
  svg += txtSvg(cta, MARGE, yCta, { taille: 34, poids: 800, couleur: col });
  return { svg, H, k: choix.k };
}


/* ---------- Mise en page « photo » (style presse) : photo plein cadre, dégradé sombre, gros titre blanc, mot-clé en jaune ----------
   `o` : { H, photo: { img, credit }, kicker, couleur, titre, sous, n, total, source, cta } */
const JAUNE = "#FFD60A";
function photoUrl(img){
  const c = document.createElement("canvas"), k = Math.min(1, 1500 / Math.max(img.naturalWidth, img.naturalHeight));
  c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.86);
}
function imagePhoto(o){
  const H = o.H, post = H < 1500, col = accent(o.couleur);
  const haut = post ? 70 : 250, bas = post ? H - 70 : H - 250;
  let svg = `<defs><linearGradient id="gd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0A0F1E" stop-opacity="0.82"/><stop offset="0.16" stop-color="#0A0F1E" stop-opacity="0.5"/><stop offset="0.32" stop-color="#0A0F1E" stop-opacity="0.08"/><stop offset="0.5" stop-color="#0A0F1E" stop-opacity="0.72"/><stop offset="1" stop-color="#0A0F1E" stop-opacity="0.97"/></linearGradient></defs>`;
  const im = o.photo.img, r = Math.max(L / im.naturalWidth, H / im.naturalHeight);
  svg += `<rect width="${L}" height="${H}" fill="#0A0F1E"/><image href="${photoUrl(im)}" x="${(L - im.naturalWidth * r) / 2}" y="${(H - im.naturalHeight * r) / 2}" width="${im.naturalWidth * r}" height="${im.naturalHeight * r}" preserveAspectRatio="none"/><rect width="${L}" height="${H}" fill="url(#gd)"/>`;
  svg += bandeauTricolore();
  svg += logo(MARGE, haut, 64, BLANC) + txtSvg("Hémicycle France", MARGE + 82, haut + 44, { taille: 38, poids: 800, couleur: BLANC });
  if(o.total > 1) svg += txtSvg(`${o.n}/${o.total}`, L - MARGE, haut + 44, { taille: 36, poids: 800, couleur: "#E6E9F2", ancre: "end" });
  // pied : crédit, appel
  const yCta = bas, yCred = yCta - 66;
  const cta = typo(o.cta || "Toute l'actu politique") + " → @hemicyclefrance";
  svg += txtSvg(cta, MARGE, yCta, { taille: 34, poids: 800, couleur: JAUNE });
  const cred = [o.source, o.photo.credit ? "Photo d'illustration : " + o.photo.credit.replace(/^Photo : /, "") : "Photo d'illustration"].filter(Boolean).join(" · ");
  const lc = lignes(cred, 500, 24, LARG, 2);
  lc.l.forEach((t, i) => { svg += txtSvg(t, MARGE, yCred - (lc.l.length - 1 - i) * 30, { taille: 24, poids: 500, couleur: "#C9CFDD" }); });
  const yBasTexte = yCred - lc.l.length * 30 - 44;
  // titre + sous-titre, calés en bas, plus grande taille qui tient
  const hMax = (post ? 760 : 1060);
  let k = post ? 1.2 : 1.5, t = null;
  for(; k >= 0.6; k -= 0.05){
    const tt = Math.round(86 * k), so = Math.round(40 * k);
    const pt = para(o.titre, MARGE, 0, { taille: tt, poids: 900, couleur: BLANC, max: 8, inter: 1.06, ls: -1, eq: true, entier: true, min: 44 });
    const ps = o.sous ? para(o.sous, MARGE, 0, { taille: so, poids: 500, couleur: "#E6E9F2", max: 4, inter: 1.28, phrases: true }) : { h: 0, n: 0 };
    const h = 66 + 34 + pt.h + (o.sous ? 26 + 8 + ps.h : 0);
    if(h <= hMax || k < 0.61){ t = { tt, so, h }; break; }
  }
  const y0 = yBasTexte - t.h;
  const pas = pastille(o.kicker || "Actualité", MARGE, y0, { fond: col });
  svg += pas.svg;
  let y = y0 + pas.h + 34;
  const pt = para(o.titre, MARGE, y, { taille: t.tt, poids: 900, couleur: BLANC, max: 8, inter: 1.06, ls: -1, eq: true, entier: true, min: 44 });
  svg += pt.svg; y += pt.h;
  svg += `<rect x="${MARGE}" y="${y + 10}" width="120" height="8" rx="4" fill="${JAUNE}"/>`;
  if(o.sous){ y += 26 + 8; svg += para(o.sous, MARGE, y + 8, { taille: t.so, poids: 500, couleur: "#E6E9F2", max: 4, inter: 1.28, phrases: true }).svg; }
  return { svg, H };
}

/* ---------- Export : SVG (police embarquée) -> JPEG ---------- */
let _polices = null;
async function css(){
  if(_polices) return _polices;
  const b64 = async f => { const r = await fetch("fonts/" + f); const buf = new Uint8Array(await r.arrayBuffer()); let s = ""; for(let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000)); return btoa(s); };
  const [lat, ext] = await Promise.all([b64("public-sans-normal-latin.woff2"), b64("public-sans-normal-latin-ext.woff2")]);
  _polices = `@font-face{font-family:"${FAM}";font-weight:100 900;src:url(data:font/woff2;base64,${ext}) format("woff2");unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF}@font-face{font-family:"${FAM}";font-weight:100 900;src:url(data:font/woff2;base64,${lat}) format("woff2");unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}`;
  return _polices;
}
async function exporter(img, nom, alt){
  await Promise.all([300, 500, 600, 700, 800, 900].map(w => document.fonts.load(`${w} 40px "${FAM}"`).catch(() => {})));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${img.H}" viewBox="0 0 ${L} ${img.H}" role="img" aria-label="${esc(alt || nom)}"><style>${await css()}</style>${img.svg}</svg>`;
  const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  const im = new Image(); im.decoding = "sync";
  await new Promise((ok, ko) => { im.onload = ok; im.onerror = () => ko(new Error("SVG illisible")); im.src = url; });
  const c = document.createElement("canvas"); c.width = L; c.height = img.H;
  const ctx = c.getContext("2d"); ctx.fillStyle = FOND; ctx.fillRect(0, 0, L, img.H); ctx.drawImage(im, 0, 0, L, img.H);
  const blob = await new Promise(r => c.toBlob(r, "image/png"));
  return { blob, apercu: c.toDataURL("image/jpeg", 0.92), nom: nom + ".png", svg };
}

/* ---------- Un modèle par type ---------- */
const H_S = 1920, H_P = 1350;
const MODELES = {};

// Actualité : un sujet du relevé de presse
MODELES.actualite = async (info) => {
  const [ind, force] = String(info ?? "").split(":");
  const s = typeof ACTUALITES !== "undefined" && ACTUALITES?.sujets?.[Number(ind)];
  if(!s || s.sensible) return null; // sujets sensibles : dessin prudent d'origine
  const d = await storySpecSujet(s);
  if(!d) return null;
  const medias = (Array.isArray(s.sources) && s.sources.length ? s.sources : [...new Set(s.articles.map(a => a.media))]).filter(Boolean), n = medias.length;
  const direct = force === "direct" || (typeof enDirectDe === "function" && enDirectDe(s));
  const quand0 = typeof storyJourFr === "function" && (s.derniere || s.articles[0].date) ? `Mis à jour le ${storyJourFr(s.derniere || s.articles[0].date)}.` : "";
  if(d.photo && !window.STORY_SANS_PHOTO) return imagePhoto({ H: H_S, photo: d.photo, kicker: direct ? "En direct" : d.categorie, couleur: direct ? "direct" : d.theme, titre: d.accroche, sous: d.essentiel, source: [n >= 2 ? `${n} médias en parlent` : `Raconté par ${medias[0]}`, quand0.replace(/\.$/, "")].filter(Boolean).join(" · "), cta: "Suivez l'actu avec nous" });
  const blocs = [{ t: "titre", txt: d.accroche, taille: 84, max: 6 }, { t: "ligne", couleur: accent(direct ? "direct" : d.theme) }];
  if(d.chiffre && s.chiffre?.valeur) blocs.push({ t: "hero", txt: d.chiffre.valeur, sous: d.chiffre.legende, couleur: accent(d.theme), taille: 190 });
  if(d.essentiel) blocs.push({ t: "p", txt: d.essentiel, taille: 44, max: 5, phrases: true });
  blocs.push({ t: "p", txt: n >= 2 ? `À lire chez ${medias.slice(0, 4).join(", ")}${n > 4 ? " et d'autres" : ""}.` : `À lire chez ${medias[0]}.`, taille: 34, poids: 700, couleur: PALE, max: 3 });
  const a0 = s.articles[0], quand = typeof storyJourFr === "function" && (s.derniere || a0.date) ? `Mis à jour le ${storyJourFr(s.derniere || a0.date)}.` : "";
  return image({ H: H_S, kicker: direct ? "En direct" : d.categorie, couleur: direct ? "direct" : d.theme, blocs, source: ["D'après la presse, sources citées", quand.replace(/\.$/, "").replace(/^Mis à jour/, "mis à jour")].filter(Boolean).join(" · "), cta: "Suivez l'actu avec nous" });
};

// Post « date à retenir » / « loi » / « presse »
MODELES.post = async (s) => {
  if(!s || !["date", "loi", "presse"].includes(s.genre) || !s.titre) return null;
  if(s.genre === "date"){
    const blocs = [{ t: "hero", txt: `${s.jour} ${maj(s.mois || "")}`.trim(), sous: s.annee ? `${s.semaine || ""} ${s.annee}`.trim() : s.semaine || "", couleur: BLEU, taille: 180 }, { t: "titre", txt: s.titre, taille: 64, max: 4 }];
    if(s.citation) blocs.push({ t: "carte", txt: `« ${typo(s.citation)} »`, taille: 36, max: 5 });
    return image({ H: H_P, kicker: "À noter dans l'agenda", couleur: "politique", blocs, source: s.media ? `Annoncé par ${s.media}${s.agenda ? " · agenda officiel" : " · pensez à vérifier la date à la source"}` : "Date annoncée par la presse", cta: "Gardez-la en tête" });
  }
  if(s.genre === "presse"){
    const blocs = [{ t: "titre", txt: s.titre, taille: 64, max: 4 }, { t: "carte", txt: `« ${typo(s.citation || "")} »`, taille: 38, max: 6 }];
    return image({ H: H_P, kicker: s.surtitre || "Ce que dit la presse", couleur: "politique", blocs, source: s.sourceTxt || (s.media ? `Titre cité de ${s.media}.` : ""), cta: "Toute l'actu politique" });
  }
  const adopte = s.verdict === "adopte", c = adopte ? VERT : ROUGEV;
  const blocs = [
    { t: "hero", txt: adopte ? "Adopté" : "Rejeté", couleur: c, taille: 150 },
    { t: "titre", txt: s.titreSimple || s.titre, taille: 54, max: 4 },
  ];
  if(s.etapeSimple || s.etape) blocs.push({ t: "p", txt: maj(s.etapeSimple || s.etape), taille: 32, poids: 600, couleur: PALE, max: 2 });
  blocs.push({ t: "voix", pour: s.pour || 0, contre: s.contre || 0, abst: s.abst || 0 });
  return image({ H: H_P, kicker: `${s.chambre || "Parlement"} · ${s.date || ""}`.replace(/ · $/, ""), couleur: /s[ée]nat/i.test(s.chambre || "") ? "senat" : "assemblee", blocs, source: s.sourceTxt || "Source officielle.", cta: "Retrouvez tous les votes" });
};

// Story qui annonce un post
MODELES["annonce-post"] = async (s) => {
  if(!s || !s.titre) return null;
  const blocs = [{ t: "titre", txt: s.titre, taille: 76, max: 4 }];
  if(s.sous) blocs.push({ t: "p", txt: s.sous, taille: 40, poids: 700, max: 2 });
  const im = image({ H: H_S, kicker: "Nouveau post", couleur: "politique", blocs, source: "Le post vient d'être publié sur notre fil", cta: "À voir sur notre fil" });
  if(s.miniature){ // la miniature (JPEG) est le seul élément « image » : elle est insérée telle quelle, avec un cadre
    const w = 400, h = 500, x = (L - w) / 2, y = H_S - 250 - 74 - 34 - 60 - h;
    im.svg += `<rect x="${x - 10}" y="${y - 10}" width="${w + 20}" height="${h + 20}" rx="14" fill="${BLANC}" stroke="${FILET}" stroke-width="3"/><image href="${esc(s.miniature)}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"/>`;
  }
  return im;
};

// Image de carrousel
MODELES.diapo = async (s) => {
  if(!s || !s.titre || !Array.isArray(s.corps)) return null;
  const blocs = [{ t: "titre", txt: s.titre, taille: s.couverture ? 78 : 62, max: s.couverture ? 5 : 3 }];
  for(const b of s.corps){
    if(b.p) blocs.push({ t: "p", txt: b.p, taille: b.taille ? Math.min(b.taille + 6, 44) : 40, poids: b.poids || 500, couleur: b.couleur === "ciel" ? PALE : DOUX, max: b.max || 5 });
    else if(b.li) blocs.push({ t: "li", items: b.li, taille: 38, max: 4 });
    else if(b.carte) blocs.push({ t: "carte", txt: b.carte, taille: 38, max: 6 });
    else if(b.gros) blocs.push({ t: "hero", txt: b.gros, couleur: /rejet/i.test(b.gros) ? ROUGEV : /adopt/i.test(b.gros) ? VERT : BLEU, taille: 150 });
    else if(b.cases){ const g = n => Number(String(b.cases.find(c => new RegExp("^" + n, "i").test(c[0]))?.[1] ?? 0)) || 0; blocs.push({ t: "voix", pour: g("Pour"), contre: g("Contre"), abst: g("Ni") || g("Abst") }); }
    else if(b.kv) blocs.push({ t: "kv", rows: b.kv.map(([k, v]) => [typo(k), typo(v)]) });
  }
  if(s.couverture && !window.STORY_SANS_PHOTO){
    const ph = await storyPhotoTheme(/s[ée]nat/i.test(`${s.titre} ${s.source || ""}`) ? "senat" : "assemblee").catch(() => null);
    if(ph) return imagePhoto({ H: H_P, photo: ph, kicker: s.kicker || "Hémicycle France", couleur: "assemblee", titre: s.titre, sous: (s.corps.find(b => b.p) || {}).p || "", n: s.n, total: s.total, source: s.source || "", cta: "Glissez pour la suite" });
  }
  return image({ H: H_P, kicker: s.kicker || "Hémicycle France", couleur: s.couverture ? "direct" : "politique", n: s.n, total: s.total, blocs, source: s.source || "Source : données officielles.", cta: s.accroche || (s.n < s.total ? "Glissez pour la suite" : "À bientôt") });
};

// Aujourd'hui à l'Assemblée
MODELES.aujourdhui = async (s) => {
  if(!s || !Array.isArray(s.points) || !s.points.length) return null;
  const tous = s.points.map(p => typo(p.t));
  let img = null;
  for(let n = tous.length; n >= Math.min(3, tous.length); n--){ // on montre moins de points plutôt que du texte minuscule
    const reste = s.autres + tous.length - n;
    const blocs = [{ t: "titre", txt: "Que se passe-t-il à l'Assemblée aujourd'hui ?", taille: 80, max: 4 }, { t: "p", txt: maj(s.jour), taille: 42, poids: 700, couleur: BLEU }, { t: "li", items: tous.slice(0, n), taille: 38, max: 3 }];
    if(reste > 0) blocs.push({ t: "p", txt: `… et ${reste} autre${reste > 1 ? "s" : ""} sujet${reste > 1 ? "s" : ""} au programme`, taille: 32, poids: 700, couleur: PALE });
    img = image({ H: H_S, kicker: "Aujourd'hui à l'Assemblée", couleur: "assemblee", blocs, source: s.source || "Source : Assemblée nationale, ordre du jour", cta: "Tout l'agenda" });
    if(img.k >= 0.85) break;
  }
  return img;
};

// Le vote du jour (sans hémicycle : le détail par groupe reste dans le modèle « vote-groupes »)
MODELES["vote-jour"] = async (s) => {
  if(!s || !s.objet || !["adopte", "rejete"].includes(s.verdict)) return null;
  const adopte = s.verdict === "adopte";
  const blocs = [{ t: "hero", txt: adopte ? "Adopté" : "Rejeté", couleur: adopte ? VERT : ROUGEV, taille: 200 }, { t: "titre", txt: s.dossier || s.objet, taille: 60, max: 4 }];
  if(s.dossier && s.objet && s.objet !== s.dossier) blocs.push({ t: "p", txt: s.objet, taille: 34, poids: 600, couleur: PALE, max: 3 });
  blocs.push({ t: "voix", pour: s.pour || 0, contre: s.contre || 0, abst: s.abst || 0 });
  return image({ H: H_S, kicker: "Le vote du jour", couleur: "assemblee", blocs, source: s.sourceTxt || "Source : Assemblée nationale. Résultat officiel.", cta: "Et votre député, il a voté quoi ?" });
};

// Comprendre
MODELES.comprendre = async (s) => {
  if(!s || !s.titre || !s.texte) return null;
  const blocs = [{ t: "titre", txt: s.titre, taille: 84, max: 4 }, { t: "ligne", couleur: ACCENTS.social }, { t: "p", txt: s.texte, taille: 46, couleur: ENCRE, max: 12, inter: 1.3 }];
  return image({ H: H_S, kicker: `On vous explique · ${s.n}/${s.total}`, couleur: "social", blocs, source: s.sourceTxt || "", cta: "Une notion simple chaque semaine" });
};

// Le chiffre du jour
MODELES["chiffre-jour"] = async (s) => {
  if(!s || !s.libelle || !s.valeur) return null;
  const blocs = [{ t: "titre", txt: s.libelle, taille: 64, max: 3 }, { t: "hero", txt: typo(s.valeur), sous: [s.soustitre, s.periode].filter(Boolean).map(typo).join(" · "), couleur: VERT, taille: 260 }];
  for(const l of (s.lignes || []).filter(Boolean).slice(0, 3)) blocs.push({ t: "p", txt: l, taille: 38, max: 3 });
  return image({ H: H_S, kicker: "Le chiffre du jour", couleur: "budget", blocs, source: s.sourceTxt || "", cta: "Un chiffre à retenir chaque jour" });
};

window.STORY_VECTO_TYPES = Object.keys(MODELES);
window.dessinerVecto = async (type, info) => {
  const m = MODELES[type];
  if(!m) return null;
  const img = await m(info);
  if(!img) return null;
  return exporter(img, `hemicycle-france-${type}`, `Hémicycle France : ${type}`);
};
})();
