import type { InspectionResult, PhotoPhase, WorkerRequest, WorkerResponse } from './protocol'

export function createBrowserPhotoWorker() {
  let worker: Worker | undefined
  let sequence = 0
  let pending: {
    id: number
    phase: (phase: PhotoPhase) => void
    resolve: (result: InspectionResult) => void
    timer: ReturnType<typeof setTimeout>
  } | undefined

  function finish(result: InspectionResult) {
    const request = pending
    if (!request) return
    pending = undefined
    clearTimeout(request.timer)
    request.resolve(result)
  }

  function dispose() {
    worker?.terminate()
    worker = undefined
    finish({ reason: 'technical' })
  }

  function getWorker() {
    if (worker) return worker
    // MediaPipe's WASM shim uses importScripts, so this is a classic Worker.
    const next = new Worker(new URL('./inspection.worker.ts', import.meta.url))
    next.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
      if (worker !== next || data.id !== pending?.id) return
      if (data.type === 'phase') pending.phase(data.phase)
      else finish(data.result)
    }
    next.onerror = next.onmessageerror = () => {
      if (worker === next) dispose()
    }
    worker = next
    return next
  }

  const send = (message: WorkerRequest) => getWorker().postMessage(message)
  return {
    warmup() {
      try { send({ type: 'warmup' }) } catch { dispose() }
    },
    inspect(file: File, phase: (phase: PhotoPhase) => void) {
      return new Promise<InspectionResult>(resolve => {
        if (pending) throw new Error('Photo worker already occupied')
        const id = ++sequence
        // Recovery for a stalled worker, not a photo-admission threshold.
        const timer = setTimeout(dispose, 120_000)
        pending = { id, phase, resolve, timer }
        try { send({ type: 'inspect', id, file }) } catch { dispose() }
      })
    },
    dispose,
  }
}
