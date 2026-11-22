import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const mailboxProvider = pgEnum("mailbox_provider", ["seed", "gmail"]);

export const caseKind = pgEnum("case_kind", [
  "return_window",
  "duplicate_charge",
  "renewal",
]);

export const caseStatus = pgEnum("case_status", [
  "ready",
  "refused",
  "snoozed",
  "dismissed",
  "sent",
]);

export const receiptProvider = pgEnum("receipt_provider", ["demo", "gmail"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkUserId: text("clerk_user_id").unique(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const mailboxes = pgTable("mailboxes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  provider: mailboxProvider("provider").notNull(),
  emailAddress: text("email_address").notNull(),
  deskNow: timestamp("desk_now", { withTimezone: true }).notNull(),
  googleRefreshToken: text("google_refresh_token"),
});

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mailboxId: uuid("mailbox_id")
      .notNull()
      .references(() => mailboxes.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    fromName: text("from_name").notNull(),
    fromAddress: text("from_address").notNull(),
    toAddress: text("to_address").notNull(),
    subject: text("subject").notNull(),
    bodyText: text("body_text").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("messages_mailbox_external_id").on(table.mailboxId, table.externalId),
  ],
);

export const cases = pgTable("cases", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  kind: caseKind("kind").notNull(),
  status: caseStatus("status").notNull(),
  merchantKey: text("merchant_key").notNull(),
  amountMinor: integer("amount_minor").notNull(),
  currency: text("currency").notNull().default("INR"),
  orderId: text("order_id"),
  deadlineOn: date("deadline_on"),
  counterpartyEmail: text("counterparty_email").notNull(),
  evidenceQuote: text("evidence_quote").notNull(),
  confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull(),
  refuseReason: text("refuse_reason"),
  snoozeUntil: timestamp("snooze_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const caseMessages = pgTable(
  "case_messages",
  {
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.caseId, table.messageId] })],
);

export const drafts = pgTable("drafts", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: uuid("case_id")
    .notNull()
    .references(() => cases.id, { onDelete: "cascade" }),
  toAddress: text("to_address").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const approvals = pgTable("approvals", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: uuid("case_id")
    .notNull()
    .references(() => cases.id, { onDelete: "cascade" }),
  draftId: uuid("draft_id")
    .notNull()
    .references(() => drafts.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  approvedAt: timestamp("approved_at", { withTimezone: true }).notNull(),
});

export const receipts = pgTable("receipts", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: uuid("case_id")
    .notNull()
    .references(() => cases.id, { onDelete: "cascade" }),
  approvalId: uuid("approval_id").references(() => approvals.id, { onDelete: "set null" }),
  provider: receiptProvider("provider").notNull(),
  providerMessageId: text("provider_message_id"),
  toAddress: text("to_address").notNull(),
  subject: text("subject").notNull(),
  bodySnapshot: text("body_snapshot").notNull(),
  amountMinor: integer("amount_minor").notNull(),
  currency: text("currency").notNull().default("INR"),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
});

export const sentMail = pgTable("sent_mail", {
  id: uuid("id").primaryKey().defaultRandom(),
  receiptId: uuid("receipt_id")
    .notNull()
    .references(() => receipts.id, { onDelete: "cascade" }),
  toAddress: text("to_address").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
});

export const standingOrders = pgTable(
  "standing_orders",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    askBeforeSend: boolean("ask_before_send").notNull().default(true),
    renewalIgnoreUnderMinor: integer("renewal_ignore_under_minor").notNull().default(0),
    returnHorizonDays: integer("return_horizon_days").notNull().default(7),
    renewalHorizonDays: integer("renewal_horizon_days").notNull().default(7),
    duplicateWindowHours: integer("duplicate_window_hours").notNull().default(48),
  },
  (table) => [
    check("standing_orders_ask_before_send_locked", sql`${table.askBeforeSend} = true`),
  ],
);

export const merchantAllowlist = pgTable("merchant_allowlist", {
  merchantKey: text("merchant_key").primaryKey(),
  domains: text("domains").array().notNull(),
  supportAddress: text("support_address").notNull(),
});

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  caseId: uuid("case_id").references(() => cases.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  payload: jsonb("payload").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
