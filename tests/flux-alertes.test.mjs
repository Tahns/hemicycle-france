// Tests des flux d'alertes (scripts/flux-alertes.js) : flux par député et par texte, plafonds, validité Atom. Aucun réseau.
// USAGE : node --test tests/flux-alertes.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { fluxDepute, fluxLoi, choisirTextes, MAX_LOIS, MAX_ENTREES, MAX_ENTREES_DEPUTE } from "../scripts/flux-alertes.js";
import { atom, dateLongue, dateCourte, esc } from "../scripts/flux-atom.js";
import { controlerAtom } from "../scripts/controles-digest.js";

const groupes = (p, c, a) => ({ RN: { pour: p, contre: c, abst: a, membres: p + c + a } });
const loi = (numero, dateISO, typeVote, extra = {}) => ({
  numero, titre: `l'ensemble du texte n° ${numero} & « suite ».`, date: dateLongue(dateISO), dateISO, typeVote, resultat: numero % 2 ? "adopte" : "rejete",
  sourceUrl: `https://www.assemblee-nationale.fr/dyn/17/scrutins/${numero}`, votes: groupes(100 + numero, 50, 2), ...extra,
});
const lois = [
  loi(30, "2026-10-05", "SPO", { dossierRef: "DLR_A", dossierTitre: "Texte A" }),
  loi(29, "2026-10-04", "SPO", { dossierRef: "DLR_A", dossierTitre: "Texte A" }),
  loi(28, "2026-07-01", "SPS", { dossierRef: "DLR_B", dossierTitre: "Texte B (ancien mais voté dans son ensemble)", dossierUrl: "https://www.assemblee-nationale.fr/dyn/17/dossiers/DLR_B" }),
  loi(27, "2026-06-01", "SPO", { dossierRef: "DLR_C", dossierTitre: "Texte C (amendements anciens)" }),
  loi(26, "2026-05-01", "MOC"),
];
const ctx = { cles: [30, 28, 26, 27, 99], loisParNumero: new Map(lois.map((l) => [l.numero, l])), pageVote: (n) => n === 28 };
const depute = { id: "PA1", nom: "Alice Martin", f: 1, groupe: "RN", dep: "Ariège", votes: "pc-a." };
const maintenant = new Date("2026-10-06T12:00:00Z");

test("flux d'un député : un vote par entrée, abstentions et absences, liens, ordre", () => {
  const xml = fluxDepute(depute, ctx);
  assert.deepEqual(controlerAtom("depute", xml, { maxEntrees: MAX_ENTREES_DEPUTE }), []);
  const entrees = [...xml.matchAll(/<entry>[\s\S]*?<\/entry>/g)].map((m) => m[0]);
  assert.equal(entrees.length, 3, "pas d'entrée pour « n'a pas pris part » (-) ni pour un scrutin sans vote du député (.)");
  assert.match(entrees[0], /Vote « pour »/);
  assert.match(entrees[1], /Vote « contre »/);
  assert.match(entrees[2], /Vote « abstention »/);
  assert.match(xml, /href="[^"]*\/v\/28\.html"/, "page du site quand elle existe");
  assert.match(xml, /href="https:\/\/www\.assemblee-nationale\.fr\/dyn\/17\/scrutins\/30"/, "sinon la fiche officielle");
  assert.match(xml, /<updated>2026-10-05T12:00:00Z<\/updated>\s*<author>/, "flux daté du vote le plus récent (déterministe)");
});

test("flux d'un député : le féminin, aucun vote -> pas de flux, plafond d'entrées", () => {
  assert.match(fluxDepute(depute, ctx), /de la députée Alice Martin/);
  assert.equal(fluxDepute({ ...depute, votes: "-.---" }, ctx), null);
  const nombreux = Array.from({ length: 40 }, (_, i) => loi(1000 - i, "2026-09-01", "SPS"));
  const c = { cles: nombreux.map((l) => l.numero), loisParNumero: new Map(nombreux.map((l) => [l.numero, l])), pageVote: () => false };
  const xml = fluxDepute({ ...depute, votes: "p".repeat(40) }, c);
  assert.equal((xml.match(/<entry>/g) || []).length, MAX_ENTREES_DEPUTE);
});

