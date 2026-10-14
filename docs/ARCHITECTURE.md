# Architecture technique de Pilot-Makers

Ce document décrit comment l'application est construite, où se trouve chaque chose et les règles qui la tiennent cohérente. Il s'adresse à toute personne qui reprend le code. Les calculs de prix sont détaillés à part dans [CALCULS.md](CALCULS.md).

## Vue d'ensemble

```
Navigateur (pages React, formulaires, PDF)
        |
Next.js (App Router) : pages serveur, actions de formulaire, routes /api
        |
Services métier (src/lib/services) : règles, droits, journal, transactions
        |
Base PostgreSQL (serveur en production, PGlite embarquée en démonstration et en test)
```

Une seule application Node.js porte tout : l'interface, l'API interne, l'API publique `/api/v1` et les tâches planifiées. Il n'y a pas de service séparé à déployer.

| Couche | Choix | Pourquoi |
| --- | --- | --- |
| Interface | Next.js 16, React 19, Tailwind 4 | rendu côté serveur, pages légères sur téléphone de chantier |
| Validation | zod | une seule définition pour le formulaire, l'API et le service |
| Base | PostgreSQL ; PGlite sans `DATABASE_URL` | même SQL partout, démarrage sans installation |
| PDF | pdf-lib | PDF produits en JavaScript pur, sans navigateur ni service externe |
| Tests | vitest, Playwright avec axe | règles métier, parcours complets et accessibilité |

## Arborescence

| Dossier | Contenu |
| --- | --- |
| `src/app/(public)` | site public : accueil, tarifs, aide, pages légales, inscription, connexion |
| `src/app/app` | application de l'entreprise (devis, factures, chantiers, planning, réglages) |
| `src/app/admin` | administration de la plateforme (comptes, journal scellé, statut) |
| `src/app/d`, `src/app/espace`, `src/app/st` | pages sans compte : devis du client, espace client, réponse d'un sous-traitant |
| `src/app/api` | routes JSON ; `api/v1` pour l'API publique, `api/public` pour les pages sans compte, `api/cron` pour les tâches planifiées |
| `src/app/actions.ts` | actions de formulaire (server actions) qui appellent les services |
| `src/components` | composants d'interface partagés (icônes SVG, fenêtres, éditeur de devis, cadre de signature) |
| `src/lib/services` | toute la logique métier, un fichier par domaine |
| `src/lib/calc` | moteur de calcul des devis et factures (entiers, aucun nombre à virgule) et métrés |
| `src/lib/pdf` | mise en page des devis, factures, procès-verbaux, traductions |
| `src/lib/db` | connexion, transactions et migrations numérotées |
| `src/lib/server` | session, contexte de requête, enveloppe des routes API |
| `tests` | tests unitaires et d'intégration (`*.test.ts`), parcours navigateur (`e2e`) |
| `scripts` | migrations, données de démonstration, contrôles des textes et des secrets |

## Cycle d'une requête

1. **Session.** Le cookie `pm_session` porte un jeton aléatoire ; seule son empreinte est stockée (table `sessions`). `getCtx` (`src/lib/server/session.ts`) construit le contexte `Ctx` : utilisateur, entreprise, rôle, fonction, abonnement, base.
2. **Droits.** Chaque service reçoit `Ctx` et vérifie lui-même ce qu'il faut : `requireWritable` (abonnement actif), `requireRole`, `requirePermission` (`settings`, `billing`, `costs`, `staff`). Une page qui masque un bouton ne suffit jamais : le service refuse aussi.
3. **Isolement des entreprises.** Toutes les requêtes SQL portent `org_id = $n`. Un identifiant d'une autre entreprise donne « introuvable », jamais une erreur de droits qui confirmerait son existence.
4. **Validation.** Les entrées passent par un schéma zod dans le service. Les messages d'erreur sont en français et destinés à l'utilisateur.
5. **Transaction.** Les opérations à plusieurs écritures passent par `db.transaction`. Les lignes à protéger d'une modification concurrente sont lues `FOR UPDATE` ; les brouillons portent un numéro de révision.
6. **Réponse.** Les routes sont enveloppées par `api()` : authentification, conversion des erreurs `HttpError` en JSON `{ error, code }` avec le bon statut, journal des erreurs inattendues.

