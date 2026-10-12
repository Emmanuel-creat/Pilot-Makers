import Link from "next/link";
import type { ReactNode } from "react";
import { QUOTE_STATUSES, type QuoteStatus } from "@/lib/services/quote-types";
import { Icon } from "./Icon";

export function PageHeader({ title, subtitle, actions, back }: { title: string; subtitle?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back ? (
          <Link href={back.href} className="mb-1 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
            <Icon name="left" size={16} /> {back.label}
          </Link>
        ) : null}
        <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <div className="mt-1 text-sm text-muted">{subtitle}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

const STATUS_STYLE: Record<QuoteStatus, string> = {
  draft: "bg-surface-2 text-muted",
  incomplete: "bg-warning-soft text-warning",
  ready: "bg-accent-soft text-accent",
  sent: "bg-accent-soft text-accent",
  viewed: "bg-accent-soft text-accent",
  accepted: "bg-success-soft text-success",
  refused: "bg-danger-soft text-danger",
  expired: "bg-surface-2 text-muted",
  canceled: "bg-surface-2 text-muted line-through",
  superseded: "bg-surface-2 text-muted",
};

export function StatusBadge({ status }: { status: QuoteStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_STYLE[status]}`}>
      {QUOTE_STATUSES[status]}
    </span>
  );
}

export function Notice({ tone = "info", children, title }: { tone?: "info" | "warning" | "danger" | "success"; children: ReactNode; title?: string }) {
  const styles = {
    info: "border-accent/30 bg-accent-soft text-ink",
    warning: "border-warning/30 bg-warning-soft text-ink",
    danger: "border-danger/30 bg-danger-soft text-ink",
    success: "border-success/30 bg-success-soft text-ink",
  }[tone];
  const icon = { info: "info", warning: "alert", danger: "alert", success: "check" }[tone];
  const color = { info: "text-accent", warning: "text-warning", danger: "text-danger", success: "text-success" }[tone];
  return (
    <div className={`flex gap-3 rounded-md border px-4 py-3 text-sm ${styles}`} role={tone === "danger" ? "alert" : "status"}>
      <Icon name={icon} className={`mt-0.5 ${color}`} />
      <div className="min-w-0">
        {title ? <div className="font-medium">{title}</div> : null}
        <div>{children}</div>
      </div>
    </div>
  );
}

export function Empty({ icon, title, children, action }: { icon: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-3 rounded-full bg-accent-soft p-3 text-accent">
        <Icon name={icon} size={24} />
      </div>
      <h2 className="font-semibold">{title}</h2>
      {children ? <p className="mt-1 max-w-md text-sm text-muted">{children}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Stat({ label, value, hint, href }: { label: string; value: ReactNode; hint?: string; href?: string }) {
  const body = (
    <div className="card h-full p-4 transition-colors hover:border-accent/40">
      <div className="text-sm text-muted">{label}</div>
      <div className="tabular mt-1 text-2xl font-semibold">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted">{hint}</div> : null}
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

export function Section({ title, description, children, actions }: { title: string; description?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="card p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{title}</h2>
          {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Field({ label, name, hint, error, children }: { label: string; name?: string; hint?: ReactNode; error?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={name} className="label">
        {label}
      </label>
      {children}
      {error ? <p className="mt-1 text-sm text-danger">{error}</p> : hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function fmtDate(d: string | Date | null | undefined, withTime = false) {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d.length === 10 ? d + "T12:00:00" : d) : d;
  return date.toLocaleDateString("fr-FR", {
    timeZone: "Europe/Paris",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}
