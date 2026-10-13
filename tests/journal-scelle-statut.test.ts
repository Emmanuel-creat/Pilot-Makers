import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { addRelease, searchAccounts } from "@/lib/services/admin";
import { audit, type Ctx } from "@/lib/services/context";
import { appendSealed, chainHash, GENESIS, recentSealed, verifySealed } from "@/lib/services/sealed-journal";
import { createIncident, listIncidents, serviceStatus, updateIncident } from "@/lib/services/status";
import { freshDb, signUp } from "./helpers";

let db: Database;
let admin: Ctx;
let user: Ctx;

beforeAll(async () => {
  db = await freshDb();
  user = await signUp(db, "client-statut@exemple.fr");
  const a = await signUp(db, "admin-statut@exemple.fr");
  admin = { ...a, isPlatformAdmin: true, twoFactor: true } as Ctx;
});

describe("journal scellé", () => {
  it("chaîne les actions d'administration, et seulement elles", async () => {
    await searchAccounts(admin, "client");
    await addRelease(admin, "2.0.0", "Nouveautés");
    await audit(db, { orgId: user.orgId, userId: user.userId, action: "quote.issue" });
    const check = await verifySealed(db);
    expect(check).toMatchObject({ ok: true, count: 2 });
    const rows = await recentSealed(db);
    expect(rows.map((r) => r.action)).toEqual(["admin.release", "admin.search"]);
    expect(rows[1].hash).toBe(
      chainHash(GENESIS, 1, (await db.query<{ payload: string }>("SELECT payload FROM admin_journal WHERE seq=1"))[0].payload),
    );
    expect(check.lastHash).toBe(rows[0].hash);
  });

  it("la base refuse toute modification ou suppression", async () => {
    await expect(db.query("UPDATE admin_journal SET payload='{}' WHERE seq=1")).rejects.toThrow(/Journal scellé/);
    await expect(db.query("DELETE FROM admin_journal WHERE seq=2")).rejects.toThrow(/Journal scellé/);
    await expect(db.exec("TRUNCATE admin_journal")).rejects.toThrow(/Journal scellé/);
  });

  it("une altération faite en contournant la base est détectée", async () => {
    await appendSealed(db, { actor: admin.userId, org: null, action: "admin.feature", target: "x", data: { b: 1, a: [2] }, ip: "" });
    expect((await verifySealed(db)).ok).toBe(true);
    await db.exec("ALTER TABLE admin_journal DISABLE TRIGGER admin_journal_guard");
    try {
      await db.query(`UPDATE admin_journal SET payload=replace(payload, '"admin.release"', '"admin.search"') WHERE seq=2`);
      expect(await verifySealed(db)).toMatchObject({ ok: false, brokenAt: 2, reason: "Entrée 2 : contenu modifié" });
      await db.query(`UPDATE admin_journal SET payload=replace(payload, '"admin.search"', '"admin.release"') WHERE seq=2`);
      expect((await verifySealed(db)).ok).toBe(true);
      await db.query("DELETE FROM admin_journal WHERE seq=2");
      expect(await verifySealed(db)).toMatchObject({ ok: false, brokenAt: 2, reason: "Entrée 2 manquante" });
    } finally {
      await db.exec("ALTER TABLE admin_journal ENABLE TRIGGER admin_journal_guard");
    }
  });
});

describe("page de statut", () => {
  const get = async () => db;
  it("opérationnel par défaut, incident publié puis clos", async () => {
    const s = await serviceStatus(get);
    expect(s.overall).toBe("ok");
    expect(s.components.every((c) => c.level === "ok")).toBe(true);

    await expect(createIncident(user, { title: "Lenteurs", severity: "perturbation" })).rejects.toMatchObject({ status: 403 });
    await expect(createIncident(admin, { title: "x", severity: "perturbation" })).rejects.toMatchObject({ status: 400 });
    const id = await createIncident(admin, {
      title: "Envoi des e-mails ralenti",
      body: "Le prestataire signale un retard.",
      severity: "perturbation",
    });
    let st = await serviceStatus(get);
    expect(st).toMatchObject({ overall: "perturbation", label: "Perturbé" });
    expect(st.active[0].title).toBe("Envoi des e-mails ralenti");

    await updateIncident(admin, id, { note: "Retour à la normale en cours." });
    await updateIncident(admin, id, { note: "Résolu.", resolve: true });
    await expect(updateIncident(admin, id, { resolve: true })).rejects.toMatchObject({ status: 400 });
    st = await serviceStatus(get);
    expect(st.overall).toBe("ok");
    expect(st.resolved[0].body).toMatch(/Le prestataire signale un retard\.\n.* : Retour à la normale en cours\.\n.* : Résolu\./);
    expect((await listIncidents(admin)).length).toBe(1);
    // Ouverture et clôture d'incident sont aussi scellées.
    expect((await recentSealed(db, 5)).map((r) => r.action)).toContain("admin.incident_resolve");
  });

  it("une maintenance prévue n'affecte l'état qu'à son début ; base injoignable = indisponible", async () => {
    const now = new Date("2026-10-20T10:00:00Z");
    await createIncident(admin, { title: "Maintenance de la base", severity: "maintenance", startsAt: "2026-10-21T02:00:00Z" });
    expect((await serviceStatus(get, now)).overall).toBe("ok");
    expect((await serviceStatus(get, new Date("2026-10-21T02:30:00Z"))).overall).toBe("maintenance");
    const down = await serviceStatus(async () => {
      throw new Error("connexion refusée");
    });
    expect(down).toMatchObject({ overall: "panne", label: "Indisponible" });
  });

  it("e-mails en échec en nombre : envoi perturbé", async () => {
    for (let i = 0; i < 12; i++) {
      await db.query("INSERT INTO emails (kind, to_address, subject, body, status) VALUES ('notification', 'x@exemple.fr', 's', 'b', $1)", [
        i < 10 ? "failed" : "sent",
      ]);
    }
    const s = await serviceStatus(get, new Date());
    expect(s.components.find((c) => c.name === "Envoi des e-mails")!.level).toBe("panne");
  });
});
