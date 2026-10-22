'use client'

import { useEffect, useState } from 'react'
import { PolicyDialog } from './PolicyDialog'
import { fetchPublishedLegalContentSnapshot } from '@/lib/published-legal-content-client'
import type { PublishedLegalContentSnapshot } from '@/lib/published-legal-content-core'
import type { CanonicalLegalDocumentKey } from '@/lib/legal-documents'
import { useI18n } from '@/lib/useI18n'

export default function PublishedPolicyDialog({ documentKey, onClose }: { documentKey: CanonicalLegalDocumentKey; onClose: () => void }) {
  const { t } = useI18n()
  const [content, setContent] = useState<PublishedLegalContentSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    fetchPublishedLegalContentSnapshot(controller.signal).then(snapshot => {
      if (active) setContent(snapshot)
    }).catch(() => {
      if (active && !controller.signal.aborted) setError('Policy content is unavailable')
    })
    return () => { active = false; controller.abort() }
  }, [])
  const document = content?.documents[documentKey]
  return <PolicyDialog title={document?.title ?? t(documentKey === 'privacy' ? 'footer.legalTitlePrivacy' : documentKey === 'terms' ? 'footer.legalTitleTerms' : documentKey === 'shipping' ? 'footer.legalTitleShipping' : 'footer.legalTitleRefund')}
    sections={content?.footerContent[documentKey] ?? []} effectiveDate={document?.effectiveDate}
    isLoading={!content && !error} error={error} t={t} onClose={onClose} />
}
