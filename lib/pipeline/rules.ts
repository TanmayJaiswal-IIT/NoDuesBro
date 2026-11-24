import { kolkataDateKey } from "../money";
import { currencyAmounts, orderIdsIn, textHasSecret } from "./policy";

export type RuleMessage = {
  id: string;
  fromName: string;
  fromAddress: string;
  subject: string;
  bodyText: string;
  receivedAt: Date;
};

export type AllowlistEntry = {
  merchantKey: string;
  domains: readonly string[];
  supportAddress: string;
};

export type Candidate = {
  kind: "return_window" | "duplicate_charge" | "renewal";
  status: "ready" | "refused";
  merchantKey: string;
  amountMinor: number;
  currency: "INR";
  orderId: string | null;
  deadlineOn: string | null;
  counterpartyEmail: string;
  evidenceQuote: string;
  refuseReason: string | null;
  messageIds: string[];
};

const BRANDS = [
  { merchantKey: "jiohotstar", label: "JioHotstar", pattern: /\bjiohotstar\b|\bhotstar\b/i },
  { merchantKey: "paperlane", label: "Paperlane", pattern: /\bpaperlane\b/i },
  { merchantKey: "amazon.in", label: "Amazon", pattern: /\bamazon\b/i },
  { merchantKey: "swiggy", label: "Swiggy", pattern: /\bswiggy\b/i },
] as const;

const RETURN_BY =
  /return(?:\s+\w+){0,6}\s+by\s+\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}/i;
const RENEWAL_SIGNAL = /will renew|renews|will be charged|renewal/i;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export function refuseReasonFor(brand: string): string {
  return `Refused. This message asks for your card number and an OTP, and it was not sent by ${brand}. NoDuesBro will not draft a reply.`;
}

export const LOOKALIKE_REASON = refuseReasonFor("Amazon");

export function proposeCandidates(input: {
  messages: RuleMessage[];
  allowlist: readonly AllowlistEntry[];
  deskNow: Date;
  returnHorizonDays: number;
  renewalHorizonDays: number;
  duplicateWindowHours: number;
  renewalIgnoreUnderMinor: number;
}): Candidate[] {
  const messages = [...input.messages].sort(
    (left, right) => left.receivedAt.getTime() - right.receivedAt.getTime() || left.id.localeCompare(right.id),
  );
  const refused: Candidate[] = [];
  const refusedIds = new Set<string>();

  for (const message of messages) {
    const candidate = refuseCandidate(message, input.allowlist);
    if (!candidate) continue;
    refused.push(candidate);
    refusedIds.add(message.id);
  }

  const open = messages.filter((message) => !refusedIds.has(message.id));
  const duplicates = duplicateCandidates(open, input.allowlist, input.duplicateWindowHours);
  const used = new Set(duplicates.flatMap((candidate) => candidate.messageIds));
  const returns: Candidate[] = [];
  const renewals: Candidate[] = [];

  for (const message of open) {
    if (used.has(message.id)) continue;
    const merchant = merchantForAddress(message.fromAddress, input.allowlist);
    if (!merchant) continue;
    const returnWindow = returnCandidate(message, merchant, input.deskNow, input.returnHorizonDays);
    if (returnWindow) {
      returns.push(returnWindow);
      continue;
    }
    const renewal = renewalCandidate(
      message,
      merchant,
      input.deskNow,
      input.renewalHorizonDays,
      input.renewalIgnoreUnderMinor,
    );
    if (renewal) renewals.push(renewal);
  }

  return [...returns, ...duplicates, ...renewals, ...refused];
}

function refuseCandidate(message: RuleMessage, allowlist: readonly AllowlistEntry[]): Candidate | null {
  const scanned = `${message.subject}\n${message.bodyText}`;
  const claim = claimedBrand(`${message.fromName}\n${scanned}`);
  const sender = merchantForAddress(message.fromAddress, allowlist);
  const lookalike = claim !== null && (!sender || sender.merchantKey !== claim.merchantKey);
  if (!textHasSecret(scanned) && !lookalike) return null;

  const merchantKey = claim?.merchantKey ?? sender?.merchantKey;
  const label = claim?.label ?? brandLabel(sender?.merchantKey);
  if (!merchantKey || !label) return null;

  const quote = secretSentence(message.bodyText) ?? brandSentence(message.bodyText);
  if (!quote || !message.bodyText.includes(quote)) return null;

  return {
    kind: "return_window",
    status: "refused",
    merchantKey,
    amountMinor: currencyAmounts(scanned)[0] ?? 0,
    currency: "INR",
    orderId: null,
    deadlineOn: null,
    counterpartyEmail: message.fromAddress,
    evidenceQuote: quote,
    refuseReason: refuseReasonFor(label),
    messageIds: [message.id],
  };
}

