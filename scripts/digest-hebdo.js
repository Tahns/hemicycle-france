#!/usr/bin/env node
/**
 * digest-hebdo.js
 * ---------------
 * « Ce qui s'est passé au Parlement cette semaine » : résumé hebdomadaire écrit UNIQUEMENT à partir des données du site
 * (aucune IA, aucun avis, aucun compte tiers). Ton neutre, chaque chiffre renvoie à sa source officielle.
 *
 * Contenu (tout vient de data/*.json) :
 *  - textes votés dans la semaine (scrutins sur l'ensemble d'un texte et motions de censure) : résultat officiel, décompte ;
 *  - scrutins ordinaires les plus serrés (plus petit écart de voix) ;
 *  - textes les plus discutés (nombre de scrutins publics par dossier) ;
 *  - dossiers du moment dans la presse, sous le titre propre du site (data/actualites.json, médias cités) ;
 *  - dates à venir : ordre du jour de l'Assemblée (agenda-an.json) et rendez-vous (meetings.json) ;
 *  - dernier sondage de la présidentielle, sauf pendant la réserve électorale (loi du 19 juillet 1977, art. 11).
 *
 * Sorties :
 *  - data/digest/AAAA-Wss.json            : le résumé, structuré ;
 *  - digest/AAAA-Wss/index.html           : page lisible (sans JavaScript, CSP stricte, Open Graph, charte du site) ;
 *  - digest/AAAA-Wss/email.html           : version e-mail prête à coller (HTML simple, styles en ligne) ;
 *  - digest/index.html et digest.xml      : archive et flux Atom des dernières semaines.
 * Rien n'est envoyé nulle part : voir docs/NEWSLETTER.md pour brancher un outil d'envoi.
 *
 * USAGE : node scripts/digest-hebdo.js [--semaine=2026-W41]   (par défaut : la semaine en cours, heure de Paris)
 */
import { readFile, readdir } from "fs/promises";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { completer } from "./lois-format.js";
import { SITE, NOM_SITE, esc, nombre, majuscule, coupe, dateLongue, dateCourte, atom, ecrireSiChange } from "./flux-atom.js";

const jourMs = 864e5;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

/** Semaine ISO d'une date « AAAA-MM-JJ » : { id, annee, semaine, debut (lundi), fin (dimanche) }. */
export function semaineISO(dateISO) {
  const d = Date.parse(dateISO + "T12:00:00Z");
  const lundi = d - ((new Date(d).getUTCDay() + 6) % 7) * jourMs;
  const jeudi = lundi + 3 * jourMs;
  const annee = new Date(jeudi).getUTCFullYear();
  const semaine = Math.ceil(((jeudi - Date.UTC(annee, 0, 1)) / jourMs + 1) / 7);
  return { id: `${annee}-W${String(semaine).padStart(2, "0")}`, annee, semaine, debut: iso(lundi), fin: iso(lundi + 6 * jourMs) };
}

/** « 2026-W41 » -> semaine ISO ; null si le format est invalide. */
export function semaineDepuisId(id) {
  const m = /^(\d{4})-W(\d{2})$/.exec(id || "");
  if (!m) return null;
  const jan4 = Date.parse(`${m[1]}-01-04T12:00:00Z`);
  const lundi1 = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * jourMs;
  const s = semaineISO(iso(lundi1 + (Number(m[2]) - 1) * 7 * jourMs));
  return s.id === id ? s : null;
}

export function dateParis(maintenant) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(maintenant);
}

