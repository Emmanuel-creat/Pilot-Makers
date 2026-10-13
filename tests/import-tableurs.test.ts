import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { importCatalogCsv, searchItems } from "@/lib/services/catalog";
import type { Ctx } from "@/lib/services/context";
import { commitCustomerImport, previewCustomerImport } from "@/lib/services/customers";
import { cleanAmount, excelDate, headerKey, readTable } from "@/lib/sheet";
import { zip } from "@/lib/zip";
import { freshDb, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "import@exemple.fr");
});

/** Classeur Excel minimal, tel que l'écrit Excel : chaînes partagées, styles de date, cellules creuses. */
function xlsx(sheetRows: string): Buffer {
  return zip([
    { name: "[Content_Types].xml", data: "<Types/>" },
    {
      name: "xl/workbook.xml",
      data: '<workbook xmlns:r="r"><sheets><sheet name="Clients" sheetId="1" r:id="rId3"/><sheet name="Autre" sheetId="2" r:id="rId4"/></sheets></workbook>',
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: '<Relationships><Relationship Id="rId4" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Target="worksheets/sheet1.xml"/></Relationships>',
    },
    {
      name: "xl/sharedStrings.xml",
      data: "<sst><si><t>Raison sociale</t></si><si><t>Désignation</t></si><si><r><t>Prix unitaire </t></r><r><t>HT</t></r></si><si><t>Dupont &amp; Fils</t></si><si><t>Date</t></si></sst>",
    },
    {
      name: "xl/styles.xml",
      data: '<styleSheet><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="164"/><xf numFmtId="9"/></cellXfs></styleSheet>',
    },
    { name: "xl/worksheets/sheet1.xml", data: `<worksheet><sheetData>${sheetRows}</sheetData></worksheet>` },
    {
      name: "xl/worksheets/sheet2.xml",
      data: '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>autre</t></is></c></row></sheetData></worksheet>',
    },
  ]);
}

function ods(rows: string): Buffer {
  return zip([
    { name: "mimetype", data: "application/vnd.oasis.opendocument.spreadsheet" },
    {
      name: "content.xml",
      data: `<office:document-content><office:body><office:spreadsheet><table:table table:name="F1">${rows}</table:table><table:table table:name="F2"><table:table-row><table:table-cell><text:p>non</text:p></table:table-cell></table:table-row></table:table></office:spreadsheet></office:body></office:document-content>`,
    },
  ]);
}

describe("lecture des tableurs", () => {
  it("Excel .xlsx : première feuille, chaînes partagées, nombres, dates et cellules vides", () => {
    const t = readTable(
      xlsx(
        '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>2</v></c><c r="D1" t="s"><v>4</v></c></row>' +
          '<row r="3"><c r="A3" t="s"><v>3</v></c><c r="B3"><v>12.499999999999998</v></c><c r="C3" t="b"><v>1</v></c><c r="D3" s="1"><v>46296</v></c><c r="E3" s="0"/></row>',
      ),
      "clients.xlsx",
    );
    expect(t).toEqual([["Raison sociale", "Prix unitaire HT", "", "Date"], [], ["Dupont & Fils", "12.5", "oui", "2026-10-01"]]);
    expect(excelDate(45658)).toBe("2025-01-01");
  });

  it("LibreOffice .ods : cellules répétées, espaces et nombres", () => {
    const t = readTable(
      ods(
        '<table:table-row><table:table-cell office:value-type="string"><text:p>Nom</text:p></table:table-cell><table:table-cell table:number-columns-repeated="2"><text:p>CP</text:p></table:table-cell><table:table-cell table:number-columns-repeated="1020"/></table:table-row>' +
          '<table:table-row><table:table-cell><text:p>De<text:s text:c="2"/>la Tour</text:p></table:table-cell><table:table-cell office:value-type="float" office:value="1000"><text:p>1000</text:p></table:table-cell><table:table-cell office:value-type="date" office:date-value="2026-10-01T00:00:00"/></table:table-row>' +
          '<table:table-row table:number-rows-repeated="1048000"><table:table-cell table:number-columns-repeated="1024"/></table:table-row>',
      ),
    );
    expect(t).toEqual([
      ["Nom", "CP", "CP"],
      ["De  la Tour", "1000", "2026-10-01"],
    ]);
  });

  it("CSV en Windows-1252 (Excel français) et refus de l'ancien format .xls", () => {
    const cp1252 = Buffer.concat([Buffer.from("Désignation;Prix\nCâble électrique;2,5 ", "latin1"), Buffer.from([0x80]), Buffer.from("\n")]);
    expect(readTable(cp1252)).toEqual([
      ["Désignation", "Prix"],
      ["Câble électrique", "2,5 €"],
    ]);
    expect(() => readTable(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0]))).toThrow(/xlsx/);
    expect(() => readTable(Buffer.from("PK\x03\x04garbage"))).toThrow();
  });

  it("en-têtes et montants nettoyés", () => {
    expect(headerKey("  Prix unitaire H.T. (€)")).toBe("prix unitaire h t");
    expect(headerKey("N° TVA")).toBe("n tva");
    expect(cleanAmount("1 234,50 €", 4)).toBe("1234.50");
    expect(cleanAmount("1.234,5", 4)).toBe("1234.5");
    expect(cleanAmount("1,234.5", 4)).toBe("1234.5");
    expect(cleanAmount("12.499999999", 4)).toBe("12.5000");
    expect(cleanAmount("20 %", 2)).toBe("20");
    expect(cleanAmount("sur devis", 4)).toBe("sur devis");
    expect(cleanAmount("18,00 ¬", 4)).toBe("18.00");
    expect(cleanAmount("-5", 4)).toBe("-5");
  });
});

