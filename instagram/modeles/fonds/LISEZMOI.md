# Fonds du style « une-photo »

Quatre fonds verticaux (1080 × 1920) **générés par IA** (Higgsfield, modèle `gpt_image_2_5`, 12 octobre 2026), sans personne ni texte, moitié basse bleu marine pour porter le titre :

| Fichier | Sujet | Thèmes qui l'utilisent |
|---|---|---|
| `hemicycle.jpg` | hémicycle vu de la galerie | assemblée, budget |
| `palais-bourbon.jpg` | façade du Palais Bourbon au crépuscule | assemblée, budget (alternance d'après l'accroche) |
| `drapeau.jpg` | drapeau tricolore | élections, international |
| `paris-seine.jpg` | Seine et tour Eiffel de nuit | sécurité, justice, gouvernement, Sénat, politique (défaut) |

Règles : jamais le visage d'une personnalité (réelle ou générée) ; l'image affiche toujours « Illustration générée par IA » (js/stories.js : `STORY_FOND_IA_CREDIT`) ; le Sénat n'emprunte pas l'image de l'Assemblée. Table thème → fonds : `STORY_FONDS_IA` (js/stories.js), vérifiée par `tests/fonds-ia.test.mjs`.
