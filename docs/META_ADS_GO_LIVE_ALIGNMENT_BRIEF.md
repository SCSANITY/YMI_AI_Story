# META ADS GO-LIVE TECHNICAL HANDOFF

Status: BROWSER PIXEL V1 TECHNICALLY COMPLETE - ORGANIZATIONAL GO-LIVE PAUSED

Date: 2026-08-26

This document is the resume point for Meta Pixel and Meta Ads launch readiness.
It records the final owner, Codex, and Claude Code decisions plus the production
evidence collected on 2026-08-26. It is not a campaign approval and does not
replace the project issue ledger.

The browser Pixel v1 architecture, code, deployment, privacy controls, domain
verification, and live funnel verification are complete. Work is intentionally
paused at the organizational boundary: billing, internal account ownership,
freelancer permissions, campaign geography, budget, creative, and launch timing
require company discussion. No further technical work is required to preserve
the current safe small-budget launch capability.

## 1. Objective

Prepare YMI Story to run Meta Ads while preserving these non-negotiable product
boundaries:

- No children's names, photos, audio, personalized titles, creation IDs, raw
  order IDs, share tokens, email addresses, postal addresses, or session IDs may
  enter Meta event payloads.
- No Meta request may occur before positive Marketing consent.
- Admin, maintenance, and tracking-infrastructure routes are not advertising
  surfaces.
- Meta receives coarse funnel facts for advertising measurement. YMI Story's
  detailed first-party analytics remains a separate Supabase-based future system.

The immediate target is a safe small-budget Meta Sales campaign. CAPI and any
form of controlled manual matching are separate future decisions, not
prerequisites for the first test.

## 2. Confirmed Meta Ownership And Assets

Owner-confirmed facts:

- Business Portfolio: `ymi.story`
- Business Portfolio ownership remains with YMI Story.
- Production Pixel / Dataset: `YMI Story Pixel`
- Production Pixel ID: `2598184763964968`
- Ad Account: `YMI Story-Main`
- Owner-reported Ad Account ID: `1079378374776362`
- The Pixel's Connected Assets includes `YMI Story-Main`.
- YMI Story has a company-controlled account with full access and finance
  management access.
- The advertising freelancer has full Business Portfolio access for campaign
  operation. YMI Story retains ownership and visibility of the assets and work.

Owner-side console facts confirmed on 2026-08-26:

- `ymistory.com` is verified in the Business Portfolio through DNS TXT.
- Pixel traffic permissions allow-list contains only `www.ymistory.com`.
- Events Manager identifies production traffic from `www.ymistory.com`.
- `YMI Story-Main` has no payment method and therefore cannot spend yet.
- Billing currency is USD and the billing region is Hong Kong; the business
  name and payment details still require company/finance input.
- A `Conversions API System User` and `Conversions API Application` were added
  on 2026-08-25 and have partial Pixel/Dataset access, but the connection is
  pending and no Server events exist. Treat this as dormant preparation, not an
  active integration.

Still requiring company/marketing confirmation:

- Correct Facebook Page and Instagram account assignments for the campaign.
- At least two company-controlled full-access administrators before reducing
  the freelancer's access.
- Freelancer permissions narrowed to the assets and actions required for ads.
- Campaign geography, approved budget, creative, landing URL, and launch time.

## 3. Production Integration State

Completed and deployed:

- Vercel Production uses `NEXT_PUBLIC_META_PIXEL_ID=2598184763964968`.
- The Pixel runs through one global consent-gated adapter mounted in `AppShell`.
- The Meta runtime is isolated in the first-party route
  `/tracking/meta-frame`.
- The adapter covers customer-facing navigation, including App Router SPA
  transitions. It is intentionally excluded from `/admin`, `/maintenance`, and
  the tracking frame itself.
- Meta's automatic PageView is disabled. YMI Story sends one explicit PageView
  per committed navigation.
- Dynamic routes are reduced to safe route families. Examples:
  - `/personalize/Forest_story` -> `/personalize`
  - `/orders/<order-id>` -> `/orders`
  - `/my-books/<creation-id>` -> `/my-books`
  - `/share/preview/<token>` -> `/share/preview`
- Complete query strings are removed. Unknown routes reduce to `/other`.
- Raw `window.location.href`, raw referrer, document title, and dynamic route
  values are not forwarded.

Operational consequence:

