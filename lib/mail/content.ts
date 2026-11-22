export const DEMO_EMAIL = "asha.menon@email.com";
export const DESK_NOW = "2026-11-23T02:10:00.000Z";
export const INBOX = "asha.menon@email.com";

export const merchantLabels: Record<string, string> = {
  "amazon.in": "Amazon.in",
  swiggy: "Swiggy",
  jiohotstar: "JioHotstar",
  paperlane: "Paperlane",
};

export const allowlist = [
  {
    merchantKey: "amazon.in",
    domains: ["amazon.in"],
    supportAddress: "returns@amazon.in",
  },
  {
    merchantKey: "swiggy",
    domains: ["swiggy.in"],
    supportAddress: "support@swiggy.in",
  },
  {
    merchantKey: "jiohotstar",
    domains: ["hotstar.com", "jiohotstar.com"],
    supportAddress: "cancel@jiohotstar.com",
  },
  {
    merchantKey: "paperlane",
    domains: ["paperlane.example"],
    supportAddress: "news@paperlane.example",
  },
] as const;

const amazonBody = `Hello Asha,

Your package was delivered on 16 Nov 2026.

Item: Sony WH-CH520 wireless headphones
Order: 404-2288193-7715200
Total: ₹2,499.00
Sold by: Amazon.in

You can return this item by 26 Nov 2026 for a refund to your original payment method.

Thanks for shopping with us.`;

const swiggyFirstBody = `Asha, your order is confirmed.

Restaurant: Anjappar
Order: SW184422
Paid: ₹486
Time: 20 Nov 2026, 8:12pm IST
Paid with card ending 4412`;

const swiggySecondBody = `Asha, your order is confirmed.

Restaurant: Anjappar
Order: SW184423
Paid: ₹486
Time: 20 Nov 2026, 8:14pm IST
Paid with card ending 4412`;

const hotstarBody = `Hi Asha,

Your JioHotstar Premium annual plan will renew on 26 Nov 2026.

Plan: Premium annual
Renewal amount: ₹1,499
Payment method: card ending 4412

Cancel before the renewal date if you do not want this charge.`;

const lookalikeBody = `Dear customer,

Your refund of ₹15,000 is on hold. Reply to this email with your full card number, CVV, and the OTP we send you so we can release it.

Amazon Refund Desk`;

const paperlaneBody = `Your Paperlane monthly subscription renews on 18 Nov 2026 for ₹399.`;

const bookstoreBody = `Hello Asha,

New paperbacks arrived in the shop this week. Come browse when you can.`;

const ratingBody = `Asha, your food was delivered. Rate Anjappar when you have a moment.`;

export const seedMessages = [
  {
    externalId: "m1",
    fromName: "Amazon.in",
    fromAddress: "shipment-tracking@amazon.in",
    toAddress: INBOX,
    subject: "Delivered: Sony WH-CH520 headphones",
    bodyText: amazonBody,
    receivedAt: "2026-11-16T08:42:00.000Z",
  },
  {
    externalId: "m2",
    fromName: "Swiggy",
    fromAddress: "orders@swiggy.in",
    toAddress: INBOX,
    subject: "Order confirmed · SW184422",
    bodyText: swiggyFirstBody,
    receivedAt: "2026-11-20T14:42:00.000Z",
  },
  {
    externalId: "m3",
    fromName: "Swiggy",
    fromAddress: "orders@swiggy.in",
    toAddress: INBOX,
    subject: "Order confirmed · SW184423",
    bodyText: swiggySecondBody,
    receivedAt: "2026-11-20T14:44:00.000Z",
  },
  {
    externalId: "m4",
    fromName: "JioHotstar",
    fromAddress: "billing@jiohotstar.com",
    toAddress: INBOX,
    subject: "Your Premium plan renews on 26 Nov 2026",
    bodyText: hotstarBody,
    receivedAt: "2026-11-21T03:32:00.000Z",
  },
  {
    externalId: "m5",
    fromName: "Amazon Refund Desk",
    fromAddress: "refunds@amazon-secure-claims.net",
    toAddress: INBOX,
    subject: "Refund of ₹15,000 is on hold",
    bodyText: lookalikeBody,
    receivedAt: "2026-11-22T14:18:00.000Z",
  },
  {
    externalId: "m6",
    fromName: "Paperlane",
    fromAddress: "news@paperlane.example",
    toAddress: INBOX,
    subject: "Your Paperlane plan renews on 18 Nov",
    bodyText: paperlaneBody,
    receivedAt: "2026-11-10T05:30:00.000Z",
  },
  {
    externalId: "m7",
    fromName: "Page & Spine",
    fromAddress: "hello@pageandspine.example",
    toAddress: INBOX,
    subject: "New arrivals this week",
    bodyText: bookstoreBody,
    receivedAt: "2026-11-18T04:30:00.000Z",
  },
  {
    externalId: "m8",
    fromName: "Swiggy",
    fromAddress: "orders@swiggy.in",
    toAddress: INBOX,
    subject: "How was Anjappar?",
    bodyText: ratingBody,
    receivedAt: "2026-11-20T16:00:00.000Z",
  },
] as const;

export const amazonDraft = {
  toAddress: "returns@amazon.in",
  subject: "Return request for order 404-2288193-7715200",
  body: `Hello,

I would like to return my Sony WH-CH520 wireless headphones from order 404-2288193-7715200. Please refund ₹2,499 to my original payment method.

Thank you,
Asha`,
};

export const swiggyDraft = {
  toAddress: "support@swiggy.in",
  subject: "Duplicate charge of ₹486 on 20 Nov 2026",
  body: `Hello,

I was charged ₹486 twice for the same Anjappar order on 20 Nov 2026. The first order is SW184422 at 8:12pm IST. The second is SW184423 at 8:14pm IST. Please reverse only SW184423.

Thank you,
Asha`,
};

export const hotstarDraft = {
  toAddress: "cancel@jiohotstar.com",
  subject: "Cancel before renewal on 26 Nov 2026",
  body: `Hello,

Please cancel my JioHotstar Premium annual plan before it renews on 26 Nov 2026. I do not want the ₹1,499 charge.

Thank you,
Asha`,
};

export const paperlaneSent = {
  toAddress: "news@paperlane.example",
  subject: "Please cancel my Paperlane subscription",
  body: "Please cancel my Paperlane monthly subscription so the ₹399 charge does not happen.",
  sentAt: "2026-11-17T02:35:00.000Z",
};
