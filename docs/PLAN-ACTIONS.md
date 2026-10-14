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
- [x] 0.9 Contrôle de l'apparence des PDF (empreintes de référence) et aperçus en image publiés par l'intégration continue (`npm run pdf:apercus`)
- [x] 0.11 Accessibilité (analyse automatique WCAG 2.2 AA) et affichage sur petit téléphone testés dans le navigateur
- [x] 0.10 Surveillance : erreurs journalisées, alertes regroupées vers un canal d'équipe (ALERT_WEBHOOK_URL), sonde `/api/health` détaillée avec HEALTH_TOKEN
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
- [x] A.17 Coordonnées bancaires chiffrées au repos (AES-256-GCM, clé dérivée de APP_SECRET)
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
- [x] D.8 Bibliothèques fournies pour 15 métiers (tarifs indicatifs datés), celle du métier de l'entreprise en premier
- [x] D.9 Coût interne jamais présent dans le PDF client
- [x] D.10 Ouvrages composés : prix et coût recalculés depuis leurs composants
- [x] D.11 Recherche tolérante aux fautes de frappe et aux accents

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
- [x] G.6 Reconnaissance de 15 métiers, questions et points de contrôle propres à chaque métier
- [x] G.7 Explication de chaque ligne proposée (passage de la description, source du prix, conseil)
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
- [x] I.8 Exemplaire accepté du PDF : « Bon pour accord », nom, date et empreinte du devis, pour l'artisan et le client
- [x] I.9 Avis à l'artisan à la première ouverture du devis par le client
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
- [x] M.6 Centre d'aide public : 18 guides pas à pas, recherche, liens vers les écrans

