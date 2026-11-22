import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  approvals,
  caseMessages,
  cases,
  drafts,
  mailboxes,
  messages,
  receipts,
  standingOrders,
  users,
} from "../db/schema";
import { merchantLabels } from "../mail/content";
import {
  formatDeskClock,
  formatDeskDay,
  formatInr,
  kolkataDateKey,
  maskDigitRuns,
  wholeRupeesFromMinor,
} from "../money";

export type DeskCase = {
  id: string;
  label: "Get back" | "Keep";
  merchant: string;
  amountLabel: string;
  deadlineLine: string;
  evidenceQuote: string;
  evidence: { fromName: string; fromAddress: string; subject: string }[];
  draft: { id: string; to: string; subject: string; body: string } | null;
};

export type DeskReceipt = {
  id: string;
  merchant: string;
  amountLabel: string;
  sentLabel: string;
  subject: string;
  to: string;
  body: string;
  sentClock: string;
  approvalClock: string | null;
};

export type DeskRefused = {
  id: string;
  senderName: string;
  fromAddress: string;
  amountLabel: string;
  reason: string;
};

export type DeskOrders = {
  returnHorizonDays: number;
  renewalHorizonDays: number;
  duplicateWindowHours: number;
  ignoreUnderRupees: number;
};

export type Desk = {
  displayName: string;
  clockLabel: string;
  heroLabel: string;
  subtitle: string;
  sentLine: string | null;
  cases: DeskCase[];
  refused: DeskRefused[];
  orders: DeskOrders;
  receipts: DeskReceipt[];
};

function deadlineLine(
  kind: "return_window" | "duplicate_charge" | "renewal",
  deadlineOn: string | null,
  chargedAt: Date | null,
) {
  if (kind === "duplicate_charge" && chargedAt) {
    return `charged twice on ${formatDeskDay(chargedAt)}`;
  }
  if (!deadlineOn) {
    return "";
  }
  const day = formatDeskDay(new Date(`${deadlineOn}T12:00:00+05:30`));
  if (kind === "renewal") {
    return `renews ${day}`;
  }
  return `closes ${day}`;
}

