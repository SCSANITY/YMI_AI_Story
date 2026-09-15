'use client'

import { memo, type ReactNode } from 'react'

type CustomizeFormLayoutProps = {
  showcase: ReactNode
  form: ReactNode
}

function CustomizeFormLayoutComponent({ showcase, form }: CustomizeFormLayoutProps) {
  return (
    <div
      className="mx-auto grid w-full min-w-0 max-w-[1420px] animate-in gap-5 fade-in duration-200 lg:grid-cols-12 lg:items-start lg:gap-8"
    >
      <div className="order-1 min-w-0 space-y-4 md:space-y-5 lg:col-span-7">
        {showcase}
      </div>

      <div className="order-2 min-w-0 lg:order-2 lg:col-span-5">
        {form}
      </div>
    </div>
  )
}

export const CustomizeFormLayout = memo(CustomizeFormLayoutComponent)
