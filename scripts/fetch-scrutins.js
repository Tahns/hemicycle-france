#!/usr/bin/env node
/**
 * fetch-scrutins.js
 * ------------------
 * Récupère les nouveaux scrutins publiés par l'Assemblée nationale (open data officiel)
 * et met à jour data/lois.json avec le détail des votes par groupe.
 *
 * SOURCES OFFICIELLES (aucune donnée inventée) :
 *   Scrutins :
 *   https://data.assemblee-nationale.fr/static/openData/repository/17/loi/scrutins/Scrutins.json.zip
 *   Dossiers législatifs (titre court du texte, auteur) :
 *   https://data.assemblee-nationale.fr/static/openData/repository/17/loi/dossiers_legislatifs/Dossiers_Legislatifs.json.zip
 *   Organes (pour résoudre organeRef -> sigle du groupe politique) :
 *   https://data.assemblee-nationale.fr/static/openData/repository/17/amo/tous_acteurs_mandats_organes_xi_legislature/AMO30_tous_acteurs_tous_mandats_tous_organes_historique.json.zip
 *   Licence ouverte Etalab.
 *
 * PRINCIPE DE SÉCURITÉ (important) : ce script ne fait JAMAIS confiance à sa propre lecture
 * du JSON sans vérification. Pour chaque scrutin, la somme des votes qu'il extrait par groupe
 * est recomparée à la synthèse officielle du scrutin (pour/contre/abstentions). Si ça ne
 * correspond pas exactement, le scrutin est REJETÉ et signalé dans le rapport plutôt que publié
 * avec un chiffre potentiellement faux — cohérent avec la règle du site : jamais de données
 * inventées ou approximatives.
 *
 * Le détail par groupe des scrutins de l'AN ne contient pas le sigle du groupe directement :
 * chaque groupe n'y est identifié que par un "organeRef" (identifiant opaque, ex. "PO845401").
 * Pour retrouver le sigle (ex. "RN"), ce script télécharge donc aussi le jeu de données AMO30
 * ("tous acteurs, tous mandats, tous organes, historique") et construit la correspondance
 * organeRef -> sigle à partir des organes de type "GP" (groupe politique) de la législature 17.
 * On utilise volontairement le jeu de données HISTORIQUE (AMO30) plutôt que le jeu "actifs
 * uniquement" (AMO10) : un scrutin ancien peut référencer un organeRef de groupe depuis
 * renommé ou dissous (ex. un groupe qui change de nom en cours de législature reçoit un nouvel
 * organeRef ; l'ancien n'apparaît plus dans les organes "actifs" mais reste référencé par les
 * scrutins passés). Sans l'historique, ces scrutins seraient rejetés à tort faute de sigle
 * résolu — jamais en devinant, toujours depuis la donnée officielle.
 *
 * USAGE :
 *   node scripts/fetch-scrutins.js              # récupère et met à jour data/lois.json
 *   node scripts/fetch-scrutins.js --dry-run     # affiche ce qui serait ajouté, sans écrire
 *   node scripts/fetch-scrutins.js --limit=20    # ne traite que les 20 scrutins les + récents
 *   node scripts/fetch-scrutins.js --rebuild     # re-dérive TOUS les scrutins auto depuis l'archive
 *                                                # (à lancer après une correction du parseur ; les
 *                                                # annotations manuelles des entrées sont conservées)
 *
 * DÉPENDANCES : Node.js 18+ (fetch natif), aucun paquet npm requis.
 */

import { readFile, writeFile, mkdtemp, readdir } from "fs/promises";
import { createWriteStream, existsSync } from "fs";
import path from "path";
import os from "os";
import { pipeline } from "stream/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import { construireDeputes } from "./deputes.js";
import { completer, compacter } from "./lois-format.js";

const execFileAsync = promisify(execFile);

const SCRUTINS_ZIP_URL =
  "https://data.assemblee-nationale.fr/static/openData/repository/17/loi/scrutins/Scrutins.json.zip";

