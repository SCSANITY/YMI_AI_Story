import assert from 'node:assert/strict'
import test from 'node:test'

import {
  downloadApprovedSourceZip,
  type ApprovedSourceExportResponse,
} from './admin-approved-source-export-client'

test('streams approved source responses and the audit manifest into one ZIP', async () => {
  const chunks: Uint8Array[] = []
  const writable = new WritableStream<Uint8Array>({
    write(chunk) {
      chunks.push(chunk)
    },
  })
  const plan: ApprovedSourceExportResponse = {
    archiveName: 'Story Approved Sources.zip',
    manifestName: 'manifest.json',
    manifest: {
      schema_version: 1,
      export_kind: 'approved-final-sources',
    },
    files: [
      {
        page_index: 30,
        output_order: 0,
        role: 'final_back_cover',
        spread_index: 0,
        side: 'left',
        page_number: null,
        approved_source: 'ai',
        reviewed_at: null,
        entry_base_name: '01_cover_back',
        signed_url: 'data:image/png;base64,iVBORw0KGgo=',
      },
      {
        page_index: 22,
        output_order: 2,
        role: 'final_interior',
        spread_index: 1,
        side: 'left',
        page_number: 1,
        approved_source: 'manual',
        reviewed_at: '2026-08-05T00:00:00.000Z',
        entry_base_name: '03_spread_01_left_page_01',
        signed_url: 'data:image/jpeg;base64,/9j/2Q==',
      },
    ],
  }

  await downloadApprovedSourceZip(
    plan,
    Promise.resolve({ createWritable: async () => writable })
  )
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const archive = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    archive.set(chunk, offset)
    offset += chunk.length
  }

  assert.deepEqual(Array.from(archive.slice(0, 4)), [0x50, 0x4b, 0x03, 0x04])
  const archiveText = new TextDecoder().decode(archive)
  assert.match(archiveText, /01_cover_back\.png/)
  assert.match(archiveText, /03_spread_01_left_page_01\.jpg/)
  assert.match(archiveText, /manifest\.json/)
  assert.match(archiveText, /approved-final-sources/)
  assert.doesNotMatch(archiveText, /signed_url|data:image/)
})
