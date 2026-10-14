import Link from "next/link";
import { PageHeader, Section } from "@/components/ui";
import { requirePageCtx } from "@/lib/server/session";
import { TenderUpload } from "./TenderUpload";

export const metadata = { title: "Marchés publics" };

const CUSTOMER = "coalesce(nullif(c.company_name, ''), nullif(trim(c.first_name || ' ' || c.last_name), ''), '')";

export default async function TendersPage() {
  const ctx = await requirePageCtx();
  const [customers, tenders] = await Promise.all([
    ctx.db.query<{ id: string; name: string }>(
      `SELECT c.id, ${CUSTOMER} AS name FROM customers c WHERE c.org_id=$1 AND c.archived_at IS NULL ORDER BY (c.type = 'particulier'), 2 LIMIT 500`,
      [ctx.orgId],
    ),
    ctx.db.query<{ id: string; quote_id: string; file_name: string; kind: string; matched: number; items: number; title: string; number: string | null }>(
      `SELECT t.id, t.quote_id, t.file_name, t.kind, t.matched, (SELECT count(*) FROM jsonb_object_keys(t.line_map))::int AS items, q.title, q.number
       FROM public_tenders t JOIN quotes q ON q.id=t.quote_id WHERE t.org_id=$1 ORDER BY t.created_at DESC LIMIT 50`,
      [ctx.orgId],
    ),
  ]);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Marchés publics"
        subtitle="Importez le bordereau de prix de l'acheteur : un devis est créé avec ses lots et ses postes, chiffré avec votre catalogue. Vous complétez les prix, puis téléchargez le bordereau rempli."
        back={{ href: "/app/devis", label: "Devis" }}
      />
      <div className="space-y-6">
        <Section
          title="Nouveau marché"
          description="Fichiers .xlsx, .ods ou .csv. Les colonnes Désignation, Unité, Quantité et Prix unitaire sont reconnues seules."
        >
          <TenderUpload customers={customers.filter((c) => c.name)} />
        </Section>
        {tenders.length ? (
          <Section title="Bordereaux importés">
            <ul className="divide-y divide-border text-sm" data-testid="marches">
              {tenders.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <Link href={`/app/devis/${t.quote_id}`} className="font-medium underline-offset-2 hover:underline">
                      {t.number ? `${t.number}, ` : ""}
                      {t.title || t.file_name}
                    </Link>
                    <span className="block text-muted">
                      {t.kind === "dpgf" ? "DPGF ou DQE" : "BPU"}, {t.items} poste{t.items > 1 ? "s" : ""}, {t.matched} chiffré{t.matched > 1 ? "s" : ""} avec
                      le catalogue
                    </span>
                  </span>
                  <a href={`/api/marches/${t.id}/export`} className="btn-secondary">
                    Bordereau rempli
                  </a>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
      </div>
    </div>
  );
}
