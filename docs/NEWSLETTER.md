# Résumé hebdomadaire, flux d'alertes et sauvegarde

Ce document explique ce que le site produit tout seul, et ce que le propriétaire peut brancher (ou non) pour envoyer une lettre d'information par e-mail. **Rien n'est envoyé par le site** : aucun compte d'envoi n'est configuré, aucune adresse e-mail n'est collectée.

## Ce qui est généré automatiquement

Chaque dimanche vers 18 h (heure de Paris), le workflow `.github/workflows/digest.yml` lance `scripts/digest-hebdo.js` et committe :

| Fichier | Rôle |
|---|---|
| `data/digest/AAAA-Wss.json` | le résumé de la semaine (données structurées) |
| `digest/AAAA-Wss/index.html` | la page lisible, sans JavaScript (adresse : `…/digest/AAAA-Wss/`) |
| `digest/AAAA-Wss/email.html` | la version e-mail, prête à coller |
| `digest/index.html` | la liste des résumés précédents |
| `digest.xml` | flux Atom des 20 derniers résumés |

Le résumé est écrit **uniquement à partir des données du site** (aucune IA, aucun avis) : textes votés dans la semaine (adoptés ou rejetés, décompte officiel), votes ordinaires les plus serrés, textes les plus discutés, dossiers du moment dans la presse (titres rédigés par le site, médias cités avec leur article), dates à venir (ordre du jour de l'Assemblée, rendez-vous de `data/meetings.json`) et dernier sondage de la présidentielle. Pendant la réserve électorale (la veille et le jour de chaque tour, loi du 19 juillet 1977), aucun sondage n'est repris. Chaque chiffre renvoie à sa source officielle.

Régénérer une semaine à la main : onglet Actions, « Résumé hebdomadaire et sauvegarde », « Run workflow », champ `semaine` (ex. `2026-W41`). En local : `node scripts/digest-hebdo.js --semaine=2026-W41`.

## Envoyer le résumé par e-mail (à faire par le propriétaire, facultatif)

Les trois outils ci-dessous ont une offre gratuite suffisante pour démarrer ; vérifier leurs conditions actuelles avant de s'inscrire. Dans les trois cas, le principe est le même : créer un compte, créer une liste d'abonnés, puis chaque semaine **coller le HTML de `digest/<semaine>/email.html`** dans un nouvel envoi. Le fichier est autonome (styles en ligne, aucune image, aucune feuille de style externe), ce qui évite les mauvaises surprises dans les clients de messagerie.

- **Buttondown** : créer la newsletter, « Emails » > « New email », passer l'éditeur en mode HTML (ou Markdown avec HTML brut), coller le contenu, envoyer ou programmer. Un formulaire d'inscription hébergé est fourni ; le lien vers ce formulaire peut être placé sur le site (voir plus bas).
- **Brevo** (ex-Sendinblue) : « Contacts » > créer une liste ; « Campagnes » > « Campagne e-mail » > éditeur « HTML personnalisé » > coller le fichier. Brevo ajoute le lien de désinscription obligatoire si le modèle contient la variable `{{ unsubscribe }}` (à placer en pied de page ; vérifier le nom exact dans l aide de l outil).
- **MailerLite** : « Campagnes » > « Éditeur HTML personnalisé » > coller le fichier ; le lien de désinscription est inséré avec le champ `{$unsubscribe}`.

Pour automatiser plus tard : ces trois outils proposent une importation de flux RSS (« RSS to email ») qui peut lire `digest.xml` et envoyer un e-mail à chaque nouveau résumé. À configurer dans l'outil lui-même (aucun secret n'est à écrire dans ce dépôt) ; vérifier que l'envoi automatique est bien disponible dans l'offre choisie.

### Obligations (RGPD et droit des communications électroniques)

- **Consentement explicite** : n'inscrire que des personnes qui l'ont demandé elles-mêmes (formulaire d'inscription, idéalement avec confirmation par e-mail, « double opt-in »). Ne jamais importer une liste d'adresses collectées pour un autre usage.
- **Désinscription** : chaque e-mail contient un lien de désinscription fonctionnel, en un clic ; les outils ci-dessus l'ajoutent, ne pas le retirer.
- **Information** : indiquer sur la page d'inscription qui envoie la lettre, à quelle fréquence, comment se désinscrire et où exercer ses droits (accès, rectification, suppression) ; compléter les mentions légales du site (qui traite les adresses, quel prestataire, où elles sont hébergées).
- **Minimisation** : ne demander que l'adresse e-mail ; pas de profilage, pas de suivi d'ouverture si l'outil permet de le désactiver.
- **Prestataire** : signer ou accepter son accord de traitement des données (DPA), disponible dans les paramètres de ces outils.
- Le site lui-même n'enregistre aucune adresse : tant qu'aucun outil n'est branché, ces obligations ne s'appliquent pas.

## Alertes sans compte (flux Atom)

`scripts/flux-alertes.js`, lancé après chaque mise à jour des données, écrit :

- `feeds/depute/<identifiant>.xml` : les 10 derniers votes d'un député sur les textes et motions de censure (identifiant = celui de l'Assemblée, par ex. `PA1008`) ;
- `feeds/loi/<référence du dossier>.xml` : les 20 derniers scrutins d'un texte à l'Assemblée et au Sénat (par ex. `DLR5L17N54776`).

Dans les fiches du site, le lien « S'abonner (RSS) » donne l'adresse du flux, à ajouter dans un lecteur (Feedly, Inoreader, NetNewsWire…). Aucun compte n'est nécessaire, rien n'est envoyé : c'est le lecteur qui relit le fichier.

Plafonds : 600 flux de députés et 150 flux de textes au plus (les textes sélectionnés sont ceux votés dans leur ensemble ou ayant eu un scrutin dans les 90 derniers jours). Un fichier n'est réécrit que si un nouveau vote le change. `scripts/check-data.js` contrôle leur validité et ces plafonds.

## Sauvegarde et santé

- **Sauvegarde hebdomadaire** : la même exécution du dimanche archive `data/*.json` (avec une empreinte SHA-256 de chaque fichier) et la publie comme artefact `sauvegarde-donnees`, conservé 30 jours (onglet Actions > l'exécution > « Artifacts »). Rien n'est ajouté au dépôt, qui garde déjà l'historique de chaque fichier.
- **Passage de la mise à jour** : `.github/workflows/sante.yml` vérifie toutes les 2 heures que le dernier passage réussi de « Mise à jour automatique des données » date de moins de 2 heures ; sinon une alerte apparaît dans le résumé de l'exécution et en avertissement (pas de ticket ni d'e-mail, comme les autres alertes du site).
- Le jeton Instagram et les secrets GitHub ne sont jamais touchés par ces workflows.
