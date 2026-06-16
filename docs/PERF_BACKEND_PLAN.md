# Backend Latency Plan: Server-Side Round-Trip Reduction

Last updated: 2026-06-16

## Status

P0/P1 implementation is complete for the low-risk backend latency pass. P2 database/RPC work is intentionally deferred until after internal-test priorities are stable.

This plan targets interaction latency, not first paint. The main root cause remains cross-region calls: Vercel functions are currently in North America while Supabase is in Asia, so uncached API paths pay a high round-trip cost per Supabase query.

## Implemented In This Pass

### P0.1 Customize Access Server Enforcement

Status: Done.

`/api/jobs` now checks `getCustomizeAccessSettings()` before creating preview jobs. If Customize is closed, the API returns `403` with:

```json
{
  "code": "customize_access_closed"
}
```

The check runs before asset, creation, or job records are created. The client gate is now only UX; the server remains authoritative.

### P0.2 Private Cache Headers For Low-Risk User Reads

Status: Done.

These routes now use browser-only private caching:

| Route | Cache-Control |
|---|---|
| `GET /api/favourites` | `private, max-age=60` |
| `GET /api/my-books` | `private, max-age=60` |
| `GET /api/orders` | `private, max-age=30` |
| `GET /api/orders/list` | `private, max-age=30` |
| `GET /api/orders/[orderId]` | `private, max-age=30` |
| `GET /api/account/reward-vouchers` | `private, max-age=30` |

`/api/cart` remains uncached because cart mutations are frequent and stale cart state would be more harmful than the latency saved.

Navbar badge/list fetches for favourites, rewards, orders, and my-books no longer force `cache: 'no-store'`, so the browser can use these private TTLs. Cart, checkout, admin, and final review fetches remain no-store where correctness matters more.

### P1.1 Parallel Signed URL Generation

Status: Done.

Sequential Supabase Storage `createSignedUrl` loops were replaced with concurrent signing via `src/lib/storage-signing.ts`.

Covered paths:

| Area | Resource |
|---|---|
| `app/api/cart/route.ts` | preview cover URL |
| `app/api/my-books/route.ts` | preview cover URL |
| `app/api/orders/route.ts` | preview cover URLs |
| `app/api/orders/route.ts` | released final PDF URLs |
| `app/api/orders/[orderId]/route.ts` | preview cover URLs |

Single resource signing failures return `null` for that resource and do not fail the whole API response.

### P1.2 Order Detail Independent Query Parallelization

Status: Done.

`app/api/orders/[orderId]/route.ts` now fetches order items and payment metadata in parallel after the order row has been resolved.

### P1.3 Template Detail Cold Cache Parallelization

Status: Done.

`app/api/templates/[templateId]` now fetches product showcase storage listing and final preview storage listing in parallel. Existing public cache headers and response shape are unchanged. This improves cache misses only.

## Deferred P2 Work

### P2.1 Order Detail RPC

Collapse order detail into a single Postgres RPC that returns order, payment, cart items, creation/template metadata, and preview job output assets. The route would then only sign cover URLs in parallel.

Expected gain: removes multiple cross-region Supabase round-trips from order detail.

Reason deferred: requires SQL design, schema review, and careful API compatibility testing.

### P2.2 Signed URL Server Cache Or Email Media Proxy

Private generated media URLs are repeatedly signed by API routes. Two future options:

- Short server-side cache keyed by storage path for stable preview covers.
- Unified YMI media proxy/token route for email/private media, which also supports revocation and audit metadata.

Expected gain: fewer Storage signing calls; better long-term privacy model for personalized child images and final PDFs.

Reason deferred: needs a shared privacy/security design instead of route-local caching.

### P2.3 Catalog Server-Side / ISR Rendering

Move `/books` and homepage catalog data out of a client fetch waterfall and toward server-side or ISR-backed catalog rendering.

Expected gain: faster catalog content availability after navigation and less client-side waiting.

Reason deferred: touches `BookList`, `HomeBookCategories`, GlobalContext interactions, filtering, and current UI behavior.

### P2.4 Supabase Region Migration

Future infrastructure root fix: migrate Supabase closer to Vercel/RunPod, likely US East.

Expected gain: broad latency reduction across every uncached API route.

Reason deferred: production data migration needs a dedicated runbook, backup/restore validation, downtime or dual-write decision, and post-migration verification.

## Validation Targets

- `npm run lint -- --quiet`
- `npx tsc --noEmit`
- `npm run build`
- Confirm `/personalize/[bookID]` remains SSG in the build route table.
- Confirm the listed user-data routes return private cache headers.
- Confirm cart stays uncached.
- Confirm multi-item cart/order/my-books still return preview cover URLs and released final PDF URLs where available.
