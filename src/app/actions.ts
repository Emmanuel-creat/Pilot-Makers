"use server";

import { cookies } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { HttpError, unauthorized } from "@/lib/http";
import {
  cancelAccountDeletion,
  changePassword,
  confirmAccountDeletion,
  login,
  logout,
  register,
  requestAccountDeletion,
  requestPasswordReset,
  resendVerification,
  resetPassword,
  revokeSession,
  updateUserPreferences,
  verifyEmail,
  createSession,
} from "@/lib/services/accounts";
import { addRelease, adminTriggerReset, answerTicket, createTicket, grantSupportAccess, setOrgSuspended, updatePlan } from "@/lib/services/admin";
import { cancelAtPeriodEnd, startCheckout } from "@/lib/services/billing";
import { bulkAdjustPrices, duplicateItem, installLibrary, setItemFlags } from "@/lib/services/catalog";
import type { Ctx } from "@/lib/services/context";
import { setCustomerArchived } from "@/lib/services/customers";
import { updateOrganization } from "@/lib/services/organization";
import { cancelQuote, createQuote, duplicateQuote, setArchived, deleteDraft, createRevision, recordResponseManually, revokeShareLinks } from "@/lib/services/quotes";
import { saveReminderSettings } from "@/lib/services/reminders";
import { acceptInvite, changeRole, inviteMember, removeMember, switchOrg } from "@/lib/services/team";
import type { LibraryTrade } from "@/lib/library";
import { clearSessionCookie, getCtx, requestMeta, setSessionCookie, SESSION_COOKIE, SUPPORT_COOKIE } from "@/lib/server/session";

export type ActionState = { ok?: boolean; error?: string; fieldErrors?: Record<string, string>; message?: string } | null;

function toState(e: unknown): ActionState {
  unstable_rethrow(e);
  if (e instanceof HttpError) {
    const details = e.details;
    const fieldErrors =
      details && typeof details === "object" && !Array.isArray(details) ? (details as Record<string, string>) : undefined;
    return { error: e.message, fieldErrors };
  }
  console.error(e);
  return { error: "Une erreur inattendue est survenue. Réessayez." };
}

async function withCtx<T>(fn: (ctx: Ctx) => Promise<T>): Promise<T> {
  const ctx = await getCtx();
  if (!ctx) throw unauthorized();
  return fn(ctx);
}

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "");

/* Authentification ------------------------------------------------- */

export async function registerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const db = await getDb();
    const meta = await requestMeta();
    const r = await register(
      db,
      {
        email: s(fd, "email"),
        password: s(fd, "password"),
        name: s(fd, "name"),
        company: s(fd, "company"),
        trade: s(fd, "trade"),
        acceptTerms: fd.get("acceptTerms") === "on" ? true : undefined,
      },
      meta,
    );
    const token = await createSession(db, r.userId, meta);
    await setSessionCookie(token);
  } catch (e) {
    return toState(e);
  }
  redirect("/verifier-email");
}

export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const db = await getDb();
    const token = await login(db, s(fd, "email"), s(fd, "password"), await requestMeta());
    await setSessionCookie(token);
  } catch (e) {
    return toState(e);
  }
  const next = s(fd, "next");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/app");
}

export async function logoutAction() {
  const c = await cookies();
  const token = c.get(SESSION_COOKIE)?.value;
  if (token) await logout(await getDb(), token);
  await clearSessionCookie();
  redirect("/connexion");
}

export async function forgotAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await requestPasswordReset(await getDb(), s(fd, "email"));
    return { ok: true, message: "Si un compte existe avec cette adresse, un lien de réinitialisation vient d'être envoyé." };
  } catch (e) {
    return toState(e);
  }
}

export async function resetAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    if (s(fd, "password") !== s(fd, "confirm")) return { error: "Les deux mots de passe ne correspondent pas" };
    await resetPassword(await getDb(), s(fd, "token"), s(fd, "password"));
  } catch (e) {
    return toState(e);
  }
  redirect("/connexion?reinitialise=1");
}

export async function verifyEmailAction(token: string): Promise<ActionState> {
  try {
    await verifyEmail(await getDb(), token);
    return { ok: true };
  } catch (e) {
    return toState(e);
  }
}

export async function resendVerificationAction(): Promise<ActionState> {
  try {
    const ctx = await getCtx();
    if (!ctx) throw unauthorized();
    await resendVerification(ctx.db, ctx.userId);
    return { ok: true, message: "Un nouveau lien vient d'être envoyé." };
  } catch (e) {
    return toState(e);
  }
}

/* Compte ------------------------------------------------------------ */

export async function preferencesAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => updateUserPreferences(ctx, { name: s(fd, "name"), locale: s(fd, "locale"), timezone: s(fd, "timezone") }));
    revalidatePath("/app", "layout");
    return { ok: true, message: "Préférences enregistrées." };
  } catch (e) {
    return toState(e);
  }
}

