/* Module chargé à la demande (dessinerStory, js/stories.js) : fiches et visuels « hors presse » sur la base blanche (js/stories-blanc.js).
   Types : scrutin, senat, sondages, depute, senateur, commune, gouvernement, classement, agenda, quiz,
   probabilites, secondtour, decompte, candidat, parti, justice, indicateur, groupe, meeting.
   Chaque entrée dessine sur le canevas déjà créé (1080 × 1920) et renvoie { nom }, ou null si les données manquent ; mêmes données d'entrée qu'avant.
   Direction artistique : fond blanc, bandeau de tête (marque, date), filet noir épais, rubrique rouge en capitales, grands titres serif (Newsreader),
   chiffres nets, barres vectorielles sur piste grise, filets gris, pied de source. Tout est dessiné en chemins du canvas ; seules les photos et les logos réels
   sont des images, toujours sur fond blanc. Le texte n'est JAMAIS coupé : la taille diminue, la mise en page s'allonge (et, pour une liste, les lignes qui ne tiennent
   pas sont comptées dans « + N autres »). Rien d'important au-dessus de y = 250 ni sous y = 1640 (zones masquées par Instagram). */
const STORY_FICHES_TYPES = ["scrutin", "senat", "sondages", "depute", "senateur", "commune", "gouvernement", "classement", "agenda", "quiz"]; // types dessinés ici en plus des STORY_PLUS ci-dessous
(() => {
const { L } = STORY, M = BLANC.marge, LARG = L - 2 * M, INK = BLANC.encre, GRIS = BLANC.gris;
const fr1 = n => String(n).replace(".", ",");
const BAS = BLANC.bas - 10;

// Pied ancré en bas ; renvoie la limite basse du contenu
const pied = (ctx, source, o = {}) => storyBlancPiedBas(ctx, String(source || ""), { bas: BAS, ...o }) - 26;
const piedMesure = (ctx, source) => storyBlancPiedBas(ctx, String(source || ""), { bas: BAS, dessiner: false }) - 26;
// Une ligne de texte à la ligne de base `yb` (aucun retour à la ligne : l'appelant a vérifié la largeur) ; renvoie la largeur
function ecrire(ctx, txt, x, yb, { taille = 30, poids = 600, police = "Public Sans", couleur = INK, align = "left", ls = 0 } = {}){
  ctx.font = `${poids} ${taille}px "${police}"`; ctx.letterSpacing = ls + "px"; ctx.fillStyle = couleur; ctx.textAlign = align; ctx.textBaseline = "alphabetic";
  ctx.fillText(txt, x, yb); const w = ctx.measureText(txt).width; ctx.letterSpacing = "0px"; ctx.textAlign = "left"; return w;
}
function larg(ctx, txt, poids, taille, police = "Public Sans", ls = 0){
  ctx.font = `${poids} ${taille}px "${police}"`; ctx.letterSpacing = ls + "px"; const w = ctx.measureText(String(txt)).width; ctx.letterSpacing = "0px"; return w;
}
// Plus grande taille (≤ t0) pour laquelle le texte tient sur une ligne de `w` pixels (au moins `min`)
function tailleLigne(ctx, txt, poids, t0, w, police = "Public Sans", ls = 0, min = 16){
  let t = t0; while(t > min && larg(ctx, txt, poids, t, police, ls) > w) t -= 1; return t;
}
// Texte coloré sur blanc : couleur de parti assombrie si trop claire
const lisible = c => storyLisible(c || "#5B5E68");
// Pastille de couleur du parti (repère visuel, jamais un logo)
const carre = (ctx, x, y, t, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, t, t); };
// Légende « carré de couleur + capitales » (nom du parti) ; renvoie le bas
function etiquetteParti(ctx, texte, x, y, couleur, w){
  carre(ctx, x, y + 6, 20, couleur);
  return storyBlancTexte(ctx, String(texte).toUpperCase(), x + 32, y, { taille: 24, poids: 800, couleur: INK, largeur: w - 32, ls: 2, interligne: 1.2 });
}
// Pastille de vote (✓ POUR, ✕ CONTRE, ○ ABST., – PAS VOTÉ) alignée à droite : repère vectoriel + mot ; renvoie la largeur occupée
const MOTS_VOTE = { p: ["POUR", "pour"], c: ["CONTRE", "contre"], a: ["ABST.", "abst"], n: ["PAS VOTÉ", "partage"], "-": ["PAS VOTÉ", "partage"] };
function pastilleVote(ctx, code, xDroite, yMilieu){
  const [mot, type] = MOTS_VOTE[code] || MOTS_VOTE.n, c = BLANC_VOIX[type];
  const w = larg(ctx, mot, 800, 24, "Public Sans", 1);
  ecrire(ctx, mot, xDroite, yMilieu + 8, { taille: 24, poids: 800, couleur: INK, align: "right", ls: 1 });
  if(type === "partage"){ ctx.fillStyle = GRIS; ctx.fillRect(xDroite - w - 38, yMilieu - 2, 22, 5); } else storyBlancRepere(ctx, type, xDroite - w - 27, yMilieu, 22, c);
  return w + 46;
}
// Ligne de classement : repère (portrait, logo ou carré), nom, sous-texte, valeur à droite, barre sous le nom. Renvoie rien.
// o : { x, y, h, w, visuel(ctx, x, y, t), nom, sous, valeur, part, couleur, part0, rang }
function rangee(ctx, o){
  const { x, y, h, w } = o, t = Math.round(h - 12), bx = x + (o.rang != null ? 50 : 0), tx = bx + t + 18, xr = x + w;
  if(o.rang != null) ecrire(ctx, String(o.rang), x, y + h / 2 + 9, { taille: 26, poids: 800, couleur: GRIS });
  o.visuel && o.visuel(ctx, bx, y + 6, t);
  const tv = Math.min(40, Math.round(h * 0.52)), wv = larg(ctx, o.valeur, 600, tv, "Newsreader") + 6;
  const tn = tailleLigne(ctx, o.nom, 700, Math.min(30, Math.round(h * 0.4)), xr - tx - wv - 20, "Public Sans", 0, 17);
  ecrire(ctx, o.nom, tx, y + 6 + tn * 0.9, { taille: tn, poids: 700 });
  ecrire(ctx, o.valeur, xr, y + 6 + tv * 0.86, { taille: tv, poids: 600, police: "Newsreader", couleur: lisible(o.couleur), align: "right" });
  let yb = y + 6 + tn * 1.05;
  if(o.sous){ const ts = tailleLigne(ctx, o.sous, 500, Math.min(22, Math.round(h * 0.3)), xr - tx, "Public Sans", 0, 15); ecrire(ctx, o.sous, tx, yb + ts * 0.95, { taille: ts, poids: 500, couleur: GRIS }); yb += ts * 1.15; }
  const hb = Math.max(8, Math.round(h * 0.15)), by = Math.min(y + h - hb - 4, yb + 6);
  storyBlancBarre(ctx, tx, by, xr - tx, hb, o.part, o.couleur, { debut: o.part0 || 0 });
}
// Pastille de verdict de la story de scrutin
function verdictLigne(ctx, adopte, mot, x, y, t){
  storyBlancVerdict(ctx, adopte, x, y, t);
  ecrire(ctx, mot, x + t + 28, y + t * 0.8, { taille: Math.round(t * 0.92), poids: 800, ls: -2 });
}

/* ---------- Scrutin de l'Assemblée et du Sénat : « Vos députés ont-ils voté… ? » ---------- */
async function scrutinHorsPresse(ctx, type, info){
  let titre, date, resultat, groupes, sourceTxt, censure = false, nom;
  if(type === "scrutin"){
    const loi = currentLoi(); if(!loi) return null;
    censure = loi.typeVote === "MOC";
    titre = titreLoi(loi); date = loi.date; resultat = loi.resultat;
    groupes = PARTIES.filter(p => loi.votes?.[p.id]).map(p => ({ id: p.id, nom: p.nom, couleur: p.couleur, ...loi.votes[p.id] }));
    sourceTxt = `Scrutin public n°${loi.numero} de l'Assemblée nationale. Votes nominatifs officiels, détail par groupe.`;
    nom = `vote-${loi.numero}`;
  } else {
    const s = SENAT?.find(x => x.id === info); if(!s) return null;
    titre = titreSenat(s); date = s.date; resultat = s.resultat;
    groupes = Object.keys(GROUPES_SENAT).filter(g => s.groupes[g]).map(g => ({ id: g, nom: GROUPES_SENAT[g].nom, couleur: GROUPES_SENAT[g].couleur, ...s.groupes[g] }));
    sourceTxt = `Scrutin public n°${s.numero} du Sénat (session ${s.session}-${s.session + 1}), page officielle senat.fr.`;
    nom = `senat-${s.session}-${s.numero}`;
  }
  const adopte = resultat === "adopte";
  const pour = groupes.reduce((a, g) => a + g.pour, 0), contre = groupes.reduce((a, g) => a + (g.contre || 0), 0), abst = groupes.reduce((a, g) => a + (g.abst || 0), 0);
  const chambre = type === "senat" ? "Sénat" : "Assemblée nationale";
  const etape = (titre.match(/\(([^)]*)\)\s*$/) || [])[1] || "";
  const court = titre.replace(/\s*\([^)]*\)\s*$/, "").replace(/^L['’]ensemble (du |de la |de l['’]|des )/i, "").replace(/[.\s]+$/, "").replace(/^./, c => c.toUpperCase());
  let y = storyBlancCadre(ctx, censure ? "Motion de censure" : type === "senat" ? "Les sénateurs ont-ils voté" : "Vos députés ont-ils voté", { date });
  const bas = pied(ctx, sourceTxt);
  // lignes « positions des groupes »
  const lignes = [];
  if(censure){
    lignes.push(["Pour la censure", `${formatNombre(pour)} voix sur 289 requises`, "pour"]);
    const ids = groupes.filter(g => g.pour > 0 && g.pour >= (g.membres || 0) / 2).map(g => g.id);
    lignes.push(["Groupes qui l'ont votée", ids.length ? ids.join(", ") : "aucun", "partage"]);
  } else {
    const parPos = { contre: [], abst: [], pour: [], partage: [] };
    for(const g of groupes){ const p = positionMajoritaire({ typeVote: "" }, g); (parPos[p] || parPos.partage).push(g.id); }
    const liste = ids => ids.length <= 4 ? ids.join(", ") : `${ids.length} groupes`;
    if(parPos.contre.length) lignes.push(["Contre", liste(parPos.contre), "contre"]);
    if(parPos.abst.length) lignes.push(["Abstention", liste(parPos.abst), "abst"]);
    if(parPos.pour.length) lignes.push(["Pour", liste(parPos.pour), "pour"]);
    if(parPos.partage.length) lignes.push(["Partagés", liste(parPos.partage), "partage"]);
  }
  const hLignes = lignes.length * 66 + 52, hVerdict = 112 + 30, hVoix = censure ? 150 : 44 + 190;
  const yHaut = y;
  const question = censure ? "La motion de censure est-elle adoptée ?" : `« ${court} » ?`;
  const reste = bas - hLignes - hVerdict - hVoix - 40;
  y = storyBlancTitre(ctx, question, M, y, Math.max(yHaut + 180, reste), { tMax: 84, tMin: 36 }).y;
  y = storyBlancTexte(ctx, [chambre, date, censure ? court : etape].filter(Boolean).join(" · "), M, y + 6, { taille: 26, poids: 600, couleur: GRIS }) + 18;
  // réponse
  storyBlancFilet(ctx, y, { epais: 3, couleur: INK }); y += 26;
  verdictLigne(ctx, adopte, (adopte ? "ADOPTÉ" : "REJETÉ") + (censure ? "E" : ""), M, y, 112);
  y += 112 + 28;
  if(censure){
    y = storyBlancTexte(ctx, adopte ? "Le Gouvernement est renversé." : "Le Gouvernement reste en place.", M, y, { taille: 36, poids: 600, couleur: GRIS }) + 8;
  } else {
    storyBlancBarreEmpilee(ctx, M, y, LARG, 24, [[pour, BLANC_VOIX.pour], [contre, BLANC_VOIX.contre], [abst, BLANC_VOIX.abst]], (pour + contre + abst) || 1);
    y = storyBlancVoix(ctx, y + 40, [["Pour", pour, "pour"], ["Contre", contre, "contre"], ["Abstentions", abst, "abst"]], { hauteur: 190, taille: 104 }) + 6;
  }
  storyBlancCaps(ctx, "Position majoritaire des groupes", M, y + 10, { taille: 22, couleur: GRIS });
  y += 52;
  for(const [lib, val, pos] of lignes){
    storyBlancFilet(ctx, y);
    storyBlancRepere(ctx, pos, M + 14, y + 33, 22, BLANC_VOIX[pos]);
    ecrire(ctx, lib, M + 40, y + 43, { taille: 30, poids: 500 });
    const tv = tailleLigne(ctx, val, 800, 30, LARG - 40 - larg(ctx, lib, 500, 30) - 30, "Public Sans", 0, 18);
    ecrire(ctx, val, L - M, y + 43, { taille: tv, poids: 800, align: "right" });
    y += 66;
  }
  return { nom };
}

