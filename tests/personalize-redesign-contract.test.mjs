import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (relativePath) => readFile(new URL(relativePath, root), 'utf8')

test('PX-001 separates product introduction, preview inputs, and post-Preview purchase choices', async () => {
  const [page, formFlow, productIntro, purchasePanel, layout] = await Promise.all([
    read('components/PersonalizePage.tsx'),
    read('components/personalize/PersonalizeFormFlow.tsx'),
    read('components/personalize/PersonalizeProductIntro.tsx'),
    read('components/personalize/PreviewPurchasePanel.tsx'),
    read('components/personalize/PreviewStepLayout.tsx'),
  ])

  assert.match(page, /useState<PersonalizeFormStep>\('INTRO'\)/)
  assert.match(formFlow, /'INTRO' \| 'PHOTO' \| 'DETAILS' \| 'REVIEW'/)
  assert.match(formFlow, /STEP_META = \{ PHOTO: 1, DETAILS: 2, REVIEW: 3 \}/)
  assert.match(productIntro, /onStart/)
  assert.doesNotMatch(formFlow, /BookPackageSelector|VoiceRecorderPanel|Signature Voice/)
  assert.match(page, /book_type: 'basic'/)
  assert.match(page, /<PreviewPurchasePanel/)
  assert.match(purchasePanel, /type="radio"/)
  assert.match(purchasePanel, /value === 'supreme'/)
  assert.match(layout, /xl:grid-cols-\[minmax\(0,7fr\)_minmax\(310px,3fr\)\]/)
  assert.match(layout, /max-w-\[380px\][^>]*>\{intro\}/)
  assert.match(layout, /\{progress\}[\s\S]*?\{intro\}[\s\S]*?\{book\}/)
})

