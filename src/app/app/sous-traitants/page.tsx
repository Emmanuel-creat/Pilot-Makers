import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Notice, PageHeader, Section } from "@/components/ui";
import { requirePageCtx } from "@/lib/server/session";
import { listSubcontractors } from "@/lib/services/subcontractors";
import { StatusBadge } from "./StatusBadge";
import { SubcontractorForm } from "./SubForms";

export const metadata = { title: "Sous-traitants" };

export default async function SubcontractorsPage({ searchParams }: { searchParams: Promise<{ archives?: string }> }) {
  const ctx = await requirePageCtx();
  if (ctx.role === "member") {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader title="Sous-traitants" />
        <Notice title="Réservé à l'encadrement">
          Les fiches des sous-traitants et leurs documents sont gérés par le gérant et les administrateurs.
        </Notice>
      </div>
    );
  }
  const archived = (await searchParams).archives === "1";
  const subs = await listSubcontractors(ctx, { archived });
  const canEdit = !ctx.entitlements.readOnly && !ctx.supportAccess;
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Sous-traitants"
        subtitle="Attestation de vigilance URSSAF et assurance décennale suivies, avec alerte avant expiration."
        actions={
          <Link className="btn-secondary" href={archived ? "/app/sous-traitants" : "/app/sous-traitants?archives=1"}>
            <Icon name="archive" size={16} /> {archived ? "Sous-traitants actifs" : "Archivés"}
          </Link>
        }
      />
      <div className="space-y-6">
        <section className="card">
          {subs.length ? (
            <ul className="divide-y divide-line">
              {subs.map((s) => (
                <li key={s.id}>
                  <Link href={`/app/sous-traitants/${s.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{s.name}</span>
                      <span className="block truncate text-xs text-muted">
                        {[
                          s.trade,
                          ...s.compliance.required.map(
                            (r) => `${r.label} : ${r.validUntil ? `jusqu'au ${r.validUntil.split("-").reverse().join("/")}` : "à fournir"}`,
                          ),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <StatusBadge status={s.compliance.status} />
                    <Icon name="right" size={16} className="text-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-4 text-sm text-muted">{archived ? "Aucun sous-traitant archivé." : "Aucun sous-traitant pour l'instant."}</p>
          )}
        </section>
        {canEdit && !archived ? (
          <Section title="Ajouter un sous-traitant">
            <SubcontractorForm />
          </Section>
        ) : null}
      </div>
    </div>
  );
}
