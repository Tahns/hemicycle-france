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
    if (url.pathname.startsWith("/vid/")) { res.writeHead(etat.video === 404 ? 404 : 200, { "content-type": etat.videoType || "video/mp4" }); return res.end(); }
    if (url.pathname.startsWith("/img/")) { res.writeHead(etat.image === 404 ? 404 : 200); return res.end(); }
    if (url.pathname === "/debug_token") return json(200, { data: { is_valid: etat.valide !== false, expires_at: etat.expire ?? 0 } });
    if (url.pathname === "/IGUSER/media" && req.method === "POST" && etat.erreurVideo && corps.includes("video_url")) return json(400, { error: { message: "Video refusée " + JETON } });
    if (url.pathname === "/IGUSER/media" && req.method === "POST") return etat.erreurMedia ? json(400, { error: { message: "Invalid image " + JETON } }) : json(200, { id: "CONT1" });
    if (url.pathname === "/CONT1") return json(200, { status_code: etat.statuts?.length ? etat.statuts.shift() : "FINISHED", id: "CONT1" });
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
async function lancer({ entrees = [], registre = null, config = { monetisation: false, validationHumaine: false }, now = MAINTENANT, secrets = true, args = [], reglages = {}, env: envPlus = {} }) {
  Object.keys(etat).forEach((k) => delete etat[k]);
  Object.assign(etat, reglages);
  appels.length = 0;
  const d = mkdtempSync(join(tmpdir(), "pub-"));
  writeFileSync(join(d, "file.json"), JSON.stringify({ entrees }));
  writeFileSync(join(d, "config.json"), JSON.stringify(config));
  if (registre) writeFileSync(join(d, "reg.json"), JSON.stringify(registre));
  writeFileSync(join(d, "resume.md"), "");
  const env = { ...process.env, GRAPH_BASE: BASE, PUBLIER_MAINTENANT: now, PUBLIER_FILE: join(d, "file.json"), PUBLIER_REGISTRE: join(d, "reg.json"), PUBLIER_CONFIG: join(d, "config.json"), PUBLIER_ATTENTE_MS: "10", GITHUB_STEP_SUMMARY: join(d, "resume.md") };
  Object.assign(env, envPlus);
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
  // Aucun espacement : une story publiée il y a 15 min ne bloque pas la suivante
  {
    const reg = { entrees: [{ id: "eeeeeeeeeeee", statut: "publiee", publieLe: il_y_a(0.25), mediaId: "m1" }] };
    await lancer({ entrees: [frais], registre: reg });
    assert.strictEqual(publications().length, 1, "pas d'espacement : la story sort");
  }
  // Entrée périmée (> 6 h) : marquée « perimee », jamais publiée
  {
    const r = await lancer({ entrees: [entree("dddddddddddd", il_y_a(6.5))] });
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
    assert.strictEqual(publications().length, 0, "post publié il y a 3 min : l'annonce attend 3 h (jamais le même contenu d'affilée)");
    const r = await lancer({ entrees: file, registre: { entrees: [regPub(P1, 3.2, { type: "post", titre: "Simplification de la vie économique" })] } });
    assert.strictEqual(publications().length, 1, "post publié il y a plus de 3 h : l'annonce sort");
    assert.strictEqual(premier().media_type, "STORIES");
    assert.strictEqual(premier().image_url, `${BASE}/img/${A1}.jpg`);
    const e = r.registre.entrees.find((x) => x.id === A1);
    assert.strictEqual(e.annonceDe, P1);
    assert.strictEqual(e.type, "story");
    assert.match(r.resume, /Story d'annonce publiée/);
    // l'annonce passe avant une autre story en attente
    await lancer({ entrees: [frais, ...file], registre: { entrees: [regPub(P1, 3.5, { type: "post" })] } });
    assert.strictEqual(premier().image_url, `${BASE}/img/${A1}.jpg`);
    // l'annonce reste publiable (moins de 6 h)
    await lancer({ entrees: file, registre: { entrees: [regPub(P1, 4.5, { type: "post" })] } });
    assert.strictEqual(publications().length, 1);
    // une annonce n'est publiée qu'une fois
    await lancer({ entrees: file, registre: { entrees: [regPub(P1, 0.2, { type: "post" }), regPub(A1, 0.1, { annonceDe: P1 })] } });
    assert.strictEqual(publications().length, 0, "annonce déjà publiée");
  }
  // Annonce périmée : post publié il y a plus de 6 h, ou post périmé
  {
    const file = [postE(P1, il_y_a(5)), annonceE(A1, il_y_a(5), P1)];
    const r = await lancer({ entrees: file, registre: { entrees: [regPub(P1, 7, { type: "post" })] } });
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
  // Un post reste publiable 12 h (une story, 6 h)
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
  // ---------- VIDÉOS : story vidéo, Reel, attente du statut, replis ----------
  process.env.HEMICYCLE_TEST_REELS = "1"; // les Reels ne sortent jamais en production : activés ici pour tester leur code
  {
    const LEG = "Projet de loi relatif à la simplification — texte adopté\n\nL'Assemblée nationale a adopté, le 1 octobre 2026, l'ensemble du texte.\nPour : 300 · Contre : 100 · Abstentions : 10.\n\nSource officielle : Assemblée nationale, scrutin public n°100 — https://www.assemblee-nationale.fr/dyn/17/scrutins/100\n\nToute l'actu politique : @hemicyclefrance\n#Politique #AssembléeNationale #Loi";
    const histoire = (id, cree, extra = {}) => entree(id, cree, { url_video: `${BASE}/vid/${id}.mp4`, ...extra });
    const reelE = (id, cree, de, extra = {}) => ({ id, cree, titre: "Reel : Simplification de la vie économique", titrePropre: "Simplification de la vie économique", medias: [], url_image: `${BASE}/img/${id}.jpg`, url_video: `${BASE}/vid/${id}.mp4`, type: "reel", reelDe: de, sources: [], legende: LEG, donneesPropres: true, ...extra });
    const regPub = (id, h, extra = {}) => ({ id, statut: "publiee", publieLe: il_y_a(h), mediaId: "m" + id, ...extra });
    const corps = (a) => Object.fromEntries(new URLSearchParams(a.corps));
    const creations = () => appels.filter((a) => a.chemin === "/IGUSER/media" && a.methode === "POST").map(corps);
    const V = { videos: true, videosMax: 2 };
    const S1 = "c1c1c1c1c1c1", P9 = "d1d1d1d1d1d1", R9 = "e1e1e1e1e1e1";

    // Story vidéo : conteneur STORIES + video_url, registre « video: true »
    {
      const r = await lancer({ entrees: [histoire(S1, il_y_a(1))], config: V });
      assert.strictEqual(r.code, 0);
      const c = creations();
      assert.strictEqual(c.length, 1);
      assert.strictEqual(c[0].media_type, "STORIES");
      assert.strictEqual(c[0].video_url, `${BASE}/vid/${S1}.mp4`);
      assert.ok(!c[0].image_url);
      assert.strictEqual(publications().length, 1);
      assert.deepStrictEqual(r.registre.entrees.map((x) => [x.id, x.statut, x.type, x.video]), [[S1, "publiee", "story", true]]);
      assert.match(r.resume, /Story vidéo publiée/);
      jamaisLeJeton(r);
    }
    // Vidéos désactivées (défaut) : l'image part, la vidéo est ignorée
    for (const config of [{ monetisation: false, validationHumaine: false }, { videos: false }]) {
      const r = await lancer({ entrees: [histoire(S1, il_y_a(1))], config });
      const c = creations();
      assert.strictEqual(c.length, 1);
      assert.strictEqual(c[0].image_url, `${BASE}/img/${S1}.jpg`);
      assert.ok(!c[0].video_url);
      assert.ok(!r.registre.entrees[0].video);
    }
    // Vidéo pas en ligne (404) ou mauvais type : repli immédiat sur l'image
    for (const reglages of [{ video: 404 }, { videoType: "text/html" }]) {
      const r = await lancer({ entrees: [histoire(S1, il_y_a(1))], config: V, reglages });
      assert.strictEqual(creations()[0].image_url, `${BASE}/img/${S1}.jpg`);
      assert.strictEqual(publications().length, 1);
      assert.match(r.sortie, /la story partira en image/);
    }
    // L'API refuse la vidéo avant media_publish : repli sur l'image, UNE seule publication, pas de doublon
    {
      const r = await lancer({ entrees: [histoire(S1, il_y_a(1))], config: V, reglages: { erreurVideo: true } });
      const c = creations();
      assert.strictEqual(c.length, 2);
      assert.ok(c[0].video_url && c[1].image_url);
      assert.strictEqual(publications().length, 1);
      assert.strictEqual(r.registre.entrees.length, 1);
      assert.ok(!r.registre.entrees[0].video);
      assert.match(r.resume, /repli sur l'image/);
      jamaisLeJeton(r);
    }
    // Statut du conteneur : attente (IN_PROGRESS) puis FINISHED ; ERROR : repli sur l'image
    {
      const r = await lancer({ entrees: [histoire(S1, il_y_a(1))], config: V, reglages: { statuts: ["IN_PROGRESS", "IN_PROGRESS", "FINISHED"] } });
      assert.strictEqual(publications().length, 1);
      assert.strictEqual(appels.filter((a) => a.chemin === "/CONT1").length, 3, "trois interrogations du statut");
      assert.strictEqual(creations().length, 1);
      const r2 = await lancer({ entrees: [histoire(S1, il_y_a(1))], config: V, reglages: { statuts: ["ERROR"] } });
      assert.strictEqual(creations().length, 2, "vidéo en ERROR : nouveau conteneur avec l'image");
      assert.strictEqual(publications().length, 1);
      assert.ok(r2.registre.entrees.length === 1 && !r2.registre.entrees[0].video);
    }
    // Attente trop longue (vidéo jamais prête) : délai épuisé, repli sur l'image
    {
      await lancer({ entrees: [histoire(S1, il_y_a(1))], config: V, reglages: { statuts: Array(500).fill("IN_PROGRESS").concat(["FINISHED"]) }, env: { PUBLIER_VIDEO_MAX_MS: "200" } });
      assert.ok(creations().length >= 1);
    }
    // REEL : seulement après son post publié, légende et share_to_feed
    {
      const file = [postE9(), reelE(R9, il_y_a(2), P9)];
      function postE9() { return { id: P9, cree: il_y_a(2), titre: "Projet de loi relatif à la simplification de la vie économique", titrePropre: "Simplification de la vie économique", medias: [], url_image: `${BASE}/img/${P9}.jpg`, type: "post", sources: [], legende: LEG, donneesPropres: true }; }
      // le post est choisi d'abord (le Reel attend)
      const r0 = await lancer({ entrees: file, config: V });
      assert.deepStrictEqual(r0.registre.entrees.map((x) => [x.id, x.type]), [[P9, "post"]]);
      // post publié il y a 2 h : le Reel part
      const r = await lancer({ entrees: file, config: V, registre: { entrees: [regPub(P9, 2, { type: "post", titre: "Simplification de la vie économique" })] } });
      const c = creations();
      assert.strictEqual(c.length, 1);
      assert.strictEqual(c[0].media_type, "REELS");
      assert.strictEqual(c[0].video_url, `${BASE}/vid/${R9}.mp4`);
      assert.strictEqual(c[0].caption, LEG);
      assert.strictEqual(c[0].share_to_feed, "true");
      assert.deepStrictEqual(r.registre.entrees.filter((x) => x.id === R9).map((x) => [x.type, x.video, x.reelDe]), [["reel", true, P9]]);
      assert.match(r.resume, /Reel publié/);
      // aucun espacement : le Reel sort même 30 min après son post
      await lancer({ entrees: file, config: V, registre: { entrees: [regPub(P9, 0.5, { type: "post" })] } });
      assert.strictEqual(publications().length, 1, "pas d'espacement : le Reel sort");
      // vidéos désactivées : jamais de Reel
      await lancer({ entrees: file, config: { videos: false }, registre: { entrees: [regPub(P9, 2, { type: "post" })] } });
      assert.strictEqual(publications().length, 0, "videos false : pas de Reel");
      // vidéo pas en ligne : nouvel essai au passage suivant, rien d'écrit
      const r2 = await lancer({ entrees: file, config: V, registre: { entrees: [regPub(P9, 2, { type: "post" })] }, reglages: { video: 404 } });
      assert.strictEqual(publications().length, 0);
      assert.match(r2.sortie, /vidéo pas encore en ligne/);
      assert.ok(!r2.registre.entrees.some((x) => x.id === R9));
      // l'API refuse le Reel (ou statut ERROR) : ni repli ni doublon, registre inchangé
      for (const reglages of [{ erreurVideo: true }, { statuts: ["ERROR"] }]) {
        const r3 = await lancer({ entrees: file, config: V, registre: { entrees: [regPub(P9, 2, { type: "post" })] }, reglages });
        assert.strictEqual(publications().length, 0);
        assert.strictEqual(creations().filter((x) => !x.video_url).length, 0, "aucun repli sur une image");
        assert.ok(!r3.registre.entrees.some((x) => x.id === R9));
        assert.match(r3.resume, /échec de publication/);
        jamaisLeJeton(r3);
      }
      // post périmé : le Reel l'est aussi ; Reel plus de 12 h après son post : périmé
      const r4 = await lancer({ entrees: file, config: V, registre: { entrees: [{ id: P9, statut: "perimee", publieLe: null, mediaId: null, type: "post" }] } });
      assert.strictEqual(publications().length, 0);
      assert.strictEqual(r4.registre.entrees.find((x) => x.id === R9).statut, "perimee");
      const r5 = await lancer({ entrees: file, config: V, registre: { entrees: [regPub(P9, 13, { type: "post" })] } });
      assert.strictEqual(publications().length, 0);
      assert.strictEqual(r5.registre.entrees.find((x) => x.id === R9).statut, "perimee");
      // plafond : videosMax Reels par jour
      await lancer({ entrees: file, config: { videos: true, videosMax: 1 }, registre: { entrees: [regPub(P9, 2, { type: "post" }), regPub("f1f1f1f1f1f1", 3, { type: "reel" })] } });
      assert.strictEqual(publications().length, 0, "plafond de Reels atteint");
      // Reel de légende invalide ou à mot à risque : jamais
      await lancer({ entrees: [file[0], reelE(R9, il_y_a(2), P9, { legende: "court" })], config: V, registre: { entrees: [regPub(P9, 2, { type: "post" })] } });
      assert.strictEqual(publications().length, 0, "légende de Reel invalide");
      await lancer({ entrees: [file[0], reelE(R9, il_y_a(2), P9, { titre: "Le scandale du texte", titrePropre: "Le scandale du texte" })], config: V, registre: { entrees: [regPub(P9, 2, { type: "post" })] } });
      assert.strictEqual(publications().length, 0, "mot à risque dans un Reel");
      // nuit : jamais
      await lancer({ entrees: file, config: V, now: "2026-10-05T22:30:00Z", registre: { entrees: [regPub(P9, 2, { type: "post" })] } });
      assert.strictEqual(publications().length, 0);
      // à sec
      const r6 = await lancer({ entrees: file, config: V, args: ["--a-sec"], registre: { entrees: [regPub(P9, 2, { type: "post" })] } });
      assert.match(r6.resume, /serait publiée en Reel/);
      assert.strictEqual(creations().length, 0);
    }
  }
  delete process.env.HEMICYCLE_TEST_REELS;
  // Aucun Reel, jamais : même un Reel prêt dans la file, derrière un post publié, ne sort pas
  {
    const P8 = "d8d8d8d8d8d8", R8 = "e8e8e8e8e8e8";
    await lancer({ entrees: [{ id: R8, cree: il_y_a(3), type: "reel", reelDe: P8, titre: "Reel : x", titrePropre: "x", medias: [], url_image: `${BASE}/img/${R8}.jpg`, url_video: `${BASE}/vid/${R8}.mp4`, legende: "Un Reel de test pour le compte @hemicyclefrance sans aucun lien.", sources: [] }], config: { videos: true, videosMax: 2 }, registre: { entrees: [{ id: P8, statut: "publiee", publieLe: il_y_a(2), mediaId: "m8", type: "post" }] } });
    assert.strictEqual(publications().length, 0, "aucun Reel, jamais");
  }
  // SUJETS SENSIBLES : niveau 1 (fait judiciaire établi) publié ; niveau 2 jamais sans validation humaine ; dernier filet sur la formulation
  {
    const titreN1 = "Selon Le Monde et franceinfo : le tribunal judiciaire de Paris a rendu une décision";
    const n1 = (id, extra = {}) => entree(id, il_y_a(1), { sensible: 1, titre: titreN1, titrePropre: titreN1, medias: ["Le Monde", "franceinfo"], juridiction: "le tribunal judiciaire de Paris", nommePersonne: false,
      pied: "Sources : Le Monde, franceinfo. Toute personne citée est présumée innocente tant qu'elle n'a pas été jugée définitivement.", sujets: ["Le tribunal judiciaire de Paris condamne un ancien ministre"], ...extra });
    const n2 = (id, extra = {}) => entree(id, il_y_a(1), { sensible: 2, titre: "Selon Mediapart : des faits non établis à ce stade", titrePropre: "Selon Mediapart : des faits non établis à ce stade", medias: ["Mediapart"], sujets: ["Mediapart accuse un ministre de fraude"], ...extra });
    const r1 = await lancer({ entrees: [n1("c1c1c1c1c1c1")] });
    assert.strictEqual(publications().length, 1, "niveau 1 : fait judiciaire établi publié malgré les mots de la liste prudente dans le titre de presse");
    assert.strictEqual(r1.registre.entrees[0].sensible, true, "le registre note le sujet sensible");
    jamaisLeJeton(r1);
    await lancer({ entrees: [n2("c2c2c2c2c2c2")] });
    assert.strictEqual(publications().length, 0, "niveau 2 sans validation humaine : jamais publié");
    await lancer({ entrees: [n2("c2c2c2c2c2c2", { valideHumain: true })] });
    assert.strictEqual(publications().length, 0, "valideHumain sans date de validation : jamais publié");
    await lancer({ entrees: [n2("c2c2c2c2c2c2", { valideHumain: true, valideLe: il_y_a(0.2) })] });
    assert.strictEqual(publications().length, 1, "niveau 2 validé par un humain : publié");
    await lancer({ entrees: [n1("c3c3c3c3c3c3", { titre: "Selon Le Monde : le tribunal a jugé le coupable", titrePropre: "Selon Le Monde : le tribunal a jugé le coupable" })] });
    assert.strictEqual(publications().length, 0, "niveau 1 : « coupable » refusé par le dernier filet");
    await lancer({ entrees: [n1("c4c4c4c4c4c4", { medias: ["Le Monde"] })] });
    assert.strictEqual(publications().length, 0, "niveau 1 : un seul média refusé");
    await lancer({ entrees: [n1("c5c5c5c5c5c5", { juridiction: "" })] });
    assert.strictEqual(publications().length, 0, "niveau 1 : sans juridiction refusé");
    await lancer({ entrees: [n1("c6c6c6c6c6c6", { sujets: ["Un mineur condamné par le tribunal"] })] });
    assert.strictEqual(publications().length, 0, "niveau 1 : mineur dans le titre de presse refusé");
    // validation humaine générale : seules les entrées validées par un humain sortent
    await lancer({ entrees: [n1("c7c7c7c7c7c7")], config: { validationHumaine: true } });
    assert.strictEqual(publications().length, 0, "validationHumaine : une entrée automatique ne sort pas");
    await lancer({ entrees: [n2("c8c8c8c8c8c8", { valideHumain: true, valideLe: il_y_a(0.2) })], config: { validationHumaine: true } });
    assert.strictEqual(publications().length, 1, "validationHumaine : une entrée validée par un humain sort");
    // doublon : deux sujets sensibles voisins de 36 h ne se bloquent pas par leur formule, mais le même sujet est refusé
    await lancer({ entrees: [n1("c9c9c9c9c9c9", { sujets: ["Budget : le tribunal administratif suspend la décision de la mairie de Lyon"] })], registre: { entrees: [{ id: "d1d1d1d1d1d1", statut: "publiee", publieLe: il_y_a(5), mediaId: "M", titre: titreN1, sensible: true, sujets: ["Sénat : adoption du projet de loi de finances en première lecture"], type: "story" }] } });
    assert.strictEqual(publications().length, 1, "formule identique mais sujets différents : publié");
    await lancer({ entrees: [n1("c9c9c9c9c9c9", { sujets: ["Sénat : adoption du projet de loi de finances en première lecture"] })], registre: { entrees: [{ id: "d1d1d1d1d1d1", statut: "publiee", publieLe: il_y_a(5), mediaId: "M", titre: titreN1, sensible: true, sujets: ["Sénat : adoption du projet de loi de finances en première lecture"], type: "story" }] } });
    assert.strictEqual(publications().length, 0, "même sujet de presse déjà publié : refusé");
  }
  console.log("[tests publier-stories] OK");
} finally {
  serveur.close();
}
