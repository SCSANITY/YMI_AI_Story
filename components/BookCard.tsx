'use client'

import React from 'react'
import { Heart, Sparkles } from 'lucide-react'
import { Book } from '@/types'
import { BookCardCover } from '@/components/BookCardCover'
import { useI18n } from '@/lib/useI18n'
import type { BookRatingSummary } from '@/components/useBookDisplayData'
import { formatLocaleCurrency } from '@/lib/locale-pricing'

type BookCardProps = {
  book: Book
  isFavorite: boolean
  coverSrc: string
  title: string
  storyType: string
  description: string
  rating?: BookRatingSummary
  suppressHover?: boolean
  priority?: boolean
  onClick: () => void
  onFavoriteClick: (event: React.MouseEvent) => void
}

export function BookCard({
  book,
  isFavorite,
  coverSrc,
  title,
  storyType,
  description,
  rating,
  suppressHover = false,
  priority = false,
  onClick,
  onFavoriteClick,
}: BookCardProps) {
  const { t, language } = useI18n()
  const priceLabel = formatLocaleCurrency(book.price, language)
  const compareAtPrice = book.compareAtPrice && book.compareAtPrice > book.price ? book.compareAtPrice : null
  const compareAtLabel = compareAtPrice ? formatLocaleCurrency(compareAtPrice, language) : null
  const discountPercent =
    book.discountPercent ??
    (compareAtPrice ? Math.round((1 - book.price / compareAtPrice) * 100) : null)
  const isDiscounted = Boolean((book.isDiscount || compareAtPrice) && discountPercent && discountPercent > 0)
  const isComingSoon = Boolean(book.isComingSoon)

  return (
    <div
      className={`group relative isolate flex h-full flex-col overflow-visible transition-transform duration-300 ease-out ${
        isComingSoon ? 'cursor-default' : 'cursor-pointer'
      } ${
        suppressHover || isComingSoon ? '' : 'md:hover:-translate-y-1 book-card-hoverable'
      }`}
      onClick={isComingSoon ? undefined : onClick}
      aria-disabled={isComingSoon}
    >
      <BookCardCover
        src={coverSrc}
        alt={title}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        fetchPriority={priority ? 'high' : 'auto'}
        coverZoom={book.coverZoom}
        isMuted={isComingSoon}
      >
        <button
          onClick={onFavoriteClick}
          className="absolute right-3 top-7 z-20 rounded-full bg-white/90 p-1.5 shadow-sm backdrop-blur-sm transition-all hover:bg-white active:scale-90 md:right-8 md:top-10 md:p-2 md:opacity-0 md:translate-y-2 group-hover:opacity-100 group-hover:translate-y-0"
        >
          <Heart
            className={`h-4 w-4 transition-colors md:h-5 md:w-5 ${
              isFavorite ? 'fill-red-500 text-red-500' : 'text-gray-400 hover:text-gray-600'
            }`}
          />
        </button>
        {isDiscounted ? (
          <div className="pointer-events-none absolute -right-2 -top-3 z-30 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-1.5 text-xs font-extrabold tracking-wide text-white shadow-lg shadow-orange-300/30 md:-right-3 md:-top-5 md:px-5 md:py-2 md:text-lg">
            -{discountPercent}%
          </div>
        ) : null}
        {isComingSoon ? (
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2 -rotate-12 rounded-full border-2 border-amber-500/90 bg-white/70 px-4 py-2 text-center text-sm font-black uppercase tracking-[0.16em] text-amber-700 shadow-[0_12px_36px_rgba(180,83,9,0.20)] backdrop-blur-md md:px-6 md:py-3 md:text-lg">
            {t('bookList.comingSoon')}
          </div>
        ) : null}
      </BookCardCover>

      <div className={`glass-panel -mt-4 flex flex-1 flex-col rounded-xl px-3 pb-3 pt-10 md:-mt-6 md:rounded-2xl md:px-5 md:pb-5 md:pt-14 ${isComingSoon ? 'opacity-80' : ''}`}>
        <div className="flex flex-1 flex-col">
          <h3 className="font-display mb-1 line-clamp-2 pt-px text-sm font-medium leading-snug text-gray-900 md:mb-2 md:line-clamp-none md:pt-0 md:text-lg md:leading-tight">
            {title}
          </h3>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-gray-400 md:mb-3 md:text-xs">
            {storyType}
          </p>
          <p className="hidden text-sm leading-relaxed text-gray-600 md:block">
            {description}
          </p>
        </div>

        <div className="mt-auto flex items-center justify-between gap-3 border-t border-gray-50 pt-3 md:pt-4">
          <div className="min-w-0">
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
              <div className="flex flex-wrap items-baseline">
                <span className="whitespace-nowrap text-base font-extrabold tracking-wide text-amber-600 md:text-lg">
                  {priceLabel}
                </span>
              </div>
            )}
            {rating?.count ? (
              <div className="mt-1 text-[10px] font-semibold text-amber-700 md:text-xs">
                {t('bookList.rating')} {rating.average.toFixed(1)} ({rating.count})
              </div>
            ) : null}
          </div>
          <div className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 md:px-3 md:text-sm ${
            isComingSoon
              ? 'bg-gray-100/70 text-gray-500'
              : 'text-amber-600 hover:bg-amber-100/80 hover:text-amber-700 hover:shadow-sm group-hover:bg-amber-50/70'
          }`}>
            <span className="md:inline">{isComingSoon ? t('bookList.comingSoon') : t('bookList.create')}</span>
            <Sparkles className="h-3 w-3" />
          </div>
        </div>
      </div>
    </div>
  )
}
