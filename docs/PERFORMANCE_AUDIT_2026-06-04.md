# YMI Story Performance Audit A

Last updated: 2026-06-08

This report follows the Performance Audit A checklist in `Template_folder`. It audits the Next.js frontend and API Router in `ymi-books-web-1.0`, and tracks the low-risk optimizations completed from that audit.

## Baseline

Source of truth:

- Local command: `npm run build`
- Next.js: `16.1.1` with Turbopack
- Build env: `.env.local`
- Build result: passed
- Static generation: 88 pages generated successfully

Available measurements:

| Metric | Current baseline |
| --- | --- |
| Lighthouse LCP/FCP/TTI/CLS/TBT | Local Lighthouse baseline captured against `next start` on port 3010; see table below. Production/Vercel Speed Insights is still recommended. |
| Largest JS chunk | `242.9 KB` in `.next/static/chunks/619636f4e99dc180.js` after removing client-side OpenCC runtime. |
| Largest CSS chunks | `190.5 KB`, `17.8 KB` after removing root CJK Google font families. |
| Total `.next/static` payload | About `3.1 MiB` across 76 files after clean rebuild. |
| Files with `use client` | 52 files under `app`, `components`, and `src`. |
| Remaining raw `<img>` usages | 18 usages. |
| Files using `next/image` | 13 files. |
| Hero video | Runtime source is the original-quality `public/hero-video.mp4` at `8,077,411` bytes, with `public/hero-poster.webp` at about `122 KB` as the first visual fallback. The MP4 is already faststart: `moov` offset `36`, before `mdat` offset `9036`. |
| Legacy unreferenced banner PNGs | Cleaned in this optimization pass; current code uses optimized WebP banners. |

Local Lighthouse baseline:

| Route | Performance | FCP | LCP | TBT | CLS | Total transfer |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `/` | 78 | 0.9s | 6.3s | 32ms | 0 | 8,886 KiB |
| `/books` | 78 | 0.9s | 6.1s | 35ms | 0 | 883 KiB |
| `/personalize/Music_story` | 78 | 0.9s | 5.5s | 42ms | 0 | 765 KiB |

Important limitation: Next 16 App Router with Turbopack does not expose the older per-page "First Load JS" table in the same way. This audit therefore records route rendering, source-level risks, chunk sizes, and local Lighthouse snapshots. Production data should still be captured through Vercel Speed Insights because local Lighthouse does not include real CDN, device, and geography conditions.

Homepage transfer note: the user-selected Hero video content and visual quality are preserved. The earlier optimized WebM / MP4 runtime variant strategy was removed because the lower-bitrate result was not visually acceptable for the brand. The current MP4 is already faststart, so playback can begin without waiting for the whole file, subject to network throughput. The poster remains the first visual fallback.

## Executive Summary

The site is healthier than the original checklist feared in several areas:

- Public pages such as `/`, `/books`, `/community`, `/collaboration`, `/impact`, and `/support` are statically prerendered.
- `/api/templates` and `/api/templates/[templateId]` already use CDN-friendly cache headers.
- Book card covers already use `next/image` with `sizes`.
- Product and banner WebP workflows exist and are already used in key UI areas.
- Mediapipe face detection is dynamically imported and not loaded on initial public page views.
- Stripe hosted checkout does not appear to load `@stripe/stripe-js` globally.

Completed high-impact cleanup:

- Client-side `opencc-js` runtime was removed from shared public chunks by pre-generating Traditional Chinese UI/legal content.
- The largest JS chunk dropped from about `1.26 MB` raw to about `242.9 KB` raw.
- No OpenCC dictionary strings remain in `.next/static/chunks`.
- Customize product gallery adjacent-image preloading now uses Next Image Optimizer instead of direct Supabase Storage image downloads.
- Root Traditional Chinese Google font families were removed from `next/font/google`; zh-HK/zh-TW now use local system CJK font stacks.
- Clean `.next/static` payload dropped from about `13.1 MiB` to about `3.1 MiB`.
- Local Lighthouse CLS for `/personalize/Music_story` is now `0`.

The main remaining risks are:

