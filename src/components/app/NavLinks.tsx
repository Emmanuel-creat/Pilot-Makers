"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/Icon";

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  /** Pastille de compteur (éléments non lus) */
  badge?: number;
}

export function NavLinks({ items, compact = false }: { items: NavItem[]; compact?: boolean }) {
  const path = usePathname();
  return (
    <>
      {items.map((it) => {
        const active = it.href === "/app" ? path === "/app" : path.startsWith(it.href);
        if (compact) {
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${active ? "text-accent" : "text-muted"}`}
              aria-current={active ? "page" : undefined}
            >
              <Icon name={it.icon} size={22} />
              {it.label}
            </Link>
          );
        }
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm ${active ? "bg-accent-soft font-medium text-accent" : "text-ink hover:bg-surface-2"}`}
          >
            <Icon name={it.icon} />
            <span className="flex-1">{it.label}</span>
            {it.badge ? (
              <span className="rounded-full bg-accent px-1.5 text-xs font-semibold text-white dark:text-[#0d1520]">
                {it.badge}
                <span className="sr-only"> non lue{it.badge > 1 ? "s" : ""}</span>
              </span>
            ) : null}
          </Link>
        );
      })}
    </>
  );
}
