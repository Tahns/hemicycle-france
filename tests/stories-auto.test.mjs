// Tests de scripts/stories-auto.cjs (choix du sujet) sur des titres fictifs. USAGE : node tests/stories-auto.test.mjs
import assert from "assert";
import { createRequire } from "module";
const { choisirSujet, motExclu, idSujet, jourUTC2, elaguer } = createRequire(import.meta.url)("../scripts/stories-auto.cjs");

const now = new Date("2026-10-02T13:30:00Z"); // 15 h 30 à Paris
const il_y_a = (h) => new Date(now.getTime() - h * 36e5).toISOString();
const MEDIAS = ["franceinfo", "Le Monde", "Le Figaro", "Libération", "20 Minutes"];
const sujet = (titre, nb, extra = {}) => ({
  medias: nb,
  derniere: il_y_a(1),
  illustration: { theme: "budget", ...(extra.illustration || {}) },
  articles: Array.from({ length: Math.max(nb, 1) }, (_, i) => ({ titre: i ? `${titre} (suite ${i})` : titre, url: `https://example.org/${idSujet(titre)}/${i}`, media: MEDIAS[i], date: il_y_a(1) })),
  ...extra,
});
const actu = (...sujets) => ({ sujets });
const vide = { entrees: [] };
const choix = (sujets, opts = {}) => choisirSujet({ actualites: actu(...sujets), direct: null, file: vide, now, ...opts });

// Sujet à 3 médias : retenu
{
  const r = choix([sujet("Le gouvernement présente son projet de budget pour 2027", 3)]);
  assert.strictEqual(r.indice, 0);
  assert.strictEqual(r.id, idSujet("Le gouvernement présente son projet de budget pour 2027"));
}
// Sujet à 2 médias : non
assert.ok(choix([sujet("Le gouvernement présente son projet de budget pour 2027", 2)]).refus, "2 médias refusé");
// 2 médias mais prise de parole du président (data/direct.json) : retenu
{
  const s = sujet("Emmanuel Macron s'exprimera ce soir à 20 h sur le budget", 1);
  const direct = { evenements: [{ type: "allocution", titre: s.articles[0].titre }] };
  assert.strictEqual(choix([s], { direct }).indice, 0, "président retenu");
  assert.ok(choix([s]).refus, "sans détection du direct : non");
}
// Trop ancien (> 3 h) : non
assert.ok(choix([sujet("Le gouvernement présente son projet de budget pour 2027", 4, { derniere: il_y_a(3.5) })]).refus, "ancien refusé");
// Mis en examen et autres mots à risque : exclus
assert.ok(choix([sujet("Jean Dupont mis en examen pour détournement de fonds publics", 4)]).refus, "mis en examen exclu");
for (const titre of [
  "Un ministre visé par une plainte pour diffamation", "Garde à vue d'un élu local à Lyon", "Le député soupçonné de favoritisme",
  "Mort de l'ancien ministre Jean Martin", "Décès d'une figure de la gauche", "Drame à la sortie d'un meeting", "Une adolescente de 15 ans victime d'une agression",
  "Le maire condamné pour prise illégale d'intérêts", "Un fait divers relance le débat sur la sécurité", "Nouvelle enquête visant un parlementaire",
]) assert.ok(motExclu(titre), `exclu : ${titre}`);
for (const titre of ["Le gouvernement présente son projet de budget pour 2027", "Le Sénat adopte la loi de programmation militaire"])
  assert.strictEqual(motExclu(titre), null, `non exclu : ${titre}`);
// Un seul titre à risque parmi ceux du sujet suffit à l'écarter
{
  const s = sujet("Le gouvernement présente son projet de budget pour 2027", 3);
  s.articles[2].titre = "Budget : un ministre mis en cause par une plainte";
  assert.ok(choix([s]).refus, "un titre à risque écarte le sujet");
}
// Thème justice : exclu
assert.ok(choix([sujet("Le gouvernement présente son projet de budget pour 2027", 4, { illustration: { theme: "justice" } })]).refus, "justice exclu");
// Déjà en file : exclu (par titre, ou par lien d'article déjà utilisé)
{
  const titre = "Le gouvernement présente son projet de budget pour 2027";
  const entree = { id: idSujet(titre), cree: il_y_a(2), titre, sources: [] };
  assert.ok(choix([sujet(titre, 4)], { file: { entrees: [entree] } }).refus, "déjà en file");
  const s = sujet("Budget 2027 : le gouvernement détaille ses économies", 4);
  assert.ok(choix([s], { file: { entrees: [{ id: "aaaaaaaaaaaa", cree: il_y_a(2), titre: "autre", sources: [s.articles[1].url] }] } }).refus, "lien déjà utilisé");
}
// 5e du jour : exclu (4 déjà aujourd'hui en UTC+2) ; hier ne compte pas
{
  const du_jour = (h, i) => ({ id: `${i}`.repeat(12), cree: il_y_a(h), titre: `t${i}`, sources: [] });
  const quatre = [1, 2, 3, 4].map((i) => du_jour(i * 1.5, i));
  assert.ok(choix([sujet("Le gouvernement présente son projet de budget pour 2027", 4)], { file: { entrees: quatre } }).refus, "5e exclue");
  const hier = quatre.map((e) => ({ ...e, cree: new Date(Date.parse(e.cree) - 24 * 36e5).toISOString() }));
  assert.strictEqual(choix([sujet("Le gouvernement présente son projet de budget pour 2027", 4)], { file: { entrees: hier } }).indice, 0, "hier ne compte pas");
  assert.strictEqual(jourUTC2("2026-10-02T22:30:00Z"), "2026-10-03", "jour en UTC+2");
}
// Nuit (23 h – 7 h à Paris) : exclu ; matin 7 h : accepté
{
  const s = (h) => sujet("Le gouvernement présente son projet de budget pour 2027", 4, { derniere: new Date(Date.parse(h) - 36e5).toISOString() });
  for (const nuit of ["2026-10-02T21:30:00Z", "2026-10-03T02:00:00Z", "2026-10-03T04:30:00Z"]) // 23 h 30, 4 h, 6 h 30 à Paris
    assert.ok(choisirSujet({ actualites: actu(s(nuit)), direct: null, file: vide, now: new Date(nuit) }).refus, `nuit ${nuit}`);
  const matin = "2026-10-03T05:30:00Z"; // 7 h 30 à Paris
  assert.strictEqual(choisirSujet({ actualites: actu(s(matin)), direct: null, file: vide, now: new Date(matin) }).indice, 0, "7 h 30 accepté");
}
// Au plus un sujet : celui qui a le plus de médias
{
  const r = choix([sujet("Premier sujet sur la réforme des retraites", 3), sujet("Second sujet sur le budget de la défense nationale", 5)]);
  assert.strictEqual(r.indice, 1);
}
// Élagage : 30 dernières entrées, images des 3 derniers jours seulement
{
  const entrees = Array.from({ length: 35 }, (_, i) => ({ id: i.toString(16).padStart(12, "0"), cree: new Date(now.getTime() - (35 - i) * 6 * 36e5).toISOString() }));
  const { gardees, images } = elaguer(entrees, now);
  assert.strictEqual(gardees.length, 30);
  assert.ok(images.size < 30 && images.size > 0 && images.has(entrees[34].id) && !images.has(entrees[5].id));
}

console.log("stories-auto : tous les tests passent.");
