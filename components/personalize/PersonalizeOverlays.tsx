'use client'

import React, { memo } from 'react'
import { BookOpen, X } from 'lucide-react'
import { Button } from '@/components/Button'

type Point = {
  x: number
  y: number
}

type PersonalizeOverlaysProps = {
  showFlyAnimation: boolean
  flyOrigin: Point
  flyTarget: Point
  flyCoverUrl: string
  showPreviewCancelledToast: boolean
  previewCancelledLabel: string
  showExitConfirm: boolean
  exitLabels: {
    title: string
    body: string
    stay: string
    back: string
  }
  onStay: () => void
  onBackToCustomize: () => void
}

function PersonalizeOverlaysComponent({
  showFlyAnimation,
  flyOrigin,
  flyTarget,
  flyCoverUrl,
  showPreviewCancelledToast,
  previewCancelledLabel,
  showExitConfirm,
  exitLabels,
  onStay,
  onBackToCustomize,
}: PersonalizeOverlaysProps) {
  const flyDeltaX = flyTarget.x - flyOrigin.x
  const flyDeltaY = flyTarget.y - flyOrigin.y

  return (
    <>
      {showFlyAnimation && (
          <div
            className="pointer-events-none fixed z-[100] overflow-hidden rounded-md border-2 border-white shadow-2xl"
            style={{
              top: flyOrigin.y,
              left: flyOrigin.x,
              width: 50,
              height: 70,
              animation: 'ymi-fly-to-cart 800ms ease-in-out forwards',
              '--fly-x': `${flyDeltaX}px`,
              '--fly-y': `${flyDeltaY}px`,
            } as React.CSSProperties}
          >
            <img src={flyCoverUrl} className="h-full w-full object-cover" alt="" />
          </div>
      )}

      {showPreviewCancelledToast && (
          <div
            className="fixed bottom-5 left-1/2 z-[120] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 animate-in rounded-2xl border border-white/80 bg-white/92 px-4 py-3 shadow-[0_18px_50px_rgba(218,119,31,0.18)] slide-in-from-bottom-4 fade-in duration-200 backdrop-blur-xl"
          >
            <div className="flex items-center gap-3 text-sm font-semibold text-gray-800">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                <X className="h-4 w-4" />
              </div>
              <span>{previewCancelledLabel}</span>
            </div>
          </div>
      )}

      {showExitConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md animate-in rounded-3xl border border-white/60 bg-white/88 p-6 text-center shadow-[0_20px_60px_rgba(15,23,42,0.18)] zoom-in-95 backdrop-blur-2xl">
            <BookOpen className="mx-auto mb-4 h-12 w-12 text-amber-500" />
            <h3 className="mb-2 text-lg font-bold text-gray-900">{exitLabels.title}</h3>
            <p className="mb-6 text-gray-600">{exitLabels.body}</p>
            <div className="flex justify-center gap-3">
              <Button variant="outline" onClick={onStay}>{exitLabels.stay}</Button>
              <Button variant="primary" onClick={onBackToCustomize}>{exitLabels.back}</Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export const PersonalizeOverlays = memo(PersonalizeOverlaysComponent)
