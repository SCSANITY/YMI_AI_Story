import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildTemplateFinalPreviewPresentation,
  parseTemplateFinalPreviewPages,
} from './template-final-preview'

describe('template Final preview pages', () => {
  it('uses V2 presentation metadata instead of parsing filenames', () => {
    const pages = parseTemplateFinalPreviewPages({
      schema_version: 2,
      asset_layout: 'single-page',
      base_path: 'app-templates/Story',
      pages: [
        { index: 7, template_image: 'cover-back.any.png', presentation: { role: 'final_back_cover', spread_index: 0, side: 'left' } },
        { index: 2, template_image: 'cover-front.any.png', presentation: { role: 'final_front_cover', spread_index: 0, side: 'right' } },
        { index: 99, template_image: 'not-a-page-name.png', presentation: { role: 'final_interior', spread_index: 1, side: 'left', page_number: 1 } },
        { index: 4, template_image: 'also-arbitrary.png', presentation: { role: 'final_interior', spread_index: 1, side: 'right', page_number: 2 } },
      ],
    }, (path) => `public:${path}`)

    assert.equal(pages.length, 4)
    assert.equal(pages[2].url, 'public:Story/final/not-a-page-name.png')
    assert.deepEqual(pages.slice(2).map((page) => [page.spreadIndex, page.side, page.pageNumber]), [
      [1, 'left', 1],
      [1, 'right', 2],
    ])
    const presentation = buildTemplateFinalPreviewPresentation(pages)
    assert.equal(presentation?.cover?.role, 'final_front_cover')
    assert.equal(presentation?.spreads[0].left?.url, 'public:Story/final/not-a-page-name.png')
    assert.equal(presentation?.spreads[0].right?.url, 'public:Story/final/also-arbitrary.png')
  })

  it('fails closed when a structured spread is incomplete', () => {
    const pages = parseTemplateFinalPreviewPages({
      schema_version: 2,
      asset_layout: 'single-page',
      base_path: 'Story',
      pages: [
        { index: 0, template_image: 'back.png', presentation: { role: 'final_back_cover', spread_index: 0, side: 'left' } },
        { index: 1, template_image: 'front.png', presentation: { role: 'final_front_cover', spread_index: 0, side: 'right' } },
        { index: 2, template_image: 'left.png', presentation: { role: 'final_interior', spread_index: 1, side: 'left', page_number: 1 } },
      ],
    }, (path) => path)

    assert.deepEqual(pages, [])
  })
})
