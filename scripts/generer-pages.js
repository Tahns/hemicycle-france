#!/usr/bin/env node
/**
 * generer-pages.js
 * ----------------
 * Référencement et partage : pages statiques lisibles SANS JavaScript, plan du site, robots.txt, flux Atom des actualités
 * et balises de tête d'index.html. Lancé par update-data.yml après les collectes (voir aussi partage.cjs, qui produit les
 * pages d'aperçu existantes v/ (votes clés), d/ (députés), s/ (sénateurs) et p/sondages.html : elles ne sont pas dupliquées
 * ici, seulement reprises dans le plan du site).
 *
 * Pages créées (adresses propres, un dossier + index.html) :
 *  - loi/<titre>-<n>/    : un dossier législatif ayant été voté dans son ensemble (ou une motion de censure) : résultat,
 *                          vote de chaque groupe, vote du Sénat s'il y a lieu, sources officielles ;
 *  - candidat/<nom>/     : une candidature déclarée à la présidentielle 2027 : parti, fonctions, annonce, sources, crédit photo ;
 *  - parti/<nom>/        : un groupe politique de l'Assemblée (président du groupe, chef du parti, derniers votes) ;
 *  - loi/, candidat/, parti/ (index.html) : listes qui relient toutes les pages (maillage interne pour les moteurs).
 * Chaque page : <title> et description uniques et factuels (aucun avis), Open Graph/Twitter, données structurées schema.org
 * (rien d'inventé), lien « Voir la fiche complète » vers l'application, adresse canonique, sources avec liens.
 * Une page sans source https n'est PAS écrite. Aucune page ne reprend de sondage ni de simulation : la réserve électorale
 * (veille et jour de chaque tour) est respectée par construction.
 * Les pages n'ont ni script ni ressource externe (CSP « default-src 'none' »).
 *
 * Adresse du site : une seule variable, « baseUrl » de data/site-config.json (variable d'environnement SITE_URL prioritaire),
 * utilisée pour les adresses canoniques, le plan du site, les flux et les balises de partage d'index.html.
 *
 * Aussi : sitemap.xml (un fichier par type si plus de 5 000 adresses), robots.txt, actualites.atom.
 *
 * USAGE : node scripts/generer-pages.js
 */
import { readFile, writeFile, mkdir, readdir, rm } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { completer } from "./lois-format.js";
import { lireSiteConfig, normaliserBaseUrl } from "./site-config.js";

export const NOM_SITE = "Hémicycle France";
export const SEUIL_SITEMAP = 5000;
export const MAX_LOIS = 400;
const INSTAGRAM = "https://www.instagram.com/hemicyclefrance/";
const GITHUB = "https://github.com/Tahns/hemicycle-france";
const CSP_PAGES = "default-src 'none'; style-src 'self'; img-src 'self' data:; font-src 'self'; base-uri 'none'; form-action 'none'";

/* ---------- Outils ---------- */

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const xml = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const nombre = (n) => Number(n).toLocaleString("fr-FR");
const pluriel = (n, un, plusieurs) => (n > 1 ? plusieurs : un);
const estHttps = (u) => typeof u === "string" && /^https:\/\/[^\s"<>]+$/.test(u);
const sansDoublons = (liste) => [...new Set(liste)];

/** Date « 21 juillet 2026 » depuis « 2026-07-21 ». */
export function dateFr(iso) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso || "")) return "";
  return new Date(iso.slice(0, 10) + "T12:00:00Z").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).replace(/^1 /, "1er ");
}

