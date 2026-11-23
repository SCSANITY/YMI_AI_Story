import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import test from 'node:test'

import { PDFDict, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib'
import sharp from 'sharp'
import ts from 'typescript'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const requirePackage = createRequire(import.meta.url)
const adminRoute = 'app/api/admin/final-jobs/[finalJobId]/'

function makeHarness() {
  const orderId = 'synthetic-order'
  const objects = new Map()
  const rows = { final_proof_releases: [], order_reminder_schedules: [],
    final_jobs: [],
    jobs: [],
    final_job_pages: [],
    orders: [{ order_id: orderId, email: 'buyer@example.test', first_name: 'Sophie', order_status: 'paid' }],
    cart_items: [],
  }
  const signing = []
  const mail = []
  const writes = []
  const failMail = new Set()
  const error = (message) => ({ data: null, error: { message } })
  const ok = (data) => ({ data, error: null })
  const supabaseAdmin = {
    async rpc(name, args) {
      assert.equal(name, 'publish_final_proof')
      const book = rows.final_jobs.find(row => row.final_job_id === args.p_job)
      if (book.released_at && !book.proof_draft_open) return { error: { code: 'PT409', message: 'already published' } }
      const job = rows.jobs.find(row => row.job_id === book.job_id)
      assert.deepEqual(args.p_pages.map(p => p.approved_output_path), rows.final_job_pages
        .filter(p => p.final_job_id === book.final_job_id).map(p => p.approved_output_path))
      Object.assign(book, { pdf_path: args.p_path, released_at: new Date().toISOString(), email_sent_at: null,
        review_status: 'released', approved_pages: args.p_pages.length, proof_revision: args.p_revision, proof_draft_open: false })
      rows.final_proof_releases.push({ final_job_id: book.final_job_id, revision: args.p_revision, release_note: args.p_note })
      job.output_assets = { ...args.p_assets, bucket: 'raw-private', pdf_path: args.p_path }
      return ok(book.released_at)
    },
    from(table) {
      assert.ok(rows[table], table)
      const filters = []
      let patch
      let limit = Infinity
      let sortKey
      let countRequested = false
      function execute(single) {
        const selected = rows[table].filter((row) => filters.every((filter) => filter(row)))
        if (sortKey) selected.sort((a, b) => a[sortKey] - b[sortKey])
        const matching = selected.slice(0, limit)
        if (patch) {
          for (const row of matching) Object.assign(row, structuredClone(patch))
          if (matching.length > 0) writes.push({ table, patch: structuredClone(patch) })
        }
        return { ...ok(single ? structuredClone(matching[0] ?? null) : structuredClone(matching)), count: countRequested ? matching.length : null }
      }
      const query = {
        select(_fields, options) { countRequested = options?.count === 'exact'; return query },
        eq(key, value) { filters.push((row) => row[key] === value); return query },
        setHeader(name, value) { assert.equal(name,'x-proof-revision'); assert.ok(Number(value) >= 1); return query },
        or(predicate) { assert.equal(predicate,'released_at.is.null,proof_draft_open.eq.true')
          filters.push(row => row.released_at == null || row.proof_draft_open); return query },
        neq(key, value) { filters.push((row) => row[key] !== value); return query },
        is(key, value) { filters.push((row) => row[key] === value); return query },
        not(key, operator, value) { assert.equal(operator, 'is'); filters.push((row) => row[key] != value); return query },
        in(key, values) { filters.push((row) => values.includes(row[key])); return query },
        update(value) { patch = value; return query },
        limit(value) { limit = value; return query },
        order(key) { sortKey = key; return query },
        async maybeSingle() { return execute(true) },
        then(resolve, reject) { return Promise.resolve().then(() => execute(false)).then(resolve, reject) },
      }
      return query
    },
    storage: {
      from(bucket) {
        assert.equal(bucket, 'raw-private')
        return {
          async copy(source, target) {
            if (!objects.has(source) || objects.has(target)) return error('missing source or existing target')
            writes.push({ copy: target })
            objects.set(target, Buffer.from(objects.get(source)))
            return ok({})
          },
          async upload(key, bytes, options) {
            assert.equal(options.upsert, false)
            if (objects.has(key)) return error('existing target')
            writes.push({ upload: key })
            objects.set(key, Buffer.from(bytes))
            return ok({})
          },
          async download(key) {
            return objects.has(key) ? ok(new Blob([objects.get(key)])) : error('missing object')
          },
          async createSignedUrl(key, ttl, options) {
            if (!objects.has(key)) return error('missing object')
            const signedUrl = 'https://example.test/signed/' + encodeURIComponent(key)
            signing.push({ key, ttl, options, signedUrl })
            return ok({ signedUrl })
          },
          async remove(keys) {
            for (const key of keys) objects.delete(key)
            writes.push({ remove: keys })
            return ok([])
          },
        }
      },
    },
  }
  const stubs = {
    '@/lib/supabaseAdmin': { supabaseAdmin },
    '@/lib/adminAuth': { requireAdminCustomer: async () => ({ customer_id: 'synthetic-admin' }) },
    '@/lib/order-production-transition-store': { advanceOrdersToProductionAfterPdfRelease: async () => ({promotedOrderIds: []}) },
    '@/lib/story-config-server': {},
    '@/lib/locale-pricing': { normalizeCheckoutCurrency: v => v, convertUsdToCurrency: v => v },
    '@/lib/email': {
      FINAL_PDF_DELIVERY_LINK_TTL_SECONDS: 259200,
      sendOrderConfirmationEmail: async () => {},
      async sendOrderDeliveryEmail(params) {
        if (failMail.delete(params.finalJobId)) throw new Error('synthetic delivery failure')
        mail.push(params)
        return { skipped: false, event: { status: 'sent', sent_at: new Date().toISOString() } }
      },
    },
    'next/server': { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } },
  }
  const modules = new Map()
  function load(repoFile) {
    if (modules.has(repoFile)) return modules.get(repoFile).exports
    const file = path.resolve(projectRoot, repoFile)
    const code = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText
    const mod = { exports: {} }
    modules.set(repoFile, mod)
    const requireLocal = (name) => {
      if (Object.hasOwn(stubs, name)) return stubs[name]
      if (name.startsWith('@/')) return load('src/' + name.slice(2) + '.ts')
      assert.ok(!name.startsWith('.'), 'Unexpected relative runtime import: ' + name)
      return requirePackage(name)
    }
    const loadWithStubs = vm.runInThisContext(
      '(function(require, module, exports, console) { ' + code + '\n})', { filename: file },
    )
    loadWithStubs(requireLocal, mod, mod.exports, { error() {} })
    return mod.exports
  }
  const pages = load('src/lib/final-page-metadata.fixture.ts').createFinalV3Metadata()
  function addBook(finalJobId, edition, png) {
    const jobId = finalJobId + '-execution'
    const cartItemId = finalJobId + '-line'
    rows.final_jobs.push({
      final_job_id: finalJobId, job_id: jobId, order_id: orderId, cart_item_id: cartItemId,
      review_status: 'pending', status: 'review_pending', released_at: null, email_sent_at: null,
      total_pages: pages.length, pdf_path: null, creations: { templates: { name: 'Story ' + finalJobId } },
    })
    rows.jobs.push({ job_id: jobId, output_assets: { schema_version: 3, asset_layout: 'single-page', pages } })
    rows.cart_items.push({ cart_item_id: cartItemId, order_id: orderId, product_type: 'physical', package_type: edition })
    for (const page of pages) {
      const pageNumber = page.output_order + 1
      const source = 'orders/' + orderId + '/final/pages/manual/page_' + String(pageNumber).padStart(2, '0') + '_' +
        globalThis.crypto.randomUUID() + '.png'
      objects.set(source, png)
      rows.final_job_pages.push({
        final_job_id: finalJobId, final_job_page_id: finalJobId + '-page-' + page.page_index,
        page_index: page.page_index, status: 'pending_review', manual_output_path: source,
      })
    }
  }
  async function route(action, finalJobId, pageIndex, data = {}) {
    return load(adminRoute + action + '/route.ts').POST(
      { json: async () => data }, { params: Promise.resolve({ finalJobId, pageIndex }) },
    )
  }
  return { orderId, rows, objects, signing, mail, writes, failMail, addBook, route, load, supabaseAdmin }
}

