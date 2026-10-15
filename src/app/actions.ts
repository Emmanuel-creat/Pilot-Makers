"use server";

import { confirmMatch, setIgnored, unmatch } from "@/lib/services/bank";
import { cookies } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { deleteIndexValue, saveIndexValue } from "@/lib/services/revision";
import { setOrgFeature } from "@/lib/services/features";
import { addVehicle, assign, deleteAssignment, deleteVehicle, moveAssignment } from "@/lib/services/planning";
import { deleteJournalEntry, liftReserve, signReception } from "@/lib/services/job-site";
import { releaseRetention } from "@/lib/services/warranties";
import { addAbsence, deleteAbsence } from "@/lib/services/absences";
import { addCertification, deleteCertification } from "@/lib/services/certifications";
import { addCheck, addTool, deleteCheck, deleteTool, markCheckDone } from "@/lib/services/fleet";
import { addTask, createJobFromQuote, deleteTask, setTaskProgress, updateJob } from "@/lib/services/jobs";
import { createEndpoint, deleteEndpoint, sendTestWebhook, setEndpointActive } from "@/lib/services/webhooks";
import { createApiKey, revokeApiKey } from "@/lib/services/api-keys";
import { createFeed, deleteFeed } from "@/lib/services/calendar";
import { createPortalLink, replyToClient, revokePortalLinks, setRequestHandled } from "@/lib/services/client-space";
import {
  addToJob,
  createSubcontractor,
  deleteDocument,
  removeFromJob,
  requestDocuments,
  setSubcontractorArchived,
  updateSubcontractor,
} from "@/lib/services/subcontractors";
import { appUrl } from "@/lib/services/mail";
import { addEntry, deleteEntry, reviewEntries, setMemberQualification, startTimer, stopTimer } from "@/lib/services/timesheets";
import { formatMinutes } from "@/lib/services/timesheet-calc";
import { deleteExpense, reviewExpenses } from "@/lib/services/expenses";
import { addPurchase, deletePurchase, setBudgetThreshold } from "@/lib/services/job-costs";
import {
  cancelOrder,
  createOrder,
  deleteLine,
  prepareOrders,
  receiveOrder,
  recordSupplierInvoice,
  saveLine,
  sendOrder,
  updateOrder,
} from "@/lib/services/purchase-orders";
import { getDb } from "@/lib/db";
import { HttpError, unauthorized } from "@/lib/http";
import {
  cancelAccountDeletion,
  changePassword,
  confirmAccountDeletion,
  beginLogin,
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
import { savePricing, updateOrganization } from "@/lib/services/organization";
import { saveGoals } from "@/lib/services/reports";
import { saveBudget } from "@/lib/services/budget";
import { setFormalNotice } from "@/lib/services/recovery";
import { saveAcquisitionCosts, SOURCES, type Source } from "@/lib/services/acquisition";
import { addLabel, deleteLabel, setLabelShown } from "@/lib/services/labels";
import { saveTravelRates } from "@/lib/services/travel";
import { deleteJobMessage, postJobMessage } from "@/lib/services/job-chat";
import { setMonthlyReport } from "@/lib/services/monthly-report";
import { hideReview, replyReview, requestReview } from "@/lib/services/reviews";
import { cancelVisit, saveVisitSettings } from "@/lib/services/visits";
import { saveDoeNotes } from "@/lib/services/doe";
import { saveSafetyPlan } from "@/lib/services/safety";
import { addJobWaste, deleteJobWaste } from "@/lib/services/waste";
import { deleteIntervention, saveIntervention, sendPlanning } from "@/lib/services/coordination";
import { archiveStockItem, createStockItem, moveStock, setThresholds, setVehicleKit } from "@/lib/services/stock";
import { addRental, deleteRental, returnRental } from "@/lib/services/rentals";
import { createGroup, deleteGroup, sendGroup } from "@/lib/services/order-groups";
import { collectReturn, createReturn, creditReturn, deleteReturn } from "@/lib/services/supplier-returns";
import { applyCostCorrection } from "@/lib/services/price-review";
import { switchSupplier } from "@/lib/services/supplier-compare";
import { setItemCarbon } from "@/lib/services/carbon";
import { ensureReferralCode, markReferralRewarded, saveReferralSettings } from "@/lib/services/referrals";
import { markDeclarationSent, saveDeclaration, saveLeaveFundSettings } from "@/lib/services/leave-fund";
import { addSkill, createApprentice, deleteApprentice, deleteSkill, setSkillLevel, updateApprentice } from "@/lib/services/apprentices";
import { savePenalties, setFinalAccountStatus } from "@/lib/services/final-account";
import { locateAll } from "@/lib/services/map";
import { deleteCampaign, saveCampaign, sendCampaign } from "@/lib/services/campaigns";
import { saveYearEnd } from "@/lib/services/year-end";
import { applyProposal } from "@/lib/services/auto-planning";
import { markWatchRead } from "@/lib/services/regulatory-watch";
import { saveProductInfo } from "@/lib/services/product-info";
import { assignCode } from "@/lib/services/barcode";
import { setOutdoorWork, shiftJob } from "@/lib/services/weather";
import { setBenchmarkOptin } from "@/lib/services/benchmark";
import { createHealthShare, revokeHealthShare } from "@/lib/services/health-score";
import { dismissAdvice } from "@/lib/services/advice";
import { addHomeEntry, deleteHomeEntry, revokeHomeShare, shareHomeRecord } from "@/lib/services/home-records";
import { recordMaintenance } from "@/lib/services/maintenance";
import { notifyCustomerDelay, setDelayAutoNotice } from "@/lib/services/delays";
import { defineStages, invoiceStage } from "@/lib/services/payment-stages";
import { assignMemberAgency, createAgency, deleteAgency } from "@/lib/services/agencies";
import { importSharedHomeRecord } from "@/lib/services/home-records";
import { setAidStep } from "@/lib/services/energy-diagnoses";
import { setCommitments } from "@/lib/services/commitments";
import { deleteRuleVersion, publishRuleVersion } from "@/lib/services/country-rules";
import { resolveFeedback, sendFeedback } from "@/lib/services/feedback";
import { addLeftover, deleteLeftover } from "@/lib/services/material-balance";
import { setJobCarbonSettings } from "@/lib/services/job-carbon";
import { endAway, saveAway } from "@/lib/services/away-mode";
import { cancelDeposit, createDeposit } from "@/lib/services/cheque-deposits";
import { startExam, submitExam } from "@/lib/services/management-course";
import { acquireListing, publishTemplate, settlePurchase, withdrawListing } from "@/lib/services/template-market";
import { contactTransferListing, saveTransferListing, setTransferListingStatus } from "@/lib/services/business-takeover";
import { setDayCloseReminder } from "@/lib/services/day-close";
import { importQuoteExchange } from "@/lib/services/quote-exchange";
import {
  addRenovationParticipant,
  answerRenovationInvite,
  createRenovation,
  removeRenovationParticipant,
  shareRenovation,
  updateRenovationParticipant,
} from "@/lib/services/renovation";
import { setTrustShown } from "@/lib/services/trust-score";
import { importWork, publishWork, reportWork, toggleWorkVote, updateWork } from "@/lib/services/open-works";
import { parseComposition } from "@/lib/open-works";
import { submitQuiz } from "@/lib/services/training";
import { applyLivePrices } from "@/lib/services/live-pricing";
import { addBiosourcedVariant } from "@/lib/services/biosourced";
import { saveMatchingProfile } from "@/lib/services/matching";
import { reopenMonth, verifyMonth } from "@/lib/services/continuous-accounting";
import { acceptAnswer, answerQuestion, askQuestion, report as reportCommunity, toggleVote } from "@/lib/services/community";
import { decideBenefit, requestBenefit } from "@/lib/services/pricing-benefits";
import { setTeamLocale } from "@/lib/services/team-day";
import { quoteFromDiagnosis, saveDiagnosis } from "@/lib/services/energy-diagnoses";
import { addConsortiumMember, answerConsortiumInvitation, assignLot, createConsortium, removeConsortiumMember } from "@/lib/services/consortia";
import { closeGroupPurchase, commitQuantity, createGroupPurchase } from "@/lib/services/group-buying";
import { answerRecommendation, sendRecommendation } from "@/lib/services/network-recommendations";
import { closePost, createPost, replyToPost } from "@/lib/services/network-board";
import { deleteFinancing, saveFinancing, setFinancingStatus } from "@/lib/services/financing";
import { createNetwork, importNetworkItems, joinNetwork, leaveNetwork, shareItems, unshareItem } from "@/lib/services/networks";
import { addTakeoffLines, deleteTakeoff, saveTakeoff, takeoffIdsSchema } from "@/lib/services/takeoffs";
import { formatEuros } from "@/lib/calc/format";
import {
  cancelQuote,
  createAmendment,
  createQuote,
  duplicateQuote,
  setArchived,
  deleteDraft,
  createRevision,
  recordResponseManually,
  revokeShareLinks,
} from "@/lib/services/quotes";
import { saveReminderSettings } from "@/lib/services/reminders";
import { convertLeadToQuote, createLead, updateLead } from "@/lib/services/leads";
import { createQuoteFromTemplate, deleteTemplate, renameTemplate } from "@/lib/services/templates";
import {
  cancelPayment,
  createCreditNote,
  createDepositInvoice,
  createFinalInvoice,
  createProgressInvoice,
  recordPayment,
  setInvoiceSchedule,
  clearInvoiceSchedule,
  saveInvoiceSettings,
  sendInvoice,
} from "@/lib/services/invoices";
import { beginTwoFactorSetup, completeLoginChallenge, confirmTwoFactor, disableTwoFactor, regenerateRecoveryCodes } from "@/lib/services/two-factor";
import { acceptInvite, changeRole, inviteMember, removeMember, setMemberFunction, switchOrg } from "@/lib/services/team";
import { decideSubQuote, integrateSubQuote, recordSubQuote, requestSubQuote } from "@/lib/services/subcontractor-quotes";
import { locateJob, locateMissing, setJobPosition } from "@/lib/services/routes";
import { createIncident, retryDeadJob, updateIncident } from "@/lib/services/status";
import { addShowcasePhoto, markListingChecked, removeShowcasePhoto, updateListing, updateShowcase } from "@/lib/services/showcase";
import { DAYS } from "@/lib/business-listing";
import { dismissCostAlert } from "@/lib/services/supplier-prices";
import { createRoadmapItem, deleteRoadmapItem, setRoadmapStatus } from "@/lib/services/roadmap";
import { addRge, removeRge } from "@/lib/services/aids";
import { saveTreasury } from "@/lib/services/finance";
import { savePlan } from "@/lib/services/accounting-plan";
import { saveMenu } from "@/lib/services/menu-prefs";
import {
  cancelCallback,
  cancelSession,
  closeCallback,
  createSession as createOnboardingSession,
  registerToSession,
  requestCallback,
  unregisterFromSession,
} from "@/lib/services/support-desk";
import type { LibraryTrade } from "@/lib/library";
import { clearSessionCookie, getCtx, requestMeta, setSessionCookie, SESSION_COOKIE, SUPPORT_COOKIE } from "@/lib/server/session";

export type ActionState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  message?: string;
  codes?: string[];
} | null;

function toState(e: unknown): ActionState {
  unstable_rethrow(e);
  if (e instanceof HttpError) {
    const details = e.details;
    const fieldErrors = details && typeof details === "object" && !Array.isArray(details) ? (details as Record<string, string>) : undefined;
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
  let challenge = false;
  try {
    const db = await getDb();
    const r = await beginLogin(db, s(fd, "email"), s(fd, "password"), await requestMeta());
    if ("challenge" in r) {
      const c = await cookies();
      c.set(CHALLENGE_COOKIE, r.challenge, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 600,
      });
      challenge = true;
    } else {
      await setSessionCookie(r.token);
    }
  } catch (e) {
    return toState(e);
  }
  const next = safeNext(s(fd, "next"));
  if (challenge) redirect("/connexion/verification" + (next !== "/app" ? "?next=" + encodeURIComponent(next) : ""));
  redirect(next);
}

const CHALLENGE_COOKIE = "pm_2fa";

function safeNext(next: string) {
  return next.startsWith("/") && !next.startsWith("//") ? next : "/app";
}

export async function verifyLoginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const db = await getDb();
    const c = await cookies();
    const userId = await completeLoginChallenge(db, c.get(CHALLENGE_COOKIE)?.value ?? "", s(fd, "code"));
    c.delete(CHALLENGE_COOKIE);
    await setSessionCookie(await createSession(db, userId, await requestMeta()));
  } catch (e) {
    return toState(e);
  }
  redirect(safeNext(s(fd, "next")));
}

/* Double authentification ------------------------------------------ */

export async function beginTwoFactorAction(): Promise<void> {
  await withCtx((ctx) => beginTwoFactorSetup(ctx));
  revalidatePath("/app/compte");
}

export async function confirmTwoFactorAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const codes = await withCtx((ctx) => confirmTwoFactor(ctx, s(fd, "code")));
    return { ok: true, codes, message: "Double authentification activée." };
  } catch (e) {
    return toState(e);
  }
}

export async function regenerateRecoveryAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const codes = await withCtx((ctx) => regenerateRecoveryCodes(ctx, s(fd, "code")));
    return { ok: true, codes, message: "Nouveaux codes de secours générés. Les anciens ne fonctionnent plus." };
  } catch (e) {
    return toState(e);
  }
}

export async function disableTwoFactorAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => disableTwoFactor(ctx, s(fd, "password"), s(fd, "code")));
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/app/compte");
  return { ok: true, message: "Double authentification désactivée." };
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
    await withCtx((ctx) => inviteMember(ctx, { email: s(fd, "email"), role: s(fd, "role") || undefined, jobFunction: s(fd, "jobFunction") }));
    revalidatePath("/app/equipe");
    return { ok: true, message: "Invitation envoyée." };
  } catch (e) {
    return toState(e);
  }
}

export async function setFunctionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => setMemberFunction(ctx, s(fd, "userId"), s(fd, "jobFunction")));
    revalidatePath("/app/equipe");
    return { ok: true, message: "Fonction enregistrée." };
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
  const templateId = s(fd, "templateId");
  const id = await withCtx((ctx) =>
    templateId
      ? createQuoteFromTemplate(ctx, templateId, { customerId, title: s(fd, "title").slice(0, 300) })
      : createQuote(ctx, { customerId, title: s(fd, "title").slice(0, 300), description: s(fd, "description").slice(0, 8000) }),
  );
  redirect(`/app/devis/${id}${s(fd, "mode") === "assistant" && !templateId ? "?assistant=1" : ""}`);
}

export async function renameTemplateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => renameTemplate(ctx, s(fd, "id"), { name: s(fd, "name"), description: s(fd, "description") }));
    revalidatePath("/app/modeles");
    return { ok: true, message: "Modèle enregistré." };
  } catch (e) {
    return toState(e);
  }
}

export async function deleteTemplateAction(fd: FormData) {
  await withCtx((ctx) => deleteTemplate(ctx, s(fd, "id")));
  revalidatePath("/app/modeles");
}