/** Texte tronqué à une limite, à la fin d'un mot (description de page : environ 160 caractères). */
export function couper(texte, max = 158) {
  const t = String(texte).replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const c = t.slice(0, max - 1);
  return c.replace(/\s+\S*$/, "").replace(/[,;:(\s]+$/, "") + "…";
}

/** Identifiant d'adresse stable : sans accents, minuscules, tirets ; coupé à `max` caractères au dernier tiret. */
export function slugifier(texte, max = 60) {
  const s = String(texte ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (s.length <= max) return s;
  const c = s.slice(0, max);
  return (c.includes("-") && s[max] !== "-" ? c.replace(/-[^-]*$/, "") : c).replace(/-+$/, "");
}

/** Attribue un identifiant d'adresse à chaque élément, de façon déterministe : en cas d'homonymes, le suivant reçoit « -2 », « -3 »… */
export function attribuerSlugs(elements, cle, slugDe) {
  const pris = new Map();
  const sortie = new Map();
  for (const e of [...elements].sort((a, b) => String(cle(a)).localeCompare(String(cle(b)), "fr"))) {
    const base = slugDe(e) || "page";
    const n = (pris.get(base) || 0) + 1;
    pris.set(base, n);
    sortie.set(cle(e), n === 1 ? base : `${base}-${n}`);
  }
  return sortie;
}

/** Période de réserve des sondages : de minuit la veille jusqu'à 20 h le jour du vote, heure de Paris (loi du 19 juillet 1977). */
export function enReserve(maintenant, tours) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(maintenant).map((x) => [x.type, x.value]));
  const paris = `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  return (tours || []).some((tour) => {
    const veille = new Date(Date.parse(tour + "T12:00:00Z") - 864e5).toISOString().slice(0, 10);
    return paris >= `${veille}T00:00` && paris < `${tour}T20:00`;
  });
}

/* ---------- Gabarit commun ---------- */

/**
 * Page complète. `chemin` : dossier de la page relatif à la racine du site, avec « / » final (« loi/mon-texte/ »).
 * Lève une erreur si la page n'a aucune source https : une page sans source n'est jamais publiée.
 */
export function gabarit({ base, chemin, titre, description, image = "icons/partage.jpg", imageAlt = "", imageLarge = true, cible, libelleCible = "Voir la fiche complète", corps, sources, jsonld = [], fil = [], pied = "", type = "article" }) {
  const liens = (sources || []).filter((s) => estHttps(s.url));
  if (!liens.length) throw new Error(`page « ${chemin} » sans source`);
  const racine = "../".repeat(chemin.split("/").filter(Boolean).length);
  const url = `${base}${chemin}`;
  const titreComplet = `${titre} · ${NOM_SITE}`;
  const desc = couper(description);
  const filAriane = [{ nom: "Accueil", url: base }, ...fil, { nom: titre, url }];
  const graphe = [...jsonld, { "@type": "BreadcrumbList", itemListElement: filAriane.map((f, i) => ({ "@type": "ListItem", position: i + 1, name: f.nom, item: f.url })) }];
  const ld = JSON.stringify({ "@context": "https://schema.org", "@graph": graphe }).replace(/</g, "\\u003c").replace(/[\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16)}`);
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="${CSP_PAGES}">
<meta name="referrer" content="strict-origin-when-cross-origin">
<title>${esc(titreComplet)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="${esc(NOM_SITE)}">
<meta property="og:locale" content="fr_FR">
<meta property="og:title" content="${esc(titreComplet)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(base + image)}">
${imageLarge ? '<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n' : ""}${imageAlt ? `<meta property="og:image:alt" content="${esc(imageAlt)}">\n` : ""}<meta name="twitter:card" content="${imageLarge ? "summary_large_image" : "summary"}">
<meta name="twitter:title" content="${esc(titreComplet)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(base + image)}">
<meta name="theme-color" content="#F5F1E8">
<link rel="icon" href="${racine}icons/icon-192.png">
<link rel="stylesheet" href="${racine}pages.css">
<script type="application/ld+json">${ld}</script>
</head>
<body>
<div class="lisere" aria-hidden="true"><span></span><span></span><span></span></div>
<header><a href="${racine}">${esc(NOM_SITE)}</a></header>
<main>
<nav class="fil" aria-label="Fil d'Ariane"><a href="${racine}">Accueil</a>${fil.map((f) => ` › <a href="${racine}${esc(f.chemin)}">${esc(f.nom)}</a>`).join("")}</nav>
${corps}
<h2>Sources</h2>
<ul class="sources">
${liens.map((s) => `<li><a href="${esc(s.url)}" rel="noopener">${esc(s.nom)}</a></li>`).join("\n")}
</ul>
${cible ? `<a class="bouton" href="${racine}${esc(cible)}">${esc(libelleCible)}</a>` : ""}
</main>
<footer>${esc(pied || "Données publiques, relevées automatiquement.")} <a href="${racine}#mentions">Mentions légales et sources</a> · <a href="${racine}#methode">Méthode</a>.</footer>
</body>
</html>
`;
}

/* ---------- Dossiers législatifs ---------- */

const TYPES_TEXTE = [
  [/proposition de loi constitutionnelle/i, "proposition de loi constitutionnelle"], [/projet de loi constitutionnelle/i, "projet de loi constitutionnelle"],
  [/proposition de loi organique/i, "proposition de loi organique"], [/projet de loi organique/i, "projet de loi organique"],
  [/projet de loi de finances rectificative/i, "projet de loi de finances rectificative"], [/projet de loi de finances/i, "projet de loi de finances"],
  [/projet de loi de financement de la sécurité sociale/i, "projet de loi de financement de la sécurité sociale"],
  [/proposition de résolution/i, "proposition de résolution"], [/projet de loi/i, "projet de loi"], [/proposition de loi/i, "proposition de loi"],
];
export function typeTexte(vote) {
  if (vote.typeVote === "MOC") return "motion de censure";
  for (const [re, nom] of TYPES_TEXTE) if (re.test(vote.titre || "")) return nom;
  return "texte";
}

const totaux = (vote) => {
  const t = { pour: 0, contre: 0, abst: 0 };
  for (const g of Object.values(vote.votes || {})) { t.pour += g.pour || 0; t.contre += g.contre || 0; t.abst += g.abst || 0; }
  return t;
};
const resultatLibelle = (vote) => (vote.typeVote === "MOC" ? (vote.resultat === "adopte" ? "Motion adoptée" : "Motion rejetée") : vote.resultat === "adopte" ? "Adopté" : "Rejeté");
const decompte = (t) => `${nombre(t.pour)} pour, ${nombre(t.contre)} contre, ${nombre(t.abst)} ${pluriel(t.abst, "abstention", "abstentions")}`;

/** Dossiers législatifs ayant eu un vote sur l'ensemble du texte (SPS) ou une motion de censure (MOC), du plus récent au plus ancien. */
export function dossiersVotes(lois) {
  const par = new Map();
  for (const l of lois) {
    if (!l.dossierRef || !["SPS", "MOC"].includes(l.typeVote)) continue;
    if (!par.has(l.dossierRef)) par.set(l.dossierRef, []);
    par.get(l.dossierRef).push(l);
  }
  return [...par.entries()]
    .map(([ref, votes]) => ({ ref, votes: votes.sort((a, b) => (a.dateISO || "").localeCompare(b.dateISO || "") || (a.numero || 0) - (b.numero || 0)) }))
    .sort((a, b) => (b.votes.at(-1).dateISO || "").localeCompare(a.votes.at(-1).dateISO || "") || b.ref.localeCompare(a.ref))
    .slice(0, MAX_LOIS);
}

const numeroRef = (ref) => String(ref).replace(/^.*N(\d+)$/, "$1");
export const slugLoi = (d) => `${slugifier(d.votes.at(-1).dossierTitre || d.votes.at(-1).titre || "texte", 56)}-${numeroRef(d.ref)}`;

/** Page d'un dossier. `ctx` : { base, groupes, senat (navette.textes), voteExiste(numero) }. */
export function pageLoi(d, slug, ctx) {
  const dernier = d.votes.at(-1);
  const nom = (dernier.dossierTitre || "").trim() || String(dernier.titre || "").replace(/^(sur )?(l'ensemble de )?/i, "").replace(/\.$/, "");
  if (!nom) throw new Error(`dossier ${d.ref} sans titre`);
  const type = typeTexte(dernier);
  const t = totaux(dernier);
  const res = resultatLibelle(dernier);
  const chemin = `loi/${slug}/`;
  const url = `${ctx.base}${chemin}`;
  const description = `${res} par l'Assemblée nationale le ${dateFr(dernier.dateISO)} (${type}) : ${decompte(t)}. Vote de chaque groupe.`;
  const titre = `${couper(nom, 80)} : résultat du vote`;
  const groupes = Object.entries(dernier.votes || {});
  const lignesGroupes = groupes.map(([code, v]) => `<tr><td>${esc(ctx.groupes?.[code]?.libelle || code)}</td><td>${v.pour}</td><td>${v.contre}</td><td>${v.abst}</td><td>${v.membres ?? ""}</td></tr>`).join("\n");
  const lignesVotes = d.votes.map((v) => {
    const tt = totaux(v);
    const interne = ctx.voteExiste?.(v.numero) ? ` · <a href="../../v/${v.numero}.html">page du scrutin</a>` : "";
    return `<tr><td>${esc(dateFr(v.dateISO) || v.date)}${v.typeVote === "MOC" ? " · motion de censure" : ""}<br><small class="meta">${esc(String(v.titre || "").replace(/^./, (c) => c.toUpperCase()))}</small></td><td class="${v.resultat === "adopte" ? "vote-p" : "vote-c"}">${esc(resultatLibelle(v))}</td><td>${nombre(tt.pour)} / ${nombre(tt.contre)} / ${nombre(tt.abst)}</td><td><a href="${esc(v.sourceUrl)}" rel="noopener">scrutin n°${v.numero}</a>${interne}</td></tr>`;
  }).join("\n");
  const sen = ctx.senat?.[d.ref];
  const votesSenat = (sen?.votes || []).filter((v) => estHttps(v.url));
  const blocSenat = votesSenat.length ? `<h2>Au Sénat</h2>
<table><thead><tr><th>Date</th><th>Résultat</th><th>Pour / contre</th><th>Scrutin</th></tr></thead><tbody>
${votesSenat.map((v) => `<tr><td>${esc(dateFr(v.dateISO) || v.date)}</td><td class="${v.resultat === "adopte" ? "vote-p" : "vote-c"}">${v.resultat === "adopte" ? "Adopté" : "Rejeté"}</td><td>${nombre(v.pour)} / ${nombre(v.contre)}</td><td><a href="${esc(v.url)}" rel="noopener">scrutin du Sénat</a></td></tr>`).join("\n")}
</tbody></table>` : "";
  const corps = `<div class="surtitre">Assemblée nationale · ${esc(type)}${dernier.theme && dernier.theme !== "À catégoriser" ? ` · ${esc(dernier.theme)}` : ""}</div>
<h1>${esc(nom)}</h1>
<p class="resultat ${dernier.resultat === "adopte" ? "adopte" : "rejete"}">${esc(res)}</p>
<p class="meta">Dernier vote à l'Assemblée nationale le ${esc(dateFr(dernier.dateISO) || dernier.date)}.${dernier.auteur ? ` Texte déposé par ${esc(dernier.auteur)}.` : ""}</p>
<div class="chiffres"><div><b>${nombre(t.pour)}</b><span>pour</span></div><div><b>${nombre(t.contre)}</b><span>contre</span></div><div><b>${nombre(t.abst)}</b><span>${pluriel(t.abst, "abstention", "abstentions")}</span></div></div>
<p class="meta">Intitulé du scrutin : ${esc(String(dernier.titre || "").replace(/^./, (c) => c.toUpperCase()))}</p>
${ctx.voteExiste?.(dernier.numero) ? `<p class="meta"><a href="../../v/${dernier.numero}.html">Page de partage du scrutin n°${dernier.numero}</a></p>\n` : ""}<h2>Le vote de chaque groupe</h2>
<table><thead><tr><th>Groupe</th><th>Pour</th><th>Contre</th><th>Abst.</th><th>Membres</th></tr></thead><tbody>
${lignesGroupes}
</tbody></table>
${d.votes.length > 1 ? `<h2>Tous les votes sur l'ensemble du texte</h2>
<table><thead><tr><th>Scrutin</th><th>Résultat</th><th>Pour / contre / abst.</th><th>Source</th></tr></thead><tbody>
${lignesVotes}
</tbody></table>` : ""}
${blocSenat}`;
  const sources = [
    ...(dernier.dossierUrl ? [{ nom: "Dossier législatif, Assemblée nationale", url: dernier.dossierUrl }] : []),
    ...d.votes.map((v) => ({ nom: `Assemblée nationale, scrutin n°${v.numero}`, url: v.sourceUrl })),
    ...(estHttps(sen?.dossier) ? [{ nom: "Dossier législatif, Sénat", url: sen.dossier }] : []),
    ...votesSenat.map((v) => ({ nom: `Sénat, scrutin du ${dateFr(v.dateISO) || v.date}`, url: v.url })),
  ];
  const jsonld = [{ "@type": "Legislation", name: nom, description, url, inLanguage: "fr", legislationType: type === "texte" ? undefined : type, legislationPassedBy: { "@type": "Organization", name: "Assemblée nationale" }, isBasedOn: sources[0].url, dateModified: dernier.dateISO || undefined }];
  return gabarit({ base: ctx.base, chemin, titre, description, cible: `#scrutin-${dernier.numero}`, libelleCible: "Voir le vote dans l'hémicycle interactif", corps, sources, jsonld, fil: [{ nom: "Lois et votes", url: `${ctx.base}loi/`, chemin: "loi/" }],
    pied: "Données publiques de l'Assemblée nationale et du Sénat, relevées chaque jour.", imageAlt: "Hémicycle France : la politique française, preuves à l'appui." });
}

