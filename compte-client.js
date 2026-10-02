/**
 * compte-client.js
 * ----------------
 * Client minimal des comptes (Supabase, hébergement UE), écrit sans SDK ni script tiers :
 * il parle directement à l'API REST et à l'API d'authentification (GoTrue) avec fetch.
 * Aucune dépendance au DOM : fetch, stockage et horloge sont injectés, ce qui permet de le tester
 * (tests/compte.test.mjs) et de le charger dans la page par import() seulement si les comptes sont actifs.
 *
 * Données de l'utilisateur (e-mail + préférences) :
 *   { v:1, suivi:{ depute:{id,nom}|null, groupe:{id,nom}|null },
 *     quiz:[{ date, top:[{nom,pct}] }],
 *     favoris:{ sujets:[{url,titre}], candidats:[{nom}], rubriques:[id] } }
 * Tout ce qui vient du réseau ou du stockage est reconstruit champ par champ (normaliser) : une valeur
 * inattendue est écartée, jamais affichée telle quelle.
 */

export const FOURNISSEURS = ["google", "azure", "apple", "github"];
export const DELAI_ENVOI_MS = 60000;      // un seul lien d'accès par minute (même limite que le serveur)
export const ENVOIS_PAR_HEURE = 5;
export const CLE_SESSION = "compte-session";
export const CLE_ENVOIS = "compte-envois";
const LIMITE_OCTETS = 20000;              // même plafond que la contrainte SQL de supabase/schema.sql

/* ---------- Configuration publique ---------- */

