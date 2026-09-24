/**
 * lois-worker.js
 * --------------
 * Télécharge et décode data/lois.json (plusieurs Mo) hors du fil principal, pour que la page reste
 * réactive au toucher pendant le chargement, surtout sur téléphone. Les scrutins sont renvoyés par
 * paquets, du plus récent au plus ancien, avec les champs déduits du numéro déjà reconstitués
 * (même règle que completerLoi() dans index.html et scripts/lois-format.js).
 */
const PAQUET = 1000;

function completer(l) {
  if (l.votes) for (const g in l.votes) { const v = l.votes[g]; if (Array.isArray(v)) l.votes[g] = { pour: v[0] ?? 0, contre: v[1] ?? 0, abst: v[2] ?? 0, membres: v[3] ?? 0 }; }
  if (l.numero === undefined) return l;
  l.id ??= `an-scrutin-${l.numero}`;
  l.sourceUrl ??= `https://www.assemblee-nationale.fr/dyn/17/scrutins/${l.numero}`;
  l.sourceLabel ??= `Assemblée nationale — scrutin n°${l.numero}`;
  l.source ??= "auto-assemblee-nationale";
  l.reel ??= true;
  l.theme ??= "À catégoriser";
  if (l.dossierRef) l.dossierUrl ??= `https://www.assemblee-nationale.fr/dyn/17/dossiers/${l.dossierRef}`;
  return l;
}

self.onmessage = async (e) => {
  try {
    const res = await fetch(e.data.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const lois = (data.lois || []).map(completer).sort((a, b) => (b.numero || 0) - (a.numero || 0));
    for (let i = 0; i < lois.length; i += PAQUET) self.postMessage({ lois: lois.slice(i, i + PAQUET) });
    self.postMessage({ fin: true, lastUpdated: data.lastUpdated || null, total: lois.length });
  } catch (err) {
    self.postMessage({ erreur: String(err && err.message || err) });
  }
};
