import { createHash } from 'node:crypto'
import {
  privateConfigCredentialHeaders,
  type SupabaseServiceCredential,
} from './supabaseCredentials'

import {
  ImageEditContractError,
  resolveValidatedImageEditPage,
  validateImageEditContract,
  type ImageEditProfileName,
  type ResolvedImageEditPage,
  type ValidatedImageEditStoryContract,
} from './imageEditContract'

export const PRIVATE_CONFIG_BUCKET = 'story-config-private' as const
export const PRIVATE_CONFIG_PREFIX = 'story-configs/image-edit/v1' as const
export const PRIVATE_CONFIG_MAX_BYTES = 8 * 1024 * 1024
export const PRIVATE_CONFIG_TIMEOUT_MS = 15_000
export const PRIVATE_CONFIG_MAX_CLAIM_ATTEMPTS = 3 as const

export const PRIVATE_CONFIG_ERROR_CODES = [
  'config_locator_invalid',
  'config_read_unavailable',
  'config_read_denied',
  'config_read_missing',
  'config_read_failed',
  'config_read_redirected',
  'config_size_exceeded',
  'config_digest_mismatch',
  'config_contract_invalid',
] as const

export type PrivateConfigErrorCode = (typeof PRIVATE_CONFIG_ERROR_CODES)[number]

export class PrivateConfigError extends Error {
  readonly disposition = 'not_sent' as const

  constructor(
    readonly code: PrivateConfigErrorCode,
    readonly retryableConfigRead: boolean = false
  ) {
    super(code)
    this.name = 'PrivateConfigError'
  }
}

export type PrivateConfigLocator = Readonly<{
  locator: string
  source_origin: string
  trusted_transport_url: string
  object_key: string
  content_sha256: string
  used_historical_origin_alias: boolean
}>

export type PrivateConfigTransportRequest = Readonly<{
  url: string
  timeoutMs: typeof PRIVATE_CONFIG_TIMEOUT_MS
  maxBytes: typeof PRIVATE_CONFIG_MAX_BYTES
  maxRedirects: 0
  headers: Readonly<{
    Authorization?: string
    apikey?: string
    'Cache-Control': 'no-cache'
    Pragma: 'no-cache'
  }>
  signal: AbortSignal
}>

export type PrivateConfigTransportResponse = Readonly<{
  status: number
  body: Buffer
}>

export type PrivateConfigTransport = (
  request: PrivateConfigTransportRequest
) => Promise<PrivateConfigTransportResponse>

export type PrivateConfigTimeoutScheduler = (
  onTimeout: () => void,
  delayMs: typeof PRIVATE_CONFIG_TIMEOUT_MS
) => () => void

export type PrivateImageEditConfigSnapshot = Readonly<{
  locator: PrivateConfigLocator
  raw_sha256: string
  config: Readonly<Record<string, unknown>>
  validated: ValidatedImageEditStoryContract
  resolvePage: (args: {
    jobType: ImageEditProfileName
    pageIndex: number
    sourceIllustrationMediaType?: unknown
    identityReferenceMediaType?: unknown
  }) => ResolvedImageEditPage
}>

export type ConfigReadRecoveryAction =
  | Readonly<{ action: 'stop'; error_code: PrivateConfigErrorCode }>
  | Readonly<{ action: 'terminal'; error_code: PrivateConfigErrorCode }>
  | Readonly<{ action: 'requeue'; error_code: 'config_read_unavailable' }>

type UnknownRecord = Record<string, unknown>

export function assertPrivateImageEditProviderAuthority(args: {
  provider: unknown
  hasPrivateSnapshot: boolean
}): void {
  if (args.provider === 'openai' && !args.hasPrivateSnapshot) {
    throw new ImageEditContractError(
      'image_edit_contract_missing',
      'OpenAI requires the validated private image_edit snapshot'
    )
  }
}

export function isPrivateConfigLocatorCandidate(value: unknown): value is string {
  return typeof value === 'string' && (
    value.includes(`/${PRIVATE_CONFIG_BUCKET}/`) ||
    value.includes(`/${PRIVATE_CONFIG_PREFIX}/`)
  )
}

