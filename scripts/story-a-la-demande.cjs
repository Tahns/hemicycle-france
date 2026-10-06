#!/usr/bin/env node
/**
 * story-a-la-demande.cjs
 * ----------------------
 * DEMANDE DIRECTE : « fais une story (ou un post) sur cet article » (par exemple une révélation de Mediapart). Lancé par
 * .github/workflows/story-a-la-demande.yml (workflow_dispatch : lien de l'article, média, titre cité, type story|post).
 *
 * Crée TOUJOURS un BROUILLON prudent (instagram/brouillons/<id>.jpg + .json), jamais une entrée de la file : un humain le valide ensuite
 * d'un geste (workflow « Valider un brouillon », scripts/valider-brouillon.cjs).
 *  - image dessinée par le site (dessinerStory, comme stories-auto.cjs) : titre à nous attribué (« Selon Mediapart : … »), titre du média
 *    cité entre guillemets avec son nom (si fourni), mention « présumée innocente », source en pied ; aucune personnalité, aucun portrait ;
 *    le média est nommé en toutes lettres (pastille) : le site ne stocke aucun logo de média ;
 *  - AUCUN verbe qui accuse dans nos textes (formulationSure) ; le titre cité est celui du média, entre guillemets, jamais reformulé ;
 *  - REFUS : lien non https ou hors des domaines de médias connus (data/medias-connus.json) ; média indiqué qui ne correspond pas au lien ;
 *    titre cité absent d'un format raisonnable ; mineurs, violences sexuelles, suicide ; sondage pendant la réserve électorale ;
 *    demande déjà en brouillon, en file ou publiée (pas de doublon).
 *
 * Variables d'environnement (workflow) : LIEN, MEDIA (facultatif), TITRE (facultatif), TYPE (story|post). Arguments possibles : --lien= --media= --titre= --type=
 */
const fs = require("fs");
const path = require("path");
const stories = require("./stories-auto.cjs");
const SS = require("./sujets-sensibles.cjs");
const { legendeValide } = require("./publier-stories.cjs");

const RACINE_DEFAUT = stories.RACINE;
const MAX_TITRE = 220, MIN_TITRE = 15;
class Refus extends Error {}
const lireJson = (f, defaut) => { try { return JSON.parse(fs.readFileSync(f, "utf-8")); } catch (e) { return defaut; } };
const RE_POLEMIQUE = /polemique|derapage|clash|tacle|fustige|accable|recadre|tolle|honte|insult|injur|propos choquant|desavoue|trahison/;

/**
 * Prépare un brouillon. Renvoie { id, fiche, brouillon } (le brouillon est écrit sur disque) ; lève Refus (message à afficher) si la demande est refusée.
 * dessins : { story(synth), post(spec) } (tests : faux dessins ; défaut : Playwright via stories-auto.cjs).
 */
