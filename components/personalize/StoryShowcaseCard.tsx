'use client'

import { memo, type ReactNode } from 'react'

type StoryShowcaseCardProps = {
  carousel: ReactNode
  storyInfo: ReactNode
}

function StoryShowcaseCardComponent({ carousel, storyInfo }: StoryShowcaseCardProps) {
  return (
    <div className="w-full min-w-0">
      <div className="mb-4 md:mb-5">
        {carousel}
      </div>
      {storyInfo}
    </div>
  )
}

export const StoryShowcaseCard = memo(StoryShowcaseCardComponent)
