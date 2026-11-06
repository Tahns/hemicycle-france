/* Module chargé à la demande (stories d'actualité) : voir chargerModule() dans index.html.
   Trois types sur la BASE BLANCHE (js/stories-blanc.js) : « le chiffre » (STORY_PLUS.chiffre), « face à face » (STORY_PLUS.facea), « date à retenir » (STORY_PLUS.date).
   Un élément géant (nombre, deux portraits, date), notre titre en serif gras, puis « L'essentiel », la citation de presse attribuée au média et le contexte, séparés par des filets gris.
   Tout est vectoriel (formes = chemins du canvas) ; seuls les portraits et photos réels sont des images, toujours dans un cadre net sur le blanc. Aucun texte n'est jamais coupé.
   Tout est dans une fonction : aucun nom ne s'ajoute à l'espace global en dehors de STORY_PLUS. */
(() => {
const LARG = STORY.L - 2 * BLANC.marge;
const SERIF = BLANC.serif;

/* ---------- Données ---------- */
const sujetDe = info => ACTUALITES?.sujets?.[Number(String(info).split(":")[0])] || null;
const styleDe = info => storyStyleValide(String(info).split(":")[1]); // « indice:style » (bleu, une-photo, question, chiffre)
const sansLead = t => t.replace(/^Titre rédigé par Hémicycle France d'après la presse\.\s*/, "");
// Mises en page « photo », « question », « chiffre » : la fiche du sujet (storySpecSujet) complétée par le contenu propre au modèle ; renvoie false si la mise en page du modèle doit être dessinée
async function dessinerStyle(ctx, s, info, surcharge){
  const style = styleDe(info);
  if(style === "bleu" || s.sensible) return false;
  const d = await storySpecSujet(s);
  if(!d) return false;
  return Boolean(storyStyleDessiner(ctx, style, { ...d, ...surcharge(d) }));
}
const rubrique = s => (THEMES_ACTU[s?.illustration?.theme] || THEMES_ACTU.politique)[2];
// Notre titre ; à défaut, un titre de repli neutre (jamais un titre de presse en grand titre)
const titreAffiche = s => storyTypo(s.accroche || s.titrePropre?.accroche || (typeof s.titrePropre?.titre === "string" ? s.titrePropre.titre : "")) || `${rubrique(s)} · en ce moment`;
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
const maj1 = t => String(t).charAt(0).toUpperCase() + String(t).slice(1);
const nomFichier = (pref, s) => `${pref}-${slugDep(titreAffiche(s)).slice(0, 40)}`;
const joursAvant = iso => {
  const auj = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const p = s => { const [a, m, j] = s.split("-").map(Number); return Date.UTC(a, m - 1, j); };
  return Math.round((p(iso) - p(auj)) / 864e5);
};
const quandDe = s => s.sensible?.sansHeure ? "" : storyBlancQuand(s.articles?.[0]?.date);

/* ---------- Éléments communs ---------- */
// Pied : médias cités (liste complète) + éventuelle mention (crédits des photos), ligne vidéo
const piedDe = (ctx, medias, extra, video) => storyBlancPiedPlan(ctx, [extra, storyBlancSources(medias)].filter(Boolean).join(" "), { video });
const basDe = pied => BLANC.bas - pied.h - 30;
// Fond blanc, bandeau, rubrique ; le plan (déjà établi) est ensuite dessiné puis le pied
function poser(ctx, plan, pied, rub, quand = ""){
  storyBlancFond(ctx);
  storyBlancTete(ctx, { rubrique:rub, quand });
  plan.dessiner();
  storyBlancPiedDessiner(ctx, pied);
}
// Éléments de la « carte » (ancienne carte crème, désormais simples blocs sur le blanc) : l'essentiel, la citation de presse attribuée, le contexte. tq : taille du texte principal ;
// renvoie null si un texte ne tient pas en entier à cette taille.
function blocsCarte(ctx, d, tq, tc = 27){
  const items = [], avecEss = Boolean(d.essentiel);
  if(avecEss){
    if(tq < 34) return null; // l'essentiel reste lisible sur téléphone : 34 px au minimum
    const e = storyBlancBlocTexte(ctx, d.essentiel, { taille:tq, poids:600, largeur:LARG, interligne:1.24, couleur:BLANC.texte });
    if(!e.ok) return null;
    items.push({ h:24 + 14 + e.h, avant:40, dessiner(c, x, y){ storyBlancLabel(ctx, "L'essentiel", { taille:24 }).dessiner(c, x, y); e.dessiner(c, x, y + 38); } });
  }
  if(d.citation){
    const ci = storyBlancCitation(ctx, d.citation, d.media, { tailles:[avecEss ? Math.max(24, tq - 10) : tq], note:d.note || "", avant:avecEss ? 30 : 40 });
    if(!ci) return null;
    items.push(ci.options[0]);
  }
  if(d.contexte?.length){
    const faits = [];
    for(const e of d.contexte){
      const t = storyBlancBlocTexte(ctx, e.texte, { taille:tc, poids:600, largeur:LARG, interligne:1.28, couleur:BLANC.encre });
      const src = e.source ? storyBlancBlocTexte(ctx, `Source : ${e.source}`, { taille:22, poids:600, largeur:LARG, interligne:1.2, couleur:BLANC.gris }) : null;
      if(!t.ok || (src && !src.ok)) return null;
      faits.push({ t, src });
    }
    const h = 2 + 24 + 24 + 14 + faits.reduce((a, f) => a + f.t.h + (f.src ? 14 + f.src.h : 0) + 14, 0) - 14;
    items.push({ h, avant:40, dessiner(c, x, y){
      storyBlancFilet(c, y);
      storyBlancLabel(ctx, "Le contexte", { taille:24, couleur:BLANC.bleu }).dessiner(c, x, y + 26);
      let yy = y + 26 + 24 + 14;
      for(const f of faits){ f.t.dessiner(c, x, yy); yy += f.t.h; if(f.src){ f.src.dessiner(c, x, yy + 14); yy += 14 + f.src.h; } yy += 14; }
    } });
  }
  return items;
}
const TAILLES_CARTE = [40, 38, 36, 34, 32, 30, 28, 26, 24];
// Variantes d'une carte du plus complet au plus court : d'abord moins de faits de contexte, puis sans la citation de presse, et seulement ensuite l'essentiel réduit à ses premières
// propositions complètes ; en dernier recours plus de carte du tout (jamais un texte coupé par « … »)
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
  out.push({});
  return out;
}
// Essais de mise en page : pour chaque variante de la carte (de la plus complète à la plus pauvre) puis chaque taille, `fabrique(items de la carte)` renvoie la liste d'éléments à empiler
function essaisCarte(ctx, d, tcs, fabrique, tailles = TAILLES_CARTE, filtre = () => true){
  const essais = [];
  for(const dv of variantesCarte(d).filter(filtre)) for(const tq of tailles) for(const tc of tcs) essais.push(() => { const it = blocsCarte(ctx, dv, tq, tc); return it ? fabrique(it) : null; });
  return essais;
}
// Titre (notre accroche, jamais coupée) en options de taille décroissante
const blocTitre = (ctx, titre, tMax, rang = () => 3, tMin = 44) => ({ options:storyBlancOptions(ctx, titre, { tailles:storyBlancTailles(tMax, tMin, 4), max:5, poids:800, police:SERIF, interligne:1.13, ls:t => -t * 0.004, couleur:BLANC.encre, avant:30, rang }) });

/* ---------- C. Le chiffre ---------- */
// Chiffre sur une seule ligne : les nombres en très gros (serif), les petits mots (« à », « près de ») en petit et en rouge
const jetons = v => String(v).trim().split(/\s+/).map(t => ({ t, grand: /[\d%€$]/.test(t) }));
function mesurer(ctx, txt, poids, taille, fam, ls = 0){
  ctx.font = `${poids} ${taille}px "${fam}"`; ctx.letterSpacing = ls + "px";
  const w = ctx.measureText(txt).width; ctx.letterSpacing = "0px"; return w;
}
function largeurChiffre(ctx, jt, T){
  let w = 0;
  jt.forEach((j, i) => {
    w += j.grand ? mesurer(ctx, j.t, 800, T, SERIF, -T * 0.02) : mesurer(ctx, j.t, 800, T * 0.36, "Public Sans");
    if(i) w += T * (j.grand && jt[i - 1].grand ? 0.12 : 0.14);
  });
  return w + T * 0.05;
}
function ecrireChiffre(ctx, jt, x, y, T){
  let cx = x;
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  jt.forEach((j, i) => {
    if(i) cx += T * (j.grand && jt[i - 1].grand ? 0.12 : 0.14);
    if(j.grand){ ctx.font = `800 ${T}px "${SERIF}"`; ctx.letterSpacing = `${-T * 0.02}px`; ctx.fillStyle = BLANC.encre; ctx.fillText(j.t, cx, y); ctx.letterSpacing = "0px"; cx += mesurer(ctx, j.t, 800, T, SERIF, -T * 0.02); }
    else { ctx.font = `800 ${T * 0.36}px "Public Sans"`; ctx.fillStyle = BLANC.rouge; ctx.fillText(j.t, cx, y); cx += mesurer(ctx, j.t, 800, T * 0.36, "Public Sans"); }
  });
}
STORY_PLUS.chiffre = async (ctx, info) => {
  const s = sujetDe(info), ch = s?.chiffre;
  if(!ch?.valeur) return null;
  await storyBlancPolices();
  if(await dessinerStyle(ctx, s, info, d => ({ source:sansLead(d.source), cta:"Tous les chiffres" }))) return { nom: nomFichier("chiffre", s) };
  const medias = mediasDe(s), titre = titreAffiche(s);
  const cles = String(ch.valeur).match(/\d+/g) || [];
  const art = articleCite(s, cles);
  const d = {
    essentiel: storyTypo(s.essentiel || s.titrePropre?.essentiel || ""),
    citation: art ? titreCite(art.titre) : "", media: art?.media || "",
    note: art ? (medias.length >= 2 ? "Chiffre tel que rapporté par plusieurs médias" : "Chiffre tel que rapporté par la presse") : "",
    contexte: contexteSur(s)
  };
  const pied = piedDe(ctx, medias, "", videoDe(s)), haut = STORY_HAUT_BLANC, bas = basDe(pied), jt = jetons(ch.valeur);
  let tnMax = 300; while(tnMax > 44 && largeurChiffre(ctx, jt, tnMax) > LARG) tnMax -= 2; // chiffre très long : il rétrécit plutôt que de sortir de l'image
  const unite = String(ch.unite || "").trim();
  const nombre = { options: storyBlancTailles(tnMax, Math.min(tnMax, Math.max(110, Math.round(tnMax * 0.45))), 10).map(tn => ({ h:Math.round(tn * 0.72) + (/[,.]/.test(String(ch.valeur)) ? Math.round(tn * 0.2) : 0), avant:30, rang:0, dessiner(c, x, y){ ecrireChiffre(c, jt, x - 4, y + Math.round(tn * 0.72), tn); } })) };
  const barre = storyBlancBloc(14, (c, x, y) => { c.fillStyle = BLANC.rouge; c.fillRect(x, y, 150, 14); });
  const legende = unite ? { options:storyBlancOptions(ctx, unite, { tailles:storyBlancTailles(76, 44), max:4, poids:800, police:SERIF, interligne:1.13, ls:t => -t * 0.01, couleur:BLANC.encre, avant:22, rang:() => 1 }) } : null;
  const plan = storyBlancPremier(ctx, essaisCarte(ctx, d, [27], carte => [barre, nombre, legende && legende.options.length ? legende : null, blocTitre(ctx, titre, 66, () => 3, 44), ...carte]), { haut, bas, ecartMax:50 });
  if(!plan) return null; // l'accroche et le chiffre ne laissent aucune place : pas de story plutôt qu'un texte coupé
  poser(ctx, plan, pied, "Le chiffre du jour", quandDe(s));
  return { nom: nomFichier("chiffre", s) };
};

/* ---------- F. Face à face ---------- */
const PARTI_LIBELLE = { PP: "Place publique", PS: "Parti socialiste", SOC: "Socialistes", LFI: "LFI", RN: "Rassemblement national", LR: "Les Républicains", RE: "Renaissance", REN: "Renaissance", EELV: "Les Écologistes", LE: "Les Écologistes", ECO: "Écologistes", PCF: "PCF", HOR: "Horizons", REC: "Reconquête", MoDem: "MoDem" };
const libelleParti = p => PARTI_LIBELLE[p] || p || "";
// Les deux portraits côte à côte (cadres nets 4:5), « VS » dans un carré noir entre eux, noms et partis dessous, centrés ; une photo trop petite n'est pas agrandie au-delà de 1,5 fois
function blocPortraits(ctx, pers, imgs, S){
  const W = Math.round(S), H = Math.round(S * 1.2), gap = 80, x1 = Math.round((LARG - 2 * W - gap) / 2), colW = W + 40;
  const noms = pers.map(p => storyBlancBlocTexte(ctx, p.nom, { taille:38, poids:800, police:SERIF, largeur:colW, interligne:1.14, ls:-0.2, couleur:BLANC.encre }));
  const partis = pers.map(p => p.parti ? storyBlancBlocTexte(ctx, libelleParti(p.parti).toUpperCase(), { taille:22, poids:800, largeur:colW, interligne:1.2, ls:2, couleur:BLANC.gris }) : null);
  if(noms.some(n => !n.ok || n.l.length > 3) || partis.some(p => p && !p.ok)) return null;
  const hNom = Math.max(...noms.map(n => n.h)), hPar = Math.max(...partis.map(p => p ? p.h : 0));
  return { S:W, h:H + 20 + hNom + (hPar ? 14 + hPar : 0), avant:34, rang:0, dessiner(c, x, y){
    [x1, x1 + W + gap].forEach((px, i) => {
      storyBlancCarrePortrait(c, imgs[i], pers[i].nom, x + px, y, W, H);
      c.fillStyle = BLANC.encre; c.fillRect(x + px, y + H, W, 5);
      const cx = x + px + W / 2;
      noms[i].l.forEach((l, k) => { c.font = `800 38px "${SERIF}"`; c.letterSpacing = "-0.2px"; c.fillStyle = BLANC.encre; c.textAlign = "center"; c.textBaseline = "alphabetic"; c.fillText(l.replace(/[ ⁠]/g, m => m === " " ? " " : ""), cx, y + H + 20 + 38 * 0.82 + k * 38 * 1.1); c.letterSpacing = "0px"; });
      if(partis[i]){ const yp = y + H + 20 + hNom + 14; partis[i].l.forEach((l, k) => { c.font = `800 22px "Public Sans"`; c.letterSpacing = "2px"; c.fillStyle = BLANC.gris; c.textAlign = "center"; c.fillText(l, cx, yp + 22 * 0.82 + k * 22 * 1.2); c.letterSpacing = "0px"; }); }
    });
    // « VS » : carré noir plein entre les deux portraits, lettres blanches
    const cx = x + x1 + W + gap / 2, cy = y + H / 2, r = 46;
    c.fillStyle = BLANC.papier; c.fillRect(cx - r - 8, cy - r - 8, 2 * r + 16, 2 * r + 16);
    c.fillStyle = BLANC.rouge; c.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    c.font = `800 44px "${SERIF}"`; c.fillStyle = BLANC.papier; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("VS", cx, cy + 3); c.textAlign = "left"; c.textBaseline = "alphabetic";
  } };
}
STORY_PLUS.facea = async (ctx, info) => {
  const s = sujetDe(info), pers = (s?.illustration?.personnes || []).slice(0, 2);
  if(!s || pers.length < 2) return null;
  await storyBlancPolices();
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
  const d = { essentiel: storyTypo(s.essentiel || s.titrePropre?.essentiel || ""), citation: art ? titreCite(art.titre) : "", media: art?.media || "", contexte: contexteSur(s) };
  const uniq = [...new Set(credits)];
  const pied = piedDe(ctx, medias, uniq.length ? `Photos : ${uniq.join(" ; ")}.` : "", videoDe(s)), haut = STORY_HAUT_BLANC, bas = basDe(pied);
  const por = { options:[400, 372, 344, 316, 288, 260, 232, 204].map(S => blocPortraits(ctx, pers, imgs, S)).filter(Boolean) };
  if(!por.options.length) return null;
  // les portraits sont l'élément fort : tant que l'essentiel et la citation peuvent rester entiers, on préfère un texte un peu plus petit à des portraits de moins de 300 px
  const fab = carte => [blocTitre(ctx, titre, 92, () => 3, 52), por, ...carte], tailles = [36, 34, 32, 30, 28, 26, 24], params = { haut, bas, ecartMax:30 };
  const plan = storyBlancPremier(ctx, essaisCarte(ctx, d, [27, 24], fab, tailles, v => v.essentiel === d.essentiel && v.citation === d.citation), params, p => p.choix[1].S >= 300)
    || storyBlancPremier(ctx, essaisCarte(ctx, d, [27, 24], fab, tailles), params);
  if(!plan) return null;
  poser(ctx, plan, pied, "Face à face", quandDe(s));
  return { nom: nomFichier("face-a-face", s) };
};

/* ---------- G. Date à retenir ---------- */
// Petites étiquettes rectangulaires à liseré gris (jour de la semaine, rubrique, médias), sur une ou deux rangées
function blocEtiquettes(ctx, textes){
  const pw = t => mesurer(ctx, t, 700, 28, "Public Sans") + 40, rangees = [[]]; let xr = 0;
  for(const t of textes){ const w = pw(t); if(xr + w > LARG && rangees[rangees.length - 1].length){ rangees.push([]); xr = 0; } rangees[rangees.length - 1].push(t); xr += w + 14; }
  const h = rangees.length * 56 + (rangees.length - 1) * 14;
  return { h, avant:26, rang:1, dessiner(c, x, y){
    rangees.forEach((r, i) => { let px = x; const py = y + i * 70; for(const t of r){ const w = pw(t);
      c.strokeStyle = "#B9BCC7"; c.lineWidth = 2; c.strokeRect(px + 1, py + 1, w - 2, 54);
      c.font = `700 28px "Public Sans"`; c.fillStyle = BLANC.encre; c.textAlign = "left"; c.textBaseline = "alphabetic"; c.fillText(t, px + 20, py + 38); px += w + 14; } });
  } };
}
STORY_PLUS.date = async (ctx, info) => {
  const s = sujetDe(info), dt = s?.date;
  if(!dt?.iso || !dt.jour || !dt.mois) return null;
  await storyBlancPolices();
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
  const d = { essentiel: storyTypo(s.essentiel || s.titrePropre?.essentiel || ""), citation: art ? titreCite(art.titre) : "", media: art?.media || "", contexte: contexteSur(s) };
  const pied = piedDe(ctx, medias, "", videoDe(s)), haut = STORY_HAUT_BLANC, bas = basDe(pied);
  const n = joursAvant(dt.iso);
  const compte = n > 1 ? { petit: "dans", grand: `${n} jours` } : n === 1 ? { petit: "", grand: "demain" } : n === 0 ? { petit: "", grand: "aujourd'hui" } : null;
  const jour = String(dt.jour), mois = String(dt.mois).toUpperCase();
  const dateIso = new Date(dt.iso + "T12:00:00Z");
  const semaine = isNaN(dateIso) ? "" : dateIso.toLocaleDateString("fr-FR", { weekday: "long", timeZone: "UTC" });
  const etiq = [semaine && maj1(semaine), rubrique(s)];
  if(medias.length) etiq.push(medias.length > 2 ? `${medias.slice(0, 2).join(" · ")} +${medias.length - 2}` : medias.join(" · "));
  const etiquettes = blocEtiquettes(ctx, etiq.filter(Boolean));
  // le jour en très grand (« 1er » : suffixe en petit), le décompte à droite sur la même base, le mois en capitales rouges dessous
  const heros = { options: storyBlancTailles(420, 120, 20).map(T => {
    const tm = Math.min(110, Math.floor(110 * (LARG / Math.max(LARG, mesurer(ctx, mois, 800, 110, "Public Sans", 6))))), yJ = Math.round(T * 0.72), yM = yJ + 58 + Math.round(tm * 0.72);
    return { h:yM + 8, avant:20, rang:0, dessiner(c, x, y){
      c.textAlign = "left"; c.textBaseline = "alphabetic";
      const lsJ = -T * 0.02;
      c.font = `800 ${T}px "${SERIF}"`; c.letterSpacing = `${lsJ}px`; c.fillStyle = BLANC.encre; c.fillText(jour, x - 4, y + yJ); c.letterSpacing = "0px";
      let xDroit = x + mesurer(ctx, jour, 800, T, SERIF, lsJ);
      if(Number(dt.jour) === 1){ c.font = `800 ${T * 0.26}px "${SERIF}"`; c.fillStyle = BLANC.encre; c.fillText("er", xDroit + 12, y + yJ - T * 0.42); xDroit += mesurer(ctx, "er", 800, T * 0.26, SERIF) + 18; }
      if(compte){
        const dispo = x + LARG - xDroit - 30;
        let t = 78; while(t > 36 && mesurer(ctx, compte.grand, 800, t, SERIF) > dispo) t -= 2;
        c.font = `800 ${t}px "${SERIF}"`; c.fillStyle = BLANC.encre; c.textAlign = "right"; c.fillText(compte.grand, x + LARG, y + yJ - 8);
        if(compte.petit){ c.font = `800 30px "Public Sans"`; c.letterSpacing = "4px"; c.fillStyle = BLANC.rouge; c.fillText(compte.petit.toUpperCase(), x + LARG, y + yJ - t - 16); c.letterSpacing = "0px"; }
        c.textAlign = "left";
      }
      c.font = `800 ${tm}px "Public Sans"`; c.letterSpacing = "6px"; c.fillStyle = BLANC.rouge; c.fillText(mois, x + 4, y + yM); c.letterSpacing = "0px";
    } };
  }) };
  const aCarte = Boolean(d.essentiel || d.citation || d.contexte?.length);
  const essais = [];
  for(const dv of variantesCarte(d)) for(const tq of TAILLES_CARTE) essais.push(() => { const it = blocsCarte(ctx, dv, tq, 27); return it ? [heros, blocTitre(ctx, titre, 80, () => 3, 52), { options:[etiquettes, storyBlancVide(1)] }, ...it] : null; });
  const plan = storyBlancPremier(ctx, essais, { haut, bas, ecartMax:aCarte ? 40 : 90 });
  if(!plan) return null;
  poser(ctx, plan, pied, "À noter");
  return { nom: nomFichier("date", s) };
};
})();
