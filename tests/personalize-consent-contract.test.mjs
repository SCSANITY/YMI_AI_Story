import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)

async function read(relativePath) {
  return readFile(new URL(relativePath, root), 'utf8')
}

test('Customize keeps generation consent affirmative and delegates marketing to Cookie Settings', async () => {
  const [action, page, messages, jobsRoute] = await Promise.all([
    read('components/personalize/GeneratePreviewAction.tsx'),
    read('components/PersonalizePage.tsx'),
    read('src/lib/i18n-messages.ts'),
    read('app/api/jobs/route.js'),
  ])

  assert.match(action, /isDataGenerationConsentChecked, setIsDataGenerationConsentChecked\] = useState\(false\)/)
  assert.doesNotMatch(action, /isMarketingConsentChecked/)
  assert.match(action, /aria-required="true"/)
  assert.match(action, /labels\.required/)
  assert.match(action, /labels\.privacyUsageNote/)
  assert.match(action, /dataGeneration:\s*isDataGenerationConsentChecked/)
  assert.match(action, /onOpenMarketingPreferences/)
  assert.doesNotMatch(action, /text-amber-600">\*</)

  assert.match(page, /required:\s*t\('personalize\.requiredLabel'\)/)
  assert.match(page, /privacyUsageNote:\s*t\('personalize\.privacyUsageNote'\)/)
  assert.match(page, /onOpenMarketingPreferences=\{openCookieSettings\}/)
  assert.doesNotMatch(page, /marketing-consent-v1/)
  assert.doesNotMatch(page, /consentRecordedAt/)
  assert.match(messages, /sharing limited site activity with Meta/)
  assert.match(messages, /analytics, performance optimization, and relevant recommendations/)

  assert.match(jobsRoute, /CONTENT_GENERATION_CONSENT_VERSIONS = new Set\(\['content-generation-consent-v1'\]\)/)
  assert.match(jobsRoute, /contentGeneration\.accepted !== true/)
  assert.match(jobsRoute, /accepted_at: new Date\(\)\.toISOString\(\)/)
  assert.match(jobsRoute, /p_params: validatedParams/)
  assert.doesNotMatch(jobsRoute, /marketing:/)
})
