# T3-025 M6 Pre-Cutover Rehearsal

Status: live rehearsal completed; M7 remains owner-gated
Date prepared: 2026-08-11

## Boundary

M6 proves the production application, Supabase schema, Resend transport, one
signed webhook, and Admin surfaces before root mail moves away from Webmail.
It uses the Resend-managed `*.resend.app` receiving domain. It does not enable
Receiving on `ymistory.com` and does not add, remove, or reprioritize root MX.

M6 is not complete because code builds or unit tests pass. It completes only
after the live evidence matrix below passes and the owner approves M7.

## Read-Only Baseline

Captured on 2026-08-11 before any M6 provider action:

- M5 webhook ledger and provider lifecycle columns return HTTP 200 from the
  app's configured Supabase project.
- Resend contains one custom domain: `ymistory.com`, verified in `us-east-1`.
- Sending is enabled; root Receiving is disabled.
- Open and click tracking are both disabled.
- Resend has zero registered webhook endpoints.
- Root MX is still `5 mail.ymistory.com`.
- Root nameservers remain `ns1.hostingww.com`, `ns2.hostingww.com`, and
  `ns3.hostingww.com`.
- Root SPF remains
  `v=spf1 a:mail.hostingww.com mx include:mail.hostingww.com -all`.
- DMARC remains `v=DMARC1; p=none;`.
- `send.ymistory.com` remains the Resend/SES feedback route. Its MX, SPF, and
  `resend._domainkey` records must not be edited during Receiving work.
- The live resolver returned roughly 8,400 seconds remaining on the root MX
  record, which suggests the current configured TTL may be 8,640 rather than
  the historical M0 value of 86,400. The owner must record the exact DNS-panel
  TTL before M7. M6 does not change it.
- Local Vercel CLI authentication is expired. Production env inventory must be
  done in the Vercel dashboard or after an explicit `vercel login`; no current
  production value is inferred from local snapshots.

## Deployment Preparation

Before provider configuration:

1. Obtain explicit owner approval to commit/push the M1-M6 application changes.
2. Deploy the reviewed code after M5 SQL. The unified webhook route remains
   inert while its signing secret is absent.
3. Confirm the production deployment exposes:
   - `/api/webhooks/resend`
   - `/api/internal/email/inbound/process`
   - `/admin/support`
   - `/admin/inbox`
   - `/admin/emails`
4. Confirm Production env already has the normal Supabase, Resend API,
   `INTERNAL_API_SECRET`, and `CRON_SECRET` values. Never paste their values into
   this document or the issue ledger.

The deployment adds a once-daily Hobby-compatible recovery invocation at
`00:30 UTC` and gives both the webhook and recovery functions a 60-second
budget. The normal path still processes each accepted message immediately;
the daily job is a stale-work safety net. Admin alerts and the protected manual
recovery endpoint remain the faster operational recovery tools.

## Resend-Managed Test Domain

1. In Resend, open Emails, then Receiving.
2. Open the Receiving-address menu and record the assigned
   `<account-id>.resend.app` domain.
3. Do not enable Receiving on the `ymistory.com` domain detail page.
4. Set Vercel Production `SUPPORT_INBOUND_DOMAIN` to the assigned managed
   domain, without `@` or a local part.
5. Set Vercel Production `EMAIL_FROM_SUPPORT` to a branded
   `support@ymistory.com` identity. This changes the outbound identity only;
   replies in M6 still target the managed Receiving domain.

## One Webhook

After the code route is deployed:

1. Create exactly one Resend webhook endpoint:
   `https://www.ymistory.com/api/webhooks/resend`.
2. Select only these events:
   - `email.received`
   - `email.sent`
   - `email.delivered`
   - `email.delivery_delayed`
   - `email.bounced`
   - `email.complained`
   - `email.failed`
   - `email.suppressed`
3. Do not select `email.opened` or `email.clicked`.
4. Copy the endpoint signing secret into Vercel Production as
   `RESEND_WEBHOOK_SECRET`.
5. Redeploy so the Production function receives the new secret.
6. Do not expose the secret in screenshots, logs, chat, or documentation.

## Strict Preflight

After authenticating Vercel CLI, pull Production env to a temporary ignored
file, run preflight, then delete the file:

```powershell
npx vercel env pull .env.m6.production --environment=production --yes
npm run email:m6:preflight -- --strict --env-file .env.m6.production --base-url https://www.ymistory.com --inbound-domain <managed-domain>.resend.app
Remove-Item -LiteralPath .env.m6.production
```

Strict preflight must report zero failures. It proves:

- M5 schema is present;
- root MX still points only to Webmail;
- root Receiving and sensitive tracking remain disabled;
- exactly one enabled webhook has the required event set;
- the endpoint matches the production deployment;
- the managed test domain is not the root domain;
- webhook and recovery routes are deployed; and
- the recovery endpoint rejects an unauthenticated call.

## Live Rehearsal

Use one run id such as `M6-20260811-A`. Record IDs and timestamps, but no message
body containing real customer or child data.

### A. Direct Support

1. From an external mailbox, send plain text to
   `support@<managed-domain>.resend.app`.
