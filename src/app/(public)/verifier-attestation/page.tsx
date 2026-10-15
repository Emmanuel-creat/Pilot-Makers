import { PrintButton } from "@/app/app/rapports/ReportActions";
import { Icon } from "@/components/Icon";
import { getDb } from "@/lib/db";
import { COURSE } from "@/lib/management-course";
import { verifyCertificate } from "@/lib/services/management-course";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Vérifier une attestation",
  description: "Vérifiez l'attestation de réussite au parcours Gestion d'entreprise artisanale d'un professionnel à partir de son numéro.",
};

const fr = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });

/** Vérification publique d'une attestation de réussite, imprimable par son titulaire. */
export default async function VerifyCertificatePage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code = "" } = await searchParams;
  const c = code ? await verifyCertificate(await getDb(), code) : null;
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-12">
      <header className="space-y-2 print:hidden">
        <h1 className="text-3xl font-semibold text-balance">Vérifier une attestation</h1>
        <p className="text-muted">Saisissez le numéro inscrit sur l&apos;attestation, de la forme GEA-XXXX-XXXX.</p>
      </header>
      <form method="get" className="card flex flex-wrap items-end gap-3 p-4 print:hidden">
        <div className="min-w-0 flex-1">
          <label className="label" htmlFor="va-code">
            Numéro d&apos;attestation
          </label>
          <input id="va-code" name="code" className="field uppercase" defaultValue={code} placeholder="GEA-XXXX-XXXX" maxLength={13} required />
        </div>
        <button type="submit" className="btn-secondary">
          Vérifier
        </button>
      </form>
      {code && !c ? (
        <p role="status" className="card p-5 text-danger">
          Aucune attestation ne porte ce numéro.
        </p>
      ) : null}
      {c ? (
        <section className="card space-y-4 p-6" data-testid="attestation" aria-labelledby="va-titre">
          <p className="flex items-center gap-2 text-sm text-success">
            <Icon name="shield" size={16} /> Attestation authentique
          </p>
          <h2 id="va-titre" className="text-2xl font-semibold">
            Attestation de réussite
          </h2>
          <p>
            <span className="font-semibold">{c.holderName}</span>
            {c.companyName ? <>, {c.companyName},</> : null} a réussi l&apos;examen final du parcours <span className="font-semibold">{COURSE.title}</span> le{" "}
            {fr(c.issuedAt)}, avec {c.score} bonnes réponses sur {c.total}.
          </p>
          <p className="text-sm text-muted">
            Huit modules validés : prix de revient, marge et coefficient, trésorerie et délais de paiement, TVA dans le bâtiment, facture électronique,
            recouvrement, assurances et garanties, indicateurs de pilotage.
          </p>
          <p className="text-sm">
            Numéro : <span className="font-mono font-semibold">{c.code}</span>
          </p>
          <p className="text-xs text-muted">
            Attestation de réussite délivrée par Pilot-Makers. Ce n&apos;est pas une certification inscrite au répertoire national des certifications
            professionnelles.
          </p>
          <PrintButton />
        </section>
      ) : null}
    </div>
  );
}
