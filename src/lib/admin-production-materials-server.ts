import { supabaseAdmin as db } from '@/lib/supabaseAdmin'
import { loadTrustedOrderLineDedications } from '@/lib/order-materials-server'
import { frozenText, previewFiles, type LineSelector } from './admin-production-materials'
import { isPreviewVariantInvalidated } from './preview-variants'

const bucket = db.storage.from('raw-private')
const jobFields =
  'job_id, job_type, owner_type, customer_id, creation_id, cart_item_id, template_id, story_language, input_snapshot, created_at'
const imageTypes = ['image/png', 'image/webp', 'image/jpeg']

export async function resolveMaterialLine(finalId: string, selector?: LineSelector) {
  const { data: final, error } = await db
    .from('final_jobs')
    .select('job_id,order_id,cart_item_id,creation_id,template_id')
    .eq('final_job_id', finalId)
    .maybeSingle()
  if (error) throw error
  if (
    !final?.order_id ||
    !final.cart_item_id ||
    !final.creation_id ||
    !final.job_id ||
    (selector && (selector.order !== final.order_id || selector.item !== final.cart_item_id))
  )
    return null

  let linked = db
    .from('cart_items')
    .select('cart_item_id,order_id,creation_id,customer_id,owner_type')
    .eq('final_job_id', final.job_id)
    .eq('status', 'ordered')
  if (selector) linked = linked.eq('cart_item_id', selector.item).eq('order_id', selector.order)
  const [lines, job, order, creation] = await Promise.all([
    linked.limit(2),
    db.from('jobs').select(jobFields).eq('job_id', final.job_id).maybeSingle(),
    db.from('orders')
      .select('customer_id,first_name:shipping_address->>firstName,last_name:shipping_address->>lastName')
      .eq('order_id', final.order_id)
      .maybeSingle(),
    db
      .from('creations')
      .select('creation_id,preview_job_id,template_id,owner_type,customer_id')
      .eq('creation_id', final.creation_id)
      .maybeSingle(),
  ])
  for (const result of [lines, job, order, creation]) if (result.error) throw result.error
  const line = lines.data?.length === 1 ? lines.data[0] : null
  const owner = order.data?.customer_id
  const execution = job.data
  const book = creation.data
  if (
    !owner ||
    !line ||
    !book ||
    !execution ||
    line.owner_type !== 'customer' ||
    line.customer_id !== owner ||
    line.cart_item_id !== final.cart_item_id ||
    line.order_id !== final.order_id ||
    line.creation_id !== final.creation_id ||
    book.owner_type !== 'customer' ||
    book.customer_id !== owner ||
    !final.template_id ||
    book.template_id !== final.template_id ||
    execution.job_type !== 'final' ||
    execution.owner_type !== 'customer' ||
    execution.customer_id !== owner ||
    execution.cart_item_id !== line.cart_item_id ||
    execution.creation_id !== book.creation_id ||
    execution.template_id !== book.template_id
  )
    return null
  const purchaser = [order.data?.first_name, order.data?.last_name]
    .map(part => part?.trim())
    .filter(Boolean)
    .join(' ') || null
  return { line, execution, owner, book, purchaser }
}

type BoundLine = NonNullable<Awaited<ReturnType<typeof resolveMaterialLine>>>

export async function readLineDedication({ line }: BoundLine) {
  const rows = await loadTrustedOrderLineDedications(line.order_id)
  const row = rows.find((d) => d.cartItemId === line.cart_item_id && d.creationId === line.creation_id)
  if (!row) return null
  const stamp = await db
    .from('order_dedication_revisions')
    .select('created_at')
    .eq('cart_item_id', line.cart_item_id)
    .eq('revision', row.revision)
    .maybeSingle()
  return { body: row.body, revision: row.revision, updatedAt: stamp.data?.created_at ?? null }
}

