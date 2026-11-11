import { PHOTO_ENGINE, PHOTO_POLICY, validPreparedPhoto } from './policy'
import type { InspectionResult, PhotoFailure, PhotoPhase } from './protocol'

export type PhotoSource = { kind: 'file'; file: File }
  | { kind: 'saved'; assetId: string; load(signal: AbortSignal): Promise<File> }

export type PhotoIntent = {
  scope: string
  surface: 'form' | 'variant'
  source: PhotoSource
}

export type PhotoReceipt = {
  intent: PhotoIntent
  run: number
  engine: typeof PHOTO_ENGINE
  policy: typeof PHOTO_POLICY
  file: File
  originalName: string
}

type PhotoState = { status: 'idle' }
  | { status: PhotoPhase; intent: PhotoIntent }
  | { status: 'failed'; intent: PhotoIntent; reason: PhotoFailure }
  | { status: 'ready'; intent: PhotoIntent; receipt: PhotoReceipt }

export const IDLE_PHOTO: PhotoState = { status: 'idle' }
type Request = {
  intent: PhotoIntent
  run: number
  abort: AbortController
  resolve(receipt: PhotoReceipt | null): void
}

export function createPhotoPreparation(worker: {
  inspect(file: File, phase: (phase: PhotoPhase) => void): Promise<InspectionResult>
  warmup(): void
  dispose(): void
}) {
  let state: PhotoState = IDLE_PHOTO
  let run = 0
  let active: Request | undefined
  let queued: Request | undefined
  let warmed = false
  const listeners = new Set<() => void>()
  function publish(next: PhotoState) {
    state = next
    for (const listener of listeners) listener()
  }
  function supersede() {
    run++
    active?.abort.abort()
    active?.resolve(null)
    queued?.abort.abort()
    queued?.resolve(null)
    queued = undefined
  }
  function clear() {
    supersede()
    publish(IDLE_PHOTO)
  }
  function drain() {
    if (active || !queued) return
    const request = queued
    queued = undefined
    active = request
    const { intent, abort } = request
    const current = () => request.run === run && !abort.signal.aborted
    void (async () => {
      let receipt: PhotoReceipt | null = null
      let failure: PhotoFailure = intent.source.kind === 'saved' ? 'saved-photo-unavailable' : 'technical'
      try {
        const file = intent.source.kind === 'file' ? intent.source.file : await intent.source.load(abort.signal)
        if (!current()) return
        failure = 'technical'
        const result = await worker.inspect(file, status => { if (current()) publish({ status, intent }) })
        if (!current()) return
        if ('reason' in result) failure = result.reason
        else if (validPreparedPhoto(result.file)) {
          receipt = { intent, run: request.run, engine: PHOTO_ENGINE, policy: PHOTO_POLICY,
            file: result.file, originalName: file.name }
        }
      } catch {
        // Resource errors are retryable; never substitute the original bytes.
      } finally {
        if (current()) publish(receipt
          ? { status: 'ready', intent, receipt }
          : { status: 'failed', intent, reason: failure })
        request.resolve(current() ? receipt : null)
        active = undefined
        drain()
      }
    })()
  }
  return {
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    snapshot: () => state,
    warmup() {
      if (warmed) return
      warmed = true
      worker.warmup()
    },
    select(intent: PhotoIntent) {
      supersede()
      return new Promise<PhotoReceipt | null>(resolve => {
        queued = { intent, run, abort: new AbortController(), resolve }
        publish({ status: 'loading', intent })
        drain()
      })
    },
    isCurrent(receipt: PhotoReceipt) {
      return state.status === 'ready' && state.receipt === receipt && receipt.run === run
        && receipt.engine === PHOTO_ENGINE && receipt.policy === PHOTO_POLICY
    },
    clear,
    dispose() {
      clear()
      warmed = false
      worker.dispose()
    },
  }
}
