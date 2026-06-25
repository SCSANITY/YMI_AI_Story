# YMI Story Production Flow

Last updated: 2026-06-25

This document describes the canonical production path from customer upload to final PDF delivery.

## 1. Catalog And Template Selection

- Browser loads active templates through `/api/templates`.
- Next API reads Supabase `templates`.
- Template cover/detail assets are served from the public Supabase Storage bucket `app-templates`.
- User opens `/personalize/[bookID]`.
- Detailed template data is loaded through `/api/templates/[templateId]`.

## 2. User Personalization And Face Upload

- `PersonalizePage` validates the photo client-side with Mediapipe assets under `public/mediapipe`.
- Browser requests a signed upload URL from `/api/upload-url`.
- Browser uploads the prepared face image directly to Supabase Storage under `raw-private/user-assets/...`.
- Preview generation records the face asset through `/api/jobs`.
- Text profile data can be stored in `user_assets` as `text_profile`.

## 3. Preview Job Creation

- Browser calls `createPreviewJob()`, which posts to `/api/jobs`.
- `templates.default_config_path` must be the relative storage path `{template_id}/config.json`.
- `/api/jobs` creates a public config URL from that storage path and calls `create_preview_job()`.
- `create_preview_job()` writes the `creations` row, matching `jobs` row, and `creations.preview_job_id` in one transaction.
- Browser polls `/api/jobs/[jobId]`; the route is owner-scoped by logged-in `customerId` or anonymous `ymi_anon_session`.
- Browser fetches signed preview image URLs from `/api/jobs/[jobId]/preview-url`; this route is also owner-scoped.

## 4. Worker Preview Processing

- Active Worker code lives in root `worker/`.
- Render Worker cutover is deferred; the previous duplicate `ymi-books-web-1.0/worker` copy was removed.
- Worker loops on `supabase.rpc('claim_next_job')`.
- Queue lease/identity hardening is tracked in `Template_folder/sql_worker_claim_lease.sql` for the future Render cutover.
- Worker downloads/fetches template config, resolves provider and preview page indices.
- Current production configs use RunPod.
- Worker signs the face image from `raw-private`.
- Worker prepares template/subtitle runtime images when required.
- Worker builds a RunPod payload from template workflow JSON.
- Worker submits to RunPod, polls until complete, normalizes the result, uploads output pages, and updates DB state.
- Preview output is stored under:
  - `raw-private/jobs/{yyyy}/{mm}/{dd}/{job_id}/output/page_XX.{ext}`
  - `raw-private/jobs/{yyyy}/{mm}/{dd}/{job_id}/output/page_XX_full.{ext}`
- Worker updates `jobs.output_assets`, `provider_runs`, `render_runs`, `progress`, and finally `status='done'`.
- If user cancels preview, frontend calls `DELETE /api/jobs/[jobId]`; worker checks status and can cancel the RunPod job if possible.

## 5. Cart And Checkout Start

- User adds preview to cart through `/api/cart`.
- `cart_items` stores `creation_id`, product type, quantity, price, owner, and later links preview/final job IDs.
- Direct checkout from preview calls `/api/orders/start`.
- `/api/orders/start` creates or reuses an unpaid `orders` row.
- Selected cart items move to `status='ordered'` and receive `order_id`.
- Checkout page supports authenticated and guest checkout.
- Guest checkout OTP uses:
  - `/api/guest/request-otp`
  - `/api/guest/verify-otp`
- Guest OTP email is sent by Resend.

## 6. Payment

- Production payment path is Stripe Checkout.
- Browser posts to `/api/checkout/session`.
- Next API updates order profile/shipping/currency and creates a Stripe Checkout Session.
- Stripe redirects to `/checkout/success?orderId=...&session_id=...`.
- Stripe webhook `/api/webhooks/stripe` is the primary payment-finalization path.
- Success page fallback calls `/api/orders/stripe-confirm` if webhook is delayed.
- Both paths call `finalizeOrderPayment()`.
- `/api/orders` demo finalize path exists for non-Stripe/demo use, but is not the intended production collection path.