// Jeu de données "tous organes, historique" — sert uniquement à résoudre organeRef -> sigle
// du groupe politique (voir buildOrganeRefToSigle ci-dessous). Contient aussi les organes
// dissous/renommés (contrairement au jeu "actifs uniquement"), nécessaire pour résoudre
// certains scrutins passés référençant un ancien organeRef de groupe.
const ORGANES_ZIP_URL =
  "https://data.assemblee-nationale.fr/static/openData/repository/17/amo/tous_acteurs_mandats_organes_xi_legislature/AMO30_tous_acteurs_tous_mandats_tous_organes_historique.json.zip";

const DOSSIERS_ZIP_URL =
  "https://data.assemblee-nationale.fr/static/openData/repository/17/loi/dossiers_legislatifs/Dossiers_Legislatifs.json.zip";

const LEGISLATURE = "17";

// Remplis par buildActeurGroupes() : nom affiché de chaque acteur, et nature de chaque mandat
// (sert à dire si un texte a été déposé par le Gouvernement ou par un député).
const ACTEURS_NOMS = {};
const ACTEURS_FEMMES = new Set();
// Groupes politiques en activité (uid -> libellé) et appartenances en cours, pour data/groupes.json
const GROUPES_ACTIFS = {};
const APPARTENANCES_ACTUELLES = []; // { acteurRef, organeRef, qualite, debut }
const MANDATS = {};

const DATA_FILE = path.resolve("data/lois.json");
const REPORT_FILE = path.resolve("data/fetch-scrutins-report.json");
const GROUPES_FILE = path.resolve("data/groupes.json");
const DEPUTES_FILE = path.resolve("data/deputes.json");

// Table de correspondance entre le sigle officiel du groupe (tel que publié par l'AN,
// résolu via organeRef -> organe.libelleAbrev) et l'identifiant court utilisé sur le site.
// À ajuster si l'AN change un sigle (ex. en cas de scission/fusion de groupe) — le script log
// un avertissement pour tout sigle rencontré qui n'est pas dans cette table, plutôt que de
// l'ignorer silencieusement.
const SIGLE_VERS_ID = {
  "RN": "RN",
  "EPR": "EPR",
  "REN": "EPR", // ancien sigle Renaissance, gardé en compatibilité
  "LFI-NFP": "LFI",
  "LFI": "LFI",
  "SOC": "SOC",
  "DR": "LR", // "Droite Républicaine", nom du groupe LR depuis 2024
  "LR": "LR",
  "ECOS": "ECO",
  "ECOLO": "ECO",
  "DEM": "DEM",
  "HOR": "HOR",
  "GDR": "GDR",
  "LIOT": "LIOT",
  "UDR": "UDR",
  "UDDPLR": "UDR", // sigle officiel AN pour "Union des droites pour la République"
  "NI": "NI",
};

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const REBUILD = args.includes("--rebuild");

// Champs ajoutés à la main sur une entrée auto (titre court, contexte, thème…) : conservés
// lors d'un --rebuild, qui ne ré-écrit que les champs dérivés de l'open data.
const CHAMPS_MANUELS = ["titreCourt", "theme", "proposePar", "groupeMoteur", "contexte"];
const LIMIT_ARG = args.find((a) => a.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split("=")[1], 10) : Infinity;

function log(...m) {
  console.log("[fetch-scrutins]", ...m);
}
function warn(...m) {
  console.warn("[fetch-scrutins][ATTENTION]", ...m);
}

async function downloadAndExtract(url, destDir) {
  const zipPath = path.join(destDir, "archive.zip");
  log("Téléchargement :", url);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Échec du téléchargement (${res.status} ${res.statusText}) — l'URL a peut-être changé, vérifier data.assemblee-nationale.fr/opendata`);
  }
  await pipeline(res.body, createWriteStream(zipPath));
  log("Décompression…");
  // Utilise l'utilitaire `unzip` du système (présent sur les runners GitHub Actions ubuntu-latest)
  await execFileAsync("unzip", ["-q", "-o", zipPath, "-d", destDir]);
  return destDir;
}

async function listScrutinFiles(dir) {
  const { stdout } = await execFileAsync("find", [dir, "-name", "*.json", "-type", "f"]);
  return stdout.split("\n").filter(Boolean);
}