/* ---------- Candidats à la présidentielle ---------- */

export function pageCandidat(c, slug, ctx) {
  const chemin = `candidat/${slug}/`;
  const url = `${ctx.base}${chemin}`;
  const annonce = c.annonce ? dateFr(c.annonce) : "";
  const description = `Candidature déclarée à la présidentielle 2027 : ${c.nom}${c.parti ? ` (${c.parti})` : ""}${annonce ? `, annoncée le ${annonce}` : ""}. Fonctions et sources.`;
  const titre = `${c.nom}, candidature à la présidentielle 2027`;
  const photo = ctx.photo?.(c.nom) || null;
  const fonctions = Array.isArray(c.fonctions) ? c.fonctions.filter(Boolean) : [];
  const groupe = c.code && ctx.groupes?.[c.code] ? c.code : null;
  const wikipedia = { nom: "Wikipédia, candidatures à l'élection présidentielle de 2027", url: ctx.sourceCandidats };
  const sources = [...(estHttps(c.source) && c.source !== ctx.sourceCandidats ? [{ nom: "Source de l'annonce de candidature", url: c.source }] : []), ...(estHttps(ctx.sourceCandidats) ? [wikipedia] : [])];
  const corps = `<div class="surtitre">Présidentielle 2027 · candidature déclarée</div>
<h1>${esc(c.nom)}</h1>
${photo ? `<figure class="portrait"><img src="../../${esc(photo.chemin)}" alt="${esc(`Portrait de ${c.nom}`)}" width="120" height="120" loading="lazy"><figcaption class="credit">Photo : ${esc(photo.auteur || "auteur non précisé")}, ${esc(photo.licence || "licence libre")}, <a href="${esc(photo.source)}" rel="noopener">Wikimedia Commons</a>.</figcaption></figure>` : ""}
<p class="meta">${c.parti ? `Parti ou étiquette indiqué : ${esc(c.parti)}.` : "Aucun parti indiqué."}${annonce ? ` Candidature annoncée le ${esc(annonce)}.` : ""}</p>
${fonctions.length ? `<h2>Fonctions indiquées</h2>\n<ul>\n${fonctions.map((f) => `<li>${esc(f)}</li>`).join("\n")}\n</ul>` : ""}
${c.slogan ? `<p class="meta">Slogan de campagne indiqué : « ${esc(c.slogan)} ».</p>` : ""}
${groupe ? `<p class="meta"><a href="../../parti/${esc(ctx.slugsPartis?.get(groupe) || "")}/">Groupe politique à l'Assemblée nationale : ${esc(ctx.groupes[groupe].libelle)}</a></p>` : ""}
<p class="meta">Les candidatures sont relevées sur Wikipédia et recoupées avec la presse. Une candidature déclarée n'est pas une candidature validée : les parrainages sont contrôlés par le Conseil constitutionnel. Les sondages d'intention de vote ne figurent pas sur cette page ; leur publication est interdite la veille et le jour de chaque tour (loi du 19 juillet 1977).</p>`;
  const jsonld = [{ "@type": "Person", name: c.nom, description: fonctions.join(" ; ") || undefined, url, image: photo ? `${ctx.base}${photo.chemin}` : undefined, affiliation: c.parti ? { "@type": "Organization", name: c.parti } : undefined }];
  return gabarit({ base: ctx.base, chemin, titre, description, image: photo ? photo.chemin : "icons/partage.jpg", imageLarge: !photo, imageAlt: photo ? `Portrait de ${c.nom}` : "", cible: "#candidats", libelleCible: "Voir tous les candidats sur le site", corps, sources, jsonld, fil: [{ nom: "Candidats à la présidentielle 2027", url: `${ctx.base}candidat/`, chemin: "candidat/" }],
    pied: "Candidatures relevées sur Wikipédia (licence CC BY-SA) et dans la presse." });
}

/* ---------- Groupes politiques ---------- */

export const slugParti = (code, libelle) => slugifier(libelle || code, 60);

export function pageParti(code, g, ctx) {
  const slug = ctx.slugsPartis.get(code);
  const chemin = `parti/${slug}/`;
  const url = `${ctx.base}${chemin}`;
  const chef = ctx.dirigeants?.find((x) => x.parti === code);
  const logo = ctx.logo?.(code) || null;
  const dernier = ctx.dossiers.slice(0, 6).map((d) => ({ v: d.votes.at(-1), ref: d.ref })).filter((x) => x.v.votes?.[code]);
  const prem = g.presidente ? "Présidente" : "Président";
  const description = `Groupe ${g.libelle} à l'Assemblée nationale : ${g.membres} ${pluriel(g.membres, "membre", "membres")}${g.president ? `, ${prem.toLowerCase()} du groupe ${g.president}` : ""}${chef ? `, ${chef.role}: ${chef.nom}` : ""}. Son vote sur les derniers textes.`;
  const titre = `${g.libelle} : groupe à l'Assemblée nationale, dirigeants et votes`;
  const lignes = dernier.map(({ v, ref }) => { const x = v.votes[code]; const slug = ctx.slugsLois?.get(ref);
    return `<tr><td>${slug ? `<a href="../../loi/${esc(slug)}/">${esc(v.dossierTitre || v.titre)}</a>` : esc(v.dossierTitre || v.titre)}<br><small class="meta">${esc(dateFr(v.dateISO) || v.date)} · ${esc(resultatLibelle(v).toLowerCase())}</small></td><td>${x.pour}</td><td>${x.contre}</td><td>${x.abst}</td><td>${x.membres ?? ""}</td></tr>`; }).join("\n");
  const candidats = (ctx.candidats || []).filter((c) => c.code === code && ctx.slugsCandidats?.get(c.nom));
  const corps = `<div class="surtitre">Assemblée nationale · groupe politique</div>
<h1>${esc(g.libelle)}</h1>
${logo ? `<figure class="portrait logo"><img src="../../${esc(logo.chemin)}" alt="${esc(`Logo : ${g.libelle}`)}" loading="lazy"><figcaption class="credit">Logo : ${esc(logo.auteur || "auteur non précisé")}, ${esc(logo.licence || "licence libre")}, <a href="${esc(logo.source)}" rel="noopener">Wikimedia Commons</a>.</figcaption></figure>` : ""}
<div class="chiffres"><div><b>${g.membres}</b><span>${pluriel(g.membres, "membre", "membres")} à l'Assemblée nationale</span></div></div>
<ul>
${g.president ? `<li>${prem} du groupe : ${esc(g.president)}${g.presidentDepuis ? ` (depuis le ${esc(dateFr(g.presidentDepuis))})` : ""}.</li>` : ""}
${chef ? `<li>${esc(chef.role)} : ${esc(chef.nom)}${chef.source?.nom ? ` (source : ${esc(chef.source.nom)})` : ""}.</li>` : ""}
</ul>
${lignes ? `<h2>Son vote sur les derniers textes</h2>
<table><thead><tr><th>Texte</th><th>Pour</th><th>Contre</th><th>Abst.</th><th>Membres</th></tr></thead><tbody>
${lignes}
</tbody></table>
<p class="meta">Nombre de membres du groupe ayant voté pour, contre ou s'étant abstenus lors du dernier vote sur l'ensemble de chaque texte.</p>` : ""}
${candidats.length ? `<h2>Candidatures à la présidentielle 2027 déclarées sous ce sigle</h2>\n<ul>\n${candidats.map((c) => `<li><a href="../../candidat/${esc(ctx.slugsCandidats.get(c.nom))}/">${esc(c.nom)}</a></li>`).join("\n")}\n</ul>` : ""}`;
  const sources = [{ nom: "Assemblée nationale, open data (groupes politiques)", url: "https://data.assemblee-nationale.fr" }, ...(estHttps(chef?.source?.url) ? [{ nom: chef.source.nom || "Source", url: chef.source.url }] : [])];
  const jsonld = [{ "@type": "Organization", name: g.libelle, url, logo: logo ? `${ctx.base}${logo.chemin}` : undefined, description: `Groupe politique de l'Assemblée nationale (${g.membres} ${pluriel(g.membres, "membre", "membres")}).`, sameAs: estHttps(chef?.source?.url) && /wikipedia\.org/.test(chef.source.url) ? [chef.source.url] : undefined }];
  return gabarit({ base: ctx.base, chemin, titre, description, cible: `#histo-${code}`, libelleCible: "Voir l'historique de vote du groupe", corps, sources, jsonld, fil: [{ nom: "Groupes politiques", url: `${ctx.base}parti/`, chemin: "parti/" }],
    pied: "Composition des groupes : open data de l'Assemblée nationale (Licence Ouverte 2.0).", imageAlt: "Hémicycle France : la politique française, preuves à l'appui." });
}

