# Order material foundation (WEB-UIUX-001/07-B)

Offline combined07-C candidate on the accepted07-B foundation. Customer forms,
purchase entries,confirmation mail,Admin and print readers are connected here.
Independent review and a separately authorized combined release remain required.
Automatic Final and the Worker are outside this change.

## Authority and API

- `order-materials-server.ts` is the server facade:authorized `loadOrderMaterials`
  -> Database `materials_read`. `loadOrderLineDedications` projects its one effective
  purchased-line record;it never merges a draft/paid snapshot/overlay. Before
  purchase,existing Creation drafts remain separate inputs to initial payment.
- `loadCreationVoiceBindings` is for already-authorized server/Admin readers;
  Creation.voice_asset_id remains sole source. No per-line voice source is added.
- Database owns paid_at,revision/deadline checks and atomic null->bound capture.
  No second JavaScript deadline policy or expiry job. Per owner2026-10-21, scoped
  links have no time expiry in the early phase. Completion/refund/eligible-state
  exit ends access;OTP recovery restores still-eligible access. The48h dedication
  window and existing OTP code expiry are unchanged.
- Paid-line initialization works with the actual payment writer's order-first,
  then ordered-line statements, including partial cartItemIds and webhook replay.
  The paid transition also handles already-ordered lines. One locked DB helper
  seeds only missing effective rows; existing revisions are never reinitialized.
- GET `/api/orders/:orderId/materials` returns the scoped DTO only and never
  issues/consumes/rotates a link,sends OTP or creates an anonymous session.
  Access is either an authenticated customer or a43-character opaque bearer
  token from the mail-link fragment. Only its SHA256 hash reaches the DB.
- POST same path accepts `dedication`(itemId,expectedRevision,body),
  `voice`(itemId,assetId,authorizationId) or explicit `complete`.
  Voice requires an already confirmed,consented capture through the existing
  private upload chain;the07-C page connects the existing capture/sign/confirm steps.
  Completion revokes active links;it does not end the48h dedication window.
- POST `.../materials/recovery`:request(email) reuses guest OTP normalizer,rate
  RPC,delivery and single-use verification. Request returns a non-enumerating
  challenge response;verify(challengeId,code) calls the atomic order/purpose-bound
  recovery RPC. Generic guest verified=true is not an order-write credential.
  No GET recovery operation. Fresh raw link is returned only after verification.
- Issue/read/send functions must not log credentials or add raw link/token to
  managed-mail context,analytics,order DTOs or Storage metadata. Client integration
  reads the fragment locally and submits bearer authorization;no token query URL.
- All responses are private/no-store;writes enforce JSON,origin and streamed4KiB
  limit. Unexpected backend errors become fixed codes,no raw SQL/private details.

## 07-C journey and custody

Preview and Cart retain voluntary dedication/Voice controls with now/later
copy. Purchase does not open either material dialog. Cart,order-start,Checkout
Session and the payment fingerprint require no dedication or missing recording.
A supplied Voice binding still passes the existing integrity checks. Prices,
active Stripe Session,financial locks,manual Final mode and31-page seeding stay.
No prepayment dedication snapshots are written;payment initializes the effective
rows through the accepted DB triggers. Existing optional Creation drafts stay.

The scoped page is `/orders/[orderID]/materials`. It shares the accepted APIs,
keeps its bearer only in memory,removes the fragment from history,and opens OTP
recovery directly on missing/revoked access. GET never issues/consumes access.
Authenticated customers use existing sessions;guests use the scoped email link
or order-email OTP. A Stripe Session ID remains read-only proof,not a write grant.
Dedicated forms save with expected revisions. Completion is explicit;it revokes
links without shortening the48h dedication window. No scheduled reminders exist.

Owner-approved07-C refinement:the page inherits the existing Navbar/logo/back
control from AppShell and adds an explicit orders entry;no duplicate header or
new design system. GET enriches only authorized material lines through the
existing personalized-title and generated-Preview-cover authorities. The DTO
projects only title/short-lived signed cover URL/status,not raw customization.
Other readers do not sign thumbnails. Page,success/order notice and confirmation
email use toUTCString(),which explicitly labels GMT (UTC);no browser-local
unlabelled deadline. Covers reuse OrderCoverImage without an unrelated order-cover
auth request;reloading the material read refreshes its signed URL.

Recording reuses SignatureVoiceDialog,explicit synthetic-narration consent,
private signing,reservation and byte/duration confirmation. Existing-file choice
is enabled on this postpayment page only;selection stays local until consented
Upload. Browser-unreadable audio duration remains subject to server inspection.
The scoped context derives the original Creation's custody on the server. It
can upload only Voice for an eligible unbound line,never faces/avatars or another
line. AssetOwner is a custody-only type,not an authenticated CheckoutOwner.
Scoped upload paths put the random asset UUID in the owner segment;the real owner
remains in the existing DB rows and is never returned to the bearer. Confirmation
returns only asset ID,authorization ID and verified duration. Thus an anon
Creation/customer-paid order works without disclosing the anon login identifier.
Unbound failures retain existing cleanup/capture rules;bound replacements stay Admin-only.

Confirmation sending resolves current state and issues a scoped link lazily,
AFTER managed-mail idempotency allows a real send. Raw bearers enter delivered
content only,never event context/logs. Mail includes the48h dedication deadline
and urges missing Voice submission to avoid delay. Mail previews use synthetic
same-shaped data. Success/order UI uses the same material DTO;guest entry can
recover through order-email OTP. No mail attachment intake is added.

Admin derives bindings through the shared Creation reader and lists expected
missing recordings with days waiting. Bound-source triage,narration and shipping
protections remain. Trusted print reads use materials_read_trusted_lines over
the same effective rows,including historical orders;customer access eligibility
is not widened. The prepayment JS binding implementation remains unchanged.

Manual print preparation submits the dedication revision displayed in Admin.
The new service wrappers lock the same order as dedication save,before legacy
job/artifact locks. They call unchanged existing print authorities;direct legacy
RPC execution is revoked. Artifacts retain an immutable dedication_revision.
Verification/release reject stale revisions;release requires paid_at+48h. The
artifact trigger fences internal writers too. Original Admin/PDF/Voice checks
remain. A changed dedication requires a newly prepared/uploaded PDF.

## Verification

`node --test tests/order-materials-foundation.test.mjs` exercises actual transpiled
helpers/routes with mocked server dependencies;no network,mail,Storage or Provider
call. It verifies read-only GET,DTO projection,bearer hashing,customer access,
origin/body bounds,revision RPC arguments,fixed errors and purpose-bound recovery.
The full contracts suite also verifies the exact data-free Database SQL mirror.
The actual finalizeOrderPayment is executed with a query probe to pin order-first,
selected-line updates and replay;isolated SQL tests replay that writer sequence.
Database PGlite tests exercise actual SQL/guards separately. This is not production
catalog evidence,a UI/device test or a full real-catalog Next production build.

Additional offline commands:
- `node --test tests/order-materials-mail.test.mjs` mocks mail delivery completely.
- `node tests/materials-preview-fixture.mjs` serves actual customer components with
  synthetic state and disabled external requests/uploads. Optional output path
  is argv2;the default is ignored `.next/materials-preview`. `?invalid=1` shows
  link recovery. This is not a live upload,mailbox,real-catalog build or device test.
- Database runbooks retain51 foundation and17 print-fence synthetic checks.
No reset/cleanup/production SQL,Storage,mail or deployment is part of these tests.
