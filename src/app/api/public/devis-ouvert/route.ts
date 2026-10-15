import { JSON_SCHEMA } from "@/lib/quote-exchange";

/** Schéma JSON public du format Devis ouvert. */
export function GET() {
  return new Response(JSON.stringify(JSON_SCHEMA, null, 2), {
    headers: { "content-type": "application/schema+json; charset=utf-8", "cache-control": "public, max-age=3600", "access-control-allow-origin": "*" },
  });
}
