import { describe, expect, it } from "vitest";
import { IGNORED_COLUMN } from "@/lib/import-fields";
import { applyMapping, describeColumns, looksLikeOther } from "@/lib/server/import-body";
import { catalogImportField } from "@/lib/services/catalog";
import { customerImportField, previewCustomerImport } from "@/lib/services/customers";
import { freshDb, signUp } from "./helpers";

const table = [
  ["Ident", "Intitulé client", "Joignable au", "Téléphone"],
  ["C001", "Lefèvre", "0612345678", ""],
];

describe("import assisté depuis un ancien logiciel", () => {
  it("applique les correspondances choisies à la main", () => {
    const mapped = applyMapping(table, { "1": "last_name", "2": "phone", "3": "" }, "customers");
    expect(mapped[0]).toEqual(["Ident", "last_name", "phone", IGNORED_COLUMN]);
    expect(mapped[1]).toEqual(table[1]);
    expect(() => applyMapping(table, { "1": "mot_de_passe" }, "customers")).toThrow("Correspondance");
    expect(applyMapping(table, { "99": "phone" }, "customers")[0]).toEqual(table[0]);
  });

  it("décrit chaque colonne avec le champ retenu et un exemple", () => {
    const mapped = applyMapping(table, { "1": "last_name", "3": "" }, "customers");
    expect(describeColumns(table, mapped, customerImportField)).toEqual([
      { index: 0, header: "Ident", field: null, sample: "C001" },
      { index: 1, header: "Intitulé client", field: "last_name", sample: "Lefèvre" },
      { index: 2, header: "Joignable au", field: null, sample: "0612345678" },
      { index: 3, header: "Téléphone", field: null, sample: "" },
    ]);
  });

  it("signale un catalogue déposé dans l'import des clients", () => {
    const header = ["Désignation", "Unité", "Prix unitaire HT", "Taux de TVA"];
    expect(looksLikeOther(header, customerImportField, catalogImportField)).toBe(true);
    expect(looksLikeOther(["Nom", "Prénom", "Ville"], customerImportField, catalogImportField)).toBe(false);
  });

  it("importe un fichier sans en-tête reconnu une fois les colonnes désignées", async () => {
    const ctx = await signUp(await freshDb(), "import@exemple.fr");
    const bare = table.map((r) => r.slice(0, 3));
    await expect(previewCustomerImport(ctx, bare)).rejects.toThrow("Aucune colonne reconnue");
    const rows = await previewCustomerImport(ctx, applyMapping(bare, { "1": "last_name", "2": "phone" }, "customers"));
    expect(rows[0]).toMatchObject({ errors: [], data: { last_name: "Lefèvre" } });
  });
});
