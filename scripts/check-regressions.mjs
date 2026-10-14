// Vérifie le registre des bogues corrigés : identifiants uniques, champs remplis et test permanent toujours présent.
import { existsSync, readFileSync } from "node:fs";

const list = JSON.parse(readFileSync(new URL("../src/lib/quality/regressions.json", import.meta.url), "utf8"));
const errors = [];
const ids = new Set();
for (const r of list) {
  if (!/^R-\d{3,}$/.test(r.id ?? "")) errors.push(`Identifiant invalide : ${r.id}`);
  if (ids.has(r.id)) errors.push(`Identifiant en double : ${r.id}`);
  ids.add(r.id);
  for (const k of ["date", "kind", "title", "fix", "file", "test"]) if (!r[k]) errors.push(`${r.id} : champ ${k} manquant`);
  if (r.kind && !["produit", "test"].includes(r.kind)) errors.push(`${r.id} : type inconnu ${r.kind}`);
  if (r.file && !existsSync(new URL(`../${r.file}`, import.meta.url))) {
    errors.push(`${r.id} : fichier de test introuvable ${r.file}`);
    continue;
  }
  const src = r.file ? readFileSync(new URL(`../${r.file}`, import.meta.url), "utf8") : "";
  const quoted = [`"${r.test}"`, `'${r.test}'`, `\`${r.test}\``];
  if (r.test && !quoted.some((q) => src.includes(q))) errors.push(`${r.id} : test « ${r.test} » absent de ${r.file}`);
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`Registre des bogues : ${list.length} correction${list.length > 1 ? "s" : ""}, chacune couverte par un test permanent.`);
