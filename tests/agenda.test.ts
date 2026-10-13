import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { buildCalendar, createFeed, deleteFeed, feedCalendar, foldLine, getFeed, icsEscape } from "@/lib/services/calendar";
import type { Ctx } from "@/lib/services/context";
import { createJobFromQuote } from "@/lib/services/jobs";
import { addVehicle, assign } from "@/lib/services/planning";
import { createQuote, getDraft, issueQuote, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { acceptInvite, inviteMember, removeMember } from "@/lib/services/team";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

let db: Database;
let boss: Ctx;
let worker: Ctx;
let jobId: string;
const META = { ip: "203.0.113.9", userAgent: "Agenda" };
const NOW = new Date("2026-10-13T08:00:00Z");

beforeAll(async () => {
  db = await freshDb();
  boss = await signUp(db, "agenda@exemple.fr");
  await completeProfile(boss);
  const { token: invite } = await inviteMember(boss, { email: "chef@exemple.fr", role: "member" });
  const w = await signUp(db, "chef@exemple.fr", "Perso");
  await acceptInvite(w, invite);
  worker = { ...w, orgId: boss.orgId, role: "member" };
  const qid = await createQuote(boss, { customerId: await makeCustomer(boss) });
  const d = await getDraft(boss, qid);
  await saveDraft(
    boss,
    qid,
    {
      ...d,
      title: "Salle d'eau, étage",
      site: { line1: "12 rue Victor Hugo", line2: "", postalCode: "69002", city: "Lyon" },
      sections: [{ ...d.sections[0], lines: [line()] }],
    },
    d.draftRevision,
  );
  await issueQuote(boss, qid);
  await recordResponseManually(boss, qid, { decision: "accept", version: 1, proof: "Bon pour accord signé" });
  jobId = await createJobFromQuote(boss, qid);
  await db.query("UPDATE jobs SET access_notes=$2 WHERE id=$1", [jobId, "Digicode au portail; clé chez la voisine"]);
  await assign(boss, { jobId, resourceType: "user", resourceId: worker.userId, start: "2026-10-19", end: "2026-10-21" });
  const vehicle = await addVehicle(boss, { name: "Fourgon 1" });
  await assign(boss, { jobId, resourceType: "vehicle", resourceId: vehicle, start: "2026-10-19", end: "2026-10-19" });
});

describe("format iCalendar", () => {
  it("échappe les caractères spéciaux et plie les longues lignes", () => {
    expect(icsEscape("a;b,c\\d\ne")).toBe("a\\;b\\,c\\\\d\\ne");
    const long = "SUMMARY:" + "é".repeat(60);
    const folded = foldLine(long);
    for (const part of folded.split("\r\n")) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    expect(
      folded
        .split("\r\n")
        .map((p, i) => (i ? p.slice(1) : p))
        .join(""),
    ).toBe(long);
    const ics = buildCalendar("Essai", [{ uid: "x", start: "2026-10-30", end: "2026-10-31", summary: "Fin de mois" }], NOW);
    expect(ics).toContain("DTSTART;VALUE=DATE:20261030\r\nDTEND;VALUE=DATE:20261101\r\n");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});

describe("abonnement d'agenda", () => {
  it("le membre voit ses chantiers seulement, même s'il demande toute l'entreprise", async () => {
    const { token: t } = await createFeed(worker, "entreprise");
    expect((await getFeed(worker))?.scope).toBe("moi");
    const ics = (await feedCalendar(db, t, META, "https://app.exemple.fr", NOW)).replace(/\r\n /g, "");
    expect(ics).toContain("SUMMARY:Chantier : Salle d'eau\\, étage");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261019");
    expect(ics).toContain("DTEND;VALUE=DATE:20261022");
    expect(ics).toContain("LOCATION:12 rue Victor Hugo\\, 69002 Lyon");
    expect(ics).toContain(`URL:https://app.exemple.fr/app/chantiers/${jobId}`);
    expect(ics).toContain("DESCRIPTION:Client : ");
    expect(ics).toContain("Accès : Digicode au portail\\; clé chez la voisine");
    expect(ics).not.toContain("Fourgon 1");
    expect((await getFeed(worker))?.last_used_at).not.toBeNull();
  });

  it("l'encadrement voit toutes les affectations et les échéances", async () => {
    const { token: t } = await createFeed(boss, "entreprise");
    const ics = await feedCalendar(db, `${t}.ics`, META, "", NOW);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2 + (ics.match(/CATEGORIES:Devis|CATEGORIES:Facture/g)?.length ?? 0));
    expect(ics).toContain("(Fourgon 1)");
    expect(ics).toMatch(/X-WR-CALNAME:[^\r]+\r\n/);
  });

  it("remplacer ou supprimer le lien coupe l'ancien ; un membre parti perd l'accès", async () => {
    const { token: first } = await createFeed(boss, "moi");
    const { token: second } = await createFeed(boss, "moi");
    await expect(feedCalendar(db, first, META, "", NOW)).rejects.toMatchObject({ status: 404 });
    await feedCalendar(db, second, META, "", NOW);
    await deleteFeed(boss);
    await expect(feedCalendar(db, second, META, "", NOW)).rejects.toMatchObject({ status: 404 });
    await expect(feedCalendar(db, "../../etc", META, "", NOW)).rejects.toMatchObject({ status: 404 });

    const { token: w } = await createFeed(worker, "moi");
    await removeMember(boss, worker.userId);
    await expect(feedCalendar(db, w, META, "", NOW)).rejects.toMatchObject({ status: 404 });
  });
});
