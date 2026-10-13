import { beforeAll, describe, expect, it } from "vitest";
import { mergeDrafts } from "@/lib/draft-merge";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import { heartbeat, leave, presentCount } from "@/lib/services/presence";
import { createQuote, getDraft } from "@/lib/services/quotes";
import { completeProfile, freshDb, signUp } from "./helpers";

type L = { id: string; label: string; q: string };
type S = { id: string; title: string; lines: L[] };
type D = { title: string; paymentTerms: string; sections: S[] };
const F = ["title", "paymentTerms"] as const;
const base: D = {
  title: "Salle de bain",
  paymentTerms: "30 jours",
  sections: [
    {
      id: "s1",
      title: "Sol",
      lines: [
        { id: "a", label: "Carrelage", q: "20" },
        { id: "b", label: "Plinthes", q: "12" },
      ],
    },
    { id: "s2", title: "Murs", lines: [{ id: "c", label: "Faïence", q: "15" }] },
  ],
};
const clone = (d: D): D => JSON.parse(JSON.stringify(d));

describe("fusion de deux brouillons", () => {
  it("reprend ce que chacun a changé dans des zones différentes", () => {
    const local = clone(base);
    local.title = "Salle de bain complète";
    local.sections[0].lines[0].q = "22";
    local.sections[0].lines.push({ id: "d", label: "Seuil", q: "1" });
    const remote = clone(base);
    remote.paymentTerms = "À réception";
    remote.sections[1].lines[0].q = "18";
    remote.sections.push({ id: "s3", title: "Plafond", lines: [] });
    remote.sections[0].lines.splice(1, 0, { id: "e", label: "Ragréage", q: "20" });
    const m = mergeDrafts(base, local, remote, F);
    expect(m.conflicts).toEqual([]);
    expect(m.merged!.title).toBe("Salle de bain complète");
    expect(m.merged!.paymentTerms).toBe("À réception");
    expect(m.merged!.sections.map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
    expect(m.merged!.sections[0].lines.map((l) => `${l.id}:${l.q}`)).toEqual(["a:22", "e:20", "b:12", "d:1"]);
    expect(m.merged!.sections[1].lines[0].q).toBe("18");
  });

  it("garde les suppressions et suit l'ordre de celui qui l'a changé", () => {
    const local = clone(base);
    local.sections.reverse();
    const remote = clone(base);
    remote.sections[0].lines = remote.sections[0].lines.filter((l) => l.id !== "b");
    const m = mergeDrafts(base, local, remote, F);
    expect(m.merged!.sections.map((s) => s.id)).toEqual(["s2", "s1"]);
    expect(m.merged!.sections[1].lines.map((l) => l.id)).toEqual(["a"]);
    // Même changement des deux côtés : pas de conflit.
    const both = clone(base);
    both.title = "X";
    expect(mergeDrafts(base, both, clone(both), F).merged!.title).toBe("X");
  });

  it("signale les zones changées des deux côtés sans rien fusionner", () => {
    const local = clone(base);
    const remote = clone(base);
    local.title = "A";
    remote.title = "B";
    local.sections[0].lines[0].q = "1";
    remote.sections[0].lines[0].q = "2";
    local.sections[1].title = "Murs et faïence";
    remote.sections[1].title = "Murs peints";
    const m = mergeDrafts(base, local, remote, F);
    expect(m.merged).toBeNull();
    expect(m.conflicts).toEqual(["Objet", "Ligne « Carrelage »", "Section « Murs et faïence » : titre"]);
  });

  it("refuse de perdre une modification sur un élément supprimé par l'autre", () => {
    const local = clone(base);
    local.sections[1].lines[0].q = "99";
    const remote = clone(base);
    remote.sections = remote.sections.filter((s) => s.id !== "s2");
    expect(mergeDrafts(base, local, remote, F).conflicts).toEqual(["Section « Murs »"]);
    const local2 = clone(base);
    local2.sections = local2.sections.filter((s) => s.id !== "s2");
    const remote2 = clone(base);
    remote2.sections[1].title = "Murs repris";
    expect(mergeDrafts(base, local2, remote2, F).conflicts).toEqual(["Section « Murs repris »"]);
  });
});

let db: Database;
let boss: Ctx;

beforeAll(async () => {
  db = await freshDb();
  boss = await signUp(db, "chef@exemple.fr");
  await completeProfile(boss);
});

describe("présence dans l'éditeur", () => {
  it("montre les autres personnes de l'entreprise sur le même devis", async () => {
    const id = await createQuote(boss, {});
    const d = await getDraft(boss, id);
    const mate = { ...(await signUp(db, "collegue@exemple.fr")), orgId: boss.orgId } as Ctx;
    await db.query("INSERT INTO memberships (org_id, user_id, role) VALUES ($1,$2,'member') ON CONFLICT DO NOTHING", [boss.orgId, mate.userId]);
    expect((await heartbeat(boss, id, "")).others).toEqual([]);
    const r = await heartbeat(mate, id, d.sections[0].id);
    expect(r.others.map((o) => o.userId)).toEqual([boss.userId]);
    expect(r.draftRevision).toBe(d.draftRevision);
    const seen = await heartbeat(boss, id, "pas-un-identifiant");
    expect(seen.others).toEqual([{ userId: mate.userId, name: expect.any(String), sectionId: d.sections[0].id }]);
    expect(await presentCount(boss, id)).toBe(2);
    await leave(mate, id);
    expect((await heartbeat(boss, id, "")).others).toEqual([]);
    const stranger = await signUp(db, "autre@exemple.fr");
    await expect(heartbeat(stranger, id, "")).rejects.toMatchObject({ status: 404 });
  });
});
