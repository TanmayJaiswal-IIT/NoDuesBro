import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../db";
import { caseMessages, cases, drafts, mailboxes, messages, receipts, users } from "../db/schema";
import { merchantLabels } from "../mail/content";
import { formatDeskClock, formatDeskDay, formatInr, kolkataDateKey } from "../money";

export type DeskCase = {
  id: string;
  label: "Get back" | "Keep";
  merchant: string;
  amountLabel: string;
  deadlineLine: string;
  evidenceQuote: string;
  evidence: { fromName: string; fromAddress: string; subject: string }[];
  draft: { to: string; subject: string; body: string } | null;
};

export type DeskReceipt = {
  id: string;
  merchant: string;
  amountLabel: string;
  sentLabel: string;
  subject: string;
};

export type Desk = {
  displayName: string;
  clockLabel: string;
  heroLabel: string;
  subtitle: string;
  cases: DeskCase[];
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

  const [heroRows, readyCases, sentRows, receiptRows] = await Promise.all([
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
        sentAt: receipts.sentAt,
      })
      .from(receipts)
      .innerJoin(cases, eq(receipts.caseId, cases.id))
      .where(eq(cases.userId, user.id))
      .orderBy(asc(receipts.sentAt)),
  ]);

  const hero = heroRows[0];
  const heroMinor = Number(hero?.total ?? 0);
  const waitingCount = Number(hero?.count ?? 0);

  const sentTodayMinor = sentRows.reduce((sum, row) => {
    return kolkataDateKey(row.sentAt) === deskToday ? sum + row.amountMinor : sum;
  }, 0);

  const subtitle =
    sentTodayMinor === 0
      ? `you can still save · ${waitingCount} waiting · nothing sent today`
      : `you can still save · ${waitingCount} waiting · ${formatInr(sentTodayMinor)} sent today`;

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
      evidenceQuote: row.evidenceQuote,
      evidence: evidence.map((item) => ({
        fromName: item.fromName,
        fromAddress: item.fromAddress,
        subject: item.subject,
      })),
      draft: draft
        ? { to: draft.toAddress, subject: draft.subject, body: draft.body }
        : null,
    };
  });

  return {
    displayName: user.displayName,
    clockLabel: formatDeskClock(mailbox.deskNow),
    heroLabel: formatInr(heroMinor),
    subtitle,
    cases: deskCases,
    receipts: receiptRows.map((row) => ({
      id: row.id,
      merchant: merchantLabels[row.merchantKey] ?? row.merchantKey,
      amountLabel: formatInr(row.amountMinor),
      sentLabel: formatDeskDay(row.sentAt),
      subject: row.subject,
    })),
  };
}
