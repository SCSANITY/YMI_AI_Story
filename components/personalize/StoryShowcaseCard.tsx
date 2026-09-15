'use client'

import { memo, type ReactNode } from 'react'

type StoryShowcaseCardProps = {
  carousel: ReactNode
  storyInfo: ReactNode
}

function StoryShowcaseCardComponent({ carousel, storyInfo }: StoryShowcaseCardProps) {
  return (
    <div className="w-full min-w-0 rounded-[1.5rem] bg-white p-3 shadow-[0_24px_65px_-48px_rgba(69,44,15,0.48)] sm:p-4">
      <div className="mb-4 md:mb-5">
        {carousel}
      </div>
      {storyInfo}
    </div>
  )
}

export const StoryShowcaseCard = memo(StoryShowcaseCardComponent)
