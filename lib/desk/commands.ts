import { and, desc, eq, or } from "drizzle-orm";
import { getDb, withTransaction } from "../db";
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
import { resetDemoSeed } from "../mail/seed";
import { rupeesToMinor } from "../money";
import { evaluatePolicy } from "../pipeline/policy";
import { rerunDetection } from "../pipeline/run";

export type CommandResult = { ok: true } | { ok: false; reason: string };

const NOT_READY = "NOT_READY";

async function demoContext(caseId: string) {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.isDemo, true)).limit(1);
  if (!user) return null;

  const [row] = await db
    .select({
      caseId: cases.id,
      userId: cases.userId,
      status: cases.status,
      kind: cases.kind,
      amountMinor: cases.amountMinor,
      currency: cases.currency,
      orderId: cases.orderId,
      evidenceQuote: cases.evidenceQuote,
      merchantKey: cases.merchantKey,
      deskNow: mailboxes.deskNow,
    })
    .from(cases)
    .innerJoin(mailboxes, eq(mailboxes.userId, cases.userId))
    .where(and(eq(cases.id, caseId), eq(cases.userId, user.id), eq(mailboxes.provider, "seed")))
    .limit(1);

  return row ?? null;
}

async function writeAudit(
  userId: string,
  caseId: string | null,
  type: string,
  payload: Record<string, unknown>,
) {
  await getDb().insert(auditEvents).values({ userId, caseId, type, payload });
}

export async function approveCase(caseId: string, draftId: string): Promise<CommandResult> {
  const current = await demoContext(caseId);
  if (!current || current.status !== "ready") {
    return { ok: false, reason: "This case is no longer waiting." };
  }

  const db = getDb();
  const caseDrafts = await db
    .select()
    .from(drafts)
    .where(eq(drafts.caseId, caseId))
    .orderBy(desc(drafts.createdAt));
  const latest = caseDrafts[0];
  const draft = caseDrafts.find((row) => row.id === draftId);
  if (!draft || !latest || latest.id !== draft.id) {
    return { ok: false, reason: "This draft is out of date." };
  }

  const [allowlist] = await db
    .select()
    .from(merchantAllowlist)
    .where(eq(merchantAllowlist.merchantKey, current.merchantKey))
    .limit(1);

  const evidence = await db
    .select({ subject: messages.subject, bodyText: messages.bodyText })
    .from(caseMessages)
    .innerJoin(messages, eq(caseMessages.messageId, messages.id))
    .where(eq(caseMessages.caseId, caseId));

  const sourceText = evidence.map((row) => `${row.subject}\n${row.bodyText}`).join("\n");
  const decision = evaluatePolicy({
    kind: current.kind,
    amountMinor: current.amountMinor,
    orderId: current.orderId,
    evidenceQuote: current.evidenceQuote,
    to: draft.toAddress,
    subject: draft.subject,
    body: draft.body,
    supportAddress: allowlist?.supportAddress ?? null,
    sourceText,
  });
  if (!decision.ok) return decision;

  try {
    const receiptId = await withTransaction(async (tx) => {
      const updated = await tx
        .update(cases)
        .set({ status: "sent", updatedAt: current.deskNow })
        .where(and(eq(cases.id, caseId), eq(cases.status, "ready")))
        .returning({ id: cases.id });
      if (updated.length === 0) throw new Error(NOT_READY);

      const [approval] = await tx
        .insert(approvals)
        .values({
          caseId,
          draftId: draft.id,
          userId: current.userId,
          approvedAt: current.deskNow,
        })
        .returning();

      const [receipt] = await tx
        .insert(receipts)
        .values({
          caseId,
          approvalId: approval.id,
          provider: "demo",
          toAddress: draft.toAddress,
          subject: draft.subject,
          bodySnapshot: draft.body,
          amountMinor: current.amountMinor,
          currency: current.currency,
          sentAt: current.deskNow,
        })
        .returning();

      await tx.insert(sentMail).values({
        receiptId: receipt.id,
        toAddress: draft.toAddress,
        subject: draft.subject,
        body: draft.body,
        sentAt: current.deskNow,
      });

      return receipt.id;
    });

    await writeAudit(current.userId, caseId, "approved", { draftId: draft.id });
    await writeAudit(current.userId, caseId, "sent", { draftId: draft.id, receiptId });
    return { ok: true };
  } catch (error) {
    if (error instanceof Error && error.message === NOT_READY) {
      return { ok: false, reason: "This case is no longer waiting." };
    }
    await writeAudit(current.userId, caseId, "send_failed", {
      message: error instanceof Error ? error.message : "send failed",
    });
    return { ok: false, reason: "Could not send. Nothing left your inbox." };
  }
}