## Conformité
- [x] N.1 Contrôle des mentions obligatoires avant émission (erreurs bloquantes et avertissements)
- [x] N.2 Mentions conditionnelles (assurance décennale, franchise de TVA, déplacement, taux horaire)
- [x] N.3 Modèle de données prêt pour la facturation électronique (V2)
- [x] N.4 Pages CGU, confidentialité, sous-traitants, mentions légales, cookies (modèles à faire valider par un juriste)
- [x] N.5 Droit de rétractation de 14 jours pour les contrats hors établissement : mention, formulaire détachable, alerte sur l'acompte, demande de démarrage anticipé
- [x] N.7 Archive non modifiable : versions émises et factures protégées en base contre toute modification ou suppression
- [x] N.8 Médiateur de la consommation imprimé sur les devis aux particuliers, alerte s'il manque
- [x] N.6 Attestation du client pour les taux réduits de TVA, sur le PDF et à l'acceptation en ligne, conservée dans les preuves

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
- Vague 2 (12/10/2026) : 41, 42, 43, 44, 86, 87, 106.
- Vague 3 (12/10/2026) : 10, 11, 298, 313 ; 311 et 312 (grille tarifaire, essai sans carte) existaient déjà.
- Vague 4 (12/10/2026) : 176, 196, 197, 260, 279, 280, 389, 449 (contrôle automatique ; un audit manuel reste à prévoir).
- Vague 5 (12/10/2026) : 211, 214, 464, 465.
- Vague 6 (12/10/2026) : 181, 183, 200, 201 ; 180 (sessions actives) et 204 (indemnité de 40 euros) existaient déjà.
- Vague 7 (12/10/2026) : 226, 289, 312.
- Vague 8 (12/10/2026) : 216 (options au choix du client, facturées selon son choix), 227.
- Vague 9 (12/10/2026) : 244, 264 (étiquettes ; familles et sous-familles existaient), 267.
- Vague 10 (12/10/2026) : 286, 287.
- Vague 11 (12/10/2026) : 307.
- Vague 12 (12/10/2026) : 308.
- Vague 13 (12/10/2026) : 310.
- Vague 14 (12/10/2026) : 265, 266.
- Vague 15 (12/10/2026) : 162.
- Vague 16 (12/10/2026) : 288.
- Vague 17 (12/10/2026) : 245, 246.
- Vague 18 (12/10/2026) : 217, 219.
- Vague 19 (12/10/2026) : 406, 407, 408, 409, 410, 411.
- Vague 20 (12/10/2026) : 199 (Factur-X EN 16931, XML CII et UBL ; copie PDF non strictement PDF/A-3, à valider avec la plateforme retenue).
- Vague 21 (13/10/2026) : 390 (application installable), 395 (contraste renforcé et grands boutons), 451 (thème et taille du texte réglables).
- Vague 22 (13/10/2026) : 202 (révision de prix sur index BT : clause au devis, valeurs d'index saisies, ligne de révision par taux sur situations et solde).
- Vague 23 (13/10/2026) : 435 (webhooks signés : devis signé, facture payée, client créé ; file d'envoi avec nouveaux essais).
- Vague 24 (13/10/2026) : 469 (activation progressive par entreprise), 470 (journal des nouveautés avec compteur de non lues).
- Vague 25 (13/10/2026) : 322 (devis signé transformé en chantier avec tâches), 326 (fiche chantier : adresse, accès, codes chiffrés, contacts), 328 (avancement par lot et par ligne).
- Vague 26 (13/10/2026) : 327 (journal de chantier avec photos datées et géolocalisées), 329 (procès-verbal de réception signé sur l'écran, avec réserves), 330 (levée des réserves et procès-verbal de levée).
- Vague 27 (13/10/2026) : 323 (planning de l'entreprise : équipes et véhicules, semaine et mois), 324 (glisser-déposer avec détection des conflits).
- Vague 28 (13/10/2026) : 437 (export complet en formats ouverts : archive ZIP avec tableaux CSV, PDF émis, photos de chantier et JSON).
- Vague 29 (13/10/2026) : 436 (import des clients et du catalogue depuis Excel .xlsx, LibreOffice .ods et CSV Windows, colonnes des autres logiciels reconnues).
- Vague 30 (13/10/2026) : 434 (API publique v1 : clés d'accès en lecture ou écriture, limite de 120 requêtes par minute, clients, devis, factures et PDF, catalogue, chantiers, description OpenAPI).
- Vague 31 (13/10/2026) : 438 (connexion aux outils d'automatisation Zapier, Make et n8n : abonnement et désabonnement par l'API, exemples de données, retrait automatique sur réponse 410 ou révocation de la clé).
- Vague 32 (13/10/2026) : 360 (pointage des heures par chantier sur téléphone : chronomètre, position, saisie après coup), 361 (feuilles de temps validées par l'encadrement, export mensuel pour la paie avec heures supplémentaires à 25 % et 50 %).
- Vague 33 (13/10/2026) : 346 (achats et heures affectés à un chantier), 347 (marge réelle comparée à la marge prévue, ligne par ligne), 348 (alerte de dépassement de budget sur le chantier et le tableau de bord).
- Vague 34 (13/10/2026) : 343 (bons de commande fournisseurs préparés depuis le devis signé, un par fournisseur, PDF), 344 (réception partielle ou totale des livraisons, facture fournisseur rapprochée de la marchandise reçue puis ajoutée aux achats du chantier).
- Vague 35 (13/10/2026) : 325 (abonnement d'agenda au format iCalendar pour Google Agenda, Outlook et Apple : lien secret par personne, chantiers planifiés, échéances de factures et de devis, réserves et livraisons pour l'encadrement).
- Vague 36 (13/10/2026) : 362 (sous-traitants : fiches, attestation de vigilance URSSAF et assurance décennale avec dates de fin, alertes au tableau de bord, demande et relance automatique par e-mail, obligation de vigilance au-delà de 5 000 euros HT sur chaque chantier). L'export complet inclut désormais pointages, achats, commandes et sous-traitants.
- Vague 37 (13/10/2026) : 364 (notes de frais par photo : saisie sur le téléphone, validation ou refus par l'encadrement, ajout aux achats du chantier en HT, remboursement, récapitulatif et export CSV du mois).
- Vague 38 (13/10/2026) : 359 (droits par fonction : gérant, conducteur de travaux, secrétariat, ouvrier ; quatre domaines de droits, réglages, facturation, coûts et équipe, contrôlés côté serveur et dans les écrans).
- Vague 39 (13/10/2026) : 282 (espace client par lien personnel : devis, factures, procès-verbaux, réponse aux devis en attente), 283 (messagerie rattachée au devis, réponse par e-mail, alerte au tableau de bord), 284 (demande de modification ciblant une ligne du devis, suivie jusqu'à son traitement).
- Vague 40 (13/10/2026) : 363 (devis demandés aux sous-traitants par lien sécurisé, réponse en ligne avec montant, délai et devis joint, saisie manuelle, comparaison, intégration au devis client en ligne de sous-traitance avec coût et marge).
- Vague 41 (13/10/2026) : 331 (itinéraires et temps de trajet : chantiers localisés par l'adresse ou par la position relevée sur place, tournée de chaque personne dans l'ordre conseillé, kilomètres et durées estimés, itinéraire ouvert dans l'application de navigation).
- Vague 42 (13/10/2026) : 218 (métrés intégrés : surfaces, murs d'une pièce, volumes, linéaires et plinthes à partir des cotes, ouvertures déduites, détail du calcul, quantité et unité reportées sur la ligne, métré conservé avec la ligne et jamais imprimé).
- Vague 43 (13/10/2026) : 223 (mises en page du PDF de devis : détaillée, récapitulatif par lot en tête, un lot par page avec récapitulatif des lots ; choix enregistré avec le devis et figé dans la version émise ; factures inchangées).
- Vague 44 (13/10/2026) : 184 (journal scellé des actions d'administration : chaîne d'empreintes SHA-256, modification et suppression refusées par la base, vérification quotidienne avec alerte, empreinte affichée pour preuve externe), 160 (page de statut publique /statut et /api/status : état mesuré de l'application, des e-mails et des pages publiques, incidents et maintenances publiés par l'administration).
- Vague 45 (13/10/2026) : 452 (copies traduites du devis en anglais, espagnol, portugais et allemand : textes fixes, colonnes, totaux, TVA, unités et zone d'acceptation traduits, mention en tête que seule la version française émise fait foi ; liens sur la page du devis et sur la page du client).
- Vague 46 (13/10/2026) : 394 (signature du client au doigt sur l'écran de l'artisan : accord, attestation de TVA réduite et rappel de rétractation, signature conservée avec son empreinte et reportée sur l'exemplaire accepté, envoi de l'exemplaire au client par e-mail).
- Vague 47 (13/10/2026) : 182 (contrôle des secrets écrits par erreur à chaque modification et dans la vérification locale, audit des failles des dépendances livrées en CI et chaque lundi, mises à jour proposées chaque semaine) et 471 (documentation de l'architecture technique dans docs/ARCHITECTURE.md).
- Vague 48 (13/10/2026) : 224 (lots regroupés par bâtiment, étage ou zone, avec sous-totaux sur deux niveaux dans l'éditeur, le PDF, le récapitulatif et la page du client) et 450 en partie (structure des totaux de l'éditeur et taille des commandes de ligne corrigées pour les lecteurs d'écran et le toucher).
- Vague 49 (13/10/2026) : 243 (questions de relance de l'assistant avec champ de réponse : surface, longueur, hauteur sous plafond, type de support, volume de gravats, fournitures et accès ; les réponses complètent la description et relancent la proposition, volume repris pour les lignes au mètre cube).
- Vague 50 (13/10/2026) : 421 (page vitrine publique générée depuis le profil : présentation, zone d'intervention, coordonnées au choix, assurance décennale, SIRET, formulaire de demande de devis versé dans les demandes entrantes avec alerte par e-mail et protection contre les robots) et 422 (galerie de réalisations depuis le journal de chantier, avec accord du client noté et photos publiées sans métadonnées ni nom du client).
- Vague 51 (13/10/2026) : 261 (import des fichiers de prix des négoces en CSV ou tableur, colonnes des formats courants comme FAB-DIS reconnues, prix net calculé depuis le prix public et la remise) et 263 (prix d'achat du catalogue mis à jour par référence fournisseur, historique conservé, ouvrages recalculés, alerte quand la marge passe sous le seuil choisi).
- Vague 52 (13/10/2026) : 485 (feuille de route publique avec votes anonymes des utilisateurs, un par personne et par sujet, gérée depuis l'administration) et 481 (accueil guidé prolongé jusqu'au premier devis envoyé).
- Vague 53 (13/10/2026) : 222 (personnalisation du PDF : police Helvetica ou Times, mise en page par défaut des nouveaux devis, mention en pied de page sur chaque page, aperçu du dernier devis avec ces réglages).
- Vague 54 (13/10/2026) : 203 (aides à la rénovation : qualifications RGE de l'entreprise, dispositifs MaPrimeRénov', CEE et éco-PTZ sur le devis, émission bloquée sans qualification valide pour chaque domaine, visite préalable, mentions et reste à charge estimé).
- Vague 55 (13/10/2026) : 379 (TVA préparée : TVA collectée à l'encaissement ventilée par taux, TVA déductible des notes de frais, mois ou trimestre, export tableur) et 380 (trésorerie prévisionnelle à 3 mois : solde et charges fixes saisis, factures à leur échéance, devis signés à facturer, TVA à reverser, frais à rembourser, alerte de découvert).
- Vague 56 (13/10/2026) : 377 (fonction Expert-comptable en lecture seule, hors utilisateurs de l'offre, page Comptabilité avec factures, TVA, trésorerie et FEC) et 378 (plan comptable de l'entreprise repris dans le FEC, ventilation du chiffre d'affaires par nature : prestations, fournitures, sous-traitance, déplacements).
- Vague 57 (13/10/2026) : 220 (photos annotées et croquis cotés joints au devis : trait libre, flèche, texte, trois couleurs, légende, ordre, métadonnées retirées, 8 images au plus, imprimés dans le PDF et figés à l'émission, inclus dans l'export).
- Vague 58 (13/10/2026) : 221 (fiches techniques, certificats, notices et fiches de données de sécurité déposés en PDF sur les articles, cités dans les mentions du devis émis et téléchargeables par le client réunis en un seul PDF avec sommaire ; documents jamais modifiés, gardés pour les devis émis, inclus dans l'export).
- Vague 59 (13/10/2026) : 468 (moteur de calcul couvert à 100 % par les tests, instructions, branches, fonctions et lignes, seuil bloquant dans la vérification et l'intégration continue) et 242 (dictée vocale de la description dans l'éditeur de devis et l'Assistant de préparation, ponctuation dictée, bouton masqué si le navigateur ne propose pas la reconnaissance vocale).
- Vague 60 (13/10/2026) : 163 (file de tâches en arrière-plan enregistrée dans la base, exécutée par POST /api/cron/jobs, nouveaux essais espacés de 1 minute à 6 heures, reprise des tâches interrompues, tâches abandonnées signalées et relançables depuis la page de statut ; e-mails refusés pour une raison passagère renvoyés automatiquement ; les PDF et les imports restent produits immédiatement car ils sont attendus à l'écran) et 164 (cache en mémoire des PDF traduits, exemplaires acceptés et documents réunis des versions émises, réponses 304 sur le PDF émis grâce à son empreinte ; correction de l'avis « mode démonstration » des e-mails affiché même avec un prestataire configuré).
- Vague 61 (13/10/2026) : 179 (clés d'accès WebAuthn sans dépendance : enregistrement dans Mon compte, connexion sans mot de passe depuis la page de connexion, vérification de l'utilisateur exigée, défis à usage unique de 5 minutes, contrôle du domaine, de l'origine et du compteur de signatures, 10 clés au plus, interdit à l'accès support, limite de tentatives par adresse ; test de bout en bout avec un authentificateur virtuel).
- Vague 62 (13/10/2026) : 185 (analyse des fichiers déposés avant enregistrement : photos de devis et de chantier, fiches techniques, notes de frais, documents et devis de sous-traitants, logo et signature ; contrôles intégrés sur le fichier de test EICAR, les PDF à contenu actif, flux compressés compris, et les images qui cachent du code ; moteur ClamAV branché par CLAMD_HOST, refus ou alerte s'il ne répond pas ; refus notés au journal d'audit).
- Vague 63 (13/10/2026) : 393 (notifications sur le téléphone par Web Push, sans dépendance : chiffrement de bout en bout RFC 8291 et signature VAPID RFC 8292, activation par appareil dans Mon compte, notification d'essai, envoi par la file de tâches avec nouveaux essais et oubli des appareils désabonnés ; devis consulté, accepté ou refusé, message client, réponse de sous-traitant et demande de devis ; clés VAPID créées et gardées chiffrées si absentes).
- Vague 64 (13/10/2026) : 466 (test de charge npm run charge : base remplie en masse, liste, recherche de devis, tableau de bord et recherche de clients mesurés une à une et en parallèle, échec au-delà de 300 ms au 95e centile ; 205 000 devis sur la base embarquée sous 80 ms ; le million de devis se lance sur Postgres par CHARGE_ORGS=10000) et 467 (budget de performance perf-budget.json contrôlé par les tests de bout en bout : poids des scripts par page et affichage complet en moins d'une seconde).
- Vague 65 (13/10/2026) : 482 (import assisté des clients et du catalogue depuis un ancien logiciel : écran de correspondance des colonnes avec un exemple de valeur, colonnes non reconnues désignées à la main ou ignorées, aperçu mis à jour à chaque choix, fichier sans aucune colonne reconnue désormais importable, alerte quand le fichier ressemble à l'autre import, guide de reprise des données).
- Vague 66 (13/10/2026) : 391 (devis modifiables sans réseau : copie locale de chaque modification non enregistrée, état « hors connexion » et envoi automatique au retour du réseau, reprise à la réouverture ou choix si le devis a changé ailleurs ; les 20 derniers devis ouverts restent consultables sans réseau grâce au service de l'application ; copies effacées à la déconnexion avec alerte s'il reste des modifications non envoyées ; création d'un nouveau devis sans réseau non couverte car le numéro et le client viennent du serveur).
- Vague 67 (13/10/2026) : 392 (mesures prises depuis l'application : cotes du métré dictées à la voix, nombres en chiffres ou en lettres, mètres et centimètres, virgule, hauteur, répétitions, portes et fenêtres rangées dans les ouvertures à déduire ; photos déjà prises depuis l'appareil photo du téléphone dans le devis, le journal de chantier et les notes de frais ; télémètres laser Bluetooth non couverts faute de protocole ouvert commun).
- Vague 68 (13/10/2026) : 345 (rapprochement bancaire par import de relevé, sans agrégateur : OFX, CAMT.053, CSV et tableurs des banques en ligne, opérations jamais importées deux fois ; virement citant le numéro de facture enregistré comme paiement automatiquement ; propositions pour les autres encaissements, même montant ou nom du client ; mise de côté, annulation d'un rapprochement ; page Banque, export inclus ; la connexion directe au compte bancaire attend le choix d'un agrégateur agréé).
- Vague 69 (13/10/2026) : 262 (lecture automatique des factures d'achat électroniques : PDF Factur-X ou ZUGFeRD, XML CII et UBL ; numéro, fournisseur, dates, montants HT, TVA et TTC repris dans la note de frais et dans le rapprochement des factures fournisseur d'un chantier ; une photo ou un PDF sans XML joint n'est pas lu, la reconnaissance de texte sur photo attend le choix d'un service).
- Vague 70 (13/10/2026) : 376 (export vers les logiciels comptables : notes de frais validées au journal NF avec TVA déductible et compte auxiliaire par salarié, remboursements au journal de banque, comptes de frais dans le plan comptable du cabinet ; format tableur CSV en plus du FEC, importables dans Pennylane, Sage, Cegid, EBP, Quadra et QuickBooks ; la synchronisation directe par interface attend l'accès partenaire de chaque éditeur).
- Vague 71 (13/10/2026) : 483 et 484 (assistance humaine : rappel téléphonique sur un créneau choisi, jours ouvrés des deux semaines à venir, un rappel en attente à la fois, annulation, issue affichée ; numéro de l'assistance affiché si SUPPORT_PHONE est défini ; séances de prise en main en ligne programmées par l'équipe, places limitées sans surréservation, confirmation par e-mail avec lien et invitation d'agenda, désinscription, annulation avec prévenance des inscrits ; file des rappels et liste des inscrits dans l'administration ; le numéro et l'outil de visioconférence restent à choisir).
- Vague 72 (13/10/2026) : demande de manu (menu personnalisable : chaque utilisateur choisit les briques de son menu, leur ordre et trois raccourcis de la barre du téléphone ; briques réservées à certains rôles jamais proposées aux autres ; retour au menu d'origine ; page Personnaliser le menu).
- Vague 73 (13/10/2026) : demande de manu (assistant vocal : demande dictée ou tapée, comprise par un moteur à règles local ; ouverture d'écran, recherche, création de client ou de devis avec client retrouvé, note de frais, paiement retrouvé par numéro de facture ou nom du client, questions sur les retards, l'encours, les devis en attente et la journée ; chaque action est préparée sans rien modifier, relue et corrigeable, puis exécutée seulement après confirmation, avec les droits de l'écran correspondant ; réponse à voix haute en option ; renvoi vers l'aide si la demande n'est pas comprise).
- Vague 74 (13/10/2026) : 423 (fiche d'établissement en ligne : informations à reporter sur Google, PagesJaunes et annuaires prêtes à copier une à une ou en bloc, horaires d'ouverture saisis librement, adresses des fiches enregistrées, contrôles de ce qui manque ou ne concorde pas, rappel de vérification tous les six mois ; horaires affichés sur la vitrine et données structurées schema.org lues par les moteurs de recherche ; mise à jour automatique de la fiche Google en attente du compte Google Business de manu).
- Vague 75 (13/10/2026) : 215 (variantes dans un même devis : section rattachée à un choix nommé avec son libellé, copie en un clic depuis l'éditeur (Base, Confort, Premium), première variante comprise dans le total et les autres chiffrées à côté, prix de chaque variante dans l'éditeur et sur le PDF, choix par bouton radio sur la page client, à la signature sur place et dans l'acceptation enregistrée, une seule variante par choix contrôlée par le serveur, exemplaire accepté et factures limités à la variante retenue ; options à cocher conservées en plus).
- Vague 76 (13/10/2026) : 281 (envoi du lien de devis par SMS et messagerie instantanée depuis le téléphone de l'artisan : message prérédigé avec numéro, montant TTC, date limite et lien, portable du client prérempli et vérifié, ouverture de Messages ou WhatsApp, copie pour les autres messageries ; devis prêt passé à « Envoyé » et canal noté dans l'historique ; aucun prestataire d'envoi nécessaire).
- Vague 77 (13/10/2026) : 225 (édition à plusieurs sur le même devis : présence signalée toutes les 5 secondes avec le nom des personnes et la section sur laquelle chacune travaille, modifications enregistrées ailleurs reprises sans recharger, fusion automatique par champ, section et ligne quand chacun a changé des éléments différents, liste des éléments changés des deux côtés et choix de la version à garder en cas de conflit réel ; fonctionne aussi entre téléphone, ordinateur et onglets).
- Vague 78 (13/10/2026) : 315 et 338 (garanties après réception : parfait achèvement, bon fonctionnement et décennale calculés depuis la date du procès-verbal, page Garanties listant chaque chantier réceptionné, retenue de garantie reprise des factures de solde et de situation moins les avoirs, état retenue, à réclamer ou libérée, bouton « Marquer comme libérée » avec commentaire, avertissement si des réserves restent à lever, notification un mois avant la fin du parfait achèvement et le jour où la retenue peut être réclamée, chaque rappel envoyé une seule fois).
- Vague 79 (13/10/2026) : 228 (arrondis commerciaux proposés dans l'éditeur : prix unitaires ramenés au prix rond le plus proche avec un pas qui grandit avec le prix, 10 centimes, 50 centimes, 1 euro puis 5 euros, total TTC arrondi vers le bas à la dizaine, à 50 euros ou à la centaine par la remise globale la plus petite qui l'atteint, plafonnée à 3 %, rien de proposé quand le total est déjà rond, application en un clic et annulable).
- Vague 80 (13/10/2026) : 252 (incohérences repérées pendant la saisie et listées dans les points d'attention avec un lien « Voir la ligne » : quantité au-delà d'un seuil par unité ou décimale sur une unité qui se compte, vente sous le coût, prix plus de 5 fois le coût, taux horaire ou journalier inhabituel, même désignation à deux prix très différents, TVA à 5,5 % hors travaux d'amélioration énergétique, taux réduit sur une fourniture sans pose, 2,1 % ou 0 % sur des travaux ; contrôles de TVA désactivés en franchise et en autoliquidation).
- Vague 81 (13/10/2026) : 251 (résumé « Ce devis en bref » en tête de la page de consultation pour un client particulier : entreprise, travaux et lieu, parties du devis, prix total expliqué TVA comprise ou sans TVA, options et variantes au choix, acompte et son montant, reporté de sept jours si le droit de rétractation s'applique, calendrier, lignes estimées, rétractation de 14 jours, attestation de TVA réduite, aides visées et date limite ; rien d'autre que le contenu du devis).
- Vague 82 (13/10/2026) : 250 (relances de devis adaptées : variable {suivi} ajoutée au modèle par défaut, ou insérée avant la formule finale d'un modèle personnalisé, phrase différente selon que le devis a été ouvert ou non, client particulier ou professionnel, options à choisir, fin de validité dans moins de 7 jours et dernière relance prévue ; réglage « Adapter chaque relance » activé par défaut et désactivable).
- Vague 83 (13/10/2026) : 365 (congés et absences reliés au planning : congés, repos, arrêt maladie, formation ou autre, saisis par la personne elle-même ou par qui gère l'équipe, affichés en pointillés dans la grille, affectation recouvrant une absence signalée en conflit à l'enregistrement, au déplacement et dans la liste, absence retirable par son auteur ou un gestionnaire).
- Vague 84 (13/10/2026) : 366 (habilitations et formations de l'équipe : habilitation électrique, SST, travail en hauteur, échafaudages, CACES, AIPR et amiante proposés avec leur durée habituelle de recyclage pour préremplir l'échéance, saisie libre possible, état valide, à renouveler deux mois avant, expirée ou sans échéance, notification un mois avant l'échéance envoyée une seule fois, saisie par la personne elle-même ou par qui gère l'équipe).
- Vague 85 (13/10/2026) : 353 (véhicules et outillage : page dédiée au menu, outillage et engins suivis à côté des véhicules du planning, contrôles périodiques avec périodicité proposée pour le contrôle technique, l'entretien, l'assurance, les vérifications générales périodiques, le contrôle électrique, les échafaudages et les extincteurs, état à jour, à prévoir un mois avant ou en retard, bouton « Fait » qui calcule la prochaine échéance, notification quinze jours avant chaque échéance).
- Vague 86 (13/10/2026) : 381 (tableau de bord du micro-entrepreneur dans Rapports : encaissements de l'année civile par mois et par trimestre, jauges des plafonds du régime et des seuils de franchise de TVA avec seuil majoré, alerte à 80 %, cotisations sociales estimées, fournitures ventilées au prorata des lignes de matériaux et déclarables en vente de marchandises au choix, règles datées et à vérifier).
- Vague 87 (13/10/2026) : 382 (budget annuel comparé au réalisé dans Rapports : montant annuel par poste, chiffre d'affaires facturé, encaissements, achats de chantier et notes de frais, réparti en douzièmes, budget à date, réalisé à date tiré des factures, paiements, achats et frais, écart favorable ou défavorable selon qu'il s'agit d'un produit ou d'une charge avec 5 % de tolérance, projection sur l'année, détail mois par mois, navigation d'une année à l'autre).
- Vague 88 (13/10/2026) : 412 (rentabilité réelle des chantiers dans Rapports : vendu HT des lignes du devis accepté face aux heures pointées valorisées au coût de chaque personne et aux achats saisis, regroupée par client, par type de chantier déduit de l'intitulé et par nature de prestation, sur 12 mois ou depuis le début, avec les cinq chantiers les moins rentables).
- Vague 89 (13/10/2026) : ligne 316 (recouvrement amiable puis injonction de payer préparée : décompte, mise en demeure, dossier de requête)
- Vague 90 (13/10/2026) : ligne 428 (origine des clients et coût d'acquisition par source de demandes)
- Vague 91 (13/10/2026) : ligne 427 (labels RGE, Qualibat et autres mis en valeur sur la vitrine et les devis en ligne)
- Vague 92 (13/10/2026) : ligne 367 (indemnités de petits et grands déplacements par zone, depuis le pointage validé)
- Vague 93 (13/10/2026) : ligne 369 (messagerie d'équipe par chantier, notifications et non lus)
- Vague 94 (13/10/2026) : ligne 416 (rapport mensuel envoyé au gérant par e-mail, désactivable)
- Vague 95 (13/10/2026) : ligne 414 (saisonnalité des signatures et prévision de charge sur 12 semaines)
- Vague 96 (13/10/2026) : ligne 290 (formulaire de demande de devis à intégrer au site de l'artisan)
- Vague 97 (13/10/2026) : ligne 293 (avis clients recueillis après chantier et publiés sur la vitrine)
- Vague 98 (13/10/2026) : ligne 291 (prise de rendez-vous de visite en ligne depuis la vitrine : plages, durée et prévenance, créneaux libres hors congés du dirigeant, demande au statut Visite prévue, e-mails et notification, visites à venir annulables, agenda synchronisé à l'heure près).
- Vague 99 (13/10/2026) : ligne 335 (dossier des ouvrages exécutés en PDF : ouvrages du devis accepté par partie, intervenants et assurance décennale, réception et réserves, garanties, conseils d'entretien, photos du journal, procès-verbaux et fiches techniques en annexe, liste des éléments manquants sur la fiche chantier).
- Vague 100 (14/10/2026) : ligne 336 (plan de prévention du chantier : treize risques du bâtiment avec mesures et protections, risques proposés d'après les travaux et l'âge du bâtiment, repérages amiante et plomb rappelés, secours et intervenants, PDF à afficher avec liste d'émargement).
- Vague 101 (14/10/2026) : ligne 337 (déchets de chantier : douze natures avec code déchet et classe, évacuations par chantier avec destination, transporteur, bordereau et coût, BSDA exigé pour l'amiante, bilan par classe et part triée, registre chronologique annuel exportable en CSV).
- Vague 102 (14/10/2026) : ligne 334 (coordination des corps de métier : interventions par lot avec équipe ou sous-traitant, dates et prédécesseur, contrôle des chevauchements, de l'ordre habituel des lots et des enchaînements, frise, envoi du planning par e-mail aux sous-traitants).
- Vague 103 (14/10/2026) : ligne 349 (stock du dépôt et des véhicules : articles suivis depuis le catalogue ou hors catalogue, entrées, transferts, sorties vers un chantier affectées à ses coûts, inventaires, seuils et quantités à commander, dotation par véhicule, listes à commander et à recharger, valeur du stock).
- Vague 104 (14/10/2026) : ligne 352 (location de matériel : contrats par chantier au jour, à la semaine ou au mois avec transport et assurance casse, coût engagé et supplément de retard, restitution qui reporte le coût réel dans les coûts du chantier, liste des locations en cours).
- Vague 105 (14/10/2026) : ligne 350 (commandes groupées de plusieurs chantiers : brouillons par fournisseur, bon groupé PDF avec articles additionnés et part de chaque chantier, livraison au dépôt, envoi et dégroupage)
- Vague 106 (14/10/2026) : ligne 351 (livraisons et retours fournisseurs : historique des bons de livraison avec réserves, retours casse, erreur, défaut ou surplus avec frais de reprise, reprise puis avoir déduit des achats du chantier, rapprochement de facture net des retours, liste des avoirs attendus)
- Vague 107 (14/10/2026) : ligne 354 (écarts analysés pour corriger les prix : tâches de chantier reliées à l'article du catalogue, coût prévu et réel par article sur les chantiers terminés, coût unitaire constaté, correction appliquée au catalogue avec marge conservée, main-d'oeuvre comparée aux heures pointées)
- Vague 108 (14/10/2026) : ligne 253 (estimation de la durée du chantier et du personnel : temps par ligne de main-d'oeuvre depuis le catalogue, l'unité, le coût ou le prix, jours ouvrés par taille d'équipe, équipe conseillée dans la limite de l'effectif, bouton dans l'éditeur de devis)
- Vague 109 (14/10/2026) : ligne 229 (comparaison avec les devis similaires gagnés ou perdus : ressemblance par mots des lignes et montant, motif de refus rappelé, prix unitaires comparés aux médianes des devis gagnés et perdus)
- Vague 110 (14/10/2026) : ligne 268 (comparateur de prix entre fournisseurs : même produit rapproché par EAN ou désignation et unité entre les tarifs importés, offres classées, économie annuelle d'après les devis acceptés, changement de fournisseur avec historique)
- Vague 111 (14/10/2026) : ligne 272 (empreinte carbone par article et bilan carbone du devis : facteur par unité et source sur la fiche article, ordres de grandeur indicatifs pour les produits courants, bilan des produits du devis avec les plus émetteurs et les lignes sans donnée)
- Vague 112 (14/10/2026) : ligne 294 (parrainage entre clients : programme et récompenses réglables, lien personnel du client vers la vitrine, demande marquée comme recommandation, suivi jusqu'au devis signé et récompense remise)
- Vague 113 (14/10/2026) : ligne 368 (déclarations de congés payés du bâtiment préparées depuis les pointages, export pour la caisse)
- Vague 114 (14/10/2026) : ligne 370 (parcours de formation des apprentis : tuteur, diplôme, jours d'école, compétences par rubrique validées par niveau, priorités et alerte de fin de contrat)
- Vague 115 (14/10/2026) : ligne 206 (décompte général définitif : marché et avenants acceptés, factures sans double compte des acomptes, retenue, pénalités, règlements et solde, figé à l'envoi puis accepté ou contesté ; les situations de travaux existaient déjà)