/* ---------- Sondage : intentions de vote au 1er tour ---------- */
async function sondageHorsPresse(ctx, info){
  // info : identifiant de l'enquête (« inst0 »…), sinon l'enquête choisie sur la page. Une seule enquête, premier tour.
  const inst = INSTITUTS.find(i => i.id === (info || selectedInstitut)); if(!inst || periodeReserveSondages()) return null;
  const tous = CANDIDATS.map(c => ({ ...c, r: inst.scores[c.id] })).filter(c => c.r).sort((a, b) => (b.r[0] + b.r[1]) - (a.r[0] + a.r[1]));
  if(!tous.length) return null;
  // Commanditaire : relevé sur la notice déposée à la Commission des sondages, quand il est connu
  const veille = (await lireJSON("data/sondages-veille.json"))?.enquetes || [];
  const commanditaire = storyCommanditaire(inst, veille);
  if(!commanditaire) return null; // mention obligatoire (loi du 19 juillet 1977, art. 2) : pas de commanditaire, pas d'image
  let liste = tous.slice(0, 10);
  const score = c => c.r[0] === c.r[1] ? `${fr1(c.r[0])} %` : `${fr1(c.r[0])}–${fr1(c.r[1])} %`;
  const photos = await Promise.all(tous.slice(0, 10).map(c => storyPortrait(`photos/personnalites/${slugDep(c.nom)}.jpg`)));
  // Mentions obligatoires (loi n° 77-808 du 19 juillet 1977) : institut, commanditaire, dates, échantillon, marge d'erreur, notice, source
  const erreur = inst.n ? `±${(1.96 * Math.sqrt(0.25 / inst.n) * 100).toFixed(1).replace(".", ",")} pts` : "";
  // Crédit des portraits affichés (CC BY / CC BY-SA : l'attribution est obligatoire)
  const credits = [...new Set(await storyPCredits(liste.filter((c, i) => photos[i]).map(c => c.nom)))];
  const mentions = `Sondage ${inst.nom} pour ${commanditaire}, terrain : ${inst.date}, auprès de ${inst.echantillon}. `
    + (erreur ? `Marge d'erreur théorique : ${erreur} à 95 %. ` : "")
    + `Chiffres tels que publiés${inst.nbHyp > 1 ? ` : fourchette selon les ${inst.nbHyp} hypothèses de candidatures testées` : " (hypothèse unique testée)"}. `
    + `Une notice détaillée est déposée à la Commission des sondages (commission-des-sondages.fr), qui précise la méthode. `
    + `Source : ${inst.source}, via la liste Wikipédia des sondages. Un sondage n'est pas une prévision.`
    + (credits.length ? ` Portraits : ${credits.join(" ; ")}, Wikimedia Commons.` : "");
  let y = storyBlancCadre(ctx, "Présidentielle 2027 · sondage", { date: inst.date });
  // les mentions légales occupent toute la place qu'il leur faut (jamais coupées, jamais sous 20 px) ; la liste se resserre au-dessus
  const bas = storyBlancPiedBas(ctx, mentions, { bas: BAS, taille: 22, maxLignes: 99, min: 20 }) - 24;
  y = storyBlancLigne(ctx, "Intentions de vote au 1er tour", M, y, { taille: 72, poids: 600, police: "Newsreader", largeur: LARG, min: 52, ls: -0.5, interligne: 1.05 }) + 2;
  y = storyBlancTexte(ctx, `${inst.nom} pour ${commanditaire} · terrain : ${inst.date}`, M, y, { taille: 28, poids: 700 });
  const nbTxt = n => `${n} candidat${n > 1 ? "s" : ""} sur ${tous.length} testés, classés par milieu de fourchette`;
  // la liste garde au moins 56 px par candidat ; au-delà de la place, les derniers candidats sont retirés de l'image (le nombre affiché suit)
  const dispoListe = n => bas - (y + 44) - 4;
  while(liste.length > 3 && dispoListe() / liste.length < 56) liste = liste.slice(0, -1);
  y = storyBlancTexte(ctx, nbTxt(liste.length), M, y + 2, { taille: 24, poids: 500, couleur: GRIS }) + 8;
  storyBlancFilet(ctx, y, { epais: 3, couleur: INK }); y += 6;
  const pas = Math.min(84, (bas - y) / liste.length), maxi = Math.max(...liste.map(c => c.r[1]));
  liste.forEach((cd, i) => {
    const yy = y + i * pas;
    if(i) storyBlancFilet(ctx, yy);
    rangee(ctx, {
      x: M, y: yy, h: pas, w: LARG, nom: cd.nom, valeur: score(cd), couleur: cd.couleur,
      part: cd.r[1] / maxi, part0: 0, // plein : bas de la fourchette ; clair : jusqu'au haut
      visuel: (c, x, yv, t) => storyBlancPortrait(c, photos[i], x, yv, t, cd.couleur, cd.nom),
    });
    // la fourchette : plein jusqu'au bas, tons clairs jusqu'au haut
    const t = Math.round(pas - 12), tx = M + t + 18, hb = Math.max(8, Math.round(pas * 0.15));
    const tn = Math.min(30, Math.round(pas * 0.4)), by = Math.min(yy + pas - hb - 4, yy + 6 + tn * 1.05 + 6);
    storyBlancBarre(ctx, tx, by, L - M - tx, hb, cd.r[1] / maxi, storyAlpha(cd.couleur, 0.35));
    storyBlancBarre(ctx, tx, by, L - M - tx, hb, cd.r[0] / maxi, cd.couleur, { piste: "rgba(0,0,0,0)" });
  });
  return { nom: `sondage-${slugDep(inst.nom)}` };
}

