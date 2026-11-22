import { eq, sql } from "drizzle-orm";
import { closeDb, getDb } from "../lib/db";
import { cases, messages, receipts, users } from "../lib/db/schema";
import { swiggyDraft } from "../lib/mail/content";
import { resetDemoSeed } from "../lib/mail/seed";
import { formatInr, kolkataDateKey } from "../lib/money";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  assert(formatInr(249900) === "₹2,499", `formatInr(249900) was ${formatInr(249900)}`);
  assert(formatInr(448400) === "₹4,484", `formatInr(448400) was ${formatInr(448400)}`);

  const db = getDb();
  await resetDemoSeed(db);
  await resetDemoSeed(db);

  const [user] = await db.select().from(users).where(eq(users.isDemo, true)).limit(1);
  assert(Boolean(user), "demo user missing");

  const [hero] = await db
    .select({ total: sql<string>`coalesce(sum(${cases.amountMinor}), 0)` })
    .from(cases)
    .where(eq(cases.status, "ready"));
  assert(Number(hero.total) === 448400, `ready sum was ${hero.total}`);

  const ready = await db.select().from(cases).where(eq(cases.status, "ready"));
  assert(ready.length === 3, `ready count was ${ready.length}`);

  const storedMessages = await db.select().from(messages);
  assert(storedMessages.length === 8, `message count was ${storedMessages.length}`);

  const storedReceipts = await db.select().from(receipts);
  assert(storedReceipts.length === 1, `receipt count was ${storedReceipts.length}`);
  assert(storedReceipts[0].amountMinor === 39900, "receipt amount was not 39900");
  assert(
    kolkataDateKey(storedReceipts[0].sentAt) === "2026-11-17",
    `receipt date was ${kolkataDateKey(storedReceipts[0].sentAt)}`,
  );
  assert(storedReceipts[0].approvalId === null, "Paperlane receipt should have no approval");

  const swiggy = ready.find((row) => row.merchantKey === "swiggy");
  assert(Boolean(swiggy), "swiggy case missing");
  assert(swiggyDraft.body.includes("SW184422"), "draft is missing the first Swiggy order");
  assert(swiggyDraft.body.includes("reverse only SW184423"), "draft does not reverse only the later order");
  assert(!swiggyDraft.body.includes("reverse both"), "draft asks to reverse both charges");

  console.log("Seed check passed.");
  await closeDb();
}

main().catch(async (error) => {
  console.error(error);
  await closeDb();
  process.exit(1);
});
