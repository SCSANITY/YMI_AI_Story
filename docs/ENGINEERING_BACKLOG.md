# Engineering Backlog

Last triage: 2026-08-27

This file is the only authority for work deliberately carried beyond the
current issue cycle. Every item is deferred and non-blocking unless the owner
explicitly promotes it into a numbered issue. Before implementation, verify the
problem still exists in live code and current infrastructure.

Anything not listed here must not be resurrected from an old review or issue
log without new evidence.

## Product And Operations Tracks

### V2 story migration and provider rollout

- Continue the independent story-migration pipeline for remaining books:
  structured page assets, `config.json`, and `subtitle-template.json`.
- Resume T3-019 Worker provider hardening before a real RunPod E2E.
- Run the targeted Provider E2E only after a migrated story package is ready.
- During that Provider E2E, verify that the wired RunPod
  `/cancel/{runId}` request reaches a terminal cancelled state and confirm from
  provider evidence whether GPU billing actually stops. The current code logs a
  cancellation failure but cannot prove provider-side billing behavior.
- Keep Mock Worker available for website/order/Admin regression testing.
- Printer-specific automation remains deferred until the print vendor supplies
  final bleed, crop, naming, order, DPI, and package requirements.

### Consent and child-media governance

- Raw face-media retention remains deferred. Signature Voice binding and delete
  protection are deployed; do not bypass those guards in future cleanup work.
- **Signature Voice post-delivery retention executor - due before the first Signature Voice physical
  book is delivered.** Implement and operationally monitor durable cleanup sweeps for (a) a bound
  source sample at the later of 180 days after delivery or 30 days after the last related support or
  dispute case closes, and (b) generated narration tracks 24 months after delivery. Reuse the
  existing private-object cleanup outbox and recheck current bindings/holds before deleting bytes.
  The existing 30-day unbound-sample, replacement rollback, and staging cleanup paths do not fulfil
  these two published commitments. Assign an Engineering/Operations owner when this item is promoted.
- Finalize the RunPod DPA and verify provider retention/deletion behavior.
- Disable, replace, or explicitly approve the RunComfy path that transmits a
  Supabase signed face-image URL; treat it as a bearer credential.
- Define the lifecycle for public Preview share links. The nullable
  `preview_share_links.expires_at` field is currently neither populated nor
  enforced by the public page, metadata/API, or image route; choose deliberate
  persistence or enforce expiry/revocation consistently across every reader.
- Replace or explicitly approve long-lived personalized media URLs embedded in
  transactional email. The customer PDF link currently expires after 24 hours,
  while personalized cover thumbnails can carry a one-year Supabase bearer URL.
  A YMI-controlled token/proxy should be evaluated for revocation, access audit,
  and fresh short-lived Storage signing without weakening the delivery UX.

### Advertising tracking go-live

- Meta browser Pixel v1 is technically complete and production-verified. Use
  `docs/META_ADS_GO_LIVE_ALIGNMENT_BRIEF.md` as the sole Meta pause/resume
  handoff; do not repeat the implementation or full-funnel work on resume.
- Resume only after company/finance/marketing coordination is ready to supply a
  payment method, two internal full-access administrators, reduced freelancer
  permissions, Page/Instagram assignments, geography, budget, creative, landing
  URL, and launch timing.
- Keep Automatic Events, automatic page/product detail collection, Automatic
  Advanced Matching, and no-code event tracking off. These are child-data
  privacy restrictions, not optional launch optimizations.
- A dormant `Conversions API System User` and `Conversions API Application`
  exist with a pending connection. No Server events are active. Leave them
  untouched until CAPI is promoted as a separate consent-gated project.
- GA4 enablement and its own network inspection remain separate from the
  completed Meta browser Pixel v1 work.
- Build YMI-owned first-party analytics as a separate future product line; do
  not infer business truth from intentionally coarse GA4/Meta events.

### Worker cloud cutover (Render)

- Deferred intentionally. The local worker at `Web/worker` remains the active worker path and keeps
  full dev/test/prod capability; Render is the likely future production host when this resumes.
- Locked decisions: Render Background Worker; region US East (Ohio acceptable); same GitHub repo as
  the web app (`SCSANITY/YMI_AI_Story`); first deploy must set `WORKER_POLL_ENABLED=false`;
  production deploy uses `WORKER_POLL_ENABLED=true` and `WORKER_EXECUTION_MODE=provider`; do not create a
  second worker source - root `worker/` is the active location; RunPod Docker assets stay in their
  existing separate repo and are out of scope.
- Resume checklist: confirm Render account/payment approval; re-decide the exact Git/Render source
  boundary, because `ymi-books-web-1.0/worker` was intentionally removed during preview-chain
  cleanup; copy production worker env vars from the local profile with polling disabled; confirm the
  dry-run logs show correct worker id, poll disabled, provider mode, job types, Supabase host and lease
  settings; stop local production polling before enabling Render polling; switch
  `WORKER_POLL_ENABLED=true`; validate one preview job; validate one full final job through
  `final_job_pages -> final_jobs.review_pending -> Admin release -> releaseFinalJob() -> final
  delivery email`; only then retire the local worker as production.
- Blocked on owner/boss approval, not on engineering.

## Engineering Cleanup

### Backend latency and performance

- Re-measure production behavior before structural optimization. If cross-region
  database round trips still dominate, evaluate a single order-detail RPC,
  deliberate server/ISR catalog rendering, and Vercel/Supabase region alignment.
- Do not revive the June 2026 performance plan from Git history without current
  measurements; its low-risk P0/P1 work is already implemented.

### Interaction architecture continuation

- Continue decomposing heavy client pages only when a measured interaction
  problem justifies the slice.
- Preserve existing island boundaries and avoid behavior changes during a pure
  performance refactor.

### Hero video encoding

- Re-encode the current large hero video from the best available master.
- Target materially smaller bytes while preserving visible quality and
  `faststart`; verify on mobile and desktop before replacement.

### Static catalog fallback cleanup

- `data/books.ts` is static metadata / `generateStaticParams` support only.
- Remove or neutralize stale image URL fields that can point at non-existent
  `cover-normalized.webp` objects.
- Keep the database catalog as the runtime cover authority.

### Homepage banner draft cleanup

- Add a bounded cleanup for abandoned objects under the Admin banner upload
  prefix.
- Never delete a path referenced by a currently published desktop or mobile
  banner slot.

### Preview pipeline cleanup

- Consolidate duplicated preview-cover extraction behind one helper.
- Consolidate duplicate Preview polling schedules if both still exist.
- Avoid downloading the same subtitle base template twice when verified safe.
- Deduplicate template-cover resolution in Personalize.
- Centralize private-bucket path prefixing for Final jobs.
- Add a bounded sweep for uploaded raw blobs that never receive a database row.
