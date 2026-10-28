import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

test('v2 uses the fixed 820 book space and fluid adjacent final panel',()=>{
  const css=read('components/personalize/PreviewExperience.module.css')
  const layout=read('components/personalize/PreviewStepLayout.tsx')
  assert.match(css,/grid-template-columns:minmax\(0,820px\) minmax\(300px,360px\)/)
  assert.match(layout,/\{progress\}[\s\S]*\{intro\}[\s\S]*\{status\}[\s\S]*\{book\}[\s\S]*\{versions\}[\s\S]*\{purchase\}/)
  assert.match(css,/@media\(max-width:767px\) and \(orientation:portrait\)/)
  assert.match(css,/\.mobileStatus\{display:block;height:82px/)
  assert.doesNotMatch(layout,/IntersectionObserver|ChevronsDown/)
})
test('the one shell scales against its column and clips its 820 coordinate box',()=>{
  const shell=read('components/personalize/PreviewBookShell.tsx'),css=read('components/personalize/PreviewBookShell.module.css')
  assert.match(shell,/new ResizeObserver\(update\)/)
  assert.match(shell,/element.getBoundingClientRect\(\).width/)
  assert.match(shell,/metrics.width\/\(openTarget\?PREVIEW_BOOK_GEOMETRY.openWidth:PREVIEW_BOOK_GEOMETRY.closedScaleDenominator\)/)
  assert.match(css,/overflow-x:clip/)
  assert.match(shell,/const layoutDuration=turn&&turn.kind!=='page'\?duration:0/)
})
test('phone sticky Purchase replaces the old scroll cue with the same selected edition/price',()=>{
  const page=read('components/PersonalizePage.tsx'),layout=read('components/personalize/PreviewStepLayout.tsx'),css=read('components/personalize/PreviewExperience.module.css')
  assert.match(page,/<PreviewMobilePurchase edition=\{purchaseBookType === 'supreme'/)
  assert.match(page,/price=\{purchasePrice\} ready=\{purchaseReady\}/)
  assert.match(layout,/\{mobilePurchase\}/)
  assert.match(css,/\.mobilePurchase\{display:flex;position:fixed/)
  assert.match(css,/safe-area-inset-bottom/)
})
