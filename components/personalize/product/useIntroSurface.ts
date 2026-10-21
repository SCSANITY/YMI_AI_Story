'use client'

import { useLayoutEffect, type RefObject } from 'react'

// A formerly one-screen page may gain a Windows scrollbar from the new content.
// Retain its old width when it would have fitted without that scrollbar.
export function useIntroSurface(ref: RefObject<HTMLDivElement | null>, enabled: boolean) {
  useLayoutEffect(() => {
    const element = ref.current
    if (!enabled || !element) return
    const update = () => {
      const gutter = window.innerWidth - document.documentElement.clientWidth
      const fitted = element.getBoundingClientRect().height <= window.innerHeight + 0.5
      const width = fitted && gutter > 0 ? `${window.innerWidth}px` : ''
      if (element.style.width !== width) element.style.width = width
    }
    const observer = new ResizeObserver(update)
    observer.observe(element)
    window.addEventListener('resize', update)
    update()
    return () => { observer.disconnect(); window.removeEventListener('resize', update); element.style.width = '' }
  }, [ref, enabled])
}
