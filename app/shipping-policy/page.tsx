import type { Metadata } from 'next'
import { LegalDocumentPage } from '@/components/legal/LegalDocumentPage'
import { legalDocumentMetadata } from '@/lib/legal-documents'

export const metadata: Metadata = legalDocumentMetadata('shipping')

export default function ShippingPolicyPage() {
  return <LegalDocumentPage documentKey="shipping" />
}
