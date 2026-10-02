# Audit des concurrents (2 octobre 2026)

Méthode : recherches web (les sites eux-mêmes étaient bloqués par le proxy : NosDéputés, Datan et La Fabrique de la Loi n'ont pu être consultés qu'à travers les résultats de recherche et leur documentation). Les manques sont comparés à `index.html` et `data/`. Effort : S (< 1 h), M (1 jour), L (plus).

| Fonctionnalité chez un concurrent | Qui | Ici ? | Données ouvertes | Effort |
|---|---|---|---|---|
| Statistiques par groupe : parité, participation, cohésion | Datan | **Ajouté** (bloc « Les groupes en chiffres », calculé depuis `data/deputes.json`) | déjà présentes | S, fait |
| Âge moyen / extrêmes des députés, par groupe | Datan | Non | Oui : date de naissance dans l'open data AMO10/AMO30 de l'Assemblée (data.assemblee-nationale.fr) | S (ajout au script) |
| Profession / catégorie socio-professionnelle | Datan, Europe 1 | Non | Oui : AMO30, champ profession | S à M |
| API / export CSV-JSON des données | NosDéputés (API XML/JSON/CSV) | Non (JSON bruts de `data/` accessibles, non documentés) | Oui : nos propres fichiers | S (documenter dans le README) |
| Alertes e-mail sur mot-clé | NosDéputés | Non (alertes sur un député seulement) | Oui, mais exige un service d'envoi | L (hors site statique) |
| Nuage de mots-clés d'un député (interventions) | NosDéputés | Partiel (sujets des questions écrites) | Oui : comptes rendus de séance, open data AN | M |
| Semaines d'activité, interventions en séance | NosDéputés | Non (présence en commission, amendements, questions oui) | Oui : comptes rendus (data.assemblee-nationale.fr, Syceron) | M |
| Suivi d'un texte article par article, comparaison des versions, amendements | La Fabrique de la Loi, Légifrance | Non (vote final, navette, dossier lié) | Oui : amendements AN open data, Légifrance (API PISTE) | L |
| Simulateur de majorité (choisir les groupes qui votent pour) | Contexte | Non | Oui : effectifs de `data/groupes.json` | S à M (à cadrer : risque de contenu éditorial) |
| Consultations citoyennes / propositions | Parlement & Citoyens, Cap Collectif | Non | Non : contenu propre à la plateforme, pas d'open data stable | Hors périmètre |
| Dossiers législatifs avec frise chronologique | Vie-publique.fr, AN | Partiel (navette AN/Sénat) | Oui : dossiers législatifs AN open data | M |
| Moyenne de sondages, courbes, duels | Politico Poll of Polls, Wikipédia, France-Vote | Oui | déjà présentes | — |
| Votes nominatifs, classements, comparaison de deux députés, communes vers circonscription | Datan, NosDéputés | Oui | déjà présentes | — |
| Agenda de séance, Sénat, HATVP, présence en commission | AN, NosSénateurs | Oui | déjà présentes | — |

## Manques restants

Âge et profession des députés, documentation des données (export), mots-clés et interventions en séance, suivi par article et amendements, frise des dossiers législatifs, simulateur de majorité, alertes par e-mail.
