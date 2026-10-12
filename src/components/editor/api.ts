/** Appels JSON vers l'API, avec message d'erreur lisible. */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
    public data: Record<string, unknown>,
  ) {
    super(message);
  }
}

export async function apiFetch<T = Record<string, unknown>>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), ...(rest.headers ?? {}) },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new ApiError("Connexion impossible. Vérifiez votre réseau : vos modifications sont conservées sur cet écran.", 0, "network", {});
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(String(data.error ?? "Erreur"), res.status, String(data.code ?? ""), data);
  return data as T;
}

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16));
