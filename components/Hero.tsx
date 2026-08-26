'use client'

import React from 'react'
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
    bubbleClass: 'rounded-[2.2rem_1.25rem_1.8rem_1.35rem] bg-rose-50/30',
    positionClass: 'lg:-translate-y-1 lg:-rotate-1 lg:w-[10.5rem]',
    floatDelay: 0,
  },
  {
    icon: Heart,
    labelKey: 'hero.facts.mindfulGrowthStory',
    bubbleClass: 'rounded-[1.3rem_2.15rem_1.35rem_1.9rem] bg-amber-50/30',
    positionClass: 'lg:translate-y-2 lg:rotate-[0.8deg] lg:w-[10.75rem]',
    floatDelay: 0.45,
  },
  {
    icon: Sparkles,
    labelKey: 'hero.facts.lifetimeKeepsake',
    bubbleClass: 'rounded-[1.8rem_1.2rem_2.2rem_1.45rem] bg-violet-50/25',
    positionClass: 'lg:-translate-y-2 lg:rotate-1 lg:w-[10.25rem]',
    floatDelay: 0.9,
  },
  {
    icon: BookOpenCheck,
    labelKey: 'hero.facts.premiumHardcoverPrint',
    bubbleClass: 'rounded-[1.2rem_2.15rem_1.65rem_1.35rem] bg-orange-50/30',
    positionClass: 'lg:translate-y-1 lg:-rotate-[0.7deg] lg:w-[11.25rem]',
    floatDelay: 0.25,
  },
  {
    icon: Globe2,
    labelKey: 'hero.facts.shipsWorldwide',
    bubbleClass: 'rounded-[2.1rem_1.35rem_1.25rem_1.8rem] bg-emerald-50/25',
    positionClass: 'lg:-translate-y-1 lg:rotate-[0.7deg] lg:w-[12rem]',
    floatDelay: 0.7,
  },
  {
    icon: Eye,
    labelKey: 'hero.facts.previewReady',
    bubbleClass: 'rounded-[1.35rem_1.9rem_2.15rem_1.2rem] bg-sky-50/25',
    positionClass: 'lg:translate-y-2 lg:-rotate-1 lg:w-[10.75rem]',
    floatDelay: 1.1,
  },
]

// ── Hero ──────────────────────────────────────────────────────────────────────

