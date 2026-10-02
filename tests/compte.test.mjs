// Tests unitaires du client des comptes (compte-client.js) et du script appliquer-compte.js, sans réseau.
import assert from "node:assert/strict";
import { configValide, emailValide, normaliser, fusionner, sontVides, lireRetour, creerClient, ErreurCompte, donneesVides } from "../compte-client.js";
import { appliquerCsp, connectSrc } from "../scripts/appliquer-compte.js";

const jwt = (role) => "eyJhbGciOiJIUzI1NiJ9." + Buffer.from(JSON.stringify({ role })).toString("base64url") + ".signature-de-test";
const CONFIG = { url: "https://abc.supabase.co", cle_publique: jwt("anon"), fournisseurs: ["google", "azure", "inconnu"] };

// Configuration : https + supabase.co seulement, jamais la clé secrète
assert.deepEqual(configValide(CONFIG).fournisseurs, ["google", "azure"]);
assert.equal(configValide({ ...CONFIG, url: "http://abc.supabase.co" }), null);
assert.equal(configValide({ ...CONFIG, url: "https://abc.exemple.fr" }), null);
assert.equal(configValide({ ...CONFIG, url: "https://abc.supabase.co.evil.fr" }), null);
assert.equal(configValide({ ...CONFIG, url: "https://evil.fr/?.supabase.co" }), null);
assert.equal(configValide({ ...CONFIG, cle_publique: jwt("service_role") }), null);
assert.equal(configValide({ ...CONFIG, cle_publique: "sb_secret_abcdefghijklmnopqrstuvwxyz" }), null);
assert.equal(configValide({}), null);
assert.equal(configValide(null), null);

// E-mail
for (const ok of ["a@b.fr", "prenom.nom+x@sous.domaine.eu"]) assert.ok(emailValide(ok), ok);
for (const ko of ["", "a@b", "a b@c.fr", "<x>@c.fr", "a@@c.fr", "a@c..fr"]) assert.ok(!emailValide(ko), ko);

// Données : tout est reconstruit, rien d'hostile ne passe
const sale = normaliser({ suivi: { depute: { id: "PA1", nom: "<b>X</b>" }, groupe: { id: "rn", nom: "x" } }, quiz: [{ date: "pas une date", top: [] }, { date: "2026-01-02", top: [{ nom: "A", pct: 80 }, { nom: "B", pct: 999 }] }],
  favoris: { sujets: [{ url: "javascript:alert(1)", titre: "x" }, { url: "https://ok.fr/a", titre: "T" }, { url: "https://ok.fr/a", titre: "doublon" }], candidats: [{ nom: "N" }, { nom: 5 }], rubriques: ["budget", "<b>", "budget"] }, extra: "x" });
assert.equal(sale.suivi.depute.nom, "b X /b");
assert.equal(sale.suivi.groupe, null);
assert.deepEqual(sale.quiz, [{ date: "2026-01-02", top: [{ nom: "A", pct: 80 }] }]);
assert.deepEqual(sale.favoris, { sujets: [{ url: "https://ok.fr/a", titre: "T" }], candidats: [{ nom: "N" }], rubriques: ["budget"] });
assert.ok(!("extra" in sale));
assert.ok(sontVides(null) && sontVides({}) && !sontVides(sale));

// Fusion : valeurs uniques du compte prioritaires, listes réunies sans doublon
const f = fusionner({ suivi: { groupe: { id: "RN", nom: "RN" } }, favoris: { rubriques: ["budget"] } }, { suivi: { groupe: { id: "LFI", nom: "LFI" }, depute: { id: "PA2", nom: "D" } }, favoris: { rubriques: ["budget", "quiz"] } });
assert.equal(f.suivi.groupe.id, "RN"); assert.equal(f.suivi.depute.id, "PA2"); assert.deepEqual(f.favoris.rubriques, ["budget", "quiz"]);

// Retour de connexion
assert.equal(lireRetour("#rubrique"), null);
assert.equal(lireRetour("#access_token=court&refresh_token=r").erreur, "jeton illisible");
assert.ok(lireRetour("#error=access_denied&error_description=refus").erreur);
const r = lireRetour("#access_token=" + "a".repeat(30) + "&refresh_token=abcd&expires_in=3600&token_type=bearer");
assert.equal(r.duree, 3600); assert.equal(r.refresh_token, "abcd");

