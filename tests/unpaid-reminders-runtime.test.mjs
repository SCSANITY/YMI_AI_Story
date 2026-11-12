import assert from 'node:assert/strict'
import { createHash, createHmac } from 'node:crypto'
import test from 'node:test'
import * as qstash from '@upstash/qstash'
import { loadUi } from './helpers/preview-uiux-harness.mjs'

const { processUnpaidReminder, reminderDueAt } = loadUi('src/lib/unpaid-reminders.ts')
const orderId = '10000000-0000-4000-8000-000000000001'
const createdAt = '2026-11-12T00:00:00.000Z'
const startAt = Date.parse(createdAt)
const callbackUrl = 'https://example.test/api/internal/reminders/unpaid'

function harness({ orderPatch = {}, send = 'sent', failDispatch = false } = {}) {
  const order = { order_id: orderId, created_at: createdAt, order_status: 'unpaid', payment_id: null, ...orderPatch }
  const calls = []
  const make = stage => ({ order_id: orderId, stage, due_at: new Date(reminderDueAt(createdAt, stage)).toISOString(), completed_at: null })
  const tasks = new Map([[1, make(1)]])
  const deps = {
    async loadTask(job) { calls.push(['task', job.orderId, job.stage]); return tasks.get(job.stage) },
    async loadOrder(id) { calls.push(['order', id]); return order },
    async ensureTask(job, due) { calls.push(['next', job.stage, due]); if (!tasks.has(job.stage)) tasks.set(job.stage, make(job.stage)); return tasks.get(job.stage) },
    async dispatch(task) { calls.push(['dispatch', task.stage]); if (failDispatch) throw Error('queue unavailable') },
    async complete(task, now) { calls.push(['complete', task.stage]); tasks.set(task.stage, { ...task, completed_at: now }) },
    async send(_order, stage) { calls.push(['send', stage]); return send },
  }
  const run = (stage, now = reminderDueAt(createdAt, stage), cutoff = startAt) =>
    processUnpaidReminder({ orderId, stage }, cutoff, now, deps)
  return { calls, tasks, run }
}

test('dispatches only the next stage at absolute 30-minute, 1-day and 6-day offsets', async () => {
  const h = harness()
  assert.equal(reminderDueAt(createdAt, 1) - startAt, 30 * 60_000)
  assert.equal(await h.run(1), 'sent')
  assert.equal(await h.run(2, reminderDueAt(createdAt, 2) + 30_000), 'sent')
  assert.equal(await h.run(3), 'sent')
  assert.deepEqual(h.calls.filter(([kind]) => kind === 'next'), [
    ['next', 2, '2026-11-13T00:00:00.000Z'],
    ['next', 3, '2026-11-18T00:00:00.000Z'],
  ])
  assert.deepEqual(h.calls.filter(([kind]) => kind === 'send'), [['send', 1], ['send', 2], ['send', 3]])
})

test('duplicate, missing, paid and pre-cutover tasks do not send or enqueue', async () => {
  const h = harness()
  assert.equal(await h.run(2), 'duplicate')
  assert.deepEqual(h.calls, [['task', orderId, 2]])
  assert.equal(await h.run(1, reminderDueAt(createdAt, 1), startAt + 1), 'closed')
  assert.equal(await h.run(1), 'duplicate')
  for (const orderPatch of [{ order_status: 'paid' }, { payment_id: orderId }]) {
    const paid = harness({ orderPatch })
    assert.equal(await paid.run(1), 'closed')
    assert.deepEqual(paid.calls.map(([kind]) => kind), ['task', 'order', 'complete'])
  }
})

test('an early delivery never sends; an overdue first callback skips to the latest due stage', async () => {
  const h = harness()
  await assert.rejects(h.run(1, reminderDueAt(createdAt, 1) - 1), /before its due/)
  assert.equal(await h.run(1, reminderDueAt(createdAt, 3)), 'superseded')
  assert.equal(await h.run(3), 'sent')
  assert.deepEqual(h.calls.filter(([kind]) => kind === 'send'), [['send', 3]])
  assert.deepEqual(h.calls.filter(([kind]) => kind === 'dispatch'), [['dispatch', 3]])
})

