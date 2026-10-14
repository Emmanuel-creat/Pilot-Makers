/**
 * Démarre l'application pour les tests de navigateur : base embarquée neuve
 * dans un dossier temporaire, données de démonstration, puis `next start`.
 * La construction (`npm run build`) doit avoir été faite avant.
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = process.argv[2] ?? "3100";
const env = {
  ...process.env,
  DATABASE_URL: mkdtempSync(join(tmpdir(), "pilot-makers-e2e-")),
  APP_SECRET: process.env.APP_SECRET ?? "secret-de-test-pour-le-parcours-navigateur",
  APP_URL: `http://localhost:${port}`,
  REQUIRE_ADMIN_2FA: "0",
  WEATHER: process.env.WEATHER ?? "demo",
};
const seed = spawnSync("node_modules/.bin/tsx", ["scripts/seed.ts"], { env, stdio: "inherit" });
if (seed.status !== 0) process.exit(seed.status ?? 1);
const server = spawn("node_modules/.bin/next", ["start", "-p", port], { env, stdio: "inherit" });
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => server.kill(sig));
server.on("exit", (code) => process.exit(code ?? 0));
