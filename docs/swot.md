# SWOT du site Hémicycle France, page par page

Base : contenu et données du site au 2 octobre 2026. Les points marqués (?) sont des hypothèses non vérifiées.

## Vue d'ensemble
- **Forces** : données officielles mises à jour chaque heure, sans serveur ni coût ; ton neutre, sources citées partout ; large couverture (569 députés, 348 sénateurs, plus de 8 400 scrutins) ; stories partageables ; site rapide (une seule page statique).
- **Faiblesses** : un seul fichier de plus de 400 Ko (maintenance et chargement) ; dépendance à des sources externes qui peuvent changer de format ; aucune audience mesurée (statistiques GitHub pas confirmées) ; plusieurs scripts jamais testés sur leur vraie source (lobbying, âge et profession) ; pas de compte ni d'alertes.
- **Opportunités** : présidentielle 2027 (sondages, probabilités, décompte) ; Instagram comme relais (compte créé, encore vide) ; stories d'actualité à fort potentiel de partage ; archives hebdomadaires qui deviennent une série historique unique.
- **Menaces** : concurrents établis (NosDéputés, Datan, Vie-publique) ; réserve électorale et règles sur les sondages ; changement ou fermeture d'une source ouverte ; droit à l'image et licences des portraits ; accusation de partialité malgré la neutralité.

## Accueil
- **F** : « En bref » (5 faits du jour), compte à rebours, sujets du moment, accès direct à tout.
- **f** : beaucoup d'informations ; l'ordre ne s'adapte pas au visiteur.
- **O** : en faire la porte d'entrée partagée (une story du jour).
- **M** : surcharge, abandon dès la première seconde sur mobile.

## Votes (scrutins, 8 400+)
- **F** : couverture quasi exhaustive, recherche et filtres, position de chaque groupe, lien vers le scrutin officiel.
- **f** : titres officiels difficiles pour le grand public ; pas de résumé en langage clair.
- **O** : résumés neutres générés à partir du texte officiel ; « vote du jour ».
- **M** : un vote isolé peut être mal interprété ; un jour, trop de bruit.

## Groupes (historique des votes)
- **F** : proximité entre groupes, cohésion, comparateur de deux groupes, « groupes en chiffres ».
- **f** : pourcentages abstraits sans exemple ; exclusion des non-inscrits.
- **O** : « qui vote comme qui » en story ; suivi dans le temps via les archives.
- **M** : chiffres contestés si la méthode n'est pas lue.

## Députés
- **F** : 569 fiches avec photo, votes, parcours, activité ; classements ; comparaison.
- **f** : âge et profession pas encore remplis (attente de la collecte) ; pas d'interventions en séance.
- **O** : recherche par commune ou circonscription ; fiche partageable.
- **M** : NosDéputés et Datan sont plus anciens et plus riches sur ce point.

## Sénat
- **F** : hémicycle de 348 sièges, vote par texte, groupes.
- **f** : aucune donnée d'activité par sénateur ; moins d'illustrations que l'Assemblée.
- **O** : audience peu servie par les concurrents.
- **M** : source du Sénat moins stable (?).

## Partis, dirigeants et Gouvernement
- **F** : chefs de parti à jour depuis Wikipédia, logos, photos libres, composition du Gouvernement.
- **f** : certains portraits manquent (pas de licence libre, par exemple Bardella) ; dépend de Wikipédia.
- **O** : liens directs vers le détail des votes de chaque parti.
- **M** : vandalisme ou erreur sur Wikipédia reprise telle quelle.

## Économie (chiffres clés)
- **F** : indicateurs Insee clairs, jauges déficit et dette, sources citées.
- **f** : peu d'indicateurs ; pas d'historique long.
- **O** : comparaison avec le budget voté ; stories chiffre clé.
- **M** : séries révisées après publication.

## Actualités
- **F** : sujets regroupés depuis des médias fiables, mise à jour toutes les heures, sources et dates, illustrations libres.
- **f** : regroupement automatique par similarité de titres (erreurs possibles) ; images limitées aux portraits et logos libres ; pas de texte d'article (voulu).
- **O** : page qui génère le plus de retours et de partages.
- **M** : changement de flux RSS d'un média ; sujet sensible (affaires judiciaires) à traiter avec prudence.

## Agenda et meetings
- **F** : 8 événements saisis à la main avec source.
- **f** : saisie manuelle, donc rapidement périmée ; très peu de volume.
- **O** : alimenter automatiquement depuis les sites des partis (?).
- **M** : données périmées qui donnent une image négative ; le contrôle quotidien aide mais ne remplit pas.

