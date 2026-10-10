// Tests des vignettes d'institutions (scripts/fetch-vignettes.js, scripts/vignettes-cle.js) avec des fixtures : aucun accès réseau.
// USAGE : node tests/vignettes.test.mjs
import assert from "assert";
import { spawnSync } from "child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import vm from "vm";
import { readFileSync as lireFichier } from "fs";
import { fileURLToPath } from "url";
import { choisirVariantes, tropProches, variantesAFaire, rangLibre, planHd, urlHd, produireHd, completerHd, hdAFaire, LARGEUR_HD_MIN, LARGEUR_HD_MAX, MAX_OCTETS_HD, evaluerFichier, choisirMeilleur, filtrerNom, resoudreCle, doitRetenter, ligneRapport, redimensionner, CANDIDATS, MAX_OCTETS, COTE } from "../scripts/fetch-vignettes.js";
import { verifierVignettes } from "../scripts/check-vignettes.js";
import { cleVignette, CLES, NB_VARIANTES, MIN_VARIANTES, variantesDe, composerEntree, nomFichierVariante, lireNomFichier } from "../scripts/vignettes-cle.js";
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
  assert.equal(planHd(1279), null, "source trop étroite : pas de HD");
  assert.equal(planHd(undefined), null);
  assert.deepEqual(planHd(1280), { largeur: 1280 }, "jamais d'agrandissement");
  assert.deepEqual(planHd(4000), { largeur: LARGEUR_HD_MAX }, "largeur standard de miniature Commons (hors liste : HTTP 400)");
  assert.equal(LARGEUR_HD_MAX, 1280); assert.equal(LARGEUR_HD_MIN, 1280); assert.equal(MAX_OCTETS_HD, 220 * 1024);
  assert.equal(urlHd("https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/X.jpg/640px-X.jpg", 1280), "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/X.jpg/1280px-X.jpg");
  assert.equal(urlHd("https://thumb.test/X.jpg", 1280), null, "motif inconnu : pas de HD");
  assert.equal(urlHd(null, 1280), null);
  const vus = [];
  const ctx = { telecharger: async (u) => { vus.push(u); return { ok: true, status: 200, arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer }; }, redimensionnerHd: async (o, l) => Buffer.concat([o, Buffer.from([l % 256])]) };
  const meilleur = { largeur: 2592, vignette: "https://x.test/thumb/a/ab/F.jpg/640px-F.jpg" };
  const hd = await produireHd(meilleur, ctx);
  assert.deepEqual(vus, ["https://x.test/thumb/a/ab/F.jpg/1280px-F.jpg"]);
  assert.equal(hd.largeur, 1280); assert.ok(hd.octets.length > 3);
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
  assert.equal(r.entree.largeur_hd, 1280); assert.equal(r.entree.octets_hd, r.octetsHd.length);
  assert.equal(r.entree.licence, "CC BY-SA 4.0", "même crédit");
  const r2 = await resoudreCle("assemblee", { ...base, redimensionnerHd: async () => { throw new Error("ffmpeg HS"); } });
  assert.equal(r2.statut, "photo", "échec HD : la vignette carrée reste"); assert.ok(!r2.octetsHd && r2.hdErreur);
  // complément d'une ancienne entrée sans HD : licence revérifiée
  const hd2 = await completerHd({ fichier: "Palais_Bourbon_facade.jpg" }, { ...base, api: async () => ({ query: { pages: { 1: catPages[0] } } }) });
  assert.equal(hd2.largeur, 1280);
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