async function makePng(background) {
  return sharp({ create: { width: 600, height: 600, channels: 3, background } }).png().toBuffer()
}

async function dominantPdfColors(bytes) {
  const doc = await PDFDocument.load(bytes)
  assert.equal(doc.getPageCount(), 16)
  const colors = await Promise.all(doc.getPages().map(async (page, index) => {
    const images = page.node.Resources().lookup(PDFName.of('XObject'), PDFDict).values()
    const [image] = images
    const jpeg = Buffer.from(doc.context.lookup(image, PDFRawStream).getContents())
    const { width, height } = await sharp(jpeg).metadata()
    function color(left, areaWidth) {
      return sharp(jpeg).extract({ left, top: 0, width: areaWidth, height })
        .resize(1, 1).removeAlpha().raw().toBuffer()
        .then(([r, g, b]) => r > b + 90 && r > g + 90 ? 'red' : b > r + 90 && b > g + 90 ? 'blue' : 'unexpected')
    }
    if (index === 0) return [await color(0, width)]
    const sampleWidth = Math.floor(width / 3)
    return Promise.all([color(0, sampleWidth), color(width - sampleWidth, sampleWidth)])
  }))
  return colors.flat()
}

test('interleaved Admin approvals of two books release independent, readable PDFs and edition-specific links', async () => {
  const h = makeHarness()
  h.addBook('book-a', 'basic', await makePng('#f62626'))
  h.addBook('book-b', 'supreme', await makePng('#2424f6'))
  assert.equal((await h.route('pages/[pageIndex]/approve', 'book-a', '0')).status, 200)
  assert.equal((await h.route('approve-all-pages', 'book-b')).status, 200)
  const a = await h.route('approve-all-release', 'book-a', undefined, { releaseMode: 'manual' })
  assert.equal(a.status, 200, JSON.stringify(a.body))
  const earlyABuffer = Buffer.from(h.objects.get(a.body.pdfPath))

  h.failMail.add('book-b')
  const b = await h.route('release', 'book-b', undefined, { releaseMode: 'manual' })
  assert.equal(b.status, 200, JSON.stringify(b.body))
  assert.equal(b.body.emailSentAt, null)
  assert.notEqual(a.body.pdfPath, b.body.pdfPath)
  assert.ok(h.objects.get(a.body.pdfPath).equals(earlyABuffer))
  assert.deepEqual(await dominantPdfColors(earlyABuffer), Array(31).fill('red'))
  assert.deepEqual(await dominantPdfColors(h.objects.get(b.body.pdfPath)), Array(31).fill('blue'))

  const writesBeforeRetry = h.writes.filter((entry) => entry.upload || entry.copy).length
  const retried = await h.route('release', 'book-b')
  assert.equal(retried.status, 200, JSON.stringify(retried.body))
  assert.equal(retried.body.alreadyReleased, true)
  assert.equal(retried.body.pdfPath, b.body.pdfPath)
  assert.ok(retried.body.emailSentAt)
  assert.equal((await h.route('release', 'book-a')).status, 200)
  assert.equal((await h.route('approve-all-release', 'book-a')).status, 409)
  assert.equal(h.writes.filter((entry) => entry.upload || entry.copy).length, writesBeforeRetry)
  assert.deepEqual(h.mail.map(({ finalJobId, physicalPackageType }) => [finalJobId, physicalPackageType]), [['book-a', 'basic'], ['book-b', 'supreme']])

  for (const message of h.mail) {
    const sign = h.signing.find(({ signedUrl }) => signedUrl === message.downloadUrl)
    const book = h.rows.final_jobs.find(({ final_job_id }) => final_job_id === message.finalJobId)
    const execution = h.rows.jobs.find(({ job_id }) => job_id === book.job_id)
    assert.equal(sign.key, book.pdf_path)
    assert.equal(sign.key, execution.output_assets.pdf_path)
    assert.equal(sign.ttl, 259200)
    assert.match(sign.options.download, /\.pdf$/)
  }

  // Optional local synthetic visual check; normal contract runs never write files.
  if (process.env.YMI_SYNTHETIC_PDF_DIR) {
    writeFileSync(path.join(process.env.YMI_SYNTHETIC_PDF_DIR, 'synthetic-a.pdf'), earlyABuffer)
    writeFileSync(path.join(process.env.YMI_SYNTHETIC_PDF_DIR, 'synthetic-b.pdf'), h.objects.get(b.body.pdfPath))
  }
})

