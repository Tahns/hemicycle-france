// Tests des vignettes d'institutions (scripts/fetch-vignettes.js, scripts/vignettes-cle.js) avec des fixtures : aucun accès réseau.
// USAGE : node tests/vignettes.test.mjs
import assert from "assert";
import { spawnSync } from "child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { planHd, urlHd, produireHd, completerHd, hdAFaire, LARGEUR_HD_MIN, LARGEUR_HD_MAX, MAX_OCTETS_HD, evaluerFichier, choisirMeilleur, filtrerNom, resoudreCle, doitRetenter, ligneRapport, redimensionner, CANDIDATS, MAX_OCTETS, COTE } from "../scripts/fetch-vignettes.js";
import { verifierVignettes } from "../scripts/check-vignettes.js";
import { cleVignette, CLES } from "../scripts/vignettes-cle.js";
import { illustrer } from "../scripts/illustrations.js";

const MAINTENANT = Date.parse("2026-10-06");
const meta = (licence, extra = {}) => ({ LicenseShortName: { value: licence }, Artist: { value: "<a href='x'>Photographe</a>" }, Categories: { value: "Buildings" }, ...extra });
const page = (fichier, { licence = "CC BY-SA 4.0", l = 2000, h = 1500, mime = "image/jpeg", date = "2024-05-01", extra = {} } = {}) => ({
  title: `File:${fichier}`,
  imageinfo: [{ thumburl: `https://thumb.test/${fichier}`, descriptionurl: `https://commons.wikimedia.org/wiki/File:${fichier}`, width: l, height: h, mime, timestamp: `${date}T10:00:00Z`, extmetadata: meta(licence, extra) }],
});
const opt = { maintenant: MAINTENANT };

// --- Licence refusée ---
for (const licence of ["CC BY-NC 4.0", "CC BY-ND 2.0", "Fair use", "All rights reserved"]) {
  const r = evaluerFichier(page("Palais_Bourbon_facade.jpg", { licence }), opt);
  assert.equal(r.retenu, false, `licence refusée : ${licence}`);
  assert.match(r.raison, /licence/);
}
assert.equal(evaluerFichier(page("Palais_Bourbon.jpg", { extra: { NonFree: { value: "true" } } }), opt).retenu, false, "NonFree");
for (const licence of ["CC0", "CC BY 4.0", "CC BY-SA 3.0", "Public domain"]) assert.equal(evaluerFichier(page("Palais_Bourbon.jpg", { licence }), opt).retenu, true, licence);
assert.match(evaluerFichier(page("Bercy.jpg", { extra: { Restrictions: { value: "no freedom of panorama" } } }), opt).raison, /panorama/);

// --- Exigences de forme ---
assert.match(evaluerFichier(page("Petit.jpg", { l: 500, h: 400 }), opt).raison, /petit/);
assert.match(evaluerFichier(page("Pano.jpg", { l: 6000, h: 1000 }), opt).raison, /inexploitable/);
assert.match(evaluerFichier(page("Affiche.svg", { mime: "image/svg+xml" }), opt).raison, /format/);
assert.equal(evaluerFichier(page("Sarkozy_et_Hollande_devant_l_Elysee.jpg"), opt).retenu, false, "nom évoquant des personnes");
assert.equal(evaluerFichier(page("Palais_Bourbon_manif.jpg", { extra: { Categories: { value: "Demonstrations in Paris|Palais Bourbon" } } }), opt).retenu, false, "catégorie de manifestation");
assert.equal(evaluerFichier(page("Hotel_de_Beauvau.jpg", { extra: { Categories: { value: "Ministry of the Interior (France)" } } }), opt).retenu, true, "« Interior » d'un ministère n'est pas un intérieur");

