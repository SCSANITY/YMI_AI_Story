import assert from 'node:assert/strict'
import test from 'node:test'
import { loadUi, uiNodes, uiText } from './helpers/preview-uiux-harness.mjs'

test('only released, book-scoped files and unambiguous legacy downloads qualify', async () => {
  const revision = '12345678-1234-4234-8234-123456789abc.pdf'
  const row = (id, path, status = 'released') => ({
    job_id: id, final_job_id: 'review-' + id, cart_item_id: 'line-' + id, creation_id: 'creation-' + id,
    order_id: 'order-' + id, pdf_path: path, review_status: status,
  })
  const scoped = id => `orders/order-${id}/final/books/review-${id}/pdf/${revision}`
  const rows = [
    row('a',scoped('a')), row('b',scoped('b')), row('pending',scoped('pending'),'reviewing'),
    row('wrong',scoped('b')), row('worker','jobs/2026/11/01/worker/attempt_001/output/final_book.pdf'),
    row('legacy','orders/order-legacy/final/pdf/final.pdf'), row('ambiguous','orders/order-ambiguous/final/pdf/final.pdf'),
  ]
  const query = { select() { return this }, async in(column,ids) {
    assert.equal(column,'job_id')
    return { data:rows.filter(r=>ids.includes(r.job_id)) }
  } }
  const { loadReleasedFinalPdfAssetsByJobId } = loadUi('src/lib/purchase-state.ts',{
    '@/lib/supabaseAdmin': { supabaseAdmin:{from(table){assert.equal(table,'final_jobs');return query}} },
    '@/lib/final-review-batch-approval': { hasSingleFinalOrderLine:async (o,c)=>o==='order-legacy' && c==='line-legacy' },
  })
  const files = await loadReleasedFinalPdfAssetsByJobId(rows.map(r=>r.job_id))
  assert.deepEqual([...files.keys()],['a','b','worker','legacy'])
  assert.equal(files.get('a').pdfPath,scoped('a'))
})

test('order items render separate, named download links and omit the action for an unpublished book', () => {
  const { OrderDetailPanels } = loadUi('app/orders/[orderID]/OrderDetailPanels.tsx',{
    '@/components/orders/OrderMaterialsSummary': { OrderMaterialsSummary:()=>null },
    '@/components/OrderCoverImage': { default:()=>null, __esModule:true },
    '@/components/SignatureVoiceEditionNotice': { SignatureVoiceBadge:()=>null, SignatureVoiceEditionNotice:()=>null },
    '@/lib/locale-pricing': { formatMajorCurrencyValue:()=>'$55' },
    '@/lib/signature-voice': { isSignatureVoicePackage:()=>false },
  })
  const items=['Moon','Moon','Ocean'].map((name,i)=>({
    cart_item_id:'line-'+i, template_name:name, quantity:1, final_pdf_url:i<2 ? '/file-'+i : null,
  }))
  const ui=OrderDetailPanels({items, order:{order_id:'order-a'}, t:k=>k==='orderDetail.downloadPdf'?'Download PDF':k})
  const links=uiNodes(ui).filter(n=>n.type==='a')
  assert.deepEqual(links.map(n=>n.props.href),['/file-0','/file-1'])
  assert.ok(links.every(n=>uiText(n).includes('Download PDF') && uiText(n).includes('Moon')))
})
