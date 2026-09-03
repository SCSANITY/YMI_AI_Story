'use client'

import React, { useState, useTransition } from 'react'
import Image from 'next/image'
import {
  ArrowRight,
  BookOpenCheck,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  MessagesSquare,
  PackageCheck,
  ShieldCheck,
} from 'lucide-react'
import { login as loginAction } from '@/app/actions/auth'
import { supabase } from '@/lib/supabase'

const OPERATION_AREAS = [
  { icon: BookOpenCheck, label: 'Final review and releases' },
  { icon: PackageCheck, label: 'Orders and fulfilment' },
  { icon: MessagesSquare, label: 'Customer communications' },
]

const ADMIN_LANDING_PATH = '/admin/finals'

export function AdminLoginClient() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [isGooglePending, setIsGooglePending] = useState(false)
  const [isPending, startTransition] = useTransition()
  const isBusy = isPending || isGooglePending

  const handleLogin = (event: React.FormEvent) => {
    event.preventDefault()
    if (isBusy) return
    setError('')
    setInfo('')

    startTransition(async () => {
      const formData = new FormData()
      formData.set('email', email)
      formData.set('password', password)
      const result = await loginAction(formData)
      if (result?.error) {
        setError(result.error)
        return
      }
      setInfo('Access confirmed. Opening the operations console...')
      // Reload so the protected server layout reads the session cookie written by the action.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(ADMIN_LANDING_PATH)
    })
  }

  const handleGoogleLogin = async () => {
    if (isBusy) return
    setError('')
    setInfo('Redirecting to Google...')
    setIsGooglePending(true)
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(ADMIN_LANDING_PATH)}`
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    })
    if (oauthError) {
      setInfo('')
      setError(oauthError.message)
      setIsGooglePending(false)
    }
  }

  return (
    <main className="ymi-admin-theme min-h-dvh overflow-x-clip p-2 text-[var(--admin-ink)] sm:p-3 lg:p-4">
      <div className="mx-auto flex min-h-[calc(100dvh-1rem)] w-full max-w-[1280px] items-center sm:min-h-[calc(100dvh-1.5rem)] lg:min-h-[calc(100dvh-2rem)]">
        <section className="admin-app grid min-h-[650px] w-full min-w-0 overflow-hidden lg:grid-cols-[minmax(0,0.88fr)_minmax(31rem,1.12fr)]">
          <aside className="relative hidden overflow-hidden bg-[var(--admin-workspace)] px-10 py-9 text-[var(--admin-char-ink)] lg:flex lg:flex-col xl:px-12 xl:py-11">
            <div aria-hidden="true" className="absolute -right-28 -top-36 h-80 w-80 rounded-full border border-white/[0.06]" />
            <div aria-hidden="true" className="absolute -right-8 -top-16 h-52 w-52 rounded-full border border-[var(--admin-accent)]/20" />
            <div className="relative flex items-center gap-4">
              <Image
                src="/logo.webp"
                alt="YMI Story"
                width={512}
                height={436}
                priority
                className="h-12 w-auto shrink-0 drop-shadow-[0_10px_18px_rgba(0,0,0,0.2)]"
              />
              <div className="border-l border-white/[0.1] pl-4">
                <p className="text-sm font-bold tracking-[-0.01em]">Operations</p>
                <p className="mt-0.5 text-xs text-[var(--admin-char-mut)]">Production console</p>
              </div>
            </div>

            <div className="relative my-auto py-10">
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--admin-accent)]">
                Internal workspace
              </p>
              <h1 className="mt-5 max-w-md text-[clamp(2.35rem,3.5vw,4rem)] font-bold leading-[1.03] tracking-[-0.035em]">
                Keep every story operation in view.
              </h1>
              <p className="mt-5 max-w-md text-sm leading-6 text-[var(--admin-char-mut)] xl:text-[15px] xl:leading-7">
                Review production, manage fulfilment, and respond to customers from one focused console.
              </p>

              <div className="mt-9 space-y-3">
                {OPERATION_AREAS.map(({ icon: Icon, label }) => (
                  <div key={label} className="flex items-center gap-3 text-sm font-semibold text-[var(--admin-char-ink)]">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.05] text-[var(--admin-accent)]">
                      <Icon aria-hidden="true" className="h-4 w-4" />
                    </span>
                    {label}
                  </div>
                ))}
              </div>
            </div>

            <div className="relative flex items-center gap-3 border-t border-white/[0.08] pt-5">
              <ShieldCheck aria-hidden="true" className="h-4 w-4 text-[var(--admin-accent)]" />
              <p className="text-xs leading-5 text-[var(--admin-char-mut)]">
                Restricted to authorized YMI Story team members.
              </p>
            </div>
          </aside>

          <div className="flex min-w-0 flex-col bg-[var(--admin-panel)]">
            <header className="flex min-h-16 items-center gap-3 border-b border-[var(--admin-line)] px-5 sm:px-8 lg:hidden">
              <Image
                src="/logo.webp"
                alt="YMI Story"
                width={512}
                height={436}
                priority
                className="h-10 w-auto shrink-0"
              />
              <div className="border-l border-[var(--admin-line)] pl-3">
                <p className="text-sm font-bold">Operations</p>
                <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--admin-muted)]">Production console</p>
              </div>
            </header>

            <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-10 sm:py-12 lg:px-14 xl:px-20">
              <div className="w-full max-w-[440px]">
                <div className="inline-flex items-center gap-2 rounded-full border border-[var(--admin-card-line)] bg-[var(--admin-panel-2)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--admin-muted)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--admin-good)]" />
                  Secure staff access
                </div>
                <h2 className="mt-5 text-3xl font-bold tracking-[-0.025em] text-[var(--admin-ink)] sm:text-[2.35rem]">
                  Welcome back
                </h2>
                <p className="mt-3 text-sm leading-6 text-[var(--admin-muted)]">
                  Sign in with an authorized Admin account to open the YMI Story operations console.
                </p>

                <form onSubmit={handleLogin} className="mt-8 space-y-5">
                  <label className="block text-xs font-bold text-[var(--admin-ink-soft)]">
                    Email address
                    <div className="mt-2 flex min-h-12 items-center gap-3 rounded-xl border border-[var(--admin-card-line)] bg-[var(--admin-card)] px-3.5 shadow-[inset_0_1px_2px_rgba(39,43,36,0.035)] transition focus-within:border-[var(--admin-accent-dp)] focus-within:ring-2 focus-within:ring-[var(--admin-accent)]/20">
                      <Mail aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--admin-muted)]" />
                      <input
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        className="min-w-0 flex-1 bg-transparent text-sm text-[var(--admin-ink)] outline-none placeholder:text-[var(--admin-muted)]/65"
                        placeholder="name@ymistory.com"
                        autoComplete="email"
                        spellCheck={false}
                        disabled={isBusy}
                        required
                      />
                    </div>
                  </label>

                  <label className="block text-xs font-bold text-[var(--admin-ink-soft)]">
                    Password
                    <div className="mt-2 flex min-h-12 items-center gap-3 rounded-xl border border-[var(--admin-card-line)] bg-[var(--admin-card)] px-3.5 shadow-[inset_0_1px_2px_rgba(39,43,36,0.035)] transition focus-within:border-[var(--admin-accent-dp)] focus-within:ring-2 focus-within:ring-[var(--admin-accent)]/20">
                      <LockKeyhole aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--admin-muted)]" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        className="min-w-0 flex-1 bg-transparent text-sm text-[var(--admin-ink)] outline-none placeholder:text-[var(--admin-muted)]/65"
                        placeholder="Enter your password"
                        autoComplete="current-password"
                        disabled={isBusy}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((current) => !current)}
                        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--admin-muted)] transition hover:bg-[var(--admin-panel-2)] hover:text-[var(--admin-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-accent)] lg:h-8 lg:w-8"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        aria-pressed={showPassword}
                        disabled={isBusy}
                      >
                        {showPassword ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}
                      </button>
                    </div>
                  </label>

                  {error ? (
                    <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm leading-5 text-red-700">
                      {error}
                    </p>
                  ) : null}
                  {info ? (
                    <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm leading-5 text-emerald-700">
                      {info}
                    </p>
                  ) : null}

                  <button
                    type="submit"
                    disabled={isBusy}
                    className="group inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-black/5 bg-[var(--admin-accent)] px-5 text-sm font-bold text-[var(--admin-accent-ink)] shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_14px_28px_-20px_rgba(120,86,8,0.8)] transition hover:bg-[#f8d66f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-accent-dp)] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-55"
                  >
                    {isPending ? 'Signing in...' : 'Open operations console'}
                    {!isPending ? <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /> : null}
                  </button>
                </form>

                <div className="my-6 flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--admin-muted)]">
                  <span className="h-px flex-1 bg-[var(--admin-line)]" />
                  or
                  <span className="h-px flex-1 bg-[var(--admin-line)]" />
                </div>

                <button
                  type="button"
                  onClick={() => void handleGoogleLogin()}
                  disabled={isBusy}
                  className="inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-[var(--admin-card-line)] bg-[var(--admin-card)] px-5 text-sm font-semibold text-[var(--admin-ink)] transition hover:bg-[var(--admin-panel-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-accent)] disabled:cursor-wait disabled:opacity-55"
                >
                  <span aria-hidden="true" className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--admin-card-line)] bg-white text-xs font-black text-[#4285f4]">G</span>
                  {isGooglePending ? 'Redirecting...' : 'Continue with Google'}
                </button>

                <div className="mt-8 flex items-center justify-center gap-2 text-center text-[11px] leading-5 text-[var(--admin-muted)]">
                  <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                  Access is protected by account and role verification.
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
