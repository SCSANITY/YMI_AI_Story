'use client'

import React from 'react'
import { Button } from '@/components/Button'
import { Sparkles, Star, ArrowDown, Clock, Globe, BookOpen } from 'lucide-react'
import { motion } from 'framer-motion'
import { useI18n } from '@/lib/useI18n'
import { BOOKS } from '@/data/books'
import { useRouter } from 'next/navigation'

// ── Gallery config (desktop) ──────────────────────────────────────────────────

const SHOWCASE = [
  { book: BOOKS[0], w: 148, left:   0, top:  55, rotate: -7, z: 2, floatAmp: 12, floatDur: 5.2, floatDelay: 0.0 },
  { book: BOOKS[1], w: 192, left: 128, top:   0, rotate:  3, z: 5, floatAmp: 18, floatDur: 6.0, floatDelay: 0.4 },
  { book: BOOKS[2], w: 138, left: 322, top:  68, rotate: -5, z: 3, floatAmp: 10, floatDur: 4.8, floatDelay: 0.8 },
  { book: BOOKS[3], w: 120, left:  42, top: 275, rotate:  8, z: 4, floatAmp: 14, floatDur: 5.5, floatDelay: 0.2 },
  { book: BOOKS[4], w: 126, left: 244, top: 288, rotate: -6, z: 3, floatAmp: 11, floatDur: 4.5, floatDelay: 1.0 },
] as const

const SPARKLES = [
  { top: '7%',  left: '14%', cls: 'h-4 w-4 text-amber-300  fill-amber-300',  dur: 3.2, delay: 0.0 },
  { top: '22%', left: '74%', cls: 'h-3 w-3 text-orange-300 fill-orange-300', dur: 4.0, delay: 0.6 },
  { top: '52%', left: '90%', cls: 'h-5 w-5 text-amber-400  fill-amber-400',  dur: 3.7, delay: 1.2 },
  { top: '80%', left: '8%',  cls: 'h-3 w-3 text-amber-200  fill-amber-200',  dur: 5.0, delay: 0.3 },
  { top: '70%', left: '54%', cls: 'h-4 w-4 text-orange-200 fill-orange-200', dur: 3.5, delay: 0.9 },
  { top: '13%', left: '44%', cls: 'h-3 w-3 text-amber-300  fill-amber-300',  dur: 4.2, delay: 1.5 },
] as const

const MARQUEE_ITEM_KEYS = [
  'hero.marquee.aiFacePersonalisation',
  'hero.marquee.premiumHardcoverPrint',
  'hero.marquee.shipsWorldwide',
  'hero.marquee.previewReady',
  'hero.marquee.ratedFamilies',
  'hero.marquee.perfectGift',
] as const

const FEATURE_CHIPS = [
  { icon: Sparkles, labelKey: 'hero.feature.aiPersonalised',  mobileHide: false },
  { icon: BookOpen, labelKey: 'hero.feature.premiumPrint',    mobileHide: false },
  { icon: Clock,    labelKey: 'hero.feature.previewInOneMinute', mobileHide: false },
  { icon: Globe,    labelKey: 'hero.feature.shipsWorldwide',  mobileHide: true  },
] as const

// ── Component ─────────────────────────────────────────────────────────────────

