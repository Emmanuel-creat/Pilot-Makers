/** Point d'entrée de Next.js pour suivre les erreurs non gérées des pages et des routes. */

export async function register() {}

export async function onRequestError(err: unknown, request: { path: string; method: string }, context: { routeType: string }) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportError } = await import("@/lib/monitoring");
  await reportError(err, { path: request.path.split("?")[0], method: request.method, kind: `server.${context.routeType}` });
}
