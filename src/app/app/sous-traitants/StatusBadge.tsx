import { type DocStatus, STATUS_LABELS } from "@/lib/services/subcontractors";

const TONES: Record<DocStatus, string> = {
  valide: "bg-success-soft text-success",
  bientot: "bg-warning-soft text-warning",
  expire: "bg-danger-soft text-danger",
  manquant: "bg-danger-soft text-danger",
};

export function StatusBadge({ status }: { status: DocStatus }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${TONES[status]}`}>{STATUS_LABELS[status]}</span>;
}
