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
- Authentication identity and checkout ownership come from the current server
  session. Client-supplied customer IDs may be checked for mismatch but are not
  identity authority.
- Repeated Route Handler behavior belongs in narrowly named server-only
  modules. There is no generic catch-all utility layer.
- UI copy is currently English-only and is separate from Story Language, which
  remains personalization data.
- `GlobalContext` owns genuine cross-route client state. Pure catalog, order,
  and presentation mapping belongs in domain modules rather than the provider.

## Current domain owners

- Catalog reads enter through `src/lib/template-catalog-server.ts` and are
  normalized by `src/lib/book-catalog.ts`. `data/books.ts` is build-time route
  and SEO input only.
- Checkout identity and owner-scoped queries enter through
  `src/lib/checkout-owner.ts`; customer order collection and detail reads enter
  through `src/lib/customer-orders-server.ts`.
- Route Handlers use `src/lib/http-response.ts` for private/no-store JSON
  responses and `src/lib/internal-request-auth.ts` for internal-secret or cron
  authorization.
- Customize lifecycle belongs to `usePersonalizeStage`; persisted steps are
  derived from that state machine. `usePersonalizeState` owns the form and
  `usePreviewController` owns Preview jobs, assets, versions, refresh, errors,
  cancellation, and its single per-job watcher.
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