- `fbq` is intentionally not exposed on the top page. A top-console
  `fbq is not defined` result is not an installation test for this architecture.
- Pixel Helper may not reliably report an iframe-isolated installation. A blank
  extension result alone is not authoritative. Events Manager / Test Events and
  network inspection are the accepted verification boundaries.

## 4. Consent And Privacy State

Completed and code-reviewed:

- Consent begins unresolved and therefore denied to every optional vendor.
- Meta is activated only after positive Marketing consent.
- Rejecting Marketing consent produces zero Meta requests.
- Revoking Marketing consent updates Meta to denied and removes reachable Meta
  first-party cookies.
- Events emitted while consent is still resolving are retained only in bounded
  page memory. They are sent after a positive resolution or destroyed after a
  denial.
- The unresolved-consent queue stores the safe page at event time, not the page
  visible when consent later resolves.
- Automatic Events and Automatic Advanced Matching are disabled.
- Automatic Events and Automatic Advanced Matching are a standing prohibition,
  not a launch-phase preference. They must not be enabled by an owner, employee,
  freelancer, agency, or vendor without a new privacy and child-data review.
  Their automatic DOM/form and interaction-context collection is incompatible
  with uncontrolled use on personalization pages that handle children's data.
- This prohibition does not assert that Meta is currently uploading image files;
  the unacceptable risk is enabling uncontrolled automatic collection on these
  pages at all.
- Email/phone manual Advanced Matching is not implemented. Any future controlled
  adult-customer matching design requires a separate legal, privacy, consent,
  minimization, and security decision.
- Conversions API is not implemented. It remains off for the first campaign but
  is not classified as automatic DOM collection; a future server-side design may
  be considered only as a separate consent-gated and deduplicated project.
- The event sanitizer rejects the entire event when it sees an unapproved key or
  invalid value. It does not silently strip an unsafe field and continue.
- Purchase removes the raw order ID before payload construction and uses a
  deterministic, non-reversible transaction surrogate.

Meta may still display IP address and User Agent as browser transport/matching
facts. YMI Story does not manually send email, phone, child, order, or creation
identifiers.

## 5. Event Contract

Meta receives PageView plus six explicit funnel events.

| YMI event | Meta event | Type | Trigger authority | Payload |
| --- | --- | --- | --- | --- |
| Page navigation | `PageView` | Standard | One committed safe navigation | Safe path and controlled title |
| `view_catalog` | `ViewContent` | Standard | Catalog resolved successfully, once per mounted catalog | No product or child identifiers |
| `start_personalization` | `CustomizeProduct` | Standard | New/edit Customize form becomes usable | No book ID, child data, or creation ID |
| `preview_ready` | `PreviewReady` | Custom | Preview assets were successfully applied to the visible preview, once per job | No job ID or image data |
| `add_to_cart` | `AddToCart` | Standard | Cart mutation succeeded | Coarse format only when valid |
| `begin_checkout` | `InitiateCheckout` | Standard | Server order-start succeeded and authoritative item prices reconciled | Item count/format when valid; item subtotal and selected currency when valid |
| `purchase` | `Purchase` | Standard | Server response proves a paid-like order state | Final paid display total, currency, item count/format, surrogate transaction ID |

Amount semantics are intentionally different:

- `InitiateCheckout.value` = merchandise subtotal before shipping and discounts.
- `Purchase.value` = server-confirmed final paid display total after discounts
  and shipping.
- Purchase may be higher, equal to, or lower than InitiateCheckout. The two
  values must not be reconciled as though they should match.

`PreviewReady` remains available as a measured custom event. Creating a Meta
Custom Conversion from it is explicitly deferred until real campaign evidence
shows that it is useful for optimization or audience building.

## 6. Verification Evidence Collected

Production evidence:

- With no Marketing consent, Meta Test Events received nothing.
- Accepting Marketing consent caused an immediate processed PageView.
- Home emitted safe `page_path: /` and controlled title `Home`.
- Books emitted safe `page_path: /books` and controlled title `Books`.
- `/personalize/Forest_story` emitted safe `page_path: /personalize` after the
  redacted-route allowlist fix.
- Revoking Marketing consent prevented further Meta events.
- Events Manager identified the setup as browser/manual and processed the test
  PageViews successfully.
