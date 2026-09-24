/**
 * Service de mise en cache (application installable).
 * Règle : le réseau d'abord pour la page et les données, pour toujours afficher la dernière version ;
 * la copie en cache ne sert que hors connexion. Polices et icônes, qui ne changent pas : cache d'abord.
 * Incrémenter VERSION pour vider les anciens caches.
 */
const VERSION = "v2";
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
