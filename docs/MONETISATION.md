# Monétisation : conditions, checklist, plan, licences

Statut : **document de préparation. Rien n'est encore monétisé.** Les mentions légales publiques de `index.html` (« particulier, à titre non professionnel », « aucune publicité ») restent vraies tant qu'aucun revenu n'existe et ne sont pas modifiées. Le texte de remplacement est prêt plus bas (section 5), à activer le jour du premier euro.

Ce document ne contient aucune identité d'éditeur ni numéro SIRET : ils sont à fournir par le propriétaire (`[À COMPLÉTER]`). Ce n'est pas un avis juridique ou comptable ; les points « à vérifier » doivent l'être par un professionnel.

## 1. Conclusion de l'examen contradictoire (avocat, procureur, comptable, juge)

Oui, **sous cinq conditions**, toutes reprises dans le code ou dans cette checklist :

| # | Condition | Où c'est tenu |
|---|-----------|---------------|
| 1 | Plus aucun titre de presse dans les stories monétisées ; seulement des données propres (votes, sondages hors réserve, budget Eurostat, quiz et lois, présidents) | `data/stories-config.json` : `monetisation: true` dans `scripts/stories-auto.cjs` (ni dossier ni sujet de presse ; entrées de presse retirées de la file) |
| 2 | Validation humaine avant toute publication qui nomme une personne | `validationHumaine: true`, ou automatiquement en monétisation pour un sondage ou une simulation (candidats nommés) : brouillon dans `instagram/brouillons/` + ligne dans `$GITHUB_STEP_SUMMARY`, jamais la file de publication |
| 3 | Verrou de réserve électorale testé jusqu'à la publication | `reserveSondages()` (samedi 0 h au dimanche 20 h, Paris) : aucun sondage ni simulation choisi, retrait de la file **et des brouillons** ; testé dans `tests/stories-auto.test.mjs` |
| 4 | Pas de financement politique ; mention « Publicité » pour toute collaboration | section 2, lignes 4 et 5 |
| 5 | Mentions légales cohérentes avec une activité commerciale ; tableau des licences | sections 4 et 5 |

### Réglages de `data/stories-config.json`

```json
{ "monetisation": false, "validationHumaine": false }
```

- `false` / `false` (valeur livrée) : comportement historique inchangé.
- `monetisation: true` : stories sur données propres seulement. Ce que le dessin du site permet aujourd'hui : vote final de l'Assemblée (par groupe), vote final du Sénat (par groupe), sondage unique (hors réserve), simulation « probabilités » marquée simulation (hors réserve). Le **budget Eurostat**, le **quiz** et les **présidents** n'ont pas encore de dessin automatique de story : à ajouter dans `js/stories.js` avant de les programmer (travail restant).
- `validationHumaine: true` : tout passe par un brouillon (`instagram/brouillons/<id>.jpg` + `<id>.json`, statut `a-valider`). Un humain regarde, puis publie à la main. Les brouillons de plus de 7 jours sont supprimés.
- Attention : le dépôt est servi par GitHub Pages, donc un brouillon committé est techniquement lisible par qui connaît son adresse. Pour une confidentialité réelle avant validation, envisager de ne pas committer les brouillons (artefact de workflow privé) : **à décider**.
- Un sondage montre le commanditaire exigé par la loi du 19 juillet 1977 (« pour Le Figaro » par exemple) : c'est une mention légale obligatoire, pas un titre d'article, mais c'est un nom de média dans l'image : **à valider avec le juriste**.

## 2. Checklist avant le premier euro

À cocher dans l'ordre. Ne rien encaisser (ni cadeau, ni collaboration rémunérée, ni bonus de plateforme) avant les lignes 1 à 3.

