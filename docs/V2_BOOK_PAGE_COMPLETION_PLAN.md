# V2 Book Page Completion Plan

> CURRENT PROGRAM STATUS (2026-08-25): the V2 framework, Mock E2E, Admin review,
> customer PDF, manual Print handoff, Reader, and downstream order integration
> are complete. This document is now a migration reference. Open work is limited
> to remaining story packages, T3-019 provider hardening, and a later targeted
> RunPod E2E. All other historical `Pending`, `Ready`, and deferred evidence
> language below is non-actionable unless restated in `ENGINEERING_BACKLOG.md`.

Started: 2026-08-04

## Purpose

This document is the persistent execution plan for finishing the V2 independent
book-page migration after T3-010 S1-S7 and the Birthdaygirl pilot package.

The remaining work is deliberately split into small Third-Round issues. Codex
implements one issue at a time. Claude Code independently reviews that issue
before the next dependent issue starts. The owner performs product decisions and
browser/E2E acceptance at the recorded gates.

T3-010 remains the parent architecture issue. Its final S8 E2E is deferred until
the Admin, PDF, Print, release, and downstream issues in this plan are complete.

## Completed Baseline

- One V2 config path remains canonical per story: `<template_id>/config.json`.
- Runtime presentation identity is explicit metadata; no runtime filename
  parsing determines role, side, spread, page order, or face-swap behavior.
- Worker V2 contract, subtitle-first processing, explicit provider bypass,
  Mock Final subtitle processing, dynamic page counts, page reruns, Preview WebP
  display output, Final PNG output, and structured output metadata are complete.
- Signed Preview pages, shared physical-book leaves, Personalize Preview, Issue
  030 variants, and the released My Books Reader support structured V2 pages.
- `Birthdaygirl_story` has three Preview assets, 32 Final assets, a validated
  35-page config, and a matching 35-entry subtitle template in Supabase Storage.
- The uploaded public config URL currently returns the verified V2 package.
- V2 PDF Release remains intentionally blocked until the cover composer and
  release integration are complete.

## Locked Invariants

Every issue in this plan must preserve these rules:

1. Each square image remains an independent processing and review unit.
2. Preview and Final page counts are config-driven, never fixed at 2, 15, 30,
   31, or 32 in shared runtime logic.
3. Runtime never parses filenames to determine role, side, spread, page order,
   or any other presentation identity.
4. `_A/_B` is an authoring convention only. Runtime uses
   `enable_face_swap: boolean`.
5. Every configured image has exactly one subtitle entry. `texts: []` is a valid
   no-op and still travels through the common subtitle contract.
6. Preview source/display assets use WebP; Final source/output assets use PNG.
7. Final cover halves are distinct reviewed assets. Customer PDF composition is
   a later output concern and may not change their review identity.
8. Authorization, purchase entitlement, payment, release, email, and order-state
   facts remain server-authoritative and idempotent.
9. Mock replaces only the image provider. It may not create a second completion,
   review, PDF, email, order, or Reader path.
10. Provider failure never falls back to Mock or placeholder output.
11. V1 remains compatible until old test data and remaining story configs are
    intentionally retired.
12. Story assets/configs change only with owner approval. SQL remains in
    `Template_folder`.

## Issue Sequence

### T3-011 - Admin Final Page Read Model

Status: Reviewed - approved

Goal:
- Make the protected Admin Final APIs expose allowlisted V2 page identity by
  merging `jobs.output_assets.pages` with `final_job_pages` by `page_index`.

Scope:
- Schema markers, role, output order, spread, side, physical page number, review
  status, reviewed path URL, and print state.
- V1 additive compatibility, Admin authorization, no-store responses, signed URL
  refresh, and fail-closed malformed V2 behavior.
- Pure mapping tests and protected API contract tests.

Out of scope:
- Admin layout, mutation behavior, PDF, Print, Worker, or story config changes.

Exit gate:
- A 32-page V2 fixture and a V1 fixture both produce correct protected Admin
  responses without exposing private paths or inferring identity from filenames.

### T3-012 - Admin Final Review V2 Workspace