// Loi n° 77-808 du 19 juillet 1977, art. 11 : aucun sondage publié la veille et le jour de chaque tour
// (présidentielle : du samedi 0 h au dimanche 20 h, heure de Paris). Même règle que scripts/fetch-sondages.js.
const TOURS_PRESIDENTIELLE = ["2027-04-18", "2027-05-02"];
export function periodeReserve(maintenant = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(maintenant).map((x) => [x.type, x.value])
  );
  const paris = `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  return TOURS_PRESIDENTIELLE.find((tour) => {
    const veille = new Date(Date.parse(tour + "T12:00:00Z") - jourMs).toISOString().slice(0, 10);
    return paris >= `${veille}T00:00` && paris < `${tour}T20:00`;
  }) || null;
}

const somme = (l, k) => Object.values(l.votes || {}).reduce((t, v) => t + (v && Number.isInteger(v[k]) ? v[k] : 0), 0);
const resumeScrutin = (l, pageVote) => {
  const pour = somme(l, "pour"), contre = somme(l, "contre"), abst = somme(l, "abst");
  return {
    numero: l.numero,
    type: l.typeVote === "MOC" ? "censure" : l.typeVote === "SPS" ? "ensemble" : "ordinaire",
    titre: l.dossierTitre || majuscule(l.titre.replace(/\s*\((?:première|nouvelle|deuxième|troisième|lecture définitive)[^)]*\)\.?$/i, "").replace(/\.$/, "")),
    intitule: majuscule(l.titre),
    resultat: l.resultat,
    date: l.date,
    dateISO: l.dateISO,
    pour, contre, abst,
    ecart: Math.abs(pour - contre),
    url: l.sourceUrl,
    pageUrl: pageVote(l.numero) ? `${SITE}v/${l.numero}.html` : null,
    dossierRef: l.dossierRef || null,
  };
};

/**
 * Construit le résumé d'une semaine. Fonction pure : toutes les données sont passées en argument.
 * @param {{lois:object[], sondages?:object, meetings?:object, agenda?:object, actualites?:object}} donnees  (lois déjà « complétées »)
 * @param {{semaine:{id:string,annee:number,semaine:number,debut:string,fin:string}, maintenant?:Date, pageVote?:(n:number)=>boolean}} options
 */
export function construireDigest(donnees, { semaine, maintenant = new Date(Date.parse(semaine.fin + "T18:00:00Z")), pageVote = () => false }) {
  const { debut, fin } = semaine;
  const lois = (donnees.lois || []).filter((l) => l.dateISO >= debut && l.dateISO <= fin && l.numero !== undefined && l.titre);
  const tous = lois.map((l) => resumeScrutin(l, pageVote));

  // 1. Textes votés : scrutins sur l'ensemble d'un texte et motions de censure, du plus récent au plus ancien
  const textes = tous.filter((s) => s.type !== "ordinaire").sort((a, b) => b.numero - a.numero);
  // 2. Scrutins ordinaires les plus serrés (au moins 150 votants, pour ne pas citer de petits scrutins)
  const serres = tous.filter((s) => s.type === "ordinaire" && s.pour + s.contre >= 150)
    .sort((a, b) => a.ecart - b.ecart || b.numero - a.numero).slice(0, 5);
  // 3. Textes les plus discutés : nombre de scrutins publics par dossier
  const parDossier = new Map();
  for (const l of lois) {
    if (!l.dossierRef) continue;
    const d = parDossier.get(l.dossierRef) || { titre: l.dossierTitre || null, scrutins: 0, url: l.dossierUrl || null };
    d.scrutins++;
    parDossier.set(l.dossierRef, d);
  }
  const dossiers = [...parDossier.entries()].filter(([, d]) => d.titre)
    .map(([ref, d]) => ({ ref, ...d })).sort((a, b) => b.scrutins - a.scrutins || a.titre.localeCompare(b.titre, "fr")).slice(0, 6);

  // 4. Dossiers du moment dans la presse (titres propres du site) : actifs pendant la semaine, avec les médias qui les couvrent
  const reserve = periodeReserve(maintenant);
  const debutMs = Date.parse(debut + "T00:00:00Z"), finMs = Date.parse(fin + "T00:00:00Z") + jourMs;
  const plat = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const JOURS = /^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)$/;
  const actualite = (donnees.actualites?.dossiers || [])
    .filter((d) => d.titre && d.derniere && Date.parse(d.derniere) >= debutMs && Date.parse(d.derniere) < finMs)
    .filter((d) => !JOURS.test(plat(d.titre)) && !(reserve && /sondage|intentions? de vote/i.test(d.titre)))
    .map((d) => {
      // Seuls les articles dont le titre reprend un mot-clé du dossier sont cités (le regroupement par mots-clés est large) ; un média une seule fois
      const motifs = (d.motifs || []).map(plat).filter(Boolean);
      const vus = new Set();
      const articles = (d.articles || []).filter((a) => a.media && /^https:\/\//.test(a.url || "") && motifs.some((m) => plat(a.titre).includes(m)) && !vus.has(a.media) && vus.add(a.media))
        .slice(0, 3).map((a) => ({ media: a.media, url: a.url }));
      return { titre: d.titre, nbMedias: d.medias?.length || articles.length, articles };
    })
    .filter((d) => d.articles.length >= 2)
    .sort((a, b) => b.nbMedias - a.nbMedias || a.titre.localeCompare(b.titre, "fr")).slice(0, 5);

  // 5. Dates à venir : séances de l'Assemblée de la semaine suivante, rendez-vous des 3 semaines suivantes
  const apres = iso(finMs), dans7 = iso(finMs + 6 * jourMs), dans21 = iso(finMs + 20 * jourMs);
  const seances = (donnees.agenda?.jours || []).filter((j) => j.date >= apres && j.date <= dans7 && (j.points || []).length)
    .map((j) => ({ date: j.date, points: j.points.slice(0, 5).map((p) => ({ type: p.type, objet: coupe(p.objet, 220) })) }))
    .sort((a, b) => a.date.localeCompare(b.date)).slice(0, 7);
  const rendezVous = (donnees.meetings?.meetings || []).filter((m) => m.verified !== false && m.confirme !== false && m.debut >= apres && m.debut <= dans21)
    .map((m) => ({ debut: m.debut, fin: m.fin && m.fin !== m.debut ? m.fin : null, titre: coupe(m.titre, 140), lieu: coupe(m.lieu || "", 120), source: m.source?.url ? { nom: m.source.nom || "source", url: m.source.url } : null }))
    .sort((a, b) => a.debut.localeCompare(b.debut) || a.titre.localeCompare(b.titre, "fr")).slice(0, 8);

  // 6. Dernier sondage de la présidentielle (aucun pendant la réserve électorale)
  let sondage = null;
  const dernier = reserve ? null : [...(donnees.sondages?.instituts || [])].filter((i) => i.dateFin && i.scores).sort((a, b) => b.dateFin.localeCompare(a.dateFin))[0];
  if (dernier) {
    const tetes = Object.entries(dernier.scores).filter(([, v]) => Array.isArray(v) && v.length === 2).sort((a, b) => b[1][1] - a[1][1] || a[0].localeCompare(b[0], "fr")).slice(0, 4)
      .map(([nom, [min, max]]) => ({ nom, min, max }));
    sondage = { institut: dernier.nom || dernier.institut, dateFin: dernier.dateFin, echantillon: dernier.echantillon || null, url: dernier.url || null, tetes };
  }

  const adoptes = tous.filter((s) => s.resultat === "adopte").length;
  const sources = [
    { nom: "Assemblée nationale — scrutins publics (open data)", url: "https://data.assemblee-nationale.fr/travaux-parlementaires/votes" },
    { nom: "Assemblée nationale — ordre du jour", url: donnees.agenda?.sourceUrl || "https://www2.assemblee-nationale.fr/agendas/les-agendas" },
    ...(sondage?.url ? [{ nom: `Commission des sondages — notice du sondage ${sondage.institut}`, url: sondage.url }] : []),
  ];
  return {
    id: semaine.id, annee: semaine.annee, semaine: semaine.semaine, debut, fin,
    titre: `Au Parlement, semaine du ${dateLongue(debut)} au ${dateLongue(fin)}`,
    scrutins: { total: tous.length, adoptes, rejetes: tous.length - adoptes },
    textes, serres, dossiers, actualite,
    aVenir: { seances, rendezVous },
    sondage,
    sources,
  };
}

// ---------- Rendu ----------

const libResultat = (s) => (s.resultat === "adopte" ? "Adopté" : "Rejeté");
const libType = (s) => (s.type === "censure" ? "Motion de censure" : "Vote sur l'ensemble du texte");
const pluriel = (n, un, plusieurs) => `${nombre(n)} ${n > 1 ? plusieurs : un}`;
const fourchette = (t) => (t.min === t.max ? `${nombre(t.max)} %` : `${nombre(t.min)} à ${nombre(t.max)} %`);
const resume = (d) => d.scrutins.total === 0
  ? "Aucun scrutin public à l'Assemblée nationale cette semaine."
  : `${pluriel(d.scrutins.total, "scrutin public", "scrutins publics")} à l'Assemblée nationale : ${nombre(d.scrutins.adoptes)} adopté${d.scrutins.adoptes > 1 ? "s" : ""}, ${nombre(d.scrutins.rejetes)} rejeté${d.scrutins.rejetes > 1 ? "s" : ""}. ${d.textes.length ? `${pluriel(d.textes.length, "texte voté sur l'ensemble ou motion de censure", "textes votés sur l'ensemble ou motions de censure")}.` : "Aucun texte voté sur l'ensemble."}`;

