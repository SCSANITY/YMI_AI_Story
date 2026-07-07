'use client'

import { ShoppingCart, Sparkles, Trash2 } from 'lucide-react'
import { Button } from '@/components/Button'
import { BookCardCover } from '@/components/BookCardCover'
import { BOOKS } from '@/data/books'
import { formatDisplayCurrency } from '@/lib/locale-pricing'
import type { Book, DisplayCurrency } from '@/types'
import type { CreationItem } from './myBooksTypes'

type MyBooksGridProps = {
  items: CreationItem[]
  gridClass: string
  displayCurrency: DisplayCurrency
  pendingCustomizeHref: string | null
  pendingAction: { creationId: string; action: 'add' | 'buy' | 'delete' } | null
  t: (key: string, params?: Record<string, string | number | null | undefined>) => string
  resolveCover: (item: CreationItem) => string
  resolveTemplatePrice: (item: CreationItem, fallbackBook?: Book) => number
  resolveTemplateCompareAtPrice: (item: CreationItem, fallbackBook?: Book, price?: number) => number | null
  resolveTemplateDiscountPercent: (
    item: CreationItem,
    fallbackBook?: Book,
    price?: number,
    compareAtPrice?: number | null
  ) => number | null
  buildPreviewHref: (item: CreationItem) => string
  onPreview: (item: CreationItem) => void
  onPrefetchPreview: (href: string) => void
  onDelete: (item: CreationItem) => void
  onAddToCart: (item: CreationItem) => void
  onBuyNow: (item: CreationItem) => void
}

export function MyBooksGrid({
  items,
  gridClass,
  displayCurrency,
  pendingCustomizeHref,
  pendingAction,
  t,
  resolveCover,
  resolveTemplatePrice,
  resolveTemplateCompareAtPrice,
  resolveTemplateDiscountPercent,
  buildPreviewHref,
  onPreview,
  onPrefetchPreview,
  onDelete,
  onAddToCart,
  onBuyNow,
}: MyBooksGridProps) {
  return (
    <div className={gridClass}>
      {items.map((item) => {
        const fallbackBook = BOOKS.find((book) => book.bookID === item.template_id)
        const price = resolveTemplatePrice(item, fallbackBook)
        const priceLabel = formatDisplayCurrency(price, displayCurrency)
        const compareAtPrice = resolveTemplateCompareAtPrice(item, fallbackBook, price)
        const compareAtLabel = compareAtPrice && compareAtPrice > price ? formatDisplayCurrency(compareAtPrice, displayCurrency) : null
        const discountPercent = resolveTemplateDiscountPercent(item, fallbackBook, price, compareAtPrice)
        const isDiscounted = Boolean((item.templates?.is_discount || compareAtLabel) && discountPercent && discountPercent > 0)
        const previewHref = buildPreviewHref(item)
        const isPreviewPending = pendingCustomizeHref === previewHref
        const activeAction = pendingAction?.creationId === item.creation_id ? pendingAction.action : null
        const isActionPending = Boolean(activeAction) || isPreviewPending

        return (
          <div
            key={item.creation_id}
            className="group book-card-hoverable relative isolate flex flex-col h-full overflow-visible cursor-pointer transition-transform duration-300 ease-out md:hover:-translate-y-1"
            aria-busy={isPreviewPending || undefined}
          >
            <BookCardCover
              src={resolveCover(item)}
              alt={item.templates?.name || item.template_id}
              loading="lazy"
              decoding="async"
            >
              <button
                type="button"
                onClick={() => onPreview(item)}
                onPointerEnter={() => onPrefetchPreview(previewHref)}
                onFocus={() => onPrefetchPreview(previewHref)}
                disabled={isActionPending}
                className="absolute inset-0 z-10 block h-full w-full"
              />

              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out"
                style={{ background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.18) 50%, transparent 60%)' }}
              />

              <button
                type="button"
                onClick={() => onDelete(item)}
                disabled={isActionPending}
                className="absolute top-2 right-2 z-20 md:top-3 md:right-3 h-6 w-6 rounded-full bg-white/80 text-gray-300 hover:text-red-500 hover:bg-white/95 shadow-sm opacity-0 group-hover:opacity-100 transition"
                aria-label="Delete"
              >
                <Trash2 className="h-3.5 w-3.5 mx-auto" />
              </button>
              {isDiscounted ? (
                <div className="pointer-events-none absolute -right-2 -top-3 z-30 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-1.5 text-xs font-extrabold tracking-wide text-white shadow-lg shadow-orange-300/30 md:-right-3 md:-top-5 md:px-5 md:py-2 md:text-lg">
                  -{discountPercent}%
                </div>
              ) : null}
              {isPreviewPending || activeAction ? (
                <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center rounded-[inherit] bg-white/24 backdrop-blur-[2px]">
                  <span className="rounded-full border border-white/80 bg-white/90 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-700 shadow-sm md:text-xs">
                    {t('common.loading')}
                  </span>
                </div>
              ) : null}
            </BookCardCover>

            <div className="glass-panel rounded-xl md:rounded-2xl flex flex-col flex-1 -mt-4 md:-mt-6 pt-10 md:pt-14 px-4 md:px-5 pb-4 md:pb-5">
              <div className="flex flex-col flex-1">
                <button
                  type="button"
                  onClick={() => onPreview(item)}
                  onPointerEnter={() => onPrefetchPreview(previewHref)}
                  onFocus={() => onPrefetchPreview(previewHref)}
                  disabled={isActionPending}
                  className="text-left"
                >
                  <h3 className="font-display pt-px md:pt-0 text-base md:text-lg font-medium text-gray-900 leading-snug md:leading-tight mb-1 md:mb-2 line-clamp-2 md:line-clamp-none">
                    {item.templates?.name || item.template_id}
                  </h3>
                </button>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-gray-400 md:mb-3 md:text-xs">
                  {item.templates?.story_type || ''}
                </p>
                <p className="text-sm text-gray-600 leading-relaxed hidden md:block">
                  {item.templates?.description || t('common.personalizedStorybook')}
                </p>
                <div className="mt-3">
                  {isDiscounted ? (
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="whitespace-nowrap text-base font-extrabold tracking-wide text-amber-600 md:text-lg">
                        {priceLabel}
                      </span>
                      {compareAtLabel ? (
                        <span className="whitespace-nowrap text-xs font-semibold text-gray-400 line-through md:text-sm">
                          {compareAtLabel}
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-baseline gap-x-1.5">
                      <span className="text-xs font-semibold uppercase tracking-wide text-gray-400 md:text-sm">
                        {t('bookList.from')}
                      </span>
                      <span className="whitespace-nowrap text-base font-extrabold tracking-wide text-amber-600 md:text-lg">
                        {priceLabel}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-auto pt-4 border-t border-gray-50 flex flex-col gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full rounded-full px-4 py-2 text-xs md:text-sm font-semibold border-amber-200 text-amber-700 hover:bg-amber-50"
                  onClick={() => onAddToCart(item)}
                  disabled={isActionPending}
                >
                  <ShoppingCart className="h-4 w-4 mr-2" />
                  {activeAction === 'add' ? t('common.loading') : t('myBooks.addToCart')}
                </Button>
                <Button
                  size="sm"
                  className="w-full rounded-full px-4 py-2 text-xs md:text-sm font-semibold"
                  onClick={() => onBuyNow(item)}
                  disabled={isActionPending}
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  {activeAction === 'buy' ? t('common.loading') : t('myBooks.buyNow')}
                </Button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
