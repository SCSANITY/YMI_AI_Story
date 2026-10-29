import type { PurchaseSummary } from '@/lib/purchase-state'

export type MyBookVisibilityRow = {
  is_archived?: boolean | null
}

export function isVisibleMyBookRow(
  row: MyBookVisibilityRow,
  summary: Pick<PurchaseSummary, 'purchaseState'>,
) {
  return summary.purchaseState !== 'unpurchased' || row.is_archived !== true
}
