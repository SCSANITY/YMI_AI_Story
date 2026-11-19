import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { FinalReviewPanel } from '../../components/admin/FinalReviewPanel'

const books = ['Mira', 'Alex'].map((child, index) => ({
  child,
  final_job_id: 'final-' + index,
  cart_item_id: 'line-' + index,
  order_id: 'order-1',
  display_title: child + ' Adventure',
  production_mode: 'manual', purchased_edition: index ? 'supreme' : 'basic',
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
        finalJob: book, purchased_edition: book.purchased_edition,
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
        dedication, subtitleAvailable: index === 0, sourceAvailable: false, previewId: 'preview-' + index,
        pages: ['Cover', 'Inside 1', 'Inside 2'].map((label, i) => ({ index: i, label, pngAvailable: true })),
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

async function waitFor(predicate) {
  for (let tick = 0; tick < 1000 && !predicate(); tick++) {
    await act(async () => new Promise(resolve => setTimeout(resolve, 5)))
  }
  check(predicate(), 'Timed out waiting for fixture')
}

async function run() {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  let failArtwork = true
  const blobs = []
  const createObjectURL = URL.createObjectURL.bind(URL)
  URL.createObjectURL = blob => { blobs.push(blob); return createObjectURL(blob) }
  const clickAnchor = HTMLAnchorElement.prototype.click
  HTMLAnchorElement.prototype.click = function () {
    if (!this.href.startsWith('blob:')) clickAnchor.call(this)
  }
  window.fetch = async (input, options) => {
    try {
      const url = new URL(input, 'https://fixture.invalid')
      if (url.href === 'https://fixture.invalid/example-image') return new Response('sample image bytes')
      const payload = fixtureResponse(url, options?.method ?? 'GET')
      if (url.searchParams.get('kind') === 'artwork') {
        if (failArtwork) { failArtwork = false; return new Response(null, { status: 503 }) }
        return Response.json({ archiveName: 'example.zip', files: [{ name: 'Interior 01.png', url: 'https://fixture.invalid/example-image' }] })
      }
      if (url.searchParams.get('kind') === 'subtitle') return Response.json({ pages: [] })
      if (options?.headers?.Accept === 'application/x-ndjson') {
        const { pages, previewId, dedication, sourceAvailable, ...header } = payload
        const parts = [header, { dedication }, { sourceAvailable }, { previewId, pages }]
        const wire = parts.map(part => JSON.stringify(part) + '\n').join('')
        // Fragment the first JSON record across transport chunks.
        const stream = new ReadableStream({ start(c) {
          const encode = new TextEncoder()
          c.enqueue(encode.encode(wire.slice(0, 6)))
          c.enqueue(encode.encode(wire.slice(6)))
          c.close()
        } })
        return new Response(stream, { headers: { 'content-type': 'application/x-ndjson' } })
      }
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
      await waitFor(() => document.getElementById('final-' + tab + '-tab'))
      const tabButton = document.getElementById('final-' + tab + '-tab')
      check(tabButton, 'Missing ' + tab + ' tab: ' + document.getElementById('root').innerText.slice(-800) + ' ' + unexpectedRequests.join(', '))
      await click(tabButton)
      check(tabButton.getAttribute('aria-selected') === 'true', 'Wrong selected tab ' + tab)
      const toggle = singleToggle()
      check(toggle.getAttribute('aria-expanded') === 'false', 'New tab should start collapsed')
      await click(toggle)
      const body = document.getElementById(toggle.getAttribute('aria-controls'))
      check(singleToggle().getAttribute('aria-expanded') === 'true' && body, 'Toggle did not expand')
      await waitFor(() => body.querySelectorAll('section img').length === 3)
      if (step === 0) {
        const gallery = body.querySelector('section')
        const images = [...gallery.querySelectorAll('img')]
        check(images.length === 3, 'Expected exactly three mounted WebPs')
        await Promise.all(images.map(img => img.decode()))
        for (const img of images) {
          check(img.src.includes('preview=preview-' + index), 'Prefetched another book')
          check(performance.getEntriesByName(img.src).length === 1, 'Expected one initial request per WebP')
        }
        for (const [label, position] of [['Next', 1], ['Next', 2], ['Previous', 1], ['Previous', 0]]) {
          await click(gallery.querySelector('button[aria-label="' + label + ' preview"]'))
          const visible = [...gallery.querySelectorAll('img')].filter(img => !img.closest('[hidden]'))
          check(visible.length === 1 && visible[0] === images[position] && visible[0].naturalWidth > 0,
            'Switch must show the same decoded image immediately')
          check(gallery.querySelector('a[download]').href.includes('page=' + position), 'Wrong PNG link')
        }
        for (const img of images) check(performance.getEntriesByName(img.src).length === 1, 'Repeated WebP read')
      }
      const artwork = body.querySelector('button[aria-label="Download Story artwork ZIP"]')
      const subtitle = body.querySelector('button[aria-label="Download Subtitle template JSON"]')
      check(artwork && !artwork.disabled, 'Artwork should remain available for both books')
      check(subtitle && subtitle.disabled === (index !== 0), 'Wrong subtitle availability for this book')
      if (index === 0 && step === 0) {
        await click(artwork)
        await waitFor(() => artwork.textContent.includes('Retry'))
        check(!subtitle.disabled && blobs.length === 0, 'Failed ZIP must not save a partial file or disable JSON')
        await click(artwork)
        await waitFor(() => artwork.textContent.includes('Download started'))
        const zip = await blobs[0].text()
        check(zip.startsWith('PK') && zip.includes('Interior 01.png') && zip.includes('sample image bytes'), 'Missing ZIP entry or bytes')
        await click(subtitle)
        await waitFor(() => subtitle.textContent.includes('Download started'))
        check((await blobs[1].text()) === '{"pages":[]}', 'Wrong subtitle download contents')
      }
      const links = [...body.querySelectorAll('section[aria-label="Production tools"] a')]
      check(links.length === 3, 'Expected all three production tools')
      for (const [position, [name, url]] of [
        ['Face swap · Prompt Lab', 'https://scsanity.github.io/image-prompt-lab/'],
        ['Subtitle Editor', 'https://scsanity.github.io/story-json-creator/'],
        ['Image Resizer', 'https://scsanity.github.io/YMI-image-toolkit/'],
      ].entries()) {
        const link = links[position]
        check(link.textContent.trim() === name && link.href === url, 'Wrong tool name or destination')
        check(link.target === '_blank' && link.relList.contains('noopener') && link.relList.contains('noreferrer'),
          'External tool must open independently without a referrer')
      }
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

const notifyServer = window.fetch.bind(window)
run().then(
  () => { document.getElementById('result').textContent = 'passed' },
  error => { document.getElementById('result').textContent = encodeURIComponent(error.stack || error.message) }
).finally(() => notifyServer('/test-finished'))
