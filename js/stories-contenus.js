/* Module chargé à la demande (publications Instagram récurrentes, scripts/contenus-auto.cjs) : voir chargerModule() dans index.html.
   Cinq dessins, tous d'après une fiche (objet « spec ») préparée à partir de NOS données officielles (jamais de presse, jamais d'avis) :
   - « aujourdhui »   : story 1080 × 1920, l'ordre du jour de la séance publique de l'Assemblée nationale du jour ;
   - « vote-jour »    : story, le scrutin public le plus important de la veille (résultat officiel, voix pour / contre / abstentions) ;
   - « comprendre »   : story, une notion de la rubrique Comprendre (règle stable, source officielle) ;
   - « chiffre-jour » : story, une donnée officielle (Insee, Eurostat…) avec sa date et sa source ;
   - « diapo »        : une image de CARROUSEL 1080 × 1350 (4:5), numérotée « n/N » : couverture, texte, liste, voix, sources.
   Direction artistique « base blanche » (js/stories-blanc.js : BLANC, storyBlanc*) : fond blanc, bandeau de tête, filet noir épais, rubrique rouge,
   titres serif, filets gris, pied de source. Tout est vectoriel ; le texte n'est JAMAIS coupé (la taille diminue, la mise en page s'allonge).
   Rien n'est ajouté à l'espace global : tout est dans STORY_PLUS. */
