// Tests du « vote par groupe » : post du vote du jour (créneau « vote-jour-post ») et story du vote final d'une loi (créneau « vote-loi »),
// scripts/contenus-auto.cjs, sur des données d'essai (tests/fixtures/contenus.json) : aucun réseau, aucun navigateur.
// USAGE : node tests/vote-groupes.test.mjs
import assert from "assert";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const C = require("../scripts/contenus-auto.cjs");
const SA = require("../scripts/stories-auto.cjs");
const PS = require("../scripts/publier-stories.cjs");

const fx = JSON.parse(readFileSync("tests/fixtures/contenus.json", "utf-8"));
const clone = (o) => JSON.parse(JSON.stringify(o));
const donnees = () => ({ ...clone(fx.donnees), notions: [] });
const CRENEAUX = C.normaliserCreneaux(null);
const vide = { entrees: [] };
const plan = (now, extra = {}) => C.planifier({ now: new Date(now), donnees: donnees(), file: vide, registre: vide, brouillons: [], etat: C.etatVide(), creneaux: CRENEAUX, config: { contenusAuto: true }, ...extra });
const contenu = (nom, now, extra = {}) => plan(now, extra).plan.find((p) => p.nom === nom);
const MARDI_MIDI = "2026-10-13T11:40:00Z"; // 13 h 40 Paris : story « vote du jour » (12 h 30) et post (13 h 30) préparés
const VOTE_GROUPES = { RN: [62, 0, 0, 122], EPR: [68, 0, 0, 91], LFI: [0, 49, 0, 71], SOC: [26, 0, 2, 68], LR: [26, 0, 0, 48], ECO: [0, 26, 0, 38], DEM: [29, 0, 0, 37], HOR: [29, 0, 0, 35], LIOT: [19, 0, 0, 23], GDR: [0, 11, 0, 17], UDR: [14, 0, 0, 17], NI: [3, 0, 0, 10] };

// ---------- Créneaux : défauts et garde-fous ----------
{
  assert.strictEqual(CRENEAUX["vote-jour-post"].minutes, 13 * 60 + 30, "post à 13 h 30 : 60 min après la story de 12 h 30");
  assert.strictEqual(CRENEAUX["vote-loi"].minutes, 20 * 60);
  assert.strictEqual(C.TYPES["vote-jour-post"].story, false, "le post compte dans les 2 posts par jour");
  assert.strictEqual(C.TYPES["vote-loi"].story, true);
  const livre = JSON.parse(readFileSync("data/stories-config.json", "utf-8"));
  assert.strictEqual(livre.creneaux["vote-jour-post"].heure, "13:30");
  assert.strictEqual(livre.creneaux["vote-loi"].heure, "20:00");
}

