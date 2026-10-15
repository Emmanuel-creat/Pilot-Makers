import Link from "next/link";
import { Logo } from "@/components/Icon";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <Logo /> Pilot-Makers
          </Link>
          <nav className="flex items-center gap-2 text-sm">
            <Link href="/#tarifs" className="btn-ghost hidden sm:inline-flex">
              Tarifs
            </Link>
            <Link href="/aide" className="btn-ghost hidden sm:inline-flex">
              Aide
            </Link>
            <Link href="/connexion" className="btn-ghost">
              Connexion
            </Link>
            <Link href="/inscription" className="btn-primary">
              Essai gratuit
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap gap-x-6 gap-y-2 px-4 py-6 text-sm text-muted">
          <span>Pilot-Makers, BAILLY emmanuel</span>
          <Link href="/ouvrages" className="hover:text-ink">
            Base des ouvrages
          </Link>
          <Link href="/format-devis-ouvert" className="hover:text-ink">
            Format Devis ouvert
          </Link>
          <Link href="/indice-activite" className="hover:text-ink">
            Indice de l&apos;activité
          </Link>
          <Link href="/trouver-un-artisan" className="hover:text-ink">
            Trouver un artisan
          </Link>
          <Link href="/aide" className="hover:text-ink">
            Centre d'aide
          </Link>
          <Link href="/feuille-de-route" className="hover:text-ink">
            Feuille de route
          </Link>
          <Link href="/cgu" className="hover:text-ink">
            Conditions d'utilisation
          </Link>
          <Link href="/confidentialite" className="hover:text-ink">
            Confidentialité
          </Link>
          <Link href="/sous-traitants" className="hover:text-ink">
            Sous-traitants
          </Link>
          <Link href="/cookies" className="hover:text-ink">
            Cookies
          </Link>
          <Link href="/mentions-legales" className="hover:text-ink">
            Mentions légales
          </Link>
          <Link href="/securite" className="hover:text-ink">
            Sécurité
          </Link>
          <Link href="/statut" className="hover:text-ink">
            État du service
          </Link>
          <Link href="/qualite" className="hover:text-ink">
            Qualité
          </Link>
        </div>
      </footer>
    </div>
  );
}
