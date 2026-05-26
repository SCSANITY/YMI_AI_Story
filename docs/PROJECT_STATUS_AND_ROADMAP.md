# YMI Story Project Status And Roadmap

Last updated: 2026-05-26

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

## Current Owner-Managed Work

- First-launch story content preparation.
- 8 stories are planned for the initial internal-test catalog.
- Story face-swap testing and prompt/config tuning are in progress: `5/8`.
- `Forest_story` and other story `config.json` updates are being handled as part of this broader story-quality pass.
- Updated story configs/assets must be synced from local package backups to Supabase before runtime validation.
- A further 7 stories are planned for rollout during the internal-test period, bringing the intended catalog to 15 stories.

## Near-Term Technical Todos

High priority before internal test:
- Finish and sync the selected first-launch story configs in Supabase.
- Clean remaining demo/placeholder content from the public website and update UIUX to a formal production-site version.
- Connect Stripe Live in Vercel production after live readiness; local/dev should remain on test keys.
- Run one complete real payment flow after Stripe Live is connected.
- Run one full real-mode preview with RunPod.
- Run one full real-mode final job with all pages.
- Perform Admin approve/release and confirm final PDF delivery email.

Medium priority:
- Export and save the `claim_next_job` SQL definition from Supabase.
- Confirm production Supabase Storage policies for `app-templates` and `raw-private`.
- Configure `HEALTHCHECKS_URL` for the real worker host before internal testing.
- Confirm `INTERNAL_API_SECRET` matches between Vercel production env and worker online env.
- Confirm worker online env points to production callback URL.
- Decide alert owner for Healthchecks and Resend bounce/complaint monitoring.
- Confirm RunPod cancellation behavior is safe for `/cancel/{runId}`.
- Confirm RunPod endpoint image/volume/workflow version is tracked outside code.

Stripe Live setup:
- Company registration is complete.
- Vercel production still needs live publishable key, live secret key, and live webhook secret.
- Confirm live webhook endpoint and event subscriptions.
- Keep local environment on Stripe test keys.
- Treat the first successful live payment as an internal-test readiness milestone.

Code quality / maintainability:
- Generated Supabase TypeScript types are not yet wired in.
- There are still many lint warnings; not a current blocker, but should be cleaned in a focused pass.
- Some product/content pages may still contain placeholder/demo wording.
- Admin rerun UI is reserved/disabled for a future random-seed rerun flow.

## Known Risks And Current Judgment

`claim_next_job` SQL not stored in repo:
- Runtime risk is low because the RPC exists and responds in production Supabase.
- Reproducibility/disaster-recovery risk remains until SQL is exported and versioned.

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

## Longer-Term Product/Engineering Direction

- Move worker from local Windows host to cloud host.
- Add physical book fulfillment workflow.
- Add customer recording and audiobook generation pipeline.
- Add stronger observability around job duration, RunPod failure rate, and email delivery.
- Create a formal Supabase schema/migration folder if the project starts using migration-based DB management.
- Track story package versions so each production order can be traced to the exact template/workflow/config version used.
