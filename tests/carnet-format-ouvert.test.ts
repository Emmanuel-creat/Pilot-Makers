import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { parseExchange } from "@/lib/home-record";
import type { Ctx } from "@/lib/services/context";
import {
  addHomeEntry,
  exportHomeRecord,
  exportSharedHomeRecord,
  getHomeRecord,
  importHomeRecordFile,
  listHomeRecords,
  shareHomeRecord,
} from "@/lib/services/home-records";
import { completeProfile, freshDb, makeCustomer, signUp } from "./helpers";

const base = {
  format: "carnet-logement",
  version: 1,
  exportedAt: "",
  address: { line1: "3 place du Marché", postalCode: "21000", city: "Dijon" },
  author: "Autre logiciel",
};

describe("carnet au format ouvert : lecture", () => {
  it("refuse ce qui n'est pas un carnet et ignore les entrées invalides", () => {
    expect(parseExchange(null)).toMatchObject({ ok: false });
    expect(parseExchange({ ...base, format: "devis" })).toMatchObject({ ok: false, error: "Ce fichier n'est pas un carnet de logement" });
    expect(parseExchange({ ...base, version: 2 })).toMatchObject({ ok: false });
    expect(parseExchange({ ...base, address: { line1: "", city: "" } })).toMatchObject({ ok: false });
    const p = parseExchange({
      ...base,
      entries: [
        { id: "a-1", date: "2023-02-01", kind: "diagnostic", label: "DPE classe D", maintenanceMonths: 999, warrantyUntil: "bientôt" },
        { id: "a-2", date: "01/02/2023", kind: "diagnostic", label: "Date mal écrite" },
        { id: "a-3", date: "2023-02-01", kind: "piscine", label: "Genre inconnu" },
        { date: "2023-02-01", kind: "travaux", label: "Sans identifiant" },
      ],
    });
    expect(p.ok && p.skipped).toBe(3);
    expect(p.ok && p.data.entries).toEqual([
      {
        id: "a-1",
        date: "2023-02-01",
        kind: "diagnostic",
        label: "DPE classe D",
        detail: "",
        brand: "",
        warrantyUntil: null,
        maintenanceMonths: null,
        author: "Autre logiciel",
      },
    ]);
  });
});

describe("carnet au format ouvert : export puis reprise", () => {
  let db: Database;
  let first: Ctx;
  let second: Ctx;
  let record: string;

  beforeAll(async () => {
    db = await freshDb();
    first = await signUp(db, "premier@format.fr", "Toits Martin");
    await completeProfile(first);
    second = await signUp(db, "second@format.fr", "Chauffage Durand");
    const c = await makeCustomer(first);
    await db.query(
      "INSERT INTO jobs (org_id, customer_id, title, status, site_line1, site_postal_code, site_city, start_date, end_date) VALUES ($1,$2,'Toiture','termine','8 rue des Lilas','69003','Lyon','2024-05-01','2024-05-20')",
      [first.orgId, c],
    );
    record = (await listHomeRecords(first))[0].id;
    await addHomeEntry(first, record, { date: "2024-06-01", kind: "equipement", label: "Fenêtre de toit", brand: "Velux", warrantyUntil: "2034-06-01" });
  });

  it("exporte un fichier documenté, aussi pour le propriétaire qui a le lien", async () => {
    const f = await exportHomeRecord(first, record);
    expect(f).toMatchObject({
      format: "carnet-logement",
      version: 1,
      author: "Toits Martin",
      address: { line1: "8 rue des Lilas", postalCode: "69003", city: "Lyon" },
    });
    expect(f.entries.map((e) => [e.label, e.kind, e.author])).toEqual([
      ["Fenêtre de toit", "equipement", "Toits Martin"],
      ["Toiture", "travaux", "Toits Martin"],
    ]);
    await expect(exportHomeRecord(second, record)).rejects.toMatchObject({ status: 404 });
    const token = await shareHomeRecord(first, record);
    expect((await exportSharedHomeRecord(db, token))?.entries).toHaveLength(2);
    expect(await exportSharedHomeRecord(db, "inconnu-inconnu-inconnu-inconnu")).toBeNull();
  });

  it("reprend le fichier chez un autre artisan, sans doublon, et lit un fichier d'un autre logiciel", async () => {
    const json = JSON.stringify(await exportHomeRecord(first, record));
    const customer = await makeCustomer(second);
    await expect(importHomeRecordFile(second, "{pas du json", customer)).rejects.toMatchObject({ status: 400 });
    await expect(importHomeRecordFile(second, json, "00000000-0000-0000-0000-000000000000")).rejects.toMatchObject({ status: 404 });
    const r = await importHomeRecordFile(second, json, customer);
    expect(r).toMatchObject({ imported: 2, skipped: 0 });
    expect((await importHomeRecordFile(second, json, customer)).imported).toBe(0);
    const h = await getHomeRecord(second, r.recordId);
    expect(h.items.map((i) => (i.type === "entree" ? i.entry.source : ""))).toEqual(["Toits Martin", "Toits Martin"]);

    const other = JSON.stringify({ ...base, entries: [{ id: "x-1", date: "2022-09-01", kind: "entretien", label: "Ramonage", maintenanceMonths: 12 }] });
    const r2 = await importHomeRecordFile(second, other, customer);
    expect(r2.imported).toBe(1);
    expect((await importHomeRecordFile(second, other, customer)).imported).toBe(0);
    expect((await getHomeRecord(second, r2.recordId)).address.city).toBe("Dijon");
  });
});
