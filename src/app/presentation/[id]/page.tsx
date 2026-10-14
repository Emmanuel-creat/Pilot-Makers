import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice } from "@/components/ui";
import { HttpError } from "@/lib/http";
import { buildDeck } from "@/lib/presentation";
import { requirePageCtx } from "@/lib/server/session";
import { reducedVatAttestation } from "@/lib/services/consumer";
import { acceptedCalc, snapshotOptions, snapshotVariants } from "@/lib/services/options";
import { PENDING_STATUSES } from "@/lib/services/quote-types";
import { getDraft, getVersion } from "@/lib/services/quotes";
import { SignOnSite } from "@/app/app/devis/[id]/SignOnSite";
import { Presentation } from "./Presentation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Présentation du devis", robots: { index: false, follow: false } };

export default async function PresentationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePageCtx();
  const draft = await getDraft(ctx, id).catch((e) => {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  });
  const shown = draft.acceptedVersion ?? draft.currentVersion;
  if (!shown)
    return (
      <main className="min-h-screen bg-bg px-4 py-8">
        <div className="card mx-auto max-w-xl space-y-4 p-6">
          <Notice tone="info" title="Devis pas encore émis">
            La présentation montre la version émise du devis, celle que le client signe. Émettez d&apos;abord le devis.
          </Notice>
          <Link href={`/app/devis/${id}`} className="btn-secondary">
            Retour au devis
          </Link>
        </div>
      </main>
    );
  const v = await getVersion(ctx.db, ctx.orgId, id, shown);
  const s = v.snapshot;
  const canSign = PENDING_STATUSES.includes(draft.status) && v.version === draft.currentVersion && !ctx.entitlements.readOnly && !ctx.supportAccess;
  const options = snapshotOptions(s).map((o) => ({ id: o.id, label: o.label, ttcCents: o.ttcCents }));
  const base = acceptedCalc(s, []).totalTtcCents;
  return (
    <Presentation
      quoteId={id}
      deck={buildDeck(s)}
      baseTtcCents={base}
      options={options}
      signature={
        canSign ? (
          <SignOnSite
            quoteId={id}
            number={v.number}
            version={v.version}
            baseTtcCents={base}
            customerName={s.customer.contact || (s.customer.type === "particulier" ? s.customer.name : "")}
            options={options}
            variants={snapshotVariants(s)}
            vatAttestation={s.consumer?.reducedVatBp.length ? reducedVatAttestation(s.consumer.reducedVatBp) : ""}
            withdrawal={Boolean(s.consumer?.withdrawal)}
          />
        ) : draft.status === "accepted" ? (
          <Notice tone="success">Ce devis est déjà accepté.</Notice>
        ) : null
      }
    />
  );
}