test('PX-001 refinement removes the duplicated top-bar title and restores compact database-driven Magic Attribute meters', async () => {
  const [page, header, attributes, carousel, formFlow, generateAction] = await Promise.all([
    read('components/PersonalizePage.tsx'),
    read('components/personalize/PersonalizeHeader.tsx'),
    read('components/personalize/MagicAttributesPanel.tsx'),
    read('components/personalize/ProductShowcaseCarousel.tsx'),
    read('components/personalize/PersonalizeFormFlow.tsx'),
    read('components/personalize/GeneratePreviewAction.tsx'),
  ])

  assert.doesNotMatch(header, /title:\s*string|\{title\}/)
  assert.doesNotMatch(page, /<PersonalizeHeader[\s\S]{0,120}title=/)
  assert.match(attributes, /role="progressbar"/)
  assert.match(attributes, /style=\{\{ width: `\$\{percent\}%` \}\}/)
  assert.match(attributes, /max-w-\[520px\]/)
  assert.match(attributes, /h-2\.5 overflow-hidden/)
  assert.doesNotMatch(attributes, /attributes\.slice\(/)
  assert.doesNotMatch(carousel, /uploadPanelRef|uploadRect/)
  assert.doesNotMatch(carousel, /useEffect\(\(\) => \{[\s\S]{0,160}setActiveIndex\(0\)/)
  assert.match(page, /<ProductShowcaseCarousel[\s\S]{0,80}key=\{bookID\}/)
  assert.match(formFlow, /text-\[1\.65rem\][^\n]*sm:text-\[1\.75rem\]/)
  assert.match(formFlow, /mt-1\.5 text-\[13px\][^\n]*sm:text-sm/)
  assert.match(formFlow, /<dl[\s\S]*aria-label=\{props\.labels\.detailsSummary\}/)
  assert.match(formFlow, /id="review-child-name"[\s\S]*label=\{props\.childLabels\.nameLabel\}[\s\S]*value=\{props\.initialName\}/)
  assert.match(formFlow, /id="review-child-age"[\s\S]*label=\{props\.childLabels\.ageLabel\}[\s\S]*value=\{props\.initialAge\}/)
  assert.doesNotMatch(formFlow, /\{props\.initialName\}[^\n]*\{props\.initialAge\}/)
  assert.match(generateAction, /bg-gradient-to-r from-amber-500 via-orange-500 to-orange-600/)
})

test('PX-001 uses truthful edition artwork with graceful image failure behavior', async () => {
  const purchasePanel = await read('components/personalize/PreviewPurchasePanel.tsx')
  assert.match(purchasePanel, /failedImages/)
  assert.match(purchasePanel, /onError=/)
  assert.match(purchasePanel, /imageFailed \? 'grid-cols-/)

  await Promise.all([
    access(new URL('public/personalize-editions/cloud-explorer.svg', root)),
    access(new URL('public/personalize-editions/classic-portrait.svg', root)),
    access(new URL('public/personalize-editions/signature-voice.svg', root)),
  ])
})

test('PX-001 keeps privacy promises exact and requires a separate Signature Voice authorization', async () => {
  const [privacy, dialog, messages, recorder] = await Promise.all([
    read('components/personalize/PrivacyReassurance.tsx'),
    read('components/personalize/SignatureVoiceDialog.tsx'),
    read('src/lib/i18n-messages.ts'),
    read('components/personalize/VoiceRecorderPanel.tsx'),
  ])

  const reassurance = 'Private and secure. No third-party reuse.'
  const authorization = 'I agree to use this recording to create synthetic narration for this book and confirm I have permission to use it.'
  assert.match(privacy, new RegExp(reassurance.replaceAll('.', '\\.')))
  assert.match(messages, new RegExp(authorization.replaceAll('.', '\\.')))
  assert.match(recorder, /t\('voiceRecorder\.secureNote'\)/)
  assert.match(messages, /'voiceRecorder\.secureNote': 'Private and secure\. No third-party reuse\.'/)
  assert.match(dialog, /useState\(false\)/)
  assert.match(dialog, /aria-required="true"/)
  assert.match(dialog, /!pendingRecording \|\| !authorized \|\| isSaving/)
})

test('PX-001 purchase configuration is owner-scoped, preview-guarded, lock-aware, server-priced, and locally optimistic', async () => {
  const [route, service, page, purchasePanel] = await Promise.all([
    read('app/api/creations/[creationId]/purchase-configuration/route.ts'),
    read('src/services/purchaseConfiguration.ts'),
    read('components/PersonalizePage.tsx'),
    read('components/personalize/PreviewPurchasePanel.tsx'),
  ])

  assert.match(route, /resolveCheckoutOwner\(request/)
  assert.match(route, /ownerFilter\(owner\)/)
  assert.match(route, /\.eq\('owner_type', filter\.owner_type\)[\s\S]*\.eq\(filter\.column, filter\.value\)/)
  assert.match(route, /creation\.preview_job_id[\s\S]*expectedPreviewJobId[\s\S]*preview_conflict/)
  assert.match(route, /loadCreationPhotoLockState/)
  assert.match(route, /purchase_configuration_locked/)
  assert.match(route, /voice_configuration_locked/)
  assert.match(route, /template_package_prices/)
  assert.match(route, /Promise\.allSettled\(\[[\s\S]*loadCreationPhotoLockState\(creationId\)[\s\S]*\.from\('template_package_prices'\)/)
  assert.match(route, /packagePriceRowToModel/)
  assert.match(service, /credentials: 'include'/)
  assert.match(purchasePanel, /startTransition[\s\S]*useOptimistic/)
  assert.match(purchasePanel, /const \[optimisticValue, setOptimisticValue\] = useOptimistic\(value\)/)
  assert.match(purchasePanel, /setOptimisticValue\(nextValue\)[\s\S]*await onChange\(nextValue\)/)
  assert.match(purchasePanel, /disabled=\{selectionPending\}/)
  assert.match(page, /onChange=\{handleEditionChange\}/)
  assert.doesNotMatch(page, /setBookType\(nextPackageType\)/)
  assert.match(page, /await ensureCurrentPurchaseConfiguration\(\)/g)
})
