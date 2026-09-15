import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const projectRoot = new URL('../', import.meta.url)
const read = (path) => readFileSync(new URL(path, projectRoot), 'utf8')

test('Customize language menu keeps English as the only selectable runtime option', () => {
  const selector = read('components/personalize/StoryLanguageSelector.tsx')

  assert.match(selector, /value: 'English', labelKey: 'english', disabled: false/)
  for (const language of [
    'Simplified Chinese',
    'Traditional Chinese',
    'Spanish',
    'French',
    'Deutsch',
    'Arabic',
  ]) {
    assert.match(selector, new RegExp(`value: '${language}'[^\n]*disabled: true`))
  }

  assert.match(selector, /if \(option\.disabled\) return\s+handleSelect\('English'\)/)
  assert.match(selector, /role="listbox"/)
  assert.match(selector, /role="option"/)
  assert.doesNotMatch(selector, /\bCheck\b|\bClock3\b|bg-emerald-500/)
})

test('Customize keeps details focused while Preview owns the image-led edition choices', () => {
  const personalize = read('components/PersonalizePage.tsx')
  const formFlow = read('components/personalize/PersonalizeFormFlow.tsx')
  const purchasePanel = read('components/personalize/PreviewPurchasePanel.tsx')
  const languageSelector = read('components/personalize/StoryLanguageSelector.tsx')
  const childDetails = read('components/personalize/ChildDetailsFields.tsx')
  const styles = read('components/personalize/customizeControls.module.css')

  assert.match(personalize, /formStep === 'INTRO'/)
  assert.match(personalize, /<PersonalizeFormFlow/)
  assert.match(personalize, /<PreviewPurchasePanel/)
  assert.doesNotMatch(personalize, /<CustomizeFormFields|<BookPackageSelector/)
  assert.doesNotMatch(formFlow, /BookPackageSelector|VoiceRecorderPanel|bookType/)
  assert.match(purchasePanel, /type="radio"/)
  assert.match(purchasePanel, /name="book-edition"/)
  assert.match(purchasePanel, /option\.image/)
  assert.match(purchasePanel, /value === 'supreme'/)
  assert.match(languageSelector, /styles\.control/)
  assert.match(childDetails, /styles\.control/g)

  assert.match(styles, /\.control\s*\{[\s\S]*?backdrop-filter:/)
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/)
})
