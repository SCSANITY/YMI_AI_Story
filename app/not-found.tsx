import Link from 'next/link'
import { ArrowLeft, BookOpen } from 'lucide-react'

export default function NotFound() {
  return (
    <main className="page-surface flex min-h-[calc(100dvh-4rem)] items-center justify-center px-4 py-12 text-gray-900">
      <section className="w-full max-w-xl rounded-[28px] border border-white/70 bg-white/80 p-7 text-center shadow-[0_24px_70px_rgba(146,64,14,0.10)] backdrop-blur-xl sm:p-10">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <BookOpen className="h-6 w-6" aria-hidden="true" />
        </div>
        <p className="mt-6 text-xs font-bold uppercase tracking-[0.22em] text-amber-600">Page not found</p>
        <h1 className="mt-2 font-title text-3xl text-gray-900">This story page is not here</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-gray-600">
          The link may be outdated, or the page may have moved.
        </p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href="/books"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-6 text-sm font-semibold text-white shadow-md shadow-amber-200/60 transition hover:from-amber-400 hover:to-orange-400"
          >
            Browse books
          </Link>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-amber-200 bg-white px-6 text-sm font-semibold text-gray-700 transition hover:bg-amber-50"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back home
          </Link>
        </div>
      </section>
    </main>
  )
}
