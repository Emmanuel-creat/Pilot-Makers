# Pilot-Makers : liste d'actions complète

Ce document découpe le cahier des charges en actions concrètes, de A à Z.
Statut : [x] fait, [~] fait avec un service simulé (à brancher sur un vrai prestataire), [ ] à faire.

## 0. Socle et outillage
- [x] 0.1 Projet Next.js, TypeScript strict, Tailwind CSS
- [x] 0.2 Base PostgreSQL ; base embarquée (PGlite) quand aucune `DATABASE_URL` n'est fournie, pour démarrer sans installation
- [x] 0.3 Migrations SQL versionnées et exécutées au démarrage
- [x] 0.4 Données de démonstration (entreprise, clients, catalogue, devis)
- [x] 0.5 Tests automatisés (Vitest) et intégration continue GitHub Actions
- [x] 0.8 Tests du parcours complet dans un vrai navigateur (Playwright), exécutés en intégration continue
- [x] 0.6 Contrôle des textes : aucun tiret cadratin, aucun emoji dans le dépôt
- [x] 0.7 Icônes dessinées en SVG, sans bibliothèque d'emojis

## A. Comptes et sécurité (module A)
- [x] A.1 Inscription e-mail et mot de passe (hachage bcrypt)
- [x] A.2 Vérification de l'adresse e-mail par lien à usage unique
- [x] A.3 Connexion, déconnexion, sessions en base (jeton haché, cookie httpOnly)
- [x] A.4 Réinitialisation du mot de passe par lien temporaire
- [ ] A.5 Connexion par fournisseur d'identité externe (option, V1.5)
- [x] A.6 Création automatique de l'espace entreprise à l'inscription
- [x] A.7 Langue et fuseau horaire
- [x] A.8 Acceptation des CGU, accès à la politique de confidentialité
- [x] A.9 Suppression du compte encadrée (demande, délai, confirmation)
- [x] A.10 Export des données du compte (JSON)
- [x] A.11 Liste des sessions et appareils, révocation
- [x] A.12 Limitation des tentatives de connexion
- [x] A.15 Double authentification (application TOTP, codes de secours), obligatoire pour l'administration en production
- [x] A.16 En-têtes de sécurité stricts (CSP, HSTS, COOP, Permissions-Policy)
- [x] A.13 Isolation stricte par entreprise, contrôlée côté serveur sur chaque objet
- [x] A.14 Rôles (propriétaire, administrateur, membre) et limites d'abonnement côté serveur

## B. Profil de l'entreprise
- [x] B.1 Tous les champs du cahier des charges (nom, forme, SIREN/SIRET avec clé de Luhn, TVA intracom, assurance, banque, régime de TVA, conditions, préfixe)
- [x] B.2 Logo et image de signature (import d'image)
- [x] B.3 Historique des modifications du profil
- [x] B.4 Photographie du profil figée dans chaque version de devis émise

## C. Clients
- [x] C.1 Fiche complète (type, identité, adresses facturation et chantier, contacts, SIREN, TVA, notes internes, étiquettes, préférences)
- [x] C.2 Création, modification, archivage, recherche
- [x] C.3 Détection des doublons (e-mail, téléphone, SIREN, nom)
- [x] C.4 Import CSV avec aperçu et validation, export CSV
- [x] C.5 Création d'un client depuis l'éditeur de devis
- [x] C.6 Historique des devis du client
- [x] C.7 Coordonnées historiques figées dans les devis émis

## D. Catalogue
- [x] D.1 Tous les champs (référence unique, unité, coût interne, prix de vente, TVA, fournisseur, durée, validité, actif)
- [x] D.2 Catégories, recherche instantanée, favoris, plus utilisés
- [x] D.3 Duplication, archivage
- [x] D.4 Import et export CSV
- [x] D.5 Mise à jour groupée des tarifs (pourcentage)
- [x] D.6 Historique des changements de prix
- [x] D.7 Création d'un élément depuis un devis
- [x] D.8 Bibliothèques de modèles fournies (tarifs indicatifs datés et sourcés)
- [x] D.9 Coût interne jamais présent dans le PDF client
- [x] D.10 Ouvrages composés : prix et coût recalculés depuis leurs composants

## E. Devis
- [x] E.1 Informations générales (numéro, dates, validité, client, chantier, objet, auteur, conditions, acompte, durée, démarrage)
- [x] E.2 Lignes : catalogue ou libre, quantité, unité, prix, remise, TVA, nature, description
- [x] E.3 Réorganisation par glisser-déposer, duplication, suppression
- [x] E.4 Sections (lots) avec sous-totaux et description
- [x] E.5 Lignes à compléter et notes techniques non chiffrées
- [x] E.6 Sauvegarde automatique du brouillon, alerte avant fermeture
- [x] E.7 Duplication d'un devis
- [x] E.11 Annuler et rétablir dans l'éditeur (Ctrl+Z, Ctrl+Maj+Z)
- [x] E.12 Modèles de devis réutilisables
- [x] E.8 Versions : émission figée, nouvelle version à la modification, comparaison entre versions
- [x] E.9 Interdiction de modifier une version émise ou acceptée
- [ ] E.10 Pièces jointes (stockage objet privé, V1.5)

## F. Moteur de calcul
- [x] F.1 Moteur pur, partagé par l'interface, le serveur et le PDF
- [x] F.2 Montants en centimes entiers (BigInt), quantités en millièmes, remises en points de base
- [x] F.3 Règle d'arrondi documentée (demi vers l'extérieur, par ligne puis TVA par taux)
- [x] F.4 Ventilation de la TVA par taux, remise globale optionnelle
- [x] F.5 Refus des valeurs négatives ou invalides
- [x] F.6 Recalcul serveur avant émission, contrôle d'égalité avec le PDF
- [x] F.7 Marge prévisionnelle : taux de marge sur vente et taux de majoration, distingués
- [x] F.8 Jeu de tests de référence (cas 7.2 du cahier des charges)

