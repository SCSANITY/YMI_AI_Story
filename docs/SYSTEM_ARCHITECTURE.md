# YMI Story System Architecture

Last updated: 2026-06-10

## Product Scope

YMI Story is a personalized children's storybook product.

Current production goal:
- User uploads a child photo.
- AI face swap places the child into a preset illustrated story.
- User previews a low-resolution cover/Page 1 result.
- User pays through Stripe.
- The system generates all final story pages.
- Admin reviews every page.
- Approved pages are packaged into a PDF and delivered by email.

Later product direction:
- Physical book fulfillment.
- Customer-recorded voice and generated audiobook delivery.

## Repository Layout

Root workspace:
- `ymi-books-web-1.0/`
  - Next.js web app, customer site, admin dashboard, API routes, email rendering, checkout, account/library pages.
- `worker/`
  - Node.js TypeScript worker run with `ts-node`.
  - Polls Supabase jobs, prepares page inputs, calls RunPod, uploads outputs, and updates review records.
- `Template_folder/`
  - Local story-package backup and SQL/reference material.
  - Story config/source files here are not the runtime source of truth once synced to Supabase.
- `subtitle-template-editor-app/`
  - Local helper app for editing subtitle/template overlays.
- `subtitle-json-combiner-app/`
  - Local helper app for story/subtitle JSON preparation.
- `docs/`
  - Current maintainable engineering documentation.

## Runtime Architecture

Main layers:

1. Frontend and API layer
- Next.js App Router.
- Hosted on Vercel.
- Customer pages, personalization upload flow, cart, checkout, account/library pages.
- Admin dashboard: multi-route layout under `/admin/*` (finals, announcements, service, and placeholder routes for analytics/banner/catalog).
- API routes handle job creation, checkout, webhooks, signed URLs, admin review, email flows, and internal callbacks.

2. Database, auth, and storage layer
- Supabase cloud project `pgpaawqgtewowjratddm`.
- PostgreSQL stores templates, users, orders, jobs, final review state, cart data, shipping configuration, OTP codes, and related business records.
- Supabase Auth is used for account login/signup.
- Supabase Storage stores templates, user uploads, generated pages, final PDFs, and runtime worker artifacts.

3. Worker/orchestration layer
- Canonical Worker code now lives in `ymi-books-web-1.0/worker` for Git/Render deployment.
- The older sibling folder `Web/worker` is a migration-era local copy and should not remain the long-term production source.
- Runs locally through `npm run dev` / `ts-node` and in production as a Render Background Worker through Docker.
- Uses Supabase service role credentials.
- Claims queued jobs through `supabase.rpc('claim_next_job')` with worker identity, job type filters, and lease tracking after the cloud-worker SQL is applied.
- Supports mock mode for UI testing and real RunPod mode for production generation.
- `WORKER_POLL_ENABLED=false` is the local safety default; only environments that should process jobs set it to `true`.

4. AI execution layer
- Current real provider path is RunPod Serverless running Dockerized ComfyUI workflows.
- Workflows originated in RunComfy/ComfyUI and are packaged for RunPod.
- Worker submits workflow JSON plus template/face images to RunPod and polls until image output is ready.

5. Payment and delivery layer
- Stripe Checkout handles payment.
- Stripe webhook is the primary finalization path.
- Checkout success fallback exists to handle delayed webhook delivery.
- Resend sends guest OTP, order confirmation, final delivery, and reminder emails.

## Key Frontend/API Modules

Important customer flows:
- `app/personalize/[bookID]/page.tsx`
- `components/PersonalizePage.tsx`
- `app/cart/page.tsx`
- `app/checkout/page.tsx`
- `app/checkout/success/page.tsx`
- `app/my-books/page.tsx`
- `app/orders/[orderID]/page.tsx`

