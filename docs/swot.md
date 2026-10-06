# SWOT du site Hémicycle France, page par page

Base : audit du 5 octobre 2026 (Playwright, bureau 1300 px et mobile 390 px, 19 pages ; console, réseau, contraste, titres, panne de sources, SEO, i18n). Section « Site » ajoutée le 5 octobre ; les sections par page datent du 2 octobre, mises à jour là où l'audit les contredit. Les points marqués (?) sont des hypothèses non vérifiées.

## Vue d'ensemble
- **Forces** : données officielles mises à jour toutes les 15 minutes, sans serveur ni coût ; ton neutre, sources citées partout ; large couverture (569 députés, 348 sénateurs, plus de 8 400 scrutins) ; stories partageables ; site rapide (une seule page statique).
- **Faiblesses** : un seul fichier de 590 Ko (maintenance et chargement) ; dépendance à des sources externes qui peuvent changer de format ; aucune audience mesurée (statistiques GitHub pas confirmées) ; plusieurs scripts jamais testés sur leur vraie source (lobbying, âge et profession) ; pas de compte ni d'alertes.
- **Opportunités** : présidentielle 2027 (sondages, probabilités, décompte) ; Instagram comme relais (compte créé, encore vide) ; stories d'actualité à fort potentiel de partage ; archives hebdomadaires qui deviennent une série historique unique.
- **Menaces** : concurrents établis (NosDéputés, Datan, Vie-publique) ; réserve électorale et règles sur les sondages ; changement ou fermeture d'une source ouverte ; droit à l'image et licences des portraits ; accusation de partialité malgré la neutralité.

## Site (audit du 5 octobre 2026)
**Forces** : aucune erreur JavaScript sur les 19 pages (bureau et mobile) ; aucun débordement horizontal à 390 px ; un seul h1 par page, titres de page et partage (title, description, Open Graph, canonical, sitemap) en place ; CSP stricte sans service tiers ; thèmes clair et sombre ; labels, alt et noms de boutons corrects partout ; focus visible défini ; traductions à 100 % (1 405 chaînes, 4 langues) ; si une source tombe, chaque rubrique affiche un message (« Réessayez un peu plus tard ») au lieu de planter.
**Faiblesses** : voir le tableau (la plupart corrigées).
**Opportunités** : bannière d'état des données réutilisable pour d'autres sources ; page Méthode déjà prête à accueillir un état de fraîcheur public.
**Menaces** : un seul fichier index.html (590 Ko) et lois.json (5,4 Mo, chargé en worker) : lourd sur réseau lent et en cas de panne de la source ; mentions légales qui divergent du fonctionnement réel (risque de crédibilité).

