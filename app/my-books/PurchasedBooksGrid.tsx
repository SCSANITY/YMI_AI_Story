'use client'

import { BookOpen, Clock3, RotateCcw } from 'lucide-react'
import { BookCardCover } from '@/components/BookCardCover'
import { resolvePersonalizedBookTitle } from '@/lib/personalized-book-title'
import type { CreationItem } from './myBooksTypes'

type PurchasedBooksGridProps = {
  items: CreationItem[]
  gridClass: string
  pendingReaderHref: string | null
  t: (key: string, params?: Record<string, string | number | null | undefined>) => string
  resolveCover: (item: CreationItem) => string
  buildReaderHref: (item: CreationItem) => string
  onPrefetchReader: (item: CreationItem) => void
  onOpenReader: (item: CreationItem) => void
}

export function PurchasedBooksGrid({
  items,
  gridClass,
  pendingReaderHref,
  t,
  resolveCover,
  buildReaderHref,
  onPrefetchReader,
  onOpenReader,
}: PurchasedBooksGridProps) {
  return (
    <div className={gridClass}>
      {items.map((item) => {
        const readerHref = buildReaderHref(item)
        const isRefunded = item.purchaseState === 'refunded'
        const isPending = pendingReaderHref === readerHref
        const displayTitle = resolvePersonalizedBookTitle({
          templateId: item.template_id,
          templateName: item.templates?.name,
          customizeSnapshot: item.customize_snapshot,
        })
        const statusLabel = isRefunded
          ? t('myBooks.refundedBadge')
          : item.finalReady
            ? t('myBooks.readyBadge')
            : t('myBooks.preparingBadge')

        return (
          <div
            key={item.creation_id}
            className={`group book-card-hoverable relative isolate flex h-full flex-col overflow-visible transition-transform duration-300 ease-out ${
              isRefunded ? 'opacity-65 grayscale' : 'cursor-pointer md:hover:-translate-y-1'
            }`}
            aria-disabled={isRefunded || undefined}
            aria-busy={isPending || undefined}
            onMouseEnter={() => {
              if (!isRefunded) onPrefetchReader(item)
            }}
            onFocus={() => {
              if (!isRefunded) onPrefetchReader(item)
            }}
          >
            <BookCardCover
              src={resolveCover(item)}
              alt={displayTitle}
              loading="lazy"
              decoding="async"
            >
              {!isRefunded ? (
                <button
                  type="button"
                  onClick={() => onOpenReader(item)}
                  className="absolute inset-0 z-10 block h-full w-full"
                  aria-label={t('myBooks.openBook')}
                />
              ) : null}

              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 -translate-x-full transition-transform duration-700 ease-in-out group-hover:translate-x-full"
                style={{ background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.18) 50%, transparent 60%)' }}
              />

              <div
                className={`pointer-events-none absolute left-3 top-3 z-30 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] shadow-sm ${
                  isRefunded
                    ? 'bg-gray-900/75 text-white'
                    : item.finalReady
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white/92 text-amber-700'
                }`}
              >
                {isRefunded ? <RotateCcw className="h-3 w-3" /> : item.finalReady ? <BookOpen className="h-3 w-3" /> : <Clock3 className="h-3 w-3" />}
                {statusLabel}
              </div>

              {isPending ? (
                <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center rounded-[inherit] bg-white/24 backdrop-blur-[2px]">
                  <span className="rounded-full border border-white/80 bg-white/90 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-700 shadow-sm md:text-xs">
                    {t('common.loading')}
                  </span>
                </div>
              ) : null}
            </BookCardCover>

            <div className="glass-panel flex flex-1 flex-col rounded-xl px-4 pb-4 pt-10 md:-mt-6 md:rounded-2xl md:px-5 md:pb-5 md:pt-14 -mt-4">
              <div className="flex flex-1 flex-col">
                {!isRefunded ? (
                  <button
                  type="button"
                  onClick={() => onOpenReader(item)}
                  className="text-left"
                >
                    <h3 className="font-display mb-1 line-clamp-2 pt-px text-base font-medium leading-snug text-gray-900 md:mb-2 md:line-clamp-none md:pt-0 md:text-lg md:leading-tight">
                      {displayTitle}
                    </h3>
                  </button>
                ) : (
                  <h3 className="font-display mb-1 line-clamp-2 pt-px text-base font-medium leading-snug text-gray-700 md:mb-2 md:line-clamp-none md:pt-0 md:text-lg md:leading-tight">
                    {displayTitle}
                  </h3>
                )}
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-gray-400 md:text-xs">
                  {item.templates?.story_type || ''}
                </p>
                <p className="text-sm leading-relaxed text-gray-600">
                  {isRefunded ? t('myBooks.refundedDescription') : item.finalReady ? t('myBooks.readyDescription') : t('myBooks.preparingDescription')}
                </p>
                {item.latestOrderDisplayId || item.latestOrderStatus ? (
                  <p className="mt-3 text-xs font-medium text-gray-400">
                    {item.latestOrderDisplayId ? t('myBooks.orderLabel', { orderId: item.latestOrderDisplayId }) : item.latestOrderStatus}
                  </p>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => onOpenReader(item)}
                disabled={isRefunded || isPending}
                className={`mt-4 inline-flex w-full items-center justify-center rounded-full px-4 py-2 text-xs font-semibold transition md:text-sm ${
                  isRefunded
                    ? 'cursor-not-allowed border border-gray-200 bg-gray-100 text-gray-400'
                    : 'bg-gray-900 text-white hover:bg-gray-800'
                }`}
              >
                {isRefunded ? t('myBooks.refundedBadge') : isPending ? t('common.loading') : t('myBooks.openBook')}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