SEO and indexability:
- Root App Router metadata lives in `app/layout.tsx`.
- Shared SEO constants/helpers live in `src/lib/seo.ts`; canonical production host is `https://www.ymistory.com`.
- Public marketing/catalog routes have unique metadata and canonical URLs.
- Product metadata for `/personalize/[bookID]` is generated from Supabase `templates` so title, description, price, and cover image follow the live catalog.
- `app/sitemap.ts` emits public static routes plus active, non-coming-soon template pages.
- `app/robots.ts` allows public crawling, references the sitemap, and disallows admin/API/account/order-library/private areas to avoid crawl-budget waste.
- API route security does not depend on `robots.txt`; robots rules are a crawler hint only. Sensitive API routes must enforce their own auth, service-role, admin, webhook signature, or internal-secret checks.
- Anonymous pages that should not be indexed, such as cart/checkout/success/maintenance/impact-placeholder/share-preview/support-order, stay crawlable and use meta noindex so crawlers can read the directive.
- A default 1200x630 brand OG image lives at `public/og/ymi-story-og.png`.
- Deployment/Search Console status as of 2026-05-28: SEO code is deployed on `https://www.ymistory.com`; live homepage has the expected title, canonical, and default OG image; live `sitemap.xml` exposes 19 URLs; live `robots.txt` references the sitemap. Search Console domain property is DNS-verified, sitemap submitted, and homepage plus `/books` have been manually requested for reindexing. Google may still show older crawl diagnostics until recrawl completes.

Important API routes:
- `app/api/templates/route.ts`
- `app/api/templates/[templateId]/route.ts`
- `app/api/upload-url/route.ts`
- `app/api/jobs/route.ts`
- `app/api/jobs/[jobId]/route.ts`
- `app/api/jobs/[jobId]/preview-url/route.ts`
- `app/api/cart/route.ts`
- `app/api/orders/start/route.ts`
- `app/api/checkout/session/route.ts`
- `app/api/checkout/apply-promo-code/route.ts`
- `app/api/checkout/apply-voucher/route.ts`
- `app/api/checkout/remove-discount/route.ts`
- `app/api/admin/discounts/route.ts`
- `app/api/webhooks/stripe/route.ts`
- `app/api/orders/stripe-confirm/route.ts`
- `app/api/admin/final-jobs/**`

Important shared libraries:
- `src/lib/orderFulfillment.ts`
- `src/lib/finalReview.ts`
- `src/lib/email.tsx`
- `src/lib/adminAuth.ts`
- `src/services/assets.ts`
- `types/schema.ts`

## Key Worker Modules

- `ymi-books-web-1.0/worker/index.ts`
  - Main loop, job claim, config loading, page preparation, subtitle rendering handoff, provider execution, output upload, and DB updates.
- `ymi-books-web-1.0/worker/providers/runpodAdapter.ts`
  - RunPod payload construction, image encoding, `/run` submission, status polling, cancellation, and output parsing.
- `ymi-books-web-1.0/worker/providers/runcomfyAdapter.ts`
  - Legacy/fallback provider adapter. Currently not the active production path.
- `ymi-books-web-1.0/worker/subtitleRenderer.ts`
  - Local image/text rendering for dynamic child-name overlays.
  - The renderer is synchronized with `subtitle-template-editor-app/WORKER_SUBTITLE_RENDER_SPEC.md`; the editor remains the visual authoring source of truth, while the worker is responsible for reproducing the exported JSON at runtime before RunPod receives the template image.
- `ymi-books-web-1.0/worker/processor.ts`
  - Template/config typing and related shared structures.
- `ymi-books-web-1.0/worker/Dockerfile`
  - Render Background Worker container build.
- `ymi-books-web-1.0/worker/ecosystem.config.js`
  - PM2 process configuration.
- `ymi-books-web-1.0/worker/scripts/use-env-localhost.ps1`
- `ymi-books-web-1.0/worker/scripts/use-env-online.ps1`
  - Environment profile switchers.

### Worker Subtitle Rendering Contract

- Subtitle authoring happens in `subtitle-template-editor-app/`.
- The worker render contract is documented in `subtitle-template-editor-app/WORKER_SUBTITLE_RENDER_SPEC.md`.
- Runtime subtitle JSON is stored in Supabase Storage under `app-templates` with each story package.
- When `subtitle_render.enabled=true` in a story config, the worker:
  - downloads the subtitle JSON and configured font assets,
  - renders the overlay with `@napi-rs/canvas`,
  - uploads the rendered runtime template to `raw-private/jobs/{date}/{jobId}/runtime/subtitles/page_XX.png`,
  - sends that rendered image into the provider workflow instead of the original static template page.
- The current worker renderer supports the newer editor effects used by the story packages:
  - solid and linear-gradient fills,
  - texture fills where supported by the referenced image path,
  - `{name}` mixed styling through `nameStyle`,
  - per-character / range styling through `spans`,
  - numeric `fontWeight` values for variable-font exports,
  - stroke, shadow, glow, bevel, underline,
  - per-side padding, vertical alignment, text transform, wrapping, and cloud/fade box styling,
  - mixed-run center/right alignment that excludes leading/trailing space width so wrapped lines remain visually centered.
