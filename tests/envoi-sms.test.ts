import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { one } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import { createQuote, getDraft, getShareLink, issueQuote, markSharedByMessage, saveDraft } from "@/lib/services/quotes";
import { internationalNumber, isMobile, shareMessage, smsHref, whatsappHref } from "@/lib/share-message";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

describe("message d'envoi du lien", () => {
  it("prépare un message court avec le montant, la date limite et le lien", () => {
    const m = shareMessage({
      orgName: "Martin Carrelage",
      number: "D-2026-0007",
      title: "Salle de bain",
      totalTtcCents: 99000,
      validUntil: "2026-11-12",
      url: "https://exemple.fr/d/abc",
      greetingName: "Claire",
    });
    expect(m).toBe(
      "Bonjour Claire,\nvoici le devis D-2026-0007 (Salle de bain) de Martin Carrelage : 990,00 € TTC.\nConsultez-le et répondez en ligne jusqu'au 12/11/2026 :\nhttps://exemple.fr/d/abc",
    );
    expect(shareMessage({ orgName: "A", number: "D-1", title: "", totalTtcCents: 100, validUntil: "", url: "u", greetingName: " " })).toBe(
      "Bonjour,\nvoici le devis D-1 de A : 1,00 € TTC.\nConsultez-le et répondez en ligne :\nu",
    );
  });

  it("reconnaît les numéros et prépare les liens Messages et WhatsApp", () => {
    expect(internationalNumber("06 12 34 56 78")).toBe("33612345678");
    expect(internationalNumber("+33 6 12 34 56 78")).toBe("33612345678");
    expect(internationalNumber("0032 470 12 34 56")).toBe("32470123456");
    expect(internationalNumber("12")).toBe("");
    expect(isMobile("07.12.34.56.78")).toBe(true);
    expect(isMobile("04 72 00 00 00")).toBe(false);
    expect(isMobile("+32 470 12 34 56")).toBe(true);
    expect(isMobile("")).toBe(false);
    expect(smsHref("06 12 34 56 78", "a b&c")).toBe("sms:+33612345678?&body=a%20b%26c");
    expect(smsHref("", "x")).toBe("sms:?&body=x");
    expect(whatsappHref("06 12 34 56 78", "salut")).toBe("https://wa.me/33612345678?text=salut");
  });
});

let db: Database;
let ctx: Ctx;

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "sms@exemple.fr");
  await completeProfile(ctx);
});

describe("lien transmis par SMS ou messagerie", () => {
  it("passe le devis prêt à « Envoyé » et garde la trace du canal", async () => {
    const id = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
    await expect(markSharedByMessage(ctx, id, "sms")).rejects.toMatchObject({ status: 409 });
    const d = await getDraft(ctx, id);
    await saveDraft(
      ctx,
      id,
      {
        ...d,
        title: "Peinture",
        site: { line1: "4 place Bellecour", line2: "", postalCode: "69002", city: "Lyon" },
        paymentTerms: "Solde à réception.",
        sections: [{ id: d.sections[0].id, title: "", description: "", lines: [line()] }],
      },
      d.draftRevision,
    );
    await issueQuote(ctx, id);
    await getShareLink(ctx, id);
    await expect(markSharedByMessage(ctx, id, "pigeon")).rejects.toMatchObject({ status: 400 });
    await markSharedByMessage(ctx, id, "whatsapp");
    const q = await one<{ status: string; sent_at: Date | null }>(db, "SELECT status, sent_at FROM quotes WHERE id=$1", [id]);
    expect(q).toMatchObject({ status: "sent" });
    expect(q!.sent_at).toBeInstanceOf(Date);
    const ev = await one<{ data: { channel: string } }>(db, "SELECT data FROM document_events WHERE quote_id=$1 AND type='link.shared'", [id]);
    expect(ev!.data.channel).toBe("whatsapp");
  });
});
