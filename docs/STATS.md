# Statistiques Instagram : mesurer ce qui marche

Lecture seule de l'API officielle Instagram (même compte et mêmes secrets que la publication automatique, voir `PUBLICATION-AUTO.md`). Rien n'est publié, masqué ni répondu.

## Ce qui tourne

| Élément | Rôle |
| --- | --- |
| `.github/workflows/stats-instagram.yml` | Deux relevés par jour (20 h 37 et 6 h 23 UTC) + lancement manuel. Groupe de concurrence `update-data`. |
| `scripts/stats-instagram.cjs` | Relève les insights de chaque média du registre `data/instagram-publiees.json` (le `mediaId` « windsor » est ignoré), le nombre d'abonnés, et écrit les fichiers ci-dessous. |
| `scripts/recommandations.cjs` | Lit les statistiques et écrit des **suggestions**. Ne modifie jamais un réglage. |
| `data/instagram-stats.json` | Une entrée par média : `type` (story, post, carrousel, reel), `modele`, `theme`, `nbMedias` (médias du sujet), `publieLe`, `heureParis`, `metriques`, `refusees`, `releveLe`. Contrôlé par `scripts/check-data.js`. |
| `docs/stats/AAAA-Wss.md` | Résumé de la semaine (aussi dans le résumé de l'exécution GitHub). |
| `docs/stats/recommandations.md` | Pistes calculées sur tout l'historique. |

Sans les secrets `IG_USER_ID` et `IG_ACCESS_TOKEN` : sortie propre, ligne « INACTIVES » dans le résumé, aucun appel. Un jeton invalide déclenche une alerte (`::warning::` et résumé) sans faire échouer l'exécution. Le jeton est envoyé en en-tête et masqué dans tous les messages.

## Lire le rapport hebdomadaire

- **Abonnés** : nombre actuel et variation sur 7 jours (l'historique démarre au premier relevé).
- **Meilleurs / moins bons contenus** : classés par vues (à défaut, portée). Une « vue » n'a pas le même sens pour une story et pour un Reel.
- **Ce qui marche** : meilleur créneau horaire (heure de Paris), meilleur format, meilleur thème, en moyenne de vues. Un groupe d'un seul média n'est retenu que s'il n'y a rien de mieux fondé.
- **Commentaires signalés** (seulement si activés) : identifiants à examiner.
- **Alertes** : jeton invalide, etc.

Métriques demandées (API v21, `graph.instagram.com`) : stories `views`, `impressions`, `reach`, `shares`, `replies`, `total_interactions`, `taps_forward`, `taps_back`, `exits` ; posts et carrousels `views`, `impressions`, `reach`, `likes`, `comments`, `saved`, `shares`, `total_interactions` ; Reels les mêmes sans `impressions`, plus `ig_reels_avg_watch_time`. L'API refuse certaines métriques selon le type de média et la version : le script essaie en bloc, puis une par une ; les refusées sont listées dans `refusees` et ignorées. Le thème est déduit du titre (mots-clés) et le modèle de l'identifiant ou du champ `dossierId`, faute de champ dédié ; ils sont figés au premier relevé.

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
