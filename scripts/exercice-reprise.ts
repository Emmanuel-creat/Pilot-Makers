/**
 * Exercice annuel de reprise après sinistre : sauvegarde complète de la base, restauration dans une base neuve,
 * preuve que les deux sont identiques (lignes et empreinte de chaque table, journal scellé), temps mesurés.
 *
 * Usage : npm run reprise [-- --rapport docs/REPRISE.md] [-- --sauvegarde chemin.json]
 * - REPRISE_SOURCE_URL : base à sauvegarder (par défaut, une base de démonstration créée pour l'exercice) ;
 * - REPRISE_CIBLE_URL : base neuve où restaurer (par défaut, une base embarquée en mémoire).
 * La procédure complète est décrite dans docs/PLAN-REPRISE.md.
 */
import { writeFileSync } from "node:fs";
import { openDatabase } from "../src/lib/db";
import { dumpDatabase, fingerprint, restoreDatabase } from "../src/lib/db/backup";
import { seedDemo } from "../src/lib/seed";
import { verifySealed } from "../src/lib/services/sealed-journal";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const REPORT = arg("rapport") ?? "docs/REPRISE.md";
/** Objectif de durée de reprise de la base (hors remise en route de l'hébergement), en secondes */
const RTO_SECONDS = 15 * 60;

async function main() {
  const t0 = performance.now();
  const sourceUrl = process.env.REPRISE_SOURCE_URL;
  const source = await openDatabase(sourceUrl || "memory://");
  if (!sourceUrl) await seedDemo(source);
  const before = await verifySealed(source);

  const t1 = performance.now();
  const dump = await dumpDatabase(source);
  const json = JSON.stringify(dump);
  const out = arg("sauvegarde");
  if (out) writeFileSync(out, json);
  const t2 = performance.now();

  const target = await openDatabase(process.env.REPRISE_CIBLE_URL || "memory://");
  const restored = await restoreDatabase(target, JSON.parse(json));
  const t3 = performance.now();

  const [a, b] = [await fingerprint(source), await fingerprint(target)];
  const different = Object.keys({ ...a, ...b }).filter((k) => a[k]?.sha256 !== b[k]?.sha256);
  const after = await verifySealed(target);
  const t4 = performance.now();
  await source.close();
  await target.close();

  const s = (ms: number) => `${(ms / 1000).toFixed(1).replace(".", ",")} s`;
  const restoreSeconds = (t3 - t2 + (t4 - t3)) / 1000;
  const ok = different.length === 0 && after.ok && after.count === before.count && restoreSeconds < RTO_SECONDS;
  const date = new Date().toISOString().slice(0, 10).split("-").reverse().join("/");
  const md = [
    "# Exercice de reprise après sinistre",
    "",
    `Dernier exercice : ${date}. Résultat : ${ok ? "réussi" : "ÉCHEC"}.`,
    "",
    `Base sauvegardée : ${sourceUrl ? "base désignée par REPRISE_SOURCE_URL" : "base de démonstration créée pour l'exercice"}.`,
    "",
    "| Étape | Résultat |",
    "| --- | --- |",
    `| Sauvegarde | ${dump.tables.length} tables, ${restored.rows} lignes, ${(json.length / 1024).toFixed(0)} Ko, ${s(t2 - t1)} |`,
    `| Restauration dans une base neuve, migrations comprises | ${s(t3 - t2)} |`,
    `| Vérification des empreintes | ${different.length ? `${different.length} table(s) différente(s) : ${different.slice(0, 5).join(", ")}` : "toutes identiques"}, ${s(t4 - t3)} |`,
    `| Journal scellé | ${after.ok ? `intact, ${after.count} entrée(s)` : `rompu : ${after.reason}`} |`,
    `| Durée de reprise de la base | ${s(restoreSeconds * 1000)} pour un objectif de ${RTO_SECONDS / 60} minutes |`,
    `| Durée totale de l'exercice | ${s(t4 - t0)} |`,
    "",
    "Procédure et responsabilités : voir PLAN-REPRISE.md.",
    "",
  ].join("\n");
  writeFileSync(REPORT, md);
  if (!arg("rapport"))
    writeFileSync(
      "src/lib/quality/reprise.json",
      JSON.stringify(
        {
          date: new Date().toISOString().slice(0, 10),
          ok,
          tables: dump.tables.length,
          restoreSeconds: Math.round(restoreSeconds * 10) / 10,
          rtoMinutes: RTO_SECONDS / 60,
        },
        null,
        2,
      ) + "\n",
    );
  console.log(md);
  if (!ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
