# Publication automatique des stories Instagram

Le dépôt prépare déjà les stories (image JPEG + ligne dans `data/instagram-file.json`). Le workflow GitHub
**« Publier les stories »** (`.github/workflows/publier-stories.yml`) les publie ensuite tout seul sur Instagram,
toutes les 15 minutes environ, sans qu'aucune session Claude ne soit ouverte. Il utilise l'API officielle
« Instagram Graph » de Meta.

Tant que les deux secrets décrits plus bas n'existent pas, le workflow ne fait rien : il écrit seulement
« Publication automatique inactive : secrets absents » dans son résumé et se termine sans erreur.

## Ce que le script respecte (sans réglage)

- une seule story par passage ; 4 par jour au maximum ; jamais entre 23 h et 7 h (heure de Paris) ;
- une story préparée depuis plus de 3 h est marquée « périmée » et n'est jamais publiée ;
- jamais deux fois la même story (registre `data/instagram-publiees.json`) ;
- aucun sondage pendant la réserve électorale ;
- `data/stories-config.json` : si `validationHumaine` vaut `true`, rien n'est publié ; en mode `monetisation`,
  seules les stories sans titre de presse le sont ;
- si l'image n'est pas encore en ligne sur GitHub Pages, nouvel essai au passage suivant ;
- en cas d'erreur de l'API, la story n'est pas marquée publiée : nouvel essai au passage suivant (tant qu'elle n'est pas périmée) ;
- le jeton n'apparaît jamais dans les journaux.

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
(une entrée par story, image JPEG en pièce jointe `enclosure`, créé par `scripts/stories-auto.cjs` en même temps que la file).

Scénario type (Make.com) :

1. Module **RSS > Watch RSS feed items** avec l'adresse du flux ci-dessus, intervalle 15 minutes, « maximum 1 élément par exécution ».
2. Module **Instagram for Business > Create a Photo Story**, relié à votre compte (connexion via Facebook) ; champ URL de la photo : le lien `enclosure` de l'élément.

Sur Zapier : déclencheur « RSS by Zapier > New Item in Feed », action « Instagram for Business > Publish Photo » en choisissant le format Story si l'offre le propose. Les intitulés exacts changent selon les versions : à vérifier dans l'outil.

Limites à connaître : ce plan B **ne connaît pas les garde-fous du dépôt** (pas de pause 23 h – 7 h, pas de plafond de 4 par jour, pas de contrôle de la réserve électorale, pas d'expiration à 3 h : une vieille entrée du flux pourrait être publiée au premier lancement). Réglez dans l'outil : un filtre sur la date de l'entrée (moins de 3 h), un horaire de 7 h à 23 h, et surveillez de près la période de réserve électorale (coupez le scénario le samedi et le dimanche des scrutins). Il est aussi payant au-delà d'un certain volume. Ne faites pas tourner le plan B **et** le workflow GitHub en même temps : les stories seraient publiées en double.
