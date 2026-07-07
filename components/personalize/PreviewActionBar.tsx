'use client'

import React, { memo, useCallback, useState } from 'react'
import { Loader2, Share2, ShoppingCart } from 'lucide-react'
import { Button } from '@/components/Button'

type PreviewActionBarProps = {
  acknowledgementLabel: string
  acknowledgementRequiredLabel: string
  shareLabel: string
  shareDescription: string
  shareCopyLabel: string
  addToCartLabel: string
  checkoutLabel: string
  loadingLabel: string
  shareError: string | null
  canShare: boolean
  isPreparingShare: boolean
  isAddToCartPending: boolean
  isCheckoutPending: boolean
  onShare: () => void
  onAddToCart: () => void
  onCheckout: () => void
  addToCartButtonRef: React.Ref<HTMLButtonElement>
}

function PreviewActionBarComponent({
  acknowledgementLabel,
  acknowledgementRequiredLabel,
  shareLabel,
  shareDescription,
  shareCopyLabel,
  addToCartLabel,
  checkoutLabel,
  loadingLabel,
  shareError,
  canShare,
  isPreparingShare,
  isAddToCartPending,
  isCheckoutPending,
  onShare,
  onAddToCart,
  onCheckout,
  addToCartButtonRef,
}: PreviewActionBarProps) {
  const [isCheckoutAcknowledged, setIsCheckoutAcknowledged] = useState(false)
  const [showAcknowledgementError, setShowAcknowledgementError] = useState(false)

  const handleAcknowledgementChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const checked = event.target.checked
    setIsCheckoutAcknowledged(checked)
    if (checked) {
      setShowAcknowledgementError(false)
    }
  }, [])

  const handleCheckout = useCallback(() => {
    if (!isCheckoutAcknowledged) {
      setShowAcknowledgementError(true)
      return
    }

    onCheckout()
  }, [isCheckoutAcknowledged, onCheckout])

  return (
    <>
      <div className="w-full max-w-3xl px-2">
        <label className="mx-auto mb-3 flex max-w-2xl cursor-pointer items-start gap-3 rounded-2xl border border-white/60 bg-white/65 px-4 py-3 text-left shadow-[0_4px_12px_rgba(148,93,34,0.06)] backdrop-blur-sm">
          <input
            type="checkbox"
            checked={isCheckoutAcknowledged}
            onChange={handleAcknowledgementChange}
            className="mt-1 h-4 w-4 shrink-0 rounded border-amber-300 text-amber-600 accent-amber-500 focus:ring-2 focus:ring-amber-300"
          />
          <span className="text-xs font-medium leading-relaxed text-amber-950/80 sm:text-sm">
            {acknowledgementLabel}
          </span>
        </label>
        {showAcknowledgementError ? (
          <p className="mb-3 text-center text-xs font-semibold text-red-500">
            {acknowledgementRequiredLabel}
          </p>
        ) : null}
      </div>

      <div className="mb-3 w-full max-w-2xl px-2">
        <button
          type="button"
          onClick={onShare}
          disabled={isPreparingShare || !canShare}
          className="group relative z-20 flex w-full items-center gap-3 rounded-2xl border border-amber-200/70 bg-gradient-to-r from-amber-50/90 to-orange-50/85 px-4 py-3 text-left shadow-[0_10px_28px_rgba(251,146,60,0.12),inset_0_1px_0_rgba(255,255,255,0.82)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-amber-300/80 hover:shadow-[0_14px_34px_rgba(251,146,60,0.18),inset_0_1px_0_rgba(255,255,255,0.9)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/75 bg-white/72 text-amber-600 shadow-sm transition group-hover:bg-white/90">
            <Share2 className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-amber-900">
              {shareLabel}
            </span>
            <span className="mt-0.5 block text-xs font-medium leading-5 text-amber-700/75">
              {shareDescription}
            </span>
          </span>
          <span className="hidden rounded-full border border-white/70 bg-white/55 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-600 shadow-sm sm:inline-flex">
            {shareCopyLabel}
          </span>
        </button>
      </div>

      <div className="flex w-full max-w-md flex-col justify-center gap-3 px-2 sm:max-w-none sm:flex-row sm:gap-4 md:gap-5">
        <Button
          ref={addToCartButtonRef}
          onClick={onAddToCart}
          size="lg"
          variant="outline"
          disabled={isAddToCartPending || isCheckoutPending}
          className="glass-action-btn glass-action-btn--amber relative z-20 h-11 w-full rounded-full px-5 text-sm font-semibold sm:w-auto sm:px-7 md:h-12 md:px-8 md:text-base"
        >
          {isAddToCartPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin md:h-5 md:w-5" />
          ) : (
            <ShoppingCart className="mr-2 h-4 w-4 md:h-5 md:w-5" />
          )}
          {isAddToCartPending ? loadingLabel : addToCartLabel}
        </Button>
        <Button
          onClick={handleCheckout}
          size="lg"
          disabled={!isCheckoutAcknowledged || isAddToCartPending || isCheckoutPending}
          className="glass-action-btn glass-action-btn--brand h-11 w-full rounded-full px-6 text-sm font-semibold sm:w-auto sm:px-9 md:h-12 md:px-10 md:text-base"
        >
          {isCheckoutPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin md:h-5 md:w-5" />
              {loadingLabel}
            </>
          ) : (
            checkoutLabel
          )}
        </Button>
      </div>
      {shareError ? <p className="mt-3 text-center text-xs text-red-500">{shareError}</p> : null}
    </>
  )
}

export const PreviewActionBar = memo(PreviewActionBarComponent)
