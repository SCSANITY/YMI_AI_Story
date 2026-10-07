import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { readdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { build } = require('esbuild')
const currentOrigin = 'https://current.supabase.test'
const templateId = 'story-01'
const secretMarker = 'PRIVATE_PROMPT_MARKER_DO_NOT_EXPOSE_7A93'

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function privatePath(bytes, id = templateId) {
  return `story-configs/image-edit/v1/${id}/config-${sha256(bytes)}.json`
}

function privateUrl(bytes, id = templateId) {
  return `${currentOrigin}/storage/v1/object/story-config-private/${privatePath(bytes, id)}`
}

function validConfig() {
  return {
    schema_version: 3,
    asset_layout: 'single-page',
    template_id: templateId,
    image_edit: {
      contract_version: 1,
      active_provider: 'openai',
      profiles: {
        preview: {
          model: 'gpt-image-2.5-flare-2026-09-08', size: '1024x1024', quality: 'medium',
          output_format: 'png', background: 'opaque', request_timeout_ms: 180000,
        },
        final: {
          activation: 'blocked_pending_print_contract',
          model: 'gpt-image-2.5-flare-2026-09-08', size: '2048x2048', quality: 'medium',
          output_format: 'png', background: 'opaque', request_timeout_ms: 180000,
        },
      },
    },
    pages: [
      {
        index: 0, template_image: 'cover.png', enable_face_swap: true,
        image_edit: { prompt: secretMarker, prompt_version: 'COVER-V1', identity_input: 'primary' },
      },
      { index: 1, template_image: 'preview-left.png', enable_face_swap: false },
      { index: 2, template_image: 'final-page.png', enable_face_swap: false },
    ],
    preview: { page_indices: [0, 1] },
    final: { page_indices: [2] },
  }
}

function responseEmitter(plan) {
  const response = new EventEmitter()
  response.statusCode = plan.status ?? 200
  response.headers = plan.headers ?? {}
  response.destroy = () => response.removeAllListeners()
  queueMicrotask(() => {
    for (const chunk of plan.chunks ?? [plan.body ?? Buffer.alloc(0)]) response.emit('data', chunk)
    response.emit('end')
  })
  return response
}

async function loadBundled(entry, options = {}) {
  const result = await build({
    entryPoints: [fileURLToPath(new URL(`../${entry}`, import.meta.url))],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    tsconfig: fileURLToPath(new URL('../tsconfig.json', import.meta.url)),
    external: options.external ?? ['server-only', 'node:https'],
  })
  const loaded = { exports: {} }
  const httpsPlan = options.httpsPlan ?? { status: 200, body: Buffer.alloc(0) }
  const calls = options.calls ?? { https: 0, rpc: [] }
  const httpsStub = {
    request(url, requestOptions, callback) {
      calls.https += 1
      calls.lastHttps = { url: String(url), options: requestOptions }
      const outgoing = new EventEmitter()
      outgoing.setTimeout = (_delay, onTimeout) => {
        if (httpsPlan.timeout) queueMicrotask(onTimeout)
      }
      outgoing.destroy = (error) => {
        if (error) queueMicrotask(() => outgoing.emit('error', error))
      }
      outgoing.end = () => {
        if (!httpsPlan.timeout) callback(responseEmitter(httpsPlan))
      }
      return outgoing
    },
  }
  const context = {
    module: loaded,
    exports: loaded.exports,
    Buffer,
    URL,
    TextDecoder,
    AbortController,
    Request,
    Response,
    console,
    process: {
      env: options.env ?? {
        SUPABASE_URL: currentOrigin,
        SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
      },
    },
    setTimeout,
    clearTimeout,
    queueMicrotask,
    structuredClone,
    fetch: options.fetchImpl ?? (() => assert.fail('Unexpected fetch')),
    require(name) {
      if (name === 'server-only') return {}
      if (name === 'node:https') return httpsStub
      if (options.dependencies && Object.hasOwn(options.dependencies, name)) {
        return options.dependencies[name]
      }
      return require(name)
    },
  }
  runInNewContext(result.outputFiles[0].text, context, { filename: entry })
  return { module: loaded.exports, calls, context }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function applyCorpusMutations(target, mutations = []) {
  for (const mutation of mutations) {
    assert.ok(Array.isArray(mutation.path) && mutation.path.length > 0)
    let parent = target
    for (const segment of mutation.path.slice(0, -1)) {
      parent = parent[segment]
      assert.ok(parent && typeof parent === 'object')
    }
    const key = mutation.path.at(-1)
    if (mutation.op === 'delete') delete parent[key]
    else if (mutation.op === 'repeat_string') {
      assert.equal(typeof mutation.value, 'string')
      assert.equal(Number.isInteger(mutation.count), true)
      parent[key] = mutation.value.repeat(mutation.count)
    } else parent[key] = clone(mutation.value)
  }
}

function materializeCorpusCase(corpus, corpusCase) {
  const config = clone(corpus.base_config)
  applyCorpusMutations(config, corpusCase.config_mutations)
  let bytes = Buffer.from(JSON.stringify(config), 'utf8')
  if (corpusCase.raw_mode === 'duplicate-root-key') {
    bytes = Buffer.from(bytes.toString('utf8').replace(
      '{"schema_version":3',
      '{"schema_version":2,"schema_version":3'
    ))
  } else if (corpusCase.raw_mode === 'invalid-utf8') {
    bytes = Buffer.concat([bytes.subarray(0, 1), Buffer.from([0xff]), bytes.subarray(1)])
  }
  return { config, bytes }
}

async function listSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await listSourceFiles(absolute))
    else if (/\.(?:js|jsx|ts|tsx)$/.test(entry.name)) files.push(absolute)
  }
  return files
}

