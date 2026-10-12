export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const unauthorized = (msg = "Connexion requise") => new HttpError(401, "unauthorized", msg);
export const forbidden = (msg = "Accès refusé") => new HttpError(403, "forbidden", msg);
export const notFound = (msg = "Introuvable") => new HttpError(404, "not_found", msg);
export const badRequest = (msg: string, details?: unknown) => new HttpError(400, "bad_request", msg, details);
export const conflict = (msg: string, details?: unknown) => new HttpError(409, "conflict", msg, details);
export const paymentRequired = (msg: string) => new HttpError(402, "plan_limit", msg);
export const tooMany = (msg: string) => new HttpError(429, "rate_limited", msg);

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
