import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

test('template detail uses preview-final Storage objects instead of Final config URLs', () => {
  const route = read('src/lib/template-catalog-server.ts')

  assert.match(route, /\.list\(`\$\{templateId\}\/preview-final`/)
  assert.match(route, /parseTemplateLockedPreviewPages/)
  assert.match(route, /\.list\(templateId,/)
  assert.match(route, /search: 'preview1_'/)
  assert.match(route, /parseTemplatePreviewFirstSpreadPages/)
  assert.match(route, /preview_first_spread_pages/)
  assert.doesNotMatch(route, /\.list\(`\$\{templateId\}\/final`/)
  assert.doesNotMatch(route, /parseTemplateFinalPreviewPages|\.download\(configPath\)/)
})

test('Customize Preview has no legacy second-page or whole-book preload authority', () => {
  const personalize = read('components/PersonalizePage.tsx')

  assert.doesNotMatch(personalize, /preview_2\.png|staticPreviewSecondPageUrl|backgroundPreloadId|allPreviewUrls/)
  assert.doesNotMatch(personalize, /finalPreviewImages|lockedFinalPresentation/)
  assert.match(personalize, /getPreviewPreloadSpreadIndexes\(currentSpread, maxSpreadIndex\)/)
  assert.match(personalize, /resolvePreviewSpreadImages\(targetSpread\)\.forEach\(preloadPreviewImage\)/)
  assert.match(personalize, /resolvePreviewSpreadImages\(targetSpread \+ 1\)\.forEach\(preloadPreviewImage\)/)
  assert.match(personalize, /lockedPreviewPresentation/)
  assert.match(personalize, /previewFirstSpreadPresentation/)

  const pageContent = read('components/personalize/PreviewBookPageContent.tsx')
  assert.match(pageContent, /usableFirstSpreadUnderlay/)
  assert.match(pageContent, /isGeneratingWithUnderlay/)
  assert.match(pageContent, /previewPageStillCreating/)
})
