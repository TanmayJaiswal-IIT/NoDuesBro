import { and, eq } from "drizzle-orm";
import { getDb, type Database } from "../db";
import {
  auditEvents,
  caseMessages,
  cases,
  mailboxes,
  merchantAllowlist,
  messages,
  standingOrders,
  users,
} from "../db/schema";
import { proposeCandidates } from "./rules";

export async function fileNewCandidates(db: Database, userId: string, mailboxId: string): Promise<void> {
  const [mailbox] = await db.select().from(mailboxes).where(eq(mailboxes.id, mailboxId)).limit(1);
  if (!mailbox) return;

  const [orders] = await db
    .select()
    .from(standingOrders)
    .where(eq(standingOrders.userId, userId))
    .limit(1);
  if (!orders) return;

  const allowlist = await db.select().from(merchantAllowlist);
  const stored = await db.select().from(messages).where(eq(messages.mailboxId, mailboxId));
  const linked = await db
    .select({ messageId: caseMessages.messageId })
    .from(caseMessages)
    .innerJoin(messages, eq(messages.id, caseMessages.messageId))
    .where(eq(messages.mailboxId, mailboxId));
  const linkedIds = new Set(linked.map((row) => row.messageId));

  const proposed = proposeCandidates({
    messages: stored.map((message) => ({
      id: message.id,
      fromName: message.fromName,
      fromAddress: message.fromAddress,
      subject: message.subject,
      bodyText: message.bodyText,
      receivedAt: message.receivedAt,
    })),
    allowlist,
    deskNow: mailbox.deskNow,
    returnHorizonDays: orders.returnHorizonDays,
    renewalHorizonDays: orders.renewalHorizonDays,
    duplicateWindowHours: orders.duplicateWindowHours,
    renewalIgnoreUnderMinor: orders.renewalIgnoreUnderMinor,
  });

  let offset = 0;
  for (const candidate of proposed) {
    if (candidate.messageIds.some((id) => linkedIds.has(id))) continue;

    const createdAt = new Date(mailbox.deskNow.getTime() + offset * 1000);
    offset += 1;
    const [inserted] = await db
      .insert(cases)
      .values({
        userId,
        kind: candidate.kind,
        status: candidate.status,
        merchantKey: candidate.merchantKey,
        amountMinor: candidate.amountMinor,
        currency: candidate.currency,
        orderId: candidate.orderId,
        deadlineOn: candidate.deadlineOn,
        counterpartyEmail: candidate.counterpartyEmail,
        evidenceQuote: candidate.evidenceQuote,
        confidence: "1.000",
        refuseReason: candidate.refuseReason,
        createdAt,
        updatedAt: createdAt,
      })
      .returning();

    await db.insert(caseMessages).values(
      candidate.messageIds.map((messageId) => ({
        caseId: inserted.id,
        messageId,
      })),
    );
    await db.insert(auditEvents).values({
      userId,
      caseId: inserted.id,
      type: candidate.status === "refused" ? "refused" : "case_created",
      payload: candidate.status === "refused" ? { reason: candidate.refuseReason } : {},
    });

    for (const messageId of candidate.messageIds) linkedIds.add(messageId);
  }
}

export async function rerunDetection(): Promise<void> {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.isDemo, true)).limit(1);
  if (!user) return;

  const [mailbox] = await db
    .select()
    .from(mailboxes)
    .where(and(eq(mailboxes.userId, user.id), eq(mailboxes.provider, "seed")))
    .limit(1);
  if (!mailbox) return;

  await fileNewCandidates(db, user.id, mailbox.id);
}
