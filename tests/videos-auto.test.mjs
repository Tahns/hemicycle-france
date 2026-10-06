// Tests de scripts/videos-auto.cjs : fonctions pures (découpe en blocs, plan, filtre) et, si ffmpeg est présent, génération réelle contrôlée par ffprobe.
// USAGE : node tests/videos-auto.test.mjs   (sans ffmpeg, seule la partie pure est exécutée)
import assert from "assert";
import { createRequire } from "module";
import { mkdtempSync, writeFileSync, existsSync, statSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
const V = createRequire(import.meta.url)("../scripts/videos-auto.cjs");

// --- Découpe en blocs : lacunes à l'intérieur du contenu seulement ---
{
  const vides = new Uint8Array(100); // 1 = ligne unie
  const plein = (a, b) => { for (let y = a; y < b; y++) vides[y] = 0; };
  vides.fill(1);
  plein(10, 20); plein(25, 40); plein(60, 70); // contenu : 10-19, 25-39, 60-69 ; lacunes : 20-24 (5), 40-59 (20), après 70 (marge)
  assert.deepStrictEqual(V.lacunes(vides, 3).map((g) => [g.debut, g.fin]), [[40, 59], [20, 24]], "marges haute et basse exclues, plus grande d'abord");
  assert.deepStrictEqual(V.choisirCoupes(vides, 6, 3), [0, 23, 50, 100]);
  assert.deepStrictEqual(V.choisirCoupes(vides, 2, 3), [0, 50, 100], "au plus maxBlocs blocs : on garde la plus grande lacune");
  assert.deepStrictEqual(V.choisirCoupes(new Uint8Array(50), 6), [0, 50], "image sans lacune : un seul bloc");
  assert.deepStrictEqual(V.zoneLibre(V.lacunes(vides, 3), 15, 30), { debut: 40, fin: 59, taille: 20 });
  assert.strictEqual(V.zoneLibre(V.lacunes(vides, 3), 30, 0), null);
}

// --- Plan et filtre ---
{
  const plan = V.planAnimation({ type: "reel", hauteurImage: 1350, coupes: [0, 300, 700, 1350] });
  assert.strictEqual(plan.duree, 10);
  assert.ok(plan.duree >= 5 && plan.duree <= 20, "Reel : 5 à 20 s");
  assert.strictEqual(V.planAnimation({ type: "story", hauteurImage: 1920, coupes: [0, 1920] }).duree <= 15, true, "story : 15 s au plus");
  assert.strictEqual(plan.decalageY, 285, "post 4:5 centré dans 1080 × 1920");
  assert.deepStrictEqual(plan.blocs.map((b) => b.t), [0.35, 0.9, 1.45], "les blocs apparaissent l'un après l'autre");
  const f = V.construireFiltre({ plan, largeur: 1080, anim: { type: "barre", pour: 276, contre: 86 }, zone: { debut: 1000, fin: 1200 }, fontfile: "/x/police.ttf" });
  assert.match(f, /zoompan/);
  assert.match(f, /fade=t=in:st=0\.35/);
  assert.match(f, /color=c=0x1b3a8c:s=1080x1920:r=30/);
  assert.match(f, /drawtext=fontfile='\/x\/police\.ttf'.*276/);
  assert.match(f, /\[v\]$/);
  const sans = V.construireFiltre({ plan, largeur: 1080, anim: { type: "barre", pour: 1, contre: 1 }, zone: null });
  assert.ok(!/drawtext|\[barre\]/.test(sans), "sans zone libre : ni barre ni compteur");
  const compteur = V.construireFiltre({ plan, largeur: 1080, anim: { type: "compteur", valeur: 25, avant: "dans ", apres: " jours" }, zone: { debut: 1000, fin: 1200 }, fontfile: "/x/p.ttf" });
  assert.match(compteur, /dans %\{eif\\:trunc\(25\*/);
}

// --- ffprobe absent d'un fichier : contrôles de base sans ffmpeg ---
{
  assert.deepStrictEqual(V.verifierVideo("/inexistant.mp4", "reel", null).ok, false);
}

// --- Génération réelle (seulement si ffmpeg et ffprobe sont installés) ---
const bin = V.trouverFfmpeg();
if (!bin) {
  console.log("[tests videos-auto] ffmpeg absent : génération non testée (partie pure OK).");
} else {
  const dossier = mkdtempSync(join(tmpdir(), "vid-"));
  try {
    // Reel d'un post de loi (barre des voix) à partir d'un visuel du dépôt
    const reel = join(dossier, "reel.mp4");
    const r = V.genererVideo({ image: "instagram/modeles/post-loi.jpg", sortie: reel, type: "reel", anim: { type: "barre", pour: 276, contre: 86 }, bin });
    const v = V.verifierVideo(reel, "reel", bin);
    assert.deepStrictEqual(v.erreurs, []);
    assert.strictEqual(v.codec, "h264");
    assert.strictEqual(v.largeur, 1080);
    assert.strictEqual(v.hauteur, 1920);
    assert.ok(v.duree >= 5 && v.duree <= 20, `durée du Reel : ${v.duree}`);
    assert.ok(v.octets > 10000 && v.octets <= 25 * 1024 * 1024, `poids : ${v.octets}`);
    assert.ok(r.blocs >= 2, "plusieurs blocs découpés");
    assert.strictEqual(r.anime, true, "barre dessinée dans la zone libre du post");
    // Vignette du Reel
    const vignette = join(dossier, "reel.jpg");
    V.extraireVignette(reel, vignette, 4.5, bin);
    const b = (await import("fs")).readFileSync(vignette);
    assert.ok(b[0] === 0xff && b[1] === 0xd8 && b.length > 5000, "vignette JPEG");
    // Story vidéo d'un dossier
    const story = join(dossier, "story.mp4");
    V.genererVideo({ image: "instagram/modeles/d-dossier.jpg", sortie: story, type: "story", bin });
    const vs = V.verifierVideo(story, "story", bin);
    assert.deepStrictEqual(vs.erreurs, []);
    assert.ok(vs.duree <= 15, `durée de la story : ${vs.duree}`);
    // Mauvaise taille d'image : refusée, aucun fichier laissé
    assert.throws(() => V.genererVideo({ image: "instagram/modeles/post-loi.jpg", sortie: join(dossier, "x.mp4"), type: "story", bin }), /attendu pour story/);
    assert.ok(!existsSync(join(dossier, "x.mp4")));
    // Un fichier qui n'est pas une vidéo est refusé par le contrôle
    const faux = join(dossier, "faux.mp4");
    writeFileSync(faux, "pas une video");
    assert.strictEqual(V.verifierVideo(faux, "reel", bin).ok, false);
    assert.ok(statSync(reel).size > 0);
    console.log(`[tests videos-auto] OK (Reel ${(v.octets / 1048576).toFixed(2)} Mo, ${v.duree.toFixed(1)} s ; story ${(vs.octets / 1048576).toFixed(2)} Mo).`);
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}
