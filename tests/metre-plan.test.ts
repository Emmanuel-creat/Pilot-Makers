import { describe, expect, it } from "vitest";
import { createQuote, getDraft } from "@/lib/services/quotes";
import { addTakeoffLines, createTakeoff, deleteTakeoff, getTakeoff, listTakeoffs, saveTakeoff, takeoffImage } from "@/lib/services/takeoffs";
import { pathLength, polygonArea, quantity, scaleFrom, takeoffSchema, type Measurement } from "@/lib/takeoff";
import { completeProfile, freshDb, makeCustomer, signUp } from "./helpers";
import { grayPng } from "./png";

const m = (p: Partial<Measurement>): Measurement => ({ id: "1", kind: "longueur", label: "", points: [], ...p });

describe("métré sur plan", () => {
  it("calcule longueurs, aires et échelle", () => {
    expect(
      pathLength([
        { x: 0, y: 0 },
        { x: 3, y: 4 },
        { x: 3, y: 10 },
      ]),
    ).toBe(11);
    expect(
      polygonArea([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 5 },
        { x: 0, y: 5 },
      ]),
    ).toBe(50);
    expect(scaleFrom({ x: 0, y: 0 }, { x: 200, y: 0 }, 4)).toBe(50);
    expect(scaleFrom({ x: 0, y: 0 }, { x: 0, y: 0 }, 4)).toBeNull();
  });

  it("convertit les relevés en quantités", () => {
    const room = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 150 },
      { x: 0, y: 150 },
    ];
    // 50 px par mètre : pièce de 4 m sur 3 m.
    expect(quantity(m({ kind: "surface", points: room }), 50)).toBe(12);
    expect(quantity(m({ kind: "surface", points: room, deduct: 1.5 }), 50)).toBe(10.5);
    expect(quantity(m({ kind: "longueur", points: room }), 50)).toBe(11);
    expect(quantity(m({ kind: "mur", points: [...room, room[0]], height: 2.5, deduct: 2 }), 50)).toBe(33);
    expect(quantity(m({ kind: "mur", points: room }), 50)).toBeNull();
    expect(quantity(m({ kind: "nombre", points: room }), null)).toBe(4);
    expect(quantity(m({ kind: "surface", points: room }), null)).toBeNull();
    expect(quantity(m({ kind: "surface", points: room.slice(0, 2) }), 50)).toBeNull();
  });

  it("valide les relevés enregistrés", () => {
    expect(takeoffSchema.safeParse({ pxPerM: 50, measurements: [{ id: "a", kind: "surface", label: "Séjour", points: [{ x: 1, y: 2 }] }] }).success).toBe(true);
    expect(takeoffSchema.safeParse({ pxPerM: -1, measurements: [] }).success).toBe(false);
    expect(takeoffSchema.safeParse({ pxPerM: null, measurements: [{ id: "a", kind: "volume", points: [] }] }).success).toBe(false);
  });
});

describe("métrés d'un devis", () => {
  it("importe un plan, enregistre les relevés et ajoute les lignes au devis", async () => {
    const db = await freshDb();
    const ctx = await signUp(db, "metre@exemple.fr");
    await completeProfile(ctx);
    const quoteId = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
    await expect(createTakeoff(ctx, quoteId, "Plan", new TextEncoder().encode("%PDF-1.4"))).rejects.toMatchObject({ status: 400 });
    const id = await createTakeoff(ctx, quoteId, "Rez-de-chaussée", grayPng(40, 30));
    expect((await takeoffImage(ctx, id)).type).toBe("image/png");
    const room = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 150 },
      { x: 0, y: 150 },
    ];
    await expect(saveTakeoff(ctx, id, { pxPerM: 50, measurements: [{ id: "x", kind: "volume", points: [] }] })).rejects.toMatchObject({ status: 400 });
    await saveTakeoff(ctx, id, {
      pxPerM: 50,
      measurements: [
        { id: "a", kind: "surface", label: "Carrelage séjour", points: room },
        { id: "b", kind: "nombre", label: "Prises", points: room.slice(0, 3) },
        { id: "c", kind: "mur", label: "Peinture", points: room },
      ],
    });
    expect((await getTakeoff(ctx, id)).measurements).toHaveLength(3);
    expect((await listTakeoffs(ctx, quoteId))[0]).toMatchObject({ name: "Rez-de-chaussée", count: 3, calibrated: true });
    await expect(addTakeoffLines(ctx, id, ["c"])).rejects.toMatchObject({ status: 400 });
    expect(await addTakeoffLines(ctx, id, ["a", "b"])).toEqual({ added: 2, quoteId });
    const lines = (await getDraft(ctx, quoteId)).sections.flatMap((s) => s.lines);
    expect(lines.map((l) => [l.label, l.quantity, l.unit])).toEqual([
      ["Carrelage séjour", "12", "m²"],
      ["Prises", "3", "u"],
    ]);
    expect(await deleteTakeoff(ctx, id)).toBe(quoteId);
    expect(await listTakeoffs(ctx, quoteId)).toEqual([]);
  });
});