export async function duplicateQuoteAction(fd: FormData) {
  const id = await withCtx((ctx) => duplicateQuote(ctx, s(fd, "id"), { replace: s(fd, "replace") === "1", customerId: s(fd, "customerId") || undefined }));
  redirect(`/app/devis/${id}`);
}

export async function amendQuoteAction(fd: FormData) {
  const id = await withCtx((ctx) => createAmendment(ctx, s(fd, "id")));
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
    await withCtx((ctx) =>
      recordResponseManually(ctx, s(fd, "id"), {
        decision: s(fd, "decision"),
        version: s(fd, "version"),
        proof: s(fd, "proof"),
        reasonCode: s(fd, "reasonCode") || undefined,
      }),
    );
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

export async function saveMenuAction(menu: { main: string[]; mobile: string[] } | null): Promise<ActionState> {
  try {
    await withCtx((ctx) => saveMenu(ctx, menu));
    revalidatePath("/app", "layout");
    return { ok: true, message: menu ? "Menu enregistré." : "Menu d'origine rétabli." };
  } catch (e) {
    return toState(e);
  }
}

export async function callbackAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => requestCallback(ctx, { phone: s(fd, "phone"), date: s(fd, "date"), slot: s(fd, "slot"), topic: s(fd, "topic") }));
    revalidatePath("/app/assistance");
    return { ok: true, message: "Rappel demandé. Un conseiller vous appelle sur le créneau choisi." };
  } catch (e) {
    return toState(e);
  }
}

export async function cancelCallbackAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => cancelCallback(ctx, s(fd, "id")));
    revalidatePath("/app/assistance");
    return { ok: true, message: "Rappel annulé." };
  } catch (e) {
    return toState(e);
  }
}

export async function sessionRegistrationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const leave = s(fd, "leave") === "1";
    await withCtx((ctx) => (leave ? unregisterFromSession(ctx, s(fd, "id")) : registerToSession(ctx, s(fd, "id"))));
    revalidatePath("/app/assistance");
    return {
      ok: true,
      message: leave ? "Désinscription enregistrée." : "Inscription confirmée : le lien et l'invitation d'agenda vous sont envoyés par e-mail.",
    };
  } catch (e) {
    return toState(e);
  }
}

/* Administration ---------------------------------------------------- */

export async function closeCallbackAction(fd: FormData) {
  await withCtx((ctx) => closeCallback(ctx, s(fd, "id"), s(fd, "status"), s(fd, "outcome")));
  revalidatePath("/admin/assistance");
}

export async function createSessionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) =>
      createOnboardingSession(ctx, {
        startsAt: s(fd, "startsAt"),
        duration: s(fd, "duration"),
        title: s(fd, "title"),
        description: s(fd, "description"),
        capacity: s(fd, "capacity"),
        url: s(fd, "url"),
      }),
    );
    revalidatePath("/admin/assistance");
    return { ok: true, message: "Séance programmée." };
  } catch (e) {
    return toState(e);
  }
}

export async function cancelSessionAction(fd: FormData) {
  await withCtx((ctx) => cancelSession(ctx, s(fd, "id")));
  revalidatePath("/admin/assistance");
}

export async function suspendAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => setOrgSuspended(ctx, s(fd, "orgId"), s(fd, "suspend") === "1", s(fd, "reason")));
    revalidatePath(`/admin/comptes/${s(fd, "orgId")}`);
    return { ok: true };
  } catch (e) {
    return toState(e);
  }
}

export async function adminFeatureAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const orgId = s(fd, "orgId");
    await withCtx((ctx) => setOrgFeature(ctx, orgId, s(fd, "key"), s(fd, "value")));
    revalidatePath(`/admin/comptes/${orgId}`);
    return { ok: true, message: "Réglage enregistré." };
  } catch (e) {
    return toState(e);
  }
}

export async function createJobAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: string;
  try {
    id = await withCtx((ctx) => createJobFromQuote(ctx, s(fd, "quoteId")));
  } catch (e) {
    return toState(e);
  }
  redirect(`/app/chantiers/${id}`);
}

export async function saveJobAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const id = s(fd, "id");
    const names = fd.getAll("contact_name").map(String);
    const roles = fd.getAll("contact_role").map(String);
    const phones = fd.getAll("contact_phone").map(String);
    await withCtx((ctx) =>
      updateJob(ctx, id, {
        title: s(fd, "title"),
        status: s(fd, "status"),
        site_line1: s(fd, "site_line1"),
        site_line2: s(fd, "site_line2"),
        site_postal_code: s(fd, "site_postal_code"),
        site_city: s(fd, "site_city"),
        access_notes: s(fd, "access_notes"),
        access_codes: s(fd, "access_codes"),
        contacts: names.map((name, i) => ({ name, role: roles[i] ?? "", phone: phones[i] ?? "" })),
        start_date: s(fd, "start_date"),
        end_date: s(fd, "end_date"),
      }),
    );
    revalidatePath(`/app/chantiers/${id}`);
    return { ok: true, message: "Chantier enregistré." };
  } catch (e) {
    return toState(e);
  }
}

export async function taskProgressAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const jobId = await withCtx((ctx) => setTaskProgress(ctx, s(fd, "taskId"), Number(s(fd, "percent"))));
    revalidatePath(`/app/chantiers/${jobId}`);
    return { ok: true };
  } catch (e) {
    return toState(e);
  }
}

export async function addTaskAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const jobId = s(fd, "jobId");
    await withCtx((ctx) => addTask(ctx, jobId, { label: s(fd, "label"), section: s(fd, "section") }));
    revalidatePath(`/app/chantiers/${jobId}`);
    return { ok: true, message: "Tâche ajoutée." };
  } catch (e) {
    return toState(e);
  }
}

export async function deleteTaskAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => deleteTask(ctx, s(fd, "taskId")));
    revalidatePath(`/app/chantiers/${s(fd, "jobId")}`);
    return { ok: true };
  } catch (e) {
    return toState(e);
  }
}

export async function signReceptionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const jobId = s(fd, "jobId");
    const labels = fd.getAll("reserve_label").map(String);
    const locations = fd.getAll("reserve_location").map(String);
    const dues = fd.getAll("reserve_due").map(String);
    await withCtx((ctx) =>
      signReception(ctx, jobId, {
        decision: s(fd, "decision"),
        date: s(fd, "date"),
        place: s(fd, "place"),
        refusalReason: s(fd, "refusalReason"),
        reserves: labels.map((label, i) => ({ label, location: locations[i] ?? "", dueDate: dues[i] ?? "" })),
        clientName: s(fd, "clientName"),
        clientSignature: s(fd, "clientSignature"),
        companyName: s(fd, "companyName"),
        companySignature: s(fd, "companySignature"),
      }),
    );
    revalidatePath(`/app/chantiers/${jobId}`);
    return { ok: true, message: "Procès-verbal signé et enregistré." };
  } catch (e) {
    return toState(e);
  }
}

export async function liftReserveAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const jobId = await withCtx((ctx) => liftReserve(ctx, s(fd, "reserveId"), s(fd, "note")));
    revalidatePath(`/app/chantiers/${jobId}`);
    return { ok: true, message: "Réserve levée." };
  } catch (e) {
    return toState(e);
  }
}

export async function releaseRetentionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const jobId = s(fd, "jobId");
    await withCtx((ctx) => releaseRetention(ctx, jobId, s(fd, "note")));
    revalidatePath(`/app/chantiers/${jobId}`);
    revalidatePath("/app/chantiers/garanties");
    return { ok: true, message: "Retenue de garantie libérée." };
  } catch (e) {
    return toState(e);
  }
}

export async function deleteJournalAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const jobId = await withCtx((ctx) => deleteJournalEntry(ctx, s(fd, "entryId")));
    revalidatePath(`/app/chantiers/${jobId}`);
    return { ok: true };
  } catch (e) {
    return toState(e);
  }
}

export async function assignAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const [resourceType, resourceId] = s(fd, "resource").split(":");
    const r = await withCtx((ctx) =>
      assign(ctx, { jobId: s(fd, "jobId"), resourceType, resourceId, start: s(fd, "start"), end: s(fd, "end") || s(fd, "start") }),
    );
    revalidatePath("/app/planning");
    return r.conflicts.length
      ? { ok: true, message: `Affectation enregistrée, en conflit avec : ${r.conflicts.join(", ")}.` }
      : { ok: true, message: "Affectation enregistrée." };
  } catch (e) {
    return toState(e);
  }
}

export async function moveAssignmentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const [resourceType, resourceId] = s(fd, "resource").split(":");
    const r = await withCtx((ctx) => moveAssignment(ctx, s(fd, "id"), { resourceType, resourceId, start: s(fd, "start") }));
    revalidatePath("/app/planning");
    revalidatePath("/app/planning/equilibre");
    return r.conflicts.length ? { ok: true, message: `Déplacé, en conflit avec : ${r.conflicts.join(", ")}.` } : { ok: true, message: "Déplacé." };
  } catch (e) {
    return toState(e);
  }
}

export async function deleteAssignmentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => deleteAssignment(ctx, s(fd, "id")));
    revalidatePath("/app/planning");
    return { ok: true, message: "Affectation retirée." };
  } catch (e) {
    return toState(e);
  }
}

export async function absenceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    if (s(fd, "deleteId")) await withCtx((ctx) => deleteAbsence(ctx, s(fd, "deleteId")));
    else
      await withCtx((ctx) =>
        addAbsence(ctx, { userId: s(fd, "userId"), kind: s(fd, "kind"), start: s(fd, "start"), end: s(fd, "end") || s(fd, "start"), note: s(fd, "note") }),
      );
    revalidatePath("/app/planning");
    return { ok: true, message: s(fd, "deleteId") ? "Absence retirée." : "Absence enregistrée." };
  } catch (e) {
    return toState(e);
  }
}

export async function certificationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    if (s(fd, "deleteId")) await withCtx((ctx) => deleteCertification(ctx, s(fd, "deleteId")));
    else
      await withCtx((ctx) =>
        addCertification(ctx, {
          userId: s(fd, "userId"),
          name: s(fd, "name"),
          obtainedOn: s(fd, "obtainedOn"),
          validUntil: s(fd, "validUntil"),
          note: s(fd, "note"),
        }),
      );
    revalidatePath("/app/equipe");
    return { ok: true, message: s(fd, "deleteId") ? "Habilitation retirée." : "Habilitation enregistrée." };
  } catch (e) {
    return toState(e);
  }
}

export async function fleetAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const op = s(fd, "op");
    let message = "";
    await withCtx(async (ctx) => {
      if (op === "tool") {
        await addTool(ctx, { name: s(fd, "name"), reference: s(fd, "reference") });
        message = "Outil ajouté.";
      } else if (op === "deleteTool") {
        await deleteTool(ctx, s(fd, "id"));
        message = "Outil retiré.";
      } else if (op === "done") {
        const due = await markCheckDone(ctx, s(fd, "id"), s(fd, "doneOn"));
        message = due ? `Contrôle noté, prochain avant le ${due.split("-").reverse().join("/")}.` : "Contrôle noté.";
      } else if (op === "deleteCheck") {
        await deleteCheck(ctx, s(fd, "id"));
        message = "Contrôle retiré.";
      } else {
        await addCheck(ctx, {
          asset: s(fd, "asset"),
          label: s(fd, "label"),
          intervalMonths: s(fd, "intervalMonths"),
          dueDate: s(fd, "dueDate"),
          note: s(fd, "note"),
        });
        message = "Contrôle enregistré.";
      }
    });
    revalidatePath("/app/parc");
    return { ok: true, message };
  } catch (e) {
    return toState(e);
  }
}

export async function vehicleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    if (s(fd, "deleteId")) await withCtx((ctx) => deleteVehicle(ctx, s(fd, "deleteId")));
    else await withCtx((ctx) => addVehicle(ctx, { name: s(fd, "name"), plate: s(fd, "plate") }));
    revalidatePath("/app/planning");
    return { ok: true, message: s(fd, "deleteId") ? "Véhicule retiré." : "Véhicule ajouté." };
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

/* Factures ---------------------------------------------------------- */

export async function saveGoalsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => saveGoals(ctx, { signed: s(fd, "signed"), sent: s(fd, "sent") }));
    revalidatePath("/app/rapports");
    return { ok: true, message: "Objectifs enregistrés." };
  } catch (e) {
    return toState(e);
  }
}

export async function saveBudgetAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const year = Number(s(fd, "year"));
    await withCtx((ctx) => saveBudget(ctx, year, { facture: s(fd, "facture"), encaisse: s(fd, "encaisse"), achats: s(fd, "achats"), frais: s(fd, "frais") }));
    revalidatePath("/app/rapports/budget");
    return { ok: true, message: "Budget enregistré." };
  } catch (e) {
    return toState(e);
  }
}

export async function savePricingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const labels = fd.getAll("rate_label").map(String);
    const prices = fd.getAll("rate_price").map(String);
    const costs = fd.getAll("rate_cost").map(String);
    await withCtx((ctx) =>
      savePricing(ctx, {
        rates: labels.map((label, i) => ({ label, price: prices[i] ?? "", cost: costs[i] ?? "" })),
        perKm: s(fd, "per_km"),
        fixed: s(fd, "fixed"),
        freeKm: s(fd, "free_km"),
        coefficients: {
          materiau: s(fd, "coef_materiau"),
          sous_traitance: s(fd, "coef_sous_traitance"),
          main_oeuvre: s(fd, "coef_main_oeuvre"),
          autre: s(fd, "coef_autre"),
        },
      }),
    );
    revalidatePath("/app/entreprise");
    return { ok: true, message: "Tarifs enregistrés. Ils servent aux prochains devis." };
  } catch (e) {
    return toState(e);
  }
}

export async function saveIndexValueAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const r = await withCtx((ctx) => saveIndexValue(ctx, { code: s(fd, "code"), month: s(fd, "month"), value: s(fd, "value") }));
    revalidatePath("/app/entreprise");
    return { ok: true, message: `Valeur de ${r.code} enregistrée.` };
  } catch (e) {
    return toState(e);
  }
}

export async function deleteIndexValueAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => deleteIndexValue(ctx, s(fd, "code"), s(fd, "month")));
    revalidatePath("/app/entreprise");
    return { ok: true, message: "Valeur supprimée." };
  } catch (e) {
    return toState(e);
  }
}

export async function createWebhookAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const r = await withCtx((ctx) => createEndpoint(ctx, { url: s(fd, "url"), events: fd.getAll("events").map(String) }));
    revalidatePath("/app/entreprise");
    return { ok: true, message: r.secret };
  } catch (e) {
    return toState(e);
  }
}

export async function webhookCommandAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const id = s(fd, "id");
    const command = s(fd, "command");
    let message = "";
    if (command === "test") {
      const r = await withCtx((ctx) => sendTestWebhook(ctx, id));
      message = r.delivered ? "Événement de test reçu par votre adresse." : "Échec de l'envoi de test : voir le journal ci-dessous.";
    } else if (command === "pause" || command === "resume") {
      await withCtx((ctx) => setEndpointActive(ctx, id, command === "resume"));
      message = command === "pause" ? "Envois suspendus." : "Envois repris.";
    } else if (command === "delete") {
      await withCtx((ctx) => deleteEndpoint(ctx, id));
      message = "Adresse supprimée.";
    }
    revalidatePath("/app/entreprise");
    return { ok: true, message };
  } catch (e) {
    return toState(e);
  }
}

