'use client'

import React, { memo, type CSSProperties } from 'react'
import { BookOpen, ChevronLeft, ChevronRight, Lock, Wand2 } from 'lucide-react'
import type { PersonalizeBookType } from '@/components/personalize/BookPackageSelector'
import { BookLeafImage } from '@/components/personalize/BookLeafImage'
import {
  createLegacySpreadLeaf,
  resolveBookLeaf,
  type BookPresentation,
} from '@/lib/book-presentation'

type PreviewBookPageContentProps = {
  mode?: 'preview' | 'reader'
  side: 'left' | 'right'
  spreadIndex: number
  bookType: PersonalizeBookType
  previewPages: string[]
  previewImageErrors: Set<string>
  bookPresentation?: BookPresentation | null
  previewFirstSpreadPresentation?: BookPresentation | null
  lockedPreviewPresentation?: BookPresentation | null
  currentSpread: number
  isFlipping: boolean
  canTurnNext: boolean
  canTurnPrev: boolean
  resolvedTitle: string
  labels: {
    previewAlt: string
    previewPageStillCreating: string
    previewPageLocked: string
    backToCover: string
    nextPage: string
    previousPage: string
  }
  onImageError: (imageUrl: string, options?: { refreshGenerated?: boolean }) => void
  onTurnPage: (direction: 'next' | 'prev') => void
  onReturnToCover: () => void
}