Status: Reviewed - approved

Goal:
- Render V2 Final jobs as 32 independent reviewed pages with clear cover and
  spread structure while preserving the existing three-column scroll ownership.

Scope:
- Dynamic totals; back/front-cover labels; 15 interior spread groups; left/right
  and physical page labels; selected-page canvas; responsive/mobile behavior.
- Queue badges and progress use real configured/review row counts.

Out of scope:
- Mutation semantics and image-delivery optimization.

Exit gate:
- V1 and V2 fixtures remain usable at desktop, short-laptop, and mobile widths;
  no 15-page assumption or new nested document scrollbar remains.

### T3-013 - Admin V2 Review Mutations

Status: Reviewed - approved

Goal:
- Prove and, where necessary, adapt approve, needs-fix, replacement upload,
  approve-all, single-page rerun, and stale-response protection for dynamic V2
  pages.

Scope:
- Page-index authority, A/B provider policy through stored config, metadata
  retention after replacement/rerun, exact completion coverage, and idempotency.

Out of scope:
- PDF/Print release and broad Admin visual redesign.

Exit gate:
- Focused tests cover a V2 A page, V2 B page, cover half, interior replacement,
  stale intent, approve-all 32/32, and V1 regression.

### T3-014 - Admin 32-Page Image Performance

Status: Reviewed - approved (real 32-page browser capture deferred to pilot UAT)

Goal:
- Keep the 32-page Admin workspace responsive without eagerly transferring all
  full-resolution Final PNGs.

Scope:
- Measure first-visible bytes/time, thumbnail/lazy-loading policy, selected-page
  full-resolution loading, signed URL renewal, and error recovery.
- Respect the Issue 001 decision not to route private/generated images through
  the Vercel Next Image optimizer.

Exit gate:
- Recorded desktop/mobile network evidence and no full-resolution 32-image eager
  burst. No optimization is added if measurements prove it unnecessary.

### T3-015 - Structured Customer PDF Composer

Status: Reviewed - approved (production cover quality gate remains)

Revision note (owner decision after T3-016):
- The pure composer foundation remains approved, but its temporary output layout
  of one cover spread plus 30 independent PDF pages is superseded by T3-017 S1.
  The customer PDF will contain 16 landscape spreads instead.

Goal:
- Build and test a pure structured composer for a customer PDF consisting of one
  landscape cover spread followed by dynamic independent interior pages.

Scope:
- Validate exactly one back/front pair; define left-back + right-front landscape
  normalization; preserve output order; append 30 Birthdaygirl interiors as
  physical pages 1-30; keep V1 PDF behavior compatible.
- Fail visibly on missing/malformed metadata, mismatched cover geometry, fallback
  generation, or size overflow.

Product gate:
- Owner supplies corrected production cover dimensions/resolution before print
  quality is accepted. Provisional 1000x1020 halves are test-only.

Exit gate:
- Birthdaygirl fixture yields a 31-page PDF with a correctly composed first page,
  deterministic page order, acceptable dimensions, and bounded uploaded bytes.

### T3-016 - V2 PDF Release Integration

Status: Reviewed - approved (layout proof revision moves to T3-017 S1)

Revision note (owner decision after review):
- Positive proof, approved-path authority, metadata preservation, idempotency,
  email, and production transition remain the release foundation. T3-017 S1 will
  replace only the temporary 32-source/31-PDF-page proof relation with the final
  metadata-driven 16-spread customer layout.

Goal:
- Integrate the structured composer into the existing idempotent release path and
  remove the V2 guard only for a fully valid composed output.

Scope:
- Approved-path authority, exact 32-row readiness, PDF upload, schema/layout and
  per-page metadata preservation, repeated release, shared Buy Again jobs, and
  fallback blocking.

Out of scope:
- Print-package format and UI redesign.

Exit gate:
- V2 valid release succeeds once; malformed/partial/concurrent releases fail or
  reconcile safely; V1 release remains unchanged.

### T3-017 - Customer Spread PDF And Manual Print Handoff

Status: S1+S2+S3 Reviewed - approved