(() => {
const { L } = STORY, M = BLANC.marge, LARG = L - 2 * M;
const H_DIAPO = 1350;
const fr = n => String(n ?? 0).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

async function polices(){
  await Promise.all(['800 30px "Public Sans"', '700 30px "Public Sans"', '600 30px "Public Sans"', '500 30px "Public Sans"', '400 30px "Public Sans"', '600 60px Newsreader', '400 60px Newsreader']
    .map(f => document.fonts.load(f).catch(() => {})));
}
const T = t => storyTypo(t); // apostrophes typographiques, espaces normalisées
/* Styles du test comparatif (champ `style` de la fiche : bleu, une-photo, question, chiffre) : la fiche `d` complète le thème (clé de THEMES_ACTU : photo d'institution ou motif) ;
   renvoie false si le style historique (désormais la base blanche) doit être dessiné. Fiches officielles : aucune presse, aucun portrait. */
async function dessinerStyle(ctx, s, d){
  const style = storyStyleValide(s?.style);
  if(style === "bleu") return false;
  if(d.source){ ctx.font = '400 23px "Public Sans"'; d = { ...d, source: storyLignes(ctx, String(d.source), LARG, 2).join(" ") }; } // source : 2 lignes au plus (jamais jusqu'à l'accroche)
  const th = storyThemeInfos(d.cle), photo = await storyPhotoTheme(d.cle);
  return Boolean(storyStyleDessiner(ctx, style, { theme:th.cle, couleur:th.couleur, motif:th.motif, photo, ...d }));
}
// Intitulé d'un point d'ordre du jour sans la formule d'introduction (« Proposition de résolution, déposée en application de l'article 34-1… visant à X » -> « Résolution : X »)
function condenser(t){
  t = T(t);
  const genre = /^proposition de résolution/i.test(t) ? "Résolution" : /^proposition de loi/i.test(t) ? "Proposition de loi" : /^projet de loi/i.test(t) ? "Projet de loi" : "";
  const m = genre && /\b(visant à|tendant à|visant|portant sur)\s+(.+)$/i.exec(t), r = genre && /\b(relati(?:f|ve)s? (?:à|au|aux)\s+.+)$/i.exec(t);
  return m ? `${genre} : ${m[2]}` : r ? `${genre} ${r[1]}` : t;
}
const phrases = t => T(t).split(/(?<=[.!?])\s+/).filter(Boolean);
const maj = t => String(t || "").charAt(0).toUpperCase() + String(t || "").slice(1);
// Pied ancré en bas d'une story (source entière) ; renvoie la limite basse du contenu
const pied = (ctx, source, o = {}) => storyBlancPiedBas(ctx, T(source), { bas: BLANC.bas - 10, ...o }) - 28;

/* ---------- Story « Aujourd'hui à l'Assemblée » ---------- */
STORY_PLUS.aujourdhui = async (ctx, s) => {
  if(!s || !Array.isArray(s.points) || !s.points.length) return null;
  await polices();
  const nbPoints = s.points.length + (s.autres || 0), source = s.source || "Source : Assemblée nationale, ordre du jour des séances publiques.";
  if(await dessinerStyle(ctx, s, {
    cle: "assemblee", fond: "bleu", categorie: "Séance publique", accroche: s.style === "question" ? "Que se passe-t-il aujourd'hui à l'Assemblée ?" : T("Aujourd'hui à l'Assemblée"), essentiel: `${maj(s.jour)} : ${condenser(s.points[0].t)}`,
    puces: s.style === "question" ? s.points.slice(0, 3).map(p => condenser(p.t)) : [], contexte: `${maj(s.jour)} : ${condenser(s.points[0].t)}`,
    chiffre: { valeur: String(nbPoints), legende: nbPoints > 1 ? "points à l'ordre du jour" : "point à l'ordre du jour" }, source, cta: "Tout l'agenda",
  })) return { nom: `aujourdhui-${s.iso || "x"}` };
  let y = storyBlancCadre(ctx, "Séance publique", { date: maj(s.jour) });
  const bas = pied(ctx, source);
  y = storyBlancTitre(ctx, T("Aujourd'hui à l'Assemblée"), M, y, y + 2 * 100, { tMax: 96, tMin: 64 }).y + 4;
  y = storyBlancTexte(ctx, `${nbPoints} point${nbPoints > 1 ? "s" : ""} à l'ordre du jour`, M, y, { taille: 32, poids: 600, couleur: BLANC.gris }) + 18;
  const tag = { qag: "Questions orales", vote: "Vote solennel", texte: "À l'ordre du jour" };
  const couleurTag = p => p.k === "vote" ? BLANC.rouge : p.k === "qag" ? BLANC.bleu : BLANC.gris;
  const o = t => ({ taille: t, poids: 600, police: "Newsreader", largeur: LARG, interligne: 1.14 });
  const hPoint = (p, t) => 26 + 14 + storyBlancHauteur(ctx, T(p.t), o(t)) + 26;
  const hAutres = 56;
  // taille la plus grande pour laquelle tous les points tiennent ; sinon, à la taille minimale, les derniers points passent dans « + N autres »
  let t = 46, n = s.points.length;
  const total = (k, tt) => s.points.slice(0, k).reduce((a, p) => a + hPoint(p, tt), 0) + ((k < s.points.length || s.autres > 0) ? hAutres : 0);
  while(t > 30 && y + total(n, t) > bas) t -= 2;
  while(n > 1 && y + total(n, t) > bas) n--;
  storyBlancFilet(ctx, y, { epais: 3, couleur: BLANC.encre });
  for(const p of s.points.slice(0, n)){
    const h = hPoint(p, t);
    storyBlancCaps(ctx, tag[p.k] || tag.texte, M, y + 24, { taille: 22, couleur: couleurTag(p), ls: 3 });
    storyBlancTexte(ctx, T(p.t), M, y + 24 + 36, o(t));
    y += h; storyBlancFilet(ctx, y);
  }
  const autres = (s.autres || 0) + (s.points.length - n);
  if(autres > 0) storyBlancTexte(ctx, `+ ${autres} autre${autres > 1 ? "s" : ""} point${autres > 1 ? "s" : ""} à l'ordre du jour`, M, y + 14, { taille: 30, poids: 700, couleur: BLANC.rouge });
  return { nom: `aujourdhui-${s.iso || "x"}` };
};

/* ---------- Story « Le vote du jour » ---------- */
STORY_PLUS["vote-jour"] = async (ctx, s) => {
  if(!s || !s.objet || !["adopte", "rejete"].includes(s.verdict)) return null;
  if(s.votes && STORY_PLUS["vote-groupes"]){ // votes par groupe connus : modèle « Ils ont voté » (js/stories-hemicycle.js)
    const r = await STORY_PLUS["vote-groupes"](ctx, { format:"story", titre:s.dossier || s.objet, date:s.date, numero:s.numero, verdict:s.verdict, pour:s.pour, contre:s.contre, abst:s.abst, votes:s.votes, censure:s.censure === true });
    if(r) return { nom:`vote-jour-${s.numero || "x"}` };
  }
  await polices();
  const adopte = s.verdict === "adopte";
  const verdict = adopte ? "Adopté⁠✓" : "Rejeté⁠✕"; // signe collé au mot : la couleur n'est jamais seule
  const voix = (n, mot) => `${fr(n ?? 0)} ${mot}`;
  if(await dessinerStyle(ctx, s, {
    cle: "assemblee", fond: "noir", categorie: "Le vote du jour",
    accroche: s.style === "question" ? "Ce texte a-t-il été adopté ?" : `${verdict} à l'Assemblée`,
    essentiel: `${voix(s.pour, "voix pour")}, ${fr(s.contre ?? 0)} contre, ${fr(s.abst ?? 0)} abstention${(s.abst ?? 0) > 1 ? "s" : ""} : ${storyMots(T(s.dossier || s.objet), 10)}`,
    puces: [`${verdict} : ${voix(s.pour, "voix pour")}`, voix(s.contre, "voix contre"), voix(s.abst, (s.abst ?? 0) > 1 ? "abstentions" : "abstention")],
    chiffre: { valeur: fr(s.pour ?? 0), legende: "voix pour", type: "pour" }, contexte: `${verdict} (${fr(s.contre ?? 0)} contre, ${fr(s.abst ?? 0)} abstentions) : ${storyMots(T(s.dossier || s.objet), 12)}`,
    source: s.sourceTxt, cta: "Chaque jour de séance", colorerVoix: true,
  })) return { nom: `vote-jour-${s.numero || "x"}` };
  let y = storyBlancCadre(ctx, "Le vote du jour", { date: s.date });
  const bas = pied(ctx, s.sourceTxt);
  storyBlancCaps(ctx, s.type || "Scrutin public", M, y, { taille: 24, couleur: BLANC.gris });
  y += 52;
  const tv = 112; // pastille ✓ / ✕ et mot, côte à côte
  storyBlancVerdict(ctx, adopte, M, y, tv);
  ctx.font = `800 ${tv * 0.92}px "Public Sans"`; ctx.letterSpacing = "-2px"; ctx.fillStyle = BLANC.encre; ctx.textBaseline = "alphabetic";
  ctx.fillText(adopte ? "ADOPTÉ" : "REJETÉ", M + tv + 30, y + tv * 0.8); ctx.letterSpacing = "0px";
  y += tv + 34;
  storyBlancFilet(ctx, y, { epais: 3, couleur: BLANC.encre }); y += 28;
  const hVoix = 232, yVoix = Math.min(bas - hVoix, 1330), haut = y;
  const objet = T(s.objet);
  const dossier = s.dossier ? T(`Texte : ${s.dossier}`) : "";
  const hDossier = dossier ? storyBlancHauteur(ctx, dossier, { taille: 28, poids: 600 }) + 14 : 0;
  const rt = storyBlancTitre(ctx, objet, M, y, yVoix - 50 - hDossier, { tMax: 64, tMin: 36 });
  y = rt.y;
  if(dossier) y = storyBlancTexte(ctx, dossier, M, y + 10, { taille: 28, poids: 600, couleur: BLANC.gris });
  const total = (s.pour || 0) + (s.contre || 0) + (s.abst || 0) || 1;
  const yV = Math.max(yVoix, y + 50);
  storyBlancBarreEmpilee(ctx, M, yV, LARG, 26, [[s.pour || 0, BLANC_VOIX.pour], [s.contre || 0, BLANC_VOIX.contre], [s.abst || 0, BLANC_VOIX.abst]], total);
  storyBlancVoix(ctx, yV + 44, [["Pour", s.pour, "pour"], ["Contre", s.contre, "contre"], ["Abstentions", s.abst, "abst"]], { hauteur: 190, taille: 110 });
  return { nom: `vote-jour-${s.numero || "x"}` };
};

/* ---------- Story « Comprendre » (une notion par semaine) ---------- */
STORY_PLUS.comprendre = async (ctx, s) => {
  if(!s || !s.titre || !s.texte) return null;
  await polices();
  if(await dessinerStyle(ctx, s, {
    cle: "politique", fond: "jaune", categorie: `Comprendre · ${s.n}/${s.total}`,
    accroche: s.style === "question" ? `${T(s.titre)} : de quoi parle-t-on ?` : T(s.titre), essentiel: phrases(s.texte)[0] || T(s.texte),
    puces: phrases(s.texte).slice(0, 3), source: s.sourceTxt, cta: "Une notion par semaine",
  })) return { nom: `comprendre-${s.cle || "x"}` };
  let y = storyBlancCadre(ctx, `Comprendre · notion ${s.n}/${s.total}`);
  const bas = pied(ctx, s.sourceTxt);
  y = storyBlancTitre(ctx, T(s.titre), M, y, y + 3 * 96, { tMax: 92, tMin: 56 }).y + 14;
  storyBlancFilet(ctx, y, { epais: 6, couleur: BLANC.rouge, largeur: 120 });
  y += 34;
  const r = storyBlancFit(ctx, T(s.texte), M, y, bas, { tMax: 50, tMin: 24, poids: 500, interligne: 1.36 });
  return { nom: `comprendre-${s.cle || "x"}` };
};

/* ---------- Story « Le chiffre du jour » ---------- */
STORY_PLUS["chiffre-jour"] = async (ctx, s) => {
  if(!s || !s.libelle || !s.valeur) return null;
  await polices();
  if(await dessinerStyle(ctx, s, {
    cle: "budget", fond: "vert", categorie: "Le chiffre du jour",
    accroche: s.style === "question" ? `${T(s.libelle)} : combien ?` : T(s.libelle), essentiel: [s.valeur, s.soustitre, s.periode].filter(Boolean).map(T).join(" · "),
    puces: [[s.valeur, s.soustitre].filter(Boolean).map(T).join(" "), s.periode && T(s.periode), ...(s.lignes || []).filter(Boolean).map(T)].filter(Boolean).slice(0, 3),
    chiffre: { valeur: T(s.valeur), legende: T(s.soustitre || s.periode || "") }, contexte: T(s.libelle), source: s.sourceTxt, cta: "Un chiffre par jour",
  })) return { nom: `chiffre-${s.cle || "x"}` };
  let y = storyBlancCadre(ctx, "Le chiffre du jour");
  const bas = pied(ctx, s.sourceTxt);
  y = storyBlancTitre(ctx, T(s.libelle), M, y, y + 3 * 80, { tMax: 76, tMin: 44 }).y + 16;
  storyBlancFilet(ctx, y, { epais: 3, couleur: BLANC.encre }); y += 18;
  // le chiffre, en grand, sur toute la largeur utile
  let tv = 260; const valeur = T(s.valeur);
  ctx.font = `600 ${tv}px "Newsreader"`; ctx.letterSpacing = "-4px";
  while(tv > 90 && ctx.measureText(valeur).width > LARG){ tv -= 6; ctx.font = `600 ${tv}px "Newsreader"`; }
  ctx.fillStyle = BLANC.rouge; ctx.textBaseline = "alphabetic"; ctx.fillText(valeur, M - 6, y + tv * 0.82); ctx.letterSpacing = "0px";
  y += tv * 0.82 + 70;
  if(s.soustitre) y = storyBlancTexte(ctx, T(s.soustitre), M, y, { taille: 40, poids: 700 }) + 8;
  if(s.periode){ y += 4; storyBlancEtiquette(ctx, T(s.periode), M, y, { taille: 24, couleur: BLANC.gris, ls: 1 }); y += 24 * 1.9 + 30; }
  const lignes = (s.lignes || []).filter(Boolean).map(T);
  if(lignes.length){
    storyBlancFilet(ctx, y); y += 6;
    // la taille diminue jusqu'à ce que tout tienne ; rien n'est retiré ni coupé tant que la taille minimale le permet
    const mesure = tl => lignes.reduce((a, l) => a + storyBlancHauteur(ctx, l, { taille: tl, poids: 500, largeur: LARG - 40, interligne: 1.28 }) + 30, 0);
    let tl = 38; while(tl > 22 && y + mesure(tl) > bas) tl -= 2;
    for(const l of lignes){
      storyBlancPuce(ctx, M, y + 22 + tl * 0.3, 14);
      const yy = storyBlancTexte(ctx, l, M + 40, y + 20, { taille: tl, poids: 500, largeur: LARG - 40, interligne: 1.28 });
      y = yy + 10; storyBlancFilet(ctx, y); y += 6;
    }
  }
  return { nom: `chiffre-${s.cle || "x"}` };
};

/* ---------- Image de carrousel (1080 × 1350) ---------- */
STORY_PLUS.diapo = async (ctx, s) => {
  if(!s || !s.titre || !Array.isArray(s.corps)) return null;
  await polices();
  const cv = Boolean(s.couverture), haut = 56;
  let y = storyBlancCadre(ctx, T(s.kicker || "Hémicycle France"), { date: s.total > 1 ? `${s.n}/${s.total}` : "", haut });
  const bas = storyBlancPiedBas(ctx, T(s.source || "Source : données officielles."), { bas: H_DIAPO - 30, taille: 22 }) - 22;
  const tMax = cv ? 88 : 72, tMin = cv ? 52 : 44, maxL = cv ? 6 : 3;
  y = storyBlancTitre(ctx, T(s.titre), M, y, y + maxL * (tMax + 6), { tMax, tMin }).y + 14;
  // Les blocs sont dessinés dans l'ordre ; la taille du texte est la plus grande pour laquelle tout tient avant `bas` ; à la taille minimale seulement,
  // les derniers blocs qui ne tiennent toujours pas sont omis : rien ne déborde sur la source
  const hauteurs = taille => s.corps.reduce((a, b) => a + hauteurBloc(ctx, b, taille), 0);
  let taille = cv ? 36 : 44;
  while(taille > 22 && y + hauteurs(taille) > bas) taille -= 2;
  for(const b of s.corps){
    if(y + hauteurBloc(ctx, b, taille) > bas) break;
    y = dessinerBloc(ctx, b, y, taille);
  }
  return { nom: `diapo-${s.n || 1}` };
};
// Mesure d'un bloc de carrousel (même logique que dessinerBloc, sans dessiner)
function hauteurBloc(ctx, b, t){
  const tp = b.taille ? Math.min(b.taille, t) : t;
  if(b.p) return storyBlancHauteur(ctx, T(b.p), { taille: tp, poids: b.poids || 500, interligne: 1.3 }) + 14;
  if(b.li) return b.li.reduce((a, x) => a + storyBlancHauteur(ctx, T(x), { taille: t, poids: 500, largeur: LARG - 40, interligne: 1.28 }) + 16, 0);
  if(b.carte) return 2 * 26 + storyBlancHauteur(ctx, T(b.carte), { taille: t, poids: 600, police: "Newsreader", largeur: LARG - 64, interligne: 1.22 }) + 22;
  if(b.cases) return 190 + 20 + 50;
  if(b.gros) return /^(adopt|rejet)/i.test(b.gros) ? 128 + 50 : 150 * 0.82 + 40;
  if(b.kv) return b.kv.length * (t + 40) + 10;
  return 0;
}
function dessinerBloc(ctx, b, y, t){
  const tp = b.taille ? Math.min(b.taille, t) : t;
  if(b.p) return storyBlancTexte(ctx, T(b.p), M, y, { taille: tp, poids: b.poids || 500, couleur: b.couleur === "ciel" ? BLANC.gris : BLANC.encre, interligne: 1.3 }) + 14;
  if(b.li){
    for(const x of b.li){
      storyBlancPuce(ctx, M, y + t * 0.3, 14);
      y = storyBlancTexte(ctx, T(x), M + 40, y, { taille: t, poids: 500, largeur: LARG - 40, interligne: 1.28 }) + 16;
    }
    return y;
  }
  if(b.carte){
    const o = { taille: t, poids: 600, police: "Newsreader", largeur: LARG - 64, interligne: 1.22 };
    const h = 2 * 26 + storyBlancHauteur(ctx, T(b.carte), o);
    ctx.fillStyle = BLANC.fondDoux; ctx.fillRect(M, y, LARG, h);
    ctx.fillStyle = BLANC.rouge; ctx.fillRect(M, y, 8, h);
    storyBlancTexte(ctx, T(b.carte), M + 36, y + 26, o);
    return y + h + 22;
  }
  if(b.cases){
    const types = b.cases.map(([nom]) => /^pour/i.test(nom) ? "pour" : /^contre/i.test(nom) ? "contre" : "abst"); // « Ni pour ni contre » : abstentions
    const tot = b.cases.reduce((a, [, n]) => a + (n || 0), 0) || 1;
    storyBlancBarreEmpilee(ctx, M, y + 8, LARG, 24, b.cases.map(([, n], i) => [n || 0, BLANC_VOIX[types[i]]]), tot);
    return storyBlancVoix(ctx, y + 58, b.cases.map(([nom, n], i) => [nom, n, types[i]]), { hauteur: 190, taille: 100 }) + 20;
  }
  if(b.gros && /^(adopt|rejet)/i.test(b.gros)){ // verdict : pastille ✓ / ✕ et mot, jamais la couleur seule
    const adopte = /^adopt/i.test(b.gros), tv = 128;
    storyBlancVerdict(ctx, adopte, M, y + 6, tv);
    ctx.font = `600 ${tv * 1.1}px "Newsreader"`; ctx.fillStyle = BLANC.encre; ctx.textBaseline = "alphabetic"; ctx.letterSpacing = "-2px";
    ctx.fillText(b.gros, M + tv + 30, y + 6 + tv * 0.84); ctx.letterSpacing = "0px";
    return y + tv + 50;
  }
  if(b.gros){
    const tv = 150; ctx.font = `600 ${tv}px "Newsreader"`; ctx.letterSpacing = "-3px";
    let tt = tv; while(tt > 40 && ctx.measureText(b.gros).width > LARG + 4){ tt -= 4; ctx.font = `600 ${tt}px "Newsreader"`; }
    ctx.fillStyle = BLANC.rouge; ctx.textBaseline = "alphabetic"; ctx.fillText(b.gros, M - 4, y + tv * 0.82); ctx.letterSpacing = "0px";
    return y + tv * 0.82 + 40;
  }
  if(b.kv){
    for(const [k, v] of b.kv){
      storyBlancFilet(ctx, y);
      // la valeur (à droite) garde sa place ; le libellé (à gauche) occupe le reste et, si besoin, s'écrit sur plusieurs lignes à gauche de la valeur
      ctx.font = `800 ${Math.round(t * 1.05)}px "Public Sans"`;
      let tv = Math.round(t * 1.05); while(tv > 16 && ctx.measureText(T(v)).width > LARG * 0.6){ tv -= 2; ctx.font = `800 ${tv}px "Public Sans"`; }
      const wv = ctx.measureText(T(v)).width;
      ctx.fillStyle = BLANC.encre; ctx.textAlign = "right"; ctx.fillText(T(v), L - M, y + t + 14); ctx.textAlign = "left";
      storyBlancLigne(ctx, T(k), M, y + 14, { taille: Math.round(t * 0.8), poids: 600, couleur: BLANC.gris, largeur: LARG - wv - 28, min: 16 });
      y += t + 40;
    }
    return y + 10;
  }
  return y;
}
})();
