# Publication automatique des stories Instagram

Le dépôt prépare déjà les stories (image JPEG + ligne dans `data/instagram-file.json`). Le workflow GitHub
**« Publier les stories »** (`.github/workflows/publier-stories.yml`) les publie ensuite tout seul sur Instagram,
toutes les 15 minutes environ, sans qu'aucune session Claude ne soit ouverte. Il utilise l'API officielle
« Instagram Graph » de Meta.

Tant que les deux secrets décrits plus bas n'existent pas, le workflow ne fait rien : il écrit seulement
« Publication automatique inactive : secrets absents » dans son résumé et se termine sans erreur.

## Ce que le script respecte (sans réglage)

- une seule publication par passage ; 4 stories et 2 posts par jour au maximum ; jamais entre 23 h et 7 h (heure de Paris) ; au moins 60 min entre deux publications (voir « Posts » pour l'annonce d'un post) ;
- une story préparée depuis plus de 3 h est marquée « périmée » et n'est jamais publiée ;
- jamais deux fois la même story (registre `data/instagram-publiees.json`) ;
- aucun sondage pendant la réserve électorale ;
- `data/stories-config.json` : si `validationHumaine` vaut `true`, rien n'est publié sauf les brouillons validés par un humain (voir « Sujets sensibles ») ; en mode `monetisation`,
  seules les stories sans titre de presse le sont ;
- si l'image n'est pas encore en ligne sur GitHub Pages, nouvel essai au passage suivant ;
- en cas d'erreur de l'API, la story n'est pas marquée publiée : nouvel essai au passage suivant (tant qu'elle n'est pas périmée) ;
- le jeton n'apparaît jamais dans les journaux.

## Posts (fil) et stories d'annonce

Deux cas seulement deviennent des **posts** (image de fil 4:5, 1080 × 1350, avec légende) ; tout le reste de l'actualité
(sujets repris par plusieurs médias, dossiers, direct, face à face, chiffre, en bref, sondages) reste directement en **story** :

1. **Date à retenir lointaine** : un sujet d'actualité qui annonce une date à venir à **plus de 3 jours** (jusqu'à 180 jours), par exemple
   « le projet de loi casseurs-payeurs sera examiné au Sénat le 27 octobre ». À 3 jours ou moins, c'est toujours la story « Date à retenir ».
   Mêmes filtres que les stories de presse (3 médias, titre rédigé par le site, aucun mot de la liste prudente, aucun sondage en réserve électorale).
