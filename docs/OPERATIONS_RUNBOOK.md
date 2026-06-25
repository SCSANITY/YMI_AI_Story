# YMI Story Operations Runbook

Last updated: 2026-06-10

This runbook covers development and internal-test operation. Do not place secret values in this file.

## Local Web App

Path:
- `ymi-books-web-1.0/`

Common commands:

```powershell
cd "D:\IT_David\Program\Voice Imagination\Web\ymi-books-web-1.0"
npm install
npm run dev
npm run lint
npx eslint --quiet
npx tsc --noEmit
npm run build
```

Current verification status:
- `npm run lint` passed after ignoring third-party Mediapipe static runtime files.
- `npx tsc --noEmit` passed.
- `npm run build` passed.

ESLint note:
- `public/mediapipe/**` is ignored because it contains generated third-party Mediapipe/Emscripten runtime assets.
- Do not ignore the entire `public/**` directory unless there is a specific reason.

## Worker

Path:
- `worker/`

Current runtime:
- TypeScript entry: `index.ts`
- Runner: `ts-node`
- PM2 process name: `ymi-worker`
- PM2 config: `worker/ecosystem.config.js`

Common commands:

```powershell
cd "D:\IT_David\Program\Voice Imagination\Web\worker"
npm install
npx tsc --noEmit
```

Subtitle renderer check:
- Subtitle editor render requirements live at:
  - `D:\IT_David\Program\Voice Imagination\Web\subtitle-template-editor-app\WORKER_SUBTITLE_RENDER_SPEC.md`
- Worker runtime implementation lives at:
  - `D:\IT_David\Program\Voice Imagination\Web\worker\subtitleRenderer.ts`
- After changing subtitle editor export behavior, update and verify the worker renderer before syncing affected story JSON to Supabase.
- At minimum run:

```powershell
cd "D:\IT_David\Program\Voice Imagination\Web\worker"
npx tsc --noEmit
```

- For higher-risk subtitle changes, run a local smoke render that exercises `{name}` mixed styling, gradient fill, stroke, shadow, glow, bevel, underline, and box fade. A successful smoke render should produce a non-empty PNG buffer without throwing.
- After the 2026-06-10 JSON Creator sync, smoke tests should also cover numeric `fontWeight`, `spans` range styling, and mixed-run center/right alignment. These are worker-host runtime behaviors; updating Vercel does not update the worker renderer by itself.
- Worker subtitle font folders may contain `.ttf`, `.otf`, `.woff`, or `.woff2` assets.

Environment profile switch:

```powershell
cd "D:\IT_David\Program\Voice Imagination\Web\worker"
.\scripts\use-env-localhost.ps1
# or
.\scripts\use-env-online.ps1
```

Important:
- Worker runtime reads `worker/.env` only.
- `worker/.env.localhost` and `worker/.env.online` are scenario profiles/reference files. They do not take effect by themselves.
- The profile switch scripts simply copy one profile over `worker/.env`.
- It is also valid to edit `worker/.env` directly for the current run, as long as the active callback target and mock mode are intentional.
- Restart PM2 or the local worker process after changing `worker/.env`.

Worker environment fields to verify before each run:
- `WORKER_CALLBACK_URL` controls whether the worker calls back to local Next.js or Vercel.
- `WORKER_MOCK_MODE=false` is the only value that enables the real provider path. Any other value is treated as mock mode.
- `INTERNAL_API_SECRET` must match the target web app environment when callbacks are used.

PM2 commands:

```powershell
npm install -g pm2
pm2 start ecosystem.config.js
pm2 status
pm2 logs ymi-worker
pm2 restart ymi-worker
pm2 stop ymi-worker
pm2 delete ymi-worker
pm2 save
```

Worker health endpoint:

```text
http://127.0.0.1:8787/health
```

Health endpoint env:

```env
WORKER_HEALTH_HOST=127.0.0.1
WORKER_HEALTH_PORT=8787
```

## Mock Mode Vs Real Mode

Mock mode:
- Controlled by `WORKER_MOCK_MODE`.
- Useful for UI/UX testing without starting RunPod or paying GPU cost.
- Current active `worker/.env` may be set to mock mode during local design testing.

Real mode:
- `WORKER_MOCK_MODE=false`.
- Requires valid RunPod env and active endpoint.
- Used for production/internal-test generation.

Before a real production test:
- Confirm `worker/.env` was switched to the correct profile.
- Confirm `WORKER_MOCK_MODE=false`.
- Confirm RunPod endpoint is online.
- Confirm worker can read Supabase and claim jobs.

