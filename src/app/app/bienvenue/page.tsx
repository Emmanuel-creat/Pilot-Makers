import Link from "next/link";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/ui";
import { num } from "@/lib/db";
import { requirePageCtx } from "@/lib/server/session";
import { getOrganization } from "@/lib/services/organization";

export const metadata = { title: "Bienvenue" };

/** Mise en route guidée : de l'identité de l'entreprise jusqu'au premier devis envoyé. */
export default async function WelcomePage() {
  const ctx = await requirePageCtx();
  const org = await getOrganization(ctx);
  const counts = await ctx.db.query<{ customers: unknown; items: unknown; quotes: unknown; issued: unknown; sent: unknown; firstIssued: string | null }>(
    `SELECT (SELECT count(*) FROM customers WHERE org_id=$1) AS customers,
            (SELECT count(*) FROM catalog_items WHERE org_id=$1) AS items,
            (SELECT count(*) FROM quotes WHERE org_id=$1) AS quotes,
            (SELECT count(*) FROM quotes WHERE org_id=$1 AND current_version > 0) AS issued,
            (SELECT count(*) FROM quotes WHERE org_id=$1 AND (status IN ('sent','viewed','accepted','refused') OR id IN (SELECT quote_id FROM share_links WHERE org_id=$1))) AS sent,
            (SELECT id FROM quotes WHERE org_id=$1 AND current_version > 0 ORDER BY created_at LIMIT 1) AS "firstIssued"`,
    [ctx.orgId],
  );
  const c = counts[0];
  const steps = [
    {
      done: !!(org.trade_name && (org.siret || org.siren) && org.address_line1 && org.city),
      title: "Complétez l'identité de l'entreprise",
      text: "Nom, SIRET, adresse : ces mentions sont obligatoires sur vos devis.",
      href: "/app/entreprise?onglet=identite",
      cta: "Compléter",
    },
    {
      done: org.insurance_decennale ? !!(org.insurance_name && org.insurance_policy && org.insurance_area) : !!org.trade,
      title: "Renseignez votre assurance",
      text: "Pour les travaux de construction, l'assurance décennale doit figurer sur le devis.",
      href: "/app/entreprise?onglet=assurance",
      cta: "Renseigner",
    },
    {
      done: num(c.items) > 0,
      title: "Préparez votre catalogue",
      text: "Partez d'une bibliothèque par métier puis remplacez les tarifs indicatifs par les vôtres.",
      href: "/app/catalogue/bibliotheques",
      cta: "Choisir une bibliothèque",
    },
    {
      done: num(c.issued) > 0,
      title: "Créez votre premier devis",
      text: "Choisissez le client, ajoutez vos prestations, vérifiez, émettez.",
      href: "/app/devis/nouveau",
      cta: "Créer un devis",
    },
    {
      done: num(c.sent) > 0,
      title: "Envoyez-le à votre client",
      text: "Par e-mail depuis le devis, ou par un lien à transmettre par SMS. Le client le consulte et l'accepte en ligne, ou le signe sur votre tablette.",
      href: c.firstIssued ? `/app/devis/${c.firstIssued}` : "/app/devis",
      cta: "Envoyer",
    },
  ];
  const done = steps.filter((s) => s.done).length;
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Bienvenue sur Pilot-Makers" subtitle={`${done} étape(s) sur ${steps.length} terminée(s)`} />
      <div className="mb-6 h-2 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full bg-accent transition-all" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ol className="space-y-3">
        {steps.map((s, i) => (
          <li key={s.title} className={`card flex items-start gap-4 p-4 ${s.done ? "opacity-70" : ""}`}>
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${s.done ? "bg-success-soft text-success" : "bg-accent-soft text-accent"}`}
            >
              {s.done ? <Icon name="check" size={16} /> : i + 1}
            </span>
            <div className="flex-1">
              <h2 className="font-medium">{s.title}</h2>
              <p className="text-sm text-muted">{s.text}</p>
            </div>
            {!s.done ? (
              <Link href={s.href} className="btn-secondary shrink-0 text-sm">
                {s.cta}
              </Link>
            ) : null}
          </li>
        ))}
      </ol>
      <p className="mt-6 text-center text-sm">
        <Link href="/app" className="link">
          Aller au tableau de bord
        </Link>
      </p>
    </div>
  );
}
