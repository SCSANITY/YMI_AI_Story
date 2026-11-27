export type BookGiftPrice = { voiceHkd: number; hkdPerUsd: number; singleBook?: boolean }

export function giftUnitPriceUsd(format: string | null | undefined, priceUsd: number, gift: BookGiftPrice) {
  if (format === 'basic') return 0
  if (format === 'supreme') return Math.min(priceUsd, gift.voiceHkd / gift.hkdPerUsd)
  return priceUsd
}

type PricedBook = { id: string; quantity: number; unitPriceUsd: number; bookFormat?: string | null }

export function allocateBookGift(items: PricedBook[], gift: BookGiftPrice) {
  const eligible = items.filter(item => item.bookFormat === 'supreme' || item.bookFormat === 'basic')
  const selected = gift.singleBook ? eligible.sort((a, b) =>
    Number(b.bookFormat === 'supreme') - Number(a.bookFormat === 'supreme') ||
    a.unitPriceUsd - b.unitPriceUsd || a.id.localeCompare(b.id)
  )[0] : undefined
  const charges = new Map<string, number>()
  let savingsUsd = 0
  for (const item of items) {
    const copies = gift.singleBook ? Number(item.id === selected?.id) : item.quantity
    const giftUnit = giftUnitPriceUsd(item.bookFormat, item.unitPriceUsd, gift)
    const saving = copies * (item.unitPriceUsd - giftUnit)
    charges.set(item.id, item.unitPriceUsd * item.quantity - saving)
    savingsUsd += saving
  }
  return { selectedItemId: selected?.id, charges, savingsUsd }
}
