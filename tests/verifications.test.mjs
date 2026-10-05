import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { lireFlux, retenir, periodeReserve, MEDIAS } from "../scripts/fetch-verifications.js";

const maintenant = new Date("2026-10-05T12:00:00Z");
const fixture = (n) => readFile(new URL(`./fixtures/verifications/${n}.xml`, import.meta.url), "utf-8");

test("RSS : garde les liens https du média, récents, titres décodés", async () => {
  const r = retenir(lireFlux(await fixture("decodeurs")), MEDIAS.find((m) => m.id === "decodeurs"), maintenant);
  assert.equal(r.length, 1);
  assert.equal(r[0].titre, "Non, cette vidéo ne montre pas \"un cortège\" à Paris");
});
test("Atom : lu aussi", async () => {
  const r = retenir(lireFlux(await fixture("afp")), MEDIAS.find((m) => m.id === "afp"), maintenant);
  assert.equal(r.length, 1);
  assert.equal(r[0].media, "AFP Factuel");
});
test("période de réserve : titres sur les sondages écartés", () => {
  const lus = [{ titre: "Ce sondage est-il fiable ?", url: "https://www.lemonde.fr/a", date: new Date("2027-05-01T08:00:00Z") }];
  assert.equal(retenir(lus, MEDIAS[0], new Date("2027-05-01T09:00:00Z"), true).length, 0);
  assert.equal(periodeReserve(new Date("2027-05-01T09:00:00Z")), true);
  assert.equal(periodeReserve(maintenant), false);
});
