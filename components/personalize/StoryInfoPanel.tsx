'use client'

import React, { memo, useState } from 'react'
import { Check, ChevronDown, CircleHelp, Heart, Shield, Sparkles, Star, type LucideIcon } from 'lucide-react'
import type { MagicAttribute } from '@/types'

type StoryInfoPanelProps = {
  title: string
  description: string
  magicAttributes: MagicAttribute[]
  faqItems: Array<{ question: string; answer: string }>
  labels: {
    magicAttributes: string
    aboutThisStory: string
  }
  translateMagicAttribute: (key: string) => string
}

const normalizeMagicAttributeKey = (value: string) =>
  value.trim().toLowerCase().replace(/&/g, 'and').replace(/\s+/g, ' ')

const MAGIC_ATTRIBUTE_DISPLAY: Record<
  string,
  {
    i18nKey: string
    icon: LucideIcon
    iconClassName: string
    barClassName: string
  }
> = {
  'grace and beauty': {
    i18nKey: 'personalize.magicAttribute.graceAndBeauty',
    icon: Sparkles,
    iconClassName: 'text-rose-400',
    barClassName: 'bg-rose-400',
  },
  'goodness and virtue': {
    i18nKey: 'personalize.magicAttribute.goodnessAndVirtue',
    icon: Heart,
    iconClassName: 'text-pink-400',
    barClassName: 'bg-pink-400',
  },
  'hope and resilience': {
    i18nKey: 'personalize.magicAttribute.hopeAndResilience',
    icon: Shield,
    iconClassName: 'text-blue-400',
    barClassName: 'bg-blue-400',
  },
  'love and connection': {
    i18nKey: 'personalize.magicAttribute.loveAndConnection',
    icon: Heart,
    iconClassName: 'text-red-400',
    barClassName: 'bg-red-400',
  },
  'truth and integrity': {
    i18nKey: 'personalize.magicAttribute.truthAndIntegrity',
    icon: Check,
    iconClassName: 'text-emerald-400',
    barClassName: 'bg-emerald-400',
  },
  'faith and trust': {
    i18nKey: 'personalize.magicAttribute.faithAndTrust',
    icon: Star,
    iconClassName: 'text-amber-400',
    barClassName: 'bg-amber-400',
  },
}

const DEFAULT_MAGIC_ATTRIBUTE_DISPLAY = {
  icon: Sparkles,
  iconClassName: 'text-purple-400',
  barClassName: 'bg-purple-400',
}

function StoryInfoPanelComponent({
  title,
  description,
  magicAttributes,
  faqItems,
  labels,
  translateMagicAttribute,
}: StoryInfoPanelProps) {
  const [expandedFaqIndex, setExpandedFaqIndex] = useState<number | null>(null)
  const [isMobileStoryInfoOpen, setMobileStoryInfoOpen] = useState(false)

  return (
    <>
      <h2 className="text-[1.42rem] sm:text-[1.52rem] md:text-[1.68rem] font-serif font-bold text-gray-900 mb-2">{title}</h2>
      <p className="text-gray-600 text-sm leading-relaxed mb-4 md:mb-5">
        {description}
      </p>

      {magicAttributes.length ? (
        <div className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-widest text-amber-500 mb-2">{labels.magicAttributes}</h4>
          {magicAttributes.map((attribute) => {
            const standardDisplay = MAGIC_ATTRIBUTE_DISPLAY[normalizeMagicAttributeKey(attribute.label)]
            const display = standardDisplay ?? DEFAULT_MAGIC_ATTRIBUTE_DISPLAY
            const Icon = display.icon
            const label = standardDisplay ? translateMagicAttribute(standardDisplay.i18nKey) : attribute.label

            return (
              <div key={`${attribute.label}-${attribute.percent}`} className="flex items-center justify-between gap-4 text-sm text-gray-700">
                <span className="flex min-w-0 items-center gap-2">
                  <Icon className={`h-4 w-4 shrink-0 ${display.iconClassName}`} />
                  <span className="truncate">{label}</span>
                </span>
                <div className="h-1.5 w-24 shrink-0 rounded-full bg-gray-300/80">
                  <div
                    className={`h-full rounded-full ${display.barClassName}`}
                    style={{ width: `${attribute.percent}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      ) : null}

      <div className="mt-4 bg-white/65 backdrop-blur-md border border-white/80 rounded-[0.96rem] shadow-[0_14px_24px_-24px_rgba(0,0,0,0.2)] p-3.5 md:p-4">
        <button
          type="button"
          onClick={() => setMobileStoryInfoOpen((prev) => !prev)}
          className="mb-0 flex w-full items-center justify-between gap-3 text-left md:mb-4 md:cursor-default"
          aria-expanded={isMobileStoryInfoOpen}
        >
          <span className="flex items-center gap-2">
            <CircleHelp className="h-5 w-5 text-amber-500" />
            <span className="text-sm font-bold uppercase tracking-[0.18em] text-amber-600">
              {labels.aboutThisStory}
            </span>
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-amber-500 transition-transform duration-200 md:hidden ${
              isMobileStoryInfoOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        <div className={`${isMobileStoryInfoOpen ? 'mt-4 block' : 'hidden'} space-y-3 md:mt-0 md:block`}>
          {faqItems.map((item, index) => {
            const isOpen = expandedFaqIndex === index

            return (
              <div
                key={item.question}
                className="rounded-2xl border border-amber-100/80 bg-white/80 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setExpandedFaqIndex((prev) => (prev === index ? null : index))}
                  className="w-full flex items-start justify-between gap-3 px-4 py-4 text-left hover:bg-amber-50/60 transition-colors"
                >
                  <span className="text-sm font-semibold text-gray-800 leading-6">{item.question}</span>
                  <span className="mt-0.5 text-amber-500 shrink-0">
                    <ChevronDown
                      className={`h-4 w-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : 'rotate-0'}`}
                    />
                  </span>
                </button>
                {isOpen ? (
                  <div className="px-4 pb-4 text-sm leading-6 text-gray-600">
                    {item.answer}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

export const StoryInfoPanel = memo(StoryInfoPanelComponent)
