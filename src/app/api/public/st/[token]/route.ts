import { getDb } from "@/lib/db";
import { badRequest } from "@/lib/http";
import { api, requestMeta } from "@/lib/server/session";
import { answerSubQuote } from "@/lib/services/subcontractor-quotes";
import { DOC_MAX_BYTES } from "@/lib/services/subcontractors";

/** Réponse d'un sous-traitant à une demande de prix (envoi multipart, devis joint facultatif). */
export const POST = api<{ token: string }>(
  async ({ req, params }) => {
    const length = Number(req.headers.get("content-length") ?? 0);
    if (length > DOC_MAX_BYTES + 200_000) throw badRequest("Fichier trop lourd (5 Mo au plus)");
    const form = await req.formData().catch(() => {
      throw badRequest("Envoi illisible");
    });
    const file = form.get("file");
    await answerSubQuote(
      await getDb(),
      params.token,
      {
        amount: String(form.get("amount") ?? ""),
        delay: String(form.get("delay") ?? ""),
        note: String(form.get("note") ?? ""),
        name: String(form.get("name") ?? ""),
      },
      file instanceof File && file.size ? new Uint8Array(await file.arrayBuffer()) : null,
      file instanceof File ? file.name : "",
      await requestMeta(),
    );
    return { ok: true };
  },
  { auth: false },
);