/* ---------- Pages de liste (maillage interne) ---------- */

export function pageListe({ base, dossier, titre, intro, elements, sources }) {
  const chemin = `${dossier}/`;
  const corps = `<h1>${esc(titre)}</h1>
<p class="meta">${esc(intro)}</p>
<ul class="liste-liens">
${elements.map((e) => `<li><a href="${esc(e.slug)}/">${esc(e.nom)}</a>${e.detail ? ` <span class="meta">· ${esc(e.detail)}</span>` : ""}</li>`).join("\n")}
</ul>`;
  return gabarit({ base, chemin, titre, description: intro, corps, sources, cible: "", pied: "Données publiques, relevées automatiquement.", type: "website", jsonld: [{ "@type": "CollectionPage", name: titre, url: `${base}${chemin}`, inLanguage: "fr" }] });
}

/* ---------- Plan du site, robots.txt, flux Atom ---------- */

const urlset = (entrees) => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entrees.map((e) => `<url><loc>${xml(e.loc)}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ""}${e.changefreq ? `<changefreq>${e.changefreq}</changefreq>` : ""}${e.priorite ? `<priority>${e.priorite}</priority>` : ""}</url>`).join("\n")}\n</urlset>\n`;

/** Fichiers du plan du site : un seul sitemap.xml, ou (au-delà de `seuil` adresses) un index + un fichier par type. */
export function construireSitemaps(entrees, base, seuil = SEUIL_SITEMAP) {
  const fichiers = new Map();
  if (entrees.length <= seuil) { fichiers.set("sitemap.xml", urlset(entrees)); return fichiers; }
  const types = [...new Set(entrees.map((e) => e.type))].sort();
  const refs = [];
  for (const t of types) {
    const lot = entrees.filter((e) => e.type === t);
    for (let i = 0, n = 1; i < lot.length; i += seuil, n++) {
      const nom = `sitemap-${t}${lot.length > seuil ? `-${n}` : ""}.xml`;
      fichiers.set(nom, urlset(lot.slice(i, i + seuil)));
      refs.push(nom);
    }
  }
  fichiers.set("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${refs.map((r) => `<sitemap><loc>${xml(base + r)}</loc></sitemap>`).join("\n")}\n</sitemapindex>\n`);
  return fichiers;
}

