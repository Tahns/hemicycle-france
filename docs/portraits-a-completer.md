# Portraits à compléter

Les portraits viennent de Wikimedia Commons (licence libre uniquement), téléchargés par `scripts/fetch-portraits.js` en CI.
Le script vérifie la licence réelle via l'API Commons (`extmetadata`) avant d'enregistrer le crédit. Pour imposer un fichier :
ajouter `"Nom": "Fichier.jpg"` dans `data/portraits-choix.json` (nom exact vu sur Commons, sans `File:`).
Sans choix, le script prend l'image principale de l'article Wikipédia.

## Candidats parlementaires
Marine Le Pen, Gabriel Attal, Bruno Retailleau, Delphine Batho, Olivier Becht : leur portrait officiel (Assemblée/Sénat) sert sur le site, mais
les stories « candidat » cherchent `photos/personnalites/`. Le script les récupère désormais aussi (image principale de leur article).

## Non confirmés (Commons bloqué depuis le sandbox : nom de fichier et/ou licence non vérifiables)
- François Hollande : aucun fichier confirmé. Piste vue dans une recherche (licence non vérifiée) : `François Hollande Journées de Nantes.jpg`. Le portrait officiel de député sert en attendant.
- Marine Le Pen : pistes vues dans une recherche (licence non vérifiée) : `Marine Le Pen VIVA 24 (cropped).jpg` (Vox España, mai 2024), `Le Pen, Marine-9586 (cropped).jpg`, `Marine Le Pen.jpg`.
  Si l'image principale de l'article est refusée, essayer l'une d'elles dans `data/portraits-choix.json` après vérification de la licence sur la page Commons.
- Sans article ou image libre au dernier essai : Alice Rufo, Benoît Mathieu, Catherine Chabaud (HTTP 429, à retenter), Eléonore Caroit, Francis Lalanne, Manolo Mlekuz, Mira Markovic, Selma Labib, Sylvain Durif.
