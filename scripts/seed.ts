import { openDatabase } from "../src/lib/db";
import { DEMO_EMAIL, DEMO_PASSWORD, ADMIN_EMAIL, seedDemo } from "../src/lib/seed";

async function main() {
  const db = await openDatabase();
  const r = await seedDemo(db);
  console.log(r.created ? "Données de démonstration créées." : "Les données de démonstration existent déjà.");
  console.log(`Compte artisan : ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`Compte administrateur : ${ADMIN_EMAIL} / ${DEMO_PASSWORD}`);
  await db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
