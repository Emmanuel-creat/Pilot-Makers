import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { publicShowcase } from "@/lib/services/showcase";
import { RequestForm } from "@/app/pro/[slug]/RequestForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Demande de devis", robots: { index: false, follow: false } };

/** Formulaire de demande de devis seul, à intégrer dans le site de l'artisan. */
export default async function EmbeddedRequestPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await publicShowcase(await getDb(), slug);
  if (!p) notFound();
  return (
    <main className="min-h-screen bg-bg p-4">
      <div className="mx-auto max-w-xl space-y-3">
        <div>
          <h1 className="text-lg font-semibold">Demande de devis</h1>
          <p className="text-sm text-muted">
            {p.name}
            {p.trade ? `, ${p.trade}` : ""} vous répond rapidement.
          </p>
        </div>
        <RequestForm slug={p.slug} orgName={p.name} />
        <p className="text-xs text-muted">
          <a className="link" href={`/pro/${p.slug}`} target="_blank" rel="noopener">
            Voir la page de {p.name}
          </a>
        </p>
      </div>
    </main>
  );
}
