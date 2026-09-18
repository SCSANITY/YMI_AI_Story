'use client'

import { memo, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDown, BookOpen, ChevronDown, Eye, Sparkles, UserRound } from 'lucide-react'
import { Button } from '@/components/Button'

type ProductFact = {
  label: string
  icon: 'age' | 'preview' | 'personalized' | 'formats'
}

type PersonalizeProductIntroProps = {
  eyebrow: string
  title: string
  description: string
  facts: ProductFact[]
  fromLabel: string
  priceLabel: string
  ctaLabel: string
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
  facts,
  fromLabel,
  priceLabel,
  ctaLabel,
  faqHeading,
  faqItems,
  onStart,
}: PersonalizeProductIntroProps) {
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [needsScrollGuide, setNeedsScrollGuide] = useState(false)
  const [guideUsed, setGuideUsed] = useState(false)
  const personalizeButtonRef = useRef<HTMLButtonElement>(null)
  const personalizeButtonId = useId()

  useEffect(() => {
    const target = personalizeButtonRef.current
    if (!target) return
    const observer = new IntersectionObserver(([entry]) => {
      setNeedsScrollGuide(!entry.isIntersecting && entry.boundingClientRect.top >= window.innerHeight)
    })
    observer.observe(target)
    return () => observer.disconnect()
  }, [])

  const scrollToPersonalize = () => {
    setGuideUsed(true)
    personalizeButtonRef.current?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'center',
    })
  }

  return (
    <section className="flex flex-col py-1 lg:pl-2">
      <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-amber-700">{eyebrow}</p>
      <h1 className="mt-2.5 font-serif text-[1.85rem] font-bold leading-[1.1] tracking-[-0.025em] text-slate-950 sm:text-[2.1rem] lg:text-[2.25rem]">
        {title}
      </h1>
      <p className="mt-4 max-w-2xl text-[0.94rem] leading-6 text-slate-600">
        {description}
      </p>

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
        <p className="text-sm font-semibold text-slate-500">{fromLabel}</p>
        <p className="mt-1 text-2xl font-extrabold tracking-tight text-slate-950">{priceLabel}</p>
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
      {needsScrollGuide && !guideUsed ? createPortal(
        <div className="fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-[#fff9f2]/95 via-[#fff9f2]/80 to-transparent px-4 pt-6 pb-[calc(1rem+env(safe-area-inset-bottom))] md:hidden">
          <Button
            type="button"
            size="lg"
            aria-controls={personalizeButtonId}
            aria-label={`Scroll to ${ctaLabel}`}
            onClick={scrollToPersonalize}
            className={PERSONALIZE_BUTTON_CLASS}
          >
            {ctaLabel}
            <ArrowDown className="ms-2 h-4 w-4 shrink-0" aria-hidden="true" />
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