test('shared historical approval or PDF addresses in a multi-book order are held with no modification or send', async () => {
  const h = makeHarness()
  const png = await makePng('#f62626')
  h.addBook('book-a', 'basic', png)
  h.addBook('book-b', 'supreme', png)
  const page = h.rows.final_job_pages[0]
  const oldApproved = 'orders/' + h.orderId + '/final/pages/approved/page_01.png'
  const oldAi = 'orders/' + h.orderId + '/final/pages/ai/attempt_001/page_01.png'
  h.objects.set(oldApproved, png)
  h.objects.set(oldAi, png)
  Object.assign(page, { status: 'approved', manual_output_path: null, ai_output_path: oldAi, approved_output_path: oldApproved, approved_source: 'ai' })

  const approval = await h.route('approve-all-pages', 'book-a')
  assert.equal(approval.status, 409)
  assert.match(approval.body.error, /may be shared/)
  const newRelease = await h.route('release', 'book-a')
  assert.equal(newRelease.status, 409)
  assert.match(newRelease.body.error, /may be shared/)
  assert.equal(h.writes.length, 0)

  const oldPdf = 'orders/' + h.orderId + '/final/pdf/final.pdf'
  const oldBytes = Buffer.from('published-legacy-fixture')
  h.objects.set(oldPdf, oldBytes)
  Object.assign(h.rows.final_jobs[0], { review_status: 'released', released_at: 'previous', pdf_path: oldPdf })
  const legacyRetry = await h.route('release', 'book-a')
  assert.equal(legacyRetry.status, 409)
  assert.match(legacyRetry.body.error, /ownership cannot be verified/)
  assert.equal(h.writes.length, 0)
  assert.equal(h.mail.length, 0)
  assert.ok(h.objects.get(oldPdf).equals(oldBytes))
  assert.ok(h.objects.get(oldApproved).equals(png))
})

