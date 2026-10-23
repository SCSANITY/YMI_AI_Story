import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { readFileSync } from 'node:fs'

const messageId = '00000000-0000-4000-8000-000000000001'
const attachmentId = '00000000-0000-4000-8000-000000000002'
const version = '2026-10-23T04:56:10.123456+00:00'
const surfaces = [
  { name: 'save', path: 'app/api/admin/mail/drafts/[messageId]/route.ts', method: 'PATCH' },
  { name: 'delete', path: 'app/api/admin/mail/drafts/[messageId]/route.ts', method: 'DELETE' },
  { name: 'send', path: 'app/api/admin/mail/drafts/[messageId]/send/route.ts', method: 'POST' },
  { name: 'attachment', path: 'app/api/admin/mail/drafts/[messageId]/attachments/upload-url/route.ts', method: 'POST' },
]

function harness(surface, { currentVersion = version, admin = true } = {}) {
  const calls = [], cache = new Map()
  const write = async (input) => {
    calls.push(input)
    // Model the database's existing exact-version guard, not Date equality.
    if (input.expectedUpdatedAt !== currentVersion) throw new Error('general_mail_draft_stale')
    return { message_id: messageId, updated_at: currentVersion }
  }
  const mocks = {
    '@/lib/http-response': { noStoreJson: (body, status = 200) => Response.json(body, { status }) },
    '@/lib/adminAuth': { requireAdminCustomer: async () => admin ? { customer_id: 'synthetic-admin' } : null },
    '@/lib/support-ticket': { isUuid: value => value === messageId || value === attachmentId },
    '@/lib/general-mail': { normalizeGeneralMailDraftInput: value => value },
    '@/lib/general-mail-server': {
      updateGeneralMailDraft: write, deleteGeneralMailDraft: write, sendGeneralMailDraft: write,
      loadGeneralMailMessage: async () => ({ updated_at: currentVersion }),
    },
    '@/lib/general-mail-attachments': {
      normalizeGeneralMailAttachmentInput: value => value,
      buildGeneralMailAttachmentPath: () => 'synthetic/file.png',
    },
    '@/lib/general-mail-attachment-server': { registerGeneralMailAttachmentUpload: async input => {
      await write(input)
      return { attachment: { attachment_id: attachmentId }, token: 'synthetic-upload-token' }
    } },
    '@/lib/supabaseAdmin': { supabaseAdmin: {} },
  }
  function load(path) {
    if (cache.has(path)) return cache.get(path)
    const fixtureModule = { exports: {} }
    cache.set(path, fixtureModule.exports)
    vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../' + path, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, {
      module: fixtureModule, exports: fixtureModule.exports, Date, Error, Number, String,
      require(name) {
        if (name === '@/lib/general-mail-api') return load('src/lib/general-mail-api.ts')
        if (Object.hasOwn(mocks, name)) return mocks[name]
        throw new Error('Unexpected route dependency: ' + name)
      },
    })
    return fixtureModule.exports
  }
  return { route: load(surface.path)[surface.method], calls }
}

function request(surface, expectedUpdatedAt) {
  return new Request('https://example.test/api/admin/mail/drafts/' + messageId, {
    method: surface.method, headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ expectedUpdatedAt, attachmentId }),
  })
}
const context = { params: Promise.resolve({ messageId }) }

for (const surface of surfaces) {
  test(`${surface.name}: unchanged microsecond/offset versions reach the exact guard intact`, async () => {
    for (const value of [version, '2026-10-23T12:56:10.123456+08:00', '2026-10-23T04:56:10.123Z']) {
      const h = harness(surface, { currentVersion: value })
      const response = await h.route(request(surface, value), context)
      assert.ok(response.ok, await response.text())
      assert.equal(h.calls.length, 1)
      assert.equal(h.calls[0].expectedUpdatedAt, value)
    }
  })

  test(`${surface.name}: a genuinely changed draft remains a conflict`, async () => {
    const h = harness(surface)
    const response = await h.route(request(surface, '2026-10-23T04:56:10.123455+00:00'), context)
    assert.equal(response.status, 409)
    assert.equal((await response.json()).error, 'general_mail_draft_stale')
    assert.equal(h.calls.length, 1)
  })

  test(`${surface.name}: missing or invalid versions never reach a write`, async () => {
    for (const value of [undefined, null, '', 'not-a-timestamp']) {
      const h = harness(surface)
      assert.equal((await h.route(request(surface, value), context)).status, 400)
      assert.equal(h.calls.length, 0)
    }
  })

  test(`${surface.name}: admin authorization still precedes the write`, async () => {
    const h = harness(surface, { admin: false })
    assert.equal((await h.route(request(surface, version), context)).status, 403)
    assert.equal(h.calls.length, 0)
  })
}
