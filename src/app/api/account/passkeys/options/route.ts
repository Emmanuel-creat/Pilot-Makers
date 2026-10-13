import { api } from "@/lib/server/session";
import { beginPasskeyRegistration } from "@/lib/services/passkeys";

/** Options d'enregistrement d'une nouvelle clé d'accès pour le compte connecté. */
export const POST = api(({ ctx }) => beginPasskeyRegistration(ctx));
