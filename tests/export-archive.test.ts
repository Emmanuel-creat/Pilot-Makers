import { PDFDocument } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/csv";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import { exportArchive, tableCsv } from "@/lib/services/export";
import { createFinalInvoice } from "@/lib/services/invoices";
import { addJournalEntry, signReception } from "@/lib/services/job-site";
import { createJobFromQuote } from "@/lib/services/jobs";
import { createQuote, getDraft, issueQuote, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { createEndpoint } from "@/lib/services/webhooks";
import { unzip, zip } from "@/lib/zip";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "export@exemple.fr");
  await completeProfile(ctx);
});

describe("archive ZIP", () => {
  it("écrit une archive lisible : noms UTF-8, compression et contrôle d'intégrité", () => {
    const big = "Carrelage ".repeat(500);
    const buf = zip([
      { name: "réception/procès-verbal.txt", data: big },
      { name: "binaire.bin", data: new Uint8Array([0, 1, 2, 255]) },
    ]);
    expect(buf.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    expect(buf.length).toBeLessThan(big.length);
    const files = unzip(buf);
    expect(files.get("réception/procès-verbal.txt")!.toString("utf8")).toBe(big);
    expect([...files.get("binaire.bin")!]).toEqual([0, 1, 2, 255]);
    expect(() => zip([{ name: "../hors.txt", data: "x" }])).toThrow();
    expect(() =>
      zip([
        { name: "a.txt", data: "x" },
        { name: "a.txt", data: "y" },
      ]),
    ).toThrow();
    const corrupt = Buffer.from(buf);
    corrupt[60] ^= 0xff;
    expect(() => unzip(corrupt)).toThrow();
  });

  it("CSV de table : dates ISO, listes, objets en JSON, formules neutralisées", () => {
    const csv = tableCsv([{ nom: "=SOMME(A1)", tags: ["vip", "pro"], at: new Date("2026-10-01T08:00:00Z"), data: { a: 1 }, actif: true }]);
    const rows = parseCsv(csv);
    expect(rows[0]).toEqual(["nom", "tags", "at", "data", "actif"]);
    expect(rows[1][0].startsWith("=")).toBe(false);
    expect(rows[1].slice(1)).toEqual(["vip|pro", "2026-10-01T08:00:00.000Z", '{"a":1}', "oui"]);
  });
});

describe("export complet en formats ouverts", () => {
  it("contient JSON, tableaux CSV, PDF émis et photos, sans secret", async () => {
    const quoteId = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
    const d = await getDraft(ctx, quoteId);
    await saveDraft(
      ctx,
      quoteId,
      {
        ...d,
        title: "Salle d'eau",
        site: { line1: "2 rue du Port", line2: "", postalCode: "13002", city: "Marseille" },
        sections: [{ ...d.sections[0], lines: [line()] }],
      },
      d.draftRevision,
    );
    await issueQuote(ctx, quoteId);
    await recordResponseManually(ctx, quoteId, { decision: "accept", version: 1, proof: "Bon pour accord signé" });
    await createFinalInvoice(ctx, quoteId);
    const jobId = await createJobFromQuote(ctx, quoteId);
    await addJournalEntry(ctx, jobId, { note: "Dépose", photo: JPEG, takenAt: "2026-10-02T09:15:00Z" });
    await signReception(ctx, jobId, {
      date: "2026-10-05",
      decision: "sans_reserve",
      clientName: "Claire Dubois",
      clientSignature: PNG,
      companyName: "Paul Martin",
      companySignature: PNG,
    });
    const hook = await createEndpoint(ctx, { url: "https://exemple.fr/hook", events: ["quote.accepted"] });

    const files = unzip(await exportArchive(ctx));
    const names = [...files.keys()];
    expect(names).toContain("LISEZMOI.txt");
    expect(names).toContain("tableaux/clients.csv");
    expect(names).toContain("tableaux/chantiers.csv");
    expect(names.filter((n) => n.startsWith("devis/") && n.endsWith("-v1.pdf"))).toHaveLength(1);
    expect(names.filter((n) => n.startsWith("factures/"))).toHaveLength(1);
    expect(names.filter((n) => n.startsWith("receptions/"))).toHaveLength(1);
    const photo = names.find((n) => n.startsWith("photos/"))!;
    expect(photo).toMatch(/^photos\/.+\/2026-10-02-[0-9a-f]{8}\.jpg$/);
    expect([...files.get(photo)!]).toEqual([...JPEG]);

    for (const n of names.filter((x) => x.endsWith(".pdf"))) {
      const pdf = await PDFDocument.load(files.get(n)!);
      expect(pdf.getPageCount()).toBeGreaterThan(0);
    }
    const data = JSON.parse(files.get("donnees.json")!.toString("utf8"));
    expect(data.jobs).toHaveLength(1);
    expect(data.jobJournal[0].note).toBe("Dépose");
    expect(data.jobJournal[0].photo).toBeUndefined();
    expect(data.webhookEndpoints[0].url).toBe("https://exemple.fr/hook");
    const all = [...files.values()].map((b) => b.toString("latin1")).join("\n");
    expect(all).not.toContain(hook.secret);
    expect(all).not.toContain("password_hash");
    const quotes = parseCsv(files.get("tableaux/devis.csv")!.toString("utf8"));
    expect(quotes[0]).toContain("title");
    expect(quotes.some((r) => r.includes("Salle d'eau"))).toBe(true);
  });

  it("réservée aux administrateurs", async () => {
    await expect(exportArchive({ ...ctx, role: "member" })).rejects.toMatchObject({ status: 403 });
  });
});
