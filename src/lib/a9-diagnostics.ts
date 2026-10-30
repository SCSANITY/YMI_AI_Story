import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'

type SupabaseCall = {
  method: string
  name: string
  offsetMs: number
  durationMs: number
}

type A9RequestContext = {
  startedAt: number
  calls: SupabaseCall[]
}

const requestStorage = new AsyncLocalStorage<A9RequestContext>()
const instanceId = randomUUID()
let requestSequence = 0
let inFlight = 0

export function isA9DiagnosticsEnabled() {
  return typeof process !== 'undefined' && process.env.YMI_A9_DIAGNOSTICS === 'true'
}

function formatDuration(value: number) {
  return Math.max(0, value).toFixed(1)
}

function callName(input: RequestInfo | URL) {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
  const segments = url.pathname.split('/').filter(Boolean)
  const restIndex = segments.indexOf('rest')
  if (restIndex >= 0 && segments[restIndex + 1] === 'v1' && segments[restIndex + 2]) {
    return `rest.${segments[restIndex + 2]}`
  }

  const storageIndex = segments.indexOf('storage')
  if (storageIndex >= 0 && segments[storageIndex + 1] === 'v1' && segments[storageIndex + 2] === 'object') {
    const tail = segments.slice(storageIndex + 3)
    const bucket = tail[0] === 'upload' && tail[1] === 'sign'
      ? tail[2]
      : tail[0] === 'sign' || tail[0] === 'public' || tail[0] === 'authenticated'
        ? tail[1]
        : tail[0]
    if (bucket) return `storage.${bucket}`
  }

  return 'supabase.unknown'
}

export function recordA9SupabaseCall(input: RequestInfo | URL, method: string, startedAt: number, durationMs: number) {
  const context = requestStorage.getStore()
  if (!context) return
  context.calls.push({
    method,
    name: callName(input),
    offsetMs: startedAt - context.startedAt,
    durationMs,
  })
}

function appendServerTiming(response: Response, metrics: string[]) {
  if (metrics.length === 0) return response
  const previous = response.headers.get('Server-Timing')
  response.headers.set('Server-Timing', previous ? `${previous}, ${metrics.join(', ')}` : metrics.join(', '))
  return response
}

export async function withA9Diagnostics<T extends Response>(handler: () => Promise<T>) {
  if (!isA9DiagnosticsEnabled()) return handler()

  const startedAt = performance.now()
  const sequence = ++requestSequence
  const inFlightAtStart = inFlight
  inFlight += 1
  const context: A9RequestContext = { startedAt, calls: [] }

  try {
    return await requestStorage.run(context, async () => {
      const response = await handler()
      const handlerDuration = performance.now() - startedAt
      const metrics = [
        `a9-instance;desc="${instanceId}"`,
        `a9-seq;desc="${sequence}"`,
        `a9-inflight;desc="${inFlightAtStart}"`,
        `a9-cold;desc="${sequence === 1 ? '1' : '0'}"`,
        `a9-handler;dur=${formatDuration(handlerDuration)}`,
        ...context.calls.map((call) =>
          `${call.name};dur=${formatDuration(call.durationMs)};desc="${call.method}@${formatDuration(call.offsetMs)}"`
        ),
      ]
      return appendServerTiming(response, metrics)
    })
  } finally {
    inFlight -= 1
  }
}