/* ---------- Fiche d'élu (député, sénateur) ---------- */
async function ficheElu(ctx, { rubrique, photo, couleur, nom, soustitre, ligne, cartes, titreVotes, votes, source }){
  let y = storyBlancCadre(ctx, rubrique);
  const bas = pied(ctx, source), t = 232;
  const z = storyBlancPortrait(ctx, photo, M, y + 6, t, couleur, nom);
  const tx = M + z.w + 40, tl = LARG - z.w - 40;
  let yn = storyBlancFit(ctx, nom, tx, y, y + 4 * 70, { tMax: 64, tMin: 38, police: "Newsreader", poids: 600, largeur: tl, interligne: 1.05, ls: -0.5 }).y + 6;
  yn = etiquetteParti(ctx, soustitre, tx, yn + 4, couleur, tl);
  y = Math.max(y + 6 + z.h + 36, yn + 12);
  y = storyBlancTexte(ctx, ligne, M, y, { taille: 30, poids: 600, couleur: GRIS }) + 14;
  // trois chiffres, séparés par des filets : valeur nette, légende dessous
  storyBlancFilet(ctx, y, { epais: 4, couleur: INK });
  const cw = LARG / 3;
  const tvNum = Math.min(...cartes.map(([v]) => tailleLigne(ctx, v, 600, 70, cw - 36, "Newsreader", 0, 30)));
  let hc = 0;
  cartes.forEach(([v, lib, coul], i) => {
    const x = M + i * cw + (i ? 20 : 0);
    if(i) storyBlancFilet(ctx, y + 18, { x: M + i * cw - 1, largeur: 2, epais: 150 });
    ecrire(ctx, v, x, y + 22 + tvNum * 0.86, { taille: tvNum, poids: 600, police: "Newsreader", couleur: lisible(coul) });
    const b = storyBlancTexte(ctx, lib, x, y + 22 + tvNum * 1.1, { taille: 22, poids: 500, couleur: GRIS, largeur: cw - 40, interligne: 1.15 });
    hc = Math.max(hc, b - y);
  });
  y += Math.max(hc, 150) + 22;
  storyBlancCaps(ctx, titreVotes, M, y, { taille: 24, couleur: GRIS }); y += 34;
  storyBlancFilet(ctx, y, { epais: 3, couleur: INK });
  if(!votes.length){ storyBlancTexte(ctx, "Aucun vote relevé pour l'instant.", M, y + 18, { taille: 28, couleur: GRIS }); return; }
  // les lignes de vote : titre entier (plusieurs lignes au besoin), position à droite ; celles qui ne tiennent pas sont omises
  const o = { taille: 26, poids: 500, largeur: LARG - 230, interligne: 1.22 };
  let n = 0;
  for(const v of votes){ const h = Math.max(70, storyBlancHauteur(ctx, v.titre, o) + 26); if(y + h > bas) break; storyBlancTexte(ctx, v.titre, M, y + 14, o); pastilleVote(ctx, v.code, L - M, y + h / 2); y += h; storyBlancFilet(ctx, y); n++; }
}
STORY_PLUS.depute = async ctx => {
  const d = DEPUTES?.find(x => x.id === deputeOuvert); if(!d) return null;
  const p = partiDepute(d), s = d.stats, exprimes = s.pour + s.contre + s.abst;
  const photo = await storyPortrait(`photos/deputes/${d.id}.jpg`);
  const possibles = [...d.votes].filter(c => c !== ".").length, presents = [...d.votes].filter(c => "pca".includes(c)).length;
  const derniers = DEPUTES_CLES.map((numero, i) => ({ code: d.votes[i], loi: LOIS.find(l => l.numero === numero) })).filter(x => x.code !== "." && x.loi).slice(0, 8);
  await ficheElu(ctx, {
    rubrique: "Votre député", photo, couleur: p.couleur, nom: d.nom, soustitre: p.nom,
    ligne: `${d.f ? "Députée" : "Député"} de ${circoDepute(d)} (${d.numDep})`,
    cartes: [[`${presents}/${possibles}`, d.f ? "votes clés où elle a voté" : "votes clés où il a voté", p.couleur], [pctFr(exprimes, s.scrutins), "de tous les scrutins", BLANC.bleu], [formatNombre(s.ecarts), "votes contre son groupe", BLANC.rouge]],
    titreVotes: "Ses derniers votes clés", votes: derniers.map(({ code, loi }) => ({ code, titre: titreLoi(loi) })),
    source: "Votes nominatifs de l'Assemblée nationale. Un taux bas ne veut pas dire qu'un député ne travaille pas (commissions, circonscription).",
  });
  return { nom: `depute-${slugDep(d.nom)}` };
};
STORY_PLUS.senateur = async ctx => {
  const s = SENATEURS?.find(x => x.id === senateurOuvert); if(!s) return null;
  const g = groupeSenateur(s), { lignes, presents, ecarts } = statsSenateur(s);
  const photo = await storyPortrait(`photos/senateurs/${s.id}.jpg`);
  await ficheElu(ctx, {
    rubrique: s.f ? "Votre sénatrice" : "Votre sénateur", photo, couleur: g.couleur, nom: s.nom, soustitre: g.nom,
    ligne: `${s.f ? "Sénatrice" : "Sénateur"} ${/^Français/.test(s.dep) ? "des Français de l'étranger" : `de ${s.dep}`}`,
    cartes: [[`${presents.length}/${lignes.length}`, s.f ? "textes où elle s'est prononcée" : "textes où il s'est prononcé", g.couleur], [["p", "c", "a"].map(k => presents.filter(x => x.code === k).length).join(" · "), "pour · contre · abst.", BLANC.bleu], [formatNombre(ecarts), "votes contre son groupe", BLANC.rouge]],
    titreVotes: "Ses derniers votes sur un texte", votes: lignes.slice(0, 8).map(({ code, scr }) => ({ code, titre: titreSenat(scr) })),
    source: "Vote de chaque sénateur relevé sur les pages officielles des scrutins du Sénat, recoupé avec le total officiel.",
  });
  return { nom: `senateur-${slugDep(s.nom)}` };
};

