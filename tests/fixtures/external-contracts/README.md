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
- `SHA256SUMS` records the source byte identity at capture time.

The fixtures let this repository's contract suite run from an isolated clone.
When an upstream SQL or Worker contract changes, update the affected fixture and
its checksum in the same coordinated change. Never edit a fixture as though it
were the production migration or active Worker implementation.
