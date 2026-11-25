import { act, useState } from 'react'
import { OrderManagementCard } from '../../components/admin/sections/orders/OrderManagementCard'

const books = [
  { itemId: 'line-0', edition: 'basic', finalJobId: 'final-0', title: 'Mira Adventure', quantity: 2 },
  { itemId: 'line-1', edition: 'supreme', finalJobId: 'final-1', title: 'Alex Adventure', quantity: 1 },
].map(book => ({ ...book, cover: null, physical: true }))
const order = {
  order_id: 'order-1', display_id: 'DEMO-1042', order_status: 'production', book_progress_manual: true, books,
  email: 'sample@example.test', created_at: '2026-11-20T06:35:00Z', logistics_updated_at: null,
  shipping_address: { firstName: 'Alex', lastName: 'Morgan', phone: '12345678', addressLine1: 'Example Lane', city: 'Hong Kong' },
  production_progress: { itemCount: 3, printReleasedCount: 0, printTotalCount: 2, pdfReleasedCount: 2, pdfTotalCount: 2, missingJobCount: 0 },
}
function Demo() {
  const [expanded, setExpanded] = useState(false)
  const [saved, setSaved] = useState(order)
  return <OrderManagementCard order={saved} orderGroup="active" expanded={expanded} onToggle={() => setExpanded(!expanded)} onCommitted={setSaved} />
}

export async function verifyOrderDetails(root, check, click, waitFor) {
  let saves = 0
  let resumes = 0
  const requests = []
  window.fetch = async (input, options = {}) => {
    const url = new URL(input, location.origin)
    requests.push(url.pathname)
    if (url.pathname.endsWith('/production')) return Response.json({ jobs: books.map(b => ({ finalJobId: b.finalJobId, cartItemId: b.itemId, thumbnailUrl: '/cover-' + b.itemId })) })
    if (url.pathname.endsWith('/email-activity')) return Response.json({ total: 2, events: [
      { email_event_id: 'e1', email_key: 'final_delivery', final_job_id: 'final-1', status: 'sent', created_at: order.created_at },
      { email_event_id: 'e2', email_key: 'order_confirmation', provider_delivery_status: 'delivered', status: 'sent', created_at: order.created_at },
    ] })
    if (url.pathname.endsWith('/progress') && options.method === 'PATCH') {
      const body = JSON.parse(options.body)
      check(body.action === 'resume' && body.expectedUpdatedAt === null, 'Resume lost its version or sent the wrong action')
      resumes++
      return Response.json({ order: { ...order, order_status: 'paid', book_progress_manual: false } })
    }
    if (url.pathname.endsWith('/logistics') && options.method === 'PATCH') {
      const patch = JSON.parse(options.body)
      check(patch.expectedStatus === (saves ? 'shipped' : 'paid') && patch.orderStatus === (saves ? 'delivered' : 'shipped'), 'Incorrect persisted state or target')
      saves++
      return Response.json({ order: { ...order, order_status: patch.orderStatus, book_progress_manual: false }, emailStatus: 'failed', emailError: 'fixture' })
    }
    throw Error('Unexpected Order request ' + url.pathname)
  }
  await act(async () => root.render(<Demo />))
  const article = document.querySelector('article')
  const chip = [...article.querySelectorAll('button')].find(b => b.textContent.includes('Hardcover × 2'))
  await click(chip)
  const popover = document.querySelector('[role=region][aria-label=Hardcover]')
  check(popover?.textContent.includes('Mira Adventure') && !popover.textContent.includes('Alex Adventure'), 'Wrong edition popover')
  await waitFor(() => popover.querySelector('img')?.src.endsWith('cover-line-0'))
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
  await click(article.querySelector('button[aria-expanded=false]'))
  const dialog = document.querySelector('[role=dialog]')
  check(dialog?.textContent.includes('Example Lane') && dialog.textContent.includes('12345678'), 'Shipping info missing')
  for (const book of books) for (const version of ['pdf','print']) {
    const link = dialog.querySelector(`a[aria-label="Open ${version === 'pdf' ? 'PDF' : 'Print'} for ${book.title}"]`)
    const params = new URL(link.href).searchParams
    check(params.get('order') === order.order_id && params.get('job') === book.finalJobId && params.get('item') === book.itemId && params.get('version') === version, 'Incorrect book link')
  }
  const history = [...dialog.querySelectorAll('details')].find(d => d.textContent.includes('Email activity'))
  check(!history.open, 'Email history must start collapsed')
  await click(history.querySelector('summary'))
  await waitFor(() => history.textContent.includes('Entire order'))
  check(history.textContent.includes('Alex Adventure') && history.textContent.includes('Sent · delivery unconfirmed') && history.textContent.includes('delivered'), 'Incorrect mail scope/evidence')
  const status = dialog.querySelector('select')
  const resumeButton = [...dialog.querySelectorAll('button')].find(b => b.textContent.trim() === 'Resume automatic progress')
  check(resumeButton && !resumeButton.disabled, 'Manual Printing must offer a visible resume action')
  await act(async () => { status.value = 'preview_ready'; status.dispatchEvent(new Event('change',{bubbles:true})) })
  check(resumeButton.disabled, 'Resuming must protect the unsaved correction')
  await click([...dialog.querySelectorAll('button')].find(b => b.textContent.trim() === 'Discard'))
  await click(resumeButton)
  await waitFor(() => status.value === 'paid' && resumeButton.disabled)
  check(resumes === 1 && !saves, 'Resume must use only the progress endpoint')
  check([...status.options].map(o=>o.text).join('|') === 'Order Confirmed|Preview Ready|Printing|Shipped|Delivered', 'Physical order status options are out of sequence')
  await act(async () => { status.value = 'shipped'; status.dispatchEvent(new Event('change',{bubbles:true})) })
  check(!saves, 'Changing selection saved prematurely')
  await click([...dialog.querySelectorAll('button')].find(b => b.textContent.trim() === 'Save changes'))
  await waitFor(() => dialog.textContent.includes('email failed'))
  check(saves === 1 && article.textContent.includes('Shipped'), 'Persisted status missing after email failure')
  check(resumeButton.disabled && dialog.textContent.includes('Production tracking ends at shipment.'), 'Shipped offered production resume')
  await act(async () => { status.value = 'delivered'; status.dispatchEvent(new Event('change',{bubbles:true})) })
  await click([...dialog.querySelectorAll('button')].find(b => b.textContent.trim() === 'Save changes'))
  await waitFor(() => article.textContent.includes('Delivered'))
  check(resumeButton.disabled && resumes === 1 && saves === 2, 'Delivered resumed production')
  check(!requests.some(p => p.includes('/signature-voice')), 'Orders accessed recordings')
}
