# Portraits : fonctionnement et mode d'emploi

Toute personne affichée sur le site (parlementaires, Gouvernement, présidents, chefs de parti, candidats, personnes citées dans les
sujets d'actualité et dans la page Justice) a un visuel : une photo sous licence libre, ou à défaut un médaillon d'initiales aux
couleurs de son parti. Tout est automatique : `scripts/fetch-portraits.js` (en CI, `update-data.yml`) suit la chaîne de
`scripts/portraits-chaine.js` et ne demande aucune saisie.

1. Photo officielle open data : Assemblée nationale (députés, ministres ayant une fiche), Sénat (sénateurs).
2. Wikidata (image P18, après contrôle « humain à profession politique » : les homonymes sont écartés), puis image principale de
   l'article Wikipédia FR/EN. Licence vérifiée sur Commons (CC0, CC BY, CC BY-SA, domaine public ; NC, ND, non libre et fair use refusés).
3. Catégorie Commons de la personne, seulement si elle est rattachée au même élément Wikidata.
4. Dernier recours : médaillon d'initiales (`placeholder: true` dans `data/portraits.json`, SVG dans `photos/personnalites/medaillons/`).
   Jamais de photo d'agence ou de média sans licence.

Les portraits de gouvernement.fr et de l'Élysée ne sont repris que s'ils sont sur Commons (leur licence n'est pas lisible par machine ailleurs).

Reprises : une personne en médaillon est retentée au plus une fois par jour ; après un HTTP 429 ou une panne, elle est reprise au passage
suivant. Une bonne photo n'est jamais écrasée par un échec. Qualité : largeur d'au moins 400 px et format portrait préférés ; une image
libre plus petite n'est retenue qu'à défaut, avec `basseDefinition: true`. Le recadrage sur le visage est fait à l'affichage
(`object-position`).

## Suivre la couverture
- `data/portraits-couverture.json` : nombre de personnes, avec photo, médaillons, liste des manquants, date.
- Une ligne de résumé est ajoutée au résumé de l'exécution GitHub, et `check-data.js` signale les médaillons restants par un
  avertissement non bloquant. Une photo sans licence, auteur ou source est une erreur bloquante.

## Forcer un fichier
Ajouter `"Nom": "Fichier.jpg"` dans `data/portraits-choix.json` (nom exact vu sur Commons, sans `File:`). La licence est revérifiée
par l'API ; un fichier non libre est refusé et la chaîne continue.
