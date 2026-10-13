import { Shell } from "@/components/app/Shell";
import { requirePageCtx } from "@/lib/server/session";
import { unreadNewsCount } from "@/lib/services/news";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePageCtx();
  const org = await ctx.db.query<{ trade_name: string }>("SELECT trade_name FROM organizations WHERE id=$1", [ctx.orgId]);
  return (
    <Shell ctx={ctx} orgName={org[0]?.trade_name ?? ""} unreadNews={await unreadNewsCount(ctx)}>
      {children}
    </Shell>
  );
}
