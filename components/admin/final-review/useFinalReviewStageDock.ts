'use client'

import { useEffect, useRef, useState } from 'react'

const STAGE_TOP_OFFSET = 24

export function useFinalReviewStageDock() {
  const stageSlotRef = useRef<HTMLDivElement | null>(null)
  const stageBarRef = useRef<HTMLDivElement | null>(null)
  const [isStageDocked, setIsStageDocked] = useState(false)
  const [stageDockMetrics, setStageDockMetrics] = useState({
    height: 0,
    left: 0,
    top: STAGE_TOP_OFFSET,
    width: 0,
  })

  useEffect(() => {
    let frameId: number | null = null
    const scheduleMeasure = () => {
      if (frameId !== null) return
      frameId = window.requestAnimationFrame(() => {
        frameId = null
        const slot = stageSlotRef.current
        const bar = stageBarRef.current
        if (!slot || !bar) return

        if (window.innerWidth < 1280) {
          setIsStageDocked(false)
          return
        }

        const slotRect = slot.getBoundingClientRect()
        const barRect = bar.getBoundingClientRect()
        const height = Math.ceil(barRect.height || stageDockMetrics.height)
        const nextMetrics = {
          height,
          left: Math.round(slotRect.left),
          top: STAGE_TOP_OFFSET,
          width: Math.round(slotRect.width),
        }
        const shouldDock = slotRect.top <= STAGE_TOP_OFFSET

        setStageDockMetrics((current) =>
          current.height === nextMetrics.height &&
          current.left === nextMetrics.left &&
          current.top === nextMetrics.top &&
          current.width === nextMetrics.width
            ? current
            : nextMetrics
        )
        setIsStageDocked((current) => (current === shouldDock ? current : shouldDock))
      })
    }

    scheduleMeasure()
    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleMeasure)
    if (resizeObserver) {
      if (stageSlotRef.current) resizeObserver.observe(stageSlotRef.current)
      if (stageBarRef.current) resizeObserver.observe(stageBarRef.current)
    }
    window.addEventListener('scroll', scheduleMeasure, { passive: true })
    window.addEventListener('resize', scheduleMeasure)
    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId)
      resizeObserver?.disconnect()
      window.removeEventListener('scroll', scheduleMeasure)
      window.removeEventListener('resize', scheduleMeasure)
    }
  }, [stageDockMetrics.height])

  return {
    stageSlotRef,
    stageBarRef,
    isStageDocked,
    stageDockMetrics,
  }
}