## G. Assistant de préparation (V1.5)
- [~] G.1 Description libre vers sections et lignes proposées (moteur local à règles, remplaçable par un service externe d'analyse de texte)
- [~] G.2 Questions de clarification et informations manquantes
- [~] G.3 Quantités estimées toujours signalées comme à vérifier
- [x] G.4 Jamais d'émission automatique, quota d'usage par abonnement, mesure dans `usage_events`
- [ ] G.5 Dictée vocale (V1.5)

## H. PDF
- [x] H.1 PDF A4 multipage : logo, coordonnées, client, chantier, lignes, sections, remises, TVA par taux, totaux, conditions, validité, mentions, pagination, zone d'acceptation
- [x] H.2 Plusieurs modèles graphiques sans perte d'information obligatoire
- [x] H.3 Version figée à l'émission, empreinte SHA-256 conservée

## I. Envoi et suivi
- [x] I.1 Statuts : brouillon, à compléter, prêt, envoyé, consulté (lien sécurisé seulement), accepté, refusé, expiré, annulé, remplacé
- [~] I.2 Envoi par e-mail avec PDF : Brevo, Postmark ou Resend prêts (MAIL_PROVIDER, MAIL_API_KEY, MAIL_FROM), boîte d'envoi simulée tant qu'aucune clé n'est fournie ; suivi des événements par webhook
- [x] I.3 Modèles de messages personnalisables
- [x] I.4 Historique des envois et des événements
- [x] I.5 Lien client sécurisé, temporaire et révocable
- [x] I.6 Acceptation ou refus en ligne rattachés à la version, preuves conservées (date, IP, navigateur, nom saisi)
- [ ] I.7 Signature électronique via un prestataire (V1.5)

## J. Tableau de bord
- [x] J.1 Compteurs par statut, devis arrivant à expiration
- [x] J.2 Montants en cours et acceptés sur la période, taux d'acceptation, délai moyen de réponse
- [x] J.3 Activité récente ; aucun mélange avec du chiffre d'affaires encaissé

## K. Relances (V1.5)
- [x] K.1 Paramètres : délai, nombre, message, jours et heures, arrêt automatique
- [~] K.2 Exécution planifiée (route de traitement à appeler par une tâche planifiée)

## L. Abonnements
- [x] L.1 Offres Découverte, Indépendant, Professionnel, Entreprise configurables en administration
- [~] L.2 Paiement via prestataire (simulateur ; interface prête pour Stripe)
- [x] L.3 Webhooks signés (HMAC) et idempotents
- [x] L.4 Essai, période de grâce, changement de formule, annulation
- [x] L.5 Accès conservé en lecture et export après arrêt du paiement

## M. Administration
- [x] M.1 Recherche de comptes, état d'abonnement, offres
- [x] M.2 Journal technique et d'audit, erreurs PDF
- [x] M.3 Coûts de l'assistant et des e-mails par compte
- [x] M.4 Suspension documentée d'un compte
- [x] M.5 Accès support aux données métier : justifié, limité dans le temps, journalisé

## Conformité
- [x] N.1 Contrôle des mentions obligatoires avant émission (erreurs bloquantes et avertissements)
- [x] N.2 Mentions conditionnelles (assurance décennale, franchise de TVA, déplacement, taux horaire)
- [x] N.3 Modèle de données prêt pour la facturation électronique (V2)
- [x] N.4 Pages CGU, confidentialité, sous-traitants (modèles à faire valider par un juriste)

## O. Facturation
- [x] O.1 Factures d'acompte (pourcentage, ventilation par taux de TVA)
- [x] O.2 Facture de solde avec déduction des acomptes
- [x] O.3 Avoirs totaux ou partiels
- [x] O.4 Encaissements (virement, chèque, espèces, carte), annulation tracée
- [x] O.5 Envoi par e-mail avec PDF, relances automatiques des factures échues
- [x] O.6 Numérotation continue sans trou, PDF figé et empreinte SHA-256
- [x] O.7 Export FEC pour l'expert-comptable
- [ ] O.8 Dépôt sur une plateforme agréée de facturation électronique (compte à ouvrir)

## V2 (non commencé)
- [ ] Chantiers, achats, marges réelles, équipe, synchronisation bancaire et comptable

## Feuille de route : actions réalisées
Numéros de la feuille de route complète (360 actions).
- Vague 1 (12/10/2026) : 22, 23, 24, 25, 29, 31, 59, 60, 61, 62, 123 (prêt, en attente d'une clé), 143 à 149, 215, 297.
