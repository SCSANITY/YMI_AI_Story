'use client'

import React, { memo, type ReactNode } from 'react'

type CustomizeFormLayoutProps = {
  showcase: ReactNode
  form: ReactNode
}

function CustomizeFormLayoutComponent({ showcase, form }: CustomizeFormLayoutProps) {
  return (
    <div
      className="mx-auto grid w-full min-w-0 max-w-[1320px] animate-in fade-in zoom-in-95 overflow-hidden gap-5 duration-200 lg:grid-cols-12 lg:gap-7"
    >
      <div className="order-1 min-w-0 space-y-4 md:space-y-5 lg:order-1 lg:col-span-6">
        {showcase}
      </div>

      <div className="order-2 min-w-0 lg:order-2 lg:col-span-6">
        {form}
      </div>
    </div>
  )
}

export const CustomizeFormLayout = memo(CustomizeFormLayoutComponent)
