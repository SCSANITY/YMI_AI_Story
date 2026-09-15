'use client'

import { memo, type ReactNode } from 'react'

type CustomizeFormLayoutProps = {
  showcase: ReactNode
  form: ReactNode
}

function CustomizeFormLayoutComponent({ showcase, form }: CustomizeFormLayoutProps) {
  return (
    <div
      className="mx-auto grid w-full min-w-0 max-w-[1280px] animate-in gap-6 fade-in duration-200 lg:grid-cols-[minmax(0,1.12fr)_minmax(380px,0.88fr)] lg:items-start lg:gap-9"
    >
      <div className="order-1 flex min-w-0 flex-col gap-4 md:gap-5">
        {showcase}
      </div>

      <div className="order-2 min-w-0">
        {form}
      </div>
    </div>
  )
}

export const CustomizeFormLayout = memo(CustomizeFormLayoutComponent)
