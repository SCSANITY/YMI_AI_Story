import 'server-only'

import { createHash } from 'node:crypto'
import https from 'node:https'
import type { IncomingMessage } from 'node:http'

export const PRIVATE_STORY_CONFIG_BUCKET = 'story-config-private' as const
export const PRIVATE_STORY_CONFIG_PREFIX = 'story-configs/image-edit/v1' as const
export const PRIVATE_STORY_CONFIG_MAX_BYTES = 8 * 1024 * 1024
export const PRIVATE_STORY_CONFIG_TIMEOUT_MS = 15_000

const IMAGE_EDIT_MODEL = 'gpt-image-2.5-flare-2026-09-08'
const IMAGE_EDIT_MAX_PROMPT_CHARACTERS = 32_000
const IMAGE_EDIT_PROFILE_KEYS = [
  'background',
  'model',
  'output_format',
  'quality',
  'request_timeout_ms',
  'size',
] as const

export const STORY_CONFIG_ERROR_CODES = [
  'story_config_path_invalid',
  'story_config_server_misconfigured',
  'story_config_read_unavailable',
  'story_config_read_denied',
  'story_config_read_missing',
  'story_config_read_failed',
  'story_config_read_redirected',
  'story_config_size_exceeded',
  'story_config_digest_mismatch',
  'story_config_contract_invalid',
] as const

export type StoryConfigErrorCode = (typeof STORY_CONFIG_ERROR_CODES)[number]

export class StoryConfigError extends Error {
  constructor(readonly code: StoryConfigErrorCode) {
    super(code)
    this.name = 'StoryConfigError'
  }
}

type UnknownRecord = Record<string, unknown>

type LegacyStoryConfigAddress = Readonly<{
  kind: 'legacy-public'
  configUrl: string
  configPath: string
}>

type PrivateStoryConfigAddress = Readonly<{
  kind: 'private'
  configUrl: string
  configPath: string
  contentSha256: string
}>

export type StoryConfigAddress = LegacyStoryConfigAddress | PrivateStoryConfigAddress

type PrivateStoryConfigResponse = Readonly<{
  status: number
  body: Buffer
}>

export type PrivateStoryConfigTransport = (args: Readonly<{
  url: string
  serviceKey: string
  signal: AbortSignal
  timeoutMs: typeof PRIVATE_STORY_CONFIG_TIMEOUT_MS
  maxBytes: typeof PRIVATE_STORY_CONFIG_MAX_BYTES
}>) => Promise<PrivateStoryConfigResponse>

type ValidatedPrivateStoryConfig = Readonly<{
  finalPageIndices: readonly number[]
}>

function asRecord(value: unknown): UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new StoryConfigError('story_config_contract_invalid')
  }
  return value as UnknownRecord
}

function assertExactKeys(value: UnknownRecord, allowed: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new StoryConfigError('story_config_contract_invalid')
  }
}

function assertTemplateId(value: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) {
    throw new StoryConfigError('story_config_path_invalid')
  }
  return value
}

function parseSupabaseOrigin(value: string): string {
  if (typeof value !== 'string' || !value || value !== value.trim()) {
    throw new StoryConfigError('story_config_server_misconfigured')
  }
  try {
    const parsed = new URL(value)
    if (
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      (parsed.pathname !== '' && parsed.pathname !== '/') ||
      (value !== parsed.origin && value !== `${parsed.origin}/`)
    ) {
      throw new Error('invalid')
    }
    return parsed.origin
  } catch {
    throw new StoryConfigError('story_config_server_misconfigured')
  }
}

function configuredSupabaseOrigin(): string {
  return parseSupabaseOrigin(
    String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '')
  )
}

