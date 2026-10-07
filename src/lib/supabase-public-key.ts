export type SupabasePublicKey = Readonly<{
  value: string
  kind: 'publishable' | 'legacy-anon'
}>

function assertConfiguredKey(value: string | undefined, expectedKind: SupabasePublicKey['kind']): string {
  if (typeof value !== 'string' || !value || value !== value.trim() || /[\r\n]/.test(value)) {
    throw new Error('Supabase public API key is missing or invalid')
  }
  if (expectedKind === 'publishable' && !value.startsWith('sb_publishable_')) {
    throw new Error('Supabase publishable API key has an invalid format')
  }
  if (expectedKind === 'legacy-anon' && value.startsWith('sb_')) {
    throw new Error('Supabase legacy anonymous key has an invalid format')
  }
  return value
}

export function resolveSupabasePublicKey(
  publishableKey: string | undefined,
  legacyAnonKey: string | undefined
): SupabasePublicKey {
  if (publishableKey !== undefined) {
    return Object.freeze({
      value: assertConfiguredKey(publishableKey, 'publishable'),
      kind: 'publishable' as const,
    })
  }
  return Object.freeze({
    value: assertConfiguredKey(legacyAnonKey, 'legacy-anon'),
    kind: 'legacy-anon' as const,
  })
}

export function configuredSupabasePublicKey(): SupabasePublicKey {
  // Keep these exact property reads: Next.js inlines NEXT_PUBLIC_* values only
  // when the property name is statically visible at build time.
  return resolveSupabasePublicKey(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
}
