@echo off
rem Lance la demo Pilot-Makers : installation au premier lancement, donnees de demonstration, application sur le port 3000.
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js est necessaire : https://nodejs.org & pause & exit /b 1)
if not exist .env.local copy .env.example .env.local >nul
if not exist node_modules (call npm install || (pause & exit /b 1))
call npm run db:seed || (pause & exit /b 1)
echo Application sur http://localhost:3000 (demo@pilot-makers.fr / Demo2026Pilot)
start "" http://localhost:3000
call npm run dev
pause
