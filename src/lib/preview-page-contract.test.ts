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

  it('keeps legacy preview ordering and limit behavior', () => {
    const targets = selectPreviewSignTargets({
      pages,
      pagesParam: null,
      limitParam: '2',
      sizeParam: 'small',
    })
    assert.deepEqual(targets.map((target) => target.page?.page_index), [0, 1])
  })

  it('keeps the legacy storage_path fallback when no requested page resolves', () => {
    const targets = selectPreviewSignTargets({
      pages,
      pagesParam: '999',
      limitParam: null,
      sizeParam: 'small',
      legacyStoragePath: 'legacy.png',
    })
    assert.deepEqual(targets, [{ storagePath: 'legacy.png', assetSize: 'small', page: null }])
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
      schemaVersion: 2,
      assetLayout: 'single-page',
    })

    assert.equal('url' in response ? response.url : null, 'https://signed.example/cover')
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
    assert.equal(response.schema_version, 2)
    assert.equal(response.asset_layout, 'single-page')
  })

  it('retains the legacy urls field for multi-page callers', () => {
    const targets = selectPreviewSignTargets({
      pages,
      pagesParam: null,
      limitParam: null,
      sizeParam: 'small',
    })
    const signedUrls = targets.map((target) => `https://signed.example/${target.page?.page_index}`)
    const response = buildSignedPreviewResponse({ targets, signedUrls })

    assert.deepEqual('urls' in response ? response.urls : null, signedUrls)
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

  it('parses the additive client response without changing legacy URL order', () => {
    const parsed = parseSignedPreviewAssets({
      schema_version: 2,
      asset_layout: 'single-page',
      urls: ['cover.webp', 'left.webp', 'right.webp'],
      pages: [
        {
          page_index: 0,
          role: 'preview_cover',
          spread_index: 0,
          side: null,
          asset_size: 'small',
          url: 'cover.webp',
        },
      ],
    })

    assert.deepEqual(parsed.urls, ['cover.webp', 'left.webp', 'right.webp'])
    assert.equal(parsed.schemaVersion, 2)
    assert.equal(parsed.assetLayout, 'single-page')
    assert.equal(parsed.pages[0].role, 'preview_cover')
  })

  it('rejects a partial V2 marker instead of silently treating it as legacy', () => {
    assert.throws(() => parseSignedPreviewAssets({
      schema_version: 2,
      url: 'cover.webp',
      pages: [],
    }), /Incomplete signed Preview contract marker/)
  })
})
