'use client'

import React from 'react'
import { Button } from '@/components/Button'
import { Sparkles, Star } from 'lucide-react'
import { motion } from 'framer-motion'
import { useI18n } from '@/lib/useI18n'

export const Hero: React.FC = () => {
  const { t } = useI18n()

  const scrollToBooks = () => {
    const booksSection = document.getElementById('books')
    if (booksSection) {
      booksSection.scrollIntoView({ behavior: 'smooth' })
    }
  }

  return (
    <div className="relative min-h-[90vh] w-full flex items-center justify-center pt-10 pb-28 overflow-hidden">
      <div className="container mx-auto px-4 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center lg:text-left space-y-8"
          >
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-amber-500">
                {t('hero.badge')}
              </span>
            </motion.div>

            <h1 className="text-[1.8rem] sm:text-4xl md:text-5xl lg:text-6xl font-title text-gray-900 tracking-tight leading-[1.12] md:leading-[1.08]">
              {t('hero.titleLine1')} <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-600 via-orange-500 to-amber-600">
                {t('hero.titleLine2')}
              </span>
            </h1>

            <p className="text-base md:text-lg text-gray-500 leading-[1.8] max-w-lg mx-auto lg:mx-0">
              {t('hero.description')}
              <span className="block mt-2 font-medium text-gray-700 text-sm">{t('hero.note')}</span>
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start pt-4">
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.98 }}>
                <Button
                  onClick={scrollToBooks}
                  size="lg"
                  className="h-14 px-10 text-lg rounded-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-bold shadow-lg shadow-amber-200 border border-white/50 w-full sm:w-auto"
                >
                  {t('hero.cta')}
                </Button>
              </motion.div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.8, rotateY: 30 }}
            animate={{ opacity: 1, scale: 1, rotateY: 0 }}
            transition={{ duration: 1, ease: 'easeOut' }}
            className="relative perspective-1000 hidden lg:block"
          >
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-gradient-to-r from-amber-200/50 to-orange-200/50 rounded-full blur-[80px] animate-pulse-slow"></div>

            <motion.div
              animate={{ y: [0, -20, 0] }}
              transition={{ repeat: Infinity, duration: 6, ease: 'easeInOut' }}
              className="relative z-10 w-full max-w-md mx-auto transform-style-3d rotate-y-[-12deg] rotate-x-[5deg]"
            >
              <div className="relative rounded-[20px] overflow-hidden shadow-[20px_20px_60px_rgba(0,0,0,0.15)] border-[6px] border-white group bg-white">
                <div className="absolute inset-0 bg-gradient-to-tr from-amber-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-20 pointer-events-none"></div>

                <img
                  src="https://images.unsplash.com/photo-1516979187457-637abb4f9353?q=80&w=800&auto=format&fit=crop"
                  alt="Magical Storybook"
                  className="w-full h-auto object-cover transform transition-transform duration-700 group-hover:scale-105"
                />

                <div className="absolute -top-6 -right-6 w-20 h-20 bg-amber-400 rounded-full blur-2xl opacity-40 animate-pulse"></div>
                <div className="absolute top-10 right-10 p-3 bg-white/80 backdrop-blur-md rounded-xl border border-white shadow-lg">
                  <Sparkles className="h-6 w-6 text-amber-500" />
                </div>
              </div>

              <div className="absolute -bottom-10 left-10 right-10 h-4 bg-amber-900/10 blur-xl rounded-full transform scale-x-90"></div>
            </motion.div>

            <motion.div
              animate={{ y: [0, -30, 0], opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 4, repeat: Infinity, delay: 1 }}
              className="absolute top-0 right-10"
            >
              <Star className="h-6 w-6 text-amber-300 fill-amber-300 drop-shadow-md" />
            </motion.div>
            <motion.div
              animate={{ y: [0, 40, 0], opacity: [0.3, 0.8, 0.3] }}
              transition={{ duration: 5, repeat: Infinity, delay: 0.5 }}
              className="absolute bottom-20 left-0"
            >
              <Star className="h-4 w-4 text-orange-300 fill-orange-300 drop-shadow-md" />
            </motion.div>
          </motion.div>
        </div>
      </div>

      <div aria-hidden="true" className="absolute bottom-0 left-0 right-0 h-28 bg-gradient-to-b from-transparent to-[rgba(255,247,235,0.7)] pointer-events-none z-10" />
    </div>
  )
}
