import assert from 'node:assert/strict'
import test from 'node:test'
import { previewImageIdentity, retainPreviewImageUrl, mergePreviewPresentation } from './preview-image-continuity'
import { resolvePreviewDisplayAssets, isPreviewDisplayComplete } from './preview-book-presentation'
import type { SignedPreviewPage } from './preview-page-contract'

const image = (name: string, token: string) => `https://example.supabase.co/storage/v1/object/sign/private/job-a/${name}.webp?token=${token}`
const presentation = (token: string, partial = false) => {
  const pages: SignedPreviewPage[] = [
    { page_index: 0, output_order: 0, role: 'preview_cover', spread_index: 0, side: null, page_number: null, asset_size: 'small', url: image('cover', token) },
    ...(!partial ? [
      { page_index: 1, output_order: 1, role: 'preview_interior' as const, spread_index: 1, side: 'left' as const, page_number: 1, asset_size: 'small' as const, url: image('left', token) },
      { page_index: 2, output_order: 2, role: 'preview_interior' as const, spread_index: 1, side: 'right' as const, page_number: 2, asset_size: 'small' as const, url: image('right', token) },
    ] : []),
  ]
  return resolvePreviewDisplayAssets({ pages, urls: pages.map((page) => page.url), schemaVersion: 3, assetLayout: 'single-page' }).presentation
}

test('only Supabase token renewal has stable identity, not another object/transform/unfamiliar query', () => {
  assert.equal(previewImageIdentity(image('cover', 'one')), previewImageIdentity(image('cover', 'two')))
  assert.notEqual(previewImageIdentity(image('cover', 'one')), previewImageIdentity(image('left', 'one')))
  assert.notEqual(previewImageIdentity(image('cover', 'one')), previewImageIdentity(`${image('cover', 'one')}&width=120`))
  assert.notEqual(previewImageIdentity('https://other.example/image?token=one'), previewImageIdentity('https://other.example/image?token=two'))
  assert.equal(retainPreviewImageUrl(image('cover', 'one'), image('cover', 'two')), image('cover', 'one'))
  assert.equal(retainPreviewImageUrl(image('cover', 'one'), image('cover', 'two'), true), image('cover', 'two'))
})

test('20 progressive polls and partial snapshots never retract the cover or loaded leaves', () => {
  let current = presentation('first')
  for (let poll = 1; poll <= 20; poll++) {
    current = mergePreviewPresentation(current, presentation(`renewed-${poll}`, poll % 3 === 0))
    assert.equal(current?.cover?.url, image('cover', 'first'))
    assert.equal(current?.spreads[0].left?.url, image('left', 'first'))
    assert.equal(current?.spreads[0].right?.url, image('right', 'first'))
    assert.equal(isPreviewDisplayComplete({ urls: [], presentation: current }), true)
  }
  assert.equal(mergePreviewPresentation(current, null), current)
})

test('new leaves arrive progressively; explicit renewal works; another job never inherits old pages', () => {
  const partial = presentation('first', true)
  const complete = mergePreviewPresentation(partial, presentation('second'))
  assert.equal(complete?.cover?.url, image('cover', 'first'))
  assert.equal(complete?.spreads[0].left?.url, image('left', 'second'))
  const renewed = mergePreviewPresentation(complete, presentation('third'), true)
  assert.equal(renewed?.cover?.url, image('cover', 'third'))
  assert.equal(renewed?.spreads[0].right?.url, image('right', 'third'))
  const other = presentation('other', true)!
  other.cover = { ...other.cover!, url: image('cover', 'other').replace('job-a', 'job-b') }
  assert.equal(mergePreviewPresentation(complete, other), other)
  assert.equal(other.spreads.length, 0)
})
