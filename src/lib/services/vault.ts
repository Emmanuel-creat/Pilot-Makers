/** Coffre chiffré de l'entreprise : le serveur range des contenus qu'il ne peut pas lire. */

import { randomUUID } from "node:crypto";
import { badRequest, isUuid, notFound } from "@/lib/http";
import { fileStore } from "@/lib/storage";
import { envelopeIssue, VAULT_MAX_BYTES, type VaultEnvelope } from "@/lib/vault";
import type { Ctx } from "./context";
import { audit, requireWritable } from "./context";

export const VAULT_MAX_FILES = 500;

type Row = { id: string; size: number; envelope: VaultEnvelope; created_at: Date; storage_key: string; author: string | null };

export async function listVaultFiles(ctx: Ctx) {
  const rows = await ctx.db.query<Row>(
    `SELECT v.id, v.size, v.envelope, v.created_at, v.storage_key, u.name AS author
       FROM vault_files v LEFT JOIN users u ON u.id = v.user_id WHERE v.org_id=$1 ORDER BY v.created_at DESC`,
    [ctx.orgId],
  );
  return rows.map((r) => ({ id: String(r.id), size: Number(r.size), envelope: r.envelope, createdAt: r.created_at, author: r.author ?? "" }));
}

export async function addVaultFile(ctx: Ctx, envelope: unknown, cipher: Uint8Array) {
  requireWritable(ctx);
  const issue = envelopeIssue(envelope);
  if (issue) throw badRequest(issue);
  // AES-GCM ajoute 16 octets d'authentification : un contenu plus court n'a pas été chiffré ici.
  if (cipher.length < 16) throw badRequest("Contenu chiffré manquant");
  if (cipher.length > VAULT_MAX_BYTES + 16) throw badRequest("Fichier trop lourd (10 Mo au plus)");
  const [{ n }] = await ctx.db.query<{ n: number }>("SELECT count(*)::int AS n FROM vault_files WHERE org_id=$1", [ctx.orgId]);
  if (Number(n) >= VAULT_MAX_FILES) throw badRequest(`Le coffre contient déjà ${VAULT_MAX_FILES} pièces : retirez-en avant d'en ajouter`);
  const e = envelope as VaultEnvelope;
  const key = `coffre/${ctx.orgId}/${randomUUID()}`;
  await fileStore(ctx.db).put(key, cipher, "application/octet-stream");
  const [row] = await ctx.db.query<{ id: string }>(
    "INSERT INTO vault_files (org_id, user_id, storage_key, size, envelope) VALUES ($1,$2,$3,$4,$5) RETURNING id",
    [ctx.orgId, ctx.userId, key, cipher.length, JSON.stringify({ salt: e.salt, iv: e.iv, nameIv: e.nameIv, name: e.name })],
  );
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "vault.add", target: String(row.id), data: { size: cipher.length }, ip: ctx.ip });
  return String(row.id);
}

async function ownRow(ctx: Ctx, id: string) {
  const [row] = isUuid(id) ? await ctx.db.query<Row>("SELECT * FROM vault_files WHERE id=$1 AND org_id=$2", [id, ctx.orgId]) : [];
  if (!row) throw notFound("Pièce introuvable");
  return row;
}

/** Contenu chiffré, tel qu'il a été envoyé : le déchiffrement se fait dans le navigateur. */
export async function vaultCipher(ctx: Ctx, id: string) {
  const row = await ownRow(ctx, id);
  const file = await fileStore(ctx.db).get(row.storage_key);
  if (!file) throw notFound("Pièce introuvable");
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "vault.read", target: id, ip: ctx.ip });
  return file.bytes;
}

export async function deleteVaultFile(ctx: Ctx, id: string) {
  requireWritable(ctx);
  const row = await ownRow(ctx, id);
  await fileStore(ctx.db).remove(row.storage_key);
  await ctx.db.query("DELETE FROM vault_files WHERE id=$1 AND org_id=$2", [id, ctx.orgId]);
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "vault.remove", target: id, ip: ctx.ip });
}
