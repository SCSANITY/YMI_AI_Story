'use client'

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import NextImage from 'next/image'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'

type ProductShowcaseCarouselProps = {
  bookId: string
  title: string
  coverUrl?: string | null
  images?: string[]
  isMobile: boolean
  windowWidth: number
  uploadPanelRef: React.RefObject<HTMLDivElement | null>
}

const toNextImagePreloadUrl = (src: string, width: 640 | 750) => {
  if (!src || src.startsWith('data:') || src.startsWith('blob:') || src.startsWith('/_next/image')) {
    return src
  }

  return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=75`
}

function ProductShowcaseCarouselComponent({
  bookId,
  title,
  coverUrl,
  images,
  isMobile,
  windowWidth,
  uploadPanelRef,
}: ProductShowcaseCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [imageErrors, setImageErrors] = useState<Set<string>>(() => new Set())
  const [desktopThumbSize, setDesktopThumbSize] = useState(72)
  const [desktopMainSize, setDesktopMainSize] = useState(520)
  const [desktopThumbColumnWidth, setDesktopThumbColumnWidth] = useState(78)

  const rowRef = useRef<HTMLDivElement | null>(null)
  const mainRef = useRef<HTMLDivElement | null>(null)
  const thumbViewportRef = useRef<HTMLDivElement | null>(null)
  const thumbRefs = useRef<Array<HTMLButtonElement | null>>([])
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)

  const showcaseImages = useMemo(() => {
    const validImages = Array.isArray(images) ? images.filter(Boolean) : []
    const normalized = validImages.length > 0 ? [...validImages] : [coverUrl || '']
    return Array.from(new Set(normalized.filter(Boolean)))
  }, [coverUrl, images])

  const getImageSrc = useCallback((image: string) => {
    if (imageErrors.has(image) && coverUrl) {
      return coverUrl
    }
    return image
  }, [coverUrl, imageErrors])

  const markImageError = useCallback((image: string) => {
    setImageErrors((prev) => {
      if (prev.has(image)) return prev
      const next = new Set(prev)
      next.add(image)
      return next
    })
  }, [])

  const goToPrevious = useCallback(() => {
    if (showcaseImages.length <= 1) return
    setActiveIndex((prev) => (prev - 1 + showcaseImages.length) % showcaseImages.length)
  }, [showcaseImages.length])

  const goToNext = useCallback(() => {
    if (showcaseImages.length <= 1) return
    setActiveIndex((prev) => (prev + 1) % showcaseImages.length)
  }, [showcaseImages.length])

  const handleTouchStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0]
    if (!touch) return
    touchStartRef.current = { x: touch.clientX, y: touch.clientY }
  }, [])

  const handleTouchEnd = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    const start = touchStartRef.current
    touchStartRef.current = null
    if (!start || showcaseImages.length <= 1) return

    const touch = event.changedTouches[0]
    if (!touch) return

    const deltaX = touch.clientX - start.x
    const deltaY = touch.clientY - start.y
    const absX = Math.abs(deltaX)
    const absY = Math.abs(deltaY)

    if (absX < 48 || absX < absY * 1.25) return

    if (deltaX < 0) {
      goToNext()
    } else {
      goToPrevious()
    }
  }, [goToNext, goToPrevious, showcaseImages.length])

  useEffect(() => {
    setActiveIndex(0)
    setImageErrors(new Set())
  }, [bookId])

  useEffect(() => {
    if (showcaseImages.length <= 1) return

    const interval = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % showcaseImages.length)
    }, 4000)

    return () => window.clearInterval(interval)
  }, [showcaseImages.length])

  useEffect(() => {
    if (showcaseImages.length === 0) return
    setActiveIndex((prev) => (prev >= showcaseImages.length ? 0 : prev))
  }, [showcaseImages.length])

  useEffect(() => {
    if (isMobile) return
    const rowNode = rowRef.current
    const node = mainRef.current
    const uploadNode = uploadPanelRef.current
    if (!node || !rowNode || !uploadNode) return

    const GAP = 8
    const MIN_THUMB_SIZE = 68
    const MAX_THUMB_SIZE = 76
    const COLUMN_GAP = 12
    const SCROLL_SLOT = 8
    const MIN_MAIN_SIZE = 420

    const recompute = () => {
      const rowRect = rowNode.getBoundingClientRect()
      const uploadRect = uploadNode.getBoundingClientRect()
      const rowWidth = rowNode.getBoundingClientRect().width
      const desiredMainSize = Math.floor(uploadRect.bottom - rowRect.top)
      if (!desiredMainSize || !rowWidth) return

      const solveForVisibleCount = (count: number) => {
        const maxSizeByWidth = Math.floor(
          (
            rowWidth
            - COLUMN_GAP
            - SCROLL_SLOT
            + (GAP * (count - 1)) / count
          ) / (1 + 1 / count)
        )
        const nextMainSize = Math.max(MIN_MAIN_SIZE, Math.min(desiredMainSize, maxSizeByWidth))
        const nextThumbSize = Math.floor((nextMainSize - GAP * (count - 1)) / count)
        return { mainSize: nextMainSize, thumbSize: nextThumbSize }
      }

      const optionSix = solveForVisibleCount(6)
      const optionFive = solveForVisibleCount(5)
      const preferred = optionSix.thumbSize >= MIN_THUMB_SIZE ? optionSix : optionFive
      const clampedThumbSize = Math.min(MAX_THUMB_SIZE, Math.max(preferred.thumbSize, MIN_THUMB_SIZE))

      setDesktopMainSize(preferred.mainSize)
      setDesktopThumbSize(clampedThumbSize)
      setDesktopThumbColumnWidth(clampedThumbSize + SCROLL_SLOT)
    }

    recompute()

    const observer = new ResizeObserver(recompute)
    observer.observe(rowNode)
    observer.observe(uploadNode)
    observer.observe(node)

    return () => observer.disconnect()
  }, [isMobile, showcaseImages.length, uploadPanelRef, windowWidth])

  useEffect(() => {
    const viewport = thumbViewportRef.current
    const target = thumbRefs.current[activeIndex]
    if (!viewport || !target) return

    if (isMobile) {
      const targetCenter = target.offsetLeft + target.offsetWidth / 2
      const nextLeft = Math.max(0, targetCenter - viewport.clientWidth / 2)
      viewport.scrollTo({ left: nextLeft, behavior: 'smooth' })
      return
    }

    const buffer = 8
    const currentTop = viewport.scrollTop
    const targetTop = target.offsetTop
    const targetBottom = targetTop + target.offsetHeight
    const viewportTop = currentTop
    const viewportBottom = currentTop + viewport.clientHeight

    let nextTop = currentTop

    if (targetTop < viewportTop + buffer) {
      nextTop = Math.max(0, targetTop - buffer)
    } else if (targetBottom > viewportBottom - buffer) {
      nextTop = targetBottom - viewport.clientHeight + buffer
    }

    if (nextTop !== currentTop) {
      viewport.scrollTo({ top: nextTop, behavior: 'smooth' })
    }
  }, [activeIndex, isMobile])

  useEffect(() => {
    if (showcaseImages.length <= 1) return

    const timer = window.setTimeout(() => {
      const nextIndex = (activeIndex + 1) % showcaseImages.length
      const url = getImageSrc(showcaseImages[nextIndex] || '')
      if (!url) return

      const img = new Image()
      img.decoding = 'async'
      img.fetchPriority = 'low'
      img.src = toNextImagePreloadUrl(url, isMobile ? 640 : 750)
    }, activeIndex === 0 ? 1200 : 180)

    return () => window.clearTimeout(timer)
  }, [activeIndex, getImageSrc, isMobile, showcaseImages])

  const activeImage = showcaseImages[activeIndex] || showcaseImages[0] || coverUrl || ''
  const activeImageSrc = activeImage ? getImageSrc(activeImage) : ''

  if (showcaseImages.length === 0) {
    return null
  }

  return (
    <div
      ref={rowRef}
      className="flex min-w-0 flex-col gap-2.5 md:grid md:items-start md:gap-3"
      style={isMobile ? undefined : { gridTemplateColumns: `${desktopThumbColumnWidth}px minmax(0, 1fr)` }}
    >
      <div className="order-2 min-w-0 md:order-1 md:shrink-0">
        <div className="relative w-full max-w-full min-w-0 overflow-hidden md:overflow-visible">
          <div
            ref={thumbViewportRef}
            className="thumb-scroll-column flex w-full max-w-full min-w-0 gap-2 overflow-x-auto px-0 pb-1 md:w-auto md:max-w-none md:flex-col md:gap-2 md:overflow-y-auto md:overflow-x-hidden md:pr-[6px] md:pb-0"
            style={
              isMobile
                ? undefined
                : { width: `${desktopThumbColumnWidth}px`, height: `${desktopMainSize}px` }
            }
          >
            {showcaseImages.map((image, index) => {
              const isActive = index === activeIndex

              return (
                <button
                  key={`${image}-${index}`}
                  ref={(node) => {
                    thumbRefs.current[index] = node
                  }}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  className={`group relative aspect-square overflow-hidden rounded-[0.82rem] border transition-all duration-300 shrink-0 ${
                    isActive
                      ? 'border-amber-300/95 bg-white/85 ring-2 ring-amber-200/55 shadow-[0_8px_18px_-18px_rgba(217,119,6,0.24)]'
                      : 'border-gray-200/60 bg-white/30 hover:border-amber-200/80'
                  }`}
                  style={
                    isMobile
                      ? { width: '3.75rem', height: '3.75rem' }
                      : { width: `${desktopThumbSize}px`, height: `${desktopThumbSize}px` }
                  }
                  aria-label={`Show preview image ${index + 1}`}
                >
                  <div className="relative aspect-square overflow-hidden rounded-[inherit]">
                    <NextImage
                      src={getImageSrc(image)}
                      alt={`${title} showcase ${index + 1}`}
                      fill
                      sizes={isMobile ? '60px' : `${desktopThumbSize}px`}
                      loading="lazy"
                      onError={() => markImageError(image)}
                      className={`h-full w-full object-cover transition-transform duration-500 ${isActive ? 'scale-[1.04]' : 'scale-100 group-hover:scale-[1.03]'}`}
                    />
                  </div>
                </button>
              )
            })}
          </div>
          {!isMobile ? (
            <>
              <div className="pointer-events-none absolute inset-x-0 top-0 h-5 rounded-t-[0.82rem] bg-gradient-to-b from-white/96 via-white/72 to-transparent" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-5 rounded-b-[0.82rem] bg-gradient-to-t from-white/96 via-white/72 to-transparent" />
            </>
          ) : null}
        </div>
      </div>

      <div className="order-1 md:order-2 min-w-0">
        <div
          ref={mainRef}
          className="relative mx-auto aspect-square w-full max-w-[430px] touch-pan-y overflow-hidden rounded-[0.96rem] bg-[#f6efe7] shadow-[0_16px_24px_-22px_rgba(0,0,0,0.18)] md:mx-0 md:max-w-none"
          style={isMobile ? undefined : { width: `${desktopMainSize}px`, maxWidth: '100%' }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={activeImage}
              className="absolute inset-0"
              initial={{ opacity: 0, x: 18, scale: 1.02 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -18, scale: 0.985 }}
              transition={{ duration: 0.42, ease: 'easeOut' }}
            >
              {activeImageSrc ? (
                <NextImage
                  src={activeImageSrc}
                  alt={`${title} showcase main`}
                  fill
                  sizes={isMobile ? 'min(100vw, 430px)' : `${desktopMainSize}px`}
                  priority={activeIndex === 0}
                  fetchPriority={activeIndex === 0 ? 'high' : 'auto'}
                  onError={() => markImageError(activeImage)}
                  className="object-cover"
                />
              ) : null}
            </motion.div>
          </AnimatePresence>
          {showcaseImages.length > 1 ? (
            <>
              <button
                type="button"
                aria-label="Previous showcase image"
                onClick={goToPrevious}
                className="absolute left-3 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/70 bg-white/35 text-gray-700 shadow-[0_10px_24px_rgba(15,23,42,0.18)] backdrop-blur-xl transition duration-200 hover:scale-105 hover:bg-white/55 focus:outline-none focus:ring-2 focus:ring-amber-300/70 md:left-4 md:h-11 md:w-11"
              >
                <ChevronLeft className="h-5 w-5 drop-shadow-sm" />
              </button>
              <button
                type="button"
                aria-label="Next showcase image"
                onClick={goToNext}
                className="absolute right-3 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/70 bg-white/35 text-gray-700 shadow-[0_10px_24px_rgba(15,23,42,0.18)] backdrop-blur-xl transition duration-200 hover:scale-105 hover:bg-white/55 focus:outline-none focus:ring-2 focus:ring-amber-300/70 md:right-4 md:h-11 md:w-11"
              >
                <ChevronRight className="h-5 w-5 drop-shadow-sm" />
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export const ProductShowcaseCarousel = memo(ProductShowcaseCarouselComponent)
