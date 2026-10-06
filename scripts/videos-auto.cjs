#!/usr/bin/env node
/**
 * videos-auto.cjs
 * ---------------
 * Anime NOS PROPRES visuels (stories et posts de la file Instagram, dessinés par le site : js/stories*.js, STORY_DA) en courtes
 * vidéos MP4, avec ffmpeg seul : aucune ressource externe, aucune vidéo, extrait, musique ou son d'un média tiers. Rien n'est republié du contenu d'autrui.
 *
 * Animation (sobre) : fondu d'entrée puis apparition progressive des blocs de l'image (logo, titre, chiffres, sources…, découpés aux
 * interlignes vides), zoom lent de type Ken Burns, et, pour un POST, une barre qui se remplit (vote adopté ou rejeté : part des voix pour et contre)
 * ou un compteur (date à venir : nombre de jours), dessinés dans la zone libre du post.
 *
 * Contraintes Instagram respectées : MP4, H.264 (yuv420p), AAC mono SILENCIEUX (aucun son), 1080 × 1920, 30 images/s,
 * story ≤ 15 s (ici 9 s), Reel de 5 à 20 s (ici 10 s), 25 Mo au plus (en pratique moins de 2 Mo : aplats de couleur).
 *
 * Sans ffmpeg (poste local) : trouverFfmpeg() renvoie null et l'appelant garde l'image seule ; en CI : sudo apt-get install -y ffmpeg.
 * Variables facultatives : FFMPEG_PATH, FFPROBE_PATH, VIDEO_POLICE (fichier .ttf du compteur).
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const FOND_DEFAUT = [0x1b, 0x3a, 0x8c]; // STORY_DA.fond
const FPS = 30;
const LARGEUR = 1080, HAUTEUR = 1920;
const DUREE = { story: 9, reel: 10 };
const LIMITES = { story: { min: 1, max: 15 }, reel: { min: 5, max: 20 } };
const MAX_OCTETS = 25 * 1024 * 1024;
const POLICES = [
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
  "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf", "/Library/Fonts/Arial Bold.ttf", "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
];

/** { ffmpeg, ffprobe } si les deux programmes répondent, sinon null (la vidéo est alors simplement omise). */
function trouverFfmpeg() {
  const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg", ffprobe = process.env.FFPROBE_PATH || "ffprobe";
  const ok = (b) => { try { return spawnSync(b, ["-version"], { encoding: "utf-8", timeout: 15000 }).status === 0; } catch (e) { return false; } };
  return ok(ffmpeg) && ok(ffprobe) ? { ffmpeg, ffprobe } : null;
}

const police = () => [process.env.VIDEO_POLICE, ...POLICES].filter(Boolean).find((f) => { try { return fs.statSync(f).isFile(); } catch (e) { return false; } }) || null;

