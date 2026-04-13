'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Globe } from 'lucide-react'
import { Button } from '@/components/Button'
import { useGlobalContext } from '@/contexts/GlobalContext'
import { UI_LOCALES } from '@/lib/i18n-config'
import type { Language } from '@/types'

type LanguageSwitcherProps = {
  className?: string
  buttonClassName?: string
  menuClassName?: string
}

type MenuPosition = {
  top: number
  left: number
  width: number
}

const SHORT_LABELS: Partial<Record<Language, string>> = {
  cn_s: '\u7B80',
  cn_t: '\u7E41',
}

const MENU_WIDTH = 176
const MENU_MARGIN = 8
const MENU_Z_INDEX = 2147483000

export function LanguageSwitcher({ className, buttonClassName, menuClassName }: LanguageSwitcherProps) {
  const { language, setLanguage } = useGlobalContext()
  const [isOpen, setIsOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const updateMenuPosition = useCallback(() => {
    if (!buttonRef.current || typeof window === 'undefined') return
    const rect = buttonRef.current.getBoundingClientRect()
    const top = rect.bottom + MENU_MARGIN
    const left = Math.min(
      Math.max(MENU_MARGIN, rect.right - MENU_WIDTH),
      window.innerWidth - MENU_WIDTH - MENU_MARGIN
    )
    setMenuPosition({ top, left, width: MENU_WIDTH })
  }, [])

  useEffect(() => {
    if (!isOpen) return
    updateMenuPosition()

    const handleReflow = () => updateMenuPosition()
    window.addEventListener('resize', handleReflow)
    window.addEventListener('scroll', handleReflow, true)

    return () => {
      window.removeEventListener('resize', handleReflow)
      window.removeEventListener('scroll', handleReflow, true)
    }
  }, [isOpen, updateMenuPosition])

  useEffect(() => {
    const handleOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (rootRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      setIsOpen(false)
    }
    document.addEventListener('mousedown', handleOutside, true)
    return () => document.removeEventListener('mousedown', handleOutside, true)
  }, [])

  const currentShortLabel = useMemo(() => {
    return SHORT_LABELS[language] ?? UI_LOCALES[language]?.code.toUpperCase() ?? 'EN'
  }, [language])

  const handleSelect = (nextLanguage: Language) => {
    setLanguage(nextLanguage)
    setIsOpen(false)
  }

  const dropdown =
    typeof document !== 'undefined' && isOpen && menuPosition
      ? createPortal(
          <div
            ref={menuRef}
            className={`fixed rounded-xl border border-white/50 bg-white/90 shadow-[0_18px_45px_rgba(0,0,0,0.18)] py-1 backdrop-blur-xl backdrop-saturate-150 z-[400] ${menuClassName ?? ''}`}
            style={{ top: menuPosition.top, left: menuPosition.left, width: menuPosition.width, zIndex: MENU_Z_INDEX, pointerEvents: 'auto' }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            {(Object.keys(UI_LOCALES) as Language[]).map((code) => (
              <button
                key={code}
                onClick={() => handleSelect(code)}
                className={`block w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${
                  language === code ? 'font-semibold text-gray-900' : 'text-gray-600'
                }`}
              >
                {UI_LOCALES[code]?.nativeLabel ?? UI_LOCALES[code]?.label ?? code}
              </button>
            ))}
          </div>,
          document.body
        )
      : null

  return (
    <div className={`relative z-[140] ${className ?? ''}`} ref={rootRef}>
      <Button
        ref={buttonRef}
        variant="ghost"
        size="sm"
        onClick={(event) => {
          event.stopPropagation()
          setIsOpen((value) => !value)
        }}
        className={`gap-1 px-2 ${buttonClassName ?? ''}`}
      >
        <Globe className="h-4 w-4" />
        <span className="text-xs font-semibold">{currentShortLabel}</span>
      </Button>
      {dropdown}
    </div>
  )
}
