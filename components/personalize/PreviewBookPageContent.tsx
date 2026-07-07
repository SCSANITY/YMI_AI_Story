'use client'

import React, { memo, type CSSProperties } from 'react'
import { BookOpen, ChevronLeft, ChevronRight, Lock, Wand2 } from 'lucide-react'
import type { PersonalizeBookType } from '@/components/personalize/BookPackageSelector'

type PreviewBookPageContentProps = {
  side: 'left' | 'right'
  spreadIndex: number
  bookType: PersonalizeBookType
  previewPages: string[]
  previewImageErrors: Set<string>
  staticPreviewSecondPageUrl: string | null
  finalPreviewImages: string[]
  currentSpread: number
  isFlipping: boolean
  resolvedTitle: string
  labels: {
    previewAlt: string
    previewPageStillCreating: string
    previewPageLocked: string
    backToCover: string
    locked: string
    pageLabel: (pageNumber: number) => string
  }
  onImageError: (imageUrl: string, options?: { refreshGenerated?: boolean }) => void
  onTurnPage: (direction: 'next' | 'prev') => void
  onReturnToCover: () => void
}

function PreviewBookPageContentComponent({
  side,
  spreadIndex,
  bookType,
  previewPages,
  previewImageErrors,
  staticPreviewSecondPageUrl,
  finalPreviewImages,
  currentSpread,
  isFlipping,
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
    const generatedCover = previewPages[0] || ''
    const canShowGeneratedCover = Boolean(generatedCover) && !previewImageErrors.has(generatedCover)

    return (
      <div className="relative h-full w-full overflow-hidden rounded-r-sm border-l border-white/20 shadow-inner" style={commonPageStyle}>
        <div className="pointer-events-none absolute inset-0 z-20 bg-gradient-to-br from-white/30 via-transparent to-black/10" />

        {canShowGeneratedCover ? (
          <img
            src={generatedCover}
            alt={resolvedTitle || labels.previewAlt}
            className="h-full w-full object-contain opacity-95 mix-blend-multiply"
            decoding="async"
            loading="eager"
            fetchPriority="high"
            onError={() => onImageError(generatedCover, { refreshGenerated: true })}
          />
        ) : (
          <CreatingPlaceholder label={labels.previewPageStillCreating} />
        )}

        <div className="absolute bottom-0 left-0 top-0 z-30 w-3 bg-gradient-to-r from-black/20 via-black/10 to-transparent" />

        {!isFlipping && (
          <div
            className="absolute right-4 top-1/2 z-30 -translate-y-1/2 cursor-pointer rounded-full bg-black/20 p-3 text-white drop-shadow-lg transition-colors hover:bg-black/40"
            onClick={(event) => {
              event.stopPropagation()
              onTurnPage('next')
            }}
          >
            <ChevronRight className="h-8 w-8" />
          </div>
        )}
      </div>
    )
  }

  if (
    spreadIndex > 0 &&
    (spreadIndex < previewPages.length || (spreadIndex === 1 && (previewPages.length === 1 || staticPreviewSecondPageUrl)) || finalPreviewImages[spreadIndex - 1]) &&
    (side === 'left' || side === 'right')
  ) {
    const previewSpreadImage = previewPages[spreadIndex] || ''
    const generatedSpreadImage = previewSpreadImage && !previewImageErrors.has(previewSpreadImage) ? previewSpreadImage : ''
    const staticSecondPageImage = spreadIndex === 1 && staticPreviewSecondPageUrl && !previewImageErrors.has(staticPreviewSecondPageUrl)
      ? staticPreviewSecondPageUrl
      : ''
    const finalPreviewImage = spreadIndex > 1 ? finalPreviewImages[spreadIndex - 1] || '' : ''
    const spreadImage = generatedSpreadImage || staticSecondPageImage || finalPreviewImage
    const isGeneratingSecondPreview = spreadIndex === 1 && !generatedSpreadImage
    const isLockedFinalPreview = !generatedSpreadImage && !staticSecondPageImage && Boolean(finalPreviewImage)
    const isLeftSide = side === 'left'
    const isNearbySpread = Math.abs(spreadIndex - currentSpread) <= 1

    return (
      <div
        className={`relative h-full w-full overflow-hidden ${isLeftSide ? 'rounded-l-sm border-r border-gray-200' : 'rounded-r-sm'}`}
        style={commonPageStyle}
      >
        {spreadImage ? (
          <div className="absolute inset-0 overflow-hidden">
            <img
              src={spreadImage}
              alt="Preview spread"
              className={`absolute top-0 h-full max-w-none object-cover ${isLockedFinalPreview || isGeneratingSecondPreview ? 'scale-[1.035] blur-[6px] saturate-[0.72]' : ''}`}
              decoding="async"
              loading={isNearbySpread ? 'eager' : 'lazy'}
              fetchPriority={isNearbySpread ? 'high' : 'auto'}
              onError={() => onImageError(spreadImage, { refreshGenerated: Boolean(generatedSpreadImage && spreadImage === generatedSpreadImage) })}
              style={{
                width: '200%',
                left: isLeftSide ? '0%' : '-100%',
              }}
            />
          </div>
        ) : (
          <CreatingPlaceholder label={labels.previewPageStillCreating} />
        )}

        {isGeneratingSecondPreview ? (
          <>
            <div className="pointer-events-none absolute inset-0 z-20 bg-white/64 backdrop-blur-[3px]" />
            <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center px-6 text-center">
              <div className="flex items-center gap-2 rounded-full border border-white/70 bg-white/78 px-4 py-2 text-xs font-bold text-amber-900 shadow-[0_12px_28px_rgba(15,23,42,0.12)] backdrop-blur-xl">
                <Wand2 className="h-4 w-4 animate-pulse text-amber-500" />
                <span>{labels.previewPageStillCreating}</span>
              </div>
            </div>
          </>
        ) : isLockedFinalPreview ? (
          <>
            <div className="pointer-events-none absolute inset-0 z-20 bg-white/68 backdrop-blur-[3px]" />
            <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center px-6 text-center">
              <div className="rounded-full border border-white/70 bg-white/74 px-4 py-2 text-xs font-bold text-amber-900 shadow-[0_12px_28px_rgba(15,23,42,0.12)] backdrop-blur-xl">
                {labels.previewPageLocked}
              </div>
            </div>
          </>
        ) : null}

        <div className="pointer-events-none absolute inset-0 z-10" style={{ background: bindingShadow }} />
        <PageControls
          side={side}
          isFlipping={isFlipping}
          backToCoverLabel={labels.backToCover}
          onTurnPage={onTurnPage}
          onReturnToCover={onReturnToCover}
          strongBackground
        />
      </div>
    )
  }

  if (spreadIndex === 0 && side === 'left') return null

  const pageNum = spreadIndex * 2 + (side === 'left' ? 0 : 1)
  return (
    <div className={`relative h-full w-full overflow-hidden ${side === 'left' ? 'rounded-l-sm border-r' : 'rounded-r-sm'}`} style={commonPageStyle}>
      <div className="pointer-events-none absolute inset-0 z-10" style={{ background: bindingShadow }} />
      <div className="absolute inset-0 flex flex-col p-8 opacity-60 blur-[2px]">
        <span className="absolute right-4 top-4 font-serif text-xs text-gray-400">{pageNum}</span>
        <h3 className="mb-4 font-serif text-xl font-bold text-gray-800">{labels.pageLabel(pageNum)}</h3>
        <div className="mt-4 h-32 rounded-md bg-gray-200/50" />
      </div>
      <div className="absolute inset-0 z-20 flex items-center justify-center">
        <div className="flex items-center gap-2 rounded-full border border-gray-100 bg-white/90 px-4 py-2 shadow-sm backdrop-blur-sm">
          <Lock className="h-4 w-4 text-amber-500" />
          <span className="text-xs font-bold text-gray-600">{labels.locked}</span>
        </div>
      </div>
      <PageControls
        side={side}
        isFlipping={isFlipping}
        backToCoverLabel={labels.backToCover}
        onTurnPage={onTurnPage}
        onReturnToCover={onReturnToCover}
      />
    </div>
  )
}

function CreatingPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-amber-50/80 px-6 text-center text-amber-900">
      <Wand2 className="h-9 w-9 animate-pulse text-amber-500" />
      <p className="text-sm font-semibold">{label}</p>
    </div>
  )
}

function PageControls({
  side,
  isFlipping,
  backToCoverLabel,
  strongBackground = false,
  onTurnPage,
  onReturnToCover,
}: {
  side: 'left' | 'right'
  isFlipping: boolean
  backToCoverLabel: string
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
        <div
          className={`absolute right-4 top-1/2 z-30 -translate-y-1/2 cursor-pointer rounded-full p-2 transition-colors ${strongBackground ? 'bg-white/65 hover:bg-white/90' : 'hover:bg-gray-200'}`}
          onClick={(event) => {
            event.stopPropagation()
            onTurnPage('next')
          }}
        >
          <ChevronRight className={`h-8 w-8 ${strongBackground ? 'text-gray-500' : 'text-gray-400'}`} />
        </div>
      </>
    )
  }

  return (
    <div
      className={`absolute left-4 top-1/2 z-30 -translate-y-1/2 cursor-pointer rounded-full p-2 transition-colors ${strongBackground ? 'bg-white/65 hover:bg-white/90' : 'hover:bg-gray-200'}`}
      onClick={(event) => {
        event.stopPropagation()
        onTurnPage('prev')
      }}
    >
      <ChevronLeft className={`h-8 w-8 ${strongBackground ? 'text-gray-500' : 'text-gray-400'}`} />
    </div>
  )
}

export const PreviewBookPageContent = memo(PreviewBookPageContentComponent)
