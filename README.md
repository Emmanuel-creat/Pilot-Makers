# Pilot-Makers

Générateur de devis pour les artisans du bâtiment : catalogue de prestations, calculs exacts (HT, TVA par taux, TTC, marge interne), contrôle des mentions obligatoires, PDF professionnel figé à l'émission, envoi par e-mail, consultation et acceptation en ligne par le client, relances et suivi.

Auteur : BAILLY emmanuel

## Fonctions de la version 1

- Comptes : inscription, vérification de l'e-mail, connexion, mot de passe oublié, sessions par appareil, export complet des données, suppression encadrée (30 jours).
- Entreprise : identité, SIRET contrôlé, assurance décennale, conditions, logo et signature, modèles de PDF, numérotation, historique des modifications.
- Équipe : rôles propriétaire, administrateur et membre ; invitations ; plusieurs entreprises par utilisateur.
- Clients : particuliers, entreprises, copropriétés ; détection des doublons ; adresse de chantier ; étiquettes ; import et export CSV.
- Catalogue : prix de vente et coût interne, TVA par défaut, favoris, historique des prix, ajustement groupé, bibliothèques par métier (tarifs indicatifs signalés), import et export CSV.
- Devis : éditeur par sections, lignes libres, lignes « à compléter », notes, glisser-déposer, sauvegarde automatique avec détection des conflits, aperçu PDF, contrôles avant émission, versions figées avec empreinte, comparaison de versions, duplication, remplacement, annulation, archivage.
- Assistant de préparation : transforme la description d'un chantier en lignes proposées, à partir du catalogue en priorité ; chaque estimation est signalée ; rien n'est ajouté sans validation.
- Client final : lien sécurisé, temporaire et révocable ; consultation sur téléphone ; acceptation avec « Bon pour accord » tracée (nom, date, adresse IP, empreinte du document) ou refus motivé.
- Suivi : tableau de bord, historique de chaque devis, relances automatiques paramétrables, boîte d'envoi.
- Abonnements : offres Découverte, Indépendant, Professionnel et Entreprise, essai de 14 jours, limites par offre, factures, période de grâce, lecture seule sans perte de données.
- Administration : indicateurs, recherche de comptes, accès support temporaire et journalisé, suspension, gestion des offres, erreurs techniques, journal d'audit, notes de version.

Le détail action par action est dans [docs/PLAN-ACTIONS.md](docs/PLAN-ACTIONS.md) et les règles de calcul dans [docs/CALCULS.md](docs/CALCULS.md).

## Services en mode simulé

Ces services fonctionnent sans compte externe, derrière des interfaces remplaçables :

| Service | Mode actuel | Pour la mise en production |
| --- | --- | --- |
| E-mails | boîte d'envoi interne (page « E-mails envoyés ») | compte chez un service d'envoi d'e-mails |
| Paiement | simulateur avec webhooks signés (carte 4242 4242 4242 4242 acceptée, 4000 0000 0000 0002 refusée) | compte marchand Stripe |
| Assistant de préparation | moteur local à règles, sans envoi de données à un tiers | facultatif : service externe d'analyse de texte |
| Signature électronique | non incluse (acceptation tracée en ligne) | prestataire de signature, prévu en version 1.5 |

## Démarrer en local

Prérequis : Node.js 22.

```bash
npm install
cp .env.example .env.local
npm run db:seed     # base de démonstration
npm run dev         # http://localhost:3000
```

Sans `DATABASE_URL`, une base PostgreSQL embarquée est créée dans `./data/pglite`. Pour une base PostgreSQL classique, renseignez `DATABASE_URL=postgres://...` puis lancez `npm run db:migrate`.

Comptes de démonstration (mot de passe `Demo2026Pilot`) :

- artisan : `demo@pilot-makers.fr`
- administrateur de la plateforme : `admin@pilot-makers.fr` (à déclarer dans `PLATFORM_ADMIN_EMAILS`)

## Vérifications

```bash
npm run verify      # textes, types, tests
npm run build && npm run test:e2e   # parcours complet dans un navigateur (Playwright)
npm run build       # build de production
```

Les tests couvrent les calculs (arrondis, remises, TVA multiples, franchise, limites), l'isolation entre entreprises, les versions et l'intégrité des devis, les comptes, l'abonnement et l'assistant.

## Tâches planifiées

À appeler régulièrement avec l'en-tête `Authorization: Bearer <CRON_SECRET>` :

- `POST /api/cron/reminders` : relances des devis envoyés (toutes les heures) ;
- `POST /api/cron/maintenance` : fin d'essai, échéances d'abonnement, purge des comptes supprimés (une fois par jour).

## Hébergement

L'application a besoin d'un serveur Node.js et d'une base PostgreSQL : elle ne peut pas être publiée sur GitHub Pages. Toute plateforme acceptant Next.js et PostgreSQL convient (hébergeur en Europe recommandé pour les données des clients).

## Technique

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, PostgreSQL (requêtes SQL paramétrées, isolation par entreprise sur chaque requête), pdf-lib, zod, vitest.

## Avertissement

Les contrôles de conformité aident à ne rien oublier mais ne constituent pas un conseil juridique. Les règles propres à chaque métier et les taux de TVA réduits doivent être validés par un professionnel compétent.
