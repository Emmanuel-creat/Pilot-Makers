#!/bin/sh
# Lance la démo Pilot-Makers : installation au premier lancement, données de démonstration, application sur le port 3000.
cd "$(dirname "$0")" || exit 1
command -v node >/dev/null 2>&1 || { echo "Node.js est nécessaire : https://nodejs.org"; exit 1; }
[ -f .env.local ] || cp .env.example .env.local
[ -d node_modules ] || npm install || exit 1
npm run db:seed || exit 1
echo "Application sur http://localhost:3000 (demo@pilot-makers.fr / Demo2026Pilot)"
npm run dev