// ---------- A. POST « vote du jour par groupe » ----------
{
  const p = plan(MARDI_MIDI);
  const post = p.plan.find((x) => x.nom === "vote-jour-post"), story = p.plan.find((x) => x.nom === "vote-jour");
  assert.ok(post && story, "story ET post du même jour : les deux sont préparés (aucun doublon l'un de l'autre)");
  assert.notStrictEqual(post.id, story.id);
  assert.strictEqual(post.cle, story.cle, "le MÊME scrutin");
  assert.strictEqual(post.rendu.kind, "post");
  assert.strictEqual(post.rendu.type, "vote-groupes", "modèle « vote-groupes » du site");
  assert.strictEqual(post.rendu.spec.format, "post", "1080 × 1350");
  assert.strictEqual(post.rendu.spec.numero, 8425);
  assert.ok(post.rendu.spec.votes && Object.keys(post.rendu.spec.votes).length >= 10);
  assert.ok(!("auteur" in post.rendu.spec), "jamais d'auteur sur un vote du jour (amendement, article, motion)");
  assert.strictEqual(post.pasAvant, "2026-10-13T11:30:00.000Z", "13 h 30 Paris");
  // les tâches de dessin : un seul visuel, au format post
  assert.deepStrictEqual(C.tachesDessin(post).map((t) => [t.type, t.spec.format]), [["vote-groupes", "post"]]);
  // légende : faits et source, aucun avis, @hemicyclefrance, pas de lien du site ; entrée publiable comme un post
  const e = post.entree;
  assert.ok(e.legende.includes("@hemicyclefrance") && e.legende.includes("assemblee-nationale.fr/dyn/17/scrutins/8425"));
  assert.ok(!/github\.io|hemicycle-france/i.test(e.legende));
  assert.ok(PS.legendeValide(e), "la légende passe le contrôle du publieur");
  assert.ok(/Position majoritaire de chaque groupe : RN : abstention/.test(e.alt) && /NI : partagé/.test(e.alt), "texte alternatif : position de chaque groupe");
  // jamais d'avis ni de mot prudent
  assert.strictEqual(C.TYPES["vote-jour-post"].validite, 360);
  // jamais de Reel
  assert.ok(!("reelDe" in e) && !Object.keys(e).some((k) => /^url_video$|^reel/.test(k)), "aucun Reel");
}
// un seul post par scrutin : mémoire des faits, file, registre
{
  const post = contenu("vote-jour-post", MARDI_MIDI);
  const etat = C.etatVide(); etat.faits[`vote-jour-post|${post.cle}`] = { id: post.id, le: "2026-10-13T09:00:00Z" };
  assert.ok(plan(MARDI_MIDI, { etat }).refus["vote-jour-post"], "mémoire des faits");
  assert.match(plan(MARDI_MIDI, { etat }).refus["vote-jour-post"], /déjà produit/);
  assert.ok(!contenu("vote-jour-post", MARDI_MIDI, { file: { entrees: [{ id: post.id, cree: "2026-10-13T09:00:00Z", type: "post", titre: "x" }] } }), "déjà dans la file");
  assert.ok(!contenu("vote-jour-post", MARDI_MIDI, { registre: { entrees: [{ id: post.id, statut: "publiee", publieLe: "2026-10-13T11:35:00Z" }] } }), "déjà publié (registre)");
  // même scrutin, lendemain (autre jour) : le fait mémorisé du scrutin l'empêche toujours
  const demain = plan("2026-10-14T11:40:00Z", { etat });
  assert.ok(!demain.plan.some((x) => x.nom === "vote-jour-post" && x.cle === post.cle));
}
// plafond de posts : la dernière place du jour reste aux lois et au résumé de la semaine ; jamais le jour du résumé hebdomadaire
{
  const unPost = { entrees: [{ id: "aaaaaaaaaaaa", cree: "2026-10-13T08:00:00Z", type: "post", titre: "Loi adoptée" }] };
  const r = plan(MARDI_MIDI, { file: unPost });
  assert.ok(!r.plan.some((x) => x.nom === "vote-jour-post"), "un post déjà sorti aujourd'hui : le post du vote du jour s'efface");
  assert.match(r.refus["vote-jour-post"], /réservée/);
  assert.ok(r.plan.some((x) => x.nom === "vote-jour"), "la story du vote du jour n'est pas touchée");
  const dim = plan("2026-10-11T11:40:00Z");
  assert.ok(!dim.plan.some((x) => x.nom === "vote-jour-post"), "dimanche (résumé hebdomadaire) : pas de post vote du jour");
  assert.match(dim.refus["vote-jour-post"] || "", /résumé hebdomadaire/);
  // mardi : post du vote du jour (13 h 30) puis carrousel-loi (17 h 30) : 2 posts, jamais 3
  const soir = plan("2026-10-13T14:00:00Z");
  assert.deepStrictEqual(soir.plan.filter((x) => x.nom === "vote-jour-post" || x.nom === "carrousel-loi").map((x) => x.nom), ["vote-jour-post", "carrousel-loi"]);
  const deuxPosts = plan("2026-10-13T14:00:00Z", { file: { entrees: [{ id: "bbbbbbbbbbbb", cree: "2026-10-13T08:00:00Z", type: "carousel", titre: "x" }, { id: "cccccccccccc", cree: "2026-10-13T09:00:00Z", type: "post", titre: "y" }] } });
  assert.ok(!deuxPosts.plan.some((x) => x.nom === "vote-jour-post" || x.nom === "carrousel-loi"), "2 posts déjà là : aucun troisième");
}
// scrutin sans détail par groupe, mots prudents : pas de post
{
  const d = donnees(); d.lois.lois.forEach((l) => { delete l.votes; });
  assert.ok(C.choisirVoteDuJourPost({ lois: d.lois, jour: "2026-10-13", now: new Date(MARDI_MIDI) }).refus);
  const d2 = donnees(); d2.lois.lois.forEach((l) => { l.dossierTitre = "Projet de loi sur l'ancien ministre mis en examen"; l.titre = l.titre.replace("projet de loi", "projet de loi sur l'ancien ministre mis en examen"); });
  assert.ok(C.choisirVoteDuJourPost({ lois: d2.lois, jour: "2026-10-13", now: new Date(MARDI_MIDI) }).refus, "mot prudent écarté, comme pour la story");
}
// RÉSERVE ÉLECTORALE : rien qui parle de sondages pendant la réserve ; l'ordre du jour ordinaire n'est pas un sondage
{
  const lois = { lastUpdated: "2027-04-16T02:00:00Z", lois: [{ numero: 9100, titre: "l'article 2 du projet de loi relatif à la publication des sondages d'opinion (première lecture).", date: "15 avril 2027", dateISO: "2027-04-15", typeVote: "SPO", dossierTitre: "Publication des sondages d'opinion", resultat: "adopte", votes: { RN: [100, 0, 0, 120], EPR: [80, 5, 0, 90] } }] };
  const enReserve = new Date("2027-04-16T10:00:00Z");
  assert.ok(SA.reserveStory(enReserve), "16 avril 2027 : réserve électorale (1er tour le 18)");
  assert.match(C.choisirVoteDuJourPost({ lois, jour: "2027-04-16", now: enReserve }).refus || "", /réserve électorale/);
  const horsReserve = new Date("2027-03-16T10:00:00Z");
  const l2 = { ...lois, lastUpdated: "2027-03-16T02:00:00Z", lois: [{ ...lois.lois[0], dateISO: "2027-03-15", date: "15 mars 2027" }] };
  assert.ok(C.choisirVoteDuJourPost({ lois: l2, jour: "2027-03-16", now: horsReserve }).contenu, "hors réserve : publié");
}

