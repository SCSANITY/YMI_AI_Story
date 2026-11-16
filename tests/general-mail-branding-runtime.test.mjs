import assert from 'node:assert/strict'
import test from 'node:test'
import * as reactEmail from '@react-email/components'
import { render } from '@react-email/render'
import * as reactJsx from 'react/jsx-runtime'
import { loadUi } from './helpers/preview-uiux-harness.mjs'

const firstSendKey = 'general_mail_message:synthetic-message'
const oldTimestamp = '2026-01-01T00:00:00.000Z'
const input = {
  messageId: 'synthetic-message',
  mailboxKey: 'amy',
  to: ['reader@example.test'],
  cc: ['cc@example.test'],
  bcc: ['bcc@example.test'],
  subject: 'Re: A note about your book',
  bodyText: 'Hi Sophie,\n\nSee the preview. <script>keep this as text</script>\n\nWarmly,\nAmy',
  bodyHtml: '<p>Previously rendered HTML</p>',
  bodyDocument: {
    version: 1,
    blocks: [
      { type: 'paragraph', content: [{ text: 'Hi Sophie,' }] },
      { type: 'paragraph', content: [
        { text: 'See the preview', href: 'https://example.test/preview?x=1&y=2', marks: ['bold'] },
        { text: '. <script>keep this as text</script>' },
      ] },
      { type: 'paragraph', content: [{ text: 'Warmly,\nAmy' }] },
    ],
  },
  attachments: [{ content: Buffer.from('fixture-pdf'), filename: 'preview.pdf', contentType: 'application/pdf' }],
  inReplyTo: '<first@example.test>',
  references: '<root@example.test> <first@example.test>',
}

function setup({ status, context, failsAfterAccept = false } = {}) {
  let event = status ? {
    email_event_id: 'mail-event', idempotency_key: firstSendKey, status,
    context, created_at: oldTimestamp, updated_at: oldTimestamp, resend_message_id: 'provider-message',
  } : null
  const sent = []
  const providerRequests = new Map()
  const templates = [
    'OtpEmail', 'OrderReceiptEmail', 'DeliveryEmail', 'CartReminderEmail', 'AbandonmentEmail',
    'LogisticsUpdateEmail', 'SupportReplyEmail', 'KolPartnershipEmail', 'NewsletterConfirmationEmail',
  ]
  const stub = new Proxy({}, { get: () => () => null })
  const send = loadUi('src/lib/email.tsx', {
    ...Object.fromEntries(templates.map(name => ['@/components/emails/' + name, stub])),
    '@react-email/components': reactEmail,
    'react/jsx-runtime': reactJsx,
    '@/lib/order-materials-client': {},
    '@/lib/order-materials-server': {},
    '@/lib/package-pricing': {},
    '@/lib/seo': {},
    '@/lib/locale-pricing': {},
    '@/lib/general-inbox-mailboxes': { getGeneralMailboxDefinition: () => ({ senderEnvName: 'EMAIL_FROM_AMY' }) },
    '@/lib/general-mail': { getGeneralMailPrimaryAddress: () => 'reply-amy@example.test' },
    '@/lib/support-inbound': { normalizeInternetMessageId: value => value },
    '@/lib/supabaseAdmin': { supabaseAdmin: { from(table) {
      assert.equal(table, 'email_events')
      let patch
      const filters = []
      const updateIfMatching = () => {
        if (!event || !filters.every(([key, value]) => event[key] === value)) return null
        if (patch) Object.assign(event, structuredClone(patch))
        return structuredClone(event)
      }
      const query = {
        select: () => query,
        eq: (key, value) => { filters.push([key, value]); return query },
        insert: payload => ({ select: () => ({ single: async () => {
          if (event) return { error: { code: '23505' } }
          event = { ...structuredClone(payload), email_event_id: 'mail-event', created_at: payload.updated_at }
          return { data: structuredClone(event) }
        } }) }),
        update: payload => { patch = payload; return query },
        maybeSingle: async () => ({ data: updateIfMatching() }),
        then: resolve => resolve({ data: updateIfMatching() }),
      }
      return query
    } } },
    resend: { Resend: class {
      emails = {
        send: async (payload, options) => {
          const { react, ...rest } = payload
          const request = { ...rest, html: react ? await render(react) : rest.html }
          const key = options.idempotencyKey
          sent.push({ request, key })
          if (providerRequests.has(key)) assert.deepEqual(request, providerRequests.get(key), 'retry payload drift')
          providerRequests.set(key, request)
          if (failsAfterAccept) {
            failsAfterAccept = false
            throw new Error('connection dropped after provider accepted')
          }
          return { data: { id: 'provider-message' } }
        },
        get: async () => ({ data: { message_id: '<provider@example.test>', last_event: 'sent' } }),
      }
    } },
  }, { URL, process: { env: { RESEND_API_KEY: 'fixture', EMAIL_FROM_AMY: 'Amy <amy@example.test>' } } }).sendGeneralMailboxMessage
  return { send, sent, readEvent: () => event }
}

