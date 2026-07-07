'use client'

import React, { memo, type ReactNode } from 'react'

type StoryShowcaseCardProps = {
  carousel: ReactNode
  storyInfo: ReactNode
}

function StoryShowcaseCardComponent({ carousel, storyInfo }: StoryShowcaseCardProps) {
  return (
    <div className="w-full min-w-0 overflow-hidden rounded-[1.1rem] border border-white/82 bg-white/50 p-3 shadow-[0_16px_30px_-28px_rgba(0,0,0,0.22)] backdrop-blur-md sm:p-3.5 md:p-4">
      <div className="mb-4 md:mb-5">
        {carousel}
      </div>
      {storyInfo}
    </div>
  )
}

export const StoryShowcaseCard = memo(StoryShowcaseCardComponent)
