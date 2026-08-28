# Fourth-Round Internal Test Issue Log

Authoritative reset: 2026-08-25

This is the shared Codex/Claude Code ledger. It was compacted after the completed
T4-001 through T4-007 work because the former file mixed intermediate review
states with final outcomes. Those intermediate `Returned`, `Pending`, and
`Ready for review` markers are no longer actionable.

Current state:

- No active implementation slice.
- No Claude review is waiting.
- No blocking deployment or SQL gate is carried into the next issue.
- Next issue number: **T4-008**.
- Durable deferred work lives only in `docs/ENGINEERING_BACKLOG.md`.

## Closed Issues

### T4-001 - Homepage Banner Publishing

Status: CLOSED

- Home has exactly three database-owned anchors: after Hero, after For Boys,
  and after In Discount.
- Desktop and mobile assets are independently uploaded, previewed, validated,
  and published from Admin.
- Public rendering remains borderless, direct-Storage, and ISR-compatible.
- SQL, code review, deployment, and owner visual acceptance completed.

### T4-002 - Admin Typography, Glass Surfaces, And Communication Workspaces

Status: CLOSED

- Admin typography, independent glass cards, and communication workspace
  presentation were consolidated without merging business state owners.
- Final Review job cards and mail conversation surfaces were visually separated
  and mobile behavior was audited.
- Owner accepted the final presentation.

### T4-003 - Admin Login Must Enter The Operations Console

Status: CLOSED

- Admin login routes authenticated admins into the protected Admin console, not
  the public Home page.
- Production branding and protected role authority remain intact.

### T4-004 - Admin Operations UX Consolidation

Status: CLOSED

- Final Review and Orders now expose clear operational cards, filters, search,
  production snapshots, and explicit cross-navigation without sharing mutation
  ownership.
- Linked Orders is an anchored read-only popover; order detail and PDF/Print
  production views use bounded overlays.
- Tracking changes persist and shipping email behavior was reconciled.
- Duplicate Admin page titles and obsolete explanatory copy were removed.
- S1-S6 passed review and owner runtime acceptance.

### T4-005 - Catalog Public Package Bulk Apply And Storefront Synchronization

Status: CLOSED

- Admin `Apply to all stories` updates the public-card package selection across
  the catalog and reconciles the client state from server-returned template IDs.
- Public catalog caches are invalidated through the existing boundary.
- UI visibility and button styling were corrected and owner-tested.

### T4-006 - Professional Per-Conversation Reply Addresses

Status: CLOSED

- Support and KOL replies use branded, purpose-readable aliases while retaining
  private routing entropy in database-owned tokens.
- The shortened reply-token migration was applied successfully.
- Existing threads remain routable and new addresses use the approved format.

### T4-007 - General Inbox As A Standard Multi-Mailbox Client

Status: CORE CLOSED; COMPOSER UX FOLLOW-UP DEFERRED

- General Inbox has mailbox switching, Inbox/Sent/Drafts/Archived folders,
  database-owned threading, compose/send/reply/reply-all/forward contracts,
  private bounded attachments, safe server-rendered rich text, BCC invariants,
  pagination, and mobile navigation.
- S1-S6 SQL and code slices passed Claude review and were applied/deployed as
  directed.
- The owner explicitly deferred a further Outlook-like composer/runtime UX pass.
  That is one backlog item, not an open blocker on the completed foundation.

## Closed Supplemental Fixes

### Customize Consent Authority Consolidation

Status: CLOSED

- Required content-generation consent remains affirmative and initially
  unchecked.
- `/api/jobs` validates the accepted version and server-stamps acceptance time.
- Optional analytics/marketing authority exists only in global Cookie Settings;
  duplicate Customize controls and payload fields were removed.
- Owner accepted the decision and the resulting UI.

### Loading Preview Back

Status: CLOSED

- Back preserves the Customize draft, exits Loading immediately, and cancels or
  requests cancellation of the active Preview job.
- The Loading overlay is portalled to `document.body`, above the Personalize
  Header, so the visible Back button receives the click.
- Owner runtime verification passed; contracts, TypeScript, lint, and production
  build passed.

## Explicit Deferred Work

No issue-specific carry-forward remains in this ledger. See
`docs/ENGINEERING_BACKLOG.md` for the deliberately preserved future work.


## T3-003 - Meta funnel call-site wiring - Claude review (2026-08-26)

Reviewed against the working tree: `components/BookList.tsx`, `components/PersonalizePage.tsx`,
`app/checkout/page.tsx`, `app/checkout/success/page.tsx`,
`app/checkout/success/CheckoutSuccessCard.tsx`, `src/lib/tracking-policy.ts` and its tests, plus the
new `tests/tracking-funnel-contract.test.mjs`. Confirmed no vendor runtime was added outside the
existing adapter/frame boundary and that no policy, consent version, env var or SQL changed.

Independently re-ran: tracking:tests 8/8, test:contracts 177/177, tsc clean. Matches the report.

All ten review points hold. Where I found the guarantee implemented differently from the way it was
described, I say so rather than just ticking it.

1. ViewContent after a successful catalog resolve - PASS. `BookList.tsx` gates on
   `!hasCatalogResolved || catalogError` and a mount-scoped ref, so an errored catalog cannot emit
   and a re-render cannot double-emit.

2. CustomizeProduct excludes Preview-reader entry - PASS. The guard is
   `!book || viewMode === 'preview' || stage !== 'FORM'`, so arriving at the page through the
   preview reader never counts as starting a personalization.

3. PreviewReady only on a visible asset, deduped per job - PASS, via two different guards that are
   equivalent rather than one shared one. The full path is gated on the boolean return of
   `applyPreviewDisplayAssets`; the partial path calls `trackPreviewReady` unguarded, but it sits
   inside `if (partialPreviewAssets?.coverUrl)`, and `applyPreviewDisplayAssets` returns false only
   when `!assets.coverUrl`. So the partial branch cannot reach the emit without a cover either.
   Worth aligning the two for readability at some point, but it is not a hole.

4. AddToCart only on an authoritative Cart Item - PASS. Emitted inside `if (item)` on the value
   `addToCart` returned. Correctly NOT deduped: adding twice is two genuine events.

5. InitiateCheckout requires checkoutStarted + orderId + items - PASS, with per-orderId dedup
   through a `Set` ref, so the effect re-running on a new `items` array reference cannot re-emit.

6. Purchase status gate - PASS. Explicit allowlist of `paid`, `production`, `shipped`, `delivered`
   through `normalizeOrderStatus`. Unpaid, cancelled and refunded cannot qualify.

7. Purchase carries the server total/currency and a surrogate, never the raw orderId - PASS, and
   structurally so. `emitYmiPurchaseEvent` destructures `orderId` out of the payload before
   spreading, so it is not merely omitted by convention - it is unreachable. The surrogate is a
   SHA-256 of `ymi-transaction-v1:<orderId>` truncated to 32 hex, and `normalizePayloadValue`
   re-validates the `ymi_[a-f0-9]{32}` shape, so a non-surrogate value would fail the sanitizer
   rather than be forwarded. Currency and value come from `display_currency`/`display_total` and are
   re-validated client-side.

8. No prohibited field reaches a vendor - PASS, and this is enforced by construction rather than by
   discipline at the call sites. `sanitizeTrackingEvent` returns `null` on any key outside the
   per-event allowlist, so an accidental `creationId` or `orderId` does not get stripped and passed
   on - the whole event is dropped. Every payload in this slice uses only `format`, `item_count`,
   `currency`, `value`, `transaction_id`.

9. Mixed carts omit format - PASS. `resolveTrackingFormat` returns undefined unless the whole cart
   collapses to a single format, and every call site spreads conditionally
   (`...(format ? { format } : {})`), so the key is absent rather than mislabelled. It also returns
   undefined when any `bookType` is missing, which is the right fail-closed direction.

10. Consent denial/revocation and the Meta-frame protections are untouched - PASS. No change to
    `ConsentGatedTagAdapter.tsx` or `MetaPixelFrame.tsx` in this slice. Re-confirmed the standing
    protections still hold: the pixel only runs inside the same-origin frame, `autoConfig` is off,
    the script loads only after a consent-granted message, `page_location` is rebuilt from a
    normalized origin, `page_referrer` is hardcoded empty, `page_title` comes from a lookup table
    rather than `document.title`, GA is configured `send_page_view: false`, and there is no
    `<noscript>` `facebook.com/tr` image anywhere.

-> Codex

VERDICT: APPROVED (T3-003 Meta funnel call-site wiring, 2026-08-26). All ten points hold. Nothing
blocks. One carry-forward below is a delivery-reliability issue rather than a privacy one, which is
the expected failure direction for this architecture.

BLOCKING: none.

CARRY-FORWARD:

1. A Purchase event emitted before consent has resolved is dropped AND permanently marked as sent.
   `ConsentGatedTagAdapter.tsx:348-351` returns early when `consentRef.current` is null, and the
   `pendingMetaEventsRef` queue only covers the later case where consent is granted but the frame is
   not ready yet - there is no buffer for events raised before consent resolves. Meanwhile
   `emitYmiTrackingEvent` returns `true` as soon as it dispatches the DOM CustomEvent, which says
   nothing about whether the adapter did anything with it, and the success page treats that `true`
   as proof of delivery and writes `sessionStorage['ymi_tracking_purchase_v1:<orderId>'] = '1'`.
   If those two land in the wrong order, the highest-value event in the funnel is lost for that
   order and the guard prevents any retry.

   In practice this is unlikely today: consent is read synchronously from `localStorage` in a mount
   effect, while the Purchase effect waits on the order fetch, so consent almost always wins. I am
   raising it because the design, not the timing, is what makes it possible - and because
   `app/api/user/cookie-consent/route.ts` exists, so if consent ever resolves over the network for
   signed-in users, the race becomes real for the one event that matters most.

   Cleanest fix is at the adapter rather than the caller: buffer events that arrive while consent is
   still null, then flush them when consent resolves to granted and discard them if it resolves to
   denied. That fixes the whole class in one place. The narrower alternative is to stop treating the
   dispatch return value as delivery confirmation and only set the sessionStorage guard on a real
   acknowledgement.

2. Minor, product rather than correctness: `begin_checkout` omits `currency` and `value` even though
   the policy allows both for that event, while `purchase` sends them. That is fail-closed and
   perfectly safe, but InitiateCheckout without a value is materially less useful for ad
   optimisation. If the omission is deliberate, it is worth a line in the go-live checklist so
   nobody later reads it as a bug; if it is not, both values are already available on that page.

NOTE: the remaining risk in this track is entirely runtime and cannot be closed by code review. The
architecture makes call-site mistakes surface as MISSING events rather than leaked fields, so the
live vendor network inspection should be looking
for events that failed to arrive, and for anything firing before consent - not for prohibited fields
inside payloads, which the sanitizer already makes unreachable.


### T3-003 carry-forward fixes - Claude re-review (2026-08-26)

All six claims verified. Independently re-ran tracking:tests 8/8, test:contracts 178/178, tsc clean.

Pre-consent buffering - PASS, and fixed at the right layer. `pendingConsentEventsRef` in
`ConsentGatedTagAdapter.tsx` now holds `{event, page}` pairs when `consentRef.current` is null, and a
new effect splices and dispatches them once consent resolves. Two details worth naming because they
are easy to get wrong and were got right: the buffer captures the page as it was AT EMIT TIME rather
than at flush time, so an event raised on `/books` cannot be re-attributed to `/checkout` after a
navigation; and the overflow rule `shift()` drops the OLDEST entry, so a late high-value event such
as Purchase survives a buffer already filled with cheap ones. Cap is 20.

Denied consent destroys the buffer with no vendor request - PASS. A denial still resolves `consent`
to a non-null object, so the flush effect runs, `splice(0)` empties the queue, and
`dispatchTrackingEvent` resolves activation to `{googleAnalytics:false, meta:false}` - both branches
are skipped and nothing is queued for the frame. The events are discarded rather than held.

Purchase is no longer lost-then-marked-sent - PASS, and note that the success page code is unchanged
from the previous round. The fix works because dispatch now guarantees retention rather than because
the caller learned to verify delivery, which is the correct layer - it fixes the whole class rather
than the one call site. The only surviving loss path is a buffer overflow, which for Purchase would
require twenty other funnel events to be raised before consent resolves on the success page. Not
reachable in practice.

Per-category routing - PASS. `dispatchTrackingEvent` re-resolves activation per event, so analytics
and marketing grants are honoured independently rather than as a single on/off.

PreviewReady unified - PASS. Both paths are now gated on the boolean return of
`applyPreviewDisplayAssets`. The partial branch additionally moved `replacePreviewUrl`,
`setProgress(100)`, `markGenerateTiming`, `finishGenerating` and the `return` inside that guard, so
this is slightly more than a tracking change. It is safe: the branch is already inside
`if (partialPreviewAssets?.coverUrl)` and `applyPreviewDisplayAssets` returns false only when
`!assets.coverUrl`, so the new false path is unreachable. Flagging only because `partialPreviewShown
= true` is set before the guard, so if that function ever gains a second false condition the flow
would fall through with the retry already blocked.

Privacy constraints unchanged - PASS. No change to the sanitizer's key allowlist, the surrogate
transaction ID, or `MetaPixelFrame.tsx`. Raw order IDs, creation IDs, job IDs and child data remain
structurally unable to enter a payload.

-> Codex

VERDICT: APPROVED (T3-003 carry-forward fixes, 2026-08-26). The architectural gap is closed at the
adapter, which was the right place. Ready to commit and deploy. One carry-forward and one note, both
about `begin_checkout` only.

BLOCKING: none.

CARRY-FORWARD:

1. `begin_checkout` sends `currency` and `value` unconditionally while `item_count` and `format` use
   the conditional-spread pattern (`app/checkout/page.tsx`). That inconsistency has a real
   consequence, because `sanitizeTrackingEvent` rejects the WHOLE event when any single value fails
   normalization rather than dropping the offending key. So if `total` is ever NaN - every cart item
   would need both `priceAtPurchase` and `book.price` missing, so this is unlikely rather than
   impossible - the result is not a begin_checkout without a value, it is no begin_checkout at all.
   Match the sibling keys: `...(Number.isFinite(v) && v >= 0 ? { value: v } : {})` and the same
   guard on currency. The event then degrades a field at a time instead of vanishing.

NOTE, no action needed, worth recording so a later reader does not file it as a bug: the two money
events are deliberately measuring different things. `begin_checkout.value` is the item subtotal -
`items.reduce((sum, item) => sum + (item.priceAtPurchase ?? item.book.price) * quantity, 0)`
converted from the USD base into the display currency - and therefore excludes shipping and
discounts. `purchase.value` is the server-returned `display_total`, which includes them. Ad
platforms will therefore show InitiateCheckout values systematically below Purchase values for the
same orders. That is a defensible choice for a pre-payment event, but it should be stated in
`docs/META_ADS_GO_LIVE_ALIGNMENT_BRIEF.md` before the funnel is read for optimisation decisions.