export function hasDurableProviderAttemptHistory(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  for (const pageState of Object.values(value as UnknownRecord)) {
    if (!pageState || typeof pageState !== 'object' || Array.isArray(pageState)) continue
    for (const stageState of Object.values(pageState as UnknownRecord)) {
      if (
        stageState &&
        typeof stageState === 'object' &&
        !Array.isArray(stageState) &&
        Object.keys(stageState as UnknownRecord).length > 0
      ) {
        return true
      }
    }
  }
  return false
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Buffer.isBuffer(value) || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const nested of Object.values(value as UnknownRecord)) deepFreeze(nested)
  return value
}

function parseOrigin(value: string): string {
  if (typeof value !== 'string' || !value || value !== value.trim()) {
    throw new PrivateConfigError('config_locator_invalid')
  }
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new PrivateConfigError('config_locator_invalid')
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (parsed.pathname !== '' && parsed.pathname !== '/') ||
    (value !== parsed.origin && value !== `${parsed.origin}/`)
  ) {
    throw new PrivateConfigError('config_locator_invalid')
  }
  return parsed.origin
}

function assertTemplateId(value: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) {
    throw new PrivateConfigError('config_locator_invalid')
  }
  return value
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function resolvePrivateConfigLocator(args: {
  locator: string
  currentOrigin: string
  historicalOrigins?: readonly string[]
  templateId: string
}): PrivateConfigLocator {
  const currentOrigin = parseOrigin(args.currentOrigin)
  const historicalOrigins = new Set(
    (args.historicalOrigins ?? []).map((origin) => parseOrigin(origin))
  )
  historicalOrigins.delete(currentOrigin)
  const templateId = assertTemplateId(args.templateId)

  if (
    typeof args.locator !== 'string' ||
    !args.locator ||
    args.locator !== args.locator.trim() ||
    /[%\\]/.test(args.locator)
  ) {
    throw new PrivateConfigError('config_locator_invalid')
  }

  let parsed: URL
  try {
    parsed = new URL(args.locator)
  } catch {
    throw new PrivateConfigError('config_locator_invalid')
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new PrivateConfigError('config_locator_invalid')
  }

  const sourceOrigin = parsed.origin
  const usedHistoricalOriginAlias = sourceOrigin !== currentOrigin
  if (usedHistoricalOriginAlias && !historicalOrigins.has(sourceOrigin)) {
    throw new PrivateConfigError('config_locator_invalid')
  }

  const match = parsed.pathname.match(new RegExp(
    `^/storage/v1/object/${PRIVATE_CONFIG_BUCKET}/${PRIVATE_CONFIG_PREFIX}/${escapeRegExp(templateId)}/config-([a-f0-9]{64})\\.json$`
  ))
  if (!match) throw new PrivateConfigError('config_locator_invalid')

  const contentSha256 = match[1]
  const objectKey = `${PRIVATE_CONFIG_PREFIX}/${templateId}/config-${contentSha256}.json`
  const canonicalSource = `${sourceOrigin}/storage/v1/object/${PRIVATE_CONFIG_BUCKET}/${objectKey}`
  if (args.locator !== canonicalSource) throw new PrivateConfigError('config_locator_invalid')

  return deepFreeze({
    locator: canonicalSource,
    source_origin: sourceOrigin,
    trusted_transport_url: `${currentOrigin}/storage/v1/object/${PRIVATE_CONFIG_BUCKET}/${objectKey}`,
    object_key: objectKey,
    content_sha256: contentSha256,
    used_historical_origin_alias: usedHistoricalOriginAlias,
  })
}

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex')
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

function classifyStatus(status: number): PrivateConfigError {
  if (status === 401 || status === 403) return new PrivateConfigError('config_read_denied')
  if (status === 404) return new PrivateConfigError('config_read_missing')
  if (status === 408 || status === 429 || (status >= 500 && status <= 599)) {
    return new PrivateConfigError('config_read_unavailable', true)
  }
  if (status >= 300 && status < 400) return new PrivateConfigError('config_read_redirected')
  return new PrivateConfigError('config_read_failed')
}

