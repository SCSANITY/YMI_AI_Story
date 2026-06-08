# YMI Story Project Documentation

Last updated: 2026-06-05

This `docs/` directory is the current source of truth for the YMI Story full-stack application. It replaces the temporary takeover scan document and the older scattered overview notes.

## Document Map

- [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md)
  - Product scope, codebase layout, system modules, data/storage model, and external integrations.
- [PRODUCTION_FLOW.md](./PRODUCTION_FLOW.md)
  - Canonical end-to-end flow from user upload to final PDF delivery, including worker per-image processing.
- [OPERATIONS_RUNBOOK.md](./OPERATIONS_RUNBOOK.md)
  - Local development, worker operation, environment contracts, deployment checks, monitoring, and verification commands.
- [PROJECT_STATUS_AND_ROADMAP.md](./PROJECT_STATUS_AND_ROADMAP.md)
  - Current development state, completed work, known risks, and next tasks.
- [PERFORMANCE_AUDIT_2026-06-04.md](./PERFORMANCE_AUDIT_2026-06-04.md)
  - Frontend performance audit, completed optimizations, remaining bottlenecks, and follow-up measurement plan.
- [INTERNAL_TEST_PREP_PLAN.md](./INTERNAL_TEST_PREP_PLAN.md)
  - Short-term internal-test preparation tracker. This is a temporary phase document and can be archived or merged into the roadmap after internal-test preparation is complete.

## Maintenance Rules

- Do not put API keys, service-role keys, webhook secrets, or private Healthchecks URLs in docs.
- Treat Supabase cloud project `pgpaawqgtewowjratddm` as the current production project unless this changes explicitly.
- Keep local/mock workflows clearly separated from production RunPod workflows.
- When changing a major flow, update both architecture and production-flow docs in the same task.
- When adding a new external service, update the architecture integration list and the runbook env checklist.