2. Use subject `[M6-20260811-A] Direct Support`.
3. Verify one Support ticket appears with the correct sender, timestamp, and
   safe text body.
4. Refresh and replay the Resend webhook once. Verify no duplicate ticket or
   message appears.

### B. Reply Thread

1. Reply from Admin Support.
2. Verify the external mailbox receives mail From `support@ymistory.com` and a
   dynamic `ticket-...@<managed-domain>.resend.app` Reply-To.
3. Reply from the external mailbox and change the visible subject.
4. Verify the reply appends to the same ticket and does not create a new ticket.
5. Close the ticket, reply again, and verify the existing ticket reopens.

### C. General Inbox And Recipient Policy

1. Send to `admin@<managed-domain>.resend.app`; verify one General Inbox item.
2. Send to `orders@<managed-domain>.resend.app`; verify it remains General
   Inbox unless server-owned continuation evidence exists.
3. Send to an unknown local part; verify a minimal rejected envelope exists and
   no body or attachment is imported.
4. Reply to the `admin@` item from Admin and verify the outbound recipient,
   sender identity, Reply-To, and thread headers are server-derived.

### D. Attachments

1. Send one small PDF and one PNG with the Direct Support or General Inbox test.
2. Verify both show as stored and downloadable only while authenticated as
   Admin.
3. Copy the same-origin `/api/admin/inbox/attachments/.../download` request URL
   from the browser network panel. Open it in a signed-out browser and verify
   access is rejected.
4. Confirm the authenticated response downloads the file rather than rendering
   sender HTML or executable content inline, and never exposes a Storage signed
   URL to the client.

### E. Provider Lifecycle

Use only Resend's designated test recipients. The command refuses to send
without `--confirm` and is idempotent for the same run id and event:

```powershell
npm run email:m6:delivery-probe -- --confirm --env-file .env.m6.production --run-id M6-20260811-A --event delivered
npm run email:m6:delivery-probe -- --confirm --env-file .env.m6.production --run-id M6-20260811-A --event bounced
npm run email:m6:delivery-probe -- --confirm --env-file .env.m6.production --run-id M6-20260811-A --event complained
npm run email:m6:delivery-probe -- --confirm --env-file .env.m6.production --run-id M6-20260811-A --event suppressed
```

Verify each `email_events` row receives the corresponding provider lifecycle
without changing its application-owned send state. Confirm no open/click event
appears. Remove the temporary env file after all probes.

### F. Authorization And Recovery

1. Signed-out access to Admin Support, Inbox, Email Events, and attachment APIs
   must fail closed.
2. Admin access must show the new records without exposing private Storage paths.
3. Invoke the protected recovery endpoint once with its secret and verify both
   inbound and delivery backlog results are returned.
4. Confirm Admin Email Events shows no failed, stale, or pending-match event for
   the run after recovery.

## Evidence Matrix

| Proof | Required result | Result |
| --- | --- | --- |
| Strict preflight | Zero failures | Passed: 16/16, zero warnings |
| Direct Support | One ticket, no replay duplicate | Passed |
| Multi-turn reply | Same ticket; changed subject safe | Passed |
| Closed reply | Existing ticket reopens | Passed |
| General Inbox | `admin` and `orders` visible | Passed |
| Unknown recipient | Minimal reject, no content import | Passed |
| Attachments | Stored, Admin-only download | Passed after authenticated proxy fix |
| Delivered event | Provider status `delivered` | Passed |
| Bounce event | Provider status `bounced` | Passed |
| Complaint event | Provider status `complained` | Passed after priority guard |
| Suppression event | Provider status `suppressed` | Passed |
| Open/click | No events | Passed: zero events |
| Recovery | No failed/stale/pending match remains | Passed: zero backlog failures |
| Admin authorization | Signed-out access rejected | Passed |
| Root MX after rehearsal | Still `5 mail.ymistory.com` | Passed |

Live evidence is retained in Supabase under run id `M6-20260811-A`. The
rehearsal found and closed two blocking defects before cutover: attachment
downloads now proxy bytes through the authenticated Admin route instead of
exposing a Storage signed URL, and provider lifecycle reconciliation now makes
event priority authoritative so a later low-priority delivery event cannot
downgrade a complaint. Application-owned send status remained `sent` for all
four provider probes.

## M6 Rollback

M6 does not modify root DNS, so DNS rollback is not needed.

If the rehearsal fails:

1. Disable or delete the single Resend webhook.
2. Remove the M6 managed-domain value from `SUPPORT_INBOUND_DOMAIN` or restore
   its reviewed pre-M6 value.
3. Remove `RESEND_WEBHOOK_SECRET` from Production if no other reviewed endpoint
   uses it.
4. Redeploy the last known-good application version.
5. Leave `ymistory.com` root Receiving disabled and root MX on Webmail.
6. Preserve database evidence for diagnosis; do not delete failed envelopes or
   webhook events merely to make Admin look healthy.

M7 remains blocked until every evidence row passes, the exact DNS-panel TTL and
old MX values are recorded, Webmail history/alias decisions are complete, and
the owner explicitly approves the cutover window.
