'use client'

import React, { memo, useCallback, useState } from 'react'
import { CreditCard, Loader2, Share2, ShoppingCart } from 'lucide-react'
import { Button } from '@/components/Button'

type PreviewActionBarProps = {
  acknowledgementLabel: string
  acknowledgementRequiredLabel: string
  shareLabel: string
  addToCartLabel: string
  purchaseLabel: string
  loadingLabel: string
  shareError: string | null
  canShare: boolean
  isPreparingShare: boolean
  isCheckoutPending: boolean
  isConfigurationPending?: boolean
  previewReady?: boolean
  onShare: () => void
  onAddToCart: () => void
  onCheckout: () => void
  addToCartButtonRef: React.Ref<HTMLButtonElement>
}

function PreviewActionBarComponent({
  acknowledgementLabel,
  acknowledgementRequiredLabel,
  shareLabel,
  addToCartLabel,
  purchaseLabel,
  loadingLabel,
  shareError,
  canShare,
  isPreparingShare,
  isCheckoutPending,
  isConfigurationPending = false,
  previewReady = true,
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
    if (checked) setShowAcknowledgementError(false)
  }, [])

  const handleCheckout = useCallback(() => {
    if (!isCheckoutAcknowledged) {
      setShowAcknowledgementError(true)
      return
    }
    onCheckout()
  }, [isCheckoutAcknowledged, onCheckout])

  const handleAddToCart = useCallback(() => {
    if (!isCheckoutAcknowledged) {
      setShowAcknowledgementError(true)
      return
    }
    onAddToCart()
  }, [isCheckoutAcknowledged, onAddToCart])

  const pending = isCheckoutPending || isConfigurationPending || !previewReady

  return (
    <div>
      <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left">
        <input type="checkbox" checked={isCheckoutAcknowledged} onChange={handleAcknowledgementChange} className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-amber-600 accent-amber-500 focus:ring-2 focus:ring-amber-400" />
        <span className="text-xs font-medium leading-5 text-slate-700">{acknowledgementLabel}</span>
      </label>
      {showAcknowledgementError ? <p className="mt-2 text-xs font-semibold text-red-600" role="alert">{acknowledgementRequiredLabel}</p> : null}

      <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
        <Button ref={addToCartButtonRef} onClick={handleAddToCart} size="lg" disabled={!isCheckoutAcknowledged || pending} className="glass-action-btn glass-action-btn--brand min-h-14 w-full rounded-2xl px-3 py-2 text-sm font-bold">
          {isConfigurationPending ? <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin" aria-hidden="true" /> : <ShoppingCart className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />}
          <span>{addToCartLabel}</span>
        </Button>
        <Button type="button" onClick={handleCheckout} size="lg" disabled={!isCheckoutAcknowledged || pending} className="glass-action-btn glass-action-btn--brand min-h-14 w-full rounded-2xl px-3 py-2 text-sm font-bold">
          {isCheckoutPending ? <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin" aria-hidden="true" /> : <CreditCard className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />}
          <span>{isCheckoutPending ? loadingLabel : purchaseLabel}</span>
        </Button>
      </div>

      <button type="button" onClick={onShare} disabled={isPreparingShare || !canShare} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold text-slate-600 transition hover:bg-slate-50 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:cursor-not-allowed disabled:opacity-50">
        {isPreparingShare ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Share2 className="h-4 w-4" aria-hidden="true" />}
        {shareLabel}
      </button>
      {shareError ? <p className="mt-2 text-center text-xs text-red-600" role="alert">{shareError}</p> : null}
    </div>
  )
}

export const PreviewActionBar = memo(PreviewActionBarComponent)