// --- Choix du meilleur fichier : récent, proche du 4:3, nom de façade ---
const pages = [
  page("Palais_Bourbon_old.jpg", { date: "2005-01-01", l: 1600, h: 1200 }),
  page("Palais_Bourbon_facade_2025.jpg", { date: "2025-06-01", l: 3000, h: 2250 }),
  page("Palais_Bourbon_NC.jpg", { date: "2025-06-01", licence: "CC BY-NC 4.0", l: 4000, h: 3000 }),
  page("Palais_Bourbon_mini.jpg", { l: 300, h: 200 }),
];
const { meilleur, refus } = choisirMeilleur(pages, opt);
assert.equal(meilleur.fichier, "Palais_Bourbon_facade_2025.jpg");
assert.equal(refus.length, 2);
assert.equal(meilleur.licence, "CC BY-SA 4.0");
assert.equal(meilleur.auteur, "Photographe");
assert.deepEqual(choisirMeilleur([], opt).meilleur, null);

// --- Chaîne complète avec faux réseau ---
const JPEG = Buffer.alloc(3000, 7);
const rep = (status, corps = JPEG) => ({ status, ok: status >= 200 && status < 300, headers: { get: () => "image/jpeg" }, arrayBuffer: async () => corps });
const ctxDe = ({ categories = {}, bin = () => rep(200), appels = [] } = {}) => ({
  aujourdhui: "2026-10-06", maintenant: MAINTENANT, redimensionner: async (o) => o,
  api: async (url) => {
    appels.push(url);
    const cat = decodeURIComponent((url.match(/gcmtitle=([^&]+)/) || url.match(/titles=([^&]+)/) || [])[1] || "");
    const r = categories[cat];
    if (r instanceof Error) throw r;
    return { query: { pages: Object.fromEntries((r || []).map((p, i) => [i + 1, p])) } };
  },
  telecharger: async (u) => bin(u),
});
{
  const appels = [];
  const r = await resoudreCle("assemblee", ctxDe({ appels, categories: { "Category:Palais Bourbon": pages } }));
  assert.equal(r.statut, "photo");
  assert.equal(r.entree.fichier, "Palais_Bourbon_facade_2025.jpg");
  assert.equal(r.entree.licence, "CC BY-SA 4.0");
  assert.match(r.entree.source, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
  assert.match(r.entree.alt, /^Photo d'illustration : Palais Bourbon/);
  assert.equal(r.entree.octets, 3000);
  assert.equal(appels.length, 1, "le premier candidat suffit");
}
{ // premier candidat sans fichier libre : on passe au suivant
  const r = await resoudreCle("assemblee", ctxDe({ categories: { "Category:Palais Bourbon": [page("X_NC.jpg", { licence: "CC BY-NC 4.0" })], "Category:Facade of the Palais Bourbon": [page("Facade_ok.jpg")] } }));
  assert.equal(r.statut, "photo");
  assert.equal(r.entree.fichier, "Facade_ok.jpg");
  assert.equal(r.entree.candidat, "Category:Facade of the Palais Bourbon");
}
{ // HTTP 429 : transitoire, on n'insiste pas auprès des autres candidats
  const e = new Error("HTTP 429"); e.transitoire = true;
  const appels = [];
  const r = await resoudreCle("senat", ctxDe({ appels, categories: { "Category:Palais du Luxembourg": e } }));
  assert.equal(r.statut, "echec");
  assert.equal(r.transitoire, true);
  assert.equal(appels.length, 1);
}
{ // téléchargement refusé en 429 : transitoire aussi
  const r = await resoudreCle("senat", ctxDe({ categories: { "Category:Palais du Luxembourg": pages }, bin: () => rep(429) }));
  assert.equal(r.statut, "echec"); assert.equal(r.transitoire, true);
}
{ // thème sans aucune photo libre : échec définitif, repli sur le pictogramme
  const r = await resoudreCle("election", ctxDe({ categories: { "Category:Ballot boxes of France": [page("Urne_NC.jpg", { licence: "CC BY-NC-SA 4.0" })] } }));
  assert.equal(r.statut, "echec"); assert.equal(r.transitoire, false);
  assert.match(r.raison, /aucun fichier libre/);
  assert.equal((await resoudreCle("inconnu", ctxDe())).statut, "echec");
}

{ // catégorie vide mais sous-catégorie riche (cas réel du Sénat : 0 fichier direct) : exploration des sous-catégories, exclusions respectées
  const appels = [];
  const ctx = {
    aujourdhui: "2026-10-06", maintenant: MAINTENANT, redimensionner: async (o) => o, telecharger: async () => rep(200),
    api: async (url) => {
      appels.push(url);
      const d = decodeURIComponent(url);
      if (/cmtype=subcat/.test(d)) {
        const t = d.match(/cmtitle=(.+)$/)[1];
        if (t === "Category:Palais du Luxembourg") return { query: { categorymembers: [{ title: "Category:Palais du Luxembourg - Façade" }, { title: "Category:Interior of the Palais du Luxembourg" }, { title: "Category:Jardin du Luxembourg" }] } };
        return { query: { categorymembers: [] } };
      }
      if (/gcmtitle=Category:Palais du Luxembourg - Façade/.test(d)) return { query: { pages: { 1: page("Palais_du_Luxembourg_facade_2023.jpg", { date: "2023-05-01" }) } } };
      if (/Interior|Jardin/.test(d)) throw new Error("sous-catégorie exclue explorée");
      return { query: { pages: {} } };
    },
  };
  const r = await resoudreCle("senat", ctx);
  assert.equal(r.statut, "photo");
  assert.equal(r.entree.fichier, "Palais_du_Luxembourg_facade_2023.jpg");
  assert.match(r.entree.licence, /CC BY/);
}
{ // recherche plein texte : le nom du fichier doit citer le lieu
  const defSenat = CANDIDATS.senat;
  const sortie = filtrerNom([{ title: "File:Palais_du_Luxembourg_nord.jpg" }, { title: "File:Tour_Eiffel.jpg" }], defSenat, "Search:Palais du Luxembourg");
  assert.deepEqual(sortie.map((p) => p.title), ["File:Palais_du_Luxembourg_nord.jpg"]);
  assert.equal(filtrerNom([{ title: "File:Autre.jpg" }], defSenat, "Category:X").length, 1, "pas de filtre hors recherche");
  const r = await resoudreCle("budget", ctxDe({ categories: {} }));
  assert.equal(r.statut, "echec");
}
// Chaque thème a au moins une catégorie ET une recherche de repli (sauf les thèmes déjà servis par une photo livrée)
for (const c of ["senat", "budget", "region", "education", "international"]) {
  assert.ok(CANDIDATS[c].candidats.some((x) => x.startsWith("Search:")), `${c} : recherche de repli`);
  assert.ok(CANDIDATS[c].exige, `${c} : motif d'exigence du nom pour les recherches`);
  new RegExp(CANDIDATS[c].exige, "i");
}

// --- Reprises : une tentative par jour, sauf panne passagère ---
assert.equal(doitRetenter(undefined, "2026-10-06"), true);
assert.equal(doitRetenter({ dernierEssai: "2026-10-06" }, "2026-10-06"), false);
assert.equal(doitRetenter({ dernierEssai: "2026-10-05" }, "2026-10-06"), true);
assert.equal(doitRetenter({ dernierEssai: "2026-10-06", transitoire: true }, "2026-10-06"), true);

// --- Rapport : thèmes sans photo = pictogramme ---
const rapport = ligneRapport({ vignettes: { assemblee: {}, senat: {} } });
assert.match(rapport, new RegExp(`2/${CLES.length} institutions`));
assert.match(rapport, /pictogramme pour : .*justice/);

// --- Table : chaque clé a candidats, lieu, alt neutre ---
assert.deepEqual(Object.keys(CANDIDATS).sort(), [...CLES].sort());
for (const [c, d] of Object.entries(CANDIDATS)) { assert.ok(d.candidats.length && d.lieu, c); assert.match(d.alt, /^Photo d'illustration : /, c); }

// --- Mapping thème -> institution, règle de prudence ---
assert.equal(cleVignette("assemblee", ["Motion de censure : le vote"], []), "assemblee");
assert.equal(cleVignette("senat", ["Le Sénat examine"], []), "senat");
assert.equal(cleVignette("gouvernement", ["Le Premier ministre à Matignon"], []), "gouvernement");
assert.equal(cleVignette("gouvernement", ["Le chef de l'État s'exprime depuis l'Élysée"], []), "elysee");
assert.equal(cleVignette("budget", ["Budget : Bercy détaille"], []), "budget");
assert.equal(cleVignette("politique", ["Conseil régional : session"], []), "region");
assert.equal(cleVignette("politique", ["Réforme du lycée"], []), "education");
assert.equal(cleVignette("politique", ["Un sujet général"], []), null);
assert.equal(cleVignette("justice", ["Le tribunal rend son jugement"], []), "justice");
assert.equal(cleVignette("justice", ["Marine Le Pen : procès en appel"], [{ nom: "Marine Le Pen" }]), null, "justice avec personne nommée : jamais de visuel d'institution lié à la personne");
assert.equal(cleVignette("securite", ["Police : nouveau plan"], []), "securite");
assert.equal(cleVignette("securite", ["Attentat : un mort"], []), null);
assert.equal(illustrer(["Le tribunal rend son jugement"], []).vignette, "justice");
assert.equal(illustrer(["Nouvelle enquête sur un élu"], []).vignette, "justice");

// --- check-vignettes : sans licence ou crédit = erreur bloquante ; thème sans photo = avertissement ---
{
  const d = mkdtempSync(path.join(tmpdir(), "vig-check-"));
  mkdirSync(path.join(d, "photos"));
  writeFileSync(path.join(d, "photos", "assemblee.jpg"), JPEG);
  writeFileSync(path.join(d, "photos", "senat.jpg"), JPEG);
  const fichier = path.join(d, "vignettes.json");
  const bon = { chemin: "photos/assemblee.jpg", licence: "CC BY-SA 4.0", auteur: "A", source: "https://commons.wikimedia.org/wiki/File:A.jpg", alt: "Photo d'illustration : X" };
  writeFileSync(fichier, JSON.stringify({ vignettes: { assemblee: bon } }));
  let r = await verifierVignettes(path.join(d, "photos"), fichier);
  assert.ok(r.erreurs.some((e) => /senat\.jpg : aucune entrée de licence/.test(e)), "photo sans entrée : bloquant");
  assert.ok(r.avertissements.some((a) => /sans photo libre/.test(a)) && !r.erreurs.some((e) => /assemblee/.test(e)));
  writeFileSync(fichier, JSON.stringify({ vignettes: { assemblee: bon, senat: { ...bon, licence: "CC BY-NC 4.0", auteur: "", source: "" } } }));
  r = await verifierVignettes(path.join(d, "photos"), fichier);
  assert.equal(r.erreurs.length, 3, r.erreurs.join(" | ")); // licence non libre, lien et auteur manquants
  writeFileSync(fichier, JSON.stringify({ vignettes: { assemblee: bon, senat: { ...bon, chemin: "photos/senat.jpg" } } }));
  assert.deepEqual((await verifierVignettes(path.join(d, "photos"), fichier)).erreurs, []);
  const vide = await verifierVignettes(path.join(d, "absent"), path.join(d, "absent.json"));
  assert.deepEqual(vide.erreurs, []); // aucune vignette : seulement l'avertissement (pictogrammes)
  assert.equal(vide.avec, 0);
}

// --- Redimensionnement réel (ffmpeg), seulement s'il est installé ---
if (spawnSync("ffmpeg", ["-version"]).status === 0) {
  const dossier = mkdtempSync(path.join(tmpdir(), "vig-test-"));
  const src = path.join(dossier, "src.jpg");
  const g = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=1280x720", "-frames:v", "1", src]);
  assert.equal(g.status, 0, "création de l'image d'essai");
  const jpeg = await redimensionner(readFileSync(src));
  assert.ok(jpeg.length <= MAX_OCTETS, `${jpeg.length} octets`);
  assert.equal(jpeg[0], 0xff); assert.equal(jpeg[1], 0xd8, "JPEG");
  const sortie = path.join(dossier, "sortie.jpg");
  writeFileSync(sortie, jpeg);
  const p = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", sortie], { encoding: "utf-8" });
  if (p.status === 0) assert.equal(p.stdout.trim(), `${COTE},${COTE}`, "carré recadré");
} else console.log("ffmpeg absent : essai de redimensionnement ignoré");

// --- Version HD : plan, adresse, production (fonctions pures + faux téléchargement) ---
{
  assert.equal(planHd(1079), null, "source trop étroite : pas de HD");
  assert.equal(planHd(undefined), null);
  assert.deepEqual(planHd(1080), { largeur: 1080 });
  assert.deepEqual(planHd(1300), { largeur: 1300 }, "jamais d'agrandissement");
  assert.deepEqual(planHd(4000), { largeur: LARGEUR_HD_MAX }, "1600 px au plus");
  assert.equal(LARGEUR_HD_MIN, 1080); assert.equal(MAX_OCTETS_HD, 220 * 1024);
  assert.equal(urlHd("https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/X.jpg/640px-X.jpg", 1600), "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/X.jpg/1600px-X.jpg");
  assert.equal(urlHd("https://thumb.test/X.jpg", 1600), null, "motif inconnu : pas de HD");
  assert.equal(urlHd(null, 1600), null);
  const vus = [];
  const ctx = { telecharger: async (u) => { vus.push(u); return { ok: true, status: 200, arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer }; }, redimensionnerHd: async (o, l) => Buffer.concat([o, Buffer.from([l % 256])]) };
  const meilleur = { largeur: 2592, vignette: "https://x.test/thumb/a/ab/F.jpg/640px-F.jpg" };
  const hd = await produireHd(meilleur, ctx);
  assert.deepEqual(vus, ["https://x.test/thumb/a/ab/F.jpg/1600px-F.jpg"]);
  assert.equal(hd.largeur, 1600); assert.ok(hd.octets.length > 3);
  assert.equal(await produireHd({ ...meilleur, largeur: 900 }, ctx), null, "source étroite : null, aucun téléchargement");
  assert.equal(vus.length, 1);
  await assert.rejects(produireHd(meilleur, { ...ctx, telecharger: async () => ({ ok: false, status: 429 }) }), (e) => e.transitoire === true, "429 HD : transitoire");
  // résolution complète : la HD est jointe à la photo carrée, un échec HD ne fait pas perdre la vignette
  const catPages = [page("Palais_Bourbon_facade.jpg", { l: 2400, h: 1600 })];
  catPages[0].imageinfo[0].thumburl = "https://x.test/thumb/a/ab/Palais_Bourbon_facade.jpg/640px-Palais_Bourbon_facade.jpg";
  const base = { aujourdhui: "2026-10-06", maintenant: MAINTENANT, redimensionner: async (o) => o, redimensionnerHd: async (o) => o, telecharger: async () => ({ ok: true, status: 200, arrayBuffer: async () => Uint8Array.from([9, 9]).buffer }), api: async (u) => (/categorymembers/.test(u) && /gcmtitle=Category%3APalais%20Bourbon&/.test(u) ? { query: { pages: Object.fromEntries(catPages.map((p, i) => [i, p])) } } : { query: { pages: {} } }) };
  const r = await resoudreCle("assemblee", base);
  assert.equal(r.statut, "photo");
  assert.ok(r.octetsHd?.length, "HD produite");
  assert.equal(r.entree.largeur_hd, 1600); assert.equal(r.entree.octets_hd, r.octetsHd.length);
  assert.equal(r.entree.licence, "CC BY-SA 4.0", "même crédit");
  const r2 = await resoudreCle("assemblee", { ...base, redimensionnerHd: async () => { throw new Error("ffmpeg HS"); } });
  assert.equal(r2.statut, "photo", "échec HD : la vignette carrée reste"); assert.ok(!r2.octetsHd && r2.hdErreur);
  // complément d'une ancienne entrée sans HD : licence revérifiée
  const hd2 = await completerHd({ fichier: "Palais_Bourbon_facade.jpg" }, { ...base, api: async () => ({ query: { pages: { 1: catPages[0] } } }) });
  assert.equal(hd2.largeur, 1600);
  const nc = [page("Palais_Bourbon_facade.jpg", { licence: "CC BY-NC 4.0", l: 2400, h: 1600 })];
  assert.equal(await completerHd({ fichier: "Palais_Bourbon_facade.jpg" }, { ...base, api: async () => ({ query: { pages: { 1: nc[0] } } }) }), null, "licence devenue non libre : pas de HD");
  assert.equal(hdAFaire({ chemin: "a" }, "2026-10-06"), true);
  assert.equal(hdAFaire({ chemin_hd: "a-hd.jpg" }, "2026-10-06"), false);
  assert.equal(hdAFaire({ hd_indisponible: true }, "2026-10-06"), false);
  assert.equal(hdAFaire({ hd_essai: "2026-10-06" }, "2026-10-06"), false, "une fois par jour");
  assert.equal(hdAFaire({ hd_essai: "2026-10-05" }, "2026-10-06"), true);
}
// --- check-vignettes : anciennes entrées sans HD valides ; HD contrôlée si présente ---
{
  const d = mkdtempSync(path.join(tmpdir(), "vig-hd-"));
  mkdirSync(path.join(d, "photos"));
  const v = { lieu: "L", alt: "a", licence: "CC BY 4.0", auteur: "A", source: "https://commons.wikimedia.org/wiki/File:X.jpg" };
  const fichier = path.join(d, "v.json");
  const ecrire = (e) => writeFileSync(fichier, JSON.stringify({ vignettes: { assemblee: e } }));
  writeFileSync(path.join(d, "photos", "assemblee.jpg"), Buffer.alloc(1000));
  ecrire({ ...v, chemin: "photos/vignettes/assemblee.jpg" });
  assert.deepEqual((await verifierVignettes(path.join(d, "photos"), fichier)).erreurs, [], "ancienne entrée sans chemin_hd");
  writeFileSync(path.join(d, "photos", "assemblee-hd.jpg"), Buffer.alloc(100 * 1024));
  assert.ok((await verifierVignettes(path.join(d, "photos"), fichier)).erreurs.some((e) => /chemin_hd/.test(e)), "fichier HD sans chemin_hd");
  ecrire({ ...v, chemin: "photos/vignettes/assemblee.jpg", chemin_hd: "photos/vignettes/assemblee-hd.jpg" });
  const ok = await verifierVignettes(path.join(d, "photos"), fichier);
  assert.deepEqual(ok.erreurs, [], "HD déclarée et présente"); assert.equal(ok.avec, 1, "la HD ne compte pas comme un thème");
  writeFileSync(path.join(d, "photos", "assemblee-hd.jpg"), Buffer.alloc(400 * 1024));
  assert.ok((await verifierVignettes(path.join(d, "photos"), fichier)).erreurs.some((e) => /trop lourde/.test(e)), "HD trop lourde");
  writeFileSync(path.join(d, "photos", "assemblee-hd.jpg"), Buffer.alloc(100 * 1024));
  ecrire({ ...v, chemin: "photos/vignettes/assemblee.jpg", chemin_hd: "photos/vignettes/autre-hd.jpg" });
  assert.ok((await verifierVignettes(path.join(d, "photos"), fichier)).erreurs.length >= 1, "chemin_hd incohérent");
  unlinkSync(path.join(d, "photos", "assemblee-hd.jpg"));
  ecrire({ ...v, chemin: "photos/vignettes/assemblee.jpg", chemin_hd: "photos/vignettes/assemblee-hd.jpg" });
  assert.ok((await verifierVignettes(path.join(d, "photos"), fichier)).erreurs.some((e) => /fichier absent/.test(e)), "chemin_hd sans fichier");
}

console.log("vignettes : tous les essais passent");