export async function createApiKeyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const r = await withCtx((ctx) => createApiKey(ctx, { name: s(fd, "name"), scope: s(fd, "scope") }));
    revalidatePath("/app/entreprise");
    return { ok: true, message: r.key };
  } catch (e) {
    return toState(e);
  }
}

export async function revokeApiKeyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => revokeApiKey(ctx, s(fd, "id")));
    revalidatePath("/app/entreprise");
    return { ok: true, message: "Clé révoquée : elle ne fonctionne plus." };
  } catch (e) {
    return toState(e);
  }
}

/* Abonnement d'agenda --------------------------------------------- */

export async function createCalendarFeedAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { token } = await withCtx((ctx) => createFeed(ctx, s(fd, "scope")));
    revalidatePath("/app/planning");
    return { ok: true, message: appUrl(`/api/agenda/${token}.ics`) };
  } catch (e) {
    return toState(e);
  }
}

export async function deleteCalendarFeedAction(_: ActionState): Promise<ActionState> {
  try {
    await withCtx((ctx) => deleteFeed(ctx));
    revalidatePath("/app/planning");
    return { ok: true, message: "Lien supprimé : l'agenda ne se met plus à jour." };
  } catch (e) {
    return toState(e);
  }
}

/* Sous-traitants ---------------------------------------------------- */

const subFields = (fd: FormData) => ({
  name: s(fd, "name"),
  siret: s(fd, "siret"),
  trade: s(fd, "trade"),
  contactName: s(fd, "contactName"),
  email: s(fd, "email"),
  phone: s(fd, "phone"),
  notes: s(fd, "notes"),
  autoRemind: fd.get("autoRemind") === "on",
});

export async function createSubcontractorAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: string;
  try {
    id = await withCtx((ctx) => createSubcontractor(ctx, subFields(fd)));
  } catch (e) {
    return toState(e);
  }
  redirect(`/app/sous-traitants/${id}`);
}

export async function updateSubcontractorAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const id = s(fd, "id");
    await withCtx((ctx) => updateSubcontractor(ctx, id, subFields(fd)));
    revalidatePath("/app/sous-traitants", "layout");
    return { ok: true, message: "Fiche enregistrée." };
  } catch (e) {
    return toState(e);
  }
}

export async function archiveSubcontractorAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const archived = s(fd, "archived") === "1";
    await withCtx((ctx) => setSubcontractorArchived(ctx, s(fd, "id"), archived));
    revalidatePath("/app/sous-traitants", "layout");
    return { ok: true, message: archived ? "Sous-traitant archivé." : "Sous-traitant réactivé." };
  } catch (e) {
    return toState(e);
  }
}

export async function deleteSubDocumentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => deleteDocument(ctx, s(fd, "docId")));
    revalidatePath("/app/sous-traitants", "layout");
    return { ok: true, message: "Document supprimé." };
  } catch (e) {
    return toState(e);
  }
}

export async function requestSubDocumentsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => requestDocuments(ctx, s(fd, "id")));
    revalidatePath("/app/sous-traitants", "layout");
    return { ok: true, message: "Demande envoyée par e-mail." };
  } catch (e) {
    return toState(e);
  }
}

export async function addJobSubcontractorAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const jobId = s(fd, "jobId");
    await withCtx((ctx) => addToJob(ctx, jobId, { subcontractorId: s(fd, "subcontractorId"), scope: s(fd, "scope"), amount: s(fd, "amount") }));
    revalidatePath(`/app/chantiers/${jobId}`);
    return { ok: true, message: "Sous-traitant ajouté au chantier." };
  } catch (e) {
    return toState(e);
  }
}

export async function removeJobSubcontractorAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const jobId = s(fd, "jobId");
    await withCtx((ctx) => removeFromJob(ctx, jobId, s(fd, "subcontractorId")));
    revalidatePath(`/app/chantiers/${jobId}`);
    return { ok: true, message: "Sous-traitant retiré du chantier." };
  } catch (e) {
    return toState(e);
  }
}

/* Espace client et échanges ----------------------------------------- */

export async function replyToClientAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const quoteId = s(fd, "quoteId");
    const r = await withCtx((ctx) => replyToClient(ctx, quoteId, s(fd, "body")));
    revalidatePath(`/app/devis/${quoteId}`);
    return { ok: true, message: r.emailed ? "Réponse envoyée par e-mail." : "Réponse enregistrée : le client la verra sur sa page." };
  } catch (e) {
    return toState(e);
  }
}

export async function requestHandledAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => setRequestHandled(ctx, s(fd, "id"), s(fd, "handled") === "1"));
    revalidatePath(`/app/devis/${s(fd, "quoteId")}`);
    return { ok: true, message: "Demande mise à jour." };
  } catch (e) {
    return toState(e);
  }
}

export async function portalLinkAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const customerId = s(fd, "customerId");
    const send = s(fd, "send") === "1";
    const r = await withCtx((ctx) => createPortalLink(ctx, customerId, { send }));
    revalidatePath(`/app/clients/${customerId}`);
    return { ok: true, message: send ? `Lien envoyé par e-mail. ${r.url}` : r.url };
  } catch (e) {
    return toState(e);
  }
}

export async function revokePortalAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const customerId = s(fd, "customerId");
    await withCtx((ctx) => revokePortalLinks(ctx, customerId));
    revalidatePath(`/app/clients/${customerId}`);
    return { ok: true, message: "Liens désactivés : l'espace client n'est plus accessible." };
  } catch (e) {
    return toState(e);
  }
}

/* Pointage --------------------------------------------------------- */

export async function startTimerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => startTimer(ctx, { jobId: s(fd, "jobId"), latitude: s(fd, "latitude"), longitude: s(fd, "longitude") }));
    revalidatePath("/app/pointage");
    revalidatePath("/montre");
    return { ok: true, message: "Pointage commencé." };
  } catch (e) {
    return toState(e);
  }
}

export async function stopTimerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const r = await withCtx((ctx) => stopTimer(ctx, { note: s(fd, "note") }));
    revalidatePath("/app/pointage");
    revalidatePath("/montre");
    return { ok: true, message: `Pointage terminé : ${formatMinutes(r.minutes)}.` };
  } catch (e) {
    return toState(e);
  }
}

export async function addEntryAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) =>
      addEntry(ctx, { jobId: s(fd, "jobId"), date: s(fd, "date"), duration: s(fd, "duration"), note: s(fd, "note"), userId: s(fd, "userId") }),
    );
    revalidatePath("/app/pointage");
    return { ok: true, message: "Heures enregistrées." };
  } catch (e) {
    return toState(e);
  }
}

export async function deleteEntryAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => deleteEntry(ctx, s(fd, "id")));
    revalidatePath("/app/pointage");
    return { ok: true, message: "Pointage supprimé." };
  } catch (e) {
    return toState(e);
  }
}

export async function reviewEntriesAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const decision = s(fd, "decision") as "valide" | "refuse" | "saisi";
    const r = await withCtx((ctx) => reviewEntries(ctx, fd.getAll("ids").map(String), decision, s(fd, "note")));
    revalidatePath("/app/pointage");
    const verb = decision === "valide" ? "validé(s)" : decision === "refuse" ? "refusé(s)" : "rouvert(s)";
    return { ok: true, message: `${r.updated} pointage(s) ${verb}.` };
  } catch (e) {
    return toState(e);
  }
}

/* Notes de frais --------------------------------------------------- */

export async function deleteExpenseAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => deleteExpense(ctx, s(fd, "id")));
    revalidatePath("/app/frais");
    return { ok: true, message: "Note de frais supprimée." };
  } catch (e) {
    return toState(e);
  }
}

export async function reviewExpensesAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const decision = s(fd, "decision") as "valide" | "refuse" | "soumis" | "rembourse";
    const r = await withCtx((ctx) => reviewExpenses(ctx, fd.getAll("ids").map(String), decision, s(fd, "note")));
    revalidatePath("/app/frais");
    const verb = { valide: "validée(s)", refuse: "refusée(s)", soumis: "rouverte(s)", rembourse: "marquée(s) remboursée(s)" }[decision] ?? "traitée(s)";
    return { ok: true, message: `${r.updated} note(s) ${verb}.` };
  } catch (e) {
    return toState(e);
  }
}

export async function setQualificationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => setMemberQualification(ctx, s(fd, "userId"), s(fd, "qualification")));
    revalidatePath("/app/equipe");
    return { ok: true, message: "Qualification enregistrée." };
  } catch (e) {
    return toState(e);
  }
}

/* Coûts de chantier ------------------------------------------------ */

export async function addPurchaseAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const jobId = s(fd, "jobId");
    await withCtx((ctx) =>
      addPurchase(ctx, jobId, {
        date: s(fd, "date"),
        label: s(fd, "label"),
        supplier: s(fd, "supplier"),
        category: s(fd, "category"),
        amount: s(fd, "amount"),
        taskId: s(fd, "taskId"),
        reference: s(fd, "reference"),
      }),
    );
    revalidatePath(`/app/chantiers/${jobId}`);
    return { ok: true, message: "Achat enregistré." };
  } catch (e) {
    return toState(e);
  }
}

export async function deletePurchaseAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => deletePurchase(ctx, s(fd, "id")));
    revalidatePath("/app/chantiers", "layout");
    return { ok: true, message: "Achat supprimé." };
  } catch (e) {
    return toState(e);
  }
}

export async function budgetThresholdAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const jobId = s(fd, "jobId");
    await withCtx((ctx) => setBudgetThreshold(ctx, jobId, s(fd, "percent")));
    revalidatePath(`/app/chantiers/${jobId}`);
    return { ok: true, message: "Seuil d'alerte enregistré." };
  } catch (e) {
    return toState(e);
  }
}

/* Commandes fournisseurs ------------------------------------------- */

const orderPath = (jobId: string, orderId?: string) => `/app/chantiers/${jobId}` + (orderId ? `/commandes/${orderId}` : "");

export async function prepareOrdersAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const jobId = s(fd, "jobId");
  let ids: string[];
  try {
    ids = await withCtx((ctx) => prepareOrders(ctx, jobId));
  } catch (e) {
    return toState(e);
  }
  revalidatePath(orderPath(jobId));
  if (ids.length === 1) redirect(orderPath(jobId, ids[0]));
  return { ok: true, message: `${ids.length} commandes préparées, une par fournisseur.` };
}

export async function createOrderAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const jobId = s(fd, "jobId");
  let id: string;
  try {
    id = await withCtx((ctx) => createOrder(ctx, jobId, s(fd, "supplier")));
  } catch (e) {
    return toState(e);
  }
  redirect(orderPath(jobId, id));
}

export async function updateOrderAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const id = s(fd, "orderId");
    await withCtx((ctx) =>
      updateOrder(ctx, id, {
        supplier: s(fd, "supplier"),
        supplierEmail: s(fd, "supplierEmail"),
        deliveryDate: s(fd, "deliveryDate"),
        deliveryAddress: s(fd, "deliveryAddress"),
        notes: s(fd, "notes"),
      }),
    );
    revalidatePath(orderPath(s(fd, "jobId"), id));
    return { ok: true, message: "Commande enregistrée." };
  } catch (e) {
    return toState(e);
  }
}

export async function saveOrderLineAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const id = s(fd, "orderId");
    await withCtx((ctx) =>
      saveLine(ctx, id, {
        id: s(fd, "lineId"),
        label: s(fd, "label"),
        reference: s(fd, "reference"),
        unit: s(fd, "unit") || "u",
        quantity: s(fd, "quantity"),
        unitCost: s(fd, "unitCost"),
      }),
    );
    revalidatePath(orderPath(s(fd, "jobId"), id));
    return { ok: true, message: "Ligne enregistrée." };
  } catch (e) {
    return toState(e);
  }
}

export async function deleteOrderLineAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const id = s(fd, "orderId");
    await withCtx((ctx) => deleteLine(ctx, id, s(fd, "lineId")));
    revalidatePath(orderPath(s(fd, "jobId"), id));
    return { ok: true, message: "Ligne supprimée." };
  } catch (e) {
    return toState(e);
  }
}

export async function orderStatusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const id = s(fd, "orderId");
    const send = s(fd, "decision") === "envoyer";
    await withCtx((ctx) => (send ? sendOrder(ctx, id) : cancelOrder(ctx, id)));
    revalidatePath(orderPath(s(fd, "jobId")), "layout");
    return { ok: true, message: send ? "Commande marquée envoyée. Téléchargez le bon pour le transmettre au fournisseur." : "Commande annulée." };
  } catch (e) {
    return toState(e);
  }
}

export async function receiveOrderAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const id = s(fd, "orderId");
    const received: Record<string, string> = {};
    for (const [k, v] of fd.entries()) if (k.startsWith("recu_") && typeof v === "string") received[k.slice(5)] = v;
    const status = await withCtx((ctx) =>
      receiveOrder(ctx, id, received, { deliveredOn: s(fd, "deliveredOn"), noteNumber: s(fd, "noteNumber"), issues: s(fd, "issues") }),
    );
    revalidatePath(orderPath(s(fd, "jobId")), "layout");
    return {
      ok: true,
      message: status === "recu" ? "Commande reçue en totalité." : status === "recu_partiel" ? "Réception partielle enregistrée." : "Réception enregistrée.",
    };
  } catch (e) {
    return toState(e);
  }
}

export async function supplierInvoiceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const id = s(fd, "orderId");
    const r = await withCtx((ctx) => recordSupplierInvoice(ctx, id, { date: s(fd, "date"), amount: s(fd, "amount"), reference: s(fd, "reference") }));
    revalidatePath(orderPath(s(fd, "jobId")), "layout");
    return r.matching === "conforme"
      ? { ok: true, message: "Facture rapprochée : conforme à la marchandise reçue." }
      : { ok: true, message: "Facture enregistrée, mais son montant ne correspond pas à la marchandise reçue : vérifiez l'écart." };
  } catch (e) {
    return toState(e);
  }
}

export async function saveInvoiceSettingsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) =>
      saveInvoiceSettings(ctx, {
        invoice_prefix: s(fd, "invoice_prefix"),
        credit_prefix: s(fd, "credit_prefix"),
        invoice_due_days: s(fd, "invoice_due_days"),
        late_penalty_text: s(fd, "late_penalty_text"),
        reminders_enabled: fd.get("reminders_enabled") === "on",
        reminder_days: s(fd, "reminder_days"),
        reminders_adaptive: fd.get("reminders_adaptive") === "on",
      }),
    );
    revalidatePath("/app/entreprise");
    return { ok: true, message: "Paramètres de facturation enregistrés." };
  } catch (e) {
    return toState(e);
  }
}

export async function depositInvoiceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: string;
  try {
    id = (await withCtx((ctx) => createDepositInvoice(ctx, s(fd, "quoteId"), { percent: s(fd, "percent") }))).id;
  } catch (e) {
    return toState(e);
  }
  redirect(`/app/factures/${id}`);
}

export async function progressInvoiceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: string;
  try {
    id = (await withCtx((ctx) => createProgressInvoice(ctx, s(fd, "quoteId"), { percent: s(fd, "percent"), revisionMonth: s(fd, "revisionMonth") }))).id;
  } catch (e) {
    return toState(e);
  }
  redirect(`/app/factures/${id}`);
}

