export function resolveSupabaseServiceKey(env = process.env) {
  const selected = env.SUPABASE_SECRET_KEY !== undefined
    ? { value: env.SUPABASE_SECRET_KEY, kind: 'secret' }
    : env.SUPABASE_SERVICE_ROLE_KEY !== undefined
      ? { value: env.SUPABASE_SERVICE_ROLE_KEY, kind: 'legacy-service-role' }
      : { value: env.SUPABASE_SERVICE_KEY, kind: 'legacy-service-role' }

  if (
    typeof selected.value !== 'string' ||
    !selected.value ||
    selected.value !== selected.value.trim() ||
    /[\r\n]/.test(selected.value)
  ) {
    throw new Error('Supabase service API key is missing or invalid')
  }
  if (selected.kind === 'secret' && !selected.value.startsWith('sb_secret_')) {
    throw new Error('SUPABASE_SECRET_KEY must contain an sb_secret_ key')
  }
  if (selected.kind === 'legacy-service-role' && selected.value.startsWith('sb_')) {
    throw new Error('Supabase service API key has an invalid key type')
  }
  return Object.freeze(selected)
}

export function createSupabaseServiceFetch(credential, fetchImpl = fetch) {
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

export function supabaseServiceClientOptions(credential) {
  return {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: createSupabaseServiceFetch(credential) },
    ...(credential.kind === 'secret' ? { accessToken: async () => null } : {}),
  }
}
