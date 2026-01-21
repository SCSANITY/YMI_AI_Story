import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

export async function getCurrentUser(): Promise<User | null> {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  return data.user ?? null
}

export async function signInWithEmail(email: string): Promise<void> {
  if (!email) {
    throw new Error('Email is required')
  }
  const { error } = await supabase.auth.signInWithOtp({ email })
  if (error) throw error
}
