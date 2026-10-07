import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { configuredSupabasePublicKey } from '@/lib/supabase-public-key'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!

export const createServerSupabase = async () => {
  const cookieStore = await cookies()
  const supabasePublicKey = configuredSupabasePublicKey()

  return createServerClient(supabaseUrl, supabasePublicKey.value, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options)
        })
      },
    },
  })
}
