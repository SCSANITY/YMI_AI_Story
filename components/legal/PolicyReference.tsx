'use client'

import dynamic from 'next/dynamic'
import { useState, type ReactNode } from 'react'
import type { CanonicalLegalDocumentKey } from '@/lib/legal-documents'

const PublishedPolicyDialog = dynamic(() => import('./PublishedPolicyDialog'), { ssr: false })

export function PolicyReference({ documentKey = 'privacy', children, className }: { documentKey?: CanonicalLegalDocumentKey; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false)
  return <>
    <button type="button" className={className} aria-haspopup="dialog" aria-expanded={open} onClick={event => {
      event.preventDefault()
      event.stopPropagation()
      event.currentTarget.focus({ preventScroll: true })
      setOpen(true)
    }}>{children}</button>
    {open ? <PublishedPolicyDialog documentKey={documentKey} onClose={() => setOpen(false)} /> : null}
  </>
}
