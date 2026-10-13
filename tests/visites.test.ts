import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import { buildCalendar, calendarEvents } from "@/lib/services/calendar";
import { publicShowcase, updateShowcase } from "@/lib/services/showcase";
import { bookVisit, cancelVisit, getVisitSettings, publicVisitSlots, saveVisitSettings, upcomingVisits } from "@/lib/services/visits";
import { availableSlots, parisToUtc, readVisitSettings, slotLabel, type VisitSettings } from "@/lib/visits";
import { completeProfile, freshDb, signUp } from "./helpers";

const settings = (o: Partial<VisitSettings> = {}): VisitSettings => ({
  enabled: true,
  hours: { tu: [["17:00", "19:00"]] },
  durationMin: 60,
  noticeHours: 24,
  horizonDays: 14,
  ...o,
});
// Mardi 13 octobre 2026, 10 h à Paris
const NOW = new Date("2026-10-13T08:00:00Z");

describe("créneaux de visite", () => {
  it("convertit l'heure de Paris, été comme hiver", () => {
    expect(parisToUtc("2026-07-01", "17:00").toISOString()).toBe("2026-07-01T15:00:00.000Z");
    expect(parisToUtc("2026-12-01", "17:00").toISOString()).toBe("2026-12-01T16:00:00.000Z");
    expect(parisToUtc("2026-10-25", "09:00").toISOString()).toBe("2026-10-25T08:00:00.000Z");
  });

  it("découpe les plages selon la durée et respecte le délai de prévenance", () => {
    const slots = availableSlots(settings(), new Date("2026-10-12T08:00:00Z"), []);
    expect(slots.slice(0, 3).map((s) => `${s.day} ${s.time}`)).toEqual(["2026-10-13 17:00", "2026-10-13 18:00", "2026-10-20 17:00"]);
    // 24 h de prévenance : les créneaux du jour même (dans 7 h) sont exclus
    expect(availableSlots(settings(), NOW, [])[0].day).toBe("2026-10-20");
    expect(availableSlots(settings({ durationMin: 90 }), NOW, []).filter((s) => s.day === "2026-10-20")).toHaveLength(1);
  });

  it("écarte les créneaux pris et les jours bloqués", () => {
    const taken = [{ start: new Date("2026-10-20T15:30:00Z"), end: new Date("2026-10-20T16:30:00Z") }];
    const slots = availableSlots(settings({ noticeHours: 48 }), NOW, taken, new Set(["2026-10-27"]));
    expect(slots.filter((s) => s.day === "2026-10-20")).toHaveLength(0);
    expect(slots.some((s) => s.day === "2026-10-27")).toBe(false);
  });

  it("lit des réglages abîmés sans erreur", () => {
    expect(readVisitSettings({ durationMin: 7, noticeHours: "x", hours: { tu: [["9", "x"]] } })).toMatchObject({
      enabled: false,
      durationMin: 60,
      noticeHours: 48,
    });
    expect(slotLabel(new Date("2026-10-20T15:00:00Z"))).toBe("mardi 20 octobre à 17:00");
  });
});

