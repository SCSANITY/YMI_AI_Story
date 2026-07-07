'use client'

import React, { memo } from 'react'
import { X } from 'lucide-react'

export type RecentFaceItem = {
  asset_id: string
  storage_path?: string | null
  signed_url?: string | null
}

type RecentFacesStripProps = {
  faces: RecentFaceItem[]
  onSelectFace: (face: RecentFaceItem) => void
  onDeleteFace: (assetId: string) => void
}

function RecentFacesStripComponent({ faces, onSelectFace, onDeleteFace }: RecentFacesStripProps) {
  if (faces.length === 0) return null

  return (
    <div className="flex max-w-full flex-wrap gap-3 overflow-hidden">
      {faces.map((face) => (
        <div key={face.asset_id} className="relative h-12 w-12">
          <button
            type="button"
            className="h-12 w-12 overflow-hidden rounded-full border border-white shadow-sm transition hover:ring-2 hover:ring-amber-300"
            onClick={() => onSelectFace(face)}
          >
            {face.signed_url ? (
              <img
                src={face.signed_url}
                alt="Recent face"
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="block h-full w-full bg-amber-50" aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow transition hover:border-red-200 hover:text-red-500"
            onClick={(event) => {
              event.stopPropagation()
              onDeleteFace(face.asset_id)
            }}
            aria-label="Delete recent face"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </div>
      ))}
    </div>
  )
}

export const RecentFacesStrip = memo(RecentFacesStripComponent)
