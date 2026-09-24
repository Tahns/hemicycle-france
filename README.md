# Décrypter la politique française — automatisation

Ce dossier contient le site (`index.html`) et l'infrastructure qui le met à jour
automatiquement, chaque jour, à partir de sources officielles.

## Ce qui est automatique

| Donnée | Script | Source | Fichier |
|---|---|---|---|
| Scrutins, résultat, votes par groupe | `fetch-scrutins.js` | open data de l'Assemblée nationale | `data/lois.json` |
| Titre court du texte, auteur (Gouvernement, député·e et son groupe, sénateur·rice) | `fetch-scrutins.js` | dossiers législatifs de l'Assemblée | `data/lois.json` |
| Présidences et effectifs des groupes | `fetch-scrutins.js` | open data de l'Assemblée (AMO30) | `data/groupes.json` |
| Députés en fonction : circonscription, participation, votes contre leur groupe, vote sur chaque texte et chaque censure | `fetch-scrutins.js` (via `deputes.js`) | votes nominatifs de l'Assemblée + AMO30 | `data/deputes.json` |
| Chômage, population, croissance du PIB, dette publique | `fetch-insee.js` | Insee, accès SDMX public (**aucune clé nécessaire**) | `data/indicateurs.json` |
| Sondages présidentielle 2027 (dernière enquête de chaque institut, et historique des deux derniers semestres pour la courbe) | `fetch-sondages.js` | liste Wikipédia des sondages, liens vers les notices de la Commission des sondages | `data/sondages.json` |
| Candidats déclarés à la présidentielle | `fetch-candidats.js` | page Wikipédia des candidatures (source de chaque annonce) | `data/candidats.json` |
| Scrutins publics du Sénat, vote de chaque groupe | `fetch-senat.js` | pages officielles senat.fr (recoupées avec le total officiel) | `data/senat.json` |
| Communes → circonscriptions (trouver son député par sa commune) | `fetch-communes.js` (tous les 90 jours) | résultats des législatives 2024 par bureau de vote, ministère de l'Intérieur | `data/communes.json` |
| Pages statiques pour le partage et Google (titre, image, contenu lisible sans JavaScript) | `partage.cjs` | le site lui-même (`index.html?carte`) | `v/<numéro>.html` + `.jpg` (votes clés), `d/<PA…>.html` (députés), `icons/partage.jpg`, `sitemap.xml` |
| Jours fériés (alerte « vote un jour férié ») | calculés dans la page | — | — |


Chaque script refuse de publier une donnée qu'il ne peut pas vérifier :
- scrutins : les votes par groupe sont recoupés avec le total officiel ; les groupes que l'AN publie
  sans identifiant (`PO0`) sont retrouvés à partir des députés nommés dans le vote ;
- Insee : l'intitulé officiel de chaque série est vérifié à chaque lecture (série renommée ou arrêtée = refus) ;
- sondages : chaque hypothèse doit totaliser ~100 %, avec date, échantillon et notice officielle lisibles.

## Nom de domaine (optionnel)

1. Acheter le domaine (par ex. `politique-france.fr`) chez un registraire (OVH, Gandi…).
2. Chez le registraire, ajouter les enregistrements DNS de GitHub Pages :
   `A` vers `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   (et `CNAME www` vers `tahns.github.io`).
3. Dans GitHub : *Settings → Pages → Custom domain*, saisir le domaine, puis cocher *Enforce HTTPS*.
   GitHub ajoute un fichier `CNAME` au dépôt.
4. C'est tout : au prochain passage du workflow, `scripts/partage.cjs` lit `CNAME` et met à jour
   toutes les adresses (pages d'aperçu, plan du site, `robots.txt`, balises `og:` d'`index.html`).

Référencement : `sitemap.xml` liste l'accueil, les 246 votes clés et les 577 députés. À déclarer une fois
dans Google Search Console (propriété = adresse du site). `robots.txt` n'est lu par les moteurs qu'à la
racine d'un domaine : il ne sert qu'avec un nom de domaine propre.

## Ce qui reste manuel (volontairement)

| Donnée | Fichier | Pourquoi |
|---|---|---|
| Condamnations judiciaires | `data/justice.json` | distinguer une condamnation définitive d'un appel demande un jugement humain ; une erreur serait diffamatoire |
| Chefs de parti | `data/dirigeants.json` | aucune source structurée fiable (Wikidata liste plusieurs chefs « en poste » pour un même parti) |
| Agenda (congrès, primaires, meetings, dates d'élection) | `data/meetings.json` | pas d'agenda officiel structuré ; événements passés masqués automatiquement, relecture rappelée tous les 30 jours (`verifieLe`) |
| Inflation, déficit public | `data/indicateurs.json` | l'Insee ne publie pas l'inflation en série directe (la recalculer peut différer d'un dixième) ; pas de série de déficit en % du PIB en base 2020 |

Ces fichiers se modifient directement sur GitHub (crayon « Edit »), sans toucher au code du site.

## Surveillance

- `scripts/check-data.js` contrôle la cohérence de tous les fichiers `data/` avant chaque publication.
- `scripts/check-fraicheur.js` vérifie que les données se mettent bien à jour (votes pendant la
  session parlementaire, sondages de moins de 30 jours, chômage du dernier trimestre publié) et
  rappelle les mises à jour manuelles : inflation (chaque mois), déficit (chaque printemps),
  justice (relecture tous les 60 jours et après chaque date listée dans `echeances` de
  `data/justice.json`), chefs de parti (tous les 90 jours), agenda vide.
  Après une relecture, mettre à jour le champ `verifieLe` du fichier concerné.
- En cas d'échec d'une source ou de données périmées, le workflow ouvre (ou complète) un ticket
  GitHub avec l'étiquette `alerte-donnees` : GitHub vous notifie par e-mail.
- `scripts/check-sources.js` confronte chaque lien cité dans `data/` à la base du Décodex
  (contenus démentis par Les Décodeurs du *Monde*).
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
