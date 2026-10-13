import { RoadmapList } from "@/components/RoadmapList";
import { PageHeader } from "@/components/ui";
import { requirePageCtx } from "@/lib/server/session";
import { listRoadmap } from "@/lib/services/roadmap";

export const metadata = { title: "Feuille de route" };

export default async function AppRoadmapPage() {
  const ctx = await requirePageCtx();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Feuille de route" subtitle="Soutenez les sujets qui vous seraient le plus utiles. Votre vote est anonyme ; vous pouvez le retirer." />
      <RoadmapList items={await listRoadmap(ctx.db, ctx.userId)} canVote={!ctx.supportAccess} />
    </div>
  );
}
