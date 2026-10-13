/** Code à coller dans le site de l'artisan pour y intégrer son formulaire de demande de devis. */

const escapeAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const EMBED_HEIGHT = 760;

export function embedCode(url: string, orgName: string): string {
  const title = escapeAttr(`Demande de devis${orgName.trim() ? `, ${orgName.trim()}` : ""}`);
  return `<iframe src="${escapeAttr(url)}" title="${title}" width="100%" height="${EMBED_HEIGHT}" style="border:0;max-width:640px" loading="lazy"></iframe>`;
}
