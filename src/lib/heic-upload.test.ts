import assert from 'node:assert/strict'
import { test } from 'node:test'
import { HeicUploadTooLargeError, prepareUndecodableHeicUpload } from './heic-upload'

function heic(size = 32, brand = 'heic'): File {
  const bytes = Buffer.alloc(size)
  bytes.writeUInt32BE(24, 0)
  bytes.write('ftyp', 4)
  bytes.write(brand, 8)
  bytes.write('heic', 16)
  return new File([bytes], 'phone-photo.jpg', { type: '', lastModified: 123 })
}

test('ordinary JPEG/PNG stays on the existing pipeline without a HEIC decode probe', async () => {
  const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'photo.jpg', { type: 'image/jpeg' })
  assert.equal(await prepareUndecodableHeicUpload({ file, canDecode: async () => assert.fail('ordinary format probed') }), null)
})

test('browser-undecodable HEIC preserves bytes, sets usable MIME, and uses the existing5MiB cap', async () => {
  const file = heic()
  const prepared = await prepareUndecodableHeicUpload({ file, canDecode: async () => false })
  assert.ok(prepared)
  assert.equal(prepared.type, 'image/heic')
  assert.equal(prepared.name, 'phone-photo.heic')
  assert.equal(prepared.lastModified, file.lastModified)
  assert.deepEqual(new Uint8Array(await prepared.arrayBuffer()), new Uint8Array(await file.arrayBuffer()))
  assert.ok(await prepareUndecodableHeicUpload({ file: heic(5 * 1024 * 1024), canDecode: async () => false }))
  await assert.rejects(prepareUndecodableHeicUpload({ file: heic(5 * 1024 * 1024 + 1), canDecode: async () => false }),
    (error: unknown) => error instanceof HeicUploadTooLargeError
      && error.message === 'This file is too large. Please upload an image smaller than 5 MB.')
})

test('decodable HEIC still uses normal face validation/quality/crop; generic compatible HEVC gets fallback', async () => {
  assert.equal(await prepareUndecodableHeicUpload({ file: heic(), canDecode: async () => true }), null)
  const generic = await prepareUndecodableHeicUpload({ file: heic(32, 'mif1'), canDecode: async () => false })
  assert.equal(generic?.type, 'image/heic')
})
