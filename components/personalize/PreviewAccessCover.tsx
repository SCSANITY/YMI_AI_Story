'use client'

import { memo } from 'react'
import { ArrowLeft, BookOpenCheck, LoaderCircle, ShieldAlert } from 'lucide-react'

type Props = {
  mode: 'restoring' | 'unavailable'
  title: string
  body: string
  actionLabel?: string
  onAction?: () => void
}

function PreviewAccessCoverComponent({ mode, title, body, actionLabel, onAction }: Props) {
  const unavailable = mode === 'unavailable'

  return (
    <div
      data-preview-access-state={mode}
      className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-r-lg border border-amber-200/75 bg-gradient-to-br from-[#fffaf0] via-[#fff5e5] to-[#ffead4] px-6 text-center shadow-[inset_7px_0_12px_-10px_rgba(120,53,15,0.42)]"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-2 border-r border-amber-200/60 bg-amber-100/70" />
      <div className="relative mb-5 flex h-16 w-16 items-center justify-center rounded-[22px] border border-white/90 bg-white/72 text-amber-700 shadow-[0_15px_35px_rgba(180,93,22,0.12)]">
        {unavailable ? (
          <ShieldAlert className="h-8 w-8" aria-hidden="true" />
        ) : (
          <>
            <BookOpenCheck className="h-8 w-8" aria-hidden="true" />
            <LoaderCircle className="absolute -bottom-1 -right-1 h-6 w-6 animate-spin rounded-full bg-white p-1 text-orange-500 motion-reduce:animate-none" aria-hidden="true" />
          </>
        )}
      </div>
      <p role="status" className="max-w-[310px] font-serif text-xl font-bold leading-tight text-slate-950 md:text-2xl">
        {title}
      </p>
      <p className="mt-3 max-w-[310px] text-sm leading-6 text-slate-600">{body}</p>
      {unavailable && actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-amber-600 px-5 text-sm font-bold text-white shadow-[0_10px_24px_rgba(217,119,6,0.22)] transition hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:ring-offset-2"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}

export const PreviewAccessCover = memo(PreviewAccessCoverComponent)
