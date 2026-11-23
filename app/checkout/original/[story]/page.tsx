import { notFound } from 'next/navigation'
import { loadActiveTemplateDetail } from '@/lib/template-catalog-server'
import { originalBookOffers, originalCheckoutEnabled } from '@/lib/original-book-offers'
import { OriginalFormatSelection } from './OriginalFormatSelection'

export const dynamic = 'force-dynamic'

export default async function OriginalCheckout({ params }: { params: Promise<{ story: string }> }) {
  if (!originalCheckoutEnabled()) notFound()
  const { story } = await params
  const [book, offers] = await Promise.all([loadActiveTemplateDetail(story), originalBookOffers(story)])
  if (!book || !offers.length) notFound()
  return <OriginalFormatSelection key={story} story={story} title={book.title} offers={offers} />
}
