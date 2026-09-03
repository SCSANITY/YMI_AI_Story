import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildTemplateFinalPreviewPresentation,
  parseTemplateFinalPreviewPages,
} from './template-final-preview'

function v3Config() {
  return {
    schema_version: 3,
    asset_layout: 'single-page',
    base_path: 'app-templates/Story',
    pages: [
      {
        index: 0,
        template_image: 'preview0_A.webp',
        presentation: { role: 'preview_cover', spread_index: 0 },
      },
      {
        index: 1,
        template_image: 'preview1_L_A.webp',
        presentation: { role: 'preview_interior', spread_index: 1, side: 'left', page_number: 1 },
      },
      {
        index: 2,
        template_image: 'preview1_R_B.webp',
        presentation: { role: 'preview_interior', spread_index: 1, side: 'right', page_number: 2 },
      },
      {
        index: 3,
        template_image: 'cover-front.any.png',
        presentation: { role: 'final_front_cover', spread_index: 0 },
      },
      ...Array.from({ length: 30 }, (_, index) => ({
        index: index + 4,
        template_image: `arbitrary-${index + 1}.png`,
        presentation: {
          role: 'final_interior',
          spread_index: Math.floor(index / 2) + 1,
          side: index % 2 === 0 ? 'left' : 'right',
          page_number: index + 1,
        },
      })),
    ],
  }
}

describe('template Final preview pages', () => {
  it('uses V3 presentation metadata instead of parsing filenames', () => {
    const pages = parseTemplateFinalPreviewPages(v3Config(), (path) => `public:${path}`)

    assert.equal(pages.length, 31)
    assert.equal(pages[0].role, 'final_front_cover')
    assert.equal(pages[0].side, null)
    assert.equal(pages[1].url, 'public:Story/final/arbitrary-1.png')
    assert.deepEqual(pages.slice(1, 3).map((page) => [page.spreadIndex, page.side, page.pageNumber]), [
      [1, 'left', 1],
      [1, 'right', 2],
    ])
    const presentation = buildTemplateFinalPreviewPresentation(pages)
    assert.equal(presentation?.cover?.role, 'final_front_cover')
    assert.equal(presentation?.spreads[0].left?.url, 'public:Story/final/arbitrary-1.png')
    assert.equal(presentation?.spreads[0].right?.url, 'public:Story/final/arbitrary-2.png')
  })

  it('fails closed when V3 has a back cover, an incomplete spread, or a sided front cover', () => {
    const incomplete = v3Config()
    incomplete.pages.pop()
    assert.deepEqual(parseTemplateFinalPreviewPages(incomplete, (path) => path), [])

    const invalidFront = v3Config()
    ;(invalidFront.pages[3].presentation as { side?: string }).side = 'right'
    assert.deepEqual(parseTemplateFinalPreviewPages(invalidFront, (path) => path), [])

    const withBackCover = v3Config()
    withBackCover.pages.push({
      index: 99,
      template_image: 'back.png',
      presentation: { role: 'final_back_cover', spread_index: 0, side: 'left', page_number: 0 },
    })
    assert.deepEqual(parseTemplateFinalPreviewPages(withBackCover, (path) => path), [])
  })
})
