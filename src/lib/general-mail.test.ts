import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildGeneralMailReferenceCandidates,
  buildGeneralMailReplyEnvelope,
  normalizeGeneralMailDraftInput,
  normalizeGeneralMailRecipients,
} from './general-mail'
import {
  normalizeGeneralMailContent,
  normalizeGeneralMailDocument,
} from './general-mail-content'
import {
  mergeGeneralMailThreadRefresh,
  type GeneralMailThreadSummary,
} from './general-mail-workspace'

function threadSummary(index: number, subject = `Thread ${index}`): GeneralMailThreadSummary {
  return {
    threadId: `thread-${index}`,
    mailboxKey: 'admin',
    subject,
    latestMessageAt: new Date(index * 1000).toISOString(),
    lastInboundAt: null,
    lastOutboundAt: null,
    adminReadAt: null,
    archivedAt: null,
    latestDirection: 'outbound',
    latestState: 'sent',
    latestFrom: 'admin@ymistory.com',
    latestTo: ['customer@example.com'],
    preview: subject,
    attachmentCount: 0,
  }
}

test('General mail silent refresh updates page one without collapsing loaded pages', () => {
  const loaded = Array.from({ length: 100 }, (_, index) => threadSummary(index + 1))
  const refreshedFirstPage = Array.from(
    { length: 50 },
    (_, index) => threadSummary(index + 1, `Updated ${index + 1}`)
  )

  const refreshed = mergeGeneralMailThreadRefresh(loaded, refreshedFirstPage)

  assert.equal(refreshed.length, 100)
  assert.equal(refreshed[0].subject, 'Updated 1')
  assert.equal(refreshed[49].subject, 'Updated 50')
  assert.equal(refreshed[50].threadId, 'thread-51')
  assert.equal(new Set(refreshed.map((thread) => thread.threadId)).size, 100)
})

test('General mail draft input keeps fixed mailbox identity and normalized recipient groups', () => {
  assert.deepEqual(
    normalizeGeneralMailDraftInput({
      mailboxKey: 'orders',
      to: [' Customer@Example.com ', 'customer@example.com'],
      cc: ['team@example.com', 'customer@example.com'],
      bcc: ['audit@example.com', 'team@example.com'],
      subject: 'Order\r\nBcc: attacker@example.com',
      bodyText: 'Hello\r\nworld',
    }),
    {
      mailboxKey: 'orders',
      to: ['customer@example.com'],
      cc: ['team@example.com'],
      bcc: ['audit@example.com'],
      subject: 'Order Bcc: attacker@example.com',
      bodyText: 'Hello\nworld',
      bodyHtml: '<p>Hello<br>world</p>',
      bodyDocument: {
        version: 1,
        blocks: [{ type: 'paragraph', content: [{ text: 'Hello\nworld' }] }],
      },
    }
  )
  assert.throws(() => normalizeGeneralMailDraftInput({ mailboxKey: 'support' }), /Invalid mailbox/)
  assert.throws(
    () => normalizeGeneralMailRecipients({ to: ['bad-address'], requireTo: true }),
    /invalid email/
  )
})

test('General mail rich text is allowlisted and generates the plain-text alternative', () => {
  const content = normalizeGeneralMailContent({
    bodyDocument: {
      version: 1,
      blocks: [
        {
          type: 'heading',
          content: [{ text: 'Hello <script>', marks: ['bold'] }],
        },
        {
          type: 'bulletList',
          items: [
            [{ text: 'Open YMI', href: 'https://ymistory.com/books?from=mail' }],
            [{ text: 'Second item', marks: ['italic', 'underline'] }],
          ],
        },
      ],
    },
  })
  assert.equal(
    content.bodyText,
    'Hello <script>\n\n- Open YMI\n- Second item'
  )
  assert.doesNotMatch(content.bodyHtml, /<script>/)
  assert.match(content.bodyHtml, /Hello &lt;script&gt;/)
  assert.match(content.bodyHtml, /rel="noopener noreferrer nofollow"/)
  assert.match(content.bodyHtml, /<em><u>|<u><em>/)
})

test('General mail rich text rejects arbitrary HTML fields and unsafe links', () => {
  assert.throws(
    () => normalizeGeneralMailDocument({
      version: 1,
      blocks: [{ type: 'paragraph', content: [{ text: 'x', html: '<img src=x>' }] }],
    }),
    /unsupported fields/
  )
  assert.throws(
    () => normalizeGeneralMailDocument({
      version: 1,
      blocks: [{ type: 'paragraph', content: [{ text: 'x', href: 'javascript:alert(1)' }] }],
    }),
    /safe HTTP or HTTPS/
  )
})

test('General mail reference candidates prefer direct parent then newest references', () => {
  assert.deepEqual(
    buildGeneralMailReferenceCandidates(
      '<reply@example.com>',
      '<root@example.com> <middle@example.com> <reply@example.com>'
    ),
    ['<reply@example.com>', '<middle@example.com>', '<root@example.com>']
  )
})

test('Reply and Reply-All never receive or expose BCC data', () => {
  const source = {
    fromAddress: 'customer@example.com',
    toAddresses: ['orders@ymistory.com', 'friend@example.com'],
    ccAddresses: ['Team@Example.com', 'admin@ymistory.com'],
    internetMessageId: '<customer-message@example.com>',
    referencesHeader: '<root@ymistory.com>',
  }
  assert.deepEqual(
    buildGeneralMailReplyEnvelope({
      source,
      mailboxKey: 'orders',
      replyAll: false,
      inboundDomain: 'ymistory.com',
    }),
    {
      to: ['customer@example.com'],
      cc: [],
      inReplyTo: '<customer-message@example.com>',
      references: '<root@ymistory.com> <customer-message@example.com>',
    }
  )
  assert.deepEqual(
    buildGeneralMailReplyEnvelope({
      source,
      mailboxKey: 'orders',
      replyAll: true,
      inboundDomain: 'ymistory.com',
    }).cc,
    ['friend@example.com', 'team@example.com']
  )
  assert.equal('bccAddresses' in source, false)
})
