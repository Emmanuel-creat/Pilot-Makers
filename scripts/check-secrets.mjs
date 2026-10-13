// Vérifie qu'aucun fichier suivi par git ne contient de secret ; échoue avec la liste des emplacements.
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { forbiddenFile, scanText } from "./secrets-rules.mjs";

const SKIP = /(^|\/)(package-lock\.json|secrets-rules\.mjs)$|\.(png|jpe?g|webp|gif|ico|pdf|woff2?|ttf|zip)$/i;
const files = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" }).split("\0").filter(Boolean);
const problems = [];
for (const f of files) {
  if (forbiddenFile(f)) {
    problems.push(`${f} : fichier d'environnement à retirer du dépôt`);
    continue;
  }
  if (SKIP.test(f)) continue;
  let st;
  try {
    st = statSync(f);
  } catch {
    continue;
  }
  if (!st.isFile() || st.size > 2_000_000) continue;
  for (const p of scanText(readFileSync(f, "utf8"))) problems.push(`${f}:${p.line} ${p.label}`);
}
if (problems.length) {
  console.error(
    "Secrets possibles dans le dépôt :\n" +
      problems.join("\n") +
      "\nRetirez-les, puis changez-les chez le fournisseur : ils doivent être considérés comme divulgués.",
  );
  process.exit(1);
}
console.log(`Aucun secret détecté (${files.length} fichiers).`);
