import { openDatabase } from "../src/lib/db";
import { rollbackMigrations } from "../src/lib/db/migrate";

/** Retour arrière des dernières migrations : `npm run db:rollback -- 2` défait les deux plus récentes. */
async function main() {
  const steps = Number(process.argv[2] ?? 1) || 1;
  const db = await openDatabase();
  const undone = await rollbackMigrations(db, steps);
  console.log(`Migrations défaites : ${undone.join(", ")}.`);
  await db.close();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