## Supabase Operations

Current production project:
- `pgpaawqgtewowjratddm`

Buckets:
- `app-templates`
- `raw-private`

Critical RPC:
- `claim_next_job`
- `renew_job_lease`

Cloud worker SQL to run before Render polling:
- `Template_folder/sql_worker_claim_lease.sql`

This SQL adds queue ownership and lease columns to `jobs`, upgrades `claim_next_job(p_worker_id, p_job_types, p_lease_seconds)`, preserves a no-argument `claim_next_job()` wrapper for old local workers, and adds `renew_job_lease()`.

RPC follow-up command to export definitions from Supabase SQL Editor:

```sql
select
  n.nspname,
  p.proname,
  pg_get_function_arguments(p.oid),
  pg_get_functiondef(p.oid)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('claim_next_job', 'renew_job_lease');
```

Save the returned function definition into a versioned SQL file if production SQL is edited manually.

Current known DB fix:
- `Template_folder/sql_jobs_cancel_statuses.sql` has been run in cloud Supabase.
- `jobs.status` accepts `cancel_requested` and `cancelled`.

## Worker Cloud Operations

Current status:
- Render has been selected as the future production Worker platform.
- Cutover is intentionally deferred until after internal-test/product planning.
- The local Worker at `D:\IT_David\Program\Voice Imagination\Web\worker` is the active worker path during internal test.
- The previous Git-managed duplicate at `ymi-books-web-1.0/worker` was removed to avoid stale worker source confusion.

Active Worker folder:
- `D:\IT_David\Program\Voice Imagination\Web\worker`

Render target:
- Service type: Background Worker.
- Region: US East.
- Exact Git/Render source boundary must be re-decided before cutover resumes.
- Do not recreate a second worker source until that decision is locked.

Safety defaults:
- Local `.env`: `WORKER_POLL_ENABLED=false`.
- Render dry run: `WORKER_POLL_ENABLED=false`.
- Render production after validation: `WORKER_POLL_ENABLED=true`, `WORKER_MOCK_MODE=false`.

Before enabling Render polling:
1. Run `Template_folder/sql_worker_claim_lease.sql`.
2. Confirm `claim_next_job()` still works with no arguments.
3. Confirm the new claim signature writes `claimed_by`, `claimed_at`, `lease_expires_at`.
4. Confirm `renew_job_lease()` exists.
5. Stop local production Worker or set local polling false.

Preview job creation SQL:
- `Template_folder/sql_preview_job_owner_and_config_cleanup.sql`
- Run this before deploying the matching Next.js preview job creation code.
- It standardizes `templates.default_config_path` to `{template_id}/config.json` and creates `create_preview_job()` for atomic preview creation.
- The current SQL file does not write `updated_at` on `templates` or `creations`; if Supabase reports `column "updated_at" does not exist`, re-open the latest file from `Template_folder` and rerun it rather than adding columns as a workaround.

Cutover validation:
- Run one preview job and confirm Render claims it.
- Run one full final job and confirm:
  - `final_job_pages.status='pending_review'` for generated pages.
  - `final_job_pages.ai_output_path` is non-empty.
  - `final_jobs.status='review_pending'`.
  - Admin release creates the final PDF through Next.js.
  - Delivery email is recorded in `email_events`.

## RunPod Operations

Current provider:
- RunPod Serverless.

Current endpoint referenced by active cloud template configs:
- `39ygcoofm4ye40`

Worker expects:
- RunPod `/run` accepts workflow JSON and two input images.
- Worker sends template and face images as data URIs.
- `/status/{runId}` eventually returns a parseable base64 output image.
- `/cancel/{runId}` is available for preview cancellation where supported.

Before real generation:
- Confirm `RUNPOD_API_KEY` exists in worker env.
- Confirm `RUNPOD_API_BASE_URL` is correct.
- Confirm endpoint image/volume/workflow version matches the story configs in Supabase.
- Confirm workflow output contract still matches `worker/providers/runpodAdapter.ts`.

## Stripe Operations

Current state:
- Local/dev should remain on Stripe test keys.
- Production live keys should be switched in Vercel only after Stripe live review is complete.

Production checklist after live approval:
- Set production `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
- Set production `STRIPE_SECRET_KEY`.
- Set production `STRIPE_WEBHOOK_SECRET`.
- Confirm webhook endpoint:
  - `https://www.ymistory.com/api/webhooks/stripe`
- Confirm webhook events include:
  - `checkout.session.completed`
  - `checkout.session.async_payment_succeeded`
- Run a live low-value order test if operationally acceptable.

