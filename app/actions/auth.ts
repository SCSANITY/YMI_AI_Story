'use server'

import { cookies } from 'next/headers'
import { createServerSupabase } from '@/lib/supabaseServer'
import { recordExternalEmailObserved } from '@/lib/emailEvents'
import { buildAbsoluteUrl } from '@/lib/site-url'
import {
  PASSWORD_RECOVERY_COOKIE,
  PASSWORD_RESET_REQUESTED_MESSAGE,
  validateRecoveredPassword,
} from '@/lib/password-recovery'

type AuthResult = {
  error?: string
  user?: {
    id: string
    email: string
  }
  otpRequired?: boolean
}

type PasswordResetRequestResult = {
  error?: string
  message?: string
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

  try {
    const bucket = new Date().toISOString().slice(0, 13)
    await recordExternalEmailObserved({
      emailKey: 'supabase_signup_otp',
      provider: 'supabase_auth',
      idempotencyKey: `supabase_auth_external:${email.toLowerCase()}:signup:${bucket}`,
      toEmail: email.toLowerCase(),
      subject: 'Supabase signup verification email',
      context: {
        purpose: 'signup',
        trigger: 'signup_action',
      },
    })
  } catch (emailEventError) {
    console.error('[email-events] failed to record supabase auth email observation', emailEventError)
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

export async function requestPasswordReset(
  formData: FormData
): Promise<PasswordResetRequestResult> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()

  if (!email) {
    return { error: 'Enter your email address.' }
  }

  const supabase = await createServerSupabase()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: buildAbsoluteUrl('/auth/recovery/callback'),
  })

  if (error) {
    console.error('[auth] password reset request failed:', error.message)
    return { error: 'We could not send a reset email right now. Please try again later.' }
  }

  try {
    const bucket = new Date().toISOString().slice(0, 13)
    await recordExternalEmailObserved({
      emailKey: 'supabase_password_recovery',
      provider: 'supabase_auth',
      idempotencyKey: `supabase_auth_external:${email}:password_recovery:${bucket}`,
      toEmail: email,
      subject: 'Supabase password recovery email',
      context: {
        purpose: 'password_recovery',
        trigger: 'password_reset_action',
      },
    })
  } catch (emailEventError) {
    console.error('[email-events] failed to record password recovery observation', emailEventError)
  }

  return { message: PASSWORD_RESET_REQUESTED_MESSAGE }
}

export async function updateRecoveredPassword(
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const password = String(formData.get('password') ?? '')
  const confirmation = String(formData.get('confirmation') ?? '')
  const validationError = validateRecoveredPassword(password, confirmation)

  if (validationError) {
    return { error: validationError }
  }

  const cookieStore = await cookies()
  if (cookieStore.get(PASSWORD_RECOVERY_COOKIE)?.value !== '1') {
    return { error: 'This password reset link is invalid or has expired.' }
  }

  const supabase = await createServerSupabase()
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) {
    return { error: 'This password reset link is invalid or has expired.' }
  }

  const { error: updateError } = await supabase.auth.updateUser({ password })
  if (updateError) {
    console.error('[auth] recovered password update failed:', updateError.message)
    const normalizedMessage = updateError.message.toLowerCase()
    if (normalizedMessage.includes('password') && normalizedMessage.includes('weak')) {
      return { error: 'Choose a stronger password and try again.' }
    }
    return { error: 'We could not update your password. Please request a new reset link.' }
  }

  const { error: signoutError } = await supabase.auth.signOut({ scope: 'global' })
  if (signoutError) {
    console.error('[auth] password reset sign-out failed:', signoutError.message)
  }

  cookieStore.delete(PASSWORD_RECOVERY_COOKIE)
  return { success: true }
}

export async function signout(): Promise<AuthResult> {
  const supabase = await createServerSupabase()
  const { error } = await supabase.auth.signOut()

  if (error) {
    return { error: error.message }
  }

  return {}
}
