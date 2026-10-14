# Exercice de reprise après sinistre

Dernier exercice : 14/10/2026. Résultat : réussi.

Base sauvegardée : base de démonstration créée pour l'exercice.

| Étape | Résultat |
| --- | --- |
| Sauvegarde | 131 tables, 140 lignes, 170 Ko, 0,4 s |
| Restauration dans une base neuve, migrations comprises | 5,8 s |
| Vérification des empreintes | toutes identiques, 0,2 s |
| Journal scellé | intact, 0 entrée(s) |
| Durée de reprise de la base | 6,1 s pour un objectif de 15 minutes |
| Durée totale de l'exercice | 15,4 s |

Procédure et responsabilités : voir PLAN-REPRISE.md.