Goal:
- Finalize the digital customer PDF as 16 landscape spreads and provide an
  intentionally manual, replaceable print-handoff boundary until printer
  requirements are known.

S1 - Customer spread PDF revision:
- Compose one cover spread from approved back + front cover with no center gap.
- Compose every explicit interior spread as left + right with a small white
  center gutter. Spread identity and order come only from V2 metadata.
- Birthdaygirl therefore maps 32 approved source images to 16 landscape PDF
  pages, but runtime code stays dynamic and does not hardcode 16/32.
- Preserve customer-oriented compression and the existing 50 MiB fail-visible
  ceiling. Replace the temporary proof relation with the real composed result.
- Present the signed download with the sanitized personalized book title; keep
  the private deterministic Storage path independent from the display filename.

S2 - Approved source export:
- Keep the existing Admin PDF Version two-page spread review and all page-level
  approve/replace/rerun behavior unchanged.
- Add export of the current approved/replaced original-quality source: active
  single page, explicit multi-selection, and Select All as one ZIP rather than 32
  browser downloads.
- Order and archive entry names derive from output_order/role/side/page_number,
  never filenames. The ZIP uses the sanitized personalized book title and may
  include a small metadata manifest for auditability.

S3 - Manual print PDF handoff:
- Replace per-page automatic print-package assumptions with one private complete
  PDF upload boundary. Upload uses a signed direct-to-Storage flow, validates PDF
  type/signature and an explicit infrastructure size limit, and records uploader,
  revision path, and timestamp.
- Print Release requires an uploaded manual PDF, locks that revision, and updates
  only internal print release/audit state. Customer order status remains
  `Printing` until the existing logistics action changes it to `Shipped`.
- No Worker call, customer email, customer-PDF replacement, printer automation,
  or inferred DPI/bleed/CMYK rule belongs in this interim flow.
- Preserve a clean future adapter boundary so a vendor-specific print generator
  can later produce the same uploaded-artifact contract.

Reader invariant:
- My Books never parses either PDF. It signs the released approved image paths,
  uses `final_front_cover` for the closed cover, and renders the 30 interiors as
  15 metadata-defined spreads. The back cover remains a distinct approved asset.

Exit gate:
- A 32-source Birthdaygirl fixture produces 16 customer spreads with correct
  gutter rules and personalized filename; approved originals export correctly;
  one manual print PDF can be uploaded and released without changing the order
  beyond `Printing`; V1 remains compatible.

### T3-018 - V2 Release Downstream Reconciliation

Status: Reviewed - approved

Goal:
- Regress the real post-release customer chain.

Scope:
- Contract-test delivery email and personalized signed PDF download; paid ->
  production (`Printing`) transition; manual Print Release remaining `Printing`;
  Orders list/detail; My Books purchased shelf; released Reader front cover and
  15 structured spreads; Buy Again asset reuse.
- Prepare the exact evidence checklist for T3-020. Do not manufacture production
  facts or make cleanup a prerequisite in this issue.

Exit gate:
- Code/contracts prove one V2 release fact has one reconciliation outcome and all
  customer surfaces consume the same release facts without exposing private paths
  or regressing V1. Real evidence is captured once in T3-020.

### T3-019 - Worker 32-Page Operational Hardening

Status: Paused by owner; required before Provider E2E, not Mock E2E

Goal:
- Ensure a real 32-page Final job is observable and healthy for its expected
  runtime.

Scope:
- Dynamic progress, retry scope, cancellation, page-level timing, job runtime,
  Healthchecks timeout, provider-run accounting, input/output byte limits, and
  restart/recovery behavior.

Exit gate:
- Mock 32-page timing is recorded; a modeled/targeted Provider run cannot be
  falsely declared stuck; no timeout increase hides a genuinely stalled page.

### T3-020 - Birthdaygirl Non-Destructive Mock E2E And Optional Cleanup

Status: Mock E2E and T3-020-F3 Reviewed - approved; optional cleanup not authorized

Goal:
- Prove the complete Birthdaygirl Mock customer/admin chain on a fresh isolated
  creation without requiring deletion of historical data.

