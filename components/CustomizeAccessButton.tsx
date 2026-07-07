'use client'

import React from 'react'
import { useCustomizeNavigation } from '@/components/useCustomizeNavigation'

type CustomizeAccessButtonProps = {
  href: string
  className?: string
  children: React.ReactNode
}

export function CustomizeAccessButton({ href, className, children }: CustomizeAccessButtonProps) {
  const { navigateToCustomize, pendingCustomizeHref, prefetchCustomizeHref } = useCustomizeNavigation()

  return (
    <button
      type="button"
      onClick={() => void navigateToCustomize(href)}
      onPointerEnter={() => prefetchCustomizeHref(href)}
      onFocus={() => prefetchCustomizeHref(href)}
      className={className}
      aria-busy={pendingCustomizeHref === href || undefined}
    >
      {children}
    </button>
  )
}