## Données

- Les montants sont des entiers en centimes, les taux en points de base (10 % = 1000). Les quantités sont des chaînes décimales converties par `src/lib/calc/decimal.ts`.
- Les migrations sont des fichiers TypeScript numérotés dans `src/lib/db/migrations`, enregistrés dans `migrate.ts` et appliquées une seule fois, dans l'ordre, au démarrage. Une migration publiée n'est jamais modifiée : on en ajoute une nouvelle.
- Les secrets des entreprises (clés de prestataires) sont chiffrés au repos en AES-256-GCM avec une clé dérivée de `APP_SECRET` (`src/lib/secret-box.ts`).
- Les documents émis sont figés : chaque version de devis et chaque facture garde son instantané JSON, son PDF et l'empreinte SHA-256 du PDF. Une correction passe par une nouvelle version, un avenant ou un avoir, jamais par une modification.
- Le journal d'audit (`audit_logs`) trace les actions sensibles. Les actions d'administration sont en plus chaînées dans `admin_journal` : chaque entrée contient l'empreinte de la précédente, et un déclencheur interdit modification et suppression.

## Documents et preuves

- Émettre un devis attribue un numéro définitif sans trou, fige l'instantané et produit le PDF (`src/lib/pdf/quote-pdf.ts`).
- L'acceptation (en ligne, enregistrée par l'entreprise ou signée sur l'écran de l'artisan) écrit un événement dans `document_events` avec l'adresse IP, le navigateur, l'empreinte du PDF et, pour une signature dessinée, l'empreinte de l'image.
- L'exemplaire accepté est recalculé à la demande à partir de l'instantané et de ces preuves ; le PDF émis d'origine ne change jamais.
- Les factures suivent la même logique, avec les exports comptables (FEC) et la facture structurée (Factur-X) produits depuis les données figées.

## Échanges avec l'extérieur

| Sujet | Fonctionnement | Réglage |
| --- | --- | --- |
| E-mails | enregistrés dans `emails` puis confiés au prestataire ; sans prestataire, conservés dans la boîte d'envoi visible dans l'application | `MAIL_PROVIDER`, `MAIL_API_KEY`, `MAIL_FROM` |
| Webhooks | file `webhook_deliveries`, signature HMAC, nouveaux essais espacés (8 au plus) | tâche `POST /api/cron/webhooks` |
| Paiement | simulateur signé en démonstration, prestataire réel ensuite | `BILLING_PROVIDER`, `BILLING_WEBHOOK_SECRET` |
| Géocodage | service public de la Géoplateforme, remplaçable ou désactivable | `GEOCODER`, `GEOCODER_URL` |
| Alertes | erreurs groupées vers un canal d'équipe, sans donnée personnelle | `ALERT_WEBHOOK_URL` |

Les appels sortants passent par des fonctions injectables pour que les tests ne dépendent d'aucun réseau.

## Tâches planifiées

Trois routes protégées par `CRON_SECRET` sont appelées par le planificateur de l'hébergeur :

- `POST /api/cron/reminders` toutes les heures : relances des devis et des factures ;
- `POST /api/cron/webhooks` toutes les minutes : envois en attente et nouveaux essais ;
- `POST /api/cron/maintenance` une fois par jour : fins d'essai, échéances d'abonnement, purges, vérification du journal scellé, remise à zéro de la démonstration si `DEMO_RESET=1`.

Chaque tâche est idempotente : un double appel ne double ni un e-mail ni une écriture.

## Sécurité

