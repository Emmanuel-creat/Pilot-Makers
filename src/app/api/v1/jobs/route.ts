import { apiV1 } from "@/lib/server/api-v1";
import { apiListJobs } from "@/lib/services/public-api";

export const GET = apiV1(async ({ ctx, url }) => apiListJobs(ctx, { status: url.searchParams.get("status") ?? undefined }));