1. Hero video remains the largest homepage media item, so runtime encoding and source selection matter even when visual quality is preserved.
2. Large client hydration surface from the global client shell and broad client components.
3. Remaining Latin display font families/weights should be reviewed only after visual comparison.
4. Customize product gallery is now much healthier; further work should be based on production metrics rather than assumption.

## 1. Page Rendering Mode Audit

Current state:

| Route group | Build mode | Notes |
| --- | --- | --- |
| `/` | Static | Home shell is prerendered, but hydrates client AppShell, Hero, banners, and book categories. |
| `/books` | Static | Static shell; catalog data is fetched client-side through `/api/templates`. |
| `/community`, `/collaboration`, `/impact`, `/support` | Static | Public content, but some pages remain full client components. |
| `/cart`, `/checkout`, `/orders`, `/favorites`, `/my-books`, `/account` | Static shell | User data loads client-side. This is acceptable for account/order pages. |
| `/personalize/[bookID]` | Dynamic SSR | Uses Supabase metadata lookup and customize access gate. Reasonable for the workflow route. |
| `/orders/[orderID]`, `/share/preview/[token]`, `/support/[orderID]` | Dynamic SSR | Token/order-specific data. Dynamic rendering is expected. |
| `/admin/*` protected pages | Dynamic SSR | Admin auth and operational data. Dynamic rendering is expected. |
| `/sitemap.xml` | Static with `revalidate = 3600` | Correct for SEO. |

Findings:

- Public-page TTFB is not the core performance problem because most public pages are already static.
- The more important issue is static pages hydrating relatively large client components.
- `/personalize/[bookID]` may have some duplicate Supabase reads between metadata and page rendering, but this is lower priority than its client bundle and image workflow.

Severity: Medium

Recommendation:

- Keep public marketing pages static.
- Do not force dynamic rendering on public pages unless needed.
- Later, consider server-rendering product info for `/personalize/[bookID]` and loading upload/preview features as client islands.
- Avoid changing `/share/preview/[token]` to public ISR/CDN caching until privacy and token lifecycle are explicitly reviewed.

Expected impact:

- Rendering-mode changes alone will not deliver the biggest gain. Client boundary, bundle, font, and image work should come first.

## 2. Client / Server Component Boundary Audit

Current state:

- 52 files contain `use client`.
- `components/AppShell.tsx` is a client component wrapping the app with `GlobalProvider`, `Navbar`, `LoginModal`, `CookieConsentBanner`, and `CustomizeAccessBlockedModal`.
- Large public components are client-side:
  - `components/Hero.tsx`
  - `components/HomeBookCategories.tsx`
  - `components/BookList.tsx`
  - `components/Footer.tsx`
- Large workflow components are client-side:
  - `components/PersonalizePage.tsx`
  - `app/checkout/page.tsx`
  - `components/admin/FinalReviewPanel.tsx`

Valid added finding:

- `components/HomePosterBanner.tsx` previously used `useRouter`; it has been converted to a server component using `Link`.
- `components/BookCardCover.tsx` may not need `use client` by itself. However, because it is currently used by client-side `BookCard`, removing the directive alone may not reduce the actual public bundle unless the parent boundary is also improved.

Findings:

- The global client shell is convenient but increases baseline hydration.
- `PersonalizePage` is too broad: upload, face validation, Supabase browser access, job polling, preview UI, share dialog, mini game, and voice recording are all in one client boundary.
- Hero animation and Footer legal/social modals are loaded as part of public page hydration.

Severity: High for `PersonalizePage`; Medium for public pages.

Recommendation:

- Done: `HomePosterBanner` was converted to a server component where behavior permits.
- P1: split `PersonalizePage` into smaller client islands.
- P1/P2: lazy-load route-specific or modal-heavy features instead of importing them globally.
- Treat `BookCardCover` as a low-risk verification item, not a guaranteed win.

Expected impact:

- Lower hydration cost on public pages.
- Faster Customize route interactivity, especially on mobile.

## 3. Client Bundle Size Audit

Current state:

