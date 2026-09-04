import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildSignedPreviewResponse,
  parseSignedPreviewAssets,
  selectPreviewSignTargets,
  type StoredPreviewPage,
} from './preview-page-contract'

const pages: StoredPreviewPage[] = [
  {
    page_index: 2,
    preview_order: 2,
    output_order: 2,
    role: 'preview_interior',
    spread_index: 1,
    side: 'right',
    page_number: 2,
    storage_path: 'small-2.webp',
    storage_path_full: 'full-2.png',
  },
  {
    page_index: 0,
    preview_order: 0,
    output_order: 0,
    role: 'preview_cover',
    spread_index: 0,
    side: null,
    page_number: null,
    storage_path: 'small-0.webp',
    storage_path_full: 'full-0.png',
  },
  {
    page_index: 1,
    preview_order: 1,
    output_order: 1,
    role: 'preview_interior',
    spread_index: 1,
    side: 'left',
    page_number: 1,
    storage_path: 'small-1.webp',
  },
]

describe('structured signed Preview page contract', () => {
  it('preserves explicit request order and reports full-to-small fallback accurately', () => {
    const targets = selectPreviewSignTargets({
      pages,
      pagesParam: '2,1',
      limitParam: null,
      sizeParam: 'full',
    })

    assert.deepEqual(targets.map((target) => target.storagePath), ['full-2.png', 'small-1.webp'])
    assert.deepEqual(targets.map((target) => target.assetSize), ['full', 'small'])
  })

  it('keeps structured preview ordering and limit behavior', () => {
    const targets = selectPreviewSignTargets({
      pages,
      pagesParam: null,
      limitParam: '2',
      sizeParam: 'small',
    })
    assert.deepEqual(targets.map((target) => target.page?.page_index), [0, 1])
  })

  it('returns no targets when explicitly requested structured pages do not exist', () => {
    const targets = selectPreviewSignTargets({
      pages,
      pagesParam: '999',
      limitParam: null,
      sizeParam: 'small',
    })
    assert.deepEqual(targets, [])
  })

  it('adds allowlisted page metadata without exposing private Storage paths', () => {
    const targets = selectPreviewSignTargets({
      pages,
      pagesParam: '0',
      limitParam: null,
      sizeParam: 'small',
    })
    const response = buildSignedPreviewResponse({
      targets,
      signedUrls: ['https://signed.example/cover'],
    })

    assert.equal('url' in response, false)
    assert.equal('urls' in response, false)
    assert.deepEqual(response.pages[0], {
      page_index: 0,
      preview_order: 0,
      output_order: 0,
      role: 'preview_cover',
      spread_index: 0,
      side: null,
      page_number: null,
      asset_size: 'small',
      url: 'https://signed.example/cover',
    })
    assert.equal('storage_path' in response.pages[0], false)
    assert.equal(response.schema_version, 3)
    assert.equal(response.asset_layout, 'single-page')
  })

  it('returns only structured pages for multi-page callers', () => {
    const targets = selectPreviewSignTargets({
      pages,
      pagesParam: null,
      limitParam: null,
      sizeParam: 'small',
    })
    const signedUrls = targets.map((target) => `https://signed.example/${target.page?.page_index}`)
    const response = buildSignedPreviewResponse({ targets, signedUrls })

    assert.equal('url' in response, false)
    assert.equal('urls' in response, false)
    assert.deepEqual(response.pages.map((page) => page.page_index), [0, 1, 2])
  })

  it('drops malformed presentation metadata at the public response boundary', () => {
    const malformed = {
      ...pages[0],
      role: 'final_front_cover',
      side: 'center',
      spread_index: -1,
      page_number: -3,
    } as unknown as StoredPreviewPage
    const targets = selectPreviewSignTargets({
      pages: [malformed],
      pagesParam: null,
      limitParam: null,
      sizeParam: 'small',
    })
    const response = buildSignedPreviewResponse({
      targets,
      signedUrls: ['https://signed.example/page'],
    })

    assert.equal('role' in response.pages[0], false)
    assert.equal('side' in response.pages[0], false)
    assert.equal('spread_index' in response.pages[0], false)
    assert.equal('page_number' in response.pages[0], false)
  })

  it('parses structured pages and derives URL order from them', () => {
    const parsed = parseSignedPreviewAssets({
      schema_version: 3,
      asset_layout: 'single-page',
      pages: [
        {
          page_index: 0,
          role: 'preview_cover',
          spread_index: 0,
          side: null,
          asset_size: 'small',
          url: 'cover.webp',
        },
        {
          page_index: 1,
          role: 'preview_interior',
          spread_index: 1,
          side: 'left',
          asset_size: 'small',
          url: 'left.webp',
        },
        {
          page_index: 2,
          role: 'preview_interior',
          spread_index: 1,
          side: 'right',
          asset_size: 'small',
          url: 'right.webp',
        },
      ],
    })

    assert.deepEqual(parsed.urls, ['cover.webp', 'left.webp', 'right.webp'])
    assert.equal(parsed.schemaVersion, 3)
    assert.equal(parsed.assetLayout, 'single-page')
    assert.equal(parsed.pages[0].role, 'preview_cover')
  })

  it('rejects any response outside the V3 structured contract', () => {
    assert.throws(() => parseSignedPreviewAssets({
      schema_version: 3,
      pages: [],
    }), /Unsupported signed Preview contract/)
  })
})
