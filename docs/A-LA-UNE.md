# Les stories à la une (Highlights) d'@hemicyclefrance

**Ce qui est automatique, ce qui ne l'est pas.** L'API Instagram ne permet ni de créer une « à la une » ni d'y ajouter une story :
cela se fait **à la main, dans l'appli**. Le dépôt prépare tout le reste : 14 couvertures aux couleurs du site, une règle de classement
simple, et chaque dimanche une liste « à ajouter cette semaine » (voir la fin de ce guide). Comptez 2 minutes par une, une seule fois ;
ensuite, 2 minutes par semaine.

## 1. Les couvertures

Les 14 couvertures (1080 × 1920 PNG, fond bleu, disque rouge, icône et mot court centrés) sont dans `instagram/a-la-une/`.
Aperçu de l'ensemble, tel qu'Instagram les recadre en cercle : `instagram/a-la-une/planche.png`.

| Ordre | Fichier | Nom à saisir | Ce qu'on y range |
|---|---|---|---|
| 1 | `politique.png` | Politique | actualité politique du jour, dossiers du moment |
| 2 | `parlement.png` | Parlement | Assemblée, Sénat, textes en discussion, votes |
| 3 | `gouvernement.png` | Gouvernement | Premier ministre, ministres, remaniements |
| 4 | `elysee.png` | Élysée | Président de la République, Conseil des ministres |
| 5 | `presidentielle.png` | 2027 | présidentielle : candidatures, primaires, calendrier |
| 6 | `sondages.png` | Sondages | sondages d'intentions de vote et de popularité |
| 7 | `economie.png` | Économie | emploi, prix, énergie, croissance |
| 8 | `budget.png` | Budget | budget de l'État, Sécurité sociale, impôts, dette |
| 9 | `justice.png` | Justice | décisions et institutions judiciaires (faits seulement) |
| 10 | `europe.png` | Europe | Union européenne, international |
| 11 | `comprendre.png` | Comprendre | explications : comment ça marche, jargon |
| 12 | `quiz.png` | Quiz | quiz et jeux de connaissances |
| 13 | `resultats.png` | Résultats | lois adoptées ou rejetées, résultats de scrutins |
| 14 | `agenda.png` | Agenda | dates à retenir : séances, élections, rendez-vous |

**Ordre conseillé sur le profil** : Politique, Parlement, Gouvernement, Élysée, 2027, Sondages en tête (le cœur du site),
puis Économie, Budget, Justice, Europe, et en fin de rangée Comprendre, Quiz, Résultats, Agenda.
Pour changer l'ordre sur le profil, faites un appui long sur une une puis déplacez-la (selon la version de l'appli) ; sinon, créez-les dans l'ordre du tableau.

Les noms font 12 caractères au plus. Si Instagram en coupe un sous le cercle (« Gouvernement » est le plus long), abrégez-le dans le titre : la couverture, elle, reste complète.

## 2. Mettre les images sur le téléphone

Choisissez la méthode la plus simple pour vous :

1. **Depuis GitHub, sur le téléphone** : ouvrez le dépôt dans le navigateur, dossier `instagram/a-la-une/`, touchez une image, puis appui long sur
   l'image > « Enregistrer dans Photos » (iPhone) ou « Télécharger l'image » (Android). Répétez pour chacune des 14.
2. **Depuis l'ordinateur** : téléchargez le dossier (bouton « Code » > « Download ZIP », ou clonez le dépôt), puis envoyez les 14 PNG sur le
   téléphone par AirDrop, câble, ou en vous les envoyant par e-mail / messagerie en **pièces jointes non compressées** (« taille réelle »).
3. **Via un cloud** (Drive, iCloud, Dropbox) : déposez le dossier `a-la-une`, ouvrez-le sur le téléphone et enregistrez les images dans la photothèque.

Vérifiez qu'elles apparaissent dans la photothèque (Photos / Galerie). Le format est bon : 1080 × 1920, l'appli recadre au centre.

## 3. Créer une une, pas à pas (à faire 14 fois, une fois pour toutes)

Prérequis : les stories à y mettre doivent être **dans les archives** (Instagram les archive automatiquement après 24 h si l'option
« Enregistrer la story dans les archives » est activée : Paramètres > Archives et activité). Les stories publiées automatiquement par le site
y sont donc déjà.