const legacyPublicUrl = (path) => `${currentOrigin}/storage/v1/object/public/app-templates/${path}`

test('address resolver accepts only the exact legacy path or digest-addressed private path', async () => {
  const { module } = await loadBundled('src/lib/story-config-server.ts')
  const bytes = Buffer.from(JSON.stringify(validConfig()))
  assert.deepEqual(
    structuredClone(module.resolveStoryConfigAddress({
      templateId,
      rawConfigPath: `${templateId}/config.json`,
      supabaseOrigin: currentOrigin,
      resolveLegacyPublicUrl: legacyPublicUrl,
    })),
    {
      kind: 'legacy-public',
      configPath: `${templateId}/config.json`,
      configUrl: legacyPublicUrl(`${templateId}/config.json`),
    }
  )
  assert.deepEqual(
    structuredClone(module.resolveStoryConfigAddress({
      templateId,
      rawConfigPath: privatePath(bytes),
      supabaseOrigin: currentOrigin,
      resolveLegacyPublicUrl: legacyPublicUrl,
    })),
    {
      kind: 'private',
      configPath: privatePath(bytes),
      configUrl: privateUrl(bytes),
      contentSha256: sha256(bytes),
    }
  )

  for (const rawConfigPath of [
    `https://foreign.test/storage/v1/object/story-config-private/${privatePath(bytes)}`,
    `story-config-private/${privatePath(bytes)}`,
    privatePath(bytes).replace(templateId, 'other-story'),
    privatePath(bytes).replace(/[a-f0-9]{64}/, 'A'.repeat(64)),
    `${privatePath(bytes)}?token=${secretMarker}`,
    privatePath(bytes).replace('/config-', '/%2e%2e/config-'),
    ` ${privatePath(bytes)}`,
  ]) {
    assert.throws(
      () => module.resolveStoryConfigAddress({
        templateId, rawConfigPath, supabaseOrigin: currentOrigin, resolveLegacyPublicUrl: legacyPublicUrl,
      }),
      (error) => error?.code === 'story_config_path_invalid'
    )
  }
})

test('shared P1-E corpus produces the declared Web outcomes without exposing Prompt text', async () => {
  const corpusBytes = await readFile(new URL(
    './fixtures/external-contracts/worker/image-edit-acceptance-corpus-v1.json',
    import.meta.url
  ))
  const corpus = JSON.parse(corpusBytes.toString('utf8'))
  const { module } = await loadBundled('src/lib/story-config-server.ts')

  assert.equal(
    sha256(corpusBytes).toUpperCase(),
    'D289272EC87DEB88823116D6093B810B14364C49EF6111E4162CC304B14D52EE'
  )
  assert.equal(corpus.schema_version, 1)
  assert.equal(corpus.cases.length, 45)
  for (const corpusCase of corpus.cases) {
    const { config, bytes } = materializeCorpusCase(corpus, corpusCase)
    let actual
    try {
      if (corpusCase.raw_mode) {
        module.parsePrivateStoryConfig({
          body: bytes,
          templateId: corpus.template_id,
          address: {
            kind: 'private',
            configUrl: privateUrl(bytes, corpus.template_id),
            configPath: privatePath(bytes, corpus.template_id),
            contentSha256: sha256(bytes),
          },
        })
      } else {
        module.validatePrivateStoryConfig(config, corpus.template_id)
      }
      actual = { accepted: true }
    } catch (error) {
      assert.equal(module.STORY_CONFIG_ERROR_CODES.includes(error?.code), true)
      assert.equal(String(error).includes(corpus.prompt_marker), false)
      actual = { accepted: false, code: error.code }
    }
    assert.deepEqual(actual, corpusCase.expected.web, corpusCase.id)
    assert.equal(JSON.stringify(actual).includes(corpus.prompt_marker), false)
  }
})

