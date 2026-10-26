# Paid order-line Voice ? S1 contract

S1 foundation plus offline S2 server contract. S3 interface/copy follows;
all three slices release together with the matching Database migration. This
is component contract documentation, not platform status or a release GO.

## One authority for each stage

Before purchase: Creation voice fields remain authoritative. PersonalizePage,
Creation purchase-configuration, preview Job admission, package pricing,
preview-version-selection and `assertSignatureVoicePurchaseBinding` keep their
existing pre-purchase contract. This slice does not change the login merge.

After purchase: `order_line_voice`, keyed by cart_item_id, is the only source.
`loadOrderLineVoiceBindings(orderId,itemIds)` queries that order and those exact
lines with no Creation fallback. Metadata/title/cover may still use Creation;
its voice fields are never merged as a paid source. Two purchases/lines of one
Creation remain independent. Quantity on one line shares one source.

Payment initialization copies asset/authorization/consent REFERENCES once, not
file bytes. Both order-first and lines-first payment writers and webhook replays
converge in the DB. Inherited anonymous custody and later login merge are valid;
order access is distinct from asset custody. New postpayment captures reserve
and confirm a new explicit v3 authorization/asset for the ORDER CUSTOMER.
Neither paid-line updates nor subsequent Creation changes write back to the
other source. Asset and authorization RESTRICT references remain live.

## Consumer list and paths

| Consumer | Authority/read or write path |
| --- | --- |
| Materials GET, success/order/mail readiness and confirmation/resend | existing materials_read; DB now reads line readiness; scopes grants by order/item |
| Material upload-url/confirm | resolveMaterialCaptureOwner -> authorized material line -> orders.customer_id; no Creation owner derivation |
| First paid bind (S1) | materials_bind_voice -> paid line + fresh confirmed customer-owned v3 reference; no Creation write |
| Customer playback | user-assets/[id]/download?orderId=...&itemId=... -> existing materials access -> current line asset -> private bytes; Bearer remains header only |
| Pre-purchase playback | original owner/owned-Creation path preserved when no order context supplied |
| Admin pending/current-source workspace | loadAdminSignatureVoiceWorkspace -> shared line reader; production state/tracks/hardware keyed by cart_item_id |
| Admin source access/replacement/triage | requireAdminSignatureVoiceOrderItem validates paid order/item and current line; RPCs keyed by line, Creation provenance only |
| Narration upload/confirm | stages source_revision; line-scoped current track lookup; DB rejects source/revision drift |
| Unknown-result reconciliation | order+cart item+Creation, never first same-Creation item |
| Print/hardware/shipment | DB line production authority; fulfillment verifies every line's source/revision and all 15 track bytes |
| Delete/expiry/cleanup | every Creation AND every line reference counts as bound, irrespective of custody; no shared-source removal |

Admin DTO exposes current upload timestamp, declaration.replaceUntil (paid_at +
48h), sourceRevision and persisted narrationOutdated. Presentation changes are S3.
The existing Admin authorization reference/declaration remains mandatory; new
Admin replacement assets are customer-owned, but authorization is an explicit
Admin declaration, never customer-clicked v3 consent. The distinct immutable
Admin authorization stores actor/evidence/time and declared subject/relationship;
only the Admin replacement RPC can write it. The line stores the Admin kind and
no customer acceptance timestamp; Admin labels it "Admin-declared replacement".
No old authorization is reassigned. Customer capture remains confirmed v3.

A rejected payment source creates an empty line with snapshot_rejected_reason,
shown in Admin pending items. Legacy v1, child-name drift or missing customer
identity cannot abort payment through source validation. A null-customer empty
line acquires only access identity when the order customer is later filled;
its source is not resnapshotted. Structural/resource errors remain failures.
Ordered-later Voice lines initialize for any already-paid order status, while
dedication retains the eligible-state guard.

## Database object coverage

The source inventory binds current definitions/custody for Creation guards,
line initializer/materials, narration manifests/access/commit/lock/invalidation,
triage, replacement, print/hardware/shipment and asset cleanup. Creation guards
remain on Creation; equivalent consent/completeness/owner and RESTRICT guards
protect lines. Only the Creation narration invalidation trigger moves to lines.
Expired staged narration/replacement cleanup remains asset/staging-row based;
its rows now carry a line FK/revision. Unchanged authorization reserve/confirm,
audit immutability and material-access helpers are frozen as dependencies too.
See the Database runbook/manifest for every exact object, fence and backfill.

## Boundaries and verification

S2 replaces the first-only binder with asset+revision CAS and server48h/late-first
eligibility. Completion is nonrevoking acknowledgement;unknown results require
scoped exact-source read-back without retry or possibly-bound deletion. No S1 standalone rollout, compatibility fallback, order deletion or
trigger disabling. Ambiguous old artifact provenance stops for owner disposition.
The one shared SQL mirror is checksum-bound; it is not a migration authority.

Runtime tests cover scoped playback of anon-owned inherited assets, denial of
revoked/cross-line/replaced sources, customer-owned scoped uploads, two lines of
one Creation in Admin, and stale same-asset source revisions in fulfillment.
Database synthetic tests exercise actual RPC/trigger paths; they are not live
Supabase, multi-backend concurrency or physical storage/print acceptance.

## S2 server and scoped queue contract

New bind takes explicit expectedAssetId (NULL initially) and expectedRevision;
response/read-back identifies the new asset/revision. Failures distinguish closed
window,shipment,stale revision and unknown outcome. One DTO exposes voice_ready,
voice_asset_id,voice_revision,voice_uploaded_at,voice_replace_until,
can_submit_voice and can_replace_voice. It is shared by capture upload/confirm.
Replacement eligibility is not a missing-recording flag:confirmation mail and
order summary count supreme && !voice_ready. Mail send/idempotency is unchanged.

No deletion of voice bytes in confirmation-error paths:an invalid replay may
refer to a current/shared source. Existing durable capture/orphan cleanup owns
failed uploads. Unknown binding calls only read back authorization/source/revision
after order access,never resubmit or delete.

Customer changes stop at shipped_at. Admin after-shipment replacement stays
allowed and displays retainedSourceCount. Existing batch20 cleanup API remains.
The queue gains provenance;its private junction keeps every superseding order
and marks shipped old files as retained without queueing. Claim pauses/reschedules
1h for open support across ANY provenance order,then proceeds after closure.
Shared references remain locked/rechecked;orphan/delete cannot bypass retention.
No delivered lifecycle executor or Stripe/legal hold model is claimed:BL-073
remains separate. See Database WEB_UIUX_019_S2.md for exact source/policy fences.

S3 must freeze expected asset/revision at edit intent,send them on bind,keep the
same grant after acknowledgement and consume current eligibility/update copy.
It also owns cartItemId React keys and guest fetch-to-blob/Bearer playback.
The existing OrderMaterialsClient is deliberately not the S2 delivery surface;
no mixed S1/S2/S3 rollout or standalone deployment is permitted.

React checklist for the bounded TSX delta:pending counts derive at render from
server readiness;no new effect/state,client fetch or dependency;retained-source
text uses existing markup and escapes evidence normally. Independent Admin
provenance/declaration reads are parallel;counts are grouped once per line.
