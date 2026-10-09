# Statistiques Instagram : mesurer ce qui marche

Lecture seule de l'API officielle Instagram (même compte et mêmes secrets que la publication automatique, voir `PUBLICATION-AUTO.md`). Rien n'est publié, masqué ni répondu.

## Ce qui tourne

| Élément | Rôle |
| --- | --- |
| `.github/workflows/stats-instagram.yml` | Deux relevés par jour (20 h 37 et 6 h 23 UTC) + lancement manuel. Groupe de concurrence `update-data`. |
| `scripts/stats-instagram.cjs` | Relève les insights de chaque média du registre `data/instagram-publiees.json` (le `mediaId` « windsor » est ignoré), le nombre d'abonnés, et écrit les fichiers ci-dessous. |
| `scripts/recommandations.cjs` | Lit les statistiques et écrit des **suggestions**. Ne modifie jamais un réglage. |
| `data/instagram-stats.json` | Une entrée par média : `type` (story, post, carrousel, reel), `modele`, `variante` (style de la story, voir « Test comparatif »), `theme`, `nbMedias` (médias du sujet), `publieLe`, `heureParis`, `metriques`, `refusees`, `releveLe`. Contrôlé par `scripts/check-data.js`. |
| `docs/stats/AAAA-Wss.md` | Résumé de la semaine (aussi dans le résumé de l'exécution GitHub). |
| `docs/stats/recommandations.md` | Pistes calculées sur tout l'historique. |

Sans les secrets `IG_USER_ID` et `IG_ACCESS_TOKEN` : sortie propre, ligne « INACTIVES » dans le résumé, aucun appel. Un jeton invalide déclenche une alerte (`::warning::` et résumé) sans faire échouer l'exécution. Le jeton est envoyé en en-tête et masqué dans tous les messages.

## Lire le rapport hebdomadaire

- **Abonnés** : nombre actuel et variation sur 7 jours (l'historique démarre au premier relevé).
- **Meilleurs / moins bons contenus** : classés par vues (à défaut, portée). Une « vue » n'a pas le même sens pour une story et pour un Reel.
- **Ce qui marche** : meilleur créneau horaire (heure de Paris), meilleur format, meilleur thème, en moyenne de vues. Un groupe d'un seul média n'est retenu que s'il n'y a rien de mieux fondé.
- **Commentaires signalés** (seulement si activés) : identifiants à examiner.
- **Alertes** : jeton invalide, etc.

Métriques demandées (API v21, `graph.instagram.com`) : stories `views`, `reach`, `shares`, `replies`, `total_interactions` ; posts et carrousels `views`, `reach`, `likes`, `comments`, `saved`, `shares`, `total_interactions` ; Reels les mêmes, plus `ig_reels_avg_watch_time`. `impressions`, `taps_forward`, `taps_back` et `exits` ne sont plus demandées : l'API les a refusées au premier relevé réel (7 oct. 2026) et `views` remplace `impressions`. L'API refuse certaines métriques selon le type de média et la version : le script essaie en bloc, puis une par une ; les refusées sont listées dans `refusees` et ignorées. Le thème est déduit du titre (mots-clés) et le modèle de l'identifiant ou du champ `dossierId`, faute de champ dédié ; ils sont figés au premier relevé.

## Test comparatif des styles de story

Depuis le 8 octobre 2026, les stories d'un sujet d'actualité (« à la une », chiffre, date à retenir), les dossiers et les stories des contenus récurrents (« Aujourd'hui à l'Assemblée », vote du jour, Comprendre, chiffre du jour) sont dessinées dans l'un de quatre styles, pour savoir lesquels sont les plus vus :

| `variante` | Dessin |
| --- | --- |
| `bleu` | Le style historique : fond bleu uni, texte et pastilles de médias. |
| `une-photo` | Photo libre d'une institution (`data/vignettes.json`, jamais une personne) sous un dégradé sombre, accroche géante, une phrase « L'essentiel », pastille de catégorie, crédit de la photo ; sans photo, un motif graphique du thème. |
| `question` | L'accroche posée en question, trois puces de huit mots au plus, fond de couleur selon le thème (rouge, vert, jaune, bleu, noir). |
| `chiffre` | Un nombre géant (médias, articles, voix pour…) et une ligne de contexte. |

- **Attribution** : déterministe, `variante = ["bleu", "une-photo", "question", "chiffre"][sha1("variante|" + id) % 4]` (`varianteDe` dans `scripts/stories-auto.cjs`) ; chaque style garde donc environ un quart des stories, et le même contenu a toujours le même style. « Comprendre » n'a pas de nombre à mettre en avant : il se partage entre trois styles (hors `chiffre`). Les « en direct », « en bref », « face à face » (portraits), sondages, sujets sensibles, posts et rappels d'agenda gardent leur dessin sans champ `variante` : ils ne comptent pas dans la comparaison.
- **Enregistrement** : `variante` est écrit dans l'entrée de `data/instagram-file.json`, puis recopié par `stats-instagram.cjs` dans `data/instagram-stats.json` (figé au premier relevé).
- **Lecture** : le rapport hebdomadaire contient un tableau « Test comparatif des styles de story » : nombre de stories mesurées, moyenne de vues et moyenne d'interactions (`total_interactions`, à défaut la somme des j'aime, commentaires, enregistrements, partages et réponses) par style, sur tout l'historique. Avec 9 à 13 vues par story, un écart de quelques vues n'est pas une conclusion : attendez au moins 10 stories par style (environ 40 stories, un mois de publication) et un écart net avant de retenir un style.
- **Conclure le test** : `docs/stats/recommandations.md` (calculé par `scripts/recommandations.cjs`) contient la section « Test comparatif des styles de story » avec une ligne « Style gagnant ». Elle n'est donnée qu'avec au moins 10 stories mesurées **pour chacun** des quatre styles ; sinon « pas assez de données » (avec le détail par style). Le gagnant est le style à la plus forte moyenne de vues, à condition de dépasser le deuxième d'au moins 15 % ; en dessous, « aucun net » (relancer plus longtemps, ou garder le test). C'est une suggestion : rien n'est modifié automatiquement.
- **Fixer le style gagnant** : dans `data/stories-config.json`, remplacer `"styleFixe": null` par `"bleu"`, `"une-photo"`, `"question"` ou `"chiffre"`. Toutes les NOUVELLES stories concernées (celles qui portaient une variante, y compris les contenus récurrents) reçoivent alors ce style ; les stories déjà en file gardent le leur. « Comprendre », qui n'a pas de nombre à mettre en avant, prend `bleu` quand le style fixé est `chiffre`. `null` remet l'attribution par hash du test comparatif (valeur livrée). Une valeur inconnue est ignorée par les scripts et refusée par `node scripts/check-data.js`.
- **Règles de dessin** (`js/stories.js`, `storyStyleDessiner`) : texte essentiel de 52 px au moins, 35 mots au plus, rien d'essentiel dans les 250 px du haut ni les 340 px du bas, contraste AA, source et mention « Titres relevés dans la presse… » conservées, crédit de la photo visible. Aperçus : `instagram/modeles/styles/`.

## Limites

- **Insights des stories : 24 h seulement.** Une story est relevée le soir de sa publication (J+0) et au relevé du matin suivant s'il reste moins de 24 h ; ensuite elle est figée. Une story publiée tôt le matin peut échapper au second relevé. Les valeurs gardées sont les plus hautes jamais relevées (un compteur ne baisse pas).
- Posts et Reels : suivis 30 jours, puis figés.
- **Peu de données = pas de conclusion.** `recommandations.cjs` exige au moins 10 médias mesurés d'un même type, au moins 3 médias dans le groupe comparé comme dans le reste, et un écart d'au moins 15 %. En dessous : « Données insuffisantes ». Avant plusieurs semaines de relevés (idéalement 30 stories et 10 posts), un classement reflète surtout le hasard et l'actualité du jour (un sujet fort fait plus de vues quelle que soit l'heure).
- Corrélation n'est pas causalité : l'heure, le thème et la rubrique se mélangent. Ce sont des idées à tester, pas des règles.
- Certaines métriques peuvent n'être disponibles qu'en conditions réelles (permissions du jeton, comptes de moins de 100 abonnés pour certains insights) : à vérifier au premier relevé, dans `refusees`.
- Aucune donnée personnelle d'utilisateur n'est conservée (ni pseudo, ni texte de commentaire).

## Commentaires (inactif par défaut)

`data/stories-config.json` : clé `commentaires` absente ou `false` (la clé n'est volontairement pas écrite dans le fichier livré : un test de `stories-auto` en fige le contenu exact). À `"commentaires": true`, le script lit (`GET /{media-id}/comments`) les commentaires des posts et Reels de moins de 30 jours et **signale** dans le rapport ceux qui contiennent un mot d'une liste simple (insultes, menaces, spam ou lien ; listes en tête de `stats-instagram.cjs`). Seuls l'identifiant du commentaire, du média et la catégorie sont écrits. Le masquage est à faire par vous (application Instagram, ou `POST /{id-commentaire}?hide=true` avec la permission de modération) ; **le script ne masque, ne supprime et ne répond jamais**. Une liste de mots produit des faux positifs et des oublis : relisez avant d'agir.

## Essais en local

`node tests/stats-instagram.test.mjs` (faux serveur Graph : métriques valides ou refusées, média sans insights, jeton invalide, masquage du jeton, commentaires, recommandations, contrôle du fichier). `node scripts/check-data.js` contrôle `data/instagram-stats.json`.
