'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/Button'
import { Sparkles, Star, Clock, Globe, BookOpen } from 'lucide-react'
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

const FEATURE_CHIPS = [
  { icon: BookOpen, labelKey: 'hero.feature.premiumPrint',       mobileHide: false },
  { icon: Clock,    labelKey: 'hero.feature.previewInOneMinute', mobileHide: false },
  { icon: Globe,    labelKey: 'hero.feature.shipsWorldwide',     mobileHide: true  },
  { icon: Sparkles, labelKey: 'hero.feature.artisticallyIntegrated', mobileHide: false },
  { icon: Star,     labelKey: 'hero.feature.mindfulGrowthStory',     mobileHide: false },
  { icon: BookOpen, labelKey: 'hero.feature.lifetimeKeepsake',        mobileHide: true  },
] as const

const AVATAR_GRADIENTS = [
  'from-amber-200 to-amber-300',
  'from-orange-200 to-orange-300',
  'from-yellow-100 to-amber-200',
  'from-amber-100 to-orange-200',
] as const

const TESTIMONIALS = [
  { text: '"My daughter cried the happiest tears 🥺"', author: 'Sophie · UK' },
  { text: '"Best gift our family has ever given"',     author: 'Lucas · US' },
  { text: '"She asks to read it every single night"',  author: 'Mei · Singapore' },
  { text: '"Worth every single penny — magical"',      author: 'Priya · Australia' },
] as const

// ── Hero ──────────────────────────────────────────────────────────────────────

export const Hero: React.FC = () => {
  const { t } = useI18n()
  const router = useRouter()

  const [quoteIdx, setQuoteIdx] = useState(0)
  const [quoteVisible, setQuoteVisible] = useState(true)

  useEffect(() => {
    const id = setInterval(() => {
      setQuoteVisible(false)
      setTimeout(() => {
        setQuoteIdx(i => (i + 1) % TESTIMONIALS.length)
        setQuoteVisible(true)
      }, 280)
    }, 3800)
    return () => clearInterval(id)
  }, [])

  const goToBooks = () => router.push('/books')

  return (
    <div className="relative w-full overflow-x-hidden">

      {/* ── Full-viewport section ─────────────────────────────────────────── */}
      <div className="relative w-full" style={{ minHeight: '100svh' }}>

        {/* Video / fallback background — absolute, fills everything */}
        <div className="absolute inset-0 z-0 overflow-hidden">
          <video
            autoPlay
            muted
            loop
            playsInline
            className="absolute inset-0 w-full h-full object-cover"
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

          {/* Flex spacer — video center is completely unobstructed */}
          <div className="flex-1" />

          {/* ── Lower-third text zone ───────────────────────────────────── */}
          <div
            className="flex flex-col items-center text-center px-5 sm:px-8"
            style={{ paddingBottom: 'clamp(48px, 7vh, 88px)' }}
          >
            {/* Headline */}
            <div className="mb-4 sm:mb-5">
              <motion.h1
                initial={{ opacity: 0, y: 22 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.32, duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
                className="font-cormorant text-gray-900 leading-[1.07] block"
                style={{ fontStyle: 'normal', fontSize: 'clamp(2.4rem, 5.2vw, 4.8rem)' }}
              >
                {t('hero.titleLine1')}
              </motion.h1>
              <motion.h1
                initial={{ opacity: 0, y: 22 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.44, duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
                className="font-cormorant leading-[1.07] bg-gradient-to-r from-amber-600 via-orange-500 to-amber-500 bg-clip-text text-transparent block"
                style={{ fontSize: 'clamp(2.4rem, 5.2vw, 4.8rem)' }}
              >
                {t('hero.titleLine2')}
              </motion.h1>
            </div>

            {/* Eyebrow badge */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="mb-5 inline-flex items-center gap-2 rounded-full border border-amber-300/45 bg-amber-50/80 px-4 py-1.5 shadow-sm backdrop-blur-sm sm:mb-6"
            >
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-500" />
              <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-700">
                {t('hero.badge')}
              </span>
            </motion.div>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.54 }}
              className="mb-5 flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row"
            >
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }} className="w-full sm:w-auto">
                <Button
                  onClick={goToBooks}
                  size="lg"
                  className="relative w-full sm:w-auto px-10 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white font-bold shadow-[0_8px_40px_rgba(251,146,60,0.48)] border-0 overflow-hidden group"
                >
                  <span className="relative z-10 flex items-center justify-center gap-2.5">
                    {t('hero.cta')}
                    <Sparkles className="h-4 w-4" />
                  </span>
                  <span
                    aria-hidden
                    className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/25 to-transparent skew-x-12"
                  />
                </Button>
              </motion.div>
            </motion.div>

            {/* Feature chips */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.62 }}
              className="flex justify-center gap-2 flex-wrap mb-4"
            >
              {FEATURE_CHIPS.map(({ icon: Icon, labelKey, mobileHide }) => (
                <div
                  key={labelKey}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/60 border border-white/55 shadow-sm text-gray-600 text-xs font-medium whitespace-nowrap backdrop-blur-sm ${mobileHide ? 'hidden sm:flex' : 'flex'}`}
                >
                  <Icon className="h-3 w-3 text-amber-500 shrink-0" />
                  {t(labelKey)}
                </div>
              ))}
            </motion.div>

            {/* Social proof — cycling micro-testimonial */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.72 }}
              className="flex items-center justify-center gap-3"
            >
              <div className="flex -space-x-2.5 shrink-0">
                {AVATAR_GRADIENTS.map((g, i) => (
                  <div key={i} className={`w-7 h-7 rounded-full border-2 border-white/90 bg-gradient-to-br ${g}`} />
                ))}
              </div>
              <div
                className="text-left"
                style={{
                  opacity: quoteVisible ? 1 : 0,
                  transform: quoteVisible ? 'translateY(0px)' : 'translateY(5px)',
                  transition: 'opacity 280ms ease, transform 280ms ease',
                }}
              >
                <p className="text-xs font-semibold text-gray-800 leading-snug italic">
                  {TESTIMONIALS[quoteIdx].text}
                </p>
                <p className="text-[10px] text-amber-600 mt-0.5 leading-none font-medium tracking-wide">
                  {'★★★★★'}&ensp;
                  <span className="text-gray-400 font-normal not-italic">{TESTIMONIALS[quoteIdx].author}</span>
                </p>
              </div>
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