## Meta Ads go-live code slice - Claude review (2026-08-26)

Slice scope confirmed: `components/Hero.tsx`, `app/checkout/success/page.tsx`,
`components/tracking/MetaPixelFrame.tsx`, `src/lib/i18n-messages.ts`,
`src/lib/tracking-policy.ts` and its tests, `tests/tracking-funnel-contract.test.mjs`, and a new
`tests/meta-landing-page-contract.test.mjs`. No SQL, no env change, no commit.

Independently re-ran: tracking:tests 9/9, test:contracts 181/181, tsc clean, eslint clean on the
touched files. Matches the report.

Landing-page claims - PASS, and more thorough than the brief required. Hero is reduced to media,
headline, CTA and the marquee. Testimonials, simulated avatars, the star presentation and the
feature chips are gone, and the vacated area was left open as decided. The i18n cleanup went
further than the Hero itself: `hero.socialProof` ("Loved by 2,000+ families worldwide") and
`hero.marquee.ratedFamilies` ("Rated 4.9 Stars by 2,000+ Families") were removed along with a batch
of already-orphaned keys, and the two numeric claims that survived into the marquee were softened -
"Ships to 100+ Countries" became "International Shipping Available", "Preview Ready in 1 Minute"
became "Preview Before You Order". The six remaining strings carry no number, rating or superlative.
Verified no dangling reference to any removed key.

Purchase state policy - PASS. `isPurchaseTrackingStatus` delegates to `isPaidLikeOrderStatus`, whose
set is `paid`, `production`, `shipped`, `delivered`. I flagged `processing` as a possible new
addition and it is not one: `normalizeOrderStatus` maps `processing -> production` at line 25, so it
is admitted through normalization rather than by being listed. The report is accurate. Unknown
statuses fall through `normalizeOrderStatus` unchanged and miss the set, so they are blocked -
fail-closed, as required. `unpaid`, `cancelled` and `refunded` cannot qualify.

Replay guard migration - PASS. The read path checks BOTH `localStorage` and the legacy
`sessionStorage` under the same key, so an order already marked by the currently deployed build
cannot re-fire after this ships; the write path now targets `localStorage` only. One-directional and
correct, with no cleanup step needed. This is also a real improvement rather than a like-for-like
move: `sessionStorage` only guarded within a tab session, so a customer returning to the success URL
in a new session could previously re-fire Purchase.

Meta eventID - PASS, and the choice is better than it looks. Purchase now passes
`eventID: transaction_id`, the existing SHA-256 surrogate. Two properties follow. First, it is
stable per order and non-reversible, so it is a legitimate dedup token that leaks nothing. Second,
it is exactly the identifier a future Conversions API implementation needs for browser/server
deduplication, so that work will not require inventing a new one.

Correction accepted from Codex (2026-08-26): an earlier draft of this paragraph claimed that the
`localStorage` guard and the eventID together fully cover replay. That overstates it and should not
be relied on. The only deterministic guarantee is the same-browser `localStorage` guard. eventID
lets Meta identify retries and is the foundation for future CAPI browser/server deduplication, but
cross-device or cleared-storage replay is not a guaranteed dedup case and must not be treated as a
backstop.

Consent gating - PASS, untouched. `ConsentGatedTagAdapter.tsx` is not in the slice. The
`MetaPixelFrame.tsx` diff is limited to hoisting the payload into a variable and branching to add
the eventID for Purchase - the origin check, `isSafePage`, the pending queue and the
consent-grant/revoke handling are unchanged.

-> Codex

VERDICT: APPROVED (Meta Ads go-live code slice, 2026-08-26). Everything claimed in the handoff
checks out, and the landing-page cleanup exceeded the agreed scope in the right direction. Nothing
blocks. No carry-forward that needs its own slice; two notes below are for the record.

BLOCKING: none.

NOTES, no action required:

1. CLOSED - no action needed. I raised a silent coupling between `normalizeOrderStatus` and Purchase
   tracking: `processing` is admitted only because that function maps it to `production`, so
   removing the mapping during unrelated order-status work would silently stop Purchase for those
   orders. Codex pointed out this slice already pins it, and I verified -
   `src/lib/tracking-policy.test.ts:105` asserts the allowed set including `'processing'`, so the
   mapping cannot be dropped without a red test.

2. `localStorage` now accumulates one `ymi_tracking_purchase_v1:<orderId>` key per purchased order
   and never clears them. That is a handful of keys over a customer lifetime and is not worth
   cleanup code; recording it only so nobody later discovers it and assumes it is a leak.

REMAINING BEFORE PAID TRAFFIC, unchanged from the alignment decision and not part of this slice: the
full positive-and-negative funnel sequence in Meta Test Events (section 7 of the brief), domain
verification, the Actions/Diagnostics pass, and the owner's first-campaign geography.

## Next Issue

### T4-008 - Checkout Payment-Step Back Must Survive Stripe Cancellation

Status: Claude APPROVED 2026-08-26 (code + tests). Test carry-forward closed by Codex. **Owner production smoke test DEFERRED, not performed** - the real Stripe-cancel-then-Back path has never been exercised against production. Whoever picks this up should run it before treating T4-008 as fully verified.

#### Reported behavior

On the Checkout payment step, before entering Stripe, the page-level Back control could appear to
do nothing. The failure was reproducible after cancelling a hosted Stripe Checkout session and
returning through `/api/checkout/session/cancel`.

#### Root cause

Stripe cancellation intentionally returns to `/checkout?orderId=...&step=payment`. Checkout used
that query marker as a continuously enforced state instead of a one-time resume instruction. The
Back handler set the local step to `address`, but the resume effect immediately observed
`step=payment` again and forced the UI back to `payment` in the same render cycle.

#### Implementation

- `app/checkout/page.tsx`
  - applies the payment resume query once per URL state through
    `checkoutPaymentResumeAppliedRef`;
  - when the operator explicitly returns to the address step, removes only the one-time `step`
    marker with `history.replaceState` before changing local state;
  - preserves `orderId`, discounts, hash state, checkout items, address data and identity state;
  - leaves Stripe session cancellation and order-lock release unchanged.
- `src/lib/checkout-step-navigation.ts`
  - owns the narrow URL rewrite and returns no rewrite for non-payment URLs.
- Regression coverage
  - behavior tests preserve all unrelated query state while removing `step=payment`;
  - contract tests pin one-time resume and Back-before-address ordering;
  - `npm run checkout:tests` added as the focused Checkout suite.

#### Verification

- `npm run checkout:tests`: 10/10 passed.
- `npm run test:contracts`: 183/183 passed.
- `npx tsc --noEmit`: passed.
- ESLint on touched files: no errors; two pre-existing warnings remain in `app/checkout/page.tsx`.

#### Manual smoke test

1. Start a physical-book Checkout and reach the payment step.
2. Enter hosted Stripe Checkout, choose Cancel/Back, and confirm YMI returns to the same unpaid
   order on the payment step.
3. Click Checkout's Back control.
4. Confirm the address step remains visible, the URL no longer contains `step=payment`, and the
   address/order/items remain intact.
5. Continue forward again and confirm Stripe Checkout can still be started normally.

#### Claude review (T4-008, 2026-08-26)

Independently re-ran: checkout:tests 10/10, test:contracts 183/183, tsc clean, eslint clean on the
new file. Matches the report.

Root cause and fix - PASS, and the mechanism is the right one. The diagnosis is correct: the resume
effect requires `step === 'address'` (`app/checkout/page.tsx:431`), so after Back set the local step
to `address` the effect became eligible again and re-forced `payment`. That means the new
`checkoutPaymentResumeAppliedRef` is load-bearing rather than defensive - without it the same render
cycle reproduces the bug.

"Once per URL state" is accurate, and better than it sounds. The ref is not a mount-scoped boolean:
`:426-428` resets it to `false` whenever `queryStep !== 'payment'`, so it gates one application per
entry into the payment-resume URL state rather than one per page load. I checked the case that
would have broken a naive boolean - a second Stripe cancellation - and it is covered twice over: in
page by that reset, and across a real Stripe round trip by the full navigation through
`/api/checkout/session/cancel`, which remounts the component with a fresh ref.

Back-handler ordering - PASS. `goBackStep` sets the ref, calls `replaceState`, then `setStep`
(`:714-731`). That order is the fix; reversing it would let the resume effect observe
`step === 'address'` with `queryStep === 'payment'` and the ref still false. It is also SSR-guarded,
scoped to `case 'payment'` with `requiresShipping`, and passes `window.history.state` through
`replaceState` so it does not clobber history state written elsewhere. When the URL carries no
marker `removeCheckoutPaymentResumeStep` returns null, no rewrite happens, and `setStep('address')`
still runs - so ordinary Back without a Stripe round trip is unaffected.

Scope of the URL rewrite - PASS. `src/lib/checkout-step-navigation.ts` is 18 lines, returns null for
any URL whose `step` is not `payment`, deletes only that key, and rebuilds through `URLSearchParams`
so `orderId`, discount params and the hash survive; it also avoids leaving a dangling `?` when no
params remain. I confirmed `queryStep` has exactly one consumer in the whole checkout page - the
resume effect - so there is no second code path that could re-force the payment step.

Blast radius - PASS. Stripe session cancellation and order-lock release are untouched, and the
digital-only path is unaffected because `canGoBackStep` requires `requiresShipping`, so a
no-shipping order never reaches this branch.

Unit tests - PASS and genuinely behavioural. `src/lib/checkout-step-navigation.test.ts` calls the
function and asserts the returned string for both the marker and no-marker cases.

-> Codex

VERDICT: APPROVED (T4-008, 2026-08-26). The diagnosis, the mechanism and the ordering are all
correct, and the second-cancellation case that would defeat a naive guard is covered. Nothing
blocks. One carry-forward about the guard rail rather than the code.

BLOCKING: none.

CARRY-FORWARD:

1. Two assertions in `tests/checkout-back-navigation-contract.test.mjs` do not pin what their test
   names claim, and the thing they fail to pin is exactly the part of the fix that matters.

   The second test is named "Back consumes the payment resume marker BEFORE returning to address",
   but its three `assert.match` calls are independent presence checks against the extracted
   `goBackStep` slice. Presence in any order satisfies all three, so a refactor that moved
   `setStep('address')` above `replaceState` - which reintroduces the original bug - would keep the
   suite green. The slice extraction is already tight, so one ordered pattern fixes it, for example
   `assert.match(backHandler, /replaceState\([\s\S]*?nextHref\)[\s\S]*?setStep\('address'\)/)`.

   In the first test, `/checkoutPaymentResumeAppliedRef\.current = true;[\s\S]*setStep\('payment'\)/`
   spans the whole file unbounded, so it proves only that the two strings appear somewhere in that
   relative order across 1200-plus lines, not that they sit in the same effect. Extracting the
   resume effect the way the second test extracts the handler, then matching within it, would make
   it mean what it says.

   Worth noting in the guard rail's favour: the extraction uses `?.[0] ?? ''`, so if the enclosing
   signature ever changes the slice becomes empty and every assertion fails loudly rather than
   silently passing. It fails closed, which is the right default.

NOTE, correcting myself for the record: in review discussion I said these checkout contract tests
were not source-text tests, based on grepping for `readFileSync`. They use the async `readFile`, so
they are source-text tests. That does not change the verdict - the unit tests carry the real
behavioural coverage - but it is why carry-forward 1 exists.

Owner smoke test remains as written, and step 3 is the one that actually proves the fix: after a
real Stripe cancel, Back must leave the address step visible with `step=payment` gone from the URL.

#### Codex carry-forward closure (2026-08-26)

The guard-rail weakness was accepted and fixed without changing runtime code:

- the resume assertion now extracts only the `queryStep` resume effect before checking the
  one-time guard and transition to `payment`;
- the Back assertion now requires the ordered sequence `remove marker -> set guard ->
  replaceState -> setStep('address')` inside the extracted `goBackStep` handler.

Re-verified after the test hardening: `checkout:tests` 10/10, `test:contracts` 183/183, targeted
ESLint clean, and `git diff --check` clean apart from existing line-ending notices.

### General Inbox composer - Tiptap migration - Claude review (2026-08-26)

Scope: `GeneralMailRichText.tsx`, `GeneralMailComposer.tsx`, `GeneralInbox.tsx`, `package.json`
(Tiptap 3.30.x: core, react, pm, starter-kit, extension-link, extension-underline), plus a new
`GeneralMailRichText.test.ts`. No SQL, no commit.

Independently re-ran: support:tests 49/49, admin:contracts 40/40, test:contracts 183/183, tsc clean.
Matches the report.

1. Conversion fidelity - PASS for every structure the contract supports, with one gap below. Both
directions are allowlist-based and fail-closed, consistent with the rest of this codebase.
`tiptapInlineContent` `continue`s on anything that is not `text` or `hardBreak`, and recognises only
bold/italic/underline/link marks; `tiptapJsonToGeneralMailDocument` emits blocks only for
bulletList, orderedList, blockquote, heading and paragraph, so an unexpected node type is dropped
rather than forwarded. Round-trip details are right: `\n` maps to `hardBreak` and back,
`attrs: { level: 2 }` matches the `heading: { levels: [2] }` configuration, `appendInline` merges
adjacent runs with identical marks and href, and neither direction can produce an empty document.
`safeHref` now runs at CONVERSION time rather than only at insertion, which is stronger than the
previous implementation - a link that arrived by any path is re-validated to http/https with no
embedded credentials before it can reach the document.

2. Toggles and selection - PASS, and structurally better than what it replaces. Toolbar state comes
from `useEditorState` reading `editor.isActive(...)`, so bold/italic/underline are genuine toggles
derived from the editor rather than a manually maintained set. Selection is protected twice: every
button keeps `onMouseDown` `preventDefault`, and every command runs through
`editor.chain().focus()`. Note this retires an earlier carry-forward by construction - I had flagged
that the old `restoreSelection` reused a saved `Range` without re-validating that it was still
attached after an `innerHTML` rewrite. There is no saved Range in this design, so that failure mode
no longer exists. `applyLink` uses `extendMarkRange('link')`, so it applies to the whole link from a
collapsed cursor.

3. SSR and dependencies - PASS. `immediatelyRender: false` is set, which is the requirement for
Tiptap 3 under the App Router. The editor is created once: `onChange` is held in `onChangeRef` and
refreshed by its own effect, so a parent re-render cannot recreate the editor and destroy selection
and undo history. The value-sync effect compares the incoming value against the CURRENT EDITOR STATE
ROUND-TRIPPED THROUGH THE SAME CONVERTER, so a semantically identical external value does not
trigger a content reset, and when a reset is genuinely needed it uses
`setContent(..., { emitUpdate: false })` so the sync cannot loop back through `onUpdate`.

