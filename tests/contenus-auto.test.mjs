// Tests de scripts/contenus-auto.cjs (contenus Instagram récurrents) sur des données d'essai (tests/fixtures/contenus.json) : aucun appel réseau, aucun navigateur.
// USAGE : node tests/contenus-auto.test.mjs
import assert from "assert";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const C = require("../scripts/contenus-auto.cjs");
const { validerCarrousel } = require("../scripts/carrousel.cjs");
const { motExclu } = require("../scripts/stories-auto.cjs");

const fx = JSON.parse(readFileSync("tests/fixtures/contenus.json", "utf-8"));
const html = readFileSync("index.html", "utf-8");
const clone = (o) => JSON.parse(JSON.stringify(o));
const donnees = () => ({ ...clone(fx.donnees), notions: C.notionsComprendre(html) });
const CRENEAUX = C.normaliserCreneaux(null);
const vide = { entrees: [] };
const plan = (now, extra = {}) => C.planifier({ now: new Date(now), donnees: donnees(), file: vide, registre: vide, brouillons: [], etat: C.etatVide(), creneaux: CRENEAUX, config: { contenusAuto: true }, ...extra });
const contenu = (nom, now, extra = {}) => plan(now, extra).plan.find((p) => p.nom === nom);

// ---------- Heure de Paris, créneaux ----------
assert.strictEqual(C.parisVersIso("2026-10-13", 8 * 60 + 30), "2026-10-13T06:30:00.000Z", "été : 8 h 30 Paris = 6 h 30 UTC");
assert.strictEqual(C.parisVersIso("2026-11-03", 8 * 60 + 30), "2026-11-03T07:30:00.000Z", "hiver : 8 h 30 Paris = 7 h 30 UTC");
assert.strictEqual(C.parisVersIso("2026-10-25", 8 * 60), "2026-10-25T07:00:00.000Z", "jour du changement d'heure (retour à l'heure d'hiver à 3 h) : 8 h = 7 h UTC");
assert.deepStrictEqual(C.parisInfos(new Date("2026-10-11T22:30:00Z")), { jour: "2026-10-12", minutes: 30, isoWeekday: 1 }, "22 h 30 UTC dimanche = 0 h 30 Paris lundi");
assert.strictEqual(C.semaineISO("2026-10-11").id, "2026-W41");
assert.strictEqual(C.semaineISO("2026-10-12").id, "2026-W42");
{
  // défauts conformes à la demande : 8 h 30, 12 h 30, 19 h, dimanche 18 h 30
  assert.strictEqual(CRENEAUX.aujourdhui.minutes, 8 * 60 + 30);
  assert.strictEqual(CRENEAUX["vote-jour"].minutes, 12 * 60 + 30);
  assert.strictEqual(CRENEAUX["chiffre-jour"].minutes, 19 * 60);
  assert.strictEqual(CRENEAUX["carrousel-hebdo"].minutes, 18 * 60 + 30);
  assert.deepStrictEqual(CRENEAUX["carrousel-hebdo"].jours, [7]);
  // bornes : jamais avant 7 h ni après 22 h 30 ; valeur invalide : défaut
  const c = C.normaliserCreneaux({ aujourdhui: { heure: "03:00" }, "vote-jour": { heure: "23:45" }, "chiffre-jour": { heure: "abc" }, comprendre: { heure: "10:00", jours: [0, 9] } });
  assert.strictEqual(c.aujourdhui.minutes, 7 * 60);
  assert.strictEqual(c["vote-jour"].minutes, 22 * 60 + 30);
  assert.strictEqual(c["chiffre-jour"].minutes, 19 * 60, "heure invalide : défaut");
  assert.deepStrictEqual(c.comprendre.jours, [6], "jours invalides : défaut");
  // un créneau coupé n'existe plus
  assert.ok(!C.normaliserCreneaux({ "chiffre-jour": false })["chiffre-jour"]);
  // 60 min d'écart au moins entre deux contenus du même jour : le dimanche, le chiffre (19 h) est repoussé après le carrousel (18 h 30)
  const dim = C.creneauxDuJour(CRENEAUX, 7);
  assert.deepStrictEqual(dim.map((x) => [x.nom, x.minutes]), [["aujourdhui", 510], ["vote-jour", 750], ["carrousel-loi", 1050], ["carrousel-hebdo", 1110], ["chiffre-jour", 1170]].filter(([n]) => dim.some((x) => x.nom === n)));
  for (let i = 1; i < dim.length; i++) assert.ok(dim[i].minutes - dim[i - 1].minutes >= 60, "60 min d'écart");
  for (const j of [1, 2, 3, 4, 5, 6, 7]) for (const x of C.creneauxDuJour(CRENEAUX, j)) assert.ok(x.minutes >= 7 * 60 && x.minutes <= 22 * 60 + 30, "toujours entre 7 h et 22 h 30");
  // créneaux identiques : le second est repoussé ; au-delà de 22 h 30, abandonné
  const tous = C.normaliserCreneaux({ aujourdhui: { heure: "22:00" }, "vote-jour": { heure: "22:00" }, "chiffre-jour": { heure: "22:30" } });
  const j1 = C.creneauxDuJour(tous, 1);
  assert.ok(j1.every((x) => x.minutes <= 22 * 60 + 30));
}

