import { and, desc, eq, sql } from "drizzle-orm";
import { closeDb, getDb } from "../lib/db";
import {
  auditEvents,
  caseMessages,
  cases,
  drafts,
  messages,
  receipts,
  standingOrders,
  users,
} from "../lib/db/schema";
import { approveCase, dismissCase, resetDemoDesk, updateStandingOrders } from "../lib/desk/commands";
import { getDesk } from "../lib/desk/query";
import { LOOKALIKE_REASON, resetDemoSeed } from "../lib/mail/seed";
import { kolkataDateKey, maskDigitRuns } from "../lib/money";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function readySum() {
  const [row] = await getDb()
    .select({ total: sql<string>`coalesce(sum(${cases.amountMinor}), 0)` })
    .from(cases)
    .where(eq(cases.status, "ready"));
  return Number(row.total);
}

async function statusSnapshot() {
  const rows = await getDb().select({ id: cases.id, status: cases.status }).from(cases);
  return rows
    .map((row) => `${row.id}:${row.status}`)
    .sort()
    .join("|");
}

async function demoOrders() {
  const [user] = await getDb().select().from(users).where(eq(users.isDemo, true)).limit(1);
  assert(Boolean(user), "demo user missing");
  const [orders] = await getDb()
    .select()
    .from(standingOrders)
    .where(eq(standingOrders.userId, user.id))
    .limit(1);
  assert(Boolean(orders), "standing orders missing");
  return { user, orders };
}

function mailText(value: unknown): string {
  return JSON.stringify(value).replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    "",
  );
}

