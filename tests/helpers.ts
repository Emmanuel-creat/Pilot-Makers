import { randomUUID } from "node:crypto";
import { openDatabase, type Database } from "@/lib/db";
import { contextFromToken, login, register, verifyEmail } from "@/lib/services/accounts";
import type { Ctx } from "@/lib/services/context";
import { updateOrganization } from "@/lib/services/organization";
import { createCustomer } from "@/lib/services/customers";

export const meta = { ip: "127.0.0.1", userAgent: "vitest" };

export async function freshDb(): Promise<Database> {
  return openDatabase("memory://");
}

export async function signUp(db: Database, email: string, company = "Carrelage Martin"): Promise<Ctx> {
  const r = await register(db, { email, password: "MotDePasse2026", name: "Paul Martin", company, trade: "carrelage", acceptTerms: true }, meta);
  await verifyEmail(db, r.verifyToken);
  const token = await login(db, email, "MotDePasse2026", meta);
  const ctx = await contextFromToken(db, token, meta);
  if (!ctx) throw new Error("contexte absent");
  return ctx;
}

export async function completeProfile(ctx: Ctx) {
  await updateOrganization(ctx, {
    legal_name: "Martin Carrelage SARL",
    legal_form: "SARL",
    address_line1: "12 rue des Artisans",
    postal_code: "69003",
    city: "Lyon",
    siren: "732829320",
    siret: "73282932000074",
    vat_number: "FR44732829320",
    phone: "04 72 00 00 00",
    hourly_rate: "45,00 € HT, décompté par demi-heure",
    insurance_decennale: true,
    insurance_name: "Assurances Exemple",
    insurance_policy: "DEC-123456",
    insurance_area: "France métropolitaine",
  });
}

export async function makeCustomer(ctx: Ctx, extra: Record<string, unknown> = {}) {
  const r = await createCustomer(
    ctx,
    {
      type: "particulier",
      first_name: "Claire",
      last_name: "Dubois",
      billing_line1: "4 place Bellecour",
      billing_postal_code: "69002",
      billing_city: "Lyon",
      email: `claire.${randomUUID().slice(0, 6)}@exemple.fr`,
      ...extra,
    },
    { allowDuplicate: true },
  );
  return r.id!;
}

export function line(p: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    kind: "item",
    catalogItemId: null,
    nature: "main_oeuvre",
    label: "Pose de carrelage",
    description: "",
    quantity: "20",
    unit: "m²",
    unitPrice: "45",
    unitCost: "",
    discountPercent: "",
    vatPercent: "10",
    estimated: false,
    estimateNote: "",
    ...p,
  };
}