test('storage signing accepts only the explicit media bucket and rejects private configs before Storage access', async () => {
  const calls = []
  const supabaseAdmin = {
    storage: {
      from(bucket) {
        calls.push({ kind: 'from', bucket })
        return {
          async createSignedUrl(storagePath) {
            calls.push({ kind: 'sign', bucket, storagePath })
            return { data: { signedUrl: `https://signed.example/${storagePath}` }, error: null }
          },
        }
      },
    },
  }
  const { module } = await loadBundled('src/lib/storage-signing.ts', {
    external: ['@/lib/supabaseAdmin'],
    dependencies: { '@/lib/supabaseAdmin': { supabaseAdmin } },
  })

  await assert.rejects(
    module.createSignedStorageUrlMap([{
      key: 'private-config',
      bucket: 'story-config-private',
      path: 'story/config.json',
      expiresIn: 60,
    }]),
    (error) => error?.code === 'storage_bucket_not_signable'
  )
  assert.equal(calls.length, 0)

  const signed = await module.createSignedStorageUrlMap([{
    key: 'preview',
    bucket: 'raw-private',
    path: 'jobs/preview.png',
    expiresIn: 60,
  }])
  assert.equal(signed.get('preview'), 'https://signed.example/jobs/preview.png')
  assert.deepEqual(calls, [
    { kind: 'from', bucket: 'raw-private' },
    { kind: 'sign', bucket: 'raw-private', storagePath: 'jobs/preview.png' },
  ])
})

test('Prompt-bearing private configs are absent from catalog projections and guarded by the signing allowlist', async () => {
  const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))
  const [catalogSource, ownedRoute, sourceFiles, policy] = await Promise.all([
    readFile(path.join(repositoryRoot, 'src/lib/book-catalog.ts'), 'utf8'),
    readFile(path.join(repositoryRoot, 'app/api/jobs/[jobId]/route.ts'), 'utf8'),
    Promise.all([
      listSourceFiles(path.join(repositoryRoot, 'app')),
      listSourceFiles(path.join(repositoryRoot, 'src')),
    ]).then((groups) => groups.flat()),
    loadBundled('src/lib/storage-signing-policy.ts'),
  ])
  const projectionStart = catalogSource.indexOf('export function templateRowToBook')
  const projectionEnd = catalogSource.indexOf('\nexport ', projectionStart + 1)
  const projection = catalogSource.slice(
    projectionStart,
    projectionEnd === -1 ? catalogSource.length : projectionEnd
  )
  assert.ok(projectionStart >= 0)
  assert.doesNotMatch(projection, /default_config_path|story-config-private|image_edit|prompt/i)
  assert.match(ownedRoute, /input_snapshot: job\.input_snapshot/)
  assert.doesNotMatch(ownedRoute, /config body|image_edit|prompt/i)
  assert.deepEqual(structuredClone(policy.module.SIGNABLE_STORAGE_BUCKETS), ['raw-private'])
  assert.throws(
    () => policy.module.assertSignableStorageBucket('story-config-private'),
    (error) => error?.code === 'storage_bucket_not_signable'
  )

  const signingFiles = []
  for (const filename of sourceFiles) {
    const source = await readFile(filename, 'utf8')
    if (/createSigned(?:StorageUrlMap|Url|Urls|UploadUrl)\s*\(/.test(source)) {
      signingFiles.push(path.relative(repositoryRoot, filename).replace(/\\/g, '/'))
      assert.doesNotMatch(source, /story-config-private|PRIVATE_STORY_CONFIG_BUCKET/)
    }
  }
  assert.ok(signingFiles.length > 0)

  for (const relativePath of [
    'app/api/internal/worker-callback/route.ts',
    'app/api/jobs/[jobId]/preview-state/route.ts',
    'app/api/jobs/[jobId]/preview-url/route.ts',
    'src/lib/orderFulfillment.ts',
    'src/lib/share-preview.ts',
    'src/lib/storage-response.ts',
  ]) {
    const source = await readFile(path.join(repositoryRoot, relativePath), 'utf8')
    assert.match(source, /assertSignableStorageBucket\(/, relativePath)
  }
})

