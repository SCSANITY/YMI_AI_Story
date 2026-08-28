import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  SignedStorageUploadError,
  calculateUploadPercent,
  uploadFileToSignedStorageUrl,
} from './signed-storage-upload'

type FakeProgressHandler = ((event: {
  lengthComputable: boolean
  loaded: number
  total: number
}) => void) | null

function createRequest(status: number, responseText = '') {
  const request = {
    status,
    responseText,
    method: '',
    url: '',
    headers: new Map<string, string>(),
    body: null as FormData | null,
    upload: { onprogress: null as FakeProgressHandler },
    onload: null as (() => void) | null,
    onerror: null as (() => void) | null,
    onabort: null as (() => void) | null,
    open(method: string, url: string) {
      this.method = method
      this.url = url
    },
    setRequestHeader(name: string, value: string) {
      this.headers.set(name, value)
    },
    send(body: FormData) {
      this.body = body
      this.upload.onprogress?.({ lengthComputable: true, loaded: 25, total: 100 })
      queueMicrotask(() => this.onload?.())
    },
  }
  return request
}

describe('signed Storage upload progress', () => {
  it('clamps byte progress into a stable percentage', () => {
    assert.equal(calculateUploadPercent(25, 100), 25)
    assert.equal(calculateUploadPercent(120, 100), 100)
    assert.equal(calculateUploadPercent(-1, 100), 0)
    assert.equal(calculateUploadPercent(1, 0), 0)
  })

  it('uploads to the exact signed URL and reports progress through completion', async () => {
    const request = createRequest(200)
    const progress: number[] = []
    const file = new File(['%PDF-1.7'], 'print.pdf', { type: 'application/pdf' })

    await uploadFileToSignedStorageUrl({
      signedUrl: 'https://storage.example/object/upload/sign/raw-private/print.pdf?token=test',
      file,
      onProgress: (percent) => progress.push(percent),
      requestFactory: () => request,
    })

    assert.equal(request.method, 'PUT')
    assert.equal(request.url, 'https://storage.example/object/upload/sign/raw-private/print.pdf?token=test')
    assert.equal(request.headers.get('x-upsert'), 'false')
    assert.ok(request.body instanceof FormData)
    assert.deepEqual(progress, [25, 100])
  })

  it('surfaces the Storage response instead of a generic page-level failure', async () => {
    const request = createRequest(413, JSON.stringify({ message: 'The object exceeded the bucket limit.' }))
    const file = new File(['%PDF-1.7'], 'print.pdf', { type: 'application/pdf' })

    await assert.rejects(
      uploadFileToSignedStorageUrl({
        signedUrl: 'https://storage.example/object/upload/sign/raw-private/print.pdf?token=test',
        file,
        requestFactory: () => request,
      }),
      (error: unknown) => {
        assert.ok(error instanceof SignedStorageUploadError)
        assert.match(error.message, /bucket limit/)
        return true
      }
    )
  })
})
