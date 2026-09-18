import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)

async function read(relativePath) {
  return readFile(new URL(relativePath, root), 'utf8')
}

test('Preview generation uses one photo/details consent and keeps voice authorization post-Preview', async () => {
  const [action, page, voiceDialog, messages, jobsRoute] = await Promise.all([
    read('components/personalize/GeneratePreviewAction.tsx'),
    read('components/PersonalizePage.tsx'),
    read('components/personalize/SignatureVoiceDialog.tsx'),
    read('src/lib/i18n-messages.ts'),
    read('app/api/jobs/route.js'),
  ])

  assert.match(action, /isDataGenerationConsentChecked, setIsDataGenerationConsentChecked\] = useState\(false\)/)
  assert.doesNotMatch(action, /isMarketingConsentChecked/)
  assert.match(action, /aria-required="true"/)
  assert.match(action, /labels\.required/)
  assert.match(action, /dataGeneration:\s*isDataGenerationConsentChecked/)
  assert.match(action, /signatureVoiceAuthorization:\s*false/)
  assert.doesNotMatch(action, /isSupreme|voiceAuthorizationRequired|voice_sample/)
  assert.doesNotMatch(action, /marketing|Cookie Settings|onOpenMarketingPreferences/)
  assert.doesNotMatch(action, /text-amber-600">\*</)

  assert.match(page, /required:\s*t\('personalize\.requiredLabel'\)/)
  assert.match(page, /book_type: 'basic'/)
  assert.match(page, /createPreviewJob\([\s\S]*pendingFaceAsset,[\s\S]*undefined/)
  assert.doesNotMatch(page, /signatureVoiceAuthorizationRef/)
  assert.match(voiceDialog, /useState\(false\)/)
  assert.match(voiceDialog, /aria-required="true"/)
  assert.match(messages, /I agree to use this recording to create synthetic narration for this book and confirm I have permission to use it\./)
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
