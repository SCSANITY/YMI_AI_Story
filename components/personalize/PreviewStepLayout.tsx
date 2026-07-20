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
      {book}
      {gallery}
      {actions}
    </div>
  )
}

export const PreviewStepLayout = memo(PreviewStepLayoutComponent)
