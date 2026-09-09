'use client'

import { memo } from 'react'
import { Clock3, Sparkles } from 'lucide-react'

type PreviewCapacityNoticeProps = {
  visible: boolean
  variant: 'loading' | 'photo'
  title: string
  body: string
}

function PreviewCapacityNoticeComponent({
  visible,
  variant,
  title,
  body,
}: PreviewCapacityNoticeProps) {
  if (!visible) return null

  const loading = variant === 'loading'

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={`animate-in fade-in slide-in-from-bottom-2 duration-500 ${
        loading
          ? 'mx-auto mb-5 flex w-full max-w-xl items-start gap-3 rounded-[22px] border border-amber-200/80 bg-white/84 px-4 py-3 text-left shadow-[0_16px_38px_rgba(180,83,9,0.13)] backdrop-blur-xl sm:px-5 sm:py-4'
          : 'mx-auto mt-3 flex w-full max-w-lg items-start gap-3 rounded-2xl border border-amber-200/75 bg-gradient-to-r from-amber-50/95 via-white/95 to-orange-50/95 px-4 py-3 text-left shadow-[0_10px_28px_rgba(180,83,9,0.11)] backdrop-blur-lg'
      }`}
    >
      <span
        className={`relative flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-[0_6px_16px_rgba(245,158,11,0.28)] ${
          loading ? 'h-10 w-10' : 'h-9 w-9'
        }`}
        aria-hidden="true"
      >
        {loading ? <Sparkles className="h-5 w-5" /> : <Clock3 className="h-4 w-4" />}
        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-pulse rounded-full border-2 border-white bg-amber-300" />
      </span>
      <span className="min-w-0">
        <span className={`block font-serif font-bold leading-snug text-gray-900 ${loading ? 'text-base sm:text-lg' : 'text-sm sm:text-base'}`}>
          {title}
        </span>
        <span className={`mt-0.5 block leading-relaxed text-gray-600 ${loading ? 'text-xs sm:text-sm' : 'text-xs'}`}>
          {body}
        </span>
      </span>
    </div>
  )
}

export const PreviewCapacityNotice = memo(PreviewCapacityNoticeComponent)
