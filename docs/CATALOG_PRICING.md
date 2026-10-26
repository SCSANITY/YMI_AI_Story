# Catalog data, cache and active-cart prices

`template_package_prices` is the selected-edition pricing authority. The existing
package-pricing mapper supplies list price, effective price and display discount
to catalog cards, Customize, Preview and edition details. Currency presentation
continues through the existing locale-pricing helpers.

## Public static routes

`invalidatePublicCatalogCache` is the single success entry for the existing Admin
pricing, display-package settings (single/bulk) and Home-placement mutations. It
invalidates `/`, `/books`, `/collaboration`, the `/personalize/[bookID]` page
pattern, the `/api/templates` subtree and `/sitemap.xml`. Failed writes do not
invalidate. There are no new Admin editors or client-side price subscriptions.

Personalize page content and metadata both call `loadActiveTemplateDetail`.
`generateStaticParams` loads the active DB Catalog with strict pricing/identity
validation: a load failure or invalid row fails the build, never an empty/partial
fallback. The page is force-static ISR, revalidate 300 seconds, with dynamic
params for newly added active stories. Missing/inactive detail remains 404.
The retained `data/books.ts` is no longer imported by runtime page code.

The two public Catalog GETs use force-static ISR with revalidate 60 seconds and
do not consume search params, cookies or private data. Load errors throw so Next
does not cache an error response as a successful public entry; a cold failure is
HTTP 500, then a successful immediate request can populate the cache. Missing
detail keeps its JSON 404. Direct Supabase/tool edits do not invoke the Web
invalidation helper and rely on normal ISR; unchanged-URL asset byte overwrites
are outside this cache contract. Existing browser-mounted data is not pushed.

## Active cart and checkout boundary

GET `/api/cart` projects `unit_price_usd` for active unpaid items from the joined
current package prices and the line's `package_type`, without an extra per-line
query. It never writes `price_at_purchase`. Non-active/history reads project the
stored amount. Existing owner filters and paid-order exclusion remain in place.

GlobalContext validates that amount and maps it into the existing CartItem
`priceAtPurchase` UI field. Cart, mini cart and Checkout use `cartItemUnitPrice`;
they never substitute `book.price`, which can describe another display edition.
A missing/invalid amount or failed cart load produces a load error and prevents
checkout from that state. Cart retry is user initiated. Existing order-start
repricing, persisted checkout/session facts and paid amounts are unchanged.

## Verification

`tests/catalog-authority-runtime.test.mjs` exercises all existing Admin mutation
paths, DB-backed page/metadata/static params, strict failures, actual GET cart
projection, GlobalContext errors and the real display components. USD/JPY cases
use different basic/Voice prices and a deliberately incorrect `book.price`.
`tests/catalog-price-refresh.test.mjs` covers changed-price propagation and
discount presentation; cart-selection tests retain selection/checkout behavior.

Local build/start verification uses synthetic transport, not production catalog
writes: before/after route tables, real Admin auth/PATCH plus Next invalidation,
API MISS/HIT and error recovery, metadata, activation/404 and on-demand pages.
The one-time evidence records the exact Next version, build mode and limitations;
it is not a scheduled task or additional runtime cache authority.
