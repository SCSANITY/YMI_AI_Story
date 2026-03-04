'use server'

import { createServerSupabase } from '@/lib/supabaseServer'

type AuthResult = {
  error?: string
  user?: {
    id: string
    email: string
  }
  otpRequired?: boolean
}

export async function login(formData: FormData): Promise<AuthResult> {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '').trim()

  if (!email || !password) {
    return { error: 'Email and password are required.' }
  }

  const supabase = await createServerSupabase()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { error: error.message }
  }

  if (!data.user) {
    return { error: 'Login failed.' }
  }

  return {
    user: { id: data.user.id, email: data.user.email ?? email },
  }
}

export async function signup(formData: FormData): Promise<AuthResult> {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '').trim()

  if (!email || !password) {
    return { error: 'Email and password are required.' }
  }

  const supabase = await createServerSupabase()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
    },
  })

  if (error) {
    return { error: error.message }
  }

  return { otpRequired: true }
}

export async function verifySignupOtp(formData: FormData): Promise<AuthResult> {
  const email = String(formData.get('email') ?? '').trim()
  const code = String(formData.get('code') ?? '').trim()
  const password = String(formData.get('password') ?? '').trim()

  if (!email || !code || !password) {
    return { error: 'Email, code and password are required.' }
  }

  const supabase = await createServerSupabase()
  let verifyResult = await supabase.auth.verifyOtp({
    email,
    token: code,
    type: 'email',
  })

  if (verifyResult.error) {
    verifyResult = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: 'signup',
    })
  }

  if (verifyResult.error) {
    return { error: verifyResult.error.message }
  }

  if (!verifyResult.data.user) {
    return { error: 'Verification failed.' }
  }

  const { error: updateError } = await supabase.auth.updateUser({ password })
  if (updateError) {
    return { error: updateError.message }
  }

  return {
    user: {
      id: verifyResult.data.user.id,
      email: verifyResult.data.user.email ?? email,
    },
  }
}

export async function signout(): Promise<AuthResult> {
  const supabase = await createServerSupabase()
  const { error } = await supabase.auth.signOut()

  if (error) {
    return { error: error.message }
  }

  return {}
}
