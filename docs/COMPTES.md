# Activer les comptes des visiteurs (guide pas à pas)

Les comptes sont **facultatifs et désactivés par défaut**. Tant que le fichier `data/compte-config.json` n'existe pas,
le site est exactement celui d'avant : aucun bouton, aucun message, aucune requête vers un autre site.

Une fois activés, les visiteurs peuvent créer un compte (par lien envoyé par e-mail, ou avec Google / Microsoft) pour
retrouver sur tous leurs appareils : le député ou groupe suivi, l'historique de leurs résultats au quiz et leurs favoris.
Les données sont stockées chez **Supabase** (offre gratuite). Le site parle à Supabase directement, sans aucun script
tiers : le code du site reste le seul code exécuté dans le navigateur.

Ce que vous récupérez : **l'adresse e-mail et les préférences**. Rien d'autre. Aucun suivi, aucun cookie.

---

## Étape 1. Créer le projet Supabase (région Europe)

1. Allez sur <https://supabase.com> et créez un compte gratuit.
2. Cliquez sur **New project**. Donnez un nom (par exemple `hemicycle-france`) et un mot de passe de base de données
   (gardez-le dans un gestionnaire de mots de passe ; le site n'en a pas besoin).
3. **Region : choisissez une région européenne** (par exemple *West EU (Paris)* ou *Central EU (Frankfurt)*).
   C'est important : les mentions légales du site annoncent un hébergement dans l'Union européenne. La région ne se change pas après coup.
4. Attendez deux minutes que le projet soit prêt.

## Étape 2. Coller le SQL

1. Dans Supabase : **SQL Editor** → **New query**.
2. Ouvrez le fichier `supabase/schema.sql` de ce dépôt, copiez tout, collez, cliquez **Run**.
3. Résultat attendu : « Success ». Cela crée la table `profils` (protégée : chacun ne voit que sa ligne), la fonction
   `supprimer_mon_compte()` et la suppression automatique des comptes inactifs.

### Comptes inactifs (24 mois)
Les mentions légales annoncent que les comptes sans connexion depuis 24 mois sont supprimés. La fin du fichier SQL
programme cette suppression chaque nuit. **Vérifiez-la** : SQL Editor, lancez `select jobname, schedule from cron.job;` ;
une ligne `hemicycle-comptes-inactifs` doit apparaître. Si elle manque (message d'avertissement lors de l'étape 2) :
**Database → Extensions → pg_cron → activer**, puis relancez le SQL. Si cela reste impossible, **retirez la phrase
« Un compte sans connexion… supprimé automatiquement » des mentions légales** (rubrique « Compte et données personnelles » d'`index.html`
et ses traductions) : il ne faut jamais annoncer ce qui n'est pas fait.

## Étape 3. Régler l'adresse du site

Dans Supabase : **Authentication → URL Configuration**.
- **Site URL** : `https://tahns.github.io/hemicycle-france/`
- **Redirect URLs** (ajoutez) : `https://tahns.github.io/hemicycle-france/` (avec la barre oblique finale).
  Pour tester en local, vous pouvez ajouter aussi `http://localhost:8000/` (à retirer ensuite).

## Étape 4. Activer la connexion par e-mail sans mot de passe

**Authentication → Providers → Email** : activé (c'est le cas par défaut). Laissez **Confirm email** activé.
Ne demandez pas de mot de passe : le site envoie un « lien magique ». Dans **Authentication → Sign In / Providers**
vous pouvez aussi régler la durée de validité du lien (1 heure par défaut, c'est bien).

### Option : votre propre serveur d'envoi d'e-mails (SMTP)
L'envoi par défaut de Supabase est **très limité** (quelques e-mails par heure) et réservé aux tests. Pour un vrai
usage, ouvrez **Authentication → Emails → SMTP Settings** et branchez un fournisseur (par exemple Brevo, offre gratuite
européenne, ou Mailjet). Il vous donne un serveur, un port, un identifiant et un mot de passe à recopier. Ce fournisseur
devient un sous-traitant : il est couvert par la phrase « service de messagerie configuré pour ce projet » des mentions légales.
Vous pouvez aussi personnaliser le texte du mail (**Authentication → Emails → Templates**).

## Étape 5. (Facultatif) Google, Microsoft, GitHub, Apple

Sans cette étape, seule la connexion par e-mail est proposée. Chaque fournisseur ajouté se déclare dans
`data/compte-config.json` (liste `"fournisseurs"`) : **seuls ceux listés s'affichent**.
Pour chacun, Supabase affiche une **« Callback URL »** (de la forme `https://VOTRE-PROJET.supabase.co/auth/v1/callback`) :
elle est visible dans **Authentication → Sign In / Providers → (le fournisseur)**. Gardez-la sous la main.

### Google (gratuit, le plus utile)
1. <https://console.cloud.google.com> → créez un projet.
2. **API et services → Écran de consentement OAuth** : type *Externe*, nom de l'application « Hémicycle France »,
   votre e-mail de contact. Dans les *niveaux d'accès (scopes)* gardez seulement `email`, `profile` et `openid`. Cliquez **Publier l'application**
   (sinon seuls des testeurs peuvent se connecter).
3. **API et services → Identifiants → Créer des identifiants → ID client OAuth** : type *Application Web*.
   - *Origines JavaScript autorisées* : `https://tahns.github.io`
   - *URI de redirection autorisés* : la **Callback URL** de Supabase.
4. Google vous donne un **ID client** et un **Code secret du client**.
5. Dans Supabase : **Authentication → Providers → Google** : activez, collez l'ID client et le code secret, **Save**.
6. Dans `data/compte-config.json`, mettez `"google"` dans `fournisseurs`.

### Microsoft (gratuit)
1. <https://entra.microsoft.com> → **Identité → Applications → Inscriptions d'applications → Nouvelle inscription**.
2. Nom « Hémicycle France ». Types de comptes : *Comptes dans un annuaire d'organisation et comptes Microsoft personnels*.
   **URI de redirection** (plateforme *Web*) : la **Callback URL** de Supabase.
3. Sur la page de l'application, copiez **ID d'application (client)**.
4. **Certificats et secrets → Nouveau secret client** : copiez immédiatement la **Valeur** (elle ne se réaffiche pas).
5. **Authentification** (ou *Jetons*) : vérifiez que la revendication facultative `email` est disponible (**Configuration des jetons → Ajouter une revendication facultative → ID → email**).
6. Dans Supabase : **Authentication → Providers → Azure** : activez, collez l'ID client et le secret, et pour *Azure Tenant URL* utilisez `https://login.microsoftonline.com/common`. **Save**.
7. Dans `data/compte-config.json`, mettez `"azure"` (c'est le nom Supabase de Microsoft).

### GitHub (gratuit)
GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**. *Homepage URL* : `https://tahns.github.io/hemicycle-france/` ;
*Authorization callback URL* : la Callback URL de Supabase. Copiez le *Client ID* et générez un *Client secret*, collez-les dans
Supabase → Providers → GitHub. Ajoutez `"github"` à `fournisseurs`.

### Apple (payant : à éviter au début)
Demande un compte **Apple Developer payant** (environ 99 € par an), un identifiant de service, une clé privée et un
renouvellement tous les six mois. À n'envisager que si des visiteurs le demandent. Ajoutez ensuite `"apple"` à `fournisseurs`.

> Chaque fournisseur reçoit l'identifiant de connexion du visiteur chez lui ; le site n'utilise que l'adresse e-mail. Selon
> le fournisseur, Supabase peut aussi garder le nom du profil (jamais affiché ni utilisé) : c'est dit dans les mentions légales.

## Étape 6. Donner l'adresse et la clé publique au site

1. Dans Supabase : **Project Settings → API**. Copiez **Project URL** et la clé **anon / public** (ou « publishable »).
   **Ne copiez JAMAIS la clé `service_role` (ou « secret »)** : elle donnerait accès à toutes les données. Le site la refuse, mais ne comptez pas là-dessus.
2. Copiez `data/compte-config.exemple.json` en `data/compte-config.json` et remplacez les valeurs :

```json
{
  "url": "https://VOTRE-PROJET.supabase.co",
  "cle_publique": "la-cle-anon-publique",
  "fournisseurs": ["google", "azure"]
}
```
La clé « anon » est publique par nature : elle ne permet de lire ou écrire que ce que les règles de sécurité de l'étape 2 autorisent (chacun sa ligne).
Le contrôle `node scripts/check-data.js` refuse une adresse qui n'est pas `https://…supabase.co`.

## Étape 7. Autoriser l'adresse dans la politique de sécurité (CSP)

Le site interdit par défaut tout contact avec un autre serveur (`connect-src 'self'`). Il faut y ajouter **uniquement** l'adresse de votre projet.

- **Automatique** : le script `scripts/appliquer-compte.js` fait ce travail à partir de `data/compte-config.json`. Il est lancé à chaque
  mise à jour automatique des données (workflow « Mise à jour automatique des données », toutes les heures). Pour ne pas attendre,
  lancez ce workflow à la main (onglet **Actions → Mise à jour automatique des données → Run workflow**), ou exécutez
  `node scripts/appliquer-compte.js` puis publiez `index.html`. Sans configuration, la CSP reste inchangée.
- **À la main** (si besoin) : dans la balise `<meta http-equiv="Content-Security-Policy" …>` d'`index.html`, remplacez `connect-src 'self';` par
  la ligne exacte (avec VOTRE adresse) :

```
connect-src 'self' https://VOTRE-PROJET.supabase.co;
```

Garde-fou : tant que la CSP n'autorise pas l'adresse, le site garde les comptes **cachés** (rien ne casse). La connexion Google ou Microsoft
est une simple navigation de page, pas une requête du site : aucun autre domaine n'est à autoriser.

## Étape 8. Ce que vous devez publier côté légal

Les mentions légales du site (rubrique « Données personnelles ») affichent automatiquement la section « Compte et données personnelles »
dès que les comptes sont actifs. Elle dit la vérité **si vous avez respecté** :
- projet Supabase en **région européenne** (étape 1) ;
- suppression des comptes inactifs **vérifiée** (étape 2) ;
- vos coordonnées de contact (Instagram ou ticket GitHub, déjà dans « Éditeur ») qui permettent d'exercer les droits ;
- si vous branchez un SMTP externe : rien à changer au texte, mais lisez sa politique de confidentialité.

À savoir : en recueillant des adresses e-mail, vous devenez **responsable de traitement** (RGPD), même à titre personnel. Les droits d'accès,
de portabilité et d'effacement sont en libre-service dans « Mon espace » ; les demandes d'opposition ou de limitation arrivent par votre contact : répondez dans le mois.
Tenez un petit **registre des traitements** (une page : finalité, données, durée, sous-traitant Supabase) — un modèle est proposé par la CNIL. Les comptes sont réservés aux 15 ans et plus (case à cocher à l'inscription).
Par prudence, faites relire la section par un juriste si le site grandit.

## Étape 9. Vérifier

1. Ouvrez le site : le bouton **Mon espace** apparaît en haut (et dans « Plus » sur téléphone).
2. Créez un compte avec votre e-mail, ouvrez le lien reçu sur le même appareil.
3. Dans Supabase → **Table Editor → profils** : une ligne apparaît après un favori ou un quiz.
4. Testez « Télécharger mes données », puis « Supprimer mon compte et mes données » : l'utilisateur et sa ligne disparaissent (**Authentication → Users**).

## Désactiver les comptes
Supprimez `data/compte-config.json` (ou videz-le) : le site redevient « sans compte » et la prochaine mise à jour remet la CSP stricte.
Les comptes déjà créés restent chez Supabase : supprimez-les vous-même si vous arrêtez le service, et **modifiez les mentions légales** en conséquence.

## Ce que fait le code (pour les curieux)
- `compte-client.js` : appels directs à l'API de Supabase (`/auth/v1/otp`, `/auth/v1/authorize`, `/auth/v1/user`, `/auth/v1/token`, `/rest/v1/profils`, `/rest/v1/rpc/supprimer_mon_compte`), validation d'e-mail, limite de 1 lien par minute et 5 par heure, nettoyage de toute donnée reçue.
- Retour de connexion : le jeton arrive dans l'adresse (`#access_token=…`), le site la nettoie aussitôt, garde la session dans le stockage local du navigateur (effacée à la déconnexion) et la renouvelle avec le `refresh_token`.
- Aucune donnée du compte n'est affichée avec `innerHTML`.
- Tests : `node tests/compte.test.mjs` (client) et `node tests/compte-fumee.cjs` (faux Supabase dans un vrai navigateur).