// ---------- B. STORY « vote final par groupe » ----------
const loiFinale = (numero, auteur, extra = {}) => ({ numero, titre: "l'ensemble de la proposition de loi visant à relancer les investissements dans le secteur de l'hydroélectricité (première lecture).", date: "12 octobre 2026", dateISO: "2026-10-12", typeVote: "SPS", dossierRef: "DLR5L17N99999", dossierTitre: "Relancer les investissements dans l'hydroélectricité", auteur, theme: "Énergie", resultat: "adopte", votes: clone(VOTE_GROUPES), ...extra });
const loisAvec = (...ls) => ({ lastUpdated: "2026-10-13T02:00:00Z", lois: ls });
const publie = (id) => ({ entrees: [{ id, statut: "publiee", publieLe: "2026-10-13T08:00:00Z", mediaId: "1" }] });
const NUIT_LOI = "2026-10-13T18:10:00Z"; // 20 h 10 Paris
{
  const lois = loisAvec(loiFinale(9200, "Jean Dupont (RN)"));
  const [v] = C.votesFinaux({ lois, senat: null, jour: "2026-10-13" });
  const postId = C.idPostLoi(v.voteId);
  // pas encore publié (ni post, ni carrousel) : pas de story (elle complète une publication, elle ne la remplace jamais)
  const r0 = C.choisirVoteLoi({ lois, etat: C.etatVide(), jour: "2026-10-13", now: new Date(NUIT_LOI), registre: vide });
  assert.match(r0.refus, /pas encore été publié en post ni en carrousel/);
  // dans la file seulement (pas publié) : non plus
  assert.ok(C.choisirVoteLoi({ lois, etat: C.etatVide(), jour: "2026-10-13", now: new Date(NUIT_LOI), registre: { entrees: [{ id: postId, statut: "perimee" }] } }).refus, "post périmé : jamais publié, pas de story");
  // post publié : story
  const r = C.choisirVoteLoi({ lois, etat: C.etatVide(), jour: "2026-10-13", now: new Date(NUIT_LOI), registre: publie(postId) });
  assert.ok(r.contenu, r.refus);
  const k = r.contenu;
  assert.strictEqual(k.rendu.kind, "story");
  assert.strictEqual(k.rendu.type, "vote-groupes");
  assert.strictEqual(k.rendu.spec.format, "story");
  assert.strictEqual(k.rendu.spec.chambre, "Assemblée nationale");
  assert.strictEqual(k.rendu.spec.pour, 62 + 68 + 26 + 26 + 29 + 29 + 19 + 14 + 3, "voix = somme des groupes");
  assert.strictEqual(k.rendu.spec.auteur, "Jean Dupont (RN)", "texte déposé par un député : auteur affiché");
  assert.strictEqual(k.entree.nommePersonne, true, "image nommant une personne : brouillon en monétisation");
  assert.ok(!("voteId" in k.entree) && k.entree.voteIdGroupes === k.cle, "n'utilise pas voteId : ne bloque jamais le post ni le carrousel du même vote");
  assert.ok(/Texte de Jean Dupont \(RN\)/.test(k.entree.alt) && /RN : pour/.test(k.entree.alt));
  // carrousel publié : aussi
  const idCar = C.idContenu("carrousel-loi", v.voteId);
  assert.ok(C.choisirVoteLoi({ lois, etat: C.etatVide(), jour: "2026-10-13", now: new Date(NUIT_LOI), registre: publie(idCar) }).contenu, "après un carrousel de loi");
  // une seule fois par vote
  const etat = C.etatVide(); etat.faits[`vote-loi|${v.voteId}`] = { id: "x", le: "2026-10-13T18:00:00Z" };
  assert.match(C.choisirVoteLoi({ lois, etat, jour: "2026-10-13", now: new Date(NUIT_LOI), registre: publie(postId) }).refus, /déjà présenté/);
  // planifié à 20 h dans le plan du jour, comme story (hors plafond des posts)
  const pl = C.planifier({ now: new Date(NUIT_LOI), donnees: { ...donnees(), lois }, file: vide, registre: publie(postId), brouillons: [], etat: C.etatVide(), creneaux: CRENEAUX, config: {} });
  const sortie = pl.plan.find((x) => x.nom === "vote-loi");
  assert.ok(sortie, JSON.stringify(pl.refus));
  assert.strictEqual(sortie.pasAvant, "2026-10-13T18:00:00.000Z", "20 h Paris");
  // le même vote ne ressort pas le lendemain
  const memoire = C.planifier({ now: new Date("2026-10-14T18:10:00Z"), donnees: { ...donnees(), lois }, file: vide, registre: publie(postId), brouillons: [], etat: { ...C.etatVide(), faits: { [`vote-loi|${v.voteId}`]: { id: sortie.id, le: NUIT_LOI } } }, creneaux: CRENEAUX, config: {} });
  assert.ok(!memoire.plan.some((x) => x.nom === "vote-loi"));
}
// L'AUTEUR : uniquement pour un texte déposé par UN député ; jamais pour un amendement, un article, une motion, le Gouvernement, un sénateur, plusieurs auteurs
{
  const A = C.auteurTexteDepose;
  assert.strictEqual(A({ titre: "l'ensemble de la proposition de loi visant à X (première lecture).", auteur: "Jean Dupont (RN)" }), "Jean Dupont (RN)");
  assert.strictEqual(A({ titre: "l'ensemble du projet de loi relatif à X.", auteur: "Émeline K/Bidi (GDR)" }), "Émeline K/Bidi (GDR)");
  assert.strictEqual(A({ titre: "l'amendement n° 8 du Gouvernement au projet de loi X", auteur: "Jean Dupont (RN)" }), null, "jamais pour un amendement");
  assert.strictEqual(A({ titre: "l'article 3 de la proposition de loi visant à X", auteur: "Jean Dupont (RN)" }), null, "ni pour un article");
  assert.strictEqual(A({ titre: "la motion de censure déposée en application de l'article 49", auteur: "Jean Dupont (RN)" }), null, "ni pour une motion");
  assert.strictEqual(A({ titre: "l'ensemble du projet de loi relatif à X.", auteur: "Gouvernement (Sébastien Lecornu)" }), null);
  assert.strictEqual(A({ titre: "l'ensemble de la proposition de loi visant à X.", auteur: "Laurent Lafon, sénateur" }), null);
  assert.strictEqual(A({ titre: "l'ensemble de la proposition de loi visant à X.", auteur: "Marie-Noëlle Battistel (SOC) et 1 autre député" }), null);
  assert.strictEqual(A({ titre: "l'ensemble de la proposition de loi visant à X.", auteur: "Président de la République (Emmanuel Macron)" }), null);
  assert.strictEqual(A({ titre: "l'ensemble de la proposition de loi visant à X." }), null);
  // sans auteur affichable : la fiche n'a pas le champ et n'est pas « nommePersonne »
  const lois = loisAvec(loiFinale(9201, "Gouvernement (Sébastien Lecornu)"));
  const [v] = C.votesFinaux({ lois, senat: null, jour: "2026-10-13" });
  const r = C.choisirVoteLoi({ lois, etat: C.etatVide(), jour: "2026-10-13", now: new Date(NUIT_LOI), registre: publie(C.idPostLoi(v.voteId)) });
  assert.ok(r.contenu && !("auteur" in r.contenu.rendu.spec) && !("nommePersonne" in r.contenu.entree));
}
// Seulement les VOTES FINAUX de l'Assemblée : jamais un amendement ni un article ; pas le Sénat
{
  const amend = { ...loiFinale(9300, "Jean Dupont (RN)"), titre: "l'amendement n° 12 de M. Dupont à l'article 3 de la proposition de loi X." };
  const lois = loisAvec(amend);
  assert.ok(C.choisirVoteLoi({ lois, etat: C.etatVide(), jour: "2026-10-13", now: new Date(NUIT_LOI), registre: vide }).refus);
  const sansVotes = loisAvec((({ votes, ...r }) => r)(loiFinale(9301, "Jean Dupont (RN)")));
  assert.match(C.choisirVoteLoi({ lois: sansVotes, etat: C.etatVide(), jour: "2026-10-13", now: new Date(NUIT_LOI), registre: vide }).refus, /aucun vote final|sans détail/);
  // vote final rejeté : montré aussi, avec le verdict officiel
  const rej = loisAvec(loiFinale(9302, "Jean Dupont (RN)", { resultat: "rejete", votes: { RN: [0, 100, 0, 120], EPR: [2, 80, 0, 90] } }));
  const [v] = C.votesFinaux({ lois: rej, senat: null, jour: "2026-10-13" });
  const rr = C.choisirVoteLoi({ lois: rej, etat: C.etatVide(), jour: "2026-10-13", now: new Date(NUIT_LOI), registre: publie(C.idPostLoi(v.voteId)) });
  assert.strictEqual(rr.contenu.rendu.spec.verdict, "rejete");
}
// Positions de groupe : mêmes règles que le dessin
{
  assert.strictEqual(C.positionGroupe([62, 0, 0, 122], false), "pour");
  assert.strictEqual(C.positionGroupe([0, 49, 0, 71], false), "contre");
  assert.strictEqual(C.positionGroupe([1, 1, 8, 10], false), "abstention");
  assert.strictEqual(C.positionGroupe([5, 5, 0, 10], false), "partagé");
  assert.strictEqual(C.positionGroupe([0, 0, 0, 10], false), null);
  assert.strictEqual(C.positionGroupe({ pour: 40, contre: 0, abst: 0, membres: 60 }, true), "pour", "motion de censure : pour si plus de la moitié des membres");
  assert.strictEqual(C.positionGroupe([10, 0, 0, 60], true), "contre");
}