/** Lit l'image (via ffmpeg) : { l, h, fond: [r, g, b], vides: Uint8Array } ; vides[y] = 1 si la ligne est unie (aucun texte ni dessin). */
function lireLignes(image, bin) {
  const sonde = spawnSync(bin.ffprobe, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", image], { encoding: "utf-8", timeout: 30000 });
  const flux = JSON.parse(sonde.stdout || "{}").streams?.[0];
  if (!flux?.width || !flux?.height) throw new Error("image illisible par ffprobe");
  const { width: l, height: h } = flux;
  const r = spawnSync(bin.ffmpeg, ["-v", "error", "-i", image, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: l * h * 3 + 1024, timeout: 60000 });
  if (r.status !== 0 || r.stdout.length < l * h * 3) throw new Error("décodage de l'image impossible");
  const px = r.stdout, vides = new Uint8Array(h);
  for (let y = 0; y < h; y++) {
    const o = y * l * 3;
    let uni = 1;
    for (let x = 1; x < l && uni; x++) {
      const i = o + x * 3;
      if (Math.abs(px[i] - px[o]) > 14 || Math.abs(px[i + 1] - px[o + 1]) > 14 || Math.abs(px[i + 2] - px[o + 2]) > 14) uni = 0;
    }
    vides[y] = uni;
  }
  return { l, h, fond: [px[0], px[1], px[2]], vides };
}

/**
 * Lacunes (suites de lignes unies) STRICTEMENT à l'intérieur du contenu : [{ debut, fin, taille }], de la plus grande à la plus petite.
 * Pure : testable sans ffmpeg. Le vide avant la première ligne de contenu et après la dernière n'est pas une lacune.
 */
function lacunes(vides, tailleMin = 10) {
  const n = vides.length;
  let premier = 0; while (premier < n && vides[premier]) premier++;
  let dernier = n - 1; while (dernier >= 0 && vides[dernier]) dernier--;
  const sortie = [];
  for (let y = premier; y <= dernier; y++) {
    if (!vides[y]) continue;
    let f = y; while (f + 1 <= dernier && vides[f + 1]) f++;
    if (f - y + 1 >= tailleMin) sortie.push({ debut: y, fin: f, taille: f - y + 1 });
    y = f;
  }
  return sortie.sort((a, b) => b.taille - a.taille || a.debut - b.debut);
}

/** Bornes des blocs [0, c1, …, h] : coupes au milieu des `maxBlocs - 1` plus grandes lacunes. Sans lacune : un seul bloc. Pure. */
function choisirCoupes(vides, maxBlocs = 6, tailleMin = 10) {
  const coupes = lacunes(vides, tailleMin).slice(0, Math.max(0, maxBlocs - 1)).map((g) => Math.round((g.debut + g.fin + 1) / 2)).sort((a, b) => a - b);
  return [0, ...coupes, vides.length];
}

/** Plus grande lacune d'au moins `min` lignes qui commence à `apres` ou plus bas ; null sinon. Pure. */
function zoneLibre(liste, min, apres = 0) {
  return liste.filter((g) => g.taille >= min && g.debut >= apres).sort((a, b) => b.taille - a.taille)[0] || null;
}

const hex = ([r, g, b]) => "0x" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
const nb = (x) => String(Math.round(x * 1000) / 1000);
/** Progression 0 → 1 (sortie en douceur) entre les secondes t0 et t0 + dur, écrite pour une expression ffmpeg ; `esc` : virgules échappées (texte de drawtext). */
const progression = (t0, dur, esc = false) => {
  const v = esc ? "\\," : ",";
  return `(1-pow(1-min(1${v}max(0${v}(t-${nb(t0)})/${nb(dur)}))${v}3))`;
};

/**
 * Plan de l'animation : instants d'apparition des blocs et durée. Pure.
 * type : "story" (image 1080 × 1920) ou "reel" (post 1080 × 1350 centré sur 1080 × 1920) ; coupes : bornes des blocs.
 */
function planAnimation({ type, hauteurImage, coupes, duree = DUREE[type] }) {
  const decalageY = Math.round((HAUTEUR - hauteurImage) / 2);
  const debut = 0.35, pas = 0.55, fondu = 0.55;
  const blocs = [];
  for (let i = 0; i < coupes.length - 1; i++) blocs.push({ y0: coupes[i], y1: coupes[i + 1], t: Math.round((debut + i * pas) * 100) / 100 });
  const finReveal = blocs.length ? blocs[blocs.length - 1].t + fondu : debut + fondu;
  return { type, duree, decalageY, blocs, fondu, finReveal: Math.round(finReveal * 100) / 100 };
}

/**
 * Filtre ffmpeg (filter_complex) : blocs qui apparaissent (fondu + léger glissement), barre ou compteur dans la zone libre, zoom lent.
 * anim : { type: "barre", pour, contre } | { type: "compteur", valeur, avant, apres } | null ; zone : lacune { debut, fin } du post, ou null (pas de barre ni de compteur).
 * Pure : renvoie le texte du filtre (testable sans ffmpeg).
 */
function construireFiltre({ plan, largeur, fond = FOND_DEFAUT, anim = null, zone = null, fontfile = null }) {
  const { duree, decalageY, blocs, fondu } = plan;
  const n = blocs.length;
  const f = [];
  f.push(`[0:v]format=rgb24,split=${n}${blocs.map((_, i) => `[s${i}]`).join("")}`);
  blocs.forEach((b, i) => f.push(`[s${i}]crop=${largeur}:${b.y1 - b.y0}:0:${b.y0},format=yuva420p,fade=t=in:st=${nb(b.t)}:d=${nb(fondu)}:alpha=1[b${i}]`));
  f.push(`color=c=${hex(fond)}:s=${LARGEUR}x${HAUTEUR}:r=${FPS}:d=${nb(duree)},format=yuv420p[c-1]`);
  const x0 = Math.round((LARGEUR - largeur) / 2);
  blocs.forEach((b, i) => {
    const y = `${decalageY + b.y0}+34*pow(max(0\\,1-(t-${nb(b.t)})/0.7)\\,2)`; // glisse de 34 px vers sa place
    f.push(`[c${i - 1}][b${i}]overlay=x=${x0}:y='${y}':eval=frame:format=auto[c${i}]`);
  });
  let dernier = `c${n - 1}`;
  if (anim && zone) {
    const t0 = Math.round((plan.finReveal + 0.15) * 100) / 100, dur = 1.8;
    const yz = decalageY + zone.debut + Math.max(0, Math.round((zone.fin - zone.debut + 1 - 120) / 2)); // 120 px de haut pour l'animation, centrée dans la zone
    const marge = 84, lg = LARGEUR - 2 * marge;
    if (anim.type === "barre" && anim.pour + anim.contre > 0) {
      const total = anim.pour + anim.contre, wp = Math.round(lg * anim.pour / total), wc = lg - wp;
      f.push(`color=c=0xC5CEF2@0.30:s=${lg}x30:r=${FPS}:d=${nb(duree)},format=yuva420p[piste]`); // piste : bleu clair translucide
      f.push(`color=c=0xFFFFFF:s=${lg}x30:r=${FPS}:d=${nb(duree)},format=yuva420p[pour]`);
      f.push(`color=c=0xF26B8A:s=${lg}x30:r=${FPS}:d=${nb(duree)},format=yuva420p[contre]`);
      f.push(`[piste][pour]overlay=x='-${lg}+${wp}*${progression(t0, dur)}':y=0:eval=frame:format=auto[p1]`);
      f.push(`[p1][contre]overlay=x='${lg}-${wc}*${progression(t0, dur)}':y=0:eval=frame:format=auto[barre]`);
      f.push(`[${dernier}][barre]overlay=x=${marge}:y=${yz}:eval=init:format=auto[v-barre]`);
      dernier = "v-barre";
      if (fontfile) {
        const ff = fontfile.replace(/\\/g, "/").replace(/:/g, "\\:");
        const txt = (valeur, suffixe, x) => `drawtext=fontfile='${ff}':text='%{eif\\:trunc(${valeur}*${progression(t0, dur, true)})\\:d} ${suffixe}':fontsize=52:fontcolor=white:x=${x}:y=${yz + 52}`;
        f.push(`[${dernier}]${txt(anim.pour, "pour", marge)},${txt(anim.contre, "contre", `${LARGEUR - marge}-text_w`)}[v-texte]`);
        dernier = "v-texte";
      }
    } else if (anim.type === "compteur" && fontfile && anim.valeur > 0) {
      const ff = fontfile.replace(/\\/g, "/").replace(/:/g, "\\:");
      const avant = String(anim.avant || "").replace(/[\\':%]/g, ""), apres = String(anim.apres || "").replace(/[\\':%]/g, "");
      f.push(`[${dernier}]drawtext=fontfile='${ff}':text='${avant}%{eif\\:trunc(${anim.valeur}*${progression(t0, dur, true)})\\:d}${apres}':fontsize=64:fontcolor=white:x=(w-text_w)/2:y=${yz + 20}[v-texte]`);
      dernier = "v-texte";
    }
  }
  // Ken Burns : on agrandit puis on découpe avec zoompan (une image en entrée = une image en sortie), zoom de 1 à 1,07 ancré à 45 % de la hauteur
  const images = Math.round(duree * FPS);
  f.push(`[${dernier}]scale=${LARGEUR * 2}:${HAUTEUR * 2}:flags=bicubic,zoompan=z='1+0.07*min(1\\,on/${images})':x='iw/2-(iw/zoom/2)':y='ih*0.45-(ih/zoom*0.45)':d=1:s=${LARGEUR}x${HAUTEUR}:fps=${FPS},format=yuv420p[v]`);
  return f.join(";\n");
}

function lancer(bin, args, delai = 300000) {
  const r = spawnSync(bin, args, { encoding: "utf-8", timeout: delai, maxBuffer: 16 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`${path.basename(bin)} a échoué : ${String(r.stderr || r.error || "").split("\n").filter(Boolean).slice(-4).join(" | ").slice(0, 600)}`);
  return r;
}

/**
 * Vérifie une vidéo avec ffprobe : H.264 yuv420p, 1080 × 1920, 30 images/s, durée de la story ou du Reel, 25 Mo au plus, AAC mono silencieux ou sans piste audio.
 * Renvoie { ok, erreurs: [], duree, octets, largeur, hauteur, codec }.
 */
function verifierVideo(fichier, type, bin = trouverFfmpeg()) {
  const erreurs = [];
  const octets = fs.existsSync(fichier) ? fs.statSync(fichier).size : 0;
  if (!octets) return { ok: false, erreurs: ["fichier absent ou vide"], octets };
  if (octets > MAX_OCTETS) erreurs.push(`plus de 25 Mo (${octets} octets)`);
  if (!bin) return { ok: erreurs.length === 0, erreurs, octets };
  const r = spawnSync(bin.ffprobe, ["-v", "error", "-show_entries", "stream=codec_type,codec_name,pix_fmt,width,height,r_frame_rate,channels:format=duration,format_name", "-of", "json", fichier], { encoding: "utf-8", timeout: 30000 });
  let j; try { j = JSON.parse(r.stdout); } catch (e) { return { ok: false, erreurs: ["ffprobe illisible"], octets }; }
  const v = (j.streams || []).find((s) => s.codec_type === "video"), a = (j.streams || []).filter((s) => s.codec_type === "audio");
  const duree = Number(j.format?.duration);
  if (!v) erreurs.push("aucune piste vidéo");
  else {
    if (v.codec_name !== "h264") erreurs.push(`codec ${v.codec_name} (h264 attendu)`);
    if (v.pix_fmt !== "yuv420p") erreurs.push(`pix_fmt ${v.pix_fmt} (yuv420p attendu)`);
    if (v.width !== LARGEUR || v.height !== HAUTEUR) erreurs.push(`${v.width}×${v.height} (1080×1920 attendu)`);
    const [p, q] = String(v.r_frame_rate).split("/").map(Number);
    if (Math.abs(p / (q || 1) - FPS) > 0.01) erreurs.push(`${v.r_frame_rate} images/s (30 attendu)`);
  }
  for (const s of a) if (s.codec_name !== "aac" || s.channels > 2) erreurs.push(`audio ${s.codec_name} (AAC mono ou stéréo attendu)`);
  const lim = LIMITES[type] || LIMITES.story;
  if (!(duree >= lim.min && duree <= lim.max)) erreurs.push(`durée ${duree} s (${lim.min} à ${lim.max} s attendus pour ${type === "reel" ? "un Reel" : "une story"})`);
  if (!/mp4/.test(j.format?.format_name || "")) erreurs.push("conteneur non MP4");
  return { ok: erreurs.length === 0, erreurs, duree, octets, largeur: v?.width, hauteur: v?.height, codec: v?.codec_name };
}

/**
 * Génère la vidéo MP4 d'une image (story 1080 × 1920 ou post 1080 × 1350 pour un Reel).
 * opts : { image, sortie, type: "story" | "reel", anim, bin }. Renvoie { sortie, duree, octets, blocs, anime }.
 * Lève une erreur si ffmpeg échoue ou si la vidéo ne respecte pas les contraintes : l'appelant garde alors l'image seule.
 */
function genererVideo({ image, sortie, type, anim = null, bin = trouverFfmpeg() }) {
  if (!bin) throw new Error("ffmpeg absent");
  if (!["story", "reel"].includes(type)) throw new Error(`type de vidéo inconnu : ${type}`);
  const lignes = lireLignes(image, bin);
  const attendu = type === "story" ? [1080, 1920] : [1080, 1350];
  if (lignes.l !== attendu[0] || lignes.h !== attendu[1]) throw new Error(`image de ${lignes.l}×${lignes.h} (${attendu.join("×")} attendu pour ${type})`);
  const coupes = choisirCoupes(lignes.vides, 6);
  const plan = planAnimation({ type, hauteurImage: lignes.h, coupes });
  // Zone libre du post pour la barre ou le compteur : la plus grande lacune de 150 lignes au moins, dans la moitié basse
  const zone = type === "reel" && anim ? zoneLibre(lacunes(lignes.vides, 10), 150, Math.round(lignes.h * 0.45)) : null;
  const fontfile = police();
  const filtre = construireFiltre({ plan, largeur: lignes.l, fond: lignes.fond, anim, zone, fontfile });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "video-"));
  try {
    const script = path.join(tmp, "filtre.txt");
    fs.writeFileSync(script, filtre);
    fs.mkdirSync(path.dirname(sortie), { recursive: true });
    const brut = path.join(tmp, "sortie.mp4");
    for (const crf of [24, 30, 36]) { // le poids doit rester très inférieur à 25 Mo : on durcit la compression si besoin
      lancer(bin.ffmpeg, ["-y", "-v", "error", "-loop", "1", "-framerate", String(FPS), "-t", String(plan.duree), "-i", image,
        "-f", "lavfi", "-t", String(plan.duree), "-i", "anullsrc=r=44100:cl=mono",
        "-filter_complex_script", script, "-map", "[v]", "-map", "1:a",
        "-c:v", "libx264", "-preset", "medium", "-crf", String(crf), "-profile:v", "high", "-level", "4.0", "-pix_fmt", "yuv420p", "-r", String(FPS), "-g", "60",
        "-maxrate", "5M", "-bufsize", "10M", "-c:a", "aac", "-b:a", "32k", "-ac", "1", "-shortest", "-t", String(plan.duree), "-movflags", "+faststart", brut]);
      if (fs.statSync(brut).size <= 8 * 1024 * 1024) break;
    }
    fs.copyFileSync(brut, sortie);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  const verif = verifierVideo(sortie, type, bin);
  if (!verif.ok) { try { fs.unlinkSync(sortie); } catch (e) { /* déjà absent */ } throw new Error(`vidéo non conforme : ${verif.erreurs.join(" ; ")}`); }
  return { sortie, duree: verif.duree, octets: verif.octets, blocs: plan.blocs.length, anime: Boolean(anim && zone && (fontfile || anim.type === "barre")) };
}

/** Extrait une image JPEG de la vidéo (vignette, couverture du Reel) à `seconde` s. */
function extraireVignette(video, sortie, seconde = 4.5, bin = trouverFfmpeg()) {
  if (!bin) throw new Error("ffmpeg absent");
  lancer(bin.ffmpeg, ["-y", "-v", "error", "-ss", String(seconde), "-i", video, "-frames:v", "1", "-q:v", "3", sortie], 60000);
  return sortie;
}

module.exports = { trouverFfmpeg, lireLignes, lacunes, choisirCoupes, zoneLibre, planAnimation, construireFiltre, genererVideo, verifierVideo, extraireVignette, DUREE, LIMITES, MAX_OCTETS, FPS };

if (require.main === module) {
  // USAGE : node scripts/videos-auto.cjs <image.jpg> <sortie.mp4> [story|reel] [pour:contre | jours:N]
  const [image, sortie, type = "story", reglage] = process.argv.slice(2);
  if (!image || !sortie) { console.error("usage : node scripts/videos-auto.cjs <image.jpg> <sortie.mp4> [story|reel] [pour:contre | jours:N]"); process.exit(2); }
  let anim = null;
  const m = /^(\d+):(\d+)$/.exec(reglage || ""), j = /^jours:(\d+)$/.exec(reglage || "");
  if (m) anim = { type: "barre", pour: Number(m[1]), contre: Number(m[2]) };
  else if (j) anim = { type: "compteur", valeur: Number(j[1]), avant: "dans ", apres: " jours" };
  try { console.log(JSON.stringify(genererVideo({ image, sortie, type, anim }))); } catch (e) { console.error("[videos-auto]", e.message); process.exit(1); }
}
