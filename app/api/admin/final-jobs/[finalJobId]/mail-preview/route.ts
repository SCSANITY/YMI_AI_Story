import { emailAsset } from '@/components/emails/EmailLayout'
import { proofEditRevision } from '@/lib/proof-edit-revision'
import { releaseTemplateSnapshot } from '@/lib/release-template-snapshot'
import { pdfDeliverySubject } from '@/lib/order-email-subjects'
import { PRINT_RELEASED_SUBJECT } from '@/components/emails/PrintReleasedEmail'
import { noStoreJson } from '@/lib/http-response'
import { requireAdminCustomer } from '@/lib/adminAuth'
import { purchasedLineEdition } from '@/lib/package-pricing'
import { isScopedFinalApprovedPage, isLegacyFinalManualPage } from '@/lib/final-review-artifact-paths'
import { resolveFinalJobDisplayTitle } from '@/lib/personalized-book-title'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(request: Request, context: { params: Promise<{ finalJobId: string }> }) {
  if (!await requireAdminCustomer()) return noStoreJson({ error: 'Admin access required' }, { status: 403 })
  const { finalJobId } = await context.params
  const body = await request.json().catch(() => null)
  if (!['pdf','print'].includes(body?.kind) || typeof body.note !== 'string' || body.note.length > 4000) {
    return noStoreJson({ error: 'Invalid mail preview' }, { status: 400 })
  }
  const { data: book, error } = await supabaseAdmin.from('final_jobs')
    .select('job_id,cart_item_id,order_id,creation_id,template_id,proof_draft_sequence,proof_revision,proof_draft_open,creations:creations(customize_snapshot,templates:templates(name)),purchased_line:cart_items!final_jobs_cart_item_id_fkey(cart_item_id,order_id,creation_id,final_job_id,status,product_type,package_type)')
    .eq('final_job_id',finalJobId).maybeSingle()
  if (error || !book) return noStoreJson({ error: 'Cannot load book' }, { status: 404 })
  if (body.revision !== proofEditRevision(book)) {
    return noStoreJson({ error: 'Proof changed. Refresh this book.' }, { status: 409 })
  }
  const { data: order } = await supabaseAdmin.from('orders').select('display_id,email,first_name:shipping_address->>firstName')
    .eq('order_id',book.order_id).maybeSingle()
  if (!order?.email) return noStoreJson({ error: 'Order recipient unavailable' }, { status: 409 })
  const purchase = Array.isArray(book.purchased_line) ? book.purchased_line[0] : book.purchased_line
  const edition = purchase?.order_id === book.order_id && purchase.cart_item_id === book.cart_item_id
    ? purchasedLineEdition(purchase.product_type, purchase.package_type) : null
  let coverImageUrl: string | undefined
  if (body.kind === 'pdf') {
    const { data: cover } = await supabaseAdmin.from('final_job_pages')
      .select('approved_output_path,approved_source,manual_output_path')
      .eq('final_job_id', finalJobId).order('page_index').limit(1).maybeSingle()
    const path = cover?.approved_output_path
    if (path && (isScopedFinalApprovedPage({ orderId: book.order_id, finalJobId }, path) ||
      (cover.approved_source === 'manual' && path === cover.manual_output_path && isLegacyFinalManualPage(book.order_id, path)))) {
      const { data: image } = await supabaseAdmin.storage.from('raw-private').createSignedUrl(path, 300)
      coverImageUrl = image?.signedUrl
    }
  }
  const title=resolveFinalJobDisplayTitle(book)
  const {html,fingerprint}=await releaseTemplateSnapshot({kind:body.kind,orderId:book.order_id,displayId:order.display_id,
    bookTitle:title,firstName:order.first_name,edition,coverImageUrl})
  return noStoreJson({ html, fingerprint, cover:coverImageUrl || emailAsset('cover-placeholder.png'),seal:emailAsset('seal.png'), title, recipient:order.email,
    subject:body.kind === 'print' ? PRINT_RELEASED_SUBJECT : pdfDeliverySubject(edition === 'basic' || edition === 'supreme', order.display_id || book.order_id) })
}
