'use client'

import React from 'react'
import { Heart, Sparkles } from 'lucide-react'
import { Book } from '@/types'
import { BookCardCover } from '@/components/BookCardCover'
import { useI18n } from '@/lib/useI18n'
import type { BookRatingSummary } from '@/components/useBookDisplayData'

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
  const { t } = useI18n()

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

        <div className="mt-auto flex flex-col items-start justify-between gap-2 border-t border-gray-50 pt-2 md:flex-row md:items-center md:pt-4">
          <span className="whitespace-nowrap rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500 md:px-3 md:py-1 md:text-xs">
            {book.ageRange} {t('common.yearsSuffix')}
          </span>
          <div className="flex items-center gap-2">
            {rating?.count ? (
              <div className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 md:text-xs">
                {t('bookList.rating')} {rating.average.toFixed(1)} ({rating.count})
              </div>
            ) : null}
            <div className="flex items-center gap-1 text-[10px] font-bold text-amber-600 md:text-sm">
              <span className="md:inline">{t('bookList.create')}</span>
              <Sparkles className="h-3 w-3" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