async function demander({ lien, media = "", titre = "", type = "story", racine = RACINE_DEFAUT, now = new Date(), medias = SS.lireMedias(), dessins = null }) {
  if (type !== "story" && type !== "post") throw new Refus("type invalide : « story » ou « post ».");
  const m = SS.mediaDeLien(lien, medias);
  if (!m) throw new Refus("lien refusé : seuls les liens https vers un média connu sont acceptés (liste : data/medias-connus.json). Aucune image n'est créée.");
  const nomMedia = String(media || "").trim();
  if (nomMedia && SS.plat(nomMedia) !== SS.plat(m.nom)) throw new Refus(`le média indiqué (« ${nomMedia} ») ne correspond pas au lien (${m.nom}).`);
  const citation = SS.nettoyerTitre(titre);
  if (citation) {
    if (citation.length < MIN_TITRE || citation.length > MAX_TITRE) throw new Refus(`titre cité : entre ${MIN_TITRE} et ${MAX_TITRE} caractères attendus.`);
    if (/[<>{}$]/.test(citation)) throw new Refus("titre cité : caractères < > { } $ interdits.");
    const interdit = SS.motInterdit(citation, false);
    if (interdit) throw new Refus(`titre cité : « ${interdit} » (mineur, violence sexuelle ou suicide) : aucun brouillon n'est créé pour ce sujet.`);
    if (stories.reserveStory(now) && stories.parleDeSondage(citation)) throw new Refus("réserve électorale : aucun sondage, même cité par la presse (loi du 19 juillet 1977, art. 11).");
  }
  const id = SS.idDemande(lien);
  const dossier = path.join(racine, "instagram", "brouillons");
  const enFile = lireJson(path.join(racine, "data", "instagram-file.json"), { entrees: [] }).entrees || [];
  const publiees = lireJson(path.join(racine, "data", "instagram-publiees.json"), { entrees: [] }).entrees || [];
  if (fs.existsSync(path.join(dossier, `${id}.json`))) throw new Refus(`un brouillon existe déjà pour ce lien (id ${id}) : validez-le ou rejetez-le d'abord.`);
  if (enFile.some((e) => e.id === id) || publiees.some((e) => e.id === id)) throw new Refus(`ce lien a déjà été mis en file ou publié (id ${id}) : pas de doublon.`);

  const t = SS.plat(citation);
  const categorie = RE_POLEMIQUE.test(t) && !/accus|plainte|enquete|justice|tribunal|mis en cause/.test(t) ? "polemique" : (/accus|mis en cause|mise en cause|mis en examen|plainte|enquete|poursuiv|soupcon|suspect|inculp|perquisition|fraude|corruption|detourn|escroqu|blanchi|scandale|affaire|proces|tribunal|parquet|justice|judiciaire|condamn|relax|diffam|calomni|mensonge|incarcer|ecroue/.test(t) ? "faits" : "information");
  const reponseCitee = Boolean(citation) && SS.RE_REPONSE.test(t);
  const fiche = SS.ficheNiveau2({ medias: [m.nom], categorie, titreCite: citation, reponseCitee, date: now.toISOString(), consulte: true });
  const verif = SS.formulationSure([fiche.titre, fiche.pied, fiche.mention].join(" "));
  if (!verif.ok) throw new Refus(`formulation refusée : ${verif.problemes.join(" ; ")}`);

  const cree = now.toISOString();
  let jpeg, champsType = {};
  if (type === "story") {
    const synth = SS.sujetPourDessin(fiche, { articles: [{ titre: fiche.citation || fiche.titre, url: lien, media: m.nom, date: cree }], date: cree, sansHeure: true });
    jpeg = await (dessins?.story || ((s) => stories.dessiner(0, fiche.titre, null, null, null, "une", null, s)))(synth);
    const dim = stories.dimensionsJpeg(jpeg);
    if (!dim || dim.l !== 1080 || dim.h !== 1920) throw new Error(`image de story inattendue (${dim ? `${dim.l}×${dim.h}` : "pas un JPEG"})`);
  } else {
    const spec = { genre: "presse", surtitre: fiche.libelle, titre: fiche.titre, citation: fiche.citation, media: m.nom, sourceTxt: fiche.pied };
    jpeg = await (dessins?.post || stories.dessinerPostSeul)(spec);
    const dim = stories.dimensionsJpeg(jpeg);
    if (!dim || dim.l !== 1080 || dim.h !== 1350) throw new Error(`image de post inattendue (${dim ? `${dim.l}×${dim.h}` : "pas un JPEG"})`);
    const legende = SS.legendePost({ titre: fiche.titre, citation: fiche.citation, media: m.nom, mention: fiche.mention + (reponseCitee ? " Sa réponse figure dans la citation." : ""), lien: String(lien).trim() });
    const v = SS.formulationSure(legende.split("\n").filter((l) => !/^Titre cité|^Source :/.test(l)).join("\n"));
    if (!v.ok || !legendeValide({ legende })) throw new Refus(`légende refusée : ${v.problemes.join(" ; ") || "format"}`);
    champsType = { legende };
  }
  if (jpeg.length > 8 * 1024 * 1024) throw new Error("image trop lourde");
  const brouillon = {
    id, cree, titre: fiche.titre, type, medias: [m.nom], sources: [String(lien).trim()], statut: "a-valider", nommePersonne: false,
    sensible: 2, demande: true, categorie, reponseCitee, titrePropre: fiche.titre, sujets: citation ? [citation] : [],
    ...(citation ? { citation: { titre: fiche.citation, media: m.nom, url: String(lien).trim() } } : {}), pied: fiche.pied, alt: fiche.alt, ...champsType,
  };
  stories.ecrireBrouillon(brouillon, jpeg, dossier);
  return { id, fiche, brouillon };
}

async function main() {
  const arg = (nom) => (process.argv.find((a) => a.startsWith(`--${nom}=`)) || "").slice(nom.length + 3);
  const env = process.env;
  try {
    const r = await demander({ lien: arg("lien") || env.LIEN || "", media: arg("media") || env.MEDIA || "", titre: arg("titre") || env.TITRE || "", type: arg("type") || env.TYPE || "story" });
    console.log(`[story-a-la-demande] brouillon ${r.id} créé (${r.brouillon.type}) : ${r.fiche.titre}`);
  } catch (e) {
    if (!(e instanceof Refus)) throw e;
    console.error(`[story-a-la-demande] REFUS : ${e.message}`);
    console.log(`::error::${e.message}`);
    if (env.GITHUB_STEP_SUMMARY) { try { fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `- **Demande refusée** : ${e.message}\n`); } catch (e2) { /* résumé facultatif */ } }
    process.exit(1);
  }
}

module.exports = { demander, Refus };
if (require.main === module) main().catch((e) => { console.error("[story-a-la-demande]", e.message); process.exit(1); });
