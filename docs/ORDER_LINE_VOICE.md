# Paid order-line Voice ? S1 contract

Offline foundation only. S2 customer replacement and S3 interface/copy follow;
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
Admin replacement captures are separately authorized and customer-owned, with
actor/reference evidence in immutable audit. No old authorization is reassigned.

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

S1 preserves first-only customer binding and existing completed-link semantics;
S2 changes replacement CAS/window/read-back/link lifetime and replaced-source
retention. No S1 standalone rollout, compatibility fallback, order deletion or
trigger disabling. Ambiguous old artifact provenance stops for owner disposition.
The one shared SQL mirror is checksum-bound; it is not a migration authority.

Runtime tests cover scoped playback of anon-owned inherited assets, denial of
revoked/cross-line/replaced sources, customer-owned scoped uploads, two lines of
one Creation in Admin, and stale same-asset source revisions in fulfillment.
Database synthetic tests exercise actual RPC/trigger paths; they are not live
Supabase, multi-backend concurrency or physical storage/print acceptance.
