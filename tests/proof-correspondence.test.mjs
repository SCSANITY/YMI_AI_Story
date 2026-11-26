import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import vm from 'node:vm'

const jobId = '0157a039-c32b-4220-ac9f-000000000001'
const orderId = '0157a039-c32b-4220-ac9f-000000000002'
const itemId = '0157a039-c32b-4220-ac9f-000000000003'
const threadId = '0157a039-c32b-4220-ac9f-000000000004'
const recipient = 'buyer@example.test'
const sentAt = '2026-11-23T00:00:00Z'
const source = {
  final_job_id: jobId,
  order_id: orderId,
  cart_item_id: itemId,
  proof_revision: 2,
  released_at: sentAt,
  email_sent_at: sentAt,
  pdf_only: false,
  proof_draft_open: false,
  print_released_at: null,
  print_status: 'pending',
}

function harness({ admin = true, job = source, email = recipient, mailbox = 'delivery' } = {}) {
  const writes = [],
    queries = []
  const threads = [
    {
      thread_id: threadId,
      thread: { subject: 'New question' },
      created_at: sentAt,
      body_text: 'Please change page 3',
    },
  ]
  const detail = {
    mailboxKey: mailbox,
    messages: [
      { direction: 'inbound', from: recipient, bodyText: 'Mine' },
      { direction: 'outbound', to: [recipient], state: 'sent', bodyText: 'Our reply' },
      { direction: 'outbound', to: [recipient], state: 'draft', bodyText: 'Private draft' },
      { direction: 'inbound', from: 'another@example.test', bodyText: 'Someone else' },
    ],
  }
  function from(table) {
    const filters = {}
    queries.push({ table, filters })
    return {
      select() {
        return this
      },
      eq(key, val) {
        filters[key] = val
        return this
      },
      order() {
        return this
      },
      range() {
        return { data: threads, error: null }
      },
      maybeSingle() {
        return { data: table === 'final_jobs' ? job : email ? { to_email: email } : null, error: null }
      },
    }
  }
  function load(file, deps) {
    const js = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText
    const exports = {}
    vm.runInNewContext(js, {
      exports,
      URL,
      require: (key) => {
        if (!(key in deps)) throw Error(key)
        return deps[key]
      },
    })
    return exports
  }
  const support = {
    normalizeSupportEmail: (v) => v?.toLowerCase() ?? null,
    isUuid: (v) => typeof v === 'string' && v.length === 36,
  }
  const helpers = load('src/lib/proof-correspondence.ts', { '@/lib/support-ticket': support })
  const route = load('app/api/admin/final-jobs/[finalJobId]/replies/route.ts', {
    '@/lib/adminAuth': { requireAdminCustomer: async () => (admin ? { customer_id: 'staff' } : null) },
    '@/lib/supabaseAdmin': { supabaseAdmin: { from } },
    '@/lib/support-ticket': support,
    '@/lib/http-response': { noStoreJson: (body, status = 200) => ({ body, status }) },
    '@/lib/general-mail-server': {
      loadGeneralMailThreadDetail: async () => detail,
      createGeneralMailReply: async (p) => {
        writes.push(p)
        return {}
      },
    },
    '@/lib/proof-review-clock': load('src/lib/proof-review-clock.ts', {}),
    '@/lib/proof-correspondence': helpers,
    '@/lib/general-mail-api': {},
    '@/lib/general-mail-content': { normalizeGeneralMailContent: (p) => p },
  })
  const call = (extra = '', method = 'GET') =>
    route[method](
      {
        method,
        url: 'https://example.test/?order=' + orderId + '&item=' + itemId + '&revision=2' + extra,
        json: async () => ({
          requestId: itemId,
          message: 'Thanks',
          recipient: 'wrong@example.test',
          mode: 'reply_all',
        }),
      },
      { params: Promise.resolve({ finalJobId: jobId }) },
    )
  return { writes, queries, call }
}
test('current sent revision scopes new and existing conversations by exact sender and Delivery mailbox', async () => {
  const h = harness(),
    result = await h.call()
  assert.equal(result.status, 200)
  assert.equal(result.body.threads[0].subject, 'New question')
  assert.deepEqual(
    h.queries.map((q) => q.filters),
    [
      { final_job_id: jobId, order_id: orderId, cart_item_id: itemId },
      {
        idempotency_key: 'final_delivery:' + jobId + ':rev:2',
        email_key: 'final_delivery',
        final_job_id: jobId,
        order_id: orderId,
        status: 'sent',
      },
      { direction: 'inbound', from_address: recipient, 'thread.mailbox_key': 'delivery' },
    ],
  )
  assert.equal(h.writes.length, 0)
})
test('reader omits other participants and drafts; changed latest sender disables reply', async () => {
  const r = await harness().call('&thread=' + threadId)
  assert.equal(r.body.canReply, false)
  assert.deepEqual(
    Array.from(r.body.messages, (m) => m.bodyText),
    ['Mine', 'Our reply'],
  )
  assert.equal((await harness({ mailbox: 'hello' }).call('&thread=' + threadId)).status, 404)
})
test('no Inbox lookup or send on stale revision, draft, PDF only, printed book or missing delivery recipient', async () => {
  for (const patch of [
    { proof_revision: 3 },
    { proof_draft_open: true },
    { pdf_only: true },
    { print_status: 'released' },
    { email_sent_at: null },
  ]) {
    const h = harness({ job: { ...source, ...patch } })
    assert.equal((await h.call('&thread=' + threadId, 'POST')).status, 409)
    assert.equal(h.queries.length, 1)
    assert.equal(h.writes.length, 0)
  }
  const h = harness({ email: null })
  assert.equal((await h.call()).status, 409)
  assert.equal(h.queries.length, 2)
  const denied = harness({ admin: false })
  assert.equal((await denied.call()).status, 403)
  assert.equal(denied.queries.length, 0)
})
test('reply sender uses frozen delivery address, single-recipient mode and caller request ID', async () => {
  const h = harness()
  assert.equal((await h.call('&thread=' + threadId, 'POST')).status, 200)
  assert.equal(h.writes[0].expectedDeliveryRecipient, recipient)
  assert.equal(h.writes[0].replyAll, false)
  assert.equal(h.writes[0].messageId, itemId)
})

