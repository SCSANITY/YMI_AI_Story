import 'server-only'

export type SupabaseServiceCredential = Readonly<{
  value: string
  kind: 'secret' | 'legacy-service-role'
  source: 'SUPABASE_SECRET_KEY' | 'SUPABASE_SERVICE_ROLE_KEY' | 'SUPABASE_SERVICE_KEY'
}>

type SupabaseServiceEnvironment = Readonly<Record<string, string | undefined> & {
  SUPABASE_SECRET_KEY?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
  SUPABASE_SERVICE_KEY?: string
}>

function classifyServiceKey(value: string, source: SupabaseServiceCredential['source']): SupabaseServiceCredential {
  if (!value || value !== value.trim() || /[\r\n]/.test(value)) {
    throw new Error('Supabase service API key is missing or invalid')
  }
  if (value.startsWith('sb_secret_')) {
    return Object.freeze({ value, kind: 'secret' as const, source })
  }
  if (value.startsWith('sb_')) {
    throw new Error('Supabase service API key has an invalid key type')
  }
  if (source === 'SUPABASE_SECRET_KEY') {
    throw new Error('SUPABASE_SECRET_KEY must contain an sb_secret_ key')
  }
  return Object.freeze({ value, kind: 'legacy-service-role' as const, source })
}

export function resolveSupabaseServiceCredential(
  env: SupabaseServiceEnvironment = process.env
): SupabaseServiceCredential {
  if (env.SUPABASE_SECRET_KEY !== undefined) {
    return classifyServiceKey(env.SUPABASE_SECRET_KEY, 'SUPABASE_SECRET_KEY')
  }
  if (env.SUPABASE_SERVICE_ROLE_KEY !== undefined) {
    return classifyServiceKey(env.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY')
  }
  if (env.SUPABASE_SERVICE_KEY !== undefined) {
    return classifyServiceKey(env.SUPABASE_SERVICE_KEY, 'SUPABASE_SERVICE_KEY')
  }
  throw new Error('Supabase service API key is missing or invalid')
}

export function supabaseServiceRequestHeaders(
  credential: SupabaseServiceCredential
): Readonly<Record<string, string>> {
  if (credential.kind === 'secret') {
    return Object.freeze({ apikey: credential.value })
  }
  return Object.freeze({
    Authorization: `Bearer ${credential.value}`,
    apikey: credential.value,
  })
}

export function createSupabaseServiceFetch(
  credential: SupabaseServiceCredential,
  fetchImpl: typeof fetch = fetch
): typeof fetch {
  return async (input, init) => {
    const headers = new Headers(init?.headers)
    if (!headers.has('apikey')) headers.set('apikey', credential.value)
    if (
      credential.kind === 'secret' &&
      headers.get('Authorization') === `Bearer ${credential.value}`
    ) {
      headers.delete('Authorization')
    }
    return fetchImpl(input, { ...init, headers })
  }
}
