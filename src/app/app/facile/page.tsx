import { PageHeader } from "@/components/ui";
import { daySentence, tilesFor } from "@/lib/easy-mode";
import { requirePageCtx } from "@/lib/server/session";
import { can } from "@/lib/services/context";
import { todaySummary } from "@/lib/services/today";
import { EasyMode } from "./EasyMode";

export const metadata = { title: "Mode facile" };

/** Mode facile : pictogrammes, voix et phrases courtes, pour qui préfère parler plutôt qu'écrire. */
export default async function EasyModePage() {
  const ctx = await requirePageCtx();
  const day = await todaySummary(ctx);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Mode facile" subtitle="Touchez une image, ou parlez. Le bouton Écouter lit le texte à voix haute." />
      <EasyMode tiles={tilesFor({ billing: can(ctx, "billing") })} sentence={daySentence(day)} />
    </div>
  );
}