export const robots = (base) => `User-agent: *\nAllow: /\nSitemap: ${base}sitemap.xml\n`;

/** Flux Atom des dernières actualités : titres, médias et liens vers l'article d'origine (aucun texte repris). */
export function construireAtom(actus, base, max = 40) {
  const vus = new Set();
  const articles = [...(actus.dossiers || []), ...(actus.sujets || [])].flatMap((s) => s.articles || [])
    .filter((a) => estHttps(a.url) && a.titre && a.media && /^\d{4}-\d{2}-\d{2}T/.test(a.date || "") && !vus.has(a.url) && vus.add(a.url))
    .sort((a, b) => b.date.localeCompare(a.date) || a.url.localeCompare(b.url)).slice(0, max);
  const maj = articles[0]?.date || actus.lastUpdated || "1970-01-01T00:00:00Z";
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="fr">
  <id>tag:hemicycle-france,2026:actualites</id>
  <title>${xml(NOM_SITE)} · Actualités politiques</title>
  <subtitle>Les derniers titres de la rubrique politique de médias d'information, relevés dans leurs flux publics. Chaque entrée renvoie à l'article d'origine.</subtitle>
  <updated>${maj}</updated>
  <link rel="self" type="application/atom+xml" href="${xml(base)}actualites.atom"/>
  <link rel="alternate" type="text/html" href="${xml(base)}#actualites"/>
${articles.map((a) => `  <entry>
    <id>${xml(a.url)}</id>
    <title>${xml(a.titre)}</title>
    <link rel="alternate" type="text/html" href="${xml(a.url)}"/>
    <updated>${a.date}</updated>
    <author><name>${xml(a.media)}</name></author>
    <summary>${xml(`Titre relevé dans le flux public de ${a.media}.`)}</summary>
  </entry>`).join("\n")}
</feed>
`;
}

/* ---------- Accueil : adresse du site et données structurées ---------- */

export function donneesAccueil(base) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebSite", "@id": `${base}#site`, name: NOM_SITE, alternateName: "Hémicycle", url: base, inLanguage: "fr",
        description: "Ce que votent les députés et les sénateurs, les sondages de la présidentielle 2027, les résultats par commune et les chiffres de l'Insee. Chaque information a sa source.",
        publisher: { "@id": `${base}#organisation` },
        potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: `${base}?q={search_term_string}` }, "query-input": "required name=search_term_string" } },
      { "@type": "Organization", "@id": `${base}#organisation`, name: NOM_SITE, url: base, logo: `${base}icons/icon-512.png`, sameAs: [INSTAGRAM, GITHUB] },
    ],
  };
}

