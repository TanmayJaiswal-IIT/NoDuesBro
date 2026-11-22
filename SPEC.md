# Found — Morning Desk

Product spec. Version 1. 22 November 2026. Built for the Homingo hackathon.

Found is a morning desk for one job: money the person can still save. It reads mail, finds return windows, duplicate charges, and subscriptions about to renew, and puts a total on screen. Each case is a card with the email it read and the email it wants to send. Nothing is sent until the person presses Approve. The card then becomes a receipt.

This document is the build contract for the 12 days. If a feature is not described here, it is out of the build.

---

## 1. Outcome

A judge sits down, opens the Morning Desk, and sees one number. They open a card, read the evidence, approve the draft, and watch it become a receipt. They also see one case the desk refused to send. The session takes about 90 seconds and does not depend on a live inbox.

The person in the demo is an ordinary user with rent-level money, not an executive. The desk did the reading. The person only decides the sends.

## 2. User

**Demo persona.** Asha Menon, Bengaluru. One personal inbox. She misses return windows, pays a charge twice, and lets subscriptions renew because the email arrived on a busy day.

**Live user (after the demo path works).** Someone who connects the same Gmail account they already use. Found reads it and sends only the message they approved, from that account.

One user per desk in this version. No household, no shared approval, no second seat.

## 3. What ships

The Morning Desk, and the refund clerk behind it.

Three case kinds:

| Kind | What it is | What the draft asks for |
| --- | --- | --- |
| Return window | A delivered order whose return deadline falls inside the horizon | A return and a refund of that order to the original payment method |
| Duplicate charge | The same merchant and the same amount twice inside a short window | Reversal of the second charge only |
| Renewal | A subscription that will charge inside the horizon | Cancel before that charge happens |

The hero number is the sum of those cases still waiting on the person.

Also in the product:

- Evidence on every card, quoted from the source mail
- An editable draft, checked against the source before it can send
- Approve and send, Dismiss, Snooze
- A receipt for every send
- A refused pile for mail that asks for secrets or comes from a lookalike sender
- Standing orders the person can read, with "ask before every send" locked on
- A seeded mailbox so the stage demo is deterministic
- Gmail connect, read, and send, after the seed path is solid

## 4. Out of scope

Do not build these in the 12 days:

- Form filling, appointment booking, voice calls, bill payment, UPI, cards, or any movement of money
- A general chat box, a multi-agent cast, or a second product surface
- Auto-send, even under a rupee limit
- Mobile apps. The desk is a responsive web page. The demo is a laptop.
- Multi-user households, teams, or roles
- Archiving, deleting, or labeling the person's real mailbox
- Recovering money that was already lost outside the three kinds (old warranties, bank disputes with no duplicate pair, annual plans that renewed last month)

There is no Pay button anywhere in the interface.

## 5. Demo clock and the number

The desk does not use the server's real date for deadlines. Each mailbox has a `desk_now` timestamp. The seed mailbox freezes it at:

**Monday 23 November 2026, 07:40 IST** (`2026-11-23T02:10:00.000Z`)

That keeps "closes in 3 days" true for the whole hackathon.

### Seed cases waiting at open

| Case | Merchant | Amount | Why it counts | Deadline |
| --- | --- | --- | --- | --- |
| Return window | Amazon.in | ₹2,499 | Headphones delivered, return closes soon | 26 Nov 2026 |
| Duplicate charge | Swiggy | ₹486 | Same restaurant, same total, two minutes apart | Second charge on 20 Nov |
| Renewal | JioHotstar | ₹1,499 | Annual plan renews inside the horizon | 26 Nov 2026 |

**Hero at open: ₹4,484.** Copy under it: `you can still save · 3 waiting · nothing sent today`.

Math:

- The hero sums `cases.amount_minor` where `status = 'ready'`.
- A renewal counts the upcoming charge. The card says **Keep ₹1,499**. A return or a duplicate says **Get back**.
- Refused cases are excluded.
- Dismissed and snoozed cases are excluded until a snooze expires.
- Sent cases leave the hero and add to the sent line.

