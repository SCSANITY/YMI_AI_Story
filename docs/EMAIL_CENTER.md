# Admin Email Center

This document describes the Next.js application's outbound-email inventory and
the read-only Admin workspace at `/admin/emails`. Platform status and issue
history remain in the root governance documentation.

## Product boundary

The Email Center has three views:

1. **Overview** summarizes active email families, trigger modes, ownership, and
   the existing Resend operations counters.
2. **Template Library** groups every active outbound family by Security,
   Orders, Delivery, Subscriptions, or Human Communication. YMI-owned fixed
   templates render with realistic non-customer sample data and support desktop
   and mobile preview widths. Provider-managed and freeform messages are
   labelled without a misleading local imitation.
3. **Delivery Events** preserves the existing service-role-backed event and
   delivery-health workspace, including its filters and responsive table/card
   views.

The workspace is deliberately read-only. It has no template save, publish,
rollback, test-send, raw HTML, sender, or link-target control.

## Template authority

`src/lib/email-template-catalog.tsx` is the single application registry for the
13 active outbound families:

- Security: Guest Checkout OTP, Supabase Account Signup OTP, and Supabase
  Password Recovery.
- Orders: Order Confirmation, Stripe Payment Receipt, and Unpaid Checkout
  Reminder.
- Delivery: Final PDF Delivery and the four-state Order Logistics Update.
- Subscriptions: Newsletter Confirmation and Weekly Cart Reminder.
- Human Communication: Support Reply, Partnership Reply, and General Mail.

Nine fixed YMI template families are locally previewable. Supabase owns two
Auth templates, Stripe owns its receipt, and General Mail is authored in the
Admin composer. These four entries expose ownership and trigger facts but no
local preview.

The retired `GeneralInboxReplyEmail` component and
`sendGeneralInboxReplyEmail` sender do not exist in active code. General Inbox
uses the canonical rich General Mail workspace.

## Runtime and security

- The protected Admin layout remains the page authorization boundary.
- Supabase operational reads and React Email rendering stay in the Server
  Component. The client receives only serializable catalog metadata and the
  selected sample HTML.
- The selected preview is rendered inside a sandboxed iframe. It contains only
  fixed sample data and never loads a real customer record.
- Template preview does not call Resend and cannot send email.
- No database table, Storage object, Worker behavior, sender configuration, or
  production provider template is mutated by this feature.

## Shared staff addresses

General Inbox includes Amy and Justin alongside the existing five identities.
These are shared Admin mailboxes, not separate accounts or private employee
inboxes. The existing Admin authorization, compose/reply/attachments and
delivery flow apply unchanged. Addresses are normalized to lowercase.

The required sender variables are `EMAIL_FROM_AMY` and `EMAIL_FROM_JUSTIN`
(for example `Amy <amy@your-verified-domain>`). Missing variables fail closed;
there is no fallback to another mailbox. Reply-To uses the existing inbound
domain authority. Deployment requires the matching database mailbox expansion
first; changing the Web list alone does not enable inbound projection or drafts.
No per-address Resend account or new domain/MX setup is part of this change.

## Local verification

- `npm run email-center:tests` validates registry uniqueness, summary counts,
  all preview variants, read-only Admin structure, and retirement of the old
  General Inbox sender.
- `npm run emails:preview` still builds an ignored static review site, but now
  consumes the same registry and removes obsolete generated HTML before
  rendering.
- `npm run support:tests`, `npm run admin:contracts`, `npm run test:contracts`,
  TypeScript, ESLint, and the production build cover the wider boundaries.

## Delivery evidence

Delivery Events excludes historical `external_observed` rows. These capture
business triggers such as Auth requests or Checkout Session creation.
The original rows remain in the database.

- YMI mail records provider acceptance separately from delivery. Resend message
  IDs connect the send record to signed delivered, bounced, or complained events.
  A delivery event is evidence from the provider, not proof the recipient read
  the message.
- Supabase Auth SMTP events can be included through that same signed webhook.
  Set `EMAIL_FROM_SUPABASE_AUTH` to an address reserved for the project's Auth
  SMTP. Verify the address is exclusive and that actual SMTP mail reaches the
  configured webhook before setting it. Incoming evidence records the Resend
  ID and a fixed Auth subject label so OTPs in subjects are excluded.
