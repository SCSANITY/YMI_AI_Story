import type { Metadata } from 'next'
import {
  getFooterLegalContent,
  type FooterLegalContent,
  type LegalSection,
} from '@/lib/footer-legal-content'
import { publicPageMetadata } from '@/lib/seo'

export type CanonicalLegalDocumentKey = Extract<
  keyof FooterLegalContent,
  'privacy' | 'terms' | 'shipping' | 'refund'
>

export type CanonicalLegalDocument = {
  key: CanonicalLegalDocumentKey
  title: string
  shortTitle: string
  description: string
  path: string
  effectiveDate: string
  version: string
  sections: LegalSection[]
}

type LegalDocumentDefinition = Omit<CanonicalLegalDocument, 'sections'>

const LEGAL_DOCUMENT_DEFINITIONS: Record<CanonicalLegalDocumentKey, LegalDocumentDefinition> = {
  privacy: {
    key: 'privacy',
    title: 'Privacy Policy',
    shortTitle: 'Privacy',
    description:
      'Learn how YMI Story collects, uses, stores, and protects account information, uploaded family media, and generated content.',
    path: '/privacy',
    effectiveDate: 'August 28, 2026',
    version: '2026-08-28-v3',
  },
  terms: {
    key: 'terms',
    title: 'Terms and Conditions',
    shortTitle: 'Terms',
    description:
      'Review the terms that apply when using YMI Story, uploading personalization materials, and placing an order.',
    path: '/terms',
    effectiveDate: 'March 12, 2026',
    version: '2026-03-12',
  },
  shipping: {
    key: 'shipping',
    title: 'Shipping Policy',
    shortTitle: 'Shipping',
    description:
      'Review YMI Story production times, delivery estimates, tracking, customs, and shipping responsibilities.',
    path: '/shipping-policy',
    effectiveDate: 'May 11, 2026',
    version: '2026-05-11',
  },
  refund: {
    key: 'refund',
    title: 'Refund Policy',
    shortTitle: 'Refunds',
    description:
      'Review YMI Story cancellation, replacement, and refund terms for personalized products.',
    path: '/refund-policy',
    effectiveDate: 'May 11, 2026',
    version: '2026-05-11',
  },
}

export const CANONICAL_LEGAL_DOCUMENT_KEYS = [
  'privacy',
  'terms',
  'shipping',
  'refund',
] as const satisfies readonly CanonicalLegalDocumentKey[]

export function getCanonicalLegalDocumentDefinition(
  key: CanonicalLegalDocumentKey,
): LegalDocumentDefinition {
  return LEGAL_DOCUMENT_DEFINITIONS[key]
}

export function getCanonicalLegalDocument(
  key: CanonicalLegalDocumentKey,
): CanonicalLegalDocument {
  const definition = getCanonicalLegalDocumentDefinition(key)
  const content = getFooterLegalContent()

  return {
    ...definition,
    sections: content[key],
  }
}

export function getCanonicalLegalDocuments() {
  return CANONICAL_LEGAL_DOCUMENT_KEYS.map(getCanonicalLegalDocument)
}

export function getCanonicalLegalDocumentEffectiveDateIso(
  document: Pick<CanonicalLegalDocument, 'version'>,
) {
  const effectiveDate = document.version.match(/^\d{4}-\d{2}-\d{2}/)?.[0]
  if (!effectiveDate) throw new Error('Canonical legal version must begin with YYYY-MM-DD')
  return effectiveDate
}

export function legalDocumentMetadata(key: CanonicalLegalDocumentKey): Metadata {
  const document = getCanonicalLegalDocumentDefinition(key)

  return publicPageMetadata({
    title: document.title,
    description: document.description,
    path: document.path,
  })
}
