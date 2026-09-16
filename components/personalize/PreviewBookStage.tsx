'use client'

import { memo, type CSSProperties, type ReactNode, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

type PreviewBookStageProps = {
  stageHeight?: number
  previewScale?: number
  pageWidth: number
  pageHeight: number
  animationDuration: number
  currentSpread: number
  isFlipping: boolean
  flipDirection: 'next' | 'prev' | null
  isLeftPageVisible: boolean
  staticLeftIndex: number
  centerBindingPattern: CSSProperties
  pageStackPattern: CSSProperties
  faceStyle: CSSProperties
  previewBookShadow: string
  renderPageContent: (side: 'left' | 'right', spreadIndex: number) => ReactNode
}

function PreviewBookStageComponent({
  stageHeight: fixedStageHeight,
  previewScale: fixedPreviewScale,
  pageWidth,
  pageHeight,
  animationDuration,
  currentSpread,
  isFlipping,
  flipDirection,
  isLeftPageVisible,
  staticLeftIndex,
  centerBindingPattern,
  pageStackPattern,
  faceStyle,
  previewBookShadow,
  renderPageContent,
}: PreviewBookStageProps) {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const [measuredPreviewScale, setMeasuredPreviewScale] = useState(1)
  const staticRightIndex =
    isFlipping && flipDirection === 'prev'
      ? currentSpread
      : isFlipping && flipDirection === 'next'
        ? currentSpread + 1
        : currentSpread
  const previewScale = fixedPreviewScale ?? measuredPreviewScale
  const stageHeight = fixedStageHeight
    ?? Math.round((pageHeight + 40) * previewScale) + (previewScale < 1 ? 12 : 0)

  useLayoutEffect(() => {
    if (fixedPreviewScale !== undefined) return
    const stage = stageRef.current
    if (!stage) return

    let lastWidth = 0
    const recomputeScale = () => {
      const availableWidth = stage.getBoundingClientRect().width
      if (!availableWidth || Math.abs(availableWidth - lastWidth) < 0.5) return
      lastWidth = availableWidth
      setMeasuredPreviewScale(Math.min(1, Math.max(0.32, (availableWidth - 8) / (pageWidth * 2))))
    }

    recomputeScale()
    const observer = new ResizeObserver(recomputeScale)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [fixedPreviewScale, pageWidth])

  return (
    <div
      ref={stageRef}
      data-preview-book-stage="true"
      className="relative mb-7 flex w-full select-none justify-center overflow-hidden perspective-2000 md:mb-10"
      style={{ height: stageHeight }}
    >
      <div
        className="shrink-0"
        style={{ transform: `scale(${previewScale})`, transformOrigin: 'top center', width: pageWidth * 2, filter: previewBookShadow }}
      >
        <motion.div
          data-preview-book-model="true"
          className="relative flex w-full justify-center"
          initial={false}
          animate={{ x: (currentSpread === 0 && !isFlipping) ? -pageWidth / 2 : 0 }}
          transition={{ duration: animationDuration, ease: 'easeInOut' }}
          style={{ transformStyle: 'preserve-3d', perspective: '2500px', height: pageHeight }}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute bottom-[-14px] left-1/2 z-[-4] h-16 w-[540px] -translate-x-1/2 rounded-full opacity-60 blur-3xl"
            style={{
              background:
                'radial-gradient(circle at center, rgba(15,23,42,0.22) 0%, rgba(15,23,42,0.12) 30%, rgba(15,23,42,0.05) 50%, rgba(15,23,42,0) 72%)',
            }}
          />

          <div
            className="absolute bottom-0 top-0 left-[calc(50%-25px)] z-[-1] w-[50px]"
            style={centerBindingPattern}
          />

          <div
            className="absolute bottom-0 top-0 left-[calc(50%-380px)] z-[-1] w-[12px]"
            style={{
              background: '#f1f1f1',
              boxShadow: 'inset -2px 0 5px rgba(0,0,0,0.1)',
              transform: 'translateZ(-5px) translateX(-6px)',
              borderRadius: '4px 0 0 4px',
              opacity: isLeftPageVisible ? 1 : 0,
            }}
          />

          <div
            className="absolute bottom-2 top-2 z-[-1] w-[12px]"
            style={{
              ...pageStackPattern,
              left: 'calc(50% + 375px)',
              transform: 'translateZ(-2px)',
              borderRadius: '0 2px 2px 0',
            }}
          />

          <div
            className="absolute bottom-0 top-0 z-[-2] w-[4px]"
            style={{
              background: '#9ca3af',
              boxShadow: 'inset 1px 0 2px rgba(255,255,255,0.3), 1px 0 2px rgba(0,0,0,0.2)',
              left: 'calc(50% + 382px)',
              transform: 'translateZ(-4px)',
              borderRadius: '0 4px 4px 0',
            }}
          />

          <div className="absolute top-0 flex h-full w-full justify-center">
            <div className={`relative h-full ${isLeftPageVisible ? 'opacity-100' : 'opacity-0'}`} style={{ width: pageWidth }}>
              {renderPageContent('left', staticLeftIndex)}
            </div>
            <div className="relative h-full" style={{ width: pageWidth }}>
              {renderPageContent('right', staticRightIndex)}
            </div>
          </div>

          <AnimatePresence>
            {isFlipping && flipDirection === 'next' && (
              <motion.div
                initial={{ rotateY: 0 }}
                animate={{ rotateY: -180 }}
                transition={{ duration: animationDuration, ease: 'easeInOut' }}
                style={{ width: pageWidth, height: '100%', position: 'absolute', top: 0, left: '50%', transformOrigin: 'left center', transformStyle: 'preserve-3d', zIndex: 50 }}
              >
                <div className="backface-hidden" style={faceStyle}>
                  {renderPageContent('right', currentSpread)}
                  <motion.div
                    className="pointer-events-none absolute inset-0 z-50"
                    initial={{ opacity: 0, background: 'linear-gradient(to right, rgba(0,0,0,0) 0%, rgba(0,0,0,0.3) 100%)' }}
                    animate={{ opacity: [0, 0.6, 0] }}
                    transition={{ duration: animationDuration, times: [0, 0.5, 1] }}
                  />
                </div>

                <div className="backface-hidden" style={{ ...faceStyle, transform: 'rotateY(180deg)' }}>
                  {renderPageContent('left', currentSpread + 1)}
                  <motion.div
                    className="pointer-events-none absolute inset-0 z-50"
                    initial={{ opacity: 0, background: 'linear-gradient(to left, rgba(0,0,0,0) 0%, rgba(0,0,0,0.3) 100%)' }}
                    animate={{ opacity: [0, 0.6, 0] }}
                    transition={{ duration: animationDuration, times: [0, 0.5, 1] }}
                  />
                </div>
              </motion.div>
            )}

            {isFlipping && flipDirection === 'prev' && (
              <motion.div
                initial={{ rotateY: -180 }}
                animate={{ rotateY: 0 }}
                transition={{ duration: animationDuration, ease: 'easeInOut' }}
                style={{ width: pageWidth, height: '100%', position: 'absolute', top: 0, left: '50%', transformOrigin: 'left center', transformStyle: 'preserve-3d', zIndex: 50 }}
              >
                <div className="backface-hidden" style={{ ...faceStyle, transform: 'rotateY(180deg)' }}>
                  {renderPageContent('left', currentSpread)}
                  <motion.div
                    className="pointer-events-none absolute inset-0 z-50"
                    initial={{ opacity: 0, background: 'linear-gradient(to left, rgba(0,0,0,0) 0%, rgba(0,0,0,0.3) 100%)' }}
                    animate={{ opacity: [0, 0.6, 0] }}
                    transition={{ duration: animationDuration }}
                  />
                </div>

                <div className="backface-hidden" style={faceStyle}>
                  {renderPageContent('right', currentSpread - 1)}
                  <motion.div
                    className="pointer-events-none absolute inset-0 z-50"
                    initial={{ opacity: 0, background: 'linear-gradient(to right, rgba(0,0,0,0) 0%, rgba(0,0,0,0.3) 100%)' }}
                    animate={{ opacity: [0, 0.6, 0] }}
                    transition={{ duration: animationDuration }}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  )
}

export const PreviewBookStage = memo(PreviewBookStageComponent)
