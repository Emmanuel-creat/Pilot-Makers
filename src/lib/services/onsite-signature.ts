/**
 * Signature du client sur l'écran de l'artisan (tablette ou téléphone), au domicile du client ou au bureau.
 * Mêmes exigences que l'acceptation en ligne : dernière version émise, devis encore valable, mention
 * « Bon pour accord », attestation de TVA réduite et rappel du délai de rétractation pour un particulier.
 * La signature manuscrite est conservée avec son empreinte et reportée sur l'exemplaire accepté,
 * que le client reçoit par e-mail s'il a une adresse.
 */

import { z } from "zod";
import { num, one } from "@/lib/db";
import { badRequest, conflict, notFound } from "@/lib/http";
import { sha256 } from "@/lib/security";
import type { Ctx } from "./context";
import { audit, requireWritable } from "./context";
import { reducedVatAttestation } from "./consumer";
import { sendMail } from "./mail";
import { acceptedCalc, snapshotOptions, validChoice } from "./options";
import { PENDING_STATUSES, type QuoteStatus } from "./quote-types";
import { acceptedPayload, createShareLink, getVersion, parisDate } from "./quotes";
import { enqueueWebhook } from "./webhooks";

export const SIGNATURE_MAX_BYTES = 300_000;
export const ONSITE_VIA = "signature sur place";

const schema = z.object({
  version: z.coerce.number().int().min(1),
  name: z.string().trim().min(2, "Nom et prénom du signataire requis").max(120),
  consent: z.boolean(),
  vatAttestation: z.boolean().default(false),
  earlyStart: z.boolean().default(false),
  options: z.array(z.string()).max(200).default([]),
  signature: z.string().max(SIGNATURE_MAX_BYTES * 2),
});

/** Image PNG d'une signature dessinée ; refuse tout autre contenu. */
export function decodeSignature(dataUrl: string): Uint8Array {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw badRequest("Le client doit signer dans le cadre");
  const bytes = new Uint8Array(Buffer.from(m[1], "base64"));
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 100 || !png.every((b, i) => bytes[i] === b)) throw badRequest("Signature illisible : recommencez");
  if (bytes.length > SIGNATURE_MAX_BYTES) throw badRequest("Signature trop lourde : effacez et recommencez");
  return bytes;
}

export async function signOnSite(ctx: Ctx, quoteId: string, raw: unknown, meta: { ip: string; userAgent: string }, now = new Date()) {
  requireWritable(ctx);
  const p = schema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  const input = p.data;
  if (!input.consent) throw badRequest("Le client doit cocher « Bon pour accord »");
  const image = decodeSignature(input.signature);
  const result = await ctx.db.transaction(async (tx) => {
    const q = await one<{ status: QuoteStatus; current_version: unknown; customer_id: string | null }>(
      tx,
      "SELECT status, current_version, customer_id FROM quotes WHERE id=$1 AND org_id=$2 FOR UPDATE",
      [quoteId, ctx.orgId],
    );
    if (!q) throw notFound("Devis introuvable");
    if (num(q.current_version) !== input.version) throw conflict("Seule la dernière version émise peut être signée");
    if (!PENDING_STATUSES.includes(q.status)) throw conflict("Ce devis n'attend pas de signature");
    const v = await getVersion(tx, ctx.orgId, quoteId, input.version);
    if (v.snapshot.validUntil < parisDate(now)) throw conflict("La durée de validité de ce devis est dépassée : émettez une nouvelle version");
    const consumer = v.snapshot.consumer;
    if (consumer?.reducedVatBp.length && !input.vatAttestation) throw badRequest("Le client doit cocher l'attestation sur le taux réduit de TVA");
    const chosen = validChoice(v.snapshot, input.options);
    if (!chosen) throw badRequest("Option inconnue");
    const finalCalc = acceptedCalc(v.snapshot, chosen);
    await tx.query(
      `UPDATE quotes SET status='accepted', responded_at=$3, accepted_version=$4, refusal_reason='', accepted_options=$5,
         total_ht_cents=$6, total_ttc_cents=$7, updated_at=now() WHERE id=$1 AND org_id=$2`,
      [quoteId, ctx.orgId, now, input.version, JSON.stringify(chosen), finalCalc.totalHtCents, finalCalc.totalTtcCents],
    );
    const imageSha = sha256(image);
    await tx.query(
      "INSERT INTO quote_signatures (org_id, quote_id, version, signer_name, image, image_sha256, collected_by) VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [ctx.orgId, quoteId, input.version, input.name, image, imageSha, ctx.userId],
    );
    await tx.query(
      `INSERT INTO document_events (org_id, quote_id, version, type, actor_type, data, ip, user_agent, created_at)
       VALUES ($1,$2,$3,'accepted','client',$4,$5,$6,$7)`,
      [
        ctx.orgId,
        quoteId,
        input.version,
        JSON.stringify({
          name: input.name,
          consent_text: "Bon pour accord",
          vat_attestation: consumer?.reducedVatBp.length ? reducedVatAttestation(consumer.reducedVatBp) : null,
          withdrawal_period: consumer?.withdrawal ? true : null,
          early_start_requested: consumer?.withdrawal ? input.earlyStart : null,
          pdf_sha256: v.pdfSha256,
          signature_sha256: imageSha,
          collected_by: ctx.userName,
          total_ttc_cents: finalCalc.totalTtcCents,
          ...(v.snapshot.calc.options ? { options: chosen, options_offered: snapshotOptions(v.snapshot).map((o) => o.label) } : {}),
          via: ONSITE_VIA,
        }),
        meta.ip,
        meta.userAgent.slice(0, 300),
        now,
      ],
    );
    await enqueueWebhook(tx, ctx.orgId, "quote.accepted", acceptedPayload(quoteId, v.snapshot, input.version, finalCalc, ONSITE_VIA));
    // Exemplaire du client : lien vers la page du devis, d'où il télécharge le PDF accepté et signé.
    let emailed = false;
    const to = v.snapshot.customer.email;
    if (to) {
      const link = await createShareLink(tx, ctx.orgId, quoteId, input.version, v.snapshot.validUntil);
      await sendMail(tx, {
        orgId: ctx.orgId,
        quoteId,
        kind: "quote_signed",
        to,
        subject: `${v.snapshot.org.trade_name} : votre exemplaire du devis ${v.number} signé`,
        body: `Bonjour,\n\nVous avez signé le devis ${v.number} ce jour. Votre exemplaire signé est disponible ici :\n${link.url}\n${
          consumer?.withdrawal ? "\nVous disposez d'un délai de rétractation de 14 jours ; le formulaire figure à la fin du devis.\n" : ""
        }\nCordialement,\n${ctx.userName}, ${v.snapshot.org.trade_name}`,
      });
      emailed = true;
    }
    return { emailed };
  });
  await audit(ctx.db, {
    orgId: ctx.orgId,
    userId: ctx.userId,
    action: "quote.sign_onsite",
    target: quoteId,
    data: { version: input.version },
    ip: ctx.ip,
  });
  return result;
}

/** Image de la signature recueillie sur place, pour l'exemplaire accepté. */
export async function onsiteSignature(q: Ctx["db"], orgId: string, quoteId: string, version: number) {
  const r = await one<{ image: Uint8Array; signer_name: string }>(
    q,
    "SELECT image, signer_name FROM quote_signatures WHERE org_id=$1 AND quote_id=$2 AND version=$3 ORDER BY created_at DESC LIMIT 1",
    [orgId, quoteId, version],
  );
  return r ? { dataUrl: `data:image/png;base64,${Buffer.from(r.image).toString("base64")}`, name: r.signer_name } : null;
}
