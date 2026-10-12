import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, Logo } from "@/components/Icon";
import { Notice } from "@/components/ui";
import type { Ctx } from "@/lib/services/context";
import { logoutAction, stopSupportAction } from "@/app/actions";
import { NavLinks, type NavItem } from "./NavLinks";
import { ThemeToggle } from "./ThemeToggle";

const MAIN: NavItem[] = [
  { href: "/app", label: "Tableau de bord", icon: "home" },
  { href: "/app/devis", label: "Devis", icon: "quote" },
  { href: "/app/modeles", label: "Modèles de devis", icon: "copy" },
  { href: "/app/factures", label: "Factures", icon: "euro" },
  { href: "/app/clients", label: "Clients", icon: "users" },
  { href: "/app/catalogue", label: "Catalogue", icon: "box" },
];
const SETTINGS: NavItem[] = [
  { href: "/app/entreprise", label: "Entreprise", icon: "building" },
  { href: "/app/equipe", label: "Équipe", icon: "team" },
  { href: "/app/abonnement", label: "Abonnement", icon: "card" },
  { href: "/app/compte", label: "Mon compte", icon: "user" },
  { href: "/app/boite-envoi", label: "E-mails envoyés", icon: "mail" },
  { href: "/app/assistance", label: "Assistance", icon: "help" },
];
const MOBILE: NavItem[] = [
  { href: "/app", label: "Accueil", icon: "home" },
  { href: "/app/devis", label: "Devis", icon: "quote" },
  { href: "/app/clients", label: "Clients", icon: "users" },
  { href: "/app/catalogue", label: "Catalogue", icon: "box" },
  { href: "/app/plus", label: "Plus", icon: "menu" },
];

export function Shell({ ctx, orgName, children }: { ctx: Ctx; orgName: string; children: ReactNode }) {
  const admin: NavItem[] = ctx.isPlatformAdmin && !ctx.supportAccess ? [{ href: "/admin", label: "Administration", icon: "shield" }] : [];
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-line bg-surface lg:flex">
        <div className="flex items-center gap-2 px-5 py-4">
          <Logo />
          <span className="font-semibold">Pilot-Makers</span>
        </div>
        <div className="px-3">
          <Link href="/app/devis/nouveau" className="btn-primary w-full">
            <Icon name="plus" /> Créer un devis
          </Link>
        </div>
        <nav className="mt-4 flex flex-1 flex-col gap-0.5 overflow-y-auto px-3" aria-label="Navigation principale">
          <NavLinks items={MAIN} />
          <div className="mt-5 mb-1 px-3 text-xs font-semibold tracking-wide text-muted uppercase">Réglages</div>
          <NavLinks items={[...SETTINGS, ...admin]} />
        </nav>
        <div className="border-t border-line p-3">
          <div className="truncate px-2 text-sm font-medium">{orgName}</div>
          <div className="truncate px-2 text-xs text-muted">{ctx.email}</div>
          <div className="mt-2 flex items-center justify-between">
            <form action={logoutAction}>
              <button className="btn-ghost px-2 text-sm" type="submit">
                <Icon name="logout" /> Déconnexion
              </button>
            </form>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col pb-20 lg:pb-0">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-surface/95 px-4 py-2.5 backdrop-blur">
          <Link href="/app" className="flex items-center gap-2 lg:hidden" aria-label="Accueil">
            <Logo size={26} />
          </Link>
          <form action="/app/recherche" className="relative max-w-md flex-1">
            <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" size={16} />
            <input name="q" type="search" placeholder="Rechercher un devis, un client, une prestation" className="field py-1.5 pl-9" aria-label="Recherche globale" />
          </form>
          <Link href="/app/devis/nouveau" className="btn-primary px-3 lg:hidden" aria-label="Créer un devis">
            <Icon name="plus" />
          </Link>
          <div className="hidden lg:block">
            <ThemeToggle />
          </div>
        </header>
        {ctx.supportAccess ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-warning/30 bg-warning-soft px-4 py-2 text-sm">
            <span>Accès support en lecture seule. Motif : {ctx.supportAccess.reason}</span>
            <form action={stopSupportAction}>
              <button className="btn-secondary min-h-8 py-1">Quitter l'accès support</button>
            </form>
          </div>
        ) : ctx.entitlements.notice ? (
          <div className="border-b border-line px-4 py-2">
            <Notice tone={ctx.entitlements.readOnly ? "danger" : "info"}>
              {ctx.entitlements.notice}{" "}
              {!ctx.entitlements.readOnly ? (
                <Link className="link" href="/app/abonnement">
                  Gérer l'abonnement
                </Link>
              ) : null}
            </Notice>
          </div>
        ) : null}
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface lg:hidden" aria-label="Navigation mobile">
        <NavLinks items={MOBILE} compact />
      </nav>
    </div>
  );
}

export const SETTINGS_LINKS = SETTINGS;
