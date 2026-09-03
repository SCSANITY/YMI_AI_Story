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

## Local verification

- `npm run email-center:tests` validates registry uniqueness, summary counts,
  all preview variants, read-only Admin structure, and retirement of the old
  General Inbox sender.
- `npm run emails:preview` still builds an ignored static review site, but now
  consumes the same registry and removes obsolete generated HTML before
  rendering.
- `npm run support:tests`, `npm run admin:contracts`, `npm run test:contracts`,
  TypeScript, ESLint, and the production build cover the wider boundaries.
