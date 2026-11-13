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
12 active outbound families:

- Security: Guest Checkout OTP, Supabase Account Signup OTP, and Supabase
  Password Recovery.
- Orders: Order Confirmation, Stripe Payment Receipt, and Unpaid Checkout
  Reminder.
- Delivery: Final PDF Delivery and the four-state Order Logistics Update.
- Subscriptions: Newsletter Confirmation.
- Human Communication: Support Reply, Partnership Reply, and General Mail.

Eight fixed YMI template families are locally previewable. Supabase owns two
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

- YMI mail uses the existing Resend message ID and delivery webhook.
- Supabase Auth SMTP events can be included through that same signed webhook.
  Set `EMAIL_FROM_SUPABASE_AUTH` to an address reserved for the project's Auth
  SMTP. Verify the address is exclusive and that actual SMTP mail reaches the
  configured webhook before setting it. Incoming evidence records the Resend
  ID and a fixed Auth subject label so OTPs in subjects are excluded.
- The existing daily email recovery job checks up to 50 recent positive Stripe
  payments from the last seven days. Only a matching successful live charge
  with a receipt number enters the list. Stripe's receipt number confirms
  sending, and the UI shows the time the app confirmed it and that delivery is
  unconfirmed.

## Unpaid order reminders

New orders at or after `UNPAID_REMINDER_START_AT` use the creation timestamp
for the 30-minute, 24-hour and six-day checkpoints. Each order and checkpoint
has a distinct event key. The callback checks the order and its payment before
sending, and moves straight to the latest due checkpoint if an earlier
checkpoint was missed. Existing orders are not backfilled.

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

Keep these settings absent until the Database migration and callback are
independently reviewed and authorized. Check the production provider and
sender metadata without displaying secrets. Verify in a test environment with
a synthetic order and a test sender before enabling the production cutoff.
Missing settings disable the new path; they do not restart legacy sending.

Use `node --test tests/unpaid-reminders-runtime.test.mjs` for the offline
timing, payment, idempotent task and real SDK verification fixtures.

## Weekly shopping cart reminders (release candidate)

Members open **Email Preferences** from Privacy and explicitly turn on
cart reminders for their confirmed account email. The server records the
choice and notice version in Supabase. New and existing members start off;
there is no backfill and no connection to Cookie Settings or Newsletter.
A mismatched address pauses delivery until the member opts in for the
current address. Turning reminders off is always available to the account
owner while signed in.

An offline candidate adds an alternative policy controlled by
`CART_REMINDER_DEFAULT_ON=true`. Under that policy, the batch starts with
eligible cart owners and confirms the current Auth email before creating
a default grant. Default grants do not record affirmative consent. An opt-out
is saved even before the first reminder and survives future cart activity.
Apply and verify the reviewed database migration before enabling this mode.

The Web job runs on Vercel Cron at nominal Wednesday 11:00 Hong Kong time
(`0 3 * * 3` UTC). It is separate from QStash. It pages active eligibility
records first, then checks the current address, provider suppression and
that at least one book is still in the cart, unattached to an order or
payment. An account email or newsletter subscription alone does not qualify.
The migration starts with an empty eligibility table; an empty page does
not query the cart table.

The job requires Production, `CART_REMINDER_ENABLED=true`, and a server-only
`CART_REMINDER_UNSUBSCRIBE_SECRET` (at least 32 characters). Keep it disabled
until the migration, preference workflow, cohort size, unsubscribe and provider
delivery are verified. The cron reads at most three pages of 25 customers and
attempts at most 25 sends within a soft 35-second budget. It reports a capped
run for operator attention; it does not start another job or guarantee that a
cohort exceeding those bounds is reached. Check that the initial cohort fits
the limits before enabling, and revisit the batch strategy when volume grows.

The Support sender uses the existing Resend pipeline and a customer/week
idempotency key. The mail links to Cart and contains no book or child details.
Its signed footer link opens a read-only confirmation page; a form POST
opts out without sign-in. The resulting page offers a one-use undo valid for
10 minutes. The RFC 8058 mail headers point to the same endpoint; the native
POST accepts both standard encodings, opts out without sign-in or redirect,
and does not issue an undo link. Old link grants cannot change a re-enabled
preference. Keep the signing secret available when sends are paused, and
do not log link tokens. Before enablement, verify the delivered test message
has both headers covered by DKIM, links reach the canonical origin without
redirect, and the real mailbox handles the native action. No change to
unpaid-order copy or scheduling is included.