function configuredServiceKey(): string {
  const key = String(
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || ''
  )
  if (!key || key !== key.trim() || /[\r\n]/.test(key)) {
    throw new StoryConfigError('story_config_server_misconfigured')
  }
  return key
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function resolveStoryConfigAddress(args: {
  templateId: string
  rawConfigPath: string | null | undefined
  supabaseOrigin: string
  resolveLegacyPublicUrl: (configPath: string) => string | null | undefined
}): StoryConfigAddress {
  const templateId = assertTemplateId(args.templateId)
  const origin = parseSupabaseOrigin(args.supabaseOrigin)
  const configPath = typeof args.rawConfigPath === 'string' ? args.rawConfigPath : ''
  if (!configPath || configPath !== configPath.trim() || /[%\\]/.test(configPath)) {
    throw new StoryConfigError('story_config_path_invalid')
  }

  const legacyPath = `${templateId}/config.json`
  if (configPath === legacyPath) {
    const publicUrl = args.resolveLegacyPublicUrl(configPath)
    const expectedPublicUrl = `${origin}/storage/v1/object/public/app-templates/${configPath}`
    if (publicUrl !== expectedPublicUrl) {
      throw new StoryConfigError('story_config_server_misconfigured')
    }
    return Object.freeze({ kind: 'legacy-public', configUrl: publicUrl, configPath })
  }

  const match = configPath.match(new RegExp(
    `^${PRIVATE_STORY_CONFIG_PREFIX}/${escapeRegExp(templateId)}/config-([a-f0-9]{64})\\.json$`
  ))
  if (!match) throw new StoryConfigError('story_config_path_invalid')

  const contentSha256 = match[1]
  return Object.freeze({
    kind: 'private',
    configUrl: `${origin}/storage/v1/object/${PRIVATE_STORY_CONFIG_BUCKET}/${configPath}`,
    configPath,
    contentSha256,
  })
}

function assertNoDuplicateJsonKeys(text: string): void {
  let cursor = 0
  const whitespace = () => {
    while (cursor < text.length && /\s/.test(text[cursor])) cursor += 1
  }
  const stringToken = (): string => {
    const start = cursor
    cursor += 1
    while (cursor < text.length) {
      if (text[cursor] === '\\') {
        cursor += 2
        continue
      }
      if (text[cursor] === '"') {
        cursor += 1
        return JSON.parse(text.slice(start, cursor)) as string
      }
      cursor += 1
    }
    throw new Error('invalid_json')
  }
  const visit = (): void => {
    whitespace()
    if (text[cursor] === '{') {
      cursor += 1
      whitespace()
      const keys = new Set<string>()
      while (text[cursor] !== '}') {
        const key = stringToken()
        if (keys.has(key)) throw new Error('duplicate_json_key')
        keys.add(key)
        whitespace()
        if (text[cursor] !== ':') throw new Error('invalid_json')
        cursor += 1
        visit()
        whitespace()
        if (text[cursor] === ',') {
          cursor += 1
          whitespace()
        } else if (text[cursor] !== '}') {
          throw new Error('invalid_json')
        }
      }
      cursor += 1
      return
    }
    if (text[cursor] === '[') {
      cursor += 1
      whitespace()
      while (text[cursor] !== ']') {
        visit()
        whitespace()
        if (text[cursor] === ',') {
          cursor += 1
          whitespace()
        } else if (text[cursor] !== ']') {
          throw new Error('invalid_json')
        }
      }
      cursor += 1
      return
    }
    if (text[cursor] === '"') {
      stringToken()
      return
    }
    const start = cursor
    while (cursor < text.length && !/[\s,\]}]/.test(text[cursor])) cursor += 1
    if (start === cursor) throw new Error('invalid_json')
  }
  visit()
  whitespace()
  if (cursor !== text.length) throw new Error('invalid_json')
}