test('private Preview preflight reads once with trusted credentials and returns only the inert locator', async () => {
  const bytes = Buffer.from(JSON.stringify(validConfig()))
  const env = await loadBundled('src/lib/story-config-server.ts', {
    httpsPlan: { status: 200, body: bytes },
  })
  const result = await env.module.prepareStoryConfigForPreview({
    templateId,
    rawConfigPath: privatePath(bytes),
    resolveLegacyPublicUrl: legacyPublicUrl,
  })
  assert.deepEqual(structuredClone(result), { configUrl: privateUrl(bytes) })
  assert.equal(env.calls.https, 1)
  assert.equal(env.calls.lastHttps.url, privateUrl(bytes))
  assert.equal(env.calls.lastHttps.options.headers.Authorization, 'Bearer test-service-key')
  assert.equal(env.calls.lastHttps.options.headers.apikey, 'test-service-key')
  assert.equal(JSON.stringify(result).includes(secretMarker), false)
})

test('private Preview preflight sends a new secret only as apikey and never as Bearer', async () => {
  const bytes = Buffer.from(JSON.stringify(validConfig()))
  const env = await loadBundled('src/lib/story-config-server.ts', {
    env: {
      SUPABASE_URL: currentOrigin,
      SUPABASE_SECRET_KEY: 'sb_secret_WEB_PRIVATE_READER_TEST',
      SUPABASE_SERVICE_ROLE_KEY: 'legacy-service-test',
    },
    httpsPlan: { status: 200, body: bytes },
  })
  await env.module.prepareStoryConfigForPreview({
    templateId,
    rawConfigPath: privatePath(bytes),
    resolveLegacyPublicUrl: legacyPublicUrl,
  })
  assert.equal(env.calls.https, 1)
  assert.equal(env.calls.lastHttps.options.headers.apikey, 'sb_secret_WEB_PRIVATE_READER_TEST')
  assert.equal('Authorization' in env.calls.lastHttps.options.headers, false)
})

test('private Final read returns exact indices without exposing the prompt-bearing config', async () => {
  const bytes = Buffer.from(JSON.stringify(validConfig()))
  const env = await loadBundled('src/lib/story-config-server.ts', {
    httpsPlan: { status: 200, body: bytes },
  })
  const result = await env.module.loadStoryConfigForFinal({
    templateId,
    rawConfigPath: privatePath(bytes),
    resolveLegacyPublicUrl: legacyPublicUrl,
  })
  assert.deepEqual(structuredClone(result), { configUrl: privateUrl(bytes), finalPageIndices: [2] })
  assert.equal(env.calls.https, 1)
  assert.equal(JSON.stringify(result).includes(secretMarker), false)
})

test('legacy paths remain public and keep the existing permissive final-index compatibility', async () => {
  let fetchCalls = 0
  const env = await loadBundled('src/lib/story-config-server.ts', {
    fetchImpl: async (url, init) => {
      fetchCalls += 1
      assert.equal(url, legacyPublicUrl(`${templateId}/config.json`))
      assert.equal(init.cache, 'no-store')
      assert.equal(init.redirect, 'error')
      return new Response(JSON.stringify({ final: { page_indices: ['4', 3, 3] } }), { status: 200 })
    },
  })
  const result = await env.module.loadStoryConfigForFinal({
    templateId,
    rawConfigPath: `${templateId}/config.json`,
    resolveLegacyPublicUrl: legacyPublicUrl,
  })
  assert.deepEqual(structuredClone(result.finalPageIndices), [3, 4])
  assert.equal(fetchCalls, 1)
  assert.equal(env.calls.https, 0)
})

