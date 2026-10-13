import { PageHeader } from "@/components/ui";
import { requirePageCtx } from "@/lib/server/session";
import { getMenu } from "@/lib/services/menu-prefs";
import { MenuEditor } from "./MenuEditor";

export const metadata = { title: "Personnaliser le menu" };

export default async function MenuPage() {
  const ctx = await requirePageCtx();
  const menu = await getMenu(ctx);
  const plain = (list: typeof menu.main) => list.map((m) => m.key);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Personnaliser le menu"
        subtitle="Gardez seulement les briques qui vous servent, dans l'ordre qui vous convient. Les autres restent accessibles depuis Plus et la recherche."
      />
      <MenuEditor
        modules={menu.available.map((m) => ({ key: m.key, label: m.label, icon: m.icon, hint: m.hint }))}
        initialMain={plain(menu.main)}
        initialMobile={plain(menu.mobile)}
      />
    </div>
  );
}
