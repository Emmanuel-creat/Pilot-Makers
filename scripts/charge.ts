/**
 * Test de charge : remplit une base avec beaucoup d'entreprises, de clients et de devis, puis mesure
 * les requêtes les plus fréquentes d'une entreprise très active (liste et recherche de devis, tableau de bord,
 * recherche de clients), une à une puis en parallèle.
 *
 *   npm run charge                                 base embarquée, 200 entreprises, 5 000 devis par entreprise mesurée
 *   CHARGE_ORGS=10000 CHARGE_QUOTES=100 DATABASE_URL=postgres://... npm run charge
 *                                                  objectif de la feuille de route : 10 000 entreprises, un million de devis
 *
 * Échec (code 1) si le 95e centile d'une requête dépasse CHARGE_P95_MS (300 ms par défaut).
 */
import { openDatabase } from "../src/lib/db";
import { contextFromToken, login, register, verifyEmail } from "../src/lib/services/accounts";
import { searchCustomers } from "../src/lib/services/customers";
import { getDashboard } from "../src/lib/services/dashboard";
import { listQuotes } from "../src/lib/services/quotes";

const ORGS = Number(process.env.CHARGE_ORGS ?? 200);
const QUOTES = Number(process.env.CHARGE_QUOTES ?? 20);
const HEAVY = Number(process.env.CHARGE_HEAVY_QUOTES ?? 5000);
const P95 = Number(process.env.CHARGE_P95_MS ?? 300);
const meta = { ip: "127.0.0.1", userAgent: "charge" };

const STATUSES = "ARRAY['draft','ready','sent','viewed','accepted','refused','expired']";

async function main() {
  const t0 = Date.now();
  const db = await openDatabase(process.env.DATABASE_URL || "memory://");
  const email = `charge-${Date.now()}@exemple.fr`;
  const r = await register(db, { email, password: "MotDePasse2026", name: "Charge", company: "Entreprise mesurée", trade: "general", acceptTerms: true }, meta);
  await verifyEmail(db, r.verifyToken);
  const ctx = (await contextFromToken(db, await login(db, email, "MotDePasse2026", meta), meta))!;

  // Les autres entreprises, leurs clients et leurs devis, créés directement en base par lots.
  for (let done = 0; done < ORGS; done += 500) {
    const n = Math.min(500, ORGS - done);
    await db.query(
      `WITH o AS (INSERT INTO organizations (trade_name) SELECT 'Entreprise ' || g FROM generate_series(1, $1::int) g RETURNING id),
            c AS (INSERT INTO customers (org_id, last_name) SELECT o.id, 'Client ' || k FROM o, generate_series(1, 10) k RETURNING id, org_id)
       INSERT INTO quotes (org_id, customer_id, number, status, title, total_ht_cents, total_ttc_cents, created_at, updated_at)
       SELECT c.org_id, c.id, 'D-' || c.id || '-' || k, (${STATUSES})[1 + (k % 7)], 'Travaux ' || k, k * 10000, k * 12000,
              now() - (k || ' days')::interval, now() - (k || ' days')::interval
       FROM c, generate_series(1, $2::int) k`,
      [n, Math.max(1, Math.ceil(QUOTES / 10))],
    );
  }
  // L'entreprise mesurée : beaucoup de clients et de devis.
  await db.query(
    `WITH c AS (INSERT INTO customers (org_id, last_name, email) SELECT $1, 'Client ' || k, 'client' || k || '@exemple.fr' FROM generate_series(1, 500) k RETURNING id)
     INSERT INTO quotes (org_id, customer_id, number, status, title, total_ht_cents, total_ttc_cents, created_at, updated_at)
     SELECT $1, (SELECT id FROM c OFFSET (k % 500) LIMIT 1), 'D-2026-' || lpad(k::text, 5, '0'), (${STATUSES})[1 + (k % 7)],
            'Rénovation salle de bain ' || k, k * 1000, k * 1200, now() - ((k % 400) || ' days')::interval, now() - ((k % 400) || ' days')::interval
     FROM generate_series(1, $2::int) k`,
    [ctx.orgId, HEAVY],
  );
  const total = await db.query<{ n: string }>("SELECT count(*) AS n FROM quotes");
  console.log(`Base remplie en ${((Date.now() - t0) / 1000).toFixed(1)} s : ${ORGS + 1} entreprises, ${total[0].n} devis.`);

  const cases: [string, () => Promise<unknown>][] = [
    ["liste des devis", () => listQuotes(ctx, {})],
    ["devis en attente", () => listQuotes(ctx, { status: "pending" })],
    ["recherche de devis", () => listQuotes(ctx, { q: "salle de bain 42" })],
    ["tableau de bord", () => getDashboard(ctx)],
    ["recherche de clients", () => searchCustomers(ctx, { q: "client 12" })],
  ];
  let failed = false;
  for (const [name, run] of cases) {
    await run();
    const times: number[] = [];
    for (let i = 0; i < 20; i++) {
      const s = performance.now();
      await run();
      times.push(performance.now() - s);
    }
    times.sort((a, b) => a - b);
    const p50 = times[10];
    const p95 = times[18];
    const ok = p95 <= P95;
    failed ||= !ok;
    console.log(`${ok ? "ok    " : "LENT  "} ${name.padEnd(22)} médiane ${p50.toFixed(0).padStart(5)} ms   95e centile ${p95.toFixed(0).padStart(5)} ms`);
  }
  const s = performance.now();
  await Promise.all(Array.from({ length: 50 }, (_, i) => cases[i % cases.length][1]()));
  console.log(`50 requêtes simultanées : ${(performance.now() - s).toFixed(0)} ms`);
  await db.close?.();
  if (failed) {
    console.error(`Au moins une requête dépasse ${P95} ms au 95e centile.`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
