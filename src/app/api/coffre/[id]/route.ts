import { api } from "@/lib/server/session";
import { deleteVaultFile, vaultCipher } from "@/lib/services/vault";

/** Contenu chiffré d'une pièce, déchiffré ensuite dans le navigateur. */
export const GET = api<{ id: string }>(async ({ ctx, params }) => {
  const bytes = await vaultCipher(ctx, params.id);
  return new Response(Buffer.from(bytes), {
    headers: { "content-type": "application/octet-stream", "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
});

export const DELETE = api<{ id: string }>(async ({ ctx, params }) => {
  await deleteVaultFile(ctx, params.id);
  return { ok: true };
});
