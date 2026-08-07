import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'

import { BookLeafImage, getBookLeafImageStyle } from '@/components/personalize/BookLeafImage'
import { PreviewBookPageContent } from '@/components/personalize/PreviewBookPageContent'
import {
  buildBookPresentation,
  createLegacySpreadLeaf,
  resolveBookLeaf,
  type BookLeaf,
} from './book-presentation'

function singlePageLeaf(
  id: string,
  url: string,
  spreadIndex: number,
  side: 'left' | 'right'
): BookLeaf {
  return {
    id,
    url,
    role: 'preview_interior',
    spreadIndex,
    side,
    pageNumber: side === 'left' ? 1 : 2,
    source: { layout: 'single-page' },
  }
}

describe('physical-book leaf presentation', () => {
  it('pairs explicit left and right leaves without inspecting filenames', () => {
    const left = singlePageLeaf('left-id', 'opaque-source-one', 4, 'left')
    const right = singlePageLeaf('right-id', 'opaque-source-two', 4, 'right')
    const presentation = buildBookPresentation([right, left], {
      coverRole: 'preview_cover',
      interiorRole: 'preview_interior',
    })

    assert.equal(resolveBookLeaf(presentation, 4, 'left')?.url, 'opaque-source-one')
    assert.equal(resolveBookLeaf(presentation, 4, 'right')?.url, 'opaque-source-two')
  })

  it('renders independent leaves at full leaf width with distinct URLs', () => {
    const left = singlePageLeaf('left', 'https://signed.example/left.webp', 1, 'left')
    const right = singlePageLeaf('right', 'https://signed.example/right.webp', 1, 'right')
    const html = renderToStaticMarkup(
      <>
        <BookLeafImage leaf={left} alt="Left page" />
        <BookLeafImage leaf={right} alt="Right page" />
      </>
    )

    assert.match(html, /https:\/\/signed\.example\/left\.webp/)
    assert.match(html, /https:\/\/signed\.example\/right\.webp/)
    assert.equal((html.match(/width:100%/g) ?? []).length, 2)
    assert.doesNotMatch(html, /width:200%/)
    assert.doesNotMatch(html, /left:-100%/)
  })

  it('keeps structured page content isolated from legacy positional URLs', () => {
    const left = singlePageLeaf('left', 'https://signed.example/left.webp', 1, 'left')
    const right = singlePageLeaf('right', 'https://signed.example/right.webp', 1, 'right')
    const presentation = buildBookPresentation([left, right], {
      coverRole: 'preview_cover',
      interiorRole: 'preview_interior',
    })
    const commonProps = {
      spreadIndex: 1,
      bookType: 'basic' as const,
      previewPages: ['legacy-cover.png', 'legacy-spread.png'],
      previewImageErrors: new Set<string>(),
      staticPreviewSecondPageUrl: 'legacy-static.png',
      finalPreviewImages: ['legacy-final.png'],
      bookPresentation: presentation,
      currentSpread: 1,
      isFlipping: false,
      resolvedTitle: 'Test book',
      labels: {
        previewAlt: 'Preview',
        previewPageStillCreating: 'Creating',
        previewPageLocked: 'Locked preview',
        backToCover: 'Back to cover',
        locked: 'Locked',
        pageLabel: (pageNumber: number) => `Page ${pageNumber}`,
      },
      onImageError: () => undefined,
      onTurnPage: () => undefined,
      onReturnToCover: () => undefined,
    }
    const html = renderToStaticMarkup(
      <>
        <PreviewBookPageContent {...commonProps} side="left" />
        <PreviewBookPageContent {...commonProps} side="right" />
      </>
    )

    assert.match(html, /https:\/\/signed\.example\/left\.webp/)
    assert.match(html, /https:\/\/signed\.example\/right\.webp/)
    assert.doesNotMatch(html, /legacy-spread\.png|legacy-static\.png|legacy-final\.png/)
    assert.doesNotMatch(html, /width:200%/)
  })

  it('keeps the current landscape spread crop behind an explicit adapter', () => {
    const left = createLegacySpreadLeaf('legacy-spread.png', 1, 'left')
    const right = createLegacySpreadLeaf('legacy-spread.png', 1, 'right')

    assert.deepEqual(getBookLeafImageStyle(left), { left: '0%', width: '200%' })
    assert.deepEqual(getBookLeafImageStyle(right), { left: '-100%', width: '200%' })
  })

  it('rejects duplicate presentation slots', () => {
    const first = singlePageLeaf('first', 'one.webp', 1, 'left')
    const duplicate = singlePageLeaf('duplicate', 'two.webp', 1, 'left')

    assert.throws(() => buildBookPresentation([first, duplicate], {
      coverRole: 'preview_cover',
      interiorRole: 'preview_interior',
    }), /Duplicate spread 1 left leaf/)
  })

  it('rejects a legacy crop side that disagrees with the explicit leaf side', () => {
    const leaf = createLegacySpreadLeaf('legacy-spread.png', 1, 'left')
    leaf.source = { layout: 'spread-crop', side: 'right' }

    assert.throws(() => buildBookPresentation([leaf], {
      coverRole: 'preview_cover',
      interiorRole: 'preview_interior',
    }), /Mismatched crop side/)
  })

  it('resolves a physical Preview spread through its contiguous display index', () => {
    const left = singlePageLeaf('left', 'left.webp', 4, 'left')
    const presentation = buildBookPresentation([left], {
      coverRole: 'preview_cover',
      interiorRole: 'preview_interior',
    })
    presentation.spreads[0].displayIndex = 1

    assert.equal(resolveBookLeaf(presentation, 1, 'left')?.spreadIndex, 4)
  })
})