test('already approved manual uploads can release once under concurrent requests, and legacy single-book delivery can reuse verified bytes', async () => {
  const h = makeHarness()
  const png = await makePng('#f62626')
  h.addBook('book-a', 'basic', png)
  for (const page of h.rows.final_job_pages) {
    Object.assign(page, { status: 'approved', approved_output_path: page.manual_output_path, approved_source: 'manual' })
  }
  const results = await Promise.all([h.route('release', 'book-a'), h.route('release', 'book-a')])
  assert.deepEqual(results.map(({ status }) => status).sort(), [200, 409])
  assert.equal(h.mail.length, 1)
  const final = h.rows.final_jobs[0]
  const assets = h.rows.jobs[0].output_assets
  const legacyPdf = 'orders/' + h.orderId + '/final/pdf/final.pdf'
  const bytes = Buffer.from(h.objects.get(final.pdf_path))
  h.objects.set(legacyPdf, bytes)
  Object.assign(final, { pdf_path: legacyPdf, email_sent_at: null })
  assets.pdf_path = legacyPdf

  const storageWrites = h.writes.filter((entry) => entry.upload || entry.copy || entry.remove).length
  const retry = await h.route('release', 'book-a')
  assert.equal(retry.status, 200, JSON.stringify(retry.body))
  assert.equal(retry.body.pdfPath, legacyPdf)
  assert.ok(h.objects.get(legacyPdf).equals(bytes))
  assert.equal(h.writes.filter((entry) => entry.upload || entry.copy || entry.remove).length, storageWrites)
})

