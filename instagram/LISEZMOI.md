# Profil Instagram @hemicyclefrance

Modifiable seulement dans l'appli Instagram (Modifier le profil).

- **Nom** : Hémicycle France
- **Nom d'utilisateur** : hemicyclefrance
- **Catégorie** : Site d'information / Média
- **Photo de profil** : `profil.png`
- **Lien** : https://tahns.github.io/hemicycle-france/
- **Bio** (moins de 150 caractères) :

```
Votes des députés et sénateurs 🏛️
Sondages 2027 · Actus sourcées
Données officielles, chaque heure
```

- **À la une** (couvertures 1080×1920, à recadrer en cercle) : `rubrique-votes.png`, `rubrique-sondages.png`, `rubrique-actus.png`, `rubrique-senat.png`, `rubrique-quiz.png`, `rubrique-elysee.png`.

## Publications automatiques (`instagram/auto/`)

`scripts/stories-auto.cjs` prépare les images, `scripts/publier-stories.cjs` les publie (voir `docs/PUBLICATION-AUTO.md`) :

- **stories** (1080×1920) : l'actualité (à la une, dossier, en direct, face à face, chiffre, date à retenir à 3 jours ou moins, en bref) et les sondages ;
- **posts** (1080×1350, légende dans `data/instagram-file.json`) : seulement une **date à retenir lointaine** (plus de 3 jours) et une **loi adoptée ou rejetée** (vote final, résultat officiel), 2 par jour au plus ;
- **story d'annonce** : chaque post est suivi d'une story « Nouveau post » (miniature du post, « → @hemicyclefrance »), publiée au plus tôt 5 min après lui, car l'API officielle ne permet pas de repartager un post en story.

- **vidéos** (option `"videos": true` de `data/stories-config.json`, `"videosMax"` par jour ; désactivées par défaut) : nos propres visuels animés par ffmpeg (`scripts/videos-auto.cjs`), sans son ni ressource externe :
  une **story vidéo** pour un dossier ou un « direct » (`url_video`, en plus de `url_image`) et un **Reel** par post, publié après lui. Exemple : `modeles/reel-loi.mp4`. Détails : `docs/PUBLICATION-AUTO.md`.

## Sujets sensibles (justice, mises en cause) et brouillons (`instagram/brouillons/`)

Les sujets de justice ne sont plus perdus (détails, limites et marche à suivre : `docs/PUBLICATION-AUTO.md`, « Sujets sensibles : niveaux 1 et 2, comment valider un brouillon ») :

- **niveau 1, fait judiciaire établi** (une juridiction et une décision citées par au moins 2 médias) : story **automatique** au texte prudent (« Selon Le Monde et franceinfo : le tribunal… a prononcé une condamnation », sources et date en pied, aucun nom, « présumée innocente ») ;
- **niveau 2, accusation, plainte annoncée, polémique, révélation d'un seul média** : **jamais d'envoi automatique**, seulement un **brouillon** (`brouillons/<id>.jpg` + `<id>.json`) listé dans le résumé de l'exécution ;
- **valider** : Actions > « Valider un brouillon » > Run workflow > id du brouillon + `publier` ou `rejeter` (une seule action) ; `publier` place le brouillon dans la file (`auto/<id>.jpg`, `data/instagram-file.json`), la publication suit les règles habituelles ;
- **demande directe** : Actions > « Story à la demande » > lien de l'article d'un média connu, titre cité, `story` ou `post` : crée toujours un brouillon, à valider de la même façon.

Ce n'est pas un avis juridique : le risque est réduit, pas supprimé ; un avocat en droit de la presse peut valider les formulations.

Aperçus des modèles : `modeles/post-date.jpg`, `modeles/post-loi.jpg` (posts) et `modeles/story-annonce-post.jpg` (story d'annonce).
