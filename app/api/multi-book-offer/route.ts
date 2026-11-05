import { noStoreJson } from '@/lib/http-response'
import { getMultiBookOfferRule } from '@/lib/multi-book-offer'

// Public, display-only rule read for the storefront (checkout recalculation and
// any client-side banner needs). The server remains the pricing authority.
// Fail-closed: a rule read error reports disabled rather than blocking checkout.
export async function GET() {
  try {
    const rule = await getMultiBookOfferRule()
    if (!rule || !rule.enabled) return noStoreJson({ enabled: false })
    return noStoreJson({
      enabled: true,
      effectType: rule.effectType,
      value: rule.value,
      minItems: rule.minItems,
    })
  } catch {
    return noStoreJson({ enabled: false })
  }
}
