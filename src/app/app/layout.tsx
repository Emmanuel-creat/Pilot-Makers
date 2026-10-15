import { OfflineOutbox } from "@/components/app/OfflineOutbox";
import { PageFeedback } from "@/components/app/PageFeedback";
import { Shell } from "@/components/app/Shell";
import { requirePageCtx } from "@/lib/server/session";
import { getMenu } from "@/lib/services/menu-prefs";
import { unreadNewsCount } from "@/lib/services/news";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePageCtx();
  const org = await ctx.db.query<{ trade_name: string }>("SELECT trade_name FROM organizations WHERE id=$1", [ctx.orgId]);
  const menu = await getMenu(ctx);
  const item = (m: { href: string; label: string; icon: string }) => ({ href: m.href, label: m.label, icon: m.icon });
  return (
    <Shell
      ctx={ctx}
      orgName={org[0]?.trade_name ?? ""}
      unreadNews={await unreadNewsCount(ctx)}
      menu={{ main: menu.main.map(item), mobile: menu.mobile.map(item) }}
    >
      {children}
      {ctx.supportAccess ? null : <PageFeedback />}
      {ctx.supportAccess ? null : <OfflineOutbox />}
    </Shell>
  );
}