/* ---------- Présidentielle 2022 dans une commune ---------- */
STORY_PLUS.commune = async (ctx, info) => {
  const dep = info.dep, commune = info.commune;
  if(!ELECTIONS.has(dep)) ELECTIONS.set(dep, lireJSON(`data/elections/${dep}.json`));
  const data = await ELECTIONS.get(dep), r = data?.communes?.[commune];
  if(!r) return null;
  const classer = t => (r[t] || []).map((v, i) => [data.candidats[t][i], v]).sort((a, b) => b[1] - a[1]);
  const tours = [["t1", "1er tour · 10 avril 2022", r.t2 ? 5 : 8, classer("t1")]];
  if(r.t2) tours.push(["t2", "2d tour · 24 avril 2022", 2, classer("t2")]);
  const final = tours[tours.length - 1][3], [gagnant, vg] = final[0];
  const coulG = COULEURS_2022[gagnant] || "#8A8C94";
  const pct = v => (v / 10).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " %";
  let y = storyBlancCadre(ctx, "Présidentielle 2022 · résultats");
  const bas = pied(ctx, "Résultats définitifs du ministère de l'Intérieur (data.gouv.fr), en % des suffrages exprimés dans la commune.");
  y = storyBlancTitre(ctx, commune, M, y, y + 2 * 90, { tMax: 84, tMin: 48 }).y;
  y = storyBlancTexte(ctx, data.departement || "", M, y, { taille: 30, poids: 600, couleur: GRIS }) + 14;
  // en tête : bandeau de la couleur du candidat, nom, score
  storyBlancFilet(ctx, y, { epais: 4, couleur: INK }); y += 22;
  carre(ctx, M, y + 4, 20, coulG);
  storyBlancCaps(ctx, r.t2 ? "En tête au 2d tour" : "En tête au 1er tour", M + 34, y + 1, { taille: 24, couleur: GRIS });
  y += 46;
  const tn = tailleLigne(ctx, gagnant, 600, 60, LARG, "Newsreader", 0, 34);
  ecrire(ctx, gagnant, M, y + tn * 0.86, { taille: tn, poids: 600, police: "Newsreader" });
  y += tn * 1.1 + 4;
  const tp = tailleLigne(ctx, pct(vg), 600, 150, LARG, "Newsreader", -2, 60);
  ecrire(ctx, pct(vg), M - 4, y + tp * 0.82, { taille: tp, poids: 600, police: "Newsreader", couleur: lisible(coulG), ls: -2 });
  y += tp * 0.82 + 40;
  const nbL = tours.reduce((a, t) => a + t[2], 0), entetes = tours.length * 66;
  const pas = Math.min(78, (bas - y - entetes) / nbL);
  for(const [t, titre, n, lignes] of tours){
    storyBlancFilet(ctx, y, { epais: 3, couleur: INK });
    storyBlancCaps(ctx, titre, M, y + 20, { taille: 22, couleur: INK, ls: 2 });
    const autres = lignes.slice(n).reduce((a, [, v]) => a + v, 0);
    if(autres) ecrire(ctx, `Autres : ${pct(autres)}`, L - M, y + 40, { taille: 22, poids: 500, couleur: GRIS, align: "right" });
    y += 66;
    const maxi = lignes[0]?.[1] || 1;
    for(const [nomC, v] of lignes.slice(0, n)){
      const coul = COULEURS_2022[nomC] || "#8A8C94";
      rangee(ctx, { x: M, y, h: pas, w: LARG, nom: nomC, valeur: pct(v), couleur: coul, part: v / (t === "t2" ? 1000 : maxi), visuel: (c, x, yv, tt) => carre(c, x + tt / 2 - 10, yv + tt / 2 - 10, 20, coul) });
      y += pas;
    }
  }
  return { nom: `presidentielle-2022-${slugDep(commune)}` };
};

/* ---------- Qui gouverne ? ---------- */
STORY_PLUS.gouvernement = async ctx => {
  const g = GOUVERNEMENT; if(!g?.membres?.length) return null;
  let y = storyBlancCadre(ctx, "Qui gouverne ?");
  const delegue = m => /délégué|Secrétaire/i.test(m.qualite + " " + m.fonction.split(",")[0]);
  const pm = g.membres.find(m => m.qualite === "Premier ministre");
  let liste = g.membres.filter(m => !delegue(m) && m !== pm);
  const nbListe = liste.length;
  y = storyBlancTitre(ctx, `Le ${g.nom}`, M, y, y + 2 * 80, { tMax: 72, tMin: 46 }).y;
  y = storyBlancTexte(ctx, `Nommé le ${dateCourte(g.depuis)} · ${g.membres.length} membres`, M, y, { taille: 28, poids: 600, couleur: GRIS }) + 10;
  if(pm){
    storyBlancFilet(ctx, y, { epais: 4, couleur: INK }); y += 20;
    storyBlancCaps(ctx, "Premier ministre", M, y, { taille: 24, couleur: BLANC.rouge }); y += 36;
    y = storyBlancFit(ctx, pm.nom, M, y, y + 90, { tMax: 66, tMin: 36, police: "Newsreader", poids: 600, interligne: 1.05 }).y + 8;
  }
  // deux colonnes : nom en gras, fonction entière dessous (jamais coupée) ; les ministres qui ne tiennent pas sont comptés dans le pied
  const cw = (LARG - 40) / 2, tn = 28, tf = 21;
  const hCase = m => 14 + 34 + storyBlancHauteur(ctx, m.fonction, { taille: tf, poids: 500, largeur: cw, interligne: 1.15 }) + 4;
  const piedTxt = k => `Et ${g.membres.length - k - (pm ? 1 : 0)} ${k < nbListe ? "autres membres" : "ministres délégués"}. Source : Assemblée nationale, mandats des membres du Gouvernement.`;
  let k = liste.length;
  const hauteurRangs = n => { let h = 0; for(let i = 0; i < n; i += 2) h += Math.max(hCase(liste[i]), liste[i + 1] ? hCase(liste[i + 1]) : 0); return h; };
  // le pied dépend du nombre de membres omis : on réduit jusqu'à ce que liste et pied tiennent ensemble
  let basPied = piedMesure(ctx, piedTxt(k));
  while(k > 2 && y + 14 + hauteurRangs(k) > basPied){ k--; basPied = piedMesure(ctx, piedTxt(k)); }
  liste = liste.slice(0, k);
  pied(ctx, piedTxt(k));
  storyBlancFilet(ctx, y + 4, { epais: 3, couleur: INK }); y += 14;
  for(let i = 0; i < liste.length; i += 2){
    const h = Math.max(hCase(liste[i]), liste[i + 1] ? hCase(liste[i + 1]) : 0);
    [liste[i], liste[i + 1]].forEach((m, c) => {
      if(!m) return; const x = M + c * (cw + 40);
      const t = tailleLigne(ctx, m.nom, 700, tn, cw, "Public Sans", 0, 18);
      ecrire(ctx, m.nom, x, y + 14 + t * 0.9, { taille: t, poids: 700 });
      storyBlancTexte(ctx, m.fonction, x, y + 14 + 34, { taille: tf, poids: 500, couleur: GRIS, largeur: cw, interligne: 1.15 });
    });
    y += h; storyBlancFilet(ctx, y);
  }
  return { nom: "gouvernement" };
};

/* ---------- Classement des députés ---------- */
STORY_PLUS.classement = async ctx => {
  const k = CLASSEMENTS[classementChoisi];
  const [a, cm] = await Promise.all([ACTIVITE, COMMISSIONS]);
  const top = DEPUTES.map(d => [d, k.val(d, a?.deputes, cm?.deputes)]).filter(([, v]) => v != null).sort((x, z) => z[1] - x[1]).slice(0, 10);
  if(!top.length) return null;
  const p1 = partiDepute(top[0][0]);
  let y = storyBlancCadre(ctx, "Classement des députés");
  const bas = pied(ctx, k.note);
  y = storyBlancTitre(ctx, k.titre, M, y, y + 3 * 70, { tMax: 66, tMin: 42 }).y + 8;
  const photos = await Promise.all(top.map(([d]) => storyPortrait(`photos/deputes/${d.id}.jpg`)));
  // n° 1 : grand portrait, nom, groupe, valeur
  storyBlancFilet(ctx, y, { epais: 4, couleur: INK }); y += 20;
  const ph = 232, tx = M + ph + 34;
  storyBlancPortrait(ctx, photos[0], M, y, ph, p1.couleur, top[0][0].nom);
  storyBlancCaps(ctx, "N° 1", tx, y, { taille: 24, couleur: BLANC.rouge });
  const tn = tailleLigne(ctx, top[0][0].nom, 600, 50, L - M - tx, "Newsreader", 0, 30);
  ecrire(ctx, top[0][0].nom, tx, y + 40 + tn * 0.86, { taille: tn, poids: 600, police: "Newsreader" });
  const sous = `${top[0][0].groupe} · ${top[0][0].dep}`;
  ecrire(ctx, sous, tx, y + 40 + tn * 1.1 + 24, { taille: tailleLigne(ctx, sous, 500, 24, L - M - tx, "Public Sans", 0, 16), poids: 500, couleur: GRIS });
  const tv = tailleLigne(ctx, k.fmt(top[0][1]), 600, 96, L - M - tx, "Newsreader", -2, 40);
  ecrire(ctx, k.fmt(top[0][1]), tx, y + ph - 6, { taille: tv, poids: 600, police: "Newsreader", couleur: lisible(p1.couleur), ls: -2 });
  y += ph + 28;
  const reste = top.slice(1), pas = Math.min(86, (bas - y) / reste.length), maxi = top[0][1] || 1;
  storyBlancFilet(ctx, y, { epais: 3, couleur: INK });
  reste.forEach(([d, v], j) => {
    const yy = y + j * pas, p = partiDepute(d);
    if(j) storyBlancFilet(ctx, yy);
    rangee(ctx, { x: M, y: yy, h: pas, w: LARG, rang: j + 2, nom: d.nom, sous: `${d.groupe} · ${d.dep}`, valeur: k.fmt(v), couleur: p.couleur, part: v / maxi, visuel: (c, x, yv, t) => storyBlancPortrait(c, photos[j + 1], x, yv, t, p.couleur, d.nom) });
  });
  return { nom: `classement-${classementChoisi}` };
};

