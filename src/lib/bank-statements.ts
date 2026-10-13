/**
 * Relevés bancaires importés : OFX (Money, Quicken), CAMT.053 (norme ISO 20022 des banques européennes)
 * et CSV ou tableur exportés depuis la banque en ligne. Chaque opération est ramenée à une forme commune.
 * Les montants sont en centimes, positifs pour un encaissement, négatifs pour une dépense.
 */

import { createHash } from "node:crypto";
import { cleanAmount, headerKey, readTable, SheetError } from "@/lib/sheet";

export class StatementError extends Error {}

export interface BankLine {
  bookedOn: string;
  amountCents: number;
  label: string;
  reference: string;
  counterparty: string;
  /** Empreinte stable de l'opération, pour ne pas l'importer deux fois */
  fingerprint: string;
}

const MAX_LINES = 5000;

function fingerprint(l: Omit<BankLine, "fingerprint">, bankId = "") {
  return createHash("sha256")
    .update(bankId ? `id:${bankId}` : `${l.bookedOn}|${l.amountCents}|${l.label}|${l.reference}`)
    .digest("hex")
    .slice(0, 32);
}

function cents(raw: string): number {
  const v = cleanAmount(raw, 2);
  if (!/^[+-]?\d+(\.\d+)?$/.test(v)) throw new StatementError(`Montant illisible : ${raw}`);
  return Math.round(Number(v) * 100);
}

/** Date en AAAA-MM-JJ depuis 20261005, 2026-10-05 ou 05/10/2026. */
function isoDate(raw: string): string {
  const s = raw.trim();
  let m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s);
  if (m) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  throw new StatementError(`Date illisible : ${raw}`);
}

const unescapeXml = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&")
    .trim();

/** OFX : balises <STMTTRN>, en SGML (sans balises fermantes) comme en XML. */
export function parseOfx(text: string): BankLine[] {
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  return blocks.map((b) => {
    const field = (name: string) => {
      const m = new RegExp(`<${name}>([^<\\r\\n]*)`, "i").exec(b);
      return m ? unescapeXml(m[1]) : "";
    };
    const base = {
      bookedOn: isoDate(field("DTPOSTED")),
      amountCents: cents(field("TRNAMT")),
      label: field("NAME") || field("MEMO"),
      reference: field("NAME") && field("MEMO") ? field("MEMO") : "",
      counterparty: field("NAME"),
    };
    return { ...base, fingerprint: fingerprint(base, field("FITID")) };
  });
}

/** CAMT.053 : écritures <Ntry>, sens donné par CdtDbtInd (CRDT encaissement, DBIT dépense). */
export function parseCamt053(text: string): BankLine[] {
  const entries = text.match(/<(?:\w+:)?Ntry>[\s\S]*?<\/(?:\w+:)?Ntry>/g) ?? [];
  return entries.map((e) => {
    const tag = (path: string[]) => {
      let scope = e;
      for (const p of path) {
        const m = new RegExp(`<(?:\\w+:)?${p}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${p}>`).exec(scope);
        if (!m) return "";
        scope = m[1];
      }
      return unescapeXml(scope);
    };
    const amount = cents(tag(["Amt"]));
    const sign = tag(["CdtDbtInd"]) === "DBIT" ? -1 : 1;
    const credit = sign > 0;
    const counterparty = tag(["RltdPties", credit ? "Dbtr" : "Cdtr", "Nm"]) || tag(["RltdPties", credit ? "Dbtr" : "Cdtr", "Pty", "Nm"]);
    const remittance = tag(["RmtInf", "Ustrd"]) || tag(["AddtlNtryInf"]);
    const base = {
      bookedOn: isoDate(tag(["BookgDt", "Dt"]) || tag(["BookgDt", "DtTm"]) || tag(["ValDt", "Dt"])),
      amountCents: sign * Math.abs(amount),
      label: remittance || counterparty,
      reference: tag(["Refs", "EndToEndId"]).replace(/^NOTPROVIDED$/, ""),
      counterparty,
    };
    return { ...base, fingerprint: fingerprint(base, tag(["AcctSvcrRef"]) || tag(["NtryRef"])) };
  });
}

