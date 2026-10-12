# Règles de calcul des devis

Auteur : BAILLY emmanuel

Le moteur de calcul (`src/lib/calc/engine.ts`) est une fonction pure utilisée à l'identique par le navigateur (aperçu en direct), le serveur (enregistrement et émission) et le PDF. Les totaux envoyés par le navigateur ne sont jamais utilisés : le serveur recalcule tout à l'émission.

## Représentation des valeurs

| Valeur | Unité interne | Exemple |
| --- | --- | --- |
| Montants | centimes d'euro (entiers) | 1 234,56 € = 123456 |
| Prix et coûts unitaires | dix-millièmes d'euro | 45,9 € = 459000 |
| Quantités | millièmes | 12,5 = 12500 |
| Remises et taux de TVA | points de base | 5,5 % = 550 |

Les saisies sont des textes décimaux (virgule ou point acceptés). Aucun nombre à virgule flottante n'intervient : les produits sont calculés en entiers de grande taille puis arrondis.

## Ordre des opérations

1. Ligne : HT brut = quantité x prix unitaire, arrondi au centime.
2. Ligne : remise = HT brut x taux de remise, arrondie au centime ; HT net = HT brut - remise.
3. Les HT nets sont additionnés par taux de TVA.
4. Remise globale éventuelle : appliquée à chaque base de TVA, arrondie au centime.
5. TVA : calculée une seule fois par taux, sur la base nette, arrondie au centime.
6. TTC = total HT net + somme des TVA.

Arrondi : au plus proche, la moitié étant arrondie en s'éloignant de zéro (0,005 € donne 0,01 €).

## Lignes particulières

- Ligne « à compléter » : n'entre pas dans les totaux et bloque l'émission.
- Note : texte non chiffré, imprimé sur le devis.
- Franchise en base de TVA : tous les taux sont ramenés à 0 et la mention « TVA non applicable, article 293 B du CGI » est imprimée.

## Taux de TVA acceptés

0 %, 2,1 %, 5,5 %, 8,5 %, 10 % et 20 %. Le logiciel ne choisit jamais le taux à la place de l'artisan quand il dépend de la situation du client ; les taux réduits déclenchent un rappel des conditions à vérifier.

## Marge prévisionnelle (interne)

- Coûts = somme de quantité x coût unitaire, pour les lignes dont le coût est renseigné.
- Marge = total HT - coûts. Taux de marge = marge / total HT. Coefficient = marge / coûts.
- Si une ligne chiffrée n'a pas de coût, la marge est signalée comme incomplète.
- Le coût et la marge ne figurent jamais sur le devis du client.

## Intégrité des versions émises

Chaque version émise conserve une photographie complète (entreprise, client, lignes, totaux, mentions) et le PDF produit, avec leurs empreintes SHA-256. Le contrôle d'intégrité recalcule les totaux à partir de la photographie et compare l'empreinte du PDF.

Les cas de test chiffrés sont dans `tests/calc.test.ts`.
