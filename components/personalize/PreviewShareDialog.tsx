'use client'

import React, { memo } from 'react'
import dynamic from 'next/dynamic'

const ShareDialog = dynamic(() => import('@/components/ShareDialog').then((module) => module.ShareDialog), {
  ssr: false,
  loading: () => null,
})

type PreviewShareDialogProps = {
  open: boolean
  shareUrl: string | null
  previewImageUrl: string | null
  labels: {
    title: string
    description: string
    shareText: string
    note: string
  }
  onClose: () => void
}

function PreviewShareDialogComponent({
  open,
  shareUrl,
  previewImageUrl,
  labels,
  onClose,
}: PreviewShareDialogProps) {
  if (!open || !shareUrl) return null

  return (
    <ShareDialog
      open
      onClose={onClose}
      title={labels.title}
      description={labels.description}
      shareUrl={shareUrl}
      shareText={labels.shareText}
      editableShareText
      includeTextInShareUrl
      previewImageUrl={previewImageUrl}
      note={labels.note}
    />
  )
}

export const PreviewShareDialog = memo(PreviewShareDialogComponent)