/**
 * Cherche récursivement un dossier nommé `name` sous `base` (l'archive des organes n'a pas
 * toujours la même profondeur de dossiers selon les exports de l'AN, ex. "json/organe/").
 */
async function findDirNamed(base, name) {
  const entries = await readdir(base, { withFileTypes: true });
  for (const e of entries) {
    if (e.isDirectory()) {
      if (e.name === name) return path.join(base, e.name);
      const found = await findDirNamed(path.join(base, e.name), name);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Construit la correspondance organeRef (uid, ex. "PO845401") -> sigle officiel (ex. "RN")
 * à partir des fichiers organe de type "GP" (groupe politique) de la législature 17, en
 * puisant dans l'archive historique AMO30 (inclut les organes dissous/renommés, pas
 * seulement les organes actifs aujourd'hui). Ne fait aucune supposition : si le dossier
 * "organe" est introuvable ou vide, retourne une table vide (les scrutins seront alors
 * rejetés faute de sigle résolu, jamais publiés avec un sigle deviné).
 */
async function buildOrganeRefToSigle(dir) {
  const organeDir = await findDirNamed(dir, "organe");
  const table = {};
  if (!organeDir) {
    warn("Dossier 'organe' introuvable dans l'archive des organes — aucune correspondance organeRef -> sigle disponible.");
    return table;
  }
  const files = await readdir(organeDir);
  let nbGroupes = 0;
  for (const f of files) {
    let raw;
    try {
      raw = JSON.parse(await readFile(path.join(organeDir, f), "utf-8"));
    } catch {
      continue;
    }
    const o = raw.organe;
    if (o && o.codeType === "GP" && o.legislature === LEGISLATURE && o.uid && o.libelleAbrev) {
      table[o.uid] = o.libelleAbrev;
      if (!o.viMoDe?.dateFin) GROUPES_ACTIFS[o.uid] = o.libelle;
      nbGroupes++;
    }
  }
  log(`${nbGroupes} groupe(s) politique(s) résolu(s) depuis l'archive des organes (législature ${LEGISLATURE}, y compris groupes dissous/renommés).`);
  return table;
}

/**
 * Construit, depuis les fichiers "acteur" de l'archive AMO30, l'historique des appartenances
 * de chaque député à un groupe politique (législature 17) : acteurRef -> [{ debut, fin, organeRef }].
 * Sert uniquement à résoudre les groupes que l'AN publie avec un organeRef vide ("PO0") :
 * on retrouve alors le groupe à partir des députés nominativement listés dans ce groupe.
 */
async function buildActeurGroupes(dir) {
  const acteurDir = await findDirNamed(dir, "acteur");
  const index = {};
  if (!acteurDir) {
    warn("Dossier 'acteur' introuvable dans l'archive AMO30 — les groupes 'PO0' ne pourront pas être résolus.");
    return index;
  }
  for (const f of await readdir(acteurDir)) {
    let raw;
    try {
      raw = JSON.parse(await readFile(path.join(acteurDir, f), "utf-8"));
    } catch {
      continue;
    }
    const a = raw.acteur;
    const uid = a?.uid?.["#text"] || a?.uid;
    const mandats = a?.mandats?.mandat;
    if (!uid || !mandats) continue;
    const ident = a.etatCivil?.ident;
    if (ident?.nom) ACTEURS_NOMS[uid] = `${ident.prenom || ""} ${ident.nom}`.trim();
    if (ident?.civ === "Mme") ACTEURS_FEMMES.add(uid);
    for (const m of Array.isArray(mandats) ? mandats : [mandats]) {
      const muid = m.uid?.["#text"] || m.uid;
      if (muid) MANDATS[muid] = { typeOrgane: m.typeOrgane, qualite: m.infosQualite?.libQualite || null };
      if (m.typeOrgane !== "GP" || m.legislature !== LEGISLATURE) continue;
      if (!m.dateFin) APPARTENANCES_ACTUELLES.push({ acteurRef: uid, organeRef: m.organes?.organeRef, qualite: m.infosQualite?.codeQualite || null, debut: m.dateDebut });
      (index[uid] ||= []).push({ debut: m.dateDebut, fin: m.dateFin || null, organeRef: m.organes?.organeRef });
    }
  }
  return index;
}

/**
 * Index des dossiers législatifs : uid -> { titre, procedure, initiateurs: [{acteurRef, mandatRef}] }.
 */
async function buildDossiers(dir) {
  const dossierDir = await findDirNamed(dir, "dossierParlementaire");
  const index = {};
  if (!dossierDir) {
    warn("Dossier 'dossierParlementaire' introuvable — titres courts et auteurs non renseignés.");
    return index;
  }
  for (const f of await readdir(dossierDir)) {
    let raw;
    try {
      raw = JSON.parse(await readFile(path.join(dossierDir, f), "utf-8"));
    } catch {
      continue;
    }
    const d = raw.dossierParlementaire;
    if (!d?.uid) continue;
    const acteurs = d.initiateur?.acteurs?.acteur;
    index[d.uid] = {
      titre: d.titreDossier?.titre || null,
      procedure: d.procedureParlementaire?.libelle || null,
      initiateurs: acteurs ? (Array.isArray(acteurs) ? acteurs : [acteurs]) : [],
    };
  }
  log(`${Object.keys(index).length} dossier(s) législatif(s) indexé(s).`);
  return index;
}

/**
 * Auteur d'un texte, déduit du mandat du premier initiateur : ministre -> « Gouvernement »,
 * député -> « Prénom Nom (groupe à la date du vote) et N autres ». Rien si non déterminable.
 */
function auteurDossier(dossier, dateScrutin, acteurGroupes, organeRefToSigle) {
  const premier = dossier?.initiateurs?.[0];
  if (!premier) return null;
  const mandat = MANDATS[premier.mandatRef];
  const nom = ACTEURS_NOMS[premier.acteurRef];
  if (!mandat || !nom) return null;
  const autres = dossier.initiateurs.length - 1;
  const etAutres = (mot) => (autres > 0 ? ` et ${autres} autre${autres > 1 ? "s" : ""} ${mot}${autres > 1 ? "s" : ""}` : "");
  switch (mandat.typeOrgane) {
    case "MINISTERE":
    case "GOUVERNEMENT":
      return `Gouvernement (${nom})`;
    case "PRESREP":
      return `Président de la République (${nom})`;
    case "SENAT":
      return `${nom}, ${ACTEURS_FEMMES.has(premier.acteurRef) ? "sénatrice" : "sénateur"}${etAutres("sénateur")}`;
    case "ASSEMBLEE": {
      // Groupe à la date du vote, sinon dernier groupe connu avant cette date (député devenu ministre…)
      const gps = (acteurGroupes[premier.acteurRef] || []).filter((x) => x.debut <= dateScrutin).sort((a, b) => b.debut.localeCompare(a.debut));
      const gp = gps.find((x) => !x.fin || x.fin >= dateScrutin) || gps[0];
      const groupe = gp && SIGLE_VERS_ID[organeRefToSigle[gp.organeRef]];
      return `${nom}${groupe ? ` (${groupe})` : ""}${etAutres("député")}`;
    }
    default:
      return null;
  }
}

function acteursNominatifs(g) {
  const dn = g.vote?.decompteNominatif || {};
  const refs = [];
  for (const cle of ["pours", "contres", "abstentions", "nonVotants"]) {
    const v = dn[cle]?.votant;
    if (!v) continue;
    for (const x of Array.isArray(v) ? v : [v]) if (x.acteurRef) refs.push(x.acteurRef);
  }
  return refs;
}

/**
 * Résout un groupe publié avec organeRef "PO0" : tous les députés nominativement listés doivent
 * appartenir au même groupe à la date du scrutin, sinon on renonce (jamais de devinette).
 */
function resoudreGroupeAnonyme(g, dateScrutin, acteurGroupes) {
  const refs = acteursNominatifs(g);
  if (refs.length === 0) return null;
  const trouves = new Set();
  for (const r of refs) {
    const m = (acteurGroupes[r] || []).find((x) => x.debut <= dateScrutin && (!x.fin || x.fin >= dateScrutin));
    if (!m) return null;
    trouves.add(m.organeRef);
  }
  return trouves.size === 1 ? [...trouves][0] : null;
}

/**
 * Sérialise data/lois.json avec une entrée par ligne : ~2x plus léger à télécharger que
 * l'indentation complète, tout en gardant des diffs git lisibles (un scrutin = une ligne).
 */
function serialiserLois(data) {
  const { lois, ...entete } = data;
  const lignesEntete = Object.entries(entete).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
  return ["{", ...lignesEntete, '  "lois": [', lois.map((l) => "    " + JSON.stringify(compacter(l))).join(",\n"), "  ]", "}", ""].join("\n");
}

/**
 * data/groupes.json : pour chaque groupe politique en activité, libellé officiel, président·e
 * et nombre de membres (membres + apparentés), d'après les mandats en cours dans l'archive AMO30.
 */
function construireGroupes(organeRefToSigle) {
  const groupes = {};
  for (const [uid, libelle] of Object.entries(GROUPES_ACTIFS)) {
    const id = SIGLE_VERS_ID[organeRefToSigle[uid]];
    if (!id) continue;
    const mandats = APPARTENANCES_ACTUELLES.filter((a) => a.organeRef === uid);
    const pres = mandats.find((a) => a.qualite === "Président");
    groupes[id] = {
      libelle,
      // un président a deux mandats ouverts (« Membre » et « Président ») : on compte les députés, pas les mandats
      membres: new Set(mandats.map((a) => a.acteurRef)).size,
      ...(pres && ACTEURS_NOMS[pres.acteurRef]
        ? { president: ACTEURS_NOMS[pres.acteurRef], presidente: ACTEURS_FEMMES.has(pres.acteurRef), presidentDepuis: pres.debut }
        : {}),
    };
  }
  return groupes;
}

function moisFr(m) {
  const mois = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
  return mois[m];
}

function formatDateFr(isoDate) {
  const d = new Date(isoDate);
  return `${d.getDate()} ${moisFr(d.getMonth())} ${d.getFullYear()}`;
}

function infosDossier(s, dateScrutin, organeRefToSigle, acteurGroupes, dossiers) {
  const ref = s.objet?.dossierLegislatif?.dossierRef;
  if (!ref) return {};
  const d = dossiers[ref];
  const out = {
    dossierRef: ref,
    dossierTitre: d?.titre || s.objet.dossierLegislatif.libelle || null,
    dossierUrl: `https://www.assemblee-nationale.fr/dyn/17/dossiers/${ref}`,
  };
  const auteur = d && auteurDossier(d, dateScrutin, acteurGroupes, organeRefToSigle);
  if (auteur) out.auteur = auteur;
  return out;
}

/**
 * Extrait le détail par groupe d'un objet scrutin brut (JSON tel que publié par l'AN),
 * et vérifie que la somme recalculée correspond à la synthèse officielle.
 * `organeRefToSigle` est la correspondance construite par buildOrganeRefToSigle(),
 * `acteurGroupes` celle de buildActeurGroupes() (pour les groupes publiés en "PO0").
 * Retourne { ok: true, votes, ... } ou { ok: false, raison }.
 */
function parseScrutin(raw, organeRefToSigle, acteurGroupes = {}, dossiers = {}) {
  const s = raw.scrutin;
  if (!s) return { ok: false, raison: "pas de clé 'scrutin' à la racine" };

  const numero = s.numero;
  const dateScrutin = s.dateScrutin;
  const titre = s.titre || s.objet?.libelle || "(titre non renseigné)";
  const synthese = s.syntheseVote?.decompte;
  if (!synthese) return { ok: false, raison: `scrutin ${numero} : pas de syntheseVote.decompte officielle, on ne publie pas` };

  const officiel = {
    pour: parseInt(synthese.pour, 10) || 0,
    contre: parseInt(synthese.contre, 10) || 0,
    abstentions: parseInt(synthese.abstentions, 10) || 0,
  };

  const groupesRaw = s.ventilationVotes?.organe?.groupes?.groupe;
  if (!groupesRaw) return { ok: false, raison: `scrutin ${numero} : pas de détail par groupe disponible dans ce fichier` };
  const groupesArr = Array.isArray(groupesRaw) ? groupesRaw : [groupesRaw];

  const votes = {};
  const sigleInconnus = [];
  let sommePour = 0, sommeContre = 0, sommeAbst = 0;

  for (const g of groupesArr) {
    const decompteBrut = g.vote?.decompteVoix || g.decompteVoix;
    let organeRef = g.organeRef;
    if (organeRef === "PO0") {
      organeRef = resoudreGroupeAnonyme(g, dateScrutin, acteurGroupes);
      // Groupe anonyme sans aucun député listé ni aucune voix : il ne pèse rien dans le
      // décompte, on l'omet (il apparaîtra "non communiqué") plutôt que de rejeter le scrutin.
      if (!organeRef && decompteBrut && acteursNominatifs(g).length === 0 &&
          ["pour", "contre", "abstentions", "nonVotants"].every((k) => !parseInt(decompteBrut[k], 10))) {
        continue;
      }
    }
    // Le sigle n'est jamais inline dans les exports actuels de l'AN : chaque groupe n'est
    // identifié que par organeRef. On tente néanmoins les emplacements inline connus en premier
    // (au cas où l'AN les ajouterait un jour ou pour d'anciens formats), puis on résout via la
    // table organeRef -> sigle construite depuis la donnée officielle des organes.
    const sigleTrouve =
      g.sigle ||
      g.organe?.libelleAbrev ||
      g.libelleAbrev ||
      (organeRef && organeRefToSigle[organeRef]) ||
      null;
    const decompte = decompteBrut;
    if (!sigleTrouve || !decompte) {
      sigleInconnus.push(g.organeRef || JSON.stringify(g).slice(0, 80));
      continue;
    }
    const id = SIGLE_VERS_ID[sigleTrouve];
    if (!id) {
      warn(`Sigle de groupe non reconnu : "${sigleTrouve}" (scrutin ${numero}) — ajouter dans SIGLE_VERS_ID si c'est un nouveau groupe légitime`);
      sigleInconnus.push(sigleTrouve);
      continue;
    }
    const pour = parseInt(decompte.pour, 10) || 0;
    const contre = parseInt(decompte.contre, 10) || 0;
    const abst = parseInt(decompte.abstention ?? decompte.abstentions, 10) || 0;
    if (votes[id]) {
      return { ok: false, raison: `scrutin ${numero} : deux groupes de l'AN correspondent au même groupe du site (${id})` };
    }
    votes[id] = { pour, contre, abst };
    const membres = parseInt(g.nombreMembresGroupe, 10);
    if (membres) votes[id].membres = membres;
    sommePour += pour;
    sommeContre += contre;
    sommeAbst += abst;
  }

  // Garde-fou : si des groupes n'ont pas pu être identifiés, on ne publie pas silencieusement
  // un scrutin incomplet — mieux vaut le signaler et attendre une correction de la table de sigles.
  if (sigleInconnus.length > 0) {
    return { ok: false, raison: `scrutin ${numero} : groupes non résolus (${sigleInconnus.join(", ")}) — table SIGLE_VERS_ID à compléter` };
  }

  // Garde-fou principal : recoupement avec la synthèse officielle du scrutin.
  if (sommePour !== officiel.pour || sommeContre !== officiel.contre || sommeAbst !== officiel.abstentions) {
    return {
      ok: false,
      raison: `scrutin ${numero} : somme par groupe (${sommePour}/${sommeContre}/${sommeAbst}) ≠ synthèse officielle (${officiel.pour}/${officiel.contre}/${officiel.abstentions}) — rejeté plutôt que publié avec un écart`,
    };
  }

  return {
    ok: true,
    id: `an-scrutin-${numero}`,
    numero: parseInt(numero, 10),
    titre,
    date: formatDateFr(dateScrutin),
    dateISO: dateScrutin,
    typeVote: s.typeVote?.codeTypeVote || null, // SPO ordinaire, SPS solennel, MOC motion de censure…
    ...infosDossier(s, dateScrutin, organeRefToSigle, acteurGroupes, dossiers),
    // `sort` est un objet { code: "adopté" | "rejeté", libelle } dans les exports de l'AN
    // (le tester directement comme une chaîne donnait "[object Object]" → toujours "rejete").
    resultat: /adopt/i.test(s.sort?.code || s.sort?.libelle || s.syntheseVote?.annonce || "") ? "adopte" : "rejete",
    theme: "À catégoriser", // pas de thème officiel fourni par l'AN — à corriger manuellement dans data/lois.json si besoin
    reel: true,
    source: "auto-assemblee-nationale",
    sourceLabel: `Assemblée nationale — scrutin n°${numero}`,
    sourceUrl: `https://www.assemblee-nationale.fr/dyn/17/scrutins/${numero}`,
    votes,
  };
}

async function main() {
  log(DRY_RUN ? "Mode dry-run (aucune écriture)" : REBUILD ? "Mode reconstruction (--rebuild)" : "Mode normal");

  const existing = JSON.parse(await readFile(DATA_FILE, "utf-8").catch(() => '{"lois":[]}'));
  existing.lois.forEach(completer); // champs déduits du numéro (format compact, voir lois-format.js)
  const existingById = new Map(existing.lois.map((l) => [l.id, l]));

  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "an-scrutins-"));
  await downloadAndExtract(SCRUTINS_ZIP_URL, tmpDir);
  const files = await listScrutinFiles(tmpDir);
  log(`${files.length} fichiers de scrutins trouvés dans l'archive.`);

  const organesDir = await mkdtemp(path.join(os.tmpdir(), "an-organes-"));
  await downloadAndExtract(ORGANES_ZIP_URL, organesDir);
  const organeRefToSigle = await buildOrganeRefToSigle(organesDir);
  const acteurGroupes = await buildActeurGroupes(organesDir);

  const dossiersDir = await mkdtemp(path.join(os.tmpdir(), "an-dossiers-"));
  await downloadAndExtract(DOSSIERS_ZIP_URL, dossiersDir);
  const dossiers = await buildDossiers(dossiersDir);

  const nouveaux = [];
  const misAJour = [];
  const rejets = [];
  let traites = 0;

  // Tri numérique du plus récent au plus ancien (un tri alphabétique placerait "V999" après "V8434").
  const numeroFichier = (f) => parseInt(path.basename(f).match(/V(\d+)\.json$/)?.[1] || "0", 10);
  files.sort((a, b) => numeroFichier(b) - numeroFichier(a));

  for (const f of files) {
    if (traites >= LIMIT) break;
    let raw;
    try {
      raw = JSON.parse(await readFile(f, "utf-8"));
    } catch (e) {
      rejets.push({ fichier: path.basename(f), raison: `JSON illisible : ${e.message}` });
      continue;
    }
    const numero = raw?.scrutin?.numero;
    const id = `an-scrutin-${numero}`;
    const connu = existingById.get(id);
    if (connu && !REBUILD) continue; // déjà connu

    traites++;
    const parsed = parseScrutin(raw, organeRefToSigle, acteurGroupes, dossiers);
    if (!parsed.ok) {
      // En reconstruction, une entrée déjà publiée n'est jamais supprimée sur un simple échec de parsing.
      rejets.push({ fichier: path.basename(f), raison: parsed.raison });
      continue;
    }
    const { ok, ...entree } = parsed;
    if (connu) {
      for (const champ of CHAMPS_MANUELS) {
        const v = connu[champ];
        const vide = v === undefined || v === "À catégoriser" || /^Non renseigné automatiquement/.test(v);
        if (!vide) entree[champ] = v;
      }
      // Comparaison sur le format compact, champs triés : l'ordre des champs n'est pas un changement
      const canonique = (o) => JSON.stringify(Object.fromEntries(Object.entries(compacter(o)).sort()));
      if (canonique(connu) !== canonique(entree)) {
        existingById.set(id, entree);
        misAJour.push(entree);
      }
    } else {
      existingById.set(id, entree);
      nouveaux.push(entree);
    }
  }

  log(`${nouveaux.length} nouveau(x) scrutin(s), ${misAJour.length} mis à jour, ${rejets.length} rejeté(s).`);

  if ((nouveaux.length > 0 || misAJour.length > 0) && !DRY_RUN) {
    // Entrées auto triées du plus récent au plus ancien ; les éventuelles entrées manuelles en tête.
    const lois = [...existingById.values()];
    const manuelles = lois.filter((l) => l.numero === undefined);
    const auto = lois.filter((l) => l.numero !== undefined).sort((a, b) => b.numero - a.numero);
    existing.lois = [...manuelles, ...auto];
    existing.lastUpdated = new Date().toISOString();
    await writeFile(DATA_FILE, serialiserLois(existing));
    log("data/lois.json mis à jour.");
  }

  // Députés en fonction : circonscription, statistiques et votes clés (réécrit seulement si le contenu change)
  const acteurDir = await findDirNamed(organesDir, "acteur");
  if (acteurDir) {
    const organeVersId = Object.fromEntries(Object.entries(organeRefToSigle).map(([o, sigle]) => [o, SIGLE_VERS_ID[sigle]]).filter(([, id]) => id));
    const { cles, deputes } = await construireDeputes(files, acteurDir, organeVersId);
    const anciens = JSON.parse(await readFile(DEPUTES_FILE, "utf-8").catch(() => "{}"));
    if (deputes.length >= 500 && JSON.stringify(anciens.deputes) + JSON.stringify(anciens.cles) !== JSON.stringify(deputes) + JSON.stringify(cles) && !DRY_RUN) {
      await writeFile(DEPUTES_FILE, JSON.stringify({ lastUpdated: new Date().toISOString(), source: "Assemblée nationale — votes nominatifs et AMO30", cles, deputes }) + "\n");
      log(`data/deputes.json mis à jour (${deputes.length} députés, ${cles.length} votes clés).`);
    } else if (deputes.length < 500) {
      warn(`Seulement ${deputes.length} député(s) en fonction trouvé(s) : data/deputes.json n'est pas modifié.`);
    } else {
      log(`data/deputes.json : aucun changement (${deputes.length} députés, ${cles.length} votes clés).`);
    }
  }

  // Groupes politiques (présidences, effectifs) : réécrit seulement si le contenu change
  const groupes = construireGroupes(organeRefToSigle);
  const anciensGroupes = JSON.parse(await readFile(GROUPES_FILE, "utf-8").catch(() => "{}"));
  if (Object.keys(groupes).length >= 8 && JSON.stringify(anciensGroupes.groupes) !== JSON.stringify(groupes) && !DRY_RUN) {
    await writeFile(GROUPES_FILE, JSON.stringify({ lastUpdated: new Date().toISOString(), source: "Assemblée nationale — open data AMO30", groupes }, null, 2) + "\n");
    log("data/groupes.json mis à jour.");
  }

  // Le rapport n'est réécrit que si son contenu change (évite un commit quotidien pour un simple horodatage).
  const rapport = {
    dryRun: DRY_RUN,
    nouveaux: nouveaux.map((n) => ({ id: n.id, titre: n.titre, date: n.date })),
    misAJour: misAJour.length,
    rejets,
  };
  const ancien = JSON.parse(await readFile(REPORT_FILE, "utf-8").catch(() => "{}"));
  delete ancien.executedAt;
  if (JSON.stringify(ancien) !== JSON.stringify(rapport)) {
    await writeFile(REPORT_FILE, JSON.stringify({ executedAt: new Date().toISOString(), ...rapport }, null, 2) + "\n");
    log("Rapport écrit dans data/fetch-scrutins-report.json — à consulter en cas de rejets.");
  }

  if (nouveaux.length === 0) {
    log("Aucun nouveau scrutin ajouté à cette exécution.");
  }
}

main().catch((e) => {
  console.error("[fetch-scrutins] ÉCHEC :", e);
  process.exitCode = 1;
});
