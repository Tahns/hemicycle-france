/* Module chargé à la demande (publications Instagram récurrentes, scripts/contenus-auto.cjs) : voir chargerModule() dans index.html.
   Cinq dessins, tous d'après une fiche (objet « spec ») préparée à partir de NOS données officielles (jamais de presse, jamais d'avis) :
   - « aujourdhui »   : story 1080 × 1920, l'ordre du jour de la séance publique de l'Assemblée nationale du jour ;
   - « vote-jour »    : story, le scrutin public le plus important de la veille (résultat officiel, voix pour / contre / abstentions) ;
   - « comprendre »   : story, une notion de la rubrique Comprendre (règle stable, source officielle) ;
   - « chiffre-jour » : story, une donnée officielle (Insee, Eurostat…) avec sa date et sa source ;
   - « diapo »        : une image de CARROUSEL 1080 × 1350 (4:5), numérotée « n/N » : couverture, texte, liste, voix, sources.
   Même direction artistique que les autres stories (STORY_DA, storyCadre / storyPied de js/stories.js). Rien n'est ajouté à l'espace global : tout est dans STORY_PLUS. */
(() => {
const DA = STORY_DA, { L, marge } = STORY, LARG = L - 2 * marge;
const H_DIAPO = 1350, DECALAGE = 230; // le cadre des stories place le logo à 292 px : sur un format 4:5, on le remonte
const fr = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

async function polices(){
  await Promise.all(['900 100px "Public Sans"', '800 30px "Public Sans"', '700 30px "Public Sans"', '600 30px "Public Sans"', '400 30px "Public Sans"', '700 60px Newsreader', '600 60px Newsreader']
    .map(f => document.fonts.load(f).catch(() => {})));
}
// Ligne unique qui ne dépasse jamais `larg` : taille réduite jusqu'à `min`, puis texte coupé avec « … » ; renvoie { txt, taille }
function ajuster(ctx, txt, poids, taille, larg, fam = "Public Sans", ls = 0, min = 16){
  txt = String(txt == null ? "" : txt);
  if(!(larg > 0)) return { txt, taille };
  while(taille > min && largeur(ctx, txt, poids, taille, fam, ls) > larg) taille -= 2;
  if(largeur(ctx, txt, poids, taille, fam, ls) > larg){
    while(txt.length > 1 && largeur(ctx, txt + "…", poids, taille, fam, ls) > larg) txt = txt.slice(0, -1).trimEnd();
    txt += "…";
  }
  return { txt, taille };
}
// `larg` : largeur maximale (le texte rétrécit, puis est coupé, plutôt que de sortir du cadre ou de toucher un voisin)
function gras(ctx, txt, x, y, { poids = 700, taille = 30, fam = "Public Sans", couleur = "#fff", align = "left", ls = 0, larg = 0, min = 16 } = {}){
  const a = ajuster(ctx, txt, poids, taille, larg, fam, ls, min);
  ctx.font = `${poids} ${a.taille}px "${fam}"`; ctx.fillStyle = couleur; ctx.textAlign = align; ctx.textBaseline = "alphabetic";
  ctx.letterSpacing = ls + "px"; ctx.fillText(a.txt, x, y); ctx.letterSpacing = "0px"; ctx.textAlign = "left";
}
function largeur(ctx, txt, poids, taille, fam = "Public Sans", ls = 0){
  ctx.font = `${poids} ${taille}px "${fam}"`; ctx.letterSpacing = ls + "px";
  const w = ctx.measureText(txt).width; ctx.letterSpacing = "0px"; return w;
}
// Plus grand nombre de lignes (≤ `max`) pour lequel le texte, à cette taille, tient dans `haut` pixels (au moins 1)
function lignesQuiTiennent(ctx, texte, o, haut, max = 60){
  let n = max;
  while(n > 1 && storyHauteur(ctx, texte, { ...o, max: n }) > haut) n--;
  return n;
}
// Pied des stories : source (2 lignes au plus, pour ne jamais toucher l'accroche) puis « accroche → @compte » (accroche coupée si la ligne dépasse la largeur utile)
function pied(ctx, source, accroche){
  storyTexte(ctx, String(source == null ? "" : source), marge, 1524, { taille: 23, couleur: STORY.ciel, max: 2, interligne: 1.2 });
  accrocheFit(ctx, accroche, undefined);
}
function accrocheFit(ctx, accroche, y){
  const compte = typeof COMPTE_STORY === "string" ? COMPTE_STORY : "@hemicyclefrance";
  const f = t => { ctx.font = '700 24px "Public Sans"'; return ctx.measureText(`${t} → ${compte}`).width; };
  let a = String(accroche || "");
  if(f(a) > LARG){ while(a.length > 1 && f(a + "…") > LARG) a = a.slice(0, -1).trimEnd(); a += "…"; }
  storyAccroche(ctx, a, y);
}
const T = t => storyTypo(t); // apostrophes typographiques, espaces normalisées
/* Styles du test comparatif (champ `style` de la fiche : bleu, une-photo, question, chiffre) : la fiche `d` complète le thème (clé de THEMES_ACTU : photo d'institution ou motif) ;
   renvoie false si le style bleu historique doit être dessiné. Fiches officielles : aucune presse, aucun portrait. */
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

// Trois cases « pour / contre / abstentions » (aucune couleur partisane) ; renvoie l'ordonnée sous les cases
function cases(ctx, y, h, liste, taille = 92){
  const gap = 18, w = (LARG - 2 * gap) / 3;
  let tn = taille; // même taille pour les trois nombres, réduite pour qu'aucun ne déborde de sa case
  for(const [, n] of liste) while(tn > 30 && largeur(ctx, fr(n ?? 0), 900, tn, "Public Sans", -2) > w - 28) tn -= 2;
  liste.forEach(([nom, n], i) => {
    const x = marge + i * (w + gap);
    storyCarte(ctx, x, y, w, h);
    const type = /^pour/i.test(nom) ? "pour" : /^contre/i.test(nom) ? "contre" : /^abst/i.test(nom) ? "abst" : null; // « Pour » vert, « Contre » rouge, « Abstentions » orange (le libellé reste écrit)
    gras(ctx, fr(n ?? 0), x + w / 2, y + h * 0.58, { poids: 900, taille: tn, couleur: (type && storyVoixCouleur(type, "creme")) || STORY.encre, align: "center", ls: -2, larg: w - 28, min: 20 });
    gras(ctx, nom.toUpperCase(), x + w / 2, y + h * 0.58 + 44, { poids: 800, taille: 24, couleur: STORY.pale, align: "center", ls: 3, larg: w - 20, min: 14 });
  });
  return y + h;
}

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
  let y = storyCadre(ctx, "Séance publique", { etiquette: "rouge" });
  const titre = T("Aujourd'hui à l'Assemblée");
  const tt = storyTailleFit(ctx, titre, y, y + 2 * 92, { tMax: 88, tMin: 60, police: "Newsreader", poids: 600, interligne: 1.04 });
  y = storyTexte(ctx, titre, marge, y, { taille: tt, poids: 600, police: "Newsreader", couleur: "#fff", max: 2, interligne: 1.04 });
  gras(ctx, maj(s.jour), marge, y + 44, { poids: 700, taille: 36, couleur: DA.ciel, larg: LARG, min: 22 });
  y += 96;
  const bas = 1480, tag = { qag: "Questions orales", vote: "Vote solennel", texte: "À l'ordre du jour" };
  const lignes = { taille: 38, poids: 600, largeur: LARG - 56, max: 4, interligne: 1.2 };
  const hCarte = p => 24 + 24 + 16 + storyHauteur(ctx, T(p.t), lignes) + 18;
  // nombre de points dont les cartes tiennent ; s'il en reste (ou si d'autres points existent), la ligne « + N autres » garde sa place sous la dernière carte
  let n = s.points.length;
  const finCartes = k => s.points.slice(0, k).reduce((a, p) => a + hCarte(p) + 14, y);
  while(n > 1 && finCartes(n) - 14 > ((n < s.points.length || s.autres > 0) ? bas - 46 : bas)) n--;
  let reste = s.points.length - n;
  for(const p of s.points.slice(0, n)){
    const h = hCarte(p);
    storyCarte(ctx, marge, y, LARG, h);
    gras(ctx, T(tag[p.k] || tag.texte).toUpperCase(), marge + 28, y + 24 + 16, { poids: 800, taille: 20, couleur: p.k === "vote" ? STORY.rouge : p.k === "qag" ? STORY.bleu : STORY.pale, ls: 3, larg: LARG - 56, min: 14 });
    storyTexte(ctx, T(p.t), marge + 28, y + 24 + 24 + 8, { ...lignes, couleur: STORY.encre });
    y += h + 14;
  }
  const autres = (s.autres || 0) + reste;
  if(autres > 0) gras(ctx, `+ ${autres} autre${autres > 1 ? "s" : ""} point${autres > 1 ? "s" : ""} à l'ordre du jour`, marge, Math.min(y + 30, bas + 24), { poids: 700, taille: 28, couleur: DA.ciel, larg: LARG, min: 18 });
  pied(ctx, s.source || "Source : Assemblée nationale, ordre du jour des séances publiques.", "Tout l'agenda");
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
  const verdict = s.verdict === "adopte" ? "Adopté\u2060✓" : "Rejeté\u2060✕"; // signe collé au mot : la couleur n'est jamais seule
  const voix = (n, mot) => `${fr(n ?? 0)} ${mot}`;
  if(await dessinerStyle(ctx, s, {
    cle: "assemblee", fond: "noir", categorie: "Le vote du jour",
    accroche: s.style === "question" ? "Ce texte a-t-il été adopté ?" : `${verdict} à l'Assemblée`,
    essentiel: `${voix(s.pour, "voix pour")}, ${fr(s.contre ?? 0)} contre, ${fr(s.abst ?? 0)} abstention${(s.abst ?? 0) > 1 ? "s" : ""} : ${storyMots(T(s.dossier || s.objet), 10)}`,
    puces: [`${verdict} : ${voix(s.pour, "voix pour")}`, voix(s.contre, "voix contre"), voix(s.abst, (s.abst ?? 0) > 1 ? "abstentions" : "abstention")],
    chiffre: { valeur: fr(s.pour ?? 0), legende: "voix pour", type: "pour" }, contexte: `${verdict} (${fr(s.contre ?? 0)} contre, ${fr(s.abst ?? 0)} abstentions) : ${storyMots(T(s.dossier || s.objet), 12)}`,
    source: s.sourceTxt, cta: "Chaque jour de séance", colorerVoix: true,
  })) return { nom: `vote-jour-${s.numero || "x"}` };
  let y = storyCadre(ctx, `Le vote du jour · ${s.date}`, { etiquette: "blanc" });
  gras(ctx, String(s.type || "Scrutin public").toUpperCase(), marge, y + 30, { poids: 700, taille: 28, couleur: DA.ciel, ls: 4, larg: LARG, min: 18 });
  y += 62;
  const tv = 170;
  storyVerdict(ctx, s.verdict, s.verdict === "adopte" ? "Adopté" : "Rejeté", marge, y + tv * 0.82, tv);
  y += tv * 0.82 + 40;
  const yCases = 1180;
  const objet = T(s.objet);
  const tt = storyTailleFit(ctx, objet, y, yCases - 150, { tMax: 60, tMin: 38, police: "Newsreader", poids: 600, interligne: 1.08 });
  y = storyTexte(ctx, objet, marge, y, { taille: tt, poids: 600, police: "Newsreader", couleur: "#fff", max: 6, interligne: 1.08 });
  if(s.dossier) y = storyTexte(ctx, T(`Texte : ${s.dossier}`), marge, y + 6, { taille: 28, poids: 600, couleur: DA.ciel, max: 3, interligne: 1.2 });
  cases(ctx, yCases, 250, [["Pour", s.pour], ["Contre", s.contre], ["Abstentions", s.abst]]);
  pied(ctx, s.sourceTxt, "Chaque jour de séance");
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
  let y = storyCadre(ctx, `Comprendre · notion ${s.n}/${s.total}`, { etiquette: "blanc" });
  const titre = T(s.titre), texte = T(s.texte);
  const tt = storyTailleFit(ctx, titre, y, y + 3 * 90, { tMax: 82, tMin: 50, police: "Newsreader", poids: 600, interligne: 1.05 });
  y = storyTexte(ctx, titre, marge, y, { taille: tt, poids: 600, police: "Newsreader", couleur: "#fff", max: 3, interligne: 1.05 });
  y += 22;
  const bas = 1480, hc = bas - y;
  storyCarte(ctx, marge, y, LARG, hc);
  const t = storyTailleFit(ctx, texte, y + 36, bas - 36, { tMax: 46, tMin: 24, poids: 500, largeur: LARG - 72, interligne: 1.34 });
  const o = { taille: t, poids: 500, largeur: LARG - 72, interligne: 1.34 };
  const nl = lignesQuiTiennent(ctx, texte, o, hc - 60, 30); // texte très long : coupé (« … ») pour rester dans la carte
  storyTexte(ctx, texte, marge + 36, y + 30, { ...o, couleur: STORY.encre, max: nl });
  pied(ctx, s.sourceTxt, "Une notion par semaine");
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
  let y = storyCadre(ctx, "Le chiffre du jour", { etiquette: "rouge" });
  const libelle = T(s.libelle);
  const tl = storyTailleFit(ctx, libelle, y, y + 2 * 80, { tMax: 76, tMin: 46, police: "Newsreader", poids: 600, interligne: 1.05 });
  y = storyTexte(ctx, libelle, marge, y, { taille: tl, poids: 600, police: "Newsreader", couleur: "#fff", max: 2, interligne: 1.05 });
  y += 10;
  y = storyChiffreHeros(ctx, T(s.valeur), marge, y + 230, "#fff", 250);
  y += 36;
  if(s.soustitre) y = storyTexte(ctx, T(s.soustitre), marge, y - 6, { taille: 36, poids: 700, couleur: DA.rose, max: 2, interligne: 1.15 });
  const bas = 1480;
  if(s.periode){
    const a = ajuster(ctx, s.periode, 700, 28, LARG - 40, "Public Sans", 0, 18);
    const w = largeur(ctx, a.txt, 700, a.taille) + 40;
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.strokeRect(marge + 1.5, y + 11.5, w - 3, 53);
    gras(ctx, a.txt, marge + 20, y + 47, { taille: a.taille });
    y += 76 + 18;
  }
  const lignes = (s.lignes || []).filter(Boolean).map(T);
  if(lignes.length && bas - y > 110){
    // taille puis nombre de lignes par élément réduits jusqu'à ce que tout tienne dans la carte ; à défaut, les derniers éléments sont retirés
    const mesure = (liste, tl, ml) => 2 * 30 + liste.reduce((a, l) => a + storyHauteur(ctx, l, { taille: tl, poids: 500, largeur: LARG - 64, max: ml, interligne: 1.28 }) + 12, 0);
    let liste = lignes, tl = 36, ml = 5;
    const tient = () => mesure(liste, tl, ml) <= bas - y;
    while(!tient() && tl > 26) tl -= 2;
    while(!tient() && ml > 1) ml--;
    while(!tient() && liste.length > 1) liste = liste.slice(0, -1);
    const h = Math.min(bas - y, mesure(liste, tl, ml));
    storyCarte(ctx, marge, y, LARG, h);
    let yy = y + 26;
    for(const l of liste) yy = storyTexte(ctx, l, marge + 32, yy, { taille: tl, poids: 500, couleur: STORY.encre, largeur: LARG - 64, max: ml, interligne: 1.28 }) + 12;
  }
  pied(ctx, s.sourceTxt, "Un chiffre par jour");
  return { nom: `chiffre-${s.cle || "x"}` };
};

/* ---------- Image de carrousel (1080 × 1350) ---------- */
// Cadre des stories décalé vers le haut ; renvoie l'ordonnée où commence le contenu
function cadreDiapo(ctx, surtitre, opts){
  storyFondTheme(ctx); // fond généré à la taille de l'image (1080 × 1350), puis cadre décalé sans refaire le fond
  ctx.save(); ctx.translate(0, -DECALAGE);
  const y = storyCadre(ctx, surtitre, { ...opts, sansFond: true }) - DECALAGE;
  ctx.restore();
  return y;
}
STORY_PLUS.diapo = async (ctx, s) => {
  if(!s || !s.titre || !Array.isArray(s.corps)) return null;
  await polices();
  const bas = H_DIAPO - 160, cv = Boolean(s.couverture);
  let y = cadreDiapo(ctx, T(s.kicker || "Hémicycle France"), { etiquette: cv ? "rouge" : "blanc" }); // 190
  if(s.total > 1) gras(ctx, `${s.n}/${s.total}`, L - marge, 62 + 14, { poids: 800, taille: 34, couleur: DA.ciel, align: "right", ls: 2 });
  y += 8;
  const titre = T(s.titre);
  const tMax = cv ? 88 : 76, tMin = cv ? 52 : 44, maxL = cv ? 6 : 3;
  const tt = storyTailleFit(ctx, titre, y, y + maxL * (tMax + 6), { tMax, tMin, police: "Newsreader", poids: 600, interligne: 1.06 });
  y = storyTexte(ctx, titre, marge, y, { taille: tt, poids: 600, police: "Newsreader", couleur: "#fff", max: maxL, interligne: 1.06 });
  y += 22;
  // Les blocs sont dessinés dans l'ordre ; la taille du texte est la plus grande pour laquelle tout tient avant `bas`,
  // puis (à la taille minimale) le nombre de lignes par bloc est réduit (« … »), enfin les derniers blocs qui ne tiennent pas sont omis : rien ne déborde sur la source
  const hauteurs = (taille, cap) => s.corps.reduce((a, b) => a + hauteurBloc(ctx, b, taille, cap), 0);
  let taille = cv ? 36 : 44, cap = 99;
  while(taille > 26 && y + hauteurs(taille, cap) > bas) taille -= 2;
  while(cap > 1 && y + hauteurs(taille, cap) > bas) cap = cap > 8 ? 8 : cap - 1;
  for(const b of s.corps){
    if(y + hauteurBloc(ctx, b, taille, cap) > bas) break;
    y = dessinerBloc(ctx, b, y, taille, bas, cap);
  }
  storyTexte(ctx, T(s.source || "Source : données officielles."), marge, H_DIAPO - 142, { taille: 23, couleur: STORY.ciel, max: 2, interligne: 1.2 });
  accrocheFit(ctx, T(s.accroche || (s.n < s.total ? "Faites défiler" : "Toute l'actu politique")), H_DIAPO - 40);
  return { nom: `diapo-${s.n || 1}` };
};
// Mesure d'un bloc de carrousel (même logique que dessinerBloc, sans dessiner) ; `cap` : nombre de lignes maximal par paragraphe
function hauteurBloc(ctx, b, t, cap = 99){
  const tp = b.taille ? Math.min(b.taille, t) : t;
  if(b.p) return storyHauteur(ctx, T(b.p), { taille: tp, poids: b.poids || 500, max: Math.min(b.max || 8, cap), interligne: 1.3 }) + 12;
  if(b.li) return b.li.reduce((a, x) => a + storyHauteur(ctx, T(x), { taille: t, poids: 500, largeur: LARG - 44, max: Math.min(6, cap), interligne: 1.28 }) + 18, 0);
  if(b.carte) return 2 * 30 + storyHauteur(ctx, T(b.carte), { taille: t, poids: 600, largeur: LARG - 64, max: Math.min(8, cap), interligne: 1.26 }) + 20;
  if(b.cases) return 280 + 16;
  if(b.gros) return 150 * 0.82 + 40;
  if(b.kv) return b.kv.length * (t + 40) + 10;
  return 0;
}
function dessinerBloc(ctx, b, y, t, bas, cap = 99){
  const tp = b.taille ? Math.min(b.taille, t) : t;
  if(b.p){
    return storyTexte(ctx, T(b.p), marge, y, { taille: tp, poids: b.poids || 500, couleur: b.couleur === "ciel" ? DA.ciel : "#fff", max: Math.min(b.max || 8, cap), interligne: 1.3 }) + 12;
  }
  if(b.li){
    for(const x of b.li){
      const o = { taille: t, poids: 500, largeur: LARG - 44, max: Math.min(6, cap), interligne: 1.28 };
      ctx.fillStyle = DA.rose; ctx.fillRect(marge, y + t * 0.42, 14, 14);
      y = storyTexte(ctx, T(x), marge + 40, y, { ...o, couleur: "#fff" }) + 18;
    }
    return y;
  }
  if(b.carte){
    const o = { taille: t, poids: 600, largeur: LARG - 64, max: Math.min(8, cap), interligne: 1.26 };
    const h = 2 * 30 + storyHauteur(ctx, T(b.carte), o);
    storyCarte(ctx, marge, y, LARG, h);
    storyTexte(ctx, T(b.carte), marge + 32, y + 28, { ...o, couleur: STORY.encre });
    return y + h + 20;
  }
  if(b.cases) return cases(ctx, y + 10, 280, b.cases, 100) + 16;
  if(b.gros){
    const tv = 150; gras(ctx, b.gros, marge - 4, y + tv * 0.82, { poids: 900, taille: tv, ls: -tv * 0.03, larg: LARG + 4, min: 40 });
    return y + tv * 0.82 + 40;
  }
  if(b.kv){
    for(const [k, v] of b.kv){
      ctx.fillStyle = DA.filet; ctx.fillRect(marge, y, LARG, 2);
      // la valeur (à droite) garde sa place ; le libellé (à gauche) rétrécit, puis est coupé, avant de la toucher
      const av = ajuster(ctx, T(v), 900, Math.round(t * 1.1), LARG * 0.62, "Public Sans", 0, 16);
      gras(ctx, av.txt, L - marge, y + t + 18, { poids: 900, taille: av.taille, align: "right" });
      gras(ctx, T(k), marge, y + t + 14, { poids: 600, taille: Math.round(t * 0.8), couleur: DA.ciel, larg: LARG - largeur(ctx, av.txt, 900, av.taille) - 28, min: 14 });
      y += t + 40;
    }
    return y + 10;
  }
  return y;
}
})();
