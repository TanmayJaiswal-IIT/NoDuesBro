import { DESK_NOW, allowlist, amazonDraft, seedMessages } from "../lib/mail/content";
import { evaluatePolicy } from "../lib/pipeline/policy";
import {
  extractWithModel,
  settleCandidate,
  type Extractor,
  type SettleResult,
} from "../lib/pipeline/extract";
import { proposeCandidates, type Candidate, type RuleMessage } from "../lib/pipeline/rules";
import { sourceTextFor, type Extraction } from "../lib/pipeline/verify";

const AMAZON_QUOTE =
  "You can return this item by 26 Nov 2026 for a refund to your original payment method.";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function ruleMessage(message: (typeof seedMessages)[number]): RuleMessage {
  return {
    id: message.externalId,
    fromName: message.fromName,
    fromAddress: message.fromAddress,
    subject: message.subject,
    bodyText: message.bodyText,
    receivedAt: new Date(message.receivedAt),
  };
}

const messages = seedMessages.map(ruleMessage);
const candidates = proposeCandidates({
  messages,
  allowlist,
  deskNow: new Date(DESK_NOW),
  returnHorizonDays: 7,
  renewalHorizonDays: 7,
  duplicateWindowHours: 48,
  renewalIgnoreUnderMinor: 0,
});

function readyCandidate(merchantKey: string): Candidate {
  const candidate = candidates.find(
    (item) => item.status === "ready" && item.merchantKey === merchantKey,
  );
  assert(Boolean(candidate), `${merchantKey} candidate missing`);
  return candidate!;
}

function amazonExtraction(patch: Partial<Extraction> = {}): Extraction {
  return {
    merchantKey: "amazon.in",
    amountMinor: 249900,
    currency: "INR",
    orderId: "404-2288193-7715200",
    deadlineOn: "2026-11-26",
    evidenceQuote: AMAZON_QUOTE,
    confidence: 1,
    kind: "return_window",
    draftSubject: amazonDraft.subject,
    draftBody: amazonDraft.body,
    ...patch,
  };
}

function extractorReturning(extraction: Extraction): Extractor {
  return async () => extraction;
}

async function settleAmazon(extraction: Extraction): Promise<SettleResult> {
  return settleCandidate(readyCandidate("amazon.in"), messages, extractorReturning(extraction));
}

async function assertFakeExtractor() {
  const badQuote = await settleAmazon(
    amazonExtraction({ evidenceQuote: "This sentence was not in the source mail." }),
  );
  assert(badQuote.status === "dropped" && badQuote.reason === "ungrounded", "a foreign quote was kept");
  assert(badQuote.status !== "ready", "a foreign quote became a ready case");

  const badAmount = await settleAmazon(amazonExtraction({ amountMinor: 777700 }));
  assert(badAmount.status === "dropped" && badAmount.reason === "ungrounded", "an absent amount was kept");

  const badOrder = await settleAmazon(amazonExtraction({ orderId: "NO-SUCH-ORDER" }));
  assert(badOrder.status === "dropped" && badOrder.reason === "ungrounded", "an unknown order id was kept");

  const badKind = await settleAmazon(amazonExtraction({ kind: "renewal" }));
  assert(badKind.status === "dropped" && badKind.reason === "ungrounded", "a different kind was kept");

  const badMerchant = await settleAmazon(amazonExtraction({ merchantKey: "swiggy" }));
  assert(
    badMerchant.status === "dropped" && badMerchant.reason === "ungrounded",
    "a different merchant was kept",
  );

  const lowConfidence = await settleAmazon(amazonExtraction({ confidence: 0.59 }));
  assert(
    lowConfidence.status === "dropped" && lowConfidence.reason === "dropped_low_confidence",
    "confidence 0.59 was not dropped",
  );

  const enoughConfidence = await settleAmazon(amazonExtraction({ confidence: 0.6 }));
  assert(enoughConfidence.status === "ready", "confidence 0.6 did not continue");

  const secretDraft = await settleAmazon(
    amazonExtraction({ draftBody: `${amazonDraft.body}\nOTP` }),
  );
  assert(secretDraft.status === "refused", "a draft containing OTP stayed ready");
  assert(!("draft" in secretDraft), "a refused extraction still has a draft");

  let calls = 0;
  const lookalike = candidates.find((candidate) => candidate.status === "refused");
  assert(Boolean(lookalike), "lookalike candidate missing");
  const refused = await settleCandidate(lookalike!, messages, async () => {
    calls += 1;
    return amazonExtraction();
  });
  assert(calls === 0, "the lookalike called the extractor");
  assert(refused.status === "refused", "the lookalike was not refused");
}

