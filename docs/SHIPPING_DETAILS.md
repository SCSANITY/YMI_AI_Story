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

The Order detail page preserves this saved `shipping_details` projection through
`createOrderDetailReadModel`; runtime regression tests render that projection in
the real tracker. Do not add an allowlist mapper that silently drops the history.

## Recorded-region map and official lookup

Shipping Details lazily loads a static SVG world map only when expanded and a
saved carrier event includes a two-letter country. The package marker identifies
the latest **recorded carrier region**, selected by the saved timestamp, not the
carrier's timezone-less local time. Manual notes and the customer's delivery
address never position the package. Unknown countries have text-only fallbacks;
outages preserve the last known record. No live GPS, inferred transport route,
arrival promise, map SDK, key or third-party map request is involved.

The local land outline and country label anchors are simplified from public-domain
[Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/) datasets:
110m Admin 0 countries (land) and 50m Admin 0 countries (label anchors), pinned to
`nvkelso/natural-earth-vector@ca96624a56bd078437bca8184e78163e5039ad19`.
`shipping-world-map.ts` is the generated, bounded display asset; anchors are
country labels, not parcel coordinates. It stays out of the initial order chunk.

The supplementary **Official shipment lookup** lives inside Shipping Details, not
as a competing primary tracking action. A valid saved HTTPS public URL takes
precedence. A matching Dealer Send provider binding (or an explicitly named
Dealer Send carrier on a manual order) and a tracking number default
to `https://apiv2.dealer-send.com/en/Tracking` without database backfill. This is
the general official lookup page; no undocumented parcel query parameter is
appended. The customer enters the displayed tracking number there.

Hide the redundant lookup only when the customer read contract explicitly marks
`officialTrackingCoverage: 'equivalent'`, there is a successful saved check and
carrier history, and no outage. Empty/manual-only history or a failed check keeps
the fallback. A separately configured carrier-page URL is preserved: Dealer Send
portal parity alone does not establish parity with another carrier's page.
The server currently emits **unverified**: API integration has not
proven public-page parity. Do not infer parity from event count, delivery status
or a successful request. At API activation, compare the documented/sampled
information and deliberately update this presentation contract if justified.
This flag is not a new DB column or a customer/Admin switch.

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

`POST /api/internal/shipping-sync/check` is a separate, operator-only non-order
authentication check using the same constant-time internal/Cron authorization.
It requires the runtime switch to be explicitly `false` before using server
credentials for `GetCountryList`. No request-supplied key/origin, Supabase/order
access, booking, email or sync activation occurs. GET is unsupported. Responses
are private/no-store and contain only verification/disabled flags, country count,
GB-list presence or a safe error category; neither raw provider data nor Secret
values leave the server. The shared adapter retains its ten-second timeout,
256 KB stream cap and redirect denial; this route has a twenty-second limit.
Country-list acceptance does not prove tracking, UK service/battery approval,
session expiry, or delivery-code semantics. Run it after a configuration deployment
to verify saved write-only Secrets without exporting or reclassifying them.

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
- `DEALER_SEND_API_BASE_URL`: correct documented HTTPS origin, no path/query/userinfo.
- `DEALER_SEND_API_KEY`: account/API session key, not portal password.
- `DEALER_SEND_DELIVERED_CODES_JSON`: optional array, default `[]`, maximum thirty
  entries with `carrierId`, `apiType`, `status`, `reference`. Do not invent codes.
- Existing `CRON_SECRET` or `INTERNAL_API_SECRET` guards the internal route.

Apply the reviewed LG-001 migration **before** deploying this Web source: the
existing Admin logistics save now depends on the transactional RPC. Follow the
Database preflight/postcheck runbook with explicit owner SQL authorization.
Do not enable carrier sync before verifying actual API host/key/success response.
Follow the official `GetApiSession` instructions first. Contact support only for
an unpublished required value (such as the production origin) or a real access
failure; do not make a separate approval step a presumed API prerequisite.
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
