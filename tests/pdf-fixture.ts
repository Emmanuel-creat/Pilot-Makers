/**
 * Devis de référence pour les contrôles visuels des PDF : contenu riche (sections,
 * remises, plusieurs taux de TVA, notes, longue description) et dates figées,
 * pour que le même code produise toujours exactement le même document. Les identifiants
 * internes changent à chaque fois mais n'apparaissent pas dans le PDF.
 */
import type { QuoteSnapshot } from "@/lib/services/quote-types";
import { createQuote, getDraft, getVersion, issueQuote, saveDraft } from "@/lib/services/quotes";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

export async function referenceSnapshot(): Promise<QuoteSnapshot> {
  const db = await freshDb();
  const ctx = await signUp(db, "apercu@exemple.fr");
  await completeProfile(ctx);
  const id = await createQuote(ctx, { customerId: await makeCustomer(ctx, { email: "claire.dubois@exemple.fr" }) });
  const d = await getDraft(ctx, id);
  const sec = (title: string, lines: ReturnType<typeof line>[]) => ({ id: crypto.randomUUID(), title, description: "", lines });
  await saveDraft(
    ctx,
    id,
    {
      ...d,
      title: "Rénovation complète de la salle de bains",
      description:
        "Dépose de l'ancien carrelage, création d'une douche à l'italienne avec étanchéité, pose de carrelage au sol et de faïence murale, remplacement du WC et du meuble vasque, peinture du plafond. Les travaux se déroulent dans un logement occupé.",
      site: { line1: "4 place Bellecour", line2: "Bâtiment B, 3e étage", postalCode: "69002", city: "Lyon" },
      paymentTerms: "Solde à la réception des travaux, par virement.",
      specialConditions: "Le support sera vérifié avant la pose ; tout défaut caché fera l'objet d'un avenant.",
      estimatedStart: "semaine du 2 novembre",
      estimatedDuration: "8 jours",
      globalDiscount: "3",
      sections: [
        sec("Dépose", [
          line({ label: "Dépose de carrelage existant", quantity: "6", unitPrice: "18" }),
          line({ label: "Évacuation des gravats", quantity: "1,5", unit: "m³", unitPrice: "45" }),
        ]),
        sec("Pose", [
          line({ label: "Pose de carrelage au sol", quantity: "6", unitPrice: "45", description: "Pose collée, joints inclus, hors fourniture." }),
          line({ label: "Pose de faïence murale", quantity: "14,5", unitPrice: "48", discountPercent: "10" }),
          line({ label: "Meuble vasque 80 cm", nature: "materiau", quantity: "1", unit: "u", unitPrice: "640", vatPercent: "20" }),
          line({ label: "Isolation des murs de la douche", quantity: "4", unitPrice: "58", vatPercent: "5,5" }),
        ]),
        sec("Finitions", [
          line({
            kind: "note",
            label: "Les teintes de joints sont à choisir avec le client.",
            quantity: "",
            unit: "",
            unitPrice: "",
            vatPercent: "",
          }),
        ]),
      ],
    },
    d.draftRevision,
  );
  await issueQuote(ctx, id);
  const s = (await getVersion(db, ctx.orgId, id, 1)).snapshot;
  await db.close();
  // La date de validité citée dans les mentions dépend du jour de l'émission : elle est figée aussi.
  const mentions = s.mentions.map((m) => m.replace(/\d{2}\/\d{2}\/\d{4}/, "11/11/2026"));
  return {
    ...s,
    mentions,
    number: "D-2026-0042",
    issuedAt: "2026-10-12T08:00:00.000Z",
    issueDate: "2026-10-12",
    validUntil: "2026-11-11",
    author: "Paul Martin",
  };
}