// ===================== Plusieurs photos par institution (variantes) =====================
{ // format : première photo à plat (compatible), `variantes` = liste complète
  const v1 = { chemin: "photos/vignettes/senat.jpg", lieu: "Palais du Luxembourg", alt: "Photo d'illustration : X", fichier: "A.jpg", licence: "CC BY 4.0", auteur: "A", source: "https://commons.wikimedia.org/wiki/File:A.jpg" };
  const v2 = { chemin: "photos/vignettes/senat-2.jpg", fichier: "B.jpg", licence: "CC0", auteur: "B", source: "https://commons.wikimedia.org/wiki/File:B.jpg" };
  assert.deepEqual(variantesDe(v1), [v1], "format d'origine : l'entrée est sa propre unique variante");
  assert.deepEqual(variantesDe(undefined), []); assert.deepEqual(variantesDe({}), []);
  const entree = composerEntree([v1, { ...v2, lieu: v1.lieu, alt: v1.alt }]);
  assert.equal(entree.chemin, v1.chemin, "première photo à plat"); assert.equal(entree.variantes.length, 2);
  const vs = variantesDe(entree);
  assert.equal(vs.length, 2); assert.equal(vs[1].chemin, "photos/vignettes/senat-2.jpg");
  assert.equal(vs[1].alt, v1.alt, "lieu et texte alternatif hérités"); assert.equal(vs[1].licence, "CC0");
  assert.equal(composerEntree([v1]).variantes, undefined, "une seule photo : pas de champ variantes");
  assert.deepEqual(composerEntree([]), null);
  // les champs à plat font foi pour la première (HD complétée à plat, ancienne copie dans variantes)
  assert.equal(variantesDe({ ...entree, chemin_hd: "photos/vignettes/senat-hd.jpg" })[0].chemin_hd, "photos/vignettes/senat-hd.jpg");
  // variantes sans la première : elle est ajoutée en tête
  assert.deepEqual(variantesDe({ ...v1, variantes: [v2] }).map((v) => v.chemin), [v1.chemin, v2.chemin]);
  assert.equal(variantesDe({ ...v1, variantes: [null, { fichier: "sans chemin" }] }).length, 1);
  assert.deepEqual([1, 2, 3].map((k) => nomFichierVariante("senat", k)), ["senat.jpg", "senat-2.jpg", "senat-3.jpg"]);
  assert.equal(nomFichierVariante("senat", 3, true), "senat-3-hd.jpg");
  assert.deepEqual(lireNomFichier("senat-3-hd.jpg"), { cle: "senat", rang: 3, hd: true });
  assert.deepEqual(lireNomFichier("elysee.jpg"), { cle: "elysee", rang: 1, hd: false });
  assert.equal(lireNomFichier("?"), null);
  assert.equal(rangLibre("senat", [{ chemin: "photos/vignettes/senat.jpg" }]), 2);
  assert.equal(rangLibre("senat", [{ chemin: "photos/vignettes/senat.jpg" }, { chemin: "photos/vignettes/senat-2.jpg" }, { chemin: "photos/vignettes/senat-4.jpg" }]), 3, "premier rang libre");
  assert.ok(NB_VARIANTES >= 4 && MIN_VARIANTES >= 3 && MIN_VARIANTES <= NB_VARIANTES);
}
{ // distinctes : pas le même fichier, ni le même auteur le même jour, ni la même série de noms du même auteur
  const f = (fichier, auteur, date, note = 50) => ({ fichier, auteur, date, note });
  assert.equal(tropProches(f("A.jpg", "X", "2024-01-01"), f("A.jpg", "Y", "2020-01-01")), true, "même fichier");
  assert.equal(tropProches(f("A.jpg", "X", "2024-01-01"), f("B.jpg", "X", "2024-01-01")), true, "même auteur, même jour");
  assert.equal(tropProches(f("Palais 1.jpg", "X", "2024-01-01"), f("Palais 2.jpg", "X", "2025-02-02")), true, "même série de noms, même auteur");
  assert.equal(tropProches(f("Palais 1.jpg", "X", "2024-01-01"), f("Palais 2.jpg", "Y", "2024-01-01")), false, "auteurs différents");
  assert.equal(tropProches(f("A.jpg", "Auteur inconnu", "2024-01-01"), f("B.jpg", "Auteur inconnu", "2024-01-01")), false, "auteur inconnu : pas de rapprochement");
  const pris = choisirVariantes([f("A.jpg", "X", "2024-01-01", 90), f("B.jpg", "X", "2024-01-01", 80), f("C.jpg", "Y", "2023-01-01", 70), f("D.jpg", "Z", "2022-01-01", 60), f("E.jpg", "W", "2021-01-01", 50), f("F.jpg", "V", "2020-01-01", 40)]);
  assert.deepEqual(pris.map((x) => x.fichier), ["A.jpg", "C.jpg", "D.jpg", "E.jpg"], "4 au plus, la meilleure note d'abord, B écartée (même auteur, même jour)");
  assert.deepEqual(choisirVariantes([f("A.jpg", "X", "2024-01-01")], [f("A.jpg", "Q", "1999-01-01")]), [], "déjà en place");
  assert.equal(choisirVariantes([f("A.jpg", "X", "d1"), f("B.jpg", "Y", "d2")], [], 1).length, 1);
}
{ // resoudreCle : plusieurs photos libres distinctes pour une même clé
  const lot = [
    page("Palais_Bourbon_facade_1.jpg", { date: "2025-06-01", l: 3000, h: 2250, extra: { Artist: { value: "Alice" } } }),
    page("Palais_Bourbon_facade_nuit.jpg", { date: "2024-03-01", l: 2800, h: 2000, extra: { Artist: { value: "Bob" } } }),
    page("Palais_Bourbon_vue_2023.jpg", { date: "2023-03-01", l: 2800, h: 2000, extra: { Artist: { value: "Carole" } } }),
    page("Palais_Bourbon_facade_doublon.jpg", { date: "2025-06-01", l: 3000, h: 2250, extra: { Artist: { value: "Alice" } } }), // même auteur, même jour que la 1re
    page("Palais_Bourbon_exterieur_2022.jpg", { date: "2022-03-01", l: 2800, h: 2000, extra: { Artist: { value: "Denis" } } }),
    page("Insigne_Assemblee_Palais_Bourbon_2025.jpg", { date: "2025-01-01", l: 2800, h: 2000, extra: { Artist: { value: "Eve" } } }), // objet, pas un bâtiment
    page("Palais_Bourbon_NC.jpg", { licence: "CC BY-NC 4.0", date: "2025-06-01", extra: { Artist: { value: "Fred" } } }),
    page("Assemblee_photo_quelconque.jpg", { date: "2025-06-01", l: 3000, h: 2250, extra: { Artist: { value: "Gilles" } } }), // nom sans mot de bâtiment : refusée comme variante
  ];
  const appels = [];
  const r = await resoudreCle("assemblee", ctxDe({ appels, categories: { "Category:Palais Bourbon": lot } }), { nombre: NB_VARIANTES });
  assert.equal(r.statut, "photo");
  assert.equal(r.variantes.length, 4, "4 variantes");
  assert.equal(r.entree.fichier, r.variantes[0].entree.fichier, "la première variante garde la forme historique");
  const noms = r.variantes.map((v) => v.entree.fichier);
  assert.equal(new Set(noms).size, 4, "distinctes");
  assert.ok(!noms.includes("Palais_Bourbon_NC.jpg") && !noms.includes("Palais_Bourbon_facade_doublon.jpg") && !noms.some((n) => /Insigne/.test(n)), noms.join(","));
  for (const v of r.variantes) { assert.ok(v.entree.licence && v.entree.auteur && /^https:\/\/commons/.test(v.entree.source), "crédit complet par variante"); assert.match(v.entree.alt, /^Photo d'illustration : Palais Bourbon/); }
  assert.equal(appels.length, 1, "une seule catégorie suffit");
  // photos déjà en place : jamais reprises, les nouvelles leur sont distinctes
  const deja = [{ fichier: "Palais_Bourbon_facade_1.jpg", auteur: "Alice", date: "2025-06-01" }];
  const r2 = await resoudreCle("assemblee", ctxDe({ categories: { "Category:Palais Bourbon": lot } }), { nombre: NB_VARIANTES - 1, existantes: deja });
  assert.equal(r2.variantes.length, 3);
  assert.ok(!r2.variantes.some((v) => v.entree.fichier === "Palais_Bourbon_facade_1.jpg" || v.entree.fichier === "Palais_Bourbon_facade_doublon.jpg"));
  // pas assez de photos dans le premier candidat : on passe au suivant
  const r3 = await resoudreCle("assemblee", ctxDe({ categories: { "Category:Palais Bourbon": lot.slice(0, 2), "Category:Facade of the Palais Bourbon": [page("Facade_Bourbon_autre.jpg", { extra: { Artist: { value: "Hugo" } } }), lot[2]] } }), { nombre: 4 });
  assert.equal(r3.variantes.length, 4);
  assert.equal(r3.variantes[3].entree.candidat === "Category:Facade of the Palais Bourbon" || r3.variantes[2].entree.candidat === "Category:Facade of the Palais Bourbon", true);
  // une seule photo libre existe : succès partiel (la clé reste complétable plus tard)
  const r4 = await resoudreCle("assemblee", ctxDe({ categories: { "Category:Palais Bourbon": lot.slice(0, 1) } }), { nombre: 4 });
  assert.equal(r4.statut, "photo"); assert.equal(r4.variantes.length, 1);
  // 429 pendant la recherche : ce qui est acquis est gardé, marqué transitoire
  const e429 = new Error("HTTP 429"); e429.transitoire = true;
  const r5 = await resoudreCle("assemblee", ctxDe({ categories: { "Category:Palais Bourbon": lot.slice(0, 2), "Category:Facade of the Palais Bourbon": e429 } }), { nombre: 4 });
  assert.equal(r5.statut, "photo"); assert.equal(r5.transitoire, true); assert.equal(r5.variantes.length, 2);
  // aucune photo supplémentaire (tout déjà en place) : échec non transitoire
  const r6 = await resoudreCle("assemblee", ctxDe({ categories: { "Category:Palais Bourbon": lot.slice(0, 1) } }), { nombre: 3, existantes: [{ fichier: "Palais_Bourbon_facade_1.jpg" }] });
  assert.equal(r6.statut, "echec"); assert.equal(r6.transitoire, false);
  // nombre = 1 (défaut) : comportement d'origine
  assert.equal((await resoudreCle("assemblee", ctxDe({ categories: { "Category:Palais Bourbon": lot } }))).variantes.length, 1);
  // objets, insignes, sculptures : jamais retenus comme photo d'institution
  for (const n of ["Sculpture_Laurent_Perbos_Assemblee_nationale.jpg", "Insigne_Palais_Bourbon.jpg", "Drapeau_Assemblee_nationale.jpg", "Blason_Palais_Bourbon.jpg"]) assert.equal(evaluerFichier(page(n), opt).retenu, false, n);
  assert.equal(evaluerFichier(page("Palais_Bourbon_facade.jpg"), opt).bonNom, true);
}
// Rapport et reprises des variantes
assert.match(ligneRapport({ vignettes: { assemblee: composerEntree([{ chemin: "a.jpg" }, { chemin: "a-2.jpg" }]), senat: { chemin: "s.jpg" } } }), /3 photo\(s\) au total/);
assert.equal(variantesAFaire(1, undefined, "2026-10-10"), true);
assert.equal(variantesAFaire(1, "2026-10-10", "2026-10-10"), false, "une tentative par jour");
assert.equal(variantesAFaire(1, "2026-10-09", "2026-10-10"), true);
assert.equal(variantesAFaire(NB_VARIANTES, undefined, "2026-10-10"), false, "complet");
assert.equal(variantesAFaire(0, undefined, "2026-10-10"), false, "pas de photo : c'est le chemin normal de première recherche");

// check-vignettes avec variantes : crédit exigé pour chaque photo, cohérence des fichiers
{
  const d = mkdtempSync(path.join(tmpdir(), "vig-var-"));
  mkdirSync(path.join(d, "photos"));
  const ph = (n) => writeFileSync(path.join(d, "photos", n), Buffer.alloc(1000));
  const v = (cle, rang, extra = {}) => ({ chemin: `photos/vignettes/${nomFichierVariante(cle, rang)}`, lieu: "L", alt: "a", fichier: `F${rang}.jpg`, licence: "CC BY 4.0", auteur: "A", source: "https://commons.wikimedia.org/wiki/File:X.jpg", ...extra });
  const fichier = path.join(d, "v.json");
  const ecrire = (e) => writeFileSync(fichier, JSON.stringify({ vignettes: { assemblee: e } }));
  const verif = () => verifierVignettes(path.join(d, "photos"), fichier);
  ph("assemblee.jpg"); ph("assemblee-2.jpg"); ph("assemblee-3.jpg");
  ecrire(composerEntree([v("assemblee", 1), v("assemblee", 2), v("assemblee", 3)]));
  let r = await verif();
  assert.deepEqual(r.erreurs, [], "trois variantes créditées"); assert.equal(r.avec, 1); assert.equal(r.photos, 3);
  assert.ok(r.avertissements.some((a) => /moins de/.test(a)) === (3 < MIN_VARIANTES), "avertissement si moins de MIN_VARIANTES photos");
  ecrire(composerEntree([v("assemblee", 1), v("assemblee", 2, { licence: "CC BY-NC 4.0" }), v("assemblee", 3)]));
  assert.ok((await verif()).erreurs.some((e) => /assemblee-2\.jpg : licence non libre/.test(e)), "licence d'une variante contrôlée");
  ecrire(composerEntree([v("assemblee", 1), v("assemblee", 2, { auteur: "" }), v("assemblee", 3)]));
  assert.ok((await verif()).erreurs.some((e) => /assemblee-2\.jpg : auteur manquant/.test(e)));
  ecrire(composerEntree([v("assemblee", 1), v("assemblee", 2)]));
  assert.ok((await verif()).erreurs.some((e) => /assemblee-3\.jpg : aucune variante correspondante/.test(e)), "fichier sans variante crédité");
  ecrire(composerEntree([v("assemblee", 1), v("assemblee", 2), v("assemblee", 3), v("assemblee", 4)]));
  assert.ok((await verif()).erreurs.some((e) => /variante 4 de « assemblee » annonce .*assemblee-4\.jpg, fichier absent/.test(e)), "variante annoncée mais fichier absent");
  ecrire(composerEntree([v("assemblee", 1), v("assemblee", 2), v("assemblee", 3, { fichier: "F2.jpg" })]));
  assert.ok((await verif()).erreurs.some((e) => /deux fois la même photo/.test(e)), "doublon");
  // HD d'une variante
  ecrire(composerEntree([v("assemblee", 1), v("assemblee", 2, { chemin_hd: "photos/vignettes/assemblee-2-hd.jpg" }), v("assemblee", 3)]));
  writeFileSync(path.join(d, "photos", "assemblee-2-hd.jpg"), Buffer.alloc(50 * 1024));
  assert.deepEqual((await verif()).erreurs, [], "HD de variante déclarée et présente");
  ecrire(composerEntree([v("assemblee", 1), v("assemblee", 2), v("assemblee", 3)]));
  assert.ok((await verif()).erreurs.some((e) => /assemblee-2-hd\.jpg : « assemblee » n'a pas de chemin_hd/.test(e)), "HD sans chemin_hd");
  // état d'origine (une seule photo, aucune variantes) : valide
  ecrire(v("assemblee", 1)); unlinkSync(path.join(d, "photos", "assemblee-2.jpg")); unlinkSync(path.join(d, "photos", "assemblee-3.jpg")); unlinkSync(path.join(d, "photos", "assemblee-2-hd.jpg"));
  assert.deepEqual((await verif()).erreurs, [], "format d'origine");
}

// --- index.html : choix d'une variante par sujet (code réel de visuelActu extrait de la page, exécuté dans un bac à sable) ---
{
  const html = lireFichier(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "index.html"), "utf-8");
  const debut = html.indexOf("const VIGNETTES_VUES"), fin = html.indexOf("const pastilleVideo");
  assert.ok(debut > 0 && fin > debut, "bloc visuelActu trouvé");
  const bac = (vignettes) => {
    const ctx = vm.createContext({ VIGNETTES: vignettes, esc: (x) => String(x ?? "").replace(/"/g, "&quot;"), couleurPartiActu: () => "#000", texteSurCouleur: () => "#fff", initialesActu: () => "X" });
    vm.runInContext(html.slice(debut, fin) + "\nthis.visuelActu = visuelActu; this.VUES = VIGNETTES_VUES;", ctx);
    return ctx;
  };
  const photo = (cle, rang) => ({ chemin: `photos/vignettes/${nomFichierVariante(cle, rang)}`, lieu: cle, alt: `Photo d'illustration : ${cle} ${rang}`, auteur: `Auteur ${rang}`, licence: "CC BY 4.0", source: "https://commons.wikimedia.org/wiki/File:X.jpg" });
  const entree = (cle, n) => composerEntree(Array.from({ length: n }, (_, i) => photo(cle, i + 1)));
  const sujet = (i, vignette = "assemblee") => ({ illustration: { vignette }, articles: [{ url: `https://exemple.test/article-${i}` }], derniere: "2026-10-10" });
  const src = (h) => h.match(/src="([^"]+)"/)?.[1] || null;
  // plusieurs variantes : jamais deux fois la même photo dans une liste, tant qu'il en reste
  let b = bac({ assemblee: entree("assemblee", 4) });
  const premiers = [0, 1, 2, 3].map((i) => src(b.visuelActu(sujet(i))));
  assert.equal(new Set(premiers).size, 4, "4 sujets d'une même clé : 4 photos différentes : " + premiers.join(","));
  assert.ok(premiers.every((x) => /^photos\/vignettes\/assemblee(-\d)?\.jpg$/.test(x)));
  assert.equal(b.visuelActu(sujet(4)), "", "toutes les variantes ont servi (et pas de voisine avec photo) : sans photo");
  // déterministe : même sujet, même photo, d'un affichage à l'autre
  const b2 = bac({ assemblee: entree("assemblee", 4) });
  assert.equal(src(b2.visuelActu(sujet(2))), src(bac({ assemblee: entree("assemblee", 4) }).visuelActu(sujet(2))));
  b2.VUES.clear();
  assert.equal(src(b2.visuelActu(sujet(2))), src(bac({ assemblee: entree("assemblee", 4) }).visuelActu(sujet(2))), "remise à zéro de la liste : même choix");
  // des sujets différents ne démarrent pas tous sur la même variante
  const departs = new Set(Array.from({ length: 12 }, (_, i) => src(bac({ assemblee: entree("assemblee", 4) }).visuelActu(sujet(i)))));
  assert.ok(departs.size >= 3, "le hash répartit les sujets : " + [...departs].join(","));
  // crédit propre à la variante (alt et survol)
  const h = bac({ assemblee: entree("assemblee", 3) }).visuelActu(sujet(7));
  const rang = Number(src(h).match(/-(\d)\.jpg$/)?.[1] || 1);
  assert.ok(h.includes(`alt="Photo d'illustration : assemblee ${rang}"`) && h.includes(`Auteur ${rang}, CC BY 4.0, Wikimedia Commons`), h);
  // une seule variante (état actuel, format d'origine) : le 2e sujet prend une photo voisine, le 3e rien (comportement d'avant)
  b = bac({ assemblee: photo("assemblee", 1), election: photo("election", 1), senat: photo("senat", 1) });
  assert.equal(src(b.visuelActu(sujet(0))), "photos/vignettes/assemblee.jpg");
  const voisine = src(b.visuelActu(sujet(1)));
  assert.ok(["photos/vignettes/election.jpg", "photos/vignettes/senat.jpg"].includes(voisine), "voisine : " + voisine);
  assert.ok(src(b.visuelActu(sujet(2))), "la dernière voisine");
  assert.equal(b.visuelActu(sujet(3)), "", "plus aucune photo disponible");
  // les variantes de la clé passent avant les voisines
  b = bac({ assemblee: entree("assemblee", 2), election: photo("election", 1) });
  const deux = [0, 1].map((i) => src(b.visuelActu(sujet(i))));
  assert.ok(deux.every((x) => /assemblee/.test(x)), "la clé d'abord : " + deux);
  assert.match(src(b.visuelActu(sujet(2))), /election/, "puis la voisine");
  // thème sans photo : jamais l'image d'une autre institution ; clé nulle (justice avec personne) : rien
  b = bac({ assemblee: photo("assemblee", 1) });
  assert.equal(b.visuelActu(sujet(0, "senat")), "");
  assert.equal(b.visuelActu(sujet(0, null)), "");
  // personnes et logos de partis priment toujours (inchangé)
  assert.match(bac({}).visuelActu({ illustration: { partis: ["RN"] }, articles: [] }), /actu-logo/);
}

// --- le workflow GitHub lance bien fetch-vignettes (les nouvelles photos n'arrivent que par lui) et publie photos/vignettes ---
{
  const wf = lireFichier(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".github", "workflows", "update-data.yml"), "utf-8");
  assert.match(wf, /node scripts\/fetch-vignettes\.js/, "étape fetch-vignettes dans update-data.yml");
  assert.match(wf, /commit-push\.sh[^\n]*photos\/vignettes/, "photos/vignettes commitées");
}

console.log("vignettes : tous les essais passent");
