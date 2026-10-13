/** Côté navigateur : lecture d'une facture d'achat électronique par le serveur, pour préremplir un formulaire. */

export interface ReadInvoice {
  number: string;
  supplier: string;
  issueDate: string;
  netCents: number | null;
  vatCents: number | null;
  totalCents: number | null;
}

export async function readInvoiceFile(file: File | undefined): Promise<ReadInvoice | null> {
  if (!file || !(file.type === "application/pdf" || /\.(pdf|xml)$/i.test(file.name) || /xml/.test(file.type))) return null;
  const body = new FormData();
  body.set("file", file);
  try {
    const res = await fetch("/api/expenses/read", { method: "POST", body });
    if (!res.ok) return null;
    const r = (await res.json()) as {
      found: boolean;
      data: ReadInvoice | null;
    };
    return r.found ? r.data : null;
  } catch {
    return null;
  }
}

export const eurosField = (cents: number | null) => (cents === null ? "" : (cents / 100).toFixed(2).replace(".", ","));

/** Remplit un champ du formulaire, s'il existe et si la valeur est connue. */
export function setField(form: HTMLFormElement | null | undefined, name: string, value: string) {
  const input = form?.elements.namedItem(name);
  if (value && input instanceof HTMLInputElement) input.value = value;
}
