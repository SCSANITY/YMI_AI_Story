import { createClient } from '@supabase/supabase-js'
import {
  createSupabaseServiceAccessToken,
  createSupabaseServiceFetch,
  resolveSupabaseServiceCredential,
} from '@/lib/supabase-service-credential'

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceCredential = resolveSupabaseServiceCredential()
const supabaseServiceAccessToken = createSupabaseServiceAccessToken(
  supabaseServiceCredential
)

if (!supabaseUrl) {
  throw new Error('Missing Supabase service role configuration')
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceCredential.value, {
  auth: {
    persistSession: false,
  },
  global: {
    fetch: createSupabaseServiceFetch(supabaseServiceCredential),
  },
  ...(supabaseServiceAccessToken
    ? {
        accessToken: supabaseServiceAccessToken,
        realtime: { accessToken: supabaseServiceAccessToken },
      }
    : {}),
})