- Mots de passe hachés avec bcrypt ; double authentification TOTP, obligatoire pour les administrateurs de la plateforme si `REQUIRE_ADMIN_2FA` est actif.
- Limitation de débit par adresse IP et par clé (`src/lib/rate-limit.ts`), stockée en base pour fonctionner sur plusieurs instances.
- En-têtes de sécurité et politique de contenu (CSP) dans `next.config.ts`.
- Liens publics (devis, espace client, sous-traitant) : jetons aléatoires dont seule l'empreinte est stockée, durée limitée, révocables.
- Clés de l'API publique : préfixe `pm_`, empreinte SHA-256 seule en base, droits de lecture ou d'écriture.
- Contrôles automatiques à chaque modification : secrets écrits par erreur (`npm run check:secrets`), failles connues des dépendances livrées (`npm audit`, aussi chaque lundi), propositions de mise à jour hebdomadaires (`.github/dependabot.yml`).

## Fonctionnalités progressives

Les nouveautés sont déclarées dans `src/lib/features.ts` et ouvertes à un pourcentage stable d'entreprises (`FEATURE_<CLE>`). L'administration peut forcer une fonctionnalité pour un compte. Le journal des nouveautés (`src/lib/changelog.ts`) n'affiche que ce qui est ouvert.

## Qualité

| Commande | Rôle |
| --- | --- |
| `npm run verify` | textes (pas de tiret cadratin ni d'emoji), secrets, types, tests unitaires |
| `npm run build` | compilation de production |
| `npm run test:e2e` | parcours complets dans Chromium, avec analyse d'accessibilité |
| `npm run pdf:apercus` | images des PDF pour relecture visuelle |

La CI GitHub (`.github/workflows/ci.yml`) lance les contrôles de sécurité, puis la vérification et la compilation, puis les parcours navigateur ; les aperçus des PDF sont joints à chaque exécution.

## Ajouter une fonctionnalité

1. Migration numérotée si de nouvelles données sont nécessaires.
2. Service dans `src/lib/services` : schéma zod, droits, `org_id` partout, transaction, `audit()` pour les actions sensibles.
3. Route API ou action de formulaire, puis écran.
4. Tests du service dans `tests`, parcours navigateur si l'écran est nouveau.
5. Article d'aide (`src/lib/help.ts`), entrée des nouveautés (`src/lib/changelog.ts`), ligne du plan d'actions (`docs/PLAN-ACTIONS.md`).

## Bogues corrigés et tests permanents

Chaque bogue corrigé ajoute un test permanent qui échoue sans la correction. La correction est inscrite dans
`src/lib/quality/regressions.json` (identifiant R-NNN, date, type produit ou test, symptôme vu par l'utilisateur,
correction, fichier et nom exact du test). `npm run check:regressions`, lancé par l'intégration continue, vérifie
que chaque test référencé existe toujours. La liste est publiée sur la page publique `/qualite`.

## Tests de mutation des calculs

`npm run test:mutation` introduit volontairement une erreur à la fois dans le moteur de calcul (opérateur inversé,
borne décalée, constante modifiée), relance les tests de calcul et compte les erreurs qu'ils détectent. Un mutant
qui survit signale un comportement que rien ne vérifie : on ajoute alors un test qui l'aurait vu
(`tests/calc-mutation.test.ts`). Le rapport est écrit dans `docs/MUTATION.md`, avec la liste des survivants ; les
mutants équivalents (qui ne changent aucun résultat) y sont signalés comme tels. Options : `--files`, `--tests`,
`--max`, `--report`, `--dry`. La campagne tourne aussi chaque mois et à la demande dans l'intégration continue
(`.github/workflows/mutation.yml`), sans bloquer les mises en ligne.

## Sauvegarde et reprise après sinistre

`src/lib/db/backup.ts` sauvegarde toute la base en JSON produit par PostgreSQL (une empreinte SHA-256 par table) et
la restaure dans une base neuve avec `json_populate_recordset`, tables dans l'ordre de leurs références, compteurs
remis après le plus grand identifiant. `npm run reprise` rejoue l'exercice complet et écrit `docs/REPRISE.md` ; la
procédure est dans `docs/PLAN-REPRISE.md`.
