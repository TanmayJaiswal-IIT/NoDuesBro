import { and, desc, eq, sql } from "drizzle-orm";
import { closeDb, getDb } from "../lib/db";
import {
  auditEvents,
  caseMessages,
  cases,
  drafts,
  merchantAllowlist,
  messages,
} from "../lib/db/schema";
import { getDesk } from "../lib/desk/query";
import { DESK_NOW, allowlist, seedMessages } from "../lib/mail/content";
import { LOOKALIKE_REASON, resetDemoSeed } from "../lib/mail/seed";
import { evaluatePolicy } from "../lib/pipeline/policy";
import { rerunDetection } from "../lib/pipeline/run";
import { proposeCandidates, type Candidate, type RuleMessage } from "../lib/pipeline/rules";

const AMAZON_QUOTE =
  "You can return this item by 26 Nov 2026 for a refund to your original payment method.";
const SWIGGY_QUOTE = "Order: SW184423";
const HOTSTAR_QUOTE = "Your JioHotstar Premium annual plan will renew on 26 Nov 2026.";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function ruleMessage(
  message: (typeof seedMessages)[number],
  id: string = message.externalId,
  receivedAt: string = message.receivedAt,
): RuleMessage {
  return {
    id,
    fromName: message.fromName,
    fromAddress: message.fromAddress,
    subject: message.subject,
    bodyText: message.bodyText,
    receivedAt: new Date(receivedAt),
  };
}

function proposeSeed(
  overrides: Partial<{
    messages: RuleMessage[];
    returnHorizonDays: number;
    renewalHorizonDays: number;
    duplicateWindowHours: number;
    renewalIgnoreUnderMinor: number;
  }> = {},
): Candidate[] {
  return proposeCandidates({
    messages: overrides.messages ?? seedMessages.map((message) => ruleMessage(message)),
    allowlist,
    deskNow: new Date(DESK_NOW),
    returnHorizonDays: overrides.returnHorizonDays ?? 7,
    renewalHorizonDays: overrides.renewalHorizonDays ?? 7,
    duplicateWindowHours: overrides.duplicateWindowHours ?? 48,
    renewalIgnoreUnderMinor: overrides.renewalIgnoreUnderMinor ?? 0,
  });
}

function one(candidates: Candidate[], predicate: (candidate: Candidate) => boolean, label: string) {
  const matches = candidates.filter(predicate);
  assert(matches.length === 1, `${label} count was ${matches.length}`);
  return matches[0];
}

function assertOpeningCandidates(candidates: Candidate[]) {
  assert(candidates.length === 4, `candidate count was ${candidates.length}`);
  const covered = new Set(candidates.flatMap((candidate) => candidate.messageIds));
  assert(!covered.has("m6") && !covered.has("m7") && !covered.has("m8"), "noise or Paperlane was filed");

  const amazon = one(
    candidates,
    (candidate) => candidate.merchantKey === "amazon.in" && candidate.status === "ready",
    "amazon",
  );
  assert(amazon.kind === "return_window", "amazon kind");
  assert(amazon.amountMinor === 249900, `amazon amount was ${amazon.amountMinor}`);
  assert(amazon.orderId === "404-2288193-7715200", `amazon order was ${amazon.orderId}`);
  assert(amazon.deadlineOn === "2026-11-26", `amazon deadline was ${amazon.deadlineOn}`);
  assert(amazon.messageIds.join() === "m1", "amazon is not linked to m1");
  assert(amazon.evidenceQuote === AMAZON_QUOTE, `amazon quote was ${amazon.evidenceQuote}`);
  assert(amazon.counterpartyEmail === "returns@amazon.in", "amazon support address");
  assert(amazon.refuseReason === null, "amazon was refused");

  const swiggy = one(candidates, (candidate) => candidate.kind === "duplicate_charge", "swiggy");
  assert(swiggy.status === "ready", "swiggy was not ready");
  assert(swiggy.merchantKey === "swiggy", "swiggy merchant");
  assert(swiggy.amountMinor === 48600, `swiggy amount was ${swiggy.amountMinor}`);
  assert(swiggy.orderId === "SW184423", `swiggy order was ${swiggy.orderId}`);
  assert(swiggy.messageIds.slice().sort().join() === "m2,m3", "swiggy is not linked to m2 and m3");
  assert(swiggy.evidenceQuote === SWIGGY_QUOTE, `swiggy quote was ${swiggy.evidenceQuote}`);
  assert(swiggy.counterpartyEmail === "support@swiggy.in", "swiggy support address");

  const hotstar = one(
    candidates,
    (candidate) => candidate.merchantKey === "jiohotstar" && candidate.status === "ready",
    "hotstar",
  );
  assert(hotstar.kind === "renewal", "hotstar kind");
  assert(hotstar.amountMinor === 149900, `hotstar amount was ${hotstar.amountMinor}`);
  assert(hotstar.deadlineOn === "2026-11-26", `hotstar deadline was ${hotstar.deadlineOn}`);
  assert(hotstar.orderId === null, "hotstar stored an order id");
  assert(hotstar.messageIds.join() === "m4", "hotstar is not linked to m4");
  assert(hotstar.evidenceQuote === HOTSTAR_QUOTE, `hotstar quote was ${hotstar.evidenceQuote}`);
  assert(hotstar.counterpartyEmail === "cancel@jiohotstar.com", "hotstar support address");

  const lookalike = one(candidates, (candidate) => candidate.status === "refused", "lookalike");
  assert(lookalike.kind === "return_window", "lookalike kind");
  assert(lookalike.merchantKey === "amazon.in", "lookalike merchant");
  assert(lookalike.amountMinor === 1500000, `lookalike amount was ${lookalike.amountMinor}`);
  assert(lookalike.orderId === null, "lookalike stored an order id");
  assert(lookalike.deadlineOn === null, "lookalike stored a deadline");
  assert(lookalike.messageIds.join() === "m5", "lookalike is not linked to m5");
  assert(lookalike.counterpartyEmail === "refunds@amazon-secure-claims.net", "lookalike sender");
  assert(lookalike.refuseReason === LOOKALIKE_REASON, "lookalike reason");
  assert(
    lookalike.evidenceQuote ===
      "Reply to this email with your full card number, CVV, and the OTP we send you so we can release it.",
    `lookalike quote was ${lookalike.evidenceQuote}`,
  );
}

