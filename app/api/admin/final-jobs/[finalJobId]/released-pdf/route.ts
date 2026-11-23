import { requireAdminCustomer } from '@/lib/adminAuth'
import { noStoreJson } from '@/lib/http-response'
import { loadReleasedFinalPdfAssetsByJobId } from '@/lib/purchase-state'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET(request: Request, context: { params: Promise<{ finalJobId: string }> }) {
  if (!await requireAdminCustomer()) return noStoreJson({ error: 'Admin access required' }, { status: 403 })
  const { finalJobId } = await context.params
  const { data: job, error } = await supabaseAdmin.from('final_jobs')
    .select('job_id,order_id,cart_item_id,proof_revision,pdf_path').eq('final_job_id', finalJobId).maybeSingle()
  if (error) return noStoreJson({ error: 'Could not read the released proof' }, { status: 500 })
  if (!job) return noStoreJson({ error: 'Book not found' }, { status: 404 })
  if (new URL(request.url).searchParams.get('revision') !== String(job.proof_revision)) {
    return noStoreJson({ error: 'This proof changed. Refresh the book before downloading.' }, { status: 409 })
  }
  const asset = (await loadReleasedFinalPdfAssetsByJobId([job.job_id])).get(job.job_id)
  if (!asset || asset.pdfPath !== job.pdf_path || asset.orderId !== job.order_id || asset.cartItemId !== job.cart_item_id) {
    return noStoreJson({ error: 'No verified published PDF' }, { status: 409 })
  }
  const { data: file, error: signError } = await supabaseAdmin.storage.from('raw-private')
    .createSignedUrl(asset.pdfPath, 60, { download: 'Book-' + finalJobId + '.pdf' })
  if (signError || !file?.signedUrl) return noStoreJson({ error: 'PDF download unavailable' }, { status: 503 })
  return new Response(null, { status: 303, headers: {
    Location: file.signedUrl, 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer',
  } })
}
