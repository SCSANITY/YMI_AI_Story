# YMI Story Project Status And Roadmap

Last updated: 2026-06-01

## Current State

The project has a verified end-to-end production-capable flow and is now in internal-test preparation.

Verified production capabilities:
- Customer chooses story and uploads a face photo.
- Preview job is created and processed.
- Worker can process jobs through mock mode for UI testing or real RunPod mode for production generation.
- RunPod AI workflow integration has been connected and tested.
- Stripe test checkout flow works.
- Payment finalization creates final jobs and final review records.
- Worker can process final pages.
- Admin can review, approve, and release pages.
- Admin release builds the final PDF.
- Resend sends the final delivery email.

Current phase:
- Internal-test preparation and launch readiness.
- The focus is content quality, official-site UIUX cleanup, Stripe Live integration, and small-scale user feedback.
- This is not a core functionality build phase; the main product flow is already functional.

Active short-term tracker:
- [INTERNAL_TEST_PREP_PLAN.md](./INTERNAL_TEST_PREP_PLAN.md)

## Confirmed System Facts

- Supabase cloud project `pgpaawqgtewowjratddm` is the intended production project.
- RunPod is the current real AI provider path.
- Current active cloud story configs mostly reference RunPod endpoint `39ygcoofm4ye40`.
- Worker runs locally today and should later move to a cloud host.
- Mock worker mode is intentional for UI/UX testing.
- `Template_folder` is a local backup/source area; Supabase is runtime source for templates/configs after sync.
- Resend production domain/from addresses are verified.
- Stripe live review is not yet complete; local/dev should remain on test keys.

## Recently Completed Engineering Work

- Frontend lint blocker fixed by ignoring only `public/mediapipe/**`.
- `npm run lint` no longer fails on generated Mediapipe runtime files.
- `npx eslint --quiet` passed.
- `npm run build` passed.
- Worker `npx tsc --noEmit` passed during scan.
- Removed one planned debug-log issue from personalize route.
- Verified cloud `jobs.status` accepts `cancel_requested` and `cancelled` after rerunning SQL.
- Verified `claim_next_job` RPC exists and returns correctly when no queued jobs are present.
- Fixed `SITE_URL` typo in `ymi-books-web-1.0/.env.vercel.development`.
- Documented canonical end-to-end production flow.
- Documented worker per-image preview/final processing.
- Replaced temporary scan notes with maintainable docs.
- Exported and saved `claim_next_job` SQL definition to `Template_folder/sql_claim_next_job.sql`.
- Completed full Supabase DB/Storage architecture scan and call-chain mapping.
- Admin dashboard restructured from single-page monolith to multi-route App Router architecture (see Admin Architecture section below).
- Magic Attributes feature shipped: `templates.magic_attributes` JSONB column added to DB; `normalizeMagicAttributes()` parser added to `book-catalog.ts`; `MagicAttribute` type added to `types/index.ts`; list API and detail API both return the field; Customize page replaces hardcoded Kindness/Courage with dynamic per-book attribute bars; six standard categories have i18n translations in EN/ZH/JA/ES/KO; custom free-text labels display as-is with a default icon.
- SEO metadata foundation shipped for the public site: root App Router metadata now has a non-empty title, description, metadataBase, canonical www URL, OG/Twitter defaults, and favicon declarations; public pages have unique metadata; product pages generate metadata from Supabase templates; anonymous non-indexable pages use meta noindex; private/admin/API areas are excluded in `robots.txt`; `sitemap.xml` and `robots.txt` are generated from the canonical www domain.
- SEO deployment/Search Console status: commit `b8460a1` has been pushed and deployed to `https://www.ymistory.com`; live homepage exposes the new title/canonical/default OG image; live `sitemap.xml` is reachable with 19 URLs; live `robots.txt` references the sitemap. Google Search Console domain property `ymistory.com` was verified by DNS TXT, `https://www.ymistory.com/sitemap.xml` was submitted, and homepage plus `/books` were manually requested for reindexing. Current state: waiting for Google recrawl/index refresh.
- Unified Discount System shipped and Phase 4 code cleanup completed: checkout now uses `discount_offers`, `discount_instruments`, `discount_redemptions`; DB RPCs handle apply/release/paid transitions; admin discount creation lives at `/admin/discounts`; legacy referral/reward-coupon apply APIs and invite pages have been removed from the codebase. DB cleanup SQL is stored at `Template_folder/sql_unified_discount_phase4_cleanup.sql` and should be executed manually in Supabase after deployment confirmation.
- Frontend performance optimization pass completed for the public catalog -> Customize -> Preview/Share path:
  - Book cards keep the 3D cover feel while repeated card panels use lighter `book-card-panel` styling instead of full `backdrop-filter` glass.
  - Book cover hover no longer recalculates heavier shadow filters; hover motion is now transform-focused.
  - Transparent `cover-normalized.webp` covers are loaded through Next Image with responsive sizing, and static fallback covers now prefer normalized WebP assets where available.
  - `/api/templates` and `/api/templates/[templateId]` now use public short-cache headers; public catalog/detail fetches no longer force `no-store` or include user credentials.
  - Books grid Framer Motion layout animation was removed while preserving lightweight entry animation.
  - Customize preview/showcase image preloading is scoped to visible or adjacent images instead of broad eager loading.
  - Share dialog preview image is eager-loaded and share/download actions reuse a cached image file instead of refetching.
  - Home hero video uses `preload="metadata"` and the first poster banner no longer competes as a high-priority image.
  - Product showcase photos were standardized to `products/productN.webp`: local script `scripts/optimize-template-products.mjs` generated 97 WebP files from `Template_folder/<Story_ID>/Product`; local source PNGs were removed after conversion; Supabase was updated with the WebP files and verified as 97 WebP / 0 PNG across active stories.