export const Hero: React.FC = () => {
  const { t } = useI18n()
  const router = useRouter()
  const prefersReducedMotion = useReducedMotion()

  const goToBooks = () => router.push('/books')

  return (
    <div className="relative w-full overflow-x-hidden">

      {/* ── Full-viewport section ─────────────────────────────────────────── */}
      <div className="relative w-full" style={{ minHeight: '100svh' }}>

        {/* Instant-play video background: no poster gate, no hydration-delayed mount. */}
        <div className="absolute inset-0 z-0 overflow-hidden bg-[#f4d5bd] md:bg-[#f7e2d0]">
          <video
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            className="absolute left-1/2 top-24 aspect-video w-[calc(100%-2rem)] max-w-[560px] -translate-x-1/2 overflow-hidden rounded-[1.35rem] border border-white/65 bg-[#f4d5bd] object-contain shadow-[0_22px_70px_rgba(120,53,15,0.22)] md:inset-0 md:left-0 md:top-0 md:h-full md:w-full md:max-w-none md:translate-x-0 md:rounded-none md:border-0 md:bg-[#f7e2d0] md:object-cover md:shadow-none"
          >
            <source src="/hero-video.mp4" type="video/mp4" />
          </video>
        </div>

        {/* ── Gradient overlays ──────────────────────────────────────────── */}
        <div aria-hidden className="absolute inset-0 z-10 pointer-events-none">

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

        {/* ── Content — all pushed to the bottom third ─────────────────────── */}
        <div className="relative z-20 flex flex-col min-h-[100svh]">

          {/* Mobile reserves the same space as the absolute 16:9 video frame. */}
          <div className="min-h-[330px] md:hidden" aria-hidden="true" />

          {/* Flex spacer — desktop video center is completely unobstructed. */}
          <div className="flex-1" />

          {/* ── Lower-third text zone ───────────────────────────────────── */}
          <div
            className="flex flex-col items-center px-4 text-center sm:px-8"
            style={{ paddingBottom: 'clamp(22px, 3vh, 40px)' }}
          >
            {/* Headline — original full-width treatment, kept by owner preference.
                Structure is a single h1 with two animated spans (the two stacked h1
                elements it replaced were an accessibility defect); the rendering is
                unchanged. */}
            <h1 className="mb-4 font-cormorant leading-[1.04] sm:mb-5">
              <motion.span
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.24, duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
                className="block text-gray-900"
                style={{ fontSize: 'clamp(2.4rem, 5.5vw, 5rem)' }}
              >
                {t('hero.titleLine1')}
              </motion.span>
              <motion.span
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.34, duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
                className="block bg-gradient-to-r from-amber-600 via-orange-500 to-amber-500 bg-clip-text text-transparent"
                style={{ fontSize: 'clamp(2.4rem, 5.5vw, 5rem)' }}
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
                {/* Deep ink, not amber. Every frame of the loop is warm gold, so an
                    amber-on-gold button had the lowest contrast of anything on the page
                    despite being the one thing we want clicked. */}
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
              className="mt-5 flex w-full max-w-6xl flex-wrap items-center justify-center gap-2.5 text-left sm:mt-6 sm:gap-3 lg:flex-nowrap lg:gap-2.5"
            >
              {HERO_FACTS.map(
                ({ icon: Icon, labelKey, bubbleClass, positionClass, floatDelay }, index) => {
                  const direction = index % 2 === 0 ? 1 : -1

                  return (
                    <li
                      key={labelKey}
                      className={`z-0 w-[calc(50%-0.32rem)] hover:z-20 sm:w-[calc(33.333%-0.5rem)] lg:shrink-0 ${positionClass}`}
                    >
                      <motion.div
                        animate={prefersReducedMotion
                          ? { x: 0, y: 0, rotate: 0 }
                          : {
                              x: [0, 3.5 * direction, -2.5 * direction, 2 * direction, 0],
                              y: [0, -11, 3, 8, 0],
                              rotate: [0, 1.3 * direction, -0.85 * direction, 0.65 * direction, 0],
                            }}
                        whileHover={{
                          y: prefersReducedMotion ? 0 : -13,
                          scale: 1.045,
                          rotate: 0,
                          transition: { duration: 0.13, ease: 'easeOut' },
                        }}
                        whileTap={{
                          y: prefersReducedMotion ? 0 : -10,
                          scale: 1.035,
                          rotate: 0,
                          transition: { duration: 0.1, ease: 'easeOut' },
                        }}
                        transition={{
                          delay: floatDelay,
                          duration: 3.8 + (index % 3) * 0.45,
                          ease: 'easeInOut',
                          repeat: prefersReducedMotion ? 0 : Infinity,
                        }}
                        className={`group relative z-0 flex min-h-[4.2rem] items-center gap-2.5 overflow-hidden border border-white/70 px-3 py-2.5 shadow-[0_12px_30px_rgba(98,58,30,0.11),inset_0_1px_0_rgba(255,255,255,0.72)] backdrop-blur-xl transition-[background-color,border-color,box-shadow] duration-150 hover:z-20 hover:border-white hover:bg-white/65 hover:shadow-[0_20px_44px_rgba(98,58,30,0.2),inset_0_1px_0_rgba(255,255,255,0.92)] sm:min-h-[4.6rem] sm:px-4 ${bubbleClass}`}
                      >
                        <span
                          aria-hidden="true"
                          className="absolute left-[18%] top-1.5 h-1.5 w-8 rounded-full bg-white/55 blur-[0.5px]"
                        />
                        <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-[55%_45%_52%_48%] border border-white/80 bg-white/38 text-amber-700 shadow-[0_5px_14px_rgba(141,78,24,0.12)] backdrop-blur-md">
                          <Icon aria-hidden="true" className="h-4 w-4" strokeWidth={1.7} />
                        </span>
                        <span className="relative text-[11px] font-semibold leading-snug text-[#493322] sm:text-xs">
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
