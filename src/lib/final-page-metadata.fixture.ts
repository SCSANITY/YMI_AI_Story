import type { FinalPageMetadata } from './final-page-metadata'

export function createFinalV3Metadata(
  pageIndexForOutputOrder: (outputOrder: number) => number = (outputOrder) => outputOrder
): FinalPageMetadata[] {
  const pages: FinalPageMetadata[] = [
    {
      page_index: pageIndexForOutputOrder(0),
      output_order: 0,
      role: 'final_front_cover',
      spread_index: 0,
      side: null,
      page_number: null,
    },
  ]
  for (let pageNumber = 1; pageNumber <= 30; pageNumber += 1) {
    pages.push({
      page_index: pageIndexForOutputOrder(pageNumber),
      output_order: pageNumber,
      role: 'final_interior',
      spread_index: Math.ceil(pageNumber / 2),
      side: pageNumber % 2 === 1 ? 'left' : 'right',
      page_number: pageNumber,
    })
  }
  return pages
}