/* ---------- Agenda de l'Assemblée ---------- */
STORY_PLUS.agenda = async ctx => {
  const jours = (AGENDA_AN?.jours || []).filter(j => j.date >= aujourdhuiISO());
  if(!jours.length) return null;
  let y = storyBlancCadre(ctx, "Assemblée nationale · agenda");
  const bas = pied(ctx, "Source : Assemblée nationale, ordre du jour des séances publiques.");
  y = storyBlancTitre(ctx, "Ce que les députés examinent ces prochains jours", M, y, y + 3 * 66, { tMax: 62, tMin: 40 }).y + 10;
  const tl = LARG - 40, ta = 28;
  let nbJours = 0;
  for(const j of jours){
    const titre = new Date(j.date + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
    const points = [...(j.points.some(p => p.type === "qag") ? [{ type: "qag", objet: "Questions au Gouvernement" }] : []), ...j.points.filter(p => p.type !== "qag")].slice(0, 4);
    const blocs = [];
    let h = 70;
    for(const p of points){
      const vote = p.type === "vote", txt = (vote ? "Vote solennel : " : "") + p.objet, o = { taille: ta, poids: vote ? 700 : 500, largeur: tl, interligne: 1.2 }, bh = storyBlancHauteur(ctx, txt, o) + 8;
      if(y + h + bh + 20 > bas) break;
      blocs.push({ p, vote, txt, o }); h += bh;
    }
    if(!blocs.length) break;
    storyBlancFilet(ctx, y, { epais: 3, couleur: INK });
    ecrire(ctx, titre.charAt(0).toUpperCase() + titre.slice(1), M, y + 46, { taille: 36, poids: 600, police: "Newsreader" });
    let yy = y + 66;
    for(const { p, vote, txt, o } of blocs){
      carre(ctx, M, yy + 11, 14, vote ? BLANC.rouge : p.type === "qag" ? BLANC.bleu : GRIS);
      yy = storyBlancTexte(ctx, txt, M + 40, yy, { ...o, couleur: INK }) + 8;
    }
    y += h + 14; nbJours++;
  }
  return { nom: "agenda-assemblee" };
};

/* ---------- Quiz : mon résultat ---------- */
STORY_PLUS.quiz = async ctx => {
  const sc = QUIZ_RESULTAT; if(!sc?.length) return null;
  const ex = sc.filter(x => x.pct === sc[0].pct), seul = ex.length === 1, coul = seul ? sc[0].couleur : BLANC.bleu;
  let y = storyBlancCadre(ctx, "Mon résultat au quiz");
  const bas = pied(ctx, "Part des questions où ma réponse correspond à la position de la majorité du groupe, sur de vrais votes de l'Assemblée.");
  y = storyBlancTitre(ctx, "Qu'aurais-je voté à la place des députés ?", M, y, y + 2 * 62, { tMax: 56, tMin: 38 }).y + 6;
  const pctTxt = `${sc[0].pct} %`, tp = tailleLigne(ctx, pctTxt, 600, 220, LARG, "Newsreader", -4, 90);
  ecrire(ctx, pctTxt, M - 4, y + tp * 0.8, { taille: tp, poids: 600, police: "Newsreader", couleur: lisible(coul), ls: -4 });
  y += tp * 0.8 + 30;
  y = storyBlancTexte(ctx, seul ? `d'accord avec ${sc[0].nom}` : `d'accord avec ${ex.length} groupes`, M, y, { taille: 48, poids: 600, police: "Newsreader", interligne: 1.08 }) + 2;
  y = storyBlancTexte(ctx, quizPhrase(sc, "Mes"), M, y, { taille: 26, poids: 500, couleur: GRIS }) + 12;
  const lignes = sc.slice(0, 8);
  const logos = await Promise.all(lignes.map(x => { const p = PARTIES.find(q => q.nom === x.nom); return p ? storyImage(`icons/partis/${p.id}.png`) : null; }));
  const pas = Math.min(84, (bas - y - 6) / lignes.length);
  storyBlancFilet(ctx, y, { epais: 3, couleur: INK }); y += 6;
  lignes.forEach((x, i) => {
    const yy = y + i * pas;
    if(i) storyBlancFilet(ctx, yy);
    rangee(ctx, { x: M, y: yy, h: pas, w: LARG, nom: x.nom, valeur: `${x.pct} %`, couleur: x.couleur, part: x.pct / 100,
      visuel: (c, bx, yv, t) => { if(logos[i]) storyBlancLogo(c, logos[i], bx, yv, t, t); else carre(c, bx + t / 2 - 10, yv + t / 2 - 10, 20, x.couleur); } }); // logo sur le blanc, sans fond de couleur
  });
  return { nom: "quiz-hemicycle-france" };
};

/* ---------- Présidentielle 2027 : qui a le plus de chances ? ---------- */
STORY_PLUS.probabilites = async ctx => {
  if(!PROBAS?.candidats?.length || periodeReserveSondages()) return null;
  const avecVictoire = PROBAS.candidats.some(c => c.victoire !== null && c.victoire !== undefined);
  const liste = PROBAS.candidats.filter(c => c.secondTour >= 0.1 || (c.victoire || 0) >= 0.1)
    .sort((a, b) => ((b.victoire || 0) - (a.victoire || 0)) || (b.secondTour - a.secondTour)).slice(0, 6);
  if(!liste.length) return null;
  const m = PROBAS.methode || {};
  let y = storyBlancCadre(ctx, "Présidentielle 2027 · simulation");
  const bas = pied(ctx, `Simulation à partir des sondages (${formatNombre(m.tirages || 0)} élections simulées), pas une prédiction : les sondages mesurent l'opinion du moment.`);
  y = storyBlancTitre(ctx, "Qui a le plus de chances ?", M, y, y + 2 * 80, { tMax: 76, tMin: 52 }).y;
  y = storyBlancTexte(ctx, "Simulation à partir des sondages, pas une prédiction.", M, y + 2, { taille: 30, poids: 700, couleur: BLANC.rouge }) + 8;
  // légende des deux barres
  storyBlancFilet(ctx, y, { epais: 3, couleur: INK }); y += 18;
  ctx.fillStyle = BLANC.filet; ctx.fillRect(M, y + 6, 36, 18); ecrire(ctx, "chance d'aller au second tour", M + 48, y + 24, { taille: 24, poids: 600, couleur: GRIS });
  if(avecVictoire){ ctx.fillStyle = INK; ctx.fillRect(M + 500, y + 6, 36, 18); ecrire(ctx, "chance d'être élu", M + 548, y + 24, { taille: 24, poids: 600, couleur: GRIS }); }
  y += 50;
  const nb = liste.length, pas = Math.min(avecVictoire ? 170 : 120, (bas - y) / nb);
  liste.forEach((c, i) => {
    const yy = y + i * pas, coul = COULEURS_PARTIS[c.parti] || "#8A8C94";
    if(i) storyBlancFilet(ctx, yy);
    const elu = avecVictoire && c.victoire !== null && c.victoire !== undefined, pri = elu ? c.victoire : c.secondTour;
    const tv = pri < 1 ? 40 : 56, wv = larg(ctx, storyPPct(pri), 600, tv, "Newsreader") + 16;
    carre(ctx, M, yy + 22, 14, coul);
    const tn = tailleLigne(ctx, c.nom, 700, 34, LARG - 30 - wv, "Public Sans", 0, 20);
    ecrire(ctx, c.nom, M + 28, yy + 10 + tn * 0.9, { taille: tn, poids: 700 });
    ecrire(ctx, storyPPct(pri), L - M, yy + 8 + tv * 0.86, { taille: tv, poids: 600, police: "Newsreader", couleur: lisible(coul), align: "right" });
    const hb = 16, bx = M + 130, bw = LARG - 130 - 130;
    let by = yy + 8 + Math.max(tn, tv) + 14;
    ecrire(ctx, "2d tour", M, by + hb - 1, { taille: 22, poids: 600, couleur: GRIS });
    storyBlancBarre(ctx, bx, by, bw, hb, c.secondTour / 100, storyAlpha(coul, 0.45));
    ecrire(ctx, storyPPct(c.secondTour), L - M, by + hb - 1, { taille: 22, poids: 600, couleur: GRIS, align: "right" });
    if(elu){
      by += 30;
      ecrire(ctx, "Élu", M, by + hb - 1, { taille: 22, poids: 600, couleur: GRIS });
      storyBlancBarre(ctx, bx, by, bw, hb, c.victoire / 100, coul);
      ecrire(ctx, storyPPct(c.victoire), L - M, by + hb - 1, { taille: 22, poids: 700, align: "right" });
    }
  });
  return { nom: "probabilites-presidentielle" };
};

/* ---------- Un duel de second tour ---------- */
STORY_PLUS.secondtour = async (ctx, info) => {
  const d = SECOND_TOUR?.[Number(info)];
  if(!d?.instituts?.length || periodeReserveSondages()) return null;
  const [a, b] = [...d.candidats].sort((x, z) => (d.instituts[0].scores[z] ?? 0) - (d.instituts[0].scores[x] ?? 0));
  const ca = storyPCouleurCandidat(a);
  let cb = storyPCouleurCandidat(b); if(cb === ca) cb = "#6B6E78";
  const premier = d.instituts[0], sa = premier.scores[a], sb = premier.scores[b];
  let y = storyBlancCadre(ctx, "Présidentielle 2027 · second tour");
  const bas = pied(ctx, `Sondages de second tour (${premier.nom} et autres instituts), en % des votes exprimés, notices sur commission-des-sondages.fr. Un sondage n'est pas une prévision.`);
  y = storyBlancTitre(ctx, "Le duel testé par les sondages", M, y, y + 2 * 80, { tMax: 72, tMin: 48 }).y + 6;
  // duel : noms de part et d'autre, scores géants, barre partagée
  const demi = LARG / 2 - 24;
  storyBlancFilet(ctx, y, { epais: 4, couleur: INK }); y += 20;
  const ta = tailleLigne(ctx, a, 600, 54, demi, "Newsreader", 0, 30), tb = tailleLigne(ctx, b, 600, 54, demi, "Newsreader", 0, 30), tn = Math.min(ta, tb);
  ecrire(ctx, a, M, y + tn * 0.86, { taille: tn, poids: 600, police: "Newsreader" });
  ecrire(ctx, b, L - M, y + tn * 0.86, { taille: tn, poids: 600, police: "Newsreader", align: "right" });
  y += tn * 1.15 + 6;
  ctx.fillStyle = ca; ctx.fillRect(M, y, demi, 8); ctx.fillStyle = cb; ctx.fillRect(L - M - demi, y, demi, 8);
  y += 18;
  let tsc = 200; while(tsc > 80 && larg(ctx, nombreFr(sa), 600, tsc, "Newsreader", -3) + larg(ctx, nombreFr(sb), 600, tsc, "Newsreader", -3) + 120 > LARG) tsc -= 6;
  ecrire(ctx, nombreFr(sa), M - 2, y + tsc * 0.8, { taille: tsc, poids: 600, police: "Newsreader", couleur: lisible(ca), ls: -3 });
  ecrire(ctx, nombreFr(sb), L - M + 2, y + tsc * 0.8, { taille: tsc, poids: 600, police: "Newsreader", couleur: lisible(cb), ls: -3, align: "right" });
  ecrire(ctx, "%", L / 2, y + tsc * 0.8 - tsc * 0.35, { taille: 40, poids: 700, couleur: GRIS, align: "center" });
  y += tsc * 0.8 + 30;
  y = storyBlancTexte(ctx, `${premier.nom}, enquête du ${premier.date}`, M, y, { taille: 26, poids: 600, couleur: GRIS }) + 4;
  const wa = LARG * sa / (sa + sb);
  ctx.fillStyle = ca; ctx.fillRect(M, y, wa - 2, 48); ctx.fillStyle = cb; ctx.fillRect(M + wa + 2, y, LARG - wa - 2, 48);
  y += 48 + 34;
  if(d.instituts.length > 1){
    storyBlancFilet(ctx, y, { epais: 3, couleur: INK });
    storyBlancCaps(ctx, "Chaque institut", M, y + 18, { taille: 22, couleur: GRIS }); y += 56;
    const nb = Math.max(1, Math.min(6, d.instituts.length, Math.floor((bas - y) / 100)));
    const pas = Math.min(110, (bas - y) / nb);
    for(const i of d.instituts.slice(0, nb)){
      const x = i.scores[a], z = i.scores[b];
      const wd = larg(ctx, i.date, 500, 24);
      ecrire(ctx, i.date, L - M, y + 26, { taille: 24, poids: 500, couleur: GRIS, align: "right" });
      const tni = tailleLigne(ctx, i.nom, 700, 28, LARG - wd - 24, "Public Sans", 0, 18);
      ecrire(ctx, i.nom, M, y + 26, { taille: tni, poids: 700 });
      const by = y + 40, h = 26, w = LARG * x / (x + z);
      ctx.fillStyle = ca; ctx.fillRect(M, by, w - 2, h); ctx.fillStyle = cb; ctx.fillRect(M + w + 2, by, LARG - w - 2, h);
      ecrire(ctx, `${nombreFr(x)} %`, M, by + h + 30, { taille: 26, poids: 700, couleur: lisible(ca) });
      ecrire(ctx, `${nombreFr(z)} %`, L - M, by + h + 30, { taille: 26, poids: 700, couleur: lisible(cb), align: "right" });
      y += pas;
    }
  }
  return { nom: `second-tour-${slugDep(a)}-${slugDep(b)}` };
};

/* ---------- Décompte avant l'annonce du président ---------- */
STORY_PLUS.decompte = async ctx => {
  const [iso1, iso2] = TOURS_PRESIDENTIELLE;
  const jours = iso => Math.round((Date.parse(iso) - Date.parse(aujourdhuiISO())) / 864e5);
  const j2 = jours(iso2), j1 = jours(iso1);
  if(j2 < 0) return null;
  let y = storyBlancCadre(ctx, "Présidentielle 2027 · décompte");
  const bas = pied(ctx, "Calendrier de l'élection présidentielle de 2027 : premier tour le 18 avril, second tour le 2 mai ; résultats officiels proclamés par le Conseil constitutionnel.");
  y = storyBlancTitre(ctx, "Avant l'annonce du président de la République", M, y, y + 3 * 76, { tMax: 66, tMin: 44 }).y + 10;
  storyBlancFilet(ctx, y, { epais: 4, couleur: INK }); y += 10;
  const jtxt = j2 === 0 ? "Jour J" : `J-${j2}`, tj = tailleLigne(ctx, jtxt, 600, 380, LARG, "Newsreader", -8, 120);
  ecrire(ctx, jtxt, M - 6, y + tj * 0.78, { taille: tj, poids: 600, police: "Newsreader", couleur: BLANC.rouge, ls: -8 });
  y += tj * 0.78 + 28;
  if(j2 > 0) y = storyBlancTexte(ctx, j2 === 1 ? "plus qu'un jour" : `${formatNombre(j2)} jours · environ ${Math.round(j2 / 7)} semaines`, M, y, { taille: 40, poids: 700 }) + 24;
  const carte = (titre, date, detail, couleur, jr) => {
    storyBlancFilet(ctx, y, { epais: 3, couleur: INK });
    storyBlancCaps(ctx, titre, M, y + 18, { taille: 22, couleur: couleur });
    const wj = jr !== null ? larg(ctx, jr > 0 ? `J-${jr}` : "Jour J", 600, 72, "Newsreader") + 30 : 0;
    const b1 = storyBlancTexte(ctx, date, M, y + 54, { taille: 38, poids: 600, police: "Newsreader", largeur: LARG - wj, interligne: 1.05 });
    const b2 = storyBlancTexte(ctx, detail, M, b1 + 2, { taille: 26, poids: 500, couleur: GRIS });
    if(jr !== null) ecrire(ctx, jr > 0 ? `J-${jr}` : "Jour J", L - M, y + 100, { taille: 72, poids: 600, police: "Newsreader", couleur, align: "right" });
    y = b2 + 20;
  };
  if(j1 >= 0) carte("PREMIER TOUR", storyPDateLongue(iso1), "Scrutin du 18 avril", BLANC.rouge, j1);
  carte("SECOND TOUR ET ANNONCE", storyPDateLongue(iso2), "Annonce à 20 h, à la fermeture des derniers bureaux", BLANC.bleu, j2 > 0 ? j2 : null);
  return { nom: "decompte-presidentielle-2027" };
};

/* ---------- Une candidature ---------- */
STORY_PLUS.candidat = async (ctx, info) => {
  const c = CANDIDATURES?.find(x => x.nom === info);
  if(!c) return null;
  const coul = COULEURS_PARTIS[c.code] || "#8A8C94";
  const photo = await storyPortrait(`photos/personnalites/${slugDep(c.nom)}.jpg`);
  const credits = photo ? await storyPCredits([c.nom]) : [];
  const dom = storyPDomaine(c.source) || "la source indiquée sur le site";
  let y = storyBlancCadre(ctx, "Présidentielle 2027 · candidat");
  const bas = pied(ctx, `Candidature rapportée par ${dom}, d'après la liste des candidatures de Wikipédia.${credits.length ? ` Photo : ${credits.join(", ")}.` : ""}`);
  if(photo){
    // portrait à gauche, nom, parti et âge à droite
    const pw = 360, ph = 480, z = storyPPhoto(ctx, photo, M, y, pw, ph);
    ctx.fillStyle = coul; ctx.fillRect(z.x, z.y + z.h, z.w, 8);
    const x0 = M + z.w + 40, w = L - M - x0;
    let yn = storyBlancFit(ctx, c.nom, x0, y - 4, y + 280, { tMax: 78, tMin: 42, police: "Newsreader", poids: 600, largeur: w, interligne: 1.02, ls: -0.5 }).y + 8;
    yn = etiquetteParti(ctx, c.parti, x0, yn, coul, w);
    y = Math.max(y + z.h + 34, yn + 20);
    if(c.age){ // l'âge, en grand, sous le portrait
      storyBlancFilet(ctx, y, { epais: 3, couleur: INK });
      ecrire(ctx, String(c.age), M - 4, y + 190, { taille: 190, poids: 600, police: "Newsreader", couleur: lisible(coul), ls: -5 });
      const wa = larg(ctx, String(c.age), 600, 190, "Newsreader", -5);
      ecrire(ctx, "ans", M + wa + 20, y + 120, { taille: 44, poids: 700 });
      ecrire(ctx, "au premier tour", M + wa + 20, y + 164, { taille: 28, poids: 500, couleur: GRIS });
      y += 230;
    }
  } else {
    y = storyBlancTitre(ctx, c.nom, M, y, y + 3 * 120, { tMax: 120, tMin: 56 }).y + 10;
    y = etiquetteParti(ctx, c.parti, M, y, coul, LARG) + 20;
    const da = c.annonce ? new Date(c.annonce + "T12:00:00") : null, stats = [];
    if(c.age) stats.push([String(c.age), "ans", "au premier tour"]);
    if(da && !isNaN(da)) stats.push([String(da.getDate()), da.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }), "candidature annoncée"]);
    for(const [gros, l1, l2] of stats){
      if(y + 250 > bas - 200) continue;
      storyBlancFilet(ctx, y, { epais: 3, couleur: INK });
      ecrire(ctx, gros, M - 4, y + 220, { taille: 250, poids: 600, police: "Newsreader", couleur: lisible(coul), ls: -6 });
      const wg = larg(ctx, gros, 600, 250, "Newsreader", -6) + 30;
      ecrire(ctx, l1, M + wg, y + 140, { taille: tailleLigne(ctx, l1, 700, 52, L - M - M - wg, "Public Sans", 0, 24), poids: 700 });
      ecrire(ctx, l2, M + wg, y + 190, { taille: 30, poids: 500, couleur: GRIS });
      y += 270;
    }
    y += 10;
  }
  // slogan et fonctions : tant qu'il reste de la place avant le pied (rien n'est coupé : les fonctions qui ne tiennent pas sont omises)
  const limite = bas - 80;
  if(c.slogan){
    const sl = `« ${c.slogan} »`, o = t => ({ taille: t, poids: 600, police: "Newsreader", couleur: INK, interligne: 1.15 });
    let t = 48; while(t > 30 && y + storyBlancHauteur(ctx, sl, o(t)) > limite) t -= 2;
    if(y + storyBlancHauteur(ctx, sl, o(t)) <= limite) y = storyBlancTexte(ctx, sl, M, y, o(t)) + 12;
  }
  for(const f of (c.fonctions || []).slice(0, 4)){
    const o = { taille: 30, poids: 500, couleur: INK, interligne: 1.2, largeur: LARG - 40 };
    if(y + storyBlancHauteur(ctx, f, o) > limite) break;
    carre(ctx, M, y + 11, 14, BLANC.rouge); y = storyBlancTexte(ctx, f, M + 40, y, o) + 8;
  }
  const ya = Math.min(y + 14, bas - 60);
  storyBlancFilet(ctx, ya, { epais: 3, couleur: INK });
  storyBlancTexte(ctx, c.annonce ? `Candidature annoncée le ${dateCourte(c.annonce) || c.annonce}` : "Candidature annoncée", M, ya + 14, { taille: 32, poids: 700, couleur: BLANC.rouge });
  return { nom: `candidat-${slugDep(c.nom)}` };
};

