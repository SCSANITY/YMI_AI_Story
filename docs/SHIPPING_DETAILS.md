# Shipping Details (LG-001)

This is an application contract, not platform release authority. See the root
logistics issue ledger for activation and current deployment state.

## Existing journey, supplementary information

The existing order statuses, progress stages, Admin order groups, payment,
printing, final-PDF release and Signature Voice shipment-readiness controls remain
unchanged. Shipping Details appears only within an owned Shipping/Delivered
order detail. It never changes the order status merely because an event exists.

`loadCustomerOrders` loads saved, allowlisted descriptions for a detail request
only, in parallel with existing asset/payment work. List/Home reads do not gain
shipping queries. The customer browser never contacts Dealer Send or waits for
a carrier API call. Existing order/guest authorization remains the access gate.

The disclosure uses native `details/summary`, supports keyboard operation and
shows carrier versus operations provenance. Missing events, failed checks and
international scan gaps have calm fallbacks; known history is retained. Carrier
local times are not silently treated as UTC or used as guaranteed arrival dates.
The display is recorded-history ordering, not a guaranteed carrier chronology.

## Admin and transaction authority

- `PATCH /api/admin/orders/[orderId]/logistics` retains the existing order form
  and notification contract but writes order fields and status audit atomically
  through `lg_001_save_order_logistics`. Current status/update timestamp guard
  against stale order drafts. Existing Voice integrity stamping is reused.
- `GET/PATCH/POST /api/admin/orders/[orderId]/shipping` handles the row-scoped
  shipping workspace. It requires Admin authorization and private/no-store
  responses. Settings/manual updates also require the current shipping revision.
- Provider binding and automatic Delivered confirmation are explicit per-order
  choices. Any manual status or binding change pauses automatic confirmation; resume it
  separately if appropriate. A changed carrier/number/provider isolates old
  binding history and invalidates in-flight responses.
- Manual text is a customer-visible operations update with its own identifier
  and actor audit. It does not pretend to be carrier telemetry or change status.
- Conflicting unsaved order drafts block workspace actions. Failed saves keep
  the manual draft; reload is explicit. A failed read after a committed save is
  reported as saved with refresh required, not a failed transaction.

## Dealer Send adapter and scheduler

The source targets official API 2.1.4 `GetTrackingDetails`. Credentials stay in
the server runtime. HTTPS official subdomain origins only; redirects are denied,
fetch is no-store, timeout is ten seconds and response size is capped at 256 KB.
Events are bounded to 200 per response and content-key deduplicated. Errors
expose only safe categories, never credential-bearing URLs or raw payloads.

The conservative accepted `Response.Code` is 200; the documentation does not
publish a success-code enum. Confirm it against an actual account response before
enabling sync. No webhook, global status dictionary or polling quota is assumed.

`GET /api/internal/shipping-sync` uses existing constant-time internal/Cron
authorization. The versioned daily schedule is `0 2 * * *` (UTC). Disabled by
default, it performs no database or provider work until explicitly enabled.
Each invocation considers ten due Shipping orders and five pending delivery
notifications with a forty-second launch budget and sixty-second route limit.
Database leases prevent concurrent refreshes; a one-minute cooldown also applies
to Admin refresh. Successful checks become due after six hours, but this does
not override the daily schedule. Failure backoff is one to sixteen hours.
Delivered orders stop scheduled tracking checks. This is deliberately limited
capacity, not real-time tracking; review batch/frequency capacity before scaling.

An exact carrier ID + API type + status code with an evidence reference is
required to propose delivery. The database then checks the lease/revision,
current Shipping stage and per-order opt-in before committing Delivered and its
audit in one transaction. Unknown codes remain informational. Mapping-free
tracking is supported; delivery stays manual. Existing Delivered timestamps and
retention semantics are preserved, using server confirmation time when first set.

Delivery email reuses the existing email authority and idempotency key. A durable
pending marker allows failed sends/audit-link writes to retry without repeating
the status transition. Retrying notifications does not depend on API credentials
or delivery mappings; disabling the whole job disables all scheduled work.
Manual corrections cancel not-yet-sent pending notifications, but cannot retract
an email already being sent externally. Existing email-provider retry/idempotency
limits apply; this is not a claim of exactly-once external delivery.

## Configuration and activation

Server-only names (no credential values belong in Git or documentation):

- `DEALER_SEND_SYNC_ENABLED`: explicitly `true` only after migration/verification.
- `DEALER_SEND_API_BASE_URL`: account-approved HTTPS origin, no path/query/userinfo.
- `DEALER_SEND_API_KEY`: account/API session key, not portal password.
- `DEALER_SEND_DELIVERED_CODES_JSON`: optional array, default `[]`, maximum thirty
  entries with `carrierId`, `apiType`, `status`, `reference`. Do not invent codes.
- Existing `CRON_SECRET` or `INTERNAL_API_SECRET` guards the internal route.

Apply the reviewed LG-001 migration **before** deploying this Web source: the
existing Admin logistics save now depends on the transactional RPC. Follow the
Database preflight/postcheck runbook with explicit owner SQL authorization.
Do not enable carrier sync before verifying actual API host/key/success response.
An actual British tracking sample is not a development gate. Automation waits
only for trustworthy carrier-code semantics; manual Delivered remains available.

Rollback: disable sync, then restore the previous Web release if necessary.
Preserve added tables/history for audit. Never edit an applied migration.

## Verification

`npm run shipping:tests` covers normalization, nullable/duplicate events, safe
errors, delivery mappings, orchestration, rendering and integration contracts.
`npm run test:contracts`, `npm run admin:contracts`, Voice/guest/Checkout/pricing
suites, TypeScript, ESLint and production build protect adjacent journeys.
The external SQL fixture is source-reviewed, not proof of production application.