- Email system Phase 1 reliability pass implemented:
  - Added `email_events` as the unified log for YMI-managed Resend emails and external Stripe/Supabase Auth observations.
  - Order confirmation emails now use an idempotency key so Stripe webhook retries do not create duplicate customer emails.
  - Final delivery email failures no longer block PDF release; failures are logged and `final_jobs.email_sent_at` remains null.
  - Guest checkout OTP remains synchronous and user-facing; failed sends delete the generated verification code.
  - Unpaid reminders now write new delivery records to `email_events` instead of `order_reminder_logs`.
  - Added read-only Admin email log page at `/admin/emails`.
- Logistics notification flow added:
  - Customer-facing order progress now uses `orders.order_status` as the single source of truth: `paid`, `production`, `shipped`, `delivered`.
  - Order status update history is stored in `order_status_events`.
  - Admin logistics management lives at `/admin/orders`.
  - `/admin/orders` defaults to the editable Production Flow group and separately filters read-only `unpaid`, `cancelled`, and `refunded` orders.
  - Changing order status to `production`, `shipped`, or `delivered` from Admin sends a `logistics_update` email through `EMAIL_FROM_DELIVERY`.
  - Customer order detail pages read `order_status` and show tracking details when available.
- Email template maintenance policy clarified:
  - YMI-managed email templates remain code-managed for now, not editable in a database or Admin template editor.
  - Email body/layout changes are made in `components/emails/*`.
  - Email subject, sender selection, idempotency key, and trigger behavior are maintained in `src/lib/email.tsx`.
  - External Stripe and Supabase Auth email templates remain managed in their respective dashboards.
  - Future template/content requests should be handled as focused code changes, then verified through `/admin/emails` and `email_events`.

## Current Owner-Managed Work

- First-launch story content preparation.
- 8 stories are planned for the initial internal-test catalog.
- Story face-swap testing and prompt/config tuning are in progress: `5/8`.
- `Forest_story` and other story `config.json` updates are being handled as part of this broader story-quality pass.
- Updated story configs/assets must be synced from local package backups to Supabase before runtime validation.
- A further 7 stories are planned for rollout during the internal-test period, bringing the intended catalog to 15 stories.

## Near-Term Technical Todos

High priority before internal test:
- Execute `Template_folder/sql_email_events.sql` in Supabase before relying on the new email logging path.
- Execute `Template_folder/sql_order_logistics.sql` in Supabase before using `/admin/orders` order status updates.
- Configure Vercel email sender env vars as separate keys, not as one combined value:
  - `EMAIL_FROM`
  - `EMAIL_FROM_SECURITY`
  - `EMAIL_FROM_ORDERS`
  - `EMAIL_FROM_DELIVERY`
  - `EMAIL_FROM_SUPPORT`
