import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createFinalV3Metadata } from './final-page-metadata.fixture'
import {
  buildReaderBookDisplay,
  buildReleasedReaderContract,
  getReaderSpreadUrls,
  type ApprovedFinalReaderPage,
} from './reader-page-contract'

function fixture() {
  const pages = createFinalV3Metadata((outputOrder) => 100 + outputOrder * 3)
  const approvedPages: ApprovedFinalReaderPage[] = pages.map((page) => ({
    pageIndex: page.page_index,
    status: 'approved',
    approvedPath: `approved-${page.page_index}.png`,
  }))
  return { pages, approvedPages }
}

describe('released Final Reader contract', () => {
  it('merges 31 approved paths with explicit V3 metadata by page index', () => {
    const { pages, approvedPages } = fixture()
    const contract = buildReleasedReaderContract({
      outputAssets: { schema_version: 3, asset_layout: 'single-page', pages },
      approvedPages: approvedPages.slice().reverse(),
      totalPages: 31,
    })

    assert.equal(contract.frontCoverPageIndex, 100)
    assert.deepEqual(contract.pages.map((page) => page.pageIndex), pages.map((page) => page.page_index))
    assert.equal(contract.pages[1].approvedPath, 'approved-103.png')
    assert.equal(contract.pages[1].side, 'left')
  })

  it('rejects incomplete V3 page coverage and non-approved review state', () => {
    const { pages, approvedPages } = fixture()
    assert.throws(() => buildReleasedReaderContract({
      outputAssets: { schema_version: 3, asset_layout: 'single-page', pages: pages.slice(0, -1) },
      approvedPages: approvedPages.slice(0, -1),
      totalPages: 30,
    }), /output page coverage mismatch/)
    assert.throws(() => buildReleasedReaderContract({
      outputAssets: { schema_version: 3, asset_layout: 'single-page', pages },
      approvedPages: approvedPages.map((page, index) => index === 1 ? { ...page, status: 'needs_fix' } : page),
      totalPages: 31,
    }), /coverage mismatch/)
  })

  it('rejects unversioned and superseded V2 releases', () => {
    const { pages, approvedPages } = fixture()
    for (const outputAssets of [
      { pages },
      { schema_version: 2, asset_layout: 'single-page', pages },
    ]) {
      assert.throws(() => buildReleasedReaderContract({
        outputAssets,
        approvedPages,
        totalPages: 31,
      }), /contract marker/)
    }
  })

  it('renders one approved front cover and 15 complete interior spreads', () => {
    const { pages, approvedPages } = fixture()
    const contract = buildReleasedReaderContract({
      outputAssets: { schema_version: 3, asset_layout: 'single-page', pages },
      approvedPages,
      totalPages: 31,
    })
    const display = buildReaderBookDisplay({
      schemaVersion: contract.schemaVersion,
      assetLayout: contract.assetLayout,
      pages: contract.pages.map(({ approvedPath, ...page }) => ({
        ...page,
        url: `signed:${approvedPath}`,
      })),
    })

    assert.equal(display.coverUrl, 'signed:approved-100.png')
    assert.equal(display.presentation?.spreads.length, 15)
    assert.deepEqual(getReaderSpreadUrls(display, 15), [
      'signed:approved-187.png',
      'signed:approved-190.png',
    ])
    assert.equal(display.preloadUrls.length, 31)
  })
})