export async function finalInvoiceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: string;
  try {
    id = (await withCtx((ctx) => createFinalInvoice(ctx, s(fd, "quoteId"), { revisionMonth: s(fd, "revisionMonth") }))).id;
  } catch (e) {
    return toState(e);
  }
  redirect(`/app/factures/${id}`);
}

export async function creditNoteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: string;
  try {
    const mode = s(fd, "mode");
    const input =
      mode === "partial"
        ? { mode, label: s(fd, "label"), amountHt: s(fd, "amountHt"), vatPercent: s(fd, "vatPercent") }
        : { mode: "full", reason: s(fd, "reason") };
    id = (await withCtx((ctx) => createCreditNote(ctx, s(fd, "invoiceId"), input))).id;
  } catch (e) {
    return toState(e);
  }
  redirect(`/app/factures/${id}`);
}

export async function paymentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) =>
      recordPayment(ctx, s(fd, "invoiceId"), { amount: s(fd, "amount"), paidOn: s(fd, "paidOn"), method: s(fd, "method"), reference: s(fd, "reference") }),
    );
    revalidatePath(`/app/factures/${s(fd, "invoiceId")}`);
    return { ok: true, message: "Paiement enregistré." };
  } catch (e) {
    return toState(e);
  }
}

export async function scheduleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) =>
      setInvoiceSchedule(ctx, s(fd, "invoiceId"), { count: s(fd, "count"), firstDate: s(fd, "firstDate"), everyMonths: s(fd, "everyMonths") || "1" }),
    );
    revalidatePath(`/app/factures/${s(fd, "invoiceId")}`);
    return { ok: true, message: "Échéancier enregistré." };
  } catch (e) {
    return toState(e);
  }
}

export async function clearScheduleAction(fd: FormData) {
  await withCtx((ctx) => clearInvoiceSchedule(ctx, s(fd, "invoiceId")));
  revalidatePath(`/app/factures/${s(fd, "invoiceId")}`);
}

export async function cancelPaymentAction(fd: FormData) {
  await withCtx((ctx) => cancelPayment(ctx, s(fd, "id")));
  revalidatePath(`/app/factures/${s(fd, "invoiceId")}`);
}

export async function sendInvoiceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const r = await withCtx((ctx) => sendInvoice(ctx, s(fd, "invoiceId"), { to: s(fd, "to"), subject: s(fd, "subject"), body: s(fd, "body") }));
    revalidatePath(`/app/factures/${s(fd, "invoiceId")}`);
    if (r.status !== "sent") return { error: r.error ?? "L'envoi a échoué" };
    return { ok: true, message: "Envoyé." };
  } catch (e) {
    return toState(e);
  }
}

/* Demandes entrantes */

export async function createLeadAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) =>
      createLead(ctx, {
        name: s(fd, "name"),
        email: s(fd, "email"),
        phone: s(fd, "phone"),
        city: s(fd, "city"),
        description: s(fd, "description"),
        source: s(fd, "source") || undefined,
        next_action: s(fd, "next_action"),
        next_action_on: s(fd, "next_action_on"),
      }),
    );
    revalidatePath("/app/demandes");
    return { ok: true };
  } catch (e) {
    return toState(e);
  }
}

export async function updateLeadAction(fd: FormData) {
  await withCtx((ctx) =>
    updateLead(ctx, s(fd, "id"), { status: s(fd, "status") || undefined, next_action: s(fd, "next_action"), next_action_on: s(fd, "next_action_on") }),
  );
  revalidatePath("/app/demandes");
}

export async function convertLeadAction(fd: FormData) {
  const quoteId = await withCtx((ctx) => convertLeadToQuote(ctx, s(fd, "id")));
  redirect(`/app/devis/${quoteId}`);
}

/* Devis des sous-traitants */

export async function requestSubQuoteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const quoteId = s(fd, "quoteId");
    const subcontractorId = s(fd, "subcontractorId");
    const r = await withCtx((ctx) =>
      requestSubQuote(ctx, { subcontractorId, quoteId, title: s(fd, "title"), description: s(fd, "description"), send: s(fd, "send") === "1" }),
    );
    if (quoteId) revalidatePath(`/app/devis/${quoteId}`);
    revalidatePath(`/app/sous-traitants/${subcontractorId}`);
    return { ok: true, message: r.emailed ? `Demande envoyée par e-mail. ${r.url}` : `Demande créée. Lien à transmettre : ${r.url}` };
  } catch (e) {
    return toState(e);
  }
}

export async function recordSubQuoteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => recordSubQuote(ctx, s(fd, "id"), { amount: s(fd, "amount"), delay: s(fd, "delay"), note: s(fd, "note") }));
    revalidatePath(s(fd, "back") || "/app/sous-traitants");
    return { ok: true, message: "Prix enregistré." };
  } catch (e) {
    return toState(e);
  }
}

export async function integrateSubQuoteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let quoteId = "";
  try {
    ({ quoteId } = await withCtx((ctx) => integrateSubQuote(ctx, s(fd, "id"), { quoteId: s(fd, "quoteId"), margin: s(fd, "margin") })));
  } catch (e) {
    return toState(e);
  }
  redirect(`/app/devis/${quoteId}?ligne=sous-traitance`);
}

export async function decideSubQuoteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const decision = s(fd, "decision") === "annule" ? "annule" : "refuse";
    await withCtx((ctx) => decideSubQuote(ctx, s(fd, "id"), decision));
    revalidatePath(s(fd, "back") || "/app/sous-traitants");
    return { ok: true, message: decision === "annule" ? "Demande annulée." : "Prix écarté." };
  } catch (e) {
    return toState(e);
  }
}

/* Itinéraires */

export async function locateJobAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const jobId = s(fd, "jobId");
    const p = await withCtx((ctx) => locateJob(ctx, jobId));
    revalidatePath(`/app/chantiers/${jobId}`);
    return { ok: true, message: `Chantier localisé : ${p.label || "adresse trouvée"}.` };
  } catch (e) {
    return toState(e);
  }
}

export async function jobPositionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const jobId = s(fd, "jobId");
    await withCtx((ctx) => setJobPosition(ctx, jobId, s(fd, "latitude"), s(fd, "longitude")));
    revalidatePath(`/app/chantiers/${jobId}`);
    return { ok: true, message: "Position du chantier enregistrée." };
  } catch (e) {
    return toState(e);
  }
}

export async function locateMissingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const r = await withCtx((ctx) => locateMissing(ctx, s(fd, "date")));
    revalidatePath("/app/planning/trajets");
    return {
      ok: true,
      message: r.missing
        ? `${r.found} chantier(s) localisé(s), ${r.missing} adresse(s) introuvable(s) : enregistrez leur position depuis le chantier.`
        : `${r.found} chantier(s) localisé(s).`,
    };
  } catch (e) {
    return toState(e);
  }
}

/* Statut public */

export async function createIncidentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => createIncident(ctx, { title: s(fd, "title"), body: s(fd, "body"), severity: s(fd, "severity"), startsAt: s(fd, "startsAt") }));
    revalidatePath("/admin/statut");
    return { ok: true, message: "Incident publié sur la page de statut." };
  } catch (e) {
    return toState(e);
  }
}

export async function updateIncidentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const resolve = s(fd, "resolve") === "1";
    await withCtx((ctx) => updateIncident(ctx, s(fd, "id"), { note: s(fd, "note"), resolve }));
    revalidatePath("/admin/statut");
    return { ok: true, message: resolve ? "Incident clos." : "Information ajoutée." };
  } catch (e) {
    return toState(e);
  }
}

export async function retryJobAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => retryDeadJob(ctx, s(fd, "id")));
    revalidatePath("/admin/statut");
    return { ok: true, message: "Tâche relancée." };
  } catch (e) {
    return toState(e);
  }
}

/* Rapprochement bancaire -------------------------------------------- */

export async function bankMatchAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => confirmMatch(ctx, s(fd, "id"), s(fd, "invoiceId")));
    revalidatePath("/app/banque");
    return { ok: true, message: "Paiement enregistré sur la facture." };
  } catch (e) {
    return toState(e);
  }
}

export async function bankIgnoreAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => setIgnored(ctx, s(fd, "id"), s(fd, "ignore") === "1"));
    revalidatePath("/app/banque");
    return { ok: true, message: s(fd, "ignore") === "1" ? "Opération mise de côté." : "Opération remise à rapprocher." };
  } catch (e) {
    return toState(e);
  }
}

export async function bankUnmatchAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => unmatch(ctx, s(fd, "id")));
    revalidatePath("/app/banque");
    return { ok: true, message: "Rapprochement défait : le paiement a été annulé." };
  } catch (e) {
    return toState(e);
  }
}

/* Vitrine ----------------------------------------------------------- */

export async function showcaseAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const r = await withCtx((ctx) =>
      updateShowcase(ctx, {
        enabled: fd.get("enabled"),
        slug: s(fd, "slug"),
        intro: s(fd, "intro"),
        area: s(fd, "area"),
        show_phone: fd.get("show_phone"),
        show_email: fd.get("show_email"),
      }),
    );
    revalidatePath("/app/entreprise");
    return { ok: true, message: r.enabled ? "Vitrine publiée." : "Vitrine enregistrée, non publiée." };
  } catch (e) {
    return toState(e);
  }
}

export async function listingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const hours = Object.fromEntries(DAYS.map((d) => [d.key, s(fd, `hours_${d.key}`)]));
    const links = fd.getAll("link_url").map((url, i) => ({ site: String(fd.getAll("link_site")[i] ?? "Autre"), url: String(url) }));
    await withCtx((ctx) => updateListing(ctx, { hours, links }));
    revalidatePath("/app/entreprise");
    revalidatePath("/pro/[slug]", "page");
    return { ok: true, message: "Fiche d'établissement enregistrée." };
  } catch (e) {
    return toState(e);
  }
}

export async function listingCheckedAction(_: ActionState): Promise<ActionState> {
  try {
    await withCtx((ctx) => markListingChecked(ctx));
    revalidatePath("/app/entreprise");
    return { ok: true, message: "Vérification notée. Prochain rappel dans six mois." };
  } catch (e) {
    return toState(e);
  }
}

export async function showcasePhotoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) =>
      addShowcasePhoto(ctx, s(fd, "journalId"), {
        caption: s(fd, "caption"),
        showCity: fd.get("showCity"),
        consent: fd.get("consent"),
        consentNote: s(fd, "consentNote"),
      }),
    );
    revalidatePath(`/app/chantiers/${s(fd, "jobId")}`);
    revalidatePath("/app/entreprise");
    return { ok: true, message: "Photo ajoutée à la vitrine." };
  } catch (e) {
    return toState(e);
  }
}

export async function removeShowcasePhotoAction(fd: FormData) {
  await withCtx((ctx) => removeShowcasePhoto(ctx, s(fd, "id")));
  revalidatePath("/app/entreprise");
}

export async function dismissCostAlertAction(fd: FormData) {
  await withCtx((ctx) => dismissCostAlert(ctx, s(fd, "id")));
  revalidatePath("/app/catalogue");
}

/* Feuille de route ----------------------------------------------------- */

export async function createRoadmapAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => createRoadmapItem(ctx, { title: s(fd, "title"), description: s(fd, "description"), status: s(fd, "status") }));
    revalidatePath("/admin/feuille-de-route");
    return { ok: true, message: "Sujet publié sur la feuille de route." };
  } catch (e) {
    return toState(e);
  }
}

export async function roadmapStatusAction(fd: FormData) {
  await withCtx((ctx) => setRoadmapStatus(ctx, s(fd, "id"), s(fd, "status")));
  revalidatePath("/admin/feuille-de-route");
}

export async function deleteRoadmapAction(fd: FormData) {
  await withCtx((ctx) => deleteRoadmapItem(ctx, s(fd, "id")));
  revalidatePath("/admin/feuille-de-route");
}

/* Qualifications RGE --------------------------------------------------- */

export async function addRgeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) =>
      addRge(ctx, { body: s(fd, "body"), number: s(fd, "number"), domains: fd.getAll("domains").map(String), valid_until: s(fd, "valid_until") }),
    );
    revalidatePath("/app/entreprise");
    return { ok: true, message: "Qualification enregistrée." };
  } catch (e) {
    return toState(e);
  }
}

export async function removeRgeAction(fd: FormData) {
  await withCtx((ctx) => removeRge(ctx, s(fd, "id")));
  revalidatePath("/app/entreprise");
}

/* Trésorerie ------------------------------------------------------------ */

export async function treasuryAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => saveTreasury(ctx, { balance: s(fd, "balance"), monthlyCharges: s(fd, "monthlyCharges") }));
    revalidatePath("/app/rapports/tresorerie");
    return { ok: true, message: "Prévision mise à jour." };
  } catch (e) {
    return toState(e);
  }
}

/* Plan comptable -------------------------------------------------------- */

export async function accountingPlanAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const keys = [
      "customers",
      "sales",
      "goods",
      "subcontracting",
      "travel",
      "deposits",
      "bank",
      "staff",
      "vatDeductible",
      "travelExpenses",
      "fuel",
      "supplies",
      "otherExpenses",
      "vat2000",
      "vat1000",
      "vat550",
      "vat210",
      "auxPrefix",
    ];
    await withCtx((ctx) => savePlan(ctx, { ...Object.fromEntries(keys.map((k) => [k, s(fd, k)])), ventilate: fd.get("ventilate") === "on" }));
    revalidatePath("/app/entreprise");
    revalidatePath("/app/comptabilite");
    return { ok: true, message: "Plan comptable enregistré." };
  } catch (e) {
    return toState(e);
  }
}

export async function formalNoticeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const id = s(fd, "invoiceId");
    const clear = s(fd, "op") === "clear";
    await withCtx((ctx) => setFormalNotice(ctx, id, clear ? null : { date: s(fd, "date"), ref: s(fd, "ref") }));
    revalidatePath(`/app/factures/${id}`);
    revalidatePath(`/app/factures/${id}/recouvrement`);
    return { ok: true, message: clear ? "Envoi effacé." : "Envoi de la mise en demeure enregistré." };
  } catch (e) {
    return toState(e);
  }
}

export async function saveAcquisitionCostsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const year = Number(s(fd, "year"));
    const input = Object.fromEntries(SOURCES.map((k) => [k, s(fd, k)])) as Partial<Record<Source, string>>;
    await withCtx((ctx) => saveAcquisitionCosts(ctx, year, input));
    revalidatePath("/app/rapports/origine");
    return { ok: true, message: "Dépenses enregistrées." };
  } catch (e) {
    return toState(e);
  }
}

export async function addLabelAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => addLabel(ctx, { kind: s(fd, "kind"), name: s(fd, "name"), number: s(fd, "number"), validUntil: s(fd, "validUntil") }));
    revalidatePath("/app/entreprise");
    return { ok: true, message: "Label enregistré." };
  } catch (e) {
    return toState(e);
  }
}

export async function labelAction(fd: FormData) {
  const id = s(fd, "id");
  const op = s(fd, "op");
  await withCtx((ctx) => (op === "delete" ? deleteLabel(ctx, id) : setLabelShown(ctx, id, op === "show")));
  revalidatePath("/app/entreprise");
}

