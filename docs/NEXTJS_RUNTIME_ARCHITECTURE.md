# Next.js Runtime Architecture

This document records component-only runtime authority for
`ymi-books-web-1.0`. Platform status and issue sequencing remain in the root
governance repository.

## Authority rules

- Supabase template rows, mapped through the catalog domain, are the only
  runtime authority for book identity, pricing, covers, metadata, and Preview
  declarations. Static book metadata supports build-time routes and SEO only.
- Customize uses one lifecycle state machine, one form state owner, and one
  Preview job/asset/version controller. UI components do not create competing
  workflow state.
- Customer order collection and detail APIs share one server read model.
- Supplemental shipping history uses that detail read model only, not Home,
  order collections or client-to-carrier requests. Existing order statuses
  remain authoritative; shipping descriptions never infer a new lifecycle.
- Supabase user verification enters through one fail-closed Server-only
  authority. Admin, customer, optional anonymous-actor, and checkout-owner
  policies build their own authorization semantics above that verified user.
  Client-supplied customer IDs may be checked for mismatch but are not identity
  authority.
- Repeated Route Handler behavior belongs in narrowly named server-only
  modules. There is no generic catch-all utility layer.
- UI copy is currently English-only and is separate from Story Language, which
  remains personalization data.
- `GlobalContext` owns genuine cross-route client state. Pure catalog, order,
  and presentation mapping belongs in domain modules rather than the provider.
- Header Back visibility follows exact primary destinations in
  `isPrimaryNavigationRoute` (`src/lib/app-pathname.ts`): Home, Books, Favorites,
  My Books, Collaboration, Support, My Orders and Account do not render Back.
  Descendants retain ordinary history navigation; Cart retains its validated
  Preview return. Checkout and Personalize keep their dedicated Back controls.
  The rule uses the same root-layout segments for server and client output,
  not history length, mount-time state, CSS hiding or a second pathname hook.
- First-party audience reporting uses consent-gated Vercel Web Analytics. The
  protected Admin page queries Vercel's aggregate API directly through a
  server-only, project-scoped credential; YMI does not copy raw IP addresses or
  visitor-level records into Supabase.

## Current domain owners

- Logistics writes and notifications enter through
  `src/lib/order-logistics-server.ts`. Order fields/status audit share the
  database transaction; Signature Voice readiness and existing email
  idempotency remain authoritative. `order-shipping-server.ts` owns saved
  shipping reads and service-only leased sync, with `dealer-send.ts` as its
  bounded protocol adapter. See [`SHIPPING_DETAILS.md`](SHIPPING_DETAILS.md).
- Catalog reads enter through `src/lib/template-catalog-server.ts` and are
  normalized by `src/lib/book-catalog.ts`. `data/books.ts` is build-time route
  and SEO input only.
- Checkout identity and owner-scoped queries enter through
  `src/lib/checkout-owner.ts`; the underlying authenticated Supabase user enters
  through `src/lib/authenticated-user.ts`. Customer order collection and detail
  reads enter through `src/lib/customer-orders-server.ts`.
- Route Handlers use `src/lib/http-response.ts` for private/no-store JSON
  responses and `src/lib/internal-request-auth.ts` for internal-secret or cron
  authorization.
- Customize lifecycle belongs to `usePersonalizeStage`; persisted steps are
  derived from that state machine. `usePersonalizeState` owns the form and
  `usePreviewController` owns Preview jobs, assets, versions, refresh, errors,
  cancellation, and its single per-job watcher.
- Customize history enters through the owner-scoped `/api/user-assets` read
  model and `usePersonalizeHistory`. Confirmed face assets, child profiles, and
  authorized voice samples therefore share one owner transition and one client
  refresh boundary. Preview creation persists a child profile through the
  server-only `saveOwnedTextProfile` authority; the client does not issue a
  second profile write.
- The current in-progress Customize draft is browser-session state scoped by
  book and owner. It contains form values plus identifiers for an already
  confirmed face asset, never raw photo bytes or a durable signed URL. Reload
  recovery resolves that identifier against a fresh owner-authorized signed
  URL and fails back to Photo when the asset is unavailable. A newly selected
  photo remains local until the customer gives the existing Preview-generation
  consent.
- Catalogue cards share `buildPersonalizeIntroHref` in
  `src/lib/personalize-entry.ts`. Its one-shot entry marker opens Product Intro
  without discarding saved inputs or confirmed face identifiers, and is removed
  with the Next.js-integrated native History API. Unmarked reloads and explicit
  Cart/My Books resumes retain their existing recovery semantics. Header Back
  exits Customize to Books; only the form's own Back control changes form steps.
- The responsive Preview book island measures its available width before
  client paint and ignores height-only resize observations. Its closed-cover
  centering is applied on mount without an entrance translation animation.
  The drop shadow belongs to the outer scale group, not the inner
  `preserve-3d` book model. Actual page-turn animations and the Reader's fixed
  scale/height contract remain independent of responsive measurement.
