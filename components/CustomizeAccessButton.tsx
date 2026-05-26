'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { canEnterCustomize } from '@/lib/customize-access-client'

type CustomizeAccessButtonProps = {
  href: string
  className?: string
  children: React.ReactNode
}

export function CustomizeAccessButton({ href, className, children }: CustomizeAccessButtonProps) {
  const router = useRouter()

  return (
    <button
      type="button"
      onClick={async () => {
        const allowed = await canEnterCustomize()
        if (!allowed) return
        router.push(href)
      }}
      className={className}
    >
      {children}
    </button>
  )
}
