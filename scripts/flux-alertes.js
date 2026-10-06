#!/usr/bin/env node
/**
 * flux-alertes.js
 * ---------------
 * Alertes SANS compte : un flux Atom par député et par texte de loi suivi. On l'ajoute à n'importe quel lecteur de flux (Feedly, NetNewsWire…),
 * aucune adresse e-mail n'est demandée, rien n'est envoyé : le lecteur vient relire le fichier.
 *
 *  - feeds/depute/<identifiant>.xml : les derniers votes du député sur les textes et motions de censure du site (data/deputes.json) ;
 *  - feeds/loi/<référence du dossier>.xml : les derniers scrutins du dossier à l'Assemblée (data/lois.json) et au Sénat (data/navette.json).
 *
 * Plafonds (le dépôt ne doit pas gonfler) : au plus 600 flux de députés (10 entrées), 150 flux de textes (20 entrées).
 * Les flux qui ne sont plus dans la sélection sont supprimés. Contenu déterministe : un flux n'est réécrit (donc recommitté)
 * que si un nouveau vote le modifie.
 *
 * USAGE : node scripts/flux-alertes.js
 */
import { readFile, readdir, rm } from "fs/promises";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { completer } from "./lois-format.js";
import { SITE, NOM_SITE, majuscule, coupe, nombre, atom, ecrireSiChange } from "./flux-atom.js";

export const MAX_DEPUTES = 600;
export const MAX_LOIS = 150;
export const MAX_ENTREES = 20;
export const MAX_ENTREES_DEPUTE = 10; // un député a des centaines de votes : les 10 derniers suffisent à une alerte
// Nombre de jours pendant lesquels un texte sans vote d'ensemble reste « suivi » (dernier vote récent)
const JOURS_ACTIF = 90;

const LIB = { p: ["pour", "a voté pour"], c: ["contre", "a voté contre"], a: ["abstention", "s'est abstenu(e) sur"], n: ["non-votant", "n'a pas pris part (non-votant) à"] };

const totaux = (l) => {
  const s = (k) => Object.values(l.votes || {}).reduce((t, v) => t + (v && Number.isInteger(v[k]) ? v[k] : 0), 0);
  return { pour: s("pour"), contre: s("contre"), abst: s("abst") };
};
const libScrutin = (l) => l.dossierTitre || majuscule(coupe(l.titre.replace(/\.$/, ""), 160));
const decompte = (l) => { const t = totaux(l); return `${l.resultat === "adopte" ? "adopté" : "rejeté"} (${nombre(t.pour)} pour, ${nombre(t.contre)} contre, ${nombre(t.abst)} abstention${t.abst > 1 ? "s" : ""})`; };
const horodatage = (dateISO) => `${dateISO}T12:00:00Z`;

/**
 * Flux d'un député. ctx = { cles, loisParNumero:Map, pageVote:(n)=>boolean }
 * Renvoie null s'il n'a aucun vote à montrer.
 */
export function fluxDepute(d, ctx) {
  const entrees = [];
  for (let i = 0; i < ctx.cles.length && entrees.length < MAX_ENTREES_DEPUTE; i++) {
    const code = d.votes?.[i];
    const l = ctx.loisParNumero.get(ctx.cles[i]);
    if (!LIB[code] || !l) continue;
    const lien = ctx.pageVote(l.numero) ? `${SITE}v/${l.numero}.html` : l.sourceUrl;
    entrees.push({
      id: `${SITE}feeds/depute/${d.id}#scrutin-${l.numero}`,
      titre: `Vote « ${LIB[code][0]} » : ${libScrutin(l)}`,
      lien,
      updated: horodatage(l.dateISO),
      resume: `${d.nom} (${d.groupe}) ${LIB[code][1]} ce texte le ${l.date}. Scrutin n°${l.numero}, ${decompte(l)}.`,
    });
  }
  if (!entrees.length) return null;
  entrees.sort((a, b) => b.updated.localeCompare(a.updated) || b.id.localeCompare(a.id));
  return atom({
    titre: `${NOM_SITE} · Votes de ${d.nom}`,
    sousTitre: `Derniers votes ${d.f ? "de la députée" : "du député"} ${d.nom} (${d.groupe}, ${d.dep}) sur les textes et motions de censure. Source : Assemblée nationale.`,
    id: `${SITE}feeds/depute/${d.id}.xml`, self: `${SITE}feeds/depute/${d.id}.xml`, alternate: `${SITE}d/${d.id}.html`,
    updated: entrees[0].updated, entrees,
  });
}