/** Contenu commun (sans mise en forme) pour la page et l'e-mail : liste de sections { titre, html } avec un rendu de lien paramétrable. */
function sections(d, { lien }) {
  const out = [];
  if (d.textes.length) {
    out.push({ titre: "Textes votés dans la semaine", lignes: d.textes.map((s) => `${lien(s.pageUrl || s.url, s.titre)} — ${libType(s).toLowerCase()}, le ${s.date} : ${libResultat(s).toLowerCase()} (${nombre(s.pour)} pour, ${nombre(s.contre)} contre, ${nombre(s.abst)} abstention${s.abst > 1 ? "s" : ""}). ${lien(s.url, "Fiche officielle")}`) });
  }
  if (d.serres.length) {
    out.push({ titre: "Les votes ordinaires les plus serrés", note: "Scrutins sur un amendement ou un article, classés par plus petit écart de voix (au moins 150 votants).", lignes: d.serres.map((s) => `${lien(s.url, coupe(s.intitule, 150))} — ${libResultat(s).toLowerCase()} le ${s.date} : ${nombre(s.pour)} pour, ${nombre(s.contre)} contre (écart de ${pluriel(s.ecart, "voix", "voix")}).`) });
  }
  if (d.dossiers.length) {
    out.push({ titre: "Les textes les plus discutés", note: "Nombre de scrutins publics par texte au cours de la semaine.", lignes: d.dossiers.map((x) => `${x.url ? lien(x.url, x.titre) : esc(x.titre)} — ${pluriel(x.scrutins, "scrutin", "scrutins")}.`) });
  }
  if (d.actualite.length) {
    out.push({ titre: "Les dossiers du moment dans la presse", note: "Titres rédigés par le site à partir du recoupement de plusieurs médias ; chaque média est cité avec son article.", lignes: d.actualite.map((a) => `${esc(a.titre)} — ${pluriel(a.nbMedias, "média", "médias")}${a.articles.length ? " : " + a.articles.map((x) => lien(x.url, x.media)).join(", ") : ""}.`) });
  }
  const av = [];
  for (const j of d.aVenir.seances) av.push(`${esc(majuscule(dateCourte(j.date)))} à l'Assemblée : ${j.points.map((p) => esc(p.objet)).join(" ; ")}.`);
  for (const r of d.aVenir.rendezVous) av.push(`${esc(r.fin ? `Du ${dateCourte(r.debut)} au ${dateCourte(r.fin)}` : majuscule(dateCourte(r.debut)))}${r.lieu && r.lieu !== "—" ? `, ${esc(r.lieu)}` : ""} : ${esc(r.titre)}${r.source ? ` (${lien(r.source.url, r.source.nom)})` : ""}.`);
  if (av.length) out.push({ titre: "À venir", note: "Ordre du jour de l'Assemblée la semaine suivante et rendez-vous politiques des trois prochaines semaines.", lignes: av });
  if (d.sondage) {
    const s = d.sondage;
    out.push({ titre: "Dernier sondage de la présidentielle", note: "Premier tour, selon les hypothèses de candidats testées ; un sondage est une photographie à un instant donné, pas une prévision.", lignes: [
      `${esc(s.institut)}, enquête terminée le ${esc(dateLongue(s.dateFin))}${s.echantillon ? ` (${nombre(s.echantillon)} personnes)` : ""} : ${s.tetes.map((t) => `${esc(t.nom)} ${fourchette(t)}`).join(" ; ")}.${s.url ? " " + lien(s.url, "Notice de la Commission des sondages") : ""}`,
    ] });
  }
  return out;
}

