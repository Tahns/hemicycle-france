/**
 * Service de mise en cache (application installable).
 * Règle : le réseau d'abord pour la page et les données, pour toujours afficher la dernière version ;
 * la copie en cache ne sert que hors connexion. Polices et icônes, qui ne changent pas : cache d'abord.
 * Incrémenter VERSION pour vider les anciens caches.
 */
const VERSION = "v3";
const CACHE = `politique-fr-${VERSION}`;
const COQUILLE = ["./", "index.html", "lois-worker.js", "manifest.webmanifest", "icons/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(COQUILLE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((cles) => Promise.all(cles.filter((k) => k.startsWith("politique-fr-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;

  // Ressources fixes : cache d'abord
  if (/\/(fonts|icons)\//.test(url.pathname)) {
    e.respondWith(
      caches.match(e.request).then((r) => r || fetch(e.request).then((rep) => {
        const copie = rep.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copie));
        return rep;
      }))
    );
    return;
  }

  // Page et données : réseau d'abord, copie de secours hors connexion
  e.respondWith(
    fetch(e.request)
      .then((rep) => {
        if (rep.ok) {
          const copie = rep.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copie));
        }
        return rep;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("index.html")))
  );
});

/* ---------- Alertes : vérification périodique en arrière-plan (application installée) ----------
   Réglages et état dans le cache « hemicycle-alertes », écrits par la page. Rien n'est transmis. */
const ALERTES = "hemicycle-alertes";
async function lireCle(cle) { const r = await (await caches.open(ALERTES)).match(cle); return r ? r.json() : null; }
async function ecrireCle(cle, v) { await (await caches.open(ALERTES)).put(cle, new Response(JSON.stringify(v), { headers: { "Content-Type": "application/json" } })); }

// Pas de sondage la veille ni le jour d'un tour, jusqu'à 20 h (heure de Paris)
function periodeReserve(tours) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date()).map((x) => [x.type, x.value]));
  const paris = `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  return (tours || []).some((t) => {
    const veille = new Date(Date.parse(t + "T12:00:00Z") - 864e5).toISOString().slice(0, 10);
    return paris >= `${veille}T00:00` && paris < `${t}T20:00`;
  });
}

async function verifierAlertes() {
  const prefs = await lireCle("prefs");
  if (!prefs || !prefs.actif) return [];
  const rep = await fetch("data/alertes.json", { cache: "no-store" });
  if (!rep.ok) return [];
  const a = await rep.json();
  const etat = (await lireCle("etat")) || {};
  const dernierVote = Math.max(0, ...a.votes.map((v) => v.numero));
  const cleSondage = a.sondage ? `${a.sondage.nom}|${a.sondage.dateFin}` : null;
  if (!etat.vote) { await ecrireCle("etat", { vote: dernierVote, sondage: cleSondage }); return []; } // premier passage : point de départ
  const notifs = [];
  const nouveaux = a.votes.filter((v) => v.numero > etat.vote).sort((x, y) => y.numero - x.numero);
  const lib = (v) => (v.resultat === "adopte" ? "Adopté" : "Rejeté");
  if (prefs.votes && nouveaux.length) {
    notifs.push(nouveaux.length === 1
      ? { titre: `${lib(nouveaux[0])} à l'Assemblée`, texte: nouveaux[0].titre, url: `v/${nouveaux[0].numero}.html`, tag: "votes" }
      : { titre: `${nouveaux.length} nouveaux votes à l'Assemblée`, texte: nouveaux.slice(0, 3).map((v) => `${lib(v)} : ${v.titre}`).join("\n"), url: "./#scrutin", tag: "votes" });
  }
  if (prefs.depute && prefs.deputeActif !== false && nouveaux.length) {
    const i = a.deputes.indexOf(prefs.depute);
    const LIB = { p: "Pour", c: "Contre", a: "Abstention" };
    const siens = i < 0 ? [] : nouveaux.map((v) => [v, v.codes[i]]).filter(([, c]) => c && c !== ".");
    if (siens.length) notifs.push({
      titre: `Les votes de ${prefs.deputeNom || "votre député"}`,
      texte: siens.slice(0, 3).map(([v, c]) => `${LIB[c] || "Pas de vote"} : ${v.titre}`).join("\n"),
      url: `./#depute-${prefs.depute}`, tag: "depute",
    });
  }
  let sondageVu = etat.sondage;
  if (prefs.sondages && cleSondage && cleSondage !== etat.sondage && !periodeReserve(a.tours)) {
    notifs.push({ titre: `Nouveau sondage : ${a.sondage.nom}`, texte: `Présidentielle 2027, enquête du ${a.sondage.date}. ${a.sondage.tete || ""}`.trim(), url: "./#sondages", tag: "sondages" });
    sondageVu = cleSondage;
  } else if (!prefs.sondages) sondageVu = cleSondage;
  await ecrireCle("etat", { vote: Math.max(etat.vote, dernierVote), sondage: sondageVu });
  for (const n of notifs) {
    try { await self.registration.showNotification(n.titre, { body: n.texte, tag: n.tag, icon: "icons/icon-192.png", badge: "icons/icon-192.png", data: { url: n.url } }); }
    catch (e) { /* notifications refusées : rien à afficher */ }
  }
  return notifs;
}

self.addEventListener("periodicsync", (e) => { if (e.tag === "alertes") e.waitUntil(verifierAlertes().catch(() => [])); });
// Vérification à la demande (tests, ou bouton de la page)
self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "verifier-alertes") e.waitUntil(verifierAlertes().catch(() => []).then((notifs) => e.source && e.source.postMessage({ type: "alertes-verifiees", notifs })));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "./", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((liste) => {
    const ouvert = liste.find((c) => c.url.startsWith(self.registration.scope));
    return ouvert ? ouvert.navigate(url).then((c) => (c || ouvert).focus()) : self.clients.openWindow(url);
  }));
});
