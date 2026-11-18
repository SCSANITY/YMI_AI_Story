import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { FinalReviewPanel } from '../../components/admin/FinalReviewPanel'

const books = ['Mira', 'Alex'].map((child, index) => ({
  child,
  final_job_id: 'final-' + index,
  cart_item_id: 'line-' + index,
  order_id: 'order-1',
  display_title: child + ' Adventure',
  production_mode: 'manual',
  status: 'done',
  review_status: 'released',
  released_at: '2026-11-18T06:30:00Z',
  total_pages: 1,
  approved_pages: 1,
  print_status: 'pending',
  orders: { display_id: 'DEMO-1042', order_status: 'paid' },
}))
const dedications = books.map(({ child }) => ({ body: 'For ' + child, revision: 2, updatedAt: null }))
const writes = []
const unexpectedRequests = []
const api = '/api/admin/final-jobs'

function check(condition, message) {
  if (!condition) throw new Error(message)
}

function fixtureResponse(url, method) {
  check(method === 'GET', 'Unexpected method ' + method)
  if (url.pathname === api) return { finalJobs: books }
  for (const [index, book] of books.entries()) {
    const detail = api + '/' + book.final_job_id
    if (url.pathname === detail) {
      return {
        finalJob: book, purchased_edition: 'basic',
        page_contract: { schema_version: 3, asset_layout: 'single-page' },
        pages: [{ page_index: 0, output_order: 0, role: 'final_front_cover', status: 'approved' }],
      }
    }
    if (url.pathname === detail + '/materials') {
      check(url.searchParams.get('item') === book.cart_item_id, 'Wrong order line for ' + detail)
      check(url.searchParams.get('order') === book.order_id, 'Wrong order for ' + detail)
      const dedication = dedications[index]
      if (url.searchParams.get('kind') === 'dedication') return { dedication }
      return {
        lineId: book.cart_item_id, viewerId: 'operator', child: book.child,
        dedication, sourceAvailable: false, pages: [],
      }
    }
  }
  throw new Error('Unexpected request ' + url.pathname)
}

function singleToggle() {
  const matches = [...document.querySelectorAll('button')].filter(
    (button) => button.textContent.trim() === 'Production materials'
  )
  check(matches.length === 1, 'Expected one materials toggle, found ' + matches.length)
  const toggle = matches[0]
  check(toggle.closest('#final-review-version-panel'), 'Materials outside active tab')
  return toggle
}

async function click(element) {
  check(element && !element.disabled, 'Expected an operable control')
  await act(async () => element.click())
}

async function run() {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  window.fetch = async (input, options) => {
    try {
      const payload = fixtureResponse(new URL(input, 'https://fixture.invalid'), options?.method ?? 'GET')
      return { ok: true, status: 200, json: async () => structuredClone(payload) }
    } catch (error) {
      unexpectedRequests.push(error.message)
      return { ok: false, status: 400, json: async () => ({ error: error.message }) }
    }
  }
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (text) => writes.push(text) } })
  const root = createRoot(document.getElementById('root'))
  for (const [index, book] of books.entries()) {
    await act(async () => root.render(
      <FinalReviewPanel key={book.final_job_id} initialFinalJobId={book.final_job_id}
        initialMaterialLine={{ order: book.order_id, item: book.cart_item_id }} />
    ))
    for (const [step, tab] of ['pdf', 'print', 'pdf', 'print', 'pdf'].entries()) {
      const tabButton = document.getElementById('final-' + tab + '-tab')
      check(tabButton, 'Missing ' + tab + ' tab: ' + document.getElementById('root').innerText.slice(-800) + ' ' + unexpectedRequests.join(', '))
      await click(tabButton)
      check(tabButton.getAttribute('aria-selected') === 'true', 'Wrong selected tab ' + tab)
      const toggle = singleToggle()
      check(toggle.getAttribute('aria-expanded') === 'false', 'New tab should start collapsed')
      await click(toggle)
      const body = document.getElementById(toggle.getAttribute('aria-controls'))
      check(singleToggle().getAttribute('aria-expanded') === 'true' && body, 'Toggle did not expand')
      check([...body.querySelectorAll('strong')].some(node => node.textContent === book.child), 'Wrong child')
      const text = body.querySelector('[aria-label="Dedication text"]')?.textContent
      const copyButton = body.querySelector('button[aria-label="Copy dedication"]')
      const cleared = index === 0 && step > 0
      check(body.textContent.includes('Dedication removed. Remove any previously copied text.') === cleared,
        'Incorrect removal warning for ' + book.child)
      if (cleared) {
        check(text === 'No dedication submitted.' && body.textContent.includes('Rev 3'), 'Missing cleared revision')
        check(!copyButton, 'Cleared dedication can still be copied')
      } else {
        check(text === 'For ' + book.child && copyButton, 'Wrong dedication')
      }
      if (index === 0 && step === 0) {
        await click(copyButton)
        check(writes.length === 1 && writes[0] === text && body.textContent.includes('Dedication copied.'), 'Copy failed')
        dedications[0] = { body: null, revision: 3, updatedAt: '2026-11-18T07:00:00Z' }
      }
      // Leave alternating tabs open during the transition and also exercise the close action.
      if (step % 2 === 1) {
        await click(toggle)
        check(toggle.getAttribute('aria-expanded') === 'false' && body.childElementCount === 0, 'Toggle did not collapse')
      }
    }
  }
  check(!unexpectedRequests.length, unexpectedRequests.join(', '))
  await act(async () => root.unmount())
}

run().then(
  () => { document.getElementById('result').textContent = 'passed' },
  error => { document.getElementById('result').textContent = encodeURIComponent(error.stack || error.message) }
)