- Largest JS chunk is now about `242.9 KB` raw, `79.7 KB` gzip, `52.0 KB` brotli.
- Before this optimization pass, the largest shared JS chunk was about `1.26 MB` raw, `548 KB` gzip, `402 KB` brotli.
- The main confirmed cause was runtime `opencc-js` dictionary payload being pulled into shared client chunks through UI i18n and Footer legal content.
- Traditional Chinese UI messages are now pre-generated in `src/lib/i18n-messages-traditional.ts`.
- Traditional Chinese Footer legal content is now pre-generated in `src/lib/footer-legal-content-traditional.ts`.
- No `opencc-js`, `OpenCC`, or large OpenCC dictionary strings were found in `.next/static/chunks` after rebuild.
- Major candidates:
  - `framer-motion` in Hero, BookList, Personalize, checkout, and orders.
  - `lucide-react` icons used broadly.
  - `@mediapipe/tasks-vision` is dynamically imported only during face detection. This is good.
  - `@stripe/stripe-js` is a dependency but was not found as a direct active client import in the audited code.
  - `pdf-lib` appears in final review code and should stay away from public routes.

Findings:

- The previous largest chunk has been explained and reduced.
- `opencc-js` should remain out of browser bundles. If Traditional Chinese content is changed, regenerate the static Traditional files rather than reintroducing runtime conversion.
- Framer Motion is used on public first-screen components and may contribute meaningful JS.
- Removing `@stripe/stripe-js` from `package.json` is not recommended yet. The dependency is not obviously hurting the public bundle, and future Stripe work may need it.

Severity: Medium after OpenCC cleanup.

Recommendation:

- Done: traced and removed the OpenCC runtime from shared client chunks.
- P1: use lighter Framer Motion patterns, such as `LazyMotion`, or replace simple entrance animations with CSS.
- P1: lazy-load optional modules in `PersonalizePage`, especially mini game, voice recorder, and share dialog.

Expected impact:

- Completed bundle cleanup produced the largest concrete JS win in this audit round.
- Further JS wins are likely smaller and should be measured route-by-route.

## 4. Image Loading Audit

Current state:

- `BookCardCover.tsx` uses `next/image`, `sizes`, and lazy/eager handling. This is a strong existing optimization.
- Supabase image hosts are configured in `next.config.ts`.
- Current banner code uses optimized WebP assets:
  - `public/banners/optimized/*.webp`
  - largest optimized banner is about `488.8 KB`.
- Legacy banner PNGs were confirmed unreferenced by code and removed:
  - `public/banners/SwapFace.png`
  - `public/banners/Workflow.png`
  - `public/banners/banner-02.png`
  - `public/banners/banner-01.png`
- The removed PNGs were deployment/static artifact bloat, not active page-download bloat, because current banner code uses optimized WebP files.
- `app/checkout/page.tsx` previously had two `Image` usages with `unoptimized`; this pass removed `unoptimized` and added thumbnail `sizes`.
- `public/logo.png` is about `0.85 MB`; Navbar/Footer now use a generated `public/logo.webp` that is about `41 KB`.
- `app/share/preview/[token]/page.tsx` still uses raw `<img>`.
- Hero source video is about `7.7 MiB` and is used directly at runtime to preserve the selected visual quality.
- Faststart was verified on the runtime MP4: `moov` atom offset `36`, before `mdat` offset `9036`; no `ffmpeg -c copy` rewrite was required.
- The runtime video is rendered immediately with `preload="auto"` and fades in after `loadeddata`; `public/hero-poster.webp` remains the first visual fallback.
- Before the product gallery preloading fix, local Lighthouse for `/personalize/Music_story` showed direct Supabase product image transfers:
  - `product7.webp`: about `270 KB`
  - `product1.webp`: about `223 KB`
- After the fix, direct Supabase product image requests disappeared from the Lighthouse network trace. Product thumbnails/main preload now use `/_next/image` optimized responses, with the main product image around `45 KB` in the measured run.

Findings:

- Book card image loading is mostly solved.
- Old PNGs in `public/banners` were cleaned up after confirming no code references.
- Checkout thumbnails now use Next image optimization with explicit `sizes`.
- Public share preview image is a good candidate for `next/image` or better response caching.
- Logo source has been compressed for active Navbar/Footer usage.
- Customize product gallery now avoids direct raw Supabase preloads. Further gains would come from reviewing exact displayed dimensions, thumbnail count, and image quality settings.

Severity: Medium

Recommendation:

