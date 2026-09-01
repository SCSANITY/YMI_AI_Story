import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildBookPresentation } from './book-presentation'
import {
  buildTemplateLockedPreviewPresentation,
  buildTemplatePreviewFirstSpreadPresentation,
  getTemplatePreviewFirstSpreadDisplayUrls,
  parseTemplateLockedPreviewPages,
  parseTemplatePreviewFirstSpreadPages,
} from './template-locked-preview'

function object(name: string, mimetype = 'image/webp', updatedAt = '2026-09-01T01:02:03Z') {
  return { name, updated_at: updatedAt, metadata: { mimetype } }
}

describe('template locked Preview pages', () => {
  it('maps the actual root preview1 A/B variants by left and right coordinate', () => {
    const pages = parseTemplatePreviewFirstSpreadPages('Planet_story', [
      object('preview1_R_A.webp'),
      object('preview1_L_B.webp'),
      object('preview0_A.webp'),
      object('preview1_L_A.png', 'image/png'),
    ], (path) => `public:${path}`)

    assert.deepEqual(pages.map((page) => [page.sourceName, page.side, page.pageNumber]), [
      ['preview1_L_B.webp', 'left', 1],
      ['preview1_R_A.webp', 'right', 2],
    ])
    assert.equal(
      pages[0].url,
      'public:Planet_story/preview1_L_B.webp?v=2026-09-01T01%3A02%3A03Z'
    )

    const presentation = buildTemplatePreviewFirstSpreadPresentation(pages)
    assert.equal(presentation?.spreads[0].left?.url, pages[0].url)
    assert.equal(presentation?.spreads[0].right?.url, pages[1].url)

    const generated = buildBookPresentation([
      {
        id: 'generated-left',
        url: 'generated-left.webp',
        role: 'preview_interior',
        spreadIndex: 1,
        side: 'left',
        pageNumber: 1,
        source: { layout: 'single-page' },
      },
    ], { coverRole: 'preview_cover', interiorRole: 'preview_interior' })
    assert.deepEqual(
      getTemplatePreviewFirstSpreadDisplayUrls(generated, presentation),
      ['generated-left.webp', pages[1].url]
    )
  })

  it('omits only an ambiguous preview1 side so the other side can still render', () => {
    const pages = parseTemplatePreviewFirstSpreadPages('Story', [
      object('preview1_L_A.webp'),
      object('preview1_L_B.webp'),
      object('preview1_R_B.webp'),
      object('preview1_R_A.webp', 'image/png'),
    ], (path) => path)

    assert.deepEqual(pages.map((page) => page.sourceName), ['preview1_R_B.webp'])
  })

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