After the judge approves the Swiggy card:

- Hero becomes **₹3,998**
- A second line reads **₹486 sent · waiting on the merchant**
- The Swiggy card is gone from the waiting stack and present in Receipts

Amounts are stored as integer minor units (paise) plus an ISO currency code. The seed is `INR`. Do not store money as a float.

## 6. Morning Desk

One page. No prompt box. Desktop layout for the demo:

```
┌──────────────────────────────────────────────────────────────────┐
│ Found              Mon 23 Nov · 7:40am                    Asha │
│                                                                  │
│  ₹4,484                                                          │
│  you can still save · 3 waiting · nothing sent today            │
├────────────────────────────────────────────┬─────────────────────┤
│  Waiting on you                            │  Receipts           │
│                                            │                     │
│  ┌──────────────────────────────────────┐  │  Tue 17 Nov         │
│  │ Get back · Amazon.in         ₹2,499 │  │  ₹399 sent          │
│  │ Return closes Thu 26 Nov            │  │  "Cancel newsletter"│
│  │ evidence · draft · Approve          │  │                     │
│  └──────────────────────────────────────┘  │  Held back          │
│  ┌──────────────────────────────────────┐  │  Lookalike refund   │
│  │ Get back · Swiggy              ₹486 │  │  desk refused       │
│  └──────────────────────────────────────┘  │                     │
│  ┌──────────────────────────────────────┐  │  Standing orders    │
│  │ Keep · JioHotstar            ₹1,499 │  │  Ask before send ON │
│  └──────────────────────────────────────┘  │                     │
│                                            │                     │
│  Held back                                 │                     │
│  ┌──────────────────────────────────────┐  │                     │
│  │ Refused · lookalike sender           │  │                     │
│  │ Asked for card number and OTP       │  │                     │
│  └──────────────────────────────────────┘  │                     │
└────────────────────────────────────────────┴─────────────────────┘
```

Under 800px the receipts column moves below the waiting stack. The hero stays first.

### What the person can do

| Action | Result |
| --- | --- |
| Approve and send | Policy runs again. On pass, the exact draft is sent and a receipt is written. On fail, the card stays open and shows the reason. |
| Edit the draft | Allowed for wording. Save replaces the current draft. Approve checks the edited text against the same policy. |
| Dismiss | Status `dismissed`. Leaves the hero. Recorded in the audit log. |
| Snooze | Hidden until `desk_now` passes `snooze_until`. Default snooze is the next demo morning, 24 hours. |
| Show source | Expands the full text of the evidence messages. Account-number-like digit runs stay masked. |

Empty waiting stack, with receipts still visible: **Nothing waiting this morning.** The hero is ₹0.

Send failure: status returns to `ready`, a `send_failed` receipt row is not shown as money sent, and the card shows `Could not send. Nothing left your inbox.` The draft is unchanged.

## 7. Card anatomy

A waiting card shows, in this order:

1. Line: `Get back` or `Keep`, merchant, amount
2. Deadline line, written in words relative to `desk_now` (`closes Thu 26 Nov`, `charged twice on Thu 20 Nov`, `renews Thu 26 Nov`)
3. Evidence: from-name, from-address, received time, subject, and a short quote that is a verbatim substring of the source
4. The draft: To, Subject, Body. Body is an editable field. To and Subject are editable only inside the checks in section 9.
5. Primary button: **Approve and send**
6. Secondary: **Dismiss**, **Snooze**

A refused card shows the merchant or sender, the amount if one was claimed, and the refuse reason in a full sentence. It has Dismiss. It has no draft and no Approve button.

A receipt shows: sent time, amount, merchant, to-address, subject, the body that was sent, the evidence messages it was based on, and the approval time. Copy at the top of a receipt: **Sent from your inbox. Found cannot pull this back.**

## 8. Case lifecycle

