'use client'

import React from 'react'
import { Button } from '@/components/Button'
import { Sparkles } from 'lucide-react'
import { motion } from 'framer-motion'
import { useI18n } from '@/lib/useI18n'
import { useRouter } from 'next/navigation'

// ── Constants ─────────────────────────────────────────────────────────────────

const MARQUEE_ITEM_KEYS = [
  'hero.marquee.artisticallyIntegrated',
  'hero.marquee.mindfulGrowthStory',
  'hero.marquee.lifetimeKeepsake',
  'hero.marquee.premiumHardcoverPrint',
  'hero.marquee.shipsWorldwide',
  'hero.marquee.previewReady',
] as const

// ── Hero ──────────────────────────────────────────────────────────────────────

export const Hero: React.FC = () => {
  const { t } = useI18n()
  const router = useRouter()

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
            className="flex flex-col items-center text-center px-5 sm:px-8"
            style={{ paddingBottom: 'clamp(32px, 4.5vh, 60px)' }}
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

          </div>
        </div>
      </div>

      {/* ── Marquee — picks up right after video fades to cream ────────────── */}
      <div className="relative z-20 w-full overflow-hidden border-y border-amber-100/60 bg-[rgba(255,249,242,1)] py-2.5 sm:py-3">
        <motion.div
          className="flex gap-0 whitespace-nowrap"
          animate={{ x: ['0%', '-50%'] }}
          transition={{ duration: 28, repeat: Infinity, ease: 'linear' }}
        >
          {[...MARQUEE_ITEM_KEYS, ...MARQUEE_ITEM_KEYS].map((itemKey, i) => (
            <span key={i} className="flex items-center shrink-0">
              <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500 px-5 sm:px-6">
                {t(itemKey)}
              </span>
              <span className="text-amber-400 text-sm shrink-0">✦</span>
            </span>
          ))}
        </motion.div>
      </div>

    </div>
  )
}