function linkedSource(candidate: Candidate): string {
  const byId = new Map(messages.map((message) => [message.id, message]));
  return sourceTextFor(
    candidate.messageIds.flatMap((id) => {
      const message = byId.get(id);
      return message ? [message] : [];
    }),
  );
}

async function assertLiveExtraction() {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error("OPENAI_API_KEY is not set. Add it to .env.local.");
  }

  let calls = 0;
  const extractor: Extractor = async (input) => {
    calls += 1;
    return extractWithModel(input);
  };
  const ready = candidates.filter((candidate) => candidate.status === "ready");
  assert(ready.length === 3, `ready candidate count was ${ready.length}`);

  const settled = [];
  for (const candidate of ready) {
    const result = await settleCandidate(candidate, messages, extractor);
    if (result.status !== "ready") {
      throw new Error(`${candidate.merchantKey} was ${result.status}: ${result.reason}`);
    }
    const decision = evaluatePolicy({
      kind: result.kind,
      amountMinor: result.amountMinor,
      orderId: result.orderId,
      evidenceQuote: result.evidenceQuote,
      to: result.draft.to,
      subject: result.draft.subject,
      body: result.draft.body,
      supportAddress: candidate.counterpartyEmail,
      sourceText: linkedSource(candidate),
    });
    assert(decision.ok, `${candidate.merchantKey} draft failed policy`);
    assert(linkedSource(candidate).includes(result.evidenceQuote), `${candidate.merchantKey} quote is not in the source`);
    settled.push(result);
  }

  assert(calls === 3, `the extractor was called ${calls} times`);

  const amazon = settled.find((result) => result.merchantKey === "amazon.in");
  const swiggy = settled.find((result) => result.merchantKey === "swiggy");
  const hotstar = settled.find((result) => result.merchantKey === "jiohotstar");
  assert(Boolean(amazon && swiggy && hotstar), "a live case is missing");

  assert(amazon!.amountMinor === 249900, `amazon amount was ${amazon!.amountMinor}`);
  assert(amazon!.orderId === "404-2288193-7715200", `amazon order was ${amazon!.orderId}`);
  assert(amazon!.deadlineOn === "2026-11-26", `amazon deadline was ${amazon!.deadlineOn}`);
  assert(/return/i.test(amazon!.draft.body), "amazon draft does not ask for a return");
  assert(/refund/i.test(amazon!.draft.body), "amazon draft does not ask for a refund");
  assert(/headphones/i.test(amazon!.draft.body), "amazon draft does not name the headphones");

  assert(swiggy!.amountMinor === 48600, `swiggy amount was ${swiggy!.amountMinor}`);
  assert(swiggy!.orderId === "SW184423", `swiggy order was ${swiggy!.orderId}`);
  assert(swiggy!.draft.body.includes("SW184422"), "swiggy draft misses the earlier order");
  assert(swiggy!.draft.body.includes("SW184423"), "swiggy draft misses the later order");
  assert(/8:12\s*pm/i.test(swiggy!.draft.body), "swiggy draft misses 8:12pm");
  assert(/8:14\s*pm/i.test(swiggy!.draft.body), "swiggy draft misses 8:14pm");
  assert(/only SW184423/i.test(swiggy!.draft.body), "swiggy draft does not reverse only SW184423");
  assert(!/reverse both/i.test(swiggy!.draft.body), "swiggy draft reverses both charges");

  assert(hotstar!.amountMinor === 149900, `hotstar amount was ${hotstar!.amountMinor}`);
  assert(hotstar!.deadlineOn === "2026-11-26", `hotstar deadline was ${hotstar!.deadlineOn}`);
  assert(/cancel/i.test(hotstar!.draft.body), "hotstar draft does not ask to cancel");
  assert(
    /26 Nov 2026|2026-11-26/.test(hotstar!.draft.body),
    "hotstar draft misses the renewal date",
  );

  const total = settled.reduce((sum, result) => sum + result.amountMinor, 0);
  assert(total === 448400, `ready amount was ${total}`);
}

async function main() {
  await assertFakeExtractor();
  await assertLiveExtraction();
  console.log("Day 5 check passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
