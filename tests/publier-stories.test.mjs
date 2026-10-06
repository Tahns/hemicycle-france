// Tests de scripts/publier-stories.cjs avec un faux serveur HTTP local (API Graph simulée + images). USAGE : node tests/publier-stories.test.mjs
import assert from "assert";
import http from "http";
import { spawn } from "child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const JETON = "EAAJETONSECRET123";
const MAINTENANT = "2026-10-05T10:00:00Z"; // 12 h à Paris (lundi), hors réserve
const il_y_a = (h, base = MAINTENANT) => new Date(Date.parse(base) - h * 36e5).toISOString();

// Faux serveur : mémorise les appels ; le comportement se règle par l'objet « etat »
const etat = {};
const appels = [];
const serveur = http.createServer((req, res) => {
  let corps = "";
  req.on("data", (c) => (corps += c));
  req.on("end", () => {
    const url = new URL(req.url, "http://x");
    appels.push({ methode: req.method, chemin: url.pathname, corps, auth: req.headers.authorization });
    const json = (code, o) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
    if (url.pathname.startsWith("/img/")) { res.writeHead(etat.image === 404 ? 404 : 200); return res.end(); }
    if (url.pathname === "/debug_token") return json(200, { data: { is_valid: etat.valide !== false, expires_at: etat.expire ?? 0 } });
    if (url.pathname === "/IGUSER/media" && req.method === "POST") return etat.erreurMedia ? json(400, { error: { message: "Invalid image " + JETON } }) : json(200, { id: "CONT1" });
    if (url.pathname === "/CONT1") return json(200, { status_code: "FINISHED", id: "CONT1" });
    if (url.pathname === "/IGUSER/media_publish") return json(200, { id: "MEDIA42" });
    json(404, { error: { message: "inconnu" } });
  });
});
await new Promise((r) => serveur.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${serveur.address().port}`;

function entree(id, cree, extra = {}) {
  return { id, cree, titre: "Budget : le gouvernement présente son texte", medias: ["A", "B", "C"], url_image: `${BASE}/img/${id}.jpg`, type: "story", sources: [], ...extra };
}

/** Lance le script dans un dossier temporaire ; renvoie { code, sortie, resume, registre }. */
async function lancer({ entrees = [], registre = null, config = { monetisation: false, validationHumaine: false }, now = MAINTENANT, secrets = true, args = [], reglages = {} }) {
  Object.keys(etat).forEach((k) => delete etat[k]);
  Object.assign(etat, reglages);
  appels.length = 0;
  const d = mkdtempSync(join(tmpdir(), "pub-"));
  writeFileSync(join(d, "file.json"), JSON.stringify({ entrees }));
  writeFileSync(join(d, "config.json"), JSON.stringify(config));
  if (registre) writeFileSync(join(d, "reg.json"), JSON.stringify(registre));
  writeFileSync(join(d, "resume.md"), "");
  const env = { ...process.env, GRAPH_BASE: BASE, PUBLIER_MAINTENANT: now, PUBLIER_FILE: join(d, "file.json"), PUBLIER_REGISTRE: join(d, "reg.json"), PUBLIER_CONFIG: join(d, "config.json"), PUBLIER_ATTENTE_MS: "10", GITHUB_STEP_SUMMARY: join(d, "resume.md") };
  delete env.IG_USER_ID; delete env.IG_ACCESS_TOKEN;
  if (secrets) Object.assign(env, { IG_USER_ID: "IGUSER", IG_ACCESS_TOKEN: JETON });
  const p = spawn(process.execPath, ["scripts/publier-stories.cjs", ...args], { env });
  let sortie = "";
  p.stdout.on("data", (c) => (sortie += c));
  p.stderr.on("data", (c) => (sortie += c));
  const code = await new Promise((r) => p.on("close", r));
  const lire = (f) => (existsSync(join(d, f)) ? readFileSync(join(d, f), "utf-8") : "");
  const reg = lire("reg.json");
  return { code, sortie, resume: lire("resume.md"), registre: reg ? JSON.parse(reg) : null };
}
const publications = () => appels.filter((a) => a.chemin === "/IGUSER/media_publish");
const jamaisLeJeton = (r) => { assert.ok(!r.sortie.includes(JETON) && !r.resume.includes(JETON), "le jeton ne doit jamais apparaître dans les journaux"); };
const frais = entree("aaaaaaaaaaaa", il_y_a(1));

try {
  // Secrets absents : sortie propre, ligne dans le résumé, aucun appel
  {
    const r = await lancer({ entrees: [frais], secrets: false });
    assert.strictEqual(r.code, 0);
    assert.match(r.resume, /Publication automatique inactive : secrets absents/);
    assert.strictEqual(appels.length, 0);
    assert.strictEqual(r.registre, null);
  }
  // Succès : conteneur STORIES, statut FINISHED, publication, registre ; une seule par exécution
  {
    const r = await lancer({ entrees: [frais, entree("bbbbbbbbbbbb", il_y_a(0.5))] });
    assert.strictEqual(r.code, 0, r.sortie);
    assert.strictEqual(publications().length, 1);
    const media = appels.find((a) => a.chemin === "/IGUSER/media");
    assert.match(media.corps, /media_type=STORIES/);
    assert.ok(media.corps.includes(encodeURIComponent(`${BASE}/img/aaaaaaaaaaaa.jpg`)), "la plus ancienne entrée fraîche d'abord");
    assert.match(media.corps, /access_token=/);
    assert.match(publications()[0].corps, /creation_id=CONT1/);
    assert.ok(appels.some((a) => a.chemin === "/CONT1"), "statut du conteneur interrogé");
    const e = r.registre.entrees.find((x) => x.id === "aaaaaaaaaaaa");
    assert.strictEqual(e.statut, "publiee");
    assert.strictEqual(e.mediaId, "MEDIA42");
    assert.ok(!r.registre.entrees.some((x) => x.id === "bbbbbbbbbbbb"), "une seule publication par exécution");
    assert.match(r.resume, /Story publiée/);
    jamaisLeJeton(r);
  }
  // Mode --a-sec : aucune publication, aucun registre
  {
    const r = await lancer({ entrees: [frais], args: ["--a-sec"] });
    assert.strictEqual(r.code, 0);
    assert.strictEqual(publications().length, 0);
    assert.ok(!appels.some((a) => a.chemin === "/IGUSER/media"));
    assert.strictEqual(r.registre, null);
    assert.match(r.resume, /À sec/);
  }
  // Nuit (1 h à Paris) : rien
  {
    const nuit = "2026-10-05T23:00:00Z"; // 1 h à Paris
    const r = await lancer({ entrees: [entree("cccccccccccc", il_y_a(1, nuit), {})], now: nuit });
    assert.strictEqual(publications().length, 0);
    assert.match(r.sortie, /nuit/);
  }
  // Plafond journalier : 4 déjà publiées aujourd'hui
  {
    const reg = { entrees: [1, 2, 3, 4].map((i) => ({ id: `0000000000${i}0`.slice(0, 12), statut: "publiee", publieLe: il_y_a(i * 0.5), mediaId: "m" + i })) };
    const r = await lancer({ entrees: [frais], registre: reg });
    assert.strictEqual(publications().length, 0);
    assert.match(r.sortie, /plafond/);
  }
  // Espacement : une story publiée il y a moins d'une heure bloque la suivante
  {
    const reg = { entrees: [{ id: "eeeeeeeeeeee", statut: "publiee", publieLe: il_y_a(0.25), mediaId: "m1" }] };
    const r = await lancer({ entrees: [frais], registre: reg });
    assert.strictEqual(publications().length, 0);
    assert.match(r.sortie, /moins de 60 min/);
  }
  // Entrée périmée (> 3 h) : marquée « perimee », jamais publiée
  {
    const r = await lancer({ entrees: [entree("dddddddddddd", il_y_a(3.5))] });
    assert.strictEqual(publications().length, 0);
    assert.strictEqual(r.registre.entrees.find((x) => x.id === "dddddddddddd").statut, "perimee");
  }
  // Image absente (HEAD 404) : pas de publication, pas de marquage, nouvel essai plus tard
  {
    const r = await lancer({ entrees: [frais], reglages: { image: 404 } });
    assert.strictEqual(publications().length, 0);
    assert.ok(!r.registre || !r.registre.entrees.some((x) => x.id === "aaaaaaaaaaaa"));
    assert.match(r.sortie, /pas encore en ligne/);
  }
  // Doublon : id déjà au registre, jamais republié
  {
    const r = await lancer({ entrees: [frais], registre: { entrees: [{ id: "aaaaaaaaaaaa", statut: "publiee", publieLe: il_y_a(0.5), mediaId: "m" }] } });
    assert.strictEqual(publications().length, 0);
    assert.strictEqual(r.registre.entrees.length, 1);
  }
  // Réserve électorale (samedi 17 avril 2027, veille du 1er tour) : ni sondage ni titre de sondage
  {
    const reserve = "2027-04-17T10:00:00Z";
    const r = await lancer({ entrees: [entree("eeeeeeeeeeee", il_y_a(1, reserve), { sondageId: "Ifop|2027-04-10" }), entree("ffffffffffff", il_y_a(1, reserve), { titre: "Nouveau sondage : les intentions de vote" })], now: reserve });
    assert.strictEqual(publications().length, 0);
    assert.match(r.sortie, /réserve électorale/);
  }
  // Validation humaine : rien n'est publié
  {
    await lancer({ entrees: [frais], config: { validationHumaine: true } });
    assert.strictEqual(publications().length, 0);
  }
  // Monétisation : une entrée de presse n'est pas publiée
  {
    await lancer({ entrees: [frais], config: { monetisation: true } });
    assert.strictEqual(publications().length, 0);
    await lancer({ entrees: [entree("111111111111", il_y_a(1), { donneesPropres: true })], config: { monetisation: true } });
    assert.strictEqual(publications().length, 1, "une entrée sur données propres reste publiable");
  }
  // Erreur de l'API : pas de marquage « publiée », jeton absent des journaux, sortie sans erreur
  {
    const r = await lancer({ entrees: [frais], reglages: { erreurMedia: true } });
    assert.strictEqual(r.code, 0);
    assert.strictEqual(publications().length, 0);
    assert.ok(!r.registre || !r.registre.entrees.some((x) => x.id === "aaaaaaaaaaaa"));
    assert.match(r.resume, /échec de publication/);
    jamaisLeJeton(r);
  }
  // Jeton qui expire dans moins de 10 jours : alerte dans le résumé (la publication continue)
  {
    const expire = Math.floor(Date.parse(MAINTENANT) / 1000) + 3 * 86400;
    const r = await lancer({ entrees: [frais], reglages: { expire } });
    assert.match(r.resume, /ALERTE : le jeton Instagram expire dans 3 jour/);
    assert.strictEqual(publications().length, 1);
    jamaisLeJeton(r);
  }
  // Jeton invalide : alerte, aucune publication
  {
    const r = await lancer({ entrees: [frais], reglages: { valide: false } });
    assert.match(r.resume, /ALERTE : le jeton Instagram est invalide/);
    assert.strictEqual(publications().length, 0);
  }
  // Dernier filet : une entrée de presse mise en file avant le durcissement de la liste prudente n'est jamais publiée
  {
    const r = await lancer({ entrees: [entree("dddddddddddd", il_y_a(1), { titre: "Primaire de la gauche : Glucksmann se dit désolé après ses propos inélégants" })] });
    assert.strictEqual(publications().length, 0, "titre à mot prudent : pas de publication");
    assert.match(r.sortie, /rien à publier/);
    // un « en bref » est contrôlé sujet par sujet
    const r2 = await lancer({ entrees: [entree("eeeeeeeeeeee", il_y_a(1), { bref: true, titre: "En bref : ce qu'il faut retenir aujourd'hui", sujets: ["Budget 2027", "Polémique sur le budget"] })] });
    assert.strictEqual(publications().length, 0, "en bref avec un sujet à mot prudent : pas de publication");
    jamaisLeJeton(r2);
    // un titre sans mot prudent passe
    await lancer({ entrees: [entree("ffffffffffff", il_y_a(1), { bref: true, titre: "En bref", sujets: ["Budget 2027", "Loi de programmation militaire"] })] });
    assert.strictEqual(publications().length, 1);
  }
  // Pas deux fois le même sujet à quelques heures d'écart (titres rédigés proches, story déjà publiée dans les 36 h)
  {
    const deja = entree("gggggggggggg", il_y_a(4), { titrePropre: "Blocage des lycées" });
    const proche = entree("hhhhhhhhhhhh", il_y_a(1), { titrePropre: "Blocus des lycées" });
    const registre = { entrees: [{ id: "gggggggggggg", statut: "publiee", publieLe: il_y_a(3), mediaId: "M1" }] };
    await lancer({ entrees: [deja, proche], registre });
    assert.strictEqual(publications().length, 0, "sujet proche déjà publié : rien");
    const autre = entree("iiiiiiiiiiii", il_y_a(1), { titrePropre: "Loi de programmation militaire" });
    await lancer({ entrees: [deja, autre], registre });
    assert.strictEqual(publications().length, 1, "sujet différent : publié");
    // le titre conservé dans le registre suffit, même si l'entrée a quitté la file
    const seul = { entrees: [{ id: "zzzzzzzzzzzz", statut: "publiee", publieLe: il_y_a(30), mediaId: "M2", titre: "Blocage des lycées" }] };
    await lancer({ entrees: [proche], registre: seul });
    assert.strictEqual(publications().length, 0, "titre du registre (30 h) : refusé");
    // plus de 36 h après : de nouveau possible
    const ancien = { entrees: [{ id: "gggggggggggg", statut: "publiee", publieLe: il_y_a(40), mediaId: "M1", titre: "Blocage des lycées" }] };
    await lancer({ entrees: [{ ...deja, cree: il_y_a(40) }, proche], registre: ancien });
    assert.strictEqual(publications().length, 1, "plus de 36 h : possible");
  }
  // ------------------------------------------------------------------------------------------------------------
  // POSTS (fil) et STORIES D'ANNONCE
  const LEGENDE = "Projet de loi relatif à la simplification — texte adopté\n\nL'Assemblée nationale a adopté, le 1 octobre 2026, l'ensemble du texte.\nPour : 300 · Contre : 100 · Abstentions : 10.\n\nSource officielle : Assemblée nationale, scrutin public n°100 — https://www.assemblee-nationale.fr/dyn/17/scrutins/100\n\nToute l'actu politique : @hemicyclefrance\n#Politique #AssembléeNationale #Loi";
  const postE = (id, cree, extra = {}) => ({ id, cree, titre: "Projet de loi relatif à la simplification de la vie économique", titrePropre: "Simplification de la vie économique", medias: [], url_image: `${BASE}/img/${id}.jpg`, type: "post", sources: ["https://www.assemblee-nationale.fr/dyn/17/scrutins/100"], legende: LEGENDE, donneesPropres: true, ...extra });
  const annonceE = (id, cree, de, extra = {}) => ({ id, cree, titre: "Nouveau post : Simplification de la vie économique", titrePropre: "Simplification de la vie économique", medias: [], url_image: `${BASE}/img/${id}.jpg`, type: "story", annonceDe: de, sources: [], donneesPropres: true, ...extra });
  const regPub = (id, h, extra = {}) => ({ id, statut: "publiee", publieLe: il_y_a(h), mediaId: "m" + id, ...extra });
  const corps = (a) => Object.fromEntries(new URLSearchParams(a.corps));
  const P1 = "a1a1a1a1a1a1", A1 = "b1b1b1b1b1b1";
  const premier = () => corps(appels.find((a) => a.chemin === "/IGUSER/media"));
  // Un post : conteneur image + légende (pas STORIES), publication, registre { type: "post" }
  {
    const r = await lancer({ entrees: [postE(P1, il_y_a(1)), annonceE(A1, il_y_a(1), P1)] });
    assert.strictEqual(r.code, 0, r.sortie);
    assert.strictEqual(publications().length, 1, "le post d'abord ; l'annonce attend");
    const c = premier();
    assert.strictEqual(c.image_url, `${BASE}/img/${P1}.jpg`);
    assert.strictEqual(c.caption, LEGENDE);
    assert.ok(!("media_type" in c), "un post n'est pas une story");
    const e = r.registre.entrees.find((x) => x.id === P1);
    assert.strictEqual(e.statut, "publiee");
    assert.strictEqual(e.type, "post");
    assert.ok(!r.registre.entrees.some((x) => x.id === A1));
    assert.match(r.resume, /Post publié/);
    jamaisLeJeton(r);
  }
  // La story d'annonce : jamais avant 5 min après son post ; ensuite, même à moins de 60 min (seule exception) ; type STORIES, annonceDe au registre
  {
    const file = [postE(P1, il_y_a(1)), annonceE(A1, il_y_a(1), P1)];
    const tot = await lancer({ entrees: file, registre: { entrees: [regPub(P1, 3 / 60, { type: "post", titre: "Simplification de la vie économique" })] } });
    assert.strictEqual(publications().length, 0, "post publié il y a 3 min : l'annonce attend");
    assert.match(tot.sortie, /annonce en attente|moins de 60 min/);
    const r = await lancer({ entrees: file, registre: { entrees: [regPub(P1, 6 / 60, { type: "post", titre: "Simplification de la vie économique" })] } });
    assert.strictEqual(publications().length, 1, "post publié il y a 6 min : l'annonce sort");
    assert.strictEqual(premier().media_type, "STORIES");
    assert.strictEqual(premier().image_url, `${BASE}/img/${A1}.jpg`);
    const e = r.registre.entrees.find((x) => x.id === A1);
    assert.strictEqual(e.annonceDe, P1);
    assert.strictEqual(e.type, "story");
    assert.match(r.resume, /Story d'annonce publiée/);
    // la même fenêtre de 6 min bloque une story ordinaire (60 min) et un autre post
    await lancer({ entrees: [frais], registre: { entrees: [regPub(P1, 6 / 60, { type: "post" })] } });
    assert.strictEqual(publications().length, 0, "une story ordinaire reste soumise aux 60 min");
    await lancer({ entrees: [postE("c2c2c2c2c2c2", il_y_a(1), { titre: "Autre loi sur l'énergie", titrePropre: "Prix de l'énergie" })], registre: { entrees: [regPub(P1, 6 / 60, { type: "post" })] } });
    assert.strictEqual(publications().length, 0, "un autre post aussi");
    // l'annonce passe avant une autre story en attente
    await lancer({ entrees: [frais, ...file], registre: { entrees: [regPub(P1, 10 / 60, { type: "post" })] } });
    assert.strictEqual(premier().image_url, `${BASE}/img/${A1}.jpg`);
    // 60 min plus tard, le registre n'a plus d'exception mais l'annonce reste publiable (moins de 3 h)
    await lancer({ entrees: file, registre: { entrees: [regPub(P1, 1.5, { type: "post" })] } });
    assert.strictEqual(publications().length, 1);
    // une annonce n'est publiée qu'une fois
    await lancer({ entrees: file, registre: { entrees: [regPub(P1, 0.2, { type: "post" }), regPub(A1, 0.1, { annonceDe: P1 })] } });
    assert.strictEqual(publications().length, 0, "annonce déjà publiée");
  }
  // Annonce périmée : post publié il y a plus de 3 h, ou post périmé
  {
    const file = [postE(P1, il_y_a(5)), annonceE(A1, il_y_a(5), P1)];
    const r = await lancer({ entrees: file, registre: { entrees: [regPub(P1, 4, { type: "post" })] } });
    assert.strictEqual(publications().length, 0);
    assert.strictEqual(r.registre.entrees.find((x) => x.id === A1).statut, "perimee");
    const r2 = await lancer({ entrees: file, registre: { entrees: [{ id: P1, statut: "perimee", publieLe: null, mediaId: null, type: "post" }] } });
    assert.strictEqual(publications().length, 0);
    assert.strictEqual(r2.registre.entrees.find((x) => x.id === A1).statut, "perimee");
    // post jamais publié et périmé : l'annonce l'est aussi, dans la même exécution
    const r3 = await lancer({ entrees: [postE(P1, il_y_a(13)), annonceE(A1, il_y_a(13), P1)] });
    assert.strictEqual(publications().length, 0);
    assert.deepStrictEqual(r3.registre.entrees.map((x) => [x.id, x.statut, x.type]).sort(), [[A1, "perimee", "story"], [P1, "perimee", "post"]].sort());
  }
  // Un post reste publiable 12 h (une story, 3 h)
  {
    await lancer({ entrees: [postE(P1, il_y_a(8))] });
    assert.strictEqual(publications().length, 1, "post de 8 h : publié");
    await lancer({ entrees: [entree("d4d4d4d4d4d4", il_y_a(8))] });
    assert.strictEqual(publications().length, 0, "story de 8 h : périmée");
  }
  // Plafonds : 2 posts par jour (la story passe), les stories d'annonce et les posts ne comptent pas dans les 4 stories
  {
    const deuxPosts = { entrees: [regPub("e1e1e1e1e1e1", 3, { type: "post" }), regPub("e2e2e2e2e2e2", 5, { type: "post" })] };
    const r = await lancer({ entrees: [postE(P1, il_y_a(1)), frais], registre: deuxPosts });
    assert.strictEqual(publications().length, 1);
    assert.strictEqual(premier().media_type, "STORIES", "3e post refusé, la story passe");
    await lancer({ entrees: [postE(P1, il_y_a(1))], registre: deuxPosts });
    assert.strictEqual(publications().length, 0);
    assert.match((await lancer({ entrees: [postE(P1, il_y_a(1))], registre: deuxPosts })).sortie, /plafond/);
    // posts d'hier : ne comptent pas
    await lancer({ entrees: [postE(P1, il_y_a(1))], registre: { entrees: [regPub("e1e1e1e1e1e1", 30, { type: "post" }), regPub("e2e2e2e2e2e2", 31, { type: "post" })] } });
    assert.strictEqual(publications().length, 1);
    // 3 stories + 1 post + 1 annonce aujourd'hui : la 4e story passe encore ; avec 4 stories, plus de story mais un post
    const reg = { entrees: [regPub("e3e3e3e3e3e3", 2), regPub("e4e4e4e4e4e4", 3), regPub("e5e5e5e5e5e5", 4), regPub("e6e6e6e6e6e6", 5, { type: "post" }), regPub("e7e7e7e7e7e7", 6, { annonceDe: "e6e6e6e6e6e6" })] };
    await lancer({ entrees: [frais], registre: reg });
    assert.strictEqual(publications().length, 1, "posts et annonces ne comptent pas dans les 4 stories");
    const reg4 = { entrees: [...reg.entrees, regPub("e8e8e8e8e8e8", 1.5)] };
    await lancer({ entrees: [frais], registre: reg4 });
    assert.strictEqual(publications().length, 0, "4 stories : plus de story");
    await lancer({ entrees: [postE(P1, il_y_a(1))], registre: reg4 });
    assert.strictEqual(publications().length, 1, "mais un post passe");
  }
  // Horaires : jamais la nuit (23 h – 7 h, Paris), pour un post comme pour une annonce
  {
    const nuit = "2026-10-05T23:30:00Z"; // 1 h 30 à Paris
    await lancer({ entrees: [postE(P1, il_y_a(1, nuit))], now: nuit });
    assert.strictEqual(publications().length, 0);
    const r = await lancer({ entrees: [annonceE(A1, il_y_a(1, nuit), P1)], registre: { entrees: [regPub(P1, 0.2, { type: "post" })] }, now: nuit });
    assert.strictEqual(publications().length, 0);
    assert.match(r.sortie, /nuit/);
    await lancer({ entrees: [postE(P1, il_y_a(1, "2026-10-05T05:30:00Z"))], now: "2026-10-05T05:30:00Z" }); // 7 h 30 à Paris
    assert.strictEqual(publications().length, 1, "7 h 30 : possible");
  }
  // Pas deux fois : id au registre ; post et annonce déjà publiés ; titre proche d'un post publié dans les 36 h (sauf l'annonce de ce post)
  {
    await lancer({ entrees: [postE(P1, il_y_a(1))], registre: { entrees: [regPub(P1, 20, { type: "post" })] } });
    assert.strictEqual(publications().length, 0, "id déjà publié");
    await lancer({ entrees: [postE("c3c3c3c3c3c3", il_y_a(1))], registre: { entrees: [regPub(P1, 20, { type: "post", titre: "Simplification de la vie économique" })] } });
    assert.strictEqual(publications().length, 0, "même loi à moins de 36 h : refusée");
    await lancer({ entrees: [postE("c3c3c3c3c3c3", il_y_a(1))], registre: { entrees: [regPub(P1, 40, { type: "post", titre: "Simplification de la vie économique" })] } });
    assert.strictEqual(publications().length, 1, "plus de 36 h : possible");
    await lancer({ entrees: [postE("c4c4c4c4c4c4", il_y_a(1), { titre: "Projet de loi de programmation militaire", titrePropre: "Programmation militaire" })], registre: { entrees: [regPub(P1, 20, { type: "post", titre: "Simplification de la vie économique" })] } });
    assert.strictEqual(publications().length, 1, "autre loi : publiée");
  }
  // Réserve électorale, monétisation, validation humaine, mots à risque, légende invalide
  {
    const reserve = "2027-04-17T10:00:00Z";
    await lancer({ entrees: [postE(P1, il_y_a(1, reserve), { titre: "Nouveau sondage sur le projet de loi", donneesPropres: false })], now: reserve });
    assert.strictEqual(publications().length, 0, "réserve électorale : rien qui parle de sondage");
    await lancer({ entrees: [postE(P1, il_y_a(1))], config: { monetisation: true } });
    assert.strictEqual(publications().length, 1, "monétisation : post sur données officielles publiable");
    await lancer({ entrees: [postE(P1, il_y_a(1), { donneesPropres: false, titre: "Le projet de loi sera examiné le 27 octobre" })], config: { monetisation: true } });
    assert.strictEqual(publications().length, 0, "monétisation : post de presse (date) non publié");
    await lancer({ entrees: [postE(P1, il_y_a(1))], config: { validationHumaine: true } });
    assert.strictEqual(publications().length, 0);
    await lancer({ entrees: [postE(P1, il_y_a(1), { donneesPropres: false, titre: "Le procès du projet de loi sera examiné le 27 octobre" })] });
    assert.strictEqual(publications().length, 0, "mot à risque : jamais");
    for (const legende of [undefined, "court", LEGENDE + "\nhttps://tahns.github.io/hemicycle-france/", LEGENDE.replace("@hemicyclefrance", "le compte"), LEGENDE + " " + "#a".repeat(31), "x".repeat(2300) + " @hemicyclefrance"]) {
      const r = await lancer({ entrees: [postE(P1, il_y_a(1), { legende })] });
      assert.strictEqual(publications().length, 0, `légende invalide : ${String(legende).slice(0, 30)}`);
      jamaisLeJeton(r);
    }
  }
  // Erreur de l'API sur un post : pas de marquage « publiée » ; image absente : nouvel essai
  {
    const r = await lancer({ entrees: [postE(P1, il_y_a(1))], reglages: { erreurMedia: true } });
    assert.ok(!r.registre || !r.registre.entrees.some((x) => x.id === P1));
    assert.match(r.resume, /échec de publication/);
    jamaisLeJeton(r);
    const r2 = await lancer({ entrees: [postE(P1, il_y_a(1))], reglages: { image: 404 } });
    assert.strictEqual(publications().length, 0);
    assert.match(r2.sortie, /pas encore en ligne/);
  }
  // À sec : un post est annoncé comme tel, rien n'est envoyé
  {
    const r = await lancer({ entrees: [postE(P1, il_y_a(1))], args: ["--a-sec"] });
    assert.match(r.resume, /serait publiée en post/);
    assert.strictEqual(appels.filter((a) => a.chemin === "/IGUSER/media").length, 0);
  }
  console.log("[tests publier-stories] OK");
} finally {
  serveur.close();
}