4. No raw HTML or unsafe exposure - PASS. `content` is supplied as Tiptap JSON built from the
document, never as an HTML string, so there is no path by which raw HTML is accepted. There is no
`dangerouslySetInnerHTML` anywhere in the module. Link extension is configured `autolink: false`,
`linkOnPaste: false`, `openOnClick: false` with `rel="noopener noreferrer nofollow"`, so pasted text
cannot silently become an unvalidated link. `code`, `codeBlock`, `horizontalRule` and `strike` are
disabled, and headings are restricted to level 2. BCC, signed URLs and Storage paths are not touched
by this slice.

5. Attachment validation and CAS - PASS, and this closes an earlier carry-forward more thoroughly
than I asked. Type validation now happens for the WHOLE BATCH BEFORE THE LOOP STARTS
(`files.some((file) => !resolveAttachmentContentType(file))` returns with one clear message), so an
unsupported file no longer fails server-side mid-batch leaving earlier files uploaded and later ones
silently skipped. `resolveAttachmentContentType` falls back to an extension map when `file.type` is
empty, which matters because drag-drop from some sources reports no MIME type, and the resolved
value - not the raw `file.type` - is what gets sent as `contentType`. Count, per-file size, total
size and empty-file checks all run before any upload. The CAS chain is unchanged and still correct:
sequential `for...of`, with `messageUpdatedAt` folded back from both the registration and the
confirmation response into a local variable rather than React state.

6. Existing modes and mobile - PASS. `GeneralMailComposer` retains the new/reply/reply-all/forward
mode handling; the diff is UI and attachment-UX shaped rather than contract shaped.

7. Attachment UI versus Insert Link - PASS, unambiguous, and for a structural reason rather than a
cosmetic one. The two controls are not adjacent and do not share an affordance: the formatting
toolbar contains only Undo, Redo, Bold, Italic, Underline, Heading, Quote, Bulleted list, Numbered
list, Insert link and Clear formatting - there is no attachment control in it at all - while
attachments live in their own composer region with Paperclip/UploadCloud icons and a drop zone. The
ambiguity worth worrying about would be a paperclip sitting inside the text toolbar, and that is not
what was built.

-> Codex

VERDICT: APPROVED (General Inbox composer Tiptap migration, 2026-08-26). All seven focus points hold
and two earlier carry-forwards are retired - one closed by the batch-level type validation, one made
unreachable by the new selection model. One carry-forward below is genuine silent content loss and
should be closed before this ships, though it does not block the migration itself.

BLOCKING: none.

CARRY-FORWARD:

1. Nested list content is silently discarded on save. This one is certain from the code rather than
   inferred. `listItemInlineContent` walks a `listItem`'s child blocks and calls
   `tiptapInlineContent(block.content)` on each. When a child block is a nested `bulletList` or
   `orderedList`, its `content` is a list of `listItem` nodes, and `tiptapInlineContent` skips
   everything that is not `text` or `hardBreak` - so every nested item's text is dropped. Worse, the
   `if (index > 0 && output.length) appendInline(output, { text: '\n' })` on the preceding line runs
   first, so what survives is a stray blank line where the operator's nested bullets used to be. The
   same applies to any non-paragraph block inside a list item.

   Reachability: `GeneralMailDocument` has no representation for nesting, so this is not a converter
   bug so much as the editor offering something the contract cannot carry. Tiptap's StarterKit
   normally binds Tab to `sinkListItem` and nothing here disables it, so pressing Tab inside a
   bullet should produce a nested list - please confirm that in the running composer, it takes five
   seconds and it decides the severity.

   Preferred fix is to make it impossible rather than lossy: disable list nesting in the editor
   (drop the Tab/sink shortcut, or configure `listItem` to disallow nested lists) so the editing
   surface matches what the document contract can express. Flattening nested items into the parent
   list would preserve the text but silently change the operator's structure, and extending
   `GeneralMailDocument` to model nesting is a much larger change that would need the server
   renderer too.

   Test coverage note: the new `GeneralMailRichText.test.ts` has two cases - supported blocks/marks/
   lists/links round-trip, and unsafe link protocols dropped. Neither covers nesting. Whichever fix
   is chosen, a case asserting that a nested structure either round-trips or is impossible to create
   would pin it.

#### Nested-list follow-up - Claude re-review (2026-08-26)

Re-ran: support:tests 50/50 (up one, the new nested case), test:contracts 183/183, tsc clean.

The fix is at the strongest available layer - PASS. `FlatListItem` sets `content: 'paragraph+'`, so
this is not "the shortcut was removed", it is ProseMirror schema enforcement: a list node cannot
exist inside a `listItem` at all, which also normalizes a paste that tries to bring one in. The
swap is done correctly with `listItem: false` in the StarterKit config plus the extended node
appended. `Enter` still splits items and `Shift-Tab` still lifts out of the list, so the useful
editing behaviour survives.

Converter assert - PASS, and correctly positioned. `listItemInlineContent` now throws
`Nested list content is not supported` on any non-paragraph child, and it throws BEFORE the
`index > 0` newline append, so the stray-blank-line artifact from the old behaviour is gone too. I
checked whether a throw is safe in what is a per-keystroke path: both callers
(`GeneralMailRichText.tsx:264` in `onUpdate` and `:290` in the value-sync effect) feed it
`editor.getJSON()`, which the schema now guarantees cannot contain nesting. So the assert is
genuinely unreachable from the editor - schema prevents, converter asserts. That is the right
relationship between the two.

Regression test - PASS. The new case asserts the converter throws rather than merely checking the
output shape, so it pins the loud-failure behaviour rather than the old silent one.

-> Codex

VERDICT: APPROVED (nested-list follow-up, 2026-08-26). The carry-forward is closed at the schema
level, which is better than the keybinding-only fix I suggested as the minimum. One new
carry-forward introduced by the fix itself, plus one note.

BLOCKING: none.

CARRY-FORWARD:

1. `Tab: () => true` swallows Tab across the whole editor, not just inside lists, which traps
   keyboard focus. Tiptap registers a node extension's `addKeyboardShortcuts` into the editor-wide
   keymap; scoping comes from the handler returning `false` when the command does not apply. The
   stock `ListItem` binds `Tab: () => this.editor.commands.sinkListItem(this.name)`, and
   `sinkListItem` returns false outside a list, so Tab previously propagated normally in ordinary
   paragraphs. Returning a bare `true` reports "handled" unconditionally, so a keyboard-only
   operator composing a message body can no longer Tab to the Send button or any following control.

   The binding is also redundant now. With `content: 'paragraph+'`, `sinkListItem` cannot succeed -
   the previous item will not accept a list child - so it would return false and let Tab through on
   its own. Removing the `Tab` override entirely gets nesting prevention from the schema and normal
   Tab navigation back at the same time. If a binding is preferred for explicitness, scope it, for
   example `Tab: () => this.editor.isActive(this.name)`.

   Worth a five-second manual check either way: click into the message body outside any list and
   press Tab. If focus stays in the editor, this is confirmed.

NOTE: `tiptapJsonToGeneralMailDocument` is exported and now throws. Both current callers pass
schema-validated editor JSON so the throw is unreachable, but if it is later reused for content from
another source - an import path, a paste payload, a migration script - the throw becomes reachable
and would need a caller-side guard. Worth a comment on the export rather than any code change now.

#### Round status (Claude, 2026-08-26)

T4-007 composer Tiptap migration + nested-list follow-up: APPROVED and closed for this round by owner
decision.

Two things deliberately NOT done, recorded so nobody later assumes otherwise:

- The `Tab: () => true` keyboard trap in `FlatListItem` is still in place. It is a real a11y
  regression - Tab is swallowed editor-wide, so a keyboard-only operator cannot leave the message
  body - and the binding is redundant now that `content: 'paragraph+'` prevents nesting at the
  schema level. Accepted as non-blocking for this round; whoever touches this component next should
  delete the override or scope it.
- This slice is still UNCOMMITTED in the working tree. It has not been committed or deployed, so the
  live Admin composer is still the pre-Tiptap implementation.

### T4-009 - Personalized cover must survive into Cart and Checkout

Status: Claude APPROVED 2026-08-26. Uncommitted at review time.

#### Codex implementation statement (2026-08-26)

Goal: every purchase surface must show the generated personalized Preview cover, never the public
template cover. This includes direct Preview-to-Checkout navigation, persisted Cart state, the
global MiniCart, and Checkout. If the authoritative personalized cover is not ready, the safe
fallback is the existing placeholder rather than a generic or broken image.

Scope: fix the direct-checkout item construction, derive cover URL and status through one shared
policy on all three purchase surfaces, preserve the existing authoritative Cart/API enrichment,
and add a regression contract. No database or payment-contract change is required.

#### What the change does

The defect: checking out directly from Preview built the checkout item from `resolvedBook`, i.e. the
generic template cover, so the customer saw a stock cover instead of the personalized one they had
just generated. The fix constructs `checkoutBook` from `previewUrl || previewPages[0]` and sets
`coverStatus` from whether that resolved, in both branches of the direct-checkout path
(`PersonalizePage.tsx`). `GlobalContext` now derives `coverStatus` the same way in its three
cart-write paths, and a new shared `src/lib/cart-cover.ts` centralises the read side.

#### Claude review (2026-08-26)

Re-ran: checkout:tests 12/12, test:contracts 185/185, tsc clean.

Shared helper - PASS, and it fails in the safe direction. `resolveCartItemPreviewCover` returns null
unless `coverStatus === 'ready'` AND the trimmed URL is non-empty, so a row claiming `ready` with a
missing URL degrades to a placeholder rather than a broken image.
`resolveCartItemPreviewCoverStatus` passes `unavailable` through untouched - correct, since that is
a negative assertion that needs no URL to back it - and otherwise derives the status from whether a
cover actually resolves rather than trusting the stored field. That is the same lesson as the
earlier cart-title regression, applied to covers.

Dependency correctness - PASS, and worth naming because getting it wrong would have been invisible.
The direct-checkout callback now reads `previewUrl` and `previewPages`, and both were added to its
dependency array. Without that the callback would have closed over a stale preview URL and shipped
the wrong cover intermittently - the exact bug it is meant to fix, in a harder-to-reproduce form.

Behaviour change worth recording: the shared helper is STRICTER than the local one it replaced in
checkout. The old `resolveCheckoutItemCoverUrl` returned any non-empty `book.coverUrl` regardless of
status; the new one requires `coverStatus === 'ready'`. So a cart item that carries a URL while its
status is still `pending` now shows the placeholder on Checkout where it previously showed the
image. That looks intentional and is the right direction - a not-yet-ready cover is exactly the
stock cover this issue is about - but it is a visible change, not a pure refactor.

Test - PASS, and it includes the assertion that actually prevents regression: alongside the
positive matches there is an `assert.doesNotMatch` pinning that the old `book: resolvedBook` shape
is gone. A test that only asserted the new shape would still pass if someone reintroduced the old
branch alongside it.

-> Codex

VERDICT: APPROVED (T4-009, 2026-08-26). The fix is at the right layer and the read side is now
shared rather than duplicated. Nothing blocks. One carry-forward, which I chased to ground and which
does not currently misbehave.

BLOCKING: none.

CARRY-FORWARD:

1. The three purchase surfaces are not treated consistently, and the test locks that in. Checkout
   derives BOTH values (`resolveCheckoutItemCoverUrl = resolveCartItemPreviewCover` and
   `resolveCheckoutItemCoverStatus = resolveCartItemPreviewCoverStatus`), while
   `app/cart/CartItemsList.tsx` and `components/cart/MiniCart.tsx` derive only `src` and still pass
   `status={item.coverStatus}` straight from the stored field. `resolveCartItemPreviewCoverStatus`
   is therefore used at exactly one of the three call sites.

   I traced whether this misbehaves today and it does not, for two independent reasons in
   `components/OrderCoverImage.tsx`: `shouldShowImage` requires `currentSrc && currentStatus ===
   'ready'`, so a raw `ready` with a null src still falls to the placeholder; and `refreshCover` is
   invoked only from the `<Image>` `onError` handler, which cannot fire when no image renders, so
   the self-heal path behaves identically whichever status is passed.

   It is still worth aligning, because the safety currently rests on that component's internal AND
   guard rather than on the call sites. If `OrderCoverImage` ever relaxed to, say, show a skeleton
   for `ready`, Cart and MiniCart would regress while Checkout stayed correct - and the new contract
   test would not catch it, because it pins `src=` at those two sites and says nothing about
   `status=`.

NOTE, pre-existing and outside this change, worth confirming rather than assuming: the cover
self-heal only ever fires on an image load error. An item whose cover never resolves renders no
image, so `refreshCover` never runs for it. Whether a pending cover eventually appears therefore
depends entirely on something else refetching the cart. If that refetch exists this is a non-issue;
if it does not, a cover that was pending at add-to-cart time may sit on the placeholder for the
whole session.

#### Codex follow-up closure (2026-08-26)

The approved carry-forward is closed in the same slice: Cart and MiniCart now derive both `src` and
`status` through the shared cover policy, matching Checkout. The regression contract pins both
props at all three purchase surfaces, so safety no longer depends on `OrderCoverImage` retaining
its current internal `src && status === 'ready'` guard.

## Signature Voice S1 - Binding and schema foundation - Claude review (2026-08-27)

Reviewed `Template_folder/sql_signature_voice_binding_foundation.sql`, `src/lib/signature-voice.ts`,
`src/lib/package-pricing-store.ts`, `app/api/user-assets/route.ts` and the two new test files.
SQL not run, code not deployed, as stated.

Re-ran: signature-voice 9/9, contracts 189/189, tsc clean.

Rerun convergence - PASS. Every statement is independently idempotent: `add column if not exists`
for the seven columns, `do $$` existence guards around both the FK and the CHECK, `create index if
not exists`, `drop trigger if exists` followed by `create trigger`, and `create or replace function`
throughout. No explicit transaction, no temp tables, no enum remapping, no inferred historical
binding. This satisfies the SQL Editor per-statement constraint recorded in this project.

The all-or-none CHECK - PASS, and it is NULL-safe in the way that matters. Both branches enumerate
all seven columns with explicit `is null` / `is not null` rather than any equality comparison that
could evaluate to unknown and pass by accident. Four additional validations are embedded in the
populated branch and each is worth naming because each closes a failure we have hit elsewhere:
`voice_sample_duration_seconds between 10 and 20`; a consent-version regex
`^signature-voice-consent-v[1-9][0-9]*$`, which is an explicit allowlist so a forged or unknown
version fails closed rather than being stored; `voice_bound_at >= voice_consent_accepted_at`, which
makes a binding that predates its own consent unrepresentable; and the relationship enumeration from
S0.2. I checked the duration bounds against the recorder and they agree exactly - `MIN_SECONDS = 10`
and `MAX_SECONDS = 20` in `VoiceRecorderPanel.tsx`.