/** Met en accord avec `base` les adresses absolues de la tête d'index.html (canonical, og:, twitter:, données structurées). Idempotent. */
export function appliquerBaseAccueil(html, base) {
  const ld = JSON.stringify(donneesAccueil(base)).replace(/</g, "\\u003c");
  return html
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${base}$2`)
    .replace(/(<meta property="og:image" content=")[^"]*?(icons\/partage\.jpg")/, `$1${base}$2`)
    .replace(/(<meta name="twitter:image" content=")[^"]*?(icons\/partage\.jpg")/, `$1${base}$2`)
    .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${base}$2`)
    .replace(/<script type="application\/ld\+json">[^<]*<\/script>/, () => `<script type="application/ld+json">${ld}</script>`);
}

/* ---------- Exécution ---------- */

async function lire(fichier, defaut = {}) {
  try { return JSON.parse(await readFile(fichier, "utf-8")); } catch (e) { return defaut; }
}
async function ecrireSiChange(fichier, contenu) {
  let ancien = null;
  try { ancien = await readFile(fichier, "utf-8"); } catch (e) { /* nouveau fichier */ }
  if (ancien === contenu) return false;
  await mkdir(path.dirname(fichier), { recursive: true });
  await writeFile(fichier, contenu);
  return true;
}
const slugPortrait = (nom) => nom.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Supprime les dossiers de pages qui ne sont plus produits (seulement si la génération a bien abouti : `minimum` pages). */
async function elaguer(dossier, gardes, minimum) {
  if (gardes.size < minimum || !existsSync(dossier)) return 0;
  let n = 0;
  for (const e of await readdir(dossier, { withFileTypes: true })) {
    if (e.isDirectory() && !gardes.has(e.name) && existsSync(path.join(dossier, e.name, "index.html"))) { await rm(path.join(dossier, e.name), { recursive: true }); n++; }
  }
  return n;
}