test('the Inbox sender rejects a changed sender or mailbox before creating or sending a draft', async () => {
  for (const [mailbox, actual] of [
    ['hello', recipient],
    ['delivery', 'someone@example.test'],
  ]) {
    const tables = []
    const server = {}
    const deps = {
      '@/lib/general-inbox-mailboxes': { isGeneralMailboxKey: () => true },
      '@/lib/general-mail': {
        buildGeneralMailReplyEnvelope: ({ source }) => ({ to: [source.fromAddress], cc: [] }),
      },
      '@/lib/email': {},
      '@/lib/general-mail-attachments': {},
      '@/lib/supabaseAdmin': {
        supabaseAdmin: {
          from(table) {
            tables.push(table)
            return {
              select() {
                return this
              },
              eq() {
                return this
              },
              order() {
                return this
              },
              limit() {
                return this
              },
              maybeSingle() {
                return {
                  data:
                    table === 'general_mail_threads'
                      ? { mailbox_key: mailbox, subject: 'Test' }
                      : { from_address: actual },
                }
              },
            }
          },
        },
      },
    }
    vm.runInNewContext(
      ts.transpileModule(readFileSync('src/lib/general-mail-server.ts', 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
      }).outputText,
      {
        exports: server,
        require: (key) => {
          if (!(key in deps)) throw Error(key)
          return deps[key]
        },
      },
    )
    await assert.rejects(
      server.createGeneralMailReply({
        threadId,
        messageId: itemId,
        adminCustomerId: jobId,
        expectedDeliveryRecipient: recipient,
        replyAll: false,
        content: { bodyText: 'Thanks' },
      }),
      /recipient_conflict/,
    )
    assert.deepEqual(tables, ['general_mail_threads', 'general_mail_messages'])
  }
})
