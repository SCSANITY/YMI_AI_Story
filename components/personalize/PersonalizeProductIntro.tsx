'use client'

import { memo, useState } from 'react'
import { BookOpen, ChevronDown, Eye, Sparkles, UserRound } from 'lucide-react'
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

  return (
    <section className="flex min-h-full flex-col rounded-[1.5rem] bg-white px-5 py-6 shadow-[0_24px_65px_-48px_rgba(69,44,15,0.48)] sm:px-7 sm:py-8 lg:px-8">
      <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-amber-700">{eyebrow}</p>
      <h1 className="mt-3 font-serif text-[2rem] font-bold leading-[1.08] tracking-[-0.025em] text-slate-950 sm:text-[2.4rem] lg:text-[2.7rem]">
        {title}
      </h1>
      <p className="mt-5 max-w-2xl text-[0.98rem] leading-7 text-slate-600 sm:text-base">
        {description}
      </p>

      <ul className="mt-6 grid gap-3" aria-label="Book details">
        {facts.slice(0, 4).map((fact) => {
          const Icon = FACT_ICONS[fact.icon]
          return (
            <li key={`${fact.icon}-${fact.label}`} className="flex items-center gap-3 text-sm font-semibold text-slate-800 sm:text-base">
              <Icon className="h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
              <span>{fact.label}</span>
            </li>
          )
        })}
      </ul>

      <div className="mt-7 border-t border-slate-200 pt-5">
        <p className="text-sm font-semibold text-slate-500">{fromLabel}</p>
        <p className="mt-1 text-3xl font-extrabold tracking-tight text-slate-950">{priceLabel}</p>
        <Button
          type="button"
          size="lg"
          onClick={onStart}
          className="glass-action-btn glass-action-btn--brand mt-5 h-14 w-full rounded-2xl text-base font-bold sm:h-16 sm:text-lg"
        >
          {ctaLabel}
        </Button>
      </div>

      <div className="mt-7 border-t border-slate-200 pt-2">
        <h2 className="sr-only">{faqHeading}</h2>
        {faqItems.map((item, index) => {
          const isOpen = openFaq === index
          const contentId = `product-faq-${index}`
          return (
            <div key={item.question} className="border-b border-slate-200">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-4 py-4 text-left text-sm font-bold text-slate-900 sm:text-base"
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
