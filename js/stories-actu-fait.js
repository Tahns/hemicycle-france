/* Module chargé à la demande (stories d'actualité) : voir chargerModule() dans index.html.
   Trois types : « le chiffre » (STORY_PLUS.chiffre), « face à face » (STORY_PLUS.facea), « date à retenir » (STORY_PLUS.date).
   Style « bleu question / réponse » : fond bleu, un élément géant, carte crème avec une citation de presse.
   Tout est dans une fonction : aucun nom ne s'ajoute à l'espace global en dehors de STORY_PLUS. */
(() => {
const DA = STORY_DA, BLEU = DA.fond, CIEL = DA.ciel, CREME = DA.creme, ROUGE = DA.rouge, ROSE = DA.rose, ROSE2 = DA.rose, ENCRE = DA.encre, PALE = STORY.pale, FILET = STORY.filet;
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
// Plus grande taille (entre tMax et tMin) pour laquelle le texte ENTIER tient dans la largeur, sur au plus hMax de haut ; à défaut sa dernière proposition complète
// (terminée par un point, jamais « … ») ; null si rien ne tient : l'appelant n'affiche alors pas le bloc
function ajuster(ctx, texte, { poids = 700, fam = NEW, largeur = LARG, hMax = 300, tMax = 90, tMin = 50, inter = 1.06, max = 99, coupe = true } = {}){
  for(const v of (coupe ? storyVariantes(texte) : [storyTypo(texte)].filter(Boolean))){
    for(let t = tMax; t >= tMin; t -= 2){
      const l = lignes(ctx, v, poids, t, fam, largeur, 99);
      if(l.length <= max && l.length * t * inter <= hMax && l.every(x => ctx.measureText(x).width <= largeur + 1 && !(x.endsWith("…") && !/…/.test(v)))) return { t, l, h: l.length * t * inter, texte: v };
    }
  }
  return null;
}
function ecrireLignes(ctx, f, x, yHaut, { poids = 700, fam = NEW, couleur = "#fff", inter = 1.06, align = "left" } = {}){
  f.l.forEach((l, i) => ecrire(ctx, l, x, yHaut + f.t * 0.82 + i * f.t * inter, { poids, taille: f.t, fam, couleur, align }));
}

/* ---------- Données ---------- */
const sujetDe = info => ACTUALITES?.sujets?.[Number(String(info).split(":")[0])] || null;
const styleDe = info => storyStyleValide(String(info).split(":")[1]); // « indice:style » (bleu, une-photo, question, chiffre)
const sansLead = t => t.replace(/^Titre rédigé par Hémicycle France d'après la presse\.\s*/, "");
// Styles du test comparatif : la fiche du sujet (storySpecSujet) complétée par le contenu propre au modèle ; renvoie false si le style bleu doit être dessiné
async function dessinerStyle(ctx, s, info, surcharge){
  const style = styleDe(info);
  if(style === "bleu" || s.sensible) return false;
  const d = await storySpecSujet(s);
  if(!d) return false;
  return Boolean(storyStyleDessiner(ctx, style, { ...d, ...surcharge(d) }));
}
const rubrique = s => (THEMES_ACTU[s?.illustration?.theme] || THEMES_ACTU.politique)[2];
// Notre titre ; à défaut, un titre de repli neutre (jamais un titre de presse en grand titre)
const titreAffiche = s => storyTypo(s.accroche || s.titrePropre?.accroche || (typeof s.titrePropre?.titre === "string" ? s.titrePropre.titre : "")) || `${rubrique(s)} · en\u00A0ce\u00A0moment`;
// Médias DISTINCTS : un groupe de presse (EBRA…) ou une dépêche reprise à l'identique compte une fois (data/actualites.json : « sources », voir scripts/regroupement.cjs)
const mediasDe = s => (Array.isArray(s.sources) && s.sources.length ? s.sources.filter(Boolean) : [...new Set((s.articles || []).map(a => a.media).filter(Boolean))]);
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
// Contexte du sujet ; pendant la réserve électorale (loi du 19 juillet 1977), aucun résultat de sondage
const contexteSur = s => (s.contexte || []).filter(c => !(c.type === "sondage" && periodeReserveSondages()));
const videoDe = s => (s.articles || []).find(a => a.video)?.media || "";

/* ---------- Éléments communs ---------- */
function fond(ctx, etiquette, { fondEt = ROUGE } = {}){
  storyFondTheme(ctx);
  storyMarque(ctx);
  // étiquette plate : rouge (« le chiffre du jour »), blanche (« à noter »)
  ctx.font = fnt(800, 26); ctx.letterSpacing = "4px";
  const txt = storyLignes(ctx, etiquette.toUpperCase(), LARG - 44, 1)[0]; ctx.letterSpacing = "0px";
  storyEtiquette(ctx, txt, marge, DA.etiquetteY, fondEt === ROUGE ? "rouge" : "blanc");
  return 392;
}
// Pied commun : ligne « Repris par N médias » (facultative), source en petit, puis « accroche → @compte ». Renvoie l'ordonnée du haut du pied (le contenu s'arrête 30 px plus haut).
function pied(ctx, { medias = [], source, cta = "Toute l'actu politique" }){
  let ligne = "";
  if(medias.length >= 2){
    const n = medias.length; let k = Math.min(medias.length, 3), t;
    do { t = `Repris par ${n} médias · ${medias.slice(0, k).join(", ")}${k < n ? ` et ${n - k} autre${n - k > 1 ? "s" : ""}` : ""}`; k--; }
    while(k >= 0 && mesurer(ctx, t, 700, 26) > LARG);
    if(k < 0) t = `Repris par ${n} médias`;
    ligne = t;
  }
  storyPied(ctx, source, { ligne, accroche:cta });
  return STORY.bas + 30;
}
// Carte crème : l'essentiel (champ `essentiel`, ENTIER), la citation de presse (entière), le média, le contexte, la vidéo. Mesure (dessiner = false) ou dessine ; renvoie la hauteur
// (0 : rien à afficher ; Infinity : un texte ne peut pas être écrit en entier à cette taille). Aucun texte n'est jamais coupé ni terminé par « … ».
const entier = (ls, texte) => !ls.some(l => l.endsWith("…")) || /…/.test(texte);
function carte(ctx, d, tq, x, y, w, dessiner, { tc = 27 } = {}){
  if(!(d.essentiel || d.citation || d.contexte?.length || d.video)) return 0;
  const wi = w - 96, xi = x + 48, lh = tq * 1.26;
  let c = y + 44;
  const ess = d.essentiel ? lignes(ctx, d.essentiel, 700, tq, PUB, wi, 99) : null;
  if(ess && !entier(ess, d.essentiel)) return Infinity;
  const tCit = d.essentiel ? Math.max(24, tq - 10) : tq, lhC = tCit * 1.26;
  const lq = d.citation ? lignes(ctx, `« ${d.citation} »`, d.essentiel ? 600 : 700, tCit, PUB, wi, 99) : null;
  if(lq && !entier(lq, d.citation)) return Infinity;
  if(dessiner){ ctx.fillStyle = CREME; ctx.beginPath(); ctx.roundRect(x, y, w, dessiner, DA.rayon); ctx.fill(); }
  if(ess){
    if(dessiner) ecrire(ctx, "L'ESSENTIEL", xi, c + 18, { poids: 800, taille: 22, couleur: ROUGE, ls: 3 });
    c += 34;
    if(dessiner) ess.forEach((l, i) => ecrire(ctx, l, xi, c + tq * 0.95 + i * lh, { poids: 700, taille: tq, couleur: ENCRE }));
    c += ess.length * lh;
    if(lq) c += 16;
  }
  if(lq){
    if(dessiner) lq.forEach((l, i) => ecrire(ctx, l, xi, c + tCit * 0.95 + i * lhC, { poids: d.essentiel ? 600 : 700, taille: tCit, couleur: d.essentiel ? PALE : ENCRE }));
    c += lq.length * lhC;
    if(d.media){ c += 14; if(dessiner) ecrire(ctx, "— " + d.media, xi, c + 26, { poids: 800, taille: 27, couleur: BLEU }); c += 36; }
    if(d.note){ c += 4; if(dessiner) ecrire(ctx, d.note, xi, c + 22, { poids: 600, taille: 24, couleur: PALE }); c += 32; }
  }
  if(d.contexte?.length){
    c += 22;
    if(dessiner){ ctx.fillStyle = FILET; ctx.fillRect(xi, c, wi, 2); }
    c += 26;
    if(dessiner) ecrire(ctx, "LE CONTEXTE", xi, c + 18, { poids: 800, taille: 22, couleur: BLEU, ls: 3 });
    c += 34;
    for(const e of d.contexte){
      const lc = lignes(ctx, e.texte, 600, tc, PUB, wi, 99), ih = tc * 1.28;
      if(!entier(lc, e.texte)) return Infinity;
      if(dessiner) lc.forEach((l, i) => ecrire(ctx, l, xi, c + tc * 0.9 + i * ih, { poids: 600, taille: tc, couleur: ENCRE }));
      c += lc.length * ih;
      if(e.source){
        const src = lignes(ctx, `Source : ${e.source}`, 600, 22, PUB, wi, 1)[0];
        if(dessiner) ecrire(ctx, src, xi, c + 26, { poids: 600, taille: 22, couleur: PALE });
        c += 34;
      }
      c += 8;
    }
  }
  if(d.video){ c += 12; if(dessiner) ecrire(ctx, `▶ Vidéo : ${d.video}`, xi, c + 24, { poids: 800, taille: 26, couleur: BLEU }); c += 34; }
  return c + 36 - y;
}
const TAILLES_CARTE = [40, 38, 36, 34, 32, 30, 28, 26, 24];
// Pose la carte, ancrée en bas (bas), dans la hauteur dispo ; choisit la plus grande taille de citation qui tient. Renvoie la hauteur utilisée (0 : carte vide).
function poserCarte(ctx, d, bas, dispo, opts = {}){
  let choix = null;
  for(const tq of (opts.tailles || TAILLES_CARTE)){ const h = carte(ctx, d, tq, marge, 0, LARG, false, opts); if(h <= dispo){ choix = { tq, h }; break; } }
  if(!choix || !choix.h) return 0;
  carte(ctx, d, choix.tq, marge, bas - choix.h, LARG, choix.h, opts);
  return choix.h;
}
// Variantes d'une carte du plus complet au plus court : d'abord moins de faits de contexte, puis sans la citation de presse, et seulement ensuite l'essentiel réduit à ses premières
// propositions complètes ; en dernier recours la carte ne garde que la vidéo, ou disparaît (jamais un texte coupé par « … »)
function variantesCarte(d){
  const out = [], vu = new Set(), n = d.contexte?.length || 0;
  const ks = [n]; for(let k = Math.min(n - 1, 2); k >= 0; k--) ks.push(k);
  for(const e of (d.essentiel ? storyVariantes(d.essentiel) : [""])){
    for(const cit of [true, false]){
      for(const k of ks){
        const v = { ...d, essentiel:e, citation:cit ? d.citation : "", media:cit ? d.media : "", note:cit ? d.note : "", contexte:(d.contexte || []).slice(0, k) };
        const cle = JSON.stringify([v.essentiel, v.citation, k]);
        if(vu.has(cle) || !(v.essentiel || v.citation || k)) continue;
        vu.add(cle); out.push(v);
      }
    }
  }
  out.push({ video:d.video }, {});
  return out;
}
const poserOk = (ctx, d, dispo, opts = {}) => TAILLES_CARTE.some(tq => carte(ctx, d, tq, marge, 0, LARG, false, opts) <= dispo);

const maj1 = t => String(t).charAt(0).toUpperCase() + String(t).slice(1);
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
  if(await dessinerStyle(ctx, s, info, d => ({ source:sansLead(d.source), cta:"Tous les chiffres" }))) return { nom: nomFichier("chiffre", s) };
  const medias = mediasDe(s), titre = titreAffiche(s);
  const cles = String(ch.valeur).match(/\d+/g) || [];
  const art = articleCite(s, cles);
  const d = {
    essentiel: storyTypo(s.essentiel || s.titrePropre?.essentiel || ""),
    citation: art ? titreCite(art.titre) : "", media: art?.media || "",
    note: art ? (medias.length >= 2 ? "Chiffre tel que rapporté par plusieurs médias" : "Chiffre tel que rapporté par la presse") : "",
    contexte: contexteSur(s), video: videoDe(s)
  };
  const y0 = fond(ctx, "Le chiffre du jour");
  const yPied = pied(ctx, { medias, source: "", cta: "Tous les chiffres" });
  const bas = yPied - 30, jt = jetons(ch.valeur);
  let tnMax = 300; while(tnMax > 44 && largeurChiffre(ctx, jt, tnMax) > LARG) tnMax -= 2; // chiffre très long : il rétrécit plutôt que de sortir de l'image
  const unite = String(ch.unite || "").trim();
  // Mise en page du haut : chiffre, unité, notre titre
  const fu = unite ? ajuster(ctx, unite, { poids: 700, tMax: 84, tMin: 52, hMax: 300, max: 4, inter: 1.1 }) : null;
  const ft = ajuster(ctx, titre, { poids: 600, tMax: 66, tMin: 52, hMax: 400, max: 5, inter: 1.08, coupe: false }); // l'accroche n'est jamais coupée
  if(!ft) return null;
  const hero = tn => {
    const yN = y0 + 56 + Math.round(tn * 0.71);
    let y = yN + 34;
    const yU = y; if(fu) y += fu.h + 10;
    const yT = y; y += ft.h;
    return { yN, fu, yU, ft, yT, bas: y };
  };
  let choix = null, dc = d;
  for(const dv of variantesCarte(d)){
    for(const tq of [38, 34, 30, 28, 26]){
      for(let tn = tnMax; tn >= Math.min(tnMax, Math.max(130, tnMax * 0.6)); tn -= 10){
        const h = hero(tn);
        if(carte(ctx, dv, tq, marge, 0, LARG, false) <= bas - h.bas - 40){ choix = { tn, tq, h }; break; }
      }
      if(choix) break;
    }
    if(choix){ dc = dv; break; }
  }
  if(!choix) return null; // l'accroche et le chiffre ne laissent aucune place : pas de story plutôt qu'un texte coupé
  const { tn, h } = choix;
  ecrireChiffre(ctx, jt, marge, h.yN, tn);
  if(h.fu) ecrireLignes(ctx, h.fu, marge, h.yU, { poids: 700, inter: 1.1 });
  ecrireLignes(ctx, h.ft, marge, h.yT, { poids: 600, couleur: CIEL, inter: 1.08 });
  const hc = carte(ctx, dc, choix.tq, marge, 0, LARG, false);
  if(hc) carte(ctx, dc, choix.tq, marge, bas - hc, LARG, hc);
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
  const d = { essentiel: storyTypo(s.essentiel || s.titrePropre?.essentiel || ""), citation: art ? titreCite(art.titre) : "", media: art?.media || "", contexte: contexteSur(s), video: videoDe(s) };
  const y0 = fond(ctx, "Face à face");
  const uniq = [...new Set(credits)];
  const yPied = pied(ctx, { medias, source: uniq.length ? `Photos : ${uniq.join(" ; ")}.` : "" });
  const bas = yPied - 26;
  const ft = ajuster(ctx, titre, { poids: 600, tMax: 92, tMin: 52, hMax: 5 * 92 * 1.04, max: 5, inter: 1.1, coupe: false }); // l'accroche n'est jamais coupée
  if(!ft) return null;
  const yT = y0 + 40, yP0 = yT + ft.h + 44;
  // noms (2 lignes au plus) et partis sous chaque portrait
  const nl = S => pers.map(p => lignes(ctx, p.nom, 800, 38, PUB, S + 40, 2));
  let choix = null;
  for(const dv of variantesCarte(d)){
    for(const S of [416, 396, 376, 356, 336, 316, 296, 276, 256, 236, 216]){
      const nn = Math.max(...nl(S).map(l => l.length)), hNoms = 22 + nn * 42 + (pers.some(p => p.parti) ? 46 : 0) + 10;
      const yCarte = yP0 + S + hNoms + 30;
      for(const tc of [27, 24]){
        if(poserOk(ctx, dv, bas - yCarte, { tc })){ choix = { S, nn, hNoms, tc, dv }; break; }
      }
      if(choix) break;
    }
    if(choix) break;
  }
  if(!choix){ const S = 216, nn = Math.max(...nl(S).map(l => l.length)), hNoms = 22 + nn * 42 + 56; if(yP0 + S + hNoms > bas) return null; choix = { S, nn, hNoms, tc: 24, dv: {} }; }
  const { S, nn, tc } = choix, gap = 80, x1 = marge + Math.round((LARG - 2 * S - gap) / 2), x2 = x1 + S + gap;
  ecrireLignes(ctx, ft, marge, yT, { poids: 600, inter: 1.1 });
  const cy = yP0 + S / 2, lignesNoms = nl(S);
  [x1, x2].forEach((x, i) => {
    portrait(ctx, imgs[i], pers[i].nom, pers[i].parti, x, yP0, S);
    const cx = x + S / 2;
    lignesNoms[i].forEach((l, k) => ecrire(ctx, l, cx, yP0 + S + 22 + 34 + k * 42, { poids: 800, taille: 38, align: "center" }));
    if(pers[i].parti) ecrire(ctx, libelleParti(pers[i].parti).toUpperCase(), cx, yP0 + S + 22 + 34 + (nn - 1) * 42 + 46, { poids: 800, taille: 24, couleur: CIEL, align: "center", ls: 3 });
  });
  // « VS » : pastille rose entre les deux portraits
  const rv = 54, xv = L / 2;
  ctx.fillStyle = ROSE; ctx.strokeStyle = BLEU; ctx.lineWidth = 10;
  ctx.beginPath(); ctx.arc(xv, cy, rv, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
  ctx.font = fnt(900, 46); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#fff"; ctx.fillText("VS", xv, cy + 3); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  const yCarte = yP0 + S + choix.hNoms + 30, dispo = bas - yCarte;
  poserCarte(ctx, choix.dv, bas, dispo, { tc });
  return { nom: nomFichier("face-a-face", s) };
};

/* ---------- G. Date à retenir ---------- */
STORY_PLUS.date = async (ctx, info) => {
  const s = sujetDe(info), dt = s?.date;
  if(!dt?.iso || !dt.jour || !dt.mois) return null;
  await polices();
  const nj = joursAvant(dt.iso);
  if(nj >= 0 && await dessinerStyle(ctx, s, info, d => {
    const quand = nj > 1 ? `dans ${nj} jours` : nj === 1 ? "demain" : "aujourd'hui";
    const jourDate = `${String(dt.jour) === "1" ? "1er" : dt.jour} ${dt.mois}`;
    return {
      chiffre: { valeur: nj > 1 ? String(nj) : maj1(quand), legende: nj > 1 ? "jours avant la date à retenir" : "date à retenir" },
      essentiel: d.essentiel || `Date à retenir : ${jourDate}, ${quand}.`,
      puces: [`Date à retenir : ${jourDate}`, maj1(quand), `Rubrique : ${d.categorie}`],
      categorie: "À noter", contexte: `${titreAffiche(s)} : ${jourDate}`, cta: "Ne rien rater",
      source: sansLead(d.source),
    };
  })) return { nom: nomFichier("date", s) };
  const medias = mediasDe(s), titre = titreAffiche(s);
  const art = articleCite(s, [`${dt.jour} ${dt.mois}`, String(dt.jour), dt.mois]);
  let d = { essentiel: storyTypo(s.essentiel || s.titrePropre?.essentiel || ""), citation: art ? titreCite(art.titre) : "", media: art?.media || "", contexte: contexteSur(s), video: videoDe(s) };
  const y0 = fond(ctx, "À noter", { fondEt: "#fff", couleurEt: BLEU });
  const yPied = pied(ctx, { medias: [], source: "", cta: "Ne rien rater" });
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
  const ft = ajuster(ctx, titre, { poids: 600, tMax: 80, tMin: 52, hMax: 5 * 80 * 1.06, max: 5, inter: 1.06, coupe: false }); // l'accroche n'est jamais coupée
  if(!ft) return null;
  const hero = (T, pu = true) => {
    const yJ = y0 + 52 + Math.round(T * 0.72);
    const tm = Math.min(120, Math.floor(120 * (LARG / Math.max(LARG, mesurer(ctx, mois, 800, 120, PUB, 6)))));
    const yM = yJ + 30 + Math.round(tm * 0.72);
    const yT = yM + 40, yPu = yT + ft.h + 26;
    return { yJ, yM, tm, ft, yT, yPu, fin: pu ? yPu + hPuces : yT + ft.h };
  };
  let choix = null;
  for(const dv of variantesCarte(d)){
    for(const tc of [27]){
      for(const pu of [true, false]){ // les pastilles (jour, rubrique, médias) sont secondaires : retirées avant de couper un texte
        for(let T = 440; T >= 200; T -= 20){
          const h = hero(T, pu);
          if(poserOk(ctx, dv, bas - h.fin - 34, { tc })){ choix = { T, h, tc, dv, pu }; break; }
        }
        if(choix) break;
      }
      if(choix) break;
    }
    if(choix) break;
  }
  if(!choix) return null;
  const { T, h, tc } = choix;
  d = choix.dv;
  // Sans citation, contexte ni vidéo (date d'agenda) : pas de carte vide, et le bloc est descendu pour mieux occuper la page
  const aCarte = Boolean(d.essentiel || d.citation || d.contexte?.length || d.video);
  const decal = aCarte ? 0 : Math.max(0, Math.round((bas - h.fin) * 0.4));
  ctx.save(); ctx.translate(0, decal);
  // le jour, géant (« 1er » avec le suffixe en petit)
  const lsJ = -T * 0.04;
  ecrire(ctx, jour, marge, h.yJ, { poids: 900, taille: T, ls: lsJ });
  let xDroit = marge + mesurer(ctx, jour, 900, T, PUB, lsJ);
  if(Number(dt.jour) === 1){ ecrire(ctx, "er", xDroit + 14, h.yJ - T * 0.42, { poids: 900, taille: T * 0.26 }); xDroit += mesurer(ctx, "er", 900, T * 0.26) + 18; }
  // décompte à droite du jour, aligné sur sa base
  if(compte){
    const dispo = L - marge - xDroit - 40;
    const fc = ajuster(ctx, compte.grand, { poids: 700, tMax: 78, tMin: 36, largeur: Math.max(dispo, 200), hMax: 100, max: 1, inter: 1, coupe: false }) || { t: 36 };
    const yb = h.yJ;
    ecrire(ctx, compte.grand, L - marge, yb - 14, { poids: 700, taille: fc.t, fam: NEW, couleur: "#fff", align: "right" });
    if(compte.petit) ecrire(ctx, compte.petit.toUpperCase(), L - marge, yb - fc.t - 24, { poids: 800, taille: 30, couleur: ROSE2, align: "right", ls: 4 });
  }
  ecrire(ctx, mois, marge + 4, h.yM, { poids: 800, taille: h.tm, couleur: ROSE2, ls: 6 });
  ecrireLignes(ctx, h.ft, marge, h.yT, { poids: 600, inter: 1.06 });
  // pastilles
  if(choix.pu) rangees.forEach((r, i) => {
    let x = marge; const y = h.yPu + i * 70;
    for(const t of r){
      const w = pw(t);
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.strokeRect(x + 1.5, y + 1.5, w - 3, 53);
      ecrire(ctx, t, x + 20, y + 37, { poids: 700, taille: 28 });
      x += w + 14;
    }
  });
  ctx.restore();
  if(aCarte) poserCarte(ctx, d, bas, bas - (h.fin + 34), { tc });
  return { nom: nomFichier("date", s) };
};
})();
