# Hémicycle France — La politique française, preuves à l'appui

Site : https://tahns.github.io/hemicycle-france/ — automatisation

Ce dossier contient le site (`index.html`) et l'infrastructure qui le met à jour
automatiquement, toutes les 15 minutes, à partir de sources officielles.

## Ce qui est automatique

| Donnée | Script | Source | Fichier |
|---|---|---|---|
| Scrutins, résultat, votes par groupe | `fetch-scrutins.js` | open data de l'Assemblée nationale | `data/lois.json` |
| Titre court du texte, auteur (Gouvernement, député·e et son groupe, sénateur·rice) | `fetch-scrutins.js` | dossiers législatifs de l'Assemblée | `data/lois.json` |
| Présidences et effectifs des groupes | `fetch-scrutins.js` | open data de l'Assemblée (AMO30) | `data/groupes.json` |
| Députés en fonction : circonscription, participation, votes contre leur groupe, vote sur chaque texte et chaque censure | `fetch-scrutins.js` (via `deputes.js`) | votes nominatifs de l'Assemblée + AMO30 | `data/deputes.json` |
| Chômage, population, croissance du PIB, dette publique | `fetch-insee.js` | Insee, accès SDMX public (**aucune clé nécessaire**) | `data/indicateurs.json` |
| Sondages présidentielle 2027 (dernière enquête de chaque institut, historique des deux derniers semestres pour la courbe, duels du second tour) | `fetch-sondages.js` | liste Wikipédia des sondages, liens vers les notices de la Commission des sondages | `data/sondages.json` |
| Probabilités d'accéder au second tour et d'être élu (simulation à partir des sondages) | `probabilites.js` | `data/sondages.json` | `data/probabilites.json` |
| Actualités politiques : titres de presse cités avec leur média et un lien, sujets repris par plusieurs médias mis en avant ; le grand titre est rédigé par le site à partir du recoupement de plusieurs médias (`titres-propres.cjs`, null en cas de doute), le contexte vient des données officielles du site (gouvernement, partis, députés, sondages, agenda), les vidéos sont de simples liens signalés (toutes les heures, workflow `actualites.yml`) | `fetch-actualites.js`, `titres-propres.cjs` | flux RSS publics de franceinfo, Le Monde, Le Figaro, Libération, 20 Minutes, Public Sénat | `data/actualites.json` |
| Portraits libres des personnalités sans photo officielle (chefs de parti, candidats, Gouvernement), pour illustrer les actualités | `fetch-portraits.js` | image principale de l'article Wikipédia, si elle est sous licence libre sur Wikimedia Commons | `photos/personnalites/`, `data/portraits.json` |
| Candidats déclarés à la présidentielle | `fetch-candidats.js` | page Wikipédia des candidatures (source de chaque annonce) | `data/candidats.json` |
| Scrutins publics du Sénat, vote de chaque groupe | `fetch-senat.js` | pages officielles senat.fr (recoupées avec le total officiel) | `data/senat.json` |
| Communes → circonscriptions (trouver son député par sa commune) | `fetch-communes.js` (tous les 90 jours) | résultats des législatives 2024 par commune, ministère de l'Intérieur | `data/communes.json` |
| Activité des députés (questions écrites, amendements) et déclarations HATVP | `fetch-activite.js` (chaque semaine) | open data de l'Assemblée nationale et de la HATVP (reliées par l'identifiant du député) | `data/activite.json` |
| Vote du Sénat sur un texte voté à l'Assemblée | `navette.js` | dossiers législatifs de l'Assemblée (lien vers le dossier du Sénat) et `data/senat.json` | `data/navette.json` |
| Présidentielle 2022 par commune | `fetch-elections.js` (une seule fois, résultats définitifs) | ministère de l'Intérieur sur data.gouv.fr | `data/elections/*.json` |
| Sénateurs en fonction et leur vote sur l'ensemble de chaque texte (aussi dessinés dans l'hémicycle du Sénat) | `fetch-senateurs.js` | liste data.senat.fr et analyse détaillée des scrutins senat.fr (recoupée avec le total officiel) | `data/senateurs.json` |
| Composition du Gouvernement | `gouvernement.js` (appelé par `fetch-scrutins.js`) | archive AMO30 de l'Assemblée nationale | `data/gouvernement.json` |
| Ordre du jour des séances de l'Assemblée (21 jours) et présence en commission | `fetch-agenda-an.js` | agenda open data de l'Assemblée nationale (feuilles de présence des 8 commissions permanentes) | `data/agenda-an.json`, `data/commissions.json` |
| Logos des partis (fichiers libres de Wikimedia Commons, liste dans `data/logos.json`) | `fetch-logos.js` | commons.wikimedia.org | `icons/partis/` |
| Photos des députés et sénateurs (104 px, hébergées sur le site) | `photos.cjs` | assemblee-nationale.fr et senat.fr | `photos/` |
| Pages d'aperçu des sénateurs et du dernier sondage (partage, moteurs de recherche) | `partage.cjs` | `data/senateurs.json`, `data/sondages.json` | `s/`, `p/` |
| Fichier des nouveautés pour les alertes (derniers votes clés, vote de chaque député, dernier sondage) | `partage.cjs` | `data/deputes.json`, `data/sondages.json` | `data/alertes.json` |
| Flux RSS des 40 derniers votes clés | `partage.cjs` | `data/lois.json` | `feed.xml` |
| Pages statiques pour le partage et Google (titre, image, contenu lisible sans JavaScript) | `partage.cjs` | le site lui-même (`index.html?carte`) | `v/<numéro>.html` + `.jpg` (votes clés), `d/<PA…>.html` (députés), `icons/partage.jpg`, `sitemap.xml` |
| File de stories Instagram automatiques : au plus un sujet d'actualité par exécution, image 1080 × 1920 dessinée par le site lui-même (`dessinerStory("actualite", indice)`), voir ci-dessous | `stories-auto.cjs` (Playwright, étape continue-on-error de `actualites.yml` et `update-data.yml`) | `data/actualites.json`, `data/direct.json` | `data/instagram-file.json`, `instagram/auto/<id>.jpg` |
| Jours fériés (alerte « vote un jour férié ») | calculés dans la page | — | — |


