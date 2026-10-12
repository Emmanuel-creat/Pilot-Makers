import Link from "next/link";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/ui";
import { requirePageCtx } from "@/lib/server/session";
import { logoutAction } from "@/app/actions";

export const metadata = { title: "Plus" };

export default async function MorePage() {
  const ctx = await requirePageCtx();
  const links = [
    ["/app/factures", "Factures", "euro"],
    ["/app/demandes", "Demandes", "inbox"],
    ["/app/rapports", "Rapports", "chart"],
    ["/app/modeles", "Modèles de devis", "copy"],
    ["/app/entreprise", "Entreprise", "building"],
    ["/app/equipe", "Équipe", "team"],
    ["/app/abonnement", "Abonnement", "card"],
    ["/app/compte", "Mon compte", "user"],
    ["/app/boite-envoi", "E-mails envoyés", "mail"],
    ["/app/assistance", "Assistance", "help"],
    ...(ctx.isPlatformAdmin && !ctx.supportAccess ? [["/admin", "Administration", "shield"]] : []),
  ];
  return (
    <>
      <PageHeader title="Plus" subtitle={ctx.email} />
      <ul className="card divide-y divide-line">
        {links.map(([href, label, icon]) => (
          <li key={href}>
            <Link href={href} className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface-2">
              <Icon name={icon} className="text-muted" />
              <span className="flex-1">{label}</span>
              <Icon name="right" size={16} className="text-muted" />
            </Link>
          </li>
        ))}
      </ul>
      <form action={logoutAction} className="mt-4">
        <button className="btn-secondary w-full">
          <Icon name="logout" size={16} /> Déconnexion
        </button>
      </form>
    </>
  );
}