test('new proof publishes separately and retries the confirmed note without rebuilding or changing the first PDF', async () => {
  const h = makeHarness()
  h.addBook('revision-book', 'basic', await makePng('#ff0000'))
  const id = 'revision-book'
  await h.route('approve-all-pages', id)
  const first = await h.route('release', id, undefined, { expectedRevision: 1, deliveryNote: 'First note' })
  assert.equal(first.status, 200)
  const bytes = Buffer.from(h.objects.get(first.body.pdfPath))
  const job = h.rows.final_jobs[0]
  job.proof_draft_open = true // SQL fixture separately exercises transactional reopen and the page guard.
  const page = h.rows.final_job_pages[0]
  const corrected = page.approved_output_path.replace(/[0-9a-f-]{36}\.png$/, crypto.randomUUID() + '.png')
  assert.notEqual(corrected, page.approved_output_path)
  h.objects.set(corrected, await makePng('#0000ff'))
  page.approved_output_path = corrected
  assert.equal((await h.route('release', id, undefined, { expectedRevision: 1 })).status, 409)
  h.failMail.add(id)
  const second = await h.route('release', id, undefined, { expectedRevision: 2, deliveryNote: 'We corrected the cover.' })
  assert.equal(second.status, 200, JSON.stringify(second.body))
  assert.equal(second.body.emailSentAt, null)
  assert.notEqual(second.body.pdfPath, first.body.pdfPath)
  const retry = await h.route('release', id, undefined, { expectedRevision: 2, deliveryNote: 'Wrong retry note' })
  assert.equal(retry.status, 200)
  assert.equal(retry.body.pdfPath, second.body.pdfPath)
  assert.ok(retry.body.emailSentAt)
  assert.deepEqual(h.mail.map(x => [x.proofRevision,x.deliveryNote]), [[1,'First note'],[2,'We corrected the cover.']])
  assert.ok(h.objects.get(first.body.pdfPath).equals(bytes))
  assert.equal((await dominantPdfColors(h.objects.get(second.body.pdfPath)))[0], 'blue')
})

test('54 hours starts at confirmed delivery of the current proof and stops for corrections or print', () => {
  const js = ts.transpileModule(readFileSync(path.join(projectRoot,'src/lib/proof-review-clock.ts'),'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS }
  }).outputText
  const output = {}
  vm.runInNewContext(js, { exports: output })
  const start = Date.UTC(2026,10,1)
  const h = 3_600_000
  const job = { released_at: new Date(start - h).toISOString(), email_sent_at: new Date(start).toISOString(), print_status:'pending' }
  assert.match(output.proofReviewLabel(job,start + 48*h), /6h left/)
  assert.match(output.proofReviewLabel(job,start + 54*h), /due now/)
  assert.match(output.proofReviewLabel(job,start + 56*h), /2h overdue/)
  assert.match(output.proofReviewLabel({...job,email_sent_at:null},start + 57*h), /delivery/)
  assert.match(output.proofReviewLabel({...job,proof_draft_open:true},start + 57*h), /Corrections/)
  assert.equal(output.proofReviewLabel({...job,print_status:'released'},start + 57*h),null)
})