test('paid during preparation stops the sequence; failed dispatch leaves durable next stage', async () => {
  const closed = harness({ send: 'closed' })
  assert.equal(await closed.run(1), 'closed')
  assert.equal(closed.tasks.size, 1)
  const retry = harness({ failDispatch: true })
  await assert.rejects(retry.run(1), /queue unavailable/)
  assert.equal(retry.tasks.get(1).completed_at, null)
  assert.equal(retry.tasks.get(2).due_at, '2026-11-13T00:00:00.000Z')
})

function signed(body, key, url = callbackUrl) {
  const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  const header = b64({ alg: 'HS256', typ: 'JWT' })
  const claims = b64({
    iss: 'Upstash', sub: url, exp: Math.floor(Date.now() / 1000) + 60,
    body: createHash('sha256').update(body).digest('base64url'),
  })
  const message = header + '.' + claims
  return message + '.' + createHmac('sha256', key).update(message).digest('base64url')
}

test('real SDK verifies signature and body before any database work', async () => {
  const key = 'fixture-current-signing-key'
  const nextKey = 'fixture-next-signing-key'
  const body = JSON.stringify({ orderId, stage: 1 })
  let tableReads = 0
  const chain = {
    select() { return this }, eq() { return this },
    async maybeSingle() { return { data: { completed_at: createdAt }, error: null } },
  }
  const { POST } = loadUi('app/api/internal/reminders/unpaid/route.ts', {
    'next/server': { NextResponse: { json: Response.json } },
    'server-only': {},
    '@upstash/qstash': qstash,
    '@/lib/email': {},
    '@/lib/orderFulfillment': {},
    '@/lib/supabaseAdmin': { supabaseAdmin: { from(table) { assert.equal(table, 'order_reminder_tasks'); tableReads++; return chain } } },
  }, { URL, process: { env: {
    QSTASH_TOKEN: 'fixture-token', QSTASH_CURRENT_SIGNING_KEY: key, QSTASH_NEXT_SIGNING_KEY: nextKey,
    UNPAID_REMINDER_START_AT: createdAt, UNPAID_REMINDER_CALLBACK_URL: callbackUrl,
  } } })
  const request = (raw, signature) => new Request(callbackUrl, {
    method: 'POST', body: raw, headers: signature ? { 'Upstash-Signature': signature } : {},
  })
  assert.equal((await POST(request(body))).status, 401)
  assert.equal((await POST(request(body, signed(body, 'wrong-key')))).status, 401)
  assert.equal((await POST(request(body.replace('1}', '2}'), signed(body, key)))).status, 401)
  assert.equal((await POST(request(body, signed(body, key, 'https://wrong.example/callback')))).status, 401)
  assert.equal(tableReads, 0)
  for (const signingKey of [key, nextKey]) {
    const response = await POST(request(body, signed(body, signingKey)))
    assert.equal(response.status, 200)
    assert.equal((await response.json()).outcome, 'duplicate')
  }
  assert.equal(tableReads, 2)
})