export async function resolveSource({ execution, owner }: BoundLine, inspectFile = true) {
  const frozen = execution.input_snapshot?.face_source_path
  if (typeof frozen !== 'string' || !frozen.startsWith('raw-private/')) return null
  const path = frozen.slice('raw-private/'.length)
  if (!path || path.split('/').some((part) => !part || part === '.' || part === '..') || /[%?#\\]/.test(path))
    return null
  const { data, error } = await db
    .from('user_assets')
    .select('asset_id')
    .eq('storage_path', path)
    .eq('asset_type', 'face_image')
    .eq('owner_type', 'customer')
    .eq('customer_id', owner)
    .maybeSingle()
  return !error && data && (!inspectFile || (await imageType(path))) ? path : null
}

async function imageType(path: string) {
  const { data, error } = await bucket.info(path)
  const mime = data?.contentType ?? data?.metadata?.mimetype
  return !error && typeof mime === 'string' && imageTypes.includes(mime) ? mime : null
}

type PreviewFiles = { id: string; pages: ReturnType<typeof previewFiles> }

export async function resolvePreviews(
  { book, execution, owner }: BoundLine,
  inspectFiles = true,
  onDisplayReady?: (preview: PreviewFiles) => void,
) {
  const frozen = execution.input_snapshot
  const identity = frozenText(frozen)
  if (!book.preview_job_id || !frozen?.face_source_path || !identity.child || !execution.story_language)
    return null
  // A candidate pointer and a shared photo cannot distinguish repeated versions.
  const matches = await db
    .from('jobs')
    .select('job_id,input_snapshot')
    .eq('creation_id', book.creation_id)
    .eq('customer_id', owner)
    .eq('owner_type', 'customer')
    .eq('template_id', book.template_id)
    .eq('job_type', 'preview')
    .eq('status', 'done')
    .eq('story_language', execution.story_language)
    .eq('input_snapshot->>face_source_path', frozen.face_source_path)
    .lte('created_at', execution.created_at)
    .limit(9)
  if (matches.error || !matches.data || matches.data.length >= 9) return null
  const compatible = matches.data.filter((row) => {
    const text = frozenText(row.input_snapshot)
    return (
      !isPreviewVariantInvalidated(row.input_snapshot) &&
      text.child === identity.child &&
      text.age === identity.age
    )
  })
  if (compatible.length !== 1 || compatible[0].job_id !== book.preview_job_id) return null
  const preview = await db
    .from('jobs')
    .select('job_id,created_at,output_assets,input_snapshot')
    .eq('job_id', book.preview_job_id)
    .eq('creation_id', book.creation_id)
    .eq('customer_id', owner)
    .eq('template_id', book.template_id)
    .eq('job_type', 'preview')
    .eq('status', 'done')
    .eq('owner_type', 'customer')
    .eq('story_language', execution.story_language)
    .maybeSingle()
  if (
    !preview.data ||
    isPreviewVariantInvalidated(preview.data.input_snapshot) ||
    preview.data.input_snapshot?.face_source_path !== frozen.face_source_path ||
    frozenText(preview.data.input_snapshot).child !== identity.child ||
    frozenText(preview.data.input_snapshot).age !== identity.age
  )
    return null
  const candidates = previewFiles(preview.data)
  if (!inspectFiles) return { id: preview.data.job_id, pages: candidates }
  const originals = Promise.all(candidates.map(page =>
    page.png ? hasOriginalPng(page.png).catch(() => false) : false
  ))
  const displayTypes = await Promise.all(candidates.map(page => imageType(page.webp).catch(() => null)))
  const verified = candidates.filter((_, i) => displayTypes[i] === 'image/webp')
  const id = preview.data.job_id
  onDisplayReady?.({ id, pages: verified.map(page => ({ ...page, png: null })) })
  const available = await originals
  return {
    id,
    pages: candidates.flatMap((page, i) => displayTypes[i] === 'image/webp'
      ? [{ ...page, png: available[i] ? page.png : null }]
      : []),
  }
}

const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10]

async function hasOriginalPng(path: string) {
  const { data } = await bucket.createSignedUrl(path, 60)
  if (!data) return false
  const res = await fetch(data.signedUrl, { cache: 'no-store', headers: { Range: 'bytes=0-7' } })
  if (
    res.status !== 206 ||
    !res.headers.get('content-range')?.startsWith('bytes 0-7/') ||
    res.headers.get('content-type')?.split(';')[0] !== 'image/png'
  ) {
    await res.body?.cancel()
    return false
  }
  const head = new Uint8Array(await res.arrayBuffer())
  return head.length === 8 && pngSignature.every((byte, i) => head[i] === byte)
}

// Stream authenticated bytes. The private signed URL is never sent to the browser.
export async function readMaterialFile(path: string, download: boolean, label: string, expected?: string) {
  const mime = await imageType(path)
  if (!mime || (expected && mime !== expected)) return null
  const { data } = await bucket.createSignedUrl(path, 60)
  if (!data) return null
  const upstream = await fetch(data.signedUrl, { cache: 'no-store' })
  if (!upstream.ok || !upstream.body || upstream.headers.get('content-type')?.split(';')[0] !== mime) {
    await upstream.body?.cancel()
    return null
  }
  const extension = mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1]
  if (expected === 'image/png') {
    const signature = pngSignature
    const reader = upstream.body.getReader()
    const chunks: Uint8Array[] = []
    let count = 0
    while (count < signature.length) {
      const { done, value } = await reader.read()
      if (done || !value) {
        await reader.cancel()
        return null
      }
      chunks.push(value)
      for (let n = 0; n < value.length && count < signature.length; n++, count++) {
        if (value[n] !== signature[count]) {
          await reader.cancel()
          return null
        }
      }
    }
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const first = chunks.shift()
        if (first) {
          controller.enqueue(first)
          return
        }
        const next = await reader.read()
        if (next.done) controller.close()
        else controller.enqueue(next.value)
      },
      cancel: (reason) => reader.cancel(reason),
    })
    return new Response(stream, { headers: fileHeaders(mime, download, label + '.' + extension) })
  }
  return new Response(upstream.body, { headers: fileHeaders(mime, download, label + '.' + extension) })
}

function fileHeaders(type: string, download: boolean, filename: string) {
  return {
    'Cache-Control': 'private, no-store',
    'Content-Type': type,
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': (download ? 'attachment' : 'inline') + '; filename="' + filename + '"',
  }
}
