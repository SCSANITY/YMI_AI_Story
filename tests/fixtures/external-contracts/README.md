# External Contract Fixtures

These files are immutable test snapshots, not executable migration history and
not a second Worker source.

- `sql/<name>` was copied byte-for-byte from
  `Web/Template_folder/<name>` on 2026-08-31.
- `worker/<name>` was copied byte-for-byte from `Web/worker/<name>` on
  2026-08-31.
- T4-016 refreshed `worker/index.ts` and added `worker/workerRuntime.ts`
  byte-for-byte from the active Worker on 2026-09-01. The related database SQL
  remains an unexecuted governance proposal and is intentionally not represented
  here as a live Supabase contract.
- T4-019 refreshed `worker/bookPageContract.ts` and `worker/index.ts`
  byte-for-byte from the active Worker on 2026-09-02 for the V3 Final delivery
  contract: one standalone front cover plus thirty interior leaves.
- T4-025 added the proposed database migration that removes the customer-facing
  10-20 second capture review while preserving positive server-derived duration
  and every upload, owner, authorization and binding control. It is a pending
  external contract until the database migration ledger records production
  application.
- WC-001 refreshed the Worker execution snapshots from private Worker commit
  `683fe5d` and added the queue-orchestration migration from private Database
  commit `bb81394` on 2026-09-04. The snapshots include the provider adapter and
  its input contract so lease handoff and RunPod request recovery remain
  testable from an isolated Web clone. The migration fixture is not evidence
  that production SQL was executed; it pins the typed claim, locked owned
  lease/checkpoint, and atomic queue admission contracts that the Web and cloud
  Worker are being prepared to use.
- IMG-PROVIDER-PROD-001 P1-C3 refreshed `worker/index.ts` byte-for-byte from
  private Worker commit `fefae2b7b464501e79d3469ed2875e13b3c07e50` on
  2026-10-05. It pins the reviewed private-config Preview wiring, fixed failure
  boundary and pre-intent input validation used by the Web confidentiality
  contract; it is source evidence, not proof of production deployment.
- IMG-PROVIDER-PROD-001 P1-E1 added
  `worker/image-edit-acceptance-corpus-v1.json` byte-for-byte from Worker
  candidate `04faa0917d048af32aaf1ea1d7e11c07f16eb587` on 2026-10-06. Its 45
  cases are the shared Web/Worker acceptance authority for the private
  `image_edit` contract and pin both strict failures and the two currently
  tolerated unknown-key outcomes. It includes a deliberate do-not-publish
  Prompt marker and is test evidence only, never a story publication candidate.
- IMG-PROVIDER-PROD-001 P1-E3 NEW-API-KEY-MIGRATION refreshed
  `worker/index.ts` and `worker/workerOrchestration.ts`, and added
  `worker/privateConfig.ts` plus `worker/supabaseCredentials.ts`, byte-for-byte
  from local-only Worker candidate
  `941992419ee88f9938cbf668f3e953226cc2c145` on 2026-10-07. These fixtures
  pin the legacy service-role and new `sb_secret_` compatibility boundary,
  including apikey-only private reads and Realtime access-token suppression;
  they are review evidence, not proof of deployment or key creation.
- LG-001 added `20260916_173000_lg_001_shipping_details.sql` from the private
  Database logistics branch on 2026-09-16. It pins the service-only atomic
  logistics save, lease and guarded sync contracts. This source-reviewed
  snapshot is not evidence of production application.
- DEDICATION-001 added `20260922_080000_dedication_001.sql` from private
  Database draft commit `715de755274080f7b6b058f726b2e99991e397e6` on
  2026-09-22. It pins the service-only creation choice, checkout-line snapshot,
  edit/session guard and order preparation contracts. It is **not** evidence
  that the migration was applied or authorized for production.
- UX2-019 added
  `20260925_130000_ux2_019_preview_purchase_independence.sql` byte-for-byte
  from private Database candidate commit
  `5ca93e6b2697d3764e4df7d8481767a5427594ab` on 2026-09-25. The un-applied
  candidate was superseded by UX2-020 before release and has no current runtime
  consumer. It remains checksum-registered historical review evidence only; it
  is **not** a live contract, a migration dependency, or evidence of production
  application or authorization.
- UX2-020 added
  `20260925_143000_ux2_020_creation_version_fork.sql` byte-for-byte from private
  Database candidate commit `4ce796c58e7fd2efd99db89c923f15f03d2981a0` on
  2026-09-25. It pins the service-only, owner-scoped and idempotent durable
  Creation/Preview Job fork used by Change Photo. It is the sole planned
  UX2-020 release migration, but this fixture is **not** evidence of production
  application or authorization.
- `SHA256SUMS` records the repository-normalized UTF-8/LF identity of every
  fixture and this README, so the same manifest verifies on Windows and Linux.

The fixtures let this repository's contract suite run from an isolated clone.
When an upstream SQL or Worker contract changes, update the affected fixture and
its checksum in the same coordinated change. Never edit a fixture as though it
were the production migration or active Worker implementation.

- Preview-first Web candidate refresh (2026-10-13): existing Worker mirrors and
  previewExecution.ts pin accepted private Worker cfe057e318b54ddd7711e78b780ccca4e29fcd8e;
  they are future cutover contracts, not current deployed runtime proof.

