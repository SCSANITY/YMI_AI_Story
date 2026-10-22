'use client'

import { memo, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BookOpen, ChevronDown, Eye, Sparkles, Star, UserRound } from 'lucide-react'
import { Button } from '@/components/Button'
import { isNightAtFloatingCta } from './product/presentation'

type ProductFact = {
  label: string
  icon: 'age' | 'preview' | 'personalized' | 'formats'
}

type PersonalizeProductIntroProps = {
  eyebrow: string
  title: string
  description: string
  readMoreLabel?: string
  readLessLabel?: string
  facts: ProductFact[]
  fromLabel: string
  priceLabel: string
  compareAtPriceLabel?: string
  discountPercent?: number | null
  ctaLabel: string
  floatingCtaLabel?: string
  faqHeading: string
  faqItems: Array<{ question: string; answer: string }>
  onStart: () => void
}

const FACT_ICONS = {
  age: UserRound,
  preview: Eye,
  personalized: Sparkles,
  formats: BookOpen,
}

const PERSONALIZE_BUTTON_CLASS = 'glass-action-btn glass-action-btn--brand h-13 w-full rounded-xl text-base font-bold sm:h-14'

function PersonalizeProductIntroComponent({
  eyebrow,
  title,
  description,
  readMoreLabel = 'Read more',
  readLessLabel = 'Read less',
  facts,
  fromLabel,
  priceLabel,
  compareAtPriceLabel,
  discountPercent,
  ctaLabel,
  floatingCtaLabel = ctaLabel,
  faqHeading,
  faqItems,
  onStart,
}: PersonalizeProductIntroProps) {
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [needsScrollGuide, setNeedsScrollGuide] = useState(false)
  const [night, setNight] = useState(false)
  const floatingRef = useRef<HTMLDivElement>(null)
  const [descriptionExpanded, setDescriptionExpanded] = useState(false)
  const [descriptionOverflows, setDescriptionOverflows] = useState(false)
  const descriptionRef = useRef<HTMLParagraphElement>(null)
  const descriptionId = useId()
  const personalizeButtonRef = useRef<HTMLButtonElement>(null)
  const personalizeButtonId = useId()

  useEffect(() => {
    const target = descriptionRef.current
    if (!target) return
    let active = true
    const measure = () => {
      if (!active) return
      const lineHeight = Number.parseFloat(window.getComputedStyle(target).lineHeight)
      setDescriptionOverflows(target.scrollHeight > lineHeight * 2 + 1)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(target)
    void document.fonts?.ready.then(measure)
    return () => { active = false; observer.disconnect() }
  }, [description])

  useEffect(() => {
    const target = personalizeButtonRef.current
    if (!target) return
    const observer = new IntersectionObserver(([entry]) => {
      setNeedsScrollGuide(!entry.isIntersecting)
    })
    observer.observe(target)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!needsScrollGuide) return
    let frame = 0
    const update = () => {
      frame = 0
      const target = document.getElementById('customize-signature-voice')
      setNight(Boolean(target && isNightAtFloatingCta(target.getBoundingClientRect(), window.innerHeight, floatingRef.current?.offsetHeight ?? 84)))
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule, { passive: true })
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule) }
  }, [needsScrollGuide])

  return (
    <section className="flex flex-col py-1 lg:pl-2">
      <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-amber-700">{eyebrow}</p>
      <h1 className="mt-2.5 font-serif text-[1.85rem] font-bold leading-[1.1] tracking-[-0.025em] text-slate-950 sm:text-[2.1rem] lg:text-[2.25rem]">
        {title}
      </h1>
      <span aria-hidden="true" data-product-star-motif="true" className="mt-3 flex gap-1 text-amber-500">
        {[0, 1, 2, 3, 4].map((index) => <Star key={index} className="h-5 w-5" fill="currentColor" />)}
      </span>
      <p ref={descriptionRef} id={descriptionId} className={`mt-4 max-w-2xl whitespace-pre-line break-words text-[0.94rem] leading-6 text-slate-600 ${descriptionExpanded ? '' : 'line-clamp-2'}`}>
        {description}
      </p>
      {descriptionOverflows ? (
        <button type="button" aria-expanded={descriptionExpanded} aria-controls={descriptionId} onClick={() => setDescriptionExpanded((current) => !current)} className="mt-1 flex min-h-11 self-start items-center gap-1.5 rounded-lg text-sm font-bold text-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2">
          {descriptionExpanded ? readLessLabel : readMoreLabel}
          <ChevronDown className={`h-4 w-4 transition-transform motion-reduce:transition-none ${descriptionExpanded ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
      ) : null}

      <ul className="mt-5 grid gap-2.5" aria-label="Book details">
        {facts.slice(0, 4).map((fact) => {
          const Icon = FACT_ICONS[fact.icon]
          return (
            <li key={`${fact.icon}-${fact.label}`} className="flex items-center gap-2.5 text-sm font-semibold text-slate-800">
              <Icon className="h-[18px] w-[18px] shrink-0 text-amber-700" aria-hidden="true" />
              <span>{fact.label}</span>
            </li>
          )
        })}
      </ul>

      <div className="mt-5 border-t border-slate-200 pt-4">
        <div className="rounded-2xl border border-amber-200/70 bg-gradient-to-r from-amber-50/90 to-orange-50/80 px-4 py-3">
          <p className="text-sm font-semibold text-amber-800">{fromLabel}</p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2.5 gap-y-1.5">
            <p className="whitespace-nowrap text-2xl font-extrabold tracking-tight text-amber-600">{priceLabel}</p>
            {compareAtPriceLabel ? (
              <s className="whitespace-nowrap text-sm font-semibold text-gray-400">{compareAtPriceLabel}</s>
            ) : null}
            {compareAtPriceLabel && discountPercent != null && discountPercent > 0 ? (
              <span className="rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-2.5 py-1 text-xs font-extrabold tracking-wide text-white shadow-sm shadow-orange-300/30">
                -{discountPercent}%
              </span>
            ) : null}
          </div>
        </div>
        <Button
          ref={personalizeButtonRef}
          id={personalizeButtonId}
          type="button"
          size="lg"
          onClick={onStart}
          className={`${PERSONALIZE_BUTTON_CLASS} mt-4 scroll-mt-24`}
        >
          {ctaLabel}
        </Button>
      </div>
      {needsScrollGuide ? createPortal(
        <div ref={floatingRef} data-customize-floating-cta data-theme={night ? 'night' : 'day'}
          className={`fixed inset-x-3 bottom-[calc(.75rem+env(safe-area-inset-bottom))] z-30 flex items-center justify-between gap-5 rounded-2xl border px-4 py-2.5 shadow-lg backdrop-blur-xl transition-colors motion-reduce:transition-none md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:rounded-full md:px-5 ${night ? 'border-white/20 bg-[rgba(26,22,48,.86)] text-[#fff4e0]' : 'border-white/80 bg-white/85 text-stone-800'}`}>
          <span className="whitespace-nowrap text-[13px] md:text-sm">{fromLabel} <strong>{priceLabel}</strong></span>
          <Button
            type="button"
            size="lg"
            aria-controls={personalizeButtonId}
            aria-label={ctaLabel}
            onClick={onStart}
            className="glass-action-btn glass-action-btn--brand min-h-11 rounded-full px-6 text-sm font-bold"
          >
            {floatingCtaLabel}
          </Button>
        </div>,
        document.body,
      ) : null}

      <div className="mt-6 border-t border-slate-200 pt-1">
        <h2 className="sr-only">{faqHeading}</h2>
        {faqItems.map((item, index) => {
          const isOpen = openFaq === index
          const contentId = `product-faq-${index}`
          return (
            <div key={item.question} className="border-b border-slate-200">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-4 py-3.5 text-left text-sm font-bold text-slate-900"
                aria-expanded={isOpen}
                aria-controls={contentId}
                onClick={() => setOpenFaq(isOpen ? null : index)}
              >
                <span>{item.question}</span>
                <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>
              {isOpen ? (
                <p id={contentId} className="pb-4 text-sm leading-6 text-slate-600">{item.answer}</p>
              ) : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}

export const PersonalizeProductIntro = memo(PersonalizeProductIntroComponent)
