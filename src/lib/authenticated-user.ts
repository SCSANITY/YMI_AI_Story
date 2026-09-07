import 'server-only'

import type { User } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabaseServer'

export async function getAuthenticatedUser(): Promise<User | null> {
  const supabase = await createServerSupabase()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  return error || !user?.id ? null : user
}
