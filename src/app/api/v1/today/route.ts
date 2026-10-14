import { apiV1 } from "@/lib/server/api-v1";
import { todaySummary } from "@/lib/services/today";

/** Chantiers du jour et devis en attente, pour un widget d'écran d'accueil. */
export const GET = apiV1(async ({ ctx }) => todaySummary(ctx));
