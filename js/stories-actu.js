/* Module chargé à la demande (stories d'actualité) : voir chargerModule() dans index.html. */
/* Story d'un sujet d'actualité, sur la direction artistique commune (STORY_DA, helpers de js/stories.js) :
   - modèle A « À la une » (par défaut) : étiquette rouge + heure, gros titre, « N médias en parlent » + pastilles blanches des médias, 1 ou 2 personnalités ;
   - modèle E « En direct » : fond nuit, « ● EN DIRECT », heure de mise à jour, titre, puces (titre de presse + média).
   info = indice du sujet dans ACTUALITES.sujets, éventuellement « <indice>:<modèle> » (une, direct, facea, chiffre, date).
   Tout est enfermé dans une fonction : les constantes ne doivent pas entrer en collision avec les autres modules d'actualité. */
(()=>{
const DA = STORY_DA;
const BLEU = DA.fond, CIEL = DA.ciel, ROSE = DA.rose, ROUGE = DA.rouge, SOMBRE = DA.nuit, POINT = "#F0283F";
const norm = t => storyTypo(t);
const Y_HAUT = DA.haut, Y_BAS = STORY.bas; // zone de contenu (marque et étiquette au-dessus, pied en dessous)

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
// Texte aligné au pixel, une ligne par entrée ; renvoie la hauteur utilisée
function lignes(ctx, ls, x, y, taille, interligne, couleur){
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ls.forEach((l, i)=>{ ctx.fillStyle = typeof couleur === "function" ? couleur(i) : couleur; ctx.fillText(l, x, y + taille * 0.82 + i * taille * interligne); });
  return (ls.length - 1) * taille * interligne + taille * 1.0;
}
// Guillemets français autour d'un titre de presse, guillemets internes adoucis
function guillemets(t){
  return String(t).replace(/«\s*/g, "“").replace(/\s*»/g, "”").replace(/"([^"]*)"/g, "“$1”").replace(/"/g, "").replace(/(\p{L})'(\p{L})/gu, "$1’$2");
}
// Titre de presse prêt à être cité : sans « DIRECT. » ni rubrique en tête (« Social. »), sans point final
function titreCite(t){
  let x = norm(t);
  x = x.replace(/^(?:DIRECT|EN DIRECT|En direct)\s*[.:]\s*/, "");
  const m = /^[\p{L}0-9'’ -]{4,32}\.\s+(?=\p{Lu})/u.exec(x);
  if(m && x.length - m[0].length >= 28) x = x.slice(m[0].length);
  return minuscules(x.replace(/\.$/, ""));
}
const minuscules = storyMinuscules;
// Citation « … » mise en lignes ; si elle est trop longue, on coupe aux mots et on termine par « … »
function citation(ctx, titre, largeur, maxLignes){
  let mots = guillemets(norm(titre)).split(" ");
  let coupe = false;
  const fabrique = ()=> "« " + mots.join(" ").replace(/[\s,;:.\-–]+$/, "") + (coupe ? "…" : "") + " »";
  let ls = storyLignes(ctx, fabrique(), largeur, 99);
  while(ls.length > maxLignes && mots.length > 3){ mots.pop(); coupe = true; ls = storyLignes(ctx, fabrique(), largeur, 99); }
  if(coupe){ mots = storyCoupePropre(mots); ls = storyLignes(ctx, fabrique(), largeur, 99); } // jamais « … de la… »
  return ls;
}
// Titre à nous ; à défaut, la rubrique du thème sur une ligne et « à la une » (ou « en direct ») en rose dessous.
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
function droite(ctx, texte, yMilieu, { taille = 26, poids = 700, couleur = CIEL, espace = "0px" } = {}){
  ctx.font = `${poids} ${taille}px "Public Sans"`; ctx.letterSpacing = espace;
  ctx.fillStyle = couleur; ctx.textAlign = "right"; ctx.textBaseline = "middle";
  ctx.fillText(texte, STORY.L - STORY.marge, yMilieu + 2);
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.letterSpacing = "0px";
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

/* ----- Portraits (1 ou 2 personnalités) : portrait carré à gauche, nom et parti à droite ----- */
async function personnes(s, max = 3){
  const pers = (s.illustration?.personnes || []).slice(0, max);
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
// Portrait (ou initiales) dans un carré, avec un filet rose en bas ; renvoie le rectangle réellement occupé
function carre(ctx, p, x, y, S){
  let z;
  if(p.img) z = storyPPhoto(ctx, p.img, x, y, S, S, { centre:false });
  else {
    ctx.fillStyle = "#2F54B8"; ctx.fillRect(x, y, S, S);
    ctx.fillStyle = "#fff"; ctx.font = `900 ${Math.round(S * 0.4)}px "Public Sans"`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(storyPInitiales(p.nom) || "?", x + S / 2, y + S / 2 + 4); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    z = { x, y, w:S, h:S };
  }
  ctx.fillStyle = ROSE; ctx.fillRect(z.x, z.y + z.h, z.w, 8);
  return { ...z, h:z.h + 8 };
}
function mesurePortraits(ctx, pers, bonus = 0){
  const larg = STORY.L - 2 * STORY.marge, n = pers.length;
  if(!n) return { h:0 };
  const S = (n === 1 ? 250 + bonus : 200), gap = 32, col = n === 1 ? larg : (larg - gap) / 2;
  return { h:S + 8, S, gap, col, tn:n === 1 ? 52 : 36 };
}
function dessinePortraits(ctx, pers, y, bonus = 0){
  const { marge } = STORY, n = pers.length, m = mesurePortraits(ctx, pers, bonus);
  pers.forEach((p, i)=>{
    const x = marge + i * (m.col + m.gap);
    const z = carre(ctx, p, x, y, m.S);
    const x0 = z.x + z.w + 24, w = x + m.col - x0;
    // le plus long mot du nom doit tenir dans la colonne : on réduit la taille au besoin
    let tn = m.tn; ctx.font = `700 ${tn}px "Newsreader"`;
    while(tn > 24 && Math.max(...String(p.nom).split(/[\s]+/).map(mot=> ctx.measureText(mot).width)) > w){ tn -= 1; ctx.font = `700 ${tn}px "Newsreader"`; }
    const ls = storyLignes(ctx, p.nom, w, 3);
    let yy = y + 4 + lignes(ctx, ls, x0, y + 4, tn, 1.06, "#fff") + 12;
    const part = n === 1 ? libelleParti(p.parti) : (p.parti || "");
    if(part){ ctx.font = `700 ${n === 1 ? 26 : 21}px "Public Sans"`; ctx.fillStyle = CIEL; ctx.letterSpacing = "2px"; ctx.fillText(storyLignes(ctx, part.toUpperCase(), w, 1)[0], x0, yy + 22); ctx.letterSpacing = "0px"; }
  });
  return m.h;
}

/* ----- « N médias en parlent » : pastilles blanches, une par média ----- */
function rangeesPastilles(ctx, noms, larg, maxRangees){
  ctx.font = `700 26px "Public Sans"`;
  const w = t => { ctx.font = `700 26px "Public Sans"`; return Math.ceil(ctx.measureText(t).width) + 40; }, gap = 12;
  const items = noms.map(nm=>{ if(w(nm) <= larg) return nm; let t = nm; while(w(t + "…") > larg && t.length > 4) t = t.slice(0, -1).trimEnd(); return t + "…"; });
  const rangs = [[]]; let x = 0, i = 0;
  for(; i < items.length; i++){
    const wi = w(items[i]);
    if(x + wi > larg && rangs[rangs.length - 1].length){ if(rangs.length === maxRangees) break; rangs.push([]); x = 0; }
    rangs[rangs.length - 1].push(items[i]); x += wi + gap;
  }
  if(i < items.length){
    let reste = items.length - i; const der = rangs[rangs.length - 1];
    let tot = der.reduce((a, t)=> a + w(t) + gap, 0);
    while(der.length > 1 && tot + w("+" + reste) > larg){ const p = der.pop(); tot -= w(p) + gap; reste++; }
    der.push("+" + reste);
  }
  return { rangs, w };
}
function dessinePastilles(ctx, bloc, x, y){
  bloc.rangs.forEach((r, ri)=>{
    let cx = x; const cy = y + ri * 62;
    for(const t of r){
      const wi = bloc.w(t), reste = /^\+\d+$/.test(t);
      if(reste){ ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.strokeRect(cx + 1.5, cy + 1.5, wi - 3, 47); }
      else { ctx.fillStyle = "#fff"; ctx.fillRect(cx, cy, wi, 50); }
      ctx.font = `700 26px "Public Sans"`; ctx.fillStyle = reste ? "#fff" : BLEU; ctx.textBaseline = "middle"; ctx.textAlign = "left";
      ctx.fillText(t, cx + 20, cy + 26); ctx.textBaseline = "alphabetic";
      cx += wi + 12;
    }
  });
}

/* ----- Modèle A : « À la une » ----- */
async function dessineStyle(ctx, s, style){ // styles du test comparatif (une-photo, question, chiffre) : voir storyStyleDessiner dans js/stories.js
  const d = await storySpecSujet(s);
  if(!d || !storyStyleDessiner(ctx, style, d)) return null;
  return { nom:`actualite-${slugDep(d.accroche).slice(0, 40)}` };
}
async function dessineUne(ctx, s, style){
  if(style && style !== "bleu" && !s.sensible){ const r = await dessineStyle(ctx, s, style); if(r) return r; } // sujet sensible ou sans titre à nous : toujours le style bleu
  const { L, marge } = STORY, larg = L - 2 * marge, a0 = s.articles[0];
  const medias = [...new Set(s.articles.map(a=> a.media))].filter(Boolean), n = medias.length;
  const propre = norm(s.titrePropre?.titre);
  const pers = (await personnes(s, 2)).slice(0, 2);
  const video = premiereVideo(s);
  const mediaTitre = norm(a0.media);
  if(!medias.length || !mediaTitre) return null; // un titre de presse sans média cité ne se publie pas

  // en-tête : étiquette rouge, heure, rubrique
  // « À la une » seulement pour un sujet très repris ; sinon un libellé qui ne survend pas
  const libelle = s.sensible?.libelle || (n >= 4 ? "À la une" : n >= 2 ? "En ce moment" : "Dans la presse"); // sujet sensible : libellé prudent imposé (scripts/sujets-sensibles.cjs)
  storyCadre(ctx, libelle, { alerte:true });
  const xe = storyEtiquette(ctx, libelle, marge, DA.etiquetteY, "rouge");
  ctx.font = `600 28px "Public Sans"`; ctx.fillStyle = CIEL; ctx.textBaseline = "middle"; ctx.textAlign = "left";
  if(!s.sensible?.sansHeure) ctx.fillText(quandFr(a0.date), xe + 22, DA.etiquetteY + 27 + 2); ctx.textBaseline = "alphabetic";
  droite(ctx, theme(s)[2].toUpperCase(), DA.etiquetteY + 27, { taille:24, poids:800, couleur:CIEL, espace:"3px" });

  // gros titre : le nôtre ; à défaut, le titre de presse du premier article, entre guillemets et attribué
  const titreTexte = propre || "";
  // blocs sous le titre
  const kick = n >= 2 ? `${n} médias en parlent` : "Titre publié par";
  const past = rangeesPastilles(ctx, medias, larg, 3);
  const hMedias = 30 + 16 + (past.rangs.length - 1) * 62 + 50;
  const mp = mesurePortraits(ctx, pers);
  const gap = 34;
  // Sans portrait : photo libre de l'institution du thème (data/vignettes.json), jamais un pictogramme ; sans photo, rien
  const ill = s.illustration || {};
  const cleV = "vignette" in ill ? ill.vignette : ill.theme;
  const photoV = !pers.length && cleV && typeof VIGNETTES !== "undefined" ? VIGNETTES[cleV] : null;
  const imgV = photoV && /^photos\/vignettes\/[\w-]+\.jpe?g$/.test(photoV.chemin || "") ? await storyImage(photoV.chemin) : null;
  const reserveImg = imgV ? 430 : 0;
  const dispo = Y_BAS - Y_HAUT;
  const tMax = propre ? (pers.length ? 118 : 156) : (pers.length ? 84 : 100);
  // attribution : titre de presse cité (si le titre est le nôtre) ou « — média » (si le titre est celui du média)
  const variantes = propre && !s.sensible?.sansCitation ? [{ q:2 }, { q:1 }, { q:0 }] : [{ q:0 }]; // niveau 1 sensible : jamais de titre de presse cité
  let plan = null;
  for(const v of variantes){
    let trouve = null;
    for(let t = tMax; t >= 60 && !trouve; t -= 2){
      ctx.font = `700 ${t}px "Newsreader"`;
      const ls = propre ? storyLignes(ctx, titreTexte, larg, 99) : citation(ctx, titreCite(a0.titre), larg, 9);
      if(!ls.every(l=> ctx.measureText(l).width <= larg)) continue;
      const hT = (ls.length - 1) * t * 1.04 + t;
      if(ls.length > 4 || hT > dispo * 0.42) continue; // jamais un titre qui occupe toute la page : 4 lignes et 42 % de la hauteur au plus
      let hA = 0, ql = [];
      if(v.q){ ctx.font = `600 32px "Newsreader"`; ql = citation(ctx, titreCite(a0.titre), larg - 28, v.q); hA = 18 + (ql.length - 1) * 32 * 1.2 + 32 + 10 + 30; }
      else hA = 14 + 32;
      const tot = hT + hA + gap + hMedias + (pers.length ? gap + mp.h : 0);
      if(tot + reserveImg <= dispo) trouve = { t, ls, hT, hA, ql, v, tot };
    }
    // avec la citation, le titre doit rester gros (≥ 88 px) ; sinon on passe à la variante plus courte
    if(trouve && (!v.q || trouve.t >= 88)){ plan = trouve; break; }
  }
  if(!plan){ // dernier recours : titre minimal, sans citation
    ctx.font = `700 56px "Newsreader"`;
    const ls = propre ? storyLignes(ctx, titreTexte, larg, 4) : citation(ctx, titreCite(a0.titre), larg, 4);
    plan = { t:56, ls, hT:(ls.length - 1) * 56 * 1.04 + 56, hA:46, ql:[], v:{ q:0 }, tot:0 };
  }
  let extra = Math.max(0, dispo - plan.tot - reserveImg);
  const bonus = pers.length ? Math.min(Math.max(0, extra - 60), pers.length === 1 ? 90 : 24) : 0;
  extra -= bonus;
  // sans portrait : pas de bloc de remplacement, le texte se répartit sur la hauteur (espaces plus larges, départ un peu plus bas)
  const ec = Math.min(extra / 4, pers.length ? 40 : 110);
  let y = Y_HAUT + (pers.length ? Math.min(extra * 0.1, 20) : Math.min(extra * 0.22, 190));
  ctx.font = `700 ${plan.t}px "Newsreader"`;
  y += lignes(ctx, plan.ls, marge, y, plan.t, 1.04, "#fff");
  // attribution
  if(plan.v.q){
    y += 18 + ec / 2;
    const yq = y;
    ctx.font = `600 32px "Newsreader"`;
    const hq = lignes(ctx, plan.ql, marge + 28, y, 32, 1.2, CIEL);
    ctx.font = `800 24px "Public Sans"`; ctx.fillStyle = ROSE; ctx.letterSpacing = "1px";
    ctx.fillText(storyLignes(ctx, `— ${mediaTitre}`, larg - 28, 1)[0], marge + 28, y + hq + 10 + 22); ctx.letterSpacing = "0px";
    y += hq + 10 + 30;
    ctx.fillStyle = ROSE; ctx.fillRect(marge, yq, 8, y - yq - 4);
  } else {
    y += 14;
    ctx.font = `800 26px "Public Sans"`; ctx.fillStyle = ROSE; ctx.letterSpacing = "1px";
    if(!propre) ctx.fillText(`— ${storyLignes(ctx, mediaTitre, larg - 40, 1)[0]}`, marge, y + 24);
    ctx.letterSpacing = "0px";
    y += 32;
  }
  // « N médias en parlent » + pastilles
  y += gap + ec;
  ctx.font = `800 24px "Public Sans"`; ctx.letterSpacing = "4px"; ctx.fillStyle = CIEL;
  ctx.fillText(kick.toUpperCase(), marge, y + 22); ctx.letterSpacing = "0px";
  y += 30 + 16;
  dessinePastilles(ctx, past, marge, y);
  y += hMedias - 46;
  // personnalités
  if(pers.length){
    y += gap + ec;
    dessinePortraits(ctx, pers, y, bonus);
  } else if(imgV){
    // photo de l'institution : bloc large aux coins arrondis, légende de crédit dessous
    y += gap;
    // les vignettes sont des carrés de 320 px : un carré de 360 px au plus (agrandissement léger), centré, coins arrondis
    const cote = Math.max(260, Math.min(360, Y_BAS - y - 56)), xi = Math.round(marge + (larg - cote) / 2), hImg = cote;
    ctx.save(); ctx.beginPath(); ctx.roundRect(xi, y, cote, cote, 28); ctx.clip();
    ctx.imageSmoothingQuality = "high"; ctx.drawImage(imgV, xi, y, cote, cote);
    ctx.restore();
    ctx.font = `600 22px "Public Sans"`; ctx.fillStyle = CIEL; ctx.letterSpacing = "0px";
    ctx.fillText(storyLignes(ctx, `Photo : ${photoV.auteur || "auteur inconnu"}, ${photoV.licence}, Wikimedia Commons`, larg, 1)[0], marge, y + hImg + 36);
  }
  const credits = [...new Set(pers.filter(p=> p.img && p.credit).map(p=> p.credit))];
  const sourceTxt = s.sensible?.pied || ((plan.v.q || !propre ? "Titre repris de la presse. Chaque média est cité." : "Titre rédigé par Hémicycle France d'après la presse. Chaque média est cité.") + (credits.length ? ` Photos : ${credits.join(" ; ")}.` : "")); // sujet sensible : mentions (sources, présomption d'innocence) fabriquées par règles
  storyPied(ctx, sourceTxt, { video, accroche:"Toute l'actu politique" });
  return { nom:`actualite-${slugDep(propre || a0.titre).slice(0, 40)}` };
}

/* ----- Modèle E : « En direct » ----- */
async function dessineDirect(ctx, s){
  const { L, marge } = STORY, larg = L - 2 * marge;
  const dT = titreDe(s, "en direct");
  const video = premiereVideo(s);
  const maj = s.derniere || s.articles.map(a=> a.date).sort().pop();
  const GRIS = "#8A93B0", CLAIR = "#B6BEDB";

  storyFondTheme(ctx, true);
  storyMarque(ctx);
  // point rouge + EN DIRECT + heure de mise à jour
  ctx.fillStyle = POINT; ctx.beginPath(); ctx.arc(marge + 16, 365, 14, 0, 2 * Math.PI); ctx.fill();
  ctx.font = `800 54px "Public Sans"`; ctx.letterSpacing = "5px"; ctx.fillStyle = POINT; ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillText("EN DIRECT", marge + 52, 365 + 3); ctx.letterSpacing = "0px"; ctx.textBaseline = "alphabetic";
  droite(ctx, `mis à jour ${heureFr(maj)}`, 365, { taille:28, poids:700, couleur:GRIS });

  // citations : un titre par groupe de titres identiques (médias réunis), les plus récents d'abord
  const groupes = [];
  for(const a of [...s.articles].sort((x, y)=> String(y.date).localeCompare(String(x.date)))){
    const cle = titreCite(a.titre).toLowerCase();
    const g = groupes.find(x=> x.cle === cle);
    if(g){ if(!g.medias.includes(a.media)) g.medias.push(a.media); } else groupes.push({ cle, titre:titreCite(a.titre), medias:[a.media] });
  }
  const cites = groupes.slice(0, 3);

  // le titre prend le reste de la place (jusqu'à 112 px) ; les citations se resserrent si besoin
  let plan = null;
  const dispo = Y_BAS - 438;
  const options = [[42, 3], [40, 3], [38, 3], [36, 3], [34, 3], [32, 2], [30, 2], [28, 2], [26, 2]];
  for(const [tq, mq] of options){
    ctx.font = `700 ${tq}px "Public Sans"`;
    const bl = cites.map(c=>{ const ls = citation(ctx, c.titre, larg - 36, mq); return { ...c, ls, h: 26 + (ls.length - 1) * tq * 1.24 + tq + 10 + 28 + 26 }; });
    const hc = bl.reduce((a, b)=> a + b.h, 0);
    const f = titreFit(ctx, dT, larg, dispo - hc - 50, 112, 52);
    plan = { bl, f, tq };
    if(f.h + 50 + hc <= dispo && f.t >= 96) break;
  }
  let y = 438;
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

  storyPied(ctx, "Information en cours : elle peut changer. Titres relevés dans la presse.", { video, accroche:"Suivez le direct" });
  return { nom:`actualite-${slugDep(norm(s.titrePropre?.titre) || s.articles[0].titre).slice(0, 40)}` };
}

/* ----- Point d'entrée et aiguillage ----- */
STORY_PLUS.actualite = async (ctx, info)=>{
  const [ind, force, style] = String(info ?? "").split(":"); // « indice:modèle:style » (style : bleu, une-photo, question ou chiffre)
  const s = ACTUALITES?.sujets?.[Number(ind)];
  if(!s?.articles?.length) return null;
  const nbPers = (s.illustration?.personnes || []).length;
  let modele = force || "";
  if(!["une", "direct", "facea", "chiffre", "date"].includes(modele)){
    modele = enDirectDe(s) ? "direct"
      : nbPers >= 2 && STORY_PLUS.facea ? "facea"
      : s.chiffre && STORY_PLUS.chiffre ? "chiffre"
      : s.date?.iso && s.date.iso > aujourdhuiISO() && STORY_PLUS.date ? "date" // une date À VENIR seulement
      : "une";
  }
  if(["facea", "chiffre", "date"].includes(modele) && STORY_PLUS[modele]){
    const r = await STORY_PLUS[modele](ctx, String(Number(ind)) + (style ? ":" + style : ""));
    if(r) return r;
  }
  return modele === "direct" ? dessineDirect(ctx, s) : dessineUne(ctx, s, modele === "facea" ? "bleu" : style); // « en direct » et « face à face » (portraits) gardent leur dessin
};
})();
