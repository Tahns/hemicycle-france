#!/usr/bin/env node
/**
 * Test de fumée des comptes : un FAUX serveur Supabase intercepté par Playwright (page.route), aucun réseau réel.
 *  1. sans data/compte-config.json : rien de visible, aucune requête vers Supabase, mentions « aucune donnée » ;
 *  2. configuration présente mais CSP non mise à jour : fonction cachée (garde-fou) ;
 *  3. configuration + CSP : Mon espace local, lien magique simulé, fusion, synchronisation, export, déconnexion,
 *     connexion « Google » simulée (redirection puis fragment d'URL), suppression du compte, contenu hostile neutralisé.
 * Appelé par tests/smoke.cjs ; utilisable seul : node tests/compte-fumee.cjs
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const RACINE = path.resolve(__dirname, "..");
const PROJET = "https://test-projet.supabase.co";
const CLE = "eyJhbGciOiJIUzI1NiJ9." + Buffer.from(JSON.stringify({ role: "anon", iss: "supabase" })).toString("base64url") + ".signature-de-test";
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-expose-headers": "*" };

/** Faux Supabase : jetons, utilisateurs, table profils avec « RLS » (chacun ne voit que sa ligne). */
function fauxSupabase() {
  const etat = { otp: [], utilisateurs: new Map(), jetons: new Map(), profils: new Map(), supprimes: [], refus: 0, requetes: 0, n: 0 };
  const uuid = (k) => `00000000-0000-4000-8000-${String(k).padStart(12, "0")}`;
  etat.creerSession = (email, retourNom) => {
    let u = [...etat.utilisateurs.values()].find((x) => x.email === email);
    if (!u) { u = { id: uuid(++etat.n), email }; etat.utilisateurs.set(u.id, u); }
    const acces = `acces-${++etat.n}-` + "x".repeat(40), refresh = `refresh-${etat.n}`;
    etat.jetons.set(acces, u.id);
    etat.jetons.set(refresh, u.id);
    return { u, acces, refresh };
  };
  etat.fragment = (s) => `#access_token=${s.acces}&refresh_token=${s.refresh}&expires_in=3600&token_type=bearer&type=magiclink`;
  etat.gerer = async (route) => {
    const req = route.request(), url = new URL(req.url());
    etat.requetes++;
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const json = (status, corps) => route.fulfill({ status, headers: { ...CORS, "content-type": "application/json" }, body: corps === undefined ? "" : JSON.stringify(corps) });
    const jeton = (req.headers().authorization || "").replace(/^Bearer /, "");
    const uid = etat.jetons.get(jeton);
    const p = url.pathname;
    if (p === "/auth/v1/authorize") {
      const s = etat.creerSession(`${url.searchParams.get("provider")}@exemple.fr`);
      // Playwright ne suit pas un 302 simulé : la « page du fournisseur » renvoie aussitôt vers le site, jeton dans le fragment
      return route.fulfill({ status: 200, contentType: "text/html", body: `<!doctype html><title>Fournisseur simulé</title><script>location.replace(${JSON.stringify(url.searchParams.get("redirect_to") + etat.fragment(s))})</script>` });
    }
    if (req.headers().apikey !== CLE) { etat.refus++; return json(401, { message: "clé inconnue" }); }   // sauf la navigation vers le fournisseur, qui n'envoie pas de clé
    if (p === "/auth/v1/otp" && req.method() === "POST") { etat.otp.push({ ...req.postDataJSON(), redirect_to: url.searchParams.get("redirect_to") }); return json(200, {}); }
    if (p === "/auth/v1/user") return uid ? json(200, etat.utilisateurs.get(uid)) : json(401, {});
    if (p === "/auth/v1/token") {
      const id = etat.jetons.get(req.postDataJSON().refresh_token);
      if (!id) return json(400, {});
      const s = etat.creerSession(etat.utilisateurs.get(id).email);
      return json(200, { access_token: s.acces, refresh_token: s.refresh, expires_in: 3600 });
    }
    if (p === "/auth/v1/logout") return route.fulfill({ status: 204, headers: CORS });
    if (!uid) { etat.refus++; return json(401, {}); }
    if (p === "/rest/v1/profils" && req.method() === "GET") {
      const cible = (url.searchParams.get("user_id") || "").replace("eq.", "");
      const ligne = etat.profils.get(cible === uid ? uid : "interdit");  // RLS : seule sa propre ligne est visible
      return json(200, ligne ? [ligne] : []);
    }
    if (p === "/rest/v1/profils" && req.method() === "POST") {
      const c = req.postDataJSON();
      if (c.user_id !== uid) { etat.refus++; return json(403, {}); }   // RLS : with check
      etat.profils.set(uid, { donnees: c.donnees, mis_a_jour: new Date().toISOString() });
      return route.fulfill({ status: 201, headers: CORS });
    }
    if (p === "/rest/v1/rpc/supprimer_mon_compte") {
      etat.utilisateurs.delete(uid); etat.profils.delete(uid); etat.supprimes.push(uid);
      for (const [k, v] of etat.jetons) if (v === uid) etat.jetons.delete(k);
      return route.fulfill({ status: 204, headers: CORS });
    }
    return json(404, {});
  };
  return etat;
}

