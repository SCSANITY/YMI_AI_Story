import type { Metadata } from 'next'
import { LegalDocumentPage } from '@/components/legal/LegalDocumentPage'
import { legalDocumentMetadata } from '@/lib/legal-documents'

export const metadata: Metadata = legalDocumentMetadata('privacy')

export default function PrivacyPage() {
  return <LegalDocumentPage documentKey="privacy" />
}