- The complete live funnel produced `ViewContent`, `CustomizeProduct`,
  `PreviewReady`, `AddToCart`, `InitiateCheckout`, and `Purchase` at their
  intended successful boundaries.
- A real low-cost production payment produced exactly one `Purchase` with the
  correct final value and currency plus the non-reversible transaction
  surrogate.
- Stripe cancel/return produced no `Purchase`.
- Refreshing and revisiting the successful confirmation produced no duplicate
  `Purchase`.
- Re-entering Checkout produced a new `PageView` and `InitiateCheckout`, which
  is the intended per-checkout-attempt behavior.
- Event inspection found no child data, email, address, creation/job IDs, raw
  order ID, share token, session ID, or unredacted dynamic/query URL.
- After the production domain allow-list was enabled, explicit PageView and
  funnel events continued to arrive.
- Events Manager Overview lists the explicit events as Active and sourced from
  `Meta pixel`; no Server/CAPI event was observed.

Automated evidence after the funnel implementation:

- Tracking adapter/funnel tests: 9/9.
- Full repository contracts: 181/181.
- TypeScript: clean.
- ESLint: clean.
- Production build: successful with expected static routes preserved.
- Production deployment for commit `d5dc605` reached Ready and is aliased to
  `www.ymistory.com`.

## 7. Live Funnel Gate - Complete

The required positive and negative live sequences below were completed in Meta
Test Events and are retained as the regression checklist for any future tracking
change.

Positive sequence:

1. Open Books and observe `ViewContent`.
2. Open a Customize form and observe `CustomizeProduct`.
3. Generate and visibly load a preview and observe `PreviewReady`.
4. Add the preview to Cart and observe `AddToCart`.
5. Start Checkout and observe `InitiateCheckout` with valid currency/value.
6. Complete a Stripe test payment and observe one `Purchase` with valid
   currency/value and no raw order ID.

Negative Purchase sequence:

1. Enter Stripe and cancel or return without payment; observe no `Purchase`.
2. Exercise a failed or unpaid order result; observe no `Purchase`.
3. Reload or revisit a successful confirmation page; observe no duplicate
   `Purchase` for the same order.

For every future rerun, verify both presence and absence:

- The intended event is present once at the correct successful state.
- No event fires on failed actions or premature clicks.
- No optional request occurs before Marketing consent.
- No child name, photo value, personalized title, email, address, creation ID,
  job ID, raw order ID, share token, or session ID appears in any Meta request.
- Revoke stops subsequent events.

## 8. Landing-Page Integrity - Complete

The previous Home Hero contained unsupported social-proof content:

- Four hard-coded customer quotes and names/locations.
- Decorative gradient circles presented as customer avatars.
- A five-star presentation.
- `#1 Personalized Gift for Kids` without a recorded ranking basis.

It was removed before paid traffic. This closed both a Meta landing-page risk
and a YMI Story brand-integrity risk.

Implemented decision:

- Remove all hard-coded testimonials, names/locations, simulated avatars, and
  star presentation from `Hero.tsx`.
- Do not replace the removed social proof with new copy, cards, badges, or
  objective product facts. The space remains intentionally open.
- The `#1` visual badge and its unused translation content were removed.
- Remove the in-Hero feature-chip group because it duplicates the six-item
  marquee below the Hero. Keep the marquee as the single concise feature strip.
- Before retaining a marquee statement with a concrete number or performance
  claim, verify that the claim is supportable. Replace or remove any statement
  that cannot be substantiated.

The deployed result is a reduced Hero containing the media, headline, and CTA,
followed by one feature strip. No replacement content was invented merely to
fill the vacated area.

## 9. Meta Console State

Completed:

- `ymistory.com` domain verification is green.
- `www.ymistory.com` is the sole Pixel traffic allow-list entry.
- Automatic Events is off.
- Track events automatically without code is off.
- Automatically include more detailed page and product information is off.
- Automatic Website Matching / Automatic Advanced Matching is off.
- First-party cookies remain on inside the positive Marketing-consent boundary.
- Extended attribution uploads, historical conversion uploads, and in-store
  transaction settings remain unused/off.
- Events Manager `Actions` contains two CAPI recommendations rather than an
  event-format, domain, or delivery error. They are explicitly deferred.
- Events Manager shows Browser events only.
- The dormant CAPI system user/application is not a launch dependency and does
  not require cleanup before the first campaign.

Paused organizational checks:

