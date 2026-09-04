'use client'

import { memo, useMemo, useState } from 'react'
import { AudioLines, BookOpen, Check, ChevronDown, Cloud, Star } from 'lucide-react'
import styles from '@/components/personalize/customizeControls.module.css'

export type PersonalizeBookType = 'digital' | 'basic' | 'premium' | 'supreme'

type BookPackageSelectorProps = {
  value: PersonalizeBookType
  labels: {
    field: string
    digitalTitle: string
    digitalSubtitle: string
    basicTitle: string
    basicSubtitle: string
    supremeTitle: string
    supremeSubtitle: string
    whatIncluded: string
  }
  includedItems: {
    digital: string[]
    basic: string[]
    supreme: string[]
  }
  priceLabels?: Partial<Record<'digital' | 'basic' | 'supreme', string>>
  onChange: (value: PersonalizeBookType) => void
}

const PACKAGE_OPTIONS = [
  {
    value: 'digital' as PersonalizeBookType,
    titleKey: 'digitalTitle' as const,
    subtitleKey: 'digitalSubtitle' as const,
    Icon: Cloud,
  },
  {
    value: 'basic' as PersonalizeBookType,
    titleKey: 'basicTitle' as const,
    subtitleKey: 'basicSubtitle' as const,
    Icon: BookOpen,
  },
  {
    value: 'supreme' as PersonalizeBookType,
    titleKey: 'supremeTitle' as const,
    subtitleKey: 'supremeSubtitle' as const,
    Icon: AudioLines,
  },
]

function BookPackageSelectorComponent({ value, labels, includedItems, priceLabels, onChange }: BookPackageSelectorProps) {
  const [isIncludedOpen, setIncludedOpen] = useState(false)
  const items = useMemo(() => {
    if (value === 'basic' || value === 'supreme') {
      return includedItems[value]
    }
    return includedItems.digital
  }, [includedItems, value])

  return (
    <div className="space-y-3">
      <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{labels.field}</label>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {PACKAGE_OPTIONS.map((option) => {
          const isSelected = value === option.value
          const OptionIcon = option.Icon

          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={isSelected}
              data-selected={isSelected}
              onClick={() => onChange(option.value)}
              className={`${styles.packageOption} rounded-2xl p-3 text-left sm:p-3.5`}
            >
              <div className="flex items-start justify-between gap-2.5">
                <span className={`${styles.packageIcon} relative`} aria-hidden="true">
                  <OptionIcon className="h-4 w-4" strokeWidth={1.9} />
                </span>
                {priceLabels?.[option.value as 'digital' | 'basic' | 'supreme'] ? (
                  <div className="shrink-0 pt-1 text-xs font-bold text-amber-700">
                    {priceLabels[option.value as 'digital' | 'basic' | 'supreme']}
                  </div>
                ) : null}
              </div>
              <div className="mt-3 text-sm font-semibold text-slate-950">{labels[option.titleKey]}</div>
              <div className="mt-1 text-xs font-medium leading-4 text-slate-500">{labels[option.subtitleKey]}</div>
            </button>
          )
        })}
      </div>

      <div className={`${styles.includedPanel} mt-4 rounded-2xl`} data-open={isIncludedOpen}>
        <button
          type="button"
          aria-expanded={isIncludedOpen}
          onClick={() => setIncludedOpen((current) => !current)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-white/25"
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className={styles.includedIcon}>
              <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-semibold uppercase tracking-[0.08em] text-amber-700">
                {labels.whatIncluded}
              </span>
              <span className="mt-1 block truncate text-xs font-medium text-slate-600">
                {labels[value === 'basic' ? 'basicTitle' : value === 'supreme' ? 'supremeTitle' : 'digitalTitle']}
              </span>
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <span className={`${styles.itemCount} text-xs font-bold`} aria-label={`${items.length} items`}>
              {items.length}
            </span>
            <ChevronDown
              className={`h-4 w-4 text-amber-600 transition-transform duration-200 ${
                isIncludedOpen ? 'rotate-180' : ''
              }`}
            />
          </span>
        </button>

        {isIncludedOpen ? (
          <ul className={`${styles.includedList} space-y-2 px-4 pb-4 pt-3`}>
            {items.map((item) => {
              const separatorIndex = item.indexOf(': ')
              const label = separatorIndex > 0 ? item.slice(0, separatorIndex) : ''
              const description = separatorIndex > 0 ? item.slice(separatorIndex + 2) : item

              return (
                <li key={item} className="flex items-start gap-2 text-sm leading-6 text-gray-700">
                  <div className="min-w-[16px] pt-1">
                    <Check className="h-4 w-4 text-green-500" />
                  </div>
                  <span>
                    {label ? <span className="font-semibold text-slate-900">{label}: </span> : null}
                    {description}
                  </span>
                </li>
              )
            })}
          </ul>
        ) : null}
      </div>
    </div>
  )
}

export const BookPackageSelector = memo(BookPackageSelectorComponent)
