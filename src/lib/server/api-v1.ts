import { getDb } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { hitRate } from "@/lib/rate-limit";
import { authenticateApiKey, keyFromHeaders, requireScope } from "@/lib/services/api-keys";
import type { Ctx } from "@/lib/services/context";
import { errorResponse } from "./session";

type Handler<P> = (a: { req: Request; ctx: Ctx; params: P; url: URL }) => Promise<unknown>;

/** Champs internes jamais renvoyés par l'API publique. */
const HIDDEN = new Set([
  "org_id",
  "access_codes",
  "key_hash",
  "secret",
  "pdf",
  "photo",
  "internalNote",
  "internalNotes",
  "internal_note",
  "internal_notes",
]);

export function apiJson(data: unknown, status = 200): Response {
  const body = JSON.stringify(data, (k, v) => (HIDDEN.has(k) ? undefined : typeof v === "bigint" ? Number(v) : v));
  return new Response(body, { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

/**
 * Route de l'API publique (/api/v1) : authentification par clé, limite de débit par clé,
 * écriture réservée aux clés « lecture et écriture ». Les cookies de session sont ignorés.
 */
export function apiV1<P = Record<string, string>>(handler: Handler<P>) {
  return async (req: Request, context: { params: Promise<P> }) => {
    try {
      const db = await getDb();
      const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
      await hitRate(db, "api.ip", ip);
      const ctx = await authenticateApiKey(db, keyFromHeaders(req.headers), { ip, userAgent: req.headers.get("user-agent") ?? "" });
      if (req.method !== "GET" && req.method !== "HEAD") requireScope(ctx, "write");
      const params = context?.params ? await context.params : ({} as P);
      const out = await handler({ req, ctx, params, url: new URL(req.url) });
      if (out instanceof Response) return out;
      return apiJson(out ?? { ok: true }, req.method === "POST" ? 201 : 200);
    } catch (e) {
      if (e instanceof HttpError && e.status === 401) {
        return new Response(JSON.stringify({ error: e.message, code: e.code }), {
          status: 401,
          headers: { "content-type": "application/json; charset=utf-8", "www-authenticate": 'Bearer realm="pilot-makers"' },
        });
      }
      return errorResponse(e);
    }
  };
}

export async function readBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const b = await req.json();
    return b && typeof b === "object" && !Array.isArray(b) ? b : {};
  } catch {
    throw new HttpError(400, "bad_json", "Corps de requête JSON invalide");
  }
}

export function intParam(url: URL, name: string, def: number, min: number, max: number): number {
  const n = Number(url.searchParams.get(name) ?? def);
  return Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), min), max) : def;
}
