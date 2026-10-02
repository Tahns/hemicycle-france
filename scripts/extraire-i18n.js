#!/usr/bin/env node
/**
 * extraire-i18n.js
 * ----------------
 * Extrait de index.html toutes les chaînes françaises affichées au visiteur et les écrit dans
 * data/i18n/fr.json sous la forme { clé stable : texte français }.
 *
 * Sources extraites :
 *  - les nœuds texte du HTML statique (un par morceau de texte entre deux balises) ;
 *  - les attributs placeholder, title, aria-label, alt ;
 *  - les chaînes du script de la page : guillemets, apostrophes et gabarits entre backticks
 *    (le texte situé entre deux balises ; chaque ${...} devient {1}, {2}…).
 *
 * La clé est dérivée du texte (début en minuscules sans accents + empreinte) : elle ne change
 * pas tant que le texte français ne change pas. Si le français est modifié, l'ancienne
 * traduction devient orpheline (signalée par check-data.js) et la chaîne retombe en français.
 *
 * USAGE : node scripts/extraire-i18n.js          (réécrit data/i18n/fr.json)
 *         node scripts/extraire-i18n.js --verif  (échoue si fr.json n'est plus à jour)
 */
import { readFile, writeFile, mkdir } from "fs/promises";
import { createHash } from "crypto";
import { fileURLToPath } from "url";

export const ENTITES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", laquo: "«", raquo: "»", hellip: "…", middot: "·", ndash: "–", mdash: "—", times: "×", rsquo: "’", lsquo: "‘", eacute: "é", egrave: "è", agrave: "à", ccedil: "ç", euro: "€" };
const decoder = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === "#") return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  return ENTITES[e] ?? m;
});

/** Espaces normalisés (les espaces insécables sont conservés : ils font partie de la typographie). */
export const normaliser = (s) => s.replace(/[ \t\r\n\f]+/g, " ").trim();

const ATTRIBUTS = ["placeholder", "title", "aria-label", "alt"];

/** Valeurs techniques ou noms propres qui ressemblent à du texte mais ne se traduisent pas. */
const EXCLUS = new Set(["Public Sans", "Newsreader", "Enter", "Escape", "Home", "End", "Tab", "Notification", "Content-Type", "NFD", "fr-FR", "Le Pen", "Mélenchon", "Pécresse", "Dupont-Aignan", "Instagram", "Eurostat", "Insee", "HATVP", "CNIL", "GitHub", "Wikimedia Commons", "Décodex", "Le Monde"]);

