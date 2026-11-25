export type BookGiftPrice = { voiceHkd: number; hkdPerUsd: number }

export function giftUnitPriceUsd(format: string | null | undefined, priceUsd: number, gift: BookGiftPrice) {
  if (format === 'basic') return 0
  if (format === 'supreme') return Math.min(priceUsd, gift.voiceHkd / gift.hkdPerUsd)
  return priceUsd
}