```
ingest → detect → extract → verify → policy
                                         │
                         ┌───────────────┼────────────────┐
                         ▼               ▼                ▼
                      ready           refused          (drop)
                         │
           ┌─────────────┼──────────────┐
           ▼             ▼              ▼
        dismissed      snoozed     approve
           │             │              │
           │             │              ▼
           │             │         policy again
           │             │           │        │
           │             │           ▼        ▼
           │             │         sent    stays ready
           │             ▼
           │      ready again when snooze_until <= desk_now
           ▼
         (hidden)
```

Statuses stored on `cases.status`:

| Status | In the hero | On screen |
| --- | --- | --- |
| `ready` | Yes | Waiting stack |
| `refused` | No | Held back |
| `snoozed` | No | Hidden until the snooze time |
| `dismissed` | No | Hidden. Kept in the database. |
| `sent` | No | Receipts |
| `send_failed` | Yes, treated as still waiting | Waiting stack, with the error |

`send_failed` is stored as `ready` plus the latest audit event `send_failed`, so the hero query stays a single status check. The error string lives on the audit event and is shown on the card.

Only a server function changes status. The client cannot post `status = sent`.

## 9. Trust and policy

Policy is code. The model proposes. The server decides whether a card is sendable.

### Locked rules

These cannot be turned off in the product:

1. **Ask before every send.** `standing_orders.ask_before_send` is true for every user. The database check constraint rejects false. There is no setting and no API that sends without an approval row.
2. **No payments.** No payment provider, no pay link, no "I paid" action.
3. **Send the approved bytes.** The sender loads the draft by id, checks that this draft is the one named in the approval, and sends that to, subject, and body. It does not ask the model to rewrite at send time.
4. **Grounding.** The amount's digit string, the order id (when present), and the evidence quote must all occur in the linked source messages. If any are missing, the case is dropped, not shown.
5. **Recipient allowlist.** `draft.to` must be an address on the merchant allowlist for that case's merchant. The model does not choose new domains.
6. **Secret block.** The draft subject and body are rejected if they contain a card-like number (13–19 digits), the words OTP, CVV, PIN, password, or UPI PIN, or a 6-digit code introduced as a one-time code. The source mail is scanned with the same rules to decide refusal.
7. **Lookalike sender.** If the message asks the person to reply with a secret, or the from-domain is not an allowlisted domain for the brand it claims, the case is `refused`. The reason is shown. Example: `refunds@amazon-secure-claims.net` claiming to be Amazon.
8. **One charge, the second one.** A duplicate draft may ask to reverse only the later charge. If the body asks to reverse both, or names an amount other than the single charge, policy fails.
9. **Edit limits.** An edited body may change wording. It must still contain the grounded amount and order id. It must still pass the secret block and the allowlisted recipient. Adding a second order id that was not in the source fails policy.
10. **Approval match.** Send requires an `approvals` row whose `draft_id` equals the draft about to be sent, whose `user_id` equals the desk owner, and whose `approved_at` is set. The row is written in the same server action as the click, immediately before send.

### Refuse copy

The seed refusal uses this sentence, and the same shape for any later refusal:

> Refused. This message asks for your card number and an OTP, and it was not sent by Amazon. Found will not draft a reply.

### What the person can see about privacy

- Digit runs of 12 or more in any displayed mail are replaced with `••••` before they reach the client.
- The evidence quote is the default. Full source is behind Show source.
- Raw mail and OAuth tokens are never written to client logs.
- Gmail tokens, when they exist, live in the database on the server.

### Standing orders the person can change

| Order | Default | Effect |
| --- | --- | --- |
| Ask before every send | On, locked | No auto-send |
| Flag return windows closing within | 7 days | Detection horizon |
| Flag renewals charging within | 7 days | Detection horizon |
| Treat same merchant and amount as a duplicate within | 48 hours | Pairing window |
| Ignore renewals under | ₹0 | Cases below this amount are not created |

Changing a horizon re-runs detection on stored messages. It does not un-send a receipt or revive a dismissed case.

## 10. Merchant allowlist

Seed this table. Detection may notice a merchant that is not listed. Those cases can be shown as evidence-only with Approve disabled and the line `No known support address yet`. The demo cases all have an address.

