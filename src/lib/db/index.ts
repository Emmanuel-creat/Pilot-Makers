/**
 * Accès à la base PostgreSQL.
 *
 * - DATABASE_URL = postgres://... : serveur PostgreSQL (production).
 * - DATABASE_URL = memory://       : base embarquée en mémoire (tests).
 * - DATABASE_URL vide              : base embarquée persistée dans ./data/pglite (démarrage sans installation).
 *
 * Toutes les requêtes sont paramétrées ; aucune valeur n'est concaténée dans le SQL.
 */

import { runMigrations } from "./migrate";

export type Row = Record<string, unknown>;

export interface Queryable {
  query<T extends object = Row>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface Database extends Queryable {
  transaction<R>(fn: (tx: Queryable) => Promise<R>): Promise<R>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

async function createPg(url: string): Promise<Database> {
  const pg = await import("pg");
  const Pool = pg.default?.Pool ?? (pg as unknown as { Pool: typeof import("pg").Pool }).Pool;
  // Les entiers 64 bits sont renvoyés sous forme de texte puis convertis par les mappeurs.
  const pool = new Pool({ connectionString: url, max: 10 });
  return {
    async query(sql, params = []) {
      const res = await pool.query(sql, params as unknown[]);
      return res.rows;
    },
    async exec(sql) {
      await pool.query(sql);
    },
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn({
          async query(sql, params = []) {
            const res = await client.query(sql, params as unknown[]);
            return res.rows;
          },
        });
        await client.query("COMMIT");
        return result;
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}

async function createPglite(dataDir: string | undefined): Promise<Database> {
  const { PGlite } = await import("@electric-sql/pglite");
  if (dataDir) {
    const fs = await import("node:fs");
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const db = dataDir ? new PGlite(dataDir) : new PGlite();
  await db.waitReady;
  // PGlite traite une requête à la fois : les transactions sont sérialisées par une file.
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <R>(fn: () => Promise<R>): Promise<R> => {
    const next = chain.then(fn, fn);
    chain = next.catch(() => undefined);
    return next;
  };
  return {
    query(sql, params = []) {
      return serial(async () => (await db.query(sql, params as unknown[])).rows as never);
    },
    exec(sql) {
      return serial(async () => {
        await db.exec(sql);
      });
    },
    transaction(fn) {
      return serial(() =>
        db.transaction(async (tx) =>
          fn({
            async query(sql, params = []) {
              return (await tx.query(sql, params as unknown[])).rows as never;
            },
          }),
        ),
      );
    },
    async close() {
      await db.close();
    },
  };
}

const globalForDb = globalThis as unknown as { __pilotDb?: Promise<Database> };

export async function openDatabase(url = process.env.DATABASE_URL ?? ""): Promise<Database> {
  let db: Database;
  if (url.startsWith("postgres://") || url.startsWith("postgresql://")) db = await createPg(url);
  else if (url === "memory://") db = await createPglite(undefined);
  else db = await createPglite(url || "./data/pglite");
  await runMigrations(db);
  return db;
}

export function getDb(): Promise<Database> {
  if (!globalForDb.__pilotDb) {
    globalForDb.__pilotDb = openDatabase().catch((e) => {
      globalForDb.__pilotDb = undefined;
      throw e;
    });
  }
  return globalForDb.__pilotDb;
}

/** Remplace la base courante (tests). */
export function setDbForTests(db: Promise<Database>) {
  globalForDb.__pilotDb = db;
}

export async function one<T extends object = Row>(q: Queryable, sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await q.query<T>(sql, params);
  return rows[0] ?? null;
}

export const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
export const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
