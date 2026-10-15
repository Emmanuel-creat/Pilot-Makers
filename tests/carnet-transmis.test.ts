import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { entriesToImport, shareTokenOf, timeline } from "@/lib/home-record";
import type { Ctx } from "@/lib/services/context";
import {
  addHomeEntry,
  getHomeRecord,
  importSharedHomeRecord,
  listHomeRecords,
  revokeHomeShare,
  shareHomeRecord,
  sharedHomeRecord,
} from "@/lib/services/home-records";
import { completeProfile, freshDb, makeCustomer, signUp } from "./helpers";

describe("carnet transmis : calculs", () => {
  it("lit le jeton d'un lien collé entier ou seul", () => {
    const t = "AbCdEfGhIjKlMnOpQrStUvWx";
    expect(shareTokenOf(`https://pilot-makers.fr/carnet/${t}`)).toBe(t);
    expect(shareTokenOf(` ${t} `)).toBe(t);
    expect(shareTokenOf(`https://x.fr/carnet/${t}?a=1`)).toBe(t);
    expect(shareTokenOf("https://x.fr/devis/123")).toBeNull();
  });

  it("garde l'auteur d'origine d'une entrée déjà reprise", () => {
    const items = timeline(
      [{ id: "j1", title: "Toiture", startDate: "2020-03-01", endDate: null, receptionDate: "2020-04-10" }],
      [
        {
          id: "e1",
          date: "2025-01-15",
          kind: "equipement",
          label: "Chaudière",
          detail: "",
          brand: "X",
          warrantyUntil: null,
          maintenanceMonths: 12,
          source: "",
        },
        {
          id: "e2",
          date: "2019-01-15",
          kind: "diagnostic",
          label: "DPE",
          detail: "",
          brand: "",
          warrantyUntil: null,
          maintenanceMonths: null,
          source: "Diag Rhône",
        },
      ],
      "2026-10-15",
    );
    const out = entriesToImport(items, "Toits Martin");
    expect(out.map((e) => [e.label, e.source])).toEqual([
      ["Chaudière", "Toits Martin"],
      ["Toiture", "Toits Martin"],
      ["DPE", "Diag Rhône"],
    ]);
    expect(out[1]).toMatchObject({ kind: "travaux", sourceId: "j1" });
    expect(out[1].detail).toContain("Décennale jusqu'au 10/04/2030");
  });
});

describe("carnet transmis : d'un artisan à l'autre", () => {
  let db: Database;
  let first: Ctx;
  let second: Ctx;
  let token: string;
  let customer: string;
  let firstRecord: string;

  beforeAll(async () => {
    db = await freshDb();
    first = await signUp(db, "premier@carnet.fr", "Toits Martin");
    await completeProfile(first);
    second = await signUp(db, "second@carnet.fr", "Chauffage Durand");
    const c = await makeCustomer(first);
    const j = await db.query<{ id: string }>(
      "INSERT INTO jobs (org_id, customer_id, title, status, site_line1, site_postal_code, site_city, start_date, end_date) VALUES ($1,$2,'Toiture','receptionne','8 rue des Lilas','69003','Lyon','2024-05-01','2024-05-20') RETURNING id",
      [first.orgId, c],
    );
    await db.query(
      "INSERT INTO job_receptions (org_id, job_id, decision, reception_date, snapshot, pdf, pdf_sha256) VALUES ($1,$2,'sans_reserve','2024-05-25','{}', '\\x00', 'x')",
      [first.orgId, j[0].id],
    );
    firstRecord = (await listHomeRecords(first))[0].id;
    await addHomeEntry(first, firstRecord, { date: "2024-06-01", kind: "equipement", label: "Fenêtre de toit", brand: "Velux", warrantyUntil: "2034-06-01" });
    token = await shareHomeRecord(first, firstRecord);
    customer = await makeCustomer(second);
  });

  it("reprend l'historique avec ses auteurs, sans doublon à la seconde reprise", async () => {
    await expect(importSharedHomeRecord(second, "n'importe quoi", customer)).rejects.toMatchObject({ status: 400 });
    await expect(importSharedHomeRecord(second, token, "00000000-0000-0000-0000-000000000000")).rejects.toMatchObject({ status: 404 });
    await expect(importSharedHomeRecord(first, token, await makeCustomer(first))).rejects.toThrow(/déjà le vôtre/);
    const r = await importSharedHomeRecord(second, `https://exemple.fr/carnet/${token}`, customer);
    expect(r).toMatchObject({ imported: 2, total: 2 });
    const h = await getHomeRecord(second, r.recordId);
    expect(h.address).toEqual({ line1: "8 rue des Lilas", postalCode: "69003", city: "Lyon" });
    expect(h.items.map((i) => (i.type === "entree" ? [i.entry.label, i.entry.source] : null))).toEqual([
      ["Fenêtre de toit", "Toits Martin"],
      ["Toiture", "Toits Martin"],
    ]);
    expect(h.warranties.some((w) => w.label === "Fabricant" && w.source === "Fenêtre de toit")).toBe(true);
    expect((await importSharedHomeRecord(second, token, customer)).imported).toBe(0);
  });

  it("transmet au troisième artisan l'historique complet, auteurs d'origine compris", async () => {
    const rec = (await db.query<{ id: string }>("SELECT id FROM home_records WHERE org_id=$1", [second.orgId]))[0].id;
    await addHomeEntry(second, rec, { date: "2026-09-01", kind: "equipement", label: "Pompe à chaleur", maintenanceMonths: 12 });
    const t2 = await shareHomeRecord(second, rec);
    const third = await signUp(db, "troisieme@carnet.fr", "Elec Robert");
    const r = await importSharedHomeRecord(third, t2, await makeCustomer(third));
    expect(r.imported).toBe(3);
    const items = (await getHomeRecord(third, r.recordId)).items;
    expect(items.map((i) => (i.type === "entree" ? i.entry.source : ""))).toEqual(["Chauffage Durand", "Toits Martin", "Toits Martin"]);
    await revokeHomeShare(second, rec);
    expect(await sharedHomeRecord(db, t2)).toBeNull();
    await expect(importSharedHomeRecord(third, t2, await makeCustomer(third))).rejects.toMatchObject({ status: 404 });
  });
});
