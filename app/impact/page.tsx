'use client'

import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function ImpactPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnTo = searchParams?.get('returnTo')?.trim() || '/checkout'

  return (
    <div className="page-surface min-h-screen">
      <div className="mx-auto max-w-4xl px-4 py-10 md:px-8 md:py-14">
        <section className="glass-panel rounded-[2rem] px-6 py-8 md:px-10 md:py-12">
          <div className="inline-flex rounded-full border border-white/70 bg-white/65 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-600 shadow-sm">
            Impact
          </div>
          <h1 className="mt-4 font-title text-3xl leading-tight text-slate-900 md:text-5xl">
            Our Children&apos;s Impact Program
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 md:text-base">
            This page is currently a placeholder. We will connect the full details of our giving program here in a later update.
          </p>

          <div className="mt-8 rounded-[1.5rem] border border-white/75 bg-white/70 p-5 text-sm leading-7 text-slate-600 shadow-[0_16px_44px_rgba(15,23,42,0.06)]">
            For now, the checkout page can link here as a temporary information shell while we finalize the long-form content, partner details, and reporting format.
          </div>

          <div className="mt-8">
            <button
              type="button"
              onClick={() => router.push(returnTo)}
              className="glass-action-btn glass-action-btn--brand inline-flex h-11 items-center justify-center rounded-full px-6 text-sm font-semibold"
            >
              Back to Checkout
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}

export default function ImpactPage() {
  return (
    <Suspense fallback={null}>
      <ImpactPageContent />
    </Suspense>
  )
}
