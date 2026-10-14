# Tests de mutation des calculs

Rapport produit par `node scripts/mutation.mjs` le 2026-10-14.

Score global : 94 % (179 mutants tués sur 190).
Hors mutants équivalents : 100 % (179 sur 179).

| Fichier | Mutants | Tués | Score |
| --- | ---: | ---: | ---: |
| src/lib/calc/decimal.ts | 34 | 28 | 82 % |
| src/lib/calc/rounding.ts | 38 | 33 | 87 % |
| src/lib/calc/engine.ts | 94 | 94 | 100 % |
| src/lib/calc/groups.ts | 9 | 9 | 100 % |
| src/lib/calc/format.ts | 15 | 15 | 100 % |

Aucun mutant survivant.

## Mutants équivalents

- src/lib/calc/decimal.ts:38, supérieur en supérieur ou égal : avec une échelle nulle, raw.slice(raw.length) donne déjà une chaîne vide
- src/lib/calc/decimal.ts:40, inférieur en inférieur ou égal : compléter une partie décimale déjà à la bonne longueur ne la change pas
- src/lib/calc/decimal.ts:56, inférieur en inférieur ou égal : un dénominateur nul est refusé juste avant
- src/lib/calc/decimal.ts:56, constante entière plus un : un dénominateur nul est refusé juste avant
- src/lib/calc/decimal.ts:60, inférieur en inférieur ou égal : un numérateur nul donne zéro avec ou sans signe
- src/lib/calc/decimal.ts:60, constante entière plus un : un numérateur nul donne zéro avec ou sans signe
- src/lib/calc/rounding.ts:25, inférieur ou égal en inférieur : un prix nul s'arrondit à zéro, renvoyé tel quel ensuite
- src/lib/calc/rounding.ts:25, constante entière plus un : un prix d'un dix-millième s'arrondit à zéro, et le prix d'origine est alors renvoyé
- src/lib/calc/rounding.ts:28, constante entière plus un : un prix arrondi est un multiple du pas, au moins 1000 : jamais égal à 1
- src/lib/calc/rounding.ts:92, inférieur ou égal en inférieur : un total nul a une cible égale au total et sort à la ligne suivante
- src/lib/calc/rounding.ts:94, inférieur ou égal en inférieur : une cible nulle vient d'un total sous 10 euros, que 3 % de remise ne ramènent jamais à zéro