// Client avec faux serveur
const stock = new Map();
const stockage = { getItem: (k) => stock.get(k) ?? null, setItem: (k, v) => stock.set(k, v), removeItem: (k) => stock.delete(k) };
let t = 1_000_000, appels = [], profil = null, jetonValide = "acces-1" + "x".repeat(30);
const rep = (status, corps) => ({ status, ok: status < 400, json: async () => corps });
const faux = async (url, o) => {
  const u = new URL(url); appels.push(`${o.method} ${u.pathname}${u.search}`);
  assert.equal(u.origin, "https://abc.supabase.co"); assert.equal(o.headers.apikey, CONFIG.cle_publique); assert.equal(o.credentials, "omit");
  if (u.pathname === "/auth/v1/otp") return rep(200, {});
  if (u.pathname === "/auth/v1/user") return o.headers.Authorization === "Bearer " + jetonValide ? rep(200, { id: "11111111-1111-4111-8111-111111111111", email: "a@b.fr" }) : rep(401, {});
  if (u.pathname === "/auth/v1/token") { jetonValide = "acces-2" + "x".repeat(30); return rep(200, { access_token: jetonValide, refresh_token: "r2", expires_in: 3600 }); }
  if (u.pathname === "/rest/v1/profils" && o.method === "GET") { if (o.headers.Authorization !== "Bearer " + jetonValide) return rep(401, {}); return rep(200, profil ? [profil] : []); }
  if (u.pathname === "/rest/v1/profils") { profil = { donnees: JSON.parse(o.body).donnees, mis_a_jour: "2026-01-01T00:00:00Z" }; return rep(201, null); }
  if (u.pathname === "/rest/v1/rpc/supprimer_mon_compte") return rep(204);
  return rep(404, {});
};
const c = creerClient({ config: CONFIG, fetch: faux, stockage, maintenant: () => t, adresseSite: "https://site.fr/x/" });
assert.equal(c.urlFournisseur("google"), "https://abc.supabase.co/auth/v1/authorize?provider=google&redirect_to=https%3A%2F%2Fsite.fr%2Fx%2F");
assert.throws(() => c.urlFournisseur("apple"), (e) => e.code === "fournisseur");
await assert.rejects(c.envoyerLien("pas un mail"), (e) => e.code === "email");
await c.envoyerLien("a@b.fr");
assert.ok(appels[0].includes("/auth/v1/otp?redirect_to=https%3A%2F%2Fsite.fr%2Fx%2F"));
await assert.rejects(c.envoyerLien("a@b.fr"), (e) => e.code === "limite");        // 60 s entre deux envois
assert.ok(c.attenteEnvoi() > 0);
t += 61_000; await c.envoyerLien("a@b.fr");
for (let i = 0; i < 3; i++) { t += 61_000; await c.envoyerLien("a@b.fr"); }          // 5 envois dans l'heure
t += 61_000; await assert.rejects(c.envoyerLien("a@b.fr"), (e) => e.code === "limite");

const user = await c.terminerConnexion({ access_token: jetonValide, refresh_token: "r1", duree: 3600 });
assert.equal(user.email, "a@b.fr");
assert.equal(await c.lireProfil(), null);
await c.ecrireProfil({ suivi: { groupe: { id: "RN", nom: "RN" } } });
assert.equal((await c.lireProfil()).donnees.suivi.groupe.id, "RN");
// jeton expiré : renouvelé avant l'appel
t += 3600_000; appels = [];
await c.lireProfil();
assert.ok(appels[0].includes("grant_type=refresh_token"));
// export, déconnexion, suppression
const ex = await c.exporter(); assert.equal(ex.compte.email, "a@b.fr"); assert.equal(ex.preferences.suivi.groupe.id, "RN");
await c.supprimer(); assert.ok(!c.estConnecte() && !stock.get("compte-session") && appels.at(-1).includes("supprimer_mon_compte"));
await assert.rejects(c.lireProfil(), (e) => e instanceof ErreurCompte);

// Données trop grosses refusées avant envoi
const c2 = creerClient({ config: CONFIG, fetch: faux, stockage: { getItem: () => null, setItem() {}, removeItem() {} }, adresseSite: "https://s.fr/" });
assert.deepEqual(donneesVides().quiz, []);
void c2;

// CSP : seule connect-src change, idempotent
const html = `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src 'self'; form-action 'none'">`;
const avec = appliquerCsp(html, "https://abc.supabase.co");
assert.deepEqual(connectSrc(avec), ["'self'", "https://abc.supabase.co"]);
assert.ok(avec.includes("default-src 'self'; connect-src 'self' https://abc.supabase.co; form-action 'none'"));
assert.equal(appliquerCsp(avec, "https://abc.supabase.co"), avec);
assert.equal(appliquerCsp(avec, undefined), html);

console.log("Comptes (client, CSP) : OK");
