import { closeDb, getDb } from "../lib/db";
import { resetDemoSeed } from "../lib/mail/seed";

async function main() {
  await resetDemoSeed(getDb());
  console.log("Seeded Asha's morning desk.");
  await closeDb();
}

main().catch(async (error) => {
  console.error(error);
  await closeDb();
  process.exit(1);
});