Trigger semantics - PASS, and the mechanism behind review gate 6 is subtle enough to name. The guard
is `before insert or update of voice_asset_id`. Because it fires only when that column appears in
the statement's SET list, a later anonymous-to-customer recovery that updates `customer_id` and
`owner_type` does not re-enter the ownership check, so the Creation keeps pointing at the original
anonymously-owned asset exactly as S0.4 requires. Bind-time strictness and post-binding tolerance
come from one clause rather than from special-case logic.

plpgsql ambiguity - PASS everywhere an alias can be applied. `delete_owned_unbound_user_asset` is
plpgsql with `returns table (cleanup_id, bucket_name, storage_path)`, and all three OUT names
collide with real column names. Every reference that can carry a qualifier does:
`asset.asset_id`, `creation.voice_asset_id`, and notably
`returning public.user_asset_cleanup_outbox.cleanup_id into v_cleanup_id`. See the carry-forward for
the one position where a qualifier is not available.

Outbox-before-delete - PASS. The outbox row is written before the business row is deleted, and the
whole sequence runs inside one function invocation and therefore one transaction at runtime, so the
half-broken state where Storage is orphaned by a failed row delete is not reachable. The row is
written only when a storage path exists, which is correct. I also confirmed the outbox table
declares `unique (bucket_name, storage_path)`, without which the `on conflict` clause would fail at
runtime rather than at creation.

Bound-asset protection - PASS with defence in depth. `ON DELETE RESTRICT` on the FK is backed by an
explicit `voice_asset_bound` raise inside the delete function, so the protection does not rely on a
single mechanism.

Fail-closed coverage - PASS, and I was wrong about where to look. I flagged that
`app/api/cart/route.ts` is not in the change set and contains no voice reference, and suspected the
409 claim was unbacked. It is backed: `assertSignatureVoicePurchaseBinding` is called inside
`src/lib/package-pricing-store.ts`, which both `app/api/cart/route.ts` and
`app/api/orders/start/route.ts` already import. Neither route file needed changing. That is the
better structure - one authority in a shared module rather than the same check duplicated at two
entry points - and it matches the single-association principle from 3.2 rather than working against
it.

No voice columns were added to Cart or Order. Confirmed.

-> Codex

VERDICT: APPROVED (Signature Voice S1, 2026-08-27). Do not run the SQL until carry-forward 1 is
decided, because it is free to eliminate now and can only be discovered by execution later.

BLOCKING: none.

CARRY-FORWARD:

1. `on conflict (bucket_name, storage_path)` is the one position in
   `delete_owned_unbound_user_asset` where an OUT-colliding identifier cannot take a table alias.
   Both names are `returns table` OUT parameters and both are real columns of the target table.
   PostgreSQL accepts expressions in a conflict target, so plpgsql substitution may apply there; if
   it does, this raises an ambiguous-reference error under the default `variable_conflict = error`.
   I could not settle from a read whether the conflict target is treated as a bare column list or as
   an expression context, and this is precisely the defect class recorded in this project as one
   that static review and contract tests miss and only live execution surfaces.

   Since the migration has not been run, the cheapest resolution is to remove the question rather
   than test the grammar: rename the three OUT parameters so no collision exists - `out_cleanup_id`,
   `out_bucket_name`, `out_storage_path`. The RPC caller in `app/api/user-assets/route.ts` reads the
   result by field name, so it must be updated in the same slice. If you would rather keep the
   current names, run the CREATE FUNCTION statement first in isolation and confirm it both creates
   and executes cleanly against a real row before treating the migration as convergent.

NOTES, no action required:

2. `update of voice_asset_id` fires whenever that column appears in the SET list, even when the
   value is unchanged. The ownership-transition tolerance in gate 6 therefore depends on the
   recovery path never writing `voice_asset_id` redundantly. That is true today. A short comment at
   the trigger would keep it true, because a future refactor that rewrites the whole row on recovery
   would silently reintroduce the ownership failure at exactly the moment an anonymous purchase is
   being recovered.

3. The 10 and 20 second bounds now exist in three places: `VoiceRecorderPanel.tsx` constants,
   `src/lib/signature-voice.ts` constants, and the SQL CHECK. They agree today. They are a coupling
   of the kind this project keeps getting bitten by, where each copy is individually correct and the
   guarantee exists only jointly. The TS constants are already shared between two of the three; a
   comment on the SQL CHECK pointing at `signature-voice.ts` would make the third visible from the
   database side.

## Signature Voice S2 - Capture hardening - Claude review (2026-08-27)

Reviewed `Template_folder/sql_signature_voice_capture_hardening.sql`, the new
`voice-sample-quality.ts` and `user-asset-cleanup-server.ts`, the new
`app/api/user-assets/[assetId]/download` and `app/api/internal/user-assets` routes, and the changed
capture, confirm, jobs and legal-content files. SQL not run, as instructed.

Re-ran: signature-voice 20/20, contracts 195/195, tsc clean.

Server-side real-byte duration - PASS, and it is genuinely byte-derived rather than a bounded client
claim. `app/api/user-assets/confirm/route.ts` pulls the stored object back out of Storage, runs
`parseBuffer` from the newly added `music-metadata`, reads `format.duration` from the actual
container, and rejects anything non-finite or outside `SIGNATURE_VOICE_MIN/MAX_SAMPLE_SECONDS`. The
value the S1 CHECK constraint eventually validates is therefore server-verified, not client-supplied,
which is what point 2 claimed.

Playback proxy - PASS, and correctly differentiated from the attachment pattern. The route resolves
the owner, 401s without one, scopes the asset read to that owner, and streams bytes; there is no
`createSignedUrl` anywhere in it. `Content-Disposition: inline` is right here rather than
`attachment` because this feeds a player, and the compensating controls are all present: the content
type is normalised rather than echoed, `X-Content-Type-Options: nosniff`,
`Cross-Origin-Resource-Policy: same-origin`, `private, no-store`, plus `Accept-Ranges` with a 416 on
a malformed range so seeking works without accepting arbitrary range syntax.

Historical orphan cleanup - PASS, and built the way it was asked to be.
`enqueue_expired_unbound_voice_assets` selects on `asset.created_at < p_cutoff` with no lower bound,
so it is backward-looking by construction and reclaims rows created long before it ships. It
excludes bound assets through `not exists (... creation.voice_asset_id = asset.asset_id ...)`, and
enqueues into the outbox rather than deleting directly. This closes the owner decision recorded
earlier that the sweep must cover the backlog accumulated while Create Preview stays gated.

plpgsql ambiguity - PASS, with an inconsistency noted below. `claim_user_asset_cleanup` voluntarily
adopts the `out_*` convention from S1, which eliminates the collision entirely.
`create_preview_job` keeps `creation_id` and `job_id` as OUT names, and I checked every reference in
its body: all are local variables (`v_creation_id`, `v_job_id`), fully qualified
(`returning public.creations.creation_id`, `returning public.jobs.job_id`,
`where public.creations.creation_id = ...`), or in an exempt position - an INSERT column list or an
UPDATE SET target. There is no bare ambiguous reference, so the function is correct as written.

Atomic creation - PASS. Creation row, voice binding and preview job are produced inside one function
invocation, so a failure cannot leave a Creation bound to a voice with no job, or a job with an
unbound Creation.

Legal content - noted, not a code finding. Codex is right that the `footer-legal-content.ts` change
is inert in production until the matching Privacy revision is published through Admin, because
DB-published legal content takes precedence over the code fallback. Treat that publication as a
go-live gate for this slice rather than something that happens automatically on deploy.

-> Codex

VERDICT: RETURNED (Signature Voice S2, 2026-08-27) - one statement-ordering change in the SQL before
it is run. Everything else is approved. The change is a one-line move and I am gating on it only
because it is free now and its failure mode is both site-wide and non-obvious.

BLOCKING:

1. Move the `drop function if exists public.create_preview_job(text, uuid, uuid, text, jsonb, text,
   text, jsonb, jsonb, text, text)` statement ABOVE the `create or replace function` that defines
   the sixteen-parameter version.

   The new signature's first eleven parameters are identical in type and order to the old
   signature's eleven, with five defaulted parameters appended. As written, the script creates the
   new function first, so both overloads coexist until the drop executes. A call supplying only the
   original eleven named arguments - which is exactly what the currently deployed code sends - then
   matches both candidates, and PostgreSQL resolves that as ambiguous rather than preferring either.

   Run start to finish this window is seconds and harmless. The reason to change it is what a
   PARTIAL run leaves behind. This project's own recorded lesson is that the Supabase SQL Editor
   executes statements individually and that operators have ended up with partially applied scripts.
   If the drop is skipped or errors, both overloads persist permanently and every preview creation
   from the deployed build fails with a function-is-not-unique error - a site-wide break whose cause
   is not visible from the symptom.

   Reversing the order does not remove the failure window, it changes what the window looks like.
   Drop-then-create leaves either "function does not exist", which is immediately diagnosable and
   tells the operator to finish the script, or the correct final state. It never leaves a silently
   ambiguous overload. Given the choice between two broken intermediate states, take the loud one.

CARRY-FORWARD:

2. `create_preview_job` is safe by qualification discipline rather than by construction, while its
   sibling in the same file is safe by naming. The body is correct today - I checked every reference
   - but the safety depends on every future edit continuing to qualify, in a function that just grew
   by five parameters and will keep being extended as this feature lands. The same defect class was
   fixed one slice ago by renaming, and static review plus contract tests cannot catch a regression
   here; only execution can.

   Renaming these two OUT parameters is more invasive than it was in S1 because they are
   pre-existing and the caller reads them by name, so this is not a request to do it now. But if
   `create_preview_job` is touched again during S3 or later, take that opportunity to bring it onto
   the `out_*` convention so the whole file is safe the same way.

## Signature Voice S3 - Admin voice surface - Codex implementation handoff (2026-08-27)

Status: Claude APPROVED 2026-08-27. Run SQL first, then deploy. One non-blocking carry-forward. Not yet committed or
deployed for this slice.

Implemented scope:

- Added `Template_folder/sql_signature_voice_admin_surface.sql` with per-Creation source revision,
  independent technical/adult-declaration triage, immutable actor audit, dedicated Admin replacement
  staging, atomic source replacement and abandoned-upload cleanup through the durable outbox.
- Added exact paid Order Item -> Cart Item -> Creation resolution for the Admin workspace. No
  customer-email, sender, subject or customer-level asset inference is used.
- Added authenticated private-byte source playback/download with Range support and access audit. No
  signed URL or Storage path is exposed.
- Added dedicated replacement upload/confirm routes. Confirmation verifies actual stored bytes,
  container/MIME, 10-20 second duration, byte count and SHA-256 before the atomic replacement RPC.
  Replacement resets both triage decisions; old bytes enter 30-day cleanup unless still shared.
  An ambiguous RPC response is reconciled against the authoritative Creation binding before any
  cleanup; an indeterminate result preserves the private object and fails visibly.
- Added the Orders entry point and responsive Admin workspace with separate triage controls,
  drag/drop/file-select replacement, reason, authorization reference and declared subject fields.
- S4 narration slots and S5 Print/Shipped gates remain out of scope and have not been simulated.

Verification:

- `npm run signature-voice:tests`: 25/25.
- `npm run test:contracts`: 200/200.
- `npm run admin:contracts`: 40/40.
- `npx tsc --noEmit`: clean.
- Targeted ESLint: clean with zero warnings.
- `npm run build`: passed; all three S4 narration routes are in the production route manifest.
- `npm run build`: passed; all four new Admin routes are present in the production route manifest.

Claude review focus:

1. Confirm the S3 SQL is convergent under Supabase SQL Editor per-statement execution and that every
   privileged RPC independently checks the Admin actor plus the exact paid/ordered/supreme item.
2. Confirm source replacement is one atomic mutation, preserves a shared old source, otherwise
   enqueues the old path before deleting its business row, and cannot bypass the 30-day retention.
   Also confirm an accepted-but-unreconciled RPC response cannot cause deletion of the newly bound
   source.
3. Confirm private bytes never leave through a signed URL, replacement confirmation re-verifies
   actual bytes, and source access/replacement/triage history is immutable and actor-attributed.
4. Confirm technical and adult-declaration decisions remain independent, a rejection requires its
   reason, and the UI does not infer an Order from any email context.
5. Confirm SQL-before-code deployment order. Do not run
   `Template_folder/sql_signature_voice_admin_surface.sql` until this review is approved.

-> Codex

VERDICT: AWAITING CLAUDE REVIEW.

BLOCKING: Do not run the S3 SQL or deploy S3 code before review approval.

CARRY-FORWARD: S4 owns the fifteen logical narration slots. S5 owns the negative-tested Print and
Shipped gates plus hardware-loaded attestation. Neither belongs in this review.

### Claude review (Signature Voice S3, 2026-08-27)

Re-ran: signature-voice 25/25, admin:contracts 40/40, contracts 200/200, tsc clean. SQL not run.

SQL convergence - PASS. Across 898 lines every statement is independently idempotent: the three new
tables use `create table if not exists`, every function is `create or replace`, and the single
`create trigger` is preceded by `drop trigger if exists`. No explicit transaction, no temp tables,
no enum remapping.

Privileged RPC authorisation - PASS on both halves, and my first pass got this wrong. A grep for
`package_type = 'supreme'` returned nothing and I briefly took the scoping claim to be unbacked; the
guard is there, written as `lower(coalesce(item.package_type::text, '')) = 'supreme'`. Each
privileged function independently re-derives the whole chain rather than trusting the caller:
`purchase_order.payment_id is not null`, `item.status::text = 'ordered'`, the supreme check above,
`creation.voice_asset_id is not null`, with the three caller-supplied IDs cross-joined and
`for update of creation` taken before any mutation. The admin check is a genuine role test -
`admin_customer.role::text = 'admin'`, raising `admin_access_required` (42501) - not a mere existence
check, and it appears independently in each of the three admin-facing functions.

Ambiguity - PASS by construction. All four `returns table` functions use `out_`-prefixed OUT names,
so the collision class fixed in S1 and voluntarily carried into S2 is now applied from the start
rather than retrofitted. This is the first slice in this lane where I had nothing to check by hand.

Replacement atomicity and the shared old source - PASS, including the ordering detail that makes it
work. `replace_signature_voice_source` repoints `creations.voice_asset_id` to the new asset BEFORE
it evaluates `exists (... other_creation.voice_asset_id = v_old_asset.asset_id ...)`, so the current
Creation cannot self-match and be mistaken for another holder. Only when no other binding remains
does it enqueue the old path and then delete the business row - outbox first, business row second,
in that order. Retention is enforced by scheduling rather than by trust: the outbox row is written
with `next_attempt_at = v_now + interval '30 days'`, so the thirty-day floor cannot be bypassed by
running the cleaner early. `p_expected_asset_id` gives the operation CAS semantics against the old
binding, so a stale workspace cannot replace a source that has already moved.

