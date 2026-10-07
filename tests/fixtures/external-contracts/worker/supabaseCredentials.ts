export type SupabaseServiceCredential = Readonly<{
  value: string
  kind: 'secret' | 'legacy-service-role'
  source: 'SUPABASE_SECRET_KEY' | 'SUPABASE_SERVICE_KEY' | 'SUPABASE_SERVICE_ROLE_KEY'
}>

type RuntimeEnv = Readonly<Record<string, string | undefined>>

function classifyServiceKey(
  value: string,
  source: SupabaseServiceCredential['source']
): SupabaseServiceCredential {
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
  env: RuntimeEnv = process.env
): SupabaseServiceCredential {
  if (env.SUPABASE_SECRET_KEY !== undefined) {
    return classifyServiceKey(env.SUPABASE_SECRET_KEY, 'SUPABASE_SECRET_KEY')
  }
  if (env.SUPABASE_SERVICE_KEY !== undefined) {
    return classifyServiceKey(env.SUPABASE_SERVICE_KEY, 'SUPABASE_SERVICE_KEY')
  }
  if (env.SUPABASE_SERVICE_ROLE_KEY !== undefined) {
    return classifyServiceKey(env.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY')
  }
  throw new Error('Supabase service API key is missing or invalid')
}

export function privateConfigCredentialHeaders(
  credential: SupabaseServiceCredential
): Readonly<{ Authorization?: string; apikey?: string }> {
  const validated = classifyServiceKey(credential.value, credential.source)
  if (validated.kind === 'secret') {
    return Object.freeze({ apikey: validated.value })
  }
  return Object.freeze({ Authorization: `Bearer ${validated.value}` })
}

export function createSupabaseServiceFetch(
  credential: SupabaseServiceCredential,
  fetchImpl: typeof fetch = fetch
): typeof fetch {
  const validated = classifyServiceKey(credential.value, credential.source)
  return async (input, init) => {
    const headers = new Headers(init?.headers)
    if (!headers.has('apikey')) headers.set('apikey', validated.value)
    if (
      validated.kind === 'secret' &&
      headers.get('Authorization') === `Bearer ${validated.value}`
    ) {
      headers.delete('Authorization')
    }
    return fetchImpl(input, { ...init, headers })
  }
}

export function createSupabaseServiceAccessToken(
  credential: SupabaseServiceCredential
): (() => Promise<null>) | undefined {
  const validated = classifyServiceKey(credential.value, credential.source)
  if (validated.kind === 'legacy-service-role') return undefined
  return async () => null
}

export async function configureRealtimeServiceCredential(
  realtime: Readonly<{ setAuth(token: string): Promise<unknown> }>,
  credential: SupabaseServiceCredential
): Promise<'apikey-only' | 'legacy-jwt'> {
  const validated = classifyServiceKey(credential.value, credential.source)
  if (validated.kind === 'secret') return 'apikey-only'
  await realtime.setAuth(validated.value)
  return 'legacy-jwt'
}
