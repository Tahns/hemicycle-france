#!/usr/bin/env node
/**
 * detecter-direct.js
 * ------------------
 * Bandeau « En direct » : repère, sans rien inventer, les événements en cours ou imminents.
 *
 * (1) Prise de parole du président de la République : un titre de data/actualites.json (déjà relevé
 *     dans les flux RSS des médias) qui associe le chef de l'État (Macron, Emmanuel Macron, président
 *     de la République) à une prise de parole (allocution, s'exprime, prend la parole, conférence de
 *     presse, discours, interview). Une annonce (« ce soir à 20 h ») compte. Fenêtre : titre publié
 *     depuis moins de 6 h ; au-delà, l'événement disparaît du fichier.
 * (2) Séance publique à l'Assemblée nationale : le jour de séance de data/agenda-an.json est celui du
 *     jour (l'agenda ne donne pas les heures : on annonce « aujourd'hui », jamais « en cours »).
 * (3) Sénat : aucune donnée de séance n'est relevée par ce site, donc rien n'est affiché.
 *
 * Résultat : data/direct.json
 *   { lastUpdated, evenements: [{ id, type, titre, quand, publie?, expire, source: {media, url}, chaines: [{nom, url}] }] }
 * Les chaînes sont des LIENS vers les pages officielles de direct (jamais d'intégration).
 * Sans détection : evenements = [] et le site n'affiche aucun bandeau.
 *
 * USAGE : node scripts/detecter-direct.js
 */
import { readFile } from "fs/promises";
import path from "path";
import { ecrireGarde } from "./garde.js";

export const FENETRE_H = 6;
export const URL_DIRECT_AN = "https://videos.assemblee-nationale.fr/";
export const CHAINES = [
  { nom: "franceinfo", url: "https://www.francetvinfo.fr/en-direct/" },
  { nom: "BFMTV", url: "https://www.bfmtv.com/en-direct/" },
  { nom: "LCI", url: "https://www.tf1info.fr/direct/" },
  { nom: "Public Sénat", url: "https://www.publicsenat.fr/direct" },
  { nom: "France 24", url: "https://www.france24.com/fr/direct" },
];

const PRESIDENT = /\b(?:emmanuel\s+)?macron\b|pr[ée]sident de la r[ée]publique/i;
// type -> motif ; le premier qui correspond l'emporte (du plus précis au plus général)
const PAROLES = [
  ["allocution", /allocution/i],
  ["conference", /conf[ée]rence de presse/i],
  ["interview", /interview/i],
  ["discours", /discours/i],
  ["prise-de-parole", /s['’]exprim|prend(?:ra)?\s+la\s+parole/i],
];
const HEURE = /(?:(?:ce soir|demain|aujourd['’]hui)\s+)?[àa]\s*\d{1,2}\s?(?:h|heures?)(?:\s?\d{2})?/i;

const jourParis = (d) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(d);
const heureParis = (d) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "numeric", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]));
  return p.minute === "00" ? `${p.hour} h` : `${p.hour} h ${p.minute}`;
};

/** Type de prise de parole annoncée par un titre, ou null. Fonction pure. */
export function typeParole(titre) {
  if (!PRESIDENT.test(titre || "")) return null;
  for (const [type, re] of PAROLES) if (re.test(titre)) return type;
  return null;
}

/** « ce soir à 20 h » lu dans le titre, ou null. */
export function annonceHoraire(titre) {
  const m = HEURE.exec(titre || "");
  return m ? m[0].trim().replace(/\s+/g, " ") : null;
}

export function detecterPresident(actualites, now = new Date()) {
  const vus = new Map(); // type -> article le plus récent dans la fenêtre
  for (const s of actualites?.sujets || []) for (const a of s.articles || []) {
    const t = Date.parse(a.date);
    if (!a.titre || !/^https:\/\//.test(a.url || "") || !a.media || Number.isNaN(t)) continue;
    const age = now.getTime() - t;
    if (age > FENETRE_H * 36e5 || age < -36e5) continue;
    const type = typeParole(a.titre);
    if (!type) continue;
    if (!vus.has(type) || t > Date.parse(vus.get(type).date)) vus.set(type, a);
  }
  return [...vus].map(([type, a]) => {
    const t = new Date(a.date);
    const annonce = annonceHoraire(a.titre);
    return {
      id: `president-${type}-${jourParis(t)}`,
      type,
      titre: a.titre,
      quand: annonce ? annonce.charAt(0).toUpperCase() + annonce.slice(1) : `Titre publié à ${heureParis(t)}`,
      publie: t.toISOString(),
      expire: new Date(t.getTime() + FENETRE_H * 36e5).toISOString(),
      source: { media: a.media, url: a.url },
      chaines: CHAINES,
    };
  });
}

export function detecterSeanceAN(agenda, now = new Date()) {
  const jour = jourParis(now);
  const j = (agenda?.jours || []).find((x) => x.date === jour);
  // Agenda trop ancien (plus de 36 h) : on ne l'affiche pas
  if (!j?.points?.length || !(now.getTime() - Date.parse(agenda.lastUpdated) < 36 * 36e5)) return [];
  const reste = j.points.length - 1;
  const objets = [j.points[0].objet + (reste ? ` (et ${reste} autre${reste > 1 ? "s" : ""} point${reste > 1 ? "s" : ""})` : "")];
  // Fin du jour de séance : premier instant (pas de 15 min) où la date de Paris change
  let fin = now.getTime();
  while (jourParis(new Date(fin)) === jour) fin += 15 * 6e4;
  return [{
    id: `seance-an-${jour}`,
    type: "seance-an",
    titre: `Séance publique à l'Assemblée nationale : ${objets.join(" ; ")}`,
    quand: "Aujourd'hui",
    expire: new Date(fin).toISOString(),
    source: { media: "Assemblée nationale", url: agenda.sourceUrl || "https://www2.assemblee-nationale.fr/agendas/les-agendas" },
    chaines: [{ nom: "Direct de l'Assemblée nationale", url: URL_DIRECT_AN }],
  }];
}

export function detecter(actualites, agenda, now = new Date()) {
  return { lastUpdated: now.toISOString(), evenements: [...detecterPresident(actualites, now), ...detecterSeanceAN(agenda, now)] };
}

const lire = async (f) => JSON.parse(await readFile(path.resolve(f), "utf-8").catch(() => "null"));

async function main() {
  const direct = detecter(await lire("data/actualites.json"), await lire("data/agenda-an.json"));
  const ok = await ecrireGarde(path.resolve("data/direct.json"), direct, {
    nom: "data/direct.json",
    liste: (d) => d.evenements,
    obligatoires: ["titre", "source"],
    videPermis: true,
    texte: JSON.stringify(direct, null, 1) + "\n",
    battementH: 6,
  });
  if (ok) console.log(`[detecter-direct] ${direct.evenements.length} événement(s) en direct.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error("[detecter-direct] ÉCHEC :", e.message); process.exitCode = 1; });
}
