/** Profil de l'entreprise (module B). */

import { z } from "zod";
import { one } from "@/lib/db";
import { badRequest, notFound } from "@/lib/http";
import { isSealed, open, seal } from "@/lib/secret-box";
import {
  cleanId,
  validateEmail,
  validateIban,
  validatePostalCode,
  validateSiren,
  validateSiret,
  validateVatNumber,
} from "@/lib/validation/identifiers";
import type { Ctx } from "./context";
import { audit, requireRole, requireWritable } from "./context";

export interface Organization {
  id: string;
  trade_name: string;
  legal_name: string;
  legal_form: string;
  share_capital: string;
  rcs_rm: string;
  address_line1: string;
  address_line2: string;
  postal_code: string;
  city: string;
  country: string;
  siren: string;
  siret: string;
  vat_number: string;
  phone: string;
  email: string;
  website: string;
  logo_data: string | null;
  signature_data: string | null;
  trade: string;
  insurance_name: string;
  insurance_policy: string;
  insurance_coverage: string;
  insurance_area: string;
  insurance_decennale: boolean;
  bank_holder: string;
  bank_iban: string;
  mediator_name: string;
  mediator_url: string;
  bank_bic: string;
  vat_regime: "normal" | "franchise";
  default_vat_bp: number;
  hourly_rate: string;
  travel_fee: string;
  payment_terms: string;
  general_conditions: string;
  quote_prefix: string;
  next_quote_seq: number;
  default_validity_days: number;
  default_deposit_percent: string;
  quote_template: string;
  accent_color: string;
  mail_subject_template: string;
  mail_body_template: string;
  reminder_settings: Record<string, unknown>;
  invoice_prefix: string;
  credit_prefix: string;
  invoice_due_days: number;
  late_penalty_text: string;
  invoice_reminder_settings: { enabled?: boolean; days?: number[] };
  status: string;
  suspended_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

/** Coordonnées bancaires : chiffrées en base (AES-256-GCM), déchiffrées à la lecture. */
const BANK_FIELDS = ["bank_iban", "bank_bic", "bank_holder"] as const;

export function revealBank<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = { ...row };
  for (const k of BANK_FIELDS) if (isSealed(out[k] as string)) out[k] = open(out[k] as string);
  return out as T;
}

export async function getOrganization(ctx: Ctx): Promise<Organization> {
  const row = await one<Organization>(ctx.db, "SELECT * FROM organizations WHERE id=$1", [ctx.orgId]);
  if (!row) throw notFound();
  const org = revealBank(row as unknown as Record<string, unknown>) as unknown as Organization;
  return { ...org, default_vat_bp: Number(org.default_vat_bp), next_quote_seq: Number(org.next_quote_seq) };
}

const MAX_IMAGE = 400_000; // ~300 Ko une fois décodé
const imageField = z
  .string()
  .max(MAX_IMAGE, "Image trop lourde (300 Ko maximum)")
  .refine((v) => v === "" || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v), "Format d'image non accepté (PNG, JPEG ou WebP)")
  .optional()
  .nullable();

const text = (max = 300) => z.string().trim().max(max).optional();

export const orgSchema = z.object({
  trade_name: z.string().trim().min(1, "Le nom commercial est obligatoire").max(160).optional(),
  legal_name: text(160),
  legal_form: text(60),
  share_capital: text(40),
  rcs_rm: text(120),
  address_line1: text(),
  address_line2: text(),
  postal_code: text(10),
  city: text(120),
  country: text(60),
  siren: text(20),
  siret: text(30),
  vat_number: text(20),
  phone: text(30),
  email: text(254),
  website: text(200),
  logo_data: imageField,
  signature_data: imageField,
  trade: text(80),
  insurance_name: text(160),
  insurance_policy: text(80),
  insurance_coverage: text(300),
  insurance_area: text(200),
  insurance_decennale: z.boolean().optional(),
  bank_holder: text(160),
  mediator_name: text(200),
  mediator_url: text(300),
  bank_iban: text(50),
  bank_bic: text(20),
  vat_regime: z.enum(["normal", "franchise"]).optional(),
  default_vat_bp: z.number().int().min(0).max(10000).optional(),
  hourly_rate: text(200),
  travel_fee: text(200),
  payment_terms: text(2000),
  general_conditions: text(10000),
  quote_prefix: z
    .string()
    .trim()
    .max(12)
    .regex(/^[A-Za-z0-9\-]*$/, "Préfixe : lettres, chiffres et tirets uniquement")
    .optional(),
  default_validity_days: z.number().int().min(1).max(365).optional(),
  default_deposit_percent: text(10),
  quote_template: z.enum(["classique", "moderne", "sobre"]).optional(),
  accent_color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  mail_subject_template: text(200),
  mail_body_template: text(5000),
  reminder_settings: z.record(z.string(), z.unknown()).optional(),
});

