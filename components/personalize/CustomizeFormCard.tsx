'use client'

import { memo, type ReactNode } from 'react'
import { Sparkles } from 'lucide-react'

type CustomizeFormCardProps = {
  title: string
  priceLabel: string
  compareAtPriceLabel?: string | null
  discountPercent?: number | null
  children: ReactNode
  footer: ReactNode
}

function CustomizeFormCardComponent({
  title,
  priceLabel,
  compareAtPriceLabel,
  discountPercent,
  children,
  footer,
}: CustomizeFormCardProps) {
  return (
    <div className="flex h-full w-full min-w-0 flex-col overflow-hidden rounded-[1.14rem] border border-amber-50/80 bg-white/78 p-3.5 shadow-[0_18px_28px_-26px_rgba(0,0,0,0.18)] backdrop-blur-sm sm:p-4 md:p-5">
      <div className="mb-4 flex items-start justify-between gap-3 sm:mb-5 sm:items-center">
        <h3 className="flex items-center gap-2 font-serif text-[1.55rem] font-bold text-gray-900 md:text-2xl">
          <Sparkles className="h-6 w-6 text-amber-500" />
          {title}
        </h3>
        <div className="shrink-0 text-right">
          <div className="flex items-baseline justify-end gap-2">
            <span className="text-2xl font-bold text-amber-600">{priceLabel}</span>
            {compareAtPriceLabel ? (
              <span className="text-xs font-semibold text-slate-400 line-through">{compareAtPriceLabel}</span>
            ) : null}
          </div>
          {discountPercent ? (
            <span className="mt-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-amber-700">
              {discountPercent}% off
            </span>
          ) : null}
        </div>
      </div>

      <div className="space-y-4 md:space-y-6">
        {children}
      </div>

      {footer}
    </div>
  )
}

export const CustomizeFormCard = memo(CustomizeFormCardComponent)
