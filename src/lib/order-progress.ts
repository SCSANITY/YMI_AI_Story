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
  books: number
  readyPdfs: number
  physicalBooks: number
  releasedForPrint: number
}

/** One input per purchased line. Copies on a line share the same proof. */
export function getOrderProgress(status: string, lines: BookLine[]): OrderProgress | null {
  const stored = normalizeOrderStatus(status)
  if (!isPaidLikeOrderStatus(stored) || !lines.length) return null
  const digitalOnly = lines.every(line => line.productType === 'ebook' && line.packageType === 'digital')
  const physical = lines.filter(line => line.productType === 'physical')
  const knownFormats = lines.every(line => line.productType === 'physical' ||
    (line.productType === 'ebook' && line.packageType === 'digital'))
  const readyPdfs = lines.filter(line => line.published).length
  const releasedForPrint = physical.filter(line => line.printReleased).length

  let stage: ProgressStage = 'confirmed'
  if (stored === 'shipped' || stored === 'delivered') stage = stored
  else if (stored === 'production') stage = 'printing'
  else if (digitalOnly && readyPdfs === lines.length) stage = 'pdf_ready'
  else if (knownFormats && physical.length > 0 && releasedForPrint === physical.length) stage = 'printing'
  else if (!digitalOnly && readyPdfs > 0) stage = 'preview_ready'

  return { stage, digitalOnly, books: lines.length, readyPdfs, physicalBooks: physical.length, releasedForPrint }
}
