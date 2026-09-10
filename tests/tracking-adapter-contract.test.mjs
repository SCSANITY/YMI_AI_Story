import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8')
}

test('AppShell mounts one consent-gated adapter and isolates the Meta frame route', async () => {
  const shell = await read('components/AppShell.tsx')

  assert.match(shell, /ConsentGatedTagAdapter = dynamic/)
  assert.match(shell, /ssr:\s*false/)
  assert.match(shell, /<Suspense fallback=\{null\}>[\s\S]*<ConsentGatedTagAdapter \/>/)
  assert.match(shell, /pathname === '\/tracking\/meta-frame'/)
  assert.match(shell, /if \(isTrackingFrameRoute\) return <>\{children\}<\/>/)
})

test('consent remains unresolved until the current stored version is positively loaded', async () => {
  const adapter = await read('components/tracking/ConsentGatedTagAdapter.tsx')
  const consent = await read('src/lib/cookie-consent.ts')

  assert.match(adapter, /useState<CookieConsentPreferences \| null>\(null\)/)
  assert.match(adapter, /readCurrentCookieConsent\(\)/)
  assert.match(adapter, /COOKIE_CONSENT_CHANGE_EVENT/)
  assert.match(adapter, /COOKIE_CONSENT_STORAGE_KEY/)
  assert.match(consent, /COOKIE_CONSENT_CHANGE_EVENT = 'ymi:cookie-consent-change'/)
  assert.match(consent, /dispatchEvent\(new CustomEvent<CookieConsentPreferences>/)
})

test('funnel events wait in memory for consent resolution and are then flushed or discarded', async () => {
  const adapter = await read('components/tracking/ConsentGatedTagAdapter.tsx')

  assert.match(adapter, /pendingConsentEventsRef = useRef<PendingConsentTrackingEvent\[]>\(\[]\)/)
  assert.match(adapter, /if \(!currentConsent\) \{[\s\S]*pendingConsentEventsRef\.current\.push\(\{ event, page: currentPage \}\)[\s\S]*return/)
  assert.match(adapter, /if \(!consent\) return[\s\S]*pendingConsentEventsRef\.current\.splice\(0\)[\s\S]*dispatchTrackingEvent\(pending\.event, pending\.page, consent\)/)
  assert.match(adapter, /MAX_PENDING_CONSENT_EVENTS = 20/)
  assert.doesNotMatch(adapter, /if \(!event \|\| !currentConsent \|\| !currentPage\) return/)
})

test('Google disables automatic page views and receives only explicit safe page metadata', async () => {
  const adapter = await read('components/tracking/ConsentGatedTagAdapter.tsx')
  const policy = await read('src/lib/tracking-policy.ts')

  assert.match(adapter, /send_page_view:\s*false/g)
  assert.match(adapter, /allow_google_signals:\s*false/)
  assert.match(adapter, /allow_ad_personalization_signals:\s*false/)
  assert.match(adapter, /window\.gtag\('event', 'page_view', \{\s*\.\.\.page,/s)
  assert.match(policy, /page_location: `\$\{normalizeOrigin\(origin\)\}\$\{pagePath\}`/)
  assert.match(policy, /page_referrer: ''/)
  assert.doesNotMatch(adapter, /window\.location\.href|document\.title|document\.referrer/)
})

test('Meta runs in a fixed privacy frame and receives only consented click attribution', async () => {
  const adapter = await read('components/tracking/ConsentGatedTagAdapter.tsx')
  const frame = await read('components/tracking/MetaPixelFrame.tsx')
  const config = await read('src/lib/tracking-config.ts')
  const page = await read('app/tracking/meta-frame/page.tsx')

  assert.match(config, /META_TRACKING_FRAME_PATH = '\/tracking\/meta-frame'/)
  assert.match(adapter, /src=\{META_TRACKING_FRAME_PATH\}/)
  assert.match(adapter, /referrerPolicy="origin"/)
  assert.match(adapter, /consent\?\.marketing[\s\S]*sanitizeMetaClickId\(searchParams\.get\('fbclid'\)\)/)
  assert.match(adapter, /consent\.marketing && metaClickId \? \{ click_id: metaClickId \} : \{\}/)
  assert.match(frame, /syncMetaClickIdToFrameLocation\(message\.click_id\)[\s\S]*ensureMetaPixel\(pixelId\)/)
  assert.match(frame, /if \(!consentGranted\) \{[\s\S]*syncMetaClickIdToFrameLocation\(null\)[\s\S]*fbq\?\.\('consent', 'revoke'\)/)
  assert.match(frame, /attributedUrl\.searchParams\.set\('fbclid', clickId\)/)
  assert.match(frame, /window\.history\.replaceState\(/)
  assert.match(frame, /fbq\('set', 'autoConfig', false, pixelId\)/)
  assert.match(frame, /'trackSingle', pixelId, 'PageView'/)
  assert.doesNotMatch(frame, /fbq\('track', 'PageView'\)/)
  assert.match(page, /noIndexMetadata/)
})

test('Meta sends PreviewReady through the custom-event method only', async () => {
  const frame = await read('components/tracking/MetaPixelFrame.tsx')

  assert.match(frame, /preview_ready: 'PreviewReady'/)
  assert.match(
    frame,
    /event\.name === 'preview_ready'[\s\S]*window\.fbq\('trackSingleCustom', pixelId, metaEventName, eventPayload\)[\s\S]*return/,
  )
  assert.match(frame, /window\.fbq\('trackSingle', pixelId, metaEventName, eventPayload\)/)
})

test('revocation updates vendors and removes only matching first-party cookies', async () => {
  const adapter = await read('components/tracking/ConsentGatedTagAdapter.tsx')
  const frame = await read('components/tracking/MetaPixelFrame.tsx')
  const policy = await read('src/lib/tracking-policy.ts')

  assert.match(adapter, /window\.gtag\?\.\('consent', 'update'/)
  assert.match(adapter, /deleteVendorCookies\('analytics'\)/)
  assert.match(adapter, /deleteVendorCookies\('marketing'\)/)
  assert.match(frame, /window\.fbq\?\.\('consent', 'revoke'\)/)
  assert.match(policy, /_ga\(\?:_\.\+\)\?/)
  assert.match(policy, /_fbp\|_fbc\|_gcl_au/)
})

test('tracking IDs are env-only and no advertising personalization feature is enabled', async () => {
  const config = await read('src/lib/tracking-config.ts')
  const adapter = await read('components/tracking/ConsentGatedTagAdapter.tsx')
  const frame = await read('components/tracking/MetaPixelFrame.tsx')

  assert.match(config, /process\.env\.NEXT_PUBLIC_GA4_MEASUREMENT_ID/)
  assert.match(config, /process\.env\.NEXT_PUBLIC_GOOGLE_ADS_ID/)
  assert.match(config, /process\.env\.NEXT_PUBLIC_META_PIXEL_ID/)
  assert.doesNotMatch(config, /G-[A-Z0-9]{5,}|AW-[0-9]{5,}/)
  assert.match(adapter, /ad_personalization:\s*'denied'/)
  assert.doesNotMatch(adapter + frame, /enhanced_conversions|user_id|advanced_matching|Conversions API|CAPI/)
})

test('Vercel audience measurement shares the Analytics consent and redacted page authority', async () => {
  const adapter = await read('components/tracking/ConsentGatedTagAdapter.tsx')
  const adminPage = await read('app/admin/(protected)/analytics/page.tsx')
  const serverAuthority = await read('src/lib/admin-audience-analytics-server.ts')

  assert.match(adapter, /hasVercelAnalyticsStarted/)
  assert.match(adapter, /if \(!consentRef\.current\?\.analytics\) return null/)
  assert.match(adapter, /buildSafePageView\(event\.url, window\.location\.origin\)/)
  assert.match(adapter, /<Analytics beforeSend=\{filterVercelEvent\}/)
  assert.match(adminPage, /loadAudienceAnalytics\(days\)/)
  assert.match(serverAuthority, /^import 'server-only'/)
  assert.match(serverAuthority, /cache: 'no-store'/)
  assert.match(serverAuthority, /YMI_VERCEL_ANALYTICS_TOKEN/)
  assert.doesNotMatch(serverAuthority + adminPage, /supabaseAdmin|ip_address|clientIp/)
})
