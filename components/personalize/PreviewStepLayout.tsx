'use client'

import { memo, type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { ChevronsDown } from 'lucide-react'

type PreviewStepLayoutProps = {
  intro: ReactNode
  book: ReactNode
  gallery?: ReactNode
  purchase: ReactNode
  scrollCueLabel: string
}

function PreviewStepLayoutComponent({ intro, book, gallery, purchase, scrollCueLabel }: PreviewStepLayoutProps) {
  const purchaseRef = useRef<HTMLDivElement | null>(null)
  const [showScrollCue, setShowScrollCue] = useState(false)

  useEffect(() => {
    const target = purchaseRef.current
    if (!target) return
    const sideBySide = window.matchMedia('(min-width: 1280px)')
    const updateCueVisibility = () => {
      const targetRect = target.getBoundingClientRect()
      setShowScrollCue(!sideBySide.matches && targetRect.top > window.innerHeight)
    }
    const observer = new IntersectionObserver(([entry]) => {
      setShowScrollCue(!sideBySide.matches && !entry.isIntersecting && entry.boundingClientRect.top > 0)
    }, { threshold: [0, 0.25, 0.5, 0.75, 1] })

    observer.observe(target)
    sideBySide.addEventListener('change', updateCueVisibility)
    window.addEventListener('resize', updateCueVisibility)
    updateCueVisibility()
    return () => {
      observer.disconnect()
      sideBySide.removeEventListener('change', updateCueVisibility)
      window.removeEventListener('resize', updateCueVisibility)
    }
  }, [])

  const handleScrollToPurchase = useCallback(() => {
    setShowScrollCue(false)
    purchaseRef.current?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    })
  }, [])

  return (
    <div className="mx-auto min-h-[600px] w-full max-w-[1480px] animate-in fade-in py-5 duration-200 md:py-8">
      {intro}
      <div className="mt-5 grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.82fr)_minmax(340px,1fr)] xl:items-start">
        <section className="relative min-w-0" aria-label="Book Preview">
          <div className="flex min-w-0 flex-col gap-4 xl:grid xl:grid-cols-[150px_minmax(0,1fr)] xl:items-start">
            <div className="order-2 min-w-0 xl:order-1">{gallery}</div>
            <div className="order-1 min-w-0 xl:order-2">{book}</div>
          </div>
          <button
            type="button"
            aria-label={scrollCueLabel}
            title={scrollCueLabel}
            onClick={handleScrollToPurchase}
            className={`fixed bottom-5 left-1/2 z-30 flex h-12 -translate-x-1/2 items-center gap-2 rounded-full border border-amber-200 bg-white/95 px-4 text-sm font-bold text-amber-800 shadow-xl backdrop-blur transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 xl:hidden ${showScrollCue ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'}`}
          >
            <ChevronsDown className="h-5 w-5 motion-safe:animate-bounce" aria-hidden="true" />
            {scrollCueLabel}
          </button>
        </section>
        <div ref={purchaseRef} className="scroll-mt-5 xl:min-w-0">{purchase}</div>
      </div>
    </div>
  )
}

export const PreviewStepLayout = memo(PreviewStepLayoutComponent)
