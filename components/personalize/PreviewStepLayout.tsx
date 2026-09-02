'use client'

import React, { memo, type ReactNode } from 'react'

type PreviewStepLayoutProps = {
  intro: ReactNode
  book: ReactNode
  gallery?: ReactNode
  actions: ReactNode
}

function PreviewStepLayoutComponent({ intro, book, gallery, actions }: PreviewStepLayoutProps) {
  return (
    <div
      className="mx-auto flex min-h-[600px] max-w-7xl animate-in flex-col items-center justify-center fade-in py-6 duration-200 md:py-10"
    >
      {intro}
      {gallery ? (
        <div className="flex w-full flex-col items-center lg:grid lg:grid-cols-[168px_760px] lg:items-start lg:justify-center lg:gap-8">
          <aside className="order-2 w-full min-w-0 lg:order-1">
            {gallery}
          </aside>
          <div className="order-1 min-w-0 lg:order-2">{book}</div>
        </div>
      ) : (
        book
      )}
      {actions}
    </div>
  )
}

export const PreviewStepLayout = memo(PreviewStepLayoutComponent)