function PreviewBookPageContentComponent({
  mode = 'preview',
  side,
  spreadIndex,
  bookType,
  previewPages,
  previewImageErrors,
  bookPresentation,
  previewFirstSpreadPresentation,
  lockedPreviewPresentation,
  currentSpread,
  isFlipping,
  canTurnNext,
  canTurnPrev,
  resolvedTitle,
  labels,
  onImageError,
  onTurnPage,
  onReturnToCover,
}: PreviewBookPageContentProps) {
  const pageTexture = bookType === 'premium'
    ? 'linear-gradient(to right, #f8f9fa, #e9ecef)'
    : 'linear-gradient(to right, #fffdf5, #fefae0)'

  const paperNoise = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.05'/%3E%3C/svg%3E")`

  const bindingShadow = side === 'left'
    ? 'linear-gradient(to left, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.1) 4%, transparent 12%)'
    : 'linear-gradient(to right, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.1) 4%, transparent 12%)'

  const commonPageStyle: CSSProperties = {
    background: `${pageTexture}, ${paperNoise}`,
    boxShadow: side === 'left'
      ? 'inset -1px 0 2px rgba(0,0,0,0.1), inset 5px 0 10px rgba(255,255,255,0.4)'
      : 'inset 1px 0 2px rgba(0,0,0,0.1), inset -5px 0 10px rgba(255,255,255,0.4)',
  }

  if (spreadIndex === 0 && side === 'right') {
    const generatedCover = bookPresentation
      ? bookPresentation.cover?.url || ''
      : previewPages[0] || ''
    const canShowGeneratedCover = Boolean(generatedCover) && !previewImageErrors.has(generatedCover)

    return (
      <div className="isolate relative h-full w-full overflow-hidden rounded-r-sm border-l border-white/20 bg-white shadow-inner" style={commonPageStyle}>
        <div className="pointer-events-none absolute inset-0 z-20 bg-gradient-to-br from-white/30 via-transparent to-black/10" />

        {canShowGeneratedCover ? (
          <img
            src={generatedCover}
            alt={resolvedTitle || labels.previewAlt}
            className="relative z-10 h-full w-full object-contain"
            decoding="async"
            loading="eager"
            fetchPriority="high"
            onError={() => onImageError(generatedCover, { refreshGenerated: true })}
          />
        ) : (
          <CreatingPlaceholder label={labels.previewPageStillCreating} />
        )}

        <div className="absolute bottom-0 left-0 top-0 z-30 w-3 bg-gradient-to-r from-black/20 via-black/10 to-transparent" />

        {!isFlipping && canTurnNext && (
          <button
            type="button"
            aria-label={labels.nextPage}
            title={labels.nextPage}
            className="absolute right-4 top-1/2 z-30 -translate-y-1/2 cursor-pointer rounded-full bg-black/20 p-3 text-white drop-shadow-lg transition-colors hover:bg-black/40"
            onClick={(event) => {
              event.stopPropagation()
              onTurnPage('next')
            }}
          >
            <ChevronRight className="h-8 w-8" aria-hidden="true" />
          </button>
        )}
      </div>
    )
  }

  if (spreadIndex > 0) {
    const mayUseGeneratedLeaf = mode === 'reader' || spreadIndex === 1
    const usesStructuredLeaves = Boolean(bookPresentation)
    const structuredLeaf = mayUseGeneratedLeaf
      ? resolveBookLeaf(bookPresentation, spreadIndex, side)
      : null
    const usableStructuredLeaf = structuredLeaf && !previewImageErrors.has(structuredLeaf.url)
      ? structuredLeaf
      : null
    const legacySpreadImage = mayUseGeneratedLeaf && !usesStructuredLeaves
      ? previewPages[spreadIndex] || ''
      : ''
    const usableLegacyLeaf = legacySpreadImage && !previewImageErrors.has(legacySpreadImage)
      ? createLegacySpreadLeaf(legacySpreadImage, spreadIndex, side)
      : null
    const firstSpreadUnderlayLeaf = mode === 'preview' && spreadIndex === 1
      ? resolveBookLeaf(previewFirstSpreadPresentation, spreadIndex, side)
      : null
    const usableFirstSpreadUnderlay = firstSpreadUnderlayLeaf && !previewImageErrors.has(firstSpreadUnderlayLeaf.url)
      ? firstSpreadUnderlayLeaf
      : null
    const lockedStructuredLeaf = mode === 'preview' && spreadIndex >= 2
      ? resolveBookLeaf(lockedPreviewPresentation, spreadIndex, side)
      : null
    const usableLockedLeaf = lockedStructuredLeaf && !previewImageErrors.has(lockedStructuredLeaf.url)
      ? lockedStructuredLeaf
      : null
    const displayLeaf = usableStructuredLeaf || usableLegacyLeaf || usableFirstSpreadUnderlay || usableLockedLeaf
    const isLockedPreview = mode === 'preview' && spreadIndex >= 2
    const isGeneratingWithUnderlay = mode === 'preview'
      && spreadIndex === 1
      && !usableStructuredLeaf
      && !usableLegacyLeaf
      && Boolean(usableFirstSpreadUnderlay)
    const isMaskedPreview = isLockedPreview || isGeneratingWithUnderlay
    const isLeftSide = side === 'left'
    const isNearbySpread = Math.abs(spreadIndex - currentSpread) <= 1

    return (
      <div
        className={`relative h-full w-full overflow-hidden ${isLeftSide ? 'rounded-l-sm border-r border-gray-200' : 'rounded-r-sm'}`}
        style={commonPageStyle}
      >
        {displayLeaf ? (
          <div className="absolute inset-0 overflow-hidden">
            <BookLeafImage
              leaf={displayLeaf}
              alt={labels.previewAlt}
              className={isMaskedPreview ? 'scale-[1.035] blur-[6px] saturate-[0.72]' : ''}
              loading={isNearbySpread ? 'eager' : 'lazy'}
              fetchPriority={isNearbySpread ? 'high' : 'auto'}
              onError={() => onImageError(displayLeaf.url, {
                refreshGenerated: Boolean(usableStructuredLeaf || usableLegacyLeaf),
              })}
            />
          </div>
        ) : isLockedPreview ? (
          <LockedPlaceholder label={labels.previewPageLocked} />
        ) : (
          <CreatingPlaceholder label={labels.previewPageStillCreating} />
        )}

        {isMaskedPreview && displayLeaf ? (
          <>
            <div className="pointer-events-none absolute inset-0 z-20 bg-white/68 backdrop-blur-[3px]" />
            <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center px-6 text-center">
              <div className="rounded-full border border-white/70 bg-white/74 px-4 py-2 text-xs font-bold text-amber-900 shadow-[0_12px_28px_rgba(15,23,42,0.12)] backdrop-blur-xl">
                {isGeneratingWithUnderlay ? labels.previewPageStillCreating : labels.previewPageLocked}
              </div>
            </div>
          </>
        ) : null}

        <div className="pointer-events-none absolute inset-0 z-10" style={{ background: bindingShadow }} />
        <PageControls
          side={side}
          isFlipping={isFlipping}
          canTurnNext={canTurnNext}
          canTurnPrev={canTurnPrev}
          backToCoverLabel={labels.backToCover}
          nextPageLabel={labels.nextPage}
          previousPageLabel={labels.previousPage}
          onTurnPage={onTurnPage}
          onReturnToCover={onReturnToCover}
          strongBackground
        />
      </div>
    )
  }

  if (spreadIndex === 0 && side === 'left') return null
  return null
}

function CreatingPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-amber-50/80 px-6 text-center text-amber-900">
      <Wand2 className="h-9 w-9 animate-pulse text-amber-500" />
      <p className="text-sm font-semibold">{label}</p>
    </div>
  )
}

function LockedPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-stone-100/90 px-6 text-center text-gray-700">
      <Lock className="h-8 w-8 text-amber-500" />
      <p className="text-sm font-semibold">{label}</p>
    </div>
  )
}

function PageControls({
  side,
  isFlipping,
  canTurnNext,
  canTurnPrev,
  backToCoverLabel,
  nextPageLabel,
  previousPageLabel,
  strongBackground = false,
  onTurnPage,
  onReturnToCover,
}: {
  side: 'left' | 'right'
  isFlipping: boolean
  canTurnNext: boolean
  canTurnPrev: boolean
  backToCoverLabel: string
  nextPageLabel: string
  previousPageLabel: string
  strongBackground?: boolean
  onTurnPage: (direction: 'next' | 'prev') => void
  onReturnToCover: () => void
}) {
  if (isFlipping) return null

  if (side === 'right') {
    return (
      <>
        <button
          type="button"
          aria-label={backToCoverLabel}
          title={backToCoverLabel}
          className="absolute right-3 top-3 z-40 flex h-9 w-9 items-center justify-center rounded-full border border-white/70 bg-white/45 text-gray-700 shadow-[0_10px_24px_rgba(15,23,42,0.16)] backdrop-blur-xl transition hover:scale-105 hover:bg-white/70"
          onClick={(event) => {
            event.stopPropagation()
            onReturnToCover()
          }}
        >
          <BookOpen className="h-4 w-4" />
        </button>
        {canTurnNext ? (
          <button
            type="button"
            aria-label={nextPageLabel}
            title={nextPageLabel}
            className={`absolute right-4 top-1/2 z-30 -translate-y-1/2 rounded-full p-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${strongBackground ? 'bg-white/65 hover:bg-white/90' : 'hover:bg-gray-200'}`}
            onClick={(event) => {
              event.stopPropagation()
              onTurnPage('next')
            }}
          >
            <ChevronRight className={`h-8 w-8 ${strongBackground ? 'text-gray-500' : 'text-gray-400'}`} aria-hidden="true" />
          </button>
        ) : null}
      </>
    )
  }

  if (!canTurnPrev) return null

  return (
    <button
      type="button"
      aria-label={previousPageLabel}
      title={previousPageLabel}
      className={`absolute left-4 top-1/2 z-30 -translate-y-1/2 rounded-full p-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${strongBackground ? 'bg-white/65 hover:bg-white/90' : 'hover:bg-gray-200'}`}
      onClick={(event) => {
        event.stopPropagation()
        onTurnPage('prev')
      }}
    >
      <ChevronLeft className={`h-8 w-8 ${strongBackground ? 'text-gray-500' : 'text-gray-400'}`} aria-hidden="true" />
    </button>
  )
}

export const PreviewBookPageContent = memo(PreviewBookPageContentComponent)
