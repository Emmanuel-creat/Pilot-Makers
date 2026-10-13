import { PDFDocument } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import {
  addJournalEntry,
  deleteJournalEntry,
  getReception,
  imageType,
  journalPhoto,
  liftingPdf,
  liftReserve,
  listJournal,
  receptionPdf,
  signReception,
} from "@/lib/services/job-site";
import { createJobFromQuote, getJob } from "@/lib/services/jobs";
import { createQuote, getDraft, issueQuote, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);

async function job() {
  const id = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
  const d = await getDraft(ctx, id);
  await saveDraft(
    ctx,
    id,
    {
      ...d,
      title: "Terrasse",
      site: { line1: "2 rue du Port", line2: "", postalCode: "13002", city: "Marseille" },
      sections: [{ ...d.sections[0], lines: [line()] }],
    },
    d.draftRevision,
  );
  await issueQuote(ctx, id);
  await recordResponseManually(ctx, id, { decision: "accept", version: 1, proof: "Bon pour accord signé" });
  return createJobFromQuote(ctx, id);
}

const base = { date: "2026-10-01", clientName: "Claire Dubois", clientSignature: PNG, companyName: "Paul Martin", companySignature: PNG };

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "reception@exemple.fr");
  await completeProfile(ctx);
});

describe("journal de chantier", () => {
  it("photos datées et géolocalisées, contrôle du format", async () => {
    const id = await job();
    expect(imageType(JPEG)).toBe("image/jpeg");
    expect(imageType(new TextEncoder().encode("<svg></svg>"))).toBeNull();
    await expect(addJournalEntry(ctx, id, {})).rejects.toMatchObject({ status: 400 });
    await expect(addJournalEntry(ctx, id, { photo: new TextEncoder().encode("<script>") })).rejects.toMatchObject({ status: 400 });
    const e1 = await addJournalEntry(ctx, id, {
      note: "Coffrage posé",
      photo: JPEG,
      takenAt: "2026-10-02T09:15:00Z",
      latitude: "43.30",
      longitude: "5.37",
    });
    await addJournalEntry(ctx, id, { note: "Livraison du béton", takenAt: "2099-01-01T00:00:00Z", latitude: "999", longitude: "5" });
    const list = await listJournal(ctx, id);
    expect(list).toHaveLength(2);
    const photo = list.find((e) => e.id === e1)!;
    expect(photo).toMatchObject({ has_photo: true, latitude: 43.3, longitude: 5.37 });
    expect(new Date(photo.taken_at).toISOString()).toBe("2026-10-02T09:15:00.000Z");
    const other = list.find((e) => e.id !== e1)!;
    // Date future et position impossible ignorées.
    expect(new Date(other.taken_at).getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    expect(other.latitude).toBeNull();
    expect((await journalPhoto(ctx, e1)).type).toBe("image/jpeg");
    const stranger = await signUp(db, "reception-autre@exemple.fr", "Autre");
    await expect(journalPhoto(stranger, e1)).rejects.toMatchObject({ status: 404 });
    await deleteJournalEntry(ctx, e1);
    expect(await listJournal(ctx, id)).toHaveLength(1);
  });
});

describe("réception des travaux", () => {
  it("procès-verbal avec réserves, levée puis PV de levée", async () => {
    const id = await job();
    await expect(signReception(ctx, id, { ...base, decision: "avec_reserves", reserves: [] })).rejects.toMatchObject({ status: 400 });
    await expect(signReception(ctx, id, { ...base, decision: "sans_reserve", clientSignature: "" })).rejects.toMatchObject({ status: 400 });
    await expect(signReception(ctx, id, { ...base, decision: "sans_reserve", date: "2099-01-01" })).rejects.toMatchObject({ status: 400 });
    await signReception(ctx, id, {
      ...base,
      decision: "avec_reserves",
      reserves: [
        { label: "Joint de dilatation fissuré", location: "Angle nord", dueDate: "2026-11-01" },
        { label: "Nez de marche ébréché", location: "", dueDate: "" },
        { label: "", location: "", dueDate: "" },
      ],
    });
    await expect(signReception(ctx, id, { ...base, decision: "sans_reserve" })).rejects.toMatchObject({ status: 409 });
    expect((await getJob(ctx, id)).job.status).toBe("receptionne");
    const { reception, reserves, open } = await getReception(ctx, id);
    expect(reception?.decision).toBe("avec_reserves");
    expect(reserves.map((r) => r.label)).toEqual(["Joint de dilatation fissuré", "Nez de marche ébréché"]);
    expect(reserves[0].due_date).toBe("2026-11-01");
    expect(open).toBe(2);
    const pdf = await receptionPdf(ctx, id);
    expect((await PDFDocument.load(pdf.pdf)).getPageCount()).toBeGreaterThanOrEqual(1);

    await expect(liftingPdf(ctx, id)).rejects.toMatchObject({ status: 409 });
    await liftReserve(ctx, reserves[0].id, "Joint refait");
    await expect(liftReserve(ctx, reserves[0].id, "")).rejects.toMatchObject({ status: 409 });
    await liftReserve(ctx, reserves[1].id, "");
    expect((await getReception(ctx, id)).open).toBe(0);
    const lifting = await liftingPdf(ctx, id);
    expect((await PDFDocument.load(lifting)).getTitle()).toContain("Levée des réserves");
  });

  it("refus motivé : le chantier n'est pas réceptionné", async () => {
    const id = await job();
    await expect(signReception(ctx, id, { ...base, decision: "refus" })).rejects.toMatchObject({ status: 400 });
    await signReception(ctx, id, { ...base, decision: "refus", refusalReason: "Garde-corps non posé" });
    expect((await getJob(ctx, id)).job.status).toBe("termine");
    await expect(liftingPdf(ctx, id)).rejects.toMatchObject({ status: 400 });
  });
});
