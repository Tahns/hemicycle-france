# Décrypter la politique française — automatisation

Ce dossier contient le site (`index.html`) et l'infrastructure qui le met à jour
automatiquement, chaque jour, à partir de sources officielles.

## Ce qui est automatique

| Donnée | Script | Source | Fichier |
|---|---|---|---|
| Scrutins, résultat, votes par groupe | `fetch-scrutins.js` | open data de l'Assemblée nationale | `data/lois.json` |
| Titre court du texte, auteur (Gouvernement, député·e et son groupe, sénateur·rice) | `fetch-scrutins.js` | dossiers législatifs de l'Assemblée | `data/lois.json` |
| Présidences et effectifs des groupes | `fetch-scrutins.js` | open data de l'Assemblée (AMO30) | `data/groupes.json` |
| Chômage, population, croissance du PIB, dette publique | `fetch-insee.js` | Insee, accès SDMX public (**aucune clé nécessaire**) | `data/indicateurs.json` |
| Sondages présidentielle 2027 (dernière enquête de chaque institut) | `fetch-sondages.js` | liste Wikipédia des sondages, liens vers les notices de la Commission des sondages | `data/sondages.json` |
| Jours fériés (alerte « vote un jour férié ») | calculés dans la page | — | — |

Chaque script refuse de publier une donnée qu'il ne peut pas vérifier :
- scrutins : les votes par groupe sont recoupés avec le total officiel ; les groupes que l'AN publie
  sans identifiant (`PO0`) sont retrouvés à partir des députés nommés dans le vote ;
- Insee : l'intitulé officiel de chaque série est vérifié à chaque lecture (série renommée ou arrêtée = refus) ;
- sondages : chaque hypothèse doit totaliser ~100 %, avec date, échantillon et notice officielle lisibles.

## Ce qui reste manuel (volontairement)

| Donnée | Fichier | Pourquoi |
|---|---|---|
| Condamnations judiciaires | `data/justice.json` | distinguer une condamnation définitive d'un appel demande un jugement humain ; une erreur serait diffamatoire |
| Chefs de parti | `data/dirigeants.json` | aucune source structurée fiable (Wikidata liste plusieurs chefs « en poste » pour un même parti) |
| Meetings | `data/meetings.json` | pas d'agenda officiel structuré ; les événements passés sont masqués automatiquement |
| Inflation, déficit public | `data/indicateurs.json` | l'Insee ne publie pas l'inflation en série directe (la recalculer peut différer d'un dixième) ; pas de série de déficit en % du PIB en base 2020 |

Ces fichiers se modifient directement sur GitHub (crayon « Edit »), sans toucher au code du site.

## Surveillance

- `scripts/check-data.js` contrôle la cohérence de tous les fichiers `data/` avant chaque publication.
- `scripts/check-fraicheur.js` vérifie que les données se mettent bien à jour (votes pendant la
  session parlementaire, sondages de moins de 30 jours, chômage du dernier trimestre publié).
- En cas d'échec d'une source ou de données périmées, le workflow ouvre (ou complète) un ticket
  GitHub avec l'étiquette `alerte-donnees` : GitHub vous notifie par e-mail.
- `.github/workflows/ci.yml` lance ces contrôles et un test du site dans un vrai navigateur
  (`tests/smoke.cjs`, ordinateur et mobile) à chaque modification.

## Déploiement (à faire une fois)

1. **Créer un dépôt GitHub** (public ou privé) et y pousser tout ce dossier :
   ```bash
   git init
   git add .
   git commit -m "Site initial"
   git branch -M main
   git remote add origin https://github.com/<ton-compte>/<ton-repo>.git
   git push -u origin main
   ```

2. **Activer GitHub Pages** : Settings → Pages → Source = "Deploy from a branch" →
   branche `main`, dossier `/ (root)`. Le site sera alors accessible à une adresse du
   type `https://<ton-compte>.github.io/<ton-repo>/`.

3. **Vérifier que l'automatisation tourne** : onglet "Actions" du dépôt → le workflow
   "Mise à jour automatique des données" doit apparaître et pouvoir être lancé manuellement
   (bouton "Run workflow") pour un premier test, avant d'attendre le déclenchement quotidien.

## Tester en local avant de déployer

Le site utilise `fetch()` pour charger `data/lois.json` et `data/indicateurs.json` : ça ne
fonctionne pas en ouvrant simplement `index.html` depuis l'explorateur de fichiers (le
navigateur bloque les requêtes `fetch` sur `file://`). Il faut un petit serveur local :

```bash
npx serve .
# ou
python3 -m http.server 8000
```

puis ouvrir `http://localhost:8000` (ou le port indiqué).

Pour tester un script d'automatisation sans rien publier :
```bash
node scripts/fetch-scrutins.js --dry-run
# après une correction du parseur : re-dérive tous les scrutins depuis l'archive officielle
node scripts/fetch-scrutins.js --rebuild
node scripts/fetch-insee.js --dry-run
node scripts/fetch-sondages.js --dry-run
# contrôle de cohérence des fichiers data/ (aussi lancé par le workflow avant publication)
node scripts/check-data.js
```

`data/lois.json` est écrit avec un scrutin par ligne : deux fois plus léger à télécharger
qu'un JSON indenté, et chaque nouveau vote reste une ligne lisible dans l'historique git.

Liens directs : `#scrutin-8434` ouvre un scrutin précis dans l'hémicycle, `#histo-RN`
l'historique d'un groupe, `#sondages` (ou tout autre onglet) la page correspondante.

## Principe général adopté sur ce site

Aucune valeur n'est jamais inventée ou estimée pour "avoir l'air complet". Une donnée
manquante ou non vérifiable est explicitement marquée comme telle (`null`, "non
communiqué", valeur précédente conservée, alerte) plutôt que remplacée par une approximation.
Merci de garder ce principe si vous étendez ce script.
