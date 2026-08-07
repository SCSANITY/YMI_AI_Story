import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildReaderBookDisplay,
  buildReleasedReaderContract,
  getReaderSpreadUrls,
  type ApprovedFinalReaderPage,
  type SignedReaderPage,
} from './reader-page-contract'

const outputPages = [
  { page_index: 12, output_order: 2, role: 'final_interior', spread_index: 1, side: 'left', page_number: 1 },
  { page_index: 11, output_order: 1, role: 'final_front_cover', spread_index: 0, side: 'right', page_number: null },
  { page_index: 13, output_order: 3, role: 'final_interior', spread_index: 1, side: 'right', page_number: 2 },
  { page_index: 10, output_order: 0, role: 'final_back_cover', spread_index: 0, side: 'left', page_number: null },
]

const approvedPages: ApprovedFinalReaderPage[] = outputPages.map((page) => ({
  pageIndex: page.page_index,
  status: 'approved',
  approvedPath: `approved-${page.page_index}.png`,
}))

describe('released Final Reader contract', () => {
  it('merges approved paths with explicit V2 metadata by page index', () => {
    const contract = buildReleasedReaderContract({
      outputAssets: { schema_version: 2, asset_layout: 'single-page', pages: outputPages },
      approvedPages: approvedPages.slice().reverse(),
      totalPages: 4,
    })

    assert.equal(contract.frontCoverPageIndex, 11)
    assert.deepEqual(contract.pages.map((page) => page.pageIndex), [10, 11, 12, 13])
    assert.equal(contract.pages[2].approvedPath, 'approved-12.png')
    assert.equal(contract.pages[2].side, 'left')
  })

  it('rejects an incomplete V2 interior spread', () => {
    const incompletePages = [outputPages[0], outputPages[1], outputPages[3]]
    const incompleteApprovedPages = incompletePages.map((page) => ({
      pageIndex: page.page_index,
      status: 'approved',
      approvedPath: `approved-${page.page_index}.png`,
    }))
    assert.throws(() => buildReleasedReaderContract({
      outputAssets: { schema_version: 2, asset_layout: 'single-page', pages: incompletePages },
      approvedPages: incompleteApprovedPages,
      totalPages: 3,
    }), /interior spread coverage mismatch/)
  })

  it('preserves the released V1 positional contract', () => {
    const contract = buildReleasedReaderContract({
      outputAssets: { pages: [{ page_index: 1 }, { page_index: 0 }] },
      approvedPages: [
        { pageIndex: 1, status: 'approved', approvedPath: 'page-1.png' },
        { pageIndex: 0, status: 'approved', approvedPath: 'page-0.png' },
      ],
      totalPages: 2,
    })

    assert.equal(contract.schemaVersion, null)
    assert.deepEqual(contract.pages.map((page) => page.pageIndex), [0, 1])
  })

  it('rejects a released page whose review status is no longer approved', () => {
    assert.throws(() => buildReleasedReaderContract({
      outputAssets: {},
      approvedPages: [{ pageIndex: 0, status: 'needs_fix', approvedPath: 'page-0.png' }],
      totalPages: 1,
    }), /coverage mismatch/)
  })

  it('uses the approved Final front cover and pairs independent interiors', () => {
    const pages: SignedReaderPage[] = outputPages.map((page) => ({
      pageIndex: page.page_index,
      status: 'approved',
      outputOrder: page.output_order,
      role: page.role as SignedReaderPage['role'],
      spreadIndex: page.spread_index,
      side: page.side as SignedReaderPage['side'],
      pageNumber: page.page_number,
      url: `signed-${page.page_index}`,
    }))
    const display = buildReaderBookDisplay({
      schemaVersion: 2,
      assetLayout: 'single-page',
      legacyCoverUrl: 'preview-cover-must-not-win',
      pages,
    })

    assert.equal(display.coverUrl, 'signed-11')
    assert.deepEqual(getReaderSpreadUrls(display, 1), ['signed-12', 'signed-13'])
    assert.equal(display.preloadUrls.includes('signed-10'), false)
    assert.equal(display.maxSpreadIndex, 1)
  })

  it('renders a complete 32-page V2 release as one front cover and 15 spreads', () => {
    const pages = [
      {
        page_index: 0,
        output_order: 0,
        role: 'final_back_cover',
        spread_index: 0,
        side: 'left',
        page_number: null,
      },
      {
        page_index: 1,
        output_order: 1,
        role: 'final_front_cover',
        spread_index: 0,
        side: 'right',
        page_number: null,
      },
      ...Array.from({ length: 30 }, (_, index) => ({
        page_index: index + 2,
        output_order: index + 2,
        role: 'final_interior',
        spread_index: Math.floor(index / 2) + 1,
        side: index % 2 === 0 ? 'left' : 'right',
        page_number: index + 1,
      })),
    ]
    const contract = buildReleasedReaderContract({
      outputAssets: { schema_version: 2, asset_layout: 'single-page', pages },
      approvedPages: pages.map((page) => ({
        pageIndex: page.page_index,
        status: 'approved',
        approvedPath: `approved-${page.page_index}.png`,
      })),
      totalPages: 32,
    })
    const display = buildReaderBookDisplay({
      schemaVersion: contract.schemaVersion,
      assetLayout: contract.assetLayout,
      legacyCoverUrl: 'preview-cover-must-not-win',
      pages: contract.pages.map(({ approvedPath, ...page }) => ({
        ...page,
        url: `signed:${approvedPath}`,
      })),
    })

    assert.equal(display.coverUrl, 'signed:approved-1.png')
    assert.equal(display.presentation?.spreads.length, 15)
    assert.deepEqual(getReaderSpreadUrls(display, 15), [
      'signed:approved-30.png',
      'signed:approved-31.png',
    ])
    assert.equal(display.preloadUrls.length, 31)
    assert.equal(display.preloadUrls.includes('signed:approved-0.png'), false)
  })
})