| Constat | Statut |
|---|---|
| Mentions, bandeaux et textes disaient « toutes les heures » ou « chaque matin » alors que la mise à jour tourne toutes les 15 minutes (Votes, Députés, Sénat, Candidats, Sondages, Agenda, mentions, README) | **corrigé** |
| Mentions légales ne disaient rien de la publication des stories sur Instagram | **corrigé** (nouvelle section, date de mise à jour changée ; l'identité de l'éditeur n'est pas modifiée) |
| Si data/lois.json est injoignable, le site affichait en silence un seul vote ancien (« Motion de censure », quiz « 0 questions ») sans le dire | **corrigé** (bandeau d'alerte clair en haut de page) |
| Initiales des médaillons (candidats, partis, actualités) et pourcentages des duels de second tour illisibles sur fond clair ou jaune (contraste 1,96 à 3,4) | **corrigé** (texte noir ou blanc selon le fond) |
| Libellés des pictogrammes d'actualité (Budget, Sénat) trop pâles en mode sombre (1,6 à 2,7) | **corrigé** |
| Titres sautant de h2 à h4 (Actualités, Groupes) | **corrigé** (h3) |
| Pas de lien d'évitement au clavier (« Aller au contenu ») | **corrigé** |
| Chaque visite déclenche une requête 404 vers data/compte-config.json (comptes inactifs), visible dans la console | **accepté** (comportement voulu tant que les comptes ne sont pas activés ; ne gêne pas l'affichage) |
| Pas de publication Instagram tant que les secrets Meta ne sont pas créés ; compte à lancer | **à faire par le propriétaire** |
| Mentions légales : l'éditeur reste anonyme (LCEN art. 6 III 2) ; les coordonnées d'hébergeur doivent rester exactes ; ajouter l'adresse de contact réelle si souhaité | **à faire par le propriétaire** |
| Page d'accueil et index.html de 590 Ko, lois.json de 5,4 Mo | **accepté** (déjà chargé par morceaux et en worker ; découpage = chantier lourd) |
| Sondage YouGov déposé mais absent de la liste Wikipédia (signalé par le contrôle de fraîcheur) | **à faire par le propriétaire** (attendre Wikipédia ou saisir à la main) |
| Agenda, Justice et questions du quiz saisis à la main, vite périmés | **à faire par le propriétaire** |
| Audience non mesurée (statistiques GitHub à confirmer) | **à faire par le propriétaire** |

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
- **F** : sujets regroupés depuis des médias fiables, mise à jour toutes les 15 minutes, sources et dates, illustrations libres.
- **f** : regroupement automatique par similarité de titres (erreurs possibles) ; images limitées aux portraits et logos libres ; pas de texte d'article (voulu).
- **O** : page qui génère le plus de retours et de partages.
- **M** : changement de flux RSS d'un média ; sujet sensible (affaires judiciaires) à traiter avec prudence.

## Agenda et meetings
- **F** : événements sourcés ; relevé automatique (Wikipédia, agenda de l'Assemblée) sans écraser la saisie manuelle.
- **f** : les meetings de partis restent saisis à la main ; titres d'articles Wikipédia à valider ; pas de calendrier du Sénat lisible par machine.
- **O** : brancher une source stable pour l'agenda du Sénat.
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
- **F** : 24 candidats déclarés, date et source de candidature.
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

## Chaîne automatique (collecte, mise à jour, publication, santé)
Examen du 5 octobre 2026 : update-data (7, 22, 37, 52 min) et actualités (2, 17, 32, 47 min), plus publier-stories (toutes les heures), sante (lundi), stats (nuit), ci. Statut : **corrigé** / **à faire par le propriétaire** / **accepté**.

- **Forces** : écriture refusée si une source se dégrade (garde.js) ; chaque source est isolée (`continue-on-error` + alerte dans le résumé) ; aucun ticket ni e-mail ; secrets absents gérés proprement (publier-stories, stats) ; concurrence `update-data` partagée (jamais deux écritures en parallèle) ; User-Agent explicite ; contrôle de cohérence avant tout commit.
- **Faiblesses** : un commit « horodatage seul » à chaque passage, trois archives de l'Assemblée retéléchargées à chaque quart d'heure, un contrôle secondaire (file des stories) qui bloquait toute la publication (lignes ci-dessous).
- **Opportunités** : cache conditionnel (ETag) pour les grosses archives ; battement quotidien lisible par check-fraicheur ; relevés d'actualités à la demande.
- **Menaces** : blocage d'une source publique (403/429) si la charge augmente ; quota de minutes Actions si le dépôt devient privé ; historique git qui grossit.

| # | Constat | Statut |
|---|---------|--------|
| 1 | **Panne du 5 octobre** : l'image d'une story est supprimée à 3 jours (stories-auto) mais check-data l'exigeait jusqu'à 4 jours ; « image absente » faisait échouer « Actualités » avant le commit : plus aucune donnée publiée depuis 08 h 21 UTC. | **Corrigé** : exigence ramenée à 2 jours ; file des stories et traductions = contrôles *secondaires* (alerte dans le résumé, publication maintenue ; `--strict` en CI et en santé) ; stories-auto retire de la file toute entrée récente sans image JPEG valide (avec alerte) et n'ajoute jamais une entrée dont l'image n'est pas relisible. |
| 2 | Un commit toutes les 15 min pour un simple `lastUpdated` (navette, agenda, commissions, gouvernement, budget, veille, direct, probabilités) : historique gonflé, déploiements Pages inutiles. | **Corrigé** : `ecrireSiChange` / `ecrireGarde` n'écrivent plus si seul l'horodatage change ; battement de 24 h (6 h pour direct.json) ; probabilités calculées au jour entier. |
| 3 | Échec du push après 3 essais silencieux (le job restait vert) ; logique copiée dans 3 workflows. | **Corrigé** : `scripts/commit-push.sh` (4 essais, échec visible + ligne dans le résumé) ; `fetch-depth: 50`. |
| 4 | Aucun délai, nouvelle tentative ni User-Agent homogène sur ~20 appels aux sources. | **Corrigé** : `scripts/http.js` (`fetchPoli` : 30 s, 3 tentatives, Retry-After respecté, pas de nouvelle tentative sur 403/404, User-Agent). Appels séquentiels conservés (pas de rafale). |
| 5 | Archives Scrutins/Organes/Dossiers (AMO30 historique), agenda et répertoire HATVP retéléchargés à chaque passage. | **Corrigé** : `sonder()` (HEAD conditionnel ETag/Last-Modified, mémoire `.cache/http` via actions/cache) ; passage complet forcé au moins toutes les 6 h ; au moindre doute, comportement inchangé. Aucune fréquence d'appel n'augmente. |
| 6 | `workflow_run` doublait les relevés de flux RSS (≈ 8 par heure au lieu de 4) et se déclenchait aussi après un échec. | **Corrigé** : relevé non redemandé s'il date de moins de 10 min ; `workflow_run` seulement si le workflow amont a réussi. |
| 7 | Aucun `timeout-minutes`. | **Corrigé** : 30 min (update-data), 15 (actualités), 20 (ci), 10 (autres) ; `concurrency` sur ci. |
| 8 | Étapes `continue-on-error` sans alerte (bandeau direct, story, photos HD) ; Actualités sans résumé d'échec ; flux illisible seulement dans le journal. | **Corrigé** : alertes ajoutées dans le résumé. |
| 9 | Données périmées : aucune alerte quand un relevé automatique ne bouge plus. | **Corrigé** : check-fraicheur compare `lastUpdated` à une limite par fichier (actualités 24 h, direct 12 h, autres 72 h). Le bandeau du site (index.html, non modifié) affiche la date du dernier *changement* de données, pas du dernier passage : **accepté**. |
| 10 | Détecteurs manquants : JSON invalide, fichier vide ou énorme, `lastUpdated` futur. | **Corrigé** : `controles-json.js` appliqué à tout `data/*.json` (limite 12 Mo ; lois.json fait 5,4 Mo). |
| 11 | Tests : fetch-budget et deputes-fixture n'étaient pas lancés par ci.yml. | **Corrigé** : `tests/lancer-tous.mjs` lance tous les tests ; nouveau `tests/http.test.mjs`. |
| 12 | Garde-fou : chute de 30 % (50 % pour les actualités), pas 60 %. | **Accepté** : plus strict, adapté aux fichiers stables. |
| 13 | Actions épinglées par version majeure, pas par empreinte de commit. | **Accepté** (actions officielles) ; épinglage par SHA possible via Dependabot. |
| 14 | GitHub retarde les tâches programmées : rythme réel inférieur à 4 par heure. | **Accepté** : battement et alertes de fraîcheur le rendent visible. |
| 15 | Historique git : images `instagram/auto`, photos HD, `data/*.json` s'accumulent (~100 Mo) ; les images de stories supprimées restent dans l'historique. | **À faire par le propriétaire** : surveiller ; au besoin réécrire l'historique ou sortir les images. Aucune donnée supprimée ici. |
| 16 | Coût : environ 45 min d'Actions par heure (gratuit si dépôt public ; limite de 2 000 min par mois si privé) ; chaque commit relance Pages. | **À faire par le propriétaire** : vérifier le plan et Réglages > Pages (source = main). |
| 17 | Secrets absents : `IG_USER_ID`, `IG_ACCESS_TOKEN` (publication Instagram), `TRAFIC_TOKEN` (statistiques) ; les workflows sortent proprement. | **À faire par le propriétaire** si voulus (docs/PUBLICATION-AUTO.md). |
| 18 | Flux RSS sans cache conditionnel (contenu changeant, flux légers) ; 403/429 : signalés dans le résumé, ancien fichier conservé. | **Accepté** |
