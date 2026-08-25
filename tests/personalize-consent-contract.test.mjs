import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)

async function read(relativePath) {
  return readFile(new URL(relativePath, root), 'utf8')
}

test('Customize keeps only affirmative generation consent and no duplicate marketing authority', async () => {
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
  assert.match(action, /dataGeneration:\s*isDataGenerationConsentChecked/)
  assert.doesNotMatch(action, /marketing|Cookie Settings|onOpenMarketingPreferences/)
  assert.doesNotMatch(action, /text-amber-600">\*</)

  assert.match(page, /required:\s*t\('personalize\.requiredLabel'\)/)
  assert.doesNotMatch(page, /openCookieSettings|marketingConsentOptional|manageMarketingPreferences|privacyUsageNote/)
  assert.doesNotMatch(page, /marketing-consent-v1/)
  assert.doesNotMatch(page, /consentRecordedAt/)
  assert.doesNotMatch(messages, /personalize\.(marketingConsentOptionalLabel|manageMarketingPreferences|privacyUsageNote)/)

  assert.match(jobsRoute, /CONTENT_GENERATION_CONSENT_VERSIONS = new Set\(\['content-generation-consent-v1'\]\)/)
  assert.match(jobsRoute, /contentGeneration\.accepted !== true/)
  assert.match(jobsRoute, /accepted_at: new Date\(\)\.toISOString\(\)/)
  assert.match(jobsRoute, /p_params: validatedParams/)
  assert.doesNotMatch(jobsRoute, /marketing:/)
})