describe("import depuis d'autres logiciels", () => {
  it("clients : colonnes d'un export tiers, codes postaux et téléphones réparés, SIRET réduit au SIREN", async () => {
    const table = [
      [
        "Civilité",
        "Nom du client",
        "Prénom",
        "Raison sociale",
        "Adresse 1",
        "Complément d'adresse",
        "CP",
        "Ville",
        "Tél. fixe",
        "Portable",
        "E-mail",
        "N° SIRET",
        "Catégorie",
        "Adresse chantier",
        "Ville chantier",
        "Colonne inconnue",
      ],
      [
        "Mme",
        "Durand",
        "Claire",
        "",
        "3 rue des Lilas",
        "Bât. B",
        "1000",
        "Bourg-en-Bresse",
        "",
        "612345678",
        "claire@exemple.fr",
        "",
        "Particulier",
        "",
        "",
        "x",
      ],
      [
        "",
        "",
        "",
        "Bâti Sud SARL",
        "8 avenue du Port",
        "",
        "13002",
        "Marseille",
        "0491000000",
        "0600000000",
        "contact@batisud.fr",
        "732 829 320 00074",
        "Professionnel",
        "2 quai Rive Neuve",
        "Marseille",
        "",
      ],
    ];
    const rows = await previewCustomerImport(ctx, table);
    expect(rows.map((r) => r.errors)).toEqual([[], []]);
    const [a, b] = rows.map((r) => r.data!);
    expect(a).toMatchObject({
      civility: "Mme",
      last_name: "Durand",
      billing_line2: "Bât. B",
      billing_postal_code: "01000",
      phone: "0612345678",
      type: "particulier",
    });
    expect(b).toMatchObject({
      type: "entreprise",
      company_name: "Bâti Sud SARL",
      phone: "0491000000",
      siren: "732829320",
      site_same_as_billing: false,
      site_line1: "2 quai Rive Neuve",
    });
    expect(await commitCustomerImport(ctx, table, { skipDuplicates: true })).toEqual({ imported: 2, skipped: 0 });
  });

  it("catalogue : désignation, prix au format monétaire, TVA en pourcentage Excel, catégorie reconnue ou conservée", async () => {
    const table = [
      ["Code article", "Désignation", "Famille", "Type", "Unité", "Prix d'achat HT", "Prix unitaire HT", "Taux de TVA", "Temps de pose"],
      ["PLB-001", "Mitigeur lavabo", "Plomberie", "Fourniture", "u", "38,20 €", "1 089,90 €", "0.2", "15"],
      ["", "Pose de faïence", "", "Main d'oeuvre", "m²", "", "45", "10 %", ""],
      ["", "Location échafaudage", "", "Location", "j", "", "60", "", ""],
      ["", "", "", "", "", "", "", "", ""],
      ["X-1", "Sans prix", "", "", "u", "", "", "20", ""],
    ];
    const dry = await importCatalogCsv(ctx, table, true);
    expect(dry.results.map((r) => [r.line, r.ok, r.message])).toEqual([
      [2, true, "Prêt à importer"],
      [3, true, "Prêt à importer"],
      [4, true, "Prêt à importer (TVA 20 % par défaut)"],
      [6, false, "Prix de vente requis"],
    ]);
    expect((await importCatalogCsv(ctx, table, false)).imported).toBe(3);
    const items = await searchItems(ctx, { includeArchived: true, limit: 50 });
    const mitigeur = items.find((i) => i.name === "Mitigeur lavabo")!;
    expect(mitigeur).toMatchObject({
      reference: "PLB-001",
      category: "materiau",
      subcategory: "Plomberie",
      unit_price4: 10899000,
      unit_cost4: 382000,
      vat_bp: 2000,
      duration_minutes: 15,
    });
    expect(items.find((i) => i.name === "Pose de faïence")).toMatchObject({ category: "main_oeuvre", vat_bp: 1000, unit: "m²" });
    expect(items.find((i) => i.name === "Location échafaudage")).toMatchObject({ category: "autre", subcategory: "Location", vat_bp: 2000 });
  });

  it("catalogue : un fichier sans colonne de nom est refusé", async () => {
    await expect(importCatalogCsv(ctx, [["Prix"], ["12"]], true)).rejects.toMatchObject({ status: 400 });
  });
});
