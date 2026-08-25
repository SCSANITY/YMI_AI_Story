'use client'

import React, { memo } from 'react'
import dynamic from 'next/dynamic'
import { ChevronLeft, Info, Sparkles } from 'lucide-react'

const MiniGame = dynamic(() => import('@/components/MiniGame').then((module) => module.MiniGame), {
  ssr: false,
  loading: () => (
    <div className="mb-5 w-full max-w-5xl rounded-[24px] border border-amber-100/80 bg-white/70 p-2 shadow-[0_12px_30px_rgba(148,93,34,0.10)] md:p-2.5">
      <div className="aspect-[560/360] w-full animate-pulse rounded-2xl border border-white/70 bg-amber-50/80 shadow-sm sm:aspect-[960/360]" />
    </div>
  ),
})

type LoadingPreviewOverlayProps = {
  show: boolean
  loadingText: string
  progress: number
  countdownSeconds: number
  labels: {
    back: string
    estimatedWait: string
    almostThere: string
    didYouKnow: string
  }
  onBack: () => void
}

function LoadingPreviewOverlayComponent({
  show,
  loadingText,
  progress,
  countdownSeconds,
  labels,
  onBack,
}: LoadingPreviewOverlayProps) {
  if (!show) return null

  return (
    <div className="fixed inset-0 z-[60] flex animate-in flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-amber-50/97 via-white/97 to-orange-50/97 p-5 fade-in duration-200 sm:p-8">
      <button
        type="button"
        onClick={onBack}
        className="absolute left-4 top-4 z-20 inline-flex min-h-11 items-center gap-2 rounded-full border border-white/80 bg-white/75 px-4 text-sm font-semibold text-gray-700 shadow-[0_8px_24px_rgba(148,93,34,0.12)] backdrop-blur-xl transition-colors hover:text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 sm:left-6 sm:top-5"
        aria-label={labels.back}
      >
        <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        <span>{labels.back}</span>
      </button>

      <div className="relative z-10 flex w-full max-w-5xl flex-col items-center text-center">
        <div className="relative mb-1 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-100 bg-white/80 shadow-[0_12px_26px_rgba(217,119,6,0.12)]">
          <Sparkles className="h-8 w-8 text-amber-500" />
        </div>

        <div className="flex h-[7.25rem] w-full max-w-3xl flex-col items-center justify-center px-2 sm:h-[7.5rem]">
          <h3 className="mb-2 max-w-3xl font-serif text-2xl font-bold leading-tight text-gray-900 sm:text-3xl">
            {loadingText}
          </h3>
          <p className="font-mono text-sm text-gray-500">
            {countdownSeconds > 0 ? labels.estimatedWait : labels.almostThere}
          </p>
        </div>

        <div className="mx-auto w-full max-w-2xl">
          <div className="relative mx-auto mb-5 h-2 w-full max-w-lg overflow-hidden rounded-full bg-gray-200 shadow-inner">
            <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-[width] duration-300 ease-out" style={{ width: `${progress}%` }} />
          </div>

          <div className="flex min-h-[260px] w-full items-start justify-center sm:min-h-[300px]">
            <MiniGame />
          </div>

          <p className="mt-3 flex items-center justify-center gap-2 text-sm font-medium text-amber-900">
            <Info className="h-4 w-4 text-amber-500" />
            <span>{labels.didYouKnow}</span>
          </p>
        </div>
      </div>
    </div>
  )
}

export const LoadingPreviewOverlay = memo(LoadingPreviewOverlayComponent)
