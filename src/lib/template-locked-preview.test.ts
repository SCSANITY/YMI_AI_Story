import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildTemplateLockedPreviewPresentation,
  parseTemplateLockedPreviewPages,
} from './template-locked-preview'

function object(name: string, mimetype = 'image/webp', updatedAt = '2026-09-01T01:02:03Z') {
  return { name, updated_at: updatedAt, metadata: { mimetype } }
}

describe('template locked Preview pages', () => {
  it('maps real preview-final basenames to deterministic spread coordinates', () => {
    const pages = parseTemplateLockedPreviewPages('Planet_story', [
      object('page02_R_A.webp'),
      object('page01_L_B.webp'),
      object('page02_L_B.webp'),
      object('page01_R_A.webp'),
      object('notes.txt', 'text/plain'),
    ], (path) => `public:${path}`)

    assert.deepEqual(pages.map((page) => [page.spreadIndex, page.side, page.pageNumber]), [
      [1, 'left', 1],
      [1, 'right', 2],
      [2, 'left', 3],
      [2, 'right', 4],
    ])
    assert.equal(
      pages[2].url,
      'public:Planet_story/preview-final/page02_L_B.webp?v=2026-09-01T01%3A02%3A03Z'
    )

    const presentation = buildTemplateLockedPreviewPresentation(pages)
    assert.equal(presentation?.spreads[1].left?.url, pages[2].url)
    assert.equal(presentation?.spreads[1].right?.url, pages[3].url)
  })

  it('omits an entire spread when a coordinate is missing or duplicated', () => {
    const pages = parseTemplateLockedPreviewPages('Story', [
      object('page01_L_A.webp'),
      object('page01_R_B.webp'),
      object('page02_L_A.webp'),
      object('page02_L_B.webp'),
      object('page02_R_A.webp'),
      object('page03_L_A.webp'),
    ], (path) => path)

    assert.deepEqual(pages.map((page) => page.sourceName), [
      'page01_L_A.webp',
      'page01_R_B.webp',
    ])
  })

  it('accepts only canonical WebP image objects', () => {
    const pages = parseTemplateLockedPreviewPages('Story', [
      object('page01_L_A.png', 'image/png'),
      object('page01_L_A.webp', 'image/png'),
      object('page01_R_B.webp'),
      object('page16_L_A.webp'),
    ], (path) => path)

    assert.deepEqual(pages, [])
  })
})
