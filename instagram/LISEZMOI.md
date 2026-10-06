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

Aperçus des modèles : `modeles/post-date.jpg`, `modeles/post-loi.jpg` (posts) et `modeles/story-annonce-post.jpg` (story d'annonce).

## Contenus récurrents et carrousels

`scripts/contenus-auto.cjs` produit chaque jour, depuis nos seules données officielles, des stories à heure fixe : **Aujourd'hui à l'Assemblée** (8 h 30), **Le vote du jour** (12 h 30), **Comprendre** (une notion par semaine, samedi 10 h), **Le chiffre du jour** (19 h), et des posts **carrousels** : **Une loi expliquée en 5 images** (17 h 30) et **Ce qu'il faut retenir cette semaine** (dimanche 18 h 30). Heures réglables dans `data/stories-config.json` (`creneaux`). Aperçus : `modeles/contenu-aujourdhui.jpg`, `modeles/contenu-vote-jour.jpg`, `modeles/contenu-comprendre.jpg`, `modeles/contenu-chiffre-jour.jpg`, `modeles/carrousel-loi-1.jpg` à `-5.jpg`, `modeles/carrousel-hebdo-1.jpg` à `-7.jpg`. Détails : `docs/PUBLICATION-AUTO.md`.
