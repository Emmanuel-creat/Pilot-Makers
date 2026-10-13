/**
 * Journal scellé des actions d'administration de la plateforme (consultation d'un compte, accès support,
 * changement d'offre, mise en production...). Chaque entrée porte l'empreinte SHA-256 de la précédente :
 * modifier, retirer ou intercaler une entrée casse la chaîne, ce que la vérification quotidienne détecte.
 * La base refuse en outre toute modification ou suppression (déclencheur).
 */

import type { Queryable } from "@/lib/db";
import { num } from "@/lib/db";
import { sha256 } from "@/lib/security";

export const GENESIS = "0".repeat(64);

export interface SealedEntry {
  at: string;
  actor: string | null;
  org: string | null;
  action: string;
  target: string;
  data: unknown;
  ip: string;
}

export function chainHash(prev: string, seq: number, payload: string) {
  return sha256(`${prev}|${seq}|${payload}`);
}

/** Ajoute une entrée ; en cas d'écriture simultanée, le numéro déjà pris fait échouer l'une des deux, qui recommence. */
export async function appendSealed(q: Queryable, e: Omit<SealedEntry, "at"> & { at?: Date }) {
  const payload = JSON.stringify({
    at: (e.at ?? new Date()).toISOString(),
    actor: e.actor ?? null,
    org: e.org ?? null,
    action: e.action,
    target: e.target ?? "",
    data: e.data ?? {},
    ip: e.ip ?? "",
  } satisfies SealedEntry);
  for (let attempt = 0; ; attempt++) {
    const last = await q.query<{ seq: unknown; hash: string }>("SELECT seq, hash FROM admin_journal ORDER BY seq DESC LIMIT 1");
    const seq = last.length ? num(last[0].seq) + 1 : 1;
    const prev = last[0]?.hash ?? GENESIS;
    try {
      await q.query("INSERT INTO admin_journal (seq, payload, prev_hash, hash) VALUES ($1,$2,$3,$4)", [
        seq,
        payload,
        prev,
        chainHash(prev, seq, payload),
      ]);
      return { seq };
    } catch (err) {
      if (attempt >= 4 || !/duplicate key|unique/i.test(String((err as Error)?.message))) throw err;
    }
  }
}

export interface JournalCheck {
  ok: boolean;
  count: number;
  lastHash: string;
  brokenAt?: number;
  reason?: string;
}

/** Recalcule toute la chaîne. */
export async function verifySealed(q: Queryable): Promise<JournalCheck> {
  let prev = GENESIS;
  let expected = 1;
  let count = 0;
  for (;;) {
    const rows = await q.query<{ seq: unknown; payload: string; prev_hash: string; hash: string }>(
      "SELECT seq, payload, prev_hash, hash FROM admin_journal WHERE seq >= $1 ORDER BY seq LIMIT 1000",
      [expected],
    );
    if (!rows.length) break;
    for (const r of rows) {
      const seq = num(r.seq);
      if (seq !== expected) return { ok: false, count, lastHash: prev, brokenAt: expected, reason: `Entrée ${expected} manquante` };
      if (r.prev_hash !== prev) return { ok: false, count, lastHash: prev, brokenAt: seq, reason: `Entrée ${seq} : lien avec la précédente rompu` };
      if (chainHash(prev, seq, r.payload) !== r.hash)
        return { ok: false, count, lastHash: prev, brokenAt: seq, reason: `Entrée ${seq} : contenu modifié` };
      prev = r.hash;
      expected++;
      count++;
    }
  }
  // Une entrée au-delà d'un trou (seq sautée) n'est pas lue par la boucle : on la signale aussi.
  const beyond = await q.query<{ n: unknown }>("SELECT count(*) AS n FROM admin_journal WHERE seq >= $1", [expected]);
  if (num(beyond[0]?.n) > 0) return { ok: false, count, lastHash: prev, brokenAt: expected, reason: `Entrée ${expected} manquante` };
  return { ok: true, count, lastHash: prev };
}

export async function recentSealed(q: Queryable, limit = 100) {
  const rows = await q.query<{ seq: unknown; payload: string; hash: string }>(
    "SELECT seq, payload, hash FROM admin_journal ORDER BY seq DESC LIMIT $1",
    [limit],
  );
  return rows.map((r) => ({ seq: num(r.seq), hash: r.hash, ...(JSON.parse(r.payload) as SealedEntry) }));
}
