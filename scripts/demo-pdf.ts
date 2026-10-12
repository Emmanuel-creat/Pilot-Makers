import { writeFileSync } from "node:fs";
import { openDatabase } from "../src/lib/db";
import { seedDemo } from "../src/lib/seed";

async function main() {
  const db = await openDatabase("memory://");
  await seedDemo(db);
  const rows = await db.query<{ number: string; version: number; pdf: Uint8Array }>("SELECT number, version, pdf FROM quote_versions ORDER BY issued_at");
  const out = process.argv[2] ?? ".";
  for (const r of rows) writeFileSync(`${out}/${r.number}-v${r.version}.pdf`, r.pdf);
  console.log(rows.map((r) => r.number).join(", "));
  await db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
