import { openDatabase } from "../src/lib/db";

async function main() {
  const db = await openDatabase();
  console.log("Migrations appliquées.");
  await db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
