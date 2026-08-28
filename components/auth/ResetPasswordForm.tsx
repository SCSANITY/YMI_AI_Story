'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { CheckCircle2, Eye, EyeOff, KeyRound, LockKeyhole } from 'lucide-react'
import { updateRecoveredPassword } from '@/app/actions/auth'
import { Button } from '@/components/Button'
import { useGlobalContext } from '@/contexts/GlobalContext'
import { MIN_CUSTOMER_PASSWORD_LENGTH } from '@/lib/password-recovery'

type ResetPasswordFormProps = {
  isReady: boolean
}

const INPUT_CLASS =
  'h-12 w-full rounded-xl border border-amber-900/10 bg-white/85 pl-10 pr-11 text-sm text-gray-950 outline-none transition placeholder:text-gray-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-200'

export function ResetPasswordForm({ isReady }: ResetPasswordFormProps) {
  const { openLoginModal } = useGlobalContext()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isComplete, setIsComplete] = useState(false)
  const [isPending, startTransition] = useTransition()

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (isPending || !isReady) return
    setError('')

    startTransition(async () => {
      const formData = new FormData()
      formData.set('password', password)
      formData.set('confirmation', confirmation)
      const result = await updateRecoveredPassword(formData)
      if (result.error) {
        setError(result.error)
        return
      }
      setPassword('')
      setConfirmation('')
      setIsComplete(true)
    })
  }

  if (!isReady) {
    return (
      <div className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
          <KeyRound aria-hidden="true" className="h-6 w-6" />
        </div>
        <h1 className="mt-5 text-2xl font-bold text-gray-950">Reset link unavailable</h1>
        <p className="mt-3 text-sm leading-6 text-gray-600">
          This link is invalid or has expired. Request a new link from the login window.
        </p>
        <Button type="button" size="lg" className="mt-7 w-full" onClick={() => openLoginModal('login')}>
          Return to login
        </Button>
        <Link href="/" className="mt-4 inline-block text-sm font-semibold text-amber-800 hover:text-amber-950">
          Back to YMI Story
        </Link>
      </div>
    )
  }

  if (isComplete) {
    return (
      <div className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
          <CheckCircle2 aria-hidden="true" className="h-6 w-6" />
        </div>
        <h1 className="mt-5 text-2xl font-bold text-gray-950">Password updated</h1>
        <p className="mt-3 text-sm leading-6 text-gray-600">
          Your previous sessions have been signed out. Log in again with your new password.
        </p>
        <Button type="button" size="lg" className="mt-7 w-full" onClick={() => openLoginModal('login')}>
          Log in
        </Button>
        <Link href="/" className="mt-4 inline-block text-sm font-semibold text-amber-800 hover:text-amber-950">
          Return home
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
        <KeyRound aria-hidden="true" className="h-6 w-6" />
      </div>
      <h1 className="mt-5 text-3xl font-bold text-gray-950">Choose a new password</h1>
      <p className="mt-3 text-sm leading-6 text-gray-600">
        Use at least {MIN_CUSTOMER_PASSWORD_LENGTH} characters. This reset link can only be used once.
      </p>

      <div className="mt-7 space-y-4">
        <label className="block text-xs font-semibold text-gray-700">
          New password
          <div className="relative mt-2">
            <LockKeyhole aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={INPUT_CLASS}
              autoComplete="new-password"
              minLength={MIN_CUSTOMER_PASSWORD_LENGTH}
              disabled={isPending}
              required
            />
            <button
              type="button"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              onClick={() => setShowPassword((visible) => !visible)}
              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 transition hover:bg-amber-50 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </label>

        <label className="block text-xs font-semibold text-gray-700">
          Confirm new password
          <div className="relative mt-2">
            <LockKeyhole aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              className={INPUT_CLASS}
              autoComplete="new-password"
              minLength={MIN_CUSTOMER_PASSWORD_LENGTH}
              disabled={isPending}
              required
            />
          </div>
        </label>
      </div>

      {error ? <p role="alert" className="mt-4 text-sm text-red-600">{error}</p> : null}

      <Button type="submit" size="lg" className="mt-6 w-full" disabled={isPending}>
        {isPending ? 'Updating password...' : 'Update password'}
      </Button>
    </form>
  )
}
