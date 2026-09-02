'use client'

import React, { memo, type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { ChevronsDown } from 'lucide-react'

type PreviewStepLayoutProps = {
  intro: ReactNode
  book: ReactNode
  gallery?: ReactNode
  actions: ReactNode
  scrollCueLabel: string
}

function PreviewStepLayoutComponent({ intro, book, gallery, actions, scrollCueLabel }: PreviewStepLayoutProps) {
  const actionsRef = useRef<HTMLDivElement | null>(null)
  const [showScrollCue, setShowScrollCue] = useState(false)

  useEffect(() => {
    const target = actionsRef.current
    if (!target) return

    const desktopQuery = window.matchMedia('(min-width: 1024px)')
    const updateCueVisibility = () => {
      const targetRect = target.getBoundingClientRect()
      setShowScrollCue(
        desktopQuery.matches && targetRect.top > 0 && targetRect.bottom > window.innerHeight
      )
    }
    const observer = new IntersectionObserver(([entry]) => {
      setShowScrollCue(
        desktopQuery.matches && entry.boundingClientRect.top > 0 && entry.boundingClientRect.bottom > window.innerHeight
      )
    }, { threshold: [0, 0.25, 0.5, 0.75, 1] })

    observer.observe(target)
    desktopQuery.addEventListener('change', updateCueVisibility)
    window.addEventListener('resize', updateCueVisibility)
    updateCueVisibility()

    return () => {
      observer.disconnect()
      desktopQuery.removeEventListener('change', updateCueVisibility)
      window.removeEventListener('resize', updateCueVisibility)
    }
  }, [])

  const handleScrollToActions = useCallback(() => {
    setShowScrollCue(false)
    actionsRef.current?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    })
  }, [])

  const bookWithScrollCue = (
    <div className="relative order-1 w-full min-w-0 xl:mx-auto xl:w-[760px]">
      {book}
      <button
        type="button"
        aria-label={scrollCueLabel}
        title={scrollCueLabel}
        onClick={handleScrollToActions}
        className={`absolute bottom-0 left-1/2 z-30 hidden h-12 w-12 -translate-x-1/2 items-center justify-center rounded-full border border-amber-200/80 bg-white/72 text-amber-600 shadow-[0_12px_30px_rgba(245,158,11,0.24),inset_0_1px_0_rgba(255,255,255,0.92)] backdrop-blur-xl transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 lg:flex ${
          showScrollCue
            ? 'translate-y-0 opacity-100'
            : 'pointer-events-none translate-y-2 opacity-0'
        }`}
      >
        <span className="absolute inset-1 rounded-full bg-gradient-to-b from-amber-100/90 to-orange-100/75 ring-1 ring-white/90" aria-hidden="true" />
        <ChevronsDown className="relative h-6 w-6 drop-shadow-sm motion-safe:animate-bounce" aria-hidden="true" />
      </button>
    </div>
  )

  return (
    <div
      className="mx-auto flex min-h-[600px] max-w-7xl animate-in flex-col items-center justify-center fade-in py-6 duration-200 md:py-10"
    >
      {intro}
      {gallery ? (
        <div className="relative flex w-full flex-col items-center xl:block">
          <aside className="order-2 w-full min-w-0 xl:absolute xl:right-[calc(50%+412px)] xl:top-0 xl:w-[168px]">
            {gallery}
          </aside>
          {bookWithScrollCue}
        </div>
      ) : (
        bookWithScrollCue
      )}
      <div ref={actionsRef} className="flex w-full scroll-mt-6 flex-col items-center">
        {actions}
      </div>
    </div>
  )
}

export const PreviewStepLayout = memo(PreviewStepLayoutComponent)
