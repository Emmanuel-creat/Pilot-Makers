import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { dayCloseItems, parisClock, reminderDue } from "@/lib/day-close";
import type { Ctx } from "@/lib/services/context";
import { myDayClose, runDayCloseReminders, setDayCloseReminder } from "@/lib/services/day-close";
import { createQuote } from "@/lib/services/quotes";
import { freshDb, signUp } from "./helpers";

const none = {
  assignedToday: false,
  minutesToday: 0,
  draftsTouchedToday: 0,
  validatedStagesToInvoice: 0,
  receivedJobsWithoutFinalInvoice: 0,
  leadsWaiting: 0,
  expensesWithoutReceipt: 0,
};

describe("points de fin de journée", () => {
  it("journée bouclée quand il ne reste rien", () => {
    expect(dayCloseItems(none)).toEqual([]);
    expect(dayCloseItems({ ...none, assignedToday: true, minutesToday: 420 })).toEqual([]);
  });

  it("liste ce qui reste, le plus urgent pour l'argent d'abord", () => {
    const items = dayCloseItems({ ...none, assignedToday: true, draftsTouchedToday: 2, validatedStagesToInvoice: 1, leadsWaiting: 3 });
    expect(items.map((i) => i.key)).toEqual(["heures", "etapes", "demandes", "brouillons"]);
    expect(items[1].label).toBe("Facturer 1 étape validée par le client");
    expect(items.reduce((s, i) => s + i.minutes, 0)).toBe(1 + 2 + 9 + 10);
  });

  it("rappel entre 16 h 30 et 18 h, une fois par jour, à l'heure de Paris", () => {
    expect(reminderDue(16 * 60 + 29, null, "2026-10-15")).toBe(false);
    expect(reminderDue(16 * 60 + 30, null, "2026-10-15")).toBe(true);
    expect(reminderDue(17 * 60, "2026-10-15", "2026-10-15")).toBe(false);
    expect(reminderDue(18 * 60, null, "2026-10-15")).toBe(false);
    expect(parisClock(new Date("2026-10-15T14:45:00Z"))).toEqual({ today: "2026-10-15", minutes: 16 * 60 + 45 });
    expect(parisClock(new Date("2026-12-31T23:30:00Z"))).toEqual({ today: "2027-01-01", minutes: 30 });
  });
});

describe("fin de journée de l'utilisateur", () => {
  let db: Database;
  let ctx: Ctx;

  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "fin-journee@exemple.fr");
  });

  it("compte les devis commencés aujourd'hui et envoie le rappel une seule fois", async () => {
    const now = new Date();
    await createQuote(ctx, { title: "Devis du jour" });
    const d = await myDayClose(ctx, now);
    expect(d.items.map((i) => i.key)).toContain("brouillons");
    expect(d.reminder).toBe(false);
    await setDayCloseReminder(ctx, true);
    expect((await myDayClose(ctx, now)).reminder).toBe(true);
    // 16 h 45 à Paris, en heure d'été comme en heure d'hiver
    const at1645 = ["14", "15"].map((h) => new Date(`${parisClock(now).today}T${h}:45:00Z`)).find((d) => parisClock(d).minutes === 16 * 60 + 45)!;
    const tooEarly = new Date(`${parisClock(now).today}T10:00:00Z`);
    expect(await runDayCloseReminders(db, tooEarly)).toEqual({ sent: 0 });
    await db.query("UPDATE quotes SET updated_at=$2 WHERE org_id=$1", [ctx.orgId, at1645]);
    expect((await runDayCloseReminders(db, at1645)).sent).toBe(1);
    expect((await runDayCloseReminders(db, at1645)).sent).toBe(0);
  });
});