/* ---------- Filtre : est-ce un texte français destiné à l'affichage ? ---------- */
function plausible(t) {
  if (!t || t.length > 600 || EXCLUS.has(t)) return false;
  const sansMarques = t.replace(/\{\d+\}/g, " ");
  if (!/\p{L}{2,}/u.test(sansMarques)) return false;
  if (/(^|\s)(\d+|\{\d+\})px\b/.test(t) || /^[.#]|\[[\w-]+[=\]]|\bdata-[a-z-]+=|^[\w-]+="[^"]*"$|^\(.*:.*\)$|^\$\d/.test(t)) return false; // police canvas, sélecteur, attribut
  if (/^[Mm][MmLlHhVvCcSsQqTtAaZz0-9 ,.\-]+$/.test(t) || /^[A-Z0-9]{2,6}$/.test(t)) return false; // tracé SVG, code de groupe
  if (/^\S*\/\S*$/.test(t) || /^[a-z0-9]+(-[a-z0-9]+)+( [a-z0-9]+(-[a-z0-9]+)+)*$/.test(t)) return false; // chemin, liste de classes CSS
  if (/^\S*\{\d+\}\S*$/.test(t) && !/\p{L}{3,}[\s']/u.test(t.replace(/\{\d+\}/g, " ") + " ")) return false; // chemin ou identifiant à trous
  if (/^(https?:|\/|\.\/|#|data\/|\w+:\/\/)/.test(t)) return false;
  if (/[{}]\s*$|=>|;\s*$|\bfunction\b|\bconst\b|\breturn\b|&&|\|\||\\/.test(sansMarques)) return false;
  if (/^[\w.-]+\.(json|js|css|png|jpg|svg|html|xml)$/.test(t)) return false;
  if (/^[\w-]+(\s*[:>+~,]\s*[.#\w\[\]="'*-]+)+$/.test(t) && !/\s{2}/.test(t) && !/[àâéèêëîïôùûç]/i.test(t)) return false; // sélecteur CSS
  if (/^(rgba?|hsla?|var|calc|translate|scale|linear-gradient)\(/.test(t)) return false;
  if (/^[\w-]+\s*:\s*[^ ]+(;\s*[\w-]+\s*:.*)?$/.test(t) && !/[àâéèêëîïôùûç]/i.test(t) && !/ /.test(t.split(":")[1] || "")) return false; // déclaration CSS
  const mots = sansMarques.trim().split(/\s+/);
  if (mots.length === 1) {
    // Un seul mot : étiquette (« Votes »), pas un identifiant (« histoMode », « data-tab »).
    if (/^[a-z0-9_.-]+$/.test(mots[0]) && !/[àâéèêëîïôùûç]/.test(mots[0])) return false;
    if (/[a-z][A-Z]/.test(mots[0]) || /[_=/]/.test(mots[0])) return false;
    if (!/^[\p{Lu}\p{Ll}][\p{L}'’-]+[\s:.!?…]*$/u.test(mots[0])) return false;
  }
  return true;
}

/* ---------- HTML : morceaux de texte et attributs d'une chaîne HTML ---------- */
function* morceauxHtml(html, { entites = true } = {}) {
  const dec = entites ? decoder : (s) => s;
  const re = /<!--[\s\S]*?-->|<![^>]*>|<(script|style)\b[\s\S]*?<\/\1\s*>|<\/?[a-zA-Z][^>]*>|[^<]+|</g;
  let m;
  while ((m = re.exec(html))) {
    const s = m[0];
    if (s.startsWith("<!")) continue;
    if (s[0] === "<" && s.length > 1 && !/^<(script|style)/i.test(s)) {
      for (const a of ATTRIBUTS) {
        const r = new RegExp(`\\s${a}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(s);
        if (r) yield dec(r[1] ?? r[2]);
      }
    } else if (s[0] !== "<") yield dec(s);
  }
}

/* ---------- JavaScript : chaînes et gabarits ---------- */
function echapper(src, i) {
  // src[i] === "\\" ; renvoie [caractère, nouvel indice]
  const c = src[i + 1];
  const simple = { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", v: "\v", 0: "\0" };
  if (c === "u") {
    if (src[i + 2] === "{") { const f = src.indexOf("}", i); return [String.fromCodePoint(parseInt(src.slice(i + 3, f), 16)), f + 1]; }
    return [String.fromCharCode(parseInt(src.slice(i + 2, i + 6), 16)), i + 6];
  }
  if (c === "x") return [String.fromCharCode(parseInt(src.slice(i + 2, i + 4), 16)), i + 4];
  if (c === "\n") return ["", i + 2];
  return [simple[c] ?? c, i + 2];
}

/** Parcourt le JavaScript ; rappelle onChaine(texte, estGabarit) pour chaque chaîne rencontrée. */
export function parcourirJS(src, onChaine) {
  const code = (i, finSurAccolade) => {
    let profondeur = 0, dernier = "";
    while (i < src.length) {
      const c = src[i], n = src[i + 1];
      if (c === "/" && n === "/") { i = src.indexOf("\n", i); if (i < 0) return src.length; continue; }
      if (c === "/" && n === "*") { i = src.indexOf("*/", i + 2) + 2; continue; }
      if (c === '"' || c === "'") {
        let t = ""; i++;
        while (i < src.length && src[i] !== c) {
          if (src[i] === "\\") { const [x, j] = echapper(src, i); t += x; i = j; } else t += src[i++];
        }
        i++; onChaine(t, false); dernier = "a"; continue;
      }
      if (c === "`") { i = gabarit(i + 1); dernier = "a"; continue; }
      if (c === "/") {
        const mot = /(?:^|[^\w$.])(?:return|typeof|case|in|of|else|do)$/.test(src.slice(Math.max(0, i - 9), i).trimEnd());
        if (mot || dernier === "" || "(,=:[!&|?{};+-*%<>~^".includes(dernier)) { // littéral d'expression régulière
          i++; let classe = false;
          while (i < src.length && (src[i] !== "/" || classe)) {
            if (src[i] === "\\") i++; else if (src[i] === "[") classe = true; else if (src[i] === "]") classe = false;
            i++;
          }
          i++; while (/[a-z]/i.test(src[i] || "")) i++;
          dernier = "a"; continue;
        }
      }
      if (c === "{") profondeur++;
      if (c === "}") { if (finSurAccolade && profondeur === 0) return i + 1; profondeur--; }
      if (!/\s/.test(c)) dernier = c;
      i++;
    }
    return i;
  };
  const gabarit = (i) => {
    let t = "", k = 0;
    while (i < src.length && src[i] !== "`") {
      if (src[i] === "\\") { const [x, j] = echapper(src, i); t += x; i = j; }
      else if (src[i] === "$" && src[i + 1] === "{") { t += `\u0001${++k}\u0001`; i = code(i + 2, true); }
      else t += src[i++];
    }
    onChaine(t, true);
    return i + 1;
  };
  code(0, false);
}

/** Contenu de la balise <script> principale (la plus longue) et reste du HTML sans scripts. */
function separer(html) {
  html = html.replace(/\/\* i18n-ignorer[\s\S]*?\/\* i18n-fin-ignorer \*\//g, "");
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  const principal = scripts.map((s) => s[2]).sort((a, b) => b.length - a.length)[0] || "";
  return { principal, statique: html.replace(/<script\b[\s\S]*?<\/script>/gi, "").replace(/<style\b[\s\S]*?<\/style>/gi, "") };
}

export function cle(texte, existantes = new Map()) {
  const base = texte.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\{\d+\}/g, " ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").split("-").slice(0, 4).join("-").slice(0, 28) || "txt";
  const h = createHash("sha1").update(texte).digest("hex");
  for (let n = 6; n <= 20; n += 2) {
    const k = `${base}.${h.slice(0, n)}`;
    if (!existantes.has(k) || existantes.get(k) === texte) return k;
  }
  throw new Error("collision de clé : " + texte);
}

export function extraire(html) {
  const { principal, statique } = separer(html);
  const titre = /<title>([^<]*)<\/title>/i.exec(statique);
  const vus = new Set(), liste = [];
  const ajouter = (brut, source) => {
    const t = normaliser(String(brut));
    if (!plausible(t) || vus.has(t)) return;
    vus.add(t); liste.push({ texte: t, source });
  };
  if (titre) ajouter(decoder(titre[1]), "html");
  for (const m of morceauxHtml(statique.replace(/<title>[\s\S]*?<\/title>/i, ""))) ajouter(m, "html");
  parcourirJS(principal, (t, gab) => {
    const contientHtml = /<\/?[a-zA-Z][^>]*>/.test(t);
    const m = t.replace(/\u0001(\d+)\u0001/g, "{$1}");
    if (contientHtml) for (const x of morceauxHtml(m)) ajouter(x, "js");
    else ajouter(/&[a-z#0-9]+;/i.test(m) ? decoder(m) : m, "js");
  });
  const dico = new Map();
  for (const { texte } of liste) dico.set(cle(texte, dico), texte);
  return dico;
}

export const CHEMIN_HTML = new URL("../index.html", import.meta.url);
export const DOSSIER = new URL("../data/i18n/", import.meta.url);

async function main() {
  const dico = extraire(await readFile(CHEMIN_HTML, "utf-8"));
  const json = JSON.stringify(Object.fromEntries(dico), null, 1) + "\n";
  if (process.argv.includes("--verif")) {
    const actuel = await readFile(new URL("fr.json", DOSSIER), "utf-8").catch(() => "");
    if (actuel !== json) { console.error("[i18n] data/i18n/fr.json n'est plus à jour : lancer node scripts/extraire-i18n.js"); process.exit(1); }
    console.log(`[i18n] fr.json à jour (${dico.size} chaînes).`);
    return;
  }
  await mkdir(DOSSIER, { recursive: true });
  await writeFile(new URL("fr.json", DOSSIER), json);
  console.log(`[i18n] ${dico.size} chaînes françaises écrites dans data/i18n/fr.json`);
}
/* ---------- Outils partagés par check-data.js et couverture-i18n.js ---------- */
export const marques = (s) => s.match(/\{\d+\}|%[sd]/g) || [];
export const BALISE = /<\/?[a-zA-Z!][^>]*>/;

/** Codes de langue ayant un fichier data/i18n/<code>.json (hors fr). */
export async function listerLangues() {
  const { readdir } = await import("fs/promises");
  return (await readdir(DOSSIER)).filter((f) => /^[a-z]{2,3}\.json$/.test(f) && f !== "fr.json").map((f) => f.slice(0, -5)).sort();
}

/**
 * Contrôle un dictionnaire par rapport à fr.json. Renvoie { erreurs, avertissements, traduites }.
 * Erreurs : valeur non textuelle, clé inconnue de fr.json, marque ({n}, %s) ajoutée, balise HTML.
 * Avertissements : marque {n} omise (acceptable pour un accord en genre ou en nombre : « présent{2} »).
 */
export function controlerDico(code, fr, dico) {
  const erreurs = [], avertissements = [];
  let traduites = 0;
  if (!dico || typeof dico !== "object" || Array.isArray(dico)) return { erreurs: [`${code}.json : doit être un objet { clé: texte }`], avertissements, traduites };
  for (const [cle, texte] of Object.entries(dico)) {
    if (!(cle in fr)) { erreurs.push(`${code}.json : clé inconnue de fr.json (« ${cle} »)`); continue; }
    if (typeof texte !== "string") { erreurs.push(`${code}.json : la valeur de « ${cle} » n'est pas du texte`); continue; }
    if (BALISE.test(texte)) erreurs.push(`${code}.json : balise HTML interdite dans « ${cle} » (les traductions sont insérées en texte brut)`);
    const permises = marques(fr[cle]), presentes = marques(texte);
    const ajoutees = presentes.filter((m) => !permises.includes(m));
    if (ajoutees.length) erreurs.push(`${code}.json : marque ${ajoutees.join(" ")} absente du français dans « ${cle} »`);
    const omises = permises.filter((m) => !presentes.includes(m));
    const pct = omises.filter((m) => m[0] === "%");
    if (pct.length) erreurs.push(`${code}.json : marque ${pct.join(" ")} omise dans « ${cle} »`);
    else if (omises.length) avertissements.push(`${code}.json : marque ${omises.join(" ")} omise dans « ${cle} »`);
    if (texte.trim()) traduites++;
  }
  return { erreurs, avertissements, traduites };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
