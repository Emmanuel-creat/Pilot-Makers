// Tests de mutation des calculs : chaque mutant change un opérateur ou une constante dans le code source,
// puis les tests des calculs sont rejoués. Un mutant « tué » fait échouer au moins un test ; un mutant
// « survivant » révèle un comportement que les tests ne vérifient pas.
//
// Usage : node scripts/mutation.mjs [--files a.ts,b.ts] [--max 200] [--report docs/MUTATION.md] [--tests a.test.ts,b.test.ts] [--dry]
// Le fichier d'origine est toujours restauré, même en cas d'interruption.

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .join(" ")
    .split("--")
    .filter(Boolean)
    .map((a) => a.trim().split(/\s+/)),
);
const FILES = (args.files ?? "src/lib/calc/decimal.ts,src/lib/calc/rounding.ts,src/lib/calc/engine.ts,src/lib/calc/groups.ts,src/lib/calc/format.ts").split(
  ",",
);
const MAX = Number(args.max ?? 400);
const REPORT = args.report ?? "docs/MUTATION.md";
/** Résumé lu par la page publique /qualite */
const SUMMARY = args.summary ?? "src/lib/quality/mutation.json";

/**
 * Mutants équivalents : le code muté donne exactement les mêmes résultats pour toute entrée possible, aucun test
 * ne peut donc les tuer. Clé « fichier:ligne:opérateur », avec la raison.
 */
const EQUIVALENT = {
  "src/lib/calc/decimal.ts:38:supérieur en supérieur ou égal": "avec une échelle nulle, raw.slice(raw.length) donne déjà une chaîne vide",
  "src/lib/calc/decimal.ts:40:inférieur en inférieur ou égal": "compléter une partie décimale déjà à la bonne longueur ne la change pas",
  "src/lib/calc/decimal.ts:56:inférieur en inférieur ou égal": "un dénominateur nul est refusé juste avant",
  "src/lib/calc/decimal.ts:56:constante entière plus un": "un dénominateur nul est refusé juste avant",
  "src/lib/calc/decimal.ts:60:inférieur en inférieur ou égal": "un numérateur nul donne zéro avec ou sans signe",
  "src/lib/calc/decimal.ts:60:constante entière plus un": "un numérateur nul donne zéro avec ou sans signe",
  "src/lib/calc/rounding.ts:25:inférieur ou égal en inférieur": "un prix nul s'arrondit à zéro, renvoyé tel quel ensuite",
  "src/lib/calc/rounding.ts:25:constante entière plus un": "un prix d'un dix-millième s'arrondit à zéro, et le prix d'origine est alors renvoyé",
  "src/lib/calc/rounding.ts:28:constante entière plus un": "un prix arrondi est un multiple du pas, au moins 1000 : jamais égal à 1",
  "src/lib/calc/rounding.ts:92:inférieur ou égal en inférieur": "un total nul a une cible égale au total et sort à la ligne suivante",
  "src/lib/calc/rounding.ts:94:inférieur ou égal en inférieur": "une cible nulle vient d'un total sous 10 euros, que 3 % de remise ne ramènent jamais à zéro",
};
// Tests purs des calculs, sans base de données : chaque mutant les rejoue en deux secondes environ.
const TESTS = (args.tests ?? "tests/calc.test.ts,tests/calc-couverture.test.ts,tests/arrondis.test.ts,tests/calc-mutation.test.ts").split(",");

/** Opérateurs de mutation : motif recherché et remplacement. */
const OPERATORS = [
  [/ \+ /g, " - ", "addition en soustraction"],
  [/ - /g, " + ", "soustraction en addition"],
  [/ \* /g, " / ", "multiplication en division"],
  [/ < /g, " <= ", "inférieur en inférieur ou égal"],
  [/ <= /g, " < ", "inférieur ou égal en inférieur"],
  [/ > /g, " >= ", "supérieur en supérieur ou égal"],
  [/ >= /g, " > ", "supérieur ou égal en supérieur"],
  [/ === /g, " !== ", "égalité inversée"],
  [/ !== /g, " === ", "différence inversée"],
  [/ && /g, " || ", "et en ou"],
  [/ \|\| /g, " && ", "ou en et"],
  [/Math\.round\(/g, "Math.floor(", "arrondi en troncature"],
  [/\b(\d+)n\b/g, (m, d) => `${BigInt(d) + 1n}n`, "constante entière plus un"],
  [/return true\b/g, "return false", "vrai en faux"],
  [/return false\b/g, "return true", "faux en vrai"],
];

const skip = (line) => {
  const t = line.trim();
  return !t || t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") || t.startsWith("import ") || t.startsWith("export type");
};

function mutants(file, src) {
  const lines = src.split("\n");
  const out = [];
  lines.forEach((line, i) => {
    if (skip(line)) return;
    // Les chaînes de caractères ne sont pas mutées.
    const code = line.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, (s) => " ".repeat(s.length));
    for (const [re, rep, label] of OPERATORS) {
      for (const m of code.matchAll(new RegExp(re.source, re.flags))) {
        const replacement = typeof rep === "function" ? m[0].replace(new RegExp(re.source), rep) : rep;
        const mutated = line.slice(0, m.index) + replacement + line.slice(m.index + m[0].length);
        out.push({
          file,
          line: i + 1,
          label,
          original: line.trim(),
          mutated: mutated.trim(),
          apply: () => lines.map((l, j) => (j === i ? mutated : l)).join("\n"),
        });
      }
    }
  });
  return out;
}

