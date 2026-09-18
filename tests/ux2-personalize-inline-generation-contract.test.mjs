import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8')

test('full description uses the existing catalog read model with accessible two-line disclosure', async () => {
  const [page, intro, catalog] = await Promise.all([read('components/PersonalizePage.tsx'), read('components/personalize/PersonalizeProductIntro.tsx'), read('src/lib/template-catalog-server.ts')])
  assert.match(catalog, /'inner_description'/)
  assert.match(page, /description=\{resolvedBook\?\.innerDescription \|\| resolvedBook\?\.description/)
  assert.match(intro, /line-clamp-2/)
  assert.match(intro, /target\.scrollHeight > lineHeight \* 2 \+ 1/)
  assert.match(intro, /aria-expanded=\{descriptionExpanded\}/)
  assert.match(intro, /aria-controls=\{descriptionId\}/)
  assert.match(intro, /ResizeObserver\(measure\)/)
})

test('only the voiced physical edition carries the badge and labels explain the formats', async () => {
  const [page, messages] = await Promise.all([read('components/PersonalizePage.tsx'), read('src/lib/i18n-messages.ts')])
  const editions = page.slice(page.indexOf('const editionOptions ='), page.indexOf('const isAgeBelowRecommendedRange'))
  assert.doesNotMatch(editions.slice(0, editions.indexOf("value: 'supreme'")), /badge:/)
  assert.match(editions.slice(editions.indexOf("value: 'supreme'")), /badge: t\('personalize\.mostPopular'\)/)
  assert.match(messages, /'personalize\.bookTypeBasicTitle': 'Hardcover'/)
  assert.match(messages, /'personalize\.bookTypeSupremeTitle': 'Hardcover \+ Voice'/)
})

test('restoring Creation data is identity-scoped and cannot overwrite local edition/voice choices', async () => {
  const page = await read('components/PersonalizePage.tsx')
  const hydration = page.slice(page.indexOf("const selectionRevision ="), page.indexOf('// Creation hydration'))
  assert.equal((hydration.match(/canHydrateEdition\(selectionRevision, editionSelectionRevisionRef\.current\)/g) ?? []).length, 2)
  const dependencies = page.slice(page.indexOf('// Creation hydration'), page.indexOf('const replacePersonalizeUrl'))
  assert.doesNotMatch(dependencies, /\[[^\]]*\bbookType\b|\[[^\]]*\bname\b|\[[^\]]*\bage\b/)
  assert.match(page, /editionSelectionRevisionRef\.current \+= 1/)
  const panel = await read('components/personalize/PreviewPurchasePanel.tsx')
  assert.match(panel, /selection\.confirmedValue !== value \|\| selection\.editionError !== editionError/)
  assert.match(panel, /setSelection\(\{ confirmedValue: value, editionError, value \}\)/)
  assert.doesNotMatch(panel, /useEffect/)
})