1. Ouvrez l'appli Instagram, onglet **Profil** (votre photo en bas à droite).
2. Sous la bio, touchez le **« + Nouveau »** (cercle avec un plus) dans la rangée des unes.
3. Dans l'écran « Archive de stories », **touchez les stories à y mettre** (voir la règle de classement ci-dessous), puis **Suivant**.
4. Touchez **« Modifier la couverture »**, puis **l'icône photothèque** en bas à gauche, et choisissez l'image de la rubrique (`politique.png`...).
   Ajustez le cadre : le cercle est déjà bien centré, ne zoomez pas. Touchez **Terminé**.
5. Dans « Titre de la story à la une », saisissez le **nom du tableau ci-dessus** (« Politique », « Parlement »...), puis **Ajouter**.
6. Contrôlez sur le profil : le cercle doit montrer le disque rouge, l'icône et le mot, sans coupe.

Pour une une qui n'aura pas encore de story (rubrique vide), créez-la quand la première story de ce type sera publiée :
Instagram refuse une une sans story.

## 4. Règle d'alimentation : à quelle rubrique va chaque type de story

Une story va dans **une seule** une : celle qui correspond à son sujet principal. En cas de doute : **Politique**.

| Si la story est... | ...elle va dans |
|---|---|
| un sondage (« Sondage … · intentions de vote ») | **Sondages** |
| une date à retenir, un post « date » et sa story d'annonce | **Agenda** |
| une loi adoptée ou rejetée (post « loi » et sa story d'annonce), un résultat de vote final | **Résultats** |
| une simulation, une primaire, des candidatures à la présidentielle | **2027** |
| un sujet sur l'Assemblée, le Sénat, un texte de loi, une motion | **Parlement** |
| un sujet sur le gouvernement, les ministres, le remaniement | **Gouvernement** |
| un sujet sur le Président, l'Élysée, le Conseil des ministres | **Élysée** |
| budget de l'État, impôts, dette, retraites, Sécurité sociale | **Budget** |
| emploi, prix, énergie, croissance, entreprises | **Économie** |
| décision de justice, procès, institutions judiciaires (faits seulement) | **Justice** |
| Union européenne, diplomatie, étranger | **Europe** |
| une explication (« comment ça marche », « c'est quoi ») | **Comprendre** |
| un quiz | **Quiz** |
| tout le reste : actualité du jour, dossiers, en direct, en bref, chiffre | **Politique** |

Une story d'actualité suit le **thème de son sujet** (celui de data/actualites.json) : thème « assemblee » ou « senat » : Parlement ;
« gouvernement » : Gouvernement ; « budget » : Budget ; « justice » : Justice ; « election » : 2027 ; « international » : Europe ;
« securite » et « politique » : Politique.

## 5. Chaque semaine : la liste « à ajouter »

Le dimanche soir, le dépôt génère automatiquement deux fichiers (étape de `digest.yml`, script `scripts/suggestions-a-la-une.cjs`) :

- **`docs/a-la-une-semaine.md`** : le résumé à lire. Un tableau « Publiée le / À ajouter à la une / Story ou post » pour les 7 derniers jours,
  puis le nombre de publications par rubrique ;
- **`data/a-la-une-suggestions.json`** : les mêmes données pour un outil (toutes les publications avec leur rubrique recommandée,
  le motif - type, titre ou thème - et un niveau de confiance).

Pour chaque ligne du tableau : ouvrez la une indiquée sur votre profil > **Modifier la une** > onglet **Stories** > cochez la story (dans les archives, à la
date indiquée) > **Terminé**. La colonne « Confiance » indique si la rubrique est sûre ; « faible » = rubrique par défaut (Politique), à
vérifier d'un coup d'œil. Le fichier ne sait pas ce que vous avez déjà ajouté : il liste simplement la semaine écoulée.

## 6. Regénérer ou modifier les couvertures

`node scripts/couvertures-a-la-une.cjs` redessine les 14 PNG et la planche (Playwright et Chromium nécessaires ; voir `scripts/a-la-une-rubriques.cjs`
pour les mots et les icônes). Mêmes couleurs que les stories (`STORY_DA`, `docs/identite.md`). Les couvertures ne portent ni nom de personne ni
formule accusatrice : un symbole et un mot neutre.
