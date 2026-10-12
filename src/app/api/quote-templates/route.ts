import { readJson, api } from "@/lib/server/session";
import { listTemplates, saveQuoteAsTemplate } from "@/lib/services/templates";

export const GET = api(async ({ ctx }) => ({ templates: await listTemplates(ctx) }));

/** Enregistre le brouillon d'un devis comme modèle : { quoteId, name, description? } */
export const POST = api(async ({ req, ctx }) => {
  const body = await readJson(req);
  const id = await saveQuoteAsTemplate(ctx, String(body.quoteId ?? ""), { name: String(body.name ?? ""), description: String(body.description ?? "") });
  return { id };
});
