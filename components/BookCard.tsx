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

  return (
    <div
      className={`group relative isolate flex h-full cursor-pointer flex-col overflow-visible transition-transform duration-300 ease-out ${
        suppressHover ? '' : 'md:hover:-translate-y-1 book-card-hoverable'
      }`}
      onClick={onClick}
    >
      <BookCardCover
        src={coverSrc}
        alt={title}
        loading="lazy"
        decoding="async"
        coverZoom={book.coverZoom}
      >
        {isDiscounted ? (
          <div className="absolute left-2 top-2 z-20 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-2.5 py-1 text-[10px] font-extrabold tracking-wide text-white shadow-lg shadow-orange-300/30 md:left-auto md:right-12 md:top-3 md:px-3.5 md:py-1.5 md:text-sm">
            -{discountPercent}%
          </div>
        ) : null}
        <button
          onClick={onFavoriteClick}
          className="absolute right-2 top-2 z-20 rounded-full bg-white/90 p-1.5 shadow-sm backdrop-blur-sm transition-all hover:bg-white active:scale-90 md:right-3 md:top-3 md:p-2 md:opacity-0 md:translate-y-2 group-hover:opacity-100 group-hover:translate-y-0"
        >
          <Heart
            className={`h-4 w-4 transition-colors md:h-5 md:w-5 ${
              isFavorite ? 'fill-red-500 text-red-500' : 'text-gray-400 hover:text-gray-600'
            }`}
          />
        </button>
      </BookCardCover>

      <div className="glass-panel -mt-4 flex flex-1 flex-col rounded-xl px-3 pb-3 pt-10 md:-mt-6 md:rounded-2xl md:px-5 md:pb-5 md:pt-14">
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
              <div className="flex flex-wrap items-baseline gap-x-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-400 md:text-sm">
                  {t('bookList.from')}
                </span>
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
          <div className="flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold text-amber-600 transition-all duration-200 hover:bg-amber-100/80 hover:text-amber-700 hover:shadow-sm group-hover:bg-amber-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 md:px-3 md:text-sm">
            <span className="md:inline">{t('bookList.create')}</span>
            <Sparkles className="h-3 w-3" />
          </div>
        </div>
      </div>
    </div>
  )
}
