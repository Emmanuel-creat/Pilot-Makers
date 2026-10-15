import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { deliveryAdvice, isWorkday, workdayOffset, workdaysBetween } from "@/lib/just-in-time";
import type { Ctx } from "@/lib/services/context";
import { alignDelivery, createOrder, justInTimeOrders, sendOrder, updateOrder, saveLine } from "@/lib/services/purchase-orders";
import { freshDb, makeCustomer, signUp } from "./helpers";

describe("livraisons juste à temps : calendrier", () => {
  it("saute les week-ends et les jours fériés", () => {
    expect(isWorkday("2026-11-11")).toBe(false);
    expect(isWorkday("2026-11-14")).toBe(false);
    expect(workdayOffset("2026-11-12", -1)).toBe("2026-11-10");
    expect(workdayOffset("2026-11-16", -1)).toBe("2026-11-13");
    expect(workdayOffset("2026-11-13", 1)).toBe("2026-11-16");
    expect(workdaysBetween("2026-11-09", "2026-11-16")).toBe(4);
    expect(workdaysBetween("2026-11-16", "2026-11-09")).toBe(-4);
  });

  it("conseille la veille ouvrée des travaux et repère les livraisons trop tôt ou trop tard", () => {
    const today = "2026-11-02";
    expect(deliveryAdvice({ deliveryDate: null, workStart: null, today }).state).toBe("sans_planning");
    expect(deliveryAdvice({ deliveryDate: null, workStart: "2026-11-16", today })).toMatchObject({ state: "sans_date", ideal: "2026-11-13" });
    expect(deliveryAdvice({ deliveryDate: "2026-11-13", workStart: "2026-11-16", today }).state).toBe("ok");
    expect(deliveryAdvice({ deliveryDate: "2026-11-16", workStart: "2026-11-16", today }).state).toBe("ok");
    expect(deliveryAdvice({ deliveryDate: "2026-11-03", workStart: "2026-11-16", today })).toMatchObject({ state: "trop_tot" });
    expect(deliveryAdvice({ deliveryDate: "2026-11-18", workStart: "2026-11-16", today }).message).toContain("2 jours ouvrés après");
    // Travaux demain : on ne peut pas livrer avant demain.
    expect(deliveryAdvice({ deliveryDate: null, workStart: "2026-11-03", today }).ideal).toBe("2026-11-03");
  });
});

describe("livraisons juste à temps : commandes", () => {
  let db: Database;
  let ctx: Ctx;
  let other: Ctx;
  let job: string;
  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "jit@exemple.fr");
    other = await signUp(db, "autre-jit@exemple.fr", "Autre");
    const c = await makeCustomer(ctx);
    const [j] = await db.query<{ id: string }>(
      "INSERT INTO jobs (org_id, customer_id, title, status, start_date) VALUES ($1,$2,'Cuisine Martin','a_planifier','2099-03-02') RETURNING id",
      [ctx.orgId, c],
    );
    job = j.id;
  });

  it("compare chaque commande au premier jour d'équipe planifié et la cale d'un clic", async () => {
    const today = "2099-02-02";
    const a = await createOrder(ctx, job, "Négoce Durand");
    await updateOrder(ctx, a, { supplier: "Négoce Durand", deliveryDate: "2099-02-12" });
    const b = await createOrder(ctx, job, "Faïences Sud");
    let rows = await justInTimeOrders(ctx, today);
    expect(rows.map((r) => [r.number, r.workStart, r.advice.state])).toEqual([
      [expect.any(String), "2099-03-02", "trop_tot"],
      [expect.any(String), "2099-03-02", "sans_date"],
    ]);
    // L'équipe est planifiée plus tôt que la date de début saisie : c'est elle qui compte.
    await db.query(
      "INSERT INTO job_assignments (org_id, job_id, resource_type, resource_id, start_date, end_date) VALUES ($1,$2,'user',$3,'2099-02-16','2099-02-20')",
      [ctx.orgId, job, ctx.userId],
    );
    rows = await justInTimeOrders(ctx, today);
    expect(rows.find((r) => r.id === a)?.advice).toMatchObject({ state: "ok", ideal: "2099-02-13" });
    expect(await alignDelivery(ctx, b, today)).toEqual({ date: "2099-02-13", notifySupplier: false });
    expect((await justInTimeOrders(ctx, today)).every((r) => r.advice.state === "ok")).toBe(true);

    await saveLine(ctx, a, { label: "Plan de travail", quantity: "1", unit: "u" });
    await db.query("UPDATE purchase_orders SET delivery_date='2099-02-25' WHERE id=$1", [a]);
    await db.query("UPDATE purchase_orders SET supplier_email='commandes@negoce.fr' WHERE id=$1", [a]);
    await sendOrder(ctx, a);
    expect(await alignDelivery(ctx, a, today)).toEqual({ date: "2099-02-13", notifySupplier: true });
    await expect(alignDelivery(other, a, today)).rejects.toMatchObject({ status: 404 });
  });
});