describe("réservation depuis la vitrine", () => {
  let db: Database;
  let ctx: Ctx;
  const booking = (start: string, o: Record<string, unknown> = {}) => ({
    start,
    name: "Claire Petit",
    phone: "06 12 34 56 78",
    email: "claire@exemple.fr",
    address: "12 rue des Lilas",
    city: "Lyon",
    description: "Rénovation complète de la salle de bains.",
    consent: true,
    ...o,
  });

  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "visites@exemple.fr");
    await completeProfile(ctx);
  });

  it("demande d'abord une vitrine, puis au moins une plage", async () => {
    await expect(saveVisitSettings(ctx, { enabled: "on", durationMin: "60", noticeHours: "24", visit_tu: "17h-19h" })).rejects.toMatchObject({ status: 400 });
    await updateShowcase(ctx, { enabled: "on", slug: "visites-lyon" });
    await expect(saveVisitSettings(ctx, { enabled: "on", durationMin: "60", noticeHours: "24" })).rejects.toMatchObject({ status: 400 });
    await expect(saveVisitSettings(ctx, { enabled: "on", durationMin: "61", noticeHours: "24", visit_tu: "17h-19h" })).rejects.toMatchObject({ status: 400 });
    expect(await publicVisitSlots(db, "visites-lyon", NOW)).toBeNull();
    await saveVisitSettings(ctx, { enabled: "on", durationMin: "60", noticeHours: "48", visit_tu: "17h-19h" });
    expect(await getVisitSettings(ctx)).toMatchObject({ enabled: true, hours: { tu: [["17:00", "19:00"]] } });
  });

  it("réserve un créneau, crée la demande et prévient l'entreprise", async () => {
    const pub = await publicVisitSlots(db, "visites-lyon", NOW);
    expect(pub!.slots[0]).toMatchObject({ day: "2026-10-20", time: "17:00" });
    const r = await bookVisit(db, "visites-lyon", booking(pub!.slots[0].start), { ip: "203.0.113.5" }, NOW);
    expect(r.label).toBe("mardi 20 octobre à 17:00");
    const lead = await db.query<{ status: string; next_action: string; next_action_on: unknown }>(
      "SELECT status, next_action, next_action_on FROM leads WHERE org_id=$1",
      [ctx.orgId],
    );
    expect(lead[0]).toMatchObject({ status: "visite", next_action: "Visite le mardi 20 octobre à 17:00" });
    const mails = await db.query<{ kind: string; to_address: string }>(
      "SELECT kind, to_address FROM emails WHERE org_id=$1 AND kind<>'verify_email' ORDER BY kind",
      [ctx.orgId],
    );
    expect(mails.map((m) => m.kind)).toEqual(["notification", "visit_confirmation"]);
    // Le créneau disparaît et ne peut plus être pris
    const after = await publicVisitSlots(db, "visites-lyon", NOW);
    expect(after!.slots[0].time).toBe("18:00");
    await expect(bookVisit(db, "visites-lyon", booking(pub!.slots[0].start), { ip: "203.0.113.6" }, NOW)).rejects.toMatchObject({ status: 409 });
  });

  it("refuse les réservations incomplètes ou hors créneau", async () => {
    const pub = await publicVisitSlots(db, "visites-lyon", NOW);
    await expect(bookVisit(db, "visites-lyon", booking(pub!.slots[0].start, { phone: "" }), { ip: "203.0.113.7" }, NOW)).rejects.toMatchObject({ status: 400 });
    await expect(bookVisit(db, "visites-lyon", booking(pub!.slots[0].start, { consent: false }), { ip: "203.0.113.7" }, NOW)).rejects.toMatchObject({
      status: 400,
    });
    await expect(bookVisit(db, "visites-lyon", booking("2026-10-21T15:00:00.000Z"), { ip: "203.0.113.7" }, NOW)).rejects.toMatchObject({ status: 409 });
    await expect(bookVisit(db, "inconnue", booking(pub!.slots[0].start), { ip: "203.0.113.7" }, NOW)).rejects.toMatchObject({ status: 404 });
  });

  it("bloque les jours d'absence du dirigeant", async () => {
    await db.query("INSERT INTO member_absences (org_id, user_id, kind, start_date, end_date) VALUES ($1,$2,'conges','2026-10-27','2026-10-28')", [
      ctx.orgId,
      ctx.userId,
    ]);
    const pub = await publicVisitSlots(db, "visites-lyon", NOW);
    expect(pub!.slots.some((s) => s.day === "2026-10-27")).toBe(false);
    expect(pub!.slots.some((s) => s.day === "2026-11-03")).toBe(true);
  });

  it("ajoute la visite à l'agenda synchronisé, à l'heure près, et l'annonce sur la vitrine", async () => {
    expect((await publicShowcase(db, "visites-lyon"))!.visits).toBe(true);
    const events = await calendarEvents(ctx, "entreprise", "", NOW);
    const v = events.find((e) => e.category === "Visite");
    expect(v).toMatchObject({ summary: "Visite : Claire Petit", location: "12 rue des Lilas, Lyon" });
    const ics = buildCalendar("Agenda", [v!], NOW);
    expect(ics).toContain("DTSTART:20261020T150000Z");
    expect(ics).toContain("DTEND:20261020T160000Z");
  });

  it("liste puis annule une visite, qui libère le créneau", async () => {
    const list = await upcomingVisits(ctx, NOW);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: "Claire Petit", address: "12 rue des Lilas" });
    await cancelVisit(ctx, list[0].id);
    expect(await upcomingVisits(ctx, NOW)).toHaveLength(0);
    const lead = await db.query<{ status: string }>("SELECT status FROM leads WHERE org_id=$1", [ctx.orgId]);
    expect(lead[0].status).toBe("contactee");
    expect((await publicVisitSlots(db, "visites-lyon", NOW))!.slots[0].time).toBe("17:00");
    await expect(cancelVisit(ctx, list[0].id)).rejects.toMatchObject({ status: 404 });
  });
});
