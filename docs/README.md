# YMI Story Documentation

Last reset: 2026-08-27

## Start Here

1. [Current Codex handoff](./Codex/CONVERSATION_HANDOFF_2026-07-09.md)
2. [Fourth-round active ledger](./FOURTH_ROUND_INTERNAL_TEST_ISSUE_LOG.md)
3. [Engineering backlog](./ENGINEERING_BACKLOG.md)

These three files are the current operating context. Live code and the live
Supabase schema override documentation when they disagree.

## Active Specialized References

- [Meta Ads technical pause/resume handoff](./META_ADS_GO_LIVE_ALIGNMENT_BRIEF.md)
- [V2 book-page completion plan](./V2_BOOK_PAGE_COMPLETION_PLAN.md)
- [V2 story authoring workflow](./V2_AUTHORING_WORKFLOW.md)

Older round ledgers, review briefs, migration plans, and architecture snapshots
were removed after their durable conclusions were consolidated into the current
handoff and backlog. Git history remains the audit trail when historical detail
is genuinely needed.

## Maintenance Rules

- Never document API keys, service-role keys, webhook secrets, database direct
  credentials, private Healthchecks URLs, or private signed asset URLs.
- Keep Mock and real provider workflows explicitly separated.
- Put durable deferred work only in `ENGINEERING_BACKLOG.md`.
- Remove transient review concerns after closure rather than carrying them into
  the next issue.
- Commit documentation changes only when the owner asks or when they are part of
  an explicitly approved documentation consolidation.
