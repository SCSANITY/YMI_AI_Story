import type { Metadata } from 'next'
import Image from 'next/image'
import { cookies } from 'next/headers'
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm'
import { createServerSupabase } from '@/lib/supabaseServer'
import { PASSWORD_RECOVERY_COOKIE } from '@/lib/password-recovery'

export const metadata: Metadata = {
  title: 'Reset password',
  robots: { index: false, follow: false },
}

export default async function ResetPasswordPage() {
  const cookieStore = await cookies()
  const hasRecoveryIntent = cookieStore.get(PASSWORD_RECOVERY_COOKIE)?.value === '1'
  let hasRecoverySession = false

  if (hasRecoveryIntent) {
    const supabase = await createServerSupabase()
    const { data, error } = await supabase.auth.getUser()
    hasRecoverySession = !error && Boolean(data.user)
  }

  return (
    <main className="relative flex min-h-[calc(100dvh-5rem)] items-center justify-center overflow-hidden bg-[#fff9ef] px-4 py-10 sm:px-6">
      <div aria-hidden="true" className="absolute -left-24 top-12 h-64 w-64 rounded-full bg-amber-200/25 blur-3xl" />
      <div aria-hidden="true" className="absolute -right-20 bottom-6 h-72 w-72 rounded-full bg-orange-200/20 blur-3xl" />
      <section className="relative w-full max-w-md rounded-2xl border border-white/80 bg-white/78 p-6 shadow-[0_24px_70px_rgba(128,78,30,0.14)] backdrop-blur-xl sm:p-8">
        <Image
          src="/logo.webp"
          alt="YMI Story"
          width={512}
          height={436}
          priority
          className="mb-7 h-12 w-auto"
        />
        <ResetPasswordForm isReady={hasRecoveryIntent && hasRecoverySession} />
      </section>
    </main>
  )
}
