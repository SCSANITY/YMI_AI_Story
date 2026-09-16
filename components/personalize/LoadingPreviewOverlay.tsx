'use client'

import { memo } from 'react'
import dynamic from 'next/dynamic'
import { createPortal } from 'react-dom'
import { ChevronLeft, Clock3, Info, Sparkles } from 'lucide-react'
import { PreviewCapacityNotice } from '@/components/personalize/PreviewCapacityNotice'
import { formatPreviewCountdown } from '@/components/personalize/loading-progress'

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
  capacityWaiting: boolean
  labels: {
    back: string
    estimateTitle: string
    estimatedWait: string
    estimatedProgress: string
    almostThere: string
    capacityWaitStatus: string
    didYouKnow: string
    capacityTitle: string
    capacityBody: string
  }
  onBack: () => void
}

function LoadingPreviewOverlayComponent({
  show,
  loadingText,
  progress,
  countdownSeconds,
  capacityWaiting,
  labels,
  onBack,
}: LoadingPreviewOverlayProps) {
  if (!show) return null

  const roundedProgress = Math.round(Math.max(0, Math.min(100, progress)))
  const countdown = formatPreviewCountdown(countdownSeconds)

  return createPortal(
    <div className="fixed inset-0 z-[160] flex animate-in flex-col items-center overflow-y-auto bg-gradient-to-br from-amber-50/97 via-white/97 to-orange-50/97 p-5 fade-in duration-200 sm:p-8">
      <button
        type="button"
        onClick={onBack}
        className="absolute left-4 top-4 z-20 inline-flex min-h-11 items-center gap-2 rounded-full border border-white/80 bg-white/75 px-4 text-sm font-semibold text-gray-700 shadow-[0_8px_24px_rgba(148,93,34,0.12)] backdrop-blur-xl transition-colors hover:text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 sm:left-6 sm:top-5"
        aria-label={labels.back}
      >
        <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        <span>{labels.back}</span>
      </button>

      <div className="relative z-10 flex min-h-full w-full max-w-5xl flex-col items-center justify-center py-14 text-center sm:py-10">
        <div className="relative mb-1 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-100 bg-white/80 shadow-[0_12px_26px_rgba(217,119,6,0.12)]">
          <Sparkles className="h-8 w-8 text-amber-500" />
        </div>

        <div className="flex min-h-[6.5rem] w-full max-w-3xl flex-col items-center justify-center px-2">
          <h3 className="mb-2 max-w-3xl font-serif text-2xl font-bold leading-tight text-gray-900 sm:text-3xl">
            {loadingText}
          </h3>
        </div>

        <div className="mx-auto w-full max-w-2xl">
          <section className="mx-auto mb-5 w-full max-w-lg rounded-[1.4rem] border border-amber-100/90 bg-white/78 px-4 py-4 text-left shadow-[0_18px_44px_rgba(148,93,34,0.11)] backdrop-blur-xl sm:px-5" aria-label={labels.estimateTitle}>
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                  <Clock3 className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-amber-700">{labels.estimateTitle}</p>
                  <p className="mt-0.5 text-sm font-medium text-slate-600">
                    {capacityWaiting
                      ? labels.capacityWaitStatus
                      : countdownSeconds > 0
                        ? labels.estimatedWait
                        : labels.almostThere}
                  </p>
                </div>
              </div>
              <time className="shrink-0 font-mono text-3xl font-black tabular-nums tracking-[-0.08em] text-slate-950 sm:text-4xl" role="timer" aria-label={`${labels.estimatedWait} ${countdown}`}>
                {countdown}
              </time>
            </div>

            <div className="mt-4 flex items-center justify-between text-xs font-bold text-slate-600">
              <span>{labels.estimatedProgress}</span>
              <span className="tabular-nums text-amber-800">{roundedProgress}%</span>
            </div>
            <div
              className="relative mt-2 h-3 w-full overflow-hidden rounded-full bg-amber-100/80 shadow-inner"
              role="progressbar"
              aria-label={labels.estimatedProgress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={roundedProgress}
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-400 via-orange-400 to-orange-500 shadow-[0_0_16px_rgba(249,115,22,0.35)] transition-[width] duration-500 ease-linear motion-reduce:transition-none"
                style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
              />
            </div>
          </section>

          <div aria-live="off" className="sr-only">
            {countdownSeconds > 0 ? `${labels.estimatedWait}: ${countdown}` : labels.almostThere}
          </div>

          <PreviewCapacityNotice
            visible={capacityWaiting}
            variant="loading"
            title={labels.capacityTitle}
            body={labels.capacityBody}
          />

          <div className="flex min-h-[260px] w-full items-start justify-center sm:min-h-[300px]">
            <MiniGame />
          </div>

          <p className="mt-3 flex items-center justify-center gap-2 text-sm font-medium text-amber-900">
            <Info className="h-4 w-4 text-amber-500" />
            <span>{labels.didYouKnow}</span>
          </p>
        </div>
      </div>
    </div>,
    document.body
  )
}

export const LoadingPreviewOverlay = memo(LoadingPreviewOverlayComponent)
