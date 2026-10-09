# Vignettes d'institutions des actualités

Dans la page Actualités, la vignette carrée à gauche d'un sujet est, quand c'est possible, une **photo libre de l'institution** que
concerne le sujet (Palais Bourbon, palais du Luxembourg, Élysée, Matignon, palais de justice, Bercy…), à la place du pictogramme.
Les sujets qui ont un portrait de personne ou un logo de parti ne changent pas. Sans photo pour un thème, le pictogramme reste.

## Règles de prudence
- Uniquement des **bâtiments d'institutions**. Jamais de photo de presse, jamais de photo de personne.
- **Justice** : tribunal neutre (palais de justice de Paris) seulement si aucune personne n'est nommée dans le sujet ; sinon pictogramme
  (`scripts/vignettes-cle.js`, testé dans `tests/vignettes.test.mjs`).
- **Sécurité** : bâtiment du ministère seulement hors événement grave (attentat, mort, violences, victimes…) ; sinon pictogramme.
- « Vie politique » sans institution identifiable : pictogramme.

## Du sujet à la photo
1. `scripts/illustrations.js` ajoute `illustration.vignette` (clé d'institution ou `null`) à chaque sujet de `data/actualites.json`.
2. `scripts/fetch-vignettes.js` (étape `vignettes` de `update-data.yml`, `continue-on-error`) trouve une photo par clé dans `photos/vignettes/<clé>.jpg`
   et la crédite dans `data/vignettes.json`.
3. `index.html` affiche la photo (`loading="lazy"`, texte alternatif neutre « Photo d'illustration : … », crédit au survol) ; le bloc
   « Illustrations des sujets d'actualité » des Mentions légales liste auteurs et licences.

| Clé | Institution | Candidats Commons (dans l'ordre) |
|---|---|---|
| `assemblee` | Palais Bourbon | Category:Palais Bourbon… |
| `senat` | Palais du Luxembourg | Category:Palais du Luxembourg… |
| `elysee` | Palais de l'Élysée (sujets citant l'Élysée, le chef de l'État) | Category:Palais de l'Élysée… |
| `gouvernement` | Hôtel de Matignon | Category:Hôtel de Matignon… |
| `budget` | Bercy | Category:Ministère de l'Économie et des Finances (Bercy)… |
| `justice` | Palais de justice de Paris | Category:Palais de justice de Paris… |
| `region` | Hôtel de région | Category:Hôtels de région en France… |
| `education` | Ministère de l'Éducation nationale | Category:Hôtel de Rochechouart (Paris)… |
| `securite` | Hôtel de Beauvau | Category:Hôtel de Beauvau… |
| `international` | Quai d'Orsay | Category:Quai d'Orsay… |
| `election` | Bureau de vote | Category:Ballot boxes of France… |

La table complète est `CANDIDATS` dans `scripts/fetch-vignettes.js` (catégories `Category:…` ou fichiers `File:…`, texte alternatif, nom du lieu).

## Choix du fichier et licence
Pour chaque catégorie, tous les fichiers sont évalués : licence libre vérifiée par l'API `extmetadata` de Commons (CC0, CC BY, CC BY-SA, domaine
public ; NC, ND, non libre, fair use et panorama sans liberté refusés), JPEG/PNG/WebP/TIFF, au moins 640 px de large et 480 px de haut, ratio
entre 0,8 et 2,2, nom et catégories sans personnes, foule, manifestation, plan ni intérieur. Note : format proche du 4:3 ou carré, définition,
récence, nom évocateur d'une façade. Le meilleur est téléchargé (miniature Commons de 640 px), recadré au centre en **320 × 320 px**, JPEG de
**40 Ko au plus** (ffmpeg, qualité ajustée).

## Version haute définition (fond de story)
Le carré de 320 px est flou en 1080 × 1920. Pour le même fichier (même licence, même crédit), le script produit aussi
`photos/vignettes/<clé>-hd.jpg` : photo **entière** (pas de recadrage), de **1080 px au moins et 1600 px au plus de large**, jamais agrandie (miniature
Commons demandée à `min(1600, largeur de la source)`), JPEG de **220 Ko au plus** (ffmpeg, qualité ajustée). `data/vignettes.json` reçoit `chemin_hd`,
`largeur_hd` et `octets_hd` ; le champ `chemin` (carré 320, utilisé par le site) ne change pas. Une source de moins de 1080 px n'a pas de HD
(`hd_indisponible: true`). Les anciennes entrées sans `chemin_hd` restent valides : au passage suivant le script les complète (licence revérifiée sur
Commons ; un échec HD n'est retenté qu'une fois par jour, `hd_essai`) sans toucher à la photo carrée. `check-vignettes.js` accepte les deux cas et, si la
HD existe, vérifie qu'elle est désignée par `chemin_hd`, qu'elle pèse 220 Ko au plus et que le fichier est bien là.

## Candidats : catégories, sous-catégories, recherche
Une catégorie Commons ne liste que ses fichiers DIRECTS : le palais du Luxembourg, par exemple, a ses photos dans des sous-catégories (0 fichier examiné
au premier passage). Si une catégorie ne donne rien d'exploitable, le script explore donc ses sous-catégories (deux niveaux, 10 appels au plus ; intérieurs,
jardins, personnes, plans, œuvres exclus : `SOUS_CAT_EXCLUES`). Un candidat `Search:…` lance une recherche plein texte dans l'espace Fichier ; le nom du
fichier doit alors citer le lieu (motif `exige` de la clé), puis la licence et les autres contrôles s'appliquent comme pour une catégorie.

## Reprises et garde-fous
- Une vignette acquise n'est ni retéléchargée ni écrasée.
- Un thème en échec définitif (aucun fichier libre exploitable) n'est retenté qu'une fois par jour (`echecs` dans `data/vignettes.json`) ; la
  première exécution qui échoue lève l'alerte du résumé de l'exécution.
- HTTP 429 ou panne passagère : reprise au passage suivant, arrêt du passage après deux refus d'affilée, pas d'alerte.
- `check-data.js` (`scripts/check-vignettes.js`) : **bloquant** si une photo n'a pas sa licence, son auteur, son lien Commons ou son texte
  alternatif dans `data/vignettes.json` ; **avertissement** si un thème n'a pas de vignette.

## Corriger un choix
Une photo jugée mauvaise : supprimer son fichier de `photos/vignettes/` et l'entrée de `data/vignettes.json`, puis réordonner ou compléter les
candidats de la clé dans `CANDIDATS` (un `File:Nom.jpg` précis en tête de liste impose le fichier ; sa licence est revérifiée).
Essais : `node tests/vignettes.test.mjs` (fixtures, sans réseau).