## Resend Operations

Current state:
- Production sending domain and from addresses are verified.
- Successful email sending has already been observed.
- YMI-managed emails write to `email_events` with `sent` or `failed` status.
- Stripe and Supabase Auth emails are logged only as `external_observed`; their templates and delivery status are managed in the external dashboards.
- `/admin/emails` is the read-only operational view for recent email events.

Used for:
- Guest checkout OTP: synchronous Resend email; failed send deletes the generated verification code.
- Order confirmation: sent after payment finalization; idempotency key is `order_confirmation:{order_id}`.
- Final PDF delivery: sent after Admin release; failure does not block release and leaves `final_jobs.email_sent_at` null.
- Order status update: sent from `/admin/orders` when status changes to `production`, `shipped`, or `delivered`.
- Unpaid checkout reminder: sent by the unpaid cron path with daily idempotency.

Check before internal test:
- Run `Template_folder/sql_email_events.sql` in Supabase.
- Run `Template_folder/sql_order_logistics.sql` in Supabase.
- Confirm `RESEND_API_KEY` in Vercel.
- Confirm `EMAIL_FROM` and security/order/delivery sender values.
- Confirm bounce/complaint monitoring owner.
- Review `/admin/emails` after test sends.

Order status email rules:
- `paid` means Order Confirmed. Its email is the payment/order confirmation email, not an Admin status update email.
- `production` means Printing and sends a production/printing update from `EMAIL_FROM_DELIVERY`.
- `shipped` sends a shipped update from `EMAIL_FROM_DELIVERY`, including tracking data if present.
- `delivered` sends a delivered update from `EMAIL_FROM_DELIVERY`.
- Updating only tracking or note without changing status does not send email.
- Direct Supabase edits to `orders.order_status` are visible after Admin/customer page refresh but do not send email automatically.
- `/admin/orders` Production Flow orders are editable; `unpaid`, `cancelled`, and `refunded` groups are read-only.

Where to edit email content:
- YMI-managed email layout and body: `components/emails/*`.
- YMI-managed subject/from/send behavior: `src/lib/email.tsx`.
- Order status update email body: `components/emails/LogisticsUpdateEmail.tsx`.
- Admin order status updates: `/admin/orders`.
- Stripe receipts: Stripe Dashboard.
- Supabase Auth signup/OTP/account-security templates: Supabase Auth Email Templates.
- Supabase Auth templates currently branded in the dashboard: Confirm sign up, Magic link or OTP, Change email address, Reset password, and Reauthentication.
- Supabase Invite user is not currently part of the customer flow; only brand it if invite-based onboarding becomes a real workflow.
- Use `docs/EMAIL_DESIGN_SPEC.md` as the source of truth for Supabase Auth HTML shell, copy, variables, and hosted email assets.

Email sender env vars:
- Configure these as separate Vercel environment variables, not as one pasted multi-line value.
- `EMAIL_FROM`: default/general sender.
- `EMAIL_FROM_SECURITY`: guest OTP/security sender.
- `EMAIL_FROM_ORDERS`: order confirmation sender.
- `EMAIL_FROM_DELIVERY`: PDF delivery and order-status update sender.
- `EMAIL_FROM_SUPPORT`: support/customer service sender.

Email template change workflow:
- Identify the email type and trigger first: OTP, order confirmation, final PDF delivery, order status update, or unpaid reminder.
- Edit the body/layout in the matching `components/emails/*` template.
- Edit subject, sender env selection, idempotency key, or failure behavior in `src/lib/email.tsx` only when the trigger behavior changes.
- Run `npm run lint -- --quiet`, `npx tsc --noEmit`, and `npm run build`.
- Deploy, trigger the relevant flow, then confirm the row in `/admin/emails` or Supabase `email_events`.
- For external Stripe/Supabase Auth emails, change templates in their dashboards and use local `external_observed` records only as event markers. Supabase Auth template changes are dashboard changes and do not require a code deploy unless `docs/EMAIL_DESIGN_SPEC.md` or hosted `/email-assets` change.

Sender avatar / brand logo:
- Do not rely on Gravatar for production sender avatars. Resend sending-domain aliases are not a reliable Gravatar identity path, and client support is inconsistent.
- Public-launch task: configure BIMI for `ymistory.com` after SPF/DKIM/DMARC alignment is confirmed and DMARC is moved to enforcement.
- Public-launch task: evaluate Apple Branded Mail separately for Apple Mail/iCloud Mail brand display.
- Until BIMI is in place, rely on clear sender names, verified sender addresses, and the in-template YMI logo.