- The existing daily email recovery job checks up to 50 recent positive Stripe
  payments from the last seven days. Only a matching successful live charge
  with a receipt number enters the list. The UI shows when the app verified
  the Stripe receipt and labels delivery unconfirmed. Checkout creation, unpaid
  orders and declined payments do not establish receipt evidence.

## Unpaid order reminders

New orders at or after `UNPAID_REMINDER_START_AT` use the creation timestamp
for the 30-minute, 24-hour and six-day checkpoints. Each order and checkpoint
has a distinct event key. The callback checks the order and its payment before
sending, and moves straight to the latest due checkpoint if an earlier
checkpoint was missed. Existing orders are not backfilled. There are at most
three scheduled messages per order. All stages currently share the same
Abandonment Email copy builder; the stage is recorded separately for evidence
and deduplication.

Order Start persists the first task after saving the order items, before the
response. It publishes to QStash after the response. Each callback only looks
up the referenced task and order and creates the next task if needed. The
existing daily cron does not send from the legacy schedule table. It keeps
discount cleanup and republishes at most 25 incomplete tasks from the outbox
recovery index. The pre-existing guest claim RPC may still write legacy rows;
these have no sender. Registration failure is logged without blocking checkout.

The runtime uses the US-East-1 QStash endpoint. Configure that region's
`QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, and `QSTASH_NEXT_SIGNING_KEY`
as server secrets. `UNPAID_REMINDER_CALLBACK_URL` is the full canonical HTTPS
URL of `/api/internal/reminders/unpaid`; avoid a redirect at this URL.
The callback requires a signed request from QStash; it has no browser or cron
secret bypass. The provider payload contains only the order ID and stage.
The checkout link uses the same site as the configured callback.

For a new environment, apply the reviewed Database migration before enabling
the cutoff. Verify the signed callback and payment guard with a synthetic order
and test sender, and check provider and sender configuration without exposing
secrets. Missing settings disable this path and leave legacy sending off.

Use `node --test tests/unpaid-reminders-runtime.test.mjs` for the offline
timing, payment, idempotent task and real SDK verification fixtures.

## Weekly shopping cart reminders

The Web job runs on Vercel Cron at nominal Wednesday 11:00 Hong Kong time
(`0 3 * * 3` UTC). It is separate from QStash and the unpaid-order flow.
The default-send mode starts with an indexed page of cart owners and rechecks
each recipient: a member with a verified Auth email matching the customer
email, no delivery suppression or cart opt-out, and at least one sellable book
still in the cart and unattached to an order or payment. An account email or
Newsletter subscription alone does not qualify.

Supabase records a default grant only as needed to prepare a send, without an
affirmative consent timestamp. There is no backfill. The site footer links to
**Email Preferences**, where signed-in members can turn the reminder off or
explicitly opt in. Turning it off saves a durable opt-out even before the
first send; neither signing in nor adding to the cart resets that choice.
Cookie Settings and Newsletter do not manage this preference.

The cron requires Production, `CART_REMINDER_ENABLED=true`, and a server-only
`CART_REMINDER_UNSUBSCRIBE_SECRET` (at least 32 characters).
`CART_REMINDER_DEFAULT_ON=true` selects the cart-first mode. Setting it to
`false` or removing it and redeploying restores explicit opt-in eligibility
without deleting existing choices. To pause all weekly sends, turn off
`CART_REMINDER_ENABLED` and redeploy; keep the signing secret so existing links
still work. The deployment and first-run status are in the platform ledger.

The batch examines at most three pages of 25 customers (one extra candidate
per page is used to detect more results). It attempts at most 25 sends within
a soft 35-second budget. A capped or failed run is surfaced for operator
attention; there is no same-week catch-up job. The Support sender uses the
shared brand layout and Resend pipeline, with a customer/week idempotency key.
The message links to Cart and contains no book or child details.

The signed footer link opens a read-only confirmation page. Submitting the form
opts out without sign-in and offers a one-use undo valid for 10 minutes.
RFC 8058 one-click requests POST to the same endpoint, with no login, redirect,
or undo receipt. Old grants cannot change a re-enabled preference. Do not log
link tokens. Delivered test mail and the production POST established DKIM
coverage for both List-Unsubscribe headers and the opt-out readback. Gmail did
not show its own button in the test mailbox; the client controls that display.
For a scheduled run, check sent, skipped, failed and capped counts, then
reconcile send and delivery evidence in Delivery Events.
