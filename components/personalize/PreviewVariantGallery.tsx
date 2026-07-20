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
    <section className="mb-5 w-full max-w-3xl px-2" aria-label={labels.title}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-gray-800">{labels.title}</h3>
        {atLimit ? (
          <p className="text-right text-xs font-medium text-amber-700">{labels.limit}</p>
        ) : null}
      </div>
      <div className="flex max-w-full gap-3 overflow-x-auto pb-2 pt-1">
        {items.map((item, index) => {
          const selectable = item.status === 'ready' && !item.removing
          const itemLabel = item.original ? labels.original : labels.version(index)
          return (
            <div key={item.jobId} className="relative shrink-0">
              <button
                type="button"
                onClick={() => selectable && onSelect(item.jobId)}
                disabled={!selectable}
                aria-pressed={item.selected}
                aria-label={itemLabel}
                className={`relative h-[92px] w-[76px] overflow-hidden rounded-md border-2 bg-white shadow-sm transition ${
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
                    <Loader2 className="h-5 w-5 animate-spin text-amber-600" />
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
                  className="absolute -right-2 -top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm transition hover:border-red-200 hover:text-red-600 disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
              <p className="mt-1 w-[76px] truncate text-center text-[10px] font-semibold text-gray-600">
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
