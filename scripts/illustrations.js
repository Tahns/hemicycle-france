/**
 * illustrations.js
 * ----------------
 * Illustre un sujet d'actualité à partir de ses titres, avec uniquement des images que le site a le
 * droit de montrer : portraits officiels des parlementaires (photos/deputes, photos/senateurs),
 * portraits libres de Wikimedia Commons (photos/personnalites, voir fetch-portraits.js ; versions haute définition dans les sous-dossiers hd/, champ photoHd) et logos libres
 * des partis (icons/partis). À défaut, un thème (budget, justice, élection…) qui choisit un pictogramme.
 *
 * Une personne est reconnue par son nom complet ; les personnalités nationales (chefs de parti,
 * candidats, Gouvernement) aussi par leur seul nom de famille (« Bardella », « Lecornu »), sauf s'il est
 * accolé à un autre prénom (« Philippe Martinez » n'est pas Édouard Philippe).
 */
import { readFile, access } from "fs/promises";
import { slug } from "./fetch-portraits.js";

// Personnalités nationales absentes des autres listes
export const FIGURES = ["Emmanuel Macron"];

const lire = async (f) => JSON.parse(await readFile(f, "utf-8").catch(() => "null"));
const existe = (f) => access(f).then(() => true, () => false);
const plat = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, "'").toLowerCase();
const echap = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Partis cités dans les titres -> logo (icons/partis/<code>.png, codes des groupes de l'Assemblée)
const PARTIS = [
  ["RN", /\brn\b|rassemblement national|lepeniste/],
  ["LFI", /\blfi\b|insoumis|france insoumise/],
  ["SOC", /\bps\b|socialiste/],
  ["LR", /\blr\b|les republicains/],
  ["EPR", /renaissance|macroniste/],
  ["ECO", /ecologiste/],
  ["HOR", /\bhorizons\b/],
  ["DEM", /modem/],
  ["UDR", /\budr\b|ciottiste/],
  ["GDR", /\bpcf\b|communiste/],
];

// Thème du sujet -> pictogramme (dessiné par la page)
const THEMES = [
  ["justice", /justice|proces|parquet|enquete|condamn|tribunal|mis en examen|juge|plainte|cour de cassation|inelig/],
  ["budget", /budget|deficit|dette|impot|fiscal|taxe|economi|finances|bercy|retraite/],
  ["election", /election|electoral|scrutin|municipal|presidentielle|legislative|senatoriale|sondage|candidat|primaire|vote\b/],
  ["senat", /senat|senateur|senatrice/],
  ["assemblee", /assemblee|depute|hemicycle|motion de censure|49\.3|amendement|proposition de loi|projet de loi/],
  ["gouvernement", /gouvernement|ministre|matignon|elysee|remaniement|premier ministre/],
  ["international", /europe|bruxelles|ukraine|russie|etats-unis|trump|otan|diplomat|israel|gaza|chine/],
  ["securite", /police|securite|immigration|terror|attentat|violence|emeute|gendarm/],
];

export async function construireIndex() {
  const [deputes, senateurs, dirigeants, candidats, gouvernement, portraits, sondages] = await Promise.all(
    ["deputes", "senateurs", "dirigeants", "candidats", "gouvernement", "portraits", "sondages"].map((f) => lire(`data/${f}.json`))
  );
  const personnes = new Map(); // nom -> { nom, photo, parti, lien, notable }
  const ajouter = async (nom, infos) => {
    if (!nom || nom === "—") return;
    const p = personnes.get(nom) || { nom, photo: null, parti: null, lien: null, notable: false };
    for (const [k, v] of Object.entries(infos)) if (v && !p[k]) p[k] = v;
    if (infos.notable) p.notable = true;
    personnes.set(nom, p);
  };
  for (const d of deputes?.deputes || []) {
    const photo = `photos/deputes/${d.id}.jpg`;
    await ajouter(d.nom, { photo: (await existe(photo)) ? photo : null, parti: d.groupe, lien: `#depute-${d.id}` });
  }
  for (const s of senateurs?.senateurs || []) {
    const photo = `photos/senateurs/${s.id}.jpg`;
    await ajouter(s.nom, { photo: (await existe(photo)) ? photo : null, parti: s.groupe, lien: `#senateur-${s.id}` });
  }
  for (const d of dirigeants?.dirigeants || []) await ajouter(d.nom, { parti: d.parti, notable: true });
  for (const c of candidats?.candidats || []) await ajouter(c.nom, { parti: c.code, notable: true });
  for (const m of gouvernement?.membres || []) await ajouter(m.nom, { notable: true });
  for (const nom of FIGURES) await ajouter(nom, { notable: true });
  // Personnalités testées dans les sondages de la présidentielle (Le Pen, Mélenchon…)
  for (const [nom, parti] of Object.entries(sondages?.candidats || {})) if (!/\(/.test(nom)) await ajouter(nom, { parti, notable: true });
  for (const [nom, p] of Object.entries(portraits?.portraits || {})) {
    const photo = `photos/personnalites/${slug(nom)}.jpg`;
    if (p.fichier && personnes.has(nom) && (await existe(photo))) {
      Object.assign(personnes.get(nom), { photo: personnes.get(nom).photo || photo, credit: `${p.auteur || "Auteur inconnu"}, ${p.licence}, Wikimedia Commons` });
    }
  }

  // Version haute définition (stories Instagram nettes) quand elle existe : photos/<dossier>/hd/<fichier>
  for (const p of personnes.values()) {
    if (!p.photo) continue;
    const hd = p.photo.replace(/^(photos\/(?:deputes|senateurs|personnalites))\//, "$1/hd/");
    if (hd !== p.photo && (await existe(hd))) p.photoHd = hd;
  }

  // Motifs : nom complet pour tous ; nom de famille seul pour les personnalités nationales, s'il est unique
  const motifs = [];
  const familles = new Map();
  for (const p of personnes.values()) {
    motifs.push({ p, re: new RegExp(`(^|[^a-z])${echap(plat(p.nom))}($|[^a-z])`) });
    if (!p.notable) continue;
    const famille = plat(p.nom).split(" ").slice(1).join(" ");
    if (famille.length >= 4) familles.set(famille, familles.has(famille) ? null : p);
  }
  for (const [famille, p] of familles) {
    if (!p) continue; // deux personnalités portent ce nom : ambigu
    // Pas précédé d'un autre prénom, pas suivi d'un nom (« Philippe Martinez »)
    motifs.push({ p, famille: true, re: new RegExp(`(^|[^a-z])${echap(famille)}(?![a-z])`), prenom: plat(p.nom).split(" ")[0] });
  }
  return motifs;
}

export function illustrer(titres, motifs) {
  const comptes = new Map();
  for (const titre of titres) {
    const t = plat(titre);
    const vus = new Set();
    for (const m of motifs) {
      if (vus.has(m.p.nom)) continue;
      let ok = m.re.test(t);
      if (ok && m.famille) {
        // Rejeté si le nom de famille suit un autre prénom ou précède un nom (casse lue dans le titre d'origine)
        const brut = titre.normalize("NFD").replace(/[̀-ͯ]/g, "");
        const famille = m.p.nom.normalize("NFD").replace(/[̀-ͯ]/g, "").split(" ").slice(1).join(" ");
        const i = brut.toLowerCase().indexOf(famille.toLowerCase());
        const avant = brut.slice(0, i).match(/([A-Z][a-z-]+) $/)?.[1];
        const apres = brut.slice(i + famille.length).match(/^ ([A-Z][a-z]+)/)?.[1];
        if ((avant && plat(avant) !== m.prenom && !/^(mme|madame|monsieur|mr|president|presidente|ministre)$/.test(plat(avant))) || apres) ok = false;
      }
      if (ok) {
        vus.add(m.p.nom);
        comptes.set(m.p, (comptes.get(m.p) || 0) + 1);
      }
    }
  }
  const classes = [...comptes.entries()].sort((a, b) => b[1] - a[1] || (b[0].photo ? 1 : 0) - (a[0].photo ? 1 : 0));
  // Une personne citée dans un seul titre d'un sujet qui en regroupe plusieurs n'en est pas le sujet : seules comptent
  // celles citées dans au moins la moitié des titres (ou autant que la plus citée)
  const personnes = classes
    .filter(([, n]) => n * 2 >= titres.length || n === classes[0][1])
    .slice(0, 3)
    .map(([p]) => Object.fromEntries(Object.entries({ nom: p.nom, photo: p.photo, photoHd: p.photoHd, parti: p.parti, lien: p.lien, credit: p.credit }).filter(([, v]) => v)));
  const tout = plat(titres.join(" "));
  const partis = PARTIS.filter(([, re]) => re.test(tout)).map(([code]) => code).slice(0, 2);
  const theme = THEMES.find(([, re]) => re.test(tout))?.[0] || "politique";
  return { personnes, partis, theme };
}