`data/lois.json` est écrit au format compact : les champs qui se déduisent du numéro de scrutin
(identifiant, lien officiel, lien du dossier…) ne sont pas stockés et sont reconstitués à la lecture
(`scripts/lois-format.js` pour les scripts, `completerLoi()` dans `index.html`), soit −22 % de poids.

Chaque script refuse de publier une donnée qu'il ne peut pas vérifier :
- scrutins : les votes par groupe sont recoupés avec le total officiel ; les groupes que l'AN publie
  sans identifiant (`PO0`) sont retrouvés à partir des députés nommés dans le vote ;
- Insee : l'intitulé officiel de chaque série est vérifié à chaque lecture (série renommée ou arrêtée = refus) ;
- sondages : chaque hypothèse doit totaliser ~100 %, avec date, échantillon et notice officielle lisibles.

### File de stories Instagram automatiques

`scripts/stories-auto.cjs` prépare des stories, il **ne publie rien** : aucune clé secrète, aucun appel à
Instagram dans les workflows. Il écrit seulement `data/instagram-file.json` (les 30 dernières entrées
`{ id, cree, titre, medias, url_image, type: "story", sources }`) et `instagram/auto/<id>.jpg` (JPEG 1080 × 1920,
≤ 8 Mo, adresse publique `https://tahns.github.io/hemicycle-france/instagram/auto/<id>.jpg`). Un outil séparé
lit cette file et publie, ou non. L'adresse du site est écrite en clair dans le pied de l'image (pas d'autocollant
lien possible par l'API).

Un sujet n'est retenu (un seul par exécution) que s'il remplit **toutes** ces règles :
- repris par au moins 3 médias, ou prise de parole du président détectée dans `data/direct.json` (accroche « EN DIRECT ») ;
- dernière mise à jour il y a moins de 3 h ;
- pas déjà en file (id = empreinte du titre central ; un lien d'article déjà utilisé écarte aussi le sujet) ;
- aucun mot de la liste prudente `MOTS_EXCLUS` du script (accusation, mise en examen, garde à vue, plainte, enquête, poursuite,
  condamnation, soupçon, agression, viol, meurtre, mort, décès, drame, fait divers, mineur, victime, âge de moins de 20 ans…)
  dans aucun titre du sujet, et pas de thème « justice » : mieux vaut manquer une story que publier à tort ;
- au plus 4 entrées par jour (UTC+2), et aucune entre 23 h et 7 h, heure de Paris.

Les JPEG de plus de 3 jours sont supprimés par le script lui-même. `scripts/check-data.js` contrôle la file
(https, date valide, JPEG présent et ≤ 8 Mo, 4 entrées par jour au plus). Test : `node tests/stories-auto.test.mjs`.
Essai local : `NODE_PATH=… CHROMIUM_PATH=/chemin/chrome STORIES_AUTO_MAINTENANT=2026-10-02T13:30:00Z node scripts/stories-auto.cjs`.

## Nom de domaine (optionnel)

1. Acheter le domaine (par ex. `hemicycle-france.fr`) chez un registraire (OVH, Gandi…).
2. Chez le registraire, ajouter les enregistrements DNS de GitHub Pages :
   `A` vers `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   (et `CNAME www` vers `tahns.github.io`).
3. Dans GitHub : *Settings → Pages → Custom domain*, saisir le domaine, puis cocher *Enforce HTTPS*.
   GitHub ajoute un fichier `CNAME` au dépôt.
4. C'est tout : au prochain passage du workflow, `scripts/partage.cjs` lit `CNAME` et met à jour
   toutes les adresses (pages d'aperçu, plan du site, `robots.txt`, balises `og:` d'`index.html`).

Référencement : `sitemap.xml` liste l'accueil, les 246 votes clés et les 577 députés. À déclarer une fois
dans Google Search Console (propriété = adresse du site). `robots.txt` n'est lu par les moteurs qu'à la
racine d'un domaine : il ne sert qu'avec un nom de domaine propre.

## Protection contre les attaques (DDoS, spam)

- **Pas de serveur à faire tomber** : le site est un ensemble de fichiers statiques servis par le
  réseau de diffusion (CDN) de GitHub Pages, qui absorbe les attaques par saturation (DDoS). Aucune
  base de données, aucun formulaire, aucune API appelée par le site : il n'y a rien à pirater ni à
  saturer côté site. (Seule exception, facultative et désactivée par défaut : les comptes des visiteurs,
  décrits dans `docs/COMPTES.md`, qui ne s'activent que si `data/compte-config.json` existe.) Les données sont récupérées par GitHub Actions, jamais par les visiteurs.
- **En-têtes de sécurité** : politique de sécurité du contenu (CSP) stricte, aucun script externe,
  refus d'être affiché dans le cadre d'un autre site (anti-clickjacking).
- **Tickets (contact)** : ticket libre désactivé, uniquement des formulaires (erreur avec source
  obligatoire, droit de réponse). En cas de raid de spam : *Settings → Moderation options →
  Interaction limits* (limiter aux comptes existants depuis plus de 24 h, ou aux contributeurs,
  pendant 24 h à 6 mois), et *Settings → Moderation options → Reported content* ; un compte
  malveillant se bloque depuis son profil (*Block user*), ce qui masque aussi ses tickets.
- **Avec un nom de domaine** (voir plus haut), on peut ajouter Cloudflare, gratuit, devant le site :
  pointer les serveurs DNS du domaine vers Cloudflare, activer le proxy (nuage orange), *SSL/TLS →
  Full (strict)*, *Security → Bots → Bot Fight Mode*, et *Under Attack Mode* le temps d'une attaque.
  Cloudflare permet aussi d'envoyer les vrais en-têtes HTTP (`frame-ancestors`,
  `Strict-Transport-Security`) que GitHub Pages ne permet pas de régler.

## Ce qui reste manuel (volontairement)

| Donnée | Fichier | Pourquoi |
|---|---|---|
| Condamnations judiciaires | `data/justice.json` | distinguer une condamnation définitive d'un appel demande un jugement humain ; une erreur serait diffamatoire |

Désormais automatiques : l'agenda à venir (`scripts/fetch-evenements.js` : articles Wikipédia listés dans `data/evenements-sources.json` et projets de loi à date lointaine de l'ordre du jour de l'Assemblée ; les entrées `origine: "auto"` sont créées, mises à jour ou retirées après 2 relevés d'absence, les entrées saisies à la main dans `data/meetings.json` ne sont jamais touchées, et seuls les meetings de partis restent à saisir à la main quand on en connaît), l'inflation (série Insee du glissement annuel de l'IPC), le déficit public
(Eurostat, notification de la France), les chefs de parti (vérifiés toutes les 15 minutes dans l'infobox
Wikipédia de chaque parti ; un changement est appliqué puis signalé pour relire l'intitulé de la
fonction) et le thème des votes (commission saisie au fond du dossier législatif).

Ces fichiers se modifient directement sur GitHub (crayon « Edit »), sans toucher au code du site.

## Langues du site (fr, en, es, pt, de, ru, ar, hi, ja, bn)

Le français reste écrit dans `index.html` : c'est la source de vérité. Les autres langues sont des
dictionnaires `data/i18n/<code>.json` de la forme `{ "clé stable": "texte traduit" }`, chargés à la demande
(seulement quand on choisit la langue). Un traducteur DOM remplace les textes français par ceux du
dictionnaire (nœuds texte, `placeholder`, `title`, `aria-label`, `alt`), y compris pour ce que la page
affiche plus tard (`MutationObserver`). Liens et balises sont conservés ; les traductions sont
insérées en texte brut (jamais en `innerHTML`). Si une clé manque, le français s'affiche.

- **Menu** : bouton + liste en haut de page (icône de langue à côté de la loupe sur téléphone), clavier
  (Entrée/Espace/flèches ouvrent, flèches/Début/Fin déplacent, Entrée choisit, Échap ferme), `aria-haspopup="listbox"`.
  Drapeaux en SVG dans `icons/drapeaux/` ; pastille avec le nom natif pour hi et bn, globe pour l'arabe.
  Choix mémorisé dans `localStorage` (`langue`) ; sinon langue du navigateur si elle est traduite, sinon français.
  `<html lang>` et `dir="rtl"` (arabe) suivent la langue.
- **Contenu officiel non traduit** : titres de scrutins, de lois, d'articles de presse, noms propres, intitulés
  d'amendements ne figurent dans aucun dictionnaire ; une note « Contenu officiel en français » s'affiche en pied de
  page quand la langue n'est pas le français. Les mentions légales traduites portent « Seule la version française fait foi ».
- **Hors-ligne** : les dictionnaires passent par le service worker comme les autres données (réseau d'abord, copie en cache).

### Traduire une chaîne ou compléter une langue

1. `node scripts/extraire-i18n.js` régénère `data/i18n/fr.json` depuis `index.html` (nœuds texte, attributs,
   chaînes et gabarits du script ; chaque `${…}` devient `{1}`, `{2}`…). La clé dérive du texte
   (`debut-du-texte.empreinte`) : si le français change, la clé change et l'ancienne traduction devient orpheline.
   Les blocs de données officielles à ne pas extraire sont encadrés par `/* i18n-ignorer */ … /* i18n-fin-ignorer */`.
2. Ajouter la clé et sa traduction dans `data/i18n/<code>.json` (`node scripts/couverture-i18n.js --manquantes en`
   liste ce qui manque). Conserver les marques `{1}`, `{2}`, `%s` ; une marque peut être omise seulement pour un
   accord en genre ou en nombre (`présent{2}`), jamais ajoutée. Pas de balise HTML.
3. `node scripts/check-data.js` contrôle JSON valide, clés connues de `fr.json`, marques, absence de HTML ;
   `node scripts/couverture-i18n.js` affiche le pourcentage de clés traduites par langue.

**Phrases entières.** Un morceau de gabarit traduit seul donnerait une phrase mêlant deux langues. Trois mécanismes
évitent cela :
- une phrase écrite en plusieurs morceaux (« Adopté le … » puis « Texte déposé par … » accolés par le code) est traduite
  phrase par phrase ; une valeur insérée dans un gabarit est elle-même traduite (`Candidature {1}` + `annoncée le {1}`) ; une ligne
  « A · B · C » l'est morceau par morceau ; un gabarit dont les valeurs sont longues (titre officiel suivi de
  « (vote final) ») s'applique quand même ;
- un élément dont le contenu est fait de plusieurs morceaux de texte séparés par des éléments en ligne (infobulle du
  glossaire, lien, gras) a une **clé de phrase entière** : chaque élément en ligne y est une marque `{1}`, `{2}`… et la
  traduction replace l'élément (même règle dans `scripts/extraire-i18n.js` et dans `index.html`, fonctions
  `estPhrase` / `traduirePhrase`). Une traduction qui omet une marque d'élément est ignorée (on ne perd jamais un lien) ;
- dans le JavaScript, préférer des phrases entières (une chaîne par cas : « Adopté le {1}. » / « Rejeté le {1}. ») à des
  morceaux accolés ; après avoir remanié un gabarit, `node scripts/extraire-i18n.js` peut renuméroter les marques des
  clés voisines : vérifier `node scripts/couverture-i18n.js --manquantes en`.

**Dates, heures, durées et nombres.** Le site les écrit en français ; `localiserFormats` (`index.html`) les reconnaît
et les reformule avec `Intl` pour la langue active (fr-FR, en-GB, es-ES, pt-PT, de-DE, champ `locale` de `LANGUES`) :
« 2 octobre 2026 à 14 h 16 » devient « 2 October 2026 at 14:16 », « il y a 1 h » « 1 hour ago », « 1 504 Md€ » « €1,504bn »,
« 5,1 % » « 5.1% », « 5ᵉ circonscription » « 5th constituency ». Seuls les textes entièrement faits d'une date, d'un nombre
ou d'une heure, et les valeurs insérées dans une phrase traduite, sont touchés : un titre officiel français contenant une
date reste tel quel. Dans une traduction, écrire les nombres à la manière de la langue cible (jamais « 1,597 » pour mille).
Les images de partage (canvas), les pages statiques `d/`, `s/`, `v/`, `p/` et les stories restent en français.

**Libellés de données** (postes du budget, indicateurs, groupes parlementaires, fonctions des dirigeants et des
ministres, statuts et affaires de justice, thèmes, quiz, rubriques de questions, professions, agenda des partis…) :
`data/i18n/donnees/<code>.json`, `{ "texte français exact": "traduction" }`, sans modifier les fichiers de données. Le texte
a les espaces normalisés ; `{1}`, `{2}`… sont des emplacements (traduits à leur tour), `{1#}` un emplacement réservé à un
nombre ou une année (« en {1#} » n'attrape pas « en cours »). Une entrée absente laisse le français. `check-data.js` contrôle
marques, HTML et clés non normalisées. Ces tables sont chargées avec le dictionnaire et appliquées par le même traducteur.

Ce qui reste volontairement en français : titres de scrutins, de lois et d'amendements, titres d'articles de presse, noms
propres de personnes, de lieux et de partis, intitulés officiels cités, slogans de campagne, professions rares saisies librement
par chaque élu, et les rubriques officielles des questions écrites non répertoriées.

### Ajouter une langue

1. Créer `data/i18n/<code>.json` (`{}` au départ).
2. Ajouter une ligne dans le tableau `LANGUES` d'`index.html` (`code`, nom natif, `icone` = fichier de
   `icons/drapeaux/`, ou `pastille` = deux caractères ; `dir:"rtl"` pour une langue de droite à gauche).
3. Une langue dont le dictionnaire est vide s'affiche en français avec la note « Traduction en préparation » ;
   elle n'est jamais choisie automatiquement d'après le navigateur tant qu'elle est vide.

Dans le code de la page, `t("Texte français")` (ou `t("clé")`) renvoie le texte dans la langue active, avec
`t("{1} votes", { 1: n })` pour les valeurs. Limites connues : les images de partage (canvas), les pages statiques de
partage et les stories restent en français ; les polices hébergées sont latines, les autres écritures utilisent les
polices du système.

## Architecture et secrets (en bref)

- `data/*.json` : toutes les données publiées ; `index.html` les lit au chargement (site statique, GitHub Pages).
- `scripts/fetch-*.js` : collecte depuis les sources officielles ; chacun passe par `scripts/garde.js`, qui refuse
  d'écraser un bon fichier si le contenu est vide, chute de plus de 30 % ou perd un champ obligatoire (ancien fichier conservé, alerte levée).
- `scripts/check-data.js` (cohérence, licence de chaque photo de `photos/personnalites/` dans `data/portraits.json`), `check-fraicheur.js` (données périmées), `check-sources.js` (Décodex).
- Workflows : `update-data.yml` (toutes les 15 minutes), `actualites.yml`, `ci.yml` (tests), `stats.yml` (trafic), `sante.yml` (chaque lundi : les trois contrôles ; écrit le problème dans le résumé de l'exécution, sans e-mail).
- Secrets : `GITHUB_TOKEN` (fourni automatiquement) ; `TRAFIC_TOKEN` (jeton fine-grained « Administration : Read-only ») pour `stats.yml` uniquement.
- Données manuelles : une fiche de `justice.json` non vérifiée depuis 90 jours est marquée « À vérifier » (masquée après 180) ; les événements passés de `meetings.json` sont masqués.
- Tests : `node tests/garde.test.mjs` (garde-fou et licences, sur fixtures), `node tests/smoke.cjs` (navigateur).

## Statistiques du dépôt

Le workflow `stats.yml` archive chaque jour le trafic GitHub (vues, visiteurs, clones, référents)
sur la branche **`stats`**, dont le README sert de tableau de bord.

Mise en place : créer un jeton *fine-grained* limité à ce dépôt avec la permission
**Administration : Read-only**, puis l'ajouter en secret Actions sous le nom **`TRAFIC_TOKEN`**.

## Surveillance

- `scripts/check-data.js` contrôle la cohérence de tous les fichiers `data/` avant chaque publication.
- `scripts/check-fraicheur.js` vérifie que les données se mettent bien à jour (votes pendant la
  session parlementaire, sondages de moins de 30 jours, chômage du dernier trimestre publié) et
  (inflation du dernier mois, déficit de l'année écoulée, chefs de parti à relire) et
  rappelle les relectures manuelles : justice (relecture tous les 60 jours et après chaque date listée dans `echeances` de
  `data/justice.json`), agenda (tous les 30 jours ou s'il est vide).
  Après une relecture, mettre à jour le champ `verifieLe` du fichier concerné.
- En cas d'échec d'une source ou de données périmées, le problème est écrit dans le résumé de l'exécution (onglet Actions du dépôt). Aucun ticket ni e-mail n'est créé automatiquement.
- `scripts/check-sources.js` confronte chaque lien cité dans `data/` à la base du Décodex
  (contenus démentis par Les Décodeurs du *Monde*).
- `.github/workflows/ci.yml` lance ces contrôles et un test du site dans un vrai navigateur
  (`tests/smoke.cjs`, ordinateur et mobile) à chaque modification.

## Déploiement (à faire une fois)

1. **Créer un dépôt GitHub** (public ou privé) et y pousser tout ce dossier :
   ```bash
   git init
   git add .
   git commit -m "Site initial"
   git branch -M main
   git remote add origin https://github.com/<ton-compte>/<ton-repo>.git
   git push -u origin main
   ```

2. **Activer GitHub Pages** : Settings → Pages → Source = "Deploy from a branch" →
   branche `main`, dossier `/ (root)`. Le site sera alors accessible à une adresse du
   type `https://<ton-compte>.github.io/<ton-repo>/`.

3. **Vérifier que l'automatisation tourne** : onglet "Actions" du dépôt → le workflow
   "Mise à jour automatique des données" doit apparaître et pouvoir être lancé manuellement
   (bouton "Run workflow") pour un premier test, avant d'attendre le déclenchement horaire.

## Tester en local avant de déployer

Le site utilise `fetch()` pour charger `data/lois.json` et `data/indicateurs.json` : ça ne
fonctionne pas en ouvrant simplement `index.html` depuis l'explorateur de fichiers (le
navigateur bloque les requêtes `fetch` sur `file://`). Il faut un petit serveur local :

```bash
npx serve .
# ou
python3 -m http.server 8000
```

puis ouvrir `http://localhost:8000` (ou le port indiqué).

Pour tester un script d'automatisation sans rien publier :
```bash
node scripts/fetch-scrutins.js --dry-run
# après une correction du parseur : re-dérive tous les scrutins depuis l'archive officielle
node scripts/fetch-scrutins.js --rebuild
node scripts/fetch-insee.js --dry-run
node scripts/fetch-sondages.js --dry-run
# contrôle de cohérence des fichiers data/ (aussi lancé par le workflow avant publication)
node scripts/check-data.js
```

`data/lois.json` est écrit avec un scrutin par ligne : deux fois plus léger à télécharger
qu'un JSON indenté, et chaque nouveau vote reste une ligne lisible dans l'historique git.

Liens directs : `#scrutin-8434` ouvre un scrutin précis dans l'hémicycle, `#histo-RN`
l'historique d'un groupe, `#sondages` (ou tout autre onglet) la page correspondante.

## Principe général adopté sur ce site

Aucune valeur n'est jamais inventée ou estimée pour "avoir l'air complet". Une donnée
manquante ou non vérifiable est explicitement marquée comme telle (`null`, "non
communiqué", valeur précédente conservée, alerte) plutôt que remplacée par une approximation.
Merci de garder ce principe si vous étendez ce script.