Scope:
- Use a new creation/order and clearly identified test identity. Run Customize ->
  Mock Preview -> Cart -> Stripe test payment -> Mock Final 32 pages -> Admin
  review -> 16-spread customer PDF release -> email/order/Reader checks.
- Export approved sources, upload one manual test print PDF, Print Release it, and
  prove the order remains `Printing` until a separate logistics action.
- Capture IDs, counts, screenshots, logs, PDF page count/filename, email event,
  order state, Reader spreads, export ZIP, print artifact, and no fallback/provider
  call.
- Optional cleanup is a separate B step after evidence is secured: first export a
  non-PII deletion manifest, then wait for fresh explicit owner approval before
  deleting only named Birthdaygirl test facts/generated outputs. Preserve user
  assets and every other story.

Exit gate:
- One non-destructive evidence bundle passes. Cleanup is not required to pass and
  cannot run without explicit approval of the final manifest.

#### T3-020 Live Mock E2E Evidence - 2026-08-06

- Fresh creation `91b0628a-9482-47a5-b4df-221e62d20bf0`; Preview job
  `b611d341-36df-441e-9c24-a9190bce4d8a` completed in explicit Mock mode with
  schema 2, single-page layout, one cover plus one left/right Preview spread.
- Stripe test order `c71a0197-a339-4d44-b3a7-d9c641480faf` (`B84BD9B5`) paid
  successfully. Final Worker job `82de2012-169a-4f46-8c78-4325c3fd85d3` produced
  32 non-fallback pages: back/front covers plus 30 interiors with explicit role,
  side, spread, page number, and output order. Final review row
  `3c666f42-668b-4f72-bd1d-5bfe7a5c7128` reached 32/32 approved and released.
- The released customer PDF is 2,735,712 bytes and has 16 landscape pages: one
  no-gutter cover spread (`1800x918`) and 15 fixed-gutter interior spreads
  (`1800x888`). Rendered pages 1, 2, and 16 were visually inspected. The email
  download returned the same SHA-256 content and a personalized `E2E Nova` PDF
  filename; `final_delivery` is recorded sent.
- Reader returned schema 2 / single-page, 32 signed pages, 1 back cover, 1 front
  cover, 30 interiors, 16 left and 16 right placements, and page numbers 1-30.
  The purchased-book cover loaded in the browser and the customer title remained
  personalized.
- Approved-source export produced a 158,972,855-byte ZIP with 32 canonical PNG
  entries plus `manifest.json`; first/last entries were `01_cover_back.png` and
  `32_spread_15_right_page_30.png`.
- Buy Again created cart item `4609a777-bd40-4bd5-9871-11c85e1cb2d9` and paid
  order `26193fae-d8b8-480b-8225-ce1ff36230ef` (`3B1364FC`). It linked to the
  existing Final Worker job; the creation still has exactly one Preview and one
  Final job and one Final review row. No second 32-page render was queued.
- Manual print artifact `a48a2e88-12ff-4b11-96f3-421cc91a3f45` was verified and
  released at its immutable Storage path. Print Release left both orders at
  `production`/`Printing` and emitted no extra customer email or logistics fact.
- An earlier run made by a Worker process started before the V2 code was retained
  as failed runtime-version-drift evidence and was not rewritten into passing
  evidence. No cleanup was performed.

#### T3-020-F3 - Manual Print Confirmation Stabilization

Status: Reviewed - approved

Live findings and fix:
- Direct-to-Storage upload completed, but server-side PDF header confirmation had
  no time bound and two requests remained pending after approximately 47 seconds
  and 6.3 minutes. Remote header inspection now obtains a fresh signed URL per
  attempt, uses a 12-second abort boundary, retries once, and still requires exact
  size, `application/pdf`, and `%PDF-` proof. Admin displays a distinct
  `Upload complete. Verifying...` state.
- The first successful real confirmation exposed an existing PL/pgSQL ambiguity:
  `RETURNS TABLE (artifact_id ...)` collided with unqualified `artifact_id`
  references inside commit/release functions. The canonical idempotent SQL now
  qualifies artifact table columns in reject, commit, and release. The migration
  was reapplied in Supabase and the already-uploaded pending revision was safely
  verified without another upload.

