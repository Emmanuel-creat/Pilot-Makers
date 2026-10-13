import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice, PageHeader, Section, fmtDate } from "@/components/ui";
import { formatEuros } from "@/lib/calc/format";
import { HttpError } from "@/lib/http";
import { requirePageCtx } from "@/lib/server/session";
import { JOB_STATUSES, type JobStatus } from "@/lib/services/jobs-labels";
import { DOC_KINDS, getSubcontractor } from "@/lib/services/subcontractors";
import { StatusBadge } from "../StatusBadge";
import { SubQuotes } from "@/components/SubQuotes";
import { draftQuoteChoices, listSubQuotes } from "@/lib/services/subcontractor-quotes";
import { ArchiveSubcontractor, DeleteSubDocument, DocumentUpload, RequestDocuments, SubcontractorForm } from "../SubForms";

export const metadata = { title: "Sous-traitant" };

export default async function SubcontractorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePageCtx();
  const data = await getSubcontractor(ctx, id).catch((e) => {
    if (e instanceof HttpError && (e.status === 404 || e.status === 403)) notFound();
    throw e;
  });
  const { sub, documents, compliance, jobs } = data;
  const canEdit = !ctx.entitlements.readOnly && !ctx.supportAccess;
  const missing = compliance.required.filter((r) => r.status !== "valide");
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={sub.name}
        back={{ href: "/app/sous-traitants", label: "Sous-traitants" }}
        subtitle={[sub.trade, sub.archived_at ? "archivé" : ""].filter(Boolean).join(", ") || undefined}
        actions={canEdit ? <ArchiveSubcontractor id={sub.id} archived={!!sub.archived_at} /> : null}
      />
      <div className="space-y-6">
        <Section
          title="Documents exigés"
          description="Attestation de vigilance tous les six mois pour un marché d'au moins 5 000 euros HT, assurance décennale en cours."
        >
          <ul className="mb-4 divide-y divide-line text-sm">
            {compliance.required.map((r) => (
              <li key={r.kind} className="flex items-center justify-between gap-2 py-2">
                <span>
                  {r.label}
                  <span className="block text-xs text-muted">{r.validUntil ? `Valable jusqu'au ${fmtDate(r.validUntil)}` : "Non fourni"}</span>
                </span>
                <StatusBadge status={r.status} />
              </li>
            ))}
          </ul>
          {missing.length && canEdit ? (
            sub.email ? (
              <RequestDocuments id={sub.id} />
            ) : (
              <Notice tone="warning">Ajoutez l'e-mail du sous-traitant pour lui demander les documents en un clic.</Notice>
            )
          ) : null}
          {sub.last_reminder_at ? <p className="mt-2 text-xs text-muted">Dernière demande envoyée le {fmtDate(sub.last_reminder_at)}.</p> : null}
        </Section>

        <Section title="Demandes de prix" description="Le sous-traitant répond en ligne ; le prix retenu s'ajoute à votre devis client avec votre marge.">
          <SubQuotes
            rows={await listSubQuotes(ctx, { subcontractorId: sub.id })}
            back={`/app/sous-traitants/${sub.id}`}
            canEdit={canEdit && !sub.archived_at}
            fixedSubId={sub.id}
            draftQuotes={await draftQuoteChoices(ctx)}
          />
        </Section>
        <Section title="Tous les documents">
          {documents.length ? (
            <ul className="mb-4 divide-y divide-line text-sm">
              {documents.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0">
                    {d.has_file ? (
                      <a className="link" href={`/api/subcontractors/documents/${d.id}`} target="_blank" rel="noopener">
                        {DOC_KINDS[d.kind]}
                      </a>
                    ) : (
                      DOC_KINDS[d.kind]
                    )}
                    <span className="block truncate text-xs text-muted">
                      {[d.label, d.valid_until ? `jusqu'au ${fmtDate(d.valid_until)}` : "", `ajouté le ${fmtDate(d.uploaded_at)}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    {d.valid_until ? <StatusBadge status={d.status} /> : null}
                    {canEdit ? <DeleteSubDocument docId={d.id} label={DOC_KINDS[d.kind]} /> : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-4 text-sm text-muted">Aucun document.</p>
          )}
          {canEdit ? <DocumentUpload subId={sub.id} kinds={DOC_KINDS} /> : null}
        </Section>

        {jobs.length ? (
          <Section title="Chantiers">
            <ul className="divide-y divide-line text-sm">
              {jobs.map((j) => (
                <li key={j.job_id} className="flex items-center justify-between gap-2 py-2">
                  <span>
                    <Link className="link" href={`/app/chantiers/${j.job_id}`}>
                      {j.title}
                    </Link>
                    <span className="block text-xs text-muted">{[JOB_STATUSES[j.status as JobStatus], j.scope].filter(Boolean).join(" · ")}</span>
                  </span>
                  {j.amount_ht_cents ? <span className="tabular">{formatEuros(j.amount_ht_cents)}</span> : null}
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {canEdit ? (
          <Section title="Fiche">
            <SubcontractorForm sub={sub} />
          </Section>
        ) : null}
      </div>
    </div>
  );
}