export async function saveTravelRatesAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const keys = ["meal", "grand", ...[1, 2, 3, 4, 5].flatMap((z) => [`transport${z}`, `trip${z}`])];
    await withCtx((ctx) => saveTravelRates(ctx, Object.fromEntries(keys.map((k) => [k, s(fd, k)]))));
    revalidatePath("/app/pointage");
    return { ok: true, message: "Barème enregistré." };
  } catch (e) {
    return toState(e);
  }
}

export async function postJobMessageAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const jobId = s(fd, "jobId");
    await withCtx((ctx) => postJobMessage(ctx, jobId, s(fd, "body")));
    revalidatePath(`/app/chantiers/${jobId}`);
    return { ok: true, message: "Message envoyé." };
  } catch (e) {
    return toState(e);
  }
}

export async function deleteJobMessageAction(fd: FormData) {
  await withCtx((ctx) => deleteJobMessage(ctx, s(fd, "id")));
  revalidatePath(`/app/chantiers/${s(fd, "jobId")}`);
}

export async function monthlyReportAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const enabled = fd.get("enabled") === "on";
    await withCtx((ctx) => setMonthlyReport(ctx, enabled));
    revalidatePath("/app/rapports");
    return { ok: true, message: enabled ? "Rapport mensuel activé." : "Rapport mensuel désactivé." };
  } catch (e) {
    return toState(e);
  }
}

export async function requestReviewAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const jobId = s(fd, "jobId");
    const r = await withCtx((ctx) => requestReview(ctx, jobId, { send: fd.get("send") === "on" }));
    revalidatePath(`/app/chantiers/${jobId}`);
    return { ok: true, message: r.emailed ? `Invitation envoyée au client. Lien : ${r.url}` : `Lien à transmettre au client : ${r.url}` };
  } catch (e) {
    return toState(e);
  }
}

export async function reviewModerationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const id = s(fd, "id");
    const op = s(fd, "op");
    await withCtx((ctx) => (op === "reply" ? replyReview(ctx, id, s(fd, "reply")) : hideReview(ctx, id, op === "show" ? "" : s(fd, "reason"))));
    revalidatePath("/app/avis");
    return { ok: true, message: op === "reply" ? "Réponse enregistrée." : op === "show" ? "Avis rétabli." : "Avis masqué." };
  } catch (e) {
    return toState(e);
  }
}

export async function visitSettingsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const raw: Record<string, string> = {};
    for (const [k, v] of fd.entries()) if (typeof v === "string") raw[k] = v;
    const r = await withCtx((ctx) => saveVisitSettings(ctx, raw));
    revalidatePath("/app/entreprise");
    return { ok: true, message: r.enabled ? "Prise de rendez-vous ouverte sur votre vitrine." : "Réglages enregistrés, prise de rendez-vous fermée." };
  } catch (e) {
    return toState(e);
  }
}

export async function cancelVisitAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => cancelVisit(ctx, s(fd, "id")));
    revalidatePath("/app/demandes");
    return { ok: true, message: "Visite annulée : pensez à prévenir le client." };
  } catch (e) {
    return toState(e);
  }
}

export async function doeNotesAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const jobId = s(fd, "jobId");
    await withCtx((ctx) => saveDoeNotes(ctx, jobId, s(fd, "notes")));
    revalidatePath(`/app/chantiers/${jobId}`);
    return { ok: true, message: "Conseils d'entretien enregistrés." };
  } catch (e) {
    return toState(e);
  }
}

export async function safetyPlanAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const jobId = s(fd, "jobId");
    await withCtx((ctx) =>
      saveSafetyPlan(ctx, jobId, {
        risks: fd.getAll("risks").map(String),
        buildingYear: s(fd, "buildingYear"),
        manager: s(fd, "manager"),
        firstAider: s(fd, "firstAider"),
        hospital: s(fd, "hospital"),
        meetingPoint: s(fd, "meetingPoint"),
        instructions: s(fd, "instructions"),
      }),
    );
    revalidatePath(`/app/chantiers/${jobId}/securite`);
    return { ok: true, message: "Plan de prévention enregistré." };
  } catch (e) {
    return toState(e);
  }
}

export async function addWasteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const jobId = s(fd, "jobId");
    await withCtx((ctx) =>
      addJobWaste(ctx, jobId, {
        date: s(fd, "date"),
        category: s(fd, "category"),
        quantity: s(fd, "quantity"),
        unit: s(fd, "unit"),
        destination: s(fd, "destination"),
        carrier: s(fd, "carrier"),
        slipRef: s(fd, "slipRef"),
        sorted: fd.get("sorted"),
        cost: s(fd, "cost"),
      }),
    );
    revalidatePath(`/app/chantiers/${jobId}`);
    return { ok: true, message: "Évacuation enregistrée." };
  } catch (e) {
    return toState(e);
  }
}

export async function deleteWasteAction(fd: FormData) {
  const jobId = await withCtx((ctx) => deleteJobWaste(ctx, s(fd, "id")));
  revalidatePath(`/app/chantiers/${jobId}`);
}

export async function interventionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const jobId = s(fd, "jobId");
    const id = s(fd, "id");
    await withCtx((ctx) =>
      saveIntervention(
        ctx,
        jobId,
        {
          trade: s(fd, "trade"),
          subcontractorId: s(fd, "subcontractorId"),
          startDate: s(fd, "startDate"),
          endDate: s(fd, "endDate"),
          afterId: s(fd, "afterId"),
          note: s(fd, "note"),
        },
        id || undefined,
      ),
    );
    revalidatePath(`/app/chantiers/${jobId}/coordination`);
    return { ok: true, message: id ? "Intervention modifiée." : "Intervention ajoutée." };
  } catch (e) {
    return toState(e);
  }
}

export async function deleteInterventionAction(fd: FormData) {
  const jobId = await withCtx((ctx) => deleteIntervention(ctx, s(fd, "id")));
  revalidatePath(`/app/chantiers/${jobId}/coordination`);
}

export async function sendPlanningAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const jobId = s(fd, "jobId");
    const n = await withCtx((ctx) => sendPlanning(ctx, jobId));
    revalidatePath(`/app/chantiers/${jobId}/coordination`);
    return { ok: true, message: `Planning envoyé à ${n} entreprise${n > 1 ? "s" : ""}.` };
  } catch (e) {
    return toState(e);
  }
}

export async function stockItemAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) =>
      createStockItem(ctx, {
        catalogItemId: s(fd, "catalogItemId"),
        label: s(fd, "label"),
        unit: s(fd, "unit"),
        minQty: s(fd, "minQty"),
        reorderQty: s(fd, "reorderQty"),
      }),
    );
    revalidatePath("/app/stock");
    return { ok: true, message: "Article suivi en stock." };
  } catch (e) {
    return toState(e);
  }
}

export async function stockMoveAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const kind = s(fd, "kind");
    const r = await withCtx((ctx) =>
      moveStock(ctx, {
        itemId: s(fd, "itemId"),
        kind,
        qty: s(fd, "qty"),
        from: s(fd, "from") || undefined,
        to: s(fd, "to") || undefined,
        jobId: s(fd, "jobId"),
        note: s(fd, "note"),
      }),
    );
    revalidatePath("/app/stock");
    return { ok: true, message: kind === "inventaire" && r.delta === 0 ? "Inventaire conforme, rien à corriger." : "Mouvement enregistré." };
  } catch (e) {
    return toState(e);
  }
}

export async function stockSettingsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const itemId = s(fd, "itemId");
    await withCtx(async (ctx) => {
      await setThresholds(ctx, itemId, { minQty: s(fd, "minQty"), reorderQty: s(fd, "reorderQty") });
      for (const [k, v] of fd.entries()) if (k.startsWith("kit_") && typeof v === "string") await setVehicleKit(ctx, itemId, k.slice(4), v);
    });
    revalidatePath("/app/stock");
    return { ok: true, message: "Seuils enregistrés." };
  } catch (e) {
    return toState(e);
  }
}

export async function archiveStockItemAction(fd: FormData) {
  await withCtx((ctx) => archiveStockItem(ctx, s(fd, "id")));
  revalidatePath("/app/stock");
}

export async function addRentalAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const jobId = s(fd, "jobId");
    await withCtx((ctx) =>
      addRental(ctx, jobId, {
        equipment: s(fd, "equipment"),
        renter: s(fd, "renter"),
        startDate: s(fd, "startDate"),
        endDate: s(fd, "endDate"),
        rate: s(fd, "rate"),
        period: s(fd, "period"),
        delivery: s(fd, "delivery"),
        insurance: s(fd, "insurance"),
        reference: s(fd, "reference"),
      }),
    );
    revalidatePath(`/app/chantiers/${jobId}`);
    return { ok: true, message: "Location enregistrée." };
  } catch (e) {
    return toState(e);
  }
}

export async function returnRentalAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const r = await withCtx((ctx) => returnRental(ctx, s(fd, "id"), s(fd, "date")));
    revalidatePath(`/app/chantiers/${r.jobId}`);
    revalidatePath("/app/chantiers/locations");
    return { ok: true, message: `Matériel rendu : ${formatEuros(r.cost.totalCents)} HT ajoutés aux coûts du chantier.` };
  } catch (e) {
    return toState(e);
  }
}

export async function deleteRentalAction(fd: FormData) {
  const jobId = await withCtx((ctx) => deleteRental(ctx, s(fd, "id")));
  revalidatePath(`/app/chantiers/${jobId}`);
}

export async function createOrderGroupAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  try {
    id = await withCtx((ctx) =>
      createGroup(ctx, {
        orderIds: fd.getAll("orderIds").map(String),
        deliveryAddress: s(fd, "deliveryAddress"),
        deliveryDate: s(fd, "deliveryDate"),
        notes: s(fd, "notes"),
      }),
    );
  } catch (e) {
    return toState(e);
  }
  redirect(`/app/commandes/${id}`);
}

export async function sendOrderGroupAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const id = s(fd, "id");
    await withCtx((ctx) => sendGroup(ctx, id));
    revalidatePath(`/app/commandes/${id}`);
    return { ok: true, message: "Commandes envoyées : réceptionnez chaque livraison sur la fiche de son chantier." };
  } catch (e) {
    return toState(e);
  }
}

export async function deleteOrderGroupAction(fd: FormData) {
  await withCtx((ctx) => deleteGroup(ctx, s(fd, "id")));
  redirect("/app/commandes");
}

export async function createReturnAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) =>
      createReturn(ctx, s(fd, "orderId"), {
        lineId: s(fd, "lineId"),
        quantity: s(fd, "quantity"),
        reason: s(fd, "reason"),
        notes: s(fd, "notes"),
        restocking: s(fd, "restocking"),
      }),
    );
    revalidatePath(orderPath(s(fd, "jobId"), s(fd, "orderId")));
    revalidatePath("/app/chantiers/retours");
    return { ok: true, message: "Retour enregistré : l'avoir attendu est déduit de la marchandise à facturer." };
  } catch (e) {
    return toState(e);
  }
}

export async function collectReturnAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const r = await withCtx((ctx) => collectReturn(ctx, s(fd, "id"), s(fd, "date")));
    revalidatePath(orderPath(r.jobId, r.orderId));
    revalidatePath("/app/chantiers/retours");
    return { ok: true, message: "Reprise notée : l'avoir est attendu." };
  } catch (e) {
    return toState(e);
  }
}

export async function creditReturnAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const r = await withCtx((ctx) => creditReturn(ctx, s(fd, "id"), { amount: s(fd, "amount"), reference: s(fd, "reference"), date: s(fd, "date") }));
    revalidatePath(orderPath(r.jobId, r.orderId));
    revalidatePath(`/app/chantiers/${r.jobId}`);
    revalidatePath("/app/chantiers/retours");
    return r.gapCents < 0
      ? { ok: true, message: `Avoir enregistré, ${formatEuros(-r.gapCents)} de moins que prévu : réclamez la différence au fournisseur.` }
      : { ok: true, message: "Avoir enregistré et déduit des achats du chantier." };
  } catch (e) {
    return toState(e);
  }
}

export async function deleteReturnAction(fd: FormData) {
  const r = await withCtx((ctx) => deleteReturn(ctx, s(fd, "id")));
  revalidatePath(orderPath(r.jobId, r.orderId));
  revalidatePath("/app/chantiers/retours");
}

export async function applyCostCorrectionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const r = await withCtx((ctx) => applyCostCorrection(ctx, s(fd, "itemId"), { keepMargin: s(fd, "keepMargin") === "1" }));
    revalidatePath("/app/catalogue", "layout");
    return {
      ok: true,
      message: `${r.name} : coût passé à ${formatEuros(Math.round(r.newCost4 / 100))}${r.priceChanged ? `, prix de vente à ${formatEuros(Math.round(r.newPrice4 / 100))}` : ""}.`,
    };
  } catch (e) {
    return toState(e);
  }
}

export async function switchSupplierAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const r = await withCtx((ctx) => switchSupplier(ctx, s(fd, "itemId"), s(fd, "offerId")));
    revalidatePath("/app/catalogue", "layout");
    return { ok: true, message: `${r.name} : acheté désormais chez ${r.supplier} à ${formatEuros(Math.round(r.newCost4 / 100))} HT.` };
  } catch (e) {
    return toState(e);
  }
}

export async function setItemCarbonAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const id = s(fd, "itemId");
    const grams = await withCtx((ctx) => setItemCarbon(ctx, id, { kg: s(fd, "kg"), source: s(fd, "source") || undefined }));
    revalidatePath(`/app/catalogue/${id}`);
    return { ok: true, message: grams == null ? "Empreinte effacée." : "Empreinte enregistrée : elle compte dans le bilan carbone des devis." };
  } catch (e) {
    return toState(e);
  }
}

export async function saveReferralSettingsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const r = await withCtx((ctx) =>
      saveReferralSettings(ctx, { enabled: s(fd, "enabled") === "1", referrerReward: s(fd, "referrerReward"), refereeReward: s(fd, "refereeReward") }),
    );
    revalidatePath("/app/clients", "layout");
    return { ok: true, message: r.enabled ? "Programme de parrainage actif." : "Programme de parrainage enregistré, inactif." };
  } catch (e) {
    return toState(e);
  }
}

export async function createReferralCodeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const id = s(fd, "customerId");
    await withCtx((ctx) => ensureReferralCode(ctx, id));
    revalidatePath(`/app/clients/${id}`);
    return { ok: true, message: "Lien de parrainage créé." };
  } catch (e) {
    return toState(e);
  }
}

export async function rewardReferralAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const r = await withCtx((ctx) => markReferralRewarded(ctx, s(fd, "leadId")));
    revalidatePath("/app/clients", "layout");
    return { ok: true, message: `Récompense de ${r.referrerName} notée comme remise.` };
  } catch (e) {
    return toState(e);
  }
}

export async function saveLeaveFundAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => saveLeaveFundSettings(ctx, { fundName: s(fd, "fundName"), memberNumber: s(fd, "memberNumber"), rate: s(fd, "rate") }));
    revalidatePath("/app/equipe/conges-payes");
    return { ok: true, message: "Caisse enregistrée." };
  } catch (e) {
    return toState(e);
  }
}

