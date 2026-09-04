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
- `SHA256SUMS` records the repository-normalized UTF-8/LF identity of every
  fixture and this README, so the same manifest verifies on Windows and Linux.

The fixtures let this repository's contract suite run from an isolated clone.
When an upstream SQL or Worker contract changes, update the affected fixture and
its checksum in the same coordinated change. Never edit a fixture as though it
were the production migration or active Worker implementation.