- Font assets can be `.ttf`, `.otf`, `.woff`, or `.woff2`. The worker attempts to register downloaded font buffers and falls back to system/default font behavior if a font cannot be registered by the canvas runtime.
- 2026-06-10 sync note: `ymi-books-web-1.0/worker/subtitleRenderer.ts` was upgraded against the latest JSON Creator spec to handle `fontWeight`, `spans`, and the generalized mixed-run renderer. Verification was done locally with `npx tsc --noEmit` and an in-memory subtitle smoke render. The canonical worker folder is now inside the Git-managed Next.js repo, but it deploys separately from Vercel as a Render Background Worker.
- Any future subtitle editor feature has to be added to both:
  - the editor/export side,
  - `worker/subtitleRenderer.ts`,
  before story JSON that uses the feature is synced to Supabase for production jobs.

## Supabase Model

Confirmed runtime buckets:
- `app-templates`
  - Public bucket.
  - Stores story config JSON, story images, workflow JSON, subtitle templates, fonts, and related story package assets.
- `raw-private`
  - Private bucket.
  - Stores user uploads, worker runtime images, generated preview/final pages, approved pages, PDFs, and temporary artifacts.

Core tables used by current flow:
- `templates`
- `creations`
- `jobs`
- `cart_items`
- `orders`
- `payments`
- `final_jobs`
- `final_job_pages`
- `user_assets`
- `verification_codes`
- `email_events`
- shipping-related tables used by checkout quote/destination APIs
- `order_status_events`
- `discount_offers`
- `discount_instruments`
- `discount_redemptions`

Discount model:
- `discount_offers` stores reusable rules such as free shipping, fixed amount, or percentage effects.
- `discount_instruments` stores concrete promo codes or account vouchers, including ownership, public/private availability, active state, and usage limits.
- `discount_redemptions` stores per-order reservations and paid/released transitions.
- Checkout applies discounts through database RPCs so inventory limits and same-order idempotency are enforced in the database.
- Legacy `referral_codes`, `customer_coupon_codes`, `creator_promo_codes`, and related redemption tables have been replaced by the unified discount model. Phase 4 cleanup SQL is stored at `Template_folder/sql_unified_discount_phase4_cleanup.sql`.

Critical RPC:
- `claim_next_job`
  - Worker depends on this RPC to atomically claim queued jobs.
  - Uses `FOR UPDATE SKIP LOCKED` — concurrent workers never claim the same job.
  - Cloud-worker SQL is stored in `Template_folder/sql_worker_claim_lease.sql`.
  - The upgraded signature accepts `worker_id`, `job_types`, and lease seconds while preserving a no-argument wrapper for old local workers.
- `renew_job_lease`
  - Worker heartbeat RPC used by long-running final jobs to prevent premature stale reclaim.

Important enum/status note:
- Cloud `jobs.status` now accepts `cancel_requested` and `cancelled` after rerunning `Template_folder/sql_jobs_cancel_statuses.sql`.

## External Integrations

Supabase:
- Production project host: `pgpaawqgtewowjratddm.supabase.co`.
- Web env uses public anon key plus server service role key.
- Worker env uses service key.

RunPod:
- Real production AI provider path.
- Current cloud template configs point preview/final stages to endpoint `39ygcoofm4ye40`.
- Worker expects RunPod output as a base64 image in a shape accepted by `runpodAdapter`.

RunComfy:
- Still present in code as legacy/fallback adapter.
- Current worker env profiles have empty `RUNCOMFY_API_TOKEN`.

Stripe:
- Checkout Sessions are used for payment.
- Local/dev env should remain on test keys.
- Vercel production should switch to live keys after Stripe live review.

Resend and email notifications:
- Resend is the transactional email provider for YMI-managed emails.
- Production sending domain and `from` addresses are verified and have sent successfully.
- `email_events` is the operational log for YMI-managed `sent` / `failed` records and external `external_observed` markers.
- YMI-managed email types are:
  - guest checkout OTP
  - order confirmation after payment finalization
  - final PDF delivery after Admin release
  - order status update for Printing, Shipped, and Delivered
  - unpaid checkout reminder
