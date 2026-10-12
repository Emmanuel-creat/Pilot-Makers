import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 60000,
    env: { DATABASE_URL: "memory://", BILLING_WEBHOOK_SECRET: "secret-de-test", APP_URL: "http://localhost:3000", RATE_LIMIT: "off" },
  },
});