- Finish and sync the selected first-launch story configs in Supabase.
- Clean remaining demo/placeholder content from the public website and update UIUX to a formal production-site version.
- Connect Stripe Live in Vercel production after live readiness; local/dev should remain on test keys.
- Run one complete real payment flow after Stripe Live is connected.
- Run one full real-mode preview with RunPod.
- Run one full real-mode final job with all pages.
- Perform Admin approve/release and confirm final PDF delivery email.
- Monitor Google Search Console until submitted sitemap processing changes to success and the stale pre-SEO `Untitled` / favicon snapshot is replaced by the recrawled homepage result.

Medium priority:
- Confirm production Supabase Storage policies for `app-templates` and `raw-private`.
- Configure `HEALTHCHECKS_URL` for the real worker host before internal testing.
- Confirm `INTERNAL_API_SECRET` matches between Vercel production env and worker online env.
- Confirm worker online env points to production callback URL.
- Decide alert owner for Healthchecks and Resend bounce/complaint monitoring.
- Resend webhook for delivered/bounced/complained status is deferred until the public launch phase; current email observability is sent/failed/external_observed.
- Confirm RunPod cancellation behavior is safe for `/cancel/{runId}`.
- Confirm RunPod endpoint image/volume/workflow version is tracked outside code.

Stripe Live setup:
- Company registration is complete.
- Vercel production needs: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (pk_live_*), `STRIPE_SECRET_KEY` (sk_live_*), `STRIPE_WEBHOOK_SECRET` (whsec_* from the live endpoint).
- Register live webhook endpoint in Stripe Dashboard → `https://www.ymistory.com/api/webhooks/stripe`.
- Subscribe to exactly two events: `checkout.session.completed` and `checkout.session.async_payment_succeeded`.
- Keep local `.env.local` and `.env.localhost` on test keys — no local file changes needed.
- No code changes required; existing code is key-agnostic.
- Treat the first successful live payment as an internal-test readiness milestone.

Code quality / maintainability:
- Generated Supabase TypeScript types are not yet wired in.
- There are still many lint warnings; not a current blocker, but should be cleaned in a focused pass.
- Some product/content pages may still contain placeholder/demo wording.
- Admin rerun UI is reserved/disabled for a future random-seed rerun flow.
- SEO metadata should stay aligned with route ownership: public marketing/catalog pages may be indexed; private areas should be excluded with `robots.txt`; anonymous but non-indexable pages should remain crawlable with meta noindex so crawlers can actually see the directive. Do not rely on `robots.txt` for API security; API routes still require their own auth/secret checks.
- Frontend performance is no longer a near-term blocker after the May 2026 optimization pass. Optional future work: run Lighthouse/Chrome Performance baselines on homepage, `/books`, Customize, and ShareDialog; add a hero video poster or mobile-specific lower-bitrate video; continue reducing repeated `backdrop-blur` usage in non-critical surfaces; archive unused large PNG assets in `public/banners` to prevent accidental future references.
- Email template customization is intentionally code-first in the current phase. If the product needs marketer-editable templates later, design that as a separate feature with preview, approval, versioning, and test-send controls instead of mixing it into the current sender functions.

## Known Risks And Current Judgment

`claim_next_job` SQL:
- ✅ Now stored in `Template_folder/sql_claim_next_job.sql`.
- Runtime risk: low. Reproducibility risk: resolved.

Worker env profile switching:
- Scripts mutate `worker/.env`.
- PM2 must be restarted after switching profiles.
- The active `.env` can differ from `.env.localhost` and `.env.online`, so runbooks must call this out.

RunPod output contract:
- Worker currently expects base64 image output in a parser-supported shape.
- If RunPod changes to URL-only output or a different response structure, `runpodAdapter` must be updated.

Mock mode:
- Useful and intentional.
- Risk only comes from accidentally running production/internal-test jobs with mock mode enabled.

Story config sync:
- Local config files may be ahead of Supabase while story updates are in progress.
- Runtime behavior follows Supabase, not unsynced local config backups.

Admin review:
- Current final delivery depends on manual admin release.
- This is deliberate for quality control before customer delivery.

## Suggested Internal-Test Acceptance Checklist

- Web production env points to `https://www.ymistory.com`.
- Supabase production project is confirmed.
- Active story configs are synced to Supabase.
- Worker is running with `WORKER_MOCK_MODE=false`.
- RunPod endpoint is online.
- `INTERNAL_API_SECRET` matches Vercel and worker.
- Healthchecks is configured for real worker host.
- Stripe test flow completes locally/staging as expected.
- Full preview generation succeeds.
- Full final generation succeeds.
- Admin review page shows all generated pages.
- Approve/release creates final PDF.
- Delivery email arrives with usable signed PDF link.