## 7. Final Job Creation After Payment

`finalizeOrderPayment()`:
- Moves the unpaid order toward paid/production state.
- Creates or links a `payments` row.
- Updates `orders` to `paid`.
- Sends order confirmation email through Resend.
- Loads ordered cart items.
- Creates one `jobs` row per item with:
  - `job_type='final'`
  - `status='queued'`
  - final `input_snapshot`
- Creates or updates `final_jobs`.
- Creates or updates `final_job_pages`.
- Uses template config `final.page_indices` for final page list.

## 8. Worker Final Processing

- Worker claims final jobs through the same `claim_next_job` loop.
- Current production final jobs are admin-review jobs. A linked `final_jobs` row is expected for every `jobs.job_type='final'` job.
- Worker sets linked `final_jobs.status='processing'`.
- During long final jobs, Worker renews `jobs.lease_expires_at` through `renew_job_lease` so another worker does not reclaim an actively running job.
- If a stale final job is reclaimed, Worker uses `final_job_pages.ai_output_path` as the resume anchor and skips pages already in `pending_review` or `approved`.
- For each final page, worker sets `final_job_pages.status='processing'`.
- Worker runs RunPod per page.
- Worker uploads AI output to:
  - `raw-private/orders/{orderId}/final/pages/ai/page_XX.{ext}`
- Each completed page becomes:
  - `final_job_pages.status='pending_review'`
  - `final_job_pages.ai_output_path={uploaded path}`
- After all pages finish, worker updates:
  - `final_jobs.status='review_pending'`
  - `final_jobs.review_status='pending'` or `in_review`
  - parent `jobs.output_assets`
- In the current admin-review flow, worker does not send the customer PDF automatically.
- The older non-review worker path, where the worker builds `final_book.pdf` and calls `/api/internal/worker-callback`, is legacy fallback code and is not the current production entry point.

## 9. Admin Review And Release

- Admin dashboard loads jobs through `/api/admin/final-jobs`.
- Admin detail page loads through `/api/admin/final-jobs/[finalJobId]`.
- Page image URLs are signed from `raw-private`.
- Review action race protection is stored on `final_job_pages` through `review_intent_id`, `review_intent_type`, and `review_intent_at`.
- `final_job_review_intents` is not a separate active table in the current app; the SQL file with that name adds review intent columns to `final_job_pages`.
- Admin thumbnail caching uses browser IndexedDB database `ymi-admin-final-thumbs`; it is client-side cache only and unrelated to database review intent state.
- Admin can:
  - Approve a page.
  - Approve all pages.
  - Mark a page as needs fix.
  - Upload a manual replacement.
  - Release final PDF.
- Approval copies selected AI/manual images to:
  - `raw-private/orders/{orderId}/final/pages/approved/page_XX.png`
- `releaseFinalJob()`:
  - Builds a customer PDF from approved pages.
  - Uploads it to `raw-private/orders/{orderId}/final/pdf/final.pdf`.
  - Updates `final_jobs` and `jobs`.
  - Signs the PDF URL.
  - Sends final delivery email through Resend.
- `approve-all-release` is a combined approve-ready-pages and release path.

## 10. Customer Delivery And Library

- Delivery email contains a signed PDF download link.
- Order pages and my-books routes load paid/production order data from Supabase.
- Preview and final assets are exposed only through short-lived signed URLs where required.

## Primary State Transitions

- Preview job: `queued -> running -> done|failed|cancel_requested|cancelled`
- Creation: created atomically with its preview job through `create_preview_job()`.
- Cart item: `cart -> ordered`, then linked to order/payment/final job.
- Order: `unpaid -> paid` after payment finalization.
- Final job: `queued -> processing -> review_pending -> completed/released|failed`
- Final page: `queued -> processing -> pending_review -> approved|needs_fix|rerunning|failed`

## Worker Per-Image Flow

### Shared Page Preparation

