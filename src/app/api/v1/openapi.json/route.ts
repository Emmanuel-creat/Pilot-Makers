import { openApiSpec } from "@/lib/openapi";

/** Description de l'API au format OpenAPI 3.1, publique pour les outils d'automatisation. */
export function GET(req: Request) {
  return Response.json(openApiSpec(new URL(req.url).origin), {
    headers: { "cache-control": "public, max-age=3600", "access-control-allow-origin": "*" },
  });
}