Ambiguous-response reconciliation - PASS, and the failure ordering is right. When the RPC returns an
error or no row, `reconcileReplacementResult` re-reads the authoritative Creation binding and the
route branches three ways: `committed` returns success with `reconciled: true` and leaves the object
in place because it is now the live source; `unknown` returns 503 and destroys nothing; only a
positively not-committed verdict reaches `discardReplacementUpload`. Bytes are never discarded on
indeterminacy, which is the property that matters for a file that cannot be regenerated without
contacting the customer again.

Byte verification and private access - PASS. Replacement confirmation re-derives size, duration and
SHA-256 from the actual stored object before the RPC is called, so the values the database validates
are byte-derived. Source playback and download run through the authenticated proxy with Range
support; no `createSignedUrl` and no Storage path is returned to a client.

Audit immutability - PASS. `signature_voice_audit_events` carries a `before update or delete` trigger
that unconditionally raises `signature_voice_audit_is_immutable` (55000), making the table
insert-only. Actor and timestamp are recorded on every triage decision, access and replacement.

Triage independence - PASS. Technical and adult-declaration statuses are validated and stored
separately, each rejection independently requires its own reason, reasons are length-capped at 1000,
and setting a status back to `pending` clears that reviewer field without touching the other
decision. No Order or Creation is inferred from email context anywhere; resolution is by explicit
order/cart-item/creation IDs.

-> Codex

VERDICT: APPROVED (Signature Voice S3, 2026-08-27). Run the SQL first, then deploy the code. One
carry-forward, which is a defence-in-depth gap rather than a reachable defect.

BLOCKING: none.

CARRY-FORWARD:

1. `discardReplacementUpload` deletes the private object with no final check that the asset is
   unbound. It calls `supabaseAdmin.storage.from('raw-private').remove([storagePath])` immediately,
   and only falls back to the cleanup outbox if that remove itself errors.

   It is not reachable today: the call site is gated behind a reconciliation verdict that is neither
   `committed` nor `unknown`, so the binding has been positively established as not pointing at this
   asset, and `supabaseAdmin` reads go to the primary rather than a replica. I am raising it because
   of the asymmetry between how unlikely it is and how bad it would be. Every other deletion path in
   this feature routes through the durable outbox and re-checks bindings; this one is a direct
   irreversible byte delete whose safety rests entirely on a verdict computed a few lines earlier.
   If that verdict is ever wrong - a future refactor of `reconcileReplacementResult`, a changed read
   path, an added branch - the result is a Creation bound to an asset whose object no longer exists,
   for a paid order, with no way to recover the audio except asking the customer to record again.

   One query before the remove closes it: confirm `creations.voice_asset_id` for that Creation is not
   the asset about to be deleted, and route to the outbox instead if it is. That makes the guarantee
   local to the deletion rather than inherited from its caller.

### Codex follow-up (Signature Voice S3 deletion guard, 2026-08-27)

Closed the S3 carry-forward before deployment. `discardReplacementUpload` now queries
`creations.voice_asset_id` for the replacement asset immediately before any Storage removal. If
the query fails or any Creation is already bound to that asset, the function preserves both the
private object and staging row and logs the blocked cleanup; it does not hand a bound asset to the
generic cleanup worker, whose claim currently contains only a path and no binding identity.

The contract test pins the binding query, fail-preserving return and their ordering before
`storage.remove`. No SQL changed. Re-ran: signature-voice 25/25, admin:contracts 40/40,
contracts 200/200, TypeScript clean and targeted ESLint clean.

-> Codex

VERDICT: S3 carry-forward closed. The approved S3 SQL remains unchanged and is cleared to run.

BLOCKING: Run `Template_folder/sql_signature_voice_admin_surface.sql` before deploying S3 code.

CARRY-FORWARD: none from S3. S4 remains the next implementation slice after SQL application.

## Signature Voice S4 - Produced narration archive - Codex implementation handoff (2026-08-27)

Status: Claude APPROVED 2026-08-27. Run S4 SQL first, then deploy. No blocking items; two questions carried into S5. Original gate was: do not run before
review approval.

Implemented scope:

- Added `Template_folder/sql_signature_voice_narration_archive.sql` with exactly fifteen logical
  `narration_01..15` archive slots per Signature Voice Creation and no dependency on visual page
  indexes. Upload staging and canonical tracks are private and service-role-only.
- Confirmation verifies real Storage metadata, bytes, audio container/MIME, 1-600 second duration,
  the 15 MB limit and SHA-256 before the atomic commit RPC. A per-slot advisory lock and
  expected-track CAS prevent stale replacement.
- Existing slot bytes enter the durable cleanup outbox before replacement. Expired staging follows
  the same outbox, and changing a Creation's source recording invalidates all narration derived from
  the old source in one trigger statement.
- Added three independently Admin-authorized routes: private signed upload staging, byte-verified
  confirmation, and a playback/download byte proxy. The proxy rechecks archive byte count and hash,
  supports Range requests, and returns no Storage path or signed URL.
- Extended the Order-scoped Signature Voice workspace with fifteen independent drag/drop or
  file-select slot controls, per-slot replacement, playback, download, revision and verified status.
  Filename sorting, email inference, bulk slot assignment and visual-page coupling are absent.
- S5 Print/Shipped gates, fifteen-object shipment revalidation and hardware-loaded attestation are
  intentionally absent.

Verification:

- `npm run signature-voice:tests`: 29/29.
- `npm run admin:contracts`: 40/40.
- `npm run test:contracts`: 204/204.
- `npx tsc --noEmit`: clean.
- Targeted ESLint: clean with zero warnings.

Claude review focus:

1. Confirm the SQL is convergent under Supabase SQL Editor execution, broadens only the known S3
   audit event CHECK, and uses no explicit transaction, temp table or session workset.
2. Confirm every upload, commit and access path independently checks Admin authority plus the exact
   paid/ordered/supreme Order Item, Creation and current source asset.
3. Confirm actual bytes, container, duration and SHA-256 are server-derived, replacement writes the
   outbox before changing the canonical slot, and uncertain commit responses never delete bytes.
4. Confirm changing the source recording invalidates all old-source narration and abandoned staging
   cannot become an untracked private object.
5. Confirm the UI exposes exactly fifteen independent logical slots and S5 release/hardware gates
   have not leaked into this slice.

-> Codex

VERDICT: AWAITING CLAUDE REVIEW.

BLOCKING: Do not run `Template_folder/sql_signature_voice_narration_archive.sql` or deploy S4 code
before Claude approval.

CARRY-FORWARD: S5 owns negative-tested Print and Shipped gates, the second real-byte/hash check over
all fifteen slots, and authenticated hardware-loaded attestation. Customer activation also remains
gated on the approved Privacy publication and provider/workstation retention confirmation.

### Claude review (Signature Voice S4, 2026-08-27)

Re-ran: signature-voice 29/29, admin:contracts 40/40, contracts 204/204, tsc clean. SQL not run.

SQL convergence and the audit CHECK broadening - PASS, and handled better than the equivalent
situation in S2. The new `signature_voice_audit_event_type_v2_check` is added `not valid` under an
existence guard, validated, and only then is the narrower S3 constraint dropped - and all three
steps sit inside a single `do $$` block. Because DDL inside a plpgsql DO block shares that block's
transaction, the SQL Editor's per-statement commit boundary cannot split them, so the partial-run
state that concerned me in S2 is not reachable here. Everything else is `create table if not
exists`, `create index if not exists`, `create or replace function`, and a
`drop trigger if exists` before `create trigger` inside its own guard block. No explicit
transaction, temp table or session workset.

Fifteen logical slots - PASS, enforced at the schema rather than in the UI.
`slot_key ~ '^narration_(0[1-9]|1[0-5])$'` admits exactly `narration_01` through `narration_15` -
not sixteen, not `narration_00` - with `primary key (creation_id, slot_key)` giving one track per
slot per Creation and unique constraints on both `asset_id` and `storage_path`. There is no
reference to `final_job_pages` or any page index anywhere in the file, so the decoupling required by
brief section 3.12 holds structurally and cannot drift when the visual paging changes.

Authorisation and scoping - PASS. Every function repeats the full derivation rather than trusting
its caller: `admin_customer.role::text = 'admin'`, `purchase_order.payment_id is not null`,
`item.status::text = 'ordered'`, the supreme check, and the current source asset. The commit path
additionally takes `pg_advisory_xact_lock(hashtextextended(creation_id || ':' || slot_key))`, which
serialises two admins racing on the same slot and, being transaction-scoped, cannot leak a held lock.

CAS on slot replacement - PASS, and complete in both directions. The commit rejects when an existing
track's `asset_id` differs from `p_expected_track_asset_id`, and also when no track exists but an
expected value was supplied. That covers replacing something that has already moved and creating
over something that already exists, which is the pair usually got half-right.

Byte derivation - PASS. Confirmation downloads the staged object, parses the real container with
`music-metadata`, validates duration against the shared constants, and computes SHA-256 with
`createHash` over the actual buffer. The values the database CHECK then validates are server-derived,
consistent with S2 and S3.

Ordering around deletion - PASS everywhere I looked. The commit enqueues the outgoing slot bytes
into the durable outbox before upserting the canonical track. The source-change trigger enqueues
both the narration tracks and any staged uploads before deleting either set of business rows, and
never touches Storage directly. Expired staging follows the same outbox route.

Uncertain commits never destroy bytes - PASS, and the S3 pattern was replicated correctly rather
than approximately. The only `discardNarrationUpload` call that precedes reconciliation sits inside
the pre-RPC verification catch, where the asset has never been bound. The post-RPC path calls
`reconcileNarrationResult` first and branches three ways - `committed` returns success without
discarding, `unknown` returns 503 and destroys nothing, and only a positively not-committed verdict
discards. `discardNarrationUpload` also carries forward the S3 fix, refusing to delete when the
binding check finds a binding or when the check itself fails.

S5 has not leaked. No Print or Shipped gate, no hardware attestation, no fifteen-slot shipment
revalidation appears in this slice.

-> Codex

VERDICT: APPROVED (Signature Voice S4, 2026-08-27). Run the SQL first, then deploy. No blocking
items. Two questions below are for S5 rather than defects in this slice.

BLOCKING: none.

QUESTIONS FOR S5, not changes to S4:

1. The thirty-day window on a replaced source buys less than S0.3 implies, because the narration
   derived from it is destroyed immediately. When a source is replaced, S3 enqueues the old sample
   with `next_attempt_at = now() + interval '30 days'`, which S0.3 describes as rollback evidence.
   The S4 invalidation trigger enqueues the derived narration with `next_attempt_at = now()`. So a
   replacement reverted inside that window recovers the sample but not the fifteen tracks, and the
   Minimax work has to be paid for again.

   Both readings are defensible and I am not asserting one. Immediate deletion is arguably right on
   privacy grounds, since narration derived from a source whose adult declaration was rejected is
   exactly the material you want gone quickly. Matching the thirty days is arguably right on
   consistency and cost grounds. What should not stand is the current state where the policy
   document implies a rollback window that the implementation only half provides. Either align the
   interval or record in S0.3 that narration is deliberately excluded from it.

2. Byte verification proves a real audio file exists; it does not prove the file is plausibly a
   narration. `duration_seconds between 1 and 600` means fifteen one-second files pass every check
   in this slice and would satisfy an S5 gate written as "all fifteen verified slots present". The
   content itself is unverifiable by the platform and will always rest on the operator attestation,
   which is correct and was decided in brief 3.6. But a floor closer to a plausible narrated spread
   would catch truncated uploads and placeholder files before they reach the ship gate, which is the
   class of mistake a gate can actually catch. Worth deciding deliberately when S5 defines what
   "verified" means for release.

## Signature Voice S5 - fulfillment gates and hardware attestation - Codex implementation handoff (2026-08-27)

Status: Claude APPROVED 2026-08-27. Run S5 SQL first, then deploy. No blocking items, no carry-forward; one S6 operational observation.

Implemented scope:

- Added `Template_folder/sql_signature_voice_fulfillment_gates.sql`. PDF Release is untouched;
  Print Release is database-blocked for an exact paid/ordered/supreme item until both source triage
  decisions are accepted.
- Added per-Creation hardware attestation bound to the current source asset and deterministic
  fifteen-track manifest. Confirmation is an explicit Admin action and records the actor and time;
  any narration-track insert, replacement or deletion invalidates the proof.
- Before hardware confirmation and again immediately before shipment, the server downloads all
  fifteen private objects and verifies real non-zero bytes, stored length, SHA-256, actual audio
  container and 3-600 second duration. Database row presence, MIME claims and filenames are not
  enough.
- Entering Shipped or Delivered is database-blocked until every Signature Voice line in the Order
  has the current source, both accepted triage decisions, exactly fifteen matching tracks, a matching
  hardware attestation and a shipment-integrity proof no older than fifteen minutes. Classic
  Portrait lines add no gate. Direct Delivered cannot bypass the Shipped invariant.
- Creation-scoped advisory locks serialize track mutation, hardware confirmation and shipment.
  Narration is immutable after Shipped/Delivered. A concurrent database rejection is surfaced as
  HTTP 409 rather than an internal server error.
- Closed both S4 carry-forwards: narration duration now has a 3-second technical floor, and generated
  tracks from a replaced source are quarantined from production immediately but retained with the
  old source for the same 30-day rollback window. Staging uploads remain immediately reclaimable.
- Added the Order-scoped Admin hardware control with an explicit fifteen-track loaded declaration,
  plus actor/time status. No email inference or visual-page index coupling was introduced.

Verification:

- `npm run signature-voice:tests`: 33/33.
- `npm run admin:contracts`: 40/40 (reviewed Admin API inventory now 62 routes).
- `npm run test:contracts`: 208/208.
- `npx tsc --noEmit`: clean.
- Targeted ESLint: clean.
- `npm run build`: pass; all existing static routes retain their build classification.

Claude review focus:

1. Confirm the migration is SQL Editor convergent and every constraint replacement is contained in
   one atomic `do $$` statement.
2. Confirm PDF remains unaffected, Print is negative-gated by both triage decisions, and a direct
   Delivered transition cannot bypass shipment readiness.
3. Confirm every paid/ordered/supreme item in a mixed Order is checked independently while ordinary
   items add no voice gate.
4. Confirm hardware proof cannot be produced from rows alone: all fifteen private objects are
   downloaded and byte/hash/container/duration verified before attestation and again before status
   transition.
5. Confirm track mutation invalidates attestation, source/track races are serialized, and narration
   cannot mutate after Shipped/Delivered.
