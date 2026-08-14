import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import sharp from 'sharp'

import {
  FinalSourceImageError,
  prepareFinalReplacementImage,
} from './final-source-image'

async function image(width: number, height: number, format: 'jpeg' | 'png' | 'webp' = 'png') {
  const pipeline = sharp({
    create: { width, height, channels: 3, background: '#f4c6d7' },
  })
  return pipeline[format]().toBuffer()
}

describe('Final replacement image contract', () => {
  it('normalizes supported V2 replacement images to real PNG bytes', async () => {
    const result = await prepareFinalReplacementImage({
      buffer: await image(600, 600, 'webp'),
      label: 'Final page 4',
      structured: true,
      expectedInteriorSource: { width: 600, height: 600 },
    })
    const metadata = await sharp(result.buffer).metadata()

    assert.equal(metadata.format, 'png')
    assert.deepEqual(result.source, { width: 600, height: 600, format: 'webp' })
  })

  it('rejects unreadable, low-resolution, non-square, and peer-mismatched V2 pages', async () => {
    await assert.rejects(
      async () => prepareFinalReplacementImage({
        buffer: Buffer.from('not-an-image'),
        label: 'Final page 1',
        structured: true,
      }),
      FinalSourceImageError
    )
    await assert.rejects(
      async () => prepareFinalReplacementImage({
        buffer: await image(500, 500),
        label: 'Final page 2',
        structured: true,
      }),
      /minimum 512px/
    )
    await assert.rejects(
      async () => prepareFinalReplacementImage({
        buffer: await image(700, 600),
        label: 'Final page 3',
        structured: true,
      }),
      /approximately square/
    )
    await assert.rejects(
      async () => prepareFinalReplacementImage({
        buffer: await image(600, 600),
        label: 'Final page 4',
        structured: true,
        expectedInteriorSource: { width: 800, height: 800 },
      }),
      /match the other Final interiors/
    )
  })

  it('keeps legacy jobs free from the V2 square and minimum-edge requirements', async () => {
    const result = await prepareFinalReplacementImage({
      buffer: await image(320, 180, 'jpeg'),
      label: 'Legacy Final page',
      structured: false,
    })
    const metadata = await sharp(result.buffer).metadata()

    assert.equal(metadata.format, 'png')
    assert.deepEqual({ width: metadata.width, height: metadata.height }, { width: 320, height: 180 })
  })
})
