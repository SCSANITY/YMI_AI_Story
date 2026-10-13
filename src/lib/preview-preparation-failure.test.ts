import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isPreviewPreparationFailure, PHOTO_PREPARATION_FAILURE_MESSAGE } from './preview-preparation-failure'

test('only exact fixed preparation codes produce public photo guidance', () => {
  assert.equal(isPreviewPreparationFailure('preview_image_decode_failed'), true)
  assert.equal(isPreviewPreparationFailure('preview_image_geometry_invalid'), true)
  for (const value of [null, { code: 'preview_image_decode_failed' }, 'private/path preview_image_decode_failed', 'PRIVATE_PROMPT']) {
    assert.equal(isPreviewPreparationFailure(value), false)
  }
  assert.match(PHOTO_PREPARATION_FAILURE_MESSAGE, /JPEG or PNG/)
})
