import type { Metadata } from 'next'
import { LegalDocumentPage } from '@/components/legal/LegalDocumentPage'
import { legalDocumentMetadata } from '@/lib/legal-documents'

export const metadata: Metadata = legalDocumentMetadata('terms')

export default function TermsPage() {
  return <LegalDocumentPage documentKey="terms" />
}