/* ---------- Un parti ---------- */
STORY_PLUS.parti = async (ctx, info) => {
  const l = LEADERS?.find(x => x.parti === info);
  if(!l) return null;
  const p = PARTIES.find(x => x.id === l.parti), g = GROUPES?.[l.parti];
  const coul = l.couleur || p?.couleur || "#6B6E78", sansChef = l.nom.startsWith("—");
  let y = storyBlancCadre(ctx, "Les partis");
  const bas = pied(ctx, `Direction du parti : ${l.source?.nom || "sources publiques"}. Effectifs du groupe : Assemblée nationale (open data).`);
  // logo sur fond blanc, sigle en grand, libellé
  const logo = await storyImage(`icons/partis/${l.parti}.png`);
  let tx = M; const lh = 240;
  if(logo){ storyBlancLogo(ctx, logo, M, y, 260, lh, { align: "left" }); tx = M + 300; }
  const ts = tailleLigne(ctx, l.parti, 600, 150, L - M - tx, "Newsreader", -3, 60);
  ecrire(ctx, l.parti, tx, y + ts * 0.82 + 10, { taille: ts, poids: 600, police: "Newsreader", couleur: lisible(coul), ls: -3 });
  storyBlancTexte(ctx, g?.libelle || p?.nom || l.parti, tx, y + ts * 0.82 + 36, { taille: 30, poids: 600, couleur: GRIS, largeur: L - M - tx, interligne: 1.2 });
  y += lh + 24;
  ctx.fillStyle = coul; ctx.fillRect(M, y, LARG, 8); y += 26;
  storyBlancCaps(ctx, "À la tête du parti", M, y, { taille: 24, couleur: GRIS }); y += 40;
  const reste = g?.membres ? (g.president && g.president !== l.nom ? 430 : 330) : 0;
  y = storyBlancTitre(ctx, sansChef ? "Pas de chef de parti unique" : l.nom, M, y, y + 2 * 90, { tMax: sansChef ? 72 : 88, tMin: 44 }).y + 6;
  y = storyBlancFit(ctx, l.role, M, y, bas - reste, { tMax: 40, tMin: 24, poids: 500, couleur: GRIS, interligne: 1.25 }).y + 28;
  if(g?.membres){
    storyBlancFilet(ctx, y, { epais: 3, couleur: INK }); y += 14;
    const n = formatNombre(g.membres), tn = tailleLigne(ctx, n, 600, 200, LARG * 0.5, "Newsreader", -4, 80);
    ecrire(ctx, n, M - 4, y + tn * 0.8, { taille: tn, poids: 600, police: "Newsreader", couleur: lisible(coul), ls: -4 });
    const wn = larg(ctx, n, 600, tn, "Newsreader", -4) + 28;
    storyBlancTexte(ctx, "députés dans le groupe à l'Assemblée nationale", M + wn, y + tn * 0.25, { taille: 32, poids: 600, couleur: INK, largeur: L - M - M - wn, interligne: 1.2 });
    y += tn * 0.8 + 40;
    if(g.president && g.president !== l.nom) storyBlancTexte(ctx, `${g.presidente ? "Présidente" : "Président"} du groupe : ${g.president}`, M, y, { taille: 36, poids: 600 });
  }
  return { nom: `parti-${slugDep(l.parti)}` };
};

