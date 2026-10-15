import { beforeAll, describe, expect, it } from "vitest";
import { clientMessage, isAway, isPlanned, isUrgent, readiness, returnDate } from "@/lib/away-mode";
import type { Database } from "@/lib/db";
import { awayDigest, awayReadiness, endAway, getAway, saveAway } from "@/lib/services/away-mode";
import type { Ctx } from "@/lib/services/context";
import { parisDate } from "@/lib/services/quotes";
import { publicShowcase, requestFromShowcase, updateShowcase } from "@/lib/services/showcase";
import { completeProfile, freshDb, meta, signUp } from "./helpers";

const shift = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

describe("règles du mode absence", () => {
  it("reconnaît la période, les urgences et le message par défaut", () => {
    const s = { from: "2026-08-01", to: "2026-08-31", message: "", backupName: "", backupPhone: "", backupEmail: "" };
    expect(isAway(s, "2026-08-15")).toBe(true);
    expect(isAway(s, "2026-09-01")).toBe(false);
    expect(isPlanned(s, "2026-07-20")).toBe(true);
    expect(returnDate("2026-08-31")).toBe("2026-09-01");
    expect(clientMessage(s, "Carrelage Martin")).toBe(
      "Carrelage Martin est absente jusqu'au 31 août. Votre demande est bien enregistrée et sera traitée dès le 1 septembre.",
    );
    expect(clientMessage({ ...s, message: "De retour en septembre." }, "X")).toBe("De retour en septembre.");
    expect(isUrgent("Grosse FUITE sous l'évier, dégât des eaux chez le voisin")).toBe(true);
    expect(isUrgent("Plus de chauffage depuis hier")).toBe(true);
    expect(isUrgent("Rénovation de la salle de bain l'an prochain")).toBe(false);
    const items = readiness({
      quoteReminders: true,
      invoiceReminders: false,
      backup: false,
      jobsDuring: 2,
      invoicesDueDuring: 1,
      chequesPending: 0,
      draftQuotes: 0,
    });
    expect(items.filter((i) => !i.ok).map((i) => i.key)).toEqual(["relances-factures", "secours", "chantiers"]);
    expect(items.find((i) => i.key === "chantiers")?.detail).toMatch(/^2 chantiers sont planifiés/);
  });
});

describe("absence de l'entreprise", () => {
  let db: Database;
  let ctx: Ctx;
  const today = parisDate(new Date());

  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "absent@vacances.fr");
    await completeProfile(ctx);
    await updateShowcase(ctx, { enabled: "on", slug: "carrelage-absent" });
  });

  it("valide les réglages", async () => {
    await expect(saveAway(ctx, { from: today, to: shift(today, -1) })).rejects.toThrow(/date de retour/);
    await expect(saveAway(ctx, { from: today, to: shift(today, 120) })).rejects.toThrow(/92 jours/);
    await expect(saveAway(ctx, { from: today, to: shift(today, 20), backupName: "Luc" })).rejects.toThrow(/contact de secours/);
    const worker = { ...ctx, role: "member", jobFunction: "ouvrier" } as Ctx;
    await expect(saveAway(worker, { from: today, to: shift(today, 20) })).rejects.toMatchObject({ status: 403 });
  });

  it("prévient les clients et transmet les urgences au contact de secours", async () => {
    await saveAway(ctx, { from: today, to: shift(today, 20), backupName: "Luc Bernard", backupPhone: "06 10 20 30 40", backupEmail: "luc@secours.fr" });
    expect((await getAway(ctx)).backupName).toBe("Luc Bernard");
    expect((await publicShowcase(db, "carrelage-absent"))?.away?.message).toMatch(/absente jusqu'au/);
    await requestFromShowcase(
      db,
      "carrelage-absent",
      { name: "Anne Roux", email: "anne@exemple.fr", description: "Fuite d'eau sous la douche, ça coule chez le voisin", consent: "on" },
      meta,
    );
    await requestFromShowcase(
      db,
      "carrelage-absent",
      { name: "Paul Lefèvre", email: "paul@exemple.fr", description: "Carrelage de la terrasse au printemps", consent: "on" },
      meta,
    );
    const mails = await db.query<{ to_address: string; kind: string; body: string }>(
      "SELECT to_address, kind, body FROM emails WHERE org_id=$1 ORDER BY created_at",
      [ctx.orgId],
    );
    const toAnne = mails.find((m) => m.to_address === "anne@exemple.fr")!;
    expect(toAnne.body).toMatch(/transmise à Luc Bernard, joignable au 06 10 20 30 40/);
    expect(mails.find((m) => m.to_address === "paul@exemple.fr")!.body).not.toMatch(/Luc/);
    expect(mails.filter((m) => m.kind === "away_urgent").map((m) => m.to_address)).toEqual(["luc@secours.fr"]);
    const digest = await awayDigest(ctx, { from: today, to: shift(today, 20) });
    expect(digest).toMatchObject({ leads: 2, urgent: 1 });
    const ready = await awayReadiness(ctx, { from: today, to: shift(today, 20) });
    expect(ready.find((i) => i.key === "secours")?.ok).toBe(true);
  });

  it("revient à la normale en fin d'absence", async () => {
    await endAway(ctx);
    expect((await publicShowcase(db, "carrelage-absent"))?.away).toBeNull();
    await requestFromShowcase(
      db,
      "carrelage-absent",
      { name: "Marc", email: "marc@exemple.fr", description: "Fuite sur le toit, urgent", consent: "on" },
      meta,
    );
    const n = await db.query("SELECT 1 FROM emails WHERE to_address='marc@exemple.fr' OR (kind='away_urgent' AND body LIKE '%Marc%')");
    expect(n).toHaveLength(0);
  });
});
