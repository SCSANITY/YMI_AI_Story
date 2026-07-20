'use client'

import React, { memo } from 'react'
import { createPortal } from 'react-dom'
import { BookOpen, X } from 'lucide-react'
import { Button } from '@/components/Button'

type Point = {
  x: number
  y: number
}

type PersonalizeOverlaysProps = {
  showFlyAnimation: boolean
  flyAnimationId: number
  flyOrigin: Point
  flyTarget: Point
  flyCoverUrl: string
  toastMessage: string | null
  showExitConfirm: boolean
  showAgeRangeConfirm: boolean
  showAddToCartConfirm: boolean
  exitLabels: {
    title: string
    body: string
    stay: string
    back: string
  }
  ageRangeLabels: {
    title: string
    body: string
    continueAnyway: string
    close: string
  }
  addToCartConfirmLabels: {
    title: string
    body: string
    cancel: string
    confirm: string
    close: string
  }
  onStay: () => void
  onBackToCustomize: () => void
  onCloseAgeRangeConfirm: () => void
  onContinueAgeRangeConfirm: () => void
  onCloseAddToCartConfirm: () => void
  onConfirmAddToCart: () => void
}

function PersonalizeOverlaysComponent({
  showFlyAnimation,
  flyAnimationId,
  flyOrigin,
  flyTarget,
  flyCoverUrl,
  toastMessage,
  showExitConfirm,
  showAgeRangeConfirm,
  showAddToCartConfirm,
  exitLabels,
  ageRangeLabels,
  addToCartConfirmLabels,
  onStay,
  onBackToCustomize,
  onCloseAgeRangeConfirm,
  onContinueAgeRangeConfirm,
  onCloseAddToCartConfirm,
  onConfirmAddToCart,
}: PersonalizeOverlaysProps) {
  const flyDeltaX = flyTarget.x - flyOrigin.x
  const flyDeltaY = flyTarget.y - flyOrigin.y

  if (typeof document === 'undefined') return null

  return createPortal(
    <>
      {showFlyAnimation && (
          <div
            key={flyAnimationId}
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

      {toastMessage && (
          <div
            className="fixed bottom-5 left-1/2 z-[120] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 animate-in rounded-2xl border border-white/80 bg-white/92 px-4 py-3 shadow-[0_18px_50px_rgba(218,119,31,0.18)] slide-in-from-bottom-4 fade-in duration-200 backdrop-blur-xl"
          >
            <div className="flex items-center gap-3 text-sm font-semibold text-gray-800">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                <X className="h-4 w-4" />
              </div>
              <span>{toastMessage}</span>
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

      {showAgeRangeConfirm && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-md animate-in rounded-3xl border border-white/70 bg-white/92 p-6 text-left shadow-[0_20px_60px_rgba(15,23,42,0.18)] zoom-in-95 backdrop-blur-2xl">
            <button
              type="button"
              aria-label={ageRangeLabels.close}
              onClick={onCloseAgeRangeConfirm}
              className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="pr-10">
              <h3 className="text-lg font-bold text-gray-900">{ageRangeLabels.title}</h3>
              <p className="mt-3 text-sm leading-6 text-gray-600">{ageRangeLabels.body}</p>
            </div>
            <div className="mt-6 flex justify-end">
              <Button variant="primary" onClick={onContinueAgeRangeConfirm}>
                {ageRangeLabels.continueAnyway}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showAddToCartConfirm && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-to-cart-confirm-title"
            className="relative w-full max-w-md animate-in rounded-3xl border border-white/70 bg-white/95 p-6 text-left shadow-[0_20px_60px_rgba(15,23,42,0.2)] zoom-in-95 backdrop-blur-2xl"
          >
            <button
              type="button"
              aria-label={addToCartConfirmLabels.close}
              onClick={onCloseAddToCartConfirm}
              className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="pr-10">
              <h3 id="add-to-cart-confirm-title" className="text-lg font-bold text-gray-900">{addToCartConfirmLabels.title}</h3>
              <p className="mt-3 text-sm leading-6 text-gray-600">{addToCartConfirmLabels.body}</p>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={onCloseAddToCartConfirm}>
                {addToCartConfirmLabels.cancel}
              </Button>
              <Button variant="primary" onClick={onConfirmAddToCart}>
                {addToCartConfirmLabels.confirm}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body
  )
}

export const PersonalizeOverlays = memo(PersonalizeOverlaysComponent)