export async function passwordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    if (s(fd, "next") !== s(fd, "confirm")) return { error: "Les deux mots de passe ne correspondent pas" };
    await withCtx((ctx) => changePassword(ctx, s(fd, "current"), s(fd, "next")));
    return { ok: true, message: "Mot de passe modifié. Vos autres sessions ont été fermées." };
  } catch (e) {
    return toState(e);
  }
}

export async function revokeSessionAction(fd: FormData) {
  await withCtx((ctx) => revokeSession(ctx, s(fd, "id")));
  revalidatePath("/app/compte");
}

export async function requestDeletionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => requestAccountDeletion(ctx, s(fd, "password")));
    return { ok: true, message: "Un e-mail de confirmation vient d'être envoyé." };
  } catch (e) {
    return toState(e);
  }
}

export async function confirmDeletionAction(token: string): Promise<ActionState> {
  try {
    await confirmAccountDeletion(await getDb(), token);
    return { ok: true };
  } catch (e) {
    return toState(e);
  }
}

export async function cancelDeletionAction() {
  await withCtx((ctx) => cancelAccountDeletion(ctx));
  revalidatePath("/app/compte");
}

/* Entreprise -------------------------------------------------------- */

export async function saveOrganizationAction(input: Record<string, unknown>): Promise<ActionState> {
  try {
    const r = await withCtx((ctx) => updateOrganization(ctx, input));
    revalidatePath("/app", "layout");
    return { ok: true, message: r.changed ? "Modifications enregistrées." : "Aucune modification." };
  } catch (e) {
    return toState(e);
  }
}

export async function saveRemindersAction(input: Record<string, unknown>): Promise<ActionState> {
  try {
    await withCtx((ctx) => saveReminderSettings(ctx, input));
    return { ok: true, message: "Réglages des relances enregistrés." };
  } catch (e) {
    return toState(e);
  }
}

/* Équipe ------------------------------------------------------------ */

export async function inviteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => inviteMember(ctx, { email: s(fd, "email"), role: s(fd, "role") }));
    revalidatePath("/app/equipe");
    return { ok: true, message: "Invitation envoyée." };
  } catch (e) {
    return toState(e);
  }
}

export async function changeRoleAction(fd: FormData) {
  await withCtx((ctx) => changeRole(ctx, s(fd, "userId"), s(fd, "role") as "admin" | "member"));
  revalidatePath("/app/equipe");
}

export async function removeMemberAction(fd: FormData) {
  await withCtx((ctx) => removeMember(ctx, s(fd, "userId")));
  revalidatePath("/app/equipe");
}

export async function acceptInviteAction(token: string): Promise<ActionState> {
  try {
    await withCtx((ctx) => acceptInvite(ctx, token));
  } catch (e) {
    return toState(e);
  }
  redirect("/app");
}

export async function switchOrgAction(fd: FormData) {
  await withCtx((ctx) => switchOrg(ctx, s(fd, "orgId")));
  redirect("/app");
}

/* Abonnement -------------------------------------------------------- */

export async function checkoutAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const r = await withCtx((ctx) => startCheckout(ctx, s(fd, "plan"), s(fd, "interval") === "year" ? "year" : "month", s(fd, "card")));
    revalidatePath("/app", "layout");
    return r.ok ? { ok: true, message: "Abonnement activé." } : { error: "Le paiement a été refusé par la banque. Votre abonnement n'a pas changé." };
  } catch (e) {
    return toState(e);
  }
}

export async function cancelSubscriptionAction(fd: FormData) {
  await withCtx((ctx) => cancelAtPeriodEnd(ctx, s(fd, "cancel") === "1"));
  revalidatePath("/app", "layout");
}

/* Clients et catalogue ---------------------------------------------- */

export async function archiveCustomerAction(fd: FormData) {
  await withCtx((ctx) => setCustomerArchived(ctx, s(fd, "id"), s(fd, "archived") === "1"));
  revalidatePath("/app/clients");
}

export async function itemFlagsAction(fd: FormData) {
  const flags: { active?: boolean; favorite?: boolean } = {};
  if (fd.has("active")) flags.active = s(fd, "active") === "1";
  if (fd.has("favorite")) flags.favorite = s(fd, "favorite") === "1";
  await withCtx((ctx) => setItemFlags(ctx, s(fd, "id"), flags));
  revalidatePath("/app/catalogue");
}

export async function duplicateItemAction(fd: FormData) {
  const id = await withCtx((ctx) => duplicateItem(ctx, s(fd, "id")));
  redirect(`/app/catalogue/${id}`);
}

export async function bulkPriceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ids = fd.getAll("ids").map(String);
    if (!ids.length) return { error: "Sélectionnez au moins une prestation" };
    const r = await withCtx((ctx) => bulkAdjustPrices(ctx, ids, s(fd, "percent")));
    revalidatePath("/app/catalogue");
    return { ok: true, message: `${r.updated} tarif(s) mis à jour.` };
  } catch (e) {
    return toState(e);
  }
}

export async function installLibraryAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const r = await withCtx((ctx) => installLibrary(ctx, s(fd, "trade") as LibraryTrade));
    revalidatePath("/app/catalogue");
    return { ok: true, message: `${r.added} prestation(s) ajoutée(s) avec des tarifs indicatifs à adapter.` };
  } catch (e) {
    return toState(e);
  }
}

