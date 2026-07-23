'use client'

import Link from 'next/link'
import { RotateCcw, TriangleAlert } from 'lucide-react'

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <section className="flex min-h-[50dvh] items-center justify-center py-10">
      <div className="w-full max-w-xl rounded-lg border border-rose-300/20 bg-rose-300/[0.06] p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rose-300/10 text-rose-200">
            <TriangleAlert aria-hidden="true" className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-rose-200">Admin request failed</p>
            <h1 className="mt-1 text-xl font-semibold text-white">This section could not be loaded</h1>
            <p className="mt-2 break-words text-sm leading-6 text-slate-300">
              {error.message || 'The server returned an unexpected error.'}
            </p>
            {error.digest ? <p className="mt-2 text-xs text-slate-500">Reference: {error.digest}</p> : null}
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-amber-400 px-4 text-sm font-bold text-slate-950 transition-colors hover:bg-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"
          >
            <RotateCcw aria-hidden="true" className="h-4 w-4" />
            Try again
          </button>
          <Link
            href="/admin/finals"
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-white/10 px-4 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
          >
            Go to Final Review
          </Link>
        </div>
      </div>
    </section>
  )
}