function validateImageEditProfile(value: unknown, profile: 'preview' | 'final'): void {
  const record = asRecord(value)
  assertExactKeys(
    record,
    profile === 'final' ? ['activation', ...IMAGE_EDIT_PROFILE_KEYS] : IMAGE_EDIT_PROFILE_KEYS
  )
  if (
    record.model !== IMAGE_EDIT_MODEL ||
    record.size !== (profile === 'preview' ? '1024x1024' : '2048x2048') ||
    record.quality !== 'medium' ||
    record.output_format !== 'png' ||
    record.background !== 'opaque' ||
    typeof record.request_timeout_ms !== 'number' ||
    !Number.isInteger(record.request_timeout_ms) ||
    record.request_timeout_ms < 1_000 ||
    record.request_timeout_ms > 300_000 ||
    (profile === 'final' && record.activation !== 'blocked_pending_print_contract')
  ) {
    throw new StoryConfigError('story_config_contract_invalid')
  }
}

function validatePageImageEdit(value: unknown): void {
  const record = asRecord(value)
  assertExactKeys(record, ['identity_input', 'prompt', 'prompt_version'])
  if (
    typeof record.prompt !== 'string' ||
    !record.prompt.trim() ||
    record.prompt.trim().length > IMAGE_EDIT_MAX_PROMPT_CHARACTERS ||
    typeof record.prompt_version !== 'string' ||
    !record.prompt_version.trim() ||
    record.identity_input !== 'primary'
  ) {
    throw new StoryConfigError('story_config_contract_invalid')
  }
}

function validateSelection(
  value: unknown,
  pageIndices: ReadonlySet<number>
): readonly number[] {
  const record = asRecord(value)
  assertExactKeys(record, ['page_indices'])
  if (!Array.isArray(record.page_indices) || record.page_indices.length === 0) {
    throw new StoryConfigError('story_config_contract_invalid')
  }
  const seen = new Set<number>()
  const indices = record.page_indices.map((value) => {
    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value < 0 ||
      seen.has(value) ||
      !pageIndices.has(value)
    ) {
      throw new StoryConfigError('story_config_contract_invalid')
    }
    seen.add(value)
    return value
  })
  return Object.freeze(indices)
}

export function validatePrivateStoryConfig(
  value: unknown,
  templateId: string
): ValidatedPrivateStoryConfig {
  const root = asRecord(value)
  if (
    root.schema_version !== 3 ||
    root.asset_layout !== 'single-page' ||
    root.template_id !== templateId ||
    !Array.isArray(root.pages) ||
    root.pages.length === 0
  ) {
    throw new StoryConfigError('story_config_contract_invalid')
  }

  const imageEdit = asRecord(root.image_edit)
  assertExactKeys(imageEdit, ['active_provider', 'contract_version', 'profiles'])
  if (imageEdit.contract_version !== 1 || imageEdit.active_provider !== 'openai') {
    throw new StoryConfigError('story_config_contract_invalid')
  }
  const profiles = asRecord(imageEdit.profiles)
  assertExactKeys(profiles, ['final', 'preview'])
  validateImageEditProfile(profiles.preview, 'preview')
  validateImageEditProfile(profiles.final, 'final')

  const pageIndices = new Set<number>()
  for (const rawPage of root.pages) {
    const page = asRecord(rawPage)
    const index = page.index
    if (
      typeof index !== 'number' ||
      !Number.isInteger(index) ||
      index < 0 ||
      pageIndices.has(index) ||
      typeof page.enable_face_swap !== 'boolean' ||
      typeof page.template_image !== 'string' ||
      !page.template_image.trim()
    ) {
      throw new StoryConfigError('story_config_contract_invalid')
    }
    pageIndices.add(index)
    if (page.enable_face_swap) validatePageImageEdit(page.image_edit)
    else if (page.image_edit !== undefined) {
      throw new StoryConfigError('story_config_contract_invalid')
    }
  }

  const previewPageIndices = validateSelection(root.preview, pageIndices)
  const finalPageIndices = validateSelection(root.final, pageIndices)
  const selected = new Set([...previewPageIndices, ...finalPageIndices])
  if (
    selected.size !== previewPageIndices.length + finalPageIndices.length ||
    selected.size !== pageIndices.size
  ) {
    throw new StoryConfigError('story_config_contract_invalid')
  }

  return Object.freeze({ finalPageIndices })
}