function reasonOf(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || !("reason" in payload)) return null;
  const reason = payload.reason;
  return typeof reason === "string" ? reason : null;
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

async function main() {
  assertOpeningCandidates(proposeSeed());

  const shortReturn = proposeSeed({ returnHorizonDays: 2 });
  assert(
    !shortReturn.some((candidate) => candidate.merchantKey === "amazon.in" && candidate.status === "ready"),
    "a 2-day return horizon still filed Amazon",
  );
  assert(
    shortReturn.some((candidate) => candidate.merchantKey === "jiohotstar"),
    "a short return horizon dropped JioHotstar",
  );

  const shortRenewal = proposeSeed({ renewalHorizonDays: 2 });
  assert(
    !shortRenewal.some((candidate) => candidate.kind === "renewal" && candidate.status === "ready"),
    "a 2-day renewal horizon still filed JioHotstar",
  );
  assert(
    shortRenewal.some((candidate) => candidate.merchantKey === "amazon.in" && candidate.status === "ready"),
    "a short renewal horizon dropped Amazon",
  );

  const ignoredSmallRenewal = proposeSeed({ renewalIgnoreUnderMinor: 200000 });
  assert(
    !ignoredSmallRenewal.some((candidate) => candidate.merchantKey === "jiohotstar"),
    "ignore-under still filed the ₹1,499 renewal",
  );
  assert(
    ignoredSmallRenewal.some((candidate) => candidate.merchantKey === "amazon.in" && candidate.status === "ready"),
    "ignore-under dropped the Amazon return",
  );

  const tightDuplicate = proposeSeed({ duplicateWindowHours: 1 / 60 });
  assert(
    !tightDuplicate.some((candidate) => candidate.kind === "duplicate_charge"),
    "a one-minute window still paired Swiggy",
  );

  const m2 = seedMessages.find((message) => message.externalId === "m2");
  const m3 = seedMessages.find((message) => message.externalId === "m3");
  assert(Boolean(m2 && m3), "swiggy seed messages missing");
  const farApart = proposeSeed({
    messages: [
      ruleMessage(m2!, "late-a", "2026-11-01T00:00:00.000Z"),
      ruleMessage(m3!, "late-b", "2026-11-04T00:00:00.000Z"),
    ],
  });
  assert(farApart.length === 0, "charges 72 hours apart were paired");

  const db = getDb();
  await resetDemoSeed(db);
  assert((await readySum()) === 448400, "opening ready sum was not 448400");

  const stored = await db.select().from(cases);
  assert(stored.filter((row) => row.status === "ready").length === 3, "ready count");
  assert(stored.filter((row) => row.status === "refused").length === 1, "refused count");
  assert(stored.filter((row) => row.status === "sent").length === 1, "sent count");

  const links = await db
    .select({
      externalId: messages.externalId,
      status: cases.status,
      bodyText: messages.bodyText,
      caseId: cases.id,
    })
    .from(caseMessages)
    .innerJoin(messages, eq(messages.id, caseMessages.messageId))
    .innerJoin(cases, eq(cases.id, caseMessages.caseId));
  const linked = (externalId: string) => links.filter((row) => row.externalId === externalId);
  assert(linked("m7").length === 0, "bookstore mail became a case");
  assert(linked("m8").length === 0, "rating mail became a case");
  assert(linked("m6").length === 1 && linked("m6")[0].status === "sent", "Paperlane was reopened");

  const amazon = stored.find((row) => row.merchantKey === "amazon.in" && row.status === "ready");
  const swiggy = stored.find((row) => row.merchantKey === "swiggy" && row.status === "ready");
  const hotstar = stored.find((row) => row.merchantKey === "jiohotstar" && row.status === "ready");
  const refused = stored.find((row) => row.status === "refused");
  assert(Boolean(amazon && swiggy && hotstar && refused), "filed cases missing");
  assert(amazon!.amountMinor === 249900 && amazon!.orderId === "404-2288193-7715200", "amazon row");
  assert(amazon!.deadlineOn === "2026-11-26" && amazon!.evidenceQuote === AMAZON_QUOTE, "amazon quote row");
  assert(swiggy!.amountMinor === 48600 && swiggy!.orderId === "SW184423", "swiggy row");
  assert(swiggy!.evidenceQuote === SWIGGY_QUOTE, "swiggy quote row");
  assert(hotstar!.amountMinor === 149900 && hotstar!.deadlineOn === "2026-11-26", "hotstar row");
  assert(hotstar!.evidenceQuote === HOTSTAR_QUOTE, "hotstar quote row");
  assert(refused!.amountMinor === 1500000, "refused amount row");
  assert(refused!.refuseReason === LOOKALIKE_REASON, "refused reason row");
  assert(refused!.counterpartyEmail === "refunds@amazon-secure-claims.net", "refused sender row");

  const refusedDrafts = await db.select().from(drafts).where(eq(drafts.caseId, refused!.id));
  assert(refusedDrafts.length === 0, "refused case has a draft");

  for (const row of [amazon!, swiggy!, hotstar!]) {
    const [draft] = await db
      .select()
      .from(drafts)
      .where(eq(drafts.caseId, row.id))
      .orderBy(desc(drafts.createdAt))
      .limit(1);
    assert(Boolean(draft), `${row.merchantKey} draft missing`);
    const [listed] = await db
      .select()
      .from(merchantAllowlist)
      .where(eq(merchantAllowlist.merchantKey, row.merchantKey));
    const evidence = links.filter((link) => link.caseId === row.id);
    const sourceText = evidence.map((link) => link.bodyText).join("\n");
    assert(sourceText.includes(row.evidenceQuote), "quote is not in the source");
    const decision = evaluatePolicy({
      kind: row.kind,
      amountMinor: row.amountMinor,
      orderId: row.orderId,
      evidenceQuote: row.evidenceQuote,
      to: draft.toAddress,
      subject: draft.subject,
      body: draft.body,
      supportAddress: listed?.supportAddress ?? null,
      sourceText,
    });
    assert(decision.ok, `${row.merchantKey} draft failed policy`);
  }

  const created = await db.select().from(auditEvents).where(eq(auditEvents.type, "case_created"));
  assert(created.length === 3, `case_created count was ${created.length}`);
  const readyIds = new Set([amazon!.id, swiggy!.id, hotstar!.id]);
  assert(
    created.every((row) => row.caseId !== null && readyIds.has(row.caseId)),
    "case_created was not on the ready cases",
  );
  const refusedAudits = await db
    .select()
    .from(auditEvents)
    .where(and(eq(auditEvents.caseId, refused!.id), eq(auditEvents.type, "refused")));
  assert(refusedAudits.length === 1, "refused audit missing");
  assert(reasonOf(refusedAudits[0].payload) === LOOKALIKE_REASON, "refused audit reason");

  const desk = await getDesk();
  assert(desk.heroLabel === "₹4,484", `hero was ${desk.heroLabel}`);
  assert(desk.cases.map((item) => item.merchant).join() === "Amazon.in,Swiggy,JioHotstar", "card order");
  assert(desk.refused.length === 1, "held-back card missing");
  assert(desk.refused[0].reason === LOOKALIKE_REASON, "held-back reason");
  assert(desk.receipts.length === 1 && desk.receipts[0].merchant === "Paperlane", "Paperlane receipt missing");
  assert(desk.receipts[0].sentLabel.includes("17 Nov"), `Paperlane date was ${desk.receipts[0].sentLabel}`);

  const before = await statusSnapshot();
  const beforeCount = stored.length;
  await rerunDetection();
  await rerunDetection();
  assert((await statusSnapshot()) === before, "rerun changed a case");
  const after = await db.select().from(cases);
  assert(after.length === beforeCount, "rerun added a case");

  console.log("Day 4 check passed.");
  await closeDb();
}

main().catch(async (error) => {
  console.error(error);
  await closeDb();
  process.exit(1);
});