- Preview creation routes map the database admission contract through
  `src/lib/jobQueueAdmission.ts`. `src/lib/jobQueue.ts` is a read-only Admin
  operations snapshot and is never an admission authority.
- Payment finalization always persists paid Final jobs. Provider throughput is
  bounded by the Worker lane and one-page-at-a-time submission, not by rejecting
  fulfillment after payment.
- Legal bootstrap dates are derived from the date prefix of the canonical legal
  version; the immutable version string remains unchanged.

## Server and client boundary

- Server Components load route-initial private or catalog data directly when a
  client refresh loop is not required.
- Route Handlers remain for client reads, signed uploads, external callbacks,
  webhooks, and cross-session HTTP contracts.
- Client Components retain browser-only interaction, media capture, Supabase
  Auth lifecycle, signed uploads, and active job refresh behavior.
- Large files are split only when doing so removes duplicate state or moves a
  stable business rule to its single authority.

## Homepage delivery boundary

- Home renders Hero directly followed by the book-category island on both
  desktop and mobile, beginning with Brand New and its own description/cards.
  There is no collections-level eyebrow/title/intro, post-Hero Banner wrapper
  or reserved space. Category headings are semantic `h2` elements beneath the
  Hero's `h1`; their visual size and the catalogue/card interaction owners stay
  unchanged.
  The catalogue's top gutter is 40px on mobile and 56px from the `md` breakpoint,
  moving its entire normal-flow content closer to Hero without negative margins,
  vertical transforms or changes to internal category/card/Banner spacing.
  `HOMEPAGE_BANNER_SLOT_KEYS` is the shared runtime allowlist for the two remaining
  positions (`after_for_boys`, `after_in_discount`). Public/Admin reads filter at
  the database query; Admin publish, upload preparation and swaps reject any
  other position before asset or mutation work. The Admin manager exposes only
  those two positions and keeps desktop/mobile assets independent. The banner
  cache uses one shared v2 key/tag with existing 300-second revalidation and
  explicit publish invalidation. Retained historical SQL/rows and shared media
  do not reintroduce the retired position; no database or Storage cleanup is
  implied by the presentation change.
- `AppShell` and `Navbar` derive route shape from the root layout's selected
  segments through `src/lib/app-pathname.ts`, so the server and hydrated client
  select the same Home shell even for Next.js bot-aware HTML streaming. Full
  pathname hooks remain limited to consumers that do not control root-shell
  structure. Descendant hydration-warning suppression is not part of this
  contract.
- Public Supabase catalog covers and published Homepage banners use the Next
  Image pipeline for viewport-sized delivery. Signed and authenticated customer
  media bypass that shared optimizer cache through
  `src/lib/storage-images.ts`.
- Hero autoplay remains a single `<video>` element. Hydration selects exactly
  one mobile or desktop source so a recovery render cannot speculatively fetch
  the other device asset. Both versioned files are silent, fast-start MP4
  assets with immutable cache headers; the smaller versioned
  `hero-poster-v2.webp` provides the first visual frame and is emitted as an
  early high-priority React resource hint.
- Below 768px, Hero uses a content-height layout: the shared 64px Home toolbar,
  borderless full-width 16:9 video, a story-page connection, compact headline/CTA and
  two-column icon/text highlights. There is no framed video or full-screen filler.
  `MobileHomeScene.module.css` owns the mobile-only translucent amber toolbar,
  static fine-grain peach/amber paper, and an open-book video-to-content seam.
  Two shallow inline-SVG page edges and one centered gold spark cross only the
  video's bottom boundary; a short paper wash dissolves into the accepted material
  below. The hidden decorative flow spacer preserves media geometry; 32px of
  mobile-only text inset separates the page crease from the headline. The old
  80px media gradient veil and pseudo-element curved lip are removed.
  These styles are scoped below 768px; they add no asset fetch or animation loop.
  All six existing facts and the Books action remain. Only Home's unscrolled
  phone toolbar uses the warm translucent material and dark controls;
  other routes and desktop transparent navigation retain their existing shell.
  The existing desktop Hero scene, fonts, bubbles and layout remain at `md` and
  wider. One cleaned-up breakpoint listener controls desktop-only fact floating,
  without choosing a second media asset on resize; reduced motion stops floating
  and retains poster-only media. CSS, not mount-time viewport state, owns layout.
- First-time or stale Cookie consent is present in server output. A small
  version-aware head bootstrap hides it before paint only when current stored
  consent is valid. Optional tracking remains unresolved until the client
  consent authority positively loads that preference. The bootstrap's single
  intentional `<html>` data-attribute difference is scoped with React's
  hydration-warning boundary; application-shell descendant mismatches remain
  visible and are never suppressed.

