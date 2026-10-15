import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkSheet } from "@/app/app/catalogue/base-ouverte/WorkSheet";
import { fmtDate } from "@/components/ui";
import { getDb } from "@/lib/db";
import { LICENSE } from "@/lib/open-works";
import { getWork } from "@/lib/services/open-works";

export const metadata = { title: "Fiche d'ouvrage" };
export const dynamic = "force-dynamic";

export default async function PublicWorkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const w = await getWork(await getDb(), id).catch(() => null);
  if (!w) notFound();
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-12">
      <Link href="/ouvrages" className="link text-sm">
        Base ouverte des ouvrages
      </Link>
      <h1 className="text-2xl font-semibold text-balance">{w.title}</h1>
      <p className="text-sm text-muted">
        {w.tradeLabel}, par {w.unit}. {w.author}, mise à jour le {fmtDate(w.updatedAt)}. {LICENSE.name}.
      </p>
      <WorkSheet work={w} />
    </div>
  );
}