test('idle recovery stays in the indexed outbox and takes one bounded page', async () => {
  const calls = []
  const chain = {
    select(...args) { calls.push(['select', ...args]); return this },
    is(...args) { calls.push(['is', ...args]); return this },
    lte(...args) { calls.push(['lte', ...args]); return this },
    order(...args) { calls.push(['order', ...args]); return this },
    async limit(...args) { calls.push(['limit', ...args]); return { data: [], error: null } },
  }
  const env = {
    QSTASH_TOKEN: 'fixture-token', QSTASH_CURRENT_SIGNING_KEY: 'current', QSTASH_NEXT_SIGNING_KEY: 'next',
    UNPAID_REMINDER_START_AT: createdAt, UNPAID_REMINDER_CALLBACK_URL: callbackUrl,
  }
  const { recoverUnpaidReminders } = loadUi('src/lib/unpaid-reminder-server.ts', {
    'server-only': {},
    '@upstash/qstash': qstash,
    '@/lib/email': {},
    '@/lib/orderFulfillment': {},
    '@/lib/supabaseAdmin': { supabaseAdmin: { from(table) { calls.push(['from', table]); return chain } } },
  }, { URL, process: { env } })
  const result = await recoverUnpaidReminders()
  assert.equal(result.considered, 0)
  assert.equal(result.failed, 0)
  assert.deepEqual(calls.filter(([op]) => op === 'from' || op === 'is' || op === 'limit'), [
    ['from', 'order_reminder_tasks'], ['is', 'completed_at', null], ['limit', 25],
  ])
  assert.deepEqual(calls.filter(([op]) => op === 'order').map(([, col]) => col), ['recovery_at', 'order_id', 'stage'])
  delete env.QSTASH_TOKEN
  calls.length = 0
  assert.equal((await recoverUnpaidReminders()).considered, 0)
  assert.deepEqual(calls, [])
})

test('a rejected publish leaves the same task recoverable; the next dispatch is capped and minimal', async () => {
  const dueAt = new Date(Date.now() + 10 * 60_000).toISOString()
  const task = {
    order_id: orderId, stage: 1, due_at: dueAt,
    recovery_at: createdAt, dispatched_at: null, completed_at: null,
  }
  const providerCalls = []
  const writes = []
  const config = {
    QSTASH_TOKEN: 'fixture-token', QSTASH_CURRENT_SIGNING_KEY: 'current', QSTASH_NEXT_SIGNING_KEY: 'next',
    UNPAID_REMINDER_START_AT: createdAt, UNPAID_REMINDER_CALLBACK_URL: callbackUrl,
  }
  const supabaseAdmin = {
    rpc(name, args) {
      assert.equal(name, 'register_order_reminder')
      assert.equal(args.p_order_id, orderId)
      assert.equal(args.p_start_at, createdAt)
      return { maybeSingle: async () => ({ data: { ...task }, error: null }) }
    },
    from(table) {
      assert.equal(table, 'order_reminder_tasks')
      return {
        update(update) { writes.push(update); return this },
        eq() { return this }, is() { return this }, select() { return this },
        async maybeSingle() { return { data: { order_id: orderId }, error: null } },
        then(resolve) { return resolve({ data: null, error: null }) },
      }
    },
  }
  const { registerUnpaidReminder } = loadUi('src/lib/unpaid-reminder-server.ts', {
    'server-only': {},
    '@upstash/qstash': { Client: class {
      constructor(options) { assert.equal(options.baseUrl, 'https://qstash-us-east-1.upstash.io') }
      async publishJSON(input) {
        providerCalls.push(input)
        if (providerCalls.length === 1) throw Error('fixture rate limit')
      }
    } },
    '@/lib/email': {},
    '@/lib/orderFulfillment': {},
    '@/lib/supabaseAdmin': { supabaseAdmin },
  }, { URL, process: { env: config } })
  const dispatch = await registerUnpaidReminder(orderId)
  assert.equal(providerCalls.length, 0)
  await assert.rejects(dispatch(), /did not accept/)
  assert.equal(writes.length, 2)
  assert.equal(writes[1].dispatched_at, undefined)
  await (await registerUnpaidReminder(orderId))()
  assert.ok(writes[3].dispatched_at)
  assert.equal(providerCalls[0].deduplicationId, providerCalls[1].deduplicationId)
  assert.equal(providerCalls[1].notBefore, Math.ceil(Date.parse(dueAt) / 1000))
  assert.equal(providerCalls[1].flowControl.parallelism, 1)
  assert.equal(providerCalls[1].flowControl.rate, 6)
  assert.deepEqual(JSON.parse(JSON.stringify(providerCalls[1].body)), { orderId, stage: 1 })
})
