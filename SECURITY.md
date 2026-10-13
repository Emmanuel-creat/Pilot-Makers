# Sécurité

Pour signaler une faille, suivez la page « Signaler une faille de sécurité » de l'application (`/securite`) ou écrivez à l'adresse indiquée dans `/.well-known/security.txt`. Merci de ne pas ouvrir de ticket public pour une faille non corrigée.

Nous accusons réception sous 3 jours ouvrés et proposons un calendrier de correction sous 10 jours ouvrés.

## Protections en place

- Limitation de débit partagée entre instances (`src/lib/rate-limit.ts`) : par adresse IP et par compte sur toutes les routes API, et des règles plus strictes pour la consultation et la réponse publiques aux devis, la création de compte, la réinitialisation du mot de passe, l'envoi d'e-mails, l'assistant de préparation, les imports et les exports. Une requête refusée reçoit le code 429 avec l'en-tête `Retry-After`. La variable `RATE_LIMIT=off` la désactive, pour les tests uniquement.
- Webhooks (`src/lib/services/webhooks.ts`) : adresses HTTPS publiques uniquement (noms locaux, adresses IP privées, de boucle locale ou de métadonnées refusés, port 443 seul, pas de redirection suivie), délai de réponse de 10 secondes, clé de signature chiffrée en base et affichée une seule fois, envois signés HMAC-SHA256 avec horodatage. La résolution DNS n'est pas contrôlée au moment de l'envoi : en hébergement, placer les envois derrière un relais sortant qui bloque les réseaux internes.