export function parsePrivateStoryConfig(args: {
  body: Buffer
  address: PrivateStoryConfigAddress
  templateId: string
}): ValidatedPrivateStoryConfig {
  if (args.body.length > PRIVATE_STORY_CONFIG_MAX_BYTES) {
    throw new StoryConfigError('story_config_size_exceeded')
  }
  const digest = createHash('sha256').update(args.body).digest('hex')
  if (digest !== args.address.contentSha256) {
    throw new StoryConfigError('story_config_digest_mismatch')
  }
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(args.body)
    assertNoDuplicateJsonKeys(text)
    return validatePrivateStoryConfig(JSON.parse(text), args.templateId)
  } catch (error) {
    if (error instanceof StoryConfigError) throw error
    throw new StoryConfigError('story_config_contract_invalid')
  }
}

function classifyReadStatus(status: number): StoryConfigError {
  if (status === 401 || status === 403) return new StoryConfigError('story_config_read_denied')
  if (status === 404) return new StoryConfigError('story_config_read_missing')
  if (status >= 300 && status < 400) return new StoryConfigError('story_config_read_redirected')
  if (status === 408 || status === 429 || (status >= 500 && status <= 599)) {
    return new StoryConfigError('story_config_read_unavailable')
  }
  return new StoryConfigError('story_config_read_failed')
}

function contentLength(response: IncomingMessage): number | null {
  const raw = response.headers['content-length']
  if (typeof raw !== 'string') return null
  const parsed = Number(raw)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
}

