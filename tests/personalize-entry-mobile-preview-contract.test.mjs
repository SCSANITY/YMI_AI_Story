import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8')

test('catalogue entry is explicit and one-shot while reload draft recovery remains intact', async () => {
  for (const file of ['components/BookList.tsx', 'components/HomeBookCategories.tsx', 'app/favorites/page.tsx']) {
    assert.match(await read(file), /const getPersonalizeHref = buildPersonalizeIntroHref/)
  }
  const page = await read('components/PersonalizePage.tsx')
  assert.match(page, /setFormStep\(resolvePersonalizeEntryStep\(draft, productIntroEntryRef\.current\)\)/)
  assert.match(page, /params\.delete\('entry'\)[\s\S]*window\.history\.replaceState/)
  assert.match(page, /productIntroEntryRef\.current = false/)
  assert.match(page, /readPersonalizeFormDraft\([\s\S]*setName\(draft\?\.name/)
})

test('Header Back exits Customize rather than rewinding the form while Step Back stays local', async () => {
  const page = await read('components/PersonalizePage.tsx')
  const headerBack = page.slice(page.indexOf('const handleBack ='), page.indexOf('const handleBack =') + 700)
  assert.match(headerBack, /if \(viewState\.showForm\) \{[\s\S]*router\.push\('\/books'\)/)
  assert.doesNotMatch(headerBack, /setFormStep/)
  const flow = await read('components/personalize/PersonalizeFormFlow.tsx')
  assert.match(flow, /onStepChange\('INTRO'\)/)
  assert.match(flow, /onStepChange\('PHOTO'\)/)
  assert.match(flow, /onStepChange\('DETAILS'\)/)
})

test('responsive Preview settles before paint and does not replay cover centering on mount', async () => {
  const stage = await read('components/personalize/PreviewBookStage.tsx')
  assert.match(stage, /useLayoutEffect\(\(\) =>/)
  assert.match(stage, /Math\.abs\(availableWidth - lastWidth\) < 0\.5/)
  assert.match(stage, /data-preview-book-model="true"[\s\S]*initial=\{false\}/)
  assert.match(stage, /transformOrigin: 'top center'[\s\S]*filter: previewBookShadow/)
  assert.doesNotMatch(stage, /transformStyle: 'preserve-3d'[^\n]*filter:/)
  assert.match(stage, /animate=\{\{ rotateY: -180 \}\}/)
  assert.match(stage, /animate=\{\{ rotateY: 0 \}\}/)
})
