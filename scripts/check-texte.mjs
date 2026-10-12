// Vérifie qu'aucun fichier du dépôt ne contient de tiret cadratin, d'emoji ni de mention d'outil de génération automatique.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = process.cwd();
const SKIP = new Set(["node_modules", ".next", ".git", "data", "out", "coverage", "test-results", "playwright-report", "apercus-pdf"]);
const EXT = new Set([".ts", ".tsx", ".js", ".mjs", ".css", ".md", ".json", ".yml", ".yaml", ".html", ".txt", ".sql", ".example"]);
const EM_DASH = new RegExp(String.fromCharCode(0x2014));
// Motifs assemblés par morceaux pour que ce fichier ne se signale pas lui-même.
const SIGLES = new RegExp("\\b(" + ["I" + "A", "A" + "I"].join("|") + ")\\b");
const NOMS = new RegExp(["intelligence " + "artificielle", "cla" + "ude", "anthro" + "pic", "chat" + "g" + "pt", "\\bg" + "pt", "open" + "ai", "\\bl" + "lm\\b"].join("|"), "i");
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;

const problems = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full);
    else if (EXT.has(extname(name)) || name.startsWith(".env")) {
      if (name === "package-lock.json") continue;
      const lines = readFileSync(full, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (EM_DASH.test(line)) problems.push(`${full.slice(ROOT.length + 1)}:${i + 1} tiret cadratin`);
        if (EMOJI.test(line)) problems.push(`${full.slice(ROOT.length + 1)}:${i + 1} emoji`);
        if (SIGLES.test(line) || NOMS.test(line)) problems.push(`${full.slice(ROOT.length + 1)}:${i + 1} mention interdite`);
      });
    }
  }
}
walk(ROOT);
if (problems.length) {
  console.error("Textes non conformes :\n" + problems.join("\n"));
  process.exit(1);
}
console.log("Textes conformes : aucun tiret cadratin, emoji ni mention interdite.");
