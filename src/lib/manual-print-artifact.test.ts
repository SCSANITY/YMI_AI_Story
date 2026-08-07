import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  MANUAL_PRINT_PDF_MAX_BYTES,
  assertPdfHeader,
  assertStoredManualPrintMetadata,
  buildManualPrintStoragePath,
  readPdfHeader,
  sanitizeManualPrintFileName,
  validateManualPrintUpload,
  verifyRemotePdfHeader,
} from './manual-print-artifact'

describe('manual print artifact contract', () => {
  it('accepts one bounded PDF and builds an immutable revision path', () => {
    assert.deepEqual(validateManualPrintUpload({
      fileName: 'Mia Print Master.pdf',
      sizeBytes: 1024,
      contentType: 'application/pdf',
    }), {
      fileName: 'Mia Print Master.pdf',
      sizeBytes: 1024,
      contentType: 'application/pdf',
    })
    assert.equal(
      buildManualPrintStoragePath(
        '10000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000002'
      ),
      'orders/10000000-0000-4000-8000-000000000001/final/print/manual/20000000-0000-4000-8000-000000000002.pdf'
    )
  })

  it('rejects path-like names, wrong MIME, empty files, and oversize files', () => {
    assert.equal(sanitizeManualPrintFileName('../../unsafe:book.pdf'), 'unsafebook.pdf')
    assert.throws(() => validateManualPrintUpload({
      fileName: 'book.pdf', sizeBytes: 10, contentType: 'image/png',
    }), /Only PDF/)
    assert.throws(() => validateManualPrintUpload({
      fileName: 'book.pdf', sizeBytes: 0, contentType: 'application/pdf',
    }), /empty/)
    assert.throws(() => validateManualPrintUpload({
      fileName: 'book.pdf', sizeBytes: MANUAL_PRINT_PDF_MAX_BYTES + 1, contentType: 'application/pdf',
    }), /250 MiB/)
  })

  it('requires Storage metadata to match the declared PDF exactly', () => {
    assert.deepEqual(
      assertStoredManualPrintMetadata({ size: 2048, contentType: 'application/pdf' }, 2048),
      { sizeBytes: 2048, contentType: 'application/pdf' }
    )
    assert.throws(
      () => assertStoredManualPrintMetadata({ size: 2047, contentType: 'application/pdf' }, 2048),
      /does not match/
    )
    assert.throws(
      () => assertStoredManualPrintMetadata({ size: 2048, contentType: 'text/plain' }, 2048),
      /not stored as application\/pdf/
    )
  })

  it('checks the PDF magic bytes without consuming a full response', async () => {
    assert.doesNotThrow(() => assertPdfHeader(new TextEncoder().encode('%PDF-1.7')))
    assert.throws(() => assertPdfHeader(new TextEncoder().encode('hello')), /valid PDF signature/)

    const header = await readPdfHeader(new Response(new TextEncoder().encode('%PDF-1.7\nlarge body')))
    assert.equal(new TextDecoder().decode(header), '%PDF-')
    await assert.rejects(
      readPdfHeader(new Response(new TextEncoder().encode('not-pdf'))),
      /valid PDF signature/
    )
  })

  it('re-signs and retries a transient remote header failure', async () => {
    let signedUrlCalls = 0
    let fetchCalls = 0
    const header = await verifyRemotePdfHeader({
      getSignedUrl: async () => `https://storage.test/revision-${++signedUrlCalls}`,
      fetchImpl: async () => {
        fetchCalls += 1
        return fetchCalls === 1
          ? new Response('unavailable', { status: 503 })
          : new Response(new TextEncoder().encode('%PDF-1.7'))
      },
      timeoutMs: 50,
      attempts: 2,
    })

    assert.equal(new TextDecoder().decode(header), '%PDF-')
    assert.equal(signedUrlCalls, 2)
    assert.equal(fetchCalls, 2)
  })

  it('bounds remote header verification when Storage does not respond', async () => {
    await assert.rejects(
      verifyRemotePdfHeader({
        getSignedUrl: async () => 'https://storage.test/stalled',
        fetchImpl: async (_url, init) => new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          }, { once: true })
        }),
        timeoutMs: 5,
        attempts: 2,
      }),
      /timed out/
    )
  })
})