test('redirect, timeout, oversize, digest and contract failures are fixed-code and never expose markers', async () => {
  const validBytes = Buffer.from(JSON.stringify(validConfig()))
  const cases = [
    [{ status: 302, body: Buffer.from(secretMarker) }, 'story_config_read_redirected'],
    [{ timeout: true }, 'story_config_read_unavailable'],
    [{ status: 200, headers: { 'content-length': String(8 * 1024 * 1024 + 1) } }, 'story_config_size_exceeded'],
    [{ status: 200, body: Buffer.from(`${validBytes.toString('utf8')} `) }, 'story_config_digest_mismatch'],
    [{ status: 200, body: Buffer.from(`{"${secretMarker}":`) }, 'story_config_digest_mismatch'],
  ]
  for (const [httpsPlan, expectedCode] of cases) {
    const env = await loadBundled('src/lib/story-config-server.ts', { httpsPlan })
    await assert.rejects(
      env.module.prepareStoryConfigForPreview({
        templateId,
        rawConfigPath: privatePath(validBytes),
        resolveLegacyPublicUrl: legacyPublicUrl,
      }),
      (error) => {
        assert.equal(error.code, expectedCode)
        assert.equal(String(error).includes(secretMarker), false)
        return true
      }
    )
    assert.equal(env.calls.https, 1)
  }

  const malformed = Buffer.from(`{"schema_version":3,"${secretMarker}":`)
  const malformedEnv = await loadBundled('src/lib/story-config-server.ts', {
    httpsPlan: { status: 200, body: malformed },
  })
  await assert.rejects(
    malformedEnv.module.prepareStoryConfigForPreview({
      templateId,
      rawConfigPath: privatePath(malformed),
      resolveLegacyPublicUrl: legacyPublicUrl,
    }),
    (error) => error.code === 'story_config_contract_invalid' && !String(error).includes(secretMarker)
  )
})

function routeDependencies({ templatePath, calls }) {
  const templateQuery = {
    select() { return this },
    eq() { return this },
    async single() { return { data: { default_config_path: templatePath }, error: null } },
  }
  const supabaseAdmin = {
    from(table) {
      assert.equal(table, 'templates')
      return templateQuery
    },
    rpc(name, args) {
      calls.rpc.push({ name, args })
      return {
        async single() {
          return { data: { job_id: 'job-1', creation_id: 'creation-1' }, error: null }
        },
      }
    },
    storage: {
      from() {
        return { getPublicUrl: (path) => ({ data: { publicUrl: legacyPublicUrl(path) } }) }
      },
    },
  }
  return {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@/lib/supabaseAdmin': { supabaseAdmin },
    '@/lib/jobQueueAdmission': { parseJobQueueAdmissionError: () => null },
    '@/lib/bookType': { mapBookTypeToDisplay: () => 'Classic' },
    '@/lib/package-pricing': { normalizeBookPackageType: () => 'standard' },
    '@/lib/customize-access-server': { getCustomizeAccessSettings: async () => ({ enabled: true }) },
    '@/lib/checkout-owner': {
      checkoutOwnerErrorResponse: () => null,
      ownerFilter: () => ({}),
      resolveCheckoutOwner: async () => ({ ownerType: 'customer', customerId: 'customer-1' }),
    },
    '@/lib/face-assets-server': {
      confirmPendingFaceAsset: async () => assert.fail('Unexpected pending asset'),
      loadOwnedFaceAsset: async () => ({ storage_path: 'customer/face.png' }),
      normalizePendingFaceAsset: () => null,
    },
    '@/lib/signature-voice': {
      isVerifiedSignatureVoiceDuration: () => true,
      SIGNATURE_VOICE_CONSENT_VERSION: 'v1',
      SignatureVoiceContractError: class extends Error {},
      parseSignatureVoiceBindingRequest: () => ({}),
    },
    '@/lib/story-language': {
      forceEnglishTextOverrides: (value) => value,
      normalizeStoryLanguage: () => 'English',
    },
    '@/lib/user-profile-history-server': { saveOwnedTextProfile: async () => null },
  }
}

async function loadPreviewRoute({ body, templatePath }) {
  const calls = { https: 0, rpc: [] }
  const env = await loadBundled('app/api/jobs/route.js', {
    httpsPlan: { status: 200, body },
    calls,
    external: [
      'server-only', 'node:https', 'next/server', '@/lib/supabaseAdmin',
      '@/lib/jobQueueAdmission', '@/lib/bookType', '@/lib/package-pricing',
      '@/lib/customize-access-server', '@/lib/checkout-owner', '@/lib/face-assets-server',
      '@/lib/signature-voice', '@/lib/story-language', '@/lib/user-profile-history-server',
    ],
    dependencies: routeDependencies({ templatePath, calls }),
  })
  return env
}

const previewRequest = () => new Request('https://site.test/api/jobs', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    template_id: templateId,
    face_asset_id: 'face-1',
    params: {
      consent: {
        content_generation: { accepted: true, version: 'content-generation-consent-v1' },
      },
    },
  }),
})

