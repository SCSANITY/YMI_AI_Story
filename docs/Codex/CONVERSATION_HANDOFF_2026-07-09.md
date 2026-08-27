# YMI Story Current Codex Handoff

Last reset: 2026-08-27

This compatibility path remains the required startup document for a new Codex
conversation. Its contents, not the date embedded in the filename, are current.

If this document conflicts with live code or the live Supabase schema, inspect
the implementation and schema before acting. Do not infer runtime facts from an
old issue narrative.

## 1. Working Model

YMI Story is a personalized children's storybook platform spanning catalog,
Customize, generated Preview, Cart, Stripe Checkout, customer Orders and My
Books, Worker generation, Admin review/release, email, and operational tooling.

The collaboration model is:

- The owner reports one issue and makes product decisions.
- Codex is the primary implementation engineer and architecture partner.
- Codex inspects the live code/schema, implements a focused fix, verifies it,
  and prepares a concise review handoff.
- Claude Code independently reviews the slice.
- In Claude's fenced `-> Codex` block, only `BLOCKING` gates the current slice.
  `CARRY-FORWARD` items are acted on only when they name an accepted future
  slice or are deliberately promoted to the engineering backlog.
- The owner performs runtime acceptance where visual or operational evidence is
  required.
- Documentation is not committed by default unless the owner asks.

Do not reopen a completed issue because an old review paragraph contains words
such as `Returned`, `Pending`, `Ready for review`, or `still owed`. The current
ledger status and this handoff supersede those historical intermediate states.

## 2. Workspace Boundaries

```text
Workspace:       D:\IT_David\Program\Voice Imagination\Web
Next.js app:     D:\IT_David\Program\Voice Imagination\Web\ymi-books-web-1.0
Worker:          D:\IT_David\Program\Voice Imagination\Web\worker
Story packages:  D:\IT_David\Program\Voice Imagination\Web\Template_folder
Subtitle editor: D:\IT_David\Program\Voice Imagination\Web\subtitle-template-editor-app
```

- The root `worker/` is the active Worker source.
- `Template_folder` is intentionally outside the app Git repository. It contains
  story assets, operational SQL, and local Storage backups.
- Supabase project `pgpaawqgtewowjratddm` is the current live project unless the
  owner explicitly changes it.
- Never place secrets, webhook values, direct database credentials, or private
  signed URLs in documentation.

## 3. Current System Baseline

- Next.js App Router is deployed on Vercel.
- Supabase provides PostgreSQL, Auth, and Storage.
- Stripe Checkout and webhooks own payment completion.
- Resend owns application email transport and inbound webhook delivery.
- Admin covers Final Review, Orders, Support, General Mail, KOL partnerships,
  catalog pricing, banners, discounts, legal content, and service controls.
- The V2 page contract uses structured single-page assets. Mock Worker, Admin
  release, customer PDF, Reader, and downstream order flows were proven end to
  end with BirthdayGirl and Forest.
- Real RunPod provider work remains deliberately isolated from normal website
  UAT until the remaining story packages are migrated and provider hardening is
  resumed.
- Homepage banners are database-published through exactly three fixed anchors.
- Catalog package prices and merchandising are database-authoritative and
  Admin-managed.
- Customer-facing legal pages use the shared published-content boundary.
- Meta browser Pixel v1 is consent-gated, production-verified, and technically
  ready. Organizational launch inputs remain paused in the dedicated Meta
  handoff. GA4/Google Ads remain unconfigured and disabled as a separate future
  project.
- Root-domain inbound email is routed through Resend; Support/KOL case aliases
  and General Inbox are separate product boundaries.
- Signature Voice S1-S7 is deployed. It supports child or adult capture under a
  versioned authorization, authoritative Creation binding, private source and
  narration assets, Admin triage/replacement, 15 logical narration slots, and
  Print/shipment gates. Privacy Policy `2026-08-27-v2` is published. The first
  production smoke test and the post-delivery retention executor remain the
  only explicit operational follow-ups.

## 4. Current UX And Architecture Rules

- Preserve island boundaries and keep mutation/loading state local to the
  component that owns it.
- Database state is authoritative for payments, ownership, release state,
  pricing, and operational records. Client state owns responsive UX only.
- Customer-visible titles use personalized display-title helpers; never expose
  raw template identifiers such as `Food_Story`.
- User-variable collections use `no-store`. Public slow-changing catalog and
  policy surfaces may use deliberate server/CDN caching.
- Do not send child names, photos, audio, creation IDs, order IDs, share tokens,
  emails, addresses, or raw private URLs to advertising vendors.
- Browser-translated navigation that is covered by the translation guard must
  use a full-document transition, not an unsafe SPA transition.
- Supabase Storage images should not consume the Vercel image optimizer unless
  a later measured decision explicitly changes that policy.
- Preview may fail visibly; Final production may enter the approved manual
  fulfilment path. Never report a fake successful artifact.
- Admin UI should be dense, scannable, mobile-usable, and free of instructional
  prose that substitutes for interaction design.

## 5. Latest Accepted State

The following current tracks are closed in the active ledger or pushed history:

- T4-001 Homepage Banner Publishing.
- T4-002 Admin typography, glass surfaces, and communication workspaces.
- T4-003 Admin login routing and production console identity.
- T4-004 Admin Final Review and Orders operations UX.
- T4-005 catalog public-package bulk apply and storefront synchronization.
- T4-006 professional Support/KOL reply identities.
- T4-007 General Inbox multi-mailbox foundation and workspace.
- T4-008 Checkout Back recovery after Stripe cancellation.
- T4-009 Personalized preview covers across purchase surfaces.
- Customize consent authority consolidation and concise required copy.
- Loading Preview Back cancellation and stacking-layer correction.
- Hero product-highlight bubble interaction.
- Signature Voice S1-S7 end-to-end fulfillment and authorization.

Latest pushed commit at this reset: `71e179a` (`Refine catalog and consent
copy`).

There is no active Claude review blocker and no active issue implementation.
The next owner-reported fourth-round issue should use the next available T4
number in the active ledger.

## 6. Explicit Deferred Work Only

The only work allowed to survive this reset is listed in
`docs/ENGINEERING_BACKLOG.md`. In particular:

- Remaining V2 story migration and later RunPod provider hardening/E2E.
- Signature Voice post-delivery retention execution before the first physical
  Signature Voice delivery.
- Consent and child-media governance work explicitly listed in the backlog.
- Meta organizational launch inputs, separate GA4/Google Ads enablement, and
  first-party analytics as distinct future product lines.
- Explicit non-blocking engineering cleanup already recorded in the backlog.

All other old concerns, review questions, intermediate blockers, proposed
follow-ups, and unverified possibilities are closed and must be rediscovered
from current evidence before becoming work again.

## 7. Dirty Worktree Discipline

The General Inbox composer, Signature Voice implementation, Hero update, and
latest catalog/consent copy are committed. At this reset only the approved
documentation consolidation is expected to be dirty. Always inspect
`git status`, stage an explicit file list, and verify the staged diff before
committing.

Do not revert owner or Claude changes that are unrelated to the current issue.

## 8. New Issue Template

Use this shape for the next entry:

- `## T4-XXX - <title>`
- `Status: In progress`
- `Feedback:` owner-observed behavior.
- `Root cause:` verified full-stack cause.
- `Implementation:` focused change.
- `Files:` exact paths.
- `Verification:` tests and runtime evidence.
- `Review direction for Claude Code:` highest-risk contracts.
- `Claude review:` Claude appends the authoritative `-> Codex` block.
