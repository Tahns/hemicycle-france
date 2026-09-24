#!/usr/bin/env node
/**
 * gouvernement.js
 * ---------------
 * Composition du Gouvernement en fonction, d'après l'archive AMO30 de l'Assemblée nationale
 * (déjà téléchargée par fetch-scrutins.js, qui appelle ecrireGouvernement) : organe de type
 * GOUVERNEMENT sans date de fin, puis, pour chacun de ses membres, son mandat MINISTERE en cours.
 * Résultat : data/gouvernement.json, affiché dans la rubrique Partis.
 *
 * GARDE-FOUS : un seul gouvernement en cours, un Premier ministre, au moins 15 membres ;
 * sinon le fichier n'est pas modifié.
 *
 * USAGE (test) : node scripts/gouvernement.js --dossier=/chemin/archive-AMO30-extraite
 */
import { readFile, writeFile, readdir } from "fs/promises";
import path from "path";

const log = (...m) => console.log("[gouvernement]", ...m);
const RANG = { "Premier ministre": 0, "Ministre d'État": 1, "Ministre": 2, "Garde des sceaux, ministre de la justice": 2, "Ministre délégué": 3, "Secrétaire d'État": 4 };

async function lireDossier(dir) {
  const sortie = [];
  for (const f of await readdir(dir)) {
    try { sortie.push(JSON.parse(await readFile(path.join(dir, f), "utf-8"))); } catch {}
  }
  return sortie;
}
async function trouver(base, nom) {
  for (const e of await readdir(base, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    if (e.name === nom) return path.join(base, e.name);
    const r = await trouver(path.join(base, e.name), nom);
    if (r) return r;
  }
  return null;
}
const liste = (x) => (Array.isArray(x) ? x : x ? [x] : []);

/** Fonction lisible : « Ministre de l'intérieur », « Ministre déléguée chargée de la mer et de la pêche ». */
export function fonction(qualite, libelle, femme) {
  if (qualite === "Premier ministre") return femme ? "Première ministre" : "Premier ministre";
  if (/^Garde des sceaux/i.test(qualite)) return "Garde des sceaux, ministre de la justice";
  const e = femme ? "e" : "";
  const charge = libelle.replace(/ auprès d.*?(?=,? chargée? |, et |$)/gi, "").match(/chargée? (?:de |du |des |d’|d')(.+)$/i);
  if (/^Ministère délégué/i.test(libelle) && charge && !/porte-parole/i.test(libelle)) return `Ministre délégué${e} ${charge[0].replace(/^chargée?/, `chargé${e}`)}`;
  if (/porte-parole/i.test(libelle)) return `Ministre délégué${e}, porte-parole du Gouvernement${charge ? `, ${charge[0].replace(/^chargée?/, `chargé${e}`)}` : ""}`;
  return libelle ? libelle.replace(/^Ministère délégué/, `Ministre délégué${e}`).replace(/^Ministère/, "Ministre") : qualite;
}

export async function ecrireGouvernement(amoDir, fichier = "data/gouvernement.json") {
  const organes = new Map((await lireDossier(await trouver(amoDir, "organe"))).map((o) => [o.organe?.uid, o.organe]));
  const enCours = [...organes.values()].filter((o) => o?.codeType === "GOUVERNEMENT" && !o.viMoDe?.dateFin)
    .sort((a, b) => (b.viMoDe?.dateDebut || "").localeCompare(a.viMoDe?.dateDebut || ""));
  if (!enCours.length) throw new Error("aucun gouvernement en cours dans AMO30");
  const gouv = enCours[0];
  const membres = [];
  for (const { acteur: a } of await lireDossier(await trouver(amoDir, "acteur"))) {
    const mandats = liste(a?.mandats?.mandat);
    if (!mandats.some((m) => m.typeOrgane === "GOUVERNEMENT" && !m.dateFin && m.organes?.organeRef === gouv.uid)) continue;
    const ident = a.etatCivil?.ident;
    const ministere = mandats.filter((m) => m.typeOrgane === "MINISTERE" && !m.dateFin).sort((x, y) => (y.dateDebut || "").localeCompare(x.dateDebut || ""))[0];
    const qualite = ministere?.infosQualite?.libQualite || "Membre du Gouvernement";
    const libelle = organes.get(ministere?.organes?.organeRef)?.libelle || "";
    membres.push({
      nom: `${ident.prenom} ${ident.nom}`,
      id: a.uid?.["#text"] || a.uid,
      qualite,
      fonction: fonction(qualite, libelle, a.etatCivil?.ident?.civ === "Mme"),
      depuis: ministere?.dateDebut || null,
    });
  }
  membres.sort((x, y) => (RANG[x.qualite] ?? 5) - (RANG[y.qualite] ?? 5) || x.nom.localeCompare(y.nom, "fr"));
  const pm = membres.find((m) => m.qualite === "Premier ministre");
  if (!pm || membres.length < 15) throw new Error(`composition incomplète (${membres.length} membres, Premier ministre : ${pm ? "oui" : "non"})`);
  await writeFile(fichier, JSON.stringify({
    lastUpdated: new Date().toISOString(),
    source: "Assemblée nationale — open data AMO (mandats des membres du Gouvernement)",
    nom: `Gouvernement ${pm.nom.split(" ").slice(1).join(" ")}`,
    depuis: gouv.viMoDe?.dateDebut || null,
    membres,
  }, null, 1) + "\n");
  log(`${membres.length} membres (${pm.nom}, Premier ministre).`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const d = process.argv.find((a) => a.startsWith("--dossier="))?.split("=")[1];
  ecrireGouvernement(d).catch((e) => { console.error("[gouvernement] ÉCHEC :", e.message); process.exitCode = 1; });
}
