/**
 * Produit les PDF de référence et, si `pdftoppm` est installé, une image par page,
 * dans ./apercus-pdf : de quoi vérifier d'un coup d'oeil le rendu après une modification.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderQuotePdf } from "../src/lib/pdf/quote-pdf";
import { referenceSnapshot } from "../tests/pdf-fixture";

async function main() {
  const out = "apercus-pdf";
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const s = await referenceSnapshot();
  const files: [string, Uint8Array][] = [
    ["devis-classique", await renderQuotePdf({ ...s, template: "classique" })],
    ["devis-moderne", await renderQuotePdf({ ...s, template: "moderne" })],
    ["devis-sobre", await renderQuotePdf({ ...s, template: "sobre" })],
  ];
  const hasPoppler = spawnSync("pdftoppm", ["-v"]).status === 0;
  for (const [name, pdf] of files) {
    const path = join(out, `${name}.pdf`);
    writeFileSync(path, pdf);
    if (hasPoppler) spawnSync("pdftoppm", ["-r", "70", "-png", path, join(out, name)]);
  }
  console.log(`Aperçus écrits dans ${out}${hasPoppler ? " (PDF et images)" : " (PDF seulement : installez poppler-utils pour les images)"}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
