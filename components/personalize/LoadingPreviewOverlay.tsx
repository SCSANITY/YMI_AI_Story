'use client'

import React, { memo } from 'react'
import dynamic from 'next/dynamic'
import { Info, Sparkles } from 'lucide-react'

const MiniGame = dynamic(() => import('@/components/MiniGame').then((module) => module.MiniGame), {
  ssr: false,
  loading: () => (
    <div className="h-[220px] w-full max-w-3xl animate-pulse rounded-2xl border border-amber-100 bg-white/70 sm:h-[300px]" />
  ),
})

type LoadingPreviewOverlayProps = {
  show: boolean
  loadingText: string
  progress: number
  countdownSeconds: number
  labels: {
    estimatedWait: string
    almostThere: string
    didYouKnow: string
  }
}

function LoadingPreviewOverlayComponent({
  show,
  loadingText,
  progress,
  countdownSeconds,
  labels,
}: LoadingPreviewOverlayProps) {
  if (!show) return null

  return (
    <div className="fixed inset-0 z-[60] flex animate-in flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-amber-50/97 via-white/97 to-orange-50/97 p-5 fade-in duration-200 sm:p-8">
      <div className="relative z-10 flex w-full max-w-5xl flex-col items-center space-y-5 text-center sm:space-y-6">
        <div className="relative mb-1 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-100 bg-white/80 shadow-[0_12px_26px_rgba(217,119,6,0.12)]">
          <Sparkles className="h-8 w-8 text-amber-500" />
        </div>

        <div>
          <h3 className="mb-2 font-serif text-2xl font-bold text-gray-900 sm:text-3xl">
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

          <div className="flex justify-center">
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
