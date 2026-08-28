type UploadProgressEvent = {
  lengthComputable: boolean
  loaded: number
  total: number
}

type SignedUploadRequest = {
  status: number
  responseText: string
  upload: {
    onprogress: ((event: UploadProgressEvent) => void) | null
  }
  onload: (() => void) | null
  onerror: (() => void) | null
  onabort: (() => void) | null
  open: (method: string, url: string, async: boolean) => void
  setRequestHeader: (name: string, value: string) => void
  send: (body: FormData) => void
}

type SignedUploadRequestFactory = () => SignedUploadRequest

export class SignedStorageUploadError extends Error {}

function parseUploadError(responseText: string) {
  try {
    const payload = JSON.parse(responseText) as { error?: string; message?: string }
    return payload.message || payload.error || null
  } catch {
    return null
  }
}

export function calculateUploadPercent(loaded: number, total: number) {
  if (!Number.isFinite(loaded) || !Number.isFinite(total) || total <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((loaded / total) * 100)))
}

export function uploadFileToSignedStorageUrl(args: {
  signedUrl: string
  file: File
  onProgress?: (percent: number) => void
  requestFactory?: SignedUploadRequestFactory
}) {
  const signedUrl = String(args.signedUrl || '').trim()
  if (!/^https:\/\//i.test(signedUrl)) {
    return Promise.reject(new SignedStorageUploadError('The signed upload destination is invalid.'))
  }

  const requestFactory = args.requestFactory ?? (() => new XMLHttpRequest())

  return new Promise<void>((resolve, reject) => {
    const request = requestFactory()
    let settled = false

    const fail = (message: string) => {
      if (settled) return
      settled = true
      reject(new SignedStorageUploadError(message))
    }

    request.open('PUT', signedUrl, true)
    request.setRequestHeader('x-upsert', 'false')
    request.upload.onprogress = (event: UploadProgressEvent) => {
      if (!event.lengthComputable) return
      args.onProgress?.(calculateUploadPercent(event.loaded, event.total))
    }
    request.onerror = () => fail('The print PDF upload was interrupted. Please try again.')
    request.onabort = () => fail('The print PDF upload was cancelled.')
    request.onload = () => {
      if (settled) return
      if (request.status >= 200 && request.status < 300) {
        settled = true
        args.onProgress?.(100)
        resolve()
        return
      }
      fail(
        parseUploadError(request.responseText)
          || `Storage rejected the print PDF upload (${request.status || 'network error'}).`
      )
    }

    const body = new FormData()
    body.append('cacheControl', '3600')
    body.append('', args.file)
    request.send(body)
  })
}