Verification:
- Manual Print/Admin Final suite: 38/38; TypeScript and targeted ESLint pass.
- Live Storage metadata and a `206 bytes 0-4` response proved the recovered object
  before commit. The corrected RPC returned `verified`; the real Admin Print
  Release then returned `released` and the database facts matched the UI.

Claude review direction:
- Confirm timeout/retry cannot weaken PDF metadata/header validation and obtains a
  new short-lived signed URL for each attempt.
- Confirm SQL aliases remove output-column ambiguity in both commit and release
  while preserving row locks, immutable revisions, one-verified/one-released
  constraints, admin actor checks, and expected-artifact CAS.
- Confirm Print Release remains isolated from order status, logistics, Worker,
  customer PDF, and customer email behavior.

#### T3-020-F1 - Preview And PDF Review Stabilization

Status: Ready for Claude Review

E2E feedback:
- V2 Preview stopped after the generated cover/interior sample instead of allowing
  the customer to flip through the remaining original pages under the locked blur.
- Approve All kept all 32 pages in a saving state for too long before PDF Release
  became available.
- The first PDF Release attempt reported `Final cover-half geometry mismatch`.

Root causes and fix:
- The template-detail endpoint still discovered only legacy `page_01.png` Final
  previews, while structured Preview used only generated presentation metadata to
  calculate its maximum spread. The endpoint now reads the active V2 `config.json`
  and derives public locked-page URLs from explicit role/spread/side metadata. The
  Preview book overlays generated leaves on that metadata-defined template book,
  restores all 15 spreads, and keeps every non-generated leaf blurred and locked.
  Runtime placement never parses `_L/_R` filenames.
- Both bulk-approval routes duplicated 32 sequential intent, Storage-copy, and row
  update cycles. They now share one bounded-concurrency executor (8 intent writes,
  6 copy/commit workers) while retaining per-page review-intent CAS, status guards,
  deterministic results, and fail-visible partial errors.
- Exact cover pixel equality was stricter than the customer-PDF contract and could
  reject a Provider-modified A half that differs by a few pixels from the untouched
  B half. Each half must still be readable, at least 512 px, and approximately
  square; accepted halves are now fitted without crop or distortion onto the
  largest common no-upscale canvas before back-left/front-right composition. Gross
  aspect mismatch and placeholder inputs still fail visibly.

Verification:
- Birthdaygirl live template detail: 32 metadata-derived Final preview pages, made
  of 2 covers + 30 interiors across 15 complete spreads.
- Browser UAT automation reached `page15_L_A.png` + `page15_R_B.png`; both leaves
  retained blur/lock treatment.
- The real E2E approved cover pair (`1000x1020` each) recomposed to a valid
  `1800x918` customer JPEG without mutating release facts.
- `book-leaves:tests` 14/14, `final-release:tests` 20/20,
  `admin-final-pages:tests` 36/36, and full app contracts 78/78 passed.
- TypeScript and production build passed. Targeted lint has zero errors; its two
  warnings are the pre-existing template helper unused guard and the intentionally
  accepted raw Preview `<img>` warning.

Claude review direction:
- Confirm V2 locked pages come only from config presentation metadata and the
  public template source; no generated/private path, filename-side inference, or
  V1 behavior is mixed into this adapter.
- Confirm generated Preview leaves win over locked template leaves at the same
  display spread, later spreads remain blurred, and the full 15-spread navigation
  is restored without changing variant/cart/share/Reader contracts.
- Confirm bounded bulk approval preserves per-page intent acquisition and final
  intent-ID CAS, and both Approve All and Approve-all-and-release use the same
  executor without allowing release before copies commit.
- Confirm cover normalization never crops, never enlarges above the common source
  canvas, preserves back-left/front-right with no gutter, and keeps low-resolution,
  unreadable, non-square, fallback, and output-size guards intact.

#### Required evidence bundle

