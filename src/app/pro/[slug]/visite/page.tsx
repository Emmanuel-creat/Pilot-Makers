import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/Icon";
import { getDb } from "@/lib/db";
import { publicVisitSlots } from "@/lib/services/visits";
import { VisitForm } from "./VisitForm";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await publicVisitSlots(await getDb(), slug);
  if (!p) return { title: "Page introuvable", robots: { index: false, follow: false } };
  return { title: `Prendre rendez-vous avec ${p.orgName}`, robots: { index: false, follow: true } };
}

/** Réservation d'une visite de chiffrage, depuis la vitrine publique. */
export default async function VisitPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await publicVisitSlots(await getDb(), slug);
  if (!p) notFound();
  const days = [...new Set(p.slots.map((s) => s.day))].map((day) => ({
    day,
    label: new Date(`${day}T12:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }),
    slots: p.slots.filter((s) => s.day === day).map((s) => ({ time: s.time, start: s.start })),
  }));
  return (
    <div className="min-h-screen bg-bg">
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <Link href={`/pro/${slug}`} className="link inline-flex min-h-6 items-center gap-1 text-sm">
          <Icon name="left" size={16} /> Retour à la page de {p.orgName}
        </Link>
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">Prendre rendez-vous pour une visite</h1>
          <p className="text-muted">
            {p.orgName} se déplace chez vous pour voir les travaux et préparer un devis précis. La visite dure environ {p.durationMin} minutes.
          </p>
        </header>
        {days.length ? (
          <VisitForm slug={slug} orgName={p.orgName} days={days} />
        ) : (
          <p className="card p-6">
            Aucun créneau libre pour le moment.{" "}
            <Link className="link" href={`/pro/${slug}#demande`}>
              Envoyez plutôt une demande de devis
            </Link>
            , {p.orgName} vous recontacte.
          </p>
        )}
      </main>
    </div>
  );
}
