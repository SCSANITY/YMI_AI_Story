'use client'

import React, { memo } from 'react'
import { ShareDialog } from '@/components/ShareDialog'

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
  return (
    <ShareDialog
      open={open && Boolean(shareUrl)}
      onClose={onClose}
      title={labels.title}
      description={labels.description}
      shareUrl={shareUrl || ''}
      shareText={labels.shareText}
      editableShareText
      includeTextInShareUrl
      previewImageUrl={previewImageUrl}
      note={labels.note}
    />
  )
}

export const PreviewShareDialog = memo(PreviewShareDialogComponent)
