/* Module chargé à la demande (stories d'actualité) : voir chargerModule() dans index.html. */
/* Stories « liste » sur la BASE BLANCHE (js/stories-blanc.js) : « En bref » (les sujets les plus recoupés, numérotés en rouge, séparés par des filets gris) et
   « Dossier » (chiffres du dossier, frise des articles à repères rouges, contexte). Les titres de presse ne sont que des citations attribuées au média.
   Aucun texte n'est jamais coupé : la taille descend, puis on retire une entrée ou le contexte. */
(()=>{
  const LARG = STORY.L - 2 * BLANC.marge;

  // Heure de Paris « 22 h 43 » ; précédée du jour (« 4 novembre · ») quand ce n'est pas aujourd'hui
  const quand = iso => storyBlancQuand(iso);
  const rubrique = s => (THEMES_ACTU[s.illustration?.theme] || THEMES_ACTU.politique)[2];
  const aVideo = arts => arts.find(a=> a.video);
  // Citation « … » : guillemets français, guillemets internes adoucis ; toujours entière
  const citer = titre => {
    const t = minusculesListe(storyTypo(titre).replace(/^(?:DIRECT|EN DIRECT|En direct)\s*[.:]\s*/, ""))
      .replace(/"([^"]*)"/g, "“$1”").replace(/«\s*([^»]*?)\s*»/g, "“$1”").replace(/(\p{L})'(\p{L})/gu, "$1’$2");
    return `« ${t} »`;
  };
  // Titre de presse nettoyé (sans « DIRECT. » ni rubrique en tête)
  function titrePresse(t){
    let x = storyTypo(t).replace(/^(?:DIRECT|EN DIRECT|En direct)\s*[.:]\s*/, "");
    const m = /^[\p{L}0-9'’ -]{4,32}\.\s+(?=\p{Lu})/u.exec(x);
    if(m && x.length - m[0].length >= 28) x = x.slice(m[0].length);
    return minusculesListe(x.replace(/\.$/, ""));
  }
  const minusculesListe = storyMinuscules;
  // Petit repère « ▶ » vectoriel suivi d'un texte (ligne vidéo)
  function ligneVideo(c, x, y, media){
    c.fillStyle = BLANC.encre; c.beginPath(); c.moveTo(x, y + 4); c.lineTo(x, y + 24); c.lineTo(x + 20, y + 14); c.closePath(); c.fill();
    c.font = `700 24px "Public Sans"`; c.textAlign = "left"; c.textBaseline = "alphabetic"; c.fillText(`Vidéo : ${media}`, x + 34, y + 23);
  }

  /* ---------- Modèle B : « En bref » ---------- */
  function choisirEnBref(){
    const nbM = s=> s.mediasDistincts ?? s.medias; // médias distincts (un groupe de presse ou une dépêche reprise compte une fois)
    const tous = (ACTUALITES?.sujets || []).filter(s=> nbM(s) >= 2 && s.articles?.length)
      .map((s, i)=>({ s, i })).sort((a, b)=> (nbM(b.s) - nbM(a.s)) || (a.i - b.i));
    const titreDe = s => s.titrePropre?.titre || s.articles[0].titre;
    const pris = [], titres = new Set(), themes = new Set();
    const prendre = (filtre)=> { for(const e of tous){ if(pris.length >= 4) break; if(pris.includes(e)) continue; if(filtre(e)){ pris.push(e); titres.add(titreDe(e.s)); themes.add(e.s.illustration?.theme || "politique"); } } };
    prendre(e=> !titres.has(titreDe(e.s)) && !themes.has(e.s.illustration?.theme || "politique")); // un par thème
    prendre(e=> !titres.has(titreDe(e.s)));                                                         // sans doublon de titre
    return pris.sort((a, b)=> a.i - b.i).map(e=> e.s);
  }

  // indices : sujets imposés (stories automatiques, déjà triés sur leurs règles de prudence) ; sinon les sujets les plus recoupés du moment
  async function enBref(ctx, indices){
    await storyBlancPolices();
    const top = indices ? indices.map(i=> ACTUALITES?.sujets?.[i]).filter(s=> s?.articles?.length).slice(0, 4) : choisirEnBref();
    if(top.length < 2) return null;
    // Contenu de chaque sujet : notre titre ; à défaut, le titre de presse du premier article cité (la ligne des médias le rattache à son média)
    const items = top.map(s=>{
      const arts = s.articles, medias = [...new Set(arts.map(a=>a.media))].filter(Boolean), propre = s.accroche || s.titrePropre?.accroche || s.titrePropre?.titre;
      return { s, medias, titre: propre ? storyTypo(propre) : citer(arts[0].titre), video: aVideo(arts) };
    });
    const pied = storyBlancPiedPlan(ctx, "", {});
    const haut = STORY_HAUT_BLANC, bas = BLANC.bas - pied.h - 30, xt = BLANC.marge + 124, wt = STORY.L - BLANC.marge - xt;
    const entete = { options:storyBlancOptions(ctx, "Ce qu’il faut retenir aujourd’hui", { tailles:storyBlancTailles(100, 56, 4), max:3, poids:800, police:BLANC.serif, interligne:1.13, ls:t => -t * 0.004, couleur:BLANC.encre, avant:0, rang:() => 3 }) };
    // une taille de titre commune à toutes les entrées ; si rien ne tient, on retire la dernière entrée (jamais moins de deux)
    for(let n = items.length; n >= 2; n--){
      for(let tt = 54; tt >= 34; tt -= 2){
        const blocs = items.slice(0, n).map((it, i) => {
          const t = storyBlancBlocTexte(ctx, it.titre, { taille:tt, poids:800, police:BLANC.serif, largeur:wt, interligne:1.14, ls:-tt * 0.004, couleur:BLANC.encre });
          const meta = storyBlancBlocTexte(ctx, it.medias.join(", "), { taille:24, poids:700, largeur:wt, interligne:1.2, couleur:BLANC.gris });
          if(!t.ok || t.l.length > 5) return null;
          const hv = it.video ? 36 : 0, h = Math.max(t.h + 12 + meta.h + hv, 92);
          return { h, avant:34, dessiner(c, x, y){
            storyBlancFilet(c, y - 17, { x });
            c.font = `800 118px "${BLANC.serif}"`; c.letterSpacing = "-4px"; c.fillStyle = BLANC.rouge; c.textAlign = "left"; c.textBaseline = "alphabetic"; c.fillText(String(i + 1), x - 2, y + 86); c.letterSpacing = "0px";
            t.dessiner(c, xt, y); meta.dessiner(c, xt, y + t.h + 12);
            if(it.video) ligneVideo(c, xt, y + t.h + 12 + meta.h + 6, it.video.media);
          } };
        });
        if(blocs.some(b => !b)) continue;
        const plan = storyBlancPile(ctx, [entete, ...blocs.map((b, i) => i ? b : { ...b, avant:44 })], { haut, bas, ecartMax:50 });
        if(plan){
          storyBlancFond(ctx);
          storyBlancTete(ctx, { rubrique:"En bref", quand:"" });
          plan.dessiner();
          storyBlancPiedDessiner(ctx, pied);
          return { nom:"en-bref" };
        }
      }
    }
    return null; // les titres ne tiennent pas en entier : pas de story plutôt qu'une phrase coupée
  }

  /* ---------- Modèle D : « Dossier » ---------- */
  async function dossierStory(ctx, dossier, style){
    await storyBlancPolices();
    dossier = { ...dossier, titre:storyTypo(dossier.titre) };
    // Un média différent par entrée, du plus récent au plus ancien ; on évite de répéter le même titre (reprises de dépêche)
    const triees = [...(dossier.articles || [])].sort((x, y)=> String(y.date).localeCompare(String(x.date)));
    const vus = new Set(), titresVus = new Set(), arts = [];
    const cle = t => String(t).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    for(const a of triees){
      if(vus.has(a.media)) continue;
      if(titresVus.has(cle(a.titre))) continue;
      vus.add(a.media); titresVus.add(cle(a.titre)); arts.push(a);
    }
    const nbMediasVus = new Set(triees.map(a=> a.media)).size;
    if(nbMediasVus < 3) return null;
    if(arts.length < 2) return null; // jamais deux fois le même titre (reprises de dépêche) : sans au moins deux titres distincts, pas de dossier
    arts.sort((x, y)=> String(y.date).localeCompare(String(x.date)));
    const nbMedias = dossier.mediasDistincts ?? (dossier.medias?.length || arts.length), nbArts = dossier.nb || dossier.articles?.length || arts.length;
    // Contexte : un fait tiré du sujet qui recoupe le plus ce dossier
    const urls = new Set((dossier.articles || []).map(a=> a.url));
    let contexte = null, meilleur = 0, sujetLie = null;
    for(const s of ACTUALITES?.sujets || []){
      const faits = (s.contexte || []).filter(c=> !(c.type === "sondage" && periodeReserveSondages())); // réserve électorale : aucun sondage
      if(!faits.length) continue;
      const k = s.articles.filter(a=> urls.has(a.url)).length;
      if(k > meilleur){ meilleur = k; contexte = faits[0]; sujetLie = s; }
    }
    const noms = [...new Set(triees.map(a=> a.media))].filter(Boolean);
    if(style && style !== "bleu"){ // mises en page « photo », « question », « chiffre » (js/stories.js) : photo d'institution du sujet le plus proche, jamais une personne
      const ill = sujetLie?.illustration || {}, th = storyThemeInfos(ill.theme), photo = await storyPhotoTheme("vignette" in ill ? ill.vignette : ill.theme);
      const cite = storyTitreCite(arts[0].titre);
      const fait = contexte?.texte && storyNbMots(contexte.texte) <= 30 ? storyTypo(contexte.texte).replace(/\.$/, "") : "";
      const dessin = storyStyleDessiner(ctx, style, {
        theme:th.cle, couleur:th.couleur, motif:th.motif, categorie:"Dossier", photo, medias:noms, quand:storyBlancQuand(arts[0].date),
        accroche:style === "question" ? `${dossier.titre} : où en est-on ?` : dossier.titre,
        essentiel:fait || `Dernier titre relevé : « ${cite} » (${storyTypo(arts[0].media)})`,
        puces:[`${nbArts} articles relevés`, `${nbMedias} médias différents`, `Dernier titre : ${storyTypo(arts[0].media)}`],
        chiffre:{ valeur:String(nbArts), legende:nbArts > 1 ? "articles dans le dossier" : "article dans le dossier" },
        contexte:`${nbMedias} médias en parlent : ${dossier.titre}`,
        source:"", cta:"Tout le dossier",
      });
      if(dessin) return { nom:`dossier-${dossier.id}` };
    }
    const pied = storyBlancPiedPlan(ctx, "", {});
    const haut = STORY_HAUT_BLANC, bas = BLANC.bas - pied.h - 30, xt = BLANC.marge + 44, wt = STORY.L - BLANC.marge - xt;
    const titre = { options:storyBlancOptions(ctx, dossier.titre, { tailles:storyBlancTailles(104, 52, 4), max:5, poids:800, police:BLANC.serif, interligne:1.13, ls:t => -t * 0.004, couleur:BLANC.encre, avant:0, rang:t => t >= 72 ? 3 : 5 }) };
    if(!titre.options.length) return null;
    // chiffres du dossier : deux nombres en grand séparés par un filet vertical
    const lab1 = nbArts > 1 ? "ARTICLES" : "ARTICLE", lab2 = nbMedias > 1 ? "MÉDIAS" : "MÉDIA", n1 = String(nbArts), n2 = String(nbMedias);
    const stats = { options:[128, 112, 96, 84].map(tn => {
      ctx.font = `800 ${tn}px "${BLANC.serif}"`; ctx.letterSpacing = `${-Math.round(tn * 0.02)}px`; const w1 = ctx.measureText(n1).width; ctx.letterSpacing = "0px";
      ctx.font = `800 24px "Public Sans"`; ctx.letterSpacing = "4px"; const wl1 = ctx.measureText(lab1).width; ctx.letterSpacing = "0px";
      const x2 = Math.max(w1, wl1) + 64;
      return { h:Math.round(tn * 0.72) + 26 + 24, avant:36, rang:1, dessiner(c, x, y){
        c.textAlign = "left"; c.textBaseline = "alphabetic";
        c.font = `800 ${tn}px "${BLANC.serif}"`; c.letterSpacing = `${-Math.round(tn * 0.02)}px`; c.fillStyle = BLANC.encre;
        c.fillText(n1, x, y + Math.round(tn * 0.72)); c.fillText(n2, x + x2 + 36, y + Math.round(tn * 0.72)); c.letterSpacing = "0px";
        c.fillStyle = BLANC.filet; c.fillRect(x + x2, y + 6, 3, Math.round(tn * 0.72) + 26 + 24 - 6);
        c.font = `800 24px "Public Sans"`; c.letterSpacing = "4px"; c.fillStyle = BLANC.rouge;
        c.fillText(lab1, x, y + Math.round(tn * 0.72) + 26 + 20); c.fillText(lab2, x + x2 + 36, y + Math.round(tn * 0.72) + 26 + 20); c.letterSpacing = "0px";
      } };
    }) };
    // contexte (bas de la page) : entier ou absent
    let blocContexte = null;
    if(contexte?.texte){
      const tc = storyBlancBlocTexte(ctx, contexte.texte, { taille:28, poids:600, largeur:LARG, interligne:1.25, couleur:BLANC.texte });
      const src = contexte.source ? storyBlancBlocTexte(ctx, `Source : ${contexte.source}`, { taille:22, poids:600, largeur:LARG, interligne:1.2, couleur:BLANC.gris }) : null;
      if(tc.ok && tc.l.length <= 3 && (!src || src.ok)){
        const h = 2 + 20 + 24 + 12 + tc.h + (src ? 12 + src.h : 0);
        blocContexte = { options:[{ h, avant:36, rang:1, dessiner(c, x, y){
          storyBlancFilet(c, y);
          storyBlancLabel(ctx, "Le contexte", { taille:22 }).dessiner(c, x, y + 22);
          tc.dessiner(c, x, y + 22 + 22 + 12); if(src) src.dessiner(c, x, y + 22 + 22 + 12 + tc.h + 12);
        } }, storyBlancVide(1)] };
      }
    }
    // frise des articles : repère carré rouge sur un filet vertical gris, « média · heure », citation entière
    const entree = (a, tq) => {
      const q = storyBlancBlocTexte(ctx, citer(a.titre), { taille:tq, poids:700, largeur:wt, interligne:1.18, couleur:BLANC.encre });
      if(!q.ok || q.l.length > 5) return null;
      const entete = `${storyTypo(a.media)} · ${quand(a.date)}${a.video ? " · vidéo" : ""}`;
      const te = storyBlancBlocTexte(ctx, entete, { taille:24, poids:800, largeur:wt, interligne:1.2, couleur:BLANC.rouge });
      return { h:te.h + 8 + q.h, avant:30, dessiner(c, x, y){ te.dessiner(c, xt, y); q.dessiner(c, xt, y + te.h + 8); } };
    };
    const essais = [];
    for(const n of [Math.min(5, arts.length), Math.min(4, arts.length), Math.min(3, arts.length)]) for(const tq of [38, 36, 34, 32, 30, 28]) essais.push(() => {
      const es = arts.slice(0, n).map(a => entree(a, tq));
      if(es.some(e => !e)) return null;
      // chaque entrée porte son repère : carré rouge sur un filet vertical gris
      const frise = es.map((e, i) => { const d0 = e.dessiner; return { ...e, avant:i ? 30 : 40, dessiner(c, x, y){
        d0(c, x, y);
        c.fillStyle = BLANC.filet; c.fillRect(x + 5, y + 6, 3, e.h - 6);
        c.fillStyle = BLANC.rouge; c.fillRect(x, y + 4, 14, 14);
      } }; });
      return [titre, stats, ...frise, blocContexte];
    });
    const plan = storyBlancPremier(ctx, essais, { haut, bas, ecartMax:30 }, p => p.choix[0].taille >= 64);
    if(!plan) return null;
    storyBlancFond(ctx);
    storyBlancTete(ctx, { rubrique:"Dossier", quand:"" });
    plan.dessiner();
    storyBlancPiedDessiner(ctx, pied);
    return { nom:`dossier-${dossier.id}` };
  }

  // Les sujets du moment (info vide) ou un dossier (info = id d'un dossier de ACTUALITES.dossiers)
  STORY_PLUS.actualites = async (ctx, info)=>{
    if(/^bref:/.test(info || "")) return enBref(ctx, info.slice(5).split(",").map(Number).filter(Number.isInteger));
    if(info){
      const [id, style] = String(info).split("|"); // « id » ou « id|style » (style : bleu, une-photo, question, chiffre)
      const dossier = (ACTUALITES?.dossiers || []).find(d=> d.id === id);
      return dossier ? dossierStory(ctx, dossier, storyStyleValide(style)) : null;
    }
    return enBref(ctx);
  };
})();
