import { RoadmapList } from "@/components/RoadmapList";
import { getDb } from "@/lib/db";
import { listRoadmap } from "@/lib/services/roadmap";

export const dynamic = "force-dynamic";
export const metadata = { title: "Feuille de route", description: "Ce que l'équipe Pilot-Makers étudie, prépare et livre, avec les votes des utilisateurs." };

export default async function PublicRoadmapPage() {
  const items = await listRoadmap(await getDb());
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Feuille de route</h1>
      <p className="mt-2 mb-6 text-muted">Ce que nous étudions, préparons et livrons. Les sujets les plus soutenus par les utilisateurs passent en priorité.</p>
      <RoadmapList items={items} canVote={false} />
    </div>
  );
}
