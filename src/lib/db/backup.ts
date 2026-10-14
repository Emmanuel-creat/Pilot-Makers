/**
 * Sauvegarde logique et restauration de toute la base, pour l'exercice annuel de reprise après sinistre
 * (scripts/exercice-reprise.ts) et pour les sauvegardes de l'hébergement.
 *
 * Chaque table est exportée en JSON par PostgreSQL lui-même (json_agg), puis réinsérée avec
 * json_populate_recordset : les types (entiers 64 bits, dates, binaires, tableaux, jsonb) font l'aller-retour
 * sans conversion maison. Une empreinte SHA-256 par table permet de prouver que la base restaurée est identique.
 */

import { createHash } from "node:crypto";
import type { Database, Queryable } from "./index";

export const BACKUP_FORMAT = 1;

export interface TableDump {
  name: string;
  rows: number;
  /** Empreinte SHA-256 du contenu, lignes triées : identique sur la base d'origine et sur la base restaurée */
  sha256: string;
  /** Lignes au format JSON produit par PostgreSQL */
  data: string;
}

export interface DatabaseDump {
  format: number;
  createdAt: string;
  migrations: string[];
  tables: TableDump[];
}

const ident = (name: string) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`Nom de table inattendu : ${name}`);
  return `"${name}"`;
};

/** Tables de l'application, dans un ordre où chaque table vient après celles qu'elle référence. */
export async function tablesInOrder(q: Queryable): Promise<string[]> {
  const tables = (
    await q.query<{ name: string }>(
      "SELECT table_name AS name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name <> 'schema_migrations' ORDER BY table_name",
    )
  ).map((t) => t.name);
  const deps = await q.query<{ child: string; parent: string }>(
    `SELECT c.conrelid::regclass::text AS child, c.confrelid::regclass::text AS parent
       FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE c.contype='f' AND n.nspname='public'`,
  );
  const parents = new Map(tables.map((t) => [t, new Set<string>()]));
  for (const d of deps) if (d.child !== d.parent && parents.has(d.child) && parents.has(d.parent)) parents.get(d.child)!.add(d.parent);
  const out: string[] = [];
  const state = new Map<string, "visiting" | "done">();
  const visit = (t: string) => {
    if (state.get(t) === "done" || state.get(t) === "visiting") return; // un cycle est tranché arbitrairement
    state.set(t, "visiting");
    for (const p of [...parents.get(t)!].sort()) visit(p);
    state.set(t, "done");
    out.push(t);
  };
  tables.forEach(visit);
  return out;
}

/** Contenu d'une table en JSON, lignes triées par leur texte pour une empreinte stable. */
async function tableJson(q: Queryable, name: string): Promise<{ data: string; rows: number }> {
  const t = ident(name);
  const [r] = await q.query<{ data: string | null; rows: number }>(
    `SELECT coalesce(json_agg(x.j ORDER BY x.k), '[]'::json)::text AS data, count(*)::int AS rows
       FROM (SELECT to_json(t) AS j, to_json(t)::text AS k FROM ${t} t) x`,
  );
  return { data: r.data ?? "[]", rows: Number(r.rows) };
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function dumpDatabase(db: Queryable, now = new Date()): Promise<DatabaseDump> {
  const migrations = (await db.query<{ id: string }>("SELECT id FROM schema_migrations ORDER BY id")).map((m) => m.id);
  const tables: TableDump[] = [];
  for (const name of await tablesInOrder(db)) {
    const { data, rows } = await tableJson(db, name);
    tables.push({ name, rows, sha256: sha256(data), data });
  }
  return { format: BACKUP_FORMAT, createdAt: now.toISOString(), migrations, tables };
}

/** Lignes et empreinte de chaque table, sans les données : ce que l'on compare après restauration. */
export async function fingerprint(db: Queryable): Promise<Record<string, { rows: number; sha256: string }>> {
  const out: Record<string, { rows: number; sha256: string }> = {};
  for (const name of await tablesInOrder(db)) {
    const { data, rows } = await tableJson(db, name);
    out[name] = { rows, sha256: sha256(data) };
  }
  return out;
}

export class RestoreError extends Error {}

/**
 * Restaure une sauvegarde dans une base neuve, migrée au même niveau. La base cible ne doit contenir ni entreprise
 * ni utilisateur : une restauration n'écrase jamais des données existantes, et les tables protégées (journal scellé,
 * factures) sont vides sur une base neuve.
 */
export async function restoreDatabase(db: Database, dump: DatabaseDump): Promise<{ tables: number; rows: number }> {
  if (dump.format !== BACKUP_FORMAT) throw new RestoreError(`Format de sauvegarde inconnu : ${dump.format}`);
  const migrations = (await db.query<{ id: string }>("SELECT id FROM schema_migrations ORDER BY id")).map((m) => m.id);
  const missing = dump.migrations.filter((m) => !migrations.includes(m));
  if (missing.length) throw new RestoreError(`Base cible en retard de ${missing.length} migration(s) : ${missing[0]}`);
  for (const t of dump.tables) if (sha256(t.data) !== t.sha256) throw new RestoreError(`Sauvegarde altérée : table ${t.name}`);
  const known = new Set(await tablesInOrder(db));
  const unknown = dump.tables.find((t) => !known.has(t.name));
  if (unknown) throw new RestoreError(`Table absente de la base cible : ${unknown.name}`);
  for (const name of ["organizations", "users"]) {
    const [r] = await db.query<{ any: boolean }>(`SELECT EXISTS (SELECT 1 FROM ${ident(name)}) AS any`);
    if (r.any) throw new RestoreError(`La base cible contient déjà des données (table ${name}) : restauration refusée.`);
  }

  let rows = 0;
  await db.transaction(async (tx) => {
    // Données de référence posées par les migrations (formules, barèmes) : remplacées par celles de la sauvegarde.
    for (const name of [...known].reverse()) {
      const [r] = await tx.query<{ any: boolean }>(`SELECT EXISTS (SELECT 1 FROM ${ident(name)}) AS any`);
      if (r.any) await tx.query(`DELETE FROM ${ident(name)}`);
    }
    for (const t of dump.tables) {
      if (!t.rows) continue;
      const cols = (
        await tx.query<{ name: string }>(
          "SELECT column_name AS name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND is_generated='NEVER' ORDER BY ordinal_position",
          [t.name],
        )
      )
        .map((c) => ident(c.name))
        .join(", ");
      await tx.query(
        `INSERT INTO ${ident(t.name)} (${cols}) OVERRIDING SYSTEM VALUE SELECT ${cols} FROM json_populate_recordset(NULL::${ident(t.name)}, $1::json)`,
        [t.data],
      );
      rows += t.rows;
    }
    // Les compteurs automatiques repartent après le plus grand identifiant restauré.
    const seqs = await tx.query<{ tbl: string; col: string; seq: string }>(
      `SELECT c.table_name AS tbl, c.column_name AS col, pg_get_serial_sequence(quote_ident(c.table_name), c.column_name) AS seq
         FROM information_schema.columns c WHERE c.table_schema='public' AND pg_get_serial_sequence(quote_ident(c.table_name), c.column_name) IS NOT NULL`,
    );
    for (const s of seqs) {
      await tx.query(`SELECT setval($1, coalesce((SELECT max(${ident(s.col)}) FROM ${ident(s.tbl)}), 0) + 1, false)`, [s.seq]);
    }
  });
  return { tables: dump.tables.length, rows };
}