test('Admin Inbox stationery wraps approved rich text and leaves the outgoing envelope intact', async () => {
  const { send, sent, readEvent } = setup()
  const result = await send(input)
  const { request, key } = sent[0]
  assert.equal(result.internetMessageId, '<provider@example.test>')
  assert.equal(key, firstSendKey)
  assert.equal(readEvent().context.generalMailLayout, 'stationery-v1')
  for (const field of ['subject', 'to', 'cc', 'bcc', 'attachments']) assert.deepEqual(request[field], input[field], field)
  assert.equal(request.text, input.bodyText)
  assert.equal(request.from, 'Amy <amy@example.test>')
  assert.equal(request.replyTo, 'reply-amy@example.test')
  assert.deepEqual({ ...request.headers }, { 'In-Reply-To': input.inReplyTo, References: input.references })
  assert.match(request.html, /banner\.png/)
  assert.match(request.html, /logo-full\.png/)
  assert.match(request.html, /background-image:url\([^)]*texture\.jpg\)/)
  assert.match(request.html, /ym-letter-body[\s\S]*href="https:\/\/example\.test\/preview\?x=1&amp;y=2"[\s\S]*<strong>See the preview<\/strong>/)
  assert.match(request.html, /ym-letter-body[\s\S]*Warmly,<br\/?>Amy[\s\S]*ym-letter-seal[\s\S]*seal\.png/)
  assert.match(request.html, /&lt;script&gt;keep this as text&lt;\/script&gt;/)
  assert.doesNotMatch(request.html, /<script>|class="ym-title"|Previously rendered HTML/)
  assert.equal((await send(input)).skipped, true)
  assert.equal(sent.length, 1)
})

test('older unsent draft without a rich document renders from safe plain text', async () => {
  const { send, sent } = setup()
  await send({ ...input, bodyDocument: null, inReplyTo: null, references: null })
  assert.match(sent[0].request.html, /ym-letter-body[\s\S]*Hi Sophie,[\s\S]*&lt;script&gt;[\s\S]*seal\.png/)
  assert.doesNotMatch(sent[0].request.html, /<script>|Previously rendered HTML/)
  assert.equal(sent[0].request.headers, undefined)
})

test('pre-release failed and stale pending sends retry their original HTML and provider key', async () => {
  for (const status of ['failed', 'pending']) {
    const { send, sent, readEvent } = setup({ status, context: { previous: 'event context' } })
    await send(input)
    assert.equal(sent.length, 1)
    assert.equal(sent[0].key, firstSendKey)
    assert.equal(sent[0].request.html, input.bodyHtml)
    assert.deepEqual(readEvent().context, { previous: 'event context' })
  }
})

test('branded attempt after a lost provider response reuses identical HTML and key', async () => {
  const { send, sent, readEvent } = setup({ failsAfterAccept: true })
  await assert.rejects(send(input), /connection dropped/)
  assert.equal(readEvent().status, 'failed')
  await send(input)
  assert.equal(sent.length, 2)
  assert.equal(sent[0].key, sent[1].key)
  assert.equal(sent[0].request.html, sent[1].request.html)
  assert.equal(readEvent().status, 'sent')
})
