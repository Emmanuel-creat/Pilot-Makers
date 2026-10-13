import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { followUpText, withFollowUp } from "@/lib/reminder-text";
import { DEFAULT_REMINDERS } from "@/lib/services/accounts";
import type { Ctx } from "@/lib/services/context";
import { createQuote, getDraft, issueQuote, recordClientView, saveDraft, sendQuote } from "@/lib/services/quotes";
import { readSettings, runReminders } from "@/lib/services/reminders";
import { completeProfile, freshDb, line, makeCustomer, meta, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;

const base = { viewed: false, customerType: "particulier", reminder: 1, maxReminders: 3, daysLeft: 20, validUntil: "2026-11-30", hasChoices: false };

describe("phrase de relance adaptée", () => {
  it("selon l'ouverture, le client, les choix, l'échéance et le rang", () => {
    expect(followUpText(base)).toMatch(/^Le devis n'a pas encore été ouvert/);
    expect(followUpText({ ...base, reminder: 2 })).toMatch(/^Le devis n'a toujours pas été ouvert/);
    expect(followUpText({ ...base, viewed: true })).toMatch(/je peux passer vous en parler\.$/);
    expect(followUpText({ ...base, viewed: true, customerType: "entreprise" })).toMatch(/pour votre opération/);
    expect(followUpText({ ...base, viewed: true, hasChoices: true })).toMatch(/choisir parmi les options/);
    expect(followUpText({ ...base, daysLeft: 5 })).toContain("Il reste valable jusqu'au 30/11/2026");
    expect(followUpText({ ...base, daysLeft: -1 })).not.toContain("valable");
    expect(followUpText({ ...base, reminder: 3 })).toContain("C'est mon dernier message");
    expect(followUpText({ ...base, reminder: 1, maxReminders: 1 })).not.toContain("dernier message");
  });

  it("s'insère avant la formule finale d'un modèle personnalisé", () => {
    expect(withFollowUp("Bonjour,\n\nVoici le lien.\n\nCordialement", "Suivi.")).toBe("Bonjour,\n\nVoici le lien.\n\nSuivi.\n\nCordialement");
    expect(withFollowUp("Bonjour, voici le lien.", "Suivi.")).toBe("Bonjour, voici le lien.\n\nSuivi.");
    expect(withFollowUp("Texte", "")).toBe("Texte");
  });
});

describe("relances automatiques des devis", () => {
  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "relances-devis@exemple.fr");
    await completeProfile(ctx);
  });

  it("change de texte une fois le devis ouvert", async () => {
    const id = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
    const d = await getDraft(ctx, id);
    await saveDraft(
      ctx,
      id,
      {
        ...d,
        title: "Peinture du séjour",
        site: { line1: "2 rue du Port", line2: "", postalCode: "13002", city: "Marseille" },
        sections: [{ ...d.sections[0], lines: [line()] }],
      },
      d.draftRevision,
    );
    await issueQuote(ctx, id);
    const sent = await sendQuote(ctx, id, { to: "claire@exemple.fr", subject: "Devis", body: "{lien}" });
    expect(readSettings({}).adaptive).toBe(true);
    await db.query("UPDATE organizations SET reminder_settings=$2 WHERE id=$1", [
      ctx.orgId,
      JSON.stringify({
        ...DEFAULT_REMINDERS,
        enabled: true,
        firstDelayDays: 1,
        intervalDays: 1,
        maxReminders: 2,
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        hourFrom: 0,
        hourTo: 24,
      }),
    ]);
    const bodies = async () =>
      (await db.query<{ body: string }>("SELECT body FROM emails WHERE quote_id=$1 AND kind='reminder' ORDER BY created_at", [id])).map((r) => r.body);

    const day = (n: number) => new Date(Date.now() + n * 86_400_000);
    await runReminders(db, day(2));
    const [first] = await bodies();
    expect(first).toContain("Le devis n'a pas encore été ouvert");
    expect(first).not.toContain("{suivi}");
    expect(first).not.toMatch(/\n{3,}/);

    await recordClientView(db, sent.link!.split("/d/")[1], meta);
    await runReminders(db, day(4));
    const second = (await bodies())[1];
    expect(second).toContain("Vous avez consulté le devis");
    expect(second).toContain("C'est mon dernier message");

    // Sans adaptation, le modèle reste tel quel.
    await db.query('UPDATE organizations SET reminder_settings = reminder_settings || \'{"adaptive": false, "maxReminders": 3}\'::jsonb WHERE id=$1', [
      ctx.orgId,
    ]);
    await runReminders(db, day(6));
    const third = (await bodies())[2];
    expect(third).not.toContain("consulté");
    expect(third).not.toMatch(/\n{3,}/);
  });
});