const CSP = "default-src 'none'; style-src 'self'; img-src 'self' data:; font-src 'self'; base-uri 'none'; form-action 'none'";

export function pageDigest(d) {
  const lien = (u, t) => `<a href="${esc(u)}">${esc(t)}</a>`;
  const secs = sections(d, { lien }).map((s) => `<h2>${esc(s.titre)}</h2>${s.note ? `\n<p class="meta">${esc(s.note)}</p>` : ""}\n<ul>\n${s.lignes.map((l) => `<li>${l}</li>`).join("\n")}\n</ul>`).join("\n");
  const chemin = `digest/${d.id}/`;
  const description = coupe(resume(d), 200);
  const jsonld = { "@context": "https://schema.org", "@type": "Article", headline: d.titre, description, datePublished: d.fin, inLanguage: "fr", url: SITE + chemin, publisher: { "@type": "Organization", name: NOM_SITE } };
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(d.titre)} · ${esc(NOM_SITE)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${SITE}${chemin}">
<link rel="alternate" type="application/atom+xml" title="${esc(NOM_SITE)} · Résumé hebdomadaire" href="../../digest.xml">
<meta property="og:type" content="article">
<meta property="og:site_name" content="${esc(NOM_SITE)}">
<meta property="og:locale" content="fr_FR">
<meta property="og:title" content="${esc(d.titre)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${SITE}${chemin}">
<meta property="og:image" content="${SITE}icons/partage.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#F5F1E8">
<link rel="icon" href="../../icons/icon-192.png">
<link rel="stylesheet" href="../../pages.css">
<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, "\\u003c")}</script>
</head>
<body>
<div class="lisere" aria-hidden="true"><span></span><span></span><span></span></div>
<header><a href="../../">${esc(NOM_SITE)}</a></header>
<main>
<div class="surtitre">Résumé hebdomadaire · semaine ${d.semaine}</div>
<h1>${esc(d.titre)}</h1>
<p class="meta">${esc(resume(d))}</p>
${secs}
<h2>Sources</h2>
<ul>
${d.sources.map((s) => `<li>${lien(s.url, s.nom)}</li>`).join("\n")}
</ul>
<p class="meta">Résumé établi automatiquement à partir des données publiques du site, sans commentaire ni interprétation. S'abonner : <a href="../../digest.xml">flux Atom</a>. <a href="../">Résumés précédents</a>.</p>
<a class="bouton" href="../../">Voir le site</a>
</main>
<footer>Données publiques de l'Assemblée nationale, relevées chaque jour. <a href="../../#mentions">Mentions légales et sources</a>.</footer>
</body>
</html>
`;
}

/** Version e-mail : HTML simple (tableaux et styles en ligne, aucune image ni feuille externe), liens absolus. */
export function emailDigest(d) {
  const lien = (u, t) => `<a href="${esc(u)}" style="color:#1B3A8C;">${esc(t)}</a>`;
  const secs = sections(d, { lien }).map((s) => `<h2 style="font-family:Georgia,serif;font-size:20px;margin:28px 0 6px;color:#1C1B18;">${esc(s.titre)}</h2>${s.note ? `<p style="margin:0 0 8px;color:#47443D;font-size:14px;">${esc(s.note)}</p>` : ""}<ul style="margin:0;padding-left:20px;">${s.lignes.map((l) => `<li style="margin:0 0 8px;">${l}</li>`).join("")}</ul>`).join("\n");
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${esc(d.titre)}</title></head>
<body style="margin:0;padding:0;background:#F5F1E8;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F1E8;"><tr><td align="center" style="padding:16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FBF9F4;border:1px solid #D3CBBA;"><tr><td style="padding:24px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#1C1B18;">
<p style="margin:0;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#1B3A8C;font-weight:bold;">${esc(NOM_SITE)} · résumé hebdomadaire</p>
<h1 style="font-family:Georgia,serif;font-size:26px;line-height:1.2;margin:8px 0 12px;">${esc(d.titre)}</h1>
<p style="margin:0;color:#47443D;">${esc(resume(d))}</p>
${secs}
<h2 style="font-family:Georgia,serif;font-size:20px;margin:28px 0 6px;color:#1C1B18;">Sources</h2>
<ul style="margin:0;padding-left:20px;">${d.sources.map((s) => `<li style="margin:0 0 8px;">${lien(s.url, s.nom)}</li>`).join("")}</ul>
<p style="margin:24px 0 0;font-size:14px;color:#47443D;">Résumé établi automatiquement à partir des données publiques, sans commentaire ni interprétation. Version en ligne : ${lien(`${SITE}digest/${d.id}/`, `${SITE}digest/${d.id}/`)}</p>
</td></tr></table>
</td></tr></table>
</body></html>
`;
}