export async function saveLeaveDeclarationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const gross: Record<string, string> = {};
    for (const [k, v] of fd.entries()) if (k.startsWith("brut_") && typeof v === "string") gross[k.slice(5)] = v;
    const t = await withCtx((ctx) => saveDeclaration(ctx, s(fd, "period"), gross));
    revalidatePath("/app/equipe/conges-payes");
    return { ok: true, message: `Déclaration enregistrée : cotisation de ${formatEuros(t.contributionCents)}.` };
  } catch (e) {
    return toState(e);
  }
}

export async function markLeaveDeclarationSentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => markDeclarationSent(ctx, s(fd, "period")));
    revalidatePath("/app/equipe/conges-payes");
    return { ok: true, message: "Déclaration marquée comme transmise." };
  } catch (e) {
    return toState(e);
  }
}

function apprenticeFields(fd: FormData) {
  return {
    tutorId: s(fd, "tutorId"),
    diploma: s(fd, "diploma"),
    school: s(fd, "school"),
    contractStart: s(fd, "contractStart"),
    contractEnd: s(fd, "contractEnd"),
    schoolDays: fd.getAll("schoolDays").map(String),
  };
}

export async function createApprenticeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: string;
  try {
    id = await withCtx((ctx) => createApprentice(ctx, s(fd, "userId"), apprenticeFields(fd)));
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/app/equipe/apprentis");
  redirect(`/app/equipe/apprentis/${id}`);
}

export async function updateApprenticeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const id = s(fd, "id");
    await withCtx((ctx) => updateApprentice(ctx, id, apprenticeFields(fd)));
    revalidatePath(`/app/equipe/apprentis/${id}`);
    return { ok: true, message: "Fiche de l'apprenti enregistrée." };
  } catch (e) {
    return toState(e);
  }
}

export async function deleteApprenticeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => deleteApprentice(ctx, s(fd, "id")));
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/app/equipe/apprentis");
  redirect("/app/equipe/apprentis");
}

export async function setSkillLevelAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => setSkillLevel(ctx, s(fd, "skillId"), s(fd, "level"), s(fd, "note")));
    revalidatePath(`/app/equipe/apprentis/${s(fd, "apprenticeId")}`);
    return { ok: true, message: "Étape enregistrée." };
  } catch (e) {
    return toState(e);
  }
}

export async function addSkillAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const id = s(fd, "apprenticeId");
    await withCtx((ctx) => addSkill(ctx, id, s(fd, "category"), s(fd, "label")));
    revalidatePath(`/app/equipe/apprentis/${id}`);
    return { ok: true, message: "Compétence ajoutée au parcours." };
  } catch (e) {
    return toState(e);
  }
}

export async function deleteSkillAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => deleteSkill(ctx, s(fd, "skillId")));
    revalidatePath(`/app/equipe/apprentis/${s(fd, "apprenticeId")}`);
    return { ok: true, message: "Compétence retirée du parcours." };
  } catch (e) {
    return toState(e);
  }
}

export async function saveFinalAccountPenaltiesAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const id = s(fd, "quoteId");
    await withCtx((ctx) => savePenalties(ctx, id, s(fd, "amount"), s(fd, "note")));
    revalidatePath(`/app/devis/${id}/decompte`);
    return { ok: true, message: "Pénalités enregistrées." };
  } catch (e) {
    return toState(e);
  }
}

export async function setFinalAccountStatusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const id = s(fd, "quoteId");
    const status = s(fd, "status");
    await withCtx((ctx) => setFinalAccountStatus(ctx, id, status, s(fd, "note")));
    revalidatePath(`/app/devis/${id}/decompte`);
    const msg: Record<string, string> = {
      envoye: "Décompte figé et marqué comme envoyé.",
      accepte: "Acceptation du client notée.",
      conteste: "Contestation du client notée.",
      projet: "Décompte repassé en projet.",
    };
    return { ok: true, message: msg[status] ?? "Décompte mis à jour." };
  } catch (e) {
    return toState(e);
  }
}

export async function locateAllAction(_: ActionState, _fd: FormData): Promise<ActionState> {
  try {
    const r = await withCtx((ctx) => locateAll(ctx));
    revalidatePath("/app/carte");
    if (!r.tried) return { ok: true, message: "Toutes les adresses sont déjà localisées." };
    return { ok: true, message: `${r.found} adresse${r.found > 1 ? "s" : ""} localisée${r.found > 1 ? "s" : ""} sur ${r.tried}.` };
  } catch (e) {
    return toState(e);
  }
}

export async function saveCampaignAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = s(fd, "id");
  let saved: string;
  try {
    const raw = Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string"));
    saved = await withCtx((ctx) => saveCampaign(ctx, id || null, raw));
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/app/clients/campagnes");
  if (id) {
    revalidatePath(`/app/clients/campagnes/${id}`);
    return { ok: true, message: "Campagne enregistrée." };
  }
  redirect(`/app/clients/campagnes/${saved}`);
}

export async function sendCampaignAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const id = s(fd, "id");
    const r = await withCtx((ctx) => sendCampaign(ctx, id));
    revalidatePath(`/app/clients/campagnes/${id}`);
    revalidatePath("/app/clients/campagnes");
    return { ok: true, message: `Campagne envoyée à ${r.sent} client${r.sent > 1 ? "s" : ""} sur ${r.recipients}.` };
  } catch (e) {
    return toState(e);
  }
}

export async function deleteCampaignAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => deleteCampaign(ctx, s(fd, "id")));
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/app/clients/campagnes");
  redirect("/app/clients/campagnes");
}

export async function saveYearEndAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const year = Number(s(fd, "year"));
    const notes: Record<string, string> = {};
    for (const [k, v] of fd.entries()) if (k.startsWith("note_") && typeof v === "string") notes[k.slice(5)] = v;
    await withCtx((ctx) => saveYearEnd(ctx, year, fd.getAll("done").map(String), notes));
    revalidatePath("/app/comptabilite/bilan");
    return { ok: true, message: "Préparation du bilan enregistrée." };
  } catch (e) {
    return toState(e);
  }
}

export async function applyAutoPlanningAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const jobId = s(fd, "jobId");
  const start = s(fd, "start");
  try {
    const r = await withCtx((ctx) => applyProposal(ctx, jobId, start, s(fd, "end"), fd.getAll("userId").map(String)));
    if (r.conflicts.length) return { ok: false, error: `Affectations enregistrées, mais en conflit avec : ${r.conflicts.join(", ")}.` };
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/app/planning");
  revalidatePath(`/app/chantiers/${jobId}`);
  redirect(`/app/planning?vue=semaine&date=${start}`);
}

export async function markWatchReadAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => markWatchRead(ctx, s(fd, "id")));
    revalidatePath("/app/veille");
    revalidatePath("/app");
    return { ok: true, message: s(fd, "id") === "tout" ? "Toutes les évolutions sont marquées comme lues." : "Évolution marquée comme lue." };
  } catch (e) {
    return toState(e);
  }
}

export async function saveProductInfoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const id = s(fd, "itemId");
    await withCtx((ctx) =>
      saveProductInfo(ctx, id, {
        brand: s(fd, "brand"),
        performance: s(fd, "performance"),
        certifications: s(fd, "certifications"),
        warrantyYears: s(fd, "warrantyYears"),
        leadDays: s(fd, "leadDays"),
      }),
    );
    revalidatePath(`/app/catalogue/${id}`);
    return { ok: true, message: "Fiche produit enregistrée." };
  } catch (e) {
    return toState(e);
  }
}

export async function barcodeAssignAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const [target, id] = s(fd, "article").split(":");
  try {
    await withCtx((ctx) => assignCode(ctx, { target, id: id ?? "", code: s(fd, "code") }));
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/app/stock/scanner");
  revalidatePath("/app/stock");
  return { ok: true, message: "Code associé à l'article." };
}

export async function outdoorWorkAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const jobId = s(fd, "jobId");
  try {
    await withCtx((ctx) => setOutdoorWork(ctx, jobId, s(fd, "outdoorWork")));
  } catch (e) {
    return toState(e);
  }
  revalidatePath(`/app/chantiers/${jobId}`);
  revalidatePath("/app/chantiers/meteo");
  return { ok: true, message: "Type de travaux enregistré." };
}

export async function weatherShiftAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let r: { moved: number; conflicts: number };
  try {
    r = await withCtx((ctx) => shiftJob(ctx, { jobId: s(fd, "jobId"), shift: s(fd, "shift") }));
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/app/chantiers/meteo");
  revalidatePath("/app/planning");
  return {
    ok: true,
    message: r.conflicts
      ? `Chantier décalé : ${r.conflicts} conflit${r.conflicts > 1 ? "s" : ""} à vérifier dans le planning.`
      : "Chantier décalé dans le planning.",
  };
}

export async function benchmarkOptinAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const on = s(fd, "optin") === "1";
  try {
    await withCtx((ctx) => setBenchmarkOptin(ctx, on));
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/app/rapports/reperes");
  return { ok: true, message: on ? "Participation enregistrée." : "Participation arrêtée." };
}

const financingFields = (fd: FormData) => ({
  label: s(fd, "label"),
  category: s(fd, "category"),
  supplier: s(fd, "supplier"),
  quoteRef: s(fd, "quoteRef"),
  amount: s(fd, "amount"),
  down: s(fd, "down"),
  kind: s(fd, "kind"),
  months: s(fd, "months"),
  rate: s(fd, "rate"),
  residual: s(fd, "residual"),
  purpose: s(fd, "purpose"),
  lender: s(fd, "lender"),
});

export async function financingSaveAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = s(fd, "id");
  let saved: string;
  try {
    saved = await withCtx((ctx) => saveFinancing(ctx, id || null, financingFields(fd)));
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/app/parc/financement");
  if (!id) redirect(`/app/parc/financement/${saved}`);
  revalidatePath(`/app/parc/financement/${id}`);
  return { ok: true, message: "Demande enregistrée." };
}

export async function financingStatusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = s(fd, "id");
  try {
    await withCtx((ctx) => setFinancingStatus(ctx, id, s(fd, "status")));
  } catch (e) {
    return toState(e);
  }
  revalidatePath(`/app/parc/financement/${id}`);
  revalidatePath("/app/parc/financement");
  return { ok: true, message: "Statut mis à jour." };
}

export async function financingDeleteAction(fd: FormData) {
  await withCtx((ctx) => deleteFinancing(ctx, s(fd, "id")));
  revalidatePath("/app/parc/financement");
  redirect("/app/parc/financement");
}

export async function networkCreateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: string;
  try {
    id = await withCtx((ctx) => createNetwork(ctx, { name: s(fd, "name"), description: s(fd, "description") }));
  } catch (e) {
    return toState(e);
  }
  redirect(`/app/catalogue/reseaux/${id}`);
}

export async function networkJoinAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: string;
  try {
    id = await withCtx((ctx) => joinNetwork(ctx, s(fd, "code")));
  } catch (e) {
    return toState(e);
  }
  redirect(`/app/catalogue/reseaux/${id}`);
}

export async function networkLeaveAction(fd: FormData) {
  await withCtx((ctx) => leaveNetwork(ctx, s(fd, "networkId")));
  revalidatePath("/app/catalogue/reseaux");
  redirect("/app/catalogue/reseaux");
}

export async function networkShareAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const networkId = s(fd, "networkId");
  let n: number;
  try {
    n = await withCtx((ctx) => shareItems(ctx, networkId, fd.getAll("item").map(String), s(fd, "withPrices") === "1"));
  } catch (e) {
    return toState(e);
  }
  revalidatePath(`/app/catalogue/reseaux/${networkId}`);
  return { ok: true, message: `${n} ouvrage${n > 1 ? "s" : ""} partagé${n > 1 ? "s" : ""}.` };
}

export async function networkImportAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const networkId = s(fd, "networkId");
  let r: { added: number; skipped: number };
  try {
    r = await withCtx((ctx) => importNetworkItems(ctx, networkId, fd.getAll("item").map(String)));
  } catch (e) {
    return toState(e);
  }
  revalidatePath(`/app/catalogue/reseaux/${networkId}`);
  revalidatePath("/app/catalogue");
  return {
    ok: true,
    message: `${r.added} ouvrage${r.added > 1 ? "s" : ""} ajouté${r.added > 1 ? "s" : ""} au catalogue${r.skipped ? `, ${r.skipped} déjà présent${r.skipped > 1 ? "s" : ""}` : ""}.`,
  };
}

export async function networkUnshareAction(fd: FormData) {
  const networkId = s(fd, "networkId");
  await withCtx((ctx) => unshareItem(ctx, networkId, s(fd, "itemId")));
  revalidatePath(`/app/catalogue/reseaux/${networkId}`);
}

/** Enregistre l'échelle et les relevés d'un plan (appelé depuis l'outil de métré). */
export async function saveTakeoffAction(id: string, data: unknown): Promise<ActionState> {
  try {
    await withCtx((ctx) => saveTakeoff(ctx, id, data));
  } catch (e) {
    return toState(e);
  }
  return { ok: true, message: "Relevés enregistrés." };
}

/** Ajoute au devis les relevés choisis, après avoir enregistré l'état courant. */
export async function addTakeoffLinesAction(
  id: string,
  data: unknown,
  ids: string[],
): Promise<{ ok?: boolean; error?: string; message?: string; quoteId?: string }> {
  try {
    const r = await withCtx(async (ctx) => {
      await saveTakeoff(ctx, id, data);
      return addTakeoffLines(ctx, id, takeoffIdsSchema.parse(ids));
    });
    revalidatePath(`/app/devis/${r.quoteId}`);
    return { ok: true, message: `${r.added} ligne${r.added > 1 ? "s" : ""} ajoutée${r.added > 1 ? "s" : ""} au devis.`, quoteId: r.quoteId };
  } catch (e) {
    return toState(e) ?? { error: "Ajout impossible" };
  }
}

export async function deleteTakeoffAction(fd: FormData) {
  const quoteId = await withCtx((ctx) => deleteTakeoff(ctx, s(fd, "id")));
  revalidatePath(`/app/devis/${quoteId}/metres`);
  redirect(`/app/devis/${quoteId}/metres`);
}

export async function healthShareCreateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const r = await withCtx((ctx) => createHealthShare(ctx, { label: s(fd, "label"), days: s(fd, "days") || undefined }));
    revalidatePath("/app/rapports/sante");
    return { ok: true, message: `Lien créé. Copiez-le maintenant, il ne sera plus affiché : ${appUrl(`/score/${r.token}`)}` };
  } catch (e) {
    return toState(e);
  }
}

export async function healthShareRevokeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => revokeHealthShare(ctx, s(fd, "id")));
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/app/rapports/sante");
  return { ok: true, message: "Lien révoqué." };
}

export async function adviceDismissAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => dismissAdvice(ctx, { key: s(fd, "key"), days: s(fd, "days") || undefined }));
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/app/conseils");
  revalidatePath("/app");
  return { ok: true, message: "Conseil masqué pour 30 jours." };
}