const CSV_COLUMNS: Record<string, "date" | "label" | "amount" | "debit" | "credit" | "reference"> = {
  date: "date",
  "date operation": "date",
  "date de l operation": "date",
  "date comptable": "date",
  "date de comptabilisation": "date",
  "date valeur": "date",
  libelle: "label",
  "libelle operation": "label",
  "libelle de l operation": "label",
  "libelle simplifie": "label",
  description: "label",
  operation: "label",
  "nature de l operation": "label",
  montant: "amount",
  "montant eur": "amount",
  "montant en euros": "amount",
  "montant de l operation": "amount",
  debit: "debit",
  "debit eur": "debit",
  "debit euros": "debit",
  credit: "credit",
  "credit eur": "credit",
  "credit euros": "credit",
  reference: "reference",
  "reference de l operation": "reference",
  "informations complementaires": "reference",
};

/** CSV ou tableur de la banque en ligne : une colonne montant, ou deux colonnes débit et crédit. */
export function parseBankTable(rows: string[][]): BankLine[] {
  const h = rows.findIndex((r) => r.map((c) => CSV_COLUMNS[headerKey(c)]).filter(Boolean).length >= 2);
  if (h < 0) throw new StatementError("Colonnes du relevé non reconnues : il faut au moins la date, le libellé et le montant (ou débit et crédit)");
  const cols = rows[h].map((c) => CSV_COLUMNS[headerKey(c)]);
  const at = (r: string[], k: string) => {
    const i = cols.indexOf(k as never);
    return i < 0 ? "" : (r[i] ?? "").trim();
  };
  if (!cols.includes("date") || !(cols.includes("amount") || cols.includes("debit") || cols.includes("credit"))) {
    throw new StatementError("Le relevé doit contenir la date et le montant de chaque opération");
  }
  const out: BankLine[] = [];
  for (const r of rows.slice(h + 1)) {
    if (!at(r, "date") || r.every((c) => !c.trim())) continue;
    let amount: number;
    if (cols.includes("amount") && at(r, "amount")) amount = cents(at(r, "amount"));
    else {
      const debit = at(r, "debit") ? Math.abs(cents(at(r, "debit"))) : 0;
      const credit = at(r, "credit") ? Math.abs(cents(at(r, "credit"))) : 0;
      if (!debit && !credit) continue;
      amount = credit - debit;
    }
    const base = { bookedOn: isoDate(at(r, "date")), amountCents: amount, label: at(r, "label"), reference: at(r, "reference"), counterparty: "" };
    out.push({ ...base, fingerprint: fingerprint(base) });
  }
  return out;
}

/** Lit un relevé, quel que soit son format. */
export function parseStatement(bytes: Uint8Array, name = ""): BankLine[] {
  const head = Buffer.from(bytes.subarray(0, 4000)).toString("latin1");
  let lines: BankLine[];
  if (/<OFX>|OFXHEADER/i.test(head)) lines = parseOfx(Buffer.from(bytes).toString("latin1"));
  else if (/camt\.053|<BkToCstmrStmt>/i.test(head)) lines = parseCamt053(Buffer.from(bytes).toString("utf8"));
  else {
    try {
      lines = parseBankTable(readTable(bytes, name));
    } catch (e) {
      if (e instanceof SheetError) throw new StatementError(e.message);
      throw e;
    }
  }
  if (!lines.length) throw new StatementError("Aucune opération trouvée dans ce relevé");
  if (lines.length > MAX_LINES) throw new StatementError(`${MAX_LINES} opérations au plus par relevé`);
  return lines.map((l) => ({ ...l, label: l.label.slice(0, 300), reference: l.reference.slice(0, 200), counterparty: l.counterparty.slice(0, 200) }));
}
