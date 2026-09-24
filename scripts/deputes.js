/**
 * deputes.js
 * ----------
 * Construit data/deputes.json : les 577 députés en fonction, leur circonscription, leur groupe,
 * des statistiques de vote sur tous les scrutins publics depuis leur prise de fonction, et leur
 * vote sur chaque « vote clé » (ensemble d'un texte, motion de censure, déclaration de politique
 * générale). Appelé par fetch-scrutins.js, qui a déjà téléchargé les archives de l'Assemblée.
 *
 * Tout vient des votes nominatifs publiés par l'Assemblée (decompteNominatif) : rien n'est estimé.
 *
 * Utilisable seul pour les tests :
 *   node scripts/deputes.js <dossier des scrutins> <dossier AMO30> [sortie]
 */

import { readFile, readdir, writeFile } from "fs/promises";
import path from "path";

const LEGISLATURE = "17";

// Code d'un vote dans la chaîne des votes clés (une lettre par vote clé, du plus récent au plus ancien)
//   p pour · c contre · a abstention · n non-votant (ex. président de séance) · - n'a pas pris part au vote
//   . pas encore en fonction à cette date
const CODES = { pours: "p", contres: "c", abstentions: "a", nonVotants: "n" };
const POSITIONS = { p: "pour", c: "contre", a: "abstention" };

export function estVoteCle(titre, typeVote) {
  const t = String(titre || "").replace(/’/g, "'").toLowerCase();
  return typeVote === "MOC" || t.startsWith("la motion de censure") || t.startsWith("la déclaration de politique générale") || t.startsWith("l'ensemble");
}

async function fichiersJson(dir) {
  const sortie = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) sortie.push(...(await fichiersJson(p)));
    else if (e.name.endsWith(".json")) sortie.push(p);
  }
  return sortie;
}

/**
 * @param scrutinFiles  chemins des fichiers de scrutins (archive Scrutins.json.zip décompressée)
 * @param acteurDir     dossier « acteur » de l'archive AMO30
 * @param organeVersId  organeRef d'un groupe politique -> identifiant du site (ex. "PO845401" -> "RN")
 */