- Order confirmation uses `order_confirmation:{order_id}` idempotency. Stripe webhook retries must not duplicate the customer email.
- Final PDF delivery email failure does not block PDF release. Failure is logged and `final_jobs.email_sent_at` remains null for follow-up.
- Guest checkout OTP is synchronous and user-facing; failed sends remove the verification code.
- Unpaid reminders write to `email_events`; legacy `order_reminder_logs` is not the active write path.
- Customer-facing order progress uses `orders.order_status` as the single source of truth: `paid` maps to Order Confirmed, `production` maps to Printing, `shipped` maps to Shipped, and `delivered` maps to Delivered.
- Admin status changes to `production`, `shipped`, or `delivered` send an email through `EMAIL_FROM_DELIVERY` and are recorded in `order_status_events`.
- Direct Supabase edits to `orders.order_status` sync to the UI after refresh but do not automatically send email.
- `/admin/orders` separates editable production-flow orders from read-only `unpaid`, `cancelled`, and `refunded` orders.
- `/admin/emails` is read-only and is used to inspect email status.
- YMI-managed email templates live in `components/emails/*`; subject/from/idempotency/trigger behavior lives in `src/lib/email.tsx`.
- Current app-owned templates are `OtpEmail`, `OrderReceiptEmail`, `DeliveryEmail`, `AbandonmentEmail`, `LogisticsUpdateEmail`, and shared `EmailLayout`.
- The app does not currently have a database-driven email template editor. Template updates are code changes, validated, deployed, then verified through `/admin/emails` and `email_events`.
- Current internal-test email media delivery can include Supabase signed URLs for final PDFs and personalized cover images. This is acceptable for internal testing, but the public-beta target is a YMI-owned email media proxy route that validates an unguessable token, supports revocation/audit metadata, and signs short-lived Supabase URLs internally for `final_pdf` and `cover_image` resources.

External email boundaries:
- Stripe receipts are controlled in Stripe Dashboard. Local `external_observed` records mean YMI saw a Stripe checkout/payment event, not that YMI sent or verified delivery.
- Supabase Auth OTP/signup/account-security emails are controlled in Supabase Auth Email Templates. Guest checkout OTP is not Supabase Auth; it is YMI-managed through Resend.
- Supabase Auth templates currently branded in the Supabase Dashboard are Confirm sign up, Magic link or OTP, Change email address, Reset password, and Reauthentication. Invite user is not a current customer flow unless Supabase invite-based onboarding is introduced.
- Supabase Auth dashboard HTML should stay aligned with `docs/EMAIL_DESIGN_SPEC.md` and the hosted `/email-assets` files.

Vercel:
- Hosts the Next.js web/API app.
- Production site URL should be `https://www.ymistory.com`.
- Internal API secret must match the worker online environment.
- SEO metadata, sitemap, robots, and canonical URLs assume the www production host; non-www traffic should continue redirecting to www.

Mediapipe:
- Browser-side face quality/detection assets live under `ymi-books-web-1.0/public/mediapipe`.
- These are third-party generated static assets and are intentionally ignored by ESLint.

## Environment Contract

Do not store actual secret values in docs.

Web/Vercel:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `SITE_URL`
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `EMAIL_FROM_SECURITY`
- `EMAIL_FROM_ORDERS`
- `EMAIL_FROM_DELIVERY`
- `EMAIL_FROM_SUPPORT`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `EMAIL_FROM_SECURITY`
- optional order/delivery/support email sender overrides
- `INTERNAL_API_SECRET`
- `CRON_SECRET`

Worker:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `WORKER_MOCK_MODE`
- `RUNPOD_API_KEY`
- `RUNPOD_API_BASE_URL`
- `WORKER_CALLBACK_URL`
- `INTERNAL_API_SECRET`
- `WORKER_HEALTH_HOST`
- `WORKER_HEALTH_PORT`
- `HEALTHCHECKS_URL`

## Current Architectural Decisions

- Supabase cloud project `pgpaawqgtewowjratddm` is the production project.
- `Template_folder` is a local backup/source package area; runtime story data should be read from Supabase once synced.
- RunPod is the production AI path.
- Worker can remain local during internal testing but should eventually move to a cloud host.
- Mock worker mode is intentional and useful for UI/UX testing without RunPod cost.
- Admin review is required before customer final PDF delivery.
- Worker stops final jobs at `review_pending`; admin release is responsible for PDF packaging and final delivery email.
