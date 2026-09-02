'use client'

import React, { memo } from 'react'
import { Loader2, X } from 'lucide-react'

export type PreviewVariantGalleryItem = {
  jobId: string
  thumbnailUrl: string | null
  status: 'generating' | 'ready' | 'failed'
  selected: boolean
  original: boolean
  removing: boolean
}

type PreviewVariantGalleryProps = {
  items: PreviewVariantGalleryItem[]
  atLimit: boolean
  labels: {
    title: string
    original: string
    version: (number: number) => string
    selected: string
    generating: string
    failed: string
    remove: string
    limit: string
  }
  onSelect: (jobId: string) => void
  onRemove: (jobId: string) => void
}

function PreviewVariantGalleryComponent({
  items,
  atLimit,
  labels,
  onSelect,
  onRemove,
}: PreviewVariantGalleryProps) {
  return (
    <section
      className="mb-5 w-full max-w-3xl px-2 lg:mb-12 lg:max-w-none lg:rounded-2xl lg:border lg:border-white/80 lg:bg-white/72 lg:p-3 lg:shadow-[0_14px_36px_rgba(148,93,34,0.10)] lg:backdrop-blur-xl"
      aria-label={labels.title}
    >
      <div className="mb-2 flex items-center justify-between gap-3 lg:flex-col lg:items-start lg:gap-1">
        <h3 className="text-sm font-bold text-gray-800 lg:text-[13px] lg:leading-5">{labels.title}</h3>
        {atLimit ? (
          <p className="text-right text-xs font-medium text-amber-700 lg:text-left lg:text-[10px] lg:leading-4">
            {labels.limit}
          </p>
        ) : null}
      </div>
      <div className="flex max-w-full snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-2 pt-1 lg:max-h-[326px] lg:snap-none lg:flex-col lg:gap-2 lg:overflow-x-hidden lg:overflow-y-auto lg:overscroll-y-contain lg:pb-1 lg:pr-1">
        {items.map((item, index) => {
          const selectable = item.status === 'ready' && !item.removing
          const itemLabel = item.original ? labels.original : labels.version(index)
          return (
            <div
              key={item.jobId}
              className="flex shrink-0 snap-start flex-col lg:w-full lg:flex-row lg:items-center lg:gap-2"
            >
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => selectable && onSelect(item.jobId)}
                  disabled={!selectable}
                  aria-pressed={item.selected}
                  aria-label={itemLabel}
                  className={`relative h-[92px] w-[76px] overflow-hidden rounded-lg border-2 bg-white shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 lg:h-[74px] lg:w-[62px] ${
                    item.selected
                      ? 'border-amber-500 ring-2 ring-amber-200'
                      : 'border-white hover:border-amber-200'
                  } disabled:cursor-default`}
                >
                  {item.thumbnailUrl ? (
                    // Signed Preview URLs should bypass Next's metered image optimizer.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.thumbnailUrl}
                      alt=""
                      className={`h-full w-full object-cover ${item.status === 'failed' ? 'opacity-40 grayscale' : ''}`}
                    />
                  ) : (
                    <span className="absolute inset-0 bg-amber-50" />
                  )}
                  {item.status === 'generating' || item.removing ? (
                    <span className="absolute inset-0 flex items-center justify-center bg-white/72 backdrop-blur-sm">
                      <Loader2 className="h-5 w-5 animate-spin text-amber-600" aria-hidden="true" />
                    </span>
                  ) : null}
                  {item.status === 'failed' ? (
                    <span className="absolute inset-x-1 bottom-1 rounded bg-white/90 px-1 py-0.5 text-[9px] font-bold text-red-600">
                      {labels.failed}
                    </span>
                  ) : null}
                  {item.selected ? (
                    <span className="absolute inset-x-1 bottom-1 rounded bg-amber-500 px-1 py-0.5 text-[9px] font-bold text-white">
                      {labels.selected}
                    </span>
                  ) : null}
                </button>
                {!item.original ? (
                  <button
                    type="button"
                    aria-label={labels.remove}
                    title={labels.remove}
                    disabled={item.removing}
                    onClick={() => onRemove(item.jobId)}
                    className="group absolute -right-3 -top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:opacity-50 lg:-right-2.5 lg:-top-2.5 lg:h-9 lg:w-9"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white shadow-sm transition group-hover:border-red-200 group-hover:text-red-600 lg:h-7 lg:w-7">
                      <X className="h-4 w-4 lg:h-3.5 lg:w-3.5" aria-hidden="true" />
                    </span>
                  </button>
                ) : null}
              </div>
              <p className="mt-1 w-[76px] truncate text-center text-[10px] font-semibold text-gray-600 lg:mt-0 lg:min-w-0 lg:flex-1 lg:text-left lg:leading-4">
                {item.status === 'generating' ? labels.generating : itemLabel}
              </p>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export const PreviewVariantGallery = memo(PreviewVariantGalleryComponent)