// ---------- C. Écriture : image au bon format, entrée de file, publication, monétisation ----------
function jpegFactice(l, h) {
  const b = Buffer.alloc(3000, 7);
  b[0] = 0xff; b[1] = 0xd8; b[2] = 0xff; b[3] = 0xc0; b.writeUInt16BE(17, 4); b[6] = 8; b.writeUInt16BE(h, 7); b.writeUInt16BE(l, 9);
  return b;
}
const dessinFactice = (jobs) => Promise.resolve(jobs.map((j) => jpegFactice(1080, j.spec?.format === "post" || j.type === "diapo" ? 1350 : 1920)));
function racineEssai({ config = {}, lois = fx.donnees.lois, registre = { entrees: [] } } = {}) {
  const r = mkdtempSync(join(tmpdir(), "vote-groupes-"));
  mkdirSync(join(r, "data", "digest"), { recursive: true });
  for (const [k, v] of Object.entries(fx.donnees)) if (k !== "digest") writeFileSync(join(r, "data", { agenda: "agenda-an", lois: "lois", senat: "senat", navette: "navette", indicateurs: "indicateurs", budget: "budget", sondages: "sondages" }[k] + ".json"), JSON.stringify(k === "lois" ? lois : v));
  writeFileSync(join(r, "index.html"), "<html></html>");
  writeFileSync(join(r, "data", "stories-config.json"), JSON.stringify({ contenusAuto: true, ...config }));
  writeFileSync(join(r, "data", "instagram-file.json"), JSON.stringify({ entrees: [] }));
  writeFileSync(join(r, "data", "instagram-publiees.json"), JSON.stringify(registre));
  mkdirSync(join(r, "instagram", "auto"), { recursive: true });
  return r;
}
{
  const ch = C.chemins(racineEssai());
  const now = new Date(MARDI_MIDI);
  const crees = await C.main({ ch, now, dessiner: dessinFactice });
  const post = crees.find((c) => c.contenu === "vote-jour-post"), story = crees.find((c) => c.contenu === "vote-jour");
  assert.ok(post && story);
  assert.strictEqual(post.type, "post", "entrée de file de type « post » (fil Instagram), pas un carrousel");
  assert.ok(post.legende && post.url_image.endsWith(`/${post.id}.jpg`) && !("url_images" in post));
  assert.ok(existsSync(join(ch.img, `${post.id}.jpg`)));
  assert.strictEqual(story.type, "story");
  assert.deepStrictEqual(await C.main({ ch, now, dessiner: dessinFactice }), [], "rien de nouveau au passage suivant : un seul post par scrutin");
  const file = JSON.parse(readFileSync(ch.file, "utf-8"));
  assert.strictEqual(file.entrees.filter((e) => e.contenu === "vote-jour-post").length, 1);
  // le publieur : le post sort à partir de 13 h 30 (pas avant), compte comme un post, jamais comme une story de presse
  const config = { maxParJour: 8, videos: true, videosMax: 2 };
  const avant = PS.choisir({ file, registre: vide, config, now: new Date("2026-10-13T11:00:00Z") });
  assert.ok(!avant.entree || avant.entree.contenu !== "vote-jour-post", "pas avant son créneau");
  const apres = PS.choisir({ file: { entrees: file.entrees.filter((e) => e.contenu === "vote-jour-post") }, registre: vide, config, now: new Date("2026-10-13T11:45:00Z") });
  assert.ok(apres.entree && apres.entree.id === post.id, apres.refus);
  assert.ok(!PS.risque(apres.entree), "le publieur ne le juge pas à risque");
  // dimensions : une image de story pour le post est refusée (aucune entrée sans image valide)
  const ch2 = C.chemins(racineEssai());
  const mauvais = await C.main({ ch: ch2, now, dessiner: (jobs) => Promise.resolve(jobs.map(() => jpegFactice(1080, 1920))) });
  assert.ok(!mauvais.some((c) => c.contenu === "vote-jour-post"), "post en 1080 × 1920 refusé");
}
{
  // monétisation : un vote final avec un auteur nommé passe par un brouillon à valider ; sans auteur : file
  const lois = loisAvec(loiFinale(9400, "Jean Dupont (RN)"));
  const [v] = C.votesFinaux({ lois, senat: null, jour: "2026-10-13" });
  const reg = publie(C.idPostLoi(v.voteId));
  const ch = C.chemins(racineEssai({ lois, config: { monetisation: true }, registre: reg }));
  const crees = await C.main({ ch, now: new Date(NUIT_LOI), dessiner: dessinFactice });
  const vl = crees.find((c) => c.contenu === "vote-loi");
  assert.ok(vl, "story vote-loi créée");
  assert.strictEqual(vl.vers, "brouillon", "auteur nommé en monétisation : à valider");
  assert.ok(!("nommePersonne" in vl));
  const ch2 = C.chemins(racineEssai({ lois: loisAvec(loiFinale(9401, "Gouvernement (Sébastien Lecornu)")), config: { monetisation: true }, registre: publie(C.idPostLoi("an-9401")) }));
  const c2 = await C.main({ ch: ch2, now: new Date(NUIT_LOI), dessiner: dessinFactice });
  assert.strictEqual(c2.find((c) => c.contenu === "vote-loi").vers, "file", "sans personne nommée : file");
}
// Le vote-loi ne pose aucune clé « voteId » : la story ne se fait jamais passer pour le post ni pour le carrousel du même vote (stories-auto.choisirPostLoi, loiDejaTraitee)
{
  const lois = loisAvec(loiFinale(9500, "Jean Dupont (RN)"));
  const [v] = C.votesFinaux({ lois, senat: null, jour: "2026-10-13" });
  const k = C.choisirVoteLoi({ lois, etat: C.etatVide(), jour: "2026-10-13", now: new Date(NUIT_LOI), registre: publie(C.idPostLoi(v.voteId)) }).contenu;
  assert.ok(!("voteId" in k.entree), "pas de voteId");
  // la clé de mémoire est celle du type : « vote-loi|<voteId> », distincte de « carrousel-loi|<voteId> »
  assert.strictEqual(`vote-loi|${k.cle}`, `vote-loi|${v.voteId}`);
  assert.notStrictEqual(C.idContenu("vote-loi", v.voteId), C.idContenu("carrousel-loi", v.voteId));
  assert.notStrictEqual(C.idContenu("vote-loi", v.voteId), C.idPostLoi(v.voteId));
}

console.log("[tests vote-groupes] OK");
