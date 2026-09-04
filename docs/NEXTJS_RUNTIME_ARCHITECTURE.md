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