const MobileHeroBookGallery: React.FC = () => (
  <motion.div
    initial={{ opacity: 0, y: 16 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: 0.64, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
    className="block lg:hidden relative h-[190px] sm:h-[220px] w-full -mt-1"
  >
    <div
      className="absolute rounded-full bg-amber-200/35 blur-[40px] pointer-events-none"
      style={{ left: 'calc(50% - 60px)', top: '10%', width: 120, height: 120 }}
    />

    <motion.div
      className="absolute"
      style={{ left: 'calc(50% - 128px)', bottom: 0, zIndex: 2, rotate: -8 }}
      animate={{ y: [0, -10, 0] }}
      transition={{ duration: 5.0, repeat: Infinity, ease: 'easeInOut', delay: 0 }}
    >
      <div
        className="w-24 sm:w-28 rounded-xl overflow-hidden border-[4px] border-white"
        style={{ boxShadow: '0 12px 36px rgba(0,0,0,0.14)', aspectRatio: '3/4' }}
      >
        <img
          src={BOOKS[0].coverUrl}
          alt={BOOKS[0].title}
          className="w-full h-full object-cover block"
          loading="lazy"
          decoding="async"
        />
      </div>
    </motion.div>

    <motion.div
      className="absolute"
      style={{ left: 'calc(50% - 52px)', bottom: 14, zIndex: 4 }}
      animate={{ y: [0, -16, 0] }}
      transition={{ duration: 5.8, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
    >
      <div
        className="w-28 sm:w-32 rounded-xl overflow-hidden border-[5px] border-white"
        style={{
          boxShadow: '0 20px 60px rgba(0,0,0,0.22), 0 6px 18px rgba(251,146,60,0.20)',
          aspectRatio: '3/4',
        }}
      >
        <img
          src={BOOKS[1].coverUrl}
          alt={BOOKS[1].title}
          className="w-full h-full object-cover block"
          loading="lazy"
          decoding="async"
        />
      </div>
    </motion.div>

    <motion.div
      className="absolute"
      style={{ left: 'calc(50% + 24px)', bottom: 0, zIndex: 3, rotate: 8 }}
      animate={{ y: [0, -9, 0] }}
      transition={{ duration: 4.6, repeat: Infinity, ease: 'easeInOut', delay: 1.0 }}
    >
      <div
        className="w-24 sm:w-28 rounded-xl overflow-hidden border-[4px] border-white"
        style={{ boxShadow: '0 12px 36px rgba(0,0,0,0.14)', aspectRatio: '3/4' }}
      >
        <img
          src={BOOKS[2].coverUrl}
          alt={BOOKS[2].title}
          className="w-full h-full object-cover block"
          loading="lazy"
          decoding="async"
        />
      </div>
    </motion.div>
  </motion.div>
)

export const Hero: React.FC = () => {
  const { t } = useI18n()
  const router = useRouter()

  const goToBooks = () => {
    router.push('/books')
  }

  return (
    <div className="relative w-full min-h-[95vh] flex flex-col overflow-hidden">

      {/* ── Background ─────────────────────────────────────────────────────── */}
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none select-none">
        <div className="absolute inset-0 bg-gradient-to-br from-[#fff9f2] via-white to-white" />

        <motion.div
          className="absolute right-[-180px] top-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-amber-200/22 blur-[120px]"
          animate={{ x: [0, 40, 0], y: [0, -30, 0], scale: [1, 1.08, 1] }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute -left-28 -top-28 w-[520px] h-[520px] rounded-full bg-orange-100/32 blur-[90px]"
          animate={{ scale: [1, 1.12, 1], opacity: [0.32, 0.55, 0.32] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[220px] rounded-full bg-amber-50/80 blur-[60px]" />

        {/* Ghost "YMI" — editorial depth */}
        <div className="absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none">
          <span
            className="font-cormorant select-none whitespace-nowrap text-amber-600/[0.045] leading-none"
            style={{ fontSize: 'clamp(140px, 20vw, 300px)', letterSpacing: '0.06em', userSelect: 'none' }}
          >
            YMI
          </span>
        </div>
      </div>

      {/* ── Main grid ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center relative z-10">
        <div className="container mx-auto px-5 sm:px-6 lg:px-12 py-14 sm:py-16 lg:py-0 w-full">
          <div className="grid lg:grid-cols-[1fr_500px] xl:grid-cols-[1fr_530px] gap-10 lg:gap-6 items-center min-h-[80vh]">

            {/* ── LEFT — prose ───────────────────────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0, y: 32 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col gap-5 lg:gap-6 max-w-[580px] mx-auto lg:mx-0"
            >

              {/* Badge */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="self-start flex items-center gap-2 px-4 py-1.5 rounded-full border border-amber-200/70 bg-amber-50/90 shadow-sm"
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-600">
                  {t('hero.badge')}
                </span>
              </motion.div>

              {/* Headline ──────────────────────────────────────────────────── */}
              {/*
                Line 1: upright (non-italic) Cormorant Garamond — reads heavy and bold
                Line 2: italic Cormorant Garamond + amber gradient — reads graceful, expressive
                The contrast between the two lines creates visual hierarchy + personality.
              */}
              <div className="space-y-0">
                <motion.h1
                  initial={{ opacity: 0, y: 28 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                  className="font-cormorant text-gray-900 leading-[1.08]"
                  style={{ fontStyle: 'normal', fontSize: 'clamp(2.4rem, 4.4vw, 4rem)' }}
                >
                  {t('hero.titleLine1')}
                </motion.h1>
                <motion.h1
                  initial={{ opacity: 0, y: 28 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.38, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                  className="font-cormorant leading-[1.08] bg-gradient-to-r from-amber-600 via-orange-500 to-amber-500 bg-clip-text text-transparent"
                  style={{ fontSize: 'clamp(2.4rem, 4.4vw, 4rem)' }}
                >
                  {t('hero.titleLine2')}
                </motion.h1>
              </div>

              {/* Description */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="space-y-1.5"
              >
                <p className="text-sm sm:text-base md:text-[1.05rem] text-gray-500 leading-[1.75] max-w-[470px]">
                  {t('hero.description')}
                </p>
                <p className="text-xs sm:text-sm font-medium text-gray-600/75">
                  {t('hero.note')}
                </p>
              </motion.div>

              {/* Feature chips */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.58 }}
                className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {FEATURE_CHIPS.map(({ icon: Icon, labelKey, mobileHide }) => (
                  <div
                    key={labelKey}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/70 border border-gray-100 shadow-sm text-gray-600 text-xs font-medium whitespace-nowrap shrink-0 ${mobileHide ? 'hidden sm:flex' : 'flex'}`}
                  >
                    <Icon className="h-3 w-3 text-amber-500 shrink-0" />
                    {t(labelKey)}
                  </div>
                ))}
              </motion.div>

              <MobileHeroBookGallery />

              {/* CTA */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.66 }}
              >
                <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }} className="sm:inline-block">
                  <Button
                    onClick={goToBooks}
                    size="lg"
                    className="relative h-13 sm:h-14 px-8 sm:px-10 text-sm sm:text-base rounded-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white font-bold shadow-[0_8px_36px_rgba(251,146,60,0.45)] border-0 overflow-hidden group w-full sm:w-auto"
                  >
                    <span className="relative z-10 flex items-center justify-center gap-2.5">
                      {t('hero.cta')}
                      <Sparkles className="h-4 w-4" />
                    </span>
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/25 to-transparent skew-x-12"
                    />
                  </Button>
                </motion.div>
              </motion.div>

              {/* Social proof */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.78 }}
                className="flex items-center gap-3 sm:gap-4 pt-0.5"
              >
                <div className="flex -space-x-2.5 shrink-0">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 border-white bg-gradient-to-br from-amber-200 to-amber-300" />
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 border-white bg-gradient-to-br from-orange-200 to-orange-300" />
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 border-white bg-gradient-to-br from-yellow-200 to-amber-300" />
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 border-white bg-gradient-to-br from-amber-100 to-orange-200" />
                </div>
                <div>
                  <div className="flex items-center gap-0.5">
                    <Star className="h-3 w-3 sm:h-3.5 sm:w-3.5 fill-amber-400 text-amber-400" />
                    <Star className="h-3 w-3 sm:h-3.5 sm:w-3.5 fill-amber-400 text-amber-400" />
                    <Star className="h-3 w-3 sm:h-3.5 sm:w-3.5 fill-amber-400 text-amber-400" />
                    <Star className="h-3 w-3 sm:h-3.5 sm:w-3.5 fill-amber-400 text-amber-400" />
                    <Star className="h-3 w-3 sm:h-3.5 sm:w-3.5 fill-amber-400 text-amber-400" />
                    <span className="ml-1.5 text-xs font-bold text-gray-700">4.9</span>
                  </div>
                  <p className="text-[10px] sm:text-[11px] text-gray-400 mt-0.5 leading-none">
                    {t('hero.socialProof')}
                  </p>
                </div>
              </motion.div>

            </motion.div>

            {/* ── RIGHT — desktop book gallery ───────────────────────────────── */}
            <div className="relative h-[500px] lg:h-[640px] hidden lg:block">

              {/* Glow behind featured */}
              <div
                aria-hidden="true"
                className="absolute pointer-events-none rounded-full bg-amber-300/25 blur-[56px]"
                style={{ left: 60, top: -30, width: 300, height: 300 }}
              />

              {/* Pulsing ring */}
              <motion.div
                className="absolute rounded-xl border-2 border-amber-400/30"
                style={{ left: 116, top: -12, width: 222, height: 296 }}
                animate={{ scale: [1, 1.06, 1], opacity: [0.25, 0.55, 0.25] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              />

              {/* Books */}
              {SHOWCASE.map(({ book, w, left, top, rotate, z, floatAmp, floatDur, floatDelay }, i) => (
                <motion.div
                  key={book.bookID}
                  initial={{ opacity: 0, scale: 0.78, y: 30 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ delay: 0.3 + i * 0.12, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                  style={{ position: 'absolute', left, top, zIndex: z, rotate, width: w }}
                >
                  <motion.div
                    animate={{ y: [0, -floatAmp, 0] }}
                    transition={{ duration: floatDur, repeat: Infinity, ease: 'easeInOut', delay: floatDelay }}
                  >
                    <div
                      className="relative rounded-xl overflow-hidden border-[5px] border-white"
                      style={{
                        boxShadow: i === 1
                          ? '0 32px 80px rgba(0,0,0,0.24), 0 8px 28px rgba(251,146,60,0.22)'
                          : '0 16px 48px rgba(0,0,0,0.14)',
                      }}
                    >
                      <img
                        src={book.coverUrl}
                        alt={book.title}
                        className="w-full h-auto object-cover block"
                        style={{ aspectRatio: '3/4' }}
                        loading="lazy"
                        decoding="async"
                      />
                    </div>
                  </motion.div>
                </motion.div>
              ))}

              {/* Badge — personalisation */}
              <motion.div
                initial={{ opacity: 0, scale: 0.8, x: 10 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                transition={{ delay: 1.2, duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
                style={{ position: 'absolute', right: -14, top: 88, zIndex: 10 }}
              >
                <motion.div
                  animate={{ y: [0, -7, 0] }}
                  transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
                  className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl bg-white/92 backdrop-blur-md border border-white/80 shadow-[0_8px_32px_rgba(0,0,0,0.11)]"
                >
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shrink-0">
                    <Sparkles className="h-3.5 w-3.5 text-white" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-gray-800 leading-none">{t('hero.badgePersonalTitle')}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5 leading-none">{t('hero.badgePersonalSubtitle')}</p>
                  </div>
                </motion.div>
              </motion.div>

              {/* Badge — quality */}
              <motion.div
                initial={{ opacity: 0, scale: 0.8, x: -10 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                transition={{ delay: 1.4, duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
                style={{ position: 'absolute', left: -14, bottom: 80, zIndex: 10 }}
              >
                <motion.div
                  animate={{ y: [0, -9, 0] }}
                  transition={{ duration: 4.1, repeat: Infinity, ease: 'easeInOut', delay: 0.7 }}
                  className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl bg-white/92 backdrop-blur-md border border-white/80 shadow-[0_8px_32px_rgba(0,0,0,0.10)]"
                >
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shrink-0">
                    <Star className="h-3.5 w-3.5 text-white fill-white" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-gray-800 leading-none">{t('hero.badgeQualityTitle')}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5 leading-none">{t('hero.badgeQualitySubtitle')}</p>
                  </div>
                </motion.div>
              </motion.div>

              {/* Sparkles */}
              {SPARKLES.map((s, i) => (
                <motion.div
                  key={i}
                  aria-hidden="true"
                  className="absolute pointer-events-none"
                  style={{ top: s.top, left: s.left, zIndex: 8 }}
                  animate={{ y: [0, -14, 0], opacity: [0.5, 1, 0.5], rotate: [0, 180, 360] }}
                  transition={{ duration: s.dur, repeat: Infinity, ease: 'easeInOut', delay: s.delay }}
                >
                  <Star className={s.cls} />
                </motion.div>
              ))}

            </div>

          </div>
        </div>
      </div>

      {/* ── Marquee strip ──────────────────────────────────────────────────── */}
      <div className="relative z-10 w-full overflow-hidden border-y border-amber-100/60 bg-white/50 backdrop-blur-sm py-2.5 sm:py-3">
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

      {/* ── Bottom fade ──────────────────────────────────────────────────── */}
      <div
        aria-hidden="true"
        className="absolute bottom-0 left-0 right-0 h-28 pointer-events-none z-10"
        style={{ background: 'linear-gradient(to bottom, transparent, rgba(255,251,245,0.85))' }}
      />

      {/* ── Scroll indicator ─────────────────────────────────────────────── */}
      <motion.button
        aria-label={t('hero.scrollToBooks')}
        onClick={goToBooks}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.8 }}
        className="absolute bottom-14 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1 text-gray-400 hover:text-amber-500 transition-colors"
      >
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-60">{t('hero.explore')}</span>
        <motion.div
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 1.9, repeat: Infinity, ease: 'easeInOut' }}
        >
          <ArrowDown className="h-4 w-4" />
        </motion.div>
      </motion.button>

    </div>
  )
}