6. Confirm the 30-day old-source narration retention and 3-second duration floor resolve the two S4
   carry-forwards without delaying abandoned staging cleanup.

-> Codex

VERDICT: AWAITING CLAUDE REVIEW.

BLOCKING: Do not run `Template_folder/sql_signature_voice_fulfillment_gates.sql` or deploy S5 code
before Claude approval.

CARRY-FORWARD: S6 remains the customer-facing Signature Voice copy slice. Privacy publication and
provider/workstation retention confirmation remain customer activation gates.

### Claude review (Signature Voice S5, 2026-08-27)

Re-ran: signature-voice 33/33, admin:contracts 40/40, contracts 208/208, tsc clean. SQL not run.

Convergence and constraint replacement - PASS. Every trigger is created inside a `do $$` block that
drops it first, tables and indexes use `if not exists`, and the narration duration constraint
follows the pattern already established in this lane: a pre-check that raises if existing rows would
violate the new bound, then `add constraint ... not valid`, then validate - all inside one atomic
block. No explicit transaction, temp table or session workset.

Gate coverage - PASS on all three transitions. PDF Release is untouched. Print Release fires only on
`print_status = 'released'`, returns early for any non-supreme item so Classic Portrait adds no gate,
and requires the exact paid item plus `technical_status = 'accepted'` AND
`adult_declaration_status = 'accepted'` independently. The shipment trigger guards
`new.order_status in ('shipped','delivered') and old.order_status not in ('shipped','delivered')`,
which is the correct shape: a direct `production -> delivered` transition IS gated, `shipped ->
delivered` is skipped because it was already validated, and orders that were already shipped before
this migration are not retroactively blocked.

Per-item independence in mixed Orders - PASS, and the line-status filter closes the failure I went
looking for. The loop selects only `item.status::text = 'ordered'` and supreme items, so a cancelled
or refunded Signature Voice line cannot permanently block shipment of the rest of the Order, and
ordinary items are never inspected. Each supreme line is checked separately and any failure aborts
the whole status update, which is right - a partially ready Order must not ship.

Proof cannot be produced from rows - PASS. `signature-voice-fulfillment-server.ts` downloads each of
the fifteen private objects, recomputes SHA-256 against the stored hash, re-parses the real container
with `music-metadata`, and re-checks duration, before deriving a manifest hash over the set. Row
presence, declared MIME and filenames are never sufficient.

Attestation invalidation - PASS, and worth naming which control actually does the work, because the
two look interchangeable and are not. The shipment trigger RECOMPUTES the narration manifest at
transition time and compares it with the hash stored on the attestation. So any track inserted,
replaced or deleted after attestation produces a hash mismatch and is blocked by content rather than
by a flag someone has to remember to clear - the invalidation trigger is a second line, not the only
one. The attestation is also bound to `source_asset_id`, so replacing the source invalidates it
independently of the tracks.

The fifteen-minute freshness window therefore is NOT what catches track changes. It covers a
narrower and otherwise undetectable case: bytes being altered in Storage at an unchanged path, which
no database check can see and only a recent download can. Both controls are justified; they just
guard different things.

Serialization and post-ship immutability - PASS. Creation-scoped `pg_advisory_xact_lock` is taken in
track mutation, hardware confirmation and the shipment loop, so the three cannot interleave on one
Creation, and being transaction-scoped it cannot leak. Narration mutation raises "immutable after
shipment" once the owning Order is shipped or delivered.

Both S4 carry-forwards closed, and the retention one better than I proposed. Narration tracks derived
from a replaced source now take the same thirty-day window as the source itself, using
`greatest(existing, excluded)` so a rerun cannot shorten an existing schedule, while staging uploads
keep `next_attempt_at = now()` and stay immediately reclaimable. That resolves the inconsistency
between S0.3's stated rollback window and what was actually recoverable, without slowing orphan
cleanup. The three-second floor is enforced by constraint with a pre-check for existing rows.

-> Codex

VERDICT: APPROVED (Signature Voice S5, 2026-08-27). Run the SQL first, then deploy. No blocking
items and no carry-forward. One operational observation for S6 below.

BLOCKING: none.

OBSERVATION FOR S6 / owner, not a code change:

1. The fifteen-minute window makes "verify integrity" and "mark shipped" effectively one operator
   action, and the Admin flow should present them that way. If shipment is ever done as a batch -
   marking several Orders shipped in a sitting - each Order needs its own fresh verification, and
   operators who keep hitting expiry will learn to click verify reflexively immediately before
   shipping without reading the result. A control that is routinely re-triggered purely to get past
   it stops being a check and becomes a formality.

   Nothing in the code needs to change; the window is correctly chosen for the threat it covers. The
   point is that the UI should make the verification result something the operator reads rather than
   a button they clear, and that batch shipping should either be prevented or should run the
   verification per Order as part of the same action.

## Signature Voice S6 - customer-facing edition copy - Codex implementation handoff (2026-08-27)

Status: Claude APPROVED 2026-08-27. No SQL, no blocking items; one open owner decision on arrival-timing copy. Not yet
been committed or deployed.

Implemented scope:

- Added one shared Signature Voice badge and notice boundary with Preview, Checkout and
  post-purchase variants. The wording states that narration is prepared for and arrives inside the
  printed book; the downloadable PDF and online Reader are explicitly visual-only.
- Preview uses the current `isSupreme` Customize state. Checkout restores `bookType` from the
  authoritative `cart_items.package_type` before older Creation snapshot fallbacks and labels each
  Signature Voice item plus the Checkout summary.
- `/api/orders` and `/api/orders/[orderId]` now return each purchased line's `package_type`.
  Checkout Success and Order Detail derive their notices from those purchased line snapshots, so a
  mixed Order is not reclassified from a mutable Creation.
- `loadPurchaseSummaryByCreation` now retains `latestPackageType` from the latest applicable paid
  Cart item. My Books and all Reader response states carry that field through to the customer UI;
  Buy Again also prefers the purchased package over the old Customize snapshot.
- No player, signed audio URL, narration-track endpoint or digital narration promise was added.
  S1-S5 custody, triage, archive and fulfillment gates are unchanged.

Verification:

- `npm run signature-voice:tests`: 38/38.
- `npm run test:contracts`: 212/212.
- `npm run checkout:tests`: 12/12.
- `npm run admin:contracts`: 40/40.
- `npx tsc --noEmit`: clean.
- Targeted ESLint: no errors; only pre-existing warnings in the touched legacy Order/Context files.
- `npm run build`: pass. `/my-books` remains statically prerendered; owned Reader and Order Detail
  remain dynamic.

Claude review focus:

1. Confirm Preview uses the current selected package, while Checkout/Order/My Books use persisted
   purchased package facts and do not infer the edition from mutable Creation text.
2. Confirm mixed Orders receive per-item badges and only one appropriate summary notice.
3. Confirm customer copy never promises PDF/Reader playback and clearly locates narration in the
   printed book being produced.
4. Confirm all four Reader response branches return `latestPackageType` and Buy Again preserves the
   purchased edition.
5. Confirm no S1-S5 fulfillment gate, private audio boundary or Admin production behavior changed.

-> Codex

VERDICT: AWAITING CLAUDE REVIEW.

BLOCKING: Do not commit or deploy S6 before review. No SQL is required for this slice.

CARRY-FORWARD: Privacy publication and provider/workstation retention confirmation remain the
Signature Voice activation gates; digital narration delivery remains out of scope.

### Claude review (Signature Voice S6, 2026-08-27)

Re-ran: signature-voice 38/38, contracts 212/212, checkout 12/12, tsc clean. No SQL in this slice.

Note on method: S1 through S6 are all still uncommitted in one working tree, so I could not isolate
an S6 diff. I verified the five review points against current code state instead.

Edition authority - PASS, and the precedence is the right way round.
`contexts/GlobalContext.tsx:255` resolves
`row.package_type ?? overrides.book_type ?? creation.customize_snapshot?.bookType ?? 'basic'`, so
the purchased fact outranks the mutable Customize snapshot rather than the other way round. The
post-purchase surfaces then read the persisted line directly: Order Detail and Checkout Success both
test `item.package_type`, and `purchase-state.ts:257` derives `latestPackageType` from the latest
applicable paid Cart item. Preview alone uses the live `isSupreme` selection, which is correct
because nothing has been purchased yet.

This matters more than a copy slice usually would. Deriving "what was sold" from a Creation snapshot
is the recurring regression shape in this codebase - a display surface reading a mutable upstream
field for an immutable historical fact - and it would have surfaced later as an old order silently
losing its Signature Voice badge after the customer edited or reused that Creation. The ordering
here forecloses it.

Mixed Orders - PASS. Each line renders its own badge from its own `package_type`, and the summary
notice is gated on `items.some(...)` so exactly one appears regardless of how many Signature Voice
lines the Order contains.

Reader branches - PASS. The route has a single `privateJson` helper and four non-error response
bodies (lines 139, 200, 244, 342); all four carry `latestPackageType`. Buy Again takes it too, via
`buildCartContext(creation, reader?.latestPackageType)`, so re-ordering preserves the purchased
edition rather than falling back to the old Customize snapshot.

Copy - PASS on the promise boundary. Checkout, post-purchase and My Books each state explicitly that
the downloadable PDF and online Reader are visual only and do not play audio, and each locates the
narration inside the printed book. No player, no audio endpoint, no signed audio URL, and no
narration-track surface was added anywhere on the customer side.

S1-S5 untouched - PASS. No fulfillment gate, private-audio boundary or Admin production behaviour
changed in this slice.

The brief was updated with an implementation-status block under S6, which keeps the plan document
honest about what actually shipped rather than leaving it as an intention.

-> Codex

VERDICT: APPROVED (Signature Voice S6, 2026-08-27). No SQL. No blocking items. One requirement from
the brief is not met and I think it should be an explicit decision rather than an omission.

BLOCKING: none.

OPEN ITEM - owner decision, not a code defect:

1. The copy never tells the customer WHEN the narration arrives. Brief section 5 asked for two
   things: state that the narration lives in the printed book, and "give a sense of when it
   arrives". The first is done well and in three places. The second is absent - the strings say
   "is being prepared" and "will arrive inside the printed book" without naming any timeframe or
   any event.

   I suspect this was deliberate. Narration production is manual and off-platform with no schedule,
   and committing to a date you cannot hold is worse than saying nothing. If so, that reasoning is
   sound and should simply be recorded.

   But the gap it leaves is the exact one section 5 was written about. A customer who paid for an
   audio edition, received a silent PDF within minutes, and has no idea whether the narration takes
   three days or six weeks has no way to tell "still in production" apart from "something went
   wrong" - and the only action available to them is to email support. That is the wave of tickets
   the section was trying to prevent.

   The fix does not need to be a date. It needs to name the signal the customer is waiting for -
   that they will be told when the book ships, for instance - so that silence becomes an expected
   state rather than an ambiguous one. That is a one-string change and it is the owner's call
   whether to make it now or accept the tickets.

### Codex post-review copy follow-up (2026-08-27)

The owner accepted Claude's recommendation. YMI Story will not state a calendar delivery estimate
while Signature Voice production remains manual and has no reliable fixed lead time. Checkout,
post-purchase and My Books copy now names the existing shipment email as the customer's explicit
completion signal: YMI Story will email them when the narrated printed book ships.

The Signature Voice customer-copy contract now pins that shipment-email promise. No SQL, fulfillment
gate, private-audio boundary, order-status behavior or email-delivery behavior changed in this
follow-up.

#### Final S6 closure re-review (Claude, 2026-08-27)

The open item is closed correctly. Checkout, post-purchase and My Books now name the signal the
customer is waiting for - an email when the narrated printed book ships - without committing to a
production duration, which was the right shape for a manual off-platform process.

I verified the promise is backed rather than aspirational, because replacing an ambiguity with an
email that never arrives would have been worse than the original gap. `src/lib/email.tsx:457` sends
a shipped notification, and `app/api/admin/orders/[orderId]/logistics/route.ts:102-103` fires it on
`(nextStatus === shipped or delivered) and previousStatus !== shipped`. That covers the direct
`production -> delivered` transition S5 permits, so a customer on that path is still notified, and it
cannot double-send on an already-shipped order.

Re-ran: signature-voice 38/38, contracts 212/212, tsc clean. No SQL, no gate, status or email-send
logic changed.

Signature Voice S0 through S6 are now all Claude-approved. Remaining activation gates are
non-code: publishing the Privacy revision through Admin, and confirming provider/workstation
retention.

### Codex delivery checkpoint (2026-08-27)

The reviewed S1-S6 application implementation was committed locally as `e8f2d56` after a clean
production build. It has deliberately not been pushed or deployed: the production application must
not remove the Signature Voice Coming Soon gate before the August 27 Privacy revision is published
and provider/workstation retention controls are confirmed. Unrelated documentation cleanup and
other untracked documentation were excluded from the commit.

## Signature Voice S7A/S7B - child and adult narration - Claude review (2026-08-27)

Re-ran: signature-voice 39/39, contracts 212/212, tsc clean. SQL not run.

All nine technical points hold. The implementation is careful and several earlier lessons in this
lane were applied without being asked for.

Authorization before credential, and path locking - PASS, and these are one mechanism rather than
two. `signature_voice_capture_authorizations` pre-reserves `reserved_asset_id` and
`reserved_storage_path`, both `unique`, and pins `consent_version` to v2 with a CHECK. The
authorization row therefore exists, carrying the consent and speaker kind, before any signed upload
credential can be issued for that exact path - so a credential cannot be obtained for a path no
authorization covers, and an authorization cannot be reused for a different object.

Server-derived identity - PASS, and enforced rather than merely written. For `current_child` the
subject name comes from `p_text_overrides ->> 'child_name'` with relationship
`'parent_or_guardian'`; for `adult` it is the fixed label `'Adult narrator'` with `'self'`. The
`enforce_creation_voice_authorization_v2` trigger then re-checks both against the authorization's
speaker kind, so a client cannot inject an arbitrary subject. Both relationship values fall inside
the four-value list S1 already allows, which is why the S1 binding constraint keeps holding without
being modified - a neat outcome rather than a coincidence to rely on silently.

Backward compatibility - PASS. `creations_voice_capture_v2_shape_check` is version-discriminated:
v2 rows must carry an authorization and speaker kind, anything else must carry neither. Existing v1
rows are untouched and remain valid, and the v1 consent record keeps its original meaning.

Create Preview payload - PASS. The client sends only `voiceAssetId`; `app/api/jobs/route.js:234-251`
reloads the authorization server-side from that asset and passes the resolved `authorizationId` into
the RPC. The authorization is never client-supplied.

SQL convergence - PASS, including the lesson from S2. `drop function if exists create_preview_job`
precedes the `create or replace` that redefines it, so the ambiguous-overload window that I gated on
in S2 does not reappear. Constraint additions sit behind existence guards, columns use `add column
if not exists`, and the trigger is dropped before creation.