Email private media links:
- Current internal-test behavior may use Supabase signed URLs directly in email for final PDF downloads and personalized cover previews.
- The final PDF signed URL is intentionally short-lived; the email should also provide an order-page fallback so late openers can still access the download through the app.
- Personalized cover images are child face-swap media. Treat them as privacy-sensitive, even if the URL is signed and unguessable.
- Public-beta task: replace direct email media links with a YMI-owned proxy route such as `/api/email-media/[token]`.
- The proxy token should be unguessable and bound to resource metadata: order id, final job id when applicable, resource type (`final_pdf` or `cover_image`), bucket, storage path, expiry, revocation timestamp, access count, and last accessed time.
- The proxy route should validate the token, reject revoked/expired tokens, then create a fresh short-lived Supabase signed URL and redirect or stream the asset.
- This proxy mitigates stale PDF links and long-lived child-cover exposure, but it is still a bearer-link model: anyone with the email/link can access the asset unless the route requires login. Requiring login would break inline email image rendering, so this is privacy-risk reduction rather than absolute access control.

## Vercel And Internal Callback

Production site:
- `https://www.ymistory.com`

Important env:
- `NEXT_PUBLIC_SITE_URL`
- `SITE_URL`
- `INTERNAL_API_SECRET`
- `CRON_SECRET`

Worker online env:
- `WORKER_CALLBACK_URL` should point to production.
- `INTERNAL_API_SECRET` must match Vercel.

Known completed fix:
- `ymi-books-web-1.0/.env.vercel.development` `SITE_URL` typo was corrected to `https://www.ymistory.com`.

## Healthchecks

Worker supports Healthchecks.io through:
- `HEALTHCHECKS_URL`
- `HEALTHCHECK_INTERVAL_MS`
- `HEALTHCHECK_SUPABASE_STALE_MS`
- `HEALTHCHECK_MAX_JOB_RUNTIME_MS`

Recommended before internal test:
- Configure Healthchecks only on the machine/host responsible for real worker processing.
- Suggested period: 2 minutes.
- Suggested grace: 3 minutes.
- Alerts should trigger if no healthy ping is received for about 5 minutes.

## Manual Verification Scenarios

Preview mock mode:
- Start web app.
- Start worker in mock mode.
- Open personalize page.
- Upload a valid face photo.
- Generate preview.
- Expected: preview completes without RunPod cost.

Preview real mode:
- Confirm RunPod endpoint is running.
- Start worker with `WORKER_MOCK_MODE=false`.
- Generate preview.
- Expected: worker creates RunPod run, polls completion, uploads preview image and `_full` image, job reaches `done`.

Checkout:
- Use Stripe test key locally.
- Start checkout.
- Complete Stripe test payment.
- Expected: webhook or success fallback finalizes payment and creates final job/review records.

Final generation:
- Worker in real mode claims final job.
- Expected: every page reaches `pending_review` in Admin.
- Expected: final job reaches `review_pending`.

Admin release:
- Approve all pages or upload replacements where needed.
- Release final job.
- Expected: final PDF uploaded to `raw-private/orders/{orderId}/final/pdf/final.pdf`.
- Expected: delivery email sent by Resend.

## Troubleshooting Pointers

Preview never starts:
- Check `jobs.status`.
- Check `claim_next_job` RPC.
- Check worker env and PM2 logs.

RunPod failure:
- Check `jobs.provider_runs`.
- Check worker logs for endpoint, run ID, status, timeout, and output parsing errors.
- Confirm RunPod endpoint output contract has not changed.

Final page stuck:
- Check `final_job_pages.status`.
- Check parent `jobs.provider_runs` and `render_runs`.
- Check whether the job is in mock mode accidentally.

Emails not received:
- Check Resend API key and sender env.
- Check spam/quarantine.
- Check app email function logs.

Subtitle render mismatch:
- Compare the exported JSON with `subtitle-template-editor-app/WORKER_SUBTITLE_RENDER_SPEC.md`.
- Confirm the story config `subtitle_render.template_path` and `fonts_path` match the Supabase `app-templates` object names exactly.
- Confirm filenames use `subtitle`, not the old misspelling `subtittle`.
- Check `jobs.render_runs` for page-level subtitle render status, timings, and error messages.
- If the editor added a new visual effect, update `worker/subtitleRenderer.ts` before treating the story config as production-ready.

Payment finalized but no final job:
- Check Stripe webhook logs.
- Check `/api/orders/stripe-confirm` fallback.
- Check `finalizeOrderPayment()` errors.
- Check `cart_items` linked to the order.
