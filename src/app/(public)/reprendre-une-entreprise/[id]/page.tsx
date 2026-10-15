import Link from "next/link";
import { notFound } from "next/navigation";
import { transferContactAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { bandLabel, REASONS, REVENUE_BANDS, STAFF_BANDS } from "@/lib/business-takeover";
import { getDb } from "@/lib/db";
import { publicTransferListing } from "@/lib/services/business-takeover";

export const dynamic = "force-dynamic";

const cap = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const l = await publicTransferListing(await getDb(), (await params).id);
  return { title: l ? `${l.headline} (${l.ref})` : "Annonce de reprise" };
}

/** Annonce de reprise et formulaire de prise de contact avec le cédant. */
export default async function TakeoverPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const l = await publicTransferListing(await getDb(), id);
  if (!l) notFound();
  const facts = [
    ["Métier", cap(l.trade)],
    ["Département", l.department],
    ["Chiffre d'affaires moyen", bandLabel(REVENUE_BANDS, l.revenueBand)],
    ["Effectif", bandLabel(STAFF_BANDS, l.staffBand)],
    ["Raison de la cession", REASONS[l.reason as keyof typeof REASONS] ?? "Non précisée"],
    ["Accompagnement proposé", l.accompanimentMonths ? `${l.accompanimentMonths} mois` : "À discuter"],
  ];
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-12">
      <Link href="/reprendre-une-entreprise" className="link text-sm">
        Toutes les entreprises à reprendre
      </Link>
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-muted">Annonce {l.ref}</p>
        <h1 className="text-3xl font-semibold text-balance">{l.headline}</h1>
      </header>
      <dl className="card grid gap-3 p-5 text-sm sm:grid-cols-2">
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt className="text-muted">{k}</dt>
            <dd className="font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="whitespace-pre-line">{l.description}</p>
      <p className="text-sm text-muted">
        Les tranches sont calculées à partir de l&apos;activité facturée dans Pilot-Makers sur les trois derniers exercices. Seul un expert peut établir une
        évaluation opposable.
      </p>
      <section className="card space-y-3 p-5" aria-labelledby="rp-contact">
        <h2 id="rp-contact" className="text-lg font-semibold">
          Écrire au cédant
        </h2>
        <p className="text-sm text-muted">Votre message lui est transmis ; il vous recontacte s&apos;il souhaite donner suite.</p>
        <ActionForm action={transferContactAction} resetOnSuccess>
          <input type="hidden" name="listingId" value={l.id} />
          <div className="hidden" aria-hidden="true">
            <label htmlFor="rp-website">Site</label>
            <input id="rp-website" name="website" tabIndex={-1} autoComplete="off" />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="rp-name">
                Nom et prénom
              </label>
              <input id="rp-name" name="name" className="field" autoComplete="name" required />
            </div>
            <div>
              <label className="label" htmlFor="rp-email">
                E-mail
              </label>
              <input id="rp-email" name="email" type="email" className="field" autoComplete="email" />
            </div>
            <div>
              <label className="label" htmlFor="rp-phone">
                Téléphone
              </label>
              <input id="rp-phone" name="phone" type="tel" className="field" autoComplete="tel" />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="rp-message">
              Votre projet de reprise
            </label>
            <textarea id="rp-message" name="message" className="field" rows={5} required />
          </div>
          <Submit>Envoyer</Submit>
        </ActionForm>
      </section>
    </div>
  );
}