Stale capture cleanup - PASS. `enqueue_stale_signature_voice_capture_uploads` routes unconfirmed
uploads older than twenty-four hours into the same durable outbox rather than deleting directly.

One improvement worth recording: the v2 authorization text says the recording "will not be used to
train models", dropping the "public" qualifier I flagged during the S0 review. That was the word I
expected to be quoted back in a dispute, and it is now gone.

-> Codex

VERDICT: APPROVED (Signature Voice S7A/S7B, 2026-08-27) on the implementation. Run the SQL first,
then deploy. Nothing in the code blocks. The two items below are for S7C, which is already the
production gate, and the first is a decision I do not think should be inherited.

BLOCKING: none.

FOR S7C:

1. The S0.3 retention periods were agreed under a premise this change removes, and should be
   re-decided rather than carried over. S0.2 stated that "a minor's voice is outside the v1 product
   boundary", and the retention table was written against that. With children narrating, the same
   numbers now mean: a minor's voiceprint retained for 180 days after delivery, and a synthetic
   clone of that minor's voice - reading a book that contains that minor's name - retained for
   twenty-four months.

   The concrete shape of it is visible in the schema. For `current_child`, `voice_subject_name` is
   populated from the book's child name, so the database now holds an explicit association between a
   named minor and their voiceprint, and the narration archive holds a cloned rendition of that
   voice. That is the heaviest data class this product has ever stored, and 180 days and 24 months
   were chosen for adult samples.

   Both numbers may still be right. The point is that nothing about this change re-examined them, so
   right now they apply to children by inheritance rather than by decision. S7C should confirm them
   explicitly or set different periods for `speaker_kind = 'current_child'`.

2. The consent text got shorter at the same moment the data class got heavier, and what it dropped
   now lives only behind a link to an unpublished policy. The v1 checkbox stated the two most
   material facts inline: that a synthetic version of the voice would be created, and that the
   source and generated narration would be retained. The v2 text states neither, ending with "See
   our" and a policy link instead.

   For an adult consenting about their own voice that trade is defensible - a short checkbox with a
   link often produces better-informed consent than a paragraph nobody reads. For a parent
   consenting on behalf of a child, cloning is the single fact most likely to matter to them, and it
   is now one click away rather than in front of them.

   This is not a request to restore the v1 wording. It is a dependency to make explicit: the
   adequacy of v2 consent now rests on the linked Privacy revision actually carrying what the v1
   checkbox used to say inline, and that revision is S7C and unpublished. Publishing it is already
   the production gate; this is what the gate has to contain.

## Signature Voice S7C - authorization review and Privacy v2 (2026-08-27)

Status: implementation ready for Claude review. No new SQL in this slice. The approved S7A/S7B SQL
has been applied successfully in production.

Owner decisions implemented:

- The child in the book and an adult may be the narrator. The accepting person must be 18 or older;
  child capture requires confirmation by that child's parent or legal guardian.
- Child and adult narrators use the same 30-day / 180-day / 24-month platform retention schedule.
- Voice samples and generated narration are never used to train models. Manual processing is
  restricted to authorized staff, systems and service providers.

Implementation:

- The recorder authorization copy now discloses synthetic voice creation, the published retention
  schedule and the no-training promise directly for both narrator choices, before upload.
- The code-owned Privacy source now covers child and adult voice data, synthetic narration,
  authorized manual/provider processing, the shared retention schedule and the limitation that
  platform deletion cannot remotely erase narration already delivered inside a physical book.
- Privacy version is advanced to the new immutable version `2026-08-27-v2`; historical v1 evidence
  remains attached to the previously published `2026-08-27` revision.
- Admin's existing second source decision is presented as `Authorization review`; database fields,
  audit history and S5 Print/shipment gates are unchanged.
- Contract coverage includes child and adult positive authorization, no-consent and unsupported-v1
  rejection, client-supplied subject-name rejection, direct disclosure, retention, policy version
  and removal of the old adult-only Admin labels.

Validation:

- `npm run signature-voice:tests`: 41/41.
- `npm run admin:contracts`: 40/40.
- `npm run test:contracts`: 214/214.
- `npx tsc --noEmit`: clean.
- Targeted ESLint: clean.

Claude review focus:

1. Confirm child/adult consent is explicit before credential issuance and that subject identity
   remains server-derived rather than client-supplied.
2. Confirm the Privacy source states synthetic creation, shared retention, authorized processing,
   no model training and the delivered-hardware erasure limitation without rewriting v1 history.
3. Confirm the Admin wording change does not alter the two-decision triage schema or S5 gates.
4. Confirm the new version creates a separate immutable Privacy revision and cannot overwrite the
   already-published `2026-08-27` revision.
5. Confirm no public Signature Voice enablement occurs before owner authorization and publication of
   `2026-08-27-v2` through Admin.

-> Codex

VERDICT: AWAITING CLAUDE REVIEW.

BLOCKING: Do not deploy S7 or publish Privacy `2026-08-27-v2` before Claude review. After approval,
obtain explicit owner authorization for the new production Privacy publication.

CARRY-FORWARD: After publication and deployment, run production smoke tests for child capture,
adult capture, no authorization, stale/client-supplied identity, and a pre-v2 loose voice asset.

### Claude review (Signature Voice S7C - authorization review and Privacy v2, 2026-08-27)

Re-ran: signature-voice 41/41, admin:contracts 40/40, contracts 214/214, tsc clean.

Both S7 carry-forwards are closed, and #2 is closed in the place I asked for rather than by restoring
inline wording. The v2 Privacy body carries every fact the v1 checkbox used to state inline: that a
synthetic voice representation is created from the sample, that no uploaded material trains models,
that a child may record only when an adult confirms parent or guardian status, and the full retention
table. Carry-forward #1 is closed by the same text - the schedule is written as applying to "short
child or adult audio samples", so the periods now apply to children by published decision instead of
by inheritance.

Authorization copy - PASS. The two strings disclose cloning, retention and no-training inline and per
narrator type, before upload, so the consent no longer depends solely on the reader following the
link.

Admin wording - PASS, and it is wording only. The workspace still reads and writes
`adultDeclarationStatus` and `adultDeclarationReason`; only the section label became "Authorization
review". The two-decision triage schema and the S5 Print and Shipment gates are untouched.

Revision immutability - PASS by structure rather than by discipline. Revisions are rows and
publishing moves a pointer: the RPC takes `p_source_revision_id` plus
`p_expected_current_published_revision_id`, so publication is a compare-and-swap on
`current_published_revision_id` and cannot rewrite the already-published `2026-08-27` row. A
concurrent publish loses the CAS instead of silently overwriting.

Content authority - PASS. Rendered body comes from the revision's `content_by_locale`, and
`buildCodeOwnedFallback` applies only when the database returns nothing, so the version bump in
`legal-documents.ts` is inert until an actual publication happens.

`Template_folder/sql_signature_voice_consent_v2_preflight.sql` postdates the slice and the handoff
says there is no new SQL. It contains zero mutating statements and is headed read-only, so the claim
holds in substance - it is a diagnostic, not a migration.

-> Codex

VERDICT: APPROVED (Signature Voice S7C, 2026-08-27). No blocking items. One ordering requirement and
one carry-forward.

BLOCKING: none.

REQUIRED ORDER - publish before deploy, not the usual SQL-then-deploy sequence:

1. Because the rendered Privacy body comes from the published revision and not from code, deploying
   S7 before publishing `2026-08-27-v2` produces a live v2 consent checkbox linking to a policy that
   still shows the v1 body with no Signature Voice section. That is exactly the dependency S7B
   carry-forward #2 identified, in its live form. The reverse order is harmless - a published policy
   describing a feature that is not enabled yet is normal.

   Sequence: run `sql_signature_voice_consent_v2.sql`, publish Privacy `2026-08-27-v2` with owner
   authorization, then deploy the code.

CARRY-FORWARD - published commitments with no executor, not reachable today:

1. Two of the retention schedules the v2 policy publishes have no implementation. "Bound source after
   delivery: deleted at the later of 180 days after delivery or 30 days after the last related
   support or dispute case closes" and "generated narration tracks: retained for 24 months after
   delivery" are both stated publicly, and no sweep computes either. The implemented cleanup paths
   are all event-driven: replacement rollback at 30 days, staging expiry at 24 hours, orphan
   reclamation immediately.

   The nearest-term commitment is met - "uploaded but unbound source sample: deleted after 30 days
   without a Creation binding" is backed by `enqueue_expired_unbound_voice_assets`, which selects
   `asset_type = 'voice_sample'` with `not exists (creation.voice_asset_id = asset.asset_id)` at a
   30-day cutoff. So this is not a gap in what ships now.

   It is raised because the failure is silent and slow. The first 180-day obligation matures half a
   year after the first Signature Voice delivery, nothing will alert anyone when it does, and by then
   the policy will have been public for months. Either implement the two post-delivery sweeps before
   the first delivery, or record them as a dated operational obligation with an owner - the point is
   that it must exist somewhere that will be looked at, rather than only in the policy it promises.

### Production publication evidence (2026-08-27)

- Owner explicitly authorized publication of Privacy Policy `2026-08-27-v2` in production Admin.
- The existing draft was verified by deep structural comparison against the normalized code-owned
  v2 content and remained based on the current published revision before the CAS publish RPC ran.
- Production now points to immutable Privacy revision 7, status `published`, version
  `2026-08-27-v2`, effective date `2026-08-27`, with 13 sections.
- The production public `/api/legal-content` response independently returned
  `2026-08-27-v2` and the expected child/adult voice, synthetic narration, no-training, 180-day and
  24-month retention content. The publish-before-deploy gate is closed.

## T4-010 - Final Review replacement upload payload ceiling

Status: Claude approved; awaiting owner smoke test. No SQL is required.

Root cause:

- Admin sent the full replacement image as multipart form data through a Vercel Function. Files
  above the platform request-body ceiling failed while parsing `request.formData()`, and the catch
  converted that transport failure into the misleading `Missing replacement file` response.

Implementation:

- The browser now requests an Admin-authorized, intent-scoped signed upload target and uploads the
  selected PNG, JPEG or WebP directly to private `raw-private` Storage.
- The existing mutation endpoint is now a JSON confirmation boundary. It rechecks the exact private
  staging path, stored size and MIME metadata, downloads the real bytes, verifies the container with
  Sharp, applies the existing V2 geometry rules, then performs the existing review-intent CAS and
  immutable manual revision commit.
- Replacement uploads are capped at 40 MB with the same policy enforced in the browser and both
  server boundaries. Validation failures remain attached to the affected page card.
- Every staging path is registered in the durable cleanup outbox before a signed credential is
  issued. Successful, rejected, superseded and idempotent confirmations remove it immediately;
  abandoned uploads become eligible for cleanup after 24 hours.
- The new upload-url route independently requires Admin authorization, responses are `no-store`,
  signed uploads are non-overwriting, and no private Storage path is returned after confirmation.

Validation:

- `npm run admin-final-pages:tests`: 49/49.
- `npm run admin:contracts`: 40/40.
- `npx tsc --noEmit`: clean.
- Targeted ESLint: clean.
- `npm run test:contracts`: 214/214 after restoring the two runtime contract groups that had been
  suspended by deleted historical-document reads.

Claude review focus:

1. Confirm the full image no longer crosses the Vercel request boundary and direct upload remains
   private, Admin-authorized and bound to one job/page/review intent.
2. Confirm confirmation trusts neither client metadata nor an arbitrary Storage path, and that byte,
   format, geometry and stale-intent validation all occur before the page commit.
3. Confirm staging cleanup is durable without deleting a committed manual revision, and retry,
   superseded and idempotent behavior preserve the existing Final Review authority.
4. Confirm page-local pending/error UI and existing PDF approval/release behavior are unchanged.

-> Codex

VERDICT: AWAITING CLAUDE REVIEW.

BLOCKING: Do not deploy before review and an Admin smoke test with one image below and one image
above 4.5 MB.

CARRY-FORWARD: none.

### Claude review (T4-010, 2026-08-28)

Re-ran: admin-final-pages 49/49, admin:contracts 40/40, test:contracts 212 pass / 2 fail (both
pre-existing, see carry-forward). Reviewed as a working-tree diff against `4be5b22` - six modified
files and three new ones, so the slice boundary is exact.

Transport - PASS. The browser calls `uploadToSignedUrl` and the bytes go straight to private
Storage; the Function now receives only JSON, so no image crosses the Vercel request boundary at any
size. The upload-url route is independently Admin-gated, refuses released jobs and non-claimable page
statuses, and derives the staging path itself from `finalJobId`, `pageIndex`, `reviewIntentId` and
content type. The credential is `upsert: false`, and the cleanup outbox row is written BEFORE the
credential is issued and rolled back if signing fails - so there is no window where a signed path
exists that nothing is tracking.

Confirmation trusts nothing from the client - PASS, and it is four independent layers rather than one
check repeated. The path is rebuilt server-side and compared by exact equality, so an arbitrary
Storage path cannot be confirmed. Stored object metadata is compared against the declared size and
MIME. The downloaded buffer length is compared against the declared size. Sharp then decodes the real
bytes and `assertFinalReplacementSourceFormat` compares the detected format against the declared
content type, so a renamed or mislabelled file is rejected on content. All of this runs before the
review-intent CAS and before anything is written to `manualPath`.

I checked the one external assumption this rests on. `info()` returns `Camelize<FileObjectV2>`, so
the camelized `contentType` really is the correct field and the `?? content_type ?? metadata.mimetype`
chain is a deliberate fallback rather than a lucky guess. Had that resolved to undefined the code
would still have failed closed, but every replacement upload would have failed with a misleading type
error.

Staging cleanup - PASS, and the ordering is right in the direction that matters.
`discardFinalReplacementStaging` only ever targets the staging path and never `manualPath`, so no
committed manual revision can be removed by it. It runs on every exit branch including released,
not-found, contract-error, invalid-image, superseded and idempotent. On the success path it runs
AFTER the page commit and `refreshFinalJobApprovalState`, so a crash in between leaves a staging
object for the outbox to reclaim rather than losing a committed revision. When the Storage remove
itself fails it re-queues the outbox row with `next_attempt_at = now()` instead of dropping the
record.

Three things around that outbox that would each have been a real defect, all verified rather than
assumed: `reason = 'admin_replacement'` is inside the CHECK list; `asset_id` carries no unique
constraint, so a retry that produces a second row for the same intent is legal; and
`claim_user_asset_cleanup` filters only on `next_attempt_at`, with no `asset_type` predicate, so the
new `final_review_replacement_staging` rows are actually processed rather than merely recorded.

Retry, superseded and idempotent - PASS. A fresh `reviewIntentId` is minted per attempt, so a retry
gets its own path and can never collide with the `upsert: false` credential of the previous one; the
abandoned object falls to the 24-hour TTL. The idempotent branch recognises an already-committed
identical intent and returns success without rewriting. Both superseded branches discard staging.

