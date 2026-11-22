import { eq, inArray } from "drizzle-orm";
import type { Database } from "../db";
import {
  approvals,
  auditEvents,
  caseMessages,
  cases,
  drafts,
  mailboxes,
  merchantAllowlist,
  messages,
  receipts,
  sentMail,
  standingOrders,
  users,
} from "../db/schema";
import {
  DESK_NOW,
  DEMO_EMAIL,
  allowlist,
  amazonDraft,
  hotstarDraft,
  paperlaneSent,
  seedMessages,
  swiggyDraft,
} from "./content";

const amazonQuote =
  "You can return this item by 26 Nov 2026 for a refund to your original payment method.";
const swiggyQuote = "Order: SW184423";
const hotstarQuote = "Your JioHotstar Premium annual plan will renew on 26 Nov 2026.";
const paperlaneQuote = "Your Paperlane monthly subscription renews on 18 Nov 2026 for ₹399.";

export async function resetDemoSeed(db: Database) {
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.isDemo, true));
  const userIds = existing.map((user) => user.id);

  if (userIds.length > 0) {
    const existingCases = await db
      .select({ id: cases.id })
      .from(cases)
      .where(inArray(cases.userId, userIds));
    const caseIds = existingCases.map((row) => row.id);

    if (caseIds.length > 0) {
      const existingReceipts = await db
        .select({ id: receipts.id })
        .from(receipts)
        .where(inArray(receipts.caseId, caseIds));
      const receiptIds = existingReceipts.map((row) => row.id);
      if (receiptIds.length > 0) {
        await db.delete(sentMail).where(inArray(sentMail.receiptId, receiptIds));
      }
      await db.delete(receipts).where(inArray(receipts.caseId, caseIds));
      await db.delete(approvals).where(inArray(approvals.caseId, caseIds));
      await db.delete(drafts).where(inArray(drafts.caseId, caseIds));
      await db.delete(caseMessages).where(inArray(caseMessages.caseId, caseIds));
      await db.delete(auditEvents).where(inArray(auditEvents.userId, userIds));
      await db.delete(cases).where(inArray(cases.userId, userIds));
    } else {
      await db.delete(auditEvents).where(inArray(auditEvents.userId, userIds));
    }

    const mailboxRows = await db
      .select({ id: mailboxes.id })
      .from(mailboxes)
      .where(inArray(mailboxes.userId, userIds));
    const mailboxIds = mailboxRows.map((row) => row.id);
    if (mailboxIds.length > 0) {
      await db.delete(messages).where(inArray(messages.mailboxId, mailboxIds));
    }
    await db.delete(mailboxes).where(inArray(mailboxes.userId, userIds));
    await db.delete(standingOrders).where(inArray(standingOrders.userId, userIds));
    await db.delete(users).where(inArray(users.id, userIds));
  }

  await db.delete(merchantAllowlist);

  const [user] = await db
    .insert(users)
    .values({
      email: DEMO_EMAIL,
      displayName: "Asha",
      isDemo: true,
      clerkUserId: null,
    })
    .returning();

  const [mailbox] = await db
    .insert(mailboxes)
    .values({
      userId: user.id,
      provider: "seed",
      emailAddress: DEMO_EMAIL,
      deskNow: new Date(DESK_NOW),
    })
    .returning();

  const insertedMessages = await db
    .insert(messages)
    .values(
      seedMessages.map((message) => ({
        mailboxId: mailbox.id,
        externalId: message.externalId,
        fromName: message.fromName,
        fromAddress: message.fromAddress,
        toAddress: message.toAddress,
        subject: message.subject,
        bodyText: message.bodyText,
        receivedAt: new Date(message.receivedAt),
      })),
    )
    .returning();

  const byExternalId = new Map(insertedMessages.map((message) => [message.externalId, message]));

  await db.insert(merchantAllowlist).values(
    allowlist.map((row) => ({
      merchantKey: row.merchantKey,
      domains: [...row.domains],
      supportAddress: row.supportAddress,
    })),
  );

  await db.insert(standingOrders).values({
    userId: user.id,
    askBeforeSend: true,
    renewalIgnoreUnderMinor: 0,
    returnHorizonDays: 7,
    renewalHorizonDays: 7,
    duplicateWindowHours: 48,
  });

  const [amazonCase] = await db
    .insert(cases)
    .values({
      userId: user.id,
      kind: "return_window",
      status: "ready",
      merchantKey: "amazon.in",
      amountMinor: 249900,
      currency: "INR",
      orderId: "404-2288193-7715200",
      deadlineOn: "2026-11-26",
      counterpartyEmail: amazonDraft.toAddress,
      evidenceQuote: amazonQuote,
      confidence: "1.000",
      createdAt: new Date("2026-11-23T02:00:00.000Z"),
      updatedAt: new Date("2026-11-23T02:00:00.000Z"),
    })
    .returning();

  const [swiggyCase] = await db
    .insert(cases)
    .values({
      userId: user.id,
      kind: "duplicate_charge",
      status: "ready",
      merchantKey: "swiggy",
      amountMinor: 48600,
      currency: "INR",
      orderId: "SW184423",
      counterpartyEmail: swiggyDraft.toAddress,
      evidenceQuote: swiggyQuote,
      confidence: "1.000",
      createdAt: new Date("2026-11-23T02:00:01.000Z"),
      updatedAt: new Date("2026-11-23T02:00:01.000Z"),
    })
    .returning();

  const [hotstarCase] = await db
    .insert(cases)
    .values({
      userId: user.id,
      kind: "renewal",
      status: "ready",
      merchantKey: "jiohotstar",
      amountMinor: 149900,
      currency: "INR",
      deadlineOn: "2026-11-26",
      counterpartyEmail: hotstarDraft.toAddress,
      evidenceQuote: hotstarQuote,
      confidence: "1.000",
      createdAt: new Date("2026-11-23T02:00:02.000Z"),
      updatedAt: new Date("2026-11-23T02:00:02.000Z"),
    })
    .returning();

  const [paperlaneCase] = await db
    .insert(cases)
    .values({
      userId: user.id,
      kind: "renewal",
      status: "sent",
      merchantKey: "paperlane",
      amountMinor: 39900,
      currency: "INR",
      deadlineOn: "2026-11-18",
      counterpartyEmail: paperlaneSent.toAddress,
      evidenceQuote: paperlaneQuote,
      confidence: "1.000",
      createdAt: new Date("2026-11-17T02:35:00.000Z"),
      updatedAt: new Date("2026-11-17T02:35:00.000Z"),
    })
    .returning();

  await db.insert(caseMessages).values([
    { caseId: amazonCase.id, messageId: byExternalId.get("m1")!.id },
    { caseId: swiggyCase.id, messageId: byExternalId.get("m2")!.id },
    { caseId: swiggyCase.id, messageId: byExternalId.get("m3")!.id },
    { caseId: hotstarCase.id, messageId: byExternalId.get("m4")!.id },
    { caseId: paperlaneCase.id, messageId: byExternalId.get("m6")!.id },
  ]);

  await db.insert(drafts).values([
    {
      caseId: amazonCase.id,
      ...amazonDraft,
      createdAt: new Date("2026-11-23T02:00:00.000Z"),
    },
    {
      caseId: swiggyCase.id,
      ...swiggyDraft,
      createdAt: new Date("2026-11-23T02:00:01.000Z"),
    },
    {
      caseId: hotstarCase.id,
      ...hotstarDraft,
      createdAt: new Date("2026-11-23T02:00:02.000Z"),
    },
  ]);

  const [receipt] = await db
    .insert(receipts)
    .values({
      caseId: paperlaneCase.id,
      approvalId: null,
      provider: "demo",
      toAddress: paperlaneSent.toAddress,
      subject: paperlaneSent.subject,
      bodySnapshot: paperlaneSent.body,
      amountMinor: 39900,
      currency: "INR",
      sentAt: new Date(paperlaneSent.sentAt),
    })
    .returning();

  await db.insert(sentMail).values({
    receiptId: receipt.id,
    toAddress: paperlaneSent.toAddress,
    subject: paperlaneSent.subject,
    body: paperlaneSent.body,
    sentAt: new Date(paperlaneSent.sentAt),
  });
}