export function decoderBase64Url(s) {
  const b = String(s).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b + "=".repeat((4 - (b.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
}

/** Configuration valide { url, cle, fournisseurs } ou null (fonction « Compte » alors cachée). */
export function configValide(c) {
  if (!c || typeof c !== "object") return null;
  const url = String(c.url || "").trim().replace(/\/+$/, "");
  const cle = String(c.cle_publique || "").trim();
  if (!/^https:\/\/[a-z0-9]([a-z0-9-]{0,60}[a-z0-9])?\.supabase\.co$/.test(url)) return null;
  if (!/^[A-Za-z0-9._-]{20,2000}$/.test(cle) || /service_role|sb_secret/.test(cle)) return null;
  if (cle.split(".").length === 3) {   // clé au format JWT : jamais la clé secrète « service_role »
    try { if (JSON.parse(decoderBase64Url(cle.split(".")[1])).role === "service_role") return null; } catch (e) { return null; }
  }
  const f = Array.isArray(c.fournisseurs) ? [...new Set(c.fournisseurs.filter((x) => FOURNISSEURS.includes(x)))] : [];
  return { url, cle, fournisseurs: f };
}

export function emailValide(s) {
  const e = String(s || "").trim();
  return e.length <= 254 && /^[^\s@<>()[\]\\,;:"]{1,64}@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(e);
}

/* ---------- Données : forme, nettoyage, fusion ---------- */

export const donneesVides = () => ({ v: 1, suivi: { depute: null, groupe: null }, quiz: [], favoris: { sujets: [], candidats: [], rubriques: [] } });

const texte = (s, max) => (typeof s === "string" ? s.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");
const dateIso = (s) => (typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "");

export function normaliser(d) {
  const r = donneesVides();
  if (!d || typeof d !== "object") return r;
  const dep = d.suivi?.depute;
  if (dep && /^PA\d{1,9}$/.test(dep.id) && texte(dep.nom, 80)) r.suivi.depute = { id: dep.id, nom: texte(dep.nom, 80) };
  const gr = d.suivi?.groupe;
  if (gr && /^[A-Z]{2,6}$/.test(gr.id) && texte(gr.nom, 60)) r.suivi.groupe = { id: gr.id, nom: texte(gr.nom, 60) };
  if (Array.isArray(d.quiz)) {
    for (const q of d.quiz.slice(0, 40)) {
      const date = dateIso(q?.date);
      const top = Array.isArray(q?.top) ? q.top.slice(0, 5).map((x) => ({ nom: texte(x?.nom, 60), pct: Math.round(Number(x?.pct)) })).filter((x) => x.nom && x.pct >= 0 && x.pct <= 100) : [];
      if (date && top.length) r.quiz.push({ date, top });
    }
    r.quiz = r.quiz.slice(0, 20);
  }
  const fav = d.favoris || {};
  const vus = new Set();
  if (Array.isArray(fav.sujets)) for (const s of fav.sujets.slice(0, 80)) {
    const url = typeof s?.url === "string" && /^https?:\/\/[^\s<>"']{4,300}$/.test(s.url) ? s.url : "", titre = texte(s?.titre, 160);
    if (url && titre && !vus.has(url) && r.favoris.sujets.length < 50) { vus.add(url); r.favoris.sujets.push({ url, titre }); }
  }
  if (Array.isArray(fav.candidats)) for (const c of fav.candidats.slice(0, 80)) {
    const nom = texte(c?.nom, 80);
    if (nom && !r.favoris.candidats.some((x) => x.nom === nom) && r.favoris.candidats.length < 50) r.favoris.candidats.push({ nom });
  }
  if (Array.isArray(fav.rubriques)) for (const id of fav.rubriques.slice(0, 60)) {
    if (typeof id === "string" && /^[a-z]{2,20}$/.test(id) && !r.favoris.rubriques.includes(id) && r.favoris.rubriques.length < 30) r.favoris.rubriques.push(id);
  }
  return r;
}

export function sontVides(d) {
  const n = normaliser(d);
  return !n.suivi.depute && !n.suivi.groupe && !n.quiz.length && !n.favoris.sujets.length && !n.favoris.candidats.length && !n.favoris.rubriques.length;
}

/** Fusion appareil → compte : les valeurs uniques du compte l'emportent, les listes sont réunies. */
export function fusionner(compte, local) {
  const a = normaliser(compte), b = normaliser(local);
  const r = donneesVides();
  r.suivi.depute = a.suivi.depute || b.suivi.depute;
  r.suivi.groupe = a.suivi.groupe || b.suivi.groupe;
  const cleQuiz = (q) => q.date + "|" + q.top.map((x) => x.nom + x.pct).join(",");
  const q = new Map();
  for (const x of [...a.quiz, ...b.quiz]) q.set(cleQuiz(x), x);
  r.quiz = [...q.values()].sort((x, y) => y.date.localeCompare(x.date)).slice(0, 20);
  r.favoris.sujets = [...new Map([...a.favoris.sujets, ...b.favoris.sujets].map((s) => [s.url, s])).values()].slice(0, 50);
  r.favoris.candidats = [...new Map([...a.favoris.candidats, ...b.favoris.candidats].map((c) => [c.nom, c])).values()].slice(0, 50);
  r.favoris.rubriques = [...new Set([...a.favoris.rubriques, ...b.favoris.rubriques])].slice(0, 30);
  return normaliser(r);
}

export const octets = (d) => new TextEncoder().encode(JSON.stringify(d)).length;

/* ---------- Retour de connexion (fragment d'URL) ---------- */

/** Lit « access_token=…&refresh_token=… » ou « error_description=… » ; null si ce n'est pas un retour de connexion. */
export function lireRetour(fragment) {
  const f = String(fragment || "").replace(/^#/, "");
  if (!/(^|&)(access_token|error|error_code|error_description)=/.test(f)) return null;
  const p = new URLSearchParams(f);
  if (p.get("error") || p.get("error_description") || p.get("error_code")) return { erreur: texte(p.get("error_description") || p.get("error") || "erreur", 200) };
  const access = p.get("access_token"), refresh = p.get("refresh_token");
  if (!/^[A-Za-z0-9._-]{20,4000}$/.test(access || "") || !/^[A-Za-z0-9._-]{4,500}$/.test(refresh || "")) return { erreur: "jeton illisible" };
  const duree = Math.min(Math.max(parseInt(p.get("expires_in"), 10) || 3600, 60), 86400 * 7);
  return { access_token: access, refresh_token: refresh, duree };
}

/* ---------- Client ---------- */

export class ErreurCompte extends Error {
  constructor(code, statut) { super(code); this.code = code; this.statut = statut || 0; }
}

/**
 * options : { config, fetch, stockage (getItem/setItem/removeItem), maintenant (ms), adresseSite }
 * Les messages d'erreur sont des codes courts (« reseau », « refuse », « limite », « session »…) :
 * l'interface choisit le texte, rien du serveur n'est affiché tel quel.
 */
export function creerClient({ config, fetch: f, stockage, maintenant = () => Date.now(), adresseSite }) {
  const cfg = configValide(config);
  if (!cfg) throw new ErreurCompte("configuration");
  const lire = (cle) => { try { return stockage?.getItem(cle) ?? null; } catch (e) { return null; } };
  const ecrire = (cle, v) => { try { v === null ? stockage?.removeItem(cle) : stockage?.setItem(cle, v); } catch (e) { /* stockage indisponible : la session ne durera que cette page */ } };
  let session = null;

  const entetes = (jeton, extra) => ({ apikey: cfg.cle, Authorization: "Bearer " + (jeton || cfg.cle), "Content-Type": "application/json", ...extra });

  async function appel(chemin, { methode = "GET", corps, jeton, extra } = {}) {
    let rep;
    try {
      rep = await f(cfg.url + chemin, { method: methode, headers: entetes(jeton, extra), body: corps === undefined ? undefined : JSON.stringify(corps), cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer" });
    } catch (e) { throw new ErreurCompte("reseau"); }
    if (rep.status === 429) throw new ErreurCompte("limite", 429);
    if (rep.status === 401 || rep.status === 403) throw new ErreurCompte("session", rep.status);
    if (!rep.ok) throw new ErreurCompte("refuse", rep.status);
    if (rep.status === 204) return null;
    try { return await rep.json(); } catch (e) { return null; }
  }

  function memoriser(s) {
    session = s;
    ecrire(CLE_SESSION, s ? JSON.stringify(s) : null);
  }

  function chargerSession() {
    if (session) return session;
    try {
      const s = JSON.parse(lire(CLE_SESSION));
      if (s && typeof s.access_token === "string" && typeof s.refresh_token === "string" && typeof s.expire === "number" && /^[0-9a-f-]{36}$/i.test(s.user?.id || "")) session = { access_token: s.access_token, refresh_token: s.refresh_token, expire: s.expire, user: { id: s.user.id, email: texte(s.user.email, 254) } };
    } catch (e) { session = null; }
    return session;
  }

  async function utilisateur(jeton) {
    const u = await appel("/auth/v1/user", { jeton });
    if (!u || !/^[0-9a-f-]{36}$/i.test(u.id || "")) throw new ErreurCompte("session");
    return { id: u.id, email: texte(u.email || "", 254) };
  }

  async function rafraichir() {
    const s = chargerSession();
    if (!s) throw new ErreurCompte("session");
    let r;
    try { r = await appel("/auth/v1/token?grant_type=refresh_token", { methode: "POST", corps: { refresh_token: s.refresh_token } }); }
    catch (e) { if (e.code === "session" || e.code === "refuse") memoriser(null); throw e; }
    if (!r?.access_token || !r.refresh_token) { memoriser(null); throw new ErreurCompte("session"); }
    memoriser({ access_token: r.access_token, refresh_token: r.refresh_token, expire: maintenant() + (Number(r.expires_in) || 3600) * 1000, user: s.user });
    return session;
  }

  /** Jeton valable (renouvelé s'il expire dans moins d'une minute). */
  async function jetonValide() {
    const s = chargerSession();
    if (!s) throw new ErreurCompte("session");
    if (s.expire - maintenant() < 60000) await rafraichir();
    return session.access_token;
  }

  async function avecJeton(fn) {
    try { return await fn(await jetonValide()); }
    catch (e) {
      if (e.code !== "session" || !chargerSession()) throw e;
      await rafraichir();                 // jeton refusé : un seul renouvellement, puis on abandonne
      return fn(session.access_token);
    }
  }

  const envoisRecents = () => { try { return (JSON.parse(lire(CLE_ENVOIS)) || []).filter((t) => Number.isFinite(t) && maintenant() - t < 3600000); } catch (e) { return []; } };

  return {
    config: cfg,
    session: () => chargerSession(),
    estConnecte: () => !!chargerSession(),

    /** Secondes à attendre avant le prochain envoi de lien (0 si possible). */
    attenteEnvoi() {
      const e = envoisRecents();
      if (!e.length) return 0;
      const apresDernier = DELAI_ENVOI_MS - (maintenant() - Math.max(...e));
      const apresHoraire = e.length >= ENVOIS_PAR_HEURE ? 3600000 - (maintenant() - Math.min(...e)) : 0;
      return Math.max(0, Math.ceil(Math.max(apresDernier, apresHoraire) / 1000));
    },

    /** Lien magique par e-mail (le compte est créé à la première connexion). */
    async envoyerLien(email) {
      if (!emailValide(email)) throw new ErreurCompte("email");
      if (this.attenteEnvoi() > 0) throw new ErreurCompte("limite");
      await appel("/auth/v1/otp?redirect_to=" + encodeURIComponent(adresseSite), { methode: "POST", corps: { email: String(email).trim(), create_user: true } });
      ecrire(CLE_ENVOIS, JSON.stringify([...envoisRecents(), maintenant()]));
    },

    /** Adresse de connexion chez un fournisseur (Google, Microsoft…) : simple navigation, pas de fetch. */
    urlFournisseur(fournisseur) {
      if (!cfg.fournisseurs.includes(fournisseur)) throw new ErreurCompte("fournisseur");
      return `${cfg.url}/auth/v1/authorize?provider=${encodeURIComponent(fournisseur)}&redirect_to=${encodeURIComponent(adresseSite)}`;
    },

    /** Termine la connexion à partir du retour { access_token, refresh_token, duree }. */
    async terminerConnexion(retour) {
      const user = await utilisateur(retour.access_token);
      memoriser({ access_token: retour.access_token, refresh_token: retour.refresh_token, expire: maintenant() + retour.duree * 1000, user });
      return user;
    },

    /** Vérifie une session déjà enregistrée (renouvelée si besoin). Retourne l'utilisateur ou null. */
    async reprendre() {
      if (!chargerSession()) return null;
      try { await jetonValide(); return session.user; }
      catch (e) { if (e.code === "reseau" || e.code === "limite") return session ? session.user : null; return null; }
    },

    /** Lit le profil : { donnees, mis_a_jour } ou null s'il n'existe pas encore. */
    async lireProfil() {
      const id = chargerSession()?.user.id;
      const lignes = await avecJeton((jeton) => appel(`/rest/v1/profils?select=donnees,mis_a_jour&user_id=eq.${encodeURIComponent(id)}`, { jeton }));
      const l = Array.isArray(lignes) ? lignes[0] : null;
      return l ? { donnees: normaliser(l.donnees), mis_a_jour: typeof l.mis_a_jour === "string" ? l.mis_a_jour : null } : null;
    },

    async ecrireProfil(donnees) {
      const d = normaliser(donnees);
      if (octets(d) > LIMITE_OCTETS) throw new ErreurCompte("trop_gros");
      const id = chargerSession()?.user.id;
      await avecJeton((jeton) => appel("/rest/v1/profils?on_conflict=user_id", { methode: "POST", jeton, corps: { user_id: id, donnees: d }, extra: { Prefer: "resolution=merge-duplicates,return=minimal" } }));
    },

    /** Export (droit d'accès et à la portabilité) : tout ce que le serveur détient. */
    async exporter() {
      const p = await this.lireProfil();
      const s = chargerSession();
      return { exporte_le: new Date(maintenant()).toISOString(), compte: { id: s.user.id, email: s.user.email }, preferences: p ? p.donnees : donneesVides(), preferences_mises_a_jour_le: p ? p.mis_a_jour : null };
    },

    async deconnecter() {
      const s = chargerSession();
      memoriser(null);
      if (s) { try { await appel("/auth/v1/logout?scope=local", { methode: "POST", jeton: s.access_token }); } catch (e) { /* déjà déconnecté localement */ } }
    },

    /** Droit à l'effacement : fonction SQL supprimer_mon_compte() (supprime auth.users, donc le profil en cascade). */
    async supprimer() {
      await avecJeton((jeton) => appel("/rest/v1/rpc/supprimer_mon_compte", { methode: "POST", jeton, corps: {} }));
      memoriser(null);
    },
  };
}