2. **Loi adoptée ou rejetée** : seulement un **vote final** (« l'ensemble du projet / de la proposition de loi ») de l'Assemblée nationale
   (`data/lois.json`, scrutins de type ordinaire ou solennel) ou du Sénat (`data/senat.json`), de moins de 2 jours, avec le résultat officiel,
   la date, les voix (pour, contre, abstentions) et le lien du scrutin. Un résultat incohérent avec les voix, un titre trop long ou un mot de la
   liste prudente (par exemple « mineurs ») écarte le vote : mieux vaut ne rien publier. Formulation neutre, jamais d'avis ni de qualificatif.

Chaque post est **suivi d'une story d'annonce** (« Nouveau post », titre court, miniature du post, « → @hemicyclefrance », 1080 × 1920,
même direction artistique bleue). L'API officielle ne permet pas de repartager un post en story : c'est donc une image d'annonce générée en même temps
que le post (`instagram/auto/<id>.jpg`), publiée **au plus tôt 5 min après le post** (donc au passage suivant du workflow) et **au plus tard 3 h après**.

Entrées de `data/instagram-file.json` : `type: "story"` (1080 × 1920) ou `type: "post"` (1080 × 1350, champ `legende` en français : titre, 2 ou 3 lignes
factuelles, source citée, `@hemicyclefrance`, quelques hashtags, **jamais le lien du site**). La story d'annonce est une entrée `story` avec le champ `annonceDe`
(identifiant du post). L'identifiant du post est stable (empreinte du sujet ou du scrutin) : un seul post par vote, jamais de doublon
(file + registre, titres proches sur 36 h, même date + même sujet pour une date à retenir).

Règles propres aux posts (en plus de celles ci-dessus) :

- **2 posts par jour au maximum** ; le plafond de 4 stories par jour est inchangé et ne compte ni les posts ni les stories d'annonce ;
- un post non publié depuis plus de **12 h** est périmé (3 h pour une story) ; son annonce l'est alors aussi ;
- espacement : 60 min entre deux publications, **sauf** la story d'annonce d'un post, qui peut sortir 5 min après CE post (c'est l'unique exception) ;
- légende contrôlée avant envoi : 20 à 2 200 caractères, 30 hashtags au plus, le compte cité, aucun lien du site ; sinon le post n'est pas publié ;
- monétisation : le post de loi (données officielles) reste possible, le post « date » (tiré de la presse) et son annonce sont retirés ;
- validation humaine : le post est écrit en brouillon (`instagram/brouillons/`), sans annonce, et rien n'est publié automatiquement.

L'API utilisée pour un post est `POST /{IG_USER_ID}/media` (`image_url`, `caption`), puis `POST /{IG_USER_ID}/media_publish`, comme pour une story
(sans `media_type=STORIES`). Le registre `data/instagram-publiees.json` garde pour chaque publication : `id`, `statut`, `publieLe`, `mediaId`, `titre`, `type` (`story` ou `post`) et, pour une annonce, `annonceDe`.

## Vidéos animées (stories vidéo et Reels)

**Désactivées par défaut.** Dans `data/stories-config.json` : `"videos": true` les active, `"videosMax": 2` limite le nombre de vidéos par jour (stories vidéo et Reels, 0 à 6).
Seuls **nos propres visuels** sont animés : aucune vidéo, aucun extrait, aucune musique ni aucun son d'un média tiers ou de YouTube n'est republié. Les vidéos de médias restent de simples
liens affichés sur le site. Les vidéos sont générées par `scripts/videos-auto.cjs` (ffmpeg, installé par les workflows quand `videos` vaut `true`) à partir des images déjà dessinées :
apparition progressive des blocs (fondu d'entrée), zoom lent de type Ken Burns, et, sur un Reel, une **barre qui se remplit** (part des voix pour et contre d'une loi adoptée ou rejetée)
ou un **compteur** (nombre de jours avant une date à retenir), posés dans la zone libre du post. Aucune ressource externe.

- **story vidéo** : seulement pour un **dossier** ou un **« direct »** (modèles à fort enjeu), 9 s, 1080×1920. L'entrée de la file garde `url_image` ET reçoit `url_video` (`instagram/auto/<id>.mp4`) ;
- **Reel** : un par **post** (date à retenir lointaine, loi adoptée ou rejetée), 10 s, même légende que le post. Entrée `{ type: "reel", reelDe: id du post, url_image (vignette), url_video, legende }`.
  Il est publié **après son post** (jamais avant, au plus 12 h après), avec l'espacement de 60 min ; il ne compte ni dans les 4 stories ni dans les 2 posts par jour, mais dans `videosMax` ;
- format : MP4, H.264 (yuv420p), 30 images/s, piste AAC mono **silencieuse**, 1080×1920, moins de 2 Mo en pratique (25 Mo au maximum, contrôlé par `check-data.js`) ;
- API : story vidéo = `POST /{IG_USER_ID}/media` `{ media_type: "STORIES", video_url }` ; Reel = `{ media_type: "REELS", video_url, caption, share_to_feed: true, thumb_offset }` ;
  puis attente du statut `FINISHED` (`GET /{creation_id}?fields=status_code`, jusqu'à ~5 min, délai croissant de 3 à 30 s) et `media_publish` ;
- avant l'appel, la vidéo doit être en ligne (HEAD 200 et `Content-Type: video/mp4` sur GitHub Pages) ; sinon une story part en **image**, un Reel attend le passage suivant ;
- repli : si l'API refuse la vidéo d'une story **avant** `media_publish`, la même story est publiée en image (une seule publication, jamais de doublon) ; un Reel refusé est abandonné, le registre reste inchangé ;
- sans ffmpeg ou si la génération échoue : une ligne dans le résumé de l'exécution, l'image et le post partent seuls. Tous les autres garde-fous (7 h–23 h, 60 min, plafonds, registre sans doublon, titres proches sur 36 h,
  réserve électorale, mots à risque, présomption d'innocence) s'appliquent aux vidéos comme aux images.

Essai local : `node scripts/videos-auto.cjs instagram/modeles/post-loi.jpg /tmp/essai.mp4 reel 276:86` (`reel`, `story`, `pour:contre` ou `jours:N`). Exemple : `instagram/modeles/reel-loi.mp4` (+ `reel-loi.jpg`).
Test : `node tests/videos-auto.test.mjs` (la génération réelle n'est testée que si ffmpeg et ffprobe sont installés).

## Contenus récurrents et carrousels (sans dépendre d'un sujet de presse)

`scripts/contenus-auto.cjs` (workflow `contenus-auto.yml`, deux passages par heure) ajoute à la même file des contenus tirés **uniquement de nos données officielles** (jamais de presse tierce, jamais d'avis, source citée dans l'image et la légende) ; `publier-stories.cjs` les publie **à l'heure de leur créneau** (champs `pasAvant` et `expire` de l'entrée).

| Type (`contenu`) | Format | Données | Créneau par défaut |
|---|---|---|---|
| `aujourdhui` « Aujourd'hui à l'Assemblée » | story | `data/agenda-an.json` : QAG, votes solennels, textes du jour de séance (un point à mot prudent est écarté) | 8 h 30 |
| `vote-jour` « Le vote du jour » | story | `data/lois.json` : motion de censure, article ou amendement du Gouvernement du dernier jour de vote (3 jours au plus) ; **jamais un vote final** (resté un post) | 12 h 30 |
| `comprendre` | story | les 10 notions de la rubrique Comprendre d'`index.html` (lues directement dans la page), une par semaine, rotation sans répétition avant épuisement | samedi 10 h |
| `chiffre-jour` | story | `data/indicateurs.json`, `data/budget.json`, ou dernier sondage **hors réserve** ; une même donnée au plus une fois tous les 7 jours | 19 h |
| `carrousel-loi` « Une loi expliquée » | carrousel de 5 images | vote final adopté ou rejeté (AN ou Sénat) : contexte, intitulé officiel, résultat, suites de la procédure, sources | 17 h 30 |
| `carrousel-hebdo` « Ce qu'il faut retenir cette semaine » | carrousel (4 à 8 images) | `data/digest/AAAA-Wss.json` (résumé hebdomadaire existant, hors presse) | dimanche 18 h 30 |

- **Créneaux** : `data/stories-config.json`, clé `creneaux` : `{ "chiffre-jour": { "heure": "19:00", "jours": [1,2,3,4,5,6,7] } }` (jours : 1 lundi … 7 dimanche ; `false` coupe un créneau). Toujours entre 7 h et 22 h 30 (Paris) ; deux contenus d'un même jour sont espacés de 60 min (le second est repoussé : le dimanche, le chiffre sort à 19 h 30). `"contenusAuto": false` arrête tout. Un contenu est préparé environ 2 h avant son créneau (image en ligne sur GitHub Pages avant l'heure) ; passé son `expire`, il est marqué « périmé » et jamais publié. Le workflow de publication tourne à :11 et :41 de chaque heure : un contenu sort au plus 30 min après son créneau (plus si une autre publication date de moins de 60 min).
- **Aucun doublon** : id stable par type et période (jour, semaine ou vote), `data/contenus-etat.json` (faits, rotation Comprendre, dernier passage de chaque chiffre), file, brouillons et registre consultés avant toute création. Une fiche Comprendre ou un chiffre jamais publié (périmé) redevient disponible.
- **Réserve électorale** : aucun sondage ni simulation (chiffre du jour sondage, diapo sondage du résumé) tant que `reserveSondages()` est vraie ; ces entrées portent `reserve: true` (retirées de la file par `stories-auto.cjs`, ignorées par le publieur).
- **Garde-fous conservés** : mots à risque (contrôle à la création et dernier filet à la publication sur chaque sujet affiché), registre `instagram-publiees.json`, nuit, 60 min, `validationHumaine` / monétisation (brouillons dans `instagram/brouillons/`), plafond de 2 posts par jour (carrousels compris). Ces contenus à créneau n'entrent pas dans `maxParJour` (stories de presse).
- **Carrousel** (`scripts/carrousel.cjs`) : POST `/{IG_USER_ID}/media` pour chaque image (`is_carousel_item=true`, `alt_text`), attente de `FINISHED` à chaque étape, puis `media_type=CAROUSEL` + `children`, puis `media_publish`. Échec avant `media_publish` : rien n'est publié, nouvel essai au passage suivant ; échec de `media_publish` lui-même : **abandon** (entrée marquée périmée, jamais republiée). Légende : titre, 2-3 lignes factuelles, source officielle, `@hemicyclefrance`, 3 à 5 hashtags, jamais le lien du site. Images `instagram/auto/<id>.jpg`, `<id>-2.jpg`… (1080×1350, vérifiées par `check-data.js`).
- **Essais** : `node scripts/contenus-auto.cjs --apercus` dessine un exemple de chaque type dans `instagram/modeles/` (`contenu-*.jpg`, `carrousel-loi-1..5.jpg`, `carrousel-hebdo-1..7.jpg`) d'après `tests/fixtures/contenus.json` ; `node tests/contenus-auto.test.mjs` et `node tests/carrousel.test.mjs`.

## Titres génériques

Un sujet dont le titre rédigé par le site est un titre de repli (`generique: true` dans `data/actualites.json`, par exemple « Gilley : actualité locale » ou « Politique : l'essentiel du moment »)
ne devient **jamais** une story, un « en bref » ni un post (sauf prise de parole du président de la République).

## Sujets sensibles : niveaux 1 et 2, comment valider un brouillon

Les sujets de justice et de mise en cause (par exemple une révélation de Mediapart) étaient jusqu'ici **perdus** : leurs mots (accusation, plainte,
tribunal, condamnation…) les écartaient. Ils ne sont plus perdus, et **aucun garde-fou n'est désactivé** : un sujet sensible devient soit une
publication aux formulations prudentes (niveau 1), soit un **brouillon** qu'un humain valide ou rejette d'un geste (niveau 2).
Code : `scripts/sujets-sensibles.cjs` (classement et textes), `scripts/stories-auto.cjs` (choix, brouillons), `scripts/valider-brouillon.cjs`,
`scripts/story-a-la-demande.cjs`, dernier filet dans `scripts/publier-stories.cjs`. Tests : `tests/sujets-sensibles.test.mjs`, `tests/stories-auto.test.mjs`,
`tests/valider-brouillon.test.mjs`, `tests/story-a-la-demande.test.mjs`, `tests/publier-stories.test.mjs`.

### Niveau 1 : fait judiciaire établi, publication automatique

Condition : un sujet repris par **au moins 2 médias** (réglage `minMediasSensible`, 2 par défaut) dont **chaque titre cite à la fois une juridiction et une décision rendue** :
tribunal (correctionnel, judiciaire, administratif…), cour d'appel, Cour de cassation, Conseil constitutionnel, Conseil d'État, parquet qui **annonce l'ouverture d'une enquête**,
et un jugement, une condamnation, une relaxe, un arrêt, une décision. Sont écartés du niveau 1 : « requiert », « rendra », « pourrait », « serait », « sera jugé », une enquête
annoncée par un ministre (pas par le parquet), un seul média, un sujet de plus de 3 h.

Le texte est **fabriqué par règles**, jamais écrit librement ni recopié d'un titre de presse :

- titre : `Selon <médias> : <juridiction> a prononcé une condamnation | a prononcé une relaxe | a rendu une décision | a annoncé l'ouverture d'une enquête` ;
- **aucun nom de personne**, aucun portrait, aucune citation de titre de presse ; aucun verbe ni qualificatif qui accuse, jamais « coupable » (contrôle `formulationSure`, refait par le publieur) ;
- pied : `Sources : <médias> (articles du <date>)` et, dès qu'une procédure pénale est en jeu, « Toute personne citée est présumée innocente tant qu'elle n'a pas été jugée définitivement » ;
- jamais « procédure en cours » sans juridiction ; le titre de presse reste seulement dans le champ `sujets` de l'entrée (détection des doublons).

L'entrée va dans la file comme n'importe quelle story (champ `sensible: 1`) : mêmes règles de publication (7 h – 23 h, 60 min, registre sans doublon, plafond de stories, 3 h de fraîcheur).
Si `validationHumaine` vaut `true`, le niveau 1 devient lui aussi un brouillon.

### Niveau 2 : tout le reste, jamais d'envoi automatique

Accusation, plainte annoncée, polémique, révélation d'un seul média, personne mise en cause sans décision : le script écrit un **brouillon**
(`instagram/brouillons/<id>.jpg` + `<id>.json`, champ `sensible: 2`) et **rien n'entre dans `data/instagram-file.json`**. Le brouillon porte :

- un titre neutre à nous, attribué : « Selon Mediapart : des faits non établis à ce stade » (ou « une polémique en cours ») ;
- le titre du média **entre guillemets avec son nom** (la réponse de la personne est signalée quand le titre la cite) ;
- le pied « Faits non établis par la justice : toute personne citée est présumée innocente » et les sources ; aucun portrait (le média est nommé en toutes lettres : le site ne stocke aucun logo de média).

Au plus 3 brouillons par jour (`brouillonsSensiblesMax`), jamais la nuit ; un sujet de plus de 12 h, déjà en brouillon, déjà publié ou **rejeté depuis moins de 7 jours** n'est pas proposé. Un brouillon de plus de 7 jours est supprimé.
Chaque brouillon est listé dans le **résumé de l'exécution** (onglet Actions, étape « Story automatique ») avec son identifiant et la marche à suivre.

### Comment valider un brouillon (clics exacts)

1. GitHub > dépôt `Tahns/hemicycle-france` > onglet **Actions**. Ouvrir la dernière exécution « Actualités » (ou « Mise à jour des données ») : le **résumé** (en bas de la page) donne la ligne « Brouillon SENSIBLE à valider », l'identifiant (12 caractères) et les sources.
2. Relire l'image : dépôt > `instagram/brouillons/<id>.jpg` (et le lien de l'article cité).
3. Onglet **Actions** > à gauche **« Valider un brouillon »** > bouton **Run workflow** > champ **id** : coller l'identifiant > champ **action** : **publier** ou **rejeter** > **Run workflow**.
   - **publier** : le brouillon entre dans la file ; « Publier les stories » le sort à son prochain passage (7 h – 23 h, 60 min d'écart, registre sans doublon, plafonds) ; une story non sortie dans les 3 h est périmée.
     Une story ne se valide qu'entre 7 h et 21 h (heure de Paris) ; un brouillon de plus de 48 h est refusé ; un sondage est refusé pendant la réserve électorale ; en monétisation, aucune presse.
   - **rejeter** : le brouillon est supprimé et le sujet n'est pas reproposé pendant 7 jours (`data/instagram-rejetes.json`). Par défaut, le menu propose « rejeter » : il faut choisir « publier » volontairement.
4. Le résumé de l'exécution dit ce qui s'est passé ; un refus est en rouge avec sa raison.

### Demande directe : une story ou un post sur un article précis

Onglet **Actions** > **« Story à la demande »** > **Run workflow** : **lien** de l'article (https, d'un média de `data/medias-connus.json`), **média** (facultatif, doit correspondre au lien),
**titre** exact publié par le média (facultatif, cité entre guillemets), **type** `story` ou `post`. Le script crée **toujours un brouillon** (jamais de publication directe) puis il faut le valider comme ci-dessus.
Un lien hors des médias connus (réseau social, site inconnu, `http`, faux domaine) est **refusé** et aucune image n'est créée ; il en va de même pour les mineurs, les violences sexuelles, le suicide et, en réserve électorale, un sondage.
Pour un **post**, seul le post est publié (pas de story d'annonce ni de Reel). Pour ajouter un média : une ligne dans `data/medias-connus.json`.

### Ce qui ne change pas

Réserve électorale, pas de sondage en réserve, pas de doublon (id, liens, titres proches sur 36 h, registre), seuil de médias des autres sujets, titres génériques jamais publiés, 7 h – 23 h, 60 min, plafonds.
Restent **écartés sans brouillon** : faits divers, violences, décès, mineurs, violences sexuelles, suicide, sujets hors de la vie politique française.
Réglages (`data/stories-config.json`, tous facultatifs) : `sensibles` (`false` coupe tout), `minMediasSensible`, `brouillonsSensiblesMax`.

### Limites : ce n'est pas un avis juridique

Ce dispositif **réduit** le risque de poursuites (diffamation, loi du 29 juillet 1881 ; présomption d'innocence, art. 9-1 du Code civil) ; il **ne le supprime pas**.
Il ne remplace ni l'appréciation d'un humain, ni celle d'un avocat. Points d'attention :

- **Citer un média ne protège pas automatiquement** : reprendre une imputation diffamatoire, même attribuée, peut engager la responsabilité de celui qui la diffuse. C'est pourquoi le niveau 2 passe par une validation humaine et ne publie que le titre exact du média, avec son nom et sa source.
- **Les brouillons sont dans un dépôt public** (`instagram/brouillons/`, hébergé par GitHub Pages) jusqu'à leur validation ou leur rejet : à relire et trancher vite ; une alternative serait un dépôt privé.
- Le classement repose sur des **mots et des titres** : il peut se tromper (une décision mal comprise, un titre ambigu). La validation humaine du niveau 2 est le filet ; le niveau 1 est volontairement restrictif (2 médias, juridiction et décision dans le titre) et sans aucun nom.
- Une décision de justice peut être **frappée d'appel** ou annulée ensuite : la mention « présumée innocente tant qu'elle n'a pas été jugée définitivement » est là pour cela ; le droit de réponse et la rectification d'une erreur restent à traiter à la main.
- **Faire relire les formulations par un avocat en droit de la presse** est la vraie sécurité : les gabarits sont dans `scripts/sujets-sensibles.cjs` (`ficheNiveau1`, `ficheNiveau2`, `RE_ACCUSE`), faciles à modifier après son avis.

## 1. Prérequis (à faire une fois, environ 30 minutes)

1. **Un compte Instagram professionnel** (Créateur ou Entreprise) : dans l'application Instagram, Paramètres > Type de compte et outils > Passer à un compte professionnel.
2. **Une Page Facebook** reliée à ce compte Instagram (Paramètres Instagram > Centre de comptes, ou depuis la Page : Paramètres > Comptes liés > Instagram).
3. **Une application Meta** : allez sur <https://developers.facebook.com>, « Mes apps » > « Créer une app », type « Entreprise » (ou « Autre »). Ajoutez le produit **Instagram** (API avec connexion Facebook).
4. **Les autorisations** à demander : `instagram_basic`, `instagram_content_publish`, `pages_show_list`
   (selon l'interface du moment, `pages_read_engagement` peut aussi être demandée).
5. **Générer un jeton** : dans l'« Explorateur de l'API Graph » (menu Outils du site développeurs), choisissez votre app, ajoutez les autorisations ci-dessus, cliquez « Générer un jeton d'accès » et acceptez.
   Ce premier jeton ne dure qu'une heure environ : **échangez-le contre un jeton longue durée (60 jours)**, en ouvrant dans le navigateur (remplacez les valeurs entre `<>`, l'identifiant et la clé secrète de l'app sont dans Paramètres de l'app > Général) :

   `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=<ID_APP>&client_secret=<CLE_SECRETE_APP>&fb_exchange_token=<JETON_COURT>`

   La réponse contient `access_token` : c'est votre jeton longue durée. Ne le partagez jamais.
   (Le jeton obtenu ainsi est un jeton d'utilisateur ; la publication sur un compte dont vous êtes propriétaire fonctionne avec lui.)
6. **Récupérer l'IG_USER_ID** (identifiant du compte Instagram professionnel) : dans l'explorateur, appelez
   `GET /me/accounts` : vous voyez votre Page et son `id` ; puis
   `GET /<ID_PAGE>?fields=instagram_business_account` : le nombre renvoyé dans `instagram_business_account.id` est votre **IG_USER_ID**.

> Honnêteté sur la « revue d'application » : pour publier sur **votre propre** compte, tant que l'application reste en
> **mode développement** et que vous en êtes administrateur, Meta n'impose en principe pas de revue d'application ;
> c'est la règle générale, mais elle a déjà changé et **elle est à vérifier** dans votre console Meta (si l'API répond
> « permission manquante », c'est ce point qui bloque). Une revue (« Accès avancé ») n'est nécessaire que pour publier
> au nom de comptes tiers. L'API officielle exige dans tous les cas une application Meta, un compte professionnel et une Page Facebook.

## 2. Créer les deux secrets GitHub

Dépôt GitHub > **Settings** > **Secrets and variables** > **Actions** > **New repository secret** :

| Nom (exact) | Valeur |
|---|---|
| `IG_USER_ID` | l'identifiant numérique du compte Instagram |
| `IG_ACCESS_TOKEN` | le jeton longue durée |

GitHub masque ensuite ces valeurs ; le script ne les affiche jamais.

## 3. Vérifier que ça marche

1. **Essai à sec** : onglet **Actions** > « Publier les stories » > Run workflow. Pour tester sans rien envoyer, lancez en local `IG_USER_ID=... IG_ACCESS_TOKEN=... node scripts/publier-stories.cjs --a-sec`
   (le script contrôle le jeton, l'image et les garde-fous, dit ce qu'il publierait, mais n'envoie ni n'écrit rien).
2. **Vrai essai** : onglet Actions > « Publier les stories » > **Run workflow** (`workflow_dispatch`). Ouvrez l'exécution : le **résumé** indique « Story publiée » ou la raison de l'attente (nuit, plafond, rien de frais…).
   Il faut une story récente (moins de 3 h) dans la file pour que quelque chose parte ; sinon « rien à publier » est normal.
3. Ensuite, le workflow tourne seul (toutes les 15 minutes et après chaque relevé d'actualités). Le registre `data/instagram-publiees.json` est committé après chaque publication.

Les alertes (jeton invalide, expire dans moins de 10 jours, échec de l'API) apparaissent **uniquement dans le résumé** de l'exécution : aucun e-mail, aucune « issue ». Pensez à le consulter de temps en temps.

## 4. Renouveler le jeton (tous les ~50 jours)

Un jeton longue durée dure 60 jours. Quand le résumé signale « le jeton expire dans … jours » :
refaites l'étape 5 des prérequis (nouveau jeton court dans l'explorateur, puis échange contre un jeton longue durée),
et remplacez la valeur du secret `IG_ACCESS_TOKEN` (Settings > Secrets and variables > Actions > crayon à droite du secret).
Noter la date dans votre agenda évite toute surprise. (Si Meta fournit pour votre type de compte un jeton « système » sans expiration, via le Business Manager, il évite cette corvée : à vérifier.)

## 5. Couper la publication

Supprimez le secret `IG_ACCESS_TOKEN` (ou `IG_USER_ID`) : au passage suivant, le workflow redevient inactif et n'envoie plus rien.
Autres moyens : mettre `"validationHumaine": true` dans `data/stories-config.json`, ou désactiver le workflow dans l'onglet Actions.

## Plan B sans code : Make.com ou Zapier

Si l'application Meta est trop lourde, un outil sans code peut faire la même chose, mais il reste soumis aux mêmes
règles d'Instagram (compte professionnel relié à une Page Facebook) : c'est l'outil qui porte alors l'application Meta, pas vous.
Le dépôt génère pour cela un flux Atom à jour : **`https://tahns.github.io/hemicycle-france/instagram/file.atom`**
(une entrée par story ou par post, catégorie `story` ou `post`, image JPEG en pièce jointe `enclosure`, légende du post dans `<content>`, créé par `scripts/stories-auto.cjs` en même temps que la file).
Attention : ce flux mélange désormais des images 1080 × 1350 (posts) et 1080 × 1920 (stories) ; filtrez sur la catégorie pour publier chaque type au bon endroit.

Scénario type (Make.com) :

1. Module **RSS > Watch RSS feed items** avec l'adresse du flux ci-dessus, intervalle 15 minutes, « maximum 1 élément par exécution ».
2. Module **Instagram for Business > Create a Photo Story**, relié à votre compte (connexion via Facebook) ; champ URL de la photo : le lien `enclosure` de l'élément.

Sur Zapier : déclencheur « RSS by Zapier > New Item in Feed », action « Instagram for Business > Publish Photo » en choisissant le format Story si l'offre le propose. Les intitulés exacts changent selon les versions : à vérifier dans l'outil.

Limites à connaître : ce plan B **ne connaît pas les garde-fous du dépôt** (pas de pause 23 h – 7 h, pas de plafond de 4 par jour, pas de contrôle de la réserve électorale, pas d'expiration à 3 h : une vieille entrée du flux pourrait être publiée au premier lancement). Réglez dans l'outil : un filtre sur la date de l'entrée (moins de 3 h), un horaire de 7 h à 23 h, et surveillez de près la période de réserve électorale (coupez le scénario le samedi et le dimanche des scrutins). Il est aussi payant au-delà d'un certain volume. Ne faites pas tourner le plan B **et** le workflow GitHub en même temps : les stories seraient publiées en double.