| Merchant key | Brand domains | Support address used as To |
| --- | --- | --- |
| `amazon.in` | `amazon.in` | `returns@amazon.in` |
| `swiggy` | `swiggy.in` | `support@swiggy.in` |
| `jiohotstar` | `hotstar.com`, `jiohotstar.com` | `cancel@jiohotstar.com` |
| `paperlane` | `paperlane.example` | `news@paperlane.example` |

`paperlane` exists only so the historical receipt has a merchant. The lookalike domain `amazon-secure-claims.net` is intentionally absent.

## 11. Pipeline

Run on demand when the desk opens in demo mode (messages are already seeded, pipeline can be precomputed) and when a Gmail sync finishes. The desk read path does not call the model. It reads cases already stored.

### Step 1. Normalize

Every source becomes a `messages` row: external id, from, to, subject, text body, received time. HTML mail is reduced to text before storage. Idempotent on `(mailbox_id, external_id)`.

### Step 2. Rules

Rules propose candidates. They do not write drafts.

- **Return window.** The body contains a return-by date, an amount, and a merchant, and the date is on or after `desk_now` and within `return_horizon_days`.
- **Renewal.** The body contains a renewal or "will be charged" signal, an amount, and a charge date inside `renewal_horizon_days` after `desk_now`. Skip when the amount is below `renewal_ignore_under_minor`.
- **Duplicate.** Two messages, same merchant key, same amount, received times within `duplicate_window_hours`, and different order ids. The recoverable amount is one charge, not the sum. The later message is the one the draft asks to reverse.
- **Refuse.** Secret language, or a from-domain that is not allowlisted while the body names an allowlisted brand. This outranks the other kinds.

A message that matches nothing is ignored. It is stored and it does not become a card.

### Step 3. Extract and draft

For each candidate, call OpenAI once with the source text, the rule's kind, and the allowlisted To address. Use the AI SDK with the direct OpenAI provider. The provider reads `OPENAI_API_KEY` from the environment. Do not pass the key in code, and do not route this call through the Vercel AI Gateway.

```ts
import { openai } from "@ai-sdk/openai";
import { generateText, Output } from "ai";

const result = await generateText({
  model: openai(process.env.OPENAI_MODEL ?? "gpt-6.2-sol"),
  providerOptions: {
    openai: { store: false },
  },
  output: Output.object({ schema }),
  prompt,
});
```

`gpt-6.2-sol` is the default: current everyday model, enough for structured extraction and a short draft. Override it with `OPENAI_MODEL` in `.env.local` (for example `gpt-6-luna` when cost matters more than draft quality). One constant, `lib/ai.ts`, is the only place that constructs the model. `store: false` tells OpenAI not to retain the request. Mail text still leaves the server for the API call, which the connect screen should say in one sentence.

The model returns:

- merchant key (must be the one the rule already chose)
- amount minor units
- currency
- order id or null
- deadline date or null
- evidence quote
- confidence from 0 to 1
- draft subject and body

The prompt tells the model to copy the quote, amount, and order id from the source, to ask only for the single action in the kind, and to leave secrets out. The prompt is not the enforcement. Step 4 and step 5 are.

### Step 4. Verify

Drop the candidate if:

- the quote is not a substring of the linked messages
- the amount's digits are not in the linked messages
- an order id is present and is not in the linked messages
- the kind differs from the rule's kind

Show a `ready` card only when confidence is at least 0.6 and verification passed. Below 0.6, do not show the card in the demo. Log `dropped_low_confidence`.

### Step 5. Policy

Set `ready` or `refused` using section 9. Insert the draft row. Insert an audit event `case_created` or `refused`.

### Step 6. Approve and send

One server action:

1. Load the case and the latest draft for this user.
2. Run policy on the current draft.
3. Insert `approvals`.
4. Send.
5. On success, set the case to `sent` and insert `receipts` plus audit `sent`.
6. On failure, leave the case `ready`, insert audit `send_failed`, return the error.

Demo mode "sends" by writing the receipt and a row in `sent_mail` (to, subject, body, sent_at). It does not open a network connection to a merchant. The receipt looks the same as a Gmail send. The receipt's `provider` is `demo` or `gmail`.

