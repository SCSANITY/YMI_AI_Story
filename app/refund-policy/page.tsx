import type { Metadata } from 'next'
import { LegalDocumentPage } from '@/components/legal/LegalDocumentPage'
import { legalDocumentMetadata } from '@/lib/legal-documents'

export const metadata: Metadata = legalDocumentMetadata('refund')

export default function RefundPolicyPage() {
  return <LegalDocumentPage documentKey="refund" />
}