test("textes suivis : votés dans leur ensemble ou récents, plafonnés, plus récents d'abord", () => {
  const m = choisirTextes(lois, maintenant);
  assert.deepEqual([...m.keys()], ["DLR_A", "DLR_B"], "C : seulement des amendements, vieux de plus de 90 jours -> exclu ; la motion sans dossier n'a pas de flux");
  assert.deepEqual(m.get("DLR_A").map((l) => l.numero), [30, 29]);
  const beaucoup = Array.from({ length: MAX_LOIS + 20 }, (_, i) => loi(5000 + i, "2026-10-01", "SPS", { dossierRef: `D${i}`, dossierTitre: `T${i}` }));
  const plafonne = choisirTextes(beaucoup, maintenant);
  assert.equal(plafonne.size, MAX_LOIS);
  assert.ok(plafonne.has(`D${MAX_LOIS + 19}`) && !plafonne.has("D0"), "les plus anciens sont écartés");
});

test("flux d'un texte : scrutins de l'Assemblée et votes du Sénat mêlés par date, valides", () => {
  const senat = { dossier: "https://www.senat.fr/dossier-legislatif/ppl25-1.html", votes: [{ date: "2 octobre 2026", dateISO: "2026-10-02", resultat: "adopte", pour: 200, contre: 100, url: "https://www.senat.fr/scrutin-public/2026/scr2026-1.html" }] };
  const xml = fluxLoi("DLR_A", choisirTextes(lois, maintenant).get("DLR_A"), senat, ctx);
  assert.deepEqual(controlerAtom("loi", xml, { maxEntrees: MAX_ENTREES }), []);
  const ordre = [...xml.matchAll(/<title>([^<]*)<\/title>/g)].map((m) => m[1]);
  assert.match(ordre[0], /Hémicycle France · Texte A/);
  assert.match(ordre[1], /^Assemblée/);
  assert.match(ordre[3], /^Sénat : adopté \(200 pour, 100 contre\)/, "le vote du Sénat du 2 octobre vient après les scrutins des 4 et 5 octobre");
  assert.match(xml, /au Sénat/);
  assert.match(xml, /n° 30 &amp; « suite »/, "esperluette du titre échappée");
});

test("flux d'un texte : plafond d'entrées et flux vide", () => {
  const nombreux = Array.from({ length: 50 }, (_, i) => loi(2000 - i, "2026-10-01", "SPO", { dossierRef: "X", dossierTitre: "X" }));
  assert.equal((fluxLoi("X", nombreux, null, ctx).match(/<entry>/g) || []).length, MAX_ENTREES);
  assert.equal(fluxLoi("X", [], null, ctx), null);
});

test("Atom : contrôle refuse un flux cassé", () => {
  const bon = atom({ titre: "T", id: "https://x/y", self: "https://x/y.xml", alternate: "https://x/", updated: "2026-10-05T12:00:00Z", entrees: [{ id: "https://x/1", titre: "A & B", lien: "https://x/1", updated: "2026-10-05T12:00:00Z" }] });
  assert.deepEqual(controlerAtom("bon", bon), []);
  assert.ok(controlerAtom("m", bon.replace("A &amp; B", "A & B")).some((m) => /non échappé/.test(m)));
  assert.ok(controlerAtom("m", bon.replace("</entry>", "")).some((m) => /<entry>/.test(m)));
  assert.ok(controlerAtom("m", bon.replace('href="https://x/1"', 'href="http://x/1"')).some((m) => /lien https/.test(m)));
  assert.ok(controlerAtom("m", bon.replace("</feed>", "")).some((m) => /non fermé/.test(m)));
});

test("dates en français", () => {
  assert.equal(dateLongue("2026-10-01"), "1er octobre 2026");
  assert.equal(dateLongue("2026-10-11"), "11 octobre 2026");
  assert.equal(dateCourte("2026-10-11"), "dimanche 11 octobre");
  assert.equal(esc(`<a href="x">'&`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;");
});
