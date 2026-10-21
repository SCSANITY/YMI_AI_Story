# Order material foundation (WEB-UIUX-001/07-B)

Offline foundation only. No customer UI,Preview purchase handler,price reader,
payment fingerprint,confirmation-mail rendering or print release is switched
yet. Do not deploy/apply without the combined07-C chain and owner-authorized
release. Automatic Final and the Worker are outside this change.

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
  private upload chain;browser capture/upload signing integration is07-C.
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

## Remaining integration (07-C)

Reuse existing capture reservation/confirmation and upload validation under the
authorized Creation's owner,including guest-paid/customer-order ownership split.
Do not override upload ownership with a client-supplied ID. Connect forms,customer
success/order entry,confirmation mail,Admin waiting state and print fencing to
this facade. Remove old prepayment material gates only in that combined candidate.
Do not mutate historical migrations,run reset scripts or add legacy compatibility.

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
