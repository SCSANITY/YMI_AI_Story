import { createServerSupabase } from '@/lib/supabaseServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export type AdminCustomer = {
  customer_id: string
  email: string | null
  display_name: string | null
  role: 'customer' | 'admin'
}

export async function getAuthenticatedCustomer(): Promise<AdminCustomer | null> {
  const supabase = await createServerSupabase()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user?.id) return null

  const { data, error } = await supabaseAdmin
    .from('customers')
    .select('customer_id, email, display_name, role')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (error || !data?.customer_id) return null
  return data as AdminCustomer
}

export async function requireAdminCustomer(): Promise<AdminCustomer | null> {
  const customer = await getAuthenticatedCustomer()
  if (!customer || customer.role !== 'admin') return null
  return customer
}
