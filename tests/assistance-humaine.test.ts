import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import {
  callbackDays,
  cancelCallback,
  cancelSession,
  closeCallback,
  createSession,
  listCallbacks,
  myCallbacks,
  normalizePhone,
  parisToUtc,
  registerToSession,
  requestCallback,
  sessionCalendar,
  sessionInvite,
  supportPhone,
  unregisterFromSession,
  upcomingSessions,
} from "@/lib/services/support-desk";
import { completeProfile, freshDb, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;
let other: Ctx;
let admin: Ctx;

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "rappel@exemple.fr");
  await completeProfile(ctx);
  other = await signUp(db, "seance@exemple.fr");
  await completeProfile(other);
  admin = { ...ctx, isPlatformAdmin: true, twoFactor: true } as Ctx;
});

const local = (d: Date) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Paris",
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
};

describe("assistance humaine", () => {
  it("numéros, jours ouvrés et heure de Paris", () => {
    expect(normalizePhone("+33 6 12 34 56 78")).toBe("06 12 34 56 78");
    expect(normalizePhone("0033 1.23.45.67.89")).toBe("01 23 45 67 89");
    expect(normalizePhone("12345")).toBeNull();
    expect(supportPhone({ SUPPORT_PHONE: "0412345678" })).toBe("04 12 34 56 78");
    expect(supportPhone({})).toBeNull();
    // Vendredi 16 octobre 2026 à 17 h, heure de Paris : on part du lundi.
    const days = callbackDays(new Date("2026-10-16T15:00:00Z"));
    expect(days[0]).toBe("2026-10-19");
    expect(days).toHaveLength(10);
    expect(days.every((d) => ![0, 6].includes(new Date(d + "T12:00:00Z").getUTCDay()))).toBe(true);
    expect(callbackDays(new Date("2026-10-14T07:00:00Z"))[0]).toBe("2026-10-14");
    expect(parisToUtc("2026-07-01T18:00")?.toISOString()).toBe("2026-07-01T16:00:00.000Z");
    expect(parisToUtc("2026-12-01T18:00")?.toISOString()).toBe("2026-12-01T17:00:00.000Z");
    expect(parisToUtc("demain")).toBeNull();
  });

  it("rappel demandé, unique, annulé puis traité par l'équipe", async () => {
    const now = new Date("2026-10-14T07:00:00Z");
    const date = callbackDays(now)[1];
    await expect(requestCallback(ctx, { phone: "abc", date, slot: "matin", topic: "" }, now)).rejects.toMatchObject({ status: 400 });
    await expect(requestCallback(ctx, { phone: "0612345678", date: "2026-10-18", slot: "matin", topic: "" }, now)).rejects.toMatchObject({ status: 400 });
    await expect(requestCallback(ctx, { phone: "0612345678", date, slot: "soir", topic: "" }, now)).rejects.toMatchObject({ status: 400 });
    await expect(
      requestCallback(ctx, { phone: "0612345678", date: "2026-10-14", slot: "matin", topic: "" }, new Date("2026-10-14T10:00:00Z")),
    ).rejects.toMatchObject({ status: 400 });
    const id = await requestCallback(ctx, { phone: "06 12 34 56 78", date, slot: "apres_midi", topic: "Factures d'acompte" }, now);
    await expect(requestCallback(ctx, { phone: "0612345678", date, slot: "matin", topic: "" }, now)).rejects.toMatchObject({ status: 400 });
    expect((await myCallbacks(ctx))[0]).toMatchObject({ status: "demande", wished_on: date, slot: "apres_midi" });
    await cancelCallback(ctx, id);
    await expect(cancelCallback(ctx, id)).rejects.toMatchObject({ status: 404 });
    const id2 = await requestCallback(ctx, { phone: "0612345678", date, slot: "matin", topic: "" }, now);
    await expect(listCallbacks(ctx)).rejects.toMatchObject({ status: 403 });
    const list = await listCallbacks(admin);
    expect(list[0]).toMatchObject({ id: id2, status: "demande", user_email: "rappel@exemple.fr" });
    await expect(closeCallback(admin, id2, "demande", "")).rejects.toMatchObject({ status: 400 });
    await closeCallback(admin, id2, "fait", "Paramétrage des acomptes expliqué");
    expect((await myCallbacks(ctx))[0]).toMatchObject({ status: "fait", outcome: "Paramétrage des acomptes expliqué" });
  });

  it("séance : places limitées, inscription par e-mail, invitation d'agenda, annulation", async () => {
    await expect(
      createSession(ctx, { startsAt: "2030-01-01T10:00", duration: "45", title: "Premiers pas", description: "", capacity: "1", url: "" }),
    ).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      createSession(admin, { startsAt: "2020-01-01T10:00", duration: "45", title: "Premiers pas", description: "", capacity: "1", url: "" }),
    ).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      createSession(admin, {
        startsAt: local(new Date(Date.now() + 86_400_000)),
        duration: "45",
        title: "Premiers pas",
        description: "",
        capacity: "1",
        url: "http://x",
      }),
    ).rejects.toMatchObject({ status: 400 });
    const id = await createSession(admin, {
      startsAt: local(new Date(Date.now() + 2 * 86_400_000)),
      duration: "45",
      title: "Premiers pas",
      description: "Du devis à la facture",
      capacity: "1",
      url: "https://visio.exemple.fr/salle",
    });
    await registerToSession(ctx, id);
    await expect(registerToSession(ctx, id)).rejects.toMatchObject({ status: 400 });
    await expect(registerToSession(other, id)).rejects.toMatchObject({ status: 400 });
    const mine = (await upcomingSessions(ctx)).find((x) => x.id === id);
    expect(mine).toMatchObject({ registered: 1, mine: true });
    const mail = await db.query<{ subject: string; body: string }>("SELECT subject, body FROM emails WHERE kind='onboarding_registered' AND to_address=$1", [
      "rappel@exemple.fr",
    ]);
    expect(mail[0].body).toContain("https://visio.exemple.fr/salle");
    const ics = await sessionCalendar(ctx, id);
    expect(ics).toContain("SUMMARY:Pilot-Makers : Premiers pas");
    expect(ics).toMatch(/DTSTART:\d{8}T\d{6}Z/);
    await expect(sessionCalendar(other, id)).rejects.toMatchObject({ status: 404 });
    await unregisterFromSession(ctx, id);
    await registerToSession(other, id);
    await cancelSession(admin, id);
    expect((await upcomingSessions(other)).some((x) => x.id === id)).toBe(false);
    expect((await upcomingSessions(admin, { all: true })).find((x) => x.id === id)?.canceled_at).toBeTruthy();
    const canceled = await db.query("SELECT 1 FROM emails WHERE kind='onboarding_canceled' AND to_address='seance@exemple.fr'");
    expect(canceled).toHaveLength(1);
    await expect(registerToSession(ctx, id)).rejects.toMatchObject({ status: 404 });
  });

  it("invitation d'agenda sans lien de visioconférence", () => {
    const ics = sessionInvite({ id: "x", starts_at: new Date("2026-11-03T17:00:00Z"), duration_min: 60, title: "Facturer", description: "", meeting_url: "" });
    expect(ics).toContain("DTSTART:20261103T170000Z");
    expect(ics).toContain("DTEND:20261103T180000Z");
    expect(ics).not.toContain("LOCATION");
  });
});
