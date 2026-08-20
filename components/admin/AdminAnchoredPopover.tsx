'use client'

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useAdminPortalTheme } from '@/components/admin/AdminFloatingDialog'

type Position = {
  left: number
  top: number
  width: number
  maxHeight: number
}

export function AdminAnchoredPopover({
  anchorRef,
  onClose,
  children,
  ariaLabel,
  minWidth = 288,
  maxWidth = 420,
  zIndexClassName = 'z-[220]',
}: {
  anchorRef: RefObject<HTMLElement | null>
  onClose: () => void
  children: ReactNode
  ariaLabel: string
  minWidth?: number
  maxWidth?: number
  zIndexClassName?: string
}) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const [position, setPosition] = useState<Position | null>(null)
  useAdminPortalTheme(popoverRef)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useLayoutEffect(() => {
    const updatePosition = () => {
      const anchor = anchorRef.current
      if (!anchor) return
      const rect = anchor.getBoundingClientRect()
      const viewportPadding = 12
      const availableWidth = Math.max(240, window.innerWidth - viewportPadding * 2)
      const width = Math.min(availableWidth, Math.max(minWidth, Math.min(maxWidth, rect.width)))
      const left = Math.min(
        Math.max(viewportPadding, rect.left),
        Math.max(viewportPadding, window.innerWidth - width - viewportPadding)
      )
      const top = rect.bottom + 8
      setPosition({
        left,
        top,
        width,
        maxHeight: Math.max(160, window.innerHeight - top - viewportPadding),
      })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [anchorRef, maxWidth, minWidth])

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (popoverRef.current?.contains(target) || anchorRef.current?.contains(target)) return
      onCloseRef.current()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [anchorRef])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      ref={popoverRef}
      role="region"
      aria-label={ariaLabel}
      className={`admin-v2-anchored-popover admin-review-scrollbar fixed ${zIndexClassName} overflow-y-auto p-2`}
      style={position ? {
        left: position.left,
        top: position.top,
        width: position.width,
        maxHeight: position.maxHeight,
        visibility: 'visible',
      } : { visibility: 'hidden' }}
    >
      {children}
    </div>,
    document.body
  )
}