## Justice
- **F** : décisions de justice sourcées avec leur statut (7), portraits quand ils existent.
- **f** : très peu de cas ; saisie manuelle ; risque juridique élevé sur des personnes nommées.
- **O** : page de référence si elle reste rigoureuse.
- **M** : plainte en diffamation ; actualité qui change (appel, relaxe) non répercutée à temps.

## Sondages (premier et second tour)
- **F** : tous les instituts, second tour, probabilités simulées, masquage pendant la réserve électorale, méthode affichée.
- **f** : pas de moyenne maison (choix assumé) ; les probabilités sont un modèle simple.
- **O** : page centrale pour la présidentielle ; archives hebdomadaires pour tracer les courbes.
- **M** : interprétation des probabilités comme prévisions ; contentieux sur la réserve.

## Candidats
- **F** : 23 candidats déclarés, date et source de candidature.
- **f** : pas de programme comparé (aucune source neutre intégrée) ; Bardella sans photo.
- **O** : comparateur de programmes thématique, si des sources officielles sont fournies.
- **M** : accusation de déséquilibre entre candidats.

## Quiz
- **F** : 12 questions en langage courant, reliées à de vrais scrutins, résultat par groupe.
- **f** : peu de questions ; pas de contexte ni d'arguments (volontairement).
- **O** : outil viral pour les jeunes ; défi entre amis ; story de résultat.
- **M** : résultat perçu comme une consigne de vote.

## Archives
- **F** : instantané hebdomadaire sur 52 semaines, graphique d'évolution.
- **f** : un seul instantané pour l'instant ; courbes vides tant qu'il n'y a qu'un point.
- **O** : donnée historique que les concurrents ne gardent pas.
- **M** : volume de fichiers qui grossit dans le dépôt.

## Stories (Instagram 1080 × 1920)
Audit du 5 octobre 2026 : chaque modèle rendu avec Playwright sur des données réelles du dépôt et sur des cas limites (titre de 220 caractères, chiffre de 13 chiffres, nom de 70 caractères, média au nom très long, 12 médias, 0 média, portrait absent, TITRE EN CAPITALES, guillemets et accents, sujet sans titre rédigé, dossier à 120 articles, dossier à reprises identiques), puis relus image par image avec les zones masquées par Instagram (≈ 250 px en haut et en bas) en surimpression. Chaque ligne : **corrigé** / **à faire par le propriétaire** / **accepté**. Les rendus corrigés sont dans `instagram/modeles/`.

