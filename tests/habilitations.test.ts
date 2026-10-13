import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { certStatus, daysUntil, suggestedEnd } from "@/lib/certifications";
import { addCertification, deleteCertification, listCertifications, runCertificationReminders } from "@/lib/services/certifications";
import type { Ctx } from "@/lib/services/context";
import { completeProfile, freshDb, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;
let mate: Ctx;

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "habilitations@exemple.fr");
  await completeProfile(ctx);
  const m = await signUp(db, "habilitations-ouvrier@exemple.fr", "Karim");
  await db.query("INSERT INTO memberships (org_id, user_id, role, job_function) VALUES ($1,$2,'member','ouvrier')", [ctx.orgId, m.userId]);
  mate = { ...m, orgId: ctx.orgId, role: "member", jobFunction: "ouvrier" } as Ctx;
});

describe("habilitations : échéances", () => {
  it("état et durée habituelle de recyclage", () => {
    expect(certStatus(null, "2026-10-13")).toBe("permanente");
    expect(certStatus("2026-10-12", "2026-10-13")).toBe("expiree");
    expect(certStatus("2026-12-12", "2026-10-13")).toBe("a_renouveler");
    expect(certStatus("2027-01-13", "2026-10-13")).toBe("valide");
    expect(daysUntil("2026-10-13", "2026-11-12")).toBe(30);
    expect(suggestedEnd("Habilitation électrique", "2026-03-15")).toBe("2029-03-15");
    expect(suggestedEnd("Sauveteur secouriste du travail (SST)", "2024-02-29")).toBe("2026-02-28");
    expect(suggestedEnd("Permis poids lourd", "2026-03-15")).toBe("");
    expect(suggestedEnd("Habilitation électrique", "")).toBe("");
  });
});

describe("habilitations de l'équipe", () => {
  it("saisie, droits, tri par échéance et rappel unique", async () => {
    const now = new Date("2026-10-13T08:00:00Z");
    const soon = await addCertification(ctx, {
      userId: mate.userId,
      name: "Habilitation électrique",
      obtainedOn: "2023-11-01",
      validUntil: "2026-11-01",
      note: "B1V BR",
    });
    await addCertification(mate, { userId: mate.userId, name: "Sauveteur secouriste du travail (SST)", obtainedOn: "2026-01-10", validUntil: "2028-01-10" });
    await addCertification(ctx, { userId: ctx.userId, name: "AIPR", validUntil: "" });
    await expect(addCertification(mate, { userId: ctx.userId, name: "AIPR" })).rejects.toMatchObject({ status: 400 });
    await expect(addCertification(ctx, { userId: mate.userId, name: "X" })).rejects.toMatchObject({ status: 400 });
    await expect(addCertification(ctx, { userId: mate.userId, name: "CACES", obtainedOn: "2026-01-01", validUntil: "2025-01-01" })).rejects.toMatchObject({
      status: 400,
    });
    await expect(addCertification(ctx, { userId: mate.userId, name: "CACES", validUntil: "01/01/2030" })).rejects.toMatchObject({ status: 400 });
    const stranger = await signUp(db, "habilitations-autre@exemple.fr", "Autre");
    await expect(addCertification(ctx, { userId: stranger.userId, name: "CACES" })).rejects.toMatchObject({ status: 404 });

    const list = await listCertifications(ctx, now);
    expect(list.map((c) => [c.name, c.status])).toEqual([
      ["Habilitation électrique", "a_renouveler"],
      ["Sauveteur secouriste du travail (SST)", "valide"],
      ["AIPR", "permanente"],
    ]);
    expect(list[0]).toMatchObject({ userId: mate.userId, obtainedOn: "2023-11-01", validUntil: "2026-11-01", note: "B1V BR" });

    expect((await runCertificationReminders(db, now)).sent).toBe(1);
    expect((await runCertificationReminders(db, now)).sent).toBe(0);

    await expect(deleteCertification(mate, list[2].id)).rejects.toMatchObject({ status: 400 });
    await deleteCertification(ctx, soon);
    await expect(deleteCertification(ctx, soon)).rejects.toMatchObject({ status: 404 });
    expect(await listCertifications(ctx, now)).toHaveLength(2);
  });
});