Gmail mode sends with `gmail.send` as the connected account, then stores the Gmail message id on the receipt.

## 12. Drafts

Templates fix the ask. The model fills the slots and may smooth the sentences. It may not add a second request.

**Return**

- To: `returns@amazon.in`
- Subject: `Return request for order {orderId}`
- Body must include: order id `404-2288193-7715200`, amount `₹2,499`, item name from the source, and a request for a return plus refund to the original payment method.

**Duplicate**

- To: `support@swiggy.in`
- Subject: `Duplicate charge of ₹486 on 20 Nov 2026`
- Body must include both order ids, both times, and a request to reverse only `SW184423`.

**Renewal**

- To: `cancel@jiohotstar.com`
- Subject: `Cancel before renewal on 26 Nov 2026`
- Body must include the plan amount `₹1,499`, the renewal date, and a request to cancel so that charge does not happen.

**Historical receipt (already sent, not generated on stage)**

- To: `news@paperlane.example`
- Subject: `Please cancel my Paperlane subscription`
- Body asks to cancel the ₹399 monthly charge. Status already `sent` at Tuesday 17 Nov 2026, 08:05 IST.

## 13. Seed mailbox

All of these messages are already ingested when `/demo` loads. From-addresses below are the evidence. Draft recipients still come from the allowlist, not from Reply-To.

### M1. Amazon delivery — return window

- From: `Amazon.in <shipment-tracking@amazon.in>`
- To: `asha.menon@email.com`
- Date: Sunday 16 Nov 2026, 14:12 IST
- Subject: `Delivered: Sony WH-CH520 headphones`
- Body:

```
Hello Asha,

Your package was delivered on 16 Nov 2026.

Item: Sony WH-CH520 wireless headphones
Order: 404-2288193-7715200
Total: ₹2,499.00
Sold by: Amazon.in

You can return this item by 26 Nov 2026 for a refund to your original payment method.

Thanks for shopping with us.
```

### M2. Swiggy — first charge

- From: `Swiggy <orders@swiggy.in>`
- Date: Thursday 20 Nov 2026, 20:12 IST
- Subject: `Order confirmed · SW184422`
- Body:

```
Asha, your order is confirmed.

Restaurant: Anjappar
Order: SW184422
Paid: ₹486
Time: 20 Nov 2026, 8:12pm IST
Paid with card ending 4412
```

### M3. Swiggy — second charge

- From: `Swiggy <orders@swiggy.in>`
- Date: Thursday 20 Nov 2026, 20:14 IST
- Subject: `Order confirmed · SW184423`
- Body:

```
Asha, your order is confirmed.

Restaurant: Anjappar
Order: SW184423
Paid: ₹486
Time: 20 Nov 2026, 8:14pm IST
Paid with card ending 4412
```

The recoverable amount is ₹486. The card quotes both messages. The masked card ending may be shown as `4412` because it is four digits. A full card number must never be seeded.

### M4. JioHotstar — renewal

- From: `JioHotstar <billing@jiohotstar.com>`
- Date: Saturday 21 Nov 2026, 09:02 IST
- Subject: `Your Premium plan renews on 26 Nov 2026`
- Body:

```
Hi Asha,

Your JioHotstar Premium annual plan will renew on 26 Nov 2026.

Plan: Premium annual
Renewal amount: ₹1,499
Payment method: card ending 4412

Cancel before the renewal date if you do not want this charge.
```

### M5. Lookalike — refused

- From: `Amazon Refund Desk <refunds@amazon-secure-claims.net>`
- Date: Sunday 22 Nov 2026, 19:48 IST
- Subject: `Refund of ₹15,000 is on hold`
- Body:

```
Dear customer,

Your refund of ₹15,000 is on hold. Reply to this email with your full card number, CVV, and the OTP we send you so we can release it.

Amazon Refund Desk
```

This must not enter the hero. ₹15,000 is not part of ₹4,484.

### M6. Paperlane — already handled

