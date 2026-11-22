import { and, desc, eq, sql } from "drizzle-orm";
import { closeDb, getDb } from "../lib/db";
import { approvals, auditEvents, caseMessages, cases, drafts, merchantAllowlist, messages, receipts, sentMail } from "../lib/db/schema";
import { approveCase, dismissCase, snoozeCase } from "../lib/desk/commands";
import { DESK_NOW, swiggyDraft } from "../lib/mail/content";
import { resetDemoSeed } from "../lib/mail/seed";
import { kolkataDateKey } from "../lib/money";
import { evaluatePolicy } from "../lib/pipeline/policy";

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

async function assertSeedDraftsPass() {
  const ready = await getDb().select().from(cases).where(eq(cases.status, "ready"));
  for (const row of ready) {
    const draft = await latestDraft(row.id);
    const [allowlist] = await getDb()
      .select()
      .from(merchantAllowlist)
      .where(eq(merchantAllowlist.merchantKey, row.merchantKey));
    const evidence = await getDb()
      .select({ subject: messages.subject, bodyText: messages.bodyText })
      .from(caseMessages)
      .innerJoin(messages, eq(caseMessages.messageId, messages.id))
      .where(eq(caseMessages.caseId, row.id));
    const decision = evaluatePolicy({
      kind: row.kind,
      amountMinor: row.amountMinor,
      orderId: row.orderId,
      evidenceQuote: row.evidenceQuote,
      to: draft.toAddress,
      subject: draft.subject,
      body: draft.body,
      supportAddress: allowlist?.supportAddress ?? null,
      sourceText: evidence.map((item) => `${item.subject}\n${item.bodyText}`).join("\n"),
    });
    assert(decision.ok, `${row.merchantKey} seed draft failed policy`);
  }
}

async function latestDraft(caseId: string) {
  const [draft] = await getDb()
    .select()
    .from(drafts)
    .where(eq(drafts.caseId, caseId))
    .orderBy(desc(drafts.createdAt))
    .limit(1);
  return draft;
}

async function rejectBadDraft(
  caseId: string,
  createdAt: string,
  patch: Partial<{ toAddress: string; body: string }>,
) {
  const [bad] = await getDb()
    .insert(drafts)
    .values({
      caseId,
      toAddress: patch.toAddress ?? swiggyDraft.toAddress,
      subject: swiggyDraft.subject,
      body: patch.body ?? swiggyDraft.body,
      createdAt: new Date(createdAt),
    })
    .returning();

  const before = await getDb().select().from(receipts);
  const result = await approveCase(caseId, bad.id);
  const after = await getDb().select().from(receipts);
  assert(!result.ok, "a blocked draft was sent");
  assert(after.length === before.length, "a blocked draft wrote a receipt");
  const [still] = await getDb().select().from(cases).where(eq(cases.id, caseId));
  assert(still.status === "ready", "a blocked draft changed the case status");
}

async function main() {
  const db = getDb();
  await resetDemoSeed(db);
  await assertSeedDraftsPass();

  const ready = await db.select().from(cases).where(eq(cases.status, "ready"));
  const swiggy = ready.find((row) => row.merchantKey === "swiggy");
  const amazon = ready.find((row) => row.merchantKey === "amazon.in");
  const hotstar = ready.find((row) => row.merchantKey === "jiohotstar");
  assert(Boolean(swiggy && amazon && hotstar), "seed cases missing");

  const swiggyDraftRow = await latestDraft(swiggy!.id);
  const approved = await approveCase(swiggy!.id, swiggyDraftRow.id);
  assert(approved.ok, `approve failed: ${approved.ok ? "" : approved.reason}`);
  assert((await readySum()) === 399800, `ready sum after approve was ${await readySum()}`);

  const swiggyReceipts = await db.select().from(receipts).where(eq(receipts.caseId, swiggy!.id));
  assert(swiggyReceipts.length === 1, "swiggy receipt missing");
  assert(swiggyReceipts[0].amountMinor === 48600, "swiggy receipt amount");
  assert(swiggyReceipts[0].provider === "demo", "swiggy receipt provider");
  assert(swiggyReceipts[0].bodySnapshot === swiggyDraft.body, "receipt body differs from the draft");
  assert(kolkataDateKey(swiggyReceipts[0].sentAt) === "2026-11-23", "receipt is not dated 23 Nov");

  const [approval] = await db.select().from(approvals).where(eq(approvals.caseId, swiggy!.id));
  assert(Boolean(approval), "approval row missing");
  const [mail] = await db.select().from(sentMail).where(eq(sentMail.receiptId, swiggyReceipts[0].id));
  assert(mail?.body === swiggyDraft.body, "sent mail body differs from the draft");

  await dismissCase(amazon!.id);
  const [amazonRow] = await db.select().from(cases).where(eq(cases.id, amazon!.id));
  assert(amazonRow.status === "dismissed", "amazon was not dismissed");
  assert((await readySum()) === 149900, `ready sum after dismiss was ${await readySum()}`);

  await snoozeCase(hotstar!.id);
  const [hotstarRow] = await db.select().from(cases).where(eq(cases.id, hotstar!.id));
  assert(hotstarRow.status === "snoozed", "hotstar was not snoozed");
  const expectedSnooze = new Date(DESK_NOW).getTime() + 24 * 60 * 60 * 1000;
  assert(hotstarRow.snoozeUntil?.getTime() === expectedSnooze, "snooze time is not 24 hours later");
  assert((await readySum()) === 0, `ready sum after snooze was ${await readySum()}`);

  const audits = await db.select().from(auditEvents).where(eq(auditEvents.caseId, swiggy!.id));
  assert(audits.some((row) => row.type === "approved"), "approved audit missing");
  assert(audits.some((row) => row.type === "sent"), "sent audit missing");

  await resetDemoSeed(db);
  const [freshSwiggy] = await db
    .select()
    .from(cases)
    .where(and(eq(cases.merchantKey, "swiggy"), eq(cases.status, "ready")));
  await rejectBadDraft(freshSwiggy.id, "2026-11-23T02:05:00.000Z", {
    body: `${swiggyDraft.body}\nOTP`,
  });
  await rejectBadDraft(freshSwiggy.id, "2026-11-23T02:06:00.000Z", {
    body: `${swiggyDraft.body}\n4111111111111111`,
  });
  await rejectBadDraft(freshSwiggy.id, "2026-11-23T02:07:00.000Z", {
    toAddress: "evil@example.com",
  });

  await resetDemoSeed(db);
  assert((await readySum()) === 448400, "seed was not restored");
  console.log("Day 2 check passed.");
  await closeDb();
}

main().catch(async (error) => {
  console.error(error);
  await closeDb();
  process.exit(1);
});
