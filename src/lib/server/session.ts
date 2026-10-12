import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { HttpError, unauthorized, forbidden } from "@/lib/http";
import { hitRate } from "@/lib/rate-limit";
import { contextFromToken, SESSION_DAYS } from "@/lib/services/accounts";
import { resolveSupportAccess } from "@/lib/services/admin";
import { adminTwoFactorRequired, type Ctx } from "@/lib/services/context";

export const SESSION_COOKIE = "pm_session";
export const SUPPORT_COOKIE = "pm_support";

export async function requestMeta() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "local";
  return { ip, userAgent: h.get("user-agent") ?? "" };
}

export async function setSessionCookie(token: string) {
  const c = await cookies();
  c.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

export async function clearSessionCookie() {
  const c = await cookies();
  c.delete(SESSION_COOKIE);
  c.delete(SUPPORT_COOKIE);
}

/** Contexte de la requête, ou null si personne n'est connecté. */
export const getCtx = cache(async function getCtx(): Promise<Ctx | null> {
  const c = await cookies();
  const db = await getDb();
  const meta = await requestMeta();
  const ctx = await contextFromToken(db, c.get(SESSION_COOKIE)?.value, meta);
  if (!ctx) return null;
  const support = c.get(SUPPORT_COOKIE)?.value;
  if (support && ctx.isPlatformAdmin) {
    const access = await resolveSupportAccess(db, ctx.userId, support);
    if (access) {
      // Accès support : contexte de l'entreprise cliente, en lecture seule, avec motif journalisé.
      const org = await db.query<{ status: string }>("SELECT status FROM organizations WHERE id=$1", [access.org_id]);
      if (org.length) {
        return {
          ...ctx,
          orgId: access.org_id,
          role: "member",
          supportAccess: { reason: access.reason, expiresAt: access.expires_at },
          entitlements: { ...ctx.entitlements, readOnly: true, notice: `Accès support en lecture seule : ${access.reason}` },
        };
      }
    }
  }
  return ctx;
});

/** Pour les pages de l'application : redirige vers la connexion si besoin. */
export async function requirePageCtx(opts: { verified?: boolean } = {}): Promise<Ctx> {
  const ctx = await getCtx();
  if (!ctx) redirect("/connexion");
  if (opts.verified !== false) {
    const db = await getDb();
    const u = await db.query<{ email_verified_at: Date | null }>("SELECT email_verified_at FROM users WHERE id=$1", [ctx.userId]);
    if (!u[0]?.email_verified_at) redirect("/verifier-email");
  }
  return ctx;
}

export async function requireAdminPage(): Promise<Ctx> {
  const ctx = await requirePageCtx();
  if (!ctx.isPlatformAdmin || ctx.supportAccess) redirect("/app");
  if (adminTwoFactorRequired() && !ctx.twoFactor) redirect("/app/compte?double=requis");
  return ctx;
}

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return req.headers.get("sec-fetch-site") !== "cross-site";
  try {
    const o = new URL(origin);
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    return o.host === host;
  } catch {
    return false;
  }
}

type Handler<P> = (args: { req: Request; ctx: Ctx; params: P }) => Promise<Response | unknown>;

/**
 * Enveloppe des routes API : authentification, vérification d'origine pour les
 * écritures, conversion des erreurs en réponses JSON.
 */
export function api<P = Record<string, string>>(handler: Handler<P>, opts: { auth?: boolean } = {}) {
  return async (req: Request, context: { params: Promise<P> }) => {
    try {
      if (req.method !== "GET" && req.method !== "HEAD" && !sameOrigin(req)) throw forbidden("Origine de la requête refusée");
      const ctx = await getCtx();
      const db = await getDb();
      await hitRate(db, "api.ip", (await requestMeta()).ip);
      if (ctx) await hitRate(db, "api.user", ctx.userId);
      if (opts.auth !== false && !ctx) throw unauthorized();
      const params = context?.params ? await context.params : ({} as P);
      const out = await handler({ req, ctx: ctx as Ctx, params });
      if (out instanceof Response) return out;
      return NextResponse.json(out ?? { ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export function errorResponse(e: unknown) {
  if (e instanceof HttpError) {
    const retry = (e.details as { retryAfter?: number } | undefined)?.retryAfter;
    return NextResponse.json(
      { error: e.message, code: e.code, details: e.details ?? null },
      { status: e.status, headers: e.status === 429 && retry ? { "retry-after": String(retry) } : undefined },
    );
  }
  console.error(e);
  void import("@/lib/monitoring").then((m) => m.reportError(e, { kind: "api.internal" }));
  return NextResponse.json({ error: "Erreur interne. Réessayez dans un instant.", code: "internal" }, { status: 500 });
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    throw new HttpError(400, "bad_json", "Corps de requête JSON invalide");
  }
}
