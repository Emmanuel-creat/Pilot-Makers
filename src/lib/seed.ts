/**
 * Données de démonstration : un compte artisan complet, des clients, un catalogue
 * et des devis dans plusieurs statuts.
 */

import { randomUUID } from "node:crypto";
import type { Database } from "@/lib/db";
import { one } from "@/lib/db";
import { contextFromToken, createSession, register, verifyEmail } from "./services/accounts";
import { installLibrary, searchItems } from "./services/catalog";
import type { Ctx } from "./services/context";
import { createCustomer } from "./services/customers";
import { savePricing, updateOrganization } from "./services/organization";
import { createQuote, getDraft, issueQuote, saveDraft, sendQuote } from "./services/quotes";
import { price4ToInput, bpToInput } from "./calc/format";

export const DEMO_EMAIL = "demo@pilot-makers.fr";
export const DEMO_PASSWORD = "Demo2026Pilot";
export const ADMIN_EMAIL = "admin@pilot-makers.fr";

export async function seedDemo(db: Database): Promise<{ created: boolean }> {
  const exists = await one(db, "SELECT 1 FROM users WHERE email=$1", [DEMO_EMAIL]);
  if (exists) return { created: false };
  const meta = { ip: "127.0.0.1", userAgent: "seed" };

  if (!(await one(db, "SELECT 1 FROM users WHERE email=$1", [ADMIN_EMAIL]))) {
    const admin = await register(
      db,
      { email: ADMIN_EMAIL, password: DEMO_PASSWORD, name: "Administrateur", company: "Pilot-Makers", acceptTerms: true },
      meta,
    );
    await verifyEmail(db, admin.verifyToken);
    await db.query("UPDATE users SET is_platform_admin=true WHERE id=$1", [admin.userId]);
  }

  const r = await register(
    db,
    { email: DEMO_EMAIL, password: DEMO_PASSWORD, name: "Paul Martin", company: "Martin Carrelage", trade: "Carreleur", acceptTerms: true },
    meta,
  );
  await verifyEmail(db, r.verifyToken);
  const token = await createSession(db, r.userId, meta);
  const ctx = (await contextFromToken(db, token, meta)) as Ctx;

  await updateOrganization(ctx, {
    legal_name: "Martin Carrelage SARL",
    legal_form: "SARL",
    share_capital: "10 000 €",
    rcs_rm: "RCS Lyon 732 829 320",
    address_line1: "12 rue des Artisans",
    postal_code: "69003",
    city: "Lyon",
    siren: "732829320",
    siret: "73282932000074",
    vat_number: "FR44732829320",
    phone: "04 72 00 00 00",
    email: "contact@martin-carrelage.fr",
    website: "www.martin-carrelage.fr",
    hourly_rate: "45,00 € HT de l'heure, temps décompté par demi-heure entamée",
    travel_fee: "forfait de 35 € HT par intervention dans un rayon de 30 km",
    insurance_decennale: true,
    insurance_name: "Mutuelle des Artisans (exemple)",
    insurance_policy: "DEC-2026-004512",
    insurance_area: "France métropolitaine",
    insurance_coverage: "responsabilité civile décennale",
    default_deposit_percent: "30",
    payment_terms: "Acompte de 30 % à la signature, solde à la réception des travaux, par virement.",
  });

  await savePricing(ctx, {
    rates: [
      { label: "Apprenti", price: "32", cost: "18" },
      { label: "Ouvrier", price: "45", cost: "29" },
      { label: "Chef d'équipe", price: "55", cost: "36" },
    ],
    perKm: "0,60",
    fixed: "35",
    freeKm: "30",
  });

  await installLibrary(ctx, "commun");
  await installLibrary(ctx, "carrelage");
  await installLibrary(ctx, "plomberie");

  const customers = [
    {
      type: "particulier",
      civility: "Mme",
      first_name: "Claire",
      last_name: "Dubois",
      billing_line1: "4 place Bellecour",
      billing_postal_code: "69002",
      billing_city: "Lyon",
      email: "claire.dubois@exemple.fr",
      phone: "06 12 34 56 78",
      tags: ["salle de bains"],
    },
    {
      type: "particulier",
      civility: "M.",
      first_name: "Karim",
      last_name: "Benali",
      billing_line1: "18 rue Garibaldi",
      billing_postal_code: "69006",
      billing_city: "Lyon",
      email: "karim.benali@exemple.fr",
      phone: "06 98 76 54 32",
      site_same_as_billing: false,
      site_line1: "3 chemin des Vignes",
      site_postal_code: "69380",
      site_city: "Lozanne",
    },
    {
      type: "copropriete",
      company_name: "Syndicat Résidence Les Tilleuls",
      first_name: "Sophie",
      last_name: "Laurent",
      billing_line1: "25 avenue Jean Jaurès",
      billing_postal_code: "69007",
      billing_city: "Lyon",
      email: "syndic.tilleuls@exemple.fr",
      tags: ["copropriété"],
    },
    {
      type: "entreprise",
      company_name: "Boulangerie Le Fournil",
      first_name: "Marc",
      last_name: "Petit",
      billing_line1: "7 rue Mercière",
      billing_postal_code: "69002",
      billing_city: "Lyon",
      email: "contact@lefournil.exemple.fr",
      siren: "552100554",
    },
  ];
  const ids: string[] = [];
  for (const c of customers) ids.push((await createCustomer(ctx, c, { allowDuplicate: true })).id!);

  const items = await searchItems(ctx, { limit: 200 });
  const pick = (name: string) => items.find((i) => i.name === name)!;
  const fromItem = (name: string, qty: string, extra: Record<string, unknown> = {}) => {
    const it = pick(name);
    return {
      id: randomUUID(),
      kind: "item",
      catalogItemId: it.id,
      nature: it.category,
      label: it.name,
      description: it.description,
      quantity: qty,
      unit: it.unit,
      unitPrice: price4ToInput(it.unit_price4),
      unitCost: it.unit_cost4 === null ? "" : price4ToInput(it.unit_cost4),
      discountPercent: "",
      vatPercent: bpToInput(it.vat_bp),
      estimated: false,
      estimateNote: "",
      ...extra,
    };
  };

  const make = async (customerIdx: number, title: string, description: string, sections: { title: string; lines: unknown[] }[]) => {
    const id = await createQuote(ctx, { customerId: ids[customerIdx] });
    const d = await getDraft(ctx, id);
    await saveDraft(
      ctx,
      id,
      { ...d, title, description, sections: sections.map((s) => ({ id: randomUUID(), title: s.title, description: "", lines: s.lines })) },
      d.draftRevision,
    );
    return id;
  };

  const q1 = await make(
    0,
    "Rénovation de salle de bains",
    "Dépose de l'ancien carrelage, préparation des supports, pose d'un nouveau carrelage au sol et de faïence murale, réfection des joints.",
    [
      { title: "Préparation du chantier", lines: [fromItem("Protection des sols et des meubles", "1"), fromItem("Déplacement", "1")] },
      {
        title: "Dépose et évacuation",
        lines: [
          fromItem("Dépose de carrelage existant", "6"),
          fromItem("Évacuation des gravats en déchetterie", "1", { estimated: true, estimateNote: "volume à confirmer" }),
        ],
      },
      {
        title: "Pose",
        lines: [
          fromItem("Ragréage du sol", "6"),
          fromItem("Pose de carrelage au sol", "6"),
          fromItem("Pose de faïence murale", "14,5"),
          fromItem("Carrelage grès cérame (fourniture)", "6,6"),
          fromItem("Colle carrelage flexible C2S1", "4"),
        ],
      },
      {
        title: "Finitions",
        lines: [
          fromItem("Réfection des joints", "20,5"),
          fromItem("Nettoyage de fin de chantier", "1"),
          {
            id: randomUUID(),
            kind: "note",
            catalogItemId: null,
            nature: "autre",
            label: "Le support sera vérifié avant la pose ; tout défaut caché fera l'objet d'un avenant.",
            description: "",
            quantity: "",
            unit: "",
            unitPrice: "",
            unitCost: "",
            discountPercent: "",
            vatPercent: "",
            estimated: false,
            estimateNote: "",
          },
        ],
      },
    ],
  );
  await issueQuote(ctx, q1);
  await sendQuote(ctx, q1, {
    to: "claire.dubois@exemple.fr",
    subject: "Votre devis de rénovation",
    body: "Bonjour Madame Dubois,\n\nVoici notre devis : {lien}\n\nCordialement,\nPaul Martin",
  });

  const q2 = await make(1, "Douche à l'italienne", "Création d'une douche à l'italienne avec étanchéité et carrelage.", [
    {
      title: "",
      lines: [
        fromItem("Pose d'une douche à l'italienne", "1"),
        fromItem("Système d'étanchéité sous carrelage (SPEC)", "3,2"),
        fromItem("Pose de faïence murale", "9"),
      ],
    },
  ]);
  await issueQuote(ctx, q2);

  await make(2, "Réfection du carrelage du hall", "Remplacement des carreaux abîmés dans le hall d'entrée de la résidence.", [
    {
      title: "",
      lines: [
        fromItem("Dépose de carrelage existant", "12"),
        fromItem("Pose de carrelage au sol", "12"),
        {
          id: randomUUID(),
          kind: "pending",
          catalogItemId: null,
          nature: "materiau",
          label: "Fourniture de carreaux assortis à l'existant",
          description: "",
          quantity: "",
          unit: "m²",
          unitPrice: "",
          unitCost: "",
          discountPercent: "",
          vatPercent: "20",
          estimated: false,
          estimateNote: "",
        },
      ],
    },
  ]);

  await make(3, "Carrelage du laboratoire", "Pose d'un carrelage antidérapant dans le laboratoire de la boulangerie.", [
    {
      title: "",
      lines: [
        fromItem("Pose de carrelage au sol", "28", { vatPercent: "20", discountPercent: "5" }),
        fromItem("Pose de plinthes carrelées", "22", { vatPercent: "20" }),
      ],
    },
  ]);
  return { created: true };
}

/**
 * Remet le compte de démonstration dans son état d'origine (tâche de nuit).
 * Seule l'entreprise de démonstration est effacée ; le compte administrateur est conservé.
 */
export async function resetDemo(db: Database): Promise<{ reset: boolean }> {
  const user = await one<{ id: string }>(db, "SELECT id FROM users WHERE email=$1", [DEMO_EMAIL]);
  if (user) {
    await db.transaction(async (tx) => {
      await tx.query("SELECT set_config('pilot.purge', 'on', true)");
      await tx.query("DELETE FROM organizations WHERE id IN (SELECT org_id FROM memberships WHERE user_id=$1)", [user.id]);
      await tx.query("DELETE FROM memberships WHERE user_id=$1", [user.id]);
      await tx.query("DELETE FROM sessions WHERE user_id=$1", [user.id]);
      await tx.query("UPDATE users SET status='deleted', email=$2, name='', password_hash='!', updated_at=now() WHERE id=$1", [
        user.id,
        `demo-${user.id}@invalid`,
      ]);
    });
  }
  await seedDemo(db);
  return { reset: true };
}
