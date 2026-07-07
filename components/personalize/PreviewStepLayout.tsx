'use client'

import React, { memo, type ReactNode } from 'react'
import { motion } from 'framer-motion'

type PreviewStepLayoutProps = {
  intro: ReactNode
  book: ReactNode
  actions: ReactNode
}

function PreviewStepLayoutComponent({ intro, book, actions }: PreviewStepLayoutProps) {
  return (
    <motion.div
      key="step3"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="mx-auto flex min-h-[600px] max-w-7xl flex-col items-center justify-center py-6 md:py-10"
    >
      {intro}
      {book}
      {actions}
    </motion.div>
  )
}

export const PreviewStepLayout = memo(PreviewStepLayoutComponent)
