import 'server-only'

import type { User } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabaseServer'
import { parseAuthenticatedClaims, type AuthenticatedClaims } from '@/lib/authenticated-claims'
export type { AuthenticatedClaims } from '@/lib/authenticated-claims'
export { parseAuthenticatedClaims } from '@/lib/authenticated-claims'

export async function getAuthenticatedClaims(): Promise<AuthenticatedClaims | null> {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase.auth.getClaims()
  return parseAuthenticatedClaims(data, error)
}

export async function getAuthenticatedUser(): Promise<User | null> {
  const supabase = await createServerSupabase()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  return error || !user?.id ? null : user
}
