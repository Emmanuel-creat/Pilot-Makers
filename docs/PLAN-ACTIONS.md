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