## Admin Architecture (Current State)

Admin dashboard was restructured from a single-page monolith to a multi-route Next.js App Router layout.

Current admin routes (all under `app/admin/`):
- `/admin/login` — Login and access-denied handling (no auth required)
- `/admin/finals` — Final Review: page-by-page approve/replace/release workflow
- `/admin/announcements` — Blog post CRUD, image upload, live preview
- `/admin/discounts` — Unified discount management: promo codes and account vouchers
- `/admin/service` — Customize access toggle, creator promo code config
- `/admin/analytics` — Placeholder (coming soon: sales data visualization)
- `/admin/banner` — Placeholder (coming soon: promotional banner management)
- `/admin/catalog` — Placeholder (coming soon: book/template management)

Key architectural details:
- Auth guard lives in `app/admin/(protected)/layout.tsx` — one check, inherited by all protected routes.
- Sidebar navigation uses `usePathname()` for active-state highlighting.
- All 15 existing API routes under `app/api/admin/` are unchanged.
- `FinalReviewPanel.tsx` (1819 lines) is untouched — moved as a unit to `/admin/finals`.

## Admin Upgrade Plan (Pending)

The following admin features are planned but not yet implemented. Implementation order is flexible — each is independent.

**Analytics / Data Overview (`/admin/analytics`)**
- Connect to `orders`, `payments`, `jobs` tables.
- Display revenue metrics, conversion rates, job throughput.
- Planned as read-only visualization; no DB writes.

**Catalog / Book Management (`/admin/catalog`)**
- List all templates from the `templates` table.
- Edit pricing (`price_usd`), toggle `is_active` / `is_coming_soon`.
- Upload or update cover images and `default_config_path`.
- Add new templates or archive existing ones.
- All changes write directly to the `templates` table via new API routes under `/api/admin/catalog/`.
- Must be designed carefully: pricing changes affect live checkout; config path changes affect running worker jobs.

**Discount Campaigns / Claimable Vouchers**
- Extend the shipped unified discount system beyond manual admin-created promo codes and point-to-point vouchers.
- Keep the current model as the base:
  - `discount_offers` = what the discount is.
  - `discount_instruments` = the concrete promo code or account voucher.
  - `discount_redemptions` = checkout usage records.
- Add a future claim-campaign layer for UI-driven or condition-driven voucher acquisition, such as homepage claim buttons, new-user vouchers, seasonal campaigns, survey rewards, invite-success rewards, and limited-quantity drops.
- Proposed future tables: `discount_claim_campaigns` and `discount_claims`.
- Admin should eventually manage:
  - campaign name and status,
  - linked discount offer,
  - display placement,
  - eligibility rules,
  - per-user claim limit,
  - global claim inventory,
  - campaign start/end time,
  - user-facing copy and CTA.
- This is not required for current internal testing; current admin manual vouchers and shared promo codes are sufficient for the near-term rollout.

**Final Page Rerun with Random Seed**
- Allows admin to rerun a single final page with a new random seed (instead of the fixed default seed).
- Flow: Admin clicks Rerun on a specific page → frontend calls `/api/admin/final-jobs/[id]/pages/[index]/rerun` → API generates a random `noise_seed` → creates a new RunPod job → polls/processes result → writes new `ai_output_path` to `final_job_pages` → sets page status back to `pending_review`.
- Requires careful state handling: the page transitions `pending_review → rerunning → pending_review` (or `failed`).
- The existing Rerun button in FinalReviewPanel is already present in the UI but disabled, reserved for this feature.
- Worker involvement: this may be done as a direct API-to-RunPod call (bypassing the worker job queue) or as a new lightweight job type — to be decided during implementation.

## Longer-Term Product/Engineering Direction

- Move worker from local Windows host to cloud host.
- Add physical book fulfillment workflow.
- Add customer recording and audiobook generation pipeline.
- Add stronger observability around job duration, RunPod failure rate, and email delivery.
- Create a formal Supabase schema/migration folder if the project starts using migration-based DB management.
- Track story package versions so each production order can be traced to the exact template/workflow/config version used.