async function main() {
  const db = getDb();
  await resetDemoSeed(db);

  assert((await readySum()) === 448400, "opening ready sum was not 448400");

  const refusedRows = await db.select().from(cases).where(eq(cases.status, "refused"));
  assert(refusedRows.length === 1, `refused count was ${refusedRows.length}`);
  const refused = refusedRows[0];
  assert(refused.amountMinor === 1500000, `refused amount was ${refused.amountMinor}`);
  assert(refused.refuseReason === LOOKALIKE_REASON, "refuse reason did not match");
  assert(
    refused.counterpartyEmail === "refunds@amazon-secure-claims.net",
    "refused case used the Amazon support address",
  );

  const refusedDrafts = await db.select().from(drafts).where(eq(drafts.caseId, refused.id));
  assert(refusedDrafts.length === 0, "refused case has a draft");

  const [link] = await db
    .select({ externalId: messages.externalId, bodyText: messages.bodyText })
    .from(caseMessages)
    .innerJoin(messages, eq(messages.id, caseMessages.messageId))
    .where(eq(caseMessages.caseId, refused.id));
  assert(link?.externalId === "m5", "refused case is not linked to m5");
  assert(link.bodyText.includes(refused.evidenceQuote), "evidence quote is not in the source");

  const refusedAudits = await db
    .select()
    .from(auditEvents)
    .where(and(eq(auditEvents.caseId, refused.id), eq(auditEvents.type, "refused")));
  assert(refusedAudits.length === 1, "refused audit missing");

  const desk = await getDesk();
  assert(desk.heroLabel === "₹4,484", `hero was ${desk.heroLabel}`);
  assert(desk.cases.length === 3, `waiting count was ${desk.cases.length}`);
  assert(desk.subtitle.includes("3 waiting"), `subtitle was ${desk.subtitle}`);
  assert(desk.refused.length === 1, "held-back card missing");
  assert(desk.refused[0].senderName === "Amazon Refund Desk", "held-back sender was wrong");
  assert(desk.refused[0].amountLabel === "₹15,000", "held-back amount was wrong");
  assert(desk.refused[0].reason === LOOKALIKE_REASON, "held-back reason was wrong");
  assert(desk.orders.returnHorizonDays === 7, "return horizon was not 7");
  assert(desk.orders.renewalHorizonDays === 7, "renewal horizon was not 7");
  assert(desk.orders.duplicateWindowHours === 48, "duplicate window was not 48");
  assert(desk.orders.ignoreUnderRupees === 0, "ignore-under was not 0");
  assert(!/\d{12,}/.test(mailText(desk)), "desk payload has a long digit run");

  const masked = maskDigitRuns(
    "card 4111111111111111 ending 4412 and order 404-2288193-7715200",
  );
  assert(
    masked === "card •••• ending 4412 and order 404-2288193-7715200",
    `maskDigitRuns returned ${masked}`,
  );

  const beforeOrders = await statusSnapshot();
  const saved = await updateStandingOrders({
    returnHorizonDays: 14,
    renewalHorizonDays: 7,
    duplicateWindowHours: 48,
    ignoreUnderRupees: 0,
  });
  assert(saved.ok, "standing orders did not save");
  assert((await statusSnapshot()) === beforeOrders, "saving orders changed a case");
  const savedOrders = await demoOrders();
  assert(savedOrders.orders.returnHorizonDays === 14, "return horizon did not save");
  assert(savedOrders.orders.askBeforeSend === true, "ask before send was turned off");
  const orderAudits = await db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.type, "standing_orders_updated"));
  assert(orderAudits.length === 1, "standing orders audit missing");

  const rejected = await updateStandingOrders({
    askBeforeSend: false,
    returnHorizonDays: 3,
    renewalHorizonDays: 3,
    duplicateWindowHours: 3,
    ignoreUnderRupees: 10,
  });
  assert(!rejected.ok, "ask_before_send false was accepted");
  const afterReject = await demoOrders();
  assert(afterReject.orders.askBeforeSend === true, "ask before send changed");
  assert(afterReject.orders.returnHorizonDays === 14, "a rejected patch wrote the horizon");

  let constraintRejected = false;
  try {
    await db
      .update(standingOrders)
      .set({ askBeforeSend: false })
      .where(eq(standingOrders.userId, afterReject.user.id));
  } catch {
    constraintRejected = true;
  }
  assert(constraintRejected, "the database accepted ask_before_send false");
  const afterConstraint = await demoOrders();
  assert(afterConstraint.orders.askBeforeSend === true, "the check constraint stored false");
  assert(afterConstraint.orders.returnHorizonDays === 14, "the failed update changed the horizon");

  const approveAttempt = await approveCase(refused.id, "00000000-0000-0000-0000-000000000000");
  assert(!approveAttempt.ok, "a refused case was approved");
  assert((await db.select().from(receipts)).length === 1, "approving the lookalike wrote a receipt");

  await dismissCase(refused.id);
  const [dismissed] = await db.select().from(cases).where(eq(cases.id, refused.id));
  assert(dismissed.status === "dismissed", `refused case status was ${dismissed.status}`);
  assert((await readySum()) === 448400, "dismissing the lookalike changed the hero");

  const [swiggy] = await db.select().from(cases).where(eq(cases.merchantKey, "swiggy"));
  const [swiggyDraftRow] = await db
    .select()
    .from(drafts)
    .where(eq(drafts.caseId, swiggy.id))
    .orderBy(desc(drafts.createdAt))
    .limit(1);
  const sent = await approveCase(swiggy.id, swiggyDraftRow.id);
  assert(sent.ok, "swiggy approval failed");

  await resetDemoDesk();
  assert((await readySum()) === 448400, "reset did not restore the ready sum");
  const restoredReceipts = await db.select().from(receipts);
  assert(restoredReceipts.length === 1, `reset left ${restoredReceipts.length} receipts`);
  assert(restoredReceipts[0].amountMinor === 39900, "reset receipt amount was wrong");
  assert(
    kolkataDateKey(restoredReceipts[0].sentAt) === "2026-11-17",
    "reset receipt was not 17 Nov",
  );
  const restoredRefused = await db.select().from(cases).where(eq(cases.status, "refused"));
  assert(restoredRefused.length === 1, "reset did not restore the refused case");
  const restoredOrders = await demoOrders();
  assert(restoredOrders.orders.returnHorizonDays === 7, "reset did not restore the return horizon");
  assert(restoredOrders.orders.renewalHorizonDays === 7, "reset did not restore the renewal horizon");
  assert(restoredOrders.orders.duplicateWindowHours === 48, "reset did not restore the duplicate window");
  assert(restoredOrders.orders.renewalIgnoreUnderMinor === 0, "reset did not restore ignore-under");
  assert(restoredOrders.orders.askBeforeSend === true, "reset turned ask before send off");

  await resetDemoSeed(db);
  assert((await readySum()) === 448400, "final seed ready sum was not 448400");
  console.log("Day 3 check passed.");
  await closeDb();
}

main().catch(async (error) => {
  console.error(error);
  await closeDb();
  process.exit(1);
});
