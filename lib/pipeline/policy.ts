export type PolicyDraft = {
  kind: "return_window" | "duplicate_charge" | "renewal";
  amountMinor: number;
  orderId: string | null;
  evidenceQuote: string;
  to: string;
  subject: string;
  body: string;
  supportAddress: string | null;
  sourceText: string;
};

export type PolicyResult = { ok: true } | { ok: false; reason: string };

const SECRET_WORD = /\b(?:OTP|CVV|PIN|password)\b/i;
const UPI_PIN = /\bUPI PIN\b/i;
const ONE_TIME_CODE = /one-time(?:\s+code)?\W{0,12}\d{6}|\d{6}\W{0,12}one-time/i;
const LONG_DIGIT_RUN = /\d{13,19}/;
const REVERSE_BOTH = /reverse both|both charges|reverse (?:the )?two/i;

function fail(reason: string): PolicyResult {
  return { ok: false, reason };
}

function amountDigits(amountMinor: number): string {
  const rupees = amountMinor / 100;
  return Number.isInteger(rupees) ? String(rupees) : rupees.toFixed(2);
}

function containsAmountDigits(text: string, amountMinor: number): boolean {
  return text.replace(/,/g, "").includes(amountDigits(amountMinor));
}

function currencyAmounts(text: string): number[] {
  const pattern =
    /(?:₹|Rs\.?|INR)\s*([0-9]{1,3}(?:,[0-9]{2,3})*|[0-9]+)(?:\.(\d{1,2}))?/gi;
  const amounts: number[] = [];
  for (const match of text.matchAll(pattern)) {
    const whole = match[1].replace(/,/g, "");
    const fraction = (match[2] ?? "00").padEnd(2, "0");
    amounts.push(Number(whole) * 100 + Number(fraction));
  }
  return amounts;
}

function orderIds(text: string): string[] {
  return [...text.matchAll(/\b(?:\d{3}-\d{7}-\d{7}|[A-Z]{2,}\d{4,})\b/g)].map((match) => match[0]);
}

export function evaluatePolicy(draft: PolicyDraft): PolicyResult {
  if (!draft.supportAddress || draft.to.toLowerCase() !== draft.supportAddress.toLowerCase()) {
    return fail("This draft is not addressed to the merchant's support address.");
  }

  const outbound = `${draft.subject}\n${draft.body}`;
  if (
    LONG_DIGIT_RUN.test(outbound) ||
    SECRET_WORD.test(outbound) ||
    UPI_PIN.test(outbound) ||
    ONE_TIME_CODE.test(outbound)
  ) {
    return fail("This draft asks for a secret. Found will not send it.");
  }

  if (!draft.sourceText.includes(draft.evidenceQuote)) {
    return fail("The evidence quote is not in the source mail.");
  }

  if (!containsAmountDigits(draft.sourceText, draft.amountMinor)) {
    return fail("The amount in this draft is not in the source mail.");
  }

  if (!containsAmountDigits(outbound, draft.amountMinor)) {
    return fail("The draft does not name the amount from the source mail.");
  }

  if (draft.orderId) {
    if (!draft.sourceText.includes(draft.orderId)) {
      return fail("The order id is not in the source mail.");
    }
    if (!outbound.includes(draft.orderId)) {
      return fail("The draft does not name the order id.");
    }
  }

  const unknownOrderId = orderIds(outbound).find((id) => !draft.sourceText.includes(id));
  if (unknownOrderId) {
    return fail("The draft names an order id that is not in the source mail.");
  }

  if (draft.kind === "duplicate_charge") {
    if (REVERSE_BOTH.test(draft.body)) {
      return fail("This draft asks to reverse more than the later charge.");
    }
    const otherAmount = currencyAmounts(outbound).find((amount) => amount !== draft.amountMinor);
    if (otherAmount !== undefined) {
      return fail("This draft names an amount other than the duplicate charge.");
    }
  }

  return { ok: true };
}
