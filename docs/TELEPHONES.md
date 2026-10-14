# Téléphones testés

Les écrans principaux sont vérifiés automatiquement sur les téléphones les plus répandus en France, en portrait et
en paysage (`tests/e2e/telephones.spec.ts`, lancé avec les autres tests de navigateur à chaque modification).

| Modèle | Écran (points CSS) | Densité | Système |
| --- | --- | --- | --- |
| iPhone SE | 375 x 667 | 2 | iOS |
| iPhone 15 | 393 x 852 | 3 | iOS |
| iPhone 15 Pro Max | 430 x 932 | 3 | iOS |
| Samsung Galaxy A55 | 384 x 854 | 2,8 | Android |
| Samsung Galaxy S24 | 360 x 780 | 3 | Android |
| Xiaomi Redmi Note 13 | 393 x 873 | 2,75 | Android |
| Google Pixel 8 | 412 x 915 | 2,6 | Android |

Pour chaque modèle, on vérifie :

- qu'aucun écran ne déborde horizontalement (tableau de bord, devis, nouveau devis, fiche devis, clients, chantiers,
  pointage, menu Plus, planning en paysage) ;
- que chaque bouton, case à cocher et liste déroulante visible offre une cible tactile d'au moins 24 x 24 points
  (WCAG 2.2, critère 2.5.8).

Le moteur de rendu reste Chromium : l'écran, la densité, le tactile et l'identification du navigateur de chaque modèle
sont reproduits, pas les particularités de Safari. Un passage manuel sur un iPhone réel reste prévu avant chaque
version majeure. La liste est revue chaque année d'après les ventes de téléphones en France.
