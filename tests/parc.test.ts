import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { addMonths, checkState, nextDue } from "@/lib/fleet";
import type { Ctx } from "@/lib/services/context";
import { addCheck, addTool, deleteCheck, deleteTool, listChecks, listTools, markCheckDone, runFleetReminders } from "@/lib/services/fleet";
import { addVehicle } from "@/lib/services/planning";
import { parisDate } from "@/lib/services/quotes";
import { completeProfile, freshDb, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "parc@exemple.fr");
  await completeProfile(ctx);
});

describe("contrôles du parc : échéances", () => {
  it("mois ajoutés, état et prochaine échéance", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-10-13", 24)).toBe("2028-10-13");
    expect(checkState(null, "2026-10-13")).toBe("sans_echeance");
    expect(checkState("2026-10-12", "2026-10-13")).toBe("en_retard");
    expect(checkState("2026-11-01", "2026-10-13")).toBe("a_prevoir");
    expect(checkState("2027-01-01", "2026-10-13")).toBe("a_jour");
    expect(nextDue("2026-10-13", 6)).toBe("2027-04-13");
    expect(nextDue("2026-10-13", null)).toBeNull();
  });
});

describe("véhicules et outillage", () => {
  it("contrôles, contrôle fait, rappel unique par échéance", async () => {
    const van = await addVehicle(ctx, { name: "Fourgon", plate: "ab-123-cd" });
    const scaffold = await addTool(ctx, { name: "Échafaudage roulant", reference: "ECH-2" });
    await expect(addTool(ctx, { name: "" })).rejects.toMatchObject({ status: 400 });
    expect((await listTools(ctx)).map((t) => t.reference)).toEqual(["ECH-2"]);

    const today = parisDate(new Date());
    const soon = today;
    const ct = await addCheck(ctx, { asset: `vehicle:${van}`, label: "Contrôle technique", intervalMonths: "24", dueDate: soon, note: "Garage du Port" });
    const vgp = await addCheck(ctx, { asset: `tool:${scaffold}`, label: "Vérification des échafaudages", intervalMonths: "3" });
    await expect(addCheck(ctx, { asset: `tool:${scaffold}`, label: "Peinture" })).rejects.toMatchObject({ status: 400 });
    await expect(addCheck(ctx, { asset: `tool:${scaffold}`, label: "Peinture", intervalMonths: "200" })).rejects.toMatchObject({ status: 400 });
    await expect(addCheck(ctx, { asset: "camion:1", label: "Peinture", intervalMonths: "2" })).rejects.toMatchObject({ status: 400 });
    await expect(addCheck(ctx, { asset: `tool:${van}`, label: "Peinture", intervalMonths: "2" })).rejects.toMatchObject({ status: 404 });

    let checks = await listChecks(ctx);
    expect(checks.map((c) => [c.label, c.assetType, c.state])).toEqual([
      ["Contrôle technique", "vehicle", "a_prevoir"],
      ["Vérification des échafaudages", "tool", "a_jour"],
    ]);
    expect(checks[0].assetName).toBe("Fourgon (AB-123-CD)");
    expect(checks[1].dueDate).toBe(addMonths(today, 3));

    expect((await runFleetReminders(db)).sent).toBe(1);
    expect((await runFleetReminders(db)).sent).toBe(0);

    await expect(markCheckDone(ctx, ct, "2099-01-01")).rejects.toMatchObject({ status: 400 });
    expect(await markCheckDone(ctx, ct)).toBe(addMonths(today, 24));
    checks = await listChecks(ctx);
    expect(checks.find((c) => c.id === ct)).toMatchObject({ lastDone: today, state: "a_jour" });

    const stranger = await signUp(db, "parc-autre@exemple.fr", "Autre");
    await expect(markCheckDone(stranger, vgp)).rejects.toMatchObject({ status: 404 });
    await deleteCheck(ctx, vgp);
    await expect(deleteCheck(ctx, vgp)).rejects.toMatchObject({ status: 404 });
    await deleteTool(ctx, scaffold);
    await expect(deleteTool(ctx, scaffold)).rejects.toMatchObject({ status: 404 });
    expect(await listChecks(ctx)).toHaveLength(1);
  });
});