for (const format of ['digital', 'basic', 'supreme']) {
  test(`original ${format}: verified artwork, payment replay and manual PDF delivery`, async () => {
    const h = makeHarness()
    const line = randomUUID()
    const job = randomUUID()
    h.addBook(job, format, await makePng('#111111'))
    h.rows.jobs[0].input_snapshot = { original_source_version: 'test-v1' }
    const final = h.rows.final_jobs[0]
    final.cart_item_id = line
    Object.assign(h.rows.orders[0], { order_status: 'unpaid', payment_id: randomUUID() })
    Object.assign(h.rows.cart_items[0], { cart_item_id: line, product_type: format === 'digital' ? 'ebook' : 'physical', status: 'ordered',
      creations: { template_id: 'story', customize_snapshot: { edition: 'original' } } })
    h.rows.final_job_pages.length = 0
    const actualRelease = h.supabaseAdmin.rpc.bind(h.supabaseAdmin)
    const red = await makePng('#ff0000')
    const blue = await makePng('#0000ff')
    const hash = bytes => createHash('sha256').update(bytes).digest('hex')
    const hashes = Array.from({ length: 31 }, (_, i) => hash(i < 4 ? red : blue))
    const source = digest => 'original-editions/' + digest + '.png'
    h.objects.set(source(hash(red)), red)
    let prepared = false
    h.supabaseAdmin.rpc = async (name, args) => {
      if (name !== 'prepare_original_book_final') return actualRelease(name, args)
      assert.equal(args.p_line, line)
      assert.equal(args.p_order, h.orderId)
      if (args.p_verified_hashes) {
        assert.deepEqual(args.p_verified_hashes, hashes)
        for (const page of h.rows.jobs[0].output_assets.pages) {
          const dest = 'orders/' + h.orderId + '/final/books/' + job + '/pages/manual/page_' +
            String(page.page_index).padStart(2, '0') + '_' + line + '.png'
          assert.equal(hash(h.objects.get(dest)), hashes[page.page_index])
          const digital = format === 'digital'
          h.rows.final_job_pages.push({ final_job_id: job, final_job_page_id: randomUUID(), page_index: page.page_index,
            status: digital ? 'approved' : 'pending_review', approved_source: digital ? 'manual' : null,
            manual_output_path: dest, approved_output_path: digital ? dest : null })
        }
        prepared = true
      }
      return { data: { prepared, finalJobId: job, hashes }, error: null }
    }
    const prepare = () => h.load('src/lib/orderFulfillment.ts').finalizeOrderPayment({
      orderId: h.orderId, customerId: 'customer', email: 'customer@example.test', provider:'stripe', amount: 12,
    })
    await assert.rejects(prepare(), /missing at page/)
    h.objects.set(source(hash(blue)), red)
    await assert.rejects(prepare(), /digest mismatch/)
    assert.equal(h.rows.final_job_pages.length, 0)
    assert.equal(h.mail.length, 0)
    h.objects.set(source(hash(blue)), blue)
    assert.equal((await prepare()).status, 'paid')
    assert.equal(h.rows.final_job_pages.length, 31)
    assert.equal(h.mail.length, 0)
    const writes = h.writes.filter(entry => entry.upload).length
    assert.equal((await prepare()).status, 'paid')
    assert.equal(h.writes.filter(entry => entry.upload).length, writes)
    assert.equal((await h.route('release', job, undefined, { releaseMode: 'job_auto' })).status, 409)
    assert.equal(h.writes.filter(entry => entry.upload).length, writes)
    if (format !== 'digital') {
      assert.notEqual((await h.route('release', job)).status, 200)
      assert.equal(h.mail.length, 0)
      assert.equal((await h.route('approve-all-pages', job)).status, 200)
    }
    const released = await h.route('release', job, undefined, { releaseMode: 'manual' })
    assert.equal(released.status, 200, JSON.stringify(released.body))
    const pdf = h.objects.get(released.body.pdfPath)
    assert.equal((await PDFDocument.load(pdf)).getPageCount(), 16)
    assert.deepEqual(await dominantPdfColors(pdf), hashes.map(digest => digest === hash(red) ? 'red' : 'blue'))
    assert.equal(h.mail.length, 1)
    assert.equal(h.mail[0].finalJobId, job)
    assert.equal(h.mail[0].physicalPackageType, format === 'digital' ? null : format)
    assert.equal((await h.route('release', job)).body.alreadyReleased, true)
    assert.equal(h.mail.length, 1)
  })
}
