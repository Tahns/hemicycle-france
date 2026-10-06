# Avoir un nom de domaine (par exemple hemicycle-france.fr)

Le site fonctionne très bien **sans** nom de domaine, sur `https://tahns.github.io/hemicycle-france/`. Un domaine propre
n'est pas obligatoire ; il aide surtout à être trouvé et partagé : adresse courte, `robots.txt` lu par les moteurs de recherche
(ils ne le lisent qu'à la racine d'un domaine), et une adresse qui ne change pas si le dépôt change de nom.

**Rien n'est activé tant que vous ne suivez pas ces étapes.** Tout le code est prêt : il suffit de changer une variable.

## Ce qui est gratuit, ce qui coûte

| Élément | Coût |
|---|---|
| Hébergement GitHub Pages | gratuit (déjà en place) |
| Domaine personnalisé sur GitHub Pages | gratuit |
| Certificat HTTPS (cadenas) | gratuit, géré par GitHub (Let's Encrypt) |
| DNS chez le registraire | en général inclus |
| **Achat du nom de domaine** | **payant, chaque année** : de l'ordre de 7 à 15 € par an pour un `.fr` ou un `.com` (les prix varient selon le registraire ; le premier tarif promotionnel est souvent plus bas que le renouvellement) |

Seul l'achat du nom de domaine coûte de l'argent, et il se renouvelle chaque année. Si vous ne renouvelez pas, le domaine est perdu
et le site redevient accessible sur l'adresse `github.io`. Méfiez-vous des options payantes proposées au moment de l'achat (e-mail, « protection »,
hébergement, référencement) : aucune n'est nécessaire.

## Étapes

1. **Choisir et acheter le domaine** chez un registraire (OVH, Gandi, Infomaniak, Namecheap…). Activez le renouvellement automatique
   et gardez l'e-mail du compte à jour : c'est ce qui permet de récupérer le domaine en cas de problème.

2. **Régler le DNS** (dans l'interface du registraire, rubrique « Zone DNS » ou « Enregistrements ») pour un domaine « nu »
   (`hemicycle-france.fr`) et son `www` :
   - 4 enregistrements `A` sur le domaine nu (nom `@`, ou vide) : `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` ;
   - facultatif, 4 enregistrements `AAAA` : `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153` ;
   - 1 enregistrement `CNAME` pour `www` vers `tahns.github.io` (sans barre oblique ni nom du dépôt).
   Supprimez les anciens enregistrements `A` ou `AAAA` qui pointeraient ailleurs (page « parking » du registraire). La propagation peut prendre de quelques minutes
   à quelques heures (jusqu'à 24 h).
   Ces adresses sont celles documentées par GitHub (« Managing a custom domain for your GitHub Pages site ») ; en cas de doute, comparez avec cette page.

3. **Déclarer le domaine dans GitHub** : dépôt → *Settings* → *Pages* → *Custom domain*, saisir `hemicycle-france.fr` (ou `www.hemicycle-france.fr`), *Save*.
   GitHub vérifie le DNS, puis ajoute un fichier **`CNAME`** à la racine du dépôt (une seule ligne : le domaine). Ne le supprimez pas : ce fichier est ce qui
   maintient le domaine. Si GitHub propose de vérifier le domaine (*Verify*), faites-le : cela empêche un tiers de le détourner.

4. **Activer HTTPS** : dans la même page *Settings → Pages*, cochez **Enforce HTTPS** dès que la case est disponible (le certificat peut mettre
   jusqu'à une heure à apparaître après la validation du DNS).

5. **Changer l'unique variable du site** : dans `data/site-config.json`, remplacez

   ```json
   "baseUrl": "https://tahns.github.io/hemicycle-france/"
   ```

   par `"baseUrl": "https://hemicycle-france.fr/"` (avec `https://` et la barre oblique finale ; pas de `www` si vous avez choisi le domaine nu comme adresse principale).
   Au prochain passage du workflow *Mise à jour automatique des données* (au plus 15 minutes, ou lancez-le à la main : *Actions → Mise à jour automatique → Run workflow*),
   `scripts/generer-pages.js` (et `scripts/partage.cjs` pour les pages d'aperçu) réécrivent avec la nouvelle adresse : adresses canoniques de toutes les pages, `sitemap.xml`,
   `robots.txt`, flux, balises de partage (`og:`, `twitter:`) et données structurées d'`index.html`. Vous pouvez aussi lancer `node scripts/generer-pages.js` vous-même.
   Si vous préférez ne rien modifier dans le dépôt, la variable d'environnement `SITE_URL` du workflow est prioritaire sur `baseUrl`.

6. **Vérifier** : ouvrez `https://hemicycle-france.fr/robots.txt` (il doit contenir `Sitemap: https://hemicycle-france.fr/sitemap.xml`), `https://hemicycle-france.fr/sitemap.xml`,
   une page comme `https://hemicycle-france.fr/parti/rassemblement-national/`, puis `node scripts/check-data.js` (il signale une adresse canonique qui ne correspond pas à `baseUrl`).
   Les anciennes adresses `tahns.github.io/hemicycle-france/…` sont redirigées par GitHub vers le nouveau domaine.

7. **Prévenir les moteurs de recherche** : dans Google Search Console (gratuit), ajoutez le domaine comme propriété, puis envoyez `https://hemicycle-france.fr/sitemap.xml`.
   Même chose dans Bing Webmaster Tools. L'indexation prend des jours à des semaines : ce n'est pas immédiat.

## À ne pas oublier si vous les utilisez

- **Comptes des visiteurs (Supabase, facultatif)** : mettez à jour *Site URL* et *Redirect URLs* chez Supabase, et les « origines autorisées » chez Google/Microsoft/GitHub
  (voir `docs/COMPTES.md`), sinon la connexion échoue sur le nouveau domaine.
- **Mesure d'audience (facultatif)** : si vous utilisez Plausible, le nom de site (`analytics.site` dans `data/site-config.json`) doit être le nouveau domaine (voir `docs/ANALYTICS.md`).
- **Instagram (stories automatiques)** : les adresses d'images de la file de stories sont encore écrites avec `tahns.github.io` dans `scripts/stories-auto.cjs` et dans le contrôle de `scripts/check-data.js` ;
  elles ne sont pas pilotées par `baseUrl`. Tant que GitHub redirige l'ancienne adresse, elles continuent de fonctionner, mais à vérifier après le changement.
- **Retour en arrière** : remettre l'ancienne valeur de `baseUrl`, supprimer le fichier `CNAME` et retirer le domaine dans *Settings → Pages*.

## Ce que fait le code, pour mémoire

- `data/site-config.json` (`baseUrl`) est lu par `scripts/generer-pages.js` (pages `loi/`, `candidat/`, `parti/`, `sitemap.xml`, `robots.txt`, `actualites.atom`, tête d'`index.html`)
  et par `scripts/partage.cjs` (pages d'aperçu `v/`, `d/`, `s/`, `p/`, `feed.xml`). Valeur invalide (pas de `https://`…) : l'adresse GitHub Pages par défaut est utilisée et
  `check-data.js` le signale.
- Les liens à l'intérieur des pages sont relatifs : ils fonctionnent avec n'importe quelle adresse.
- Les pages `loi/`, `candidat/`, `parti/` sont produites à chaque passage, mais seuls les fichiers dont le contenu change sont réécrits : pas de bruit dans l'historique.