- [ ] 1. **Statut** : déclarer l'activité (micro-entreprise ou autre statut choisi avec le comptable) et obtenir le SIRET. Identité de l'éditeur : `[À COMPLÉTER]`. SIRET : `[À COMPLÉTER]`.
- [ ] 2. **Expert-comptable** : choix du régime (micro-BNC / micro-BIC, franchise de TVA ou non), seuils de chiffre d'affaires, TVA sur les revenus des plateformes, déclaration des revenus étrangers (Meta). Nom du cabinet : `[À COMPLÉTER]`.
- [ ] 3. **Mentions légales à réécrire** avec l'identité de l'éditeur (une activité commerciale ne permet plus l'anonymat de l'article 6, III, 2 LCEN) : texte prêt en section 5. Changer aussi « Il ne contient aucune publicité » et la mention « particulier, à titre non professionnel » **le même jour** que le premier revenu.
- [ ] 4. **Loi n° 2023-451 du 9 juin 2023 (influence commerciale)** : toute collaboration rémunérée ou en nature porte la mention claire « Publicité » (ou « Collaboration commerciale ») sur l'image/vidéo et dans la légende, pendant toute la durée de visibilité. Contrat écrit avec mentions obligatoires pour les prestations au-dessus du seuil du décret. Vérifier avec le juriste l'applicabilité (seuil d'audience, qualité d'« influenceur ») : **à vérifier**.
- [ ] 5. **Pas de financement politique** : aucun parti, candidat, groupe parlementaire, élu, mandataire ou micro-parti, ni via une agence ou un intermédiaire. Refuser toute « collaboration » dont le commanditaire final est politique. Tenir un registre des partenaires refusés et acceptés. (Une campagne électorale est encadrée par le code électoral, notamment les dons et la propagande : à confirmer avec le juriste.)
- [ ] 6. **Avis d'un juriste** sur les **droits voisins** et la réutilisation des titres de presse (loi du 24 juillet 2019, art. L218-2 du code de la propriété intellectuelle). Tant que `monetisation: true` n'est pas activé, la presse n'apparaît pas dans les stories monétisées ; le **site** continue d'afficher des titres (Actualités, Vérifications) : à examiner aussi une fois le site commercial (publicité, liens de parrainage).
- [ ] 7. **Conditions de Meta** : conditions d'utilisation et règles de monétisation d'Instagram (éligibilité, contenu politique, programmes de bonus, contenu partenaire/« Partenariat rémunéré » à étiqueter dans l'outil), politique sur les contenus sociaux/politiques et les annonces liées aux élections. **À vérifier** sur les pages Meta actuelles le jour de la demande (elles changent).
- [ ] 8. **Réserve électorale** : relire `reserveSondages()` et le test avant chaque scrutin (présidentielle 2027 : 18 avril et 2 mai, dates dans `TOURS_PRESIDENTIELLE` de `index.html` et du script). Pas de programmation manuelle de sondage le samedi 0 h au dimanche 20 h, même pour un post « classique ».
- [ ] 9. **Validation humaine active** (`validationHumaine: true`) tant que le propriétaire n'a pas relu la procédure ; décider qui valide, avec quel délai, et conserver la trace (le résumé de l'exécution GitHub).
- [ ] 10. **Tableau des licences** (section 4) : lever tous les « à vérifier » ; attribution des CC BY-SA ; photos des personnalités.
- [ ] 11. **Données personnelles** : si publicité ou liens affiliés sur le site, mettre à jour la politique cookies/CNIL ; sinon rester sans traceur.
- [ ] 12. **Assurance** responsabilité civile professionnelle (diffamation, droit à l'image) : **à étudier** avec le comptable.

## 3. Plan sur 90 jours

**Jours 1 à 15 : préparer, sans rien encaisser**
- Régler `validationHumaine: true` ; vérifier le brouillon de bout en bout sur 1 ou 2 semaines (lecture humaine, aucune publication automatique).
- Statut, comptable (lignes 1 et 2), avis juriste (lignes 4 à 6).
- Compléter le tableau des licences ; décider du sort des brouillons committés.

**Jours 16 à 45 : contenu 100 % données propres**
- Passer `monetisation: true` (la presse disparaît des stories) ; vérifier l'effet : audience, régularité.
- Fixer un rythme (par exemple votes finals + une simulation hebdomadaire après validation).
- Ajouter, si utile, des stories budget (Eurostat), quiz et présidents (dessin à écrire).
- Mesurer : abonnés, portée, enregistrements, partages. Aucun objectif de chiffre d'affaires encore.

**Jours 46 à 75 : conformité terminée, premières offres**
- Mentions légales remplacées (section 5) le jour où le premier revenu devient possible.
- Éligibilité aux programmes de Meta si disponible ; sinon dons ou abonnements sans contrepartie politique.
- Modèle de contrat de collaboration avec mention « Publicité », liste de refus (politique, partis, campagnes), tarif.

**Jours 76 à 90 : revue**
- Bilan : audience, revenus, incidents (demandes de rectification, droit de réponse).
- Relire avec le comptable et le juriste ; réviser la liste de refus ; décider de la suite (maintien de la validation humaine, ouverture de collaborations).

## 4. Licences par source de données

Rempli uniquement avec ce que le dépôt documente (mentions légales de `index.html`, commentaires de `scripts/`, contrôles de `scripts/check-data.js` et `scripts/check-portraits.js`). Tout le reste est « à vérifier ».

| Source | Usage dans le site | Licence documentée dans le dépôt | À vérifier avant monétisation |
|--------|-------------------|----------------------------------|-------------------------------|
| Assemblée nationale (votes, dossiers, groupes, agenda, gouvernement, activité des députés, âge et profession) | `data/lois.json`, `data/deputes.json`, `scripts/fetch-*.js` | Licence Ouverte 2.0 (Etalab), citée dans les mentions légales | Réutilisation commerciale permise par la Licence Ouverte : confirmer la mention de paternité exigée sur les images de stories |
| Sénat (scrutins publics, sénateurs) | `data/senat.json`, `data/senateurs.json`, `scripts/fetch-senat.js` | **Aucune licence indiquée** : « pages officielles senat.fr », « liste officielle data.senat.fr » | **À vérifier** : licence de data.senat.fr et des pages de scrutins ; réutilisation commerciale |
| HATVP (représentants d'intérêts, déclarations) | `data/activite.json`, `scripts/fetch-lobbying.js` | Open data, Licence Ouverte (mentions légales et `scripts/fetch-lobbying.js`) | Confirmer l'attribution ; la mention précise que les montants des déclarations ne sont pas repris |
| Eurostat (budget, déficit, dette ; tableaux gov_10a_exp, gov_10a_main, gov_10dd_edpt1) | `data/budget.json`, `scripts/fetch-budget.js` | « Licence ouverte », politique de réutilisation de la Commission européenne, source citée | **À vérifier** : texte exact de la décision de réutilisation et mention requise sur l'image |
| Insee (indicateurs, comptes) | `data/indicateurs.json`, `scripts/fetch-insee.js` | Source citée ; **licence non indiquée** | **À vérifier** : licence de la BDM Insee et réutilisation commerciale |
| data.gouv.fr, ministère de l'Intérieur (législatives 2024, présidentielle 2022) | `data/communes.json`, `scripts/fetch-communes.js` | Licence Ouverte (mentions légales) | Confirmer pour chaque jeu de données (la licence est portée par la fiche du jeu) |
| Wikipédia : liste des sondages, candidatures | `data/sondages.json`, `data/candidats.json` | CC BY-SA 4.0 (mentions légales) ; redistribution sous la même licence annoncée | **À vérifier** : effet du « partage dans les mêmes conditions » sur des images/stories commerciales, mention d'attribution dans la légende |
| Notices de la Commission des sondages | Liens depuis chaque sondage | Documents officiels liés, pas de reprise de texte | Aucune licence indiquée : **à vérifier** si on reprend plus que le lien |
| Photos officielles des parlementaires (AN, Sénat) | `photos/deputes`, `photos/senateurs` | « photos officielles… réduites et hébergées sur le site » ; **licence non indiquée** | **À vérifier** : licence et droit à l'image pour un usage commercial |
| Wikimedia Commons : portraits d'autres personnalités | `photos/personnalites`, `data/portraits.json`, `scripts/fetch-portraits.js` | Licence libre exigée par le script (domaine public, CC0, CC BY, CC BY-SA) ; licence, auteur et source notés par photo ; `scripts/check-portraits.js` bloque une photo sans licence ou sans auteur (hors domaine public) | **À vérifier** : attribution visible dans les stories et légendes ; droit à l'image et usage de l'image d'une personne dans un contexte commercial (indépendant de la licence du fichier) |
| Wikimedia Commons : logos des partis | `icons/partis`, `data/logos.json`, `scripts/fetch-logos.js` | Domaine public, sauf Renaissance : CC BY-SA 4.0 (S. Séjourné, vectorisation Valo139) ; les logos restent des marques de leurs partis | **À vérifier** : usage de marques de partis dans un cadre commercial ; lien avec la condition « pas de financement politique » |
| Presse : titres de médias (RSS) | Actualités, dossiers, direct | « Les titres de presse restent la propriété de leurs médias et ne sont repris que pour renvoyer vers leur article » | **Exclus des stories monétisées.** Droits voisins sur le site : avis du juriste (checklist, ligne 6) |
| Vérifications (Les Décodeurs, franceinfo, AFP, 20 Minutes, Libération) | `data/verifications.json` | Titres attribués à la rédaction, liens vers l'article | Même réserve que la presse |
| Décodex (Le Monde) | Contrôle quotidien des liens | Consulté pour filtrer les liens | **À vérifier** : conditions d'usage de la base |
| Justice (décisions, condamnations) | `data/justice.json` | « juridictions et presse », cités sur chaque fiche | **À vérifier** : source de chaque fiche ; mention présomption d'innocence ; rubrique à exclure des stories monétisées (données sensibles) |
| Polices (Newsreader, Public Sans), icônes | `fonts/`, `icons/` | **Aucune licence indiquée dans le dépôt** | **À vérifier** : licence des fichiers de polices et des icônes |
| Code du site | Dépôt | Aucune licence de dépôt relevée | **À vérifier** : le propriétaire choisit la licence du code |

## 5. Texte de remplacement des mentions légales (à activer le jour du premier revenu)

À substituer dans `index.html` (section « Éditeur », « Indépendance », « Données personnelles ») le jour où une activité commerciale existe. Les champs `[À COMPLÉTER]` sont à fournir par le propriétaire ; ne rien deviner.

### Éditeur (remplace le paragraphe actuel)

> Ce site est édité par **[À COMPLÉTER : nom et prénom, ou dénomination sociale]**, **[À COMPLÉTER : statut, par exemple entrepreneur individuel (micro-entrepreneur)]**, immatriculé sous le numéro SIRET **[À COMPLÉTER]**, **[À COMPLÉTER : adresse du siège ou de l'établissement]**. Directeur de la publication : **[À COMPLÉTER]**. Contact : **[À COMPLÉTER : adresse électronique]**. TVA : **[À COMPLÉTER : numéro de TVA intracommunautaire, ou « TVA non applicable, art. 293 B du CGI » si le comptable le confirme]**.
>
> Contact, demande de correction ou droit de réponse : **[À COMPLÉTER : adresse électronique]**, par message privé sur Instagram, @hemicyclefrance, ou en ouvrant un ticket sur GitHub.

### Hébergeur (inchangé)

> GitHub, Inc. (service GitHub Pages), 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, États-Unis. Téléphone : +1 877 448 4820.

### Indépendance et financement (remplace le paragraphe actuel)

> Ce site n'est lié à aucun parti, candidat, groupe parlementaire, média ou administration. Il n'est ni financé ni relu par l'Assemblée nationale, l'Insee ou les instituts de sondage, dont il réutilise les données publiques. **Il est financé par [À COMPLÉTER : nature des revenus, par exemple partenariats commerciaux sur Instagram, programmes de monétisation de la plateforme].** Les contenus issus d'une collaboration commerciale portent la mention « Publicité ». **Le site n'accepte aucun financement d'un parti, d'un candidat, d'un groupe parlementaire, d'un élu ou d'une structure qui leur est liée, directement ou par intermédiaire.** Aucun partenaire n'a de regard sur le contenu éditorial.

### Données et publicité (à adapter selon les dispositifs réellement installés)

> **[À COMPLÉTER : si le site affiche de la publicité ou des liens affiliés, décrire les traceurs, leur finalité et le moyen de les refuser. Sinon : « Le site ne dépose aucun cookie et n'utilise aucun outil de mesure d'audience ni de publicité. »]** Responsable du traitement pour les comptes facultatifs : l'éditeur ci-dessus.

### Sources et licences (à ajouter à la liste actuelle)

> Les données sont réutilisées sous les licences indiquées dans le tableau « Licences par source » (**[À COMPLÉTER : reprendre le tableau de la section 4 une fois les points « à vérifier » levés]**). Les stories publiées sur Instagram sont dessinées à partir de ces seules données ouvertes (votes, sondages avec leurs mentions légales, budget, simulations signalées comme telles) ; les titres de presse n'y figurent pas.

### Mises à jour liées

- Remplacer « Dernière mise à jour de cette page » par la date du changement.
- Page « Méthode » : la phrase « Chaque rubrique cite sa source » reste exacte ; ajouter une phrase sur le financement.
- `README.md` et `instagram/LISEZMOI.md` : bio du profil (catégorie, mention éventuelle du partenariat), si besoin.
- Vérifier les traductions (`data/i18n/`) après modification : `node scripts/check-data.js`.