## Personalize guidance and current editions

`PersonalizeProductIntro` owns its mobile scroll guide locally, without adding
viewport or scrolling state to the Personalize controller. One cleaned-up
IntersectionObserver watches the original CTA. The bottom button uses the same
brand-button class and appears only while that CTA is below the viewport. It is
portalled outside the animated form's containing block, respects the device safe
area, and is hidden from desktop layout. Activation only scrolls the original
CTA into view (without smooth motion when reduced motion is preferred) and
dismisses the guide for that book. Only the original CTA starts the form. The
Intro is keyed by book identity so switching books resets this presentation-only
state. No job, route, upload, consent or cache authority is added.

Magic Attributes retain database-controlled, clamped fill values and accessible
progressbar labels/values. Visible percentage labels are absent; the bars are
14px thick on desktop and mobile.

The current sellable package contract is exactly `basic` (Classic Portrait) and
`supreme` (Signature Voice), both physical. Cloud Explorer is not a current
option, artwork, marketing format, Admin pricing input, creation configuration,
job request, cart-price authority or new payment session. Catalog reads exclude
retired digital price rows and interpret legacy catalog display metadata through
the current basic price; unknown or incomplete physical prices still fail closed.
Home discount slots must also have an actual current physical sale price.
Checkout always requires address and shipping. Unpaid orders containing retired
packages are rejected before Stripe session creation or reuse, and local-cart
recovery uses owned creation/server price authority rather than client prices.

This offering change does not erase historical paid orders, stored type labels,
customer assets or database enum values. Final Review, PDF generation/release,
reader access, Signature Voice delivery and existing paid-payment callbacks keep
their contracts. The catalog database default/seed/guard successor is released
separately through the database component's migration ledger and runbook, never
as a Web build side effect.

## Worker queue boundary

The browser never calls the Node Worker or RunPod. Web routes create durable
`jobs` rows in Supabase, and the existing private Broadcast trigger provides
only a best-effort wake hint. PostgreSQL atomically caps repeatable Preview
creation at insertion time; Final jobs created after payment remain durably
admissible regardless of backlog.

The Web repository does not own claim order, endpoint selection, leases, or
provider retries. Those are Worker and database contracts pinned under
`tests/fixtures/external-contracts/` so an isolated Web clone can verify the
integration without carrying a second executable Worker.

## Compatibility policy

NX-001 removes Web-owned retired URL, response, locale, and historical runtime
fallbacks once current callers have migrated. It does not rename live database
columns or delete historical database evidence.

The sole temporary exception is `/api/internal/worker-callback`: current Final
Review delivery does not use it, but the non-review Worker path and environment
switching tools still reference it. Removal is paired with Worker changes in
the cloud-cutover issue.

The retired `/api/orders/list`, query-parameter order detail read,
`/admin`, and legacy Admin Inbox reply routes do not exist. Preview job reads
return only the V3 structured-page contract. Runtime Signature Voice consent is
exactly `signature-voice-consent-v3`. Retired UI locale state and old Support or
KOL token-address formats are not compatibility surfaces.

## NX-001 verification baseline

The 2026-09-04 production build contains 131 Route Handlers and 143 modules
whose first directive is `use client`. A complete static import-graph sweep of
runtime source found no zero-entry module after excluding framework entrypoints.
All package test scripts, strict TypeScript with unused-symbol checks, and the
Next.js 16.3.1 production build passed. Full ESLint completed with zero errors
and 68 existing warnings, down from the 70-warning opening baseline.

Turbopack emitted 3,066.25 KiB across all static chunks. This is an artifact
inventory, not the amount loaded by one route. Uncompressed route-manifest
inventories were 584.37 KiB JavaScript for Home, 465.14 KiB for Books, 690.89
KiB for Personalize/Preview, 445.71 KiB for My Books, and 520.58 KiB for Admin
Finals. The common CSS inventory was 293.91 KiB, with Personalize/Preview at
300.21 KiB. The opening audit did not retain equivalent byte-level artifacts,
so these values are the comparison baseline for later optimization and are not
presented as an NX-001 size reduction.

## Independent post-close audit

The 2026-09-07 independent audit follow-up confirmed that the runtime remained
free of orphan modules and ceremonial layers. Its verified residue was closed
without changing product behavior: Windows CRLF checkouts now execute every
external-contract SHA-256 comparison, all API Route Handlers share the
fail-closed authenticated-user authority, the remaining equivalent JSON
no-store responses use `src/lib/http-response.ts`, eight unreferenced exports
were removed, and the Homepage banner cache is exported directly without a
pass-through wrapper.

All package test and contract scripts passed after the correction, including
262/262 source contracts and the 45 external fixture hashes. Strict TypeScript,
the 122-page Next.js production build, and full ESLint passed with zero errors
and 66 pre-existing warnings.
