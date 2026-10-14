import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { activeWarranties, addressKey, timeline } from "@/lib/home-record";
import type { Ctx } from "@/lib/services/context";
import { addHomeEntry, deleteHomeEntry, getHomeRecord, listHomeRecords, revokeHomeShare, shareHomeRecord, sharedHomeRecord } from "@/lib/services/home-records";
import { completeProfile, freshDb, makeCustomer, signUp } from "./helpers";

describe("carnet : calculs", () => {
  it("reconnaît la même adresse écrite autrement", () => {
    expect(addressKey("12 Avenue des Érables", "69 003", "Lyon")).toBe(addressKey("12, av. des erables", "69003", "LYON"));
    expect(addressKey("12 rue A", "69003", "Lyon")).not.toBe(addressKey("14 rue A", "69003", "Lyon"));
  });

  it("ordonne la frise et liste les garanties actives", () => {
    const items = timeline(
      [
        { id: "j1", title: "Toiture", startDate: "2020-03-01", endDate: "2020-04-01", receptionDate: "2020-04-10" },
        { id: "j2", title: "Sans date", startDate: null, endDate: null, receptionDate: null },
      ],
      [{ id: "e1", date: "2025-01-15", kind: "equipement", label: "Chaudière", detail: "", brand: "", warrantyUntil: "2027-01-15", maintenanceMonths: 12 }],
      "2026-10-14",
    );
    expect(items.map((i) => i.date)).toEqual(["2025-01-15", "2020-04-10"]);
    const w = activeWarranties(items, "2026-10-14");
    expect(w.map((x) => x.label)).toEqual(["Fabricant", "Décennale"]);
    expect(w[1].end).toBe("2030-04-10");
  });
});

describe("carnet : service", () => {
  let db: Database;
  let ctx: Ctx;
  let other: Ctx;
  let recordId: string;

  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "carnet@exemple.fr");
    await completeProfile(ctx);
    other = await signUp(db, "carnet-autre@exemple.fr");
    const customerId = await makeCustomer(ctx);
    for (const [title, line1] of [
      ["Salle de bains", "8 Boulevard Vivier Merle"],
      ["Toiture", "8 bd vivier-merle"],
    ]) {
      const j = await db.query<{ id: string }>(
        "INSERT INTO jobs (org_id, customer_id, title, status, site_line1, site_postal_code, site_city, start_date, end_date) VALUES ($1,$2,$3,'receptionne',$4,'69003','Lyon','2024-05-01','2024-05-20') RETURNING id",
        [ctx.orgId, customerId, title, line1],
      );
      if (title === "Toiture")
        await db.query(
          "INSERT INTO job_receptions (org_id, job_id, decision, reception_date, snapshot, pdf, pdf_sha256) VALUES ($1,$2,'sans_reserve','2024-05-25','{}', '\\x00', 'x')",
          [ctx.orgId, j[0].id],
        );
    }
  });

  it("crée un seul carnet pour une adresse écrite de deux façons", async () => {
    const list = await listHomeRecords(ctx);
    expect(list).toHaveLength(1);
    recordId = list[0].id;
    const h = await getHomeRecord(ctx, recordId);
    expect(h.items.map((i) => (i.type === "chantier" ? i.job.title : ""))).toEqual(["Toiture", "Salle de bains"]);
    expect(h.warranties.some((w) => w.label === "Décennale" && w.end === "2034-05-25")).toBe(true);
    await expect(getHomeRecord(other, recordId)).rejects.toThrow();
  });

  it("ajoute un équipement et le retire", async () => {
    const id = await addHomeEntry(ctx, recordId, {
      date: "2025-11-02",
      kind: "equipement",
      label: "Pompe à chaleur",
      brand: "Marque X",
      warrantyUntil: "2030-11-02",
      maintenanceMonths: "12",
    });
    const h = await getHomeRecord(ctx, recordId);
    expect(h.items[0]).toMatchObject({ type: "entree", entry: { label: "Pompe à chaleur", maintenanceMonths: 12 } });
    await expect(addHomeEntry(ctx, recordId, { date: "2025-11-02", kind: "piscine", label: "X" })).rejects.toThrow();
    await expect(deleteHomeEntry(other, id)).rejects.toThrow();
    await deleteHomeEntry(ctx, id);
    expect((await getHomeRecord(ctx, recordId)).items).toHaveLength(2);
  });

  it("transmet le carnet sans le nom du client, jusqu'à révocation", async () => {
    const token = await shareHomeRecord(ctx, recordId);
    const s = await sharedHomeRecord(db, token);
    expect(s?.address.city).toBe("Lyon");
    expect((await getHomeRecord(ctx, recordId)).shareViews).toBe(1);
    expect(await sharedHomeRecord(db, token, new Date(Date.now() + 400 * 86_400_000))).toBeNull();
    await revokeHomeShare(ctx, recordId);
    expect(await sharedHomeRecord(db, token)).toBeNull();
    expect(await sharedHomeRecord(db, "court")).toBeNull();
  });
});
