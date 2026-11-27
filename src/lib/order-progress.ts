import { isPaidLikeOrderStatus, normalizeOrderStatus } from './order-status'

export type ProgressStage = 'confirmed' | 'preview_ready' | 'pdf_ready' | 'printing' | 'shipped' | 'delivered'

export const progressLabels: Record<ProgressStage, string> = {
  confirmed: 'Order Confirmed',
  preview_ready: 'Preview Ready',
  pdf_ready: 'PDF Ready',
  printing: 'Printing',
  shipped: 'Shipped',
  delivered: 'Delivered',
}

type BookLine = {
  productType: string | null
  packageType: string | null
  published: boolean
  printReleased: boolean
}

export type OrderProgress = {
  stage: ProgressStage
  digitalOnly: boolean
  mixedFormats: boolean
  books: number
  readyPdfs: number
  physicalBooks: number
  releasedForPrint: number
}

// Normal paid orders use the same persisted milestone in every list and detail.
// Older digital purchases incorrectly marked as physical fulfilment need the
// per-book evidence to project a digital stage without rewriting the audit row.
export function digitalOrderStage(status: string | null | undefined, bookProgress: string | null | undefined, allPublished: boolean): 'confirmed' | 'pdf_ready' | null {
  if (!isPaidLikeOrderStatus(status)) return null
  const ready = bookProgress === 'pdf_ready' || (normalizeOrderStatus(status) !== 'paid' && allPublished)
  return ready ? 'pdf_ready' : 'confirmed'
}

/** One input per purchased line. Copies on a line share the same proof. */
export function getOrderProgress(status: string, lines: BookLine[], bookProgress: string | null): OrderProgress | null {
  const stored = normalizeOrderStatus(status)
  if (!isPaidLikeOrderStatus(stored) || !lines.length) return null
  const digitalBooks = lines.filter(line => line.productType === 'ebook' && line.packageType === 'digital').length
  const digitalOnly = digitalBooks === lines.length
  const physical = lines.filter(line => line.productType === 'physical')
  const readyPdfs = lines.filter(line => line.published).length
  const releasedForPrint = physical.filter(line => line.printReleased).length

  let stage: ProgressStage = 'confirmed'
  if (digitalOnly) {
    stage = digitalOrderStage(stored, bookProgress, readyPdfs === lines.length) ?? 'confirmed'
  } else if (stored === 'shipped' || stored === 'delivered') stage = stored
  else if (stored === 'production') stage = 'printing'
  else if (bookProgress === 'pdf_ready' || bookProgress === 'preview_ready') stage = bookProgress

  return { stage, digitalOnly, mixedFormats: digitalBooks > 0 && physical.length > 0, books: lines.length, readyPdfs, physicalBooks: physical.length, releasedForPrint }
}
