import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  FINAL_REPLACEMENT_UPLOAD_MAX_BYTES,
  assertFinalReplacementSourceFormat,
  buildFinalReplacementStagingPath,
  isFinalReplacementStagingPath,
  validateFinalReplacementUpload,
  validateStoredFinalReplacementMetadata,
} from './final-review-replacement-upload'

const finalJobId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const reviewIntentId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

describe('Final Review replacement upload policy', () => {
  it('accepts supported images up to the direct-upload limit and infers empty browser MIME types', () => {
    assert.deepEqual(
      validateFinalReplacementUpload({
        fileName: 'replacement.webp',
        sizeBytes: FINAL_REPLACEMENT_UPLOAD_MAX_BYTES,
        contentType: '',
      }),
      {
        fileName: 'replacement.webp',
        sizeBytes: FINAL_REPLACEMENT_UPLOAD_MAX_BYTES,
        contentType: 'image/webp',
      }
    )
  })

  it('rejects oversized, unsupported, and extension-mismatched files before upload', () => {
    assert.throws(
      () => validateFinalReplacementUpload({
        fileName: 'page.png',
        sizeBytes: FINAL_REPLACEMENT_UPLOAD_MAX_BYTES + 1,
        contentType: 'image/png',
      }),
      /40 MB/
    )
    assert.throws(
      () => validateFinalReplacementUpload({
        fileName: 'page.gif',
        sizeBytes: 100,
        contentType: 'image/gif',
      }),
      /PNG, JPEG, or WebP/
    )
    assert.throws(
      () => validateFinalReplacementUpload({
        fileName: 'page.jpg',
        sizeBytes: 100,
        contentType: 'image/png',
      }),
      /does not match/
    )
  })

  it('builds an identity-scoped private staging path and rejects path substitution', () => {
    const path = buildFinalReplacementStagingPath({
      finalJobId,
      pageIndex: 12,
      reviewIntentId,
      contentType: 'image/png',
    })
    assert.equal(
      path,
      `final-review/staging/${finalJobId}/page_12/${reviewIntentId}.png`
    )
    assert.equal(isFinalReplacementStagingPath({
      storagePath: path,
      finalJobId,
      pageIndex: 12,
      reviewIntentId,
      contentType: 'image/png',
    }), true)
    assert.equal(isFinalReplacementStagingPath({
      storagePath: path.replace('page_12', 'page_13'),
      finalJobId,
      pageIndex: 12,
      reviewIntentId,
      contentType: 'image/png',
    }), false)
  })

  it('requires stored metadata and real image format to match the declared file', () => {
    const declared = validateFinalReplacementUpload({
      fileName: 'page.jpeg',
      sizeBytes: 2048,
      contentType: 'image/jpeg',
    })
    assert.deepEqual(validateStoredFinalReplacementMetadata(declared, {
      size: 2048,
      contentType: 'image/jpeg',
    }), declared)
    assert.throws(
      () => validateStoredFinalReplacementMetadata(declared, {
        size: 1024,
        contentType: 'image/jpeg',
      }),
      /size does not match/
    )
    assert.doesNotThrow(() => assertFinalReplacementSourceFormat('image/jpeg', 'jpeg'))
    assert.throws(
      () => assertFinalReplacementSourceFormat('image/jpeg', 'png'),
      /bytes do not match/
    )
  })
})