// ---------- 1. Aujourd'hui à l'Assemblée ----------
{
  const p = contenu("aujourdhui", fx.instants.aujourdhui);
  assert.ok(p, "un contenu est préparé");
  assert.strictEqual(p.rendu.type, "aujourdhui");
  assert.strictEqual(p.pasAvant, "2026-10-20T06:30:00.000Z", "publiable à partir de 8 h 30 (Paris)");
  assert.ok(Date.parse(p.expire) > Date.parse(p.pasAvant));
  const textes = p.rendu.spec.points.map((x) => x.t);
  assert.deepStrictEqual(p.rendu.spec.points.map((x) => x.k), ["qag", "vote", "texte"], "QAG, vote solennel puis textes");
  assert.ok(textes.includes("Budget de l'État 2027"), "intitulé simplifié à l'affichage");
  assert.ok(p.entree.sujets.includes("Projet de loi de finances pour 2027 (première partie)"), "sujets (anti-doublon) : intitulé officiel d'origine");
  assert.ok(p.rendu.spec.points.every((x) => x.t.split(/\s+/).length <= 12), "intitulés courts");
  assert.ok(/^Aujourd'hui, les députés se réunissent : \d+ textes? au programme$/.test(p.entree.accroche));
  assert.ok(p.entree.sources.every((u) => u.startsWith("https://")), "source officielle citée");
  assert.ok(p.rendu.spec.source.includes("Assemblée nationale"));
  // 13 octobre : les deux votes solennels portent des mots « prudents » de la presse (violences sexuelles, judiciaire) mais l'ordre du jour de l'Assemblée est une
  // donnée OFFICIELLE sans accusation : ils sont gardés (liste « officielle » réduite, audit J-01). Les mots qui visent une personne restent écartés.
  const q = contenu("aujourdhui", "2026-10-13T05:00:00Z");
  assert.ok(q, "le contenu est préparé");
  assert.strictEqual(q.rendu.spec.points.filter((x) => x.k === "vote").length, 2, "les deux votes de l'ordre du jour officiel sont gardés");
  assert.ok(q.rendu.spec.points.every((x) => !motExclu(x.t, { officiel: true })));
  assert.ok(q.rendu.spec.points.some((x) => /violences sexuelles/.test(x.t)), "titre officiel de la proposition de loi");
  assert.ok(motExclu("Proposition de loi apportant une réponse intégrale au phénomène de violences sexuelles"), "la même formule dans un titre de presse reste écartée");
  // jour sans séance
  assert.ok(plan("2026-10-17T05:00:00Z").refus.aujourdhui?.includes("pas de séance"), "samedi : pas de séance");
  // agenda trop ancien : refus
  const d = donnees(); d.agenda.lastUpdated = "2026-10-01T00:00:00Z";
  assert.ok(C.planifier({ now: new Date(fx.instants.aujourdhui), donnees: d, file: vide, registre: vide, etat: C.etatVide(), creneaux: CRENEAUX, config: {} }).refus.aujourdhui.includes("trop ancien"));
  // que des questions au Gouvernement + un point visant une personne (liste officielle) : rien
  const e = donnees(); e.agenda.jours = [{ date: "2026-10-20", points: [{ type: "qag", objet: "Questions au Gouvernement" }, { type: "texte", objet: "Débat sur l'affaire Dupont, mis en examen" }] }];
  assert.ok(C.choisirAujourdhui({ agenda: e.agenda, jour: "2026-10-20", now: new Date(fx.instants.aujourdhui) }).refus);
  // pas avant l'heure de préparation (2 h avant 8 h 30 = 6 h 30 Paris)
  assert.ok(!contenu("aujourdhui", "2026-10-20T04:00:00Z"), "trop tôt");
  assert.ok(contenu("aujourdhui", "2026-10-20T04:35:00Z"), "6 h 35 Paris : préparé");
  // créneau dépassé (8 h 30 + 4 h)
  assert.ok(!contenu("aujourdhui", "2026-10-20T10:31:00Z"), "après la validité : plus rien");
}

// ---------- 1 bis. Intitulés sans jargon (cas réel GloBE du 7 octobre) ----------
{
  const g = contenu("aujourdhui", "2026-10-07T05:00:00Z");
  assert.ok(g, "le contenu du 7 octobre est préparé");
  const globe = g.rendu.spec.points.find((x) => /GloBE/.test(x.brut));
  assert.ok(globe, "le point GloBE est présent");
  assert.strictEqual(globe.t, "Fiscalité : échange d'informations entre pays", "affichage lisible en 2 secondes");
  assert.ok(/^Projet de loi autorisant/.test(globe.brut), "intitulé officiel gardé (alt, registre)");
  assert.ok(g.entree.sujets.some((x) => /^Projet de loi autorisant l.approbation/.test(x)), "sujets d'origine pour l'anti-doublon");
  assert.ok(!g.entree.sujets.some((x) => /^Fiscalité :/.test(x)), "le texte simplifié n'entre pas dans les sujets");
  assert.ok(g.entree.alt.includes("échange d'informations entre pays") && !g.entree.alt.includes("autorisant"), "texte alternatif : en mots simples");
}

// ---------- 2. Le vote du jour ----------
{
  const p = contenu("vote-jour", fx.instants["vote-jour"]);
  assert.ok(p);
  assert.strictEqual(p.pasAvant, "2026-10-13T10:30:00.000Z", "12 h 30 Paris");
  assert.ok([8425].includes(p.rendu.spec.numero), "amendement du Gouvernement (l'article de 8415 porte un mot prudent) ; jamais le vote final (8418)");
  const l = clone(fx.donnees.lois);
  // un vote final de loi n'est JAMAIS un « vote du jour » : il reste un post
  assert.strictEqual(C.classerScrutin({ titre: "l'ensemble de la proposition de loi visant à protéger les mineurs (première lecture).", typeVote: "SPS" }), null);
  assert.strictEqual(C.classerScrutin({ titre: "l'amendement n° 12 de M. Dupont à l'article 3 de la proposition de loi.", typeVote: "SPO" }), null, "amendement ordinaire : non");
  assert.strictEqual(C.classerScrutin({ titre: "l'amendement n° 12 du Gouvernement à l'article 3 de la proposition de loi.", typeVote: "SPO" }).type, "Amendement du Gouvernement");
  assert.strictEqual(C.classerScrutin({ titre: "la motion de censure déposée en application de l'article 49", typeVote: "MOC" }).type, "Motion de censure");
  // la motion de censure l'emporte, sans les noms de ses signataires
  const m = l.lois.find((x) => x.typeVote === "MOC"); m.dateISO = "2026-10-12"; m.date = "12 octobre 2026";
  const r = C.choisirVoteDuJour({ lois: l, jour: "2026-10-13", now: new Date("2026-10-13T08:30:00Z") });
  assert.strictEqual(r.contenu.rendu.spec.type, "Vote pour renverser le Gouvernement");
  assert.ok(!/Mmes?|M\. /.test(r.contenu.rendu.spec.objet), `signataires retirés : ${r.contenu.rendu.spec.objet}`);
  assert.ok(r.contenu.entree.sources[0].startsWith("https://www.assemblee-nationale.fr/dyn/17/scrutins/"));
  // jamais d'amendement ordinaire ; mot prudent : écarté ; résultat incohérent : écarté
  const seul = { lastUpdated: "2026-10-13T02:00:00Z", lois: [{ ...l.lois[2], titre: "l'article 3 de la proposition de loi visant l'ancien maire mis en examen (première lecture)." }] };
  assert.ok(C.choisirVoteDuJour({ lois: seul, jour: "2026-10-13", now: new Date("2026-10-13T08:30:00Z") }).refus, "mot prudent");
  const incoh = { lastUpdated: "2026-10-13T02:00:00Z", lois: [{ ...l.lois[2], resultat: "rejete", votes: { A: [300, 10, 5, 0] } }] };
  assert.ok(C.choisirVoteDuJour({ lois: incoh, jour: "2026-10-13", now: new Date("2026-10-13T08:30:00Z") }).refus, "résultat incohérent avec les voix");
  // lundi : le dernier jour de vote (vendredi) est repris ; au-delà de 3 jours : non
  const lundi = C.choisirVoteDuJour({ lois: { lastUpdated: "2026-10-12T02:00:00Z", lois: [{ ...l.lois[2], dateISO: "2026-10-09" }] }, jour: "2026-10-12", now: new Date("2026-10-12T08:30:00Z") });
  assert.ok(lundi.contenu, "lundi : le vote de vendredi");
  assert.ok(C.choisirVoteDuJour({ lois: { lastUpdated: "2026-10-12T02:00:00Z", lois: [{ ...l.lois[2], dateISO: "2026-10-05" }] }, jour: "2026-10-12", now: new Date("2026-10-12T08:30:00Z") }).refus, "trop ancien");
  // « aujourd'hui » n'est pas « la veille »
  assert.ok(C.choisirVoteDuJour({ lois: { lastUpdated: "2026-10-12T02:00:00Z", lois: [{ ...l.lois[2], dateISO: "2026-10-12" }] }, jour: "2026-10-12", now: new Date("2026-10-12T08:30:00Z") }).refus);
}

// ---------- 3. Comprendre : rotation sans répétition avant épuisement ----------
{
  const notions = C.notionsComprendre(html);
  assert.strictEqual(notions.length, 10, "les 10 notions du site (index.html)");
  for (const n of notions) { assert.ok(n.titre && n.texte.length > 150 && n.sourceTxt.startsWith("Source : "), n.titre); assert.ok(!/<|&[a-z]+;/.test(n.texte), "texte nettoyé"); }
  assert.ok(notions.some((n) => /49\.3/.test(n.titre)) && notions.some((n) => /commission mixte paritaire/i.test(n.titre)) && notions.some((n) => /vote solennel/i.test(n.titre)) && notions.some((n) => /navette/i.test(n.titre)));
  let etat = C.etatVide();
  const vues = [];
  // 12 samedis d'affilée : 10 notions distinctes, puis le cycle repart de zéro
  for (let i = 0; i < 12; i++) {
    const samedi = new Date(Date.parse("2026-10-10T07:00:00Z") + i * 7 * 864e5).toISOString();
    const r = C.planifier({ now: new Date(samedi), donnees: donnees(), file: vide, registre: vide, etat, creneaux: CRENEAUX, config: {} });
    const p = r.plan.find((x) => x.nom === "comprendre");
    assert.ok(p, `semaine ${i} : une notion`);
    vues.push(p.notion);
    etat = C.normaliserEtat(JSON.parse(JSON.stringify(etat)));
    etat.faits[p.faitCle] = { id: p.id, le: samedi }; etat.faits[p.periodeCle] = { id: p.id, le: samedi };
    etat.comprendre.push({ cle: p.notion, id: p.id, date: samedi.slice(0, 10) });
    if (new Set(etat.comprendre.map((x) => x.cle)).size >= 10) etat.comprendre = []; // comme main()
  }
  assert.strictEqual(new Set(vues.slice(0, 10)).size, 10, "aucune répétition avant épuisement");
  assert.strictEqual(vues[10], vues[0], "puis le cycle recommence");
  assert.strictEqual(vues[11], vues[1]);
  // une fiche par semaine : deux passages le même samedi n'en créent qu'une
  const e1 = C.etatVide();
  const p1 = contenu("comprendre", "2026-10-10T07:00:00Z");
  e1.faits[p1.faitCle] = { id: p1.id, le: "2026-10-10T07:00:00Z" }; e1.faits[p1.periodeCle] = { id: p1.id, le: "2026-10-10T07:00:00Z" };
  assert.ok(!contenu("comprendre", "2026-10-10T08:00:00Z", { etat: e1 }), "déjà produit cette semaine");
  assert.ok(!contenu("comprendre", "2026-10-09T07:00:00Z"), "seulement le samedi (jours : [6])");
  // une fiche jamais publiée (périmée) redevient disponible
  const e2 = { faits: {}, comprendre: [{ cle: vues[0], id: "aaaaaaaaaaaa", date: "2026-10-03" }], chiffres: {} };
  assert.strictEqual(C.reconcilierEtat(e2, { entrees: [{ id: "aaaaaaaaaaaa", statut: "perimee" }] }, new Date("2026-10-10T07:00:00Z")).comprendre.length, 0);
  assert.strictEqual(C.reconcilierEtat(e2, { entrees: [{ id: "aaaaaaaaaaaa", statut: "publiee" }] }, new Date("2026-10-10T07:00:00Z")).comprendre.length, 1);
}

// ---------- 4. Le chiffre du jour ----------
{
  const p = contenu("chiffre-jour", fx.instants["chiffre-jour"]);
  assert.ok(p);
  assert.strictEqual(p.pasAvant, "2026-10-13T17:00:00.000Z", "19 h Paris");
  assert.ok(/Insee|Eurostat/.test(p.rendu.spec.sourceTxt) && p.rendu.spec.periode, "source et date");
  assert.ok(p.entree.sources[0].startsWith("https://"));
  assert.deepStrictEqual(C.separerValeur("119,0 % du PIB"), { hero: "119,0 %", suite: "du PIB" });
  assert.deepStrictEqual(C.separerValeur("+3,0 %"), { hero: "+3,0 %", suite: "" });
  assert.deepStrictEqual(C.separerValeur("69,08 M"), { hero: "69,08 M", suite: "" });
  // pas plus d'une fois par semaine par indicateur : 30 jours d'affilée
  let etat = C.etatVide();
  const dernier = {};
  const vus = [];
  for (let j = 0; j < 30; j++) {
    const jour = new Date(Date.parse("2026-10-13T16:30:00Z") + j * 864e5).toISOString();
    const dj = donnees(); dj.indicateurs.lastUpdated = jour; // données tenues à jour
    const r = C.planifier({ now: new Date(jour), donnees: dj, file: vide, registre: vide, etat, creneaux: CRENEAUX, config: {} });
    const c = r.plan.find((x) => x.nom === "chiffre-jour");
    if (!c) { assert.ok(r.refus["chiffre-jour"], "refus motivé"); continue; }
    const j0 = jour.slice(0, 10);
    if (dernier[c.chiffre]) assert.ok((Date.parse(j0) - Date.parse(dernier[c.chiffre])) / 864e5 >= 7, `${c.chiffre} repris trop tôt (${dernier[c.chiffre]} puis ${j0})`);
    dernier[c.chiffre] = j0; vus.push(c.chiffre);
    etat = C.normaliserEtat(JSON.parse(JSON.stringify(etat)));
    etat.faits[c.faitCle] = { id: c.id, le: jour }; etat.faits[c.periodeCle] = { id: c.id, le: jour };
    etat.chiffres[c.chiffre] = { id: c.id, date: j0 };
  }
  assert.ok(vus.length >= 25, `un chiffre presque chaque jour (${vus.length})`);
  assert.ok(new Set(vus).size >= 5, "de la variété");
  // un seul chiffre par jour même si l'indicateur change entre deux passages
  const e = C.etatVide(); e.faits[p.periodeCle] = { id: "bbbbbbbbbbbb", le: "2026-10-13T15:00:00Z" };
  assert.ok(!contenu("chiffre-jour", "2026-10-13T16:00:00Z", { etat: e }));
  // tous montrés il y a moins de 7 jours : rien
  const tous = C.etatVide();
  for (const c of C.candidatsChiffres({ ...donnees(), now: new Date("2026-10-13T15:30:00Z") })) tous.chiffres[c.cle] = { id: "cccccccccccc", date: "2026-10-10" };
  assert.ok(plan("2026-10-13T15:30:00Z", { etat: tous }).refus["chiffre-jour"].includes("7 jours"));
  // sondage : proposé hors réserve (terrain récent), jamais pendant la réserve, toujours signalé « reserve »
  const dSond = donnees(); dSond.sondages.instituts[0].dateFin = "2026-10-10";
  const cands = C.candidatsChiffres({ ...dSond, now: new Date("2026-10-13T15:30:00Z") });
  const so = cands.find((c) => c.sondage);
  assert.ok(so, "dernier sondage hors réserve");
  assert.ok(so.spec.sourceTxt.includes("Commission des sondages") && /marge d'erreur/.test(so.spec.lignes.join(" ")) && so.spec.periode.includes("Enquête menée"), "mentions obligatoires");
  const etatSo = C.etatVide(); for (const c of cands.filter((x) => !x.sondage)) etatSo.chiffres[c.cle] = { id: "dddddddddddd", date: "2026-10-12" };
  const rs = C.planifier({ now: new Date("2026-10-13T15:30:00Z"), donnees: dSond, file: vide, registre: vide, etat: etatSo, creneaux: CRENEAUX, config: {} });
  const cs = rs.plan.find((x) => x.nom === "chiffre-jour");
  assert.ok(cs && cs.entree.reserve === true && cs.entree.nommePersonne === true, "entrée sondage : reserve true, nommePersonne true");
  // réserve électorale : samedi 17 avril 2027 (veille du 1er tour) à 17 h Paris
  const enReserve = new Date("2027-04-17T15:30:00Z");
  assert.ok(require("../scripts/stories-auto.cjs").reserveSondages(enReserve));
  const dRes = donnees(); dRes.sondages.instituts[0].dateFin = "2027-04-12"; dRes.indicateurs.lastUpdated = "2027-04-10T00:00:00Z";
  assert.ok(!C.candidatsChiffres({ ...dRes, now: enReserve }).some((c) => c.sondage), "aucun sondage pendant la réserve");
  const resPlan = C.planifier({ now: enReserve, donnees: dRes, file: vide, registre: vide, etat: etatSo, creneaux: CRENEAUX, config: {} });
  assert.ok(!resPlan.plan.some((x) => x.entree.reserve), "aucune entrée de sondage planifiée pendant la réserve");
}

// ---------- 5. Carrousels ----------
{
  const p = contenu("carrousel-loi", fx.instants["carrousel-loi"]);
  assert.ok(p, "une loi adoptée est expliquée");
  assert.strictEqual(p.rendu.kind, "carrousel");
  assert.strictEqual(p.rendu.specs.length, 5, "5 images : contexte, texte, vote, suite, sources");
  assert.deepStrictEqual(p.rendu.specs.map((s) => s.kicker), ["Une loi expliquée", "Ce que dit le texte", "Le résultat du vote", "Ce qui suit", "Sources"]);
  assert.strictEqual(p.rendu.alts.length, 5, "un texte alternatif par image");
  assert.ok(p.rendu.specs.every((s, i) => s.n === i + 1 && s.total === 5));
  // la légende : titre, lignes factuelles, source officielle, @compte, 3 à 5 hashtags, sans lien du site
  const fiche = { type: "carousel", url_images: [1, 2, 3, 4, 5].map((i) => `https://x.test/a${i}.jpg`), legende: p.entree.legende, alts: p.rendu.alts };
  const v = validerCarrousel(fiche);
  assert.ok(v.ok, v.erreurs.join(" ; "));
  assert.ok(p.entree.legende.includes("@hemicyclefrance") && p.entree.legende.includes("assemblee-nationale.fr") && !/github\.io/.test(p.entree.legende));
  assert.ok(/^5 images pour comprendre/.test(p.entree.legende), "accroche factuelle en 1re ligne");
  assert.ok(/enregistrer/.test(p.entree.legende) && !/#Politique #Assemblée\S+ #Loi #Parlement$/.test(p.entree.legende) && (p.entree.legende.match(/#\S+/g) || []).length <= 5);
  // un seul carrousel par vote, un seul par jour
  const e = C.etatVide(); e.faits[p.faitCle] = { id: p.id, le: "2026-10-13T14:00:00Z" };
  const autre = contenu("carrousel-loi", fx.instants["carrousel-loi"], { etat: e });
  assert.ok(!autre || autre.faitCle !== p.faitCle, "jamais deux fois le même vote");
  e.faits[p.periodeCle] = { id: p.id, le: "2026-10-13T14:00:00Z" };
  assert.ok(!contenu("carrousel-loi", fx.instants["carrousel-loi"], { etat: e }), "une loi expliquée par jour");
  // plafond de 2 posts par jour, carrousels compris
  const posts = { entrees: [{ id: "111111111111", type: "post", cree: "2026-10-13T07:00:00Z" }, { id: "222222222222", type: "carousel", cree: "2026-10-13T09:00:00Z" }] };
  assert.ok(plan(fx.instants["carrousel-loi"], { file: posts }).refus["carrousel-loi"].includes("2 posts"));
  // un texte rejeté : « ce qui suit » prudent
  assert.ok(/n'avance généralement pas/.test(C.etapeSuivante({ chambre: "an", resultat: "rejete", etape: "première lecture" }).join(" ")));
  assert.ok(/envoyé au Sénat/.test(C.etapeSuivante({ chambre: "an", resultat: "adopte", etape: "première lecture" }).join(" ")));
  assert.ok(/envoyé à l'Assemblée nationale/.test(C.etapeSuivante({ chambre: "senat", resultat: "adopte", etape: "première lecture" }).join(" ")));
  // vote final à mot prudent : jamais expliqué
  const d = donnees(); d.lois.lois.forEach((l) => { l.titre = l.titre.replace("relative à l'organisation", "relative à l'ancien ministre mis en examen et à l'organisation"); });
  assert.ok(!C.planifier({ now: new Date(fx.instants["carrousel-loi"]), donnees: d, file: vide, registre: vide, etat: C.etatVide(), creneaux: CRENEAUX, config: {} }).plan.some((x) => /mis en examen/.test(x.entree.titre)));

  // hebdomadaire : le dimanche seulement, d'après le résumé de la semaine
  const h = contenu("carrousel-hebdo", fx.instants["carrousel-hebdo"]);
  assert.ok(h, "résumé hebdomadaire du dimanche");
  assert.strictEqual(h.pasAvant, "2026-10-11T16:30:00.000Z", "dimanche 18 h 30 Paris");
  assert.ok(h.rendu.specs.length >= 4 && h.rendu.specs.length <= 10);
  assert.strictEqual(h.rendu.specs[0].couverture, true);
  assert.strictEqual(h.rendu.specs.at(-1).kicker, "Sources");
  assert.ok(validerCarrousel({ type: "carousel", url_images: h.rendu.specs.map((_, i) => `https://x.test/h${i}.jpg`), legende: h.entree.legende, alts: h.rendu.alts }).ok);
  assert.ok(/^\d+ images pour comprendre/.test(h.entree.legende) && /#SemaineParlementaire/.test(h.entree.legende), "accroche et hashtags du genre");
  assert.ok(!contenu("carrousel-hebdo", "2026-10-10T16:20:00Z"), "pas le samedi");
  assert.ok(!contenu("carrousel-hebdo", "2026-10-11T15:00:00Z"), "pas avant que le résumé (18 h 05) soit écrit");
  const autreSemaine = donnees(); autreSemaine.digest.id = "2026-W40";
  assert.ok(C.planifier({ now: new Date(fx.instants["carrousel-hebdo"]), donnees: autreSemaine, file: vide, registre: vide, etat: C.etatVide(), creneaux: CRENEAUX, config: {} }).refus["carrousel-hebdo"].includes("pas celui de la semaine"));
  // sondage dans le résumé : signalé « reserve », absent pendant la réserve électorale
  assert.strictEqual(h.entree.reserve, true);
  assert.ok(h.rendu.specs.some((s) => /sondage/i.test(s.kicker)));
  const dimancheReserve = "2027-04-18T14:20:00Z"; // dimanche du 1er tour, 16 h 20 Paris : réserve jusqu'à 20 h
  const dr = donnees(); dr.digest.id = C.semaineISO("2027-04-18").id;
  const hr = C.planifier({ now: new Date(dimancheReserve), donnees: dr, file: vide, registre: vide, etat: C.etatVide(), creneaux: C.normaliserCreneaux({ "carrousel-hebdo": { heure: "16:30" } }), config: {} }).plan.find((x) => x.nom === "carrousel-hebdo");
  assert.ok(hr, "le résumé sort quand même");
  assert.ok(!hr.rendu.specs.some((s) => /sondage/i.test(s.kicker)) && !hr.entree.reserve && !/sondage/i.test(hr.entree.legende), "mais sans sondage pendant la réserve");
}

// ---------- Réglages ----------
assert.deepStrictEqual(plan(fx.instants.aujourdhui, { config: { contenusAuto: false } }).plan, [], "contenusAuto: false : rien");
assert.ok(!plan(fx.instants.aujourdhui, { creneaux: C.normaliserCreneaux({ aujourdhui: false }) }).plan.some((x) => x.nom === "aujourdhui"), "créneau coupé");
{
  // des heures réglées sont respectées (pasAvant = heure de Paris du créneau)
  const p = contenu("aujourdhui", "2026-10-20T05:30:00Z", { creneaux: C.normaliserCreneaux({ aujourdhui: { heure: "09:15" } }) });
  assert.strictEqual(p.pasAvant, "2026-10-20T07:15:00.000Z");
}

// ---------- Écriture : file, images, brouillons, registre des faits (sans navigateur : dessin simulé) ----------
function jpegFactice(l, h) {
  const b = Buffer.alloc(3000, 7);
  b[0] = 0xff; b[1] = 0xd8; b[2] = 0xff; b[3] = 0xc0; b.writeUInt16BE(17, 4); b[6] = 8; b.writeUInt16BE(h, 7); b.writeUInt16BE(l, 9);
  return b;
}
const dessinFactice = (jobs) => Promise.resolve(jobs.map((j) => jpegFactice(1080, j.type === "diapo" ? 1350 : 1920)));
function racineEssai({ config = {}, file = { entrees: [] }, registre = { entrees: [] } } = {}) {
  const r = mkdtempSync(join(tmpdir(), "contenus-"));
  mkdirSync(join(r, "data", "digest"), { recursive: true });
  for (const [k, v] of Object.entries(fx.donnees)) if (k !== "digest") writeFileSync(join(r, "data", { agenda: "agenda-an", lois: "lois", senat: "senat", navette: "navette", indicateurs: "indicateurs", budget: "budget", sondages: "sondages" }[k] + ".json"), JSON.stringify(v));
  writeFileSync(join(r, "data", "digest", `${fx.donnees.digest.id}.json`), JSON.stringify(fx.donnees.digest));
  writeFileSync(join(r, "index.html"), html);
  writeFileSync(join(r, "data", "stories-config.json"), JSON.stringify({ contenusAuto: true, ...config }));
  writeFileSync(join(r, "data", "instagram-file.json"), JSON.stringify(file));
  writeFileSync(join(r, "data", "instagram-publiees.json"), JSON.stringify(registre));
  mkdirSync(join(r, "instagram", "auto"), { recursive: true });
  return r;
}
{
  const racine = racineEssai();
  const ch = C.chemins(racine);
  const now = new Date(fx.instants["carrousel-loi"]); // 16 h Paris, mardi 13 octobre : vote-jour (12 h 30) et carrousel-loi (17 h 30)
  const crees = await C.main({ ch, now, dessiner: dessinFactice });
  const noms = crees.map((c) => c.contenu).sort();
  assert.deepStrictEqual(noms, ["carrousel-loi", "vote-jour"]);
  const file = JSON.parse(readFileSync(ch.file, "utf-8"));
  assert.strictEqual(file.entrees.length, 2);
  const car = file.entrees.find((e) => e.type === "carousel");
  assert.strictEqual(car.url_images.length, 5);
  assert.strictEqual(car.url_images[0], `https://tahns.github.io/hemicycle-france/instagram/auto/${car.id}.jpg`);
  assert.strictEqual(car.url_images[1], `https://tahns.github.io/hemicycle-france/instagram/auto/${car.id}-2.jpg`);
  for (let i = 0; i < 5; i++) assert.ok(existsSync(join(ch.img, i === 0 ? `${car.id}.jpg` : `${car.id}-${i + 1}.jpg`)), `image ${i + 1} écrite`);
  assert.ok(car.pasAvant && car.expire && car.contenu === "carrousel-loi" && car.donneesPropres === true);
  assert.strictEqual(car.alts.length, 5);
  assert.ok(validerCarrousel(car).ok, validerCarrousel(car).erreurs.join(";"));
  const story = file.entrees.find((e) => e.type === "story");
  assert.strictEqual(story.contenu, "vote-jour");
  assert.ok(existsSync(join(ch.img, `${story.id}.jpg`)));
  assert.ok(readFileSync(ch.atom, "utf-8").includes('<category term="carousel"/>'));
  // état : faits, aucun doublon au passage suivant (même minute, puis 30 min plus tard)
  const etat = JSON.parse(readFileSync(ch.etat, "utf-8"));
  assert.ok(Object.keys(etat.faits).length >= 4);
  assert.deepStrictEqual(await C.main({ ch, now, dessiner: dessinFactice }), [], "rien de nouveau au passage suivant");
  assert.deepStrictEqual(await C.main({ ch, now: new Date(Date.parse(fx.instants["carrousel-loi"]) + 30 * 60000), dessiner: dessinFactice }), []);
  assert.strictEqual(JSON.parse(readFileSync(ch.file, "utf-8")).entrees.length, 2, "aucun doublon dans la file");
  // même si l'état est perdu, la file et le registre empêchent le doublon (ids stables)
  writeFileSync(ch.etat, "{}");
  assert.deepStrictEqual(await C.main({ ch, now, dessiner: dessinFactice }), [], "id stable : pas de doublon sans l'état");
  // images d'enfants orphelines supprimées (entrée sortie de la file) ; celles d'une entrée présente restent
  writeFileSync(join(ch.img, "abcdef012345-2.jpg"), jpegFactice(1080, 1350));
  C.nettoyerEnfants(file.entrees, ch, now);
  assert.ok(!existsSync(join(ch.img, "abcdef012345-2.jpg")), "orpheline supprimée");
  assert.ok(existsSync(join(ch.img, `${car.id}-2.jpg`)), "enfant d'une entrée de la file conservé");
}
{
  // image de mauvaises dimensions : rien n'entre dans la file (aucune entrée sans image valide)
  const racine = racineEssai();
  const ch = C.chemins(racine);
  const crees = await C.main({ ch, now: new Date(fx.instants.aujourdhui), dessiner: (jobs) => Promise.resolve(jobs.map(() => jpegFactice(1080, 1350))) });
  assert.deepStrictEqual(crees, []);
  assert.ok(!existsSync(ch.file) || JSON.parse(readFileSync(ch.file, "utf-8")).entrees.length === 0);
  // dessin en échec : idem
  assert.deepStrictEqual(await C.main({ ch, now: new Date(fx.instants.aujourdhui), dessiner: () => Promise.reject(new Error("pas de navigateur")) }), []);
}
{
  // validation humaine : brouillons, pas de file
  const racine = racineEssai({ config: { validationHumaine: true } });
  const ch = C.chemins(racine);
  const crees = await C.main({ ch, now: new Date(fx.instants["carrousel-loi"]), dessiner: dessinFactice });
  assert.ok(crees.length >= 1 && crees.every((c) => c.vers === "brouillon"));
  assert.strictEqual(JSON.parse(readFileSync(ch.file, "utf-8")).entrees.length, 0, "rien dans la file de publication");
  assert.ok(readdirSync(ch.brouillons).some((f) => f.endsWith(".json")));
}
{
  // un contenu qui nomme une personne (sondage) en monétisation : brouillon ; un contenu sans personne : file
  const racine = racineEssai({ config: { monetisation: true } });
  const ch = C.chemins(racine);
  const crees = await C.main({ ch, now: new Date(fx.instants["carrousel-hebdo"]), dessiner: dessinFactice });
  const heb = crees.find((c) => c.contenu === "carrousel-hebdo");
  assert.strictEqual(heb.vers, "brouillon", "le résumé contient un sondage nommant des candidats : à valider");
}
{
  // le dimanche : état entier d'une journée (3 contenus possibles), aucun doublon
  const racine = racineEssai();
  const ch = C.chemins(racine);
  const crees = await C.main({ ch, now: new Date("2026-10-11T16:20:00Z"), dessiner: dessinFactice });
  assert.deepStrictEqual(crees.map((c) => c.contenu).sort(), ["carrousel-hebdo", "carrousel-loi", "chiffre-jour"].filter((n) => crees.some((c) => c.contenu === n)).sort());
}

// ---------- 5 bis. « styleFixe » : le style imposé remplace l'attribution du test comparatif ----------
{
  const ch = C.chemins(racineEssai({ config: { styleFixe: "question" } }));
  await C.main({ ch, now: new Date(fx.instants["carrousel-loi"]), dessiner: dessinFactice });
  const story = JSON.parse(readFileSync(ch.file, "utf-8")).entrees.find((e) => e.type === "story");
  assert.strictEqual(story.variante, "question", "styleFixe : toutes les nouvelles stories reçoivent ce style");
  const ch2 = C.chemins(racineEssai({ config: { styleFixe: "style-inconnu" } }));
  await C.main({ ch: ch2, now: new Date(fx.instants["carrousel-loi"]), dessiner: dessinFactice });
  const story2 = JSON.parse(readFileSync(ch2.file, "utf-8")).entrees.find((e) => e.type === "story");
  assert.strictEqual(story2.variante, require("../scripts/stories-auto.cjs").varianteDe(story2.id), "valeur invalide ignorée : test comparatif");
}

// ---------- 6. Jamais deux fois le même sujet (non-régression) ----------
{
  const crypto = require("crypto");
  const h = (x) => crypto.createHash("sha1").update(x).digest("hex").slice(0, 12);
  const SA = require("../scripts/stories-auto.cjs");
  const inst = fx.instants["carrousel-loi"];
  const base = contenu("carrousel-loi", inst);
  assert.ok(base, "témoin : sans post de loi, le carrousel est produit");
  const num = base.entree.voteId.replace("an-", "");
  const postId = h("post-loi|an|" + num), annId = SA.idAnnonce(postId);
  assert.strictEqual(C.idPostLoi(base.entree.voteId), postId);
  const refuse = (extra, msg) => { const r = plan(inst, extra); assert.ok(!r.plan.some((x) => x.nom === "carrousel-loi" && x.entree.voteId === base.entree.voteId), msg); return r; };
  // post de loi déjà en file / publié / annonce / voteId / titre proche : carrousel refusé
  refuse({ file: { entrees: [{ id: postId, type: "post", cree: "2026-10-13T07:00:00Z" }] } }, "post-loi en file");
  refuse({ registre: { entrees: [{ id: postId, statut: "publiee", publieLe: "2026-10-12T09:00:00Z", type: "post", titre: "x" }] } }, "post-loi au registre");
  refuse({ registre: { entrees: [{ id: annId, statut: "publiee", publieLe: "2026-10-12T09:00:00Z", type: "story", titre: "x", annonceDe: postId }] } }, "annonce au registre");
  refuse({ file: { entrees: [{ id: "aaaaaaaaaaaa", type: "story", annonceDe: postId, cree: "2026-10-13T07:00:00Z" }] } }, "annonce (annonceDe) en file");
  refuse({ file: { entrees: [{ id: "bbbbbbbbbbbb", type: "story", voteId: base.entree.voteId, cree: "2026-10-13T07:00:00Z" }] } }, "même voteId en file");
  refuse({ brouillons: [{ id: "cccccccccccc", voteId: base.entree.voteId }] }, "même voteId en brouillon");
  refuse({ registre: { entrees: [{ id: "dddddddddddd", statut: "publiee", publieLe: "2026-10-12T09:00:00Z", type: "post", titre: base.entree.titrePropre }] } }, "titre officiel proche au registre");
  refuse({ file: { entrees: [{ id: "eeeeeeeeeeee", type: "story", titrePropre: base.entree.titrePropre, cree: "2026-10-12T20:00:00Z" }] } }, "titre proche en file");
  const m = clone({ faits: { "post-loi|x": { id: postId, le: "2026-10-12T09:00:00Z" } } });
  refuse({ etat: { ...C.etatVide(), ...m } }, "post-loi dans la mémoire des faits");
  assert.ok(C.choisirCarrouselLoi({ ...donnees(), etat: C.etatVide(), jour: "2026-10-13", now: new Date(inst), file: { entrees: [{ id: postId }] } }).refus.includes("loi déjà traitée"));
  // un post périmé (jamais publié) ne bloque pas
  assert.ok(plan(inst, { registre: { entrees: [{ id: postId, statut: "perimee", publieLe: null, type: "post" }] } }).plan.some((x) => x.nom === "carrousel-loi"), "post périmé : pas de blocage");
  // un autre sujet ne bloque pas
  assert.ok(plan(inst, { file: { entrees: [{ id: "ffffffffffff", type: "story", titrePropre: "Blocus des lycées", cree: "2026-10-13T07:00:00Z" }] } }).plan.some((x) => x.nom === "carrousel-loi"));

  // E2 : le vote du jour ne reprend pas un texte déjà présenté par « Aujourd'hui à l'Assemblée » (et inversement) dans les 24 h
  const vj = contenu("vote-jour", fx.instants["vote-jour"]);
  assert.ok(vj, "témoin : vote du jour produit");
  const maintenant = fx.instants["vote-jour"];
  const enFile = (e) => ({ entrees: [{ id: "111111111111", type: "story", cree: "2026-10-13T06:35:00Z", ...e }] });
  const r2 = plan(maintenant, { file: enFile({ contenu: "aujourdhui", periode: "2026-10-13", titrePropre: "Aujourd'hui à l'Assemblée", sujets: [vj.entree.sujets[1] || vj.entree.titrePropre] }) });
  assert.ok(!r2.plan.some((x) => x.nom === "vote-jour") && /24 h/.test(r2.refus["vote-jour"]), "même texte en file : vote du jour refusé");
  const r3 = plan(maintenant, { registre: { entrees: [{ id: "222222222222", statut: "publiee", publieLe: "2026-10-13T06:40:00Z", type: "story", titre: "Aujourd'hui à l'Assemblée : 13 octobre 2026", sujets: [vj.entree.titrePropre] }] } });
  assert.ok(!r3.plan.some((x) => x.nom === "vote-jour"), "même texte au registre : refusé");
  const r3b = plan(maintenant, { etat: { ...C.etatVide(), faits: { "aujourdhui|2026-10-13": { id: "x", le: "2026-10-13T06:35:00Z", sujets: [vj.entree.titrePropre] } } } });
  assert.ok(!r3b.plan.some((x) => x.nom === "vote-jour"), "même texte dans la mémoire des faits : refusé");
  assert.ok(plan(maintenant, { file: enFile({ contenu: "aujourdhui", cree: "2026-10-11T06:35:00Z", sujets: [vj.entree.titrePropre] }) }).plan.some((x) => x.nom === "vote-jour"), "plus de 24 h : autorisé");
  assert.ok(plan(maintenant, { file: enFile({ contenu: "aujourdhui", sujets: ["Régime des retraites des agriculteurs"] }) }).plan.some((x) => x.nom === "vote-jour"), "texte différent : autorisé");
  // dans la même passe : « Aujourd'hui » planifié, puis « Vote du jour » sur le même texte
  const dj = donnees(); const ag = dj.agenda.jours.find((j) => j.points.length); ag.date = "2026-10-13"; ag.points = [{ type: "texte", objet: vj.entree.titrePropre }]; dj.agenda.lastUpdated = "2026-10-13T00:00:00Z";
  const rr = C.planifier({ now: new Date("2026-10-13T08:35:00Z"), donnees: dj, file: vide, registre: vide, etat: C.etatVide(), creneaux: C.normaliserCreneaux({ aujourdhui: { heure: "10:30" }, "vote-jour": { heure: "10:30" } }), config: {} });
  assert.ok(rr.plan.some((x) => x.nom === "aujourdhui") && !rr.plan.some((x) => x.nom === "vote-jour") && /24 h/.test(rr.refus["vote-jour"] || ""), "Aujourd'hui planifié : le vote du jour sur le même texte est refusé dans la même passe");

  // E3 : un créneau ne sort jamais deux fois pour la même période / le même id
  const premier = plan("2026-10-10T07:00:00Z").plan.find((x) => x.nom === "comprendre");
  assert.ok(premier);
  for (const nom of ["vote-jour", "carrousel-loi"]) {
    const p1 = contenu(nom, fx.instants[nom]);
    assert.ok(p1);
    const entree = { id: p1.id, type: nom === "vote-jour" ? "story" : "carousel", contenu: nom, periode: p1.cle, cree: fx.instants[nom] };
    assert.ok(!plan(fx.instants[nom], { file: { entrees: [entree] } }).plan.some((x) => x.nom === nom), `${nom} : id déjà en file`);
    assert.ok(!plan(fx.instants[nom], { registre: { entrees: [{ id: p1.id, statut: "publiee", publieLe: fx.instants[nom], type: "story", titre: "t" }] } }).plan.some((x) => x.nom === nom), `${nom} : id déjà au registre`);
    assert.ok(!plan(fx.instants[nom], { brouillons: [entree] }).plan.some((x) => x.nom === nom), `${nom} : id déjà en brouillon`);
    // mémoire des faits perdue, autre id mais même type le même jour : refusé quand même
    assert.ok(!plan(fx.instants[nom], { file: { entrees: [{ ...entree, id: "999999999999", periode: "autre" }] } }).plan.some((x) => x.nom === nom), `${nom} : même type le même jour déjà en file`);
  }
}

// ---------- Lisibilité (FALC) : aucun sigle non expliqué, phrases de 20 mots au plus, aucun jargon, sur les exemples de chaque contenu ----------
{
  const { siglesNonExpliques, motsParPhrase } = require("../scripts/titres-propres.cjs");
  const JARGON = /scrutin public|\bamendement|motion de censure|première lecture|commission mixte paritaire|séance publique|dossier législatif|\bprojet de loi\b|\bproposition de loi\b|\b(?:PLFSS|PLF|LFI|CMP)\b/i;
  // tous les textes que le lecteur voit : spécifications d'image, légendes, textes alternatifs, accroches
  const textes = (o, sortie = []) => { if (typeof o === "string") sortie.push(o); else if (Array.isArray(o)) o.forEach((x) => textes(x, sortie)); else if (o && typeof o === "object") Object.entries(o).forEach(([k, x]) => { if (k !== "brut") textes(x, sortie); }); return sortie; }; // `brut` = intitulé officiel gardé pour les registres, jamais affiché
  const jours = { aujourdhui: fx.instants.aujourdhui, "vote-jour": fx.instants["vote-jour"], "chiffre-jour": fx.instants["chiffre-jour"], "carrousel-loi": fx.instants["carrousel-loi"], "carrousel-hebdo": fx.instants["carrousel-hebdo"] };
  let vus = 0;
  for (const [nom, instant] of Object.entries(jours)) {
    const p = contenu(nom, instant);
    if (!p) continue;
    // le texte officiel cité entre guillemets (« … ») et l'adresse des sources restent tels quels : on les retire avant de mesurer
    const propres = (t) => t.replace(/«[^»]*»/g, " ").replace(/https?:\/\/\S+|\b[\w.-]+\.(?:fr|com)\S*/g, " ").replace(/#\S+/g, " ");
    const lus = [...textes(p.rendu), p.entree.legende, p.entree.alt, p.entree.accroche].filter(Boolean).map(propres);
    for (const t of lus) {
      vus++;
      assert.deepStrictEqual(siglesNonExpliques(t), [], `${nom} : sigle non expliqué dans « ${t.slice(0, 120)} »`);
      for (const { phrase, mots } of motsParPhrase(t)) assert.ok(mots <= 20, `${nom} : phrase de ${mots} mots : « ${phrase} »`);
      assert.ok(!JARGON.test(t), `${nom} : jargon dans « ${t.slice(0, 160)} »`);
    }
  }
  assert.ok(vus > 20, "le test a bien lu des textes");
}

console.log("[tests contenus-auto] OK");