export function fluxDigest(digests) {
  const recents = [...digests].sort((a, b) => b.id.localeCompare(a.id)).slice(0, 20);
  const maj = (d) => `${d.fin}T18:00:00Z`;
  return atom({
    titre: `${NOM_SITE} · Au Parlement cette semaine`,
    sousTitre: "Résumé hebdomadaire neutre, établi à partir des données publiques de l'Assemblée nationale.",
    id: `${SITE}digest.xml`, self: `${SITE}digest.xml`, alternate: `${SITE}digest/`,
    updated: recents.length ? maj(recents[0]) : "2026-01-01T00:00:00Z",
    entrees: recents.map((d) => ({ id: `${SITE}digest/${d.id}/`, titre: d.titre, lien: `${SITE}digest/${d.id}/`, updated: maj(d), resume: resume(d) })),
  });
}

export function pageArchive(digests) {
  const liste = [...digests].sort((a, b) => b.id.localeCompare(a.id));
  const lignes = liste.map((d) => `<li><a href="${esc(d.id)}/">${esc(d.titre)}</a> — ${esc(resume(d))}</li>`).join("\n");
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Au Parlement cette semaine · ${esc(NOM_SITE)}</title>
<meta name="description" content="Un résumé neutre chaque dimanche : textes votés, dossiers du moment, dates à venir, tiré des données publiques.">
<link rel="canonical" href="${SITE}digest/">
<link rel="alternate" type="application/atom+xml" title="${esc(NOM_SITE)} · Résumé hebdomadaire" href="../digest.xml">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(NOM_SITE)}">
<meta property="og:title" content="Au Parlement cette semaine">
<meta property="og:description" content="Un résumé neutre chaque dimanche : textes votés, dossiers du moment, dates à venir.">
<meta property="og:url" content="${SITE}digest/">
<meta property="og:image" content="${SITE}icons/partage.jpg">
<meta name="theme-color" content="#F5F1E8">
<link rel="icon" href="../icons/icon-192.png">
<link rel="stylesheet" href="../pages.css">
</head>
<body>
<div class="lisere" aria-hidden="true"><span></span><span></span><span></span></div>
<header><a href="../">${esc(NOM_SITE)}</a></header>
<main>
<div class="surtitre">Résumé hebdomadaire</div>
<h1>Au Parlement cette semaine</h1>
<p class="meta">Chaque dimanche, un résumé sans commentaire, écrit à partir des données publiques. <a href="../digest.xml">S'abonner (flux Atom)</a>.</p>
<ul>
${lignes}
</ul>
</main>
<footer>Données publiques de l'Assemblée nationale, relevées chaque jour. <a href="../#mentions">Mentions légales et sources</a>.</footer>
</body>
</html>
`;
}

// ---------- Programme principal ----------

const lireJson = async (f) => (existsSync(f) ? JSON.parse(await readFile(f, "utf-8")) : null);

async function main() {
  const arg = process.argv.find((a) => a.startsWith("--semaine="));
  const semaine = arg ? semaineDepuisId(arg.slice(10)) : semaineISO(dateParis(new Date()));
  if (!semaine) throw new Error("Semaine invalide : attendu --semaine=AAAA-Wss (ex. 2026-W41).");
  const lois = (await lireJson("data/lois.json"))?.lois || [];
  lois.forEach(completer);
  const donnees = {
    lois,
    sondages: await lireJson("data/sondages.json"),
    meetings: await lireJson("data/meetings.json"),
    agenda: await lireJson("data/agenda-an.json"),
    actualites: await lireJson("data/actualites.json"),
  };
  const d = construireDigest(donnees, { semaine, maintenant: arg ? undefined : new Date(), pageVote: (n) => existsSync(`v/${n}.html`) });
  let ecrits = 0;
  ecrits += ecrireSiChange(`data/digest/${d.id}.json`, JSON.stringify(d, null, 1) + "\n");
  ecrits += ecrireSiChange(`digest/${d.id}/index.html`, pageDigest(d));
  ecrits += ecrireSiChange(`digest/${d.id}/email.html`, emailDigest(d));
  const tous = [];
  for (const f of existsSync("data/digest") ? (await readdir("data/digest")).filter((n) => /^\d{4}-W\d{2}\.json$/.test(n)) : []) tous.push(JSON.parse(await readFile(`data/digest/${f}`, "utf-8")));
  ecrits += ecrireSiChange("digest.xml", fluxDigest(tous));
  ecrits += ecrireSiChange("digest/index.html", pageArchive(tous));
  console.log(`[digest] ${d.id} : ${d.scrutins.total} scrutin(s), ${d.textes.length} texte(s) voté(s), ${d.actualite.length} dossier(s) presse, ${d.aVenir.seances.length} séance(s) et ${d.aVenir.rendezVous.length} rendez-vous à venir${d.sondage ? ", sondage " + d.sondage.institut : ""} ; ${ecrits} fichier(s) écrit(s).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error("[digest] " + e.message); process.exit(1); });
}
