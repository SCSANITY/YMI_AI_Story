'use client'

import React, { memo, type ReactNode } from 'react'
import { motion } from 'framer-motion'

type CustomizeFormLayoutProps = {
  showcase: ReactNode
  form: ReactNode
}

function CustomizeFormLayoutComponent({ showcase, form }: CustomizeFormLayoutProps) {
  return (
    <motion.div
      key="step2"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="mx-auto grid w-full min-w-0 max-w-[1320px] overflow-hidden gap-5 lg:grid-cols-12 lg:gap-7"
    >
      <div className="order-1 min-w-0 space-y-4 md:space-y-5 lg:order-1 lg:col-span-6">
        {showcase}
      </div>

      <div className="order-2 min-w-0 lg:order-2 lg:col-span-6">
        {form}
      </div>
    </motion.div>
  )
}

export const CustomizeFormLayout = memo(CustomizeFormLayoutComponent)
