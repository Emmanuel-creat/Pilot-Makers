# Plan de reprise après sinistre

Ce plan dit quoi faire si la base de production est perdue ou corrompue (panne de l'hébergeur, erreur de
manipulation, attaque). Il est rejoué chaque année par un exercice, dont le dernier compte rendu est dans
REPRISE.md.

## Objectifs

- Perte de données maximale admissible : 24 heures (une sauvegarde complète par jour au minimum, conservée 30 jours,
  dont une copie hors de la région d'hébergement).
- Durée de reprise de la base : 15 minutes une fois l'hébergement de secours disponible.
- Durée totale de reprise du service : 4 heures, annonce sur la page /statut comprise.

## Sauvegarde

`dumpDatabase` (src/lib/db/backup.ts) exporte toutes les tables avec une empreinte SHA-256 par table. La sauvegarde
est un fichier JSON unique, à chiffrer avant de quitter le serveur. Les sauvegardes natives de l'hébergeur
(instantanés PostgreSQL) restent la première ligne ; cette sauvegarde logique en est la copie indépendante,
lisible sans l'hébergeur.

## Reprise, étape par étape

1. Constater l'incident, l'annoncer sur la page /statut, passer l'application en lecture seule si elle tourne encore.
2. Créer une base PostgreSQL neuve et y appliquer les migrations (`npm run db:migrate` avec la nouvelle `DATABASE_URL`).
3. Choisir la dernière sauvegarde saine : son empreinte par table doit correspondre (contrôle automatique).
4. Restaurer avec `restoreDatabase`. La restauration refuse une base qui contient déjà des
   entreprises ou des utilisateurs, et refuse une sauvegarde altérée ou plus récente que le code déployé.
5. Vérifier : empreintes identiques, journal scellé intact, connexion d'un compte de test, création d'un devis.
6. Basculer l'application sur la nouvelle base, lever la lecture seule, informer les clients concernés de la
   fenêtre de données perdue le cas échéant.
7. Rédiger le retour d'expérience et, si un défaut a été corrigé, l'inscrire au registre des bogues.

## Exercice annuel

`npm run reprise` sauvegarde une base (par défaut une base de démonstration créée pour l'exercice, sinon celle de
`REPRISE_SOURCE_URL`), la restaure dans une base neuve (`REPRISE_CIBLE_URL`, par défaut en mémoire), compare les
empreintes de chaque table et le journal scellé, mesure les durées et écrit le compte rendu REPRISE.md. L'exercice
tourne aussi chaque année dans l'intégration continue (`.github/workflows/reprise.yml`). Une fois l'hébergement
choisi, l'exercice se fait sur une copie réelle de la production, dans une région différente.
