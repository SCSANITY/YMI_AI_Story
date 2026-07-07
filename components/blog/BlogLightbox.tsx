import { X } from 'lucide-react'
import type { LightboxState } from './blogTypes'

type BlogLightboxProps = {
  lightbox: LightboxState
  onClose: () => void
  onPrevious: () => void
  onNext: () => void
}

export function BlogLightbox({ lightbox, onClose, onPrevious, onNext }: BlogLightboxProps) {
  const currentLightboxImage = lightbox ? lightbox.images[lightbox.index] ?? null : null

  if (!lightbox || !currentLightboxImage) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/82 p-4">
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full bg-white/12 p-2 text-white backdrop-blur transition hover:bg-white/20"
        aria-label="Close image preview"
      >
        <X className="h-6 w-6" />
      </button>
      <button
        type="button"
        onClick={onPrevious}
        className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/12 px-4 py-3 text-2xl text-white backdrop-blur transition hover:bg-white/20"
        aria-label="Previous image"
      >
        {'<'}
      </button>
      {/* Lightbox uses the original image so admins/users can inspect the full uploaded asset. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={currentLightboxImage} alt="Announcement preview" className="max-h-[86vh] max-w-[92vw] rounded-2xl object-contain shadow-2xl" />
      <button
        type="button"
        onClick={onNext}
        className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/12 px-4 py-3 text-2xl text-white backdrop-blur transition hover:bg-white/20"
        aria-label="Next image"
      >
        {'>'}
      </button>
    </div>
  )
}