- Preview-first manual Final state proposal pins private Database
  1cb15ca52fc2c71feb4c90f7e086ca1f095e3a5f, 20261013_200000_preview_first_manual_final.sql.
  Source-only/not applied; no claim/ACL/RLS/data change.

Step1 central-runtime mirrors pin Workercfe057e318b54ddd7711e78b780ccca4e29fcd8e.
imageEditRuntime.ts and config/image-edit-runtime.json are test-only exact evidence,
never imported by Web production code or a second selected-profile authority.
Story content contract is version2; corpus metadata is version2 with45 vectors.

Step4 current integration mirrors (2026-10-14) pin exact Worker 698b606dd62b6ff5a80dfee1813395c3223af39f.
The selected runtime is owner-approved Sunburst dated / medium / 1024x1024
PNG/opaque180000ms; selected.final remains null. imageEditRuntime.ts and central
JSON are checksum-bound TEST evidence only, never a Web production authority.
Database migration stays exact1cb15ca/proposed/not applied; no application code
or dependency was changed by this mirror refresh. Historical pins above remain
review provenance, not the current upstream fixture identity.

- WEB-UIUX-001/07-B adds `sql/20261021_120000_web_uiux_007_materials.sql`
  byte-identical to private Database53f0fed643fd4aad4d70f22f795a637f0985a7fd.
  The returned07-B payment-order defect is repaired;owner2026-10-21 removes grant
  TTL while retaining48h dedication edits and existing OTP expiry.
  Offline/unapplied foundation only;07-C reader/purchase/mail/print integration
  and independent review/T2 authorization are required before any live action.

- WEB-UIUX-001/07-C adds `sql/20261021_140000_web_uiux_007_print_materials.sql`
  from private Database5ff4cebe0afb797b1e9d3edfcb5fb3f441a60d61. Offline/not applied;
  wraps retained print authorities with order-lock/revision/deadline fences and
  a service-only historical effective-line read.07-B fixture remains unchanged.

- WEB-UIUX-001/16 adds `20261023_180000_staff_mailboxes.sql` byte-identical
  to Database offline candidate `271729e`. It pins the additive Amy/Justin shared
  mailbox expansion, not production application or deployment authorization.
- PREVIEW-UIUX-001/P0 adds `20261023_150000_preview_version_durable_group.sql`
  from Database `4abe6080943fa8233442299987744a7c29a62530`, byte-identical to
  that Git blob. It freezes the proposed service-only group reader/root quota;
  it is NOT evidence of production application.
- SUPABASE-CPU-001 adds the pending 23-function non-retryable business-conflict repair;
  the byte-exact SQL mirror is not evidence of production execution.

- P0 reconciliation2026-10-25 supersedes the oldab55209 mirror: exact applied
  CPU baseline fingerprint (CRLF retained) and PT409 source conflicts. No retryable
  business conflict is restored;the P0 migration remains NOT APPLIED.

- Mail16 resume2026-10-26 binds exact observed CRLF function bodies without
  normalization;the mirror is offline evidence,not production application.

- WEB-UIUX-001/19 S1 adds `20261026_090000_web_uiux_019_line_voice.sql`
  byte-for-byte from the isolated Database S1 candidate on 2026-10-26.
  It pins paid-line Voice references, production keys and source-revision guards;
  it is OFFLINE, not evidence of application or independent deployment authority.
  S1-S3 must be released together after combined review and owner authorization.

- S1 return corrects Admin replacement to distinct actor/evidence declarations
  (not customer v3 consent), and invalid payment snapshots to empty lines with
  Admin-visible reasons. The unexecuted SQL mirror is refreshed for delta review.

- WEB-UIUX-001/19 S2 adds `20261026_120000_web_uiux_019_customer_voice_updates.sql`
  byte-identical to Database isolated S2. It binds customer CAS/deadline,
  nonrevoking links and the existing queue's provenance/support/shipment boundary.
  It is OFFLINE,not APPLIED or an independent release. S1 bytes stay frozen;
  S3 client/copy and combined T2 review/owner GO remain necessary.

- S2 B1 return refreshes only the SQL mirror:referenced/retained rows cannot
  starve queue batches;unbound expiry preserves provenance deadlines. App bytes
  stay unchanged from cf27d78. This remains OFFLINE pending delta review/S3.

- WEB-UIUX-001/28 S1 adds `20261029_120000_web_uiux_028_safe_removal.sql` from private Database candidate 97f2742. It pins atomic owner-scoped removal, archive share revocation, face reference protection and lookup indexes. OFFLINE / NOT APPLIED; it is not deployment or cleanup-run evidence.

- Issue28 S1 B1 return (2026-10-29): canonical date/job/attempt/page output paths and cancel_requested active-work protection; Web application code unchanged. Source review and synthetic tests do not prove live path shape or production cleanup execution.

- WEB-UIUX-001/28 S3 adds `20261029_160000_web_uiux_028_draft_dedication.sql` from private Database e2879cd. The exact CPU-repaired body loses only its related-order/active-Checkout guard; ownership/content/CAS/PT409 stay. OFFLINE / NOT APPLIED; delivery requires combined review, live preflight and owner GO.