Preflight:
- Record the deployed app commit, applied V2/print-artifact migrations, Worker
  commit, and `WORKER_EXECUTION_MODE=mock` health response. Do not include secrets.
- Confirm the active Birthdaygirl `config.json`, subtitle contract, Preview assets,
  and 32 Final source assets. Record config hash/last-modified values.
- Use a fresh test identity, creation, cart item, Stripe test payment, and order.
  Record their IDs before any Admin action; do not reuse historical facts.

Generation and payment:
- Capture Preview job output proving the structured cover plus left/right Preview
  spread loads, the B page bypasses face swap, and no provider request occurs.
- Capture Stripe test payment success, the paid order, its ordered cart item, and
  exactly one linked Final job for the creation.
- Capture Worker completion with 32 non-fallback outputs, 32 page metadata records,
  and 32 `final_job_pages` rows. Record output byte sizes and the absence of
  provider/fallback markers.

Review and customer PDF release:
- Capture Admin Queue/detail showing all 32 pages with their explicit role, side,
  spread, and output order; approve or replace every page through the real UI.
- Export the approved-source ZIP and verify it contains the expected 32 assets in
  canonical output order.
- Release the customer PDF and record the Final job release timestamp, structured
  release proof, Storage object, and email event. Download the signed attachment
  from the delivered email and verify: personalized filename, 16 landscape PDF
  pages, cover pair without an inserted gutter, 15 ordered interior spreads, and
  no fallback page.
- Capture the single `paid -> production` status event and prove Orders list/detail
  show `Printing` plus a working signed customer PDF link.

Purchased surfaces and reuse:
- Capture My Books showing the fresh creation on Purchased Books, then open it and
  verify the released front cover plus all 15 left/right Reader spreads. Inspect the
  Reader response to confirm signed URLs only and no private Storage paths.
- Exercise Buy Again for the same creation. Record the second cart item/order and
  prove it links to the existing Final `job_id`; no second Worker job, Final review
  row, or 32-page render may be created.

Manual print handoff:
- Upload one staff-prepared test print PDF through the signed manual-artifact flow;
  record artifact ID, immutable Storage path, verified size/MIME, and uploader.
- Print Release that exact artifact and capture its release timestamp. Prove the
  order remains `production`/`Printing`, no logistics event is synthesized, and no
  customer email is sent by Print Release.

Bundle and cleanup boundary:
- Store screenshots, downloaded artifacts, relevant redacted DB rows, email event,
  Worker logs, and network evidence under one test-run identifier.
- Do not delete anything during the passing run. Optional cleanup starts only after
  exporting a non-PII manifest of exact rows/objects and receiving fresh owner
  approval for that manifest.

### T3-021 - Birthdaygirl Targeted Provider E2E

Status: Pending T3-019 and T3-020

Goal:
- Verify real provider boundaries without paying for an unnecessary full 16-call
  Final run before visual quality is ready.

Scope:
- Full V2 Preview: two A pages call Provider and one B page bypasses it.
- On the reviewed pilot Final, rerun one A page and one B page; verify provider
  accounting, subtitles, output persistence, review reconciliation, and no Mock
  fallback.

Exit gate:
- Database/provider evidence proves A invokes Provider, B does not, and both
  return valid downstream output. Full Provider Final quality testing remains an
  explicit owner cost/quality decision.

### T3-022 - Remaining-Story V2 Authoring Tooling

Status: S1+S2 Reviewed - approved; proceed to T3-023 controlled Forest rollout

Goal:
- Turn the Birthdaygirl manual conversion into a repeatable, validated authoring
  workflow for the other 14 stories.

Scope:
- Config/subtitle conversion assistance, exact Storage inventory, A/B authoring
  checks, cover records, empty subtitle pages, per-story prompts, age/language
  subtitle variants, image dimensions/formats, and pre-upload validation.
- Coordinate JSON Creator changes with Claude Code; do not silently change its
  export contract from this repository.

Exit gate:
- A dry run on a second story produces reviewable canonical files without manual
  index arithmetic or runtime filename dependence.

