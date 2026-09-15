'use client'

import { memo, type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { ChevronsDown } from 'lucide-react'

type PreviewStepLayoutProps = {
  progress: ReactNode
  intro: ReactNode
  book: ReactNode
  gallery?: ReactNode
  purchase: ReactNode
  scrollCueLabel: string
}

function PreviewStepLayoutComponent({ progress, intro, book, gallery, purchase, scrollCueLabel }: PreviewStepLayoutProps) {
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
    <div className="mx-auto min-h-[600px] w-full max-w-[1600px] animate-in fade-in py-2 duration-200 md:py-4">
      <div className="grid min-w-0 gap-7 xl:grid-cols-[minmax(0,7fr)_minmax(310px,3fr)] xl:items-start xl:gap-10">
        <section className="relative min-w-0" aria-label="Book Preview">
          <div className="flex min-w-0 flex-col xl:grid xl:grid-cols-[112px_minmax(0,1fr)] xl:items-start xl:gap-x-5">
            <div className="order-1 min-w-0 xl:col-start-2 xl:row-start-1">
              {progress}
              <div className="mx-auto w-full max-w-[380px]">{intro}</div>
            </div>
            <div className="order-2 min-w-0 xl:col-start-2 xl:row-start-2">{book}</div>
            <div className="order-3 min-w-0 xl:col-start-1 xl:row-start-2">{gallery}</div>
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
        <div ref={purchaseRef} className="scroll-mt-5 xl:min-w-0 xl:self-start xl:px-2 xl:pt-2">{purchase}</div>
      </div>
    </div>
  )
}

export const PreviewStepLayout = memo(PreviewStepLayoutComponent)
