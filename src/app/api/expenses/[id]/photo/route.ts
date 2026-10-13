import { api } from "@/lib/server/session";
import { expensePhoto } from "@/lib/services/expenses";

/** Justificatif d'une note de frais : visible par son auteur et l'encadrement. */
export const GET = api<{ id: string }>(async ({ ctx, params }) => {
  const p = await expensePhoto(ctx, params.id);
  return new Response(Buffer.from(p.bytes), {
    headers: { "content-type": p.type, "x-content-type-options": "nosniff", "cache-control": "private, no-store" },
  });
});
