import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { addMonths, maintenanceState, nextDue, noticeMail } from "@/lib/maintenance";
import type { Ctx } from "@/lib/services/context";
import { addHomeEntry, getHomeRecord, listHomeRecords } from "@/lib/services/home-records";
import { maintenanceBoard, recordMaintenance, runMaintenanceNotices } from "@/lib/services/maintenance";
import { completeProfile, freshDb, makeCustomer, signUp } from "./helpers";

describe("entretien : calculs", () => {
  it("ajoute des mois en gardant une date valide", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonths("2025-11-15", 14)).toBe("2027-01-15");
  });

  it("part du dernier entretien, sinon de l'installation", () => {
    expect(nextDue("2025-03-01", 12, null)).toBe("2026-03-01");
    expect(nextDue("2025-03-01", 12, "2026-02-10")).toBe("2027-02-10");
    expect(nextDue("2025-03-01", 12, "2024-01-01")).toBe("2026-03-01");
  });

  it("classe l'échéance", () => {
    expect(maintenanceState("2026-10-13", "2026-10-14")).toBe("en_retard");
    expect(maintenanceState("2026-11-13", "2026-10-14")).toBe("bientot");
    expect(maintenanceState("2026-11-14", "2026-10-14")).toBe("a_jour");
  });

  it("rédige l'e-mail au client", () => {
    const m = noticeMail({
      equipment: "Chaudière",
      brand: "Modèle X",
      address: "1 rue A, 69003 Lyon",
      due: "2026-11-01",
      orgName: "Durand",
      orgPhone: "0600000000",
    });
    expect(m.subject).toBe("Entretien de votre chaudière à prévoir");
    expect(m.body).toContain("Chaudière (Modèle X), au 1 rue A, 69003 Lyon, est à prévoir avant le 1 novembre 2026");
    expect(m.body).toContain("0600000000");
  });
});

describe("entretien : service", () => {
  let db: Database;
  let ctx: Ctx;
  let other: Ctx;
  let recordId: string;
  let boiler: string;
  let customerId: string;
  const NOW = new Date("2026-10-14T10:00:00Z");

  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "entretien@exemple.fr");
    await completeProfile(ctx);
    other = await signUp(db, "entretien-autre@exemple.fr");
    customerId = await makeCustomer(ctx);
    await db.query(
      "INSERT INTO jobs (org_id, customer_id, title, status, site_line1, site_postal_code, site_city) VALUES ($1,$2,'Chaufferie','termine','3 rue Garibaldi','69006','Lyon')",
      [ctx.orgId, customerId],
    );
    recordId = (await listHomeRecords(ctx))[0].id;
    boiler = await addHomeEntry(ctx, recordId, { date: "2025-11-01", kind: "equipement", label: "Chaudière", maintenanceMonths: "12" });
    await addHomeEntry(ctx, recordId, { date: "2026-01-10", kind: "equipement", label: "Ballon", maintenanceMonths: "36" });
  });

  it("liste les échéances et prévient le client une seule fois", async () => {
    const board = await maintenanceBoard(ctx, NOW);
    expect(board.map((m) => [m.label, m.due, m.state])).toEqual([
      ["Chaudière", "2026-11-01", "bientot"],
      ["Ballon", "2029-01-10", "a_jour"],
    ]);
    expect((await runMaintenanceNotices(db, NOW)).sent).toBe(1);
    expect((await runMaintenanceNotices(db, NOW)).sent).toBe(0);
    const mail = await db.query<{ subject: string; kind: string }>("SELECT subject, kind FROM emails WHERE org_id=$1 AND kind='maintenance'", [ctx.orgId]);
    expect(mail).toHaveLength(1);
    expect((await maintenanceBoard(ctx, NOW))[0].notified).toBe(true);
  });

  it("respecte le refus des messages", async () => {
    await db.query("UPDATE customers SET marketing_optout_at=now() WHERE id=$1", [customerId]);
    const later = new Date("2029-12-20T10:00:00Z");
    expect((await runMaintenanceNotices(db, later)).sent).toBe(0);
    await db.query("UPDATE customers SET marketing_optout_at=NULL WHERE id=$1", [customerId]);
  });

  it("enregistre l'entretien fait et décale l'échéance", async () => {
    await expect(recordMaintenance(ctx, boiler, { date: "2026-12-01" }, NOW)).rejects.toThrow();
    await expect(recordMaintenance(other, boiler, { date: "2026-10-10" }, NOW)).rejects.toThrow();
    await recordMaintenance(ctx, boiler, { date: "2026-10-10", detail: "Nettoyage du corps de chauffe" }, NOW);
    const m = (await maintenanceBoard(ctx, NOW)).find((x) => x.id === boiler)!;
    expect(m).toMatchObject({ lastService: "2026-10-10", due: "2027-10-10", state: "a_jour", notified: false });
    const h = await getHomeRecord(ctx, recordId, NOW);
    expect(h.items.some((i) => i.type === "entree" && i.entry.label === "Entretien : Chaudière")).toBe(true);
  });
});
