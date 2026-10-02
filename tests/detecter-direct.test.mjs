// Tests de scripts/detecter-direct.js sur fixtures (titres fictifs). USAGE : node tests/detecter-direct.test.mjs
import assert from "assert";
import { detecter, detecterPresident, typeParole, annonceHoraire } from "../scripts/detecter-direct.js";
import { evaluer } from "../scripts/garde.js";

const now = new Date("2026-10-02T14:00:00Z");
const il_y_a = (h) => new Date(now.getTime() - h * 36e5).toISOString();
const actu = (...arts) => ({ sujets: [{ medias: 1, derniere: arts[0].date, articles: arts.map((a, i) => ({ media: "Média test", url: `https://example.org/${i}`, ...a })) }] });

// Annonce « ce soir à 20 h » : détectée
{
  const ev = detecterPresident(actu({ titre: "Emmanuel Macron s'exprimera ce soir à 20 h", date: il_y_a(1) }), now);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].type, "prise-de-parole");
  assert.equal(ev[0].quand, "Ce soir à 20 h");
  assert.equal(ev[0].source.media, "Média test");
  assert.equal(ev[0].chaines.length, 5);
  assert.ok(ev[0].chaines.every((c) => /^https:\/\//.test(c.url)));
  assert.equal(new Date(ev[0].expire) - new Date(ev[0].publie), 6 * 36e5);
}
// Visite sans prise de parole : non détecté
assert.equal(detecterPresident(actu({ titre: "Macron visite une usine", date: il_y_a(1) }), now).length, 0);
// Titre vieux de 10 h : retiré ; de 5 h : conservé
assert.equal(detecterPresident(actu({ titre: "Emmanuel Macron s'exprimera ce soir à 20 h", date: il_y_a(10) }), now).length, 0);
assert.equal(detecterPresident(actu({ titre: "Allocution du président de la République", date: il_y_a(5) }), now).length, 1);
// Date future lointaine ou invalide : ignorée
assert.equal(detecterPresident(actu({ titre: "Macron prend la parole", date: il_y_a(-5) }), now).length, 0);
assert.equal(detecterPresident(actu({ titre: "Macron prend la parole", date: "n'importe quoi" }), now).length, 0);
// Sans le chef de l'État : non détecté
assert.equal(typeParole("Le Premier ministre prononce un discours"), null);
assert.equal(typeParole("Conférence de presse de Macron à Bruxelles"), "conference");
assert.equal(typeParole("Interview du président de la République sur France 2"), "interview");
assert.equal(annonceHoraire("Macron, discours demain à 20 h 30"), "demain à 20 h 30");
assert.equal(annonceHoraire("Macron prend la parole"), null);
// Un seul événement par type, le plus récent
{
  const ev = detecterPresident(actu({ titre: "Macron : allocution ce soir", date: il_y_a(4), url: "https://example.org/a" }, { titre: "Allocution de Macron à 20 h", date: il_y_a(1), url: "https://example.org/b" }), now);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].source.url, "https://example.org/b");
}

// Séance de l'Assemblée : jour de séance = aujourd'hui (heure de Paris), lien vers le direct officiel
const agenda = { lastUpdated: il_y_a(2), sourceUrl: "https://www2.assemblee-nationale.fr/agendas/les-agendas", jours: [{ date: "2026-10-02", points: [{ type: "texte", objet: "Proposition de loi fictive" }] }, { date: "2026-10-05", points: [{ type: "texte", objet: "Autre texte" }] }] };
{
  const d = detecter({ sujets: [] }, agenda, now);
  assert.equal(d.evenements.length, 1);
  assert.equal(d.evenements[0].type, "seance-an");
  assert.equal(d.evenements[0].chaines[0].url, "https://videos.assemblee-nationale.fr/");
  assert.ok(new Date(d.evenements[0].expire) > now && new Date(d.evenements[0].expire) - now <= 24 * 36e5);
}
// Pas de séance aujourd'hui, ou agenda trop ancien : rien
assert.equal(detecter({ sujets: [] }, agenda, new Date("2026-10-03T10:00:00Z")).evenements.length, 0);
assert.equal(detecter({ sujets: [] }, { ...agenda, lastUpdated: il_y_a(80) }, now).evenements.length, 0);
// Rien du tout : liste vide, acceptée par le garde-fou (fichier d'événements ponctuels)
{
  const vide = detecter({ sujets: [] }, { jours: [] }, now);
  assert.deepEqual(vide.evenements, []);
  assert.ok(evaluer({ evenements: [{ titre: "x" }] }, vide, { liste: (d) => d.evenements, videPermis: true }).ok);
  assert.ok(!evaluer({ evenements: [{ titre: "x" }] }, vide, { liste: (d) => d.evenements }).ok);
}
console.log("detecter-direct : tests OK");