/* ---------- Une décision de justice ---------- */
STORY_PLUS.justice = async (ctx, info) => {
  const c = CONDAMNATIONS?.[Number(info)];
  if(!c) return null;
  const coul = c.statut === "definitif" ? BLANC.rouge : BLANC.ambre;
  let y = storyBlancCadre(ctx, "Justice · décisions rendues");
  const bas = pied(ctx, `Source : ${c.source}. Statut tel qu'indiqué par la source ; présomption d'innocence tant que la décision n'est pas définitive.`);
  y = storyBlancTitre(ctx, c.nom, M, y, y + 2 * 90, { tMax: 84, tMin: 50 }).y;
  y = storyBlancTexte(ctx, `${c.role} · ${c.parti}`, M, y, { taille: 30, poids: 600, couleur: GRIS }) + 16;
  // statut, tel qu'il figure dans la source : filet de couleur et mot écrit
  const hStatut = 52 + storyBlancHauteur(ctx, c.statutLabel, { taille: 34, poids: 700, largeur: LARG - 40, interligne: 1.2 }) + 16;
  ctx.fillStyle = BLANC.fondDoux; ctx.fillRect(M, y, LARG, hStatut); ctx.fillStyle = coul; ctx.fillRect(M, y, 10, hStatut);
  storyBlancCaps(ctx, "Statut judiciaire", M + 34, y + 18, { taille: 22, couleur: GRIS });
  storyBlancTexte(ctx, c.statutLabel, M + 34, y + 52, { taille: 34, poids: 700, couleur: coul === BLANC.ambre ? BLANC.ambre : coul, largeur: LARG - 60, interligne: 1.2 });
  y += hStatut + 30;
  const note = c.statut === "appel" ? "Décision non définitive : la présomption d'innocence s'applique pour ces faits tant que la justice n'a pas statué définitivement." : "";
  const hNote = note ? storyBlancHauteur(ctx, note, { taille: 28, poids: 600, largeur: LARG - 72, interligne: 1.25 }) + 44 : 0;
  y = storyBlancTitre(ctx, c.affaire, M, y, y + 3 * 66, { tMax: 56, tMin: 36 }).y + 10;
  y = storyBlancFit(ctx, c.detail, M, y, bas - hNote - 20, { tMax: 46, tMin: 24, poids: 500, interligne: 1.32 }).y + 22;
  if(note){
    ctx.strokeStyle = BLANC.ambre; ctx.lineWidth = 4; ctx.strokeRect(M + 2, y + 2, LARG - 4, hNote - 4);
    storyBlancTexte(ctx, note, M + 36, y + 20, { taille: 28, poids: 600, largeur: LARG - 72, interligne: 1.25 });
  }
  return { nom: `justice-${slugDep(c.nom)}-${slugDep(c.affaire).slice(0, 30)}` };
};