- Done: old PNG banners were confirmed unreferenced and removed from deployed `public/`.
- Done: checkout images no longer use `unoptimized` and now include explicit `sizes`.
- Done: a lightweight `public/hero-poster.webp` was generated from the provided poster source and connected to the hero video.
- Done: Hero MP4 faststart was checked, the original-quality MP4 was retained, and lower-quality optimized runtime variants were removed.
- Done: Navbar/Footer logo references were switched from `logo.png` to a smaller `logo.webp`.
- Done: product gallery adjacent-image preloading now uses the Next Image Optimizer instead of direct Supabase image URLs.
- P1/P2: convert public share preview image to `next/image` if the image URL shape is compatible.
- Keep raw `<img>` where it is correct: local object URLs, admin lightbox previews, and user-selected file previews.

Expected impact:

- Removing unused PNGs reduces deployment/static artifact bloat but may not change active page LCP.
- Checkout/share/logo/hero poster changes can improve real user experience.

## 5. Font Loading Audit

Current state:

Root layout now imports 3 Latin font families:

- `Inter`: 400, 600, 700
- `Cormorant Garamond`: 400, 600, 700 plus italic
- `Playfair Display`: 400, 600, 700

Removed in this optimization pass:

- `Noto Sans TC`: 400, 500, 700
- `Noto Serif TC`: 400, 600, 700

Traditional Chinese typography now uses system font stacks in `app/globals.css`, such as `PingFang TC`, `Microsoft JhengHei`, `Heiti TC`, `Songti TC`, and `PMingLiU`, with Noto names left only as local fallback names if the user's device already has them.

Findings:

- `next/font/google` is used, which is good.
- The previous root CJK Google font import was the main CSS/static artifact cost.
- After removal, clean `.next/static` dropped from about `13.1 MiB` to about `3.1 MiB`.
- CSS output now has two CSS files, led by a `190.5 KB` app CSS chunk.
- The remaining font cost is mostly Latin display typography rather than CJK payload.
- Directly switching `Inter` to `display: optional` is not recommended without layout evidence, because it can create inconsistent typography.
- Reintroducing hosted CJK fonts should only be considered for a specific brand need and should be locale-scoped, not root-loaded.

Severity: Medium

Recommendation:

- Done: remove root `Noto Sans TC` and `Noto Serif TC` hosted font imports.
- P1: audit whether both `Playfair Display` and `Cormorant Garamond` are needed.
- P1: reduce display font weights/styles.
- P2: consider locale-scoped hosted CJK font loading only if the system fallback visual quality is not acceptable.
- Do not change font display strategy blindly.

Expected impact:

- Better first render and much smaller static payload on first visit.
- Most visible on mobile, slow networks, and first-time Traditional Chinese visitors.

## 6. Data Fetching / Cache Audit

Current state:

- `/api/templates` and `/api/templates/[templateId]` use:
  - `public, max-age=60, s-maxage=300, stale-while-revalidate=86400`
- `useBookCatalog()` deduplicates client requests with module-level request/cache state.
- `/api/reviews/summary` now uses short public cache: `public, max-age=60, s-maxage=300, stale-while-revalidate=3600`.
- `useBookDisplayData()` delays review summary fetching with `runAfterIdle()`.
- `/api/checkout/shipping-destinations` now uses short public cache: `public, max-age=60, s-maxage=300, stale-while-revalidate=3600`.
- User/order/job/admin APIs are generally no-store, which is correct.
- `src/lib/storage-response.ts` sets public one-hour cache for proxied storage responses.

Valid added finding:

- `/api/checkout/shipping-destinations` is configuration-like data and was moved from `no-store` to short cache in this optimization pass.

Findings:

- Template cache is already in place.
- Review summary is short-cached.
- Shipping destinations can likely be short-cached, but should not use a long TTL unless admin update expectations are clear.
- Share preview token APIs should not be publicly cached without privacy review.

Severity: Medium

Recommendation:

- Done: add short cache to `/api/reviews/summary`.
- Done: `/api/checkout/shipping-destinations` now uses 60s browser cache and 5-minute CDN cache.
- P1: use `React.cache()` to dedupe repeated server reads inside the same request for share/personalize metadata if duplicated.
- Keep private/order/job/admin APIs no-store.

Expected impact:

- Reduced Supabase/API pressure.
- Smaller perceived gain than image/bundle work, but low risk.

