'use client'

import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom'
import { Button } from '@/components/Button'
import {
  BookOpenCheck,
  Eye,
  Globe2,
  Heart,
  Palette,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import { useI18n } from '@/lib/useI18n'
import { useRouter } from 'next/navigation'
import styles from './MobileHomeScene.module.css'

// ── Constants ─────────────────────────────────────────────────────────────────

const HERO_FACTS: ReadonlyArray<{
  icon: LucideIcon
  bubbleClass: string
  positionClass: string
  floatDelay: number
  labelKey:
    | 'hero.facts.artisticallyIntegrated'
    | 'hero.facts.mindfulGrowthStory'
    | 'hero.facts.lifetimeKeepsake'
    | 'hero.facts.premiumHardcoverPrint'
    | 'hero.facts.shipsWorldwide'
    | 'hero.facts.previewReady'
}> = [
  {
    icon: Palette,
    labelKey: 'hero.facts.artisticallyIntegrated',
    bubbleClass: 'md:rounded-[2.2rem_1.25rem_1.8rem_1.35rem] md:bg-rose-50/30',
    positionClass: 'lg:-translate-y-1 lg:-rotate-1 lg:w-[10.5rem]',
    floatDelay: 0,
  },
  {
    icon: Heart,
    labelKey: 'hero.facts.mindfulGrowthStory',
    bubbleClass: 'md:rounded-[1.3rem_2.15rem_1.35rem_1.9rem] md:bg-amber-50/30',
    positionClass: 'lg:translate-y-2 lg:rotate-[0.8deg] lg:w-[10.75rem]',
    floatDelay: 0.45,
  },
  {
    icon: Sparkles,
    labelKey: 'hero.facts.lifetimeKeepsake',
    bubbleClass: 'md:rounded-[1.8rem_1.2rem_2.2rem_1.45rem] md:bg-violet-50/25',
    positionClass: 'lg:-translate-y-2 lg:rotate-1 lg:w-[10.25rem]',
    floatDelay: 0.9,
  },
  {
    icon: BookOpenCheck,
    labelKey: 'hero.facts.premiumHardcoverPrint',
    bubbleClass: 'md:rounded-[1.2rem_2.15rem_1.65rem_1.35rem] md:bg-orange-50/30',
    positionClass: 'lg:translate-y-1 lg:-rotate-[0.7deg] lg:w-[11.25rem]',
    floatDelay: 0.25,
  },
  {
    icon: Globe2,
    labelKey: 'hero.facts.shipsWorldwide',
    bubbleClass: 'md:rounded-[2.1rem_1.35rem_1.25rem_1.8rem] md:bg-emerald-50/25',
    positionClass: 'lg:-translate-y-1 lg:rotate-[0.7deg] lg:w-[12rem]',
    floatDelay: 0.7,
  },
  {
    icon: Eye,
    labelKey: 'hero.facts.previewReady',
    bubbleClass: 'md:rounded-[1.35rem_1.9rem_2.15rem_1.2rem] md:bg-sky-50/25',
    positionClass: 'lg:translate-y-2 lg:-rotate-1 lg:w-[10.75rem]',
    floatDelay: 1.1,
  },
]

// ── Hero ──────────────────────────────────────────────────────────────────────

export const Hero: React.FC = () => {
  ReactDOM.preload('/hero-poster-v2.webp', {
    as: 'image',
    fetchPriority: 'high',
    type: 'image/webp',
  })

  const { t } = useI18n()
  const router = useRouter()
  const prefersReducedMotion = useReducedMotion()
  const [videoSrc, setVideoSrc] = useState<string | null>(null)
  const [floatFacts, setFloatFacts] = useState(false)

  useEffect(() => {
    let active = true
    const mobileQuery = window.matchMedia('(max-width: 767px)')
    const updateFactMotion = () => {
      if (active) setFloatFacts(!mobileQuery.matches && !prefersReducedMotion)
    }

    queueMicrotask(() => {
      if (!active) return
      updateFactMotion()
      setVideoSrc(prefersReducedMotion
        ? null
        : window.matchMedia('(max-width: 767px)').matches
          ? '/hero-video-mobile-v1.mp4'
          : '/hero-video-desktop-v1.mp4')
    })
    mobileQuery.addEventListener('change', updateFactMotion)

    return () => {
      active = false
      mobileQuery.removeEventListener('change', updateFactMotion)
    }
  }, [prefersReducedMotion])

  const goToBooks = () => router.push('/books')

  return (
    <div className="relative w-full overflow-x-hidden">

      {/* Mobile flows to content height; desktop keeps its full-viewport scene. */}
      <div className={`relative w-full md:min-h-[100svh] md:bg-transparent ${styles.mobileHero}`}>

        {/* The poster paints immediately while device-sized autoplay video starts. */}
        <div className="absolute inset-x-0 top-0 z-0 h-[calc(4rem+56.25vw)] overflow-hidden bg-[#fff9f2] md:inset-0 md:h-auto md:bg-[#f7e2d0]">
          <video
            autoPlay={Boolean(videoSrc)}
            muted
            loop
            playsInline
            preload={videoSrc ? 'auto' : 'none'}
            poster="/hero-poster-v2.webp"
            src={videoSrc ?? undefined}
            aria-hidden="true"
            className="absolute inset-x-0 top-16 aspect-video w-full bg-[#f4d5bd] object-cover md:inset-0 md:h-full md:bg-[#f7e2d0]"
          />
          <div aria-hidden="true" className={`pointer-events-none absolute inset-x-0 top-16 h-4 md:hidden ${styles.mobileVideoTop}`} />
        </div>

        {/* ── Gradient overlays ──────────────────────────────────────────── */}
        <div aria-hidden className="absolute inset-0 z-10 hidden pointer-events-none md:block">

          {/* TOP: dark gradient — keeps transparent navbar readable */}
          <div className="absolute inset-x-0 top-0" style={{
            height: '30%',
            background: 'linear-gradient(to bottom, rgba(15,7,2,0.60) 0%, rgba(15,7,2,0.22) 60%, transparent 100%)',
          }} />

          {/* BOTTOM: warm cream rises up — text lives here, blends into next section */}
          <div className="absolute inset-x-0 bottom-0" style={{
            height: '78%',
            background: 'linear-gradient(to top, rgba(255,249,242,1) 0%, rgba(255,249,242,0.92) 18%, rgba(255,249,242,0.72) 42%, rgba(255,249,242,0.38) 65%, rgba(255,249,242,0.10) 82%, transparent 100%)',
          }} />

          {/* Center vignette — subtle depth, leaves centre of frame clear */}
          <div className="absolute inset-0" style={{
            background: 'radial-gradient(ellipse 130% 100% at 50% 35%, transparent 42%, rgba(10,4,1,0.14) 100%)',
          }} />
        </div>

        {/* Normal mobile flow; desktop content stays in the lower third. */}
        <div className="relative z-20 flex flex-col md:min-h-[100svh]">

          {/* Reserve only the shared 64px toolbar and edge-to-edge 16:9 video. */}
          <div className="relative h-[calc(4rem+56.25vw)] shrink-0 md:hidden" aria-hidden="true">
            {/* An open storybook edge joins the film to its paper surface.
                Decorative, server-rendered geometry: no media, state or motion. */}
            <div className={`pointer-events-none absolute inset-x-0 bottom-0 ${styles.mobileVideoTransition}`}>
              <svg viewBox="0 0 390 64" preserveAspectRatio="none" focusable="false" className={styles.mobileStoryPages}>
                <path className={styles.mobilePageBack} d="M0 14C67 2 126 9 195 27C264 9 322 2 390 14V64H0Z" />
                <path className={styles.mobilePageFront} d="M0 23C65 9 133 16 195 34C257 16 325 9 390 23V64H0Z" />
                <path className={styles.mobilePageEdge} d="M0 23C65 9 133 16 195 34C257 16 325 9 390 23" />
                <path className={styles.mobilePageCrease} d="M195 35V54" />
              </svg>
              <svg viewBox="0 0 24 28" focusable="false" className={styles.mobileStorySpark}>
                <path fill="currentColor" d="M12 0C13.4 8.8 15.2 11.1 24 14C15.2 16.9 13.4 19.2 12 28C10.6 19.2 8.8 16.9 0 14C8.8 11.1 10.6 8.8 12 0Z" />
                <path fill="#fff7e9" d="M12 9L13.5 12.5L17 14L13.5 15.5L12 19L10.5 15.5L7 14L10.5 12.5Z" />
              </svg>
            </div>
          </div>

          {/* Flex spacer — desktop video center is completely unobstructed. */}
          <div className="hidden flex-1 md:block" />

          {/* ── Lower-third text zone ───────────────────────────────────── */}
          <div
            className={`flex flex-col items-center px-4 text-center sm:px-8 ${styles.mobileStoryContent}`}
            style={{ paddingBottom: 'clamp(22px, 3vh, 40px)' }}
          >
            {/* Headline — original full-width treatment, kept by owner preference.
                Structure is a single h1 with two animated spans (the two stacked h1
                elements it replaced were an accessibility defect); the rendering is
                unchanged. */}
            <h1 className="mb-4 max-md:max-w-md font-cormorant leading-[1.04] sm:mb-5">
              <motion.span
                initial={{ y: 20 }}
                animate={{ y: 0 }}
                transition={{ delay: 0.24, duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
                className="block text-[clamp(2rem,8.2vw,2.75rem)] text-gray-900 md:text-[clamp(2.4rem,5.5vw,5rem)]"
              >
                {t('hero.titleLine1')}
              </motion.span>
              <motion.span
                initial={{ y: 20 }}
                animate={{ y: 0 }}
                transition={{ delay: 0.34, duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
                className={`block text-[clamp(2rem,8.2vw,2.75rem)] bg-gradient-to-r from-amber-600 via-orange-500 to-amber-500 bg-clip-text text-transparent md:text-[clamp(2.4rem,5.5vw,5rem)] ${styles.mobileHeadlineAccent}`}
              >
                {t('hero.titleLine2')}
              </motion.span>
            </h1>

            {/* CTA */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.42, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            >
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                {/* Preserve the existing shared CTA and its Books navigation. */}
                <Button
                  onClick={goToBooks}
                  size="lg"
                  className="relative px-10 rounded-full bg-[#2a1a0d] hover:bg-[#3d2714] text-white font-bold shadow-[0_10px_36px_rgba(42,26,13,0.38)] border-0 overflow-hidden group"
                >
                  <span className="relative z-10 flex items-center justify-center gap-2.5">
                    {t('hero.cta')}
                    <Sparkles className="h-4 w-4 text-amber-300" />
                  </span>
                  <span
                    aria-hidden
                    className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/22 to-transparent skew-x-12"
                  />
                </Button>
              </motion.div>
            </motion.div>

            <motion.ul
              aria-label="YMI Story product highlights"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.52, duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
              className="mt-4 grid w-full max-w-md grid-cols-2 gap-x-4 gap-y-2 text-left max-md:!opacity-100 md:mt-6 md:flex md:max-w-6xl md:flex-wrap md:items-center md:justify-center md:gap-3 lg:flex-nowrap lg:gap-2.5"
            >
              {HERO_FACTS.map(
                ({ icon: Icon, labelKey, bubbleClass, positionClass, floatDelay }, index) => {
                  const direction = index % 2 === 0 ? 1 : -1

                  return (
                    <li
                      key={labelKey}
                      className={`z-0 min-w-0 md:w-[calc(33.333%-0.5rem)] md:hover:z-20 lg:shrink-0 ${positionClass}`}
                    >
                      <motion.div
                        animate={!floatFacts
                          ? { x: 0, y: 0, rotate: 0 }
                          : {
                              x: [0, 3.5 * direction, -2.5 * direction, 2 * direction, 0],
                              y: [0, -11, 3, 8, 0],
                              rotate: [0, 1.3 * direction, -0.85 * direction, 0.65 * direction, 0],
                            }}
                        whileHover={floatFacts ? {
                          y: -13,
                          scale: 1.045,
                          rotate: 0,
                          transition: { duration: 0.13, ease: 'easeOut' },
                        } : undefined}
                        whileTap={floatFacts ? {
                          y: -10,
                          scale: 1.035,
                          rotate: 0,
                          transition: { duration: 0.1, ease: 'easeOut' },
                        } : undefined}
                        transition={{
                          delay: floatFacts ? floatDelay : 0,
                          duration: floatFacts ? 3.8 + (index % 3) * 0.45 : 0,
                          ease: 'easeInOut',
                          repeat: floatFacts ? Infinity : 0,
                        }}
                        className={`group relative z-0 flex min-h-8 items-center gap-2 py-0.5 md:min-h-[4.6rem] md:gap-2.5 md:overflow-hidden md:border md:border-white/70 md:px-4 md:py-2.5 md:shadow-[0_12px_30px_rgba(98,58,30,0.11),inset_0_1px_0_rgba(255,255,255,0.72)] md:backdrop-blur-xl md:transition-[background-color,border-color,box-shadow] md:duration-150 md:hover:z-20 md:hover:border-white md:hover:bg-white/65 md:hover:shadow-[0_20px_44px_rgba(98,58,30,0.2),inset_0_1px_0_rgba(255,255,255,0.92)] ${bubbleClass}`}
                      >
                        <span
                          aria-hidden="true"
                          className="absolute left-[18%] top-1.5 hidden h-1.5 w-8 rounded-full bg-white/55 blur-[0.5px] md:block"
                        />
                        <span className="relative flex h-6 w-6 shrink-0 items-center justify-center text-amber-700 md:h-8 md:w-8 md:rounded-[55%_45%_52%_48%] md:border md:border-white/80 md:bg-white/38 md:shadow-[0_5px_14px_rgba(141,78,24,0.12)] md:backdrop-blur-md">
                          <Icon aria-hidden="true" className="h-4 w-4" strokeWidth={1.7} />
                        </span>
                        <span className="relative text-xs font-semibold leading-snug text-[#493322]">
                          {t(labelKey)}
                        </span>
                      </motion.div>
                    </li>
                  )
                },
              )}
            </motion.ul>

          </div>
        </div>
      </div>

    </div>
  )
}