export async function construireDeputes(scrutinFiles, acteurDir, organeVersId) {
  // 1. Députés en fonction : mandat ASSEMBLEE de la législature sans date de fin
  const deputes = new Map();
  for (const f of await readdir(acteurDir)) {
    let a;
    try { a = JSON.parse(await readFile(path.join(acteurDir, f), "utf-8")).acteur; } catch { continue; }
    const uid = a?.uid?.["#text"] || a?.uid;
    let mandats = a?.mandats?.mandat;
    if (!uid || !mandats) continue;
    mandats = Array.isArray(mandats) ? mandats : [mandats];
    const m = mandats.find((x) => x.typeOrgane === "ASSEMBLEE" && x.legislature === LEGISLATURE && !x.dateFin);
    if (!m) continue;
    const gp = mandats.find((x) => x.typeOrgane === "GP" && x.legislature === LEGISLATURE && !x.dateFin);
    const ident = a.etatCivil?.ident || {};
    const lieu = m.election?.lieu || {};
    deputes.set(uid, {
      id: uid,
      nom: `${ident.prenom || ""} ${ident.nom || ""}`.trim(),
      tri: String(ident.alpha || ident.nom || "").toLowerCase(),
      f: ident.civ === "Mme" ? 1 : 0,
      groupe: (gp && organeVersId[gp.organes?.organeRef]) || "NI",
      dep: lieu.departement || "",
      numDep: lieu.numDepartement || "",
      circo: parseInt(lieu.numCirco, 10) || null,
      depuis: m.mandature?.datePriseFonction || m.dateDebut,
      stats: { scrutins: 0, pour: 0, contre: 0, abst: 0, ecarts: 0 },
      _cles: {},
    });
  }

  // 2. Parcours de tous les scrutins
  const cles = [];
  for (const f of scrutinFiles) {
    let s;
    try { s = JSON.parse(await readFile(f, "utf-8")).scrutin; } catch { continue; }
    if (!s?.numero || !s.dateScrutin) continue;
    const numero = parseInt(s.numero, 10);
    const date = s.dateScrutin;
    const cle = estVoteCle(s.titre || s.objet?.libelle, s.typeVote?.codeTypeVote);
    if (cle) cles.push(numero);

    for (const d of deputes.values()) if (date >= d.depuis) d.stats.scrutins++;

    let groupes = s.ventilationVotes?.organe?.groupes?.groupe || [];
    groupes = Array.isArray(groupes) ? groupes : [groupes];
    for (const g of groupes) {
      const majo = g.vote?.positionMajoritaire; // "pour" | "contre" | "abstention"
      const dn = g.vote?.decompteNominatif || {};
      for (const [cleDn, code] of Object.entries(CODES)) {
        let v = dn[cleDn]?.votant;
        if (!v) continue;
        for (const x of Array.isArray(v) ? v : [v]) {
          const d = deputes.get(x.acteurRef);
          if (!d || date < d.depuis) continue;
          if (code === "p") d.stats.pour++;
          else if (code === "c") d.stats.contre++;
          else if (code === "a") d.stats.abst++;
          // Écart : vote exprimé différent de la position majoritaire de son groupe (hors non-inscrits)
          if (POSITIONS[code] && majo && organeVersId[g.organeRef] !== "NI" && POSITIONS[code] !== majo) d.stats.ecarts++;
          if (cle) d._cles[numero] = code;
        }
      }
    }
    if (cle) {
      for (const d of deputes.values()) {
        if (d._cles[numero]) continue;
        d._cles[numero] = date >= d.depuis ? "-" : ".";
      }
    }
  }

  cles.sort((a, b) => b - a);
  const liste = [...deputes.values()]
    .sort((a, b) => a.tri.localeCompare(b.tri, "fr"))
    .map(({ tri, _cles, ...d }) => ({ ...d, votes: cles.map((n) => _cles[n] || ".").join("") }));
  return { cles, deputes: liste };
}

// Exécution directe (tests) : node scripts/deputes.js <scrutins> <amo> [sortie]
if (import.meta.url === `file://${process.argv[1]}`) {
  const [scrDir, amoDir, sortie = "data/deputes.json"] = process.argv.slice(2);
  const trouverDossier = async (base, nom) => {
    for (const e of await readdir(base, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      if (e.name === nom) return path.join(base, e.name);
      const r = await trouverDossier(path.join(base, e.name), nom);
      if (r) return r;
    }
    return null;
  };
  const organeDir = await trouverDossier(amoDir, "organe");
  const SIGLES = { RN: "RN", EPR: "EPR", REN: "EPR", "LFI-NFP": "LFI", LFI: "LFI", SOC: "SOC", DR: "LR", LR: "LR", ECOS: "ECO", ECOLO: "ECO", DEM: "DEM", HOR: "HOR", GDR: "GDR", LIOT: "LIOT", UDR: "UDR", UDDPLR: "UDR", NI: "NI" };
  const organeVersId = {};
  for (const f of await readdir(organeDir)) {
    const o = JSON.parse(await readFile(path.join(organeDir, f), "utf-8")).organe;
    if (o?.codeType === "GP" && o.legislature === LEGISLATURE && SIGLES[o.libelleAbrev]) organeVersId[o.uid] = SIGLES[o.libelleAbrev];
  }
  const t0 = Date.now();
  const res = await construireDeputes(await fichiersJson(scrDir), await trouverDossier(amoDir, "acteur"), organeVersId);
  await writeFile(sortie, JSON.stringify({ lastUpdated: new Date().toISOString(), source: "Assemblée nationale — votes nominatifs et AMO30", ...res }) + "\n");
  console.log(`${res.deputes.length} députés, ${res.cles.length} votes clés, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