function duplicateCandidates(
  messages: RuleMessage[],
  allowlist: readonly AllowlistEntry[],
  duplicateWindowHours: number,
): Candidate[] {
  const charges = messages.flatMap((message) => {
    const merchant = merchantForAddress(message.fromAddress, allowlist);
    const amountMinor = currencyAmounts(message.bodyText)[0];
    const orderId = orderIdsIn(`${message.subject}\n${message.bodyText}`)[0];
    if (!merchant || amountMinor === undefined || !orderId) return [];
    return [{ message, merchant, amountMinor, orderId }];
  });

  const groups = new Map<string, typeof charges>();
  for (const charge of charges) {
    const key = `${charge.merchant.merchantKey}:${charge.amountMinor}`;
    const group = groups.get(key) ?? [];
    group.push(charge);
    groups.set(key, group);
  }

  const windowMs = duplicateWindowHours * 60 * 60 * 1000;
  const candidates: Candidate[] = [];
  const used = new Set<string>();

  for (const group of groups.values()) {
    const sorted = [...group].sort(
      (left, right) => left.message.receivedAt.getTime() - right.message.receivedAt.getTime(),
    );
    for (let earlier = 0; earlier < sorted.length; earlier += 1) {
      const first = sorted[earlier];
      if (used.has(first.message.id)) continue;
      for (let later = earlier + 1; later < sorted.length; later += 1) {
        const second = sorted[later];
        if (used.has(second.message.id)) continue;
        const gap = second.message.receivedAt.getTime() - first.message.receivedAt.getTime();
        if (gap > windowMs) break;
        if (first.orderId === second.orderId) continue;
        const quote = lineContaining(second.message.bodyText, second.orderId);
        if (!quote || !second.message.bodyText.includes(quote)) continue;
        candidates.push({
          kind: "duplicate_charge",
          status: "ready",
          merchantKey: second.merchant.merchantKey,
          amountMinor: second.amountMinor,
          currency: "INR",
          orderId: second.orderId,
          deadlineOn: null,
          counterpartyEmail: second.merchant.supportAddress,
          evidenceQuote: quote,
          refuseReason: null,
          messageIds: [first.message.id, second.message.id],
        });
        used.add(first.message.id);
        used.add(second.message.id);
        break;
      }
    }
  }

  return candidates;
}

function returnCandidate(
  message: RuleMessage,
  merchant: AllowlistEntry,
  deskNow: Date,
  horizonDays: number,
): Candidate | null {
  const quote = sentences(message.bodyText).find((sentence) => RETURN_BY.test(sentence));
  const deadlineOn = quote ? dateKeyIn(quote) : null;
  const amountMinor = currencyAmounts(message.bodyText)[0];
  if (!quote || !deadlineOn || amountMinor === undefined || !message.bodyText.includes(quote)) return null;
  if (!dateInHorizon(deadlineOn, deskNow, horizonDays)) return null;

  return {
    kind: "return_window",
    status: "ready",
    merchantKey: merchant.merchantKey,
    amountMinor,
    currency: "INR",
    orderId: orderIdsIn(`${message.subject}\n${message.bodyText}`)[0] ?? null,
    deadlineOn,
    counterpartyEmail: merchant.supportAddress,
    evidenceQuote: quote,
    refuseReason: null,
    messageIds: [message.id],
  };
}

function renewalCandidate(
  message: RuleMessage,
  merchant: AllowlistEntry,
  deskNow: Date,
  horizonDays: number,
  ignoreUnderMinor: number,
): Candidate | null {
  const quote = sentences(message.bodyText).find(
    (sentence) => RENEWAL_SIGNAL.test(sentence) && dateKeyIn(sentence) !== null,
  );
  const deadlineOn = quote ? dateKeyIn(quote) : null;
  const amountMinor = currencyAmounts(message.bodyText)[0];
  if (!quote || !deadlineOn || amountMinor === undefined || !message.bodyText.includes(quote)) return null;
  if (amountMinor < ignoreUnderMinor) return null;
  if (!dateInHorizon(deadlineOn, deskNow, horizonDays)) return null;

  return {
    kind: "renewal",
    status: "ready",
    merchantKey: merchant.merchantKey,
    amountMinor,
    currency: "INR",
    orderId: null,
    deadlineOn,
    counterpartyEmail: merchant.supportAddress,
    evidenceQuote: quote,
    refuseReason: null,
    messageIds: [message.id],
  };
}

function merchantForAddress(address: string, allowlist: readonly AllowlistEntry[]): AllowlistEntry | null {
  const domain = address.split("@").pop()?.trim().toLowerCase() ?? "";
  return (
    allowlist.find((row) =>
      row.domains.some((allowed) => {
        const name = allowed.toLowerCase();
        return domain === name || domain.endsWith(`.${name}`);
      }),
    ) ?? null
  );
}

function claimedBrand(text: string): (typeof BRANDS)[number] | null {
  return BRANDS.find((brand) => brand.pattern.test(text)) ?? null;
}

function brandLabel(merchantKey: string | undefined): string | null {
  return BRANDS.find((brand) => brand.merchantKey === merchantKey)?.label ?? null;
}

function secretSentence(text: string): string | null {
  return sentences(text).find((sentence) => textHasSecret(sentence)) ?? null;
}

function brandSentence(text: string): string | null {
  return sentences(text).find((sentence) => claimedBrand(sentence)) ?? null;
}

function sentences(text: string): string[] {
  return text
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=\.)\s+/))
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function lineContaining(text: string, needle: string): string | null {
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.includes(needle)) return trimmed;
  }
  return null;
}

function dateKeyIn(text: string): string | null {
  const match = text.match(
    /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})\b/i,
  );
  if (!match) return null;
  const month = MONTHS.indexOf(match[2].slice(0, 3).toLowerCase()) + 1;
  if (month < 1) return null;
  return `${match[3]}-${String(month).padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function dateInHorizon(dateKey: string, deskNow: Date, horizonDays: number): boolean {
  const deskDate = kolkataDateKey(deskNow);
  return dateKey >= deskDate && dateKey <= addCalendarDays(deskDate, horizonDays);
}

function addCalendarDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  const nextMonth = String(date.getUTCMonth() + 1).padStart(2, "0");
  const nextDay = String(date.getUTCDate()).padStart(2, "0");
  return `${date.getUTCFullYear()}-${nextMonth}-${nextDay}`;
}