export async function getDesk(): Promise<Desk> {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.isDemo, true)).limit(1);
  if (!user) {
    throw new Error("Demo user is missing. Run npm run db:seed.");
  }

  const [mailbox] = await db
    .select()
    .from(mailboxes)
    .where(and(eq(mailboxes.userId, user.id), eq(mailboxes.provider, "seed")))
    .limit(1);
  if (!mailbox) {
    throw new Error("Demo mailbox is missing. Run npm run db:seed.");
  }

  const deskToday = kolkataDateKey(mailbox.deskNow);

  const [heroRows, readyCases, refusedRows, orderRows, sentRows, receiptRows] = await Promise.all([
    db
      .select({
        total: sql<string>`coalesce(sum(${cases.amountMinor}), 0)`,
        count: sql<string>`count(*)`,
      })
      .from(cases)
      .where(and(eq(cases.userId, user.id), eq(cases.status, "ready"))),
    db
      .select()
      .from(cases)
      .where(and(eq(cases.userId, user.id), eq(cases.status, "ready")))
      .orderBy(asc(cases.createdAt)),
    db
      .select({
        id: cases.id,
        amountMinor: cases.amountMinor,
        reason: cases.refuseReason,
        fromName: messages.fromName,
        fromAddress: messages.fromAddress,
      })
      .from(cases)
      .innerJoin(caseMessages, eq(caseMessages.caseId, cases.id))
      .innerJoin(messages, eq(messages.id, caseMessages.messageId))
      .where(and(eq(cases.userId, user.id), eq(cases.status, "refused")))
      .orderBy(asc(cases.createdAt)),
    db.select().from(standingOrders).where(eq(standingOrders.userId, user.id)).limit(1),
    db
      .select({
        amountMinor: receipts.amountMinor,
        sentAt: receipts.sentAt,
      })
      .from(receipts)
      .innerJoin(cases, eq(receipts.caseId, cases.id))
      .where(and(eq(cases.userId, user.id), eq(cases.status, "sent"))),
    db
      .select({
        id: receipts.id,
        merchantKey: cases.merchantKey,
        amountMinor: receipts.amountMinor,
        subject: receipts.subject,
        toAddress: receipts.toAddress,
        bodySnapshot: receipts.bodySnapshot,
        sentAt: receipts.sentAt,
        approvedAt: approvals.approvedAt,
      })
      .from(receipts)
      .innerJoin(cases, eq(receipts.caseId, cases.id))
      .leftJoin(approvals, eq(receipts.approvalId, approvals.id))
      .where(eq(cases.userId, user.id))
      .orderBy(asc(receipts.sentAt)),
  ]);

  const orders = orderRows[0];
  if (!orders) {
    throw new Error("Standing orders are missing. Run npm run db:seed.");
  }

  const hero = heroRows[0];
  const heroMinor = Number(hero?.total ?? 0);
  const waitingCount = Number(hero?.count ?? 0);

  const sentTodayMinor = sentRows.reduce((sum, row) => {
    return kolkataDateKey(row.sentAt) === deskToday ? sum + row.amountMinor : sum;
  }, 0);

  const subtitle =
    sentTodayMinor === 0
      ? `you can still save · ${waitingCount} waiting · nothing sent today`
      : `you can still save · ${waitingCount} waiting`;
  const sentLine =
    sentTodayMinor === 0 ? null : `${formatInr(sentTodayMinor)} sent · waiting on the merchant`;

  const caseIds = readyCases.map((row) => row.id);
  const [draftRows, evidenceRows] =
    caseIds.length === 0
      ? [[], []]
      : await Promise.all([
          db.select().from(drafts).where(inArray(drafts.caseId, caseIds)),
          db
            .select({
              caseId: caseMessages.caseId,
              fromName: messages.fromName,
              fromAddress: messages.fromAddress,
              subject: messages.subject,
              receivedAt: messages.receivedAt,
            })
            .from(caseMessages)
            .innerJoin(messages, eq(caseMessages.messageId, messages.id))
            .where(inArray(caseMessages.caseId, caseIds))
            .orderBy(asc(messages.receivedAt)),
        ]);

  const latestDraft = new Map<string, (typeof draftRows)[number]>();
  for (const draft of draftRows) {
    const current = latestDraft.get(draft.caseId);
    if (!current || draft.createdAt > current.createdAt) {
      latestDraft.set(draft.caseId, draft);
    }
  }

  const deskCases: DeskCase[] = readyCases.map((row) => {
    const evidence = evidenceRows.filter((item) => item.caseId === row.id);
    const draft = latestDraft.get(row.id);
    return {
      id: row.id,
      label: row.kind === "renewal" ? "Keep" : "Get back",
      merchant: merchantLabels[row.merchantKey] ?? row.merchantKey,
      amountLabel: formatInr(row.amountMinor),
      deadlineLine: deadlineLine(row.kind, row.deadlineOn, evidence[0]?.receivedAt ?? null),
      evidenceQuote: maskDigitRuns(row.evidenceQuote),
      evidence: evidence.map((item) => ({
        fromName: item.fromName,
        fromAddress: item.fromAddress,
        subject: maskDigitRuns(item.subject),
      })),
      draft: draft
        ? {
            id: draft.id,
            to: draft.toAddress,
            subject: maskDigitRuns(draft.subject),
            body: maskDigitRuns(draft.body),
          }
        : null,
    };
  });

  return {
    displayName: user.displayName,
    clockLabel: formatDeskClock(mailbox.deskNow),
    heroLabel: formatInr(heroMinor),
    subtitle,
    sentLine,
    cases: deskCases,
    refused: refusedRows.map((row) => ({
      id: row.id,
      senderName: row.fromName,
      fromAddress: row.fromAddress,
      amountLabel: formatInr(row.amountMinor),
      reason: row.reason ?? "",
    })),
    orders: {
      returnHorizonDays: orders.returnHorizonDays,
      renewalHorizonDays: orders.renewalHorizonDays,
      duplicateWindowHours: orders.duplicateWindowHours,
      ignoreUnderRupees: wholeRupeesFromMinor(orders.renewalIgnoreUnderMinor),
    },
    receipts: receiptRows.map((row) => ({
      id: row.id,
      merchant: merchantLabels[row.merchantKey] ?? row.merchantKey,
      amountLabel: formatInr(row.amountMinor),
      sentLabel: formatDeskDay(row.sentAt),
      subject: maskDigitRuns(row.subject),
      to: row.toAddress,
      body: maskDigitRuns(row.bodySnapshot),
      sentClock: formatDeskClock(row.sentAt),
      approvalClock: row.approvedAt ? formatDeskClock(row.approvedAt) : null,
    })),
  };
}
