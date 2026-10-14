import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { makeReferralCode, normalizeCode, readReferralSettings, referralState } from "@/lib/referral";
import type { Ctx } from "@/lib/services/context";
import { convertLeadToQuote } from "@/lib/services/leads";
import { customerReferrals, ensureReferralCode, listReferrals, markReferralRewarded, referralOffer, saveReferralSettings } from "@/lib/services/referrals";
import { requestFromShowcase, updateShowcase } from "@/lib/services/showcase";
import { completeProfile, freshDb, makeCustomer, signUp } from "./helpers";

describe("codes et états du parrainage", () => {
  it("crée un code lisible et suit la recommandation", () => {
    expect(makeReferralCode("Hélène Martin-Durand", () => 0.5)).toBe("HELENEMA-HHHH");
    expect(makeReferralCode("", () => 0)).toBe("CLIENT-2222");
    expect(normalizeCode(" martin-7k3f ")).toBe("MARTIN-7K3F");
    expect(referralState({ leadStatus: "devis", quoteStatus: "sent", rewardedAt: null })).toBe("en_cours");
    expect(referralState({ leadStatus: "devis", quoteStatus: "accepted", rewardedAt: null })).toBe("gagne");
    expect(referralState({ leadStatus: "perdue", quoteStatus: null, rewardedAt: null })).toBe("perdu");
    expect(referralState({ leadStatus: "gagnee", quoteStatus: "accepted", rewardedAt: new Date() })).toBe("recompense");
    expect(readReferralSettings(null).enabled).toBe(false);
  });
});

describe("parrainage entre clients", () => {
  let db: Database;
  let ctx: Ctx;
  let parrain: string;
  let code: string;
  const meta = { ip: "203.0.113.20" };

  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "parrainage@exemple.fr");
    await completeProfile(ctx);
    await updateShowcase(ctx, { enabled: "on", slug: "carrelage-parrainage" });
    parrain = await makeCustomer(ctx);
    code = await ensureReferralCode(ctx, parrain);
  });

  it("ne reconnaît le lien que si le programme est actif", async () => {
    expect(await ensureReferralCode(ctx, parrain)).toBe(code);
    expect(await referralOffer(db, "carrelage-parrainage", code)).toBeNull();
    await expect(saveReferralSettings(ctx, { enabled: true, referrerReward: "" })).rejects.toMatchObject({ status: 400 });
    await saveReferralSettings(ctx, { enabled: true, referrerReward: "Un bon d'achat de 50 €", refereeReward: "5 % de remise" });
    expect(await referralOffer(db, "carrelage-parrainage", code.toLowerCase())).toEqual({ code, refereeReward: "5 % de remise" });
    expect(await referralOffer(db, "carrelage-parrainage", "INCONNU-0000")).toBeNull();
  });

  it("suit la demande recommandée jusqu'à la récompense", async () => {
    await requestFromShowcase(
      db,
      "carrelage-parrainage",
      { name: "Paul Lefèvre", phone: "06 11 22 33 44", city: "Bron", description: "Carrelage de la cuisine, 15 m²", consent: "on", parrain: code },
      meta,
    );
    await requestFromShowcase(
      db,
      "carrelage-parrainage",
      { name: "Anne Roux", phone: "06 55 44 33 22", description: "Faïence de la salle d'eau", consent: "on", parrain: "FAUX-0000" },
      meta,
    );
    const leads = await db.query<{ name: string; source: string; referrer_id: string | null }>(
      "SELECT name, source, referrer_id FROM leads WHERE org_id=$1 ORDER BY created_at",
      [ctx.orgId],
    );
    expect(leads).toEqual([
      { name: "Paul Lefèvre", source: "recommandation", referrer_id: parrain },
      { name: "Anne Roux", source: "site", referrer_id: null },
    ]);
    const [ref] = await customerReferrals(ctx, parrain);
    expect(ref).toMatchObject({ name: "Paul Lefèvre", state: "en_cours" });
    await expect(markReferralRewarded(ctx, ref.leadId)).rejects.toMatchObject({ status: 409 });

    const quoteId = await convertLeadToQuote(ctx, ref.leadId);
    // Le devis du filleul est ensuite complété, émis et signé.
    await db.query("UPDATE quotes SET status='accepted' WHERE id=$1", [quoteId]);
    expect(await listReferrals(ctx)).toMatchObject({ total: 1, toReward: 1, won: 1 });
    await markReferralRewarded(ctx, ref.leadId);
    await expect(markReferralRewarded(ctx, ref.leadId)).rejects.toMatchObject({ status: 409 });
    expect((await customerReferrals(ctx, parrain))[0].state).toBe("recompense");

    const other = await signUp(db, "parrainage-autre@exemple.fr", "Autre");
    expect((await listReferrals(other)).total).toBe(0);
    await expect(ensureReferralCode(other, parrain)).rejects.toMatchObject({ status: 404 });
    await expect(markReferralRewarded(other, ref.leadId)).rejects.toMatchObject({ status: 404 });
  });
});
