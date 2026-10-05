/* Module chargé à la demande (stories d'actualité) : voir chargerModule() dans index.html.
   Trois types : « le chiffre » (STORY_PLUS.chiffre), « face à face » (STORY_PLUS.facea), « date à retenir » (STORY_PLUS.date).
   Style « bleu question / réponse » : fond bleu, un élément géant, carte crème avec une citation de presse.
   Tout est dans une fonction : aucun nom ne s'ajoute à l'espace global en dehors de STORY_PLUS. */
(() => {
const BLEU = "#1B3A8C", CIEL = "#C9D3FF", CREME = "#F5F1E8", ROUGE = "#C8102E", ROSE = "#FF6B7A", ROSE2 = "#FF8D98", ENCRE = "#1C1B18", PALE = "#625D53", FILET = "#D3CBBA";
const { L, H, marge } = STORY, LARG = L - 2 * marge;
const PUB = '"Public Sans"', NEW = '"Newsreader"';
const fnt = (poids, taille, fam = PUB) => `${poids} ${taille}px ${fam}`;

/* ---------- Outils de texte ---------- */
async function polices(){
  await Promise.all(['900 100px "Public Sans"', '800 30px "Public Sans"', '700 30px "Public Sans"', '600 30px "Public Sans"', '700 60px Newsreader', '600 60px Newsreader']
    .map(f => document.fonts.load(f).catch(() => {})));
}
function ecrire(ctx, txt, x, y, { poids = 700, taille = 30, fam = PUB, couleur = "#fff", align = "left", ls = 0 } = {}){
  ctx.font = fnt(poids, taille, fam); ctx.fillStyle = couleur; ctx.textAlign = align; ctx.textBaseline = "alphabetic";
  ctx.letterSpacing = ls + "px"; ctx.fillText(txt, x, y); ctx.letterSpacing = "0px"; ctx.textAlign = "left";
}
function mesurer(ctx, txt, poids, taille, fam = PUB, ls = 0){
  ctx.font = fnt(poids, taille, fam); ctx.letterSpacing = ls + "px";
  const w = ctx.measureText(txt).width; ctx.letterSpacing = "0px"; return w;
}
function lignes(ctx, txt, poids, taille, fam, largeur, max){
  ctx.font = fnt(poids, taille, fam); ctx.letterSpacing = "0px";
  return storyLignes(ctx, txt, largeur, max);
}
// Plus grande taille (entre tMax et tMin) pour laquelle le texte tient dans la largeur, sur au plus hMax de haut ; sinon tronqué proprement
function ajuster(ctx, texte, { poids = 700, fam = NEW, largeur = LARG, hMax = 300, tMax = 90, tMin = 50, inter = 1.06, max = 99 } = {}){
  for(let t = tMax; t >= tMin; t -= 2){
    const l = lignes(ctx, texte, poids, t, fam, largeur, 99);
    if(l.length <= max && l.length * t * inter <= hMax && l.every(x => ctx.measureText(x).width <= largeur + 1)) return { t, l, h: l.length * t * inter };
  }
  const n = Math.max(1, Math.min(max, Math.floor(hMax / (tMin * inter))));
  const l = lignes(ctx, texte, poids, tMin, fam, largeur, n);
  return { t: tMin, l, h: l.length * tMin * inter };
}
function ecrireLignes(ctx, f, x, yHaut, { poids = 700, fam = NEW, couleur = "#fff", inter = 1.06, align = "left" } = {}){
  f.l.forEach((l, i) => ecrire(ctx, l, x, yHaut + f.t * 0.82 + i * f.t * inter, { poids, taille: f.t, fam, couleur, align }));
}

/* ---------- Données ---------- */
const sujetDe = info => ACTUALITES?.sujets?.[Number(info)] || null;
const rubrique = s => (THEMES_ACTU[s?.illustration?.theme] || THEMES_ACTU.politique)[2];
// Notre titre ; à défaut, un titre de repli neutre (jamais un titre de presse en grand titre)
const titreAffiche = s => (typeof s.titrePropre?.titre === "string" && s.titrePropre.titre.trim()) || `${rubrique(s)} · à la une`;
const mediasDe = s => [...new Set((s.articles || []).map(a => a.media).filter(Boolean))];
const sansAccent = t => String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
// Titre de presse prêt à être cité : sans rubrique en tête, guillemets internes typographiques
function titreCite(t){
  let x = String(t || "").replace(/\s+/g, " ").trim();
  x = x.replace(/^(?:DIRECT|EN DIRECT|En direct)\s*[.:]\s*/, "");
  const m = /^[\p{L}0-9'’ -]{4,32}\.\s+(?=\p{Lu})/u.exec(x);
  if(m && x.length - m[0].length >= 28) x = x.slice(m[0].length);
  x = x.replace(/«\s*([^»]*?)\s*»/g, "“$1”").replace(/"\s*([^"]*?)\s*"/g, "“$1”").replace(/(\p{L})'(\p{L})/gu, "$1’$2").replace(/\s+/g, " ");
  return x.replace(/\.$/, "");
}
// Article cité : celui qui contient le plus de mots-clés, sinon le premier
function articleCite(s, mots){
  const arts = s.articles || [];
  let best = arts[0] || null, sc = 0;
  for(const a of arts){
    const t = sansAccent(a.titre), n = mots.filter(m => m && t.includes(sansAccent(m))).length;
    if(n > sc){ sc = n; best = a; }
  }
  return best;
}
const videoDe = s => (s.articles || []).find(a => a.video)?.media || "";

/* ---------- Éléments communs ---------- */
function fond(ctx, etiquette, { fondEt = ROUGE, couleurEt = "#fff" } = {}){
  ctx.fillStyle = BLEU; ctx.fillRect(0, 0, L, H);
  // marque : arc, point, nom (sous la zone masquée par Instagram)
  const cx = marge + 34, cy = 264;
  ctx.lineWidth = 7; ctx.lineCap = "round";
  ctx.strokeStyle = "#fff"; ctx.beginPath(); ctx.arc(cx, cy, 30, Math.PI, 0); ctx.stroke();
  ctx.strokeStyle = ROSE; ctx.beginPath(); ctx.arc(cx, cy, 15, Math.PI, 0); ctx.stroke();
  ctx.lineCap = "butt"; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(cx, cy, 5, 0, 2 * Math.PI); ctx.fill();
  ecrire(ctx, "Hémicycle France", marge + 86, cy + 12, { poids: 800, taille: 38 });
  // étiquette plate
  ctx.font = fnt(800, 26); ctx.letterSpacing = "4px";
  const txt = storyLignes(ctx, etiquette.toUpperCase(), LARG - 40, 1)[0], w = ctx.measureText(txt).width + 40 - 4;
  ctx.fillStyle = fondEt; ctx.fillRect(marge, 312, w, 52);
  ctx.fillStyle = couleurEt; ctx.textBaseline = "middle"; ctx.fillText(txt, marge + 20, 312 + 27); ctx.textBaseline = "alphabetic"; ctx.letterSpacing = "0px";
  return 364;
}
// Pied discret : ligne « Repris par N médias » (facultative), source en petit, puis le compte. Renvoie l'ordonnée du haut du bloc.
function pied(ctx, { medias = [], source, cta = "Suivre" }){
  const bas = 1580, l = [];
  if(medias.length >= 2){
    const n = medias.length; let k = Math.min(medias.length, 3), t;
    do { t = `Repris par ${n} médias · ${medias.slice(0, k).join(", ")}${k < n ? "…" : ""}`; k--; }
    while(k >= 0 && mesurer(ctx, t, 700, 26) > LARG);
    if(k < 0) t = `Repris par ${n} médias`;
    l.push({ t: [t], taille: 26, poids: 700, couleur: "#fff" });
  }
  const ls = lignes(ctx, source, 600, 23, PUB, LARG, 3);
  l.push({ t: ls, taille: 23, poids: 600, couleur: CIEL });
  let h = 0; for(const b of l) h += b.t.length * Math.round(b.taille * 1.3) + 6;
  let y = bas - h;
  for(const b of l){ b.t.forEach((x, i) => ecrire(ctx, x, marge, y + b.taille + i * Math.round(b.taille * 1.3), { poids: b.poids, taille: b.taille, couleur: b.couleur })); y += b.t.length * Math.round(b.taille * 1.3) + 6; }
  ecrire(ctx, `${cta} → ${COMPTE_STORY}`, L / 2, 1634, { poids: 800, taille: 34, align: "center" });
  return bas - h;
}
// Carte crème : citation de presse, média, contexte, vidéo. Mesure (dessiner = false) ou dessine ; renvoie la hauteur.
function carte(ctx, d, tq, x, y, w, dessiner, { maxQ = 99, tc = 27 } = {}){
  const wi = w - 96, xi = x + 48, lh = tq * 1.26;
  let c = y + 44;
  if(dessiner){ ctx.fillStyle = CREME; ctx.beginPath(); ctx.roundRect(x, y, w, dessiner, 30); ctx.fill(); }
  if(d.citation){
    const lq = lignes(ctx, `« ${d.citation} »`, 700, tq, PUB, wi, maxQ);
    if(dessiner) lq.forEach((l, i) => ecrire(ctx, l, xi, c + tq * 0.95 + i * lh, { poids: 700, taille: tq, couleur: ENCRE }));
    c += lq.length * lh;
    if(d.media){ c += 8; if(dessiner) ecrire(ctx, "— " + d.media, xi, c + 26, { poids: 800, taille: 27, couleur: BLEU }); c += 36; }
    if(d.note){ if(dessiner) ecrire(ctx, d.note, xi, c + 22, { poids: 600, taille: 24, couleur: PALE }); c += 32; }
  }
  if(d.contexte?.length){
    c += 22;
    if(dessiner){ ctx.fillStyle = FILET; ctx.fillRect(xi, c, wi, 2); }
    c += 26;
    if(dessiner) ecrire(ctx, "LE CONTEXTE", xi, c + 18, { poids: 800, taille: 22, couleur: BLEU, ls: 3 });
    c += 34;
    for(const e of d.contexte){
      const lc = lignes(ctx, e.texte, 600, tc, PUB, wi, 3), ih = tc * 1.28;
      if(dessiner) lc.forEach((l, i) => ecrire(ctx, l, xi, c + tc * 0.9 + i * ih, { poids: 600, taille: tc, couleur: ENCRE }));
      c += lc.length * ih;
      if(e.source){
        const src = lignes(ctx, `Source : ${e.source}`, 600, 22, PUB, wi, 1)[0];
        if(dessiner) ecrire(ctx, src, xi, c + 20, { poids: 600, taille: 22, couleur: PALE });
        c += 28;
      }
      c += 8;
    }
  }
  if(d.video){ c += 12; if(dessiner) ecrire(ctx, `▶ Vidéo : ${d.video}`, xi, c + 24, { poids: 800, taille: 26, couleur: BLEU }); c += 34; }
  return c + 36 - y;
}
// Pose la carte, ancrée en bas (bas), dans la hauteur dispo ; choisit la plus grande taille de citation qui tient. Renvoie la hauteur utilisée.
function poserCarte(ctx, d, bas, dispo, opts = {}){
  const sizes = opts.tailles || [40, 38, 36, 34, 32, 30, 28];
  let choix = null;
  for(const tq of sizes){ const h = carte(ctx, d, tq, marge, 0, LARG, false, opts); if(h <= dispo){ choix = { tq, h }; break; } }
  if(!choix){ // dernier recours : citation tronquée proprement
    const tq = sizes[sizes.length - 1];
    for(let m = 3; m >= 1; m--){ const h = carte(ctx, d, tq, marge, 0, LARG, false, { ...opts, maxQ: m }); if(h <= dispo || m === 1){ choix = { tq, h, maxQ: m }; break; } }
  }
  carte(ctx, d, choix.tq, marge, bas - choix.h, LARG, choix.h, { ...opts, maxQ: choix.maxQ || 99 });
  return choix.h;
}
const poserOk = (ctx, d, dispo, opts = {}) => (opts.tailles || [40, 38, 36, 34, 32, 30, 28]).some(tq => carte(ctx, d, tq, marge, 0, LARG, false, opts) <= dispo);

const nomFichier = (pref, s) => `${pref}-${slugDep(titreAffiche(s)).slice(0, 40)}`;
const joursAvant = iso => {
  const auj = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const p = s => { const [a, m, j] = s.split("-").map(Number); return Date.UTC(a, m - 1, j); };
  return Math.round((p(iso) - p(auj)) / 864e5);
};

/* ---------- C. Le chiffre ---------- */
// Chiffre sur une seule ligne : les nombres en très gros, les petits mots (« à », « près de ») en petit et en rose
const jetons = v => String(v).trim().split(/\s+/).map(t => ({ t, grand: /[\d%€$]/.test(t) }));
function largeurChiffre(ctx, jt, T){
  let w = 0;
  jt.forEach((j, i) => {
    w += j.grand ? mesurer(ctx, j.t, 900, T, PUB, -T * 0.035) : mesurer(ctx, j.t, 800, T * 0.36);
    if(i) w += T * (j.grand && jt[i - 1].grand ? 0.12 : 0.14);
  });
  return w + T * 0.05;
}
function ecrireChiffre(ctx, jt, x, y, T){
  let cx = x;
  jt.forEach((j, i) => {
    if(i) cx += T * (j.grand && jt[i - 1].grand ? 0.12 : 0.14);
    if(j.grand){ ecrire(ctx, j.t, cx, y, { poids: 900, taille: T, ls: -T * 0.035 }); cx += mesurer(ctx, j.t, 900, T, PUB, -T * 0.035); }
    else { ecrire(ctx, j.t, cx, y, { poids: 800, taille: T * 0.36, couleur: ROSE2 }); cx += mesurer(ctx, j.t, 800, T * 0.36); }
  });
}
STORY_PLUS.chiffre = async (ctx, info) => {
  const s = sujetDe(info), ch = s?.chiffre;
  if(!ch?.valeur) return null;
  await polices();
  const medias = mediasDe(s), titre = titreAffiche(s);
  const cles = String(ch.valeur).match(/\d+/g) || [];
  const art = articleCite(s, cles);
  const d = {
    citation: art ? titreCite(art.titre) : "", media: art?.media || "",
    note: art ? (medias.length >= 2 ? "Chiffre tel que rapporté par plusieurs médias" : "Chiffre tel que rapporté par la presse") : "",
    contexte: s.contexte || [], video: videoDe(s)
  };
  const y0 = fond(ctx, "Le chiffre du jour");
  const yPied = pied(ctx, { medias, source: "Titres relevés dans la presse. Le chiffre peut évoluer au fil de la journée." });
  const bas = yPied - 30, jt = jetons(ch.valeur);
  let tnMax = 300; while(tnMax > 120 && largeurChiffre(ctx, jt, tnMax) > LARG) tnMax -= 2;
  const unite = String(ch.unite || "").trim();
  // Mise en page du haut : chiffre, unité, notre titre
  const hero = tn => {
    const yN = y0 + 56 + Math.round(tn * 0.71);
    let y = yN + 34;
    const fu = unite ? ajuster(ctx, unite, { poids: 700, tMax: 84, tMin: 52, hMax: 190, max: 2, inter: 1.04 }) : null;
    const yU = y; if(fu) y += fu.h + 10;
    const ft = ajuster(ctx, titre, { poids: 600, tMax: 66, tMin: 44, hMax: 150, max: 2, inter: 1.08 });
    const yT = y; y += ft.h;
    return { yN, fu, yU, ft, yT, bas: y };
  };
  let choix = null;
  for(const tq of [38, 34, 30, 28]){
    for(let tn = tnMax; tn >= Math.max(170, tnMax * 0.8); tn -= 10){
      const h = hero(tn);
      if(carte(ctx, d, tq, marge, 0, LARG, false) <= bas - h.bas - 40){ choix = { tn, tq, h }; break; }
    }
    if(choix) break;
  }
  if(!choix){ const tn = Math.max(170, tnMax * 0.8); choix = { tn, tq: 28, h: hero(tn), maxQ: 2 }; }
  const { tn, h } = choix;
  ecrireChiffre(ctx, jt, marge, h.yN, tn);
  if(h.fu) ecrireLignes(ctx, h.fu, marge, h.yU, { poids: 700, inter: 1.04 });
  ecrireLignes(ctx, h.ft, marge, h.yT, { poids: 600, couleur: CIEL, inter: 1.08 });
  const hc = carte(ctx, d, choix.tq, marge, 0, LARG, false, { maxQ: choix.maxQ || 99 });
  carte(ctx, d, choix.tq, marge, bas - hc, LARG, hc, { maxQ: choix.maxQ || 99 });
  return { nom: nomFichier("chiffre", s) };
};

/* ---------- F. Face à face ---------- */
const PARTI_LIBELLE = { PP: "Place publique", PS: "Parti socialiste", SOC: "Socialistes", LFI: "LFI", RN: "Rassemblement national", LR: "Les Républicains", RE: "Renaissance", REN: "Renaissance", EELV: "Les Écologistes", LE: "Les Écologistes", ECO: "Écologistes", PCF: "PCF", HOR: "Horizons", REC: "Reconquête", MoDem: "MoDem" };
const libelleParti = p => PARTI_LIBELLE[p] || p || "";
// Portrait carré cadré sur le haut, bordure blanche ; une photo trop petite n'est pas agrandie au-delà de 2,2 fois (le cadre reste, la photo est reproduite plus petite)
function portrait(ctx, img, nom, parti, x, y, S){
  const b = 8, inner = S - 2 * b;
  ctx.fillStyle = "#fff"; ctx.fillRect(x, y, S, S);
  if(img){
    let k = Math.max(inner / img.naturalWidth, inner / img.naturalHeight);
    const f = Math.min(1, 2.2 / k), d = Math.round(inner * f); k *= f;
    const px = x + b + Math.round((inner - d) / 2), py = y + b + Math.round((inner - d) / 2);
    const iw = Math.round(img.naturalWidth * k), ih = Math.round(img.naturalHeight * k);
    ctx.save(); ctx.beginPath(); ctx.rect(px, py, d, d); ctx.clip();
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, Math.round(px - (iw - d) / 2), Math.round(py - (ih - d) * 0.12), iw, ih);
    ctx.restore();
  } else {
    storyInitiales(ctx, nom, x + S / 2, y + S / 2, inner / 2, parti ? couleurPartiActu(parti) : "#2F52B5");
  }
}
STORY_PLUS.facea = async (ctx, info) => {
  const s = sujetDe(info), pers = (s?.illustration?.personnes || []).slice(0, 2);
  if(!s || pers.length < 2) return null;
  await polices();
  const imgs = await Promise.all(pers.map(p => p.photo ? storyPortrait(p.photo, p.photoHd) : null));
  const credits = [];
  for(let i = 0; i < 2; i++){
    if(!imgs[i]) continue;
    let c = pers[i].credit;
    if(!c && /personnalites/.test(pers[i].photo || "")) c = (await storyPCredits([pers[i].nom]))[0] || "";
    if(c) credits.push(c);
  }
  const medias = mediasDe(s), titre = titreAffiche(s);
  const noms = pers.map(p => p.nom), derniers = noms.map(n => n.split(/\s+/).slice(-1)[0]);
  const art = articleCite(s, [...noms, ...derniers]);
  const d = { citation: art ? titreCite(art.titre) : "", media: art?.media || "", contexte: s.contexte || [], video: videoDe(s) };
  const y0 = fond(ctx, "Face à face");
  const uniq = [...new Set(credits)];
  const yPied = pied(ctx, { medias, source: `Titres relevés dans la presse.${uniq.length ? ` Photos : ${uniq.join(" ; ")}.` : ""}` });
  const bas = yPied - 26;
  const ft = ajuster(ctx, titre, { poids: 600, tMax: 92, tMin: 54, hMax: 3 * 92 * 1.04, max: 3, inter: 1.04 });
  const yT = y0 + 40, yP0 = yT + ft.h + 44;
  // noms (2 lignes au plus) et partis sous chaque portrait
  const nl = S => pers.map(p => lignes(ctx, p.nom, 800, 38, PUB, S + 40, 2));
  let choix = null;
  for(const S of [416, 396, 376, 356, 336, 316, 296, 276]){
    const nn = Math.max(...nl(S).map(l => l.length)), hNoms = 22 + nn * 42 + (pers.some(p => p.parti) ? 40 : 0) + 10;
    const yCarte = yP0 + S + hNoms + 30;
    for(const tc of [27, 24]){
      if(poserOk(ctx, d, bas - yCarte, { tc })){ choix = { S, nn, hNoms, tc }; break; }
    }
    if(choix) break;
  }
  if(!choix){ const S = 276, nn = Math.max(...nl(S).map(l => l.length)); choix = { S, nn, hNoms: 22 + nn * 42 + 50, tc: 24 }; }
  const { S, nn, tc } = choix, gap = 80, x1 = marge + Math.round((LARG - 2 * S - gap) / 2), x2 = x1 + S + gap;
  ecrireLignes(ctx, ft, marge, yT, { poids: 600, inter: 1.04 });
  const cy = yP0 + S / 2, lignesNoms = nl(S);
  [x1, x2].forEach((x, i) => {
    portrait(ctx, imgs[i], pers[i].nom, pers[i].parti, x, yP0, S);
    const cx = x + S / 2;
    lignesNoms[i].forEach((l, k) => ecrire(ctx, l, cx, yP0 + S + 22 + 34 + k * 42, { poids: 800, taille: 38, align: "center" }));
    if(pers[i].parti) ecrire(ctx, libelleParti(pers[i].parti).toUpperCase(), cx, yP0 + S + 22 + 34 + (nn - 1) * 42 + 40, { poids: 800, taille: 24, couleur: CIEL, align: "center", ls: 3 });
  });
  // « VS » : pastille rose entre les deux portraits
  const rv = 54, xv = L / 2;
  ctx.fillStyle = ROSE; ctx.strokeStyle = BLEU; ctx.lineWidth = 10;
  ctx.beginPath(); ctx.arc(xv, cy, rv, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
  ctx.font = fnt(900, 46); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#fff"; ctx.fillText("VS", xv, cy + 3); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  const yCarte = yP0 + S + choix.hNoms + 30, dispo = bas - yCarte;
  poserCarte(ctx, d, bas, dispo, { tc });
  return { nom: nomFichier("face-a-face", s) };
};

/* ---------- G. Date à retenir ---------- */
STORY_PLUS.date = async (ctx, info) => {
  const s = sujetDe(info), dt = s?.date;
  if(!dt?.iso || !dt.jour || !dt.mois) return null;
  await polices();
  const medias = mediasDe(s), titre = titreAffiche(s);
  const art = articleCite(s, [`${dt.jour} ${dt.mois}`, String(dt.jour), dt.mois]);
  const d = { citation: art ? titreCite(art.titre) : "", media: art?.media || "", contexte: s.contexte || [], video: videoDe(s) };
  const y0 = fond(ctx, "À noter", { fondEt: "#fff", couleurEt: BLEU });
  const yPied = pied(ctx, { medias: [], source: "Date annoncée par la presse. L'ordre du jour peut changer.", cta: "Ne rien rater" });
  const bas = yPied - 30;
  const n = joursAvant(dt.iso);
  const compte = n > 1 ? { petit: "dans", grand: `${n} jours` } : n === 1 ? { petit: "", grand: "demain" } : n === 0 ? { petit: "", grand: "aujourd'hui" } : null;
  const jour = String(dt.jour), mois = String(dt.mois).toUpperCase();
  const dateIso = new Date(dt.iso + "T12:00:00Z");
  const semaine = isNaN(dateIso) ? "" : dateIso.toLocaleDateString("fr-FR", { weekday: "long", timeZone: "UTC" });
  const puces = [semaine && semaine[0].toUpperCase() + semaine.slice(1), rubrique(s)];
  if(medias.length) puces.push(medias.length > 2 ? `${medias.slice(0, 2).join(" · ")} +${medias.length - 2}` : medias.join(" · "));
  const puce = puces.filter(Boolean);
  // pastilles sur une ou deux rangées
  const pw = t => mesurer(ctx, t, 700, 28) + 40;
  const rangees = [[]]; let xr = 0;
  for(const t of puce){ const w = pw(t); if(xr + w > LARG && rangees[rangees.length - 1].length){ rangees.push([]); xr = 0; } rangees[rangees.length - 1].push(t); xr += w + 14; }
  const hPuces = rangees.length * 56 + (rangees.length - 1) * 14;
  const hero = T => {
    const yJ = y0 + 52 + Math.round(T * 0.72);
    const tm = Math.min(120, Math.floor(120 * (LARG / Math.max(LARG, mesurer(ctx, mois, 800, 120, PUB, 6)))));
    const yM = yJ + 30 + Math.round(tm * 0.72);
    const ft = ajuster(ctx, titre, { poids: 600, tMax: 80, tMin: 50, hMax: 3 * 80 * 1.06, max: 3, inter: 1.06 });
    const yT = yM + 40, yPu = yT + ft.h + 26;
    return { yJ, yM, tm, ft, yT, yPu, fin: yPu + hPuces };
  };
  let choix = null;
  for(const tc of [27]){
    for(let T = 440; T >= 260; T -= 20){
      const h = hero(T);
      if(poserOk(ctx, d, bas - h.fin - 34, { tc })){ choix = { T, h, tc }; break; }
    }
    if(choix) break;
  }
  if(!choix) choix = { T: 260, h: hero(260), tc: 24 };
  const { T, h, tc } = choix;
  // le jour, géant (« 1er » avec le suffixe en petit)
  const lsJ = -T * 0.04;
  ecrire(ctx, jour, marge, h.yJ, { poids: 900, taille: T, ls: lsJ });
  let xDroit = marge + mesurer(ctx, jour, 900, T, PUB, lsJ);
  if(Number(dt.jour) === 1){ ecrire(ctx, "er", xDroit + 6, h.yJ - T * 0.42, { poids: 900, taille: T * 0.26 }); xDroit += mesurer(ctx, "er", 900, T * 0.26) + 10; }
  // décompte à droite du jour, aligné sur sa base
  if(compte){
    const dispo = L - marge - xDroit - 40;
    const fc = ajuster(ctx, compte.grand, { poids: 700, tMax: 78, tMin: 36, largeur: Math.max(dispo, 200), hMax: 100, max: 1, inter: 1 });
    const yb = h.yJ;
    ecrire(ctx, compte.grand, L - marge, yb - 2, { poids: 700, taille: fc.t, fam: NEW, couleur: "#fff", align: "right" });
    if(compte.petit) ecrire(ctx, compte.petit.toUpperCase(), L - marge, yb - fc.t - 12, { poids: 800, taille: 30, couleur: ROSE2, align: "right", ls: 4 });
  }
  ecrire(ctx, mois, marge + 4, h.yM, { poids: 800, taille: h.tm, couleur: ROSE2, ls: 6 });
  ecrireLignes(ctx, h.ft, marge, h.yT, { poids: 600, inter: 1.06 });
  // pastilles
  rangees.forEach((r, i) => {
    let x = marge; const y = h.yPu + i * 70;
    for(const t of r){
      const w = pw(t);
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.strokeRect(x + 1.5, y + 1.5, w - 3, 53);
      ecrire(ctx, t, x + 20, y + 37, { poids: 700, taille: 28 });
      x += w + 14;
    }
  });
  const hc = carte(ctx, d, 34, marge, 0, LARG, false, { tc });
  poserCarte(ctx, d, bas, bas - (h.fin + 34), { tc });
  return { nom: nomFichier("date", s) };
};
})();