/* ---------- Un chiffre clé ---------- */
STORY_PLUS.indicateur = async (ctx, info) => {
  const i = INDICATEURS?.[Number(info)];
  if(!i) return null;
  const coul = i.tendance === "up" ? BLANC.rouge : i.tendance === "down" ? BLANC.vert : INK;
  let y = storyBlancCadre(ctx, "Chiffres clés · France");
  const bas = pied(ctx, `Source : ${i.source}, ${i.date}. Série officielle consultable sur ${storyPDomaine(i.url) || "le site de la source"}.`);
  y = storyBlancTitre(ctx, i.nom, M, y, y + 2 * 84, { tMax: 78, tMin: 48 }).y + 10;
  storyBlancFilet(ctx, y, { epais: 4, couleur: INK }); y += 10;
  const mv = /^(.+?%)\s+(\S.*)$/.exec(i.valeur), valeur = mv ? mv[1] : i.valeur;
  const tv = tailleLigne(ctx, valeur, 600, 290, LARG, "Newsreader", -6, 90);
  ecrire(ctx, valeur, M - 6, y + tv * 0.82, { taille: tv, poids: 600, police: "Newsreader", couleur: coul, ls: -6 });
  y += tv * 0.82 + 34;
  if(mv) y = storyBlancTexte(ctx, mv[2], M, y, { taille: 48, poids: 600, police: "Newsreader", couleur: GRIS }) + 4;
  if(i.tendance === "up" || i.tendance === "down"){
    storyBlancTendance(ctx, i.tendance === "up", M + 22, y + 24, 36, coul);
    ecrire(ctx, i.tendance === "up" ? "En hausse" : "En baisse", M + 64, y + 38, { taille: 38, poids: 700, couleur: INK });
    y += 70;
  }
  y += 10; storyBlancFilet(ctx, y); y += 22;
  y = storyBlancFit(ctx, i.detail, M, y, bas - 70, { tMax: 46, tMin: 28, poids: 500, interligne: 1.32 }).y + 14;
  storyBlancTexte(ctx, `${i.source}, ${i.date}`, M, y, { taille: 28, poids: 700, couleur: BLANC.rouge });
  return { nom: `chiffre-${slugDep(i.nom)}` };
};

/* ---------- Un groupe de l'Assemblée ---------- */
STORY_PLUS.groupe = async (ctx, info) => {
  const p = PARTIES.find(x => x.id === info);
  if(!p) return null;
  const g = GROUPES?.[p.id], eff = g?.membres ?? p.sieges, coul = p.couleur, total = TOTAL_SIEGES || 577;
  let y = storyBlancCadre(ctx, "Assemblée nationale · groupe");
  const bas = pied(ctx, "Assemblée nationale, composition des groupes politiques (open data) ; effectifs relevés automatiquement.");
  const logo = await storyImage(`icons/partis/${p.id}.png`);
  let tx = M; const lh = 210;
  if(logo){ storyBlancLogo(ctx, logo, M, y, 240, lh, { align: "left" }); tx = M + 280; }
  const ts = tailleLigne(ctx, p.id, 600, 130, L - M - tx, "Newsreader", -3, 60);
  ecrire(ctx, p.id, tx, y + ts * 0.82 + 6, { taille: ts, poids: 600, police: "Newsreader", couleur: lisible(coul), ls: -3 });
  storyBlancTexte(ctx, g?.libelle || p.nom, tx, y + ts * 0.82 + 30, { taille: 32, poids: 600, couleur: GRIS, largeur: L - M - tx, interligne: 1.2 });
  y += lh + 20;
  ctx.fillStyle = coul; ctx.fillRect(M, y, LARG, 8); y += 14;
  const n = formatNombre(eff), tn = tailleLigne(ctx, n, 600, 330, LARG - 10, "Newsreader", -6, 120);
  ecrire(ctx, n, M - 6, y + tn * 0.8, { taille: tn, poids: 600, police: "Newsreader", couleur: lisible(coul), ls: -6 });
  y += tn * 0.8 + 30;
  y = storyBlancTexte(ctx, eff > 1 ? "députés" : "député", M, y, { taille: 56, poids: 600, police: "Newsreader" }) + 18;
  storyBlancBarre(ctx, M, y, LARG, 34, Math.min(eff, total) / total, coul);
  const maj = Math.floor(total / 2) + 1, xm = M + LARG * maj / total;
  ctx.fillStyle = INK; ctx.fillRect(xm - 2, y - 12, 4, 58);
  y += 74;
  ecrire(ctx, `${nombreFr(eff / total * 100)} % des ${formatNombre(total)} sièges`, M, y + 20, { taille: 28, poids: 600, couleur: GRIS });
  ecrire(ctx, `Majorité absolue : ${maj}`, L - M, y + 20, { taille: 28, poids: 600, couleur: INK, align: "right" });
  y += 66;
  if(g?.president && y + 150 <= bas){
    storyBlancFilet(ctx, y, { epais: 3, couleur: INK });
    storyBlancCaps(ctx, g.presidente ? "Présidente du groupe" : "Président du groupe", M, y + 18, { taille: 22, couleur: GRIS });
    const b = storyBlancLigne(ctx, g.president, M, y + 50, { taille: 52, poids: 600, police: "Newsreader", largeur: LARG, min: 30 });
    if(g.presidentDepuis) storyBlancTexte(ctx, `depuis le ${dateCourte(g.presidentDepuis)}`, M, b, { taille: 26, poids: 500, couleur: GRIS });
  }
  return { nom: `groupe-${slugDep(p.id)}` };
};

/* ---------- Un meeting ---------- */
STORY_PLUS.meeting = async (ctx, info) => {
  const m = MEETINGS?.[Number(info)];
  if(!m) return null;
  const coul = m.partyColor || "#6B6E78";
  let y = storyBlancCadre(ctx, "Agenda · meetings");
  const bas = pied(ctx, "");
  ctx.fillStyle = coul; ctx.fillRect(M, y, LARG, 8); y += 14;
  const tj = tailleLigne(ctx, m.jour, 600, 290, LARG, "Newsreader", -6, 100);
  ecrire(ctx, m.jour, M - 6, y + tj * 0.8, { taille: tj, poids: 600, police: "Newsreader", couleur: lisible(coul), ls: -6 });
  y += tj * 0.8 + 26;
  const mois = String(m.mois).toUpperCase(), tm = tailleLigne(ctx, mois, 800, 60, LARG, "Public Sans", 4, 30);
  const wm = ecrire(ctx, mois, M, y + tm * 0.86, { taille: tm, poids: 800, couleur: BLANC.rouge, ls: 4 });
  if(m.parti){
    const xp = M + wm + 40, wp = L - M - xp;
    if(wp > 160){ etiquetteParti(ctx, m.parti, xp, y + 8, coul, wp); } else etiquetteParti(ctx, m.parti, M, y + tm + 20, coul, LARG);
  }
  y += tm + 50;
  storyBlancFilet(ctx, y, { epais: 3, couleur: INK }); y += 24;
  y = storyBlancTitre(ctx, m.titre, M, y, y + 4 * 74, { tMax: 66, tMin: 38 }).y + 10;
  const ou = [m.heure && m.heure !== "—" ? m.heure : "", m.lieu].filter(Boolean).join(" · ");
  if(ou) y = storyBlancTexte(ctx, ou, M, y, { taille: 32, poids: 700, couleur: INK, interligne: 1.2 }) + 12;
  const statut = (m.fin || m.debut) < aujourdhuiISO() ? "Événement passé" : !m.verified ? "Date à confirmer" : "";
  y = storyBlancFit(ctx, m.desc, M, y, bas - (statut ? 56 : 0), { tMax: 42, tMin: 26, poids: 500, interligne: 1.3, couleur: INK }).y + 14;
  if(statut) storyBlancEtiquette(ctx, statut, M, y, { taille: 24, couleur: statut === "Date à confirmer" ? BLANC.ambre : GRIS });
  return { nom: `meeting-${slugDep(m.titre).slice(0, 40)}` };
};

// « scrutin » et « senat » : même dessin (chambre différente)
STORY_PLUS.scrutin = (ctx, info) => scrutinHorsPresse(ctx, "scrutin", info);
STORY_PLUS.senat = (ctx, info) => scrutinHorsPresse(ctx, "senat", info);
STORY_PLUS.sondages = (ctx, info) => sondageHorsPresse(ctx, info);
})();