/* Devis ------------------------------------------------------------- */

export async function newQuoteAction(fd: FormData) {
  const customerId = s(fd, "customerId") || null;
  const id = await withCtx((ctx) => createQuote(ctx, { customerId, title: s(fd, "title").slice(0, 300), description: s(fd, "description").slice(0, 8000) }));
  redirect(`/app/devis/${id}${s(fd, "mode") === "assistant" ? "?assistant=1" : ""}`);
}

export async function duplicateQuoteAction(fd: FormData) {
  const id = await withCtx((ctx) => duplicateQuote(ctx, s(fd, "id"), { replace: s(fd, "replace") === "1" }));
  redirect(`/app/devis/${id}`);
}

export async function reviseQuoteAction(fd: FormData) {
  await withCtx((ctx) => createRevision(ctx, s(fd, "id")));
  revalidatePath(`/app/devis/${s(fd, "id")}`);
}

export async function cancelQuoteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => cancelQuote(ctx, s(fd, "id"), s(fd, "reason")));
    revalidatePath(`/app/devis/${s(fd, "id")}`);
    return { ok: true };
  } catch (e) {
    return toState(e);
  }
}

export async function archiveQuoteAction(fd: FormData) {
  await withCtx((ctx) => setArchived(ctx, s(fd, "id"), s(fd, "archived") === "1"));
  revalidatePath("/app/devis");
}

export async function deleteDraftAction(fd: FormData) {
  await withCtx((ctx) => deleteDraft(ctx, s(fd, "id")));
  redirect("/app/devis");
}

export async function manualResponseAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => recordResponseManually(ctx, s(fd, "id"), { decision: s(fd, "decision"), version: s(fd, "version"), proof: s(fd, "proof") }));
    revalidatePath(`/app/devis/${s(fd, "id")}`);
    return { ok: true };
  } catch (e) {
    return toState(e);
  }
}

export async function revokeLinksAction(fd: FormData) {
  await withCtx((ctx) => revokeShareLinks(ctx, s(fd, "id")));
  revalidatePath(`/app/devis/${s(fd, "id")}`);
}

/* Assistance -------------------------------------------------------- */

export async function ticketAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => createTicket(ctx, s(fd, "subject"), s(fd, "body")));
    revalidatePath("/app/assistance");
    return { ok: true, message: "Demande envoyée. Nous vous répondons ici." };
  } catch (e) {
    return toState(e);
  }
}

/* Administration ---------------------------------------------------- */

export async function suspendAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => setOrgSuspended(ctx, s(fd, "orgId"), s(fd, "suspend") === "1", s(fd, "reason")));
    revalidatePath(`/admin/comptes/${s(fd, "orgId")}`);
    return { ok: true };
  } catch (e) {
    return toState(e);
  }
}

export async function supportAccessAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: string;
  try {
    id = await withCtx((ctx) => grantSupportAccess(ctx, s(fd, "orgId"), s(fd, "reason"), Number(s(fd, "minutes") || 30)));
  } catch (e) {
    return toState(e);
  }
  const c = await cookies();
  c.set(SUPPORT_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 3600 });
  redirect("/app");
}

export async function stopSupportAction() {
  const c = await cookies();
  c.delete(SUPPORT_COOKIE);
  redirect("/admin");
}

export async function adminResetAction(fd: FormData) {
  await withCtx((ctx) => adminTriggerReset(ctx, s(fd, "userId")));
  revalidatePath(`/admin/comptes/${s(fd, "orgId")}`);
}

export async function planAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const maxQ = s(fd, "max_quotes_per_month");
    await withCtx((ctx) =>
      updatePlan(ctx, s(fd, "code"), {
        name: s(fd, "name"),
        description: s(fd, "description"),
        price_month_cents: Math.round(Number(s(fd, "price_month").replace(",", ".")) * 100),
        price_year_cents: Math.round(Number(s(fd, "price_year").replace(",", ".")) * 100),
        max_users: s(fd, "max_users"),
        max_quotes_per_month: maxQ ? maxQ : null,
        ai_quota_month: s(fd, "ai_quota_month"),
        trial_days: s(fd, "trial_days"),
        active: fd.get("active") === "on",
        features: {
          watermark: fd.get("watermark") === "on",
          margin: fd.get("margin") === "on",
          reminders: fd.get("reminders") === "on",
          templates: fd.get("templates") === "on",
        },
      }),
    );
    revalidatePath("/admin/offres");
    return { ok: true, message: "Offre enregistrée." };
  } catch (e) {
    return toState(e);
  }
}

export async function answerTicketAction(fd: FormData) {
  await withCtx((ctx) => answerTicket(ctx, s(fd, "id"), s(fd, "answer"), s(fd, "close") === "1"));
  revalidatePath("/admin/assistance");
}

export async function releaseAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => addRelease(ctx, s(fd, "version"), s(fd, "notes")));
    revalidatePath("/admin/versions");
    return { ok: true };
  } catch (e) {
    return toState(e);
  }
}
