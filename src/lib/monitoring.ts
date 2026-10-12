/**
 * Surveillance de production : chaque erreur inattendue est journalisée en base
 * (visible dans l'administration) et, si ALERT_WEBHOOK_URL est défini, signalée
 * par un message à un canal d'équipe (format accepté par Slack, Mattermost,
 * Discord et la plupart des outils de discussion).
 *
 * Les alertes sont regroupées : une seule par type d'erreur toutes les 10 minutes.
 * Aucune donnée personnelle n'est envoyée dans l'alerte, seulement le type,
 * le chemin et le début du message d'erreur.
 */

import { getDb } from "@/lib/db";
import { logError } from "@/lib/services/context";

const WINDOW_MS = 10 * 60 * 1000;
const lastAlert = new Map<string, number>();

export interface ErrorContext {
  path?: string;
  method?: string;
  kind?: string;
  orgId?: string | null;
}

function describe(err: unknown): { name: string; message: string; stack: string } {
  if (err instanceof Error) return { name: err.name, message: err.message, stack: (err.stack ?? "").split("\n").slice(0, 8).join("\n") };
  return { name: "Erreur", message: String(err), stack: "" };
}

/** Masque les adresses e-mail et longues suites de chiffres avant d'envoyer un texte hors de l'application. */
export function scrub(text: string): string {
  return text.replace(/[^\s@,;:()<>]+@[^\s@,;:()<>]+\.[a-z]{2,}/gi, "[e-mail]").replace(/\d{6,}/g, "[nombre]");
}

/** Faut-il envoyer une alerte pour ce type d'erreur maintenant ? */
export function shouldAlert(key: string, now = Date.now()): boolean {
  const last = lastAlert.get(key);
  if (last !== undefined && now - last < WINDOW_MS) return false;
  lastAlert.set(key, now);
  return true;
}

export function resetAlertsForTests() {
  lastAlert.clear();
}

export async function sendAlert(text: string, fetcher: typeof fetch = fetch): Promise<boolean> {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return false;
  try {
    const res = await fetcher(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, content: text }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Journalise une erreur inattendue et prévient l'équipe si besoin. Ne lève jamais d'exception. */
export async function reportError(err: unknown, ctx: ErrorContext = {}, fetcher: typeof fetch = fetch): Promise<void> {
  const e = describe(err);
  const kind = ctx.kind ?? "server.unhandled";
  try {
    const db = await getDb();
    await logError(db, kind, `${e.name}: ${e.message}`, ctx.orgId ?? null, { path: ctx.path, method: ctx.method, stack: e.stack });
  } catch {
    // La base peut être la cause de l'erreur : l'alerte part quand même.
  }
  const key = `${kind}:${e.name}:${ctx.path ?? ""}`;
  if (!shouldAlert(key)) return;
  const where = ctx.path ? ` sur ${ctx.method ?? ""} ${ctx.path}`.replace("  ", " ") : "";
  await sendAlert(scrub(`Pilot-Makers : erreur ${e.name}${where}. ${e.message.slice(0, 300)}`), fetcher);
}
