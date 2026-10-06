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
- `data/stories-config.json` : si `validationHumaine` vaut `true`, rien n'est publié ; en mode `monetisation`,
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

## Titres génériques

Un sujet dont le titre rédigé par le site est un titre de repli (`generique: true` dans `data/actualites.json`, par exemple « Gilley : actualité locale » ou « Politique : l'essentiel du moment »)
ne devient **jamais** une story, un « en bref » ni un post (sauf prise de parole du président de la République).

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
