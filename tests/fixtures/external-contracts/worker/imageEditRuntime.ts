import { createHash } from 'node:crypto'
import centralFile from './config/image-edit-runtime.json'

export type ImageEditQuality = 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'auto'
export type ImageEditRuntimeProfile = Readonly<{
  model: string; size: string; quality: ImageEditQuality
  output_format: 'png'; background: 'opaque'; request_timeout_ms: number
}>
export type ImageEditRuntimeConfiguration = Omit<typeof centralFile, 'selected'> & {
  selected: { preview: ImageEditRuntimeProfile | null; final: null }
}
export type ImageEditRuntimeSnapshot = Readonly<{
  schema_version: 1; provider: 'openai'; profile: 'preview'
  parameters: ImageEditRuntimeProfile; config_digest: string; snapshot_digest: string
}>

export class ImageEditRuntimeError extends Error {
  readonly disposition = 'not_sent' as const
  constructor(readonly code: 'image_edit_runtime_invalid' | 'image_edit_runtime_unselected'
    | 'image_edit_runtime_snapshot_invalid' | 'image_edit_profile_blocked') {
    super(code)
    this.name = 'ImageEditRuntimeError'
  }
}

const profileKeys = ['background', 'model', 'output_format', 'quality', 'request_timeout_ms', 'size']
function canonical(value: any): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort()
    .map((key) => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}'
  return JSON.stringify(value)
}
export function runtimeDigest(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex')
}
function freeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const nested of Object.values(value as object)) freeze(nested)
  return Object.freeze(value)
}
export const IMAGE_EDIT_RUNTIME_CONFIGURATION = freeze(centralFile)

export function validateRuntimeProfile(value: unknown,
  configuration: ImageEditRuntimeConfiguration = IMAGE_EDIT_RUNTIME_CONFIGURATION): ImageEditRuntimeProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ImageEditRuntimeError('image_edit_runtime_invalid')
  const v = value as Record<string, unknown>
  const supported = configuration.runtime_supported.preview
  if (configuration.schema_version !== 1 || configuration.provider !== 'openai'
    || Object.keys(v).length !== profileKeys.length || Object.keys(v).some((key) => !profileKeys.includes(key))
    || typeof v.model !== 'string' || !Object.prototype.hasOwnProperty.call(configuration.allowlist, v.model)
    || !configuration.capabilities.quality.includes(v.quality as string)
    || !supported.size.includes(v.size as string)
    || !supported.output_format.includes(v.output_format as string)
    || !supported.background.includes(v.background as string)
    || typeof v.request_timeout_ms !== 'number' || !Number.isSafeInteger(v.request_timeout_ms)
    || v.request_timeout_ms < supported.request_timeout_ms.min || v.request_timeout_ms > supported.request_timeout_ms.max) {
    throw new ImageEditRuntimeError('image_edit_runtime_invalid')
  }
  return freeze({ ...v }) as ImageEditRuntimeProfile
}

export function resolveJobRuntimeSnapshot(args: {
  jobType: 'preview' | 'final'; stored?: unknown; localProfile?: unknown
  configuration?: ImageEditRuntimeConfiguration
}): ImageEditRuntimeSnapshot {
  // Independent of selected.final and story contents; automation stays closed.
  if (args.jobType !== 'preview') throw new ImageEditRuntimeError('image_edit_profile_blocked')
  const configuration = args.configuration ?? IMAGE_EDIT_RUNTIME_CONFIGURATION
  if (args.stored !== undefined && args.stored !== null) {
    const snapshot = args.stored as ImageEditRuntimeSnapshot
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)
      || Object.keys(snapshot).sort().join(',') !== 'config_digest,parameters,profile,provider,schema_version,snapshot_digest'
      || snapshot.schema_version !== 1 || snapshot.provider !== 'openai' || snapshot.profile !== 'preview'
      || !/^[a-f0-9]{64}$/.test(snapshot.config_digest)) throw new ImageEditRuntimeError('image_edit_runtime_snapshot_invalid')
    const { snapshot_digest, ...body } = snapshot
    if (snapshot_digest !== runtimeDigest(body)) throw new ImageEditRuntimeError('image_edit_runtime_snapshot_invalid')
    validateRuntimeProfile(snapshot.parameters, configuration)
    if (args.localProfile !== undefined && canonical(validateRuntimeProfile(args.localProfile, configuration))
      !== canonical(snapshot.parameters)) throw new ImageEditRuntimeError('image_edit_runtime_snapshot_invalid')
    return freeze(JSON.parse(JSON.stringify(snapshot)))
  }
  const selected = args.localProfile !== undefined ? args.localProfile : configuration.selected.preview
  if (selected === null || selected === undefined) throw new ImageEditRuntimeError('image_edit_runtime_unselected')
  const body = { schema_version: 1 as const, provider: 'openai' as const, profile: 'preview' as const,
    parameters: validateRuntimeProfile(selected, configuration), config_digest: runtimeDigest(configuration) }
  return freeze({ ...body, snapshot_digest: runtimeDigest(body) })
}

export async function acquireJobRuntimeSnapshot(args: {
  jobType: 'preview' | 'final'; stored?: unknown
  configuration?: ImageEditRuntimeConfiguration
  persist: (snapshot: ImageEditRuntimeSnapshot) => Promise<void>
}): Promise<ImageEditRuntimeSnapshot> {
  const snapshot = resolveJobRuntimeSnapshot(args)
  if (args.stored === undefined || args.stored === null) await args.persist(snapshot)
  return snapshot
}