S1 implementation:
- Added a local, default-dry-run authoring CLI that scans a dedicated V2 staging
  directory or an exported inventory. Only this authoring boundary parses the
  `_L/_R/_A/_B` convention; generated runtime config contains explicit role,
  spread, side, physical page number, output selection, and face-swap facts.
- Local-byte mode checks actual WebP/PNG format, dimensions, minimum edge,
  near-square geometry, byte size, and SHA-256. It rejects missing/non-contiguous
  pairs and the wrong cover identities without generating a package.
- The source config's provider/workflow/subtitle setup and relevant Preview
  prompt overrides are preserved. Every fallback/age subtitle path must exactly
  cover the generated pages, including explicit empty `texts`, matching source
  dimensions, declared placeholders, and a usable font directory.
- Every subtitle variant is then validated by the Active Worker's real
  `validateSinglePageTemplateContract`; the review report records those counts.
- Writing requires explicit `--write --out`, is restricted outside the source
  story folder, and produces only a review package. It never edits live story
  files or uploads/activates Storage content.

S1 evidence:
- Synthetic Adventure_story staging dry run produced a reviewable dynamic
  3-Preview/6-Final fixture without manual index arithmetic and left its source
  config byte-for-byte unchanged.
- Current Birthdaygirl's real 35-page config/subtitle package passed the new
  authoring checks and the Active Worker contract as 3 Preview + 32 Final pages.
- This proves the tool and pilot baseline, not a real Adventure_story migration.
  S2 remains the first owner-data dry run once that story's V2 images and JSON
  Creator output exist.

### T3-023 - All-Story Controlled Rollout

Status: Forest_story rollout Reviewed - approved; remaining stories continue as
an independent owner-supplied migration lane and do not block UAT3 mainline work

Goal:
- Migrate the remaining stories one at a time without mixed-config races.

Scope:
- Per-story asset/config approval, Worker drain/restart, public config hash check,
  incompatible test-data policy, Mock smoke, rollback record, and rollout ledger.

Exit gate:
- Every active story has one validated V2 config/subtitle package and a passing
  Mock smoke; no V1 active config or orphaned mixed-version job remains.

## V2 Framework Milestone - 2026-08-07

The framework-level V2 refactor is complete and independently proven by the
Birthdaygirl and Forest Mock E2E chains. The V2 branch now changes from a core
engineering workstream into a repeatable story-migration lane.

Open V2 work is deliberately separated into three non-blocking lanes:
- owner/content migration for the remaining stories through T3-022/T3-023;
- deferred RunPod Provider hardening and targeted E2E through T3-019/T3-021;
- content-level image, subtitle, font, and prompt convergence owned with the
  story-production team.

These lanes remain recorded and can be resumed independently. They do not block
returning primary engineering attention to the third-round internal-test mainline.

## Dependency Order

Remaining digital/Mock path:

`T3-017 S1 -> T3-017 S2 -> T3-017 S3 -> T3-018 -> T3-020 non-destructive E2E -> T3-022 -> T3-023`

Provider branch:

`T3-019 operational hardening -> T3-021 targeted Provider E2E`

T3-021 also requires the T3-020 Mock evidence. T3-019 is deliberately paused and
does not block T3-017, T3-018, or the non-destructive T3-020 Mock E2E. Optional
T3-020 cleanup is outside the execution chain and requires a fresh, manifest-level
owner authorization. Printer-specific automation remains a future issue after a
vendor supplies trim, bleed, color, DPI, package, and naming requirements.

## Program Completion Definition

The V2 program is complete only when:

- All required code issues above are independently reviewed and approved.
- Birthdaygirl passes full Mock E2E and targeted Provider E2E.
- The 16-spread customer PDF matches the owner-approved digital layout, and the
  manual print handoff safely stores/releases the staff-supplied printer PDF.
- Vendor-specific print automation remains deferred until printer requirements
  exist and is not required to close the current V2 digital/Mock pilot.
- Customer email, order status, My Books Reader, and Buy Again agree with release
  facts.
- Remaining active stories have validated V2 packages and controlled cutovers.
- T3-010 S8 is recorded complete, then the parent V2 issue can close.