test('actual Preview route stores only the private locator and returns its fixed public response allowlist', async () => {
  const bytes = Buffer.from(JSON.stringify(validConfig()))
  const env = await loadPreviewRoute({ body: bytes, templatePath: privatePath(bytes) })
  const response = await env.module.POST(previewRequest())
  const payload = await response.json()
  assert.equal(response.status, 200)
  assert.deepEqual(Object.keys(payload).sort(), [
    'creationId', 'creation_id', 'jobId', 'job_id', 'text_profile',
  ])
  assert.equal(env.calls.https, 1)
  assert.equal(env.calls.rpc.length, 1)
  assert.equal(env.calls.rpc[0].name, 'create_preview_job')
  assert.equal(env.calls.rpc[0].args.p_config_url, privateUrl(bytes))
  assert.equal(JSON.stringify(env.calls.rpc[0].args).includes(secretMarker), false)
  assert.equal(JSON.stringify(payload).includes(secretMarker), false)
})

test('actual Preview route fails closed before Job creation and does not echo malformed private Prompt bytes', async () => {
  const malformed = Buffer.from(`{"schema_version":3,"${secretMarker}":`)
  const env = await loadPreviewRoute({ body: malformed, templatePath: privatePath(malformed) })
  const response = await env.module.POST(previewRequest())
  const payload = await response.json()
  assert.equal(response.status, 503)
  assert.deepEqual(Object.keys(payload).sort(), ['code', 'error'])
  assert.equal(payload.code, 'story_config_contract_invalid')
  assert.equal(JSON.stringify(payload).includes(secretMarker), false)
  assert.equal(env.calls.https, 1)
  assert.equal(env.calls.rpc.length, 0)
})

test('actual Preview route also suppresses a secret marker carried by a valid but unsupported contract key', async () => {
  const invalid = validConfig()
  invalid.image_edit[secretMarker] = true
  const bytes = Buffer.from(JSON.stringify(invalid))
  const env = await loadPreviewRoute({ body: bytes, templatePath: privatePath(bytes) })
  const response = await env.module.POST(previewRequest())
  const payload = await response.json()
  assert.equal(response.status, 503)
  assert.equal(payload.code, 'story_config_contract_invalid')
  assert.equal(JSON.stringify(payload).includes(secretMarker), false)
  assert.equal(env.calls.rpc.length, 0)
})

test('Change Photo preserves the inherited immutable locator and owned Job responses never contain config bodies', async () => {
  const [forkRoute, ownedRoute, fulfillment] = await Promise.all([
    readFile(new URL('../app/api/creations/[creationId]/preview-versions/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/jobs/[jobId]/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/orderFulfillment.ts', import.meta.url), 'utf8'),
  ])
  assert.match(forkRoute, /rpc\('fork_preview_creation_version'/)
  assert.doesNotMatch(forkRoute, /default_config_path|story-config-server|app-templates/)
  assert.match(ownedRoute, /input_snapshot: job\.input_snapshot/)
  assert.doesNotMatch(ownedRoute, /story-config-private|config body|prompt/i)
  assert.match(fulfillment, /loadStoryConfigForFinal\(/)
  assert.doesNotMatch(fulfillment, /fetch\(configUrl|response\.json\(\)/)
})

test('external Worker fixture pins the exact reviewed P1-C2 source and checksum identity', async () => {
  const [fixture, manifest, fixtureReadme] = await Promise.all([
    readFile(new URL('./fixtures/external-contracts/worker/index.ts', import.meta.url)),
    readFile(new URL('./fixtures/external-contracts/SHA256SUMS', import.meta.url), 'utf8'),
    readFile(new URL('./fixtures/external-contracts/README.md', import.meta.url), 'utf8'),
  ])
  const expected = 'F7296864254A854340FA41A8E9AF3A8B64CD1494B343FF107B489D4C96FAE995'
  assert.equal(sha256(fixture).toUpperCase(), expected)
  assert.match(manifest, new RegExp(`^${expected}  worker/index\\.ts$`, 'm'))
  assert.match(fixtureReadme, /fefae2b7b464501e79d3469ed2875e13b3c07e50/)
  assert.match(fixture.toString('utf8'), /privateImageEditSnapshot = await loadPrivateImageEditConfig\(/)
  assert.match(fixture.toString('utf8'), /assertPrivateImageEditProviderAuthority\(/)
})