- From: `Paperlane <news@paperlane.example>`
- Date: Monday 10 Nov 2026, 11:00 IST
- Subject: `Your Paperlane plan renews on 18 Nov`
- Body:

```
Your Paperlane monthly subscription renews on 18 Nov 2026 for ₹399.
```

A receipt already exists for the cancellation sent Tuesday 17 Nov 2026, 08:05 IST. The pipeline must not open a second ready card for M6.

### Ignored noise

Seed two extra messages so the desk is visibly selective: a promotional mail from a bookstore with no amount due, and a delivered-food rating request from Swiggy with no payment. Neither becomes a card.

## 14. Screens

| Route | Purpose |
| --- | --- |
| `/` | Short entry. One line on what the desk does, and a button **Open the morning desk** to `/demo`. |
| `/demo` | The Morning Desk on the seed mailbox, as Asha, at the frozen clock. This is the judging route. |
| `/desk` | The same desk for a signed-in user with a connected mailbox. |
| `/connect` | Explains Gmail access: read mail, send only after approval. Starts Google OAuth with `gmail.readonly` and `gmail.send`. |

`/demo` does not require Clerk. `/desk` and `/connect` do.

There is no settings page in v1. Standing orders sit on the desk column. Editing them saves immediately.

## 15. Data model

Postgres via Neon. Access through Drizzle and `@neondatabase/serverless`.

### users

| Column | Notes |
| --- | --- |
| `id` | uuid pk |
| `clerk_user_id` | nullable, unique. Null for the demo user. |
| `email` | |
| `display_name` | `Asha` in the seed |
| `is_demo` | boolean |
| `created_at` | |

### mailboxes

| Column | Notes |
| --- | --- |
| `id` | uuid pk |
| `user_id` | fk |
| `provider` | `seed` or `gmail` |
| `email_address` | |
| `desk_now` | timestamptz. Frozen for seed. Real sync time for Gmail. |
| `google_refresh_token` | nullable, server only |

### messages

| Column | Notes |
| --- | --- |
| `id` | uuid pk |
| `mailbox_id` | fk |
| `external_id` | unique with mailbox |
| `from_name`, `from_address`, `to_address` | |
| `subject` | |
| `body_text` | |
| `received_at` | timestamptz |

### cases

| Column | Notes |
| --- | --- |
| `id` | uuid pk |
| `user_id` | fk |
| `kind` | `return_window`, `duplicate_charge`, `renewal` |
| `status` | `ready`, `refused`, `snoozed`, `dismissed`, `sent` |
| `merchant_key` | |
| `amount_minor` | integer |
| `currency` | `INR` |
| `order_id` | nullable. For duplicates, the later order id. |
| `deadline_on` | date, nullable |
| `counterparty_email` | allowlisted To |
| `evidence_quote` | |
| `confidence` | numeric |
| `refuse_reason` | nullable |
| `snooze_until` | nullable timestamptz |
| `created_at`, `updated_at` | |

### case_messages

`case_id`, `message_id`. Composite primary key. A duplicate case has two rows.

### drafts

| Column | Notes |
| --- | --- |
| `id` | uuid pk |
| `case_id` | fk |
| `to_address`, `subject`, `body` | |
| `created_at` | Latest row for a case is the current draft |

### approvals

| Column | Notes |
| --- | --- |
| `id` | uuid pk |
| `case_id`, `draft_id`, `user_id` | |
| `approved_at` | timestamptz |

### receipts

| Column | Notes |
| --- | --- |
| `id` | uuid pk |
| `case_id`, `approval_id` | approval nullable only for the pre-seeded Paperlane receipt |
| `provider` | `demo` or `gmail` |
| `provider_message_id` | nullable |
| `to_address`, `subject`, `body_snapshot` | |
| `amount_minor`, `currency` | |
| `sent_at` | |

### sent_mail

Demo outbox. `id`, `receipt_id`, `to_address`, `subject`, `body`, `sent_at`.

### standing_orders

One row per user. Columns from section 9. `ask_before_send` check constraint is `true`.