- Add company billing identity and a company-controlled payment method.
- Configure an account spending limit after the campaign budget is approved.
- Confirm Facebook Page and Instagram account assignments.
- Ensure at least two company-controlled people have full Business Portfolio
  access before reducing the freelancer's current full access.
- Replace the freelancer's full portfolio access with the minimum Page,
  Instagram, Ad Account, and Pixel/Dataset permissions required for campaign
  operation; do not grant people, domain, system-user, or payment management
  unless separately approved.
- Confirm `Purchase` is selectable as the campaign conversion event when the
  campaign draft is created.
- Approve geography, budget, creative, landing URL, and launch time.

AEM caution:

- Do not assume the historical "prioritize eight events per domain" workflow is
  a current hard requirement.
- Use the current account UI as authority. If Events Manager explicitly presents
  an AEM/Web Event Configuration action, capture it and configure Purchase as the
  highest business-value event. If the current account has no such action, do not
  create an artificial blocker from an obsolete workflow.

## 10. Readiness Levels

### Level A - Traffic / landing-page test

Complete. PageView is live and consent-gated, the landing-page integrity cleanup
is deployed, and production traffic is limited to the verified production host.

### Level B - Small-budget Sales campaign

Technically ready. The landing page, full funnel, negative Purchase checks,
privacy inspection, domain verification, console privacy settings, and Overview
event activity all pass.

Operationally paused until:

- Company billing identity and a valid payment method are present.
- `Purchase` is selectable in the campaign draft.
- Page/Instagram assignments, company/freelancer access, geography, budget,
  creative, and landing URL are approved.

### Level C - Efficient scaling

Not required for the first campaign. Future decisions include:

- Conversions API with browser/server event deduplication.
- Whether controlled adult-customer manual matching is legally and strategically
  acceptable.
- Whether `PreviewReady` has enough predictive value to justify a Custom
  Conversion after real campaign data exists.
- Match quality, event coverage, attribution, and consent-rate monitoring.

CAPI may recover events lost to browser restrictions, but it is not a bypass for
a user's denied Marketing consent. Automatic Events and Automatic Advanced
Matching remain prohibited even if CAPI is considered later.

## 11. Final Decisions And Pause Boundary

Closed decisions:

1. Remove the unsupported Hero social proof and do not fill the space.
2. Remove the duplicated in-Hero feature chips and retain one verified marquee.
3. Use both positive and negative full-funnel Test Events verification as the
   technical launch gate.
4. Require domain verification as asset-control hygiene. Perform manual AEM/Web
   Event ordering only if the current Meta account UI explicitly requires it;
   `Purchase` is the highest-value event if ordering is requested.
5. Permanently prohibit Automatic Events and Automatic Advanced Matching unless
   a future explicit child-data privacy review reverses this decision.
6. Keep CAPI and controlled manual matching out of the first campaign. Either
   requires a separate future project and approval.
7. Defer a `PreviewReady` Custom Conversion until real campaign evidence supports
   its value.

Pause decision on 2026-08-26:

- Pixel code, deployment, privacy, domain, event, negative-path, and production
  verification work is closed for browser Pixel v1.
- Payment setup is blocked on owner/finance coordination.
- Business Portfolio and freelancer permission changes are blocked on internal
  ownership discussion.
- CAPI remains dormant and is neither required nor to be cleaned up now.
- Campaign geography, budget, creative, Page/Instagram use, landing URL, and
  timing remain commercial inputs owned by YMI Story and its marketing team.

Resume only when the company is ready to complete the organizational launch
gate. At resume, do not repeat the Pixel implementation. Start with this exact
checklist:

1. Confirm two company-controlled full-access administrators and enforce 2FA.
2. Narrow freelancer access without interrupting required campaign assets.
3. Add company billing identity and payment method; set an approved account
   spending limit.
4. Confirm Page/Instagram assignments and create a draft Sales campaign using
   `Purchase` as the final conversion event.
5. Record geography, budget, creative, landing URL, and launch time.
6. Recheck the standing privacy switches, run one short Test Events regression,
   approve the draft, and begin the small-budget launch.
7. Review spend, delivery, attribution, event activity, and account warnings at
   24 and 72 hours.

An EU-focused launch must account for zero Meta signal from users who deny
Marketing consent. A US-first test reduces that specific measurement uncertainty,
but geography remains a commercial decision.