- Worker resolves page indices:
  - Preview uses `config.preview.page_indices`.
  - Final uses `config.final.page_indices`.
  - Final rerun can use `input_snapshot.final_page_indices`.
- `preparePageInputs()` validates template files and creates page-level input metadata.
- Stage is selected by job type:
  - Preview: `preview_face`
  - Final: `final_face`
- For RunPod, worker downloads/caches workflow JSON from:
  - `app-templates/{basePath}/{workflow_json_path}`
- If a static template/intermediate image is too large or needs normalization, worker uploads an optimized runtime copy under:
  - `raw-private/jobs/{date}/{jobId}/runtime/...`

### Optional Subtitle Runtime Render

- If `subtitle_render.enabled=true`, worker starts from the base template image in `app-templates`.
- Worker renders child-name text overlays locally with `@napi-rs/canvas`.
- Worker uses the subtitle JSON page `width` / `height` as the render coordinate system, so editor-exported positions and sizes are preserved even when the base image dimensions differ.
- Subtitle rendering follows `subtitle-template-editor-app/WORKER_SUBTITLE_RENDER_SPEC.md`; current supported runtime effects include:
  - solid, gradient, and texture fill descriptors,
  - mixed `{name}` styling through `nameStyle`,
  - per-character / range style runs through `spans`,
  - numeric `fontWeight` for variable-font exports,
  - per-side padding, vertical alignment, text wrapping, and text transform,
  - stroke, shadow, glow, bevel, underline,
  - cloud/fade box styling and box borders,
  - mixed-run center/right alignment that ignores leading/trailing space width for alignment calculations.
- Runtime fonts are loaded from the configured `fonts_path`; supported file extensions are `.ttf`, `.otf`, `.woff`, and `.woff2`.
- Rendered subtitle page is uploaded to:
  - `raw-private/jobs/{date}/{jobId}/runtime/subtitles/page_XX.png`
- In real provider mode, this rendered page is signed and optionally optimized again before RunPod.
- Render state and timings are persisted in `jobs.render_runs`.
- 2026-06-10 worker sync: local `worker/subtitleRenderer.ts` has been upgraded to the latest JSON Creator spec and validated with TypeScript plus a local smoke render. This is a worker-runtime update; Vercel deployment alone does not change the worker renderer running on the local/online worker host.
- If a story package uses a new subtitle editor effect that the worker does not support yet, the worker renderer has to be updated before that package is considered production-ready.

### RunPod Per-Page Call

- Worker builds a RunPod payload from ComfyUI workflow JSON.
- `runpodAdapter` removes ignored output nodes, applies static/page overrides, sets template and face image inputs, sets seed, and optionally sets filename prefix.
- In real mode, adapter downloads signed template and face images.
- Adapter compresses each input under configured limits and converts them to data URIs.
- Adapter submits:
  - `POST {RUNPOD_API_BASE_URL}/{endpointId}/run`
- Payload body contains:
  - `input.workflow`
  - `input.images[]`
- Worker records submitted/polling/completed/failed provider states into `jobs.provider_runs`.
- Adapter polls:
  - `GET .../status/{runId}`
- Expected output is a base64 image in one of the shapes parsed by `runpodAdapter`.

### Preview Output

- Current RunPod preview pages run serially.
- Output is normalized to PNG/JPEG.
- Worker writes:
  - Display-sized preview image.
  - Full output copy with `_full`.
- Worker persists partial output after every page so the frontend can see completed pages before the full preview job completes.

### Final Output

- Final pages use the same RunPod execution path.
- Output is uploaded once to order final AI pages.
- Matching `final_job_pages` row becomes `pending_review`.
- Admin release later packages approved pages into PDF and emails the customer.

### Retry And Failure Behavior

- Page retry counts differ between preview and final.
- Retriable failures include RunPod errors, timeouts, missing output, and temporary availability failures.
- On final page failure, `final_job_pages.status='failed'` and `error_message` are updated.
- Job-level failure is handled by the outer worker processor and reflected on the parent `jobs` row.