## 7. Third-Party Script Audit

Current state:

- No global GTM/analytics scripts were found.
- Cookie consent exists, but no global marketing script appears active.
- Stripe checkout is server-session based and does not appear to load Stripe.js globally.
- Mediapipe is dynamically imported during face validation.
- Social share uses links/native sharing instead of platform SDKs.

Findings:

- Third-party script risk is currently low.
- `@stripe/stripe-js` is an unused or inactive dependency from the perspective of audited public bundle usage, but removal is not urgent.
- Mediapipe is correctly lazy.

Severity: Low

Recommendation:

- Keep Stripe and Mediapipe route/action-scoped.
- Do not add social SDKs for basic sharing.
- If analytics is added later, load only after consent with `next/script` using `afterInteractive` or `lazyOnload`.
- Do not remove Stripe.js dependency unless bundle analysis proves value and no planned Stripe UI requires it.

Expected impact:

- Low immediate gain. This is mainly a future guardrail.

## 8. HTTP / Cache Headers Audit

Current state:

- Template APIs are cacheable.
- Job status and preview URL APIs use strict no-store headers.
- Admin/customize access APIs use no-store.
- Shipping destinations now uses short public cache.
- Sitemap uses `revalidate = 3600`.
- Storage proxy responses use one-hour public cache.

Findings:

- Cache strategy is mostly correct by sensitivity.
- The clearest low-risk gap is `/api/reviews/summary`.
- Shipping destinations is a candidate for short cache.
- Share preview token responses need privacy review before public caching.

Severity: Low to Medium

Recommendation:

- P0: cache `/api/reviews/summary`.
- Done: `/api/checkout/shipping-destinations` was short-cached with a 5-minute CDN TTL.
- Keep job/order/account/admin APIs no-store.
- Avoid public caching for tokenized share content until data exposure rules are explicitly documented.

Expected impact:

- Mostly reduces server and Supabase load rather than solving visual load alone.

## Recommended Optimization Table

| Priority | Optimization | Expected gain | Complexity | Risk |
| --- | --- | --- | --- | --- |
| Done | Trace and remove OpenCC runtime from shared client chunk | Reduced largest JS chunk from about `1.26 MB` to `242.9 KB` raw | Medium | Completed with static Traditional content files |
| Done | Add cache headers to `/api/reviews/summary` | Lower repeated Supabase reads | Low | Completed |
| Done | Confirm and remove unused legacy PNG banners from deployed `public/` | Reduces deployment/static artifact bloat by about 54.7MB | Low | Low; completed after reference scan |
| Done | Capture local Lighthouse baseline for `/`, `/books`, `/personalize/Music_story` | Makes future improvements measurable | Low | Completed locally; still need production RUM |
| Done | Remove `unoptimized` from checkout thumbnails where compatible and add `sizes` | Better thumbnail optimization | Low | Completed |
| Done | Add hero video poster image | Faster visual first paint / better perceived loading | Low | Completed with `public/hero-poster.webp` |
| Done | Verify Hero MP4 faststart and retain original-quality runtime source | Preserves the selected video quality while ensuring the MP4 can start progressively | Low | Completed; optimized lower-bitrate variants removed |
| Done | Optimize `logo.png` or replace with smaller asset | Navbar/Footer now use `logo.webp` at about 41KB | Low | Completed |
| Done | Convert `HomePosterBanner` to server component using `Link` | Slightly less client JS | Low | Completed |
| Done | Remove root CJK Google font imports | Clean `.next/static` dropped from about `13.1 MiB` to about `3.1 MiB`; FCP now around `0.9s` in local Lighthouse | Low | Completed with system CJK fallbacks |
| Done | Optimize Customize product gallery image preloading | Lower `/personalize` transfer by avoiding raw Supabase preloads | Low | Completed; product gallery now preloads via Next Image Optimizer |
| P1 | Reduce or split Framer Motion usage on public first-screen components | Lower JS parse/hydration | Medium | Medium |
| P1 | Reduce remaining Latin font families/weights after visual review | Lower font payload | Medium | Medium |
| P1 | Split `PersonalizePage` into client islands | Faster Customize interactivity | High | Medium |
| Done | Short-cache shipping destinations if admin update delay is acceptable | Lower DB/API pressure | Low | Completed with 5-minute CDN TTL |
| P1 | Reassess homepage hero video delivery | Main remaining homepage LCP/transfer bottleneck | Medium | Needs visual and product review |
| P2 | Rework global AppShell and modal loading | Lower global client baseline | High | Medium |
| P2 | Server-render public catalog initial data | Less client fetch waterfall | High | Medium |
| P2 | Locale-scoped CJK font loading | Lower first-visit font cost | High | Medium |
| P3 | Static params/ISR for selected dynamic public pages | Lower TTFB on some pages | Medium/High | Medium/High |