/** Flux d'un texte (dossier). scrutins : scrutins AN du dossier ; senat : votes du Sénat (data/navette.json). */
export function fluxLoi(ref, scrutins, senat, ctx) {
  const entrees = [
    ...scrutins.map((l) => ({
      id: `${SITE}feeds/loi/${ref}#scrutin-${l.numero}`,
      titre: `Assemblée : ${l.resultat === "adopte" ? "adopté" : "rejeté"} — ${majuscule(coupe(l.titre.replace(/\.$/, ""), 170))}`,
      lien: ctx.pageVote(l.numero) ? `${SITE}v/${l.numero}.html` : l.sourceUrl,
      updated: horodatage(l.dateISO),
      resume: `Scrutin n°${l.numero} du ${l.date} à l'Assemblée nationale : ${decompte(l)}.`,
    })),
    ...(senat?.votes || []).filter((v) => v.dateISO && v.url).map((v) => ({
      id: `${SITE}feeds/loi/${ref}#senat-${v.dateISO}-${v.url.replace(/\W+/g, "-").slice(-40)}`,
      titre: `Sénat : ${v.resultat === "adopte" ? "adopté" : "rejeté"} (${nombre(v.pour)} pour, ${nombre(v.contre)} contre)`,
      lien: v.url,
      updated: horodatage(v.dateISO),
      resume: `Scrutin public du Sénat du ${v.date} : ${v.resultat === "adopte" ? "adopté" : "rejeté"}, ${nombre(v.pour)} pour, ${nombre(v.contre)} contre.`,
    })),
  ].sort((a, b) => b.updated.localeCompare(a.updated) || b.id.localeCompare(a.id)).slice(0, MAX_ENTREES);
  if (!entrees.length) return null;
  const premier = scrutins[0];
  const titre = premier?.dossierTitre || ref;
  return atom({
    titre: `${NOM_SITE} · ${titre}`,
    sousTitre: `Derniers scrutins publics sur ce texte à l'Assemblée nationale${senat?.votes?.length ? " et au Sénat" : ""}. Sources officielles citées dans chaque entrée.`,
    id: `${SITE}feeds/loi/${ref}.xml`, self: `${SITE}feeds/loi/${ref}.xml`,
    alternate: premier?.dossierUrl || senat?.dossier || SITE,
    updated: entrees[0].updated, entrees,
  });
}

/**
 * Sélection des textes suivis : ceux qui ont eu un vote sur l'ensemble ou une motion de censure, plus ceux votés
 * dans les 90 derniers jours ; les plus récents d'abord, au plus `MAX_LOIS`.
 * @returns {Map<string, object[]>} référence du dossier -> ses scrutins (du plus récent au plus ancien)
 */
export function choisirTextes(lois, maintenant = new Date()) {
  const limite = new Date(maintenant.getTime() - JOURS_ACTIF * 864e5).toISOString().slice(0, 10);
  const parDossier = new Map();
  for (const l of lois) {
    if (!l.dossierRef || l.numero === undefined) continue;
    (parDossier.get(l.dossierRef) || parDossier.set(l.dossierRef, []).get(l.dossierRef)).push(l);
  }
  const retenus = [...parDossier.entries()]
    .map(([ref, ls]) => [ref, ls.sort((a, b) => b.numero - a.numero)])
    .filter(([, ls]) => ls.some((l) => l.typeVote !== "SPO") || ls[0].dateISO >= limite)
    .sort((a, b) => b[1][0].numero - a[1][0].numero)
    .slice(0, MAX_LOIS);
  return new Map(retenus);
}

async function supprimerAbsents(dossier, gardes) {
  if (!existsSync(dossier)) return 0;
  let n = 0;
  for (const f of await readdir(dossier)) {
    if (f.endsWith(".xml") && !gardes.has(f)) { await rm(path.join(dossier, f)); n++; }
  }
  return n;
}

const lireJson = async (f) => (existsSync(f) ? JSON.parse(await readFile(f, "utf-8")) : null);

async function main() {
  const lois = (await lireJson("data/lois.json"))?.lois || [];
  lois.forEach(completer);
  const deputes = await lireJson("data/deputes.json");
  if (!lois.length || !deputes?.deputes?.length) throw new Error("data/lois.json ou data/deputes.json absent ou vide : aucun flux généré.");
  const navette = (await lireJson("data/navette.json"))?.textes || {};
  const ctx = { cles: deputes.cles, loisParNumero: new Map(lois.filter((l) => l.numero !== undefined).map((l) => [l.numero, l])), pageVote: (n) => existsSync(`v/${n}.html`) };

  let ecrits = 0;
  const gardesD = new Set();
  for (const d of deputes.deputes.slice(0, MAX_DEPUTES)) {
    const xml = fluxDepute(d, ctx);
    if (!xml) continue;
    gardesD.add(`${d.id}.xml`);
    ecrits += ecrireSiChange(`feeds/depute/${d.id}.xml`, xml);
  }
  const gardesL = new Set();
  for (const [ref, scrutins] of choisirTextes(lois)) {
    const xml = fluxLoi(ref, scrutins, navette[ref], ctx);
    if (!xml) continue;
    gardesL.add(`${ref}.xml`);
    ecrits += ecrireSiChange(`feeds/loi/${ref}.xml`, xml);
  }
  const supprimes = (await supprimerAbsents("feeds/depute", gardesD)) + (await supprimerAbsents("feeds/loi", gardesL));
  console.log(`[flux] ${gardesD.size} flux de députés, ${gardesL.size} flux de textes ; ${ecrits} écrit(s), ${supprimes} supprimé(s).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error("[flux] " + e.message); process.exit(1); });
}