### merchant_allowlist

`merchant_key` pk, `domains` text array, `support_address`.

### audit_events

`id`, `user_id`, `case_id` nullable, `type`, `payload` jsonb, `created_at`.

Types: `ingested`, `case_created`, `refused`, `dropped_low_confidence`, `draft_edited`, `approved`, `sent`, `send_failed`, `dismissed`, `snoozed`, `standing_orders_updated`.

## 16. Server actions

All mutations are server actions. Each one checks that the case belongs to the current desk user. Demo actions run as the seed user only on `/demo`.

| Action | Behavior |
| --- | --- |
| `approveAndSend(caseId, draftId)` | Section 11 step 6 |
| `saveDraft(caseId, body, subject, to)` | Policy-check, insert a new draft row, audit `draft_edited`. Do not send. |
| `dismissCase(caseId)` | Status `dismissed` |
| `snoozeCase(caseId)` | Status `snoozed`, `snooze_until = desk_now + 24h` |
| `updateStandingOrders(patch)` | Rejects any attempt to set `ask_before_send` false. Re-runs detection. |
| `syncGmail()` | Pull new messages, normalize, run the pipeline. Not used by `/demo`. |

Read model for the page:

- `getDesk()` returns hero amounts, waiting cases with current draft and evidence, refused cases, receipts, standing orders, and `desk_now`.

Hero query:

```sql
select coalesce(sum(amount_minor), 0)
from cases
where user_id = $1 and status = 'ready';
```

Sent line:

```sql
select coalesce(sum(amount_minor), 0)
from receipts
where case_id in (select id from cases where user_id = $1 and status = 'sent')
  and sent_at::date = $desk_today;
```

On first load of the seed, the sent line is ₹0 because the Paperlane receipt is dated 17 Nov, not 23 Nov. Paperlane still appears in the receipt list, labeled with its own date, and is not described as sent today. The subtitle `nothing sent today` stays accurate.

## 17. Gmail

Build this only after `/demo` matches section 19.

- OAuth scopes: `gmail.readonly`, `gmail.send`. No modify, no settings.
- Sync pulls the last 30 days, text bodies only, cap 200 messages.
- Send uses the Gmail API as the user. One message, the approved draft, no attachments.
- Disconnect deletes the refresh token and stops sync. Cases already stored remain until the person dismisses them.
- The connect screen states both scopes in plain language: Found can read mail, and can send a message only after you approve that message.

If Gmail is unfinished on demo day, the judging route is still `/demo`. Do not block the demo on Google verification.

## 18. Stack

| Piece | Choice |
| --- | --- |
| App | Next.js App Router, TypeScript, React, Tailwind |
| Host | Vercel. Default Node.js runtime. No edge runtime. |
| Database | Neon Postgres, Drizzle, `@neondatabase/serverless` |
| Sign-in for `/desk` | Clerk |
| Model | OpenAI via `OPENAI_API_KEY`. Packages `ai` and `@ai-sdk/openai`. `generateText` with `Output.object` and `openai("gpt-6.2-sol")`. |
| Mail send in the demo | `sent_mail` table |
| Mail send when connected | Gmail API |
| Config | `vercel.ts` when the project is linked |

Provision Neon and Clerk from the Vercel Marketplace (`vercel integration add neon` and `vercel integration add clerk`) when the Vercel CLI is available, then `vercel env pull`. Do not hand-roll a password system. Do not add Stripe. Found never charges the user and never pays a merchant.

Local demo must run with the seed and no external account: `npm run dev`, open `/demo`. Model calls for the seed may be precomputed and committed as the resulting case rows, so the stage never waits on OpenAI and never fails if the API is down. Rebuilding those rows needs `OPENAI_API_KEY`. Keep the pipeline code in the repo and covered by a script that re-runs it on the seed messages.

## 19. Demo script

Route: `/demo`. Clock shows Mon 23 Nov, 7:40am. Start with the page already loaded.