export async function homeEntryAddAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = s(fd, "recordId");
  try {
    await withCtx((ctx) =>
      addHomeEntry(ctx, id, {
        date: s(fd, "date"),
        kind: s(fd, "kind"),
        label: s(fd, "label"),
        detail: s(fd, "detail"),
        brand: s(fd, "brand"),
        warrantyUntil: s(fd, "warrantyUntil"),
        maintenanceMonths: s(fd, "maintenanceMonths"),
      }),
    );
  } catch (e) {
    return toState(e);
  }
  revalidatePath(`/app/carnets/${id}`);
  return { ok: true, message: "Ajouté au carnet." };
}

export async function homeEntryDeleteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => deleteHomeEntry(ctx, s(fd, "id")));
  } catch (e) {
    return toState(e);
  }
  revalidatePath(`/app/carnets/${s(fd, "recordId")}`);
  return { ok: true, message: "Entrée retirée." };
}

export async function homeShareAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = s(fd, "recordId");
  try {
    const token = await withCtx((ctx) => shareHomeRecord(ctx, id, Number(s(fd, "days")) || 365));
    revalidatePath(`/app/carnets/${id}`);
    return { ok: true, message: `Lien de transmission créé. Copiez-le maintenant, il ne sera plus affiché : ${appUrl(`/carnet/${token}`)}` };
  } catch (e) {
    return toState(e);
  }
}

export async function homeShareRevokeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = s(fd, "recordId");
  try {
    await withCtx((ctx) => revokeHomeShare(ctx, id));
  } catch (e) {
    return toState(e);
  }
  revalidatePath(`/app/carnets/${id}`);
  return { ok: true, message: "Lien révoqué." };
}

export async function maintenanceDoneAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const r = await withCtx((ctx) => recordMaintenance(ctx, s(fd, "id"), { date: s(fd, "date"), detail: s(fd, "detail") }));
    revalidatePath("/app/carnets/entretiens");
    revalidatePath(`/app/carnets/${r.recordId}`);
  } catch (e) {
    return toState(e);
  }
  return { ok: true, message: "Entretien enregistré dans le carnet." };
}

export async function delayNoticeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => notifyCustomerDelay(ctx, s(fd, "jobId")));
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/app/chantiers/retards");
  return { ok: true, message: "Client prévenu par e-mail." };
}

export async function delayAutoNoticeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const on = s(fd, "on") === "1";
  try {
    await withCtx((ctx) => setDelayAutoNotice(ctx, on));
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/app/chantiers/retards");
  return { ok: true, message: on ? "Prévenance automatique activée." : "Prévenance automatique désactivée." };
}

export async function networkPostAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const networkId = s(fd, "networkId");
  try {
    await withCtx((ctx) =>
      createPost(ctx, networkId, {
        kind: s(fd, "kind"),
        title: s(fd, "title"),
        detail: s(fd, "detail"),
        trade: s(fd, "trade"),
        city: s(fd, "city"),
        start: s(fd, "start"),
        end: s(fd, "end"),
        quantity: s(fd, "quantity"),
        unit: s(fd, "unit"),
        price: s(fd, "price"),
      }),
    );
  } catch (e) {
    return toState(e);
  }
  revalidatePath(`/app/catalogue/reseaux/${networkId}/bourse`);
  return { ok: true, message: "Annonce publiée dans le réseau." };
}

export async function networkReplyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => replyToPost(ctx, s(fd, "postId"), s(fd, "message")));
  } catch (e) {
    return toState(e);
  }
  revalidatePath(`/app/catalogue/reseaux/${s(fd, "networkId")}/bourse`);
  return { ok: true, message: "Réponse envoyée : l'auteur a vos coordonnées." };
}

export async function networkCloseAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const networkId = await withCtx((ctx) => closePost(ctx, s(fd, "postId"), s(fd, "status") === "retiree" ? "retiree" : "pourvue"));
    revalidatePath(`/app/catalogue/reseaux/${networkId}/bourse`);
  } catch (e) {
    return toState(e);
  }
  return { ok: true, message: "Annonce close." };
}

export async function stagesDefineAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const quoteId = s(fd, "quoteId");
  const rows = Array.from({ length: 12 }, (_, i) => ({ label: s(fd, `label${i}`), percent: s(fd, `percent${i}`) }));
  try {
    const n = await withCtx((ctx) => defineStages(ctx, quoteId, rows));
    revalidatePath(`/app/devis/${quoteId}/etapes`);
    return { ok: true, message: `${n} étape${n > 1 ? "s" : ""} enregistrée${n > 1 ? "s" : ""}.` };
  } catch (e) {
    return toState(e);
  }
}

export async function stageInvoiceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const r = await withCtx((ctx) => invoiceStage(ctx, s(fd, "stageId")));
    revalidatePath(`/app/devis/${r.quoteId}/etapes`);
    revalidatePath("/app/factures");
    return { ok: true, message: `Facture ${r.number} émise pour cette étape.` };
  } catch (e) {
    return toState(e);
  }
}

export async function recommendAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const networkId = s(fd, "networkId");
  try {
    await withCtx((ctx) =>
      sendRecommendation(ctx, networkId, {
        toOrg: s(fd, "toOrg"),
        customerName: s(fd, "customerName"),
        email: s(fd, "email"),
        phone: s(fd, "phone"),
        city: s(fd, "city"),
        need: s(fd, "need"),
        consent: fd.get("consent") === "on",
      }),
    );
  } catch (e) {
    return toState(e);
  }
  revalidatePath(`/app/catalogue/reseaux/${networkId}/recommandations`);
  return { ok: true, message: "Recommandation envoyée à votre confrère." };
}

export async function recommendationAnswerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const r = await withCtx((ctx) => answerRecommendation(ctx, s(fd, "id"), s(fd, "decision") === "accept", s(fd, "note")));
    revalidatePath(`/app/catalogue/reseaux/${r.networkId}/recommandations`);
    revalidatePath("/app/demandes");
    return { ok: true, message: r.leadId ? "Recommandation acceptée : le client est dans vos demandes." : "Recommandation déclinée." };
  } catch (e) {
    return toState(e);
  }
}

export async function groupPurchaseCreateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const networkId = s(fd, "networkId");
  try {
    await withCtx((ctx) =>
      createGroupPurchase(ctx, networkId, {
        title: s(fd, "title"),
        supplier: s(fd, "supplier"),
        unit: s(fd, "unit"),
        deadline: s(fd, "deadline"),
        basePrice: s(fd, "basePrice"),
        tiers: [0, 1, 2, 3].map((i) => ({ minQty: s(fd, `tierQty${i}`), price: s(fd, `tierPrice${i}`) })),
      }),
    );
  } catch (e) {
    return toState(e);
  }
  revalidatePath(`/app/catalogue/reseaux/${networkId}/achats`);
  return { ok: true, message: "Achat groupé ouvert : les membres du réseau sont prévenus." };
}

export async function groupPurchaseCommitAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const networkId = await withCtx((ctx) => commitQuantity(ctx, s(fd, "id"), s(fd, "quantity")));
    revalidatePath(`/app/catalogue/reseaux/${networkId}/achats`);
  } catch (e) {
    return toState(e);
  }
  return { ok: true, message: "Engagement enregistré." };
}

export async function groupPurchaseCloseAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const r = await withCtx((ctx) => closeGroupPurchase(ctx, s(fd, "id"), s(fd, "cancel") === "1"));
    revalidatePath(`/app/catalogue/reseaux/${r.networkId}/achats`);
  } catch (e) {
    return toState(e);
  }
  return { ok: true, message: "Achat groupé clos." };
}

export async function consortiumCreateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const quoteId = s(fd, "quoteId");
  try {
    await withCtx((ctx) => createConsortium(ctx, quoteId, s(fd, "form"), fd.get("mandataireSolidaire") === "on"));
  } catch (e) {
    return toState(e);
  }
  revalidatePath(`/app/devis/${quoteId}/groupement`);
  return { ok: true, message: "Groupement créé : ajoutez vos cotraitants." };
}

export async function consortiumMemberAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const quoteId = await withCtx((ctx) =>
      addConsortiumMember(ctx, s(fd, "consortiumId"), {
        orgId: s(fd, "orgId") || undefined,
        name: s(fd, "name"),
        siret: s(fd, "siret"),
        trade: s(fd, "trade"),
      }),
    );
    revalidatePath(`/app/devis/${quoteId}/groupement`);
  } catch (e) {
    return toState(e);
  }
  return { ok: true, message: "Cotraitant ajouté." };
}

export async function consortiumLotAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const quoteId = await withCtx((ctx) => assignLot(ctx, s(fd, "consortiumId"), s(fd, "sectionId"), s(fd, "memberId")));
    revalidatePath(`/app/devis/${quoteId}/groupement`);
  } catch (e) {
    return toState(e);
  }
  return { ok: true, message: "Lot attribué." };
}

export async function consortiumRemoveAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const quoteId = await withCtx((ctx) => removeConsortiumMember(ctx, s(fd, "consortiumId"), s(fd, "memberId")));
    revalidatePath(`/app/devis/${quoteId}/groupement`);
  } catch (e) {
    return toState(e);
  }
  return { ok: true, message: "Cotraitant retiré." };
}

export async function consortiumAnswerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => answerConsortiumInvitation(ctx, s(fd, "id"), s(fd, "decision") === "accept"));
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/app/groupements");
  return { ok: true, message: "Réponse transmise au mandataire." };
}

const DIAGNOSIS_FIELDS = [
  "housing",
  "surface",
  "period",
  "postalCode",
  "heating",
  "roof",
  "walls",
  "floor",
  "windows",
  "ventilation",
  "householdSize",
  "income",
];

export async function diagnosisCreateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: string;
  try {
    const raw = Object.fromEntries(DIAGNOSIS_FIELDS.map((k) => [k, s(fd, k)]));
    id = await withCtx((ctx) => saveDiagnosis(ctx, raw, s(fd, "customerId") || null));
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/app/devis/diagnostic-energetique");
  redirect(`/app/devis/diagnostic-energetique/${id}`);
}

export async function diagnosisQuoteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let quoteId: string;
  try {
    const keys = fd.getAll("works").map(String) as Parameters<typeof quoteFromDiagnosis>[2];
    quoteId = await withCtx((ctx) => quoteFromDiagnosis(ctx, s(fd, "id"), keys));
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/app/devis");
  redirect(`/app/devis/${quoteId}`);
}

export async function teamLocaleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => setTeamLocale(ctx, s(fd, "locale")));
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/app/ma-journee");
  return { ok: true, message: "" };
}

export async function benefitRequestAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const kind = s(fd, "kind");
    const raw =
      kind === "apprenti"
        ? { kind, school: s(fd, "school"), diploma: s(fd, "diploma"), trainingEnd: s(fd, "trainingEnd"), reference: s(fd, "reference") }
        : { kind, creationDate: s(fd, "creationDate") };
    await withCtx((ctx) => requestBenefit(ctx, raw));
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/app/abonnement");
  return { ok: true, message: "Demande envoyée : l'équipe la vérifie et répond sous deux jours ouvrés." };
}

export async function benefitDecisionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => decideBenefit(ctx, s(fd, "id"), s(fd, "decision") === "accept", s(fd, "note")));
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/admin/offres");
  return { ok: true, message: "Décision enregistrée" };
}

export async function communityAskAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: string;
  try {
    id = await withCtx((ctx) => askQuestion(ctx, { topic: s(fd, "topic"), title: s(fd, "title"), body: s(fd, "body") }));
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/app/entraide");
  redirect(`/app/entraide/${id}`);
}

export async function communityAnswerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = s(fd, "questionId");
  try {
    await withCtx((ctx) => answerQuestion(ctx, id, { body: s(fd, "body") }));
  } catch (e) {
    return toState(e);
  }
  revalidatePath(`/app/entraide/${id}`);
  return { ok: true, message: "Réponse publiée, merci pour le coup de main" };
}

export async function communityVoteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => toggleVote(ctx, s(fd, "answerId")));
  } catch (e) {
    return toState(e);
  }
  revalidatePath(`/app/entraide/${s(fd, "questionId")}`);
  return { ok: true, message: "" };
}

export async function communityAcceptAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => acceptAnswer(ctx, s(fd, "questionId"), s(fd, "answerId") || null));
  } catch (e) {
    return toState(e);
  }
  revalidatePath(`/app/entraide/${s(fd, "questionId")}`);
  return { ok: true, message: "" };
}

export async function communityReportAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let hidden = false;
  try {
    const kind = s(fd, "kind") === "question" ? "question" : "reponse";
    hidden = (await withCtx((ctx) => reportCommunity(ctx, kind, s(fd, "id"), { reason: s(fd, "reason") }))).hidden;
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/app/entraide");
  return { ok: true, message: hidden ? "Signalement enregistré : le message est masqué en attendant la modération" : "Signalement enregistré, merci" };
}

export async function monthVerifyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => verifyMonth(ctx, s(fd, "month"), { vatDeclared: fd.get("vatDeclared") === "on", note: s(fd, "note") }));
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/app/comptabilite/continu");
  return { ok: true, message: "Mois vérifié" };
}

export async function monthReopenAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => reopenMonth(ctx, s(fd, "month")));
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/app/comptabilite/continu");
  return { ok: true, message: "Mois rouvert" };
}

export async function matchingProfileAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) =>
      saveMatchingProfile(ctx, {
        enabled: fd.get("enabled") === "on",
        trades: fd.getAll("trades").map(String),
        departments: s(fd, "departments"),
        weeklyCap: s(fd, "weeklyCap"),
      }),
    );
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/app/demandes/mise-en-relation");
  return { ok: true, message: "Réglages enregistrés" };
}

export async function biosourcedVariantAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const quoteId = s(fd, "quoteId");
  try {
    await withCtx((ctx) => addBiosourcedVariant(ctx, quoteId, s(fd, "lineId"), s(fd, "alternativeId")));
  } catch (e) {
    return toState(e);
  }
  revalidatePath(`/app/devis/${quoteId}`);
  revalidatePath(`/app/devis/${quoteId}/biosource`);
  return { ok: true, message: "Variante ajoutée en option, prix à compléter dans le devis" };
}

export async function livePricesAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const quoteId = s(fd, "quoteId");
  let r: { revised: boolean; updated: number };
  try {
    r = await withCtx((ctx) => applyLivePrices(ctx, quoteId, fd.getAll("lineIds").map(String)));
  } catch (e) {
    return toState(e);
  }
  revalidatePath(`/app/devis/${quoteId}`);
  return {
    ok: true,
    message: `${r.updated} prix actualisé${r.updated > 1 ? "s" : ""}${r.revised ? " : le devis repasse en brouillon, émettez puis renvoyez la nouvelle version" : ""}`,
  };
}

export async function quizAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const moduleId = s(fd, "moduleId");
  let r: Awaited<ReturnType<typeof submitQuiz>>;
  try {
    const answers = [0, 1, 2].map((i) => (fd.get(`q${i}`) === null ? null : Number(fd.get(`q${i}`))));
    r = await withCtx((ctx) => submitQuiz(ctx, moduleId, answers));
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/app/formation");
  const wrong = r.corrections.filter((c) => !c.ok).map((c) => c.why);
  const head = r.passed
    ? `Module validé : ${r.score} bonne${r.score > 1 ? "s" : ""} réponse${r.score > 1 ? "s" : ""} sur 3.`
    : `${r.score} bonne${r.score > 1 ? "s" : ""} réponse${r.score > 1 ? "s" : ""} sur 3 : relisez l'essentiel puis réessayez.`;
  return { ok: r.passed, message: [head, ...wrong].join(" ") };
}

