import { createClient } from '@supabase/supabase-js'
import {
  createSupabaseServiceFetch,
  resolveSupabaseServiceCredential,
} from '@/lib/supabase-service-credential'

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceCredential = resolveSupabaseServiceCredential()

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
})
