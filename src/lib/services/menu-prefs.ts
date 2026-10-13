import { badRequest } from "@/lib/http";
import { MENU_MODULES, MOBILE_SLOTS, resolveMenu, type MenuModule } from "@/lib/menu";
import type { Ctx } from "./context";
import { audit, can } from "./context";

/** Briques auxquelles le rôle de l'utilisateur donne accès. */
export function menuAllowed(ctx: Ctx) {
  return (m: MenuModule) => !m.needs || can(ctx, m.needs);
}

export async function getMenu(ctx: Ctx) {
  const r = await ctx.db.query<{ menu: unknown }>("SELECT menu FROM users WHERE id=$1", [ctx.userId]);
  return resolveMenu(r[0]?.menu ?? null, menuAllowed(ctx));
}

/** Enregistre le menu choisi ; null revient au menu d'origine. */
export async function saveMenu(ctx: Ctx, raw: { main: string[]; mobile: string[] } | null) {
  if (raw === null) {
    await ctx.db.query("UPDATE users SET menu=NULL WHERE id=$1", [ctx.userId]);
    return getMenu(ctx);
  }
  const known = new Set(MENU_MODULES.map((m) => m.key));
  if (!Array.isArray(raw.main) || !Array.isArray(raw.mobile) || [...raw.main, ...raw.mobile].some((k) => typeof k !== "string" || !known.has(k))) {
    throw badRequest("Menu invalide");
  }
  if (raw.mobile.length > MOBILE_SLOTS) throw badRequest(`${MOBILE_SLOTS} raccourcis au plus dans la barre du téléphone`);
  const menu = { main: [...new Set(raw.main)], mobile: [...new Set(raw.mobile)] };
  await ctx.db.query("UPDATE users SET menu=$2 WHERE id=$1", [ctx.userId, JSON.stringify(menu)]);
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "account.menu", data: { count: menu.main.length }, ip: ctx.ip });
  return getMenu(ctx);
}
