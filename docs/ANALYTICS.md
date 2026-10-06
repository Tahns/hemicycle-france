# Savoir combien de personnes visitent le site (mesure d'audience, facultatif)

**Désactivée par défaut.** Aujourd'hui le site ne mesure rien : aucune requête vers un service tiers, aucun cookie.
Cette page explique comment l'activer, si vous le souhaitez, avec un service qui respecte la vie privée. Le code est prêt ; il suffit de créer un compte
et de renseigner deux valeurs dans `data/site-config.json`.

## Deux services prévus

| | **GoatCounter** (recommandé pour un projet non commercial) | **Plausible** |
|---|---|---|
| Prix | **gratuit** pour un usage non commercial (le service demande un don facultatif) | **payant** (environ 9 € par mois pour le service hébergé ; gratuit seulement si vous l'hébergez vous-même sur votre propre serveur) |
| Cookies | aucun | aucun |
| Adresse IP | non conservée, selon l'éditeur | non conservée, selon l'éditeur |
| Rubriques du site | compte les chargements de page (une visite = une page vue ; les changements de rubrique `#sondages`, `#deputes`… ne sont pas comptés séparément) | la variante utilisée (`script.hash.js`) compte aussi les changements de rubrique |
| Données | tableau de bord en ligne | tableau de bord en ligne |

Ces informations viennent des éditeurs et peuvent changer : vérifiez leurs pages de tarifs et de confidentialité au moment de vous inscrire.

## Pas à pas : GoatCounter

1. Allez sur <https://www.goatcounter.com/signup>. Choisissez un **code** (par exemple `hemicycle-france`) : il devient l'adresse de votre tableau de bord,
   `https://hemicycle-france.goatcounter.com`. Saisissez votre e-mail et un mot de passe, puis validez le message de confirmation.
2. Dans le tableau de bord : *Settings* → *Site* : réglez la conservation des données (« Data retention ») à **13 mois au plus**, et laissez désactivées les options de collecte
   détaillée (localisation précise, etc.) que vous n'utilisez pas.
3. Dans ce dépôt, ouvrez `data/site-config.json` et renseignez :

   ```json
   "analytics": { "fournisseur": "goatcounter", "site": "hemicycle-france" }
   ```

   (`site` = le code choisi à l'étape 1, sans `https://` ni `.goatcounter.com`).
4. Enregistrez (commit sur `main`). Au prochain passage du workflow *Mise à jour automatique des données* (au plus 15 minutes), l'étape *Mesure d'audience* :
   - ajoute dans l'en-tête d'`index.html` la ligne `<script data-goatcounter="…/count" async src="https://gc.zgo.at/count.js">` ;
   - autorise **uniquement** `gc.zgo.at` (script) et `hemicycle-france.goatcounter.com` (image et envoi) dans la politique de sécurité (CSP) ;
   - fait apparaître, dans les Mentions légales, la phrase « Mesure d'audience : le site compte ses visites de façon anonyme avec GoatCounter… » à la place de
     « Aucun outil de mesure d'audience n'est utilisé ».
   Vous pouvez aussi lancer `node scripts/appliquer-analytics.js` vous-même, puis `node scripts/check-data.js`.
5. Vérifiez : ouvrez le site dans un navigateur, puis le tableau de bord GoatCounter : votre visite apparaît (les visites depuis `localhost` sont ignorées par GoatCounter).
   Si rien n'apparaît, ouvrez la console du navigateur : un message « Content Security Policy » signale une adresse bloquée.

## Pas à pas : Plausible

1. Créez un compte sur <https://plausible.io> (essai gratuit limité dans le temps, puis abonnement), puis *Add a site* : saisissez le **domaine** du site
   (`tahns.github.io` tant que vous n'avez pas de domaine propre, ou `hemicycle-france.fr` ensuite).
2. Dans `data/site-config.json` : `"analytics": { "fournisseur": "plausible", "site": "tahns.github.io" }` (le même domaine que dans Plausible).
3. Même suite que ci-dessus (étapes 4 et 5), avec `https://plausible.io` autorisé dans la CSP (script et envoi).
4. Si vous changez de nom de domaine (voir `docs/DOMAINE.md`), mettez à jour `site` ici et dans Plausible.

## Désactiver

Remettez `"fournisseur": ""` et `"site": ""` : au prochain passage, le script, la balise et les adresses de la CSP disparaissent et la mention légale revient à « Aucun outil… ».

## Vie privée et consentement (à lire)

- Le site **ne dépose aucun cookie** et ne lit aucun identifiant dans votre navigateur pour cette mesure. Pas de bandeau de consentement.
- Un bandeau de consentement est dispensé par la CNIL pour une mesure d'audience **strictement limitée** à la production de statistiques anonymes pour l'éditeur,
  sans recoupement avec d'autres traitements, sans suivi d'un site à l'autre, avec des données non conservées au-delà de 13 mois et une information des visiteurs
  (c'est le rôle de la phrase dans les Mentions légales et du paragraphe de la page Méthode). Ces conditions dépendent aussi des réglages de votre compte chez le service :
  c'est pourquoi l'étape 2 de GoatCounter demande de régler la conservation. Les conditions exactes sont publiées par la CNIL (rubrique « Cookies et traceurs »,
  « Solutions pour la mesure d'audience ») : vérifiez-les, c'est vous l'éditeur.
- Le service est un tiers (hébergé hors du site) : ses serveurs reçoivent la requête de chaque visite (adresse de la page, type de navigateur), d'où la mention dans les Mentions légales.
- **Limite** : seule l'application (`index.html`) est mesurée. Les pages statiques de référencement (`loi/`, `candidat/`, `parti/`, `v/`, `d/`, `s/`, `p/`) n'ont volontairement aucun script
  (politique de sécurité qui interdit tout script) : un visiteur qui n'ouvre que l'une d'elles n'est pas compté, un visiteur qui clique sur « Voir la fiche complète » l'est.
- Les blocages de publicité et les navigateurs configurés pour bloquer les traceurs empêchent aussi ce comptage : les chiffres sont une estimation par défaut.
