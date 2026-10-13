import { beforeAll, describe, expect, it } from "vitest";
import { parseBankTable, parseCamt053, parseOfx, parseStatement } from "@/lib/bank-statements";
import type { Database } from "@/lib/db";
import { candidatesFor, confirmMatch, importStatement, listBankTransactions, reconciliationQueue, setIgnored, unmatch } from "@/lib/services/bank";
import type { Ctx } from "@/lib/services/context";
import { createFinalInvoice, getInvoice } from "@/lib/services/invoices";
import { createQuote, getDraft, issueQuote, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

const enc = (s: string) => new TextEncoder().encode(s);
const today = new Date().toISOString().slice(0, 10);
const ymd = today.replace(/-/g, "");
const fr = today.split("-").reverse().join("/");

const OFX = `OFXHEADER:100
DATA:OFXSGML
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>${ymd}<TRNAMT>1200.00<FITID>A1<NAME>VIR M DUBOIS<MEMO>Facture NUMERO
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>${ymd}<TRNAMT>-45.90<FITID>A2<NAME>CARTE STATION &amp; CO
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

const CAMT = `<?xml version="1.0"?><Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"><BkToCstmrStmt><Stmt>
<Ntry><NtryRef>N1</NtryRef><Amt Ccy="EUR">250.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><BookgDt><Dt>2026-10-02</Dt></BookgDt>
<NtryDtls><TxDtls><Refs><EndToEndId>NOTPROVIDED</EndToEndId></Refs><RltdPties><Dbtr><Nm>CLAIRE DUBOIS</Nm></Dbtr></RltdPties><RmtInf><Ustrd>Acompte cuisine</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry>
<Ntry><NtryRef>N2</NtryRef><Amt Ccy="EUR">80.00</Amt><CdtDbtInd>DBIT</CdtDbtInd><BookgDt><Dt>2026-10-03</Dt></BookgDt><AddtlNtryInf>PRLV ASSURANCE</AddtlNtryInf></Ntry>
</Stmt></BkToCstmrStmt></Document>`;

describe("lecture des relevés", () => {
  it("lit l'OFX, le CAMT.053 et le CSV de la banque en ligne", () => {
    const ofx = parseOfx(OFX);
    expect(ofx.map((l) => [l.amountCents, l.label])).toEqual([
      [120000, "VIR M DUBOIS"],
      [-4590, "CARTE STATION & CO"],
    ]);
    expect(ofx[0].reference).toBe("Facture NUMERO");
    const camt = parseCamt053(CAMT);
    expect(camt).toMatchObject([
      { bookedOn: "2026-10-02", amountCents: 25000, label: "Acompte cuisine", counterparty: "CLAIRE DUBOIS", reference: "" },
      { bookedOn: "2026-10-03", amountCents: -8000, label: "PRLV ASSURANCE" },
    ]);
    const csv = parseBankTable([
      ["Relevé du compte courant"],
      ["Date", "Libellé", "Débit", "Crédit"],
      ["05/10/2026", "VIR SEPA DURAND", "", "1 500,00"],
      ["06/10/2026", "CB BRICO", "32,10", ""],
    ]);
    expect(csv.map((l) => [l.bookedOn, l.amountCents])).toEqual([
      ["2026-10-05", 150000],
      ["2026-10-06", -3210],
    ]);
    expect(parseStatement(enc("Date;Libellé;Montant\n2026-10-05;VIR;-12,00\n"))[0].amountCents).toBe(-1200);
    expect(() => parseStatement(enc("a;b\n1;2\n"))).toThrow("Colonnes du relevé");
  });

  it("propose d'abord la facture citée, puis le même montant et le nom du client", () => {
    const open = [
      { id: "1", number: "F-2026-0007", customer: "Claire Dubois", balance: 120000 },
      { id: "2", number: "F-2026-0008", customer: "Paul Martin", balance: 120000 },
      { id: "3", number: "F-2026-0009", customer: "Lucie Bernard", balance: 50000 },
    ];
    const c = candidatesFor({ amountCents: 120000, label: "VIR DUBOIS FACT F 2026 0007", reference: "", counterparty: "" }, open);
    expect(c.map((x) => [x.invoiceId, x.score])).toEqual([
      ["1", 170],
      ["2", 40],
    ]);
    expect(candidatesFor({ amountCents: -100, label: "", reference: "", counterparty: "" }, open)).toEqual([]);
  });
});

describe("rapprochement des encaissements", () => {
  let db: Database;
  let ctx: Ctx;
  let invoiceId: string;
  let number: string;

  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "banque@exemple.fr");
    await completeProfile(ctx);
    const id = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
    const d = await getDraft(ctx, id);
    await saveDraft(
      ctx,
      id,
      {
        ...d,
        title: "Cuisine",
        site: { line1: "4 place Bellecour", line2: "", postalCode: "69002", city: "Lyon" },
        paymentTerms: "Solde à réception.",
        sections: [{ ...d.sections[0], lines: [line({ quantity: "1", unitPrice: "1000", vatPercent: "20" })] }],
      },
      d.draftRevision,
    );
    await issueQuote(ctx, id);
    await recordResponseManually(ctx, id, { decision: "accept", version: 1, proof: "Devis signé" });
    const inv = await createFinalInvoice(ctx, id);
    invoiceId = inv.id;
    number = (await getInvoice(ctx, invoiceId)).number;
  });

  it("rapproche seul le virement qui cite la facture et n'importe pas deux fois", async () => {
    const r = await importStatement(ctx, enc(OFX.replace("NUMERO", number)), "releve.ofx");
    expect(r).toEqual({ read: 2, added: 2, duplicates: 0, matched: 1 });
    const inv = await getInvoice(ctx, invoiceId);
    expect(inv).toMatchObject({ status: "paid", paid_cents: 120000 });
    const list = await listBankTransactions(ctx);
    expect(list.find((t) => t.amountCents === 120000)).toMatchObject({ status: "rapproche", invoiceNumber: number, matchedBy: "auto" });
    expect(list.find((t) => t.amountCents < 0)?.status).toBe("depense");
    expect(await importStatement(ctx, enc(OFX.replace("NUMERO", number)), "releve.ofx")).toMatchObject({ added: 0, duplicates: 2 });

    // Défaire le rapprochement annule le paiement.
    await unmatch(ctx, list.find((t) => t.amountCents === 120000)!.id);
    expect((await getInvoice(ctx, invoiceId)).paid_cents).toBe(0);
  });

  it("propose les autres encaissements et enregistre le choix", async () => {
    await importStatement(ctx, enc(`Date;Libellé;Crédit\n${fr};VIR CLAIRE DUBOIS ACOMPTE;300,00\n${fr};REMISE CHEQUES;99,00\n`), "releve.csv");
    const queue = await reconciliationQueue(ctx);
    const acompte = queue.find((t) => t.amountCents === 30000)!;
    expect(acompte.candidates[0]).toMatchObject({ invoiceId, reasons: ["nom du client dans le libellé"] });
    await confirmMatch(ctx, acompte.id, invoiceId);
    expect((await getInvoice(ctx, invoiceId)).paid_cents).toBe(30000);
    const cheques = queue.find((t) => t.amountCents === 9900)!;
    await setIgnored(ctx, cheques.id, true);
    expect((await reconciliationQueue(ctx)).map((t) => t.amountCents)).toEqual([120000]);
  });
});
