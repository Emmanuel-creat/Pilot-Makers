import { CHANGELOG, type ChangelogEntry } from "@/lib/changelog";
import { featureEnabled } from "@/lib/features";
import { one } from "@/lib/db";
import type { Ctx } from "./context";
import { parisDate } from "./quotes";

export interface NewsItem {
  id: string;
  date: string;
  title: string;
  text: string;
  href?: string;
  unread: boolean;
}

/** Nouveautés visibles par l'utilisateur : journal livré avec l'application et notes de version publiées. */
export async function listNews(ctx: Ctx): Promise<NewsItem[]> {
  const [org, user, releases] = await Promise.all([
    one<{ id: string; feature_flags: unknown }>(ctx.db, "SELECT id, feature_flags FROM organizations WHERE id=$1", [ctx.orgId]),
    one<{ seen: Date | string }>(ctx.db, "SELECT coalesce(changelog_seen_at, created_at) AS seen FROM users WHERE id=$1", [ctx.userId]),
    ctx.db.query<{ id: string; version: string; notes: string; created_at: Date | string }>(
      "SELECT id, version, notes, created_at FROM app_releases ORDER BY created_at DESC LIMIT 20",
    ),
  ]);
  const seen = user ? new Date(user.seen) : new Date(0);
  const seenDay = parisDate(seen);
  const visible = (e: ChangelogEntry) => !e.feature || (org ? featureEnabled(org, e.feature) : false);
  const items: NewsItem[] = [
    ...CHANGELOG.filter(visible).map((e) => ({ id: e.id, date: e.date, title: e.title, text: e.text, href: e.href, unread: e.date > seenDay })),
    ...releases.map((r) => {
      const t = new Date(r.created_at);
      return {
        id: `release-${r.id}`,
        date: t.toISOString().slice(0, 10),
        title: `Version ${r.version}`,
        text: r.notes,
        unread: t.getTime() > seen.getTime(),
      };
    }),
  ];
  return items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export async function unreadNewsCount(ctx: Ctx) {
  return (await listNews(ctx)).filter((n) => n.unread).length;
}

export async function markNewsSeen(ctx: Ctx) {
  await ctx.db.query("UPDATE users SET changelog_seen_at=now() WHERE id=$1", [ctx.userId]);
}