## Not Recommended For Now

| Suggestion | Decision | Reason |
| --- | --- | --- |
| Public CDN cache or ISR for `/share/preview/[token]` | Do not do by default | Tokenized user-generated preview content needs privacy and lifecycle review. |
| Delete `@stripe/stripe-js` immediately | Do not prioritize | It is not proven to hurt public bundles and may be useful later. |
| Change `Inter` to `display: optional` | Do not do blindly | Could cause inconsistent typography; needs CLS/visual evidence. |
| Move all CJK fonts to runtime dynamic loading immediately | Do not do now | Root-hosted CJK fonts were removed; system CJK fallback is simpler and currently faster. |
| Convert every raw `<img>` to `next/image` | Do selectively | Raw `<img>` is correct for local object URLs, admin lightboxes, and user-selected previews. |
| Treat old banner PNGs as active LCP downloads | Incorrect | Current code uses optimized WebP banners; the unused PNGs have now been removed. |

## Roadmap

### P0: Measurement And Safe Cleanup

- Largest chunk ownership was traced to client-side OpenCC runtime and fixed.
- `/api/reviews/summary` is now cached.
- Legacy PNG banners were confirmed unreferenced and removed from deployed `public/`.
- OpenCC was verified absent from `.next/static/chunks` after rebuild.
- Root CJK Google font imports were removed and replaced with local system CJK fallback stacks.
- Clean `.next/static` payload is now about `3.1 MiB` across 76 files.
- Local Lighthouse baseline was captured for:
  - `/`
  - `/books`
  - `/personalize/Music_story`
- Still capture Vercel Speed Insights / production Core Web Vitals after deployment.

### P1: User-Facing Load Improvements

- Checkout thumbnails were updated to use Next image optimization with explicit `sizes`.
- Hero video now uses the original-quality `public/hero-video.mp4` plus `public/hero-poster.webp` as the lightweight first visual; the MP4 is already faststart.
- Navbar/Footer logo references now use the optimized `public/logo.webp`.
- Convert simple public client components to server components where possible.
- Customize product gallery no longer preloads raw Supabase product images; further work should focus on sizing/quality only if production metrics require it.
- Reduce Framer Motion and remaining Latin font payload after visual review.
- Reassess homepage Hero LCP and perceived video start time after deployment with the original-quality faststart MP4.
- Add short cache to shipping destinations only if admin update latency is acceptable.
- Begin splitting `PersonalizePage` into smaller workflow islands.

### P2/P3: Structural Improvements

- Rework global AppShell so route-specific modals and state are not loaded on every route.
- Server-render initial catalog data for `/books` and homepage book sections if client fetch remains visible.
- Revisit hosted CJK fonts only if system fallback typography is unacceptable for zh-HK/zh-TW.
- Review whether any tokenized public pages can safely use cache after privacy rules are documented.
- Add production Core Web Vitals monitoring and regression tracking.

## Immediate Conclusion

The highest-impact safe bundle issue found in this audit was client-side OpenCC runtime. The highest-impact static payload issue was root-loaded hosted CJK fonts. The highest-impact Customize image preload issue found in Lighthouse has also been fixed.

Current local Lighthouse after this round shows `/personalize/Music_story` at `CLS 0`, so layout stability is no longer the active Customize blocker. The next round should focus on:

1. Homepage Hero LCP and perceived video start time with the original-quality faststart MP4.
2. Remaining Latin font family/weight reduction after visual review.
3. Framer Motion and PersonalizePage island splitting only after route-level measurement.
4. Carefully splitting large client components once the bundle data proves where the cost is.
5. Production Core Web Vitals from Vercel Speed Insights after deployment.
