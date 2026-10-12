import { INVOICE_STATUSES, type InvoiceStatus } from "@/lib/services/invoices";

const TONES: Record<InvoiceStatus, string> = {
  issued: "bg-accent-soft text-accent",
  partial: "bg-warning-soft text-warning",
  paid: "bg-success-soft text-success",
  overdue: "bg-danger-soft text-danger",
  canceled: "bg-surface-2 text-muted",
  credit: "bg-surface-2 text-muted",
};

export function InvoiceBadge({ status }: { status: InvoiceStatus }) {
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${TONES[status]}`}>{INVOICE_STATUSES[status]}</span>;
}
