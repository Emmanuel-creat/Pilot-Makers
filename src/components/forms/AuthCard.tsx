import type { ReactNode } from "react";

export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-12">
      <div className="card p-6 sm:p-8">
        <h1 className="text-xl font-semibold">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
        <div className="mt-6">{children}</div>
      </div>
      {footer ? <div className="mt-4 text-center text-sm text-muted">{footer}</div> : null}
    </div>
  );
}
