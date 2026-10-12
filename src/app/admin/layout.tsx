import Link from "next/link";
import { Logo } from "@/components/Icon";
import { requireAdminPage } from "@/lib/server/session";

export const dynamic = "force-dynamic";
export const metadata = { title: { default: "Administration", template: "%s | Administration Pilot-Makers" }, robots: { index: false } };

const NAV = [
  ["/admin", "Vue d'ensemble"],
  ["/admin/comptes", "Comptes"],
  ["/admin/offres", "Offres"],
  ["/admin/erreurs", "Erreurs"],
  ["/admin/assistance", "Assistance"],
  ["/admin/journal", "Journal"],
  ["/admin/versions", "Versions"],
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireAdminPage();
  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/admin" className="flex items-center gap-2 font-semibold">
            <Logo size={24} /> Administration
          </Link>
          <nav className="flex flex-1 flex-wrap gap-1 text-sm">
            {NAV.map(([href, label]) => (
              <Link key={href} href={href} className="rounded-md px-2.5 py-1.5 text-muted hover:bg-surface-2 hover:text-ink">
                {label}
              </Link>
            ))}
          </nav>
          <span className="text-xs text-muted">{ctx.email}</span>
          <Link href="/app" className="link text-sm">
            Retour à l'application
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
