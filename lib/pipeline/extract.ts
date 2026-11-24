import { generateText, Output } from "ai";
import { z } from "zod";
import { extractionModel } from "../ai";
import { evaluatePolicy } from "./policy";
import type { Candidate, RuleMessage } from "./rules";
import { sourceTextFor, verifyExtraction, type Extraction } from "./verify";

const extractionSchema = z.object({
  merchantKey: z.string(),
  amountMinor: z.int(),
  currency: z.string(),
  orderId: z.string().nullable(),
  deadlineOn: z.string().nullable(),
  evidenceQuote: z.string(),
  confidence: z.number().min(0).max(1),
  kind: z.enum(["return_window", "duplicate_charge", "renewal"]),
  draftSubject: z.string(),
  draftBody: z.string(),
});

export type ExtractInput = {
  candidate: Candidate;
  messages: RuleMessage[];
};

export type Extractor = (input: ExtractInput) => Promise<Extraction>;

export type SettleResult =
  | {
      status: "ready";
      kind: Candidate["kind"];
      merchantKey: string;
      amountMinor: number;
      currency: string;
      orderId: string | null;
      deadlineOn: string | null;
      evidenceQuote: string;
      confidence: number;
      draft: { to: string; subject: string; body: string };
    }
  | { status: "refused"; reason: string }
  | { status: "dropped"; reason: "ungrounded" | "dropped_low_confidence" };

export async function extractWithModel(input: ExtractInput): Promise<Extraction> {
  const { output } = await generateText({
    model: extractionModel,
    providerOptions: {
      openai: { store: false },
    },
    output: Output.object({
      name: "Extraction",
      schema: extractionSchema,
    }),
    prompt: promptFor(input),
  });
  if (!output) {
    throw new Error("The model did not return an extraction.");
  }
  return normalizeExtraction(output);
}

export async function settleCandidate(
  candidate: Candidate,
  messages: RuleMessage[],
  extract: Extractor = extractWithModel,
): Promise<SettleResult> {
  if (candidate.status === "refused") {
    return { status: "refused", reason: candidate.refuseReason ?? "" };
  }

  const linked = messagesFor(candidate, messages);
  const extraction = await extract({ candidate, messages: linked });
  const sourceText = sourceTextFor(linked);
  const verified = verifyExtraction(candidate, extraction, sourceText);
  if (!verified.ok) return { status: "dropped", reason: verified.reason };

  const decision = evaluatePolicy({
    kind: candidate.kind,
    amountMinor: extraction.amountMinor,
    orderId: extraction.orderId,
    evidenceQuote: extraction.evidenceQuote,
    to: candidate.counterpartyEmail,
    subject: extraction.draftSubject,
    body: extraction.draftBody,
    supportAddress: candidate.counterpartyEmail,
    sourceText,
  });
  if (!decision.ok) return { status: "refused", reason: decision.reason };

  return {
    status: "ready",
    kind: candidate.kind,
    merchantKey: candidate.merchantKey,
    amountMinor: extraction.amountMinor,
    currency: extraction.currency,
    orderId: extraction.orderId,
    deadlineOn: extraction.deadlineOn,
    evidenceQuote: extraction.evidenceQuote,
    confidence: extraction.confidence,
    draft: {
      to: candidate.counterpartyEmail,
      subject: extraction.draftSubject,
      body: extraction.draftBody,
    },
  };
}

function messagesFor(candidate: Candidate, messages: RuleMessage[]): RuleMessage[] {
  const byId = new Map(messages.map((message) => [message.id, message]));
  return candidate.messageIds.flatMap((id) => {
    const message = byId.get(id);
    return message ? [message] : [];
  });
}

function normalizeExtraction(output: z.infer<typeof extractionSchema>): Extraction {
  return {
    ...output,
    orderId: blankToNull(output.orderId),
    deadlineOn: blankToNull(output.deadlineOn),
    evidenceQuote: output.evidenceQuote.trim(),
  };
}

function blankToNull(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function promptFor(input: ExtractInput): string {
  const { candidate, messages } = input;
  const laterId = messages.at(-1)?.id;
  const sources = messages
    .map((message, index) => {
      const place =
        candidate.kind === "duplicate_charge"
          ? message.id === laterId
            ? "Later charge. This is the only charge to reverse."
            : "Earlier charge."
          : `Message ${index + 1}`;
      return [
        place,
        `From: ${message.fromName} <${message.fromAddress}>`,
        `Received: ${message.receivedAt.toISOString()}`,
        `Subject: ${message.subject}`,
        "Body:",
        message.bodyText,
      ].join("\n");
    })
    .join("\n\n");

  return [
    "Extract one case from the source mail and draft the one reply it needs.",
    `Kind: ${candidate.kind}`,
    `Merchant key: ${candidate.merchantKey}`,
    `To address, already chosen: ${candidate.counterpartyEmail}`,
    askFor(candidate.kind),
    "Copy evidenceQuote, the amount, and any order id from the source. The quote must be a verbatim substring of the source, with the same words and punctuation, and without added quotation marks.",
    "amountMinor is integer paise. ₹100 is 10000. ₹100.00 is 10000. Strip commas, then multiply rupees by 100. Never return the rupee number itself.",
    "currency is INR.",
    "orderId is the exact id from the source, or null when the source has none.",
    "deadlineOn is the source date as YYYY-MM-DD, or null when the source has no deadline.",
    `kind must be ${candidate.kind}. merchantKey must be ${candidate.merchantKey}.`,
    "confidence is from 0 to 1. Use 1 only when every field was copied from the source.",
    "The draft asks for that one action and nothing else. Do not mention a card number, OTP, CVV, PIN, or password.",
    "",
    sources,
  ].join("\n");
}

function askFor(kind: Candidate["kind"]): string {
  if (kind === "return_window") {
    return "Ask only for a return and a refund to the original payment method. The draft must include the order id, the amount, and the item name from the source.";
  }
  if (kind === "duplicate_charge") {
    return "Ask to reverse only the later charge. Write the word only immediately before the later order id. Copy both order ids and both clock times, including am or pm, from the source. Do not ask to reverse both charges. Do not name any amount other than the single charge. The amount is one charge, not the sum.";
  }
  return "Ask only to cancel before the renewal so that charge does not happen. The draft must include the plan amount and the renewal date.";
}