function workInput(fd: FormData) {
  const { components, errors } = parseComposition(s(fd, "composition"));
  if (errors.length)
    throw new HttpError(
      400,
      "bad_request",
      `Composition, ligne ${errors.join(", ")} : écrivez « quantité ; unité ; composant », par exemple 1,05 ; m² ; Carreau grès`,
    );
  const minutes = s(fd, "labourMinutes");
  return {
    trade: s(fd, "trade"),
    title: s(fd, "title"),
    unit: s(fd, "unit"),
    description: s(fd, "description"),
    composition: components,
    labourMinutes: minutes ? minutes : null,
    refs: s(fd, "refs"),
  };
}

export async function openWorkSaveAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = s(fd, "id");
  try {
    const input = workInput(fd);
    if (id) await withCtx((ctx) => updateWork(ctx, id, input));
    else id = await withCtx((ctx) => publishWork(ctx, input, s(fd, "derivedFrom") || null));
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/app/catalogue/base-ouverte");
  redirect(`/app/catalogue/base-ouverte/${id}`);
}

export async function openWorkVoteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => toggleWorkVote(ctx, s(fd, "id")));
  } catch (e) {
    return toState(e);
  }
  revalidatePath(`/app/catalogue/base-ouverte/${s(fd, "id")}`);
  return { ok: true, message: "" };
}

export async function openWorkImportAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let itemId: string;
  try {
    itemId = await withCtx((ctx) => importWork(ctx, s(fd, "id")));
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/app/catalogue");
  redirect(`/app/catalogue/${itemId}`);
}

export async function openWorkReportAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let hidden = false;
  try {
    hidden = (await withCtx((ctx) => reportWork(ctx, s(fd, "id"), s(fd, "reason")))).hidden;
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/app/catalogue/base-ouverte");
  return { ok: true, message: hidden ? "Signalement enregistré : la fiche est masquée en attendant la modération" : "Signalement enregistré, merci" };
}

export async function trustDisplayAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const shown = s(fd, "shown") === "1";
  try {
    await withCtx((ctx) => setTrustShown(ctx, shown));
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/app/entreprise/confiance");
  return {
    ok: true,
    message: shown
      ? "La note sera affichée sur votre vitrine dès qu'elle repose sur trois chantiers réceptionnés."
      : "La note n'est plus affichée sur votre vitrine.",
  };
}

export async function renovationCreateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: string;
  try {
    id = await withCtx((ctx) => createRenovation(ctx, { customerId: s(fd, "customerId"), title: s(fd, "title"), trade: s(fd, "trade") }));
  } catch (e) {
    return toState(e);
  }
  redirect(`/app/renovations/${id}`);
}

export async function renovationAddAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = s(fd, "projectId");
  try {
    await withCtx((ctx) =>
      addRenovationParticipant(ctx, id, { orgId: s(fd, "orgId") || undefined, name: s(fd, "name"), trade: s(fd, "trade"), amount: s(fd, "amount") }),
    );
  } catch (e) {
    return toState(e);
  }
  revalidatePath(`/app/renovations/${id}`);
  return { ok: true, message: s(fd, "orgId") ? "Invitation envoyée au confrère." : "Entreprise ajoutée au dossier." };
}

export async function renovationAnswerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const accept = s(fd, "accept") === "1";
  try {
    const projectId = await withCtx((ctx) => answerRenovationInvite(ctx, s(fd, "participantId"), accept));
    revalidatePath(`/app/renovations/${projectId}`);
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/app/renovations");
  return { ok: true, message: accept ? "Vous participez au dossier : rattachez votre devis." : "Invitation déclinée." };
}

export async function renovationUpdateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const kind = s(fd, "kind");
  const input =
    kind === "quote"
      ? { quoteId: s(fd, "quoteId") }
      : kind === "amount"
        ? { amount: s(fd, "amount") }
        : { start: s(fd, "start"), end: s(fd, "end"), trade: s(fd, "trade") || undefined };
  try {
    const projectId = await withCtx((ctx) => updateRenovationParticipant(ctx, s(fd, "participantId"), input));
    revalidatePath(`/app/renovations/${projectId}`);
  } catch (e) {
    return toState(e);
  }
  return { ok: true, message: kind === "quote" ? "Devis rattaché au dossier." : "Enregistré." };
}

export async function renovationRemoveAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const projectId = await withCtx((ctx) => removeRenovationParticipant(ctx, s(fd, "participantId")));
    revalidatePath(`/app/renovations/${projectId}`);
  } catch (e) {
    return toState(e);
  }
  return { ok: true, message: "Entreprise retirée du dossier." };
}

export async function renovationShareAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = s(fd, "projectId");
  try {
    const url = await withCtx((ctx) => shareRenovation(ctx, id));
    revalidatePath(`/app/renovations/${id}`);
    return { ok: true, message: `Lien du client créé. Copiez-le maintenant, il ne sera plus affiché : ${url}` };
  } catch (e) {
    return toState(e);
  }
}

export async function quoteExchangeImportAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let r: { id: string; warnings: string[] };
  try {
    const file = fd.get("file");
    const json = file instanceof File && file.size ? await file.text() : s(fd, "json");
    if (!json.trim()) return { error: "Choisissez un fichier .devis.json" };
    r = await withCtx((ctx) => importQuoteExchange(ctx, json, s(fd, "customerId") || null));
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/app/devis");
  redirect(`/app/devis/${r.id}${r.warnings.length ? "?import=ecarts" : ""}`);
}

export async function dayCloseReminderAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const on = s(fd, "on") === "1";
  try {
    await withCtx((ctx) => setDayCloseReminder(ctx, on));
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/app/fin-de-journee");
  return { ok: true, message: on ? "Rappel activé : une notification à 16 h 30 s'il reste quelque chose à boucler." : "Rappel désactivé." };
}

export async function transferListingSaveAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) =>
      saveTransferListing(ctx, {
        headline: s(fd, "headline"),
        description: s(fd, "description"),
        reason: s(fd, "reason"),
        accompanimentMonths: s(fd, "accompanimentMonths") || "0",
      }),
    );
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/app/rapports/transmission/annonce");
  return { ok: true, message: "Annonce enregistrée." };
}

export async function transferListingStatusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const publish = s(fd, "status") === "publiee";
  try {
    await withCtx((ctx) => setTransferListingStatus(ctx, publish ? "publiee" : "retiree"));
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/app/rapports/transmission/annonce");
  revalidatePath("/reprendre-une-entreprise");
  return { ok: true, message: publish ? "Annonce publiée, sans le nom de votre entreprise." : "Annonce retirée." };
}

export async function transferContactAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await contactTransferListing(
      await getDb(),
      s(fd, "listingId"),
      { name: s(fd, "name"), email: s(fd, "email"), phone: s(fd, "phone"), message: s(fd, "message"), website: s(fd, "website") },
      await requestMeta(),
    );
  } catch (e) {
    return toState(e);
  }
  return { ok: true, message: "Message transmis. Le cédant vous recontacte s'il souhaite donner suite." };
}

export async function templatePublishAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => publishTemplate(ctx, s(fd, "templateId"), { title: s(fd, "title"), summary: s(fd, "summary"), price: s(fd, "price") }));
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/app/modeles");
  revalidatePath("/app/modeles/bourse");
  return { ok: true, message: "Modèle publié dans la bourse." };
}

export async function templateWithdrawAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => withdrawListing(ctx, s(fd, "listingId")));
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/app/modeles/bourse");
  return { ok: true, message: "Modèle retiré de la bourse." };
}

export async function templateAcquireAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const r = await withCtx((ctx) => acquireListing(ctx, s(fd, "listingId")));
    revalidatePath("/app/modeles/bourse");
    revalidatePath("/app/modeles");
    return {
      ok: true,
      message:
        r.status === "regle"
          ? "Modèle ajouté à vos modèles de devis."
          : "Demande envoyée au vendeur : il vous transmet ses coordonnées de règlement, puis le modèle vous est livré.",
    };
  } catch (e) {
    return toState(e);
  }
}

export async function templateSettleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => settlePurchase(ctx, s(fd, "purchaseId")));
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/app/modeles/bourse");
  return { ok: true, message: "Règlement confirmé : le modèle est livré à l'acheteur." };
}

export async function courseExamStartAction(_: ActionState): Promise<ActionState> {
  let id: string;
  try {
    id = await withCtx((ctx) => startExam(ctx));
  } catch (e) {
    return toState(e);
  }
  redirect(`/app/formation/parcours-gestion/examen/${id}`);
}

export async function courseExamSubmitAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let code: string | null = null;
  try {
    const answers = Array.from({ length: 12 }, (_, i) => (fd.get(`q${i}`) === null ? null : Number(fd.get(`q${i}`))));
    const r = await withCtx((ctx) => submitExam(ctx, s(fd, "examId"), answers));
    revalidatePath("/app/formation/parcours-gestion");
    if (!r.passed) {
      return { ok: false, message: `${r.score} bonnes réponses sur ${r.total} : il en faut 9. Revoyez les modules puis ouvrez un nouveau sujet.` };
    }
    code = r.certificate!.code;
  } catch (e) {
    return toState(e);
  }
  redirect(`/verifier-attestation?code=${code}`);
}

export async function chequeDepositAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: string;
  try {
    id = await withCtx((ctx) => createDeposit(ctx, fd.getAll("ids").map(String), s(fd, "depositedOn")));
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/app/factures/remises");
  redirect(`/app/factures/remises/${id}`);
}

export async function chequeDepositCancelAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => cancelDeposit(ctx, s(fd, "id")));
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/app/factures/remises");
  redirect("/app/factures/remises");
}

export async function awaySaveAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) =>
      saveAway(ctx, {
        from: s(fd, "from"),
        to: s(fd, "to"),
        message: s(fd, "message"),
        backupName: s(fd, "backupName"),
        backupPhone: s(fd, "backupPhone"),
        backupEmail: s(fd, "backupEmail"),
      }),
    );
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/app/absence");
  return { ok: true, message: "Absence enregistrée : vos clients seront prévenus pendant cette période." };
}

export async function awayEndAction(_: ActionState): Promise<ActionState> {
  try {
    await withCtx((ctx) => endAway(ctx));
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/app/absence");
  redirect("/app/absence?retour=1");
}

export async function jobCarbonAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const jobId = s(fd, "jobId");
  try {
    await withCtx((ctx) => setJobCarbonSettings(ctx, jobId, { tripKm: s(fd, "tripKm"), vehicle: s(fd, "vehicle"), trips: s(fd, "trips") }));
  } catch (e) {
    return toState(e);
  }
  revalidatePath(`/app/chantiers/${jobId}/carbone`);
  return { ok: true, message: "Déplacements enregistrés : le bilan est recalculé." };
}

export async function leftoverAddAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const jobId = s(fd, "jobId");
  try {
    await withCtx((ctx) =>
      addLeftover(ctx, jobId, { orderLineId: s(fd, "orderLineId"), label: s(fd, "label"), unit: s(fd, "unit"), quantity: s(fd, "quantity"), fate: s(fd, "fate") }),
    );
  } catch (e) {
    return toState(e);
  }
  revalidatePath(`/app/chantiers/${jobId}/matiere`);
  return { ok: true, message: "Reste noté." };
}

export async function leftoverDeleteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const jobId = await withCtx((ctx) => deleteLeftover(ctx, s(fd, "id")));
    revalidatePath(`/app/chantiers/${jobId}/matiere`);
  } catch (e) {
    return toState(e);
  }
  return { ok: true, message: "Reste supprimé." };
}

export async function feedbackAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => sendFeedback(ctx, { path: s(fd, "path"), useful: s(fd, "useful") === "1", comment: s(fd, "comment") }));
  } catch (e) {
    return toState(e);
  }
  return { ok: true, message: "Merci, votre avis est transmis à l'équipe." };
}

export async function resolveFeedbackAction(fd: FormData) {
  await withCtx((ctx) => resolveFeedback(ctx, s(fd, "id"), s(fd, "response")));
  revalidatePath("/admin/retours");
}

export async function commitmentsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const chosen = await withCtx((ctx) => setCommitments(ctx, fd.getAll("key").map(String)));
    revalidatePath("/app/entreprise/engagements");
    return {
      ok: true,
      message: chosen.length
        ? `${chosen.length} engagement${chosen.length > 1 ? "s" : ""} publié${chosen.length > 1 ? "s" : ""} sur votre vitrine, avec le taux mesuré.`
        : "Aucun engagement n'est publié sur votre vitrine.",
    };
  } catch (e) {
    return toState(e);
  }
}

export async function aidStepAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = s(fd, "id");
  const undo = s(fd, "undo") === "1";
  try {
    const amount = s(fd, "amount").replace(/\s/g, "").replace(",", ".");
    await withCtx((ctx) =>
      setAidStep(
        ctx,
        id,
        s(fd, "key"),
        undo
          ? null
          : { on: s(fd, "on"), note: s(fd, "note") || undefined, amountCents: amount ? Math.round(Number(amount) * 100) : undefined },
      ),
    );
  } catch (e) {
    return toState(e);
  }
  revalidatePath(`/app/devis/diagnostic-energetique/${id}/parcours`);
  return { ok: true, message: undo ? "Étape décochée." : "Étape enregistrée." };
}

export async function importHomeRecordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let r: { recordId: string; imported: number };
  try {
    r = await withCtx((ctx) => importSharedHomeRecord(ctx, s(fd, "link"), s(fd, "customerId")));
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/app/carnets");
  redirect(`/app/carnets/${r.recordId}?repris=${r.imported}`);
}

export async function agencyCreateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => createAgency(ctx, { name: s(fd, "name"), city: s(fd, "city"), siret: s(fd, "siret") }));
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/app/equipe/agences");
  return { ok: true, message: "Agence créée. Rattachez-y les membres concernés." };
}

export async function agencyDeleteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => deleteAgency(ctx, s(fd, "id")));
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/app/equipe/agences");
  return { ok: true, message: "Agence supprimée : ses membres et ses devis restent, sans agence." };
}

export async function agencyAssignAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) => assignMemberAgency(ctx, s(fd, "userId"), s(fd, "agencyId") || null));
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/app/equipe/agences");
  return { ok: true, message: "Rattachement enregistré pour les prochains devis." };
}

export async function publishRuleVersionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await withCtx((ctx) =>
      publishRuleVersion(ctx, { country: s(fd, "country"), effectiveFrom: s(fd, "effectiveFrom"), vatRates: s(fd, "vatRates"), mentions: s(fd, "mentions"), note: s(fd, "note") }),
    );
    revalidatePath("/admin/regles-pays");
    return { ok: true, message: "Version publiée : elle s'applique aux devis à partir de sa date, sans nouvelle version de l'application." };
  } catch (e) {
    return toState(e);
  }
}

export async function deleteRuleVersionAction(fd: FormData) {
  await withCtx((ctx) => deleteRuleVersion(ctx, s(fd, "id")));
  revalidatePath("/admin/regles-pays");
}