function testsPass() {
  // Un mutant qui boucle sans fin est arrêté au bout de 60 secondes et compte comme détecté.
  const r = spawnSync(
    process.execPath,
    ["node_modules/vitest/vitest.mjs", "run", ...TESTS, "--pool=threads", "--no-isolate", "--bail=1", "--reporter=dot", "--testTimeout=10000"],
    {
      encoding: "utf8",
      stdio: "pipe",
      timeout: 60000,
      killSignal: "SIGKILL",
    },
  );
  return r.status === 0;
}

const originals = new Map(FILES.map((f) => [f, readFileSync(f, "utf8")]));
const restore = () => originals.forEach((src, f) => writeFileSync(f, src));
process.on("SIGINT", () => {
  restore();
  process.exit(130);
});

if ("dry" in args) {
  for (const f of FILES) console.log(`${f} : ${mutants(f, originals.get(f)).length} mutants`);
  process.exit(0);
}

if (!testsPass()) {
  console.error("Les tests des calculs échouent avant toute mutation : corrigez-les d'abord.");
  process.exit(1);
}

const all = FILES.flatMap((f) => mutants(f, originals.get(f))).slice(0, MAX);
const results = [];
try {
  for (const [n, m] of all.entries()) {
    writeFileSync(m.file, m.apply());
    const killed = !testsPass();
    restore();
    results.push({ ...m, killed });
    process.stdout.write(`${n + 1}/${all.length} ${killed ? "tué" : "SURVIVANT"} ${m.file}:${m.line} ${m.label}\n`);
  }
} finally {
  restore();
}

const byFile = FILES.map((f) => {
  const r = results.filter((x) => x.file === f);
  const killed = r.filter((x) => x.killed).length;
  return { f, total: r.length, killed, score: r.length ? Math.round((killed / r.length) * 100) : 100 };
});
const killed = results.filter((r) => r.killed).length;
const score = results.length ? Math.round((killed / results.length) * 100) : 100;
const key = (r) => `${r.file}:${r.line}:${r.label}`;
const survivors = results.filter((r) => !r.killed && !EQUIVALENT[key(r)]);
const equivalent = results.filter((r) => !r.killed && EQUIVALENT[key(r)]);
const effective = results.length - equivalent.length;
const adjusted = effective ? Math.round((killed / effective) * 100) : 100;
const md = [
  "# Tests de mutation des calculs",
  "",
  `Rapport produit par \`node scripts/mutation.mjs\` le ${new Date().toISOString().slice(0, 10)}.`,
  "",
  `Score global : ${score} % (${killed} mutants tués sur ${results.length}).`,
  `Hors mutants équivalents : ${adjusted} % (${killed} sur ${effective}).`,
  "",
  "| Fichier | Mutants | Tués | Score |",
  "| --- | ---: | ---: | ---: |",
  ...byFile.map((b) => `| ${b.f} | ${b.total} | ${b.killed} | ${b.score} % |`),
  "",
  survivors.length ? "## Mutants survivants" : "Aucun mutant survivant.",
  "",
  ...survivors.map((s) => `- ${s.file}:${s.line}, ${s.label} : \`${s.original}\` devient \`${s.mutated}\``),
  "",
  ...(equivalent.length ? ["## Mutants équivalents", "", ...equivalent.map((s) => `- ${s.file}:${s.line}, ${s.label} : ${EQUIVALENT[key(s)]}`), ""] : []),
].join("\n");
writeFileSync(REPORT, md);
if (!args.files && !args.tests && !args.max)
  writeFileSync(
    SUMMARY,
    JSON.stringify({ date: new Date().toISOString().slice(0, 10), total: results.length, killed, equivalent: equivalent.length, score, adjusted }, null, 2) +
      "\n",
  );
console.log(`Score de mutation : ${score} % (${killed}/${results.length}). Rapport : ${REPORT}`);