export type OrgInput = z.infer<typeof orgSchema>;

/** Contrôles de format renvoyés champ par champ. */
export function validateOrgFields(input: OrgInput): Record<string, string> {
  const errors: Record<string, string> = {};
  const check = (field: keyof OrgInput, msg: string | null) => {
    if (msg) errors[field] = msg;
  };
  if (input.siren !== undefined) check("siren", validateSiren(input.siren));
  if (input.siret !== undefined) {
    check("siret", validateSiret(input.siret));
    if (!errors.siret && input.siren && input.siret && !cleanId(input.siret).startsWith(cleanId(input.siren))) {
      errors.siret = "Le SIRET doit commencer par le SIREN";
    }
  }
  if (input.vat_number !== undefined) check("vat_number", validateVatNumber(input.vat_number, input.siren));
  if (input.bank_iban !== undefined) check("bank_iban", validateIban(input.bank_iban));
  if (input.email !== undefined) check("email", validateEmail(input.email));
  if (input.postal_code !== undefined) check("postal_code", validatePostalCode(input.postal_code));
  return errors;
}

const SENSITIVE = new Set(["bank_iban", "bank_bic", "bank_holder"]);
const IMAGES = new Set(["logo_data", "signature_data"]);

export async function updateOrganization(ctx: Ctx, raw: unknown) {
  requireRole(ctx, "admin");
  requireWritable(ctx);
  const parsed = orgSchema.safeParse(raw);
  if (!parsed.success) throw badRequest(parsed.error.issues[0].message, parsed.error.issues);
  const input = parsed.data;
  const errors = validateOrgFields(input);
  if (Object.keys(errors).length) throw badRequest("Certains champs sont invalides", errors);
  for (const k of ["siren", "siret", "vat_number", "bank_iban", "bank_bic"] as const) {
    if (typeof input[k] === "string") input[k] = cleanId(input[k] as string);
  }
  if (input.logo_data === "") input.logo_data = null;
  if (input.signature_data === "") input.signature_data = null;

  return ctx.db.transaction(async (tx) => {
    const current = revealBank((await one<Record<string, unknown>>(tx, "SELECT * FROM organizations WHERE id=$1 FOR UPDATE", [ctx.orgId]))!);
    const changes: Record<string, { avant: unknown; apres: unknown }> = {};
    const sets: string[] = [];
    const values: unknown[] = [ctx.orgId];
    for (const [key, value] of Object.entries(input)) {
      if (value === undefined) continue;
      const before = current[key];
      const same = JSON.stringify(before) === JSON.stringify(value);
      if (same) continue;
      const stored = SENSITIVE.has(key) && typeof value === "string" && value ? seal(value) : value;
      values.push(key === "reminder_settings" ? JSON.stringify(value) : stored);
      sets.push(`${key} = $${values.length}`);
      // Les valeurs bancaires et les images ne sont pas recopiées dans l'historique.
      changes[key] = SENSITIVE.has(key) || IMAGES.has(key) ? { avant: "(modifié)", apres: "(modifié)" } : { avant: before, apres: value };
    }
    if (sets.length === 0) return { changed: 0 };
    await tx.query(`UPDATE organizations SET ${sets.join(", ")}, updated_at=now() WHERE id=$1`, values);
    await tx.query("INSERT INTO organization_history (org_id, user_id, changes) VALUES ($1,$2,$3)", [
      ctx.orgId,
      ctx.userId,
      JSON.stringify(changes),
    ]);
    await audit(tx, { orgId: ctx.orgId, userId: ctx.userId, action: "organization.update", data: Object.keys(changes), ip: ctx.ip });
    return { changed: sets.length };
  });
}

export async function organizationHistory(ctx: Ctx) {
  return ctx.db.query<{ id: string; changes: Record<string, { avant: unknown; apres: unknown }>; created_at: Date; user_name: string | null }>(
    `SELECT h.id, h.changes, h.created_at, u.name AS user_name FROM organization_history h
     LEFT JOIN users u ON u.id = h.user_id WHERE h.org_id=$1 ORDER BY h.created_at DESC LIMIT 100`,
    [ctx.orgId],
  );
}

/** Les informations bancaires ne sont lisibles que par les rôles propriétaire et administrateur. */
export function redactForRole<T extends Partial<Organization>>(org: T, role: Ctx["role"]): T {
  if (role === "member") return { ...org, bank_iban: "", bank_bic: "", bank_holder: "" };
  return org;
}
