import Link from "next/link";
import { LogoutForm } from "@/components/app/LogoutForm";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/ui";
import { requirePageCtx } from "@/lib/server/session";
import { unreadNewsCount } from "@/lib/services/news";
import { can } from "@/lib/services/context";

export const metadata = { title: "Plus" };

export default async function MorePage() {
  const ctx = await requirePageCtx();
  const unread = await unreadNewsCount(ctx);
  const links = [
    ["/app/factures", "Factures", "euro"],
    ["/app/chantiers", "Chantiers", "hammer"],
    ["/app/planning", "Planning", "calendar"],
    ["/app/pointage", "Pointage", "clock"],
    ["/app/frais", "Notes de frais", "note"],
    ...(can(ctx, "costs") ? [["/app/sous-traitants", "Sous-traitants", "shield"]] : []),
    ["/app/demandes", "Demandes", "inbox"],
    ["/app/rapports", "Rapports", "chart"],
    ["/app/modeles", "Modèles de devis", "copy"],
    ["/app/entreprise", "Entreprise", "building"],
    ["/app/equipe", "Équipe", "team"],
    ["/app/abonnement", "Abonnement", "card"],
    ["/app/compte", "Mon compte", "user"],
    ["/app/boite-envoi", "E-mails envoyés", "mail"],
    ...(can(ctx, "billing") ? [["/app/banque", "Banque", "card"]] : []),
    ["/app/fin-de-journee", "Fin de journée", "clock"],
    ["/app/absence", "Mode absence", "sun"],
    ["/app/renovations", "Rénovations coordonnées", "team"],
    ["/app/facile", "Mode facile (images et voix)", "mic"],
    ["/app/entraide", "Entraide entre artisans", "team"],
    ["/app/formation", "Formation continue", "star"],
    ["/app/assistance", "Assistance", "help"],
    ["/app/menu", "Personnaliser le menu", "edit"],
    ["/app/coffre", "Coffre chiffré", "lock"],
    ["/montre", "Écran montre connectée", "clock"],
    ["/devis-hors-ligne.html", "Devis sans réseau (zone blanche)", "note"],
    ["/app/mes-retours", "Mes retours", "note"],
    ["/app/nouveautes", unread ? `Nouveautés (${unread} non lue${unread > 1 ? "s" : ""})` : "Nouveautés", "star"],
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
      <LogoutForm className="mt-4">
        <button className="btn-secondary w-full">
          <Icon name="logout" size={16} /> Déconnexion
        </button>
      </LogoutForm>
    </>
  );
}
