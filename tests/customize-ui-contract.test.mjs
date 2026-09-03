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

test('Customize choice surfaces share the scoped liquid-glass material', () => {
  const packageSelector = read('components/personalize/BookPackageSelector.tsx')
  const languageSelector = read('components/personalize/StoryLanguageSelector.tsx')
  const childDetails = read('components/personalize/ChildDetailsFields.tsx')
  const styles = read('components/personalize/customizeControls.module.css')

  assert.match(packageSelector, /styles\.packageOption/)
  assert.match(packageSelector, /aria-pressed=\{isSelected\}/)
  assert.doesNotMatch(packageSelector, /selectedIndicator/)
  assert.match(packageSelector, /styles\.includedPanel/)
  assert.match(packageSelector, /data-open=\{isIncludedOpen\}/)
  assert.match(languageSelector, /styles\.control/)
  assert.match(childDetails, /styles\.control/g)

  assert.match(styles, /\.packageOption\s*\{[\s\S]*?backdrop-filter: blur\(20px\) saturate\(170%\)/)
  assert.match(styles, /\.packageOption\[data-selected='true'\]/)
  assert.match(styles, /\.includedPanel\s*\{[\s\S]*?backdrop-filter: blur\(22px\) saturate\(170%\)/)
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/)
})