export async function loadPrivateImageEditConfig(args: {
  locator: string
  currentOrigin: string
  historicalOrigins?: readonly string[]
  templateId: string
  serviceCredential: SupabaseServiceCredential
  transport: PrivateConfigTransport
  validateContract?: typeof validateImageEditContract
  scheduleTimeout?: PrivateConfigTimeoutScheduler
}): Promise<PrivateImageEditConfigSnapshot> {
  const locator = resolvePrivateConfigLocator(args)
  let credentialHeaders: Readonly<{ Authorization?: string; apikey?: string }>
  try {
    credentialHeaders = privateConfigCredentialHeaders(args.serviceCredential)
  } catch {
    throw new PrivateConfigError('config_read_denied')
  }

  const controller = new AbortController()
  const scheduleTimeout: PrivateConfigTimeoutScheduler = args.scheduleTimeout ?? ((onTimeout, delayMs) => {
    const timeout = setTimeout(onTimeout, delayMs)
    timeout.unref?.()
    return () => clearTimeout(timeout)
  })
  let cancelTimeout = () => {}
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    cancelTimeout = scheduleTimeout(() => {
      controller.abort()
      reject(new PrivateConfigError('config_read_unavailable', true))
    }, PRIVATE_CONFIG_TIMEOUT_MS)
  })

  let response: PrivateConfigTransportResponse
  try {
    const request: PrivateConfigTransportRequest = Object.freeze({
      url: locator.trusted_transport_url,
      timeoutMs: PRIVATE_CONFIG_TIMEOUT_MS,
      maxBytes: PRIVATE_CONFIG_MAX_BYTES,
      maxRedirects: 0 as const,
      headers: Object.freeze({
        ...credentialHeaders,
        'Cache-Control': 'no-cache' as const,
        Pragma: 'no-cache' as const,
      }),
      signal: controller.signal,
    })
    response = await Promise.race([args.transport(request), timeoutPromise])
  } catch (error) {
    if (error instanceof PrivateConfigError) throw error
    throw new PrivateConfigError('config_read_unavailable', true)
  } finally {
    cancelTimeout()
  }

  if (!Number.isInteger(response?.status) || !Buffer.isBuffer(response?.body)) {
    throw new PrivateConfigError('config_read_unavailable', true)
  }
  if (response.status < 200 || response.status >= 300) throw classifyStatus(response.status)
  if (response.body.length > PRIVATE_CONFIG_MAX_BYTES) {
    throw new PrivateConfigError('config_size_exceeded')
  }
  const rawSha256 = sha256(response.body)
  if (rawSha256 !== locator.content_sha256) {
    throw new PrivateConfigError('config_digest_mismatch')
  }

  let config: Record<string, unknown>
  let validated: ValidatedImageEditStoryContract
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(response.body)
    const parsed = JSON.parse(text) as unknown
    assertNoDuplicateJsonKeys(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid_json_root')
    config = parsed as Record<string, unknown>
    validated = (args.validateContract ?? validateImageEditContract)(config)
  } catch {
    throw new PrivateConfigError('config_contract_invalid')
  }

  deepFreeze(config)
  const snapshot: PrivateImageEditConfigSnapshot = {
    locator,
    raw_sha256: rawSha256,
    config,
    validated,
    resolvePage: (pageArgs) => resolveValidatedImageEditPage({
      validated,
      ...pageArgs,
    }),
  }
  return deepFreeze(snapshot)
}

export function decideConfigReadRecovery(args: {
  error: unknown
  jobType: unknown
  claimAttempts: unknown
  hasDurableProviderAttempt: boolean
  leaseOwned: boolean
  cancelRequested: boolean
}): ConfigReadRecoveryAction {
  const errorCode = args.error instanceof PrivateConfigError
    ? args.error.code
    : 'config_contract_invalid'
  if (!args.leaseOwned || args.cancelRequested) return deepFreeze({ action: 'stop', error_code: errorCode })
  if (
    !(args.error instanceof PrivateConfigError) ||
    args.error.code !== 'config_read_unavailable' ||
    args.error.retryableConfigRead !== true ||
    args.jobType !== 'preview' ||
    args.hasDurableProviderAttempt ||
    typeof args.claimAttempts !== 'number' ||
    !Number.isInteger(args.claimAttempts) ||
    args.claimAttempts < 1 ||
    args.claimAttempts >= PRIVATE_CONFIG_MAX_CLAIM_ATTEMPTS
  ) {
    return deepFreeze({ action: 'terminal', error_code: errorCode })
  }
  return deepFreeze({ action: 'requeue', error_code: 'config_read_unavailable' })
}
