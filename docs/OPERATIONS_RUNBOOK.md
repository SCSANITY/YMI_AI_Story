# YMI Story Operations Runbook

Last updated: 2026-05-26

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

Environment profile switch:

```powershell
cd "D:\IT_David\Program\Voice Imagination\Web\worker"
.\scripts\use-env-localhost.ps1
# or
.\scripts\use-env-online.ps1
```

Important:
- PM2 reads the current `worker/.env`.
- The profile switch scripts overwrite `worker/.env`.
- Restart PM2 after switching profiles.

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

RPC follow-up command to export definition from Supabase SQL Editor:

```sql
select
  n.nspname,
  p.proname,
  pg_get_function_arguments(p.oid),
  pg_get_functiondef(p.oid)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'claim_next_job';
```

Save the returned function definition into a versioned SQL file, for example:
- `Template_folder/sql_claim_next_job.sql`
- or a future `supabase/migrations/*_claim_next_job.sql` if a migration folder is introduced.

Current known DB fix:
- `Template_folder/sql_jobs_cancel_statuses.sql` has been run in cloud Supabase.
- `jobs.status` accepts `cancel_requested` and `cancelled`.

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

Used for:
- Guest checkout OTP.
- Order confirmation.
- Final delivery email.
- Unpaid reminder emails.

Check before internal test:
- Confirm `RESEND_API_KEY` in Vercel.
- Confirm `EMAIL_FROM` and security/order/delivery sender values.
- Confirm bounce/complaint monitoring owner.

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

Payment finalized but no final job:
- Check Stripe webhook logs.
- Check `/api/orders/stripe-confirm` fallback.
- Check `finalizeOrderPayment()` errors.
- Check `cart_items` linked to the order.
