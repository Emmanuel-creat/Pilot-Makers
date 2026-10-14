import { describe, expect, it } from "vitest";
import { makeJoinCode, normalizeJoinCode } from "@/lib/network";
import { createItem } from "@/lib/services/catalog";
import { createNetwork, getNetwork, importNetworkItems, joinNetwork, leaveNetwork, listNetworks, shareItems, unshareItem } from "@/lib/services/networks";
import { completeProfile, freshDb, signUp } from "./helpers";

describe("réseaux d'artisans", () => {
  it("fabrique et lit les codes d'invitation", () => {
    let i = 0;
    expect(makeJoinCode(() => i++)).toBe("ABCD-EFGH");
    expect(normalizeJoinCode(" abcd efgh ")).toBe("ABCD-EFGH");
    expect(normalizeJoinCode("abc")).toBe("");
  });

  it("partage des ouvrages sans les coûts et les ajoute au catalogue d'un autre membre", async () => {
    const db = await freshDb();
    const a = await signUp(db, "reseau-a@exemple.fr");
    await completeProfile(a);
    const b = await signUp(db, "reseau-b@exemple.fr");
    await completeProfile(b);
    const net = await createNetwork(a, { name: "Groupement des carreleurs du Rhône" });
    const code = (await listNetworks(a))[0].join_code;
    await expect(joinNetwork(b, "XXXX-YYYY")).rejects.toMatchObject({ status: 404 });
    await joinNetwork(b, code.toLowerCase());
    await expect(joinNetwork(b, code)).rejects.toMatchObject({ status: 409 });

    const item = await createItem(a, {
      name: "Pose de faïence murale",
      category: "main_oeuvre",
      vat_percent: "10",
      unit: "m²",
      unit_price: "48",
      unit_cost: "20",
    });
    const other = await createItem(a, { name: "Ragréage", category: "main_oeuvre", vat_percent: "10", unit: "m²", unit_price: "18" });
    expect(await shareItems(a, net, [item], true)).toBe(1);
    await shareItems(a, net, [other], false);

    const seen = await getNetwork(b, net);
    expect(seen.members).toHaveLength(2);
    const faience = seen.items.find((i) => i.name === "Pose de faïence murale")!;
    expect(faience).toMatchObject({ priceCents: 4800, mine: false, owned: false });
    expect(seen.items.find((i) => i.name === "Ragréage")?.priceCents).toBeNull();
    const shared = await db.query("SELECT * FROM network_items WHERE network_id=$1", [net]);
    expect(Object.keys(shared[0])).not.toContain("unit_cost4");

    expect(
      await importNetworkItems(
        b,
        net,
        seen.items.map((i) => i.id),
      ),
    ).toEqual({ added: 2, skipped: 0 });
    expect(await importNetworkItems(b, net, [faience.id])).toEqual({ added: 0, skipped: 1 });
    const mine = await db.query<{ name: string; unit_price4: string; unit_cost4: string | null; source: string }>(
      "SELECT name, unit_price4, unit_cost4, source FROM catalog_items WHERE org_id=$1 AND source='network' ORDER BY name",
      [b.orgId],
    );
    expect(mine.map((m) => [m.name, Number(m.unit_price4), m.unit_cost4])).toEqual([
      ["Pose de faïence murale", 480000, null],
      ["Ragréage", 0, null],
    ]);

    await expect(unshareItem(b, net, faience.id)).rejects.toMatchObject({ status: 403 });
    await unshareItem(a, net, faience.id);
    await leaveNetwork(a, net);
    const after = await getNetwork(b, net);
    expect(after.items).toEqual([]);
    expect(after.animator).toBe(true);
    await leaveNetwork(b, net);
    expect((await db.query("SELECT 1 FROM networks WHERE id=$1", [net])).length).toBe(0);
  });
});
