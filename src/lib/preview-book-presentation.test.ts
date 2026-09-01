import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { SignedPreviewAssets, SignedPreviewPage } from './preview-page-contract'
import {
  getAllPreviewDisplayUrls,
  getPreviewMaxSpreadIndex,
  getPreviewPreloadSpreadIndexes,
  getPreviewSpreadUrls,
  isPreviewDisplayComplete,
  resolvePreviewDisplayAssets,
} from './preview-book-presentation'

function page(overrides: Partial<SignedPreviewPage> & Pick<SignedPreviewPage, 'page_index' | 'url'>): SignedPreviewPage {
  return {
    asset_size: 'small',
    ...overrides,
  }
}

const structuredAssets: SignedPreviewAssets = {
  urls: ['right.webp', 'cover.webp', 'left.webp'],
  schemaVersion: 2,
  assetLayout: 'single-page',
  pages: [
    page({ page_index: 2, output_order: 2, role: 'preview_interior', spread_index: 7, side: 'right', page_number: 14, url: 'right.webp' }),
    page({ page_index: 0, output_order: 0, role: 'preview_cover', spread_index: 0, side: null, page_number: null, url: 'cover.webp' }),
    page({ page_index: 1, output_order: 1, role: 'preview_interior', spread_index: 7, side: 'left', page_number: 13, url: 'left.webp' }),
  ],
}

describe('Personalize structured Preview presentation', () => {
  it('uses explicit roles and sides instead of response or filename order', () => {
    const display = resolvePreviewDisplayAssets(structuredAssets)

    assert.equal(display.coverUrl, 'cover.webp')
    assert.equal(display.presentation?.spreads[0].spreadIndex, 7)
    assert.equal(display.presentation?.spreads[0].displayIndex, 1)
    assert.equal(display.presentation?.spreads[0].left?.url, 'left.webp')
    assert.equal(display.presentation?.spreads[0].right?.url, 'right.webp')
    assert.equal(isPreviewDisplayComplete(display), true)
  })

  it('preloads both independent leaves for the requested spread', () => {
    const display = resolvePreviewDisplayAssets(structuredAssets)

    assert.deepEqual(getPreviewSpreadUrls(display, 1), ['left.webp', 'right.webp'])
    assert.equal(getPreviewMaxSpreadIndex(display), 1)
    assert.deepEqual(getAllPreviewDisplayUrls(display), ['cover.webp', 'left.webp', 'right.webp'])
  })

  it('limits physical-book preloading to the current and adjacent spreads', () => {
    assert.deepEqual(getPreviewPreloadSpreadIndexes(0, 15), [0, 1])
    assert.deepEqual(getPreviewPreloadSpreadIndexes(7, 15), [6, 7, 8])
    assert.deepEqual(getPreviewPreloadSpreadIndexes(15, 15), [14, 15])
  })

  it('keeps a cover-only partial response representable but incomplete', () => {
    const display = resolvePreviewDisplayAssets({
      ...structuredAssets,
      urls: ['cover.webp'],
      pages: [structuredAssets.pages[1]],
    })

    assert.equal(display.coverUrl, 'cover.webp')
    assert.equal(isPreviewDisplayComplete(display), false)
  })

  it('preserves V1 positional assets without constructing a structured model', () => {
    const display = resolvePreviewDisplayAssets({
      urls: ['legacy-cover.png', 'legacy-spread.png'],
      pages: [],
      schemaVersion: null,
      assetLayout: null,
    })

    assert.equal(display.presentation, null)
    assert.equal(display.coverUrl, 'legacy-cover.png')
    assert.equal(isPreviewDisplayComplete(display), true)
  })

  it('rejects V2 pages whose required presentation metadata was filtered away', () => {
    const malformed = {
      ...structuredAssets,
      pages: structuredAssets.pages.map((candidate) => candidate.page_index === 1
        ? { ...candidate, page_number: undefined }
        : candidate),
    }

    assert.throws(() => resolvePreviewDisplayAssets(malformed), /Invalid structured Preview page 1/)
  })
})
