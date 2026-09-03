'use client'

import React, { memo, useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { StoryLanguage } from '@/types'
import styles from '@/components/personalize/customizeControls.module.css'

type StoryLanguageSelectorProps = {
  value: StoryLanguage
  labels: {
    field: string
    english: string
    simplifiedChinese: string
    traditionalChinese: string
    comingSoon: string
  }
  onChange: (value: StoryLanguage) => void
}

type LanguageLabelKey = 'english' | 'simplifiedChinese' | 'traditionalChinese'

type LanguageOption = {
  value: string
  labelKey?: LanguageLabelKey
  label?: string
  disabled: boolean
}

const OPTIONS: readonly LanguageOption[] = [
  { value: 'English', labelKey: 'english', disabled: false },
  { value: 'Simplified Chinese', labelKey: 'simplifiedChinese', disabled: true },
  { value: 'Traditional Chinese', labelKey: 'traditionalChinese', disabled: true },
  { value: 'Spanish', label: 'Spanish', disabled: true },
  { value: 'French', label: 'French', disabled: true },
  { value: 'Deutsch', label: 'Deutsch', disabled: true },
  { value: 'Arabic', label: 'Arabic', disabled: true },
]

function StoryLanguageSelectorComponent({ value, labels, onChange }: StoryLanguageSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return
      setIsOpen(false)
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const currentLabel =
    value === 'English'
      ? labels.english
      : value === 'Simplified Chinese'
        ? labels.simplifiedChinese
      : value === 'Traditional Chinese'
        ? labels.traditionalChinese
        : String(value)

  const handleSelect = useCallback((nextValue: StoryLanguage) => {
    onChange(nextValue)
    setIsOpen(false)
  }, [onChange])

  return (
    <div className="space-y-3">
      <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{labels.field}</label>
      <div ref={rootRef} className="relative">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((prev) => !prev)}
          className={`${styles.control} flex h-12 w-full items-center justify-between rounded-2xl px-4 text-left text-[15px] font-semibold text-slate-950`}
        >
          <span>{currentLabel}</span>
        </button>
        <ChevronDown className={`pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        {isOpen && (
          <div
            role="listbox"
            aria-label={labels.field}
            className={`${styles.popover} absolute z-30 mt-2 w-full rounded-2xl p-2`}
            onMouseDown={(event) => {
              event.preventDefault()
              event.stopPropagation()
            }}
          >
            {OPTIONS.map((option) => {
              const optionLabel = option.labelKey ? labels[option.labelKey] : option.label ?? option.value
              const isSelected = value === option.value

              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={option.disabled}
                  data-selected={isSelected}
                  className={`${styles.languageOption} text-sm font-medium`}
                  onMouseDown={(event) => {
                    event.preventDefault()
                    if (option.disabled) return
                    handleSelect('English')
                  }}
                >
                  <span className="min-w-0 truncate">{optionLabel}</span>
                  {option.disabled ? (
                    <span className={`${styles.comingSoonBadge} text-[11px] font-semibold`}>
                      {labels.comingSoon}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export const StoryLanguageSelector = memo(StoryLanguageSelectorComponent)
