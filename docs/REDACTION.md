# Rédaction : le style presse quotidienne

Les textes écrits par le code (titres, chapeaux, légendes, textes alternatifs) suivent les usages de la presse quotidienne française. Règles issues de la pratique courante des quotidiens (Le Parisien, Le Monde, Ouest-France…), sans copie de leurs titres.

## Titres
- Courts (70 caractères au plus), un fait, un verbe d'action au présent : « Le Sénat adopte le texte ».
- Pas de point final. Chiffres en chiffres (« 3 médias », « 12 voix »). Pas de point d'exclamation, pas de superlatif.
- Guillemets français « … » pour citer, toujours avec l'auteur ou le média. Jamais de titre de presse recopié sans guillemets et sans attribution.
- Pas de tiret long ni de formule figée ; majuscule seulement au début et aux noms propres.

## Rubriques
Un mot de classement en tête, sans verbe : Politique, Assemblée nationale, Sénat, Gouvernement, Sondage, Justice, Budget, Élysée 2027, International, Sécurité, Agenda, Chiffres, Décryptage, Parlement.
Code : `scripts/rubriques.cjs`, `rubriqueDe(x)`. Champ `rubrique` des sujets (`enrichirSujet`), des fiches (`spec.rubrique`) et des entrées de file (`champs.rubrique`), à lire par le dessin.

## Chapeau
Une à deux phrases : d'abord le fait (qui, quoi, quand), puis le contexte (étape, enjeu, nombre de médias). Ton factuel et vivant, jamais racoleur ni opinionné. Une opinion n'apparaît qu'entière, entre guillemets, avec son auteur.

## Légendes Instagram
Première ligne façon titre avec rubrique (« Agenda : rendez-vous le 12 mars »), puis 2 à 4 phrases courtes, la source, une invitation discrète à enregistrer, le compte, 3 à 5 hashtags variés de sujet (jamais un nom de personne ou de parti). Formulations tournantes selon la graine du contenu.

## Garde-fous (inchangés)
Message complet, jamais tronqué. Médias cités, sources, marge d'erreur des sondages, réserve électorale. Présomption d'innocence : liste prudente, 3 médias pour une personne nommée, jamais de portrait. Aucun nom d'IA ou d'outil.