**Forces**
- Une direction artistique unique (`STORY_DA`) : tout modèle se reconnaît d'un coup d'œil. *Accepté (c'est le but).*
- Titres de presse toujours cités avec leur média ; seuls les titres sont repris ; aucun titre de presse en grand si le site n'a pas son propre titre. *Accepté.*
- Heures calculées (jamais codées en dur) : « 7 h 31 » est l'heure de l'article, au fuseau de Paris. *Vérifié : rien à corriger.*
- Sélection très prudente (liste de mots exclus, thème justice, réserve électorale, nuit, plafonds, seuils 5 médias / dossier 6 / 2 par jour dans `data/stories-config.json`). *Accepté.*
- Publication à 60 min d'écart, jamais deux fois la même story, jeton masqué dans les journaux. *Accepté.*

**Faiblesses**
- Logo à cheval sur la barre de profil Instagram (haut de l'image masqué sur ≈ 250 px) : **corrigé** (logo, étiquette et contenu descendus de 28 px ; `STORY_DA.logoY/etiquetteY/haut`).
- Ligne « accroche → @hemicyclefrance » posée à 1680-1700 px, sous le champ de réponse : **corrigé** (1636 px, y compris pour la story « sondages »).
- Citation coupée sur un mot faible (« … d'une annulation de la… », « … écoulé près… ») : **corrigé** (`storyLignes` retire les mots faibles et la ponctuation en fin de coupe ; titres longs d'abord réduits jusqu'à 9 lignes avant toute coupe).
- Nom très long débordant de l'image (portraits, face à face) ou se chevauchant : **corrigé** (coupe après un trait d'union, puis au caractère avec « … »).
- Chiffre très long (13 chiffres) sorti de l'image : **corrigé** (la taille descend jusqu'à 44 px).
- Pastille de média trop étroite pour un nom long (texte qui dépasse) et, après coupe, dépassant la marge : **corrigé** (police fixée à la mesure, « … » compté).
- Média absent : « — » seul et « TITRE PUBLIÉ PAR » vide : **corrigé** (pas de story sans média cité).
- Titre de presse tout en capitales en géant (« L'ÉTAT DOIT TOUT CHANGER… ») : **corrigé** (remis en minuscules, sigles et noms propres usuels conservés).
- Préfixes de rubrique et « DIRECT. » conservés dans les citations des modèles « en direct », « une » et « dossier » : **corrigé**.
- Apostrophes droites mêlées aux apostrophes typographiques : **corrigé**.
- Heures « 00 h 43 » : **corrigé** (« 0 h 43 »).
- Dossier qui répète trois fois le même titre de dépêche : **corrigé** (titres distincts seulement ; moins de 3 titres distincts : pas de dossier en publication automatique).
- Mots de reproche ou de polémique visant une personne nommée (« propos inélégants », « polémique », « fustige », « dérapage », « s'excuse », « attaque »…) absents de la liste d'exclusion : **corrigé** (ajoutés à `MOTS_EXCLUS`) ; le publieur applique aussi la liste à la sortie de file, pour une entrée plus ancienne que le durcissement.
- Portrait manquant (Glucksmann, Faure, Hollande, Attal…) : initiales sur fond de couleur. **À faire par le propriétaire** : fournir ou autoriser des photos libres (`docs/portraits-a-completer.md`). L'image reste correcte.
- Étiquette grise « PARTI ANIMALISTE » (texte blanc sur gris, contraste ≈ 2,3:1) dans la story candidat : **à faire par le propriétaire** (choisir une couleur de parti plus foncée dans les données) ; non bloquant.
- Aucun lien cliquable : l'API des stories ne permet pas d'autocollant lien. **Accepté** ; le renvoi se fait par « → @hemicyclefrance » et le lien de la bio.

**Opportunités**
- Texte alternatif et fiche de publication : **corrigé** (champ `alt` dans chaque entrée de `data/instagram-file.json`, brouillon et flux Atom ; à coller dans le champ « texte alternatif » si la story est publiée à la main).
- Série de rendez-vous réguliers (« En bref » du matin, « À noter » avant une échéance) pour fidéliser. **À faire par le propriétaire** : décider si l'« En bref » (actuellement `enBref: false`) est réactivé quand le compte aura une audience.
- Réutiliser les stories comme publications de fil (carrousel) : **à faire par le propriétaire** (choix éditorial).

**Menaces**
- Libellé « À la une » pour un sujet faible : **corrigé** (« À la une » seulement à partir de 4 médias ; « En ce moment » pour 2-3 ; « Dans la presse » pour 1) ; titre de repli « Rubrique · en ce moment » ; « Énergie » ou toute rubrique seule n'est plus un titre de story.
- « Face à face » affirmait une opposition entre deux candidats simplement cités ensemble : **corrigé** (il faut un débat, un duel ou une primaire dans les titres, et aucun mot de conflit).
- Répétitivité (« Primaire de la gauche » en deux stories, « Blocage » puis « Blocus » des lycées) : **corrigé** (un sujet proche d'une story des dernières 24 h est refusé à la sélection, dans l'« En bref » et à la publication).
- Sondage pendant la réserve électorale : déjà bloqué (sélection, file, publieur, contexte des modèles, dossier). **Accepté**, tests existants.
- Reprise de titres de presse (droit d'auteur, droit des personnes) : titres courts, attribués, jamais d'accusation ; risque résiduel faible mais non nul. **À faire par le propriétaire** : relire les premières stories avant d'activer la publication sans validation (`validationHumaine`).
- Fiabilité technique : les stories dépendent du rendu du site dans Chromium et d'un jeton Instagram à renouveler ; alertes déjà en place dans le résumé du workflow. **Accepté.**
- Effet sur l'audience : peu de stories (2 par jour au plus) et sélectives, donc peu de bruit ; le risque est plutôt un compte trop silencieux. **Accepté.**

## Méthode et mentions
- **F** : transparence (sources, limites, neutralité), dates réelles lues dans les fichiers, crédits des photos.
- **f** : peu visitées ; texte dense.
- **O** : argument de confiance à mettre en avant dans les partages.
- **M** : toute erreur de crédit ou de licence se voit tout de suite.

## Priorités suggérées
1. Confirmer que les statistiques GitHub fonctionnent (`TRAFIC_TOKEN`) pour mesurer l'audience.
2. Vérifier à la prochaine collecte que âge, profession et lobbying se remplissent.
3. Publier des stories sur Instagram pour lancer le compte.
4. Renforcer la page Justice (rigueur juridique) ou la limiter.
5. Ajouter des sources fiables pour comparer les programmes.