export const nativePrivateStoryConfigTransport: PrivateStoryConfigTransport = async (args) => {
  const trustedOrigin = configuredSupabaseOrigin()
  let parsed: URL
  try {
    parsed = new URL(args.url)
  } catch {
    throw new StoryConfigError('story_config_path_invalid')
  }
  if (parsed.origin !== trustedOrigin) throw new StoryConfigError('story_config_path_invalid')

  return await new Promise<PrivateStoryConfigResponse>((resolve, reject) => {
    let settled = false
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      callback()
    }
    const request = https.request(args.url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${args.serviceKey}`,
        apikey: args.serviceKey,
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
      signal: args.signal,
    }, (response) => {
      const declaredLength = contentLength(response)
      if (declaredLength !== null && declaredLength > args.maxBytes) {
        response.destroy()
        finish(() => reject(new StoryConfigError('story_config_size_exceeded')))
        return
      }
      if ((response.statusCode ?? 0) >= 300 && (response.statusCode ?? 0) < 400) {
        response.destroy()
        finish(() => resolve({ status: response.statusCode ?? 0, body: Buffer.alloc(0) }))
        return
      }
      const chunks: Buffer[] = []
      let totalBytes = 0
      response.on('data', (value: Buffer | Uint8Array | string) => {
        const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value)
        totalBytes += chunk.length
        if (totalBytes > args.maxBytes) {
          response.destroy()
          finish(() => reject(new StoryConfigError('story_config_size_exceeded')))
          return
        }
        chunks.push(chunk)
      })
      response.once('end', () => {
        finish(() => resolve({
          status: response.statusCode ?? 0,
          body: Buffer.concat(chunks, totalBytes),
        }))
      })
      response.once('error', () => {
        finish(() => reject(new StoryConfigError('story_config_read_unavailable')))
      })
    })
    request.once('error', () => {
      finish(() => reject(new StoryConfigError('story_config_read_unavailable')))
    })
    request.setTimeout(args.timeoutMs, () => {
      request.destroy(new StoryConfigError('story_config_read_unavailable'))
    })
    request.end()
  })
}

async function readPrivateStoryConfig(args: {
  address: PrivateStoryConfigAddress
  templateId: string
  serviceKey: string
  transport: PrivateStoryConfigTransport
}): Promise<ValidatedPrivateStoryConfig> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PRIVATE_STORY_CONFIG_TIMEOUT_MS)
  timeout.unref?.()
  let response: PrivateStoryConfigResponse
  try {
    response = await args.transport({
      url: args.address.configUrl,
      serviceKey: args.serviceKey,
      signal: controller.signal,
      timeoutMs: PRIVATE_STORY_CONFIG_TIMEOUT_MS,
      maxBytes: PRIVATE_STORY_CONFIG_MAX_BYTES,
    })
  } catch (error) {
    if (error instanceof StoryConfigError) throw error
    throw new StoryConfigError('story_config_read_unavailable')
  } finally {
    clearTimeout(timeout)
  }
  if (!Number.isInteger(response?.status) || !Buffer.isBuffer(response?.body)) {
    throw new StoryConfigError('story_config_read_unavailable')
  }
  if (response.status < 200 || response.status >= 300) throw classifyReadStatus(response.status)
  return parsePrivateStoryConfig({
    body: response.body,
    address: args.address,
    templateId: args.templateId,
  })
}

function resolveAddress(args: {
  templateId: string
  rawConfigPath: string | null | undefined
  resolveLegacyPublicUrl: (configPath: string) => string | null | undefined
}): StoryConfigAddress {
  return resolveStoryConfigAddress({
    ...args,
    supabaseOrigin: configuredSupabaseOrigin(),
  })
}

export async function prepareStoryConfigForPreview(args: {
  templateId: string
  rawConfigPath: string | null | undefined
  resolveLegacyPublicUrl: (configPath: string) => string | null | undefined
}): Promise<Readonly<{ configUrl: string }>> {
  const address = resolveAddress(args)
  if (address.kind === 'private') {
    await readPrivateStoryConfig({
      address,
      templateId: args.templateId,
      serviceKey: configuredServiceKey(),
      transport: nativePrivateStoryConfigTransport,
    })
  }
  return Object.freeze({ configUrl: address.configUrl })
}

async function readLegacyFinalPageIndices(configUrl: string): Promise<readonly number[]> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PRIVATE_STORY_CONFIG_TIMEOUT_MS)
  timeout.unref?.()
  try {
    const response = await fetch(configUrl, {
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
    })
    if (!response.ok) throw classifyReadStatus(response.status)
    const body = Buffer.from(await response.arrayBuffer())
    if (body.length > PRIVATE_STORY_CONFIG_MAX_BYTES) {
      throw new StoryConfigError('story_config_size_exceeded')
    }
    const config = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)) as UnknownRecord
    const explicit = Array.isArray(config?.final && asRecord(config.final).page_indices)
      ? asRecord(config.final).page_indices as unknown[]
      : []
    const pageIndices = explicit.length
      ? explicit
      : Array.isArray(config?.pages)
        ? config.pages.map((page) => asRecord(page).index)
        : []
    const normalized = pageIndices
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 0)
      .sort((a, b) => a - b)
    if (!normalized.length) throw new StoryConfigError('story_config_contract_invalid')
    return Object.freeze(Array.from(new Set(normalized)))
  } catch (error) {
    if (error instanceof StoryConfigError) throw error
    throw new StoryConfigError('story_config_read_unavailable')
  } finally {
    clearTimeout(timeout)
  }
}

export async function loadStoryConfigForFinal(args: {
  templateId: string
  rawConfigPath: string | null | undefined
  resolveLegacyPublicUrl: (configPath: string) => string | null | undefined
}): Promise<Readonly<{ configUrl: string; finalPageIndices: readonly number[] }>> {
  const address = resolveAddress(args)
  const finalPageIndices = address.kind === 'private'
    ? (await readPrivateStoryConfig({
        address,
        templateId: args.templateId,
        serviceKey: configuredServiceKey(),
        transport: nativePrivateStoryConfigTransport,
      })).finalPageIndices
    : await readLegacyFinalPageIndices(address.configUrl)
  return Object.freeze({ configUrl: address.configUrl, finalPageIndices })
}
