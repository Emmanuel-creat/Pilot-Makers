/** Dossier de preuves d'un chantier : chronologie horodatée, pièces signées, photos et empreintes. */

import { num, one } from "@/lib/db";
import { isUuid, notFound } from "@/lib/http";
import { type EvidenceEvent, evidenceChecks, manifest, quoteEventLabel, sortTimeline, timelineText } from "@/lib/evidence";
import { sha256 } from "@/lib/security";
import { zip, type ZipEntry } from "@/lib/zip";
import type { Ctx } from "./context";
import { audit } from "./context";
import { acceptedCopy, getVersion } from "./quotes";

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));
const day = (v: unknown) => (v == null ? null : iso(v).slice(0, 10));
const euros = (c: number) => (c / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " euros";

async function loadJob(ctx: Ctx, jobId: string) {
  const j = isUuid(jobId)
    ? await one<Record<string, unknown>>(ctx.db, "SELECT id, title, quote_id, start_date, end_date FROM jobs WHERE id=$1 AND org_id=$2", [jobId, ctx.orgId])
    : null;
  if (!j) throw notFound("Chantier introuvable");
  return j;
}

/** Synthèse affichée sur la page : chronologie, points de contrôle et pièces disponibles. */
export async function jobEvidence(ctx: Ctx, jobId: string) {
  const j = await loadJob(ctx, jobId);
  const quoteId = j.quote_id ? String(j.quote_id) : null;
  const [quoteEvents, quote, journal, reception, reserves, invoices, payments] = await Promise.all([
    quoteId
      ? ctx.db.query<{ type: string; version: unknown; created_at: Date; data: Record<string, unknown> }>(
          "SELECT type, version, created_at, data FROM document_events WHERE quote_id=$1 AND org_id=$2 ORDER BY created_at",
          [quoteId, ctx.orgId],
        )
      : Promise.resolve([]),
    quoteId ? one<{ number: string | null; accepted_version: unknown }>(ctx.db, "SELECT number, accepted_version FROM quotes WHERE id=$1", [quoteId]) : null,
    ctx.db.query<{ id: string; note: string; has_photo: boolean; photo_sha256: string | null; taken_at: Date; latitude: number | null }>(
      "SELECT id, note, photo IS NOT NULL AS has_photo, photo_sha256, taken_at, latitude FROM job_journal WHERE job_id=$1 AND org_id=$2 ORDER BY taken_at",
      [jobId, ctx.orgId],
    ),
    one<{ decision: string; reception_date: unknown; pdf_sha256: string; created_at: Date }>(
      ctx.db,
      "SELECT decision, reception_date, pdf_sha256, created_at FROM job_receptions WHERE job_id=$1 AND org_id=$2",
      [jobId, ctx.orgId],
    ),
    ctx.db.query<{ label: string; lifted_at: Date | null }>("SELECT label, lifted_at FROM job_reserves WHERE job_id=$1 AND org_id=$2 ORDER BY position", [
      jobId,
      ctx.orgId,
    ]),
    quoteId
      ? ctx.db.query<{ id: string; number: string; kind: string; total_ttc_cents: unknown; issued_at: Date; pdf_sha256: string }>(
          "SELECT id, number, kind, total_ttc_cents, issued_at, pdf_sha256 FROM invoices WHERE quote_id=$1 AND org_id=$2 ORDER BY issued_at",
          [quoteId, ctx.orgId],
        )
      : Promise.resolve([]),
    quoteId
      ? ctx.db.query<{ amount_cents: unknown; paid_on: unknown; number: string }>(
          `SELECT p.amount_cents, p.paid_on, i.number FROM invoice_payments p JOIN invoices i ON i.id=p.invoice_id
           WHERE i.quote_id=$1 AND p.org_id=$2 AND p.canceled_at IS NULL ORDER BY p.paid_on`,
          [quoteId, ctx.orgId],
        )
      : Promise.resolve([]),
  ]);

  const events: EvidenceEvent[] = [];
  for (const e of quoteEvents) {
    const label = quoteEventLabel(e.type);
    if (!label) continue;
    const who = e.type === "accepted" && e.data?.name ? ` par ${String(e.data.name)}` : "";
    const via = e.type === "accepted" && e.data?.via ? ` (${String(e.data.via)})` : "";
    events.push({
      at: iso(e.created_at),
      kind: "devis",
      text: `${label}${quote?.number ? ` ${quote.number}` : ""}${e.version ? ` version ${num(e.version)}` : ""}${who}${via}`,
    });
  }
  for (const p of journal) {
    events.push({
      at: iso(p.taken_at),
      kind: p.has_photo ? "photo" : "note",
      text: `${p.has_photo ? "Photo" : "Note"} du journal${p.latitude != null ? ", géolocalisée" : ""}${p.note ? ` : ${p.note.slice(0, 120)}` : ""}`,
      ...(p.photo_sha256 ? { sha256: p.photo_sha256 } : {}),
    });
  }
  if (reception) {
    const decision = { sans_reserve: "sans réserve", avec_reserves: "avec réserves", refus: "refusée" }[reception.decision] ?? reception.decision;
    events.push({
      at: iso(reception.created_at),
      kind: "reception",
      text: `Procès-verbal de réception signé : réception ${decision}`,
      sha256: reception.pdf_sha256,
    });
  }
  for (const r of reserves) if (r.lifted_at) events.push({ at: iso(r.lifted_at), kind: "reserve", text: `Réserve levée : ${r.label}` });
  for (const i of invoices) {
    const kind = { deposit: "Facture d'acompte", final: "Facture", credit_note: "Avoir" }[i.kind] ?? "Facture";
    events.push({ at: iso(i.issued_at), kind: "facture", text: `${kind} ${i.number} émise, ${euros(num(i.total_ttc_cents))} TTC`, sha256: i.pdf_sha256 });
  }
  for (const p of payments)
    events.push({ at: `${day(p.paid_on)}T12:00:00.000Z`, kind: "paiement", text: `Paiement reçu sur ${p.number} : ${euros(num(p.amount_cents))}` });

  const start = day(j.start_date) ?? (journal[0] ? day(journal[0].taken_at) : null);
  const end = reception ? day(reception.reception_date) : day(j.end_date);
  const photos = journal.filter((p) => p.has_photo);
  const checks = evidenceChecks({
    quoteAccepted: quote?.accepted_version != null,
    photosBefore: start ? photos.filter((p) => day(p.taken_at)! <= start).length : 0,
    photosAfter: end ? photos.filter((p) => day(p.taken_at)! >= end).length : 0,
    reception: (reception?.decision as "sans_reserve" | "avec_reserves" | "refus" | undefined) ?? null,
    reservesOpen: reserves.filter((r) => !r.lifted_at).length,
    invoices: invoices.length,
  });
  return {
    title: String(j.title),
    quoteId,
    acceptedQuote: quote?.accepted_version != null,
    hasReception: !!reception,
    photoIds: photos.map((p) => ({ id: p.id, at: iso(p.taken_at), sha256: p.photo_sha256 })),
    invoiceIds: invoices.map((i) => ({ id: i.id, number: i.number })),
    timeline: sortTimeline(events),
    checks,
  };
}

const safe = (s: string) =>
  s
    .replace(/[^\p{L}\p{N}-]+/gu, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "piece";

/** Archive ZIP du dossier : pièces, chronologie et fichier des empreintes SHA-256. */
export async function evidenceZip(ctx: Ctx, jobId: string): Promise<{ data: Buffer; filename: string; sha256: string }> {
  const e = await jobEvidence(ctx, jobId);
  const files: ZipEntry[] = [];
  const hashes: { name: string; sha256: string }[] = [];
  const add = (name: string, data: Uint8Array | string, date?: Date) => {
    files.push({ name, data, date });
    hashes.push({ name, sha256: sha256(typeof data === "string" ? Buffer.from(data) : data) });
  };
  if (e.quoteId && e.acceptedQuote) {
    // Exemplaire accepté avec la mention d'acceptation ; à défaut (acceptation sans trace détaillée), la version émise acceptée.
    const c = await acceptedCopy(ctx.db, ctx.orgId, e.quoteId).catch(async () => {
      const q = await one<{ accepted_version: unknown }>(ctx.db, "SELECT accepted_version FROM quotes WHERE id=$1 AND org_id=$2", [e.quoteId, ctx.orgId]);
      const v = await getVersion(ctx.db, ctx.orgId, e.quoteId!, num(q?.accepted_version));
      return { pdf: v.pdf, number: v.number, version: v.version };
    });
    add(`1-devis/Devis-${safe(c.number)}-v${c.version}-accepte.pdf`, c.pdf);
  }
  if (e.hasReception) {
    const r = await one<{ pdf: Uint8Array; created_at: Date }>(ctx.db, "SELECT pdf, created_at FROM job_receptions WHERE job_id=$1 AND org_id=$2", [
      jobId,
      ctx.orgId,
    ]);
    if (r) add("3-reception/Proces-verbal-de-reception.pdf", r.pdf, r.created_at);
  }
  for (const [n, p] of e.photoIds.entries()) {
    const row = await one<{ photo: Uint8Array; photo_type: string }>(ctx.db, "SELECT photo, photo_type FROM job_journal WHERE id=$1 AND org_id=$2", [
      p.id,
      ctx.orgId,
    ]);
    if (!row?.photo) continue;
    const ext = row.photo_type?.includes("png") ? "png" : row.photo_type?.includes("webp") ? "webp" : "jpg";
    add(`2-photos/${String(n + 1).padStart(3, "0")}-${p.at.slice(0, 19).replace(/[:T]/g, "-")}.${ext}`, row.photo, new Date(p.at));
  }
  for (const i of e.invoiceIds) {
    const row = await one<{ pdf: Uint8Array; issued_at: Date }>(ctx.db, "SELECT pdf, issued_at FROM invoices WHERE id=$1 AND org_id=$2", [i.id, ctx.orgId]);
    if (row) add(`4-factures/Facture-${safe(i.number)}.pdf`, row.pdf, row.issued_at);
  }
  add("chronologie.txt", timelineText(e.title, e.timeline));
  const readme = [
    `Dossier de preuves du chantier : ${e.title}`,
    `Constitué le ${new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "long", timeStyle: "short" }).format(new Date())}.`,
    "",
    "Contenu : devis accepté, photos datées du journal de chantier, procès-verbal de réception, factures, chronologie.",
    "Le fichier empreintes-sha256.txt donne l'empreinte de chaque pièce. Pour vérifier qu'une pièce n'a pas été modifiée,",
    "recalculez son empreinte SHA-256 (par exemple avec la commande sha256sum -c empreintes-sha256.txt) et comparez.",
    "",
    ...e.checks.map((c) => `${c.ok ? "[x]" : "[ ]"} ${c.label}`),
    "",
  ].join("\n");
  add("LISEZMOI.txt", readme);
  files.push({ name: "empreintes-sha256.txt", data: manifest(hashes) });
  const data = zip(files);
  const digest = sha256(data);
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "job.evidence_export", target: jobId, data: { sha256: digest, files: hashes.length } });
  return { data, filename: `Dossier-de-preuves-${safe(e.title)}.zip`, sha256: digest };
}
