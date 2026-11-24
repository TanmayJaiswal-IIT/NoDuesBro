import { containsAmountDigits } from "./policy";
import type { Candidate, RuleMessage } from "./rules";

export type Extraction = {
  merchantKey: string;
  amountMinor: number;
  currency: string;
  orderId: string | null;
  deadlineOn: string | null;
  evidenceQuote: string;
  confidence: number;
  kind: Candidate["kind"];
  draftSubject: string;
  draftBody: string;
};

export type VerifyResult = { ok: true } | { ok: false; reason: "ungrounded" | "dropped_low_confidence" };

export function sourceTextFor(messages: RuleMessage[]): string {
  return messages.map((message) => `${message.subject}\n${message.bodyText}`).join("\n\n");
}

export function verifyExtraction(
  candidate: Candidate,
  extraction: Extraction,
  sourceText: string,
): VerifyResult {
  if (!Number.isFinite(extraction.confidence) || extraction.confidence < 0.6) {
    return { ok: false, reason: "dropped_low_confidence" };
  }

  const quote = extraction.evidenceQuote;
  const grounded =
    quote.length > 0 &&
    sourceText.includes(quote) &&
    containsAmountDigits(sourceText, extraction.amountMinor) &&
    (extraction.orderId === null || sourceText.includes(extraction.orderId)) &&
    extraction.kind === candidate.kind &&
    extraction.merchantKey === candidate.merchantKey;

  if (!grounded) return { ok: false, reason: "ungrounded" };
  return { ok: true };
}
