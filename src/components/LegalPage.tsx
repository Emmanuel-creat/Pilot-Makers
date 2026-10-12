import type { ReactNode } from "react";
import { Notice } from "./ui";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-1 text-sm text-muted">Version du {updated}</p>
      <div className="mt-4">
        <Notice tone="warning">Modèle de travail à faire relire et valider par un juriste avant la commercialisation.</Notice>
      </div>
      <div className="mt-6 space-y-4 text-sm leading-relaxed [&_h2]:mt-8 [&_h2]:text-base [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc">{children}</div>
    </article>
  );
}
