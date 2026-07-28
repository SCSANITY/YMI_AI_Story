import type { Metadata } from 'next'
import { MetaPixelFrame } from '@/components/tracking/MetaPixelFrame'
import { noIndexMetadata } from '@/lib/seo'

export const metadata: Metadata = noIndexMetadata

export default function MetaTrackingFramePage() {
  return <MetaPixelFrame />
}
