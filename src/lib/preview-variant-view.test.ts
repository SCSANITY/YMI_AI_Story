import assert from 'node:assert/strict'
import test from 'node:test'
import type { PreviewDisplayAssets } from './preview-book-presentation'
import {
  updatePreviewVariantDisplayAssets,
  type PreviewVariantView,
} from './preview-variant-view'

const original: PreviewVariantView = {
  jobId: 'original-job',
  status: 'ready',
  pages: ['original-cover'],
  presentation: null,
  coverUrl: 'original-cover',
  photoPreviewUrl: 'original-photo',
  faceAssetId: 'original-face',
  faceStoragePath: 'faces/original.webp',
  faceImageUrl: 'original-photo',
  original: true,
  countsTowardLimit: false,
}

const alternate: PreviewVariantView = {
  ...original,
  jobId: 'alternate-job',
  status: 'generating',
  pages: [],
  coverUrl: null,
  photoPreviewUrl: 'alternate-photo',
  faceAssetId: 'alternate-face',
  faceStoragePath: 'faces/alternate.webp',
  faceImageUrl: 'alternate-photo',
  original: false,
  countsTowardLimit: true,
}

const refreshedAssets: PreviewDisplayAssets = {
  urls: ['alternate-cover', 'alternate-left', 'alternate-right'],
  pages: [],
  schemaVersion: null,
  assetLayout: null,
  coverUrl: 'alternate-cover',
  presentation: null,
}

test('refreshing one photo version only updates the matching job snapshot', () => {
  const result = updatePreviewVariantDisplayAssets(
    [original, alternate],
    alternate.jobId,
    refreshedAssets
  )

  assert.equal(result[0], original)
  assert.deepEqual(result[1], {
    ...alternate,
    status: 'ready',
    pages: refreshedAssets.urls,
    presentation: refreshedAssets.presentation,
    coverUrl: refreshedAssets.coverUrl,
  })
  assert.equal(result[1]?.faceAssetId, alternate.faceAssetId)
})

test('a response without a cover cannot replace a saved photo version', () => {
  const variants = [original, alternate]
  const result = updatePreviewVariantDisplayAssets(variants, alternate.jobId, {
    ...refreshedAssets,
    urls: [],
    coverUrl: null,
  })

  assert.equal(result, variants)
})

test('a response for an unknown job leaves every version unchanged', () => {
  const variants = [original, alternate]
  const result = updatePreviewVariantDisplayAssets(variants, 'missing-job', refreshedAssets)

  assert.equal(result, variants)
})