export async function dismissCase(caseId: string): Promise<CommandResult> {
  const current = await demoContext(caseId);
  if (!current || (current.status !== "ready" && current.status !== "refused")) return { ok: true };

  const updated = await getDb()
    .update(cases)
    .set({ status: "dismissed", updatedAt: current.deskNow })
    .where(
      and(
        eq(cases.id, caseId),
        or(eq(cases.status, "ready"), eq(cases.status, "refused")),
      ),
    )
    .returning({ id: cases.id });
  if (updated.length === 0) return { ok: true };

  await writeAudit(current.userId, caseId, "dismissed", {});
  return { ok: true };
}

export async function snoozeCase(caseId: string): Promise<CommandResult> {
  const current = await demoContext(caseId);
  if (!current || current.status !== "ready") return { ok: true };

  const snoozeUntil = new Date(current.deskNow.getTime() + 24 * 60 * 60 * 1000);
  const updated = await getDb()
    .update(cases)
    .set({ status: "snoozed", snoozeUntil, updatedAt: current.deskNow })
    .where(and(eq(cases.id, caseId), eq(cases.status, "ready")))
    .returning({ id: cases.id });
  if (updated.length === 0) return { ok: true };

  await writeAudit(current.userId, caseId, "snoozed", { snoozeUntil: snoozeUntil.toISOString() });
  return { ok: true };
}

export type StandingOrdersPatch = {
  askBeforeSend?: boolean;
  returnHorizonDays: number;
  renewalHorizonDays: number;
  duplicateWindowHours: number;
  ignoreUnderRupees: number;
};

export async function updateStandingOrders(patch: StandingOrdersPatch): Promise<CommandResult> {
  if (patch.askBeforeSend === false) {
    return {
      ok: false,
      reason: "Ask before every send stays on. Found will not send without your approval.",
    };
  }

  const countsAreWhole =
    Number.isInteger(patch.returnHorizonDays) &&
    patch.returnHorizonDays > 0 &&
    Number.isInteger(patch.renewalHorizonDays) &&
    patch.renewalHorizonDays > 0 &&
    Number.isInteger(patch.duplicateWindowHours) &&
    patch.duplicateWindowHours > 0 &&
    Number.isInteger(patch.ignoreUnderRupees) &&
    patch.ignoreUnderRupees >= 0;
  if (!countsAreWhole) {
    return { ok: false, reason: "Standing orders need whole days, whole hours, and a rupee amount of zero or more." };
  }

  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.isDemo, true)).limit(1);
  if (!user) return { ok: false, reason: "Demo user is missing." };

  const ignoreUnderMinor = rupeesToMinor(patch.ignoreUnderRupees);
  await db
    .update(standingOrders)
    .set({
      askBeforeSend: true,
      returnHorizonDays: patch.returnHorizonDays,
      renewalHorizonDays: patch.renewalHorizonDays,
      duplicateWindowHours: patch.duplicateWindowHours,
      renewalIgnoreUnderMinor: ignoreUnderMinor,
    })
    .where(eq(standingOrders.userId, user.id));

  await writeAudit(user.id, null, "standing_orders_updated", {
    returnHorizonDays: patch.returnHorizonDays,
    renewalHorizonDays: patch.renewalHorizonDays,
    duplicateWindowHours: patch.duplicateWindowHours,
    renewalIgnoreUnderMinor: ignoreUnderMinor,
  });
  await rerunDetection();
  return { ok: true };
}

export async function resetDemoDesk() {
  await resetDemoSeed(getDb());
}