async function listerHtml(dossier, extension = ".html") {
  try { return (await readdir(dossier)).filter((f) => f.endsWith(extension)).sort(); } catch (e) { return []; }
}

export async function generer(racine = ".") {
  const R = (...p) => path.join(racine, ...p);
  const cfg = await lireSiteConfig(R("data", "site-config.json"));
  const base = normaliserBaseUrl(process.env.SITE_URL) || cfg.baseUrl;
  for (const e of cfg.erreurs) console.error(`[pages] ${e}`);

  const { lois: brutes = [] } = await lire(R("data", "lois.json"), {});
  const lois = brutes.map(completer);
  const { groupes = {}, lastUpdated: majGroupes } = await lire(R("data", "groupes.json"), {});
  const { candidats = [], sourceUrl: sourceCandidats, lastUpdated: majCandidats } = await lire(R("data", "candidats.json"), {});
  const { dirigeants = [] } = await lire(R("data", "dirigeants.json"), {});
  const { portraits = {} } = await lire(R("data", "portraits.json"), {});
  const { logos = {} } = await lire(R("data", "logos.json"), {});
  const { textes: navette = {} } = await lire(R("data", "navette.json"), {});
  const dossiersSenat = await lire(R("data", "dossiers-senat.json"), {});
  const actus = await lire(R("data", "actualites.json"), {});
  const senat = { ...Object.fromEntries(Object.entries(dossiersSenat).filter(([, v]) => typeof v === "string").map(([k, v]) => [k, { dossier: `https://www.senat.fr${v}` }])), ...navette };

  const pagesV = await listerHtml(R("v"));
  const voteExiste = (n) => pagesV.includes(`${n}.html`);
  const photo = (nom) => {
    const p = portraits[nom];
    const chemin = `photos/personnalites/${slugPortrait(nom)}.jpg`;
    return p?.fichier && estHttps(p.source) && existsSync(R(chemin)) ? { chemin, auteur: p.auteur, licence: p.licence, source: p.source } : null;
  };
  const logo = (code) => {
    const l = logos[code];
    return l && estHttps(l.source) && existsSync(R("icons", "partis", `${code}.png`)) ? { chemin: `icons/partis/${code}.png`, auteur: l.auteur, licence: l.licence, source: l.source } : null;
  };

  const dossiers = dossiersVotes(lois);
  const slugsLois = new Map(attribuerSlugs(dossiers, (d) => d.ref, slugLoi));
  const partis = Object.entries(groupes).filter(([code]) => code !== "NI");
  const slugsPartis = attribuerSlugs(partis, ([code]) => code, ([code, g]) => slugParti(code, g.libelle));
  const slugsPartisParCode = new Map([...slugsPartis.entries()]);
  const slugsCandidats = attribuerSlugs(candidats, (c) => c.nom, (c) => slugifier(c.nom, 50));
  const ctx = { base, groupes, senat, voteExiste, photo, logo, dirigeants, dossiers, candidats, sourceCandidats, slugsPartis: slugsPartisParCode, slugsCandidats, slugsLois };

  let ecrites = 0, ignorees = 0;
  const entrees = []; // { type, loc, lastmod, changefreq, priorite }
  const jour = (iso) => (/^\d{4}-\d{2}-\d{2}/.test(iso || "") ? iso.slice(0, 10) : undefined);
  const produire = async (type, dossier, slug, fabriquer, lastmod) => {
    let html;
    try { html = fabriquer(); } catch (e) { ignorees++; console.error(`[pages] ${type}/${slug} ignorée : ${e.message}`); return false; }
    if (await ecrireSiChange(R(dossier, slug, "index.html"), html)) ecrites++;
    entrees.push({ type, loc: `${base}${dossier}/${slug}/`, lastmod });
    return true;
  };

  const lisLois = [], lisCandidats = [], lisPartis = [];
  const gardesLois = new Set(), gardesCandidats = new Set(), gardesPartis = new Set();
  const titresVus = new Set();
  for (const d of dossiers) {
    const slug = slugsLois.get(d.ref);
    const dernier = d.votes.at(-1);
    const ok = await produire("loi", "loi", slug, () => {
      const h = pageLoi(d, slug, ctx);
      const t = /<title>([^<]*)<\/title>/.exec(h)[1];
      if (titresVus.has(t)) throw new Error("titre en double");
      titresVus.add(t);
      return h;
    }, jour(dernier.dateISO));
    if (ok) { gardesLois.add(slug); lisLois.push({ slug, nom: dernier.dossierTitre || dernier.titre, detail: `${resultatLibelle(dernier)}, ${dateFr(dernier.dateISO)}` }); }
  }
  for (const c of candidats) {
    const slug = slugsCandidats.get(c.nom);
    if (await produire("candidat", "candidat", slug, () => pageCandidat(c, slug, ctx), jour(majCandidats))) { gardesCandidats.add(slug); lisCandidats.push({ slug, nom: c.nom, detail: c.parti }); }
  }
  for (const [code, g] of partis) {
    const slug = slugsPartis.get(code);
    if (await produire("parti", "parti", slug, () => pageParti(code, g, ctx), jour(majGroupes))) { gardesPartis.add(slug); lisPartis.push({ slug, nom: g.libelle, detail: `${g.membres} membres` }); }
  }

  const listes = [
    ["loi", "Lois et votes de l'Assemblée nationale", "Textes votés dans leur ensemble et motions de censure : résultat, vote de chaque groupe et sources officielles.", lisLois, [{ nom: "Assemblée nationale, open data", url: "https://data.assemblee-nationale.fr" }]],
    ["candidat", "Candidats à la présidentielle 2027", "Candidatures déclarées à l'élection présidentielle de 2027, relevées sur Wikipédia et dans la presse. Aucun sondage sur ces pages.", lisCandidats, (estHttps(sourceCandidats) ? [{ nom: "Wikipédia, candidatures à l'élection présidentielle de 2027", url: sourceCandidats }] : sansDoublons(candidats.map((c) => c.source).filter(estHttps)).map((url) => ({ nom: "Source d'une annonce de candidature", url })))],
    ["parti", "Groupes politiques de l'Assemblée nationale", "Les groupes de l'Assemblée nationale : membres, président du groupe, chef du parti et votes sur les derniers textes.", lisPartis, [{ nom: "Assemblée nationale, open data", url: "https://data.assemblee-nationale.fr" }]],
  ];
  for (const [dossier, titre, intro, elements, sources] of listes) {
    if (!elements.length) continue;
    try {
      if (await ecrireSiChange(R(dossier, "index.html"), pageListe({ base, dossier, titre, intro, elements, sources }))) ecrites++;
      entrees.push({ type: dossier, loc: `${base}${dossier}/` });
    } catch (e) { console.error(`[pages] liste ${dossier} ignorée : ${e.message}`); }
  }
  const retirees = (await elaguer(R("loi"), gardesLois, 5)) + (await elaguer(R("candidat"), gardesCandidats, 3)) + (await elaguer(R("parti"), gardesPartis, 5));

  // Plan du site : accueil, pages d'aperçu de partage.cjs (v/, d/, s/, p/sondages.html) et pages ci-dessus
  const lastmodVote = new Map(lois.filter((l) => l.numero !== undefined).map((l) => [String(l.numero), jour(l.dateISO)]));
  const toutes = [{ type: "accueil", loc: base, changefreq: "daily", priorite: "1.0" }];
  for (const f of pagesV) toutes.push({ type: "vote", loc: `${base}v/${f}`, lastmod: lastmodVote.get(f.replace(/\.html$/, "")) });
  for (const f of await listerHtml(R("d"))) toutes.push({ type: "depute", loc: `${base}d/${f}`, changefreq: "weekly" });
  for (const f of await listerHtml(R("s"))) toutes.push({ type: "senateur", loc: `${base}s/${f}`, changefreq: "weekly" });
  if (existsSync(R("p", "sondages.html"))) toutes.push({ type: "sondage", loc: `${base}p/sondages.html`, changefreq: "daily" });
  toutes.push(...entrees.sort((a, b) => a.loc.localeCompare(b.loc)));
  const fichiers = construireSitemaps(toutes, base);
  for (const [nom, contenu] of fichiers) await ecrireSiChange(R(nom), contenu);
  for (const f of await listerHtml(racine, ".xml")) if (/^sitemap-.*\.xml$/.test(f) && !fichiers.has(f)) await rm(R(f));
  await ecrireSiChange(R("robots.txt"), robots(base));
  if (actus.dossiers || actus.sujets) await ecrireSiChange(R("actualites.atom"), construireAtom(actus, base));

  // Tête d'index.html : adresse du site (canonical, partage, données structurées)
  const index = await readFile(R("index.html"), "utf-8");
  const maj = appliquerBaseAccueil(index, base);
  if (maj !== index) await writeFile(R("index.html"), maj);

  console.log(`[pages] ${lisLois.length} loi(s), ${lisCandidats.length} candidat(s), ${lisPartis.length} groupe(s) : ${ecrites} fichier(s) écrit(s), ${retirees} retiré(s), ${ignorees} ignorée(s) ; plan du site : ${toutes.length} adresse(s) en ${fichiers.size} fichier(s). Adresse : ${base}`);
  return { base, ecrites, ignorees, adresses: toutes.length };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] === fileURLToPath(import.meta.url)) {
  generer(".").then((r) => { if (r.ignorees) process.exitCode = 1; }).catch((e) => { console.error("[pages] ÉCHEC :", e); process.exit(1); });
}
