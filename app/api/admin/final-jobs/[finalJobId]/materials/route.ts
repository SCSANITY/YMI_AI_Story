import { requireAdminCustomer } from '@/lib/adminAuth'
import { noStoreJson } from '@/lib/http-response'
import { isUuid } from '@/lib/validators'
import { frozenText } from '@/lib/admin-production-materials'
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
      const path = await resolveSource(bound)
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
    const [purchaser, dedication, source, preview] = await Promise.all([
      readPurchaser(bound.owner).catch(() => null),
      readLineDedication(bound).catch(() => null),
      resolveSource(bound).catch(() => null),
      resolvePreviews(bound).catch(() => null),
    ])
    return noStoreJson({
      viewerId: admin.customer_id,
      lineId: bound.line.cart_item_id,
      purchaser,
      ...frozenText(bound.execution.input_snapshot),
      language: bound.execution.story_language,
      dedication,
      sourceAvailable: Boolean(source),
      previewId: preview?.id ?? null,
      pages: (preview?.pages ?? []).map((page) => ({
        index: page.index,
        label: page.label,
        pngAvailable: Boolean(page.png),
      })),
    })
  } catch {
    return noStoreJson({ error: 'Could not load production materials.' }, { status: 503 })
  }
}
