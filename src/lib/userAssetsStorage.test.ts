import assert from 'node:assert/strict'
import test from 'node:test'
import {
  validateStoredUserAssetMetadata,
  validateUserAssetUpload,
} from './userAssetsStorage'

test('user asset policy accepts expected image and voice uploads', () => {
  assert.equal(
    validateUserAssetUpload({
      assetType: 'face_image',
      contentType: 'image/jpeg',
      sizeBytes: 2 * 1024 * 1024,
    }).contentType,
    'image/jpeg'
  )
  assert.equal(
    validateUserAssetUpload({
      assetType: 'voice_sample',
      contentType: 'audio/webm; codecs=opus',
      sizeBytes: 4 * 1024 * 1024,
    }).contentType,
    'audio/webm'
  )
})

test('user asset policy rejects active content and oversized files', () => {
  assert.throws(
    () => validateUserAssetUpload({ assetType: 'profile_avatar', contentType: 'image/svg+xml', sizeBytes: 100 }),
    /Unsupported file type/
  )
  assert.throws(
    () => validateUserAssetUpload({ assetType: 'face_image', contentType: 'image/png', sizeBytes: 6 * 1024 * 1024 }),
    /5 MB/
  )
})

test('confirmation requires Storage metadata to match the declaration', () => {
  assert.doesNotThrow(() =>
    validateStoredUserAssetMetadata(
      'face_image',
      { contentType: 'image/webp', sizeBytes: 1200 },
      { contentType: 'image/webp', size: 1200 }
    )
  )
  assert.throws(
    () =>
      validateStoredUserAssetMetadata(
        'face_image',
        { contentType: 'image/webp', sizeBytes: 1200 },
        { contentType: 'image/webp', size: 1201 }
      ),
    /size does not match/
  )
})