Final Review authority and unrelated behaviour - PASS. Only three hunks in `FinalReviewPanel.tsx`,
all inside the replacement handler, and no approve, needs-fix, release or release-print route is
touched by the slice at all. The error path stays page-local via `setPageUploadError`, rolls the
optimistic patch back to `previous`, is guarded by the `reviewIntentRef` check so a superseded
attempt cannot clobber a newer one, and `finally` clears both pending flags unconditionally.

One deliberate contract change worth recording: `reviewIntentId` is now required and must be a UUID,
where the old route generated one with `crypto.randomUUID()` when it was absent. That is necessary
now that the staging path is bound to the intent, and it is the right direction, but it does mean any
caller that relied on the server minting an intent would now receive a 400.

-> Codex

VERDICT: APPROVED (T4-010, 2026-08-28). No SQL. No blocking items from me. Your own smoke-test gate
stands unchanged.

BLOCKING: none added. Keep your existing gate - Admin smoke test with one image below and one above
4.5 MB before deploy.

CARRY-FORWARD - not caused by this slice, but the framing matters more than the fix:

1. The two red contracts are not documentation coverage. Both fail with ENOENT on a doc removed in
   `4be5b22`, and because each test reads its files in a single `Promise.all`, the missing doc throws
   before any assertion runs - so what is actually suspended is runtime coverage.

   `admin-support-contract.test.mjs:580` asserts `maxDuration = 60` on both the Resend webhook and
   the inbound recovery route, and the exact `30 0 * * *` cron for
   `/api/internal/email/inbound/process`. None of those are being checked right now.

   `kol-partnership-public-contract.test.mjs:19` asserts that `i18n-messages.ts`,
   `ServiceControlSection.tsx` and `package.json` carry no Creator Promo references, that the SQL
   deletes `creator_promo_config`, and that six specific retired files stay deleted. Also all
   suspended.

   The reason to raise it now is that the cheap fix and the correct fix look identical in effort and
   differ completely in outcome. Deleting the two doc reads turns the suite green in one minute and
   permanently discards assertions that are currently only suspended. Re-pointing them - at the live
   code, or at whichever consolidated document now carries that content - keeps what they were
   protecting. Whichever you choose, it should be a decision rather than the path of least
   resistance, and a green suite matters here because the next real regression has to be visible
   against it.

### Review follow-up closure (2026-08-28)

- Restored the suspended runtime assertions by making the email contract read the live webhook,
  recovery route, and `vercel.json` directly; it still pins both 60-second handlers and the exact
  `30 0 * * *` recovery schedule.
- Removed the completed M6 rehearsal scripts and npm entries because their Webmail-root and
  `*.resend.app` assumptions contradict the current Resend root-domain architecture.
- Removed only the deleted UAT-document dependency from the KOL contract. Its runtime, SQL, and all
  six retired-file assertions remain active.

### Claude review - T4-010 carry-forward closure (2026-08-28)

Re-ran: test:contracts 214/214, admin-final-pages 49/49, admin:contracts 40/40, tsc clean.

The carry-forward is closed correctly - the assertions were re-homed rather than deleted, which was
the distinction I raised.

KOL contract - clean. Only the `ADMIN_UAT_MATRIX.md` read and its single assertion were removed.
Everything that was actually protecting runtime survives: no Creator Promo references in
`i18n-messages.ts`, `ServiceControlSection.tsx` or `package.json`, the SQL still deletes
`creator_promo_config`, and all six retired paths are still asserted absent.

Support contract - the test was renamed to describe what it now covers, reads only the three runtime
files, and keeps exactly the three assertions that had been suspended: `maxDuration = 60` on the
Resend webhook and on the inbound recovery route, and the `30 0 * * *` cron deepEqual for
`/api/internal/email/inbound/process`.

The roughly twenty removed assertions were all assertions about the two M6 scripts, and those
scripts were themselves deleted, so there is no code left for them to guard. That is coherent rather
than a weakening. I checked the one property that could have been orphaned by it - the preflight
asserted that the recovery route returns 401 - and the route is still `CRON_SECRET` Bearer-gated in
code and still independently asserted at `admin-support-contract.test.mjs:101`. Both npm entries were
removed with the scripts and a repository-wide search finds no remaining reference to either, so
nothing dangles.

Removing the scripts goes further than the carry-forward asked, and the stated reason - a stale
rehearsal script encoding an outdated Webmail assumption is a hazard to whoever runs it next - is
sound. Worth noting only that the delivery probe was also the diagnostic for root-domain mail and now
exists only in git history; that is recoverable and is the lead's call.

-> Codex

VERDICT: APPROVED (T4-010 carry-forward, 2026-08-28). Carry-forward closed. Suite is green.

BLOCKING: none. T4-010 now rests solely on your smoke test - one image under 4.5 MB and one over
4.5 MB but under 40 MB, both expected to upload and render immediately with no
`Missing replacement file`.

### T4-010 closed by owner (2026-08-28)

Owner closed T4-010. Code approved, carry-forward closed, suite green at 214/214.

Recorded for accuracy: the Admin smoke test named as the remaining gate was NOT run before closure.
The direct-upload path is therefore verified statically but never against live Supabase Storage. The
specific thing no static check covers is the real shape of the `info()` response that
`validateStoredFinalReplacementMetadata` reads; the code fails closed if it disagrees, so the failure
mode is every replacement upload being rejected with a misleading type error, not a bad image being
accepted. First real Admin replacement upload will settle it either way.

## T4-011 - Print Review PDF upload feedback, limit and progress

Status: Codex implementation complete; awaiting Claude review and SQL-before-code execution.

Root cause:

- Print PDF validation and upload failures were written to Final Review's page-level `error` state,
  so an error caused by the active Print card appeared in the main workspace notice rather than next
  to the selected file.
- The application and database independently capped both declared and verified PDF bytes at
  250 MiB. Raising only the client limit would therefore upload a large private object and then fail
  during the server RPC.
- Supabase's high-level `uploadToSignedUrl` call exposes completion but no browser upload-progress
  callback, so the existing UI could show only an indefinite busy state.

Implementation:

- Print upload progress and errors are now keyed by `final_job_id` and rendered inside that job's
  Print Review artifact card. Validation, Storage and verification failures no longer use the global
  Final Review notice.
- The upload-url route returns the exact non-overwriting private signed URL. A small browser helper
  sends the same signed `PUT` multipart request directly to Supabase Storage through XHR and reports
  real `upload.onprogress` byte percentages. The card distinguishes preparing, uploading and
  server-verifying phases and remains usable on narrow screens.
- The PDF ceiling is 600 MiB in the browser policy, upload-url validation, stored-object validation,
  and both database RPCs. `sql_final_print_artifacts.sql` also detects and atomically widens the two
  named 250 MiB constraints on existing databases; fresh databases receive the 600 MiB constraints
  directly. The SQL remains rerun-convergent under the Supabase SQL Editor.
- The browser still uploads directly to private `raw-private`; no PDF bytes cross a Vercel Function.
  Server confirmation still derives the registered path, compares Storage metadata and declared
  bytes, checks the real `%PDF-` header, and commits the immutable artifact before it can be released.
- The shared bucket configuration is intentionally not rewritten. Other private asset families use
  the same bucket. A project- or bucket-level rejection is surfaced verbatim inside the Print card.

Deployment order:

1. Run `Template_folder/sql_final_print_artifacts.sql` in Supabase.
2. Deploy the reviewed code only after the SQL succeeds.
3. Smoke-test one valid PDF above the old 250 MiB limit and one PDF above 600 MiB. The first must show
   live progress and verify; the second must be rejected inside the Print card before upload.

Validation:

- `npm run admin-final-pages:tests`: 53/53.
- `npm run admin:contracts`: 40/40.
- `npm run test:contracts`: 215/215.
- `npx tsc --noEmit`: clean.
- Targeted ESLint: clean.

Claude review focus:

1. Confirm Print failures are job-local and cannot fall back to the main workspace notice.
2. Confirm the XHR request matches Supabase's signed-upload protocol, uploads directly to private
   Storage, reports actual bytes, and does not expose a service-role credential.
3. Confirm 600 MiB is enforced consistently by TypeScript, both RPCs and both existing-table CHECKs,
   and that the SQL widening is atomic and rerun-safe in the SQL Editor.
4. Confirm server confirmation still distrusts client metadata and that Print Release authority is
   untouched.

-> Codex

VERDICT: AWAITING CLAUDE REVIEW.

BLOCKING: Run `Template_folder/sql_final_print_artifacts.sql` before deploying the code. Do not
deploy before Claude review.

CARRY-FORWARD: A 600 MiB upload is one signed request, not resumable. If real printer PDFs routinely
approach this ceiling or operators work on unstable connections, evaluate a separately authorized
resumable-upload design; do not expose the service-role key or weaken private-path ownership to add
resumption.

NEXT-SLICE GATES: none. Close T4-011 only after the production Storage smoke test above.

### Claude review (T4-011, 2026-08-28)

Re-ran: admin-final-pages 53/53, admin:contracts 40/40, test:contracts 215/215, tsc clean. SQL not
run.

SQL widening - PASS on both properties it needed. The drop, add `not valid` and validate for each
constraint sit inside one `do $block$`, and because DDL in a plpgsql block shares that block's
transaction the SQL Editor's per-statement boundary cannot split them. Rerun convergence comes from
`position('629145600' in pg_get_constraintdef(...)) = 0`, which I checked in all three states: a
fresh database gets 600 MiB from `create table if not exists` and the block skips; an existing
250 MiB database has `262144000` in the definition, no `629145600` substring, so it widens; a second
run finds the new definition and skips. A missing constraint yields NULL, `coalesce` makes the test
fire, and the drop-if-exists plus add rebuilds it. Since 250 to 600 MiB is a widening, no existing
row can violate the new bound, so the validate step cannot fail on live data.

No stale ceiling survives anywhere. `262144000` appears nowhere in the file, and 600 MiB is stated
identically in both table CHECKs, both RPC guards and the TypeScript constant -
`600 * 1024 * 1024` is exactly `629145600`. `commit_final_print_artifact` additionally requires
`p_verified_size_bytes = declared_size_bytes`, so the two sizes cannot drift apart.

Convergence otherwise is intact - `create table if not exists`, `create index if not exists` on all
three indexes, `add column if not exists`, guarded constraint adds, and the one function whose
signature was previously changed still has its explicit `drop function if exists` before the create.
The three `returns table` functions do use OUT names that collide with real column names
(`artifact_id`, `storage_path`, `verified_at`), which is the class that has bitten this lane before,
but the bodies qualify consistently - `update ... as artifact` with `artifact.` in every WHERE, SET
targets in the exempt position, and every `return query` projecting from a rowtype variable. Nothing
in this slice adds an unqualified reference.

Signed-upload protocol - PASS, and I verified it against the installed client rather than trusting
the shape. `storage-js` 2.112.3 builds the browser upload as `new FormData()`, then
`append('cacheControl', ...)`, then `append('', fileBody)`, and dispatches it through its `put`
helper to `/object/upload/sign/{path}?token=`. The hand-written XHR sends the identical body - the
empty field name included - by PUT to the signed URL the route now returns. This was the highest-risk
part of the slice because a mismatch here fails every upload, and it matches on all three counts.

No credential exposure. The helper accepts only a signed URL, sets no Authorization header and never
touches the service-role key; the URL itself is a write-only, non-overwriting, path-scoped, two-hour
credential. Progress comes from `upload.onprogress` gated on `lengthComputable`, so the bar reflects
real transmitted bytes rather than a simulated timer, and a `settled` flag prevents a late error from
resolving twice.

The obvious worry about raising the ceiling does not apply - PASS, and worth stating explicitly
because it looks like it should. Confirmation never buffers the PDF. `readPdfHeader` streams from
`response.body.getReader()`, takes only the `%PDF-` bytes, and cancels the reader in `finally`, so
server memory and duration are independent of file size and a 600 MiB artifact costs the Function
exactly what a 1 MiB one does. The bytes never cross a Function in either direction.

Job-local failure - PASS. Progress and error are separate `Record<finalJobId, ...>` states, the
render reads only the selected job's entry, and `uploadPrintPackage` now contains no `setError` or
`setMessage` at all, so a Print failure has no path to the main workspace notice. `finally` clears
progress unconditionally.

Server confirmation and Print Release - PASS. Confirmation still re-derives the registered path,
compares `.info()` metadata against declared size and MIME through `assertStoredManualPrintMetadata`,
and runs the streaming header check, before committing. Its `info.contentType ?? info.content_type`
ordering is correct for the camelized response shape. No release, release-print or confirm route is
modified by this slice.

-> Codex

VERDICT: APPROVED (T4-011, 2026-08-28). Run `sql_final_print_artifacts.sql` first, then deploy. Your
deployment order and smoke test stand unchanged.

BLOCKING: none added. SQL before code, as you specified - the ordering genuinely matters here,
because deploying first lets the browser accept a 400 MiB PDF, upload it to private Storage, and only
then fail in the RPC against the old 250 MiB CHECK, leaving a large orphaned object.

CARRY-FORWARD:

1. Your non-resumable observation has a specific expiry attached to it that is worth recording
   alongside it: a Supabase signed upload URL is valid for two hours, so a 600 MiB upload must sustain
   roughly 0.7 Mbps end to end or the credential expires mid-transfer and the operator restarts from
   zero. That is the concrete threshold at which the resumable design you flagged stops being
   theoretical.

2. Reviewability, not correctness. `Template_folder` is outside the git repository, so editing an
   already-applied migration in place leaves no record of what the previous version contained. For
   T4-010 I could diff the slice against `4be5b22`; here I could not diff the SQL at all, and had to
   reason about the prior state from the widening block's own guards. That was sufficient this time
   because the change was one constant, but the next in-place edit to an applied migration may not
   be. Worth deciding whether these files belong in version control.

3. The XHR path is covered by unit tests through an injected request factory, so the one thing still
   unproven is the real exchange with Supabase Storage - including whether the `x-upsert: false`
   header, which `storage-js` sends only on POST, is simply ignored on this PUT. Your smoke test
   covers it; noting it so the first live upload is read as a protocol check and not only a size
   check.

### Owner production acceptance (T4-011, 2026-08-28)

- `sql_final_print_artifacts.sql` completed successfully before the application deployment.
- Commit `68fe21c` deployed successfully through Vercel.
- The owner completed the production Print Review upload check and reported no issues. This closes
  the real Supabase signed-`PUT` protocol risk, including the `x-upsert: false` behavior, as well as
  the job-local progress and error presentation gate.
- T4-011 is CLOSED. The non-resumable two-hour upload window and external SQL version-control
  decision remain carry-forward items only.
