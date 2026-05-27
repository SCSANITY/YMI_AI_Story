'use client'

import React, { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, Mail, Shield, Sparkles } from 'lucide-react'
import { login as loginAction } from '@/app/actions/auth'
import { supabase } from '@/lib/supabase'

export function AdminLoginClient() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [isPending, startTransition] = useTransition()

  const handleLogin = (event: React.FormEvent) => {
    event.preventDefault()
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
      setInfo('Signed in. Redirecting to dashboard...')
      router.push('/admin/finals')
    })
  }

  const handleGoogleLogin = async () => {
    setError('')
    setInfo('Redirecting to Google...')
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent('/admin')}`
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    })
    if (oauthError) {
      setInfo('')
      setError(oauthError.message)
    }
  }

  return (
    <main className="min-h-screen bg-[#0b1120] px-4 py-10 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl items-center justify-center">
        <section className="grid w-full overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.06] shadow-[0_30px_120px_rgba(0,0,0,0.45)] backdrop-blur-2xl lg:grid-cols-[0.9fr_1.1fr]">
          <div className="relative hidden min-h-[620px] overflow-hidden bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 p-10 lg:block">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.34),transparent_28%),radial-gradient(circle_at_80%_70%,rgba(255,255,255,0.24),transparent_32%)]" />
            <div className="relative z-10 flex h-full flex-col justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-white/18 px-4 py-2 text-sm font-semibold backdrop-blur">
                  <Shield className="h-4 w-4" />
                  YMI Internal
                </div>
                <h1 className="mt-8 max-w-sm text-5xl font-bold leading-tight">
                  Manage story updates without touching the public site.
                </h1>
              </div>
              <div className="rounded-3xl border border-white/20 bg-white/16 p-5 backdrop-blur-xl">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Sparkles className="h-4 w-4" />
                  Admin V1
                </div>
                <p className="mt-3 text-sm leading-6 text-white/82">
                  Announcements are live. Data overview, banner management, and book package tools are reserved for the next phases.
                </p>
              </div>
            </div>
          </div>

          <div className="p-6 sm:p-10 lg:p-12">
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-amber-300">Admin Portal</p>
            <h2 className="mt-4 text-4xl font-bold text-white">Sign in</h2>
            <p className="mt-3 max-w-md text-sm leading-6 text-slate-300">
              Use an admin account to continue. Customer accounts are blocked from this dashboard.
            </p>

            <form onSubmit={handleLogin} className="mt-8 space-y-4">
              <label className="block text-sm font-semibold text-slate-200">
                Email
                <div className="mt-2 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3">
                  <Mail className="h-4 w-4 text-slate-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
                    placeholder="admin@ymistory.com"
                    required
                  />
                </div>
              </label>
              <label className="block text-sm font-semibold text-slate-200">
                Password
                <div className="mt-2 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3">
                  <Lock className="h-4 w-4 text-slate-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
                    placeholder="********"
                    required
                  />
                </div>
              </label>

              {error ? <p className="rounded-2xl bg-red-500/14 px-4 py-3 text-sm text-red-200">{error}</p> : null}
              {info ? <p className="rounded-2xl bg-emerald-500/14 px-4 py-3 text-sm text-emerald-200">{info}</p> : null}

              <button
                type="submit"
                disabled={isPending}
                className="w-full rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 px-5 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-orange-950/30 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending ? 'Signing in...' : 'Sign in to Admin'}
              </button>
            </form>

            <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-slate-500">
              <span className="h-px flex-1 bg-white/10" />
              or
              <span className="h-px flex-1 bg-white/10" />
            </div>

            <button
              type="button"
              onClick={handleGoogleLogin}
              className="w-full rounded-2xl border border-white/12 bg-white/[0.08] px-5 py-3 text-sm font-semibold text-white transition hover:border-amber-300/40 hover:bg-white/[0.12]"
            >
              Continue with Google
            </button>
          </div>
        </section>
      </div>
    </main>
  )
}
