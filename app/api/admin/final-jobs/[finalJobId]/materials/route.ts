import { requireAdminCustomer } from '@/lib/adminAuth'
import { noStoreJson } from '@/lib/http-response'
import { isUuid } from '@/lib/validators'
import { frozenText, type MaterialPart } from '@/lib/admin-production-materials'
import {
  readLineDedication,
  readMaterialFile,
  readPurchaser,
  resolveMaterialLine,
  resolvePreviews,
  resolveSource,
} from '@/lib/admin-production-materials-server'

export async function GET(request: Request, context: { params: Promise<{ finalJobId: string }> }) {
  const admin = await requireAdminCustomer()
  if (!admin) return noStoreJson({ error: 'Forbidden' }, { status: 403 })
  const { finalJobId } = await context.params
  const params = new URL(request.url).searchParams
  const order = params.get('order'),
    item = params.get('item')
  const scoped = params.has('order') || params.has('item')
  const kind = params.get('kind') ?? 'summary'
  if (
    !isUuid(finalJobId) ||
    (scoped && (!isUuid(order) || !isUuid(item))) ||
    !['summary', 'dedication', 'source', 'source-download', 'webp', 'png'].includes(kind)
  ) {
    return noStoreJson({ error: 'Invalid selection' }, { status: 400 })
  }
  const unavailable = () =>
    noStoreJson({ error: 'Materials could not be verified for this book.' }, { status: 409 })
  try {
    const bound = await resolveMaterialLine(finalJobId, order && item ? { order, item } : undefined)
    if (!bound) return unavailable()
    if (kind === 'dedication') return noStoreJson({ dedication: await readLineDedication(bound) })
    if (kind === 'source' || kind === 'source-download') {
      const path = await resolveSource(bound, false)
      return (
        (path && (await readMaterialFile(path, kind === 'source-download', 'source-photo'))) || unavailable()
      )
    }
    if (kind === 'webp' || kind === 'png') {
      const index = params.get('page')
      if (!index || !/^\d{1,4}$/.test(index) || !isUuid(params.get('preview'))) return unavailable()
      const preview = await resolvePreviews(bound, false)
      const page = preview?.pages.find((p) => p.index === Number(index))
      if (!preview || preview.id !== params.get('preview') || !page || !page[kind]) return unavailable()
      return (
        (await readMaterialFile(page[kind], kind === 'png', 'preview-' + page.index, 'image/' + kind)) ??
        unavailable()
      )
    }
    const header = {
      viewerId: admin.customer_id,
      lineId: bound.line.cart_item_id,
      ...frozenText(bound.execution.input_snapshot),
      language: bound.execution.story_language,
    }
    const progressive = request.headers.get('accept') === 'application/x-ndjson'
    function previewPart(preview: Awaited<ReturnType<typeof resolvePreviews>>) {
      return {
        previewId: preview?.id ?? null,
        pages: (preview?.pages ?? []).map(page => ({
          index: page.index, label: page.label, pngAvailable: Boolean(page.png),
        })),
      }
    }
    // One ownership check serves the whole panel. Independent sections can paint as they finish.
    const line = bound
    async function loadSections(emit: (part: MaterialPart) => void) {
      await Promise.all([
        readPurchaser(line.owner).catch(() => null).then(purchaser => emit({ purchaser })),
        readLineDedication(line).catch(() => null).then(dedication => emit({ dedication })),
        resolveSource(line).catch(() => null).then(source => emit({ sourceAvailable: Boolean(source) })),
        resolvePreviews(line, true, progressive ? preview => emit(previewPart(preview)) : undefined)
          .catch(() => null).then(preview => emit(previewPart(preview))),
      ])
    }
    if (!progressive) {
      const summary = { ...header }
      await loadSections(part => Object.assign(summary, part))
      return noStoreJson(summary)
    }
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder()
        const emit = (part: MaterialPart) => {
          if (!cancelled) controller.enqueue(encoder.encode(JSON.stringify(part) + '\n'))
        }
        emit(header)
        void loadSections(emit).then(
          () => { if (!cancelled) controller.close() },
          error => { if (!cancelled) controller.error(error) },
        )
      },
      cancel() { cancelled = true },
    })
    return new Response(body, {
      headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'private, no-store, no-transform' },
    })
  } catch {
    return noStoreJson({ error: 'Could not load production materials.' }, { status: 503 })
  }
}
