import { badRequest } from "@/lib/http";
import { hitRate } from "@/lib/rate-limit";
import { api } from "@/lib/server/session";
import { addVaultFile, listVaultFiles } from "@/lib/services/vault";
import { VAULT_MAX_BYTES } from "@/lib/vault";

/** Pièces du coffre : enveloppes chiffrées seulement. */
export const GET = api(async ({ ctx }) => ({ files: await listVaultFiles(ctx) }));

/** Dépôt d'une pièce chiffrée dans le navigateur (multipart : enveloppe JSON et contenu chiffré). */
export const POST = api(async ({ req, ctx }) => {
  if (Number(req.headers.get("content-length") ?? 0) > VAULT_MAX_BYTES + 100_000) throw badRequest("Fichier trop lourd (10 Mo au plus)");
  await hitRate(ctx.db, "job.photo", ctx.orgId);
  const form = await req.formData().catch(() => {
    throw badRequest("Envoi illisible");
  });
  const file = form.get("cipher");
  if (!(file instanceof File)) throw badRequest("Contenu chiffré manquant");
  let envelope: unknown;
  try {
    envelope = JSON.parse(String(form.get("envelope") ?? ""));
  } catch {
    throw badRequest("Enveloppe illisible");
  }
  return { id: await addVaultFile(ctx, envelope, new Uint8Array(await file.arrayBuffer())) };
});
