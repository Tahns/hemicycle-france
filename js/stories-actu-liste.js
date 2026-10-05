/* Module chargé à la demande (stories d'actualité) : voir chargerModule() dans index.html. */
/* Stories « liste » : « En bref » (les sujets les plus recoupés) et « Dossier » (frise des articles d'un dossier).
   Style « bleu question / réponse » : fond bleu, texte blanc, chiffres en rose. Les titres de presse ne sont que des citations. */
(()=>{
  const C = { bleu:STORY_DA.fond, ciel:STORY_DA.ciel, rose:STORY_DA.rose, rose2:STORY_DA.rose, blanc:"#FFFFFF" };

  // Heure de Paris « 22 h 43 » ; précédée du jour (« 4 oct. ») quand ce n'est pas aujourd'hui
  function quand(iso){
    const d = new Date(iso);
    if(isNaN(d)) return "";
    const f = o => d.toLocaleString("fr-FR", { timeZone:"Europe/Paris", ...o });
    const jour = x => x.toLocaleDateString("fr-FR", { timeZone:"Europe/Paris", day:"numeric", month:"numeric", year:"numeric" });
    const h = f({ hour:"2-digit", minute:"2-digit" }).replace(":", " h ");
    return jour(d) === jour(new Date()) ? h : `${f({ day:"numeric", month:"short" })} · ${h}`;
  }

  // Pastille « ▶ Vidéo » discrète (contour rose, triangle dessiné) ; x = bord gauche, yb = ligne de base du texte voisin
  function largeurVideo(ctx){ ctx.font = `800 22px "Public Sans"`; return 20 + 18 + 10 + ctx.measureText("Vidéo").width + 20; }
  function pastilleVideo(ctx, x, yMilieu){
    const w = largeurVideo(ctx), h = 38, y = yMilieu - h / 2;
    ctx.strokeStyle = C.rose2; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    ctx.fillStyle = C.rose2; ctx.beginPath();
    ctx.moveTo(x + 18, yMilieu - 8); ctx.lineTo(x + 18, yMilieu + 8); ctx.lineTo(x + 32, yMilieu); ctx.closePath(); ctx.fill();
    ctx.font = `800 22px "Public Sans"`; ctx.textBaseline = "middle"; ctx.fillText("Vidéo", x + 20 + 18 + 10 - 8 + 8, yMilieu + 2); ctx.textBaseline = "alphabetic";
    return w;
  }

  // Citation « … » : guillemets français, guillemets internes adoucis, tronquée proprement (« … ») si trop longue.
  // La police du contexte doit déjà être réglée.
  function citer(ctx, titre, larg, max){
    const t = String(titre).replace(/\s+/g, " ").trim()
      .replace(/"([^"]*)"/g, "“$1”").replace(/«\s*([^»]*?)\s*»/g, "“$1”").replace(/(\p{L})'(\p{L})/gu, "$1’$2");
    const l = storyLignes(ctx, `« ${t} »`, larg, 99);
    if(l.length <= max) return l;
    const r = l.slice(0, max);
    let d = r[max - 1];
    while(d.includes(" ") && ctx.measureText(d + "… »").width > larg) d = d.slice(0, d.lastIndexOf(" "));
    r[max - 1] = d.replace(/[\s,;:.\-–—]+$/, "") + "… »";
    return r;
  }
  const hauteurLignes = (n, t, inter) => n ? t + (n - 1) * t * inter : 0;
  function lignesTexte(ctx, lignes, x, yBase, t, inter){
    lignes.forEach((l, i)=> ctx.fillText(l, x, yBase + i * t * inter));
  }
  // Pied commun : source en petit puis « accroche → @compte » (storyPied)
  const pied = (ctx, texte, accroche)=> storyPied(ctx, texte, { accroche });
  const rubrique = s => (THEMES_ACTU[s.illustration?.theme] || THEMES_ACTU.politique)[2];
  const aVideo = arts => arts.find(a=> a.video);

  /* ---------- Modèle B : « En bref » ---------- */
  // Titre de presse nettoyé (sans « DIRECT. » ni rubrique en tête), guillemets français
  function titrePresse(t){
    let x = String(t || "").replace(/\s+/g, " ").trim().replace(/^(?:DIRECT|EN DIRECT|En direct)\s*[.:]\s*/, "");
    const m = /^[\p{L}0-9'’ -]{4,32}\.\s+(?=\p{Lu})/u.exec(x);
    if(m && x.length - m[0].length >= 28) x = x.slice(m[0].length);
    return x.replace(/\.$/, "");
  }
  function choisirEnBref(){
    const tous = (ACTUALITES?.sujets || []).filter(s=> s.medias >= 2 && s.articles?.length)
      .map((s, i)=>({ s, i })).sort((a, b)=> (b.s.medias - a.s.medias) || (a.i - b.i));
    const titreDe = s => s.titrePropre?.titre || s.articles[0].titre;
    const pris = [], titres = new Set(), themes = new Set();
    const prendre = (filtre)=> { for(const e of tous){ if(pris.length >= 4) break; if(pris.includes(e)) continue; if(filtre(e)){ pris.push(e); titres.add(titreDe(e.s)); themes.add(e.s.illustration?.theme || "politique"); } } };
    prendre(e=> !titres.has(titreDe(e.s)) && !themes.has(e.s.illustration?.theme || "politique")); // un par thème
    prendre(e=> !titres.has(titreDe(e.s)));                                                         // sans doublon de titre
    return pris.sort((a, b)=> a.i - b.i).map(e=> e.s);
  }

  // indices : sujets imposés (stories automatiques, déjà triés sur leurs règles de prudence) ; sinon les sujets les plus recoupés du moment
  async function enBref(ctx, indices){
    const top = indices ? indices.map(i=> ACTUALITES?.sujets?.[i]).filter(s=> s?.articles?.length).slice(0, 4) : choisirEnBref();
    if(top.length < 2) return null;
    const { L, marge } = STORY, xt = 200, larg = L - marge - xt, bas = STORY.bas;
    let yHaut = storyCadre(ctx, "En bref");
    const titreB = "Ce qu’il faut retenir aujourd’hui", larg0 = L - 2 * marge;
    let tB = 96;
    for(; tB > 64; tB -= 2){ ctx.font = `700 ${tB}px "Newsreader"`; if(storyLignes(ctx, titreB, larg0, 99).length <= 2) break; }
    let y = storyTexte(ctx, titreB, marge, yHaut - 8, { taille:tB, poids:700, police:"Newsreader", couleur:C.blanc, max:2, interligne:0.98 });
    y += 18;

    // Contenu de chaque sujet : notre titre ; à défaut, le titre de presse du premier article (la ligne des médias le rattache à son média)
    const items = top.map(s=>{
      const arts = s.articles, medias = [...new Set(arts.map(a=>a.media))].filter(Boolean), propre = s.titrePropre?.titre;
      return { s, medias, titre: propre || titrePresse(arts[0].titre), propre:!!propre, video: aVideo(arts) };
    });
    // lignes d'un titre : le nôtre tel quel ; un titre de presse entre guillemets, refermés même s'il est coupé
    const lignesDe = (it, tt)=>{ ctx.font = `800 ${tt}px "Public Sans"`; return it.propre ? storyLignes(ctx, it.titre, larg, 3) : citer(ctx, it.titre, larg, 3); };
    const mesure = (tt)=> items.map(it=> hauteurLignes(lignesDe(it, tt).length, tt, 1.14) + 14 + 26);
    const tz = 22; // médias : une ligne
    let tt = 62, hs = mesure(tt);
    const dispo = bas - y - items.length * 44;
    while(tt > 34 && hs.reduce((a, b)=>a + b, 0) > dispo){ tt -= 2; hs = mesure(tt); }
    const reste = Math.max(0, dispo - hs.reduce((a, b)=>a + b, 0)), pad = (items.length * 44 + Math.min(reste, items.length * 60)) / items.length;
    let yy = y;
    ctx.fillStyle = storyAlpha(C.ciel, 0.35); ctx.fillRect(marge, yy, L - 2 * marge, 2);
    items.forEach((it, i)=>{
      const top0 = yy + pad / 2 + 6;
      // gros chiffre rose
      ctx.font = `700 124px "Newsreader"`; ctx.fillStyle = C.rose; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
      ctx.fillText(String(i + 1), marge, top0 + tt * 0.86 + 34);
      // titre
      const lt = lignesDe(it, tt);
      ctx.fillStyle = C.blanc;
      lignesTexte(ctx, lt, xt, top0 + tt * 0.86, tt, 1.14);
      const yb = top0 + hauteurLignes(lt.length, tt, 1.14) + 14;
      // médias en petit (+ pastille vidéo si besoin)
      ctx.font = `700 26px "Public Sans"`; ctx.fillStyle = C.ciel;
      const wv = it.video ? largeurVideo(ctx) + 18 : 0;
      ctx.font = `700 26px "Public Sans"`;
      const ligne = storyPListe(ctx, it.medias, larg - wv, 1)[0];
      ctx.fillStyle = C.ciel; ctx.fillText(ligne, xt, yb + 22);
      if(it.video){ const w = ctx.measureText(ligne).width; pastilleVideo(ctx, xt + w + 18, yb + 13); }
      yy += hs[i] + pad;
      ctx.fillStyle = storyAlpha(C.ciel, 0.35); ctx.fillRect(marge, yy, L - 2 * marge, 2);
    });
    pied(ctx, "Sujets les plus repris par la presse française. Seuls les titres sont repris ; chaque média est cité.", "Toute l'actu du jour");
    return { nom:"en-bref" };
  }

  /* ---------- Modèle D : « Dossier » ---------- */
  async function dossierStory(ctx, dossier){
    // Un média différent par entrée, du plus récent au plus ancien ; on évite de répéter le même titre (reprises de dépêche)
    const triees = [...(dossier.articles || [])].sort((x, y)=> String(y.date).localeCompare(String(x.date)));
    const vus = new Set(), titresVus = new Set(), arts = [], reportes = [];
    const cle = t => String(t).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    for(const a of triees){
      if(vus.has(a.media)) continue;
      if(titresVus.has(cle(a.titre))){ reportes.push(a); continue; }
      vus.add(a.media); titresVus.add(cle(a.titre)); arts.push(a);
    }
    const nbMediasVus = new Set(triees.map(a=> a.media)).size;
    if(nbMediasVus < 3) return null;
    for(const a of reportes){ if(arts.length >= 4) break; if(!vus.has(a.media)){ vus.add(a.media); arts.push(a); } }
    arts.sort((x, y)=> String(y.date).localeCompare(String(x.date)));
    const nbMedias = dossier.medias?.length || arts.length, nbArts = dossier.nb || dossier.articles?.length || arts.length;
    const { L, marge } = STORY, larg = L - 2 * marge;
    // Contexte : un fait tiré du sujet qui recoupe le plus ce dossier
    const urls = new Set((dossier.articles || []).map(a=> a.url));
    let contexte = null, meilleur = 0;
    for(const s of ACTUALITES?.sujets || []){
      const faits = (s.contexte || []).filter(c=> !(c.type === "sondage" && periodeReserveSondages())); // réserve électorale : aucun sondage
      if(!faits.length) continue;
      const k = s.articles.filter(a=> urls.has(a.url)).length;
      if(k > meilleur){ meilleur = k; contexte = faits[0]; }
    }
    storyFondTheme(ctx); storyMarque(ctx);
    const tc = 28, g = 24;
    // Contexte (bas de la page)
    let hC = 0, lc = [], ls = "";
    if(contexte?.texte){
      ctx.font = `600 ${tc}px "Public Sans"`; lc = storyLignes(ctx, contexte.texte, larg, 2);
      ctx.font = `500 22px "Public Sans"`; ls = contexte.source ? storyLignes(ctx, contexte.source, larg, 1)[0] : "";
      hC = 20 + 24 + 10 + hauteurLignes(lc.length, tc, 1.25) + (ls ? 8 + 22 : 0) + 8;
    }
    const yC = 1490 - hC, yFin = (hC ? yC : 1490) - 34;
    const mesure = (n, tq)=> arts.slice(0, n).map(a=>{
      ctx.font = `700 ${tq}px "Public Sans"`;
      return 26 + 8 + hauteurLignes(citer(ctx, a.titre, larg - 56, 2).length, tq, 1.18) + g;
    });
    const total = h => h.reduce((a, b)=> a + b, 0) - g;
    // Mise en page du haut : grand titre sur 2 lignes (ou sur une seule ligne), chiffres géants plus ou moins grands.
    // On retient la première configuration qui laisse de la place à 4-5 entrées lisibles (citation ≥ 32 px).
    const titreFit = (maxLignes, tMin)=>{
      for(let t = 108; t >= tMin; t -= 2){ ctx.font = `700 ${t}px "Newsreader"`; const l = storyLignes(ctx, dossier.titre, larg, 99); if(l.length <= maxLignes) return { t, l }; }
      ctx.font = `700 ${tMin}px "Newsreader"`; return { t:tMin, l:storyLignes(ctx, dossier.titre, larg, maxLignes) };
    };
    const yEtiq = STORY_DA.etiquetteY, yTit = yEtiq + 54 + 26;
    const haut = (ft, tn)=>{ const yN = yTit + hauteurLignes(ft.l.length, ft.t, 1.0) + 44; return { ...ft, tn, yN, yDeb: yN + tn * 0.74 + 40 + 58 }; };
    const configs = [haut(titreFit(2, 60), 170), haut(titreFit(1, 76), 170), haut(titreFit(2, 60), 140), haut(titreFit(1, 76), 140), haut(titreFit(2, 60), 120)];
    const voulu = Math.min(4, arts.length);
    let cfg = configs[configs.length - 1], n = voulu, tq = 30, hs = mesure(n, tq);
    trouve: for(const c of configs){
      for(const nn of [Math.min(5, arts.length), voulu]){
        for(const t of [38, 36, 34, 32]){
          if(nn === 5 && t < 34) continue;
          const h = mesure(nn, t);
          if(total(h) <= yFin - c.yDeb){ cfg = c; n = nn; tq = t; hs = h; break trouve; }
        }
      }
    }
    if(cfg === configs[configs.length - 1] && total(hs) > yFin - cfg.yDeb){
      // Dernier recours : citation plus petite puis moins d'entrées plutôt que déborder
      for(const t of [30, 28]){ hs = mesure(n, t); tq = t; if(total(hs) <= yFin - cfg.yDeb) break; }
      while(total(hs) > yFin - cfg.yDeb && n > 3){ n--; hs = mesure(n, tq); }
    }
    const yDeb = cfg.yDeb;
    storyEtiquette(ctx, "Dossier", marge, yEtiq, "blanc");
    let y = yEtiq + 54 + 26;
    ctx.font = `700 ${cfg.t}px "Newsreader"`; ctx.fillStyle = C.blanc;
    lignesTexte(ctx, cfg.l, marge, y + cfg.t * 0.82, cfg.t, 1.0);
    // Deux chiffres géants
    const tn = cfg.tn;
    ctx.font = `700 ${tn}px "Newsreader"`; ctx.fillStyle = C.blanc;
    const n1 = String(nbArts), n2 = String(nbMedias), w1 = ctx.measureText(n1).width;
    ctx.font = `800 24px "Public Sans"`; ctx.letterSpacing = "4px";
    const lab1 = nbArts > 1 ? "ARTICLES" : "ARTICLE", lab2 = nbMedias > 1 ? "MÉDIAS" : "MÉDIA", wl1 = ctx.measureText(lab1).width;
    ctx.letterSpacing = "0px";
    const x2 = marge + Math.max(w1, wl1) + 80, yN = cfg.yN;
    ctx.font = `700 ${tn}px "Newsreader"`; ctx.fillStyle = C.blanc;
    ctx.fillText(n1, marge, yN + tn * 0.74); ctx.fillText(n2, x2, yN + tn * 0.74);
    ctx.font = `800 24px "Public Sans"`; ctx.letterSpacing = "4px"; ctx.fillStyle = C.ciel;
    ctx.fillText(lab1, marge, yN + tn * 0.74 + 40); ctx.fillText(lab2, x2, yN + tn * 0.74 + 40); ctx.letterSpacing = "0px";
    const reste = yFin - yDeb - total(hs), ecart = n > 1 ? Math.min(40, Math.max(0, reste / (n - 1))) : 0;
    const lx = marge + 6, tx = marge + 56;
    let yy = yDeb + 6;
    const pos = [];
    arts.slice(0, n).forEach((a, i)=>{
      pos.push(yy);
      const mid = yy + 13;
      // Ligne 1 : média · heure (+ pastille vidéo)
      ctx.font = `800 26px "Public Sans"`; ctx.fillStyle = C.ciel;
      const wv = a.video ? largeurVideo(ctx) + 20 : 0;
      const h = quand(a.date), enteteLarg = larg - 56 - wv;
      let med = a.media; ctx.font = `800 26px "Public Sans"`;
      while(ctx.measureText(`${med} · ${h}`).width > enteteLarg && med.length > 6) med = med.slice(0, -2).trimEnd();
      if(med !== a.media) med += "…";
      const entete = `${med} · ${h}`;
      ctx.fillStyle = C.ciel; ctx.fillText(entete, tx, yy + 24);
      if(a.video) pastilleVideo(ctx, tx + ctx.measureText(entete).width + 20, mid);
      // Citation
      ctx.font = `700 ${tq}px "Public Sans"`; ctx.fillStyle = C.blanc;
      const lq = citer(ctx, a.titre, larg - 56, 2);
      lignesTexte(ctx, lq, tx, yy + 26 + 8 + tq * 0.84, tq, 1.18);
      yy += hs[i] + ecart;
    });
    // Filet vertical + points
    ctx.fillStyle = C.rose; ctx.fillRect(lx, pos[0] + 6, 6, (pos[n - 1] + hs[n - 1] - g) - pos[0] - 6);
    pos.forEach(p=>{
      ctx.fillStyle = C.rose; ctx.beginPath(); ctx.arc(lx + 3, p + 13, 12, 0, 2 * Math.PI); ctx.fill();
      ctx.fillStyle = C.bleu; ctx.beginPath(); ctx.arc(lx + 3, p + 13, 5, 0, 2 * Math.PI); ctx.fill();
    });
    // Contexte
    if(hC){
      let c = yC;
      ctx.fillStyle = storyAlpha(C.ciel, 0.4); ctx.fillRect(marge, c, larg, 2);
      c += 20;
      ctx.font = `800 22px "Public Sans"`; ctx.letterSpacing = "4px"; ctx.fillStyle = C.rose2; ctx.fillText("LE CONTEXTE", marge, c + 20); ctx.letterSpacing = "0px";
      c += 24 + 10;
      ctx.font = `600 ${tc}px "Public Sans"`; ctx.fillStyle = C.blanc; lignesTexte(ctx, lc, marge, c + tc * 0.85, tc, 1.25);
      c += hauteurLignes(lc.length, tc, 1.25) + 8;
      if(ls){ ctx.font = `500 22px "Public Sans"`; ctx.fillStyle = C.ciel; ctx.fillText(ls, marge, c + 20); }
    }
    pied(ctx, "Titres relevés dans la presse. Seuls les titres sont repris ; chaque média est cité.", "Tout le dossier");
    return { nom:`dossier-${dossier.id}` };
  }

  // Les sujets du moment (info vide) ou un dossier (info = id d'un dossier de ACTUALITES.dossiers)
  STORY_PLUS.actualites = async (ctx, info)=>{
    if(/^bref:/.test(info || "")) return enBref(ctx, info.slice(5).split(",").map(Number).filter(Number.isInteger));
    if(info){
      const dossier = (ACTUALITES?.dossiers || []).find(d=> d.id === info);
      return dossier ? dossierStory(ctx, dossier) : null;
    }
    return enBref(ctx);
  };
})();
