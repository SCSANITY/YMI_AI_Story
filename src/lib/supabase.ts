import { createBrowserClient } from '@supabase/ssr'
import { configuredSupabasePublicKey } from '@/lib/supabase-public-key'

// We will generate types later, for now use 'any' or a placeholder
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabasePublicKey = configuredSupabasePublicKey()

export const supabase = createBrowserClient(supabaseUrl, supabasePublicKey.value)