1. Point at **₹4,484** and the three cards. Say they came from her mail this morning.
2. Open Swiggy. Show the two order ids, two minutes apart, and the draft that asks to reverse only `SW184423`.
3. Press **Approve and send**. The hero falls to ₹3,998. The receipt appears. Open it and show the body that was sent.
4. Open the held-back Amazon lookalike. Read the refuse sentence. Show that there is no send button.
5. Stop. Leave Amazon and JioHotstar waiting, so it is obvious the desk does not act alone.

If a judge asks to edit, change one polite word in the Amazon draft and approve that instead. Have a reset control, labeled **Reset demo**, visible only on `/demo`, that restores seed statuses in one action.

## 20. Twelve-day plan

The seed desk is the product. Gmail is a second milestone.

| Day | Done when |
| --- | --- |
| 1 | Schema migrated. Seed messages and the Paperlane receipt load. `/demo` renders the hero ₹4,484 and three static cards from the database. |
| 2 | Approve, dismiss, snooze, and receipt work against the seed, with policy checks on the draft, still using hand-written drafts. |
| 3 | Reset demo works. Refused card renders. Digit masking works. Standing orders save, and the locked send rule rejects false. |
| 4 | Rules pass files the three cases and the refusal from raw seed messages, and ignores the noise mail. |
| 5 | Model extraction plus verifier produces the same three cases and the same amounts from the seed. A quote that is not in the source is dropped. |
| 6 | Edited drafts: a clean edit sends; an edit that adds a card number or a second amount does not. |
| 7 | Desk layout matches section 6 on a laptop width and at 390px wide. Copy matches this spec. |
| 8 | Precomputed seed cases are what `/demo` serves. A script can rebuild them. Rehearse the demo script twice. |
| 9 | Gmail connect and sync on a test account, behind `/connect`. |
| 10 | Gmail send on approve for one real message to yourself. Receipt stores the Gmail id. |
| 11 | Full rehearsal on `/demo` only. Fix anything that needs an explanation. |
| 12 | Freeze `/demo`. No new case kinds. |

Days 9 and 10 can slip. Days 1 through 8 cannot.

## 21. Acceptance

The build is ready to show when all of these are true:

1. `/demo` opens to ₹4,484, three waiting cards, one refused card, and the Paperlane receipt.
2. The Swiggy card cites both orders and asks to reverse only the later ₹486.
3. Approve writes a receipt, lowers the hero by that amount, and adds the sent line.
4. The refused card cannot be approved, and its amount is not in the hero.
5. A draft containing `OTP` or a 16-digit number cannot be sent.
6. A draft whose To is not on the allowlist cannot be sent.
7. Dismiss and snooze remove a case from the hero.
8. Reset demo returns the page to the opening state.
9. The page has no chat box, no pay button, and no way to turn off approval.
10. The Amazon and JioHotstar drafts contain only the order facts from M1 and M4.

## 22. Repo map

Target layout once implementation starts:

```
app/
  page.tsx                 entry
  demo/page.tsx            judging route
  desk/page.tsx            signed-in desk
  connect/page.tsx         Gmail consent
  actions/
    desk.ts                approve, dismiss, snooze, save draft, reset
components/
  desk-shell.tsx
  hero-total.tsx
  case-card.tsx
  refused-card.tsx
  receipt-list.tsx
  standing-orders.tsx
lib/
  db/                      schema and client
  desk/query.ts            hero and lists
  pipeline/rules.ts
  pipeline/extract.ts
  pipeline/verify.ts
  pipeline/policy.ts
  pipeline/run.ts
  mail/seed.ts
  mail/gmail.ts
  money.ts                 minor units and INR formatting
scripts/
  rebuild-seed.ts          re-run pipeline on seed messages
SPEC.md
```

Format INR from minor units in one function, `formatInr(249900)` → `₹2,499`. Always divide by 100 only inside that function.

## 23. Names

- Hackathon: **Homingo**
- Product: **Found**
- The screen: **Morning Desk**
- The job: the refund clerk (return windows, duplicate charges, renewals)
- The judging URL: `/demo`
- The number judges should remember: **₹4,484**
- Stage line: **Found ₹4,484**
