# Identité visuelle et éditoriale d'Hémicycle France

## L'idée
Hémicycle France, c'est **la politique française vue d'en haut, simplement** : un hémicycle dessiné en trois arcs
(bleu, rouge, un point noir), des faits datés, une source à chaque chiffre. Ni militant, ni froid : le ton d'un
ami qui s'y connaît et qui explique sans jargon.

Devise : **« La politique française, preuves à l'appui. »**

## Le logo
- Trois arcs concentriques : bleu République (extérieur), rouge (milieu), point noir (le siège du citoyen).
- Fichier : `icons/logo.svg`. Toujours à côté du nom « Hémicycle France » en serif gras, jamais déformé.
- Zone de protection : la moitié de la hauteur du logo. Taille minimale : 24 px.
- Fond clair : arcs en couleur. Fond sombre : le bleu devient `#A9B8F2`.

## Les couleurs
| Rôle | Nom | Valeur |
|---|---|---|
| Fond | Papier | `#F5F1E8` |
| Texte | Encre | `#1C1B18` |
| Accent principal | Bleu République | `#1B3A8C` |
| Accent d'alerte / « à la une » | Rouge | `#C8102E` |
| Fond sombre | Nuit | `#2A2926` |
Les couleurs des partis et des votes (pour/contre/abstention) sont des **couleurs de données** : elles ne servent
qu'à lire un graphique, jamais à décorer. Aucun dégradé coloré, aucun halo, aucune ombre floue.

## Les lettres
- Titres : **Newsreader** (serif), gras, grand, aligné à gauche.
- Texte et détails : **Public Sans**.
- Étiquettes : capitales espacées, petite taille (« À LA UNE », « EN DIRECT »).
- Chiffres importants : très gros, en serif.

## La signature graphique
- Un **filet tricolore** (bleu, blanc, rouge) tout en haut de chaque page et de chaque story.
- Des **filets épais** en encre pour structurer, comme dans la presse imprimée.
- De grandes marges, une grille nette alignée à gauche, du vide qui respire.
- Les photos sont réelles (libres de droits, créditées), jamais des pictogrammes décoratifs.

## La voix
- On dit « vous » (ou on tourne la phrase pour ne pas avoir à le dire). Phrases courtes, verbes actifs.
- On explique un mot technique la première fois, avec une infobulle.
- On cite la source, on dit « on ne sait pas » quand on ne sait pas.
- Pas d'emoji, pas de point d'exclamation, pas de jugement sur un parti ou une personne.
- Exemples : « Ce que votent les députés, texte après texte. » plutôt que « Plateforme de suivi parlementaire ».

## Les stories Instagram : direction artistique « fond bleu »
Toutes les stories (1080 × 1920) partagent une seule direction artistique, définie dans une constante (`STORY_DA`, `js/stories.js`) :
- **Fond** bleu royal `#1B3A8C` (fond « nuit » `#14161B` pour les sujets EN DIRECT).
- **En haut** (sous la zone masquée par Instagram) : le logo « Hémicycle France » (icône d'hémicycle bleu clair et rose, nom en Public Sans gras blanc).
- **Kicker** en capitales espacées bleu clair `#C5CEF2`, ou **pastille** plate : rouge `#C8102E` à texte blanc (« À LA UNE », « LE CHIFFRE DU JOUR », « FACE À FACE »), blanche à texte bleu (« DOSSIER », « À NOTER »).
- **Titres** en Newsreader gras blanc ; accent **rose** `#F26B8A` (numéros, mois, « VS », filets de frise).
- **Cartes** crème `#F5F1E8` aux angles arrondis (28 px), texte encre ; résultats : vert `#2E6E41` / rouge `#B8261E`.
- **Pied** : une petite phrase de sources en bleu clair, puis une ligne blanche centrée « accroche → @hemicyclefrance » (jamais l'adresse du site).
- Modèles d'actualité : « À la une », « En bref », « Le chiffre », « Dossier », « En direct », « Face à face », « Date à retenir » (`js/stories-actu*.js`). Un titre de presse est toujours cité et attribué ; seuls les titres sont repris.
- **Zones masquées par Instagram** : les ≈ 250 px du haut (barre de profil) et du bas (champ de réponse) ne portent rien d'important. Logo à 292 px, étiquette à 340 px, contenu de 420 à 1490 px, pied de 1510 à 1650 px, ligne « → @compte » à 1636 px.
- **Garde-fous de texte** : les titres réduisent leur taille avant toute coupe ; une coupe « … » ne s'arrête jamais sur un mot faible (de, la, près…) ; un nom ou un chiffre trop long est coupé ou réduit, jamais rogné ; un titre de presse en capitales est remis en minuscules.
- **Libellés** : « À la une » seulement pour un sujet repris par 4 médias au moins ; « En ce moment » (2-3), « Dans la presse » (1). « Face à face » seulement pour un débat, un duel ou une primaire entre deux candidats déclarés.
- **Texte alternatif** : chaque entrée de la file porte un champ `alt` (à coller dans le champ « texte alternatif » en cas de publication manuelle).
- Aperçus : `instagram/modeles/`.

## Où ça s'applique
Le site (en-tête, titres, cartes), les stories et publications Instagram, la photo de profil et les couvertures
« À la une », l'image de partage (`icons/partage.jpg`), le favicon et la page 404.
