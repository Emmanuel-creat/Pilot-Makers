"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

export function Submit({ children, className = "btn-primary", pendingLabel }: { children: ReactNode; className?: string; pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending}>
      {pending ? pendingLabel ?? "Patientez..." : children}
    </button>
  );
}

export function FormMessage({ state }: { state: { ok?: boolean; error?: string; message?: string } | null }) {
  if (!state) return null;
  if (state.error)
    return (
      <p role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
        {state.error}
      </p>
    );
  if (state.message)
    return (
      <p role="status" className="rounded-md border border-success/30 bg-success-soft px-3 py-2 text-sm text-success">
        {state.message}
      </p>
    );
  return null;
}