async function pageAvec(navigateur, base, { config, csp, viewport = { width: 1300, height: 900 }, faux }) {
  const ctx = await navigateur.newContext({ viewport, locale: "fr-FR", serviceWorkers: "block", acceptDownloads: true });
  const page = await ctx.newPage();
  const erreurs = [], hotesTiers = [];
  page.on("pageerror", (e) => erreurs.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/fonts\.g|Failed to load resource/.test(m.text())) erreurs.push(m.text()); });
  page.on("request", (r) => { const u = new URL(r.url()); if (!/^(localhost|127\.0\.0\.1)$/.test(u.hostname) && u.protocol.startsWith("http")) hotesTiers.push(u.origin); });
  if (config) await page.route("**/data/compte-config.json", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(config) }));
  if (csp) await page.route(/\/$/, async (route) => {
    const rep = await route.fetch();
    await route.fulfill({ response: rep, body: (await rep.text()).replace("connect-src 'self'", `connect-src 'self' ${csp}`) });
  });
  if (faux) await page.route(PROJET + "/**", faux.gerer);
  return { ctx, page, erreurs, hotesTiers };
}

async function testerComptes({ navigateur, base, verifier, dossierCaptures }) {
  const visible = (page, sel) => page.evaluate((s) => { const n = document.querySelector(s); return !!n && !n.hidden && n.offsetParent !== null && getComputedStyle(n).visibility !== "hidden"; }, sel);
  const config = { url: PROJET, cle_publique: CLE, fournisseurs: ["google", "azure"] };

  // 1. Sans configuration : le site est celui d'avant
  {
    const faux = fauxSupabase();
    const { ctx, page, erreurs, hotesTiers } = await pageAvec(navigateur, base, { faux });
    await page.goto(base + "#espace", { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    verifier(!(await visible(page, "#espace-haut")) && !(await visible(page, "#espace-plus")) && !(await visible(page, "#espace-pied")), "comptes : sans configuration, un bouton « Mon espace » est visible");
    verifier(!(await page.evaluate(() => document.querySelector("#view-espace").classList.contains("active"))), "comptes : sans configuration, la page Mon espace s'ouvre");
    verifier(!(await page.evaluate(() => /Mon espace/.test(document.getElementById("menu-quiz")?.textContent || ""))), "comptes : sans configuration, le menu Quiz propose Mon espace");
    verifier(await page.evaluate(() => !document.getElementById("mention-sans-compte").hidden && document.getElementById("mentions-compte").hidden), "comptes : sans configuration, les mentions doivent garder « aucune inscription »");
    verifier(faux.requetes === 0 && hotesTiers.length === 0, "comptes : sans configuration, aucune requête ne doit sortir du site (" + hotesTiers.join(",") + ")");
    verifier(!erreurs.length, "comptes : erreurs sans configuration : " + erreurs.join(" | "));
    verifier(await page.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]').content.includes("connect-src 'self';")), "comptes : la CSP doit rester « connect-src 'self' »");
    await ctx.close();
  }

  // 2. Configuration présente mais CSP inchangée : garde-fou, fonction cachée
  {
    const faux = fauxSupabase();
    const { ctx, page } = await pageAvec(navigateur, base, { config, faux });
    await page.goto(base, { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    verifier(!(await visible(page, "#espace-haut")) && faux.requetes === 0, "comptes : sans CSP à jour, la fonction doit rester cachée et silencieuse");
    await ctx.close();
  }

  // 3. Configuration + CSP : parcours complet
  const faux = fauxSupabase();
  const { ctx, page, erreurs, hotesTiers } = await pageAvec(navigateur, base, { config, csp: PROJET, faux });
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForSelector("#espace-haut:not([hidden])", { timeout: 5000 }).catch(() => {});
  verifier(await visible(page, "#espace-haut"), "comptes : avec configuration, le bouton « Mon espace » doit apparaître");
  verifier(await page.evaluate(() => /Mon espace/.test(document.getElementById("menu-quiz").textContent)), "comptes : le menu déroulant Quiz doit proposer Mon espace");
  verifier(await visible(page, "#mentions-compte") === false && await page.evaluate(() => !document.getElementById("mentions-compte").hidden), "comptes : les mentions « Compte et données personnelles » doivent être actives");
  verifier(await page.evaluate(() => document.getElementById("mention-sans-compte").hidden), "comptes : la mention « aucune inscription » doit disparaître quand les comptes sont actifs");

  // Mon espace, mode local
  await page.click("#espace-haut");
  await page.waitForSelector("#view-espace.active #espace-contenu .espace-bloc");
  verifier(await page.evaluate(() => /Sur cet appareil/.test(document.getElementById("espace-contenu").textContent)), "comptes : Mon espace doit s'ouvrir en mode local");
  // Favori de rubrique + groupe suivi + historique du quiz (local)
  await page.evaluate(() => activateTab("budget"));
  await page.click('#view-budget [data-espace-fav="rubrique"]');
  verifier(await page.evaluate(() => ESPACE.favoris.rubriques.includes("budget")), "comptes : le favori de rubrique n'est pas enregistré");
  await page.evaluate(() => activateTab("quiz"));
  await page.waitForSelector(".quiz-option");
  for (const o of await page.$$('.quiz-options .quiz-option[data-vote="pour"]')) await o.click();
  await page.click("#quiz-submit:not([disabled])");
  await page.waitForSelector("#quiz-restart", { timeout: 10000 });
  verifier(await page.evaluate(() => ESPACE.quiz.length === 1), "comptes : le résultat du quiz n'est pas gardé dans l'historique");
  await page.evaluate(() => { ESPACE.suivi.groupe = { id: "LFI", nom: "La France insoumise" }; ESPACE.favoris.candidats.push({ nom: "Candidat Test" }); espaceChange(); });
  verifier(await page.evaluate(() => JSON.parse(localStorage.getItem("espace-local")).suivi.groupe.id === "LFI"), "comptes : le stockage local n'est pas écrit");
  verifier(faux.requetes === 0, "comptes : en mode local, aucune requête vers Supabase");
  await page.click("#espace-haut");
  await page.waitForSelector("#espace-contenu .espace-bloc");
  if (dossierCaptures) await page.screenshot({ path: path.join(dossierCaptures, "espace-local-bureau.png"), fullPage: true });

  // Formulaire : âge, e-mail, limite de débit, lien magique simulé
  await page.click("#espace-contenu >> text=Créer un compte pour les retrouver partout");
  verifier(await visible(page, '[data-fournisseur="google"]') && await visible(page, '[data-fournisseur="azure"]') && !(await page.$('[data-fournisseur="apple"]')), "comptes : seuls les fournisseurs de la configuration doivent s'afficher");
  await page.fill("#espace-email", "visiteur@exemple.fr");
  await page.click(".espace-form button[type=submit]");
  verifier(/15 ans/.test(await page.textContent("#espace-form-msg")) && faux.otp.length === 0, "comptes : sans la case « 15 ans », aucun envoi");
  await page.check("#espace-age");
  await page.fill("#espace-email", "pas-un-email");
  await page.click(".espace-form button[type=submit]");
  verifier(/valide/.test(await page.textContent("#espace-form-msg")) && faux.otp.length === 0, "comptes : un e-mail invalide doit être refusé côté interface");
  await page.fill("#espace-email", "visiteur@exemple.fr");
  await page.click(".espace-form button[type=submit]");
  await page.waitForFunction(() => /lien de connexion vient/.test(document.getElementById("espace-form-msg").textContent));
  verifier(faux.otp.length === 1 && faux.otp[0].email === "visiteur@exemple.fr" && faux.otp[0].redirect_to === base, "comptes : lien magique mal demandé " + JSON.stringify(faux.otp));
  await page.click(".espace-form button[type=submit]");
  verifier(/Patientez/.test(await page.textContent("#espace-form-msg")) && faux.otp.length === 1, "comptes : le second envoi immédiat doit être bloqué par la limite de débit");

  // Retour du lien magique : jeton dans le fragment, URL nettoyée, fusion avec confirmation
  const s1 = faux.creerSession("visiteur@exemple.fr");
  await page.goto("about:blank");  // un lien reçu par e-mail ouvre une nouvelle page, pas un simple changement de fragment
  await page.goto(base + faux.fragment(s1), { waitUntil: "networkidle" });
  await page.waitForSelector("#espace-confirm:not([hidden])", { timeout: 8000 });
  verifier(await page.evaluate(() => !/access_token|refresh_token/.test(location.href)), "comptes : le jeton doit disparaître de l'adresse");
  verifier(/préférences existent sur cet appareil/.test(await page.textContent("#espace-confirm")), "comptes : la fusion doit demander confirmation");
  verifier(!faux.profils.size, "comptes : rien ne doit être envoyé avant la confirmation");
  await page.click("#espace-confirm button:has-text(\"Oui, les ajouter\")");
  await page.waitForFunction(() => /visiteur@exemple\.fr/.test(document.getElementById("espace-contenu").textContent));
  await page.waitForTimeout(500);
  const ligne = faux.profils.get(s1.u.id);
  verifier(ligne && ligne.donnees.suivi.groupe.id === "LFI" && ligne.donnees.favoris.rubriques.includes("budget") && ligne.donnees.quiz.length === 1, "comptes : les préférences locales n'ont pas été envoyées au compte");
  verifier(await page.evaluate(() => JSON.parse(localStorage.getItem("compte-session")).user.email === "visiteur@exemple.fr"), "comptes : la session n'est pas stockée");
  if (dossierCaptures) await page.screenshot({ path: path.join(dossierCaptures, "espace-connecte-bureau.png"), fullPage: true });

  // Synchronisation d'un changement
  await page.evaluate(() => espaceBasculerFavori("rubrique", "budget"));
  await page.waitForTimeout(1200);
  verifier(!faux.profils.get(s1.u.id).donnees.favoris.rubriques.includes("budget"), "comptes : la modification n'est pas synchronisée");

  // Rechargement : session reprise, pas de question, données du compte
  await page.goto("about:blank");
  await page.goto(base + "#espace", { waitUntil: "networkidle" });
  await page.waitForFunction(() => /visiteur@exemple\.fr/.test(document.getElementById("espace-contenu")?.textContent || ""), null, { timeout: 8000 });
  verifier(await page.evaluate(() => document.getElementById("espace-confirm").hidden), "comptes : une session reprise ne doit pas redemander la fusion");
  verifier(await page.evaluate(() => ESPACE.suivi.groupe && ESPACE.suivi.groupe.id === "LFI"), "comptes : les données du compte ne sont pas rechargées");

  // Export
  const [telechargement] = await Promise.all([page.waitForEvent("download", { timeout: 8000 }), page.click("#espace-contenu >> text=Télécharger mes données")]);
  const exporte = JSON.parse(fs.readFileSync(await telechargement.path(), "utf-8"));
  verifier(exporte.compte.email === "visiteur@exemple.fr" && exporte.preferences.suivi.groupe.id === "LFI" && telechargement.suggestedFilename().endsWith(".json"), "comptes : export JSON incorrect");

  // Déconnexion : l'appareil est nettoyé
  await page.click("#espace-contenu >> text=Se déconnecter");
  await page.waitForFunction(() => /Sur cet appareil/.test(document.getElementById("espace-contenu").textContent));
  verifier(await page.evaluate(() => !localStorage.getItem("compte-session") && !localStorage.getItem("espace-local")), "comptes : la déconnexion doit effacer session et préférences de l'appareil");

  // Connexion par un fournisseur (faux Google : redirection puis fragment)
  await page.click("#espace-contenu >> text=Créer un compte pour les retrouver partout");
  await page.click('[data-fournisseur="google"]');
  verifier(/15 ans/.test(await page.textContent("#espace-form-msg")), "comptes : le fournisseur doit aussi exiger la case « 15 ans »");
  faux.profils.set(uuidGoogle(faux), { donnees: { suivi: { depute: { id: "PA1", nom: "<img src=x onerror=window.__pwned=1>" }, groupe: { id: "RN", nom: "Rassemblement national" } }, favoris: { sujets: [{ url: "javascript:alert(1)", titre: "x" }, { url: "https://exemple.fr/a", titre: "<img src=x onerror=window.__pwned=1>Titre" }], candidats: [{ nom: "<script>window.__pwned=1</script>Nom" }], rubriques: ["budget", "<b>"] }, quiz: [] }, mis_a_jour: "2026-01-01T00:00:00Z" });
  await page.check("#espace-age");
  await page.click('[data-fournisseur="google"]');
  await page.waitForFunction(() => /google@exemple\.fr/.test(document.getElementById("espace-contenu")?.textContent || ""), null, { timeout: 8000 });
  verifier(await page.evaluate(() => !/access_token/.test(location.href)), "comptes : l'adresse doit être nettoyée après la connexion Google");
  verifier(await page.evaluate(() => window.__pwned === undefined && !document.querySelector("#view-espace img[onerror], #view-espace script")), "comptes : du contenu hostile du profil a été exécuté ou injecté");
  verifier(await page.evaluate(() => ESPACE.favoris.sujets.length === 1 && ESPACE.favoris.sujets[0].url === "https://exemple.fr/a" && ESPACE.favoris.rubriques.join() === "budget"), "comptes : les données du compte doivent être nettoyées à la lecture");
  verifier(await page.evaluate(() => !!document.querySelector('#espace-contenu a[href="javascript:alert(1)"]') === false), "comptes : un lien javascript: a été affiché");

  // RLS simulée : un autre utilisateur ne lit pas ce profil
  verifier(faux.refus === 0, "comptes : le faux serveur a refusé des requêtes du client (" + faux.refus + ")");

  // Suppression du compte
  await page.click("#espace-contenu >> text=Supprimer mon compte et mes données");
  await page.waitForSelector("#espace-confirm:not([hidden])");
  await page.click("#espace-confirm button:has-text(\"Annuler\")");
  verifier(faux.supprimes.length === 0, "comptes : « Annuler » ne doit rien supprimer");
  await page.click("#espace-contenu >> text=Supprimer mon compte et mes données");
  await page.click("#espace-confirm button:has-text(\"Supprimer définitivement\")");
  await page.waitForFunction(() => /ont été supprimés/.test(document.getElementById("espace-contenu").textContent));
  verifier(faux.supprimes.length === 1 && !faux.profils.has(faux.supprimes[0]) && ![...faux.utilisateurs.values()].some((u) => u.email === "google@exemple.fr"), "comptes : le compte et le profil doivent être supprimés côté serveur");
  verifier(await page.evaluate(() => !localStorage.getItem("compte-session")), "comptes : la session doit être effacée après suppression");

  // Retour en erreur du fournisseur
  await page.goto("about:blank");
  await page.goto(base + "#error=access_denied&error_description=refus", { waitUntil: "networkidle" });
  await page.waitForFunction(() => /échoué|annulée/.test(document.getElementById("espace-contenu")?.textContent || ""), null, { timeout: 8000 });
  verifier(await page.evaluate(() => !/error=/.test(location.href)), "comptes : l'adresse doit être nettoyée après une erreur de connexion");

  verifier(hotesTiers.every((h) => h === PROJET), "comptes : requêtes vers un autre domaine que le projet : " + [...new Set(hotesTiers)].join(","));
  verifier(!erreurs.length, "comptes : erreurs JavaScript : " + erreurs.join(" | "));
  await ctx.close();

  // Mobile : panneau « Plus » et captures
  {
    const f = fauxSupabase();
    const { ctx: c2, page: p2, erreurs: e2 } = await pageAvec(navigateur, base, { config, csp: PROJET, faux: f, viewport: { width: 390, height: 844 } });
    await p2.goto(base, { waitUntil: "networkidle" });
    await p2.waitForSelector("#espace-plus:not([hidden])", { state: "attached", timeout: 5000 }).catch(() => {});
    await p2.click("#bouton-plus");
    verifier(await visible(p2, "#espace-plus"), "comptes : « Mon espace » doit figurer dans le panneau Plus (mobile)");
    await p2.click("#espace-plus");
    await p2.waitForSelector("#view-espace.active #espace-contenu .espace-bloc");
    verifier((await p2.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 1, "comptes : défilement horizontal sur Mon espace (mobile)");
    await p2.evaluate(() => { ESPACE.suivi.groupe = { id: "LFI", nom: "La France insoumise" }; ESPACE.favoris.rubriques.push("budget"); espaceChange(); });
    await p2.click("#espace-contenu >> text=Créer un compte pour les retrouver partout");
    if (dossierCaptures) await p2.screenshot({ path: path.join(dossierCaptures, "espace-local-mobile.png"), fullPage: true });
    const s = f.creerSession("visiteur@exemple.fr");
    await p2.goto("about:blank");
    await p2.goto(base + f.fragment(s), { waitUntil: "networkidle" });
    await p2.waitForSelector("#espace-confirm:not([hidden])", { timeout: 8000 }).catch(() => {});
    await p2.evaluate(() => { if (!document.getElementById("espace-confirm").hidden) document.querySelector("#espace-confirm button").click(); });
    await p2.waitForFunction(() => /visiteur@exemple\.fr/.test(document.getElementById("espace-contenu")?.textContent || ""));
    verifier((await p2.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 1, "comptes : défilement horizontal sur Mon espace connecté (mobile)");
    if (dossierCaptures) await p2.screenshot({ path: path.join(dossierCaptures, "espace-connecte-mobile.png"), fullPage: true });
    verifier(!e2.length, "comptes : erreurs JavaScript (mobile) : " + e2.join(" | "));
    await c2.close();
  }
}

function uuidGoogle(faux) {
  const u = [...faux.utilisateurs.values()].find((x) => x.email === "google@exemple.fr");
  if (u) return u.id;
  // L'utilisateur Google est créé par le faux serveur à la redirection : on le prépare pour y rattacher un profil
  const s = faux.creerSession("google@exemple.fr");
  return s.u.id;
}

module.exports = { testerComptes };

if (require.main === module) {
  const { chromium } = require("playwright");
  (async () => {
    const s = await new Promise((ok) => {
      const srv = http.createServer((req, res) => {
        const url = decodeURIComponent(req.url.split("?")[0]);
        const f = path.join(RACINE, url === "/" ? "index.html" : url);
        if (!f.startsWith(RACINE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { "Content-Type": { ".html": "text/html; charset=utf-8", ".json": "application/json", ".js": "text/javascript", ".svg": "image/svg+xml" }[path.extname(f)] || "application/octet-stream" });
        fs.createReadStream(f).pipe(res);
      });
      srv.listen(0, () => ok(srv));
    });
    const navigateur = await chromium.launch();
    const echecs = [];
    const dossierCaptures = process.env.CAPTURES || null;
    await testerComptes({ navigateur, base: `http://localhost:${s.address().port}/`, verifier: (c, m) => { if (!c) echecs.push(m); }, dossierCaptures });
    await navigateur.close(); s.close();
    if (echecs.length) { console.error("ÉCHEC :\n- " + echecs.join("\n- ")); process.exit(1); }
    console.log("Comptes (faux Supabase) : OK.");
  })().catch((e) => { console.error(e); process.exit(1); });
}
