import { afterEach, describe, expect, it, vi } from "vitest";
import { applyMailEvent, sendMail, setMailProviderForTests } from "@/lib/services/mail";
import { normalizeMailEvent, parseFrom, postmarkProvider, providerFromEnv } from "@/lib/services/mail-providers";
import { freshDb } from "./helpers";

afterEach(() => {
  setMailProviderForTests(null);
  vi.unstubAllGlobals();
});

describe("prestataires d'e-mail", () => {
  it("reste sur la boîte d'envoi locale tant que la configuration est incomplète", () => {
    expect(providerFromEnv({ MAIL_PROVIDER: "brevo", MAIL_API_KEY: "" })).toBeNull();
    expect(providerFromEnv({ MAIL_PROVIDER: "brevo", MAIL_API_KEY: "k", MAIL_FROM: "a@b.fr" })?.name).toBe("brevo");
    expect(providerFromEnv({ MAIL_PROVIDER: "inconnu", MAIL_API_KEY: "k", MAIL_FROM: "a@b.fr" })).toBeNull();
  });

  it("lit l'expéditeur avec ou sans nom", () => {
    expect(parseFrom("Pilot-Makers <devis@exemple.fr>")).toEqual({ name: "Pilot-Makers", email: "devis@exemple.fr" });
    expect(parseFrom("devis@exemple.fr")).toEqual({ name: "", email: "devis@exemple.fr" });
  });

  it("appelle l'API du prestataire et conserve l'identifiant du message", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ErrorCode: 0, MessageID: "pm-42" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    setMailProviderForTests(postmarkProvider("cle", "Devis <devis@exemple.fr>"));
    const db = await freshDb();
    const r = await sendMail(db, { kind: "test", to: "client@exemple.fr", subject: "Sujet", body: "Corps" });
    expect(r.status).toBe("sent");
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe("https://api.postmarkapp.com/email");
    expect(JSON.parse(String(call[1].body))).toMatchObject({ To: "client@exemple.fr", Subject: "Sujet", TextBody: "Corps" });
    const row = (await db.query<{ provider: string; provider_message_id: string }>("SELECT provider, provider_message_id FROM emails WHERE id=$1", [r.id]))[0];
    expect(row).toEqual({ provider: "postmark", provider_message_id: "pm-42" });

    const events = normalizeMailEvent("postmark", { RecordType: "Bounce", MessageID: "pm-42", Description: "Boîte inexistante" });
    expect(await applyMailEvent(db, "postmark", events[0])).toBe(true);
    const after = (await db.query<{ status: string; error: string }>("SELECT status, error FROM emails WHERE id=$1", [r.id]))[0];
    expect(after).toEqual({ status: "bounced", error: "Boîte inexistante" });
  });

  it("enregistre un refus du prestataire comme un échec", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ErrorCode: 300, Message: "Adresse refusée" }), { status: 422 })));
    setMailProviderForTests(postmarkProvider("cle", "devis@exemple.fr"));
    const r = await sendMail(await freshDb(), { kind: "test", to: "x@exemple.fr", subject: "s", body: "b" });
    expect(r).toMatchObject({ status: "failed", error: "Adresse refusée" });
  });

  it("comprend les événements des trois prestataires", () => {
    expect(normalizeMailEvent("brevo", { event: "hard_bounce", "message-id": "b1", reason: "x" })[0].status).toBe("bounced");
    expect(normalizeMailEvent("resend", { type: "email.complained", data: { email_id: "r1" } })[0].status).toBe("complaint");
    expect(normalizeMailEvent("resend", { type: "email.opened", data: { email_id: "r1" } })).toHaveLength(0);
  });
});
